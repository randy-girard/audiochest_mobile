import { Capacitor, Plugins } from '@capacitor/core';
import { Track } from './types';

export const DEFAULT_ARTWORK = '/assets/icon/icon.png';
export const SEEK_STEP_SECONDS = 10;

export interface NowPlayingInfo {
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  position: number;
  playing: boolean;
  active: boolean;
  interrupted: boolean;
  trackId: number;
}

export interface NowPlayingHandlers {
  play: () => void;
  pause: () => void;
  interrupt: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  stop: () => void;
}

export interface MediaSessionActionDetails {
  seekTime?: number;
  seekOffset?: number;
}

export interface MediaSessionLike {
  metadata: unknown;
  playbackState: string;
  setActionHandler: (action: string, handler: ((details?: MediaSessionActionDetails) => void) | null) => void;
  setPositionState?: (state?: { duration?: number; playbackRate?: number; position?: number }) => void;
}

export interface NowPlayingAction {
  action?: string;
  seekTime?: number;
  seekOffset?: number;
}

interface NativeNowPlayingPlugin {
  update: (info: {
    title: string;
    artist: string;
    album: string;
    duration: number;
    position: number;
    playing: boolean;
    active: boolean;
    interrupted: boolean;
    trackId: number;
  }) => Promise<void>;
  addListener: (eventName: string, listenerFunc: (data: NowPlayingAction) => void) => { remove: () => void };
  consumePendingAction?: () => Promise<NowPlayingAction>;
}

export function mediaTitle(track: Track): string {
  const name = (track.track_title || '').trim();
  if (name) return name;
  const full = (track.full_title || '').trim();
  if (full) return full;
  return (track.title || `Track ${track.id}`).trim();
}

export function mediaArtist(track: Track): string {
  return (track.artist_name || '').trim();
}

export function mediaAlbum(track: Track): string {
  const named = (track.album_name || '').trim();
  if (named) return named;
  const first = (track.albums || []).map((album) => (album.name || '').trim()).find(Boolean);
  return first || '';
}

export function reportedPlaying(paused: boolean, playRequested: boolean): boolean {
  return !paused || playRequested;
}

export function nowPlayingInfo(
  track: Track | undefined,
  times: { currentTime: number; duration: number; playing: boolean; interrupted?: boolean },
): NowPlayingInfo {
  const duration = Number.isFinite(times.duration) && times.duration > 0 ? times.duration : 0;
  const position = Number.isFinite(times.currentTime) ? Math.max(0, times.currentTime) : 0;
  if (!track) {
    return {
      title: '',
      artist: '',
      album: '',
      artwork: DEFAULT_ARTWORK,
      duration: 0,
      position: 0,
      playing: false,
      active: false,
      interrupted: false,
      trackId: 0,
    };
  }
  return {
    title: mediaTitle(track),
    artist: mediaArtist(track),
    album: mediaAlbum(track),
    artwork: DEFAULT_ARTWORK,
    duration,
    position: duration > 0 ? Math.min(position, duration) : position,
    playing: times.playing,
    active: true,
    interrupted: !!times.interrupted,
    trackId: track.id || 0,
  };
}

export function getMediaSession(): MediaSessionLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { mediaSession?: MediaSessionLike }).mediaSession;
}

export function applyWebMediaSession(session: MediaSessionLike | undefined, info: NowPlayingInfo): void {
  if (!session) return;
  try {
    if (!info.active) {
      session.metadata = null;
      session.playbackState = 'none';
      if (session.setPositionState) session.setPositionState();
      return;
    }
    const Ctor = (typeof window !== 'undefined'
      ? (window as unknown as { MediaMetadata?: new (init: object) => unknown }).MediaMetadata
      : undefined);
    if (Ctor) {
      session.metadata = new Ctor({
        title: info.title,
        artist: info.artist,
        album: info.album,
        artwork: info.artwork ? [{ src: info.artwork, sizes: '512x512', type: 'image/png' }] : [],
      });
    }
    session.playbackState = info.playing ? 'playing' : 'paused';
    if (session.setPositionState) {
      if (info.duration > 0) {
        session.setPositionState({
          duration: info.duration,
          playbackRate: 1,
          position: Math.max(0, Math.min(info.position, info.duration)),
        });
      }
    }
  } catch (error) {
    // Media Session is best-effort; the native Android session still publishes metadata.
  }
}

type ActionRunner = (handlers: NowPlayingHandlers, details?: MediaSessionActionDetails) => void;

export const MEDIA_ACTIONS: Array<{ action: string; run: ActionRunner }> = [
  { action: 'play', run: (handlers) => handlers.play() },
  { action: 'pause', run: (handlers) => handlers.pause() },
  { action: 'previoustrack', run: (handlers) => handlers.previous() },
  { action: 'nexttrack', run: (handlers) => handlers.next() },
  { action: 'stop', run: (handlers) => handlers.stop() },
  {
    action: 'seekto',
    run: (handlers, details) => {
      if (details && details.seekTime != null && Number.isFinite(details.seekTime)) {
        handlers.seek(details.seekTime);
      }
    },
  },
  {
    action: 'seekbackward',
    run: (handlers, details) => {
      const offset = details && details.seekOffset != null && Number.isFinite(details.seekOffset)
        ? details.seekOffset
        : SEEK_STEP_SECONDS;
      handlers.seekBy(-offset);
    },
  },
  {
    action: 'seekforward',
    run: (handlers, details) => {
      const offset = details && details.seekOffset != null && Number.isFinite(details.seekOffset)
        ? details.seekOffset
        : SEEK_STEP_SECONDS;
      handlers.seekBy(offset);
    },
  },
];

export const NATIVE_ACTIONS: Array<{ action: string; run: ActionRunner }> = MEDIA_ACTIONS.concat([
  {
    action: 'interrupt',
    run: (handlers) => {
      if (typeof handlers.interrupt === 'function') handlers.interrupt();
      else handlers.pause();
    },
  },
]);

export function dispatchNowPlayingAction(handlers: NowPlayingHandlers, data: NowPlayingAction): void {
  const action = data.action || '';
  const match = NATIVE_ACTIONS.find((item) => item.action === action);
  if (!match) return;
  match.run(handlers, data);
}

export function bindWebMediaSession(
  session: MediaSessionLike | undefined,
  handlers: NowPlayingHandlers,
): () => void {
  if (!session) return () => undefined;
  MEDIA_ACTIONS.forEach(({ action, run }) => {
    try {
      session.setActionHandler(action, (details) => run(handlers, details));
    } catch (error) {
      // Some browsers reject unsupported media session actions.
    }
  });
  return () => {
    MEDIA_ACTIONS.forEach(({ action }) => {
      try {
        session.setActionHandler(action, null);
      } catch (error) {
        // Ignore cleanup failures.
      }
    });
  };
}

export function isNativeAndroid(): boolean {
  try {
    return !!(Capacitor && Capacitor.isNative && typeof Capacitor.getPlatform === 'function' && Capacitor.getPlatform() === 'android');
  } catch (error) {
    return false;
  }
}

function nativePlugin(): NativeNowPlayingPlugin | undefined {
  try {
    if (!Capacitor || typeof Capacitor.isPluginAvailable !== 'function') return undefined;
    if (!Capacitor.isPluginAvailable('NowPlaying')) return undefined;
    const plugin = (Plugins as { NowPlaying?: NativeNowPlayingPlugin }).NowPlaying;
    if (!plugin || typeof plugin.update !== 'function') return undefined;
    return plugin;
  } catch (error) {
    return undefined;
  }
}

export function updateNativeNowPlaying(info: NowPlayingInfo): Promise<void> {
  const plugin = nativePlugin();
  if (!plugin) return Promise.resolve();
  return plugin.update({
    title: info.title,
    artist: info.artist,
    album: info.album,
    duration: info.duration,
    position: info.position,
    playing: info.playing,
    active: info.active,
    interrupted: info.interrupted,
    trackId: info.trackId,
  }).then(() => undefined, () => undefined);
}

export function listenNativeNowPlaying(handlers: NowPlayingHandlers): () => void {
  const plugin = nativePlugin();
  if (!plugin || typeof plugin.addListener !== 'function') return () => undefined;
  const handle = plugin.addListener('action', (data) => {
    dispatchNowPlayingAction(handlers, data || {});
  });
  if (typeof plugin.consumePendingAction === 'function') {
    plugin.consumePendingAction().then((data) => {
      if (data && data.action) dispatchNowPlayingAction(handlers, data);
    }, () => undefined);
  }
  return () => {
    try {
      if (handle && typeof handle.remove === 'function') handle.remove();
    } catch (error) {
      // Ignore listener cleanup failures.
    }
  };
}
