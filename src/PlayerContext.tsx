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
  NowPlayingHandlers,
  reportedPlaying,
  updateNativeNowPlaying,
} from './nowPlaying';
import { RepeatMode, cycleRepeatMode, nextIndexOnEnd } from './playerAdvance';
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
  const wantPlayingRef = useRef(false);
  const syncNowPlayingRef = useRef<(force?: boolean) => void>(() => undefined);
  const persistSnapshotRef = useRef<(force?: boolean) => void>(() => undefined);
  const sessionKeyRef = useRef(sessionKey);
  const clientRef = useRef(client);
  const pendingSeekRef = useRef(0);
  const loadingRef = useRef(false);
  const interruptedRef = useRef(false);
  const lastPersistAt = useRef(0);
  const pendingPlayRef = useRef(false);
  const restoredKeyRef = useRef('');

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
      wasPlaying: wantPlayingRef.current || interruptedRef.current,
      interrupted: interruptedRef.current,
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
    if (!(seekTo > 0)) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : seekTo;
    audio.currentTime = Math.max(0, Math.min(seekTo, max || seekTo));
    pendingSeekRef.current = 0;
    setCurrentTime(audio.currentTime || 0);
  }, []);

  const load = useCallback((tracks: Track[], start: number, autoplay: boolean, position = 0) => {
    const api = clientRef.current;
    if (!api) return;
    const playable = tracks.filter((track) => track.id);
    if (!playable.length || start < 0 || start >= playable.length) return;
    const track = playable[start];
    const audio = audioRef.current;
    if (!audio) return;
    loadingRef.current = true;
    wantPlayingRef.current = autoplay;
    interruptedRef.current = false;
    pendingSeekRef.current = position > 0 ? position : 0;
    if (autoplay) setPlaying(true);
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
    if (autoplay) {
      const result = audio.play();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          wantPlayingRef.current = false;
          loadingRef.current = false;
          setPlaying(false);
          syncNowPlayingRef.current(true);
        });
      }
    } else {
      setPlaying(false);
    }
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, []);

  loadRef.current = load;

  const replayCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    wantPlayingRef.current = true;
    interruptedRef.current = false;
    setPlaying(true);
    const result = audio.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        wantPlayingRef.current = false;
        setPlaying(false);
        syncNowPlayingRef.current(true);
      });
    }
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
        wantPlayingRef.current = false;
        setPlaying(false);
        persistSnapshotRef.current(true);
        syncNowPlayingRef.current(true);
        return;
      }
      loadRef.current(items, nextIndex, true);
      return;
    }
    const nextIndex = shuffleRef.current
      ? nextShuffledIndex(items.length, fromIndex, items.map((track) => track.id), recentRef.current)
      : (fromIndex + 1) % items.length;
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
      wantPlayingRef.current = false;
      interruptedRef.current = false;
      playNextFrom(indexRef.current, true);
    };
    const syncPlayback = () => {
      if (!audio.paused) {
        wantPlayingRef.current = true;
        loadingRef.current = false;
        interruptedRef.current = false;
        setPlaying(true);
        persistSnapshotRef.current(false);
        syncNowPlayingRef.current(true);
        return;
      }
      if (loadingRef.current) return;
      if (wantPlayingRef.current) interruptedRef.current = true;
      wantPlayingRef.current = false;
      setPlaying(false);
      persistSnapshotRef.current(true);
      syncNowPlayingRef.current(true);
    };
    const onTime = () => {
      applyPendingSeek(audio);
      syncTimes(audio);
      if (!audio.paused) {
        wantPlayingRef.current = true;
        setPlaying(true);
      } else if (!wantPlayingRef.current && !loadingRef.current) {
        setPlaying(false);
      }
      persistSnapshotRef.current(false);
      syncNowPlayingRef.current(false);
    };
    const onLoaded = () => {
      loadingRef.current = false;
      applyPendingSeek(audio);
      syncTimes(audio);
      syncNowPlayingRef.current(true);
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', syncPlayback);
    audio.addEventListener('playing', syncPlayback);
    audio.addEventListener('pause', syncPlayback);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onTime);
    audio.addEventListener('canplay', onLoaded);
    return () => {
      persistSnapshotRef.current(true);
      audio.pause();
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', syncPlayback);
      audio.removeEventListener('playing', syncPlayback);
      audio.removeEventListener('pause', syncPlayback);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onTime);
      audio.removeEventListener('canplay', onLoaded);
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
    interruptedRef.current = autoplay ? false : snapshot.interrupted;
    restoredKeyRef.current = key;
    return true;
  }, []);

  const playTracks = useCallback((tracks: Track[], startIndex = 0) => {
    playedRef.current = new Set();
    recentRef.current = [];
    pendingPlayRef.current = false;
    load(tracks, startIndex, true);
  }, [load]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!queueRef.current.length) {
      pendingPlayRef.current = true;
      if (!restoreSnapshot(true)) return;
      pendingPlayRef.current = false;
      return;
    }
    pendingPlayRef.current = false;
    interruptedRef.current = false;
    wantPlayingRef.current = true;
    setPlaying(true);
    const result = audio.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        wantPlayingRef.current = false;
        setPlaying(false);
        syncNowPlayingRef.current(true);
      });
    }
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, [restoreSnapshot]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    interruptedRef.current = false;
    wantPlayingRef.current = false;
    pendingPlayRef.current = false;
    if (audio) audio.pause();
    persistSnapshotRef.current(true);
  }, []);

  const interrupt = useCallback(() => {
    const audio = audioRef.current;
    interruptedRef.current = true;
    wantPlayingRef.current = false;
    if (audio && !audio.paused) audio.pause();
    setPlaying(false);
    persistSnapshotRef.current(true);
    syncNowPlayingRef.current(true);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !queueRef.current.length) return;
    if (audio.paused) play();
    else pause();
  }, [pause, play]);

  const next = useCallback(() => {
    playNextFrom(indexRef.current, false);
  }, [playNextFrom]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      persistSnapshotRef.current(true);
      syncNowPlayingRef.current(true);
      return;
    }
    const items = queueRef.current.filter((track) => track.id);
    if (!items.length) return;
    if (shuffleRef.current) {
      playNextFrom(indexRef.current, false);
      return;
    }
    const prevIndex = (indexRef.current - 1 + items.length) % items.length;
    load(items, prevIndex, true);
  }, [load, playNextFrom]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : seconds;
    const nextTime = Math.max(0, Math.min(seconds, max || seconds));
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
    if (audio) {
      wantPlayingRef.current = false;
      interruptedRef.current = false;
      audio.pause();
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
    pendingPlayRef.current = false;
    clearPlaybackSnapshot(window.localStorage);
    syncNowPlayingRef.current(true);
  }, []);

  useEffect(() => {
    const previous = restoredKeyRef.current;
    if (previous && previous !== sessionKey) stop();
    if (!sessionKey || !client || !audioRef.current) return;
    if (restoredKeyRef.current === sessionKey && queueRef.current.length) {
      if (pendingPlayRef.current) play();
      return;
    }
    restoreSnapshot(pendingPlayRef.current);
    pendingPlayRef.current = false;
  }, [client, play, restoreSnapshot, sessionKey, stop]);

  const syncNowPlaying = useCallback((force = false) => {
    const items = queueRef.current;
    const track = items[indexRef.current];
    const audio = audioRef.current;
    const info = nowPlayingInfo(track, {
      currentTime: audio ? audio.currentTime || 0 : 0,
      duration: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
      playing: audio ? reportedPlaying(audio.paused, wantPlayingRef.current) : false,
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
    const proxy: NowPlayingHandlers = {
      play: () => handlersRef.current.play(),
      pause: () => handlersRef.current.pause(),
      interrupt: () => handlersRef.current.interrupt(),
      next: () => handlersRef.current.next(),
      previous: () => handlersRef.current.previous(),
      seek: (seconds) => handlersRef.current.seek(seconds),
      seekBy: (delta) => handlersRef.current.seekBy(delta),
      stop: () => handlersRef.current.stop(),
    };
    const unbindWeb = bindWebMediaSession(getMediaSession(), proxy);
    const unbindNative = listenNativeNowPlaying(proxy);
    let unbindApp: (() => void) | undefined;
    try {
      const app = (Plugins as { App?: { addListener?: (event: string, cb: (state: { isActive: boolean }) => void) => { remove: () => void } } }).App;
      if (app && typeof app.addListener === 'function') {
        const handle = app.addListener('appStateChange', (state) => {
          persistSnapshotRef.current(true);
          if (!state.isActive) syncNowPlayingRef.current(true);
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
