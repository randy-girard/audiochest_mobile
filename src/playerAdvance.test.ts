import { cycleRepeatMode, nextIndexOnEnd, sameTrackQueue } from './playerAdvance';
import { Track } from './types';

function track(id: number): Track {
  return { id, title: `Track ${id}` };
}

describe('playerAdvance', () => {
  it('cycles repeat off → all → one → off', () => {
    expect(cycleRepeatMode('off')).toBe('all');
    expect(cycleRepeatMode('all')).toBe('one');
    expect(cycleRepeatMode('one')).toBe('off');
  });

  it('compares queues by track id order', () => {
    expect(sameTrackQueue([track(1), track(2)], [track(1), track(2)])).toBe(true);
    expect(sameTrackQueue([track(1), track(2)], [track(2), track(1)])).toBe(false);
    expect(sameTrackQueue([track(1)], [track(1), track(2)])).toBe(false);
  });

  it('repeats the current song when mode is one', () => {
    expect(nextIndexOnEnd({
      length: 4, current: 2, ids: [1, 2, 3, 4], playedIds: [3], shuffle: false, repeat: 'one',
    })).toBe(2);
  });

  it('stops at the end of a sequential queue unless repeating all', () => {
    expect(nextIndexOnEnd({
      length: 3, current: 2, ids: [1, 2, 3], playedIds: [1, 2, 3], shuffle: false, repeat: 'off',
    })).toBeNull();
    expect(nextIndexOnEnd({
      length: 3, current: 2, ids: [1, 2, 3], playedIds: [1, 2, 3], shuffle: false, repeat: 'all',
    })).toBe(0);
    expect(nextIndexOnEnd({
      length: 3, current: 0, ids: [1, 2, 3], playedIds: [1], shuffle: false, repeat: 'off',
    })).toBe(1);
  });

  it('shuffles through unplayed tracks then stops unless repeating all', () => {
    const remaining = nextIndexOnEnd({
      length: 3, current: 0, ids: [10, 20, 30], playedIds: [10], shuffle: true, repeat: 'off',
    });
    expect([1, 2]).toContain(remaining);

    expect(nextIndexOnEnd({
      length: 3, current: 1, ids: [10, 20, 30], playedIds: [10, 20, 30], shuffle: true, repeat: 'off',
    })).toBeNull();

    const wrapped = nextIndexOnEnd({
      length: 3, current: 1, ids: [10, 20, 30], playedIds: [10, 20, 30], shuffle: true, repeat: 'all',
    });
    expect([0, 2]).toContain(wrapped);
  });
});
