import { Track } from './types';

export const PLAYBACK_SNAPSHOT_KEY = 'audiochest.playback';
export const PLAYBACK_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PlaybackSnapshot {
  sessionKey: string;
  queue: Track[];
  index: number;
  position: number;
  duration: number;
  wasPlaying: boolean;
  interrupted: boolean;
  updatedAt: number;
}

export function writePlaybackSnapshot(storage: StorageLike, snapshot: PlaybackSnapshot): void {
  try {
    storage.setItem(PLAYBACK_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (error) {
    // Ignore quota / private-mode failures; in-memory playback still works.
  }
}

export function clearPlaybackSnapshot(storage: StorageLike): void {
  try {
    storage.removeItem(PLAYBACK_SNAPSHOT_KEY);
  } catch (error) {
    // Ignore storage errors.
  }
}

export function readPlaybackSnapshot(
  storage: StorageLike,
  sessionKey: string,
  now = Date.now(),
): PlaybackSnapshot | null {
  if (!sessionKey) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(PLAYBACK_SNAPSHOT_KEY);
  } catch (error) {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<PlaybackSnapshot>;
    if (!data || data.sessionKey !== sessionKey) return null;
    if (!Array.isArray(data.queue) || !data.queue.length) return null;
    const index = typeof data.index === 'number' ? data.index : -1;
    if (index < 0 || index >= data.queue.length) return null;
    if (typeof data.updatedAt !== 'number' || now - data.updatedAt > PLAYBACK_SNAPSHOT_MAX_AGE_MS) return null;
    return {
      sessionKey,
      queue: data.queue,
      index,
      position: typeof data.position === 'number' && Number.isFinite(data.position) ? data.position : 0,
      duration: typeof data.duration === 'number' && Number.isFinite(data.duration) ? data.duration : 0,
      wasPlaying: !!data.wasPlaying,
      interrupted: !!data.interrupted,
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    return null;
  }
}

export function resumePosition(snapshot: PlaybackSnapshot): number {
  const position = Number.isFinite(snapshot.position) ? Math.max(0, snapshot.position) : 0;
  const duration = Number.isFinite(snapshot.duration) ? snapshot.duration : 0;
  if (duration > 0 && position >= Math.max(0, duration - 1)) return 0;
  return duration > 0 ? Math.min(position, duration) : position;
}

export function shouldAutoplaySnapshot(snapshot: PlaybackSnapshot, mediaAction?: string | null): boolean {
  if (mediaAction === 'play') return true;
  return false;
}

export function snapshotFromPlayer(input: {
  sessionKey: string;
  queue: Track[];
  index: number;
  position: number;
  duration: number;
  wasPlaying: boolean;
  interrupted: boolean;
  updatedAt: number;
}): PlaybackSnapshot | null {
  if (!input.sessionKey || !input.queue.length) return null;
  if (input.index < 0 || input.index >= input.queue.length) return null;
  return {
    sessionKey: input.sessionKey,
    queue: input.queue,
    index: input.index,
    position: Number.isFinite(input.position) ? Math.max(0, input.position) : 0,
    duration: Number.isFinite(input.duration) ? Math.max(0, input.duration) : 0,
    wasPlaying: input.wasPlaying,
    interrupted: input.interrupted,
    updatedAt: input.updatedAt,
  };
}
