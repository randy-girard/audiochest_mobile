import { Album, Artist, Playlist, Session, Track } from './types';
import { errorMessage, normalizeServer } from './utils';

export class AuthError extends Error {
  constructor(message = 'Session expired. Please sign in again.') {
    super(message);
    this.name = 'AuthError';
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    if (body.error) return String(body.error);
    if (body.errors) return Array.isArray(body.errors) ? body.errors.join(', ') : String(body.errors);
    const parts: string[] = [];
    Object.keys(body).forEach((key) => {
      const value = body[key];
      if (Array.isArray(value)) value.forEach((item) => parts.push(`${key} ${item}`));
      else if (typeof value === 'string') parts.push(value);
    });
    if (parts.length) return parts.join('; ');
  } catch (error) {
    if (text && text.length < 180) return text;
  }
  return `Server returned ${response.status}`;
}

export async function login(server: string, email: string, password: string): Promise<Session> {
  const root = normalizeServer(server);
  if (!root) throw new Error('Enter the AudioChest server URL.');
  const response = await fetch(`${root}/api/desktop_session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json();
  if (!body.token) throw new Error('Server did not return a token.');
  return { server: root, token: body.token, email: body.email || email.trim() };
}

export class ApiClient {
  constructor(public session: Session) {}

  get server(): string {
    return this.session.server;
  }

  get token(): string {
    return this.session.token;
  }

  audioSrc(track: Track): string {
    const url = new URL(`/tracks/${track.id}/audio`, `${this.server}/`);
    url.searchParams.set('token', this.token);
    return url.toString();
  }

  listTracks(): Promise<Track[]> {
    return this.get('/tracks.json');
  }

  updateTrack(id: number, fields: Record<string, unknown>): Promise<Track> {
    return this.send('PATCH', `/tracks/${id}.json`, { track: fields });
  }

  deleteTrack(id: number): Promise<void> {
    return this.send('DELETE', `/tracks/${id}.json`);
  }

  fingerprintTrack(id: number): Promise<{ ok: boolean; errors?: string[] }> {
    return this.send('PUT', `/tracks/${id}/fingerprint.json`);
  }

  listAlbums(): Promise<Album[]> {
    return this.get('/library/albums.json');
  }

  getAlbum(id: number): Promise<Album> {
    return this.get(`/albums/${id}.json`);
  }

  createAlbum(artistId: number, name: string): Promise<Album> {
    return this.send('POST', `/artists/${artistId}/albums.json`, { album: { name } });
  }

  updateAlbum(id: number, name: string): Promise<Album> {
    return this.send('PATCH', `/albums/${id}.json`, { album: { name } });
  }

  deleteAlbum(id: number): Promise<void> {
    return this.send('DELETE', `/albums/${id}.json`);
  }

  listPlaylists(): Promise<Playlist[]> {
    return this.get('/playlists.json');
  }

  getPlaylist(id: number): Promise<Playlist> {
    return this.get(`/playlists/${id}.json`);
  }

  createPlaylist(name: string, youtubeUrl = ''): Promise<Playlist> {
    return this.send('POST', '/playlists.json', { playlist: { name, youtube_url: youtubeUrl } });
  }

  updatePlaylist(id: number, name: string, youtubeUrl = ''): Promise<Playlist> {
    return this.send('PATCH', `/playlists/${id}.json`, { playlist: { name, youtube_url: youtubeUrl } });
  }

  deletePlaylist(id: number): Promise<void> {
    return this.send('DELETE', `/playlists/${id}.json`);
  }

  listArtists(): Promise<Artist[]> {
    return this.get('/artists.json');
  }

  getArtist(id: number): Promise<Artist> {
    return this.get(`/artists/${id}.json`);
  }

  createArtist(name: string): Promise<Artist> {
    return this.send('POST', '/artists.json', { artist: { name } });
  }

  updateArtist(id: number, name: string): Promise<Artist> {
    return this.send('PATCH', `/artists/${id}.json`, { artist: { name } });
  }

  deleteArtist(id: number): Promise<void> {
    return this.send('DELETE', `/artists/${id}.json`);
  }

  whoami(): Promise<{ email: string }> {
    return this.get('/api/desktop_session');
  }

  async logout(): Promise<void> {
    try {
      await this.send('DELETE', '/api/desktop_session');
    } catch (error) {
      if (error instanceof AuthError) return;
      throw error;
    }
  }

  private url(path: string): string {
    return `${this.server}${path}`;
  }

  private async get<T>(path: string): Promise<T> {
    return this.send('GET', path);
  }

  private async send<T = void>(method: string, path: string, payload?: unknown): Promise<T> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = window.setTimeout(() => controller?.abort(), 45000);
    try {
      const response = await fetch(this.url(path), {
        method,
        signal: controller?.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      if (response.status === 401) throw new AuthError();
      if (!response.ok) throw new Error(await readError(response));
      if (response.status === 204) return undefined as unknown as T;
      const text = await response.text();
      if (!text) return undefined as unknown as T;
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out. Check the server URL and try again.');
      }
      throw new Error(errorMessage(error, 'Could not reach AudioChest.'));
    } finally {
      window.clearTimeout(timer);
    }
  }
}
