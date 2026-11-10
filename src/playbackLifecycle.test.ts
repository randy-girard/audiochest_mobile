import {
  applyPendingSeek,
  classifyPlayFailure,
  decideEndedEvent,
  decidePauseEvent,
  isDuplicateTransport,
  nextToggleAction,
  shouldApplyRemoteTransport,
  shouldIgnoreInterrupt,
  shouldIgnorePlayRejection,
  shouldRestorePlayback,
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

describe('decideEndedEvent', () => {
  it('does not treat a zero-duration ended event as the song finishing', () => {
    expect(decideEndedEvent({ wantPlaying: true, duration: 0 })).toBe('ignore');
    expect(decideEndedEvent({ wantPlaying: true, duration: Number.NaN })).toBe('ignore');
  });

  it('advances when a real track ends', () => {
    expect(decideEndedEvent({ wantPlaying: false, duration: 240 })).toBe('advance');
    expect(decideEndedEvent({ wantPlaying: true, duration: 240 })).toBe('advance');
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
