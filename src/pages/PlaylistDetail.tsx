import {
  IonButton,
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { usePlayer } from '../PlayerContext';
import PageHeader from '../components/PageHeader';
import TrackList from '../components/TrackList';
import { Playlist, Track } from '../types';
import { errorMessage } from '../utils';

const PlaylistDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const { wrap } = useAuth();
  const player = usePlayer();
  const [presentAlert] = useIonAlert();
  const [present] = useIonToast();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const wrapRef = useRef(wrap);
  const presentRef = useRef(present);
  wrapRef.current = wrap;
  presentRef.current = present;

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError('');
    try {
      const detail = await wrapRef.current((api) => api.getPlaylist(Number(id)));
      if (detail) setPlaylist(detail);
      else setError('Could not load this playlist.');
    } catch (err) {
      setError(errorMessage(err, 'Could not load this playlist.'));
      presentRef.current({ message: errorMessage(err), duration: 2800, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load(true);
  }, [load]);

  const rename = () => {
    if (!playlist) return;
    presentAlert({
      header: 'Rename playlist',
      inputs: [{ name: 'name', value: playlist.name, placeholder: 'Playlist name' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            const name = String(data?.name || '').trim();
            if (!name) return false;
            try {
              await wrap((api) => api.updatePlaylist(playlist.id, name, playlist.youtube_url || ''));
              await load();
            } catch (err) {
              present({ message: errorMessage(err), duration: 2800, color: 'danger' });
            }
            return true;
          },
        },
      ],
    });
  };

  const destroy = () => {
    if (!playlist) return;
    presentAlert({
      header: 'Delete playlist?',
      message: `Delete “${playlist.name}”? Tracks stay in the library.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          handler: async () => {
            try {
              const ok = await wrap(async (api) => {
                await api.deletePlaylist(playlist.id);
                return true;
              });
              if (!ok) return;
              history.replace('/tabs/playlists');
            } catch (err) {
              present({ message: errorMessage(err), duration: 2800, color: 'danger' });
            }
          },
        },
      ],
    });
  };

  const removeTrack = async (track: Track) => {
    const ids = (track.playlist_ids || []).filter((playlistId) => playlistId !== Number(id));
    const ok = await wrap(async (api) => {
      await api.updateTrack(track.id, { playlist_ids: ids });
      return true;
    });
    if (!ok) throw new Error('Could not remove that track.');
  };

  const tracks = playlist?.tracks || [];

  return (
    <IonPage>
      <PageHeader
        title={playlist?.name || 'Playlist'}
        backHref="/tabs/playlists"
        extra={(
          <>
            <IonButton onClick={() => tracks.length && player.playTracks(tracks, 0)} disabled={!tracks.length || undefined}>
              Play
            </IonButton>
            <IonButton onClick={rename} disabled={!playlist || undefined}>Edit</IonButton>
            <IonButton color="danger" onClick={destroy} disabled={!playlist || undefined}>Delete</IonButton>
          </>
        )}
      />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={async (event) => { await load(); event.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        {loading ? (
          <div className="page-loading">
            <IonSpinner name="crescent" />
            <p>Loading playlist…</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <p>{error}</p>
            <IonButton onClick={() => { setLoading(true); load(); }}>Try again</IonButton>
          </div>
        ) : (
          <TrackList
            tracks={tracks}
            empty="This playlist has no tracks yet."
            onReload={load}
            confirmMessage={(track) => `Remove “${track.full_title || track.title}” from ${playlist?.name}?`}
            onDelete={removeTrack}
          />
        )}
      </IonContent>
    </IonPage>
  );
};

export default PlaylistDetail;
