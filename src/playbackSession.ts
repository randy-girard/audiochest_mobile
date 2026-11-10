import {
  decidePauseEvent,
  decidePlaySettlement,
  PauseDecision,
  playRetryDelay,
  shouldIssuePlay,
  shouldResumeAfterIgnoredPause,
  nextToggleAction,
} from './playbackLifecycle';

export interface MediaSnap {
  paused: boolean;
  seeking: boolean;
}

export interface PlaybackElement {
  paused: boolean;
  seeking: boolean;
  play: () => Promise<void> | void;
  pause: () => void;
}

export type PlaybackEffect =
  | { type: 'show-playing' }
  | { type: 'show-paused' }
  | { type: 'pause' }
  | { type: 'play'; generation: number; allowDuringSeek: boolean; kickIfRunning: boolean }
  | { type: 'retry'; generation: number; delay: number };

export interface PlaybackUi {
  showPlaying: () => void;
  showPaused: () => void;
  schedule: (generation: number, delay: number) => void;
}

export class PlaybackController {
  wantPlaying = false;
  generation = 0;
  retries = 0;
  busy = false;
  lastPauseAt = 0;
  lastSeekAt = 0;
  unlocked = false;
  loading = false;
  private token = 0;
  liveToken = 0;

  requestPlay(_now: number): PlaybackEffect[] {
    this.wantPlaying = true;
    this.generation += 1;
    this.retries = 0;
    this.busy = false;
    return [
      { type: 'show-playing' },
      { type: 'play', generation: this.generation, allowDuringSeek: true, kickIfRunning: true },
    ];
  }

  requestPause(now: number): PlaybackEffect[] {
    this.wantPlaying = false;
    this.loading = false;
    this.generation += 1;
    this.retries = 0;
    this.busy = false;
    this.lastPauseAt = now;
    return [{ type: 'show-paused' }, { type: 'pause' }];
  }

  requestToggle(now: number, media: MediaSnap): PlaybackEffect[] {
    const action = nextToggleAction(this.wantPlaying, media.paused, {
      now,
      lastPauseAt: this.lastPauseAt,
      lastSeekAt: this.lastSeekAt,
    });
    return action === 'pause' ? this.requestPause(now) : this.requestPlay(now);
  }

  armLoad(autoplay: boolean): PlaybackEffect[] {
    this.generation += 1;
    this.retries = 0;
    this.busy = false;
    this.wantPlaying = autoplay;
    if (!autoplay) {
      this.loading = false;
      return [{ type: 'show-paused' }];
    }
    this.loading = true;
    return [
      { type: 'show-playing' },
      { type: 'play', generation: this.generation, allowDuringSeek: true, kickIfRunning: true },
    ];
  }

  noteSeek(now: number): void {
    this.lastSeekAt = now;
    this.retries = 0;
  }

  noteEnded(): void {
    this.wantPlaying = false;
    this.loading = false;
    this.generation += 1;
    this.retries = 0;
  }

  acceptPlay(effect: Extract<PlaybackEffect, { type: 'play' }>, media: MediaSnap): 'play' | 'kick' | null {
    if (effect.generation !== this.generation || !this.wantPlaying || this.busy) return null;
    const step = shouldIssuePlay({
      wantPlaying: this.wantPlaying,
      paused: media.paused,
      seeking: media.seeking,
      allowDuringSeek: effect.allowDuringSeek,
      kickIfRunning: effect.kickIfRunning,
    });
    if (step === 'skip') return null;
    this.busy = true;
    this.token += 1;
    this.liveToken = this.token;
    return step;
  }

  settle(input: {
    token: number;
    generation: number;
    paused: boolean;
    seeking: boolean;
    errorName?: string;
  }): PlaybackEffect[] {
    if (input.generation !== this.generation || input.token !== this.liveToken) return [];
    if (!input.paused) {
      this.retries = 0;
      this.unlocked = true;
      return [];
    }
    const decision = decidePlaySettlement({
      generationMatch: true,
      wantPlaying: this.wantPlaying,
      paused: input.paused,
      seeking: input.seeking,
      loading: this.loading,
      errorName: input.errorName,
      retries: this.retries,
      unlocked: this.unlocked,
    });
    if (decision === 'stop') {
      this.wantPlaying = false;
      this.loading = false;
      this.generation += 1;
      this.retries = 0;
      return [{ type: 'show-paused' }, { type: 'pause' }];
    }
    if (decision !== 'retry') return [];
    this.retries += 1;
    return [{
      type: 'retry',
      generation: this.generation,
      delay: playRetryDelay(this.retries, input.seeking),
    }];
  }

  onRetry(generation: number): PlaybackEffect[] {
    if (generation !== this.generation || !this.wantPlaying) return [];
    return [{ type: 'play', generation: this.generation, allowDuringSeek: true, kickIfRunning: false }];
  }

  onSeeked(media: MediaSnap): PlaybackEffect[] {
    this.retries = 0;
    if (!this.wantPlaying || this.busy) return [];
    if (!media.paused && !media.seeking) return [];
    return [{ type: 'play', generation: this.generation, allowDuringSeek: true, kickIfRunning: false }];
  }

  onCanPlay(media: MediaSnap): PlaybackEffect[] {
    if (!this.wantPlaying) {
      this.loading = false;
      return [];
    }
    if (this.busy || !media.paused) return [];
    return [{ type: 'play', generation: this.generation, allowDuringSeek: true, kickIfRunning: false }];
  }

  onTransportEvent(media: MediaSnap): { decision: PauseDecision; effects: PlaybackEffect[] } {
    const decision = decidePauseEvent({
      paused: media.paused,
      wantPlaying: this.wantPlaying,
      loading: this.loading,
    });
    if (decision === 'playing') {
      this.loading = false;
      this.unlocked = true;
      this.retries = 0;
      return { decision, effects: [{ type: 'show-playing' }] };
    }
    if (decision === 'suppress' || decision === 'paused' || this.busy) {
      if (decision === 'paused') return { decision, effects: [{ type: 'show-paused' }] };
      return { decision, effects: [] };
    }
    if (shouldResumeAfterIgnoredPause({
      decision,
      paused: media.paused,
      wantPlaying: this.wantPlaying,
      loading: this.loading,
      seeking: media.seeking,
      retries: this.retries,
    })) {
      return {
        decision,
        effects: [{ type: 'play', generation: this.generation, allowDuringSeek: true, kickIfRunning: false }],
      };
    }
    return { decision, effects: [] };
  }
}

function failureName(error: unknown): string | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' && name ? name : undefined;
}

export function dispatchPlayback(
  controller: PlaybackController,
  effects: PlaybackEffect[],
  audio: PlaybackElement | null,
  ui: PlaybackUi,
): void {
  effects.forEach((effect) => {
    if (effect.type === 'show-playing') {
      ui.showPlaying();
      return;
    }
    if (effect.type === 'show-paused') {
      ui.showPaused();
      return;
    }
    if (effect.type === 'pause') {
      if (audio) audio.pause();
      return;
    }
    if (effect.type === 'retry') {
      ui.schedule(effect.generation, effect.delay);
      return;
    }
    if (!audio) return;
    const step = controller.acceptPlay(effect, { paused: audio.paused, seeking: Boolean(audio.seeking) });
    if (!step) return;
    const token = controller.liveToken;
    const generation = effect.generation;
    const finish = (error?: unknown) => {
      dispatchPlayback(controller, controller.settle({
        token,
        generation,
        paused: audio.paused,
        seeking: Boolean(audio.seeking),
        errorName: failureName(error),
      }), audio, ui);
    };
    let result: Promise<void> | void;
    let thrown: unknown;
    try {
      if (step === 'kick') audio.pause();
      result = audio.play();
    } catch (error) {
      thrown = error;
    } finally {
      if (controller.liveToken === token) controller.busy = false;
    }
    if (thrown) {
      finish(thrown);
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then(() => finish(), (error) => finish(error));
      return;
    }
    finish(audio.paused ? { name: 'AbortError' } : undefined);
  });
}
