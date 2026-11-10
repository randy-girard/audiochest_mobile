import {
  PLAYBACK_SNAPSHOT_KEY,
  clearPlaybackSnapshot,
  readPlaybackSnapshot,
  resumePosition,
  shouldAutoplaySnapshot,
  snapshotFromPlayer,
  writePlaybackSnapshot,
  PlaybackSnapshot,
} from './playbackResume';
import { Track } from './types';

function track(id: number): Track {
  return { id, title: `Song ${id}` };
}

function memory(): { store: Record<string, string>; getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void } {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
}

function snapshot(overrides: Partial<PlaybackSnapshot> = {}): PlaybackSnapshot {
  return {
    sessionKey: 'https://chest|user@x|token',
    queue: [track(1), track(2)],
    index: 1,
    position: 93.4,
    duration: 240,
    wasPlaying: true,
    interrupted: true,
    history: [0, 2],
    updatedAt: 1_000,
    ...overrides,
  };
}

describe('playback resume snapshot', () => {
  it('round-trips the queue, track, and position for the current session', () => {
    const storage = memory();
    const saved = snapshot();
    writePlaybackSnapshot(storage, saved);
    expect(readPlaybackSnapshot(storage, saved.sessionKey, saved.updatedAt + 1000)).toEqual(saved);
  });

  it('ignores another account or an empty queue', () => {
    const storage = memory();
    writePlaybackSnapshot(storage, snapshot());
    expect(readPlaybackSnapshot(storage, 'other', 1_000)).toBeNull();
    writePlaybackSnapshot(storage, snapshot({ queue: [], index: 0 }));
    expect(snapshotFromPlayer({
      sessionKey: 's',
      queue: [],
      index: 0,
      position: 1,
      duration: 2,
      wasPlaying: true,
      interrupted: false,
      history: [],
      updatedAt: 1,
    })).toBeNull();
  });

  it('clears the snapshot when playback is stopped', () => {
    const storage = memory();
    writePlaybackSnapshot(storage, snapshot());
    clearPlaybackSnapshot(storage);
    expect(storage.store[PLAYBACK_SNAPSHOT_KEY]).toBeUndefined();
  });

  it('restarts near the end so a finished song does not immediately skip', () => {
    expect(resumePosition(snapshot({ position: 239.6, duration: 240 }))).toBe(0);
    expect(resumePosition(snapshot({ position: 93.4, duration: 240 }))).toBe(93.4);
  });

  it('only autoplays when the car or another remote actually requested play', () => {
    const saved = snapshot({ interrupted: true, wasPlaying: true });
    expect(shouldAutoplaySnapshot(saved, 'play')).toBe(true);
    expect(shouldAutoplaySnapshot(saved, undefined)).toBe(false);
    expect(shouldAutoplaySnapshot(saved, 'pause')).toBe(false);
  });
});
