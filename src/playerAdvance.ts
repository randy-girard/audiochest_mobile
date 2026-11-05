import { nextShuffledIndex } from './playerShuffle';
import { Track } from './types';

export type RepeatMode = 'off' | 'all' | 'one';

export function cycleRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === 'off') return 'all';
  if (mode === 'all') return 'one';
  return 'off';
}

export function sameTrackQueue(left: Track[], right: Track[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((track, index) => track.id === right[index].id);
}

export function nextIndexOnEnd(options: {
  length: number;
  current: number;
  ids: number[];
  playedIds: number[];
  shuffle: boolean;
  repeat: RepeatMode;
}): number | null {
  const { length, current, ids, playedIds, shuffle, repeat } = options;
  if (length <= 0) return null;
  if (repeat === 'one') return current;
  if (!shuffle) {
    const next = current + 1;
    if (next < length) return next;
    return repeat === 'all' ? 0 : null;
  }

  const played = new Set(playedIds);
  const remaining: number[] = [];
  for (let i = 0; i < length; i++) {
    if (i === current) continue;
    if (!played.has(ids[i])) remaining.push(i);
  }
  if (remaining.length) {
    return remaining[Math.floor(Math.random() * remaining.length)];
  }
  if (repeat !== 'all') return null;
  return nextShuffledIndex(length, current, ids, []);
}
