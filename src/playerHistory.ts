export const PREVIOUS_RESTART_SECONDS = 3;
export const HISTORY_LIMIT = 100;

export function pushPlayHistory(history: number[], fromIndex: number, limit = HISTORY_LIMIT): number[] {
  if (!Number.isInteger(fromIndex) || fromIndex < 0) return history;
  if (history.length && history[history.length - 1] === fromIndex) return history;
  return history.concat(fromIndex).slice(-limit);
}

export function previousFromHistory(input: {
  currentTime: number;
  currentIndex: number;
  history: number[];
  length: number;
  restartAfterSeconds?: number;
}): { restart: boolean; index: number; history: number[] } {
  const restartAfter = input.restartAfterSeconds == null ? PREVIOUS_RESTART_SECONDS : input.restartAfterSeconds;
  if (input.currentTime > restartAfter) {
    return { restart: true, index: input.currentIndex, history: input.history };
  }

  let history = input.history;
  while (history.length) {
    const index = history[history.length - 1];
    history = history.slice(0, -1);
    if (Number.isInteger(index) && index >= 0 && index < input.length && index !== input.currentIndex) {
      return { restart: false, index, history };
    }
  }

  if (input.length <= 0) {
    return { restart: false, index: Math.max(0, input.currentIndex), history: [] };
  }
  const index = (input.currentIndex - 1 + input.length) % input.length;
  return { restart: false, index, history: [] };
}
