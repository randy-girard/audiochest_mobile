import {
  applyPendingSeek,
  canRetryAbortedPlay,
  classifyPlayFailure,
  decideEndedEvent,
  decidePlaySettlement,
  nextPlaybackStep,
  decidePauseEvent,
  isDuplicateTransport,
  nextToggleAction,
  playRetryDelay,
  shouldApplyRemoteTransport,
  shouldIgnoreInterrupt,
  shouldIgnorePlayRejection,
  shouldIgnoreRemoteSkip,
  shouldIssuePlay,
  shouldRestorePlayback,
  shouldResumeAfterIgnoredPause,
  shouldRewindStalePosition,
} from './playbackLifecycle';

describe('decidePauseEvent', () => {
  it('keeps playback alive while play() is in flight even if the element emits pause', () => {
    expect(decidePauseEvent({ paused: true, wantPlaying: true, loading: false })).toBe('ignore');
    expect(decidePauseEvent({ paused: true, wantPlaying: true, loading: true })).toBe('ignore');
  });

  it('ignores the pause that fires when a new src is assigned', () => {
    expect(decidePauseEvent({ paused: true, wantPlaying: false, loading: true })).toBe('ignore');
  });

  it('marks the player playing once audio is actually moving', () => {
    expect(decidePauseEvent({ paused: false, wantPlaying: true, loading: true })).toBe('playing');
  });

  it('pauses the element if an in-flight play() wins after the user hit pause', () => {
    expect(decidePauseEvent({ paused: false, wantPlaying: false, loading: false })).toBe('suppress');
  });

  it('only reports paused when nothing is trying to play', () => {
    expect(decidePauseEvent({ paused: true, wantPlaying: false, loading: false })).toBe('paused');
  });
});

describe('nextToggleAction', () => {
  it('pauses when the UI thinks we are playing even if the element is still buffering', () => {
    expect(nextToggleAction(true, true)).toBe('pause');
    expect(nextToggleAction(true, false)).toBe('pause');
  });

  it('plays only when we are actually idle', () => {
    expect(nextToggleAction(false, true)).toBe('play');
  });

  it('pauses if audio is still running after a pause command', () => {
    expect(nextToggleAction(false, false)).toBe('pause');
    expect(nextToggleAction(false, false, { now: 1_200, lastPauseAt: 1_000 })).toBe('pause');
  });

  it('plays after a seek even if the element never reported paused', () => {
    expect(nextToggleAction(false, false, {
      now: 1_200,
      lastPauseAt: 1_000,
      lastSeekAt: 1_100,
    })).toBe('play');
  });

  it('plays once a pause has had time to land and the button shows play', () => {
    expect(nextToggleAction(false, false, { now: 2_000, lastPauseAt: 1_000 })).toBe('play');
  });
});

describe('shouldApplyRemoteTransport', () => {
  const base = {
    lastPlayCommandAt: 0,
    lastPauseCommandAt: 0,
    now: 10_000,
  };

  it('ignores play/pause that just echo the current intended state', () => {
    expect(shouldApplyRemoteTransport({ ...base, action: 'play', wantPlaying: true })).toBe(false);
    expect(shouldApplyRemoteTransport({ ...base, action: 'pause', wantPlaying: false })).toBe(false);
  });

  it('ignores a pause echo that arrives right after we pressed play', () => {
    expect(shouldApplyRemoteTransport({
      ...base,
      action: 'pause',
      wantPlaying: true,
      lastPlayCommandAt: 9_800,
    })).toBe(false);
  });

  it('ignores a play echo that arrives right after we pressed pause', () => {
    expect(shouldApplyRemoteTransport({
      ...base,
      action: 'play',
      wantPlaying: false,
      lastPauseCommandAt: 9_800,
    })).toBe(false);
  });

  it('applies a real remote pause after playback has been running', () => {
    expect(shouldApplyRemoteTransport({
      ...base,
      action: 'pause',
      wantPlaying: true,
      lastPlayCommandAt: 1_000,
    })).toBe(true);
  });
});

describe('isDuplicateTransport', () => {
  it('collapses the same shade button arriving from both the web and native sessions', () => {
    expect(isDuplicateTransport({
      action: 'nexttrack',
      lastAction: 'nexttrack',
      lastActionAt: 9_900,
      now: 10_000,
    })).toBe(true);
  });

  it('still accepts a second skip after the echo window', () => {
    expect(isDuplicateTransport({
      action: 'nexttrack',
      lastAction: 'nexttrack',
      lastActionAt: 9_000,
      now: 10_000,
    })).toBe(false);
  });

  it('does not treat pause as a duplicate of play', () => {
    expect(isDuplicateTransport({
      action: 'pause',
      lastAction: 'play',
      lastActionAt: 9_950,
      now: 10_000,
    })).toBe(false);
  });
});

describe('shouldIgnoreInterrupt', () => {
  it('ignores Bluetooth/audio-focus blips while a track is still starting', () => {
    expect(shouldIgnoreInterrupt({ loading: true, lastPlayCommandAt: 0, now: 50_000 })).toBe(true);
    expect(shouldIgnoreInterrupt({ loading: false, lastPlayCommandAt: 9_500, now: 10_000 })).toBe(true);
  });

  it('keeps a later disconnect as a real interrupt', () => {
    expect(shouldIgnoreInterrupt({ loading: false, lastPlayCommandAt: 1_000, now: 10_000 })).toBe(false);
  });
});

describe('classifyPlayFailure', () => {
  it('retries AbortError so a src change does not stop the new song', () => {
    expect(classifyPlayFailure({
      generationMatch: true,
      wantPlaying: true,
      errorName: 'AbortError',
    })).toBe('retry');
  });

  it('ignores a stale rejection from the previous track', () => {
    expect(classifyPlayFailure({
      generationMatch: false,
      wantPlaying: true,
      errorName: 'AbortError',
    })).toBe('ignore');
  });

  it('stops on a real autoplay rejection', () => {
    expect(classifyPlayFailure({
      generationMatch: true,
      wantPlaying: true,
      errorName: 'NotAllowedError',
    })).toBe('stop');
  });
});

describe('decidePlaySettlement', () => {
  const base = {
    generationMatch: true,
    wantPlaying: true,
    paused: true,
    seeking: false,
    loading: false,
    retries: 0,
    unlocked: true,
  };

  it('retries when the first play resolves but the element stays paused', () => {
    expect(decidePlaySettlement(base)).toBe('retry');
    expect(playRetryDelay(1, false)).toBe(0);
  });

  it('retries an aborted seek without treating a later denial as a user pause', () => {
    expect(decidePlaySettlement({ ...base, seeking: true, errorName: 'AbortError' })).toBe('retry');
    expect(decidePlaySettlement({ ...base, errorName: 'NotAllowedError', unlocked: true })).toBe('retry');
    expect(playRetryDelay(2, true)).toBe(200);
  });

  it('stops when autoplay was never allowed', () => {
    expect(decidePlaySettlement({ ...base, errorName: 'NotAllowedError', unlocked: false })).toBe('stop');
  });

  it('does not retry a play that actually started or one the user cancelled', () => {
    expect(decidePlaySettlement({ ...base, paused: false })).toBe('ignore');
    expect(decidePlaySettlement({ ...base, wantPlaying: false })).toBe('ignore');
    expect(decidePlaySettlement({ ...base, loading: true, errorName: 'AbortError' })).toBe('ignore');
  });

  it('keeps trying through a long seek, then lets a finished seek start the song', () => {
    expect(decidePlaySettlement({ ...base, seeking: true, retries: 11 })).toBe('retry');
    expect(decidePlaySettlement({ ...base, seeking: true, retries: 12 })).toBe('ignore');
    expect(shouldResumeAfterIgnoredPause({
      decision: 'ignore',
      paused: true,
      wantPlaying: true,
      loading: false,
      seeking: false,
      retries: 0,
    })).toBe(true);
    expect(shouldIssuePlay({
      wantPlaying: true,
      paused: true,
      seeking: true,
      allowDuringSeek: true,
      kickIfRunning: false,
    })).toBe('play');
  });
});

describe('nextPlaybackStep', () => {
  it('plays a paused track once the seek has finished', () => {
    expect(nextPlaybackStep({ wantPlaying: true, paused: true, seeking: false })).toBe('play');
    expect(nextPlaybackStep({ wantPlaying: true, paused: true, seeking: true })).toBe('wait');
  });

  it('lets the play button start audio while a paused seek is still settling', () => {
    expect(nextPlaybackStep({
      wantPlaying: true,
      paused: true,
      seeking: true,
      allowDuringSeek: true,
    })).toBe('play');
  });

  it('does not start audio that is already playing or that the user paused', () => {
    expect(nextPlaybackStep({ wantPlaying: true, paused: false, seeking: false })).toBe('idle');
    expect(nextPlaybackStep({ wantPlaying: false, paused: true, seeking: false })).toBe('idle');
  });

  it('retries a seek-aborted play a few times', () => {
    expect(canRetryAbortedPlay(0)).toBe(true);
    expect(canRetryAbortedPlay(2)).toBe(true);
    expect(canRetryAbortedPlay(3)).toBe(false);
  });
});

describe('decideEndedEvent', () => {
  it('does not treat a zero-duration ended event as the song finishing', () => {
    expect(decideEndedEvent({ wantPlaying: true, duration: 0 })).toBe('ignore');
    expect(decideEndedEvent({ wantPlaying: true, duration: Number.NaN })).toBe('ignore');
  });

  it('advances when a real track ends', () => {
    expect(decideEndedEvent({ wantPlaying: false, duration: 240 })).toBe('advance');
    expect(decideEndedEvent({ wantPlaying: true, duration: 240 })).toBe('advance');
  });

  it('does not skip again when Android emits ended while the next song is loading', () => {
    // A finished song advances once. Changing src then fires ended again with the
    // previous duration still attached, and pressing Next does the same. That
    // second event is what lands on the track after the next one, and it keeps
    // firing on every automatic advance until a song is chosen directly.
    expect(decideEndedEvent({
      wantPlaying: true,
      duration: 180,
      currentTime: 180,
      loading: true,
      hasStarted: false,
    })).toBe('ignore');
    expect(decideEndedEvent({
      wantPlaying: true,
      duration: 180,
      currentTime: 20,
      loading: false,
      hasStarted: false,
    })).toBe('ignore');
    expect(decideEndedEvent({
      wantPlaying: true,
      duration: 180,
      currentTime: 12,
      loading: false,
      hasStarted: true,
    })).toBe('ignore');
  });

  it('advances after the song that actually started reaches the end', () => {
    expect(decideEndedEvent({
      wantPlaying: true,
      duration: 180,
      currentTime: 180,
      loading: false,
      hasStarted: true,
    })).toBe('advance');
  });
});

describe('shouldRewindStalePosition', () => {
  it('pulls a new song back to the start when it is still at the previous position', () => {
    expect(shouldRewindStalePosition({ startAtZero: true, hasStarted: false, currentTime: 176 })).toBe(true);
    expect(shouldRewindStalePosition({ startAtZero: true, hasStarted: false, currentTime: 0.2 })).toBe(false);
    expect(shouldRewindStalePosition({ startAtZero: false, hasStarted: false, currentTime: 176 })).toBe(false);
    expect(shouldRewindStalePosition({ startAtZero: true, hasStarted: true, currentTime: 40 })).toBe(false);
  });
});

describe('shouldIgnoreRemoteSkip', () => {
  it('ignores a headset next that echoes a track change the app just made', () => {
    expect(shouldIgnoreRemoteSkip({ lastTrackChangeAt: 5_000, now: 5_400 })).toBe(true);
    expect(shouldIgnoreRemoteSkip({ lastTrackChangeAt: 5_000, now: 6_500 })).toBe(false);
    expect(shouldIgnoreRemoteSkip({ lastTrackChangeAt: 0, now: 6_500 })).toBe(false);
  });
});

describe('shouldRestorePlayback', () => {
  it('does not reload a snapshot over a song that is already queued', () => {
    expect(shouldRestorePlayback({
      sessionKey: 'server|user|token',
      restoredKey: '',
      queueLength: 12,
    })).toBe(false);
  });

  it('does not restore twice for the same session', () => {
    expect(shouldRestorePlayback({
      sessionKey: 'server|user|token',
      restoredKey: 'server|user|token',
      queueLength: 0,
    })).toBe(false);
  });

  it('restores once when the player is empty after sign-in', () => {
    expect(shouldRestorePlayback({
      sessionKey: 'server|user|token',
      restoredKey: '',
      queueLength: 0,
    })).toBe(true);
  });
});

describe('shouldIgnorePlayRejection', () => {
  it('ignores a stale play() abort from the previous track so the new song keeps going', () => {
    expect(shouldIgnorePlayRejection(2, 1)).toBe(true);
    expect(shouldIgnorePlayRejection(2, 2)).toBe(false);
  });
});

describe('applyPendingSeek', () => {
  it('waits until duration is known so resume does not seek then drop the position', () => {
    expect(applyPendingSeek(0, 93, 0)).toEqual({ time: 0, pending: 93 });
    expect(applyPendingSeek(0, 93, 240)).toEqual({ time: 93, pending: 0 });
  });
});
