import {
  MEDIA_ACTIONS,
  applyWebMediaSession,
  dispatchNowPlayingAction,
  mediaAlbum,
  mediaArtist,
  mediaTitle,
  nowPlayingInfo,
  reportedPlaying,
  NowPlayingHandlers,
  MediaSessionLike,
} from './nowPlaying';
import { Track } from './types';

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: 7,
    title: 'Fallback Title',
    ...overrides,
  };
}

function handlers(): NowPlayingHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    play: () => { calls.push('play'); },
    pause: () => { calls.push('pause'); },
    interrupt: () => { calls.push('interrupt'); },
    next: () => { calls.push('next'); },
    previous: () => { calls.push('previous'); },
    seek: (seconds) => { calls.push(`seek:${seconds}`); },
    seekBy: (delta) => { calls.push(`seekBy:${delta}`); },
    stop: () => { calls.push('stop'); },
  };
}

describe('nowPlaying metadata', () => {
  it('prefers the song name, artist, and album for connected controllers', () => {
    const song = track({
      track_title: 'Exit Music',
      full_title: 'Radiohead - Exit Music',
      title: 'Radiohead - Exit Music (for a Film)',
      artist_name: 'Radiohead',
      album_name: 'OK Computer',
    });
    expect(mediaTitle(song)).toBe('Exit Music');
    expect(mediaArtist(song)).toBe('Radiohead');
    expect(mediaAlbum(song)).toBe('OK Computer');
  });

  it('falls back to nested album names and the display title', () => {
    const song = track({
      albums: [{ id: 1, name: 'In Rainbows', artist_name: 'Radiohead' }],
    });
    expect(mediaTitle(song)).toBe('Fallback Title');
    expect(mediaAlbum(song)).toBe('In Rainbows');
  });

  it('builds an inactive payload when nothing is queued', () => {
    expect(nowPlayingInfo(undefined, { currentTime: 12, duration: 90, playing: true })).toEqual({
      title: '',
      artist: '',
      album: '',
      artwork: '/assets/icon/icon.png',
      duration: 0,
      position: 0,
      playing: false,
      active: false,
      interrupted: false,
      trackId: 0,
    });
  });

  it('clamps position to duration for lock-screen scrubbers', () => {
    const info = nowPlayingInfo(track({ track_title: 'Weird Fishes', artist_name: 'Radiohead', album_name: 'In Rainbows' }), {
      currentTime: 400,
      duration: 318.2,
      playing: true,
    });
    expect(info.active).toBe(true);
    expect(info.title).toBe('Weird Fishes');
    expect(info.position).toBe(318.2);
    expect(info.playing).toBe(true);
  });
});

describe('reportedPlaying', () => {
  it('stays playing while play() is in flight even if the element is still paused', () => {
    expect(reportedPlaying(true, true)).toBe(true);
    expect(reportedPlaying(false, true)).toBe(true);
    expect(reportedPlaying(false, false)).toBe(true);
    expect(reportedPlaying(true, false)).toBe(false);
  });
});

describe('nowPlaying actions', () => {
  it('maps bluetooth / media-controller actions onto player controls', () => {
    const next = handlers();
    dispatchNowPlayingAction(next, { action: 'nexttrack' });
    dispatchNowPlayingAction(next, { action: 'previoustrack' });
    dispatchNowPlayingAction(next, { action: 'play' });
    dispatchNowPlayingAction(next, { action: 'pause' });
    dispatchNowPlayingAction(next, { action: 'seekto', seekTime: 41 });
    dispatchNowPlayingAction(next, { action: 'seekforward' });
    dispatchNowPlayingAction(next, { action: 'seekbackward', seekOffset: 5 });
    dispatchNowPlayingAction(next, { action: 'stop' });
    dispatchNowPlayingAction(next, { action: 'interrupt' });
    dispatchNowPlayingAction(next, { action: 'unknown' });
    expect(next.calls).toEqual([
      'next',
      'previous',
      'play',
      'pause',
      'seek:41',
      'seekBy:10',
      'seekBy:-5',
      'stop',
      'interrupt',
    ]);
  });

  it('covers the standard media session action set', () => {
    expect(MEDIA_ACTIONS.map((item) => item.action)).toEqual([
      'play',
      'pause',
      'previoustrack',
      'nexttrack',
      'stop',
      'seekto',
      'seekbackward',
      'seekforward',
    ]);
  });
});

describe('web media session', () => {
  it('publishes title, artist, album, playback state, and position', () => {
    const applied: string[] = [];
    const session: MediaSessionLike = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: () => undefined,
      setPositionState: (state) => { applied.push(`pos:${state && state.position}:${state && state.duration}`); },
    };
    (window as unknown as { MediaMetadata: new (init: object) => object }).MediaMetadata = class {
      title: string;
      artist: string;
      album: string;
      constructor(init: { title: string; artist: string; album: string }) {
        this.title = init.title;
        this.artist = init.artist;
        this.album = init.album;
      }
    } as unknown as new (init: object) => object;

    applyWebMediaSession(session, nowPlayingInfo(track({
      track_title: 'Reckoner',
      artist_name: 'Radiohead',
      album_name: 'In Rainbows',
    }), { currentTime: 12, duration: 280, playing: true }));

    const meta = session.metadata as { title: string; artist: string; album: string };
    expect(meta.title).toBe('Reckoner');
    expect(meta.artist).toBe('Radiohead');
    expect(meta.album).toBe('In Rainbows');
    expect(session.playbackState).toBe('playing');
    expect(applied).toEqual(['pos:12:280']);
  });

  it('clears the session when playback stops', () => {
    const session: MediaSessionLike = {
      metadata: { title: 'old' },
      playbackState: 'playing',
      setActionHandler: () => undefined,
      setPositionState: () => undefined,
    };
    applyWebMediaSession(session, nowPlayingInfo(undefined, { currentTime: 0, duration: 0, playing: false }));
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
  });
});
