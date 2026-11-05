const RECENT_LIMIT = 10;

export function rememberTrack(recentIds: number[], id: number): number[] {
  const next = recentIds.filter((item) => item !== id).concat(id);
  return next.slice(-RECENT_LIMIT);
}

export function nextShuffledIndex(length: number, current: number, ids: number[], recentIds: number[]): number {
  if (length <= 1) return 0;

  const avoid = new Set(recentIds.slice(-(length - 1)));
  const candidates: number[] = [];
  for (let i = 0; i < length; i++) {
    if (i === current) continue;
    if (avoid.has(ids[i])) continue;
    candidates.push(i);
  }
  if (!candidates.length) {
    for (let i = 0; i < length; i++) {
      if (i !== current) candidates.push(i);
    }
  }
  if (!candidates.length) return current;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
