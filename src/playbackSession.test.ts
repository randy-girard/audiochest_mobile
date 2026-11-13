import { PlaybackController, PlaybackEffect, PlaybackElement, PlaybackUi, dispatchPlayback } from './playbackSession';

type Behavior = 'play' | 'swallow' | 'abort' | 'denied';

function element(): PlaybackElement & {
  calls: number;
  behaviors: Behavior[];
  onPause: (() => void) | null;
} {
  const audio = {
    paused: true,
    seeking: false,
    calls: 0,
    behaviors: [] as Behavior[],
    onPause: null as (() => void) | null,
    play() {
      audio.calls += 1;
      const behavior = audio.behaviors.length ? audio.behaviors.shift() : 'play';
      if (behavior === 'abort' || behavior === 'denied') {
        const error = new Error(behavior);
        error.name = behavior === 'abort' ? 'AbortError' : 'NotAllowedError';
        return Promise.reject(error);
      }
      if (behavior === 'swallow') return Promise.resolve();
      audio.paused = false;
      audio.seeking = false;
      return Promise.resolve();
    },
    pause() {
      audio.paused = true;
      if (audio.onPause) audio.onPause();
    },
  };
  return audio;
}

function harness() {
  const controller = new PlaybackController();
  const audio = element();
  const pending: Array<() => void> = [];
  const ui: PlaybackUi & { playing: boolean } = {
    playing: false,
    showPlaying() { ui.playing = true; },
    showPaused() { ui.playing = false; },
    schedule(generation: number, _delay: number) {
      pending.push(() => {
        dispatchPlayback(controller, controller.onRetry(generation), audio, ui);
      });
    },
  };
  const send = (effects: PlaybackEffect[]) => dispatchPlayback(controller, effects, audio, ui);
  const flush = async () => {
    for (let i = 0; i < 40 && (pending.length || true); i += 1) {
      await Promise.resolve();
      const jobs = pending.splice(0, pending.length);
      if (!jobs.length && i > 0) break;
      jobs.forEach((job) => job());
    }
    await Promise.resolve();
  };
  return { controller, audio, ui, send, flush };
}

describe('pause, seek, then play', () => {
  it('starts on the first try when pause and play have nothing in between', async () => {
    const { controller, audio, ui, send, flush } = harness();
    send(controller.requestPlay(1));
    await flush();
    expect(audio.paused).toBe(false);
    send(controller.requestPause(2));
    expect(audio.paused).toBe(true);
    expect(ui.playing).toBe(false);

    send(controller.requestToggle(3, { paused: true, seeking: false }));
    await flush();
    expect(audio.paused).toBe(false);
    expect(ui.playing).toBe(true);
    expect(audio.calls).toBe(2);
  });

  it('plays again when the seek already finished and the first play() is swallowed', async () => {
    const { controller, audio, ui, send, flush } = harness();
    send(controller.requestPlay(1));
    await flush();
    send(controller.onTransportEvent({ paused: false, seeking: false }).effects);
    send(controller.requestPause(2));
    controller.noteSeek(3);
    audio.behaviors.push('swallow');

    send(controller.requestPlay(4));
    await flush();

    expect(audio.calls).toBe(3);
    expect(audio.paused).toBe(false);
    expect(ui.playing).toBe(true);
    expect(controller.wantPlaying).toBe(true);
  });

  it('plays when a paused seek aborts play() and then finishes', async () => {
    const { controller, audio, ui, send, flush } = harness();
    send(controller.requestPlay(1));
    await flush();
    send(controller.onTransportEvent({ paused: false, seeking: false }).effects);
    send(controller.requestPause(2));
    controller.noteSeek(3);
    audio.seeking = true;
    audio.behaviors.push('abort');

    send(controller.requestPlay(4));
    await Promise.resolve();
    audio.behaviors.push('play');
    audio.seeking = true;
    send(controller.onSeeked({ paused: true, seeking: true }));
    await flush();

    expect(audio.paused).toBe(false);
    expect(ui.playing).toBe(true);
    expect(controller.wantPlaying).toBe(true);
  });

  it('resumes when playback reports pause after play() looked successful', async () => {
    const { controller, audio, ui, send, flush } = harness();
    send(controller.requestPlay(1));
    await flush();
    send(controller.onTransportEvent({ paused: false, seeking: false }).effects);
    send(controller.requestPause(2));
    controller.noteSeek(3);
    send(controller.requestPlay(4));
    await flush();
    expect(audio.paused).toBe(false);

    audio.paused = true;
    const outcome = controller.onTransportEvent({ paused: true, seeking: false });
    expect(outcome.decision).toBe('ignore');
    send(outcome.effects);
    await flush();
    expect(audio.paused).toBe(false);
    expect(ui.playing).toBe(true);
  });

  it('treats play after a seek as play even if the element still looks unpaused', async () => {
    const { controller, audio, send, flush } = harness();
    send(controller.requestPlay(1_000));
    await flush();
    send(controller.requestPause(2_000));
    controller.noteSeek(2_100);
    audio.paused = false;
    audio.onPause = () => {
      const nested = controller.onTransportEvent({ paused: audio.paused, seeking: audio.seeking });
      send(nested.effects);
    };

    send(controller.requestToggle(2_200, { paused: false, seeking: false }));
    await flush();

    expect(controller.wantPlaying).toBe(true);
    expect(audio.paused).toBe(false);
    expect(audio.calls).toBeGreaterThan(0);
    expect(audio.calls).toBeLessThan(5);
  });

  it('does not resume when the user pauses before the retry runs', async () => {
    const { controller, audio, ui, send, flush } = harness();
    send(controller.requestPlay(1));
    await flush();
    send(controller.requestPause(2));
    controller.noteSeek(3);
    audio.behaviors.push('swallow');
    send(controller.requestPlay(4));
    send(controller.requestPause(5));
    await flush();

    expect(controller.wantPlaying).toBe(false);
    expect(audio.paused).toBe(true);
    expect(ui.playing).toBe(false);
    expect(audio.calls).toBe(2);
  });

  it('keeps a fast second tap from undoing pause, and still allows play after the seek', async () => {
    const { controller, audio, send, flush } = harness();
    send(controller.requestPlay(1_000));
    await flush();
    send(controller.requestPause(2_000));
    audio.paused = false;
    const doubleTap = controller.requestToggle(2_100, { paused: false, seeking: false });
    expect(doubleTap.some((effect) => effect.type === 'play')).toBe(false);
    expect(doubleTap.some((effect) => effect.type === 'pause')).toBe(true);

    send(controller.requestPause(3_000));
    controller.noteSeek(3_100);
    audio.paused = false;
    const afterSeek = controller.requestToggle(3_200, { paused: false, seeking: false });
    expect(afterSeek.some((effect) => effect.type === 'play')).toBe(true);
  });

  it('stops a blocked autoplay and retries a denial after the song has already played', async () => {
    const blocked = harness();
    blocked.audio.behaviors.push('denied');
    blocked.send(blocked.controller.requestPlay(1));
    await blocked.flush();
    expect(blocked.controller.wantPlaying).toBe(false);
    expect(blocked.ui.playing).toBe(false);

    const { controller, audio, ui, send, flush } = harness();
    send(controller.requestPlay(1));
    await flush();
    send(controller.onTransportEvent({ paused: false, seeking: false }).effects);
    send(controller.requestPause(2));
    controller.noteSeek(3);
    audio.behaviors.push('denied', 'play');
    send(controller.requestPlay(4));
    await flush();
    expect(controller.wantPlaying).toBe(true);
    expect(audio.paused).toBe(false);
    expect(ui.playing).toBe(true);
  });

  it('does not give up while a seek is still aborting play', async () => {
    const { controller, audio, ui, send, flush } = harness();
    send(controller.requestPlay(1));
    await flush();
    send(controller.onTransportEvent({ paused: false, seeking: false }).effects);
    send(controller.requestPause(2));
    controller.noteSeek(3);
    audio.seeking = true;
    audio.behaviors = Array.from({ length: 8 }, () => 'abort' as Behavior);
    send(controller.requestPlay(4));
    await flush();

    expect(controller.wantPlaying).toBe(true);
    expect(ui.playing).toBe(true);
    expect(audio.calls).toBeGreaterThan(4);

    audio.seeking = false;
    audio.behaviors = ['play'];
    send(controller.onSeeked({ paused: true, seeking: false }));
    await flush();
    expect(audio.paused).toBe(false);
  });
});

describe('android track advance', () => {
  it('advances one song when ended fires again while the next song is loading', () => {
    const controller = new PlaybackController();
    const advances: number[] = [];
    let index = 0;
    const finish = (duration: number, currentTime: number) => {
      if (controller.acceptEnded({ duration, currentTime }) === 'ignore') return;
      controller.noteEnded();
      index += 1;
      advances.push(index);
      controller.armLoad(true);
    };

    controller.armLoad(true);
    controller.onTransportEvent({ paused: false, seeking: false });
    controller.noteSample({ paused: false, currentTime: 4, duration: 180, startAtZero: false });
    finish(180, 180);
    finish(180, 180);
    expect(advances).toEqual([1]);

    controller.onTransportEvent({ paused: false, seeking: false });
    controller.noteSample({ paused: false, currentTime: 0.2, duration: 200, startAtZero: true });
    finish(200, 200);
    expect(advances).toEqual([1, 2]);
  });

  it('does not skip a second song when next loads one and the element emits ended', () => {
    const controller = new PlaybackController();
    controller.armLoad(true);
    controller.onTransportEvent({ paused: false, seeking: false });
    controller.noteSample({ paused: false, currentTime: 25, duration: 180, startAtZero: false });

    controller.armLoad(true);
    controller.noteSample({ paused: false, currentTime: 25, duration: 180, startAtZero: true });
    expect(controller.hasStarted).toBe(false);
    expect(controller.acceptEnded({ duration: 180, currentTime: 180 })).toBe('ignore');
    expect(controller.acceptEnded({ duration: 180, currentTime: 25 })).toBe('ignore');
  });
});
