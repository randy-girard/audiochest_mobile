import { Plugins } from '@capacitor/core';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  applyWebMediaSession,
  bindWebMediaSession,
  getMediaSession,
  isNativeAndroid,
  listenNativeNowPlaying,
  nowPlayingInfo,
  NowPlayingAction,
  NowPlayingHandlers,
  pullPendingNowPlaying,
  reportedPlaying,
  updateNativeNowPlaying,
} from './nowPlaying';
import { RepeatMode, cycleRepeatMode, nextIndexOnEnd, sameTrackQueue } from './playerAdvance';
import {
  applyPendingSeek as resolvePendingSeek,
  decideEndedEvent,
  isDuplicateTransport,
  shouldApplyRemoteTransport,
  shouldIgnoreInterrupt,
  shouldRestorePlayback,
} from './playbackLifecycle';
import { dispatchPlayback, PlaybackController, PlaybackEffect } from './playbackSession';
import { previousFromHistory, pushPlayHistory } from './playerHistory';
import { nextShuffledIndex, rememberTrack } from './playerShuffle';
import {
  clearPlaybackSnapshot,
  readPlaybackSnapshot,
  resumePosition,
  snapshotFromPlayer,
  writePlaybackSnapshot,
} from './playbackResume';
import { Track } from './types';
import { displayTitle } from './utils';

const SHUFFLE_KEY = 'audiochest.shuffle';
const REPEAT_KEY = 'audiochest.repeat';

function readShuffle(): boolean {
  try {
    const raw = window.localStorage.getItem(SHUFFLE_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch (error) {
    // Ignore storage errors and default to shuffle on, like the web player.
  }
  return true;
}

function readRepeat(): RepeatMode {
  try {
    const raw = window.localStorage.getItem(REPEAT_KEY);
    if (raw === 'off' || raw === 'all' || raw === 'one') return raw;
  } catch (error) {
    // Ignore storage errors and default to cycling the current queue.
  }
  return 'all';
}

function persist(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // Ignore storage errors; the setting still works for this session.
  }
}

interface PlayerContextValue {
  queue: Track[];
  index: number;
  playing: boolean;
  current?: Track;
  title: string;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  playTracks: (tracks: Track[], startIndex?: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export const PlayerProvider: React.FC = ({ children }) => {
  const { client, session } = useAuth();
  const sessionKey = session ? `${session.server}|${session.email}|${session.token}` : '';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(readShuffle);
  const [repeat, setRepeat] = useState<RepeatMode>(readRepeat);
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(0);
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeat);
  const recentRef = useRef<number[]>([]);
  const playedRef = useRef<Set<number>>(new Set());
  const historyRef = useRef<number[]>([]);
  const loadRef = useRef<(tracks: Track[], start: number, autoplay: boolean, position?: number) => void>(() => undefined);
  const handlersRef = useRef<NowPlayingHandlers>({
    play: () => undefined,
    pause: () => undefined,
    interrupt: () => undefined,
    next: () => undefined,
    previous: () => undefined,
    seek: () => undefined,
    seekBy: () => undefined,
    stop: () => undefined,
  });
  const lastNativeAt = useRef(0);
  const lastNativeSig = useRef('');
  const sessionRef = useRef(new PlaybackController());
  const dispatchRef = useRef<(effects: PlaybackEffect[]) => void>(() => undefined);
  const syncNowPlayingRef = useRef<(force?: boolean) => void>(() => undefined);
  const persistSnapshotRef = useRef<(force?: boolean) => void>(() => undefined);
  const sessionKeyRef = useRef(sessionKey);
  const clientRef = useRef(client);
  const pendingSeekRef = useRef(0);
  const interruptedRef = useRef(false);
  const lastPersistAt = useRef(0);
  const pendingPlayRef = useRef(false);
  const pendingRemoteRef = useRef<NowPlayingAction | null>(null);
  const restoredKeyRef = useRef('');
  const playRetryTimer = useRef(0);
  const lastPlayCommandAt = useRef(0);
  const lastPauseCommandAt = useRef(0);

  useEffect(() => {
    sessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  const persistSnapshot = useCallback((force = false) => {
    const key = sessionKeyRef.current;
    if (!key) return;
    const now = Date.now();
    if (!force && now - lastPersistAt.current < 1500) return;
    const items = queueRef.current;
    const audio = audioRef.current;
    const snapshot = snapshotFromPlayer({
      sessionKey: key,
      queue: items,
      index: indexRef.current,
      position: audio ? audio.currentTime || 0 : 0,
      duration: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
      wasPlaying: sessionRef.current.wantPlaying || interruptedRef.current,
      interrupted: interruptedRef.current,
      history: historyRef.current,
      updatedAt: now,
    });
    if (!snapshot) return;
    lastPersistAt.current = now;
    writePlaybackSnapshot(window.localStorage, snapshot);
  }, []);

  persistSnapshotRef.current = persistSnapshot;

  const syncTimes = useCallback((audio: HTMLAudioElement) => {
    const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    setCurrentTime(audio.currentTime || 0);
    setDuration(nextDuration);
  }, []);

  const applyPendingSeek = useCallback((audio: HTMLAudioElement) => {
    const seekTo = pendingSeekRef.current;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const resolved = resolvePendingSeek(audio.currentTime || 0, seekTo, duration);
    pendingSeekRef.current = resolved.pending;
    if (!(seekTo > 0) || resolved.pending > 0) return;
    if (Math.abs((audio.currentTime || 0) - resolved.time) > 0.25) {
      audio.currentTime = resolved.time;
    }
    setCurrentTime(audio.currentTime || 0);
  }, []);

  const clearPlayRetry = useCallback(() => {
    if (!playRetryTimer.current) return;
    window.clearTimeout(playRetryTimer.current);
    playRetryTimer.current = 0;
  }, []);

  dispatchRef.current = (effects) => {
    dispatchPlayback(sessionRef.current, effects, audioRef.current, {
      showPlaying: () => setPlaying(true),
      showPaused: () => setPlaying(false),
      schedule: (generation, delay) => {
        clearPlayRetry();
        const run = () => {
          playRetryTimer.current = 0;
          dispatchRef.current(sessionRef.current.onRetry(generation));
        };
        if (delay <= 0) {
          queueMicrotask(run);
          return;
        }
        playRetryTimer.current = window.setTimeout(run, delay);
      },
    });
  };

  const load = useCallback((tracks: Track[], start: number, autoplay: boolean, position = 0) => {
    const api = clientRef.current;
    if (!api) return;
    const playable = tracks.filter((track) => track.id);
    if (!playable.length || start < 0 || start >= playable.length) return;
    const track = playable[start];
    const audio = audioRef.current;
    if (!audio) return;
    interruptedRef.current = false;
    pendingSeekRef.current = position > 0 ? position : 0;
    if (autoplay) lastPlayCommandAt.current = Date.now();
    const effects = sessionRef.current.armLoad(autoplay);
    audio.src = api.audioSrc(track);
    audio.setAttribute('title', displayTitle(track));
    setQueue(playable);
    setIndex(start);
    setCurrentTime(position > 0 ? position : 0);
    setDuration(0);
    queueRef.current = playable;
    indexRef.current = start;
    recentRef.current = rememberTrack(recentRef.current, track.id);
    playedRef.current.add(track.id);
    dispatchRef.current(effects);
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, []);

  loadRef.current = load;

  const replayCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    interruptedRef.current = false;
    lastPlayCommandAt.current = Date.now();
    dispatchRef.current(sessionRef.current.requestPlay(Date.now()));
  }, []);

  const playNextFrom = useCallback((fromIndex: number, fromEnded = false) => {
    const items = queueRef.current.filter((track) => track.id);
    if (!items.length) return;
    if (fromEnded && repeatRef.current === 'one') {
      replayCurrent();
      return;
    }
    if (fromEnded && shuffleRef.current && repeatRef.current === 'all') {
      const hasUnplayed = items.some((track, i) => i !== fromIndex && !playedRef.current.has(track.id));
      if (!hasUnplayed) playedRef.current = new Set();
    }
    if (fromEnded) {
      const nextIndex = nextIndexOnEnd({
        length: items.length,
        current: fromIndex,
        ids: items.map((track) => track.id),
        playedIds: Array.from(playedRef.current),
        shuffle: shuffleRef.current,
        repeat: repeatRef.current,
      });
      if (nextIndex == null) {
        sessionRef.current.noteEnded();
        setPlaying(false);
        persistSnapshotRef.current(true);
        syncNowPlayingRef.current(true);
        return;
      }
      historyRef.current = pushPlayHistory(historyRef.current, fromIndex);
      loadRef.current(items, nextIndex, true);
      return;
    }
    const nextIndex = shuffleRef.current
      ? nextShuffledIndex(items.length, fromIndex, items.map((track) => track.id), recentRef.current)
      : (fromIndex + 1) % items.length;
    historyRef.current = pushPlayHistory(historyRef.current, fromIndex);
    loadRef.current(items, nextIndex, true);
  }, [replayCurrent]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.setAttribute('playsinline', 'true');
    (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    (audio as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    audioRef.current = audio;
    const onEnded = () => {
      if (decideEndedEvent({
        wantPlaying: sessionRef.current.wantPlaying,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      }) === 'ignore') return;
      sessionRef.current.noteEnded();
      interruptedRef.current = false;
      playNextFrom(indexRef.current, true);
    };
    const syncPlayback = () => {
      const outcome = sessionRef.current.onTransportEvent({
        paused: audio.paused,
        seeking: Boolean(audio.seeking),
      });
      if (outcome.decision === 'playing') {
        interruptedRef.current = false;
        dispatchRef.current(outcome.effects);
        persistSnapshotRef.current(false);
        syncNowPlayingRef.current(true);
        return;
      }
      if (outcome.decision === 'suppress') {
        queueMicrotask(() => {
          if (!sessionRef.current.wantPlaying && !audio.paused) audio.pause();
        });
        return;
      }
      if (outcome.effects.length) dispatchRef.current(outcome.effects);
      if (outcome.decision === 'ignore') return;
      interruptedRef.current = false;
      persistSnapshotRef.current(true);
      syncNowPlayingRef.current(true);
    };
    const onTime = () => {
      applyPendingSeek(audio);
      syncTimes(audio);
      persistSnapshotRef.current(false);
      syncNowPlayingRef.current(false);
    };
    const onLoaded = () => {
      applyPendingSeek(audio);
      syncTimes(audio);
      dispatchRef.current(sessionRef.current.onCanPlay({
        paused: audio.paused,
        seeking: Boolean(audio.seeking),
      }));
      syncNowPlayingRef.current(true);
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', syncPlayback);
    audio.addEventListener('playing', syncPlayback);
    audio.addEventListener('pause', syncPlayback);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onTime);
    const onSeeked = () => {
      dispatchRef.current(sessionRef.current.onSeeked({
        paused: audio.paused,
        seeking: Boolean(audio.seeking),
      }));
    };
    audio.addEventListener('canplay', onLoaded);
    audio.addEventListener('seeked', onSeeked);
    return () => {
      persistSnapshotRef.current(true);
      if (playRetryTimer.current) {
        window.clearTimeout(playRetryTimer.current);
        playRetryTimer.current = 0;
      }
      audio.pause();
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', syncPlayback);
      audio.removeEventListener('playing', syncPlayback);
      audio.removeEventListener('pause', syncPlayback);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onTime);
      audio.removeEventListener('canplay', onLoaded);
      audio.removeEventListener('seeked', onSeeked);
      audio.remove();
      audioRef.current = null;
    };
  }, [applyPendingSeek, playNextFrom, syncTimes]);

  const restoreSnapshot = useCallback((autoplay: boolean) => {
    const key = sessionKeyRef.current;
    const api = clientRef.current;
    if (!key || !api || !audioRef.current) return false;
    const snapshot = readPlaybackSnapshot(window.localStorage, key);
    if (!snapshot) return false;
    loadRef.current(snapshot.queue, snapshot.index, autoplay, resumePosition(snapshot));
    historyRef.current = snapshot.history || [];
    interruptedRef.current = autoplay ? false : snapshot.interrupted;
    restoredKeyRef.current = key;
    return true;
  }, []);

  const playTracks = useCallback((tracks: Track[], startIndex = 0) => {
    const playable = tracks.filter((track) => track.id);
    if (sameTrackQueue(queueRef.current, playable) && indexRef.current !== startIndex) {
      historyRef.current = pushPlayHistory(historyRef.current, indexRef.current);
    } else if (!sameTrackQueue(queueRef.current, playable)) {
      historyRef.current = [];
    }
    playedRef.current = new Set();
    recentRef.current = [];
    pendingPlayRef.current = false;
    load(playable, startIndex, true);
  }, [load]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const now = Date.now();
    lastPlayCommandAt.current = now;
    if (!queueRef.current.length) {
      pendingPlayRef.current = true;
      if (!restoreSnapshot(true)) return;
      pendingPlayRef.current = false;
      return;
    }
    pendingPlayRef.current = false;
    interruptedRef.current = false;
    clearPlayRetry();
    dispatchRef.current(sessionRef.current.requestPlay(now));
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, [clearPlayRetry, restoreSnapshot]);

  const pause = useCallback(() => {
    const now = Date.now();
    lastPauseCommandAt.current = now;
    clearPlayRetry();
    interruptedRef.current = false;
    pendingPlayRef.current = false;
    dispatchRef.current(sessionRef.current.requestPause(now));
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, [clearPlayRetry]);

  const interrupt = useCallback(() => {
    if (shouldIgnoreInterrupt({
      loading: sessionRef.current.loading,
      lastPlayCommandAt: lastPlayCommandAt.current,
      now: Date.now(),
    })) return;
    const now = Date.now();
    lastPauseCommandAt.current = now;
    clearPlayRetry();
    interruptedRef.current = true;
    dispatchRef.current(sessionRef.current.requestPause(now));
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, [clearPlayRetry]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !queueRef.current.length) return;
    const now = Date.now();
    const effects = sessionRef.current.requestToggle(now, {
      paused: audio.paused,
      seeking: Boolean(audio.seeking),
    });
    if (effects.some((effect) => effect.type === 'pause')) {
      lastPauseCommandAt.current = now;
      interruptedRef.current = false;
      pendingPlayRef.current = false;
    } else {
      lastPlayCommandAt.current = now;
      interruptedRef.current = false;
      pendingPlayRef.current = false;
    }
    clearPlayRetry();
    dispatchRef.current(effects);
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, [clearPlayRetry]);

  const next = useCallback(() => {
    playNextFrom(indexRef.current, false);
  }, [playNextFrom]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    const items = queueRef.current.filter((track) => track.id);
    const action = previousFromHistory({
      currentTime: audio ? audio.currentTime || 0 : 0,
      currentIndex: indexRef.current,
      history: historyRef.current,
      length: items.length,
    });
    if (action.restart) {
      if (audio) audio.currentTime = 0;
      setCurrentTime(0);
      persistSnapshotRef.current(true);
      syncNowPlayingRef.current(true);
      return;
    }
    if (!items.length) return;
    historyRef.current = action.history;
    load(items, action.index, true);
  }, [load]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : seconds;
    const nextTime = Math.max(0, Math.min(seconds, max || seconds));
    sessionRef.current.noteSeek(Date.now());
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const current = audio.currentTime || 0;
    const max = Number.isFinite(audio.duration) ? audio.duration : Math.max(0, current + delta);
    const nextTime = Math.max(0, Math.min(current + delta, max || 0));
    sessionRef.current.noteSeek(Date.now());
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((current) => {
      const nextValue = !current;
      persist(SHUFFLE_KEY, nextValue ? '1' : '0');
      return nextValue;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((current) => {
      const nextValue = cycleRepeatMode(current);
      persist(REPEAT_KEY, nextValue);
      return nextValue;
    });
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    const now = Date.now();
    clearPlayRetry();
    lastPauseCommandAt.current = now;
    interruptedRef.current = false;
    pendingPlayRef.current = false;
    dispatchRef.current(sessionRef.current.requestPause(now));
    if (audio) {
      audio.removeAttribute('src');
      audio.removeAttribute('title');
      audio.load();
    }
    setQueue([]);
    setIndex(0);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    queueRef.current = [];
    indexRef.current = 0;
    recentRef.current = [];
    playedRef.current = new Set();
    historyRef.current = [];
    pendingPlayRef.current = false;
    pendingRemoteRef.current = null;
    clearPlaybackSnapshot(window.localStorage);
    syncNowPlayingRef.current(true);
  }, [clearPlayRetry]);

  useEffect(() => {
    if (!sessionKey) {
      if (restoredKeyRef.current) {
        restoredKeyRef.current = '';
        stop();
      }
      return;
    }
    if (!shouldRestorePlayback({
      sessionKey,
      restoredKey: restoredKeyRef.current,
      queueLength: queueRef.current.length,
    })) {
      if (queueRef.current.length) restoredKeyRef.current = sessionKey;
      return;
    }
    if (!client || !audioRef.current) return;
    restoredKeyRef.current = sessionKey;
    const queued = pendingRemoteRef.current;
    restoreSnapshot(queued ? false : pendingPlayRef.current);
    pendingPlayRef.current = false;
    if (queued && queueRef.current.length) {
      pendingRemoteRef.current = null;
      const action = queued.action || '';
      if (action === 'nexttrack') next();
      else if (action === 'previoustrack') prev();
      else if (action === 'pause' || action === 'interrupt') pause();
      else if (action === 'play') play();
      else if (action === 'stop') stop();
      else if (action === 'seekto' && queued.seekTime != null) seek(queued.seekTime);
    }
  }, [client, next, pause, play, prev, restoreSnapshot, seek, sessionKey, stop]);

  const syncNowPlaying = useCallback((force = false) => {
    const items = queueRef.current;
    const track = items[indexRef.current];
    const audio = audioRef.current;
    const info = nowPlayingInfo(track, {
      currentTime: audio ? audio.currentTime || 0 : 0,
      duration: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
      playing: audio ? reportedPlaying(audio.paused, sessionRef.current.wantPlaying) : false,
      interrupted: interruptedRef.current,
    });
    if (!isNativeAndroid()) applyWebMediaSession(getMediaSession(), info);
    const sig = `${info.active ? 1 : 0}|${track ? track.id : 0}|${info.playing ? 1 : 0}|${info.interrupted ? 1 : 0}|${Math.round(info.duration)}`;
    const now = Date.now();
    if (force || sig !== lastNativeSig.current || now - lastNativeAt.current >= 1000) {
      lastNativeSig.current = sig;
      lastNativeAt.current = now;
      updateNativeNowPlaying(info);
    }
  }, []);

  syncNowPlayingRef.current = syncNowPlaying;

  handlersRef.current = {
    play,
    pause,
    interrupt,
    next,
    previous: prev,
    seek,
    seekBy,
    stop,
  };

  useEffect(() => {
    const lastRemote = { action: '', at: 0 };
    const rememberQueueAction = (action: string, seekTime?: number) => {
      pendingRemoteRef.current = { action, seekTime };
      pendingPlayRef.current = action === 'play' || action === 'nexttrack' || action === 'previoustrack';
    };
    const claimRemote = (action: string, now: number) => {
      lastRemote.action = action;
      lastRemote.at = now;
      pullPendingNowPlaying(() => undefined);
    };
    const readyForTransport = (action: string, seekTime?: number) => {
      if (queueRef.current.length || action === 'stop') return true;
      rememberQueueAction(action, seekTime);
      if (!restoreSnapshot(false) || !queueRef.current.length) return false;
      pendingRemoteRef.current = null;
      return true;
    };
    const proxy: NowPlayingHandlers = {
      play: () => {
        const now = Date.now();
        if (isDuplicateTransport({ action: 'play', lastAction: lastRemote.action, lastActionAt: lastRemote.at, now })) return;
        if (!shouldApplyRemoteTransport({
          action: 'play',
          wantPlaying: sessionRef.current.wantPlaying,
          lastPlayCommandAt: lastPlayCommandAt.current,
          lastPauseCommandAt: lastPauseCommandAt.current,
          now,
        })) return;
        claimRemote('play', now);
        if (!queueRef.current.length) rememberQueueAction('play');
        handlersRef.current.play();
        if (queueRef.current.length) pendingRemoteRef.current = null;
      },
      pause: () => {
        const now = Date.now();
        if (isDuplicateTransport({ action: 'pause', lastAction: lastRemote.action, lastActionAt: lastRemote.at, now })) return;
        if (!shouldApplyRemoteTransport({
          action: 'pause',
          wantPlaying: sessionRef.current.wantPlaying,
          lastPlayCommandAt: lastPlayCommandAt.current,
          lastPauseCommandAt: lastPauseCommandAt.current,
          now,
        })) return;
        claimRemote('pause', now);
        if (!readyForTransport('pause')) return;
        handlersRef.current.pause();
      },
      interrupt: () => {
        if (shouldIgnoreInterrupt({
          loading: sessionRef.current.loading,
          lastPlayCommandAt: lastPlayCommandAt.current,
          now: Date.now(),
        })) return;
        if (!readyForTransport('interrupt')) return;
        handlersRef.current.interrupt();
      },
      next: () => {
        const now = Date.now();
        if (isDuplicateTransport({ action: 'nexttrack', lastAction: lastRemote.action, lastActionAt: lastRemote.at, now })) return;
        claimRemote('nexttrack', now);
        if (!readyForTransport('nexttrack')) return;
        handlersRef.current.next();
      },
      previous: () => {
        const now = Date.now();
        if (isDuplicateTransport({ action: 'previoustrack', lastAction: lastRemote.action, lastActionAt: lastRemote.at, now })) return;
        claimRemote('previoustrack', now);
        if (!readyForTransport('previoustrack')) return;
        handlersRef.current.previous();
      },
      seek: (seconds) => {
        if (!readyForTransport('seekto', seconds)) return;
        handlersRef.current.seek(seconds);
      },
      seekBy: (delta) => handlersRef.current.seekBy(delta),
      stop: () => handlersRef.current.stop(),
    };
    const proxyFromAction = (action: string, seek: number | null) => {
      if (action === 'play') proxy.play();
      else if (action === 'pause') proxy.pause();
      else if (action === 'interrupt') proxy.interrupt();
      else if (action === 'nexttrack') proxy.next();
      else if (action === 'previoustrack') proxy.previous();
      else if (action === 'stop') proxy.stop();
      else if (action === 'seekto' && seek != null) proxy.seek(seek);
      else if (action === 'seekforward') proxy.seekBy(10);
      else if (action === 'seekbackward') proxy.seekBy(-10);
    };
    const bridge = window as Window & {
      __audiochestTransport?: (action: string, seek: number | null) => void;
    };
    bridge.__audiochestTransport = proxyFromAction;
    const unbindWeb = bindWebMediaSession(getMediaSession(), proxy);
    const unbindNative = listenNativeNowPlaying(proxy);
    let unbindApp: (() => void) | undefined;
    try {
      const app = (Plugins as { App?: { addListener?: (event: string, cb: (state: { isActive: boolean }) => void) => { remove: () => void } } }).App;
      if (app && typeof app.addListener === 'function') {
        const handle = app.addListener('appStateChange', (state) => {
          persistSnapshotRef.current(true);
          if (state.isActive) pullPendingNowPlaying((data) => proxyFromAction(data.action || '', data.seekTime == null ? null : data.seekTime));
          else syncNowPlayingRef.current(true);
        });
        unbindApp = () => {
          try {
            if (handle && typeof handle.remove === 'function') handle.remove();
          } catch (error) {
            // Ignore app-state listener cleanup failures.
          }
        };
      }
    } catch (error) {
      // App plugin is optional on web.
    }
    return () => {
      delete bridge.__audiochestTransport;
      unbindWeb();
      unbindNative();
      if (unbindApp) unbindApp();
    };
  }, []);

  const current = queue[index];
  const value = useMemo(() => ({
    queue,
    index,
    playing,
    current,
    title: current ? displayTitle(current) : '',
    currentTime,
    duration,
    shuffle,
    repeat,
    playTracks,
    toggle,
    next,
    prev,
    seek,
    toggleShuffle,
    cycleRepeat,
    stop,
  }), [queue, index, playing, current, currentTime, duration, shuffle, repeat, playTracks, toggle, next, prev, seek, toggleShuffle, cycleRepeat, stop]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
};

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used within PlayerProvider');
  return value;
}
