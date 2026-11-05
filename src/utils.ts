import { AlbumRef, Track } from './types';

export function normalizeServer(server: string): string {
  return server.trim().replace(/\/+$/, '');
}

export function displayTitle(track: Track): string {
  const full = (track.full_title || '').trim();
  if (full) return full;
  const name = (track.track_title || '').trim();
  const artist = (track.artist_name || '').trim();
  if (name && artist) return `${artist} - ${name}`;
  if (name) return name;
  return (track.title || `Track ${track.id}`).trim();
}

export function albumNames(track: Track): string {
  const names = (track.albums || []).map((album: AlbumRef) => {
    const title = (album.name || '').trim();
    const artist = (album.artist_name || '').trim();
    if (artist && title) return `${artist} — ${title}`;
    return title;
  }).filter(Boolean);
  if (names.length) return names.join(', ');
  return (track.album_name || '').trim();
}

export function playlistNames(track: Track): string {
  return (track.playlists || []).map((item) => item.name).filter(Boolean).join(', ');
}

export function matchesQuery(value: string | undefined, query: string): boolean {
  if (!query) return true;
  return (value || '').toLowerCase().includes(query.toLowerCase());
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
