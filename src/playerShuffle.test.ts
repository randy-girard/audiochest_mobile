import { nextShuffledIndex, rememberTrack } from './playerShuffle';

describe('playerShuffle', () => {
  it('keeps a short recency list', () => {
    const recent = rememberTrack([1, 2, 3], 4);
    expect(recent).toEqual([1, 2, 3, 4]);
    expect(rememberTrack(new Array(12).fill(0).map((_, i) => i + 1), 99).slice(-1)).toEqual([99]);
    expect(rememberTrack(new Array(12).fill(0).map((_, i) => i + 1), 99)).toHaveLength(10);
  });

  it('picks another track and avoids recent ids', () => {
    const ids = [10, 20, 30, 40];
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      seen.add(nextShuffledIndex(4, 0, ids, [10, 20, 30]));
    }
    expect(seen.has(0)).toBe(false);
    expect(Array.from(seen)).toEqual([3]);
  });

  it('falls back to any other track when all are recent', () => {
    const index = nextShuffledIndex(3, 1, [1, 2, 3], [1, 2, 3]);
    expect(index).not.toBe(1);
    expect([0, 2]).toContain(index);
  });
});
