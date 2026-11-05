export interface NamedRef {
  id: number;
  name: string;
}

export interface AlbumRef {
  id: number;
  name: string;
  artist_id?: number;
  artist_name?: string;
}

export interface Track {
  id: number;
  title: string;
  track_title?: string;
  artist_name?: string;
  album_name?: string;
  artist_id?: number | null;
  album_id?: number | null;
  full_title?: string;
  playlist_ids?: number[];
  playlists?: NamedRef[];
  album_ids?: number[];
  albums?: AlbumRef[];
  audio_url?: string | null;
  url?: string | null;
  content_type?: string | null;
  filename?: string | null;
}

export interface Playlist {
  id: number;
  name: string;
  youtube_url?: string | null;
  track_count?: number;
  tracks?: Track[];
}

export interface Album {
  id: number;
  artist_id: number;
  name: string;
  artist_name?: string;
  tracks?: Track[];
}

export interface Artist {
  id: number;
  name: string;
  album_count?: number;
  albums?: Album[];
  tracks?: Track[];
}

export interface Session {
  server: string;
  token: string;
  email: string;
}

export interface Instance {
  id: string;
  name: string;
  server: string;
  email: string;
  token: string;
}
