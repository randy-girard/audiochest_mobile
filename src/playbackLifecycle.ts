export type PauseDecision = 'playing' | 'ignore' | 'paused' | 'suppress';

export const TRANSPORT_ECHO_MS = 600;
export const INTERRUPT_GRACE_MS = 800;
export const PAUSE_TOGGLE_SETTLE_MS = 400;
export const PLAY_RETRY_LIMIT = 6;
export const SEEK_PLAY_RETRY_LIMIT = 12;

export function decidePauseEvent(input: {
  paused: boolean;
  wantPlaying: boolean;
  loading: boolean;
}): PauseDecision {
  if (!input.paused) {
    if (!input.wantPlaying) return 'suppress';
    return 'playing';
  }
  if (input.loading || input.wantPlaying) return 'ignore';
  return 'paused';
}

export function nextToggleAction(
  wantPlaying: boolean,
  paused: boolean,
  timing?: { now: number; lastPauseAt: number; lastSeekAt?: number; settleMs?: number },
): 'play' | 'pause' {
  if (wantPlaying) return 'pause';
  if (!paused) {
    if (!timing) return 'pause';
    const settle = timing.settleMs == null ? PAUSE_TOGGLE_SETTLE_MS : timing.settleMs;
    const soughtAfterPause = (timing.lastSeekAt || 0) > timing.lastPauseAt;
    if (!soughtAfterPause && timing.lastPauseAt > 0 && timing.now - timing.lastPauseAt < settle) return 'pause';
    return 'play';
  }
  return 'play';
}

export function isDuplicateTransport(input: {
  action: string;
  lastAction: string;
  lastActionAt: number;
  now: number;
  windowMs?: number;
}): boolean {
  if (!input.action || input.action !== input.lastAction) return false;
  const windowMs = input.windowMs == null ? 300 : input.windowMs;
  return input.now - input.lastActionAt < windowMs;
}

export function shouldApplyRemoteTransport(input: {
  action: 'play' | 'pause';
  wantPlaying: boolean;
  lastPlayCommandAt: number;
  lastPauseCommandAt: number;
  now: number;
  echoWindowMs?: number;
}): boolean {
  const windowMs = input.echoWindowMs == null ? TRANSPORT_ECHO_MS : input.echoWindowMs;
  if (input.action === 'play') {
    if (input.wantPlaying) return false;
    if (input.now - input.lastPauseCommandAt < windowMs) return false;
    return true;
  }
  if (!input.wantPlaying) return false;
  if (input.now - input.lastPlayCommandAt < windowMs) return false;
  return true;
}

export function shouldIgnoreInterrupt(input: {
  loading: boolean;
  lastPlayCommandAt: number;
  now: number;
  graceMs?: number;
}): boolean {
  if (input.loading) return true;
  const grace = input.graceMs == null ? INTERRUPT_GRACE_MS : input.graceMs;
  return input.now - input.lastPlayCommandAt < grace;
}

export function classifyPlayFailure(input: {
  generationMatch: boolean;
  wantPlaying: boolean;
  errorName?: string;
}): 'ignore' | 'retry' | 'stop' {
  if (!input.generationMatch || !input.wantPlaying) return 'ignore';
  if (!input.errorName || input.errorName === 'AbortError') return 'retry';
  return 'stop';
}

export function nextPlaybackStep(input: {
  wantPlaying: boolean;
  paused: boolean;
  seeking: boolean;
  allowDuringSeek?: boolean;
}): 'play' | 'wait' | 'idle' {
  if (!input.wantPlaying || !input.paused) return 'idle';
  if (input.seeking && !input.allowDuringSeek) return 'wait';
  return 'play';
}

export function canRetryAbortedPlay(retries: number, limit = 3): boolean {
  return retries < limit;
}

export function decidePlaySettlement(input: {
  generationMatch: boolean;
  wantPlaying: boolean;
  paused: boolean;
  seeking: boolean;
  loading: boolean;
  errorName?: string;
  retries: number;
  unlocked: boolean;
  limit?: number;
  seekingLimit?: number;
}): 'ignore' | 'retry' | 'stop' {
  if (!input.generationMatch || !input.wantPlaying) return 'ignore';
  if (!input.paused) return 'ignore';
  const retryableDenial = input.errorName === 'NotAllowedError' && input.unlocked;
  if (input.errorName && input.errorName !== 'AbortError' && !retryableDenial) return 'stop';
  if (input.loading) return 'ignore';
  const limit = input.seeking
    ? (input.seekingLimit == null ? SEEK_PLAY_RETRY_LIMIT : input.seekingLimit)
    : (input.limit == null ? PLAY_RETRY_LIMIT : input.limit);
  if (input.retries >= limit) return 'ignore';
  return 'retry';
}

export function playRetryDelay(attempt: number, seeking: boolean): number {
  if (attempt <= 1) return 0;
  return seeking ? 200 : 80;
}

export function shouldIssuePlay(input: {
  wantPlaying: boolean;
  paused: boolean;
  seeking: boolean;
  allowDuringSeek: boolean;
  kickIfRunning: boolean;
}): 'play' | 'kick' | 'skip' {
  if (!input.wantPlaying) return 'skip';
  if (!input.paused) return input.kickIfRunning ? 'kick' : 'skip';
  if (input.seeking && !input.allowDuringSeek) return 'skip';
  return 'play';
}

export function shouldResumeAfterIgnoredPause(input: {
  decision: PauseDecision;
  paused: boolean;
  wantPlaying: boolean;
  loading: boolean;
  seeking: boolean;
  retries: number;
  retryLimit?: number;
  seekingRetryLimit?: number;
}): boolean {
  if (input.decision !== 'ignore' || !input.paused || !input.wantPlaying || input.loading) return false;
  const limit = input.seeking
    ? (input.seekingRetryLimit == null ? SEEK_PLAY_RETRY_LIMIT : input.seekingRetryLimit)
    : (input.retryLimit == null ? PLAY_RETRY_LIMIT : input.retryLimit);
  return input.retries < limit;
}

export function decideEndedEvent(input: {
  wantPlaying: boolean;
  duration: number;
}): 'advance' | 'ignore' {
  if (input.wantPlaying && !(input.duration > 0)) return 'ignore';
  return 'advance';
}

export function shouldRestorePlayback(input: {
  sessionKey: string;
  restoredKey: string;
  queueLength: number;
}): boolean {
  if (!input.sessionKey) return false;
  if (input.restoredKey === input.sessionKey) return false;
  if (input.queueLength > 0) return false;
  return true;
}

export function shouldIgnorePlayRejection(currentGen: number, requestGen: number): boolean {
  return currentGen !== requestGen;
}

export function applyPendingSeek(
  currentTime: number,
  pendingSeek: number,
  duration: number,
): { time: number; pending: number } {
  if (!(pendingSeek > 0)) return { time: currentTime, pending: 0 };
  if (!(duration > 0)) return { time: currentTime, pending: pendingSeek };
  return { time: Math.max(0, Math.min(pendingSeek, duration)), pending: 0 };
}
