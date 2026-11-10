import { PREVIOUS_RESTART_SECONDS, previousFromHistory, pushPlayHistory } from './playerHistory';

describe('pushPlayHistory', () => {
  it('records the track we left so Previous can walk back through shuffled plays', () => {
    expect(pushPlayHistory([], 0)).toEqual([0]);
    expect(pushPlayHistory([0], 4)).toEqual([0, 4]);
    expect(pushPlayHistory([0, 4], 4)).toEqual([0, 4]);
  });
});

describe('previousFromHistory', () => {
  it(`restarts the current song after ${PREVIOUS_RESTART_SECONDS} seconds`, () => {
    expect(previousFromHistory({
      currentTime: 3.1,
      currentIndex: 5,
      history: [1, 4],
      length: 10,
    })).toEqual({ restart: true, index: 5, history: [1, 4] });
  });

  it('does not reshuffle: Previous returns the track we actually came from', () => {
    expect(previousFromHistory({
      currentTime: 1.2,
      currentIndex: 7,
      history: [0, 3, 1],
      length: 10,
    })).toEqual({ restart: false, index: 1, history: [0, 3] });

    expect(previousFromHistory({
      currentTime: 0,
      currentIndex: 1,
      history: [0, 3],
      length: 10,
    })).toEqual({ restart: false, index: 3, history: [0] });
  });

  it('falls back to the previous queue item when history is empty', () => {
    expect(previousFromHistory({
      currentTime: 0.4,
      currentIndex: 0,
      history: [],
      length: 5,
    })).toEqual({ restart: false, index: 4, history: [] });
  });
});
