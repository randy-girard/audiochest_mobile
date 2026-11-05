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
import { Album } from '../types';
import { errorMessage } from '../utils';

const AlbumDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const { wrap } = useAuth();
  const player = usePlayer();
  const [presentAlert] = useIonAlert();
  const [present] = useIonToast();
  const [album, setAlbum] = useState<Album | null>(null);
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
      const detail = await wrapRef.current((api) => api.getAlbum(Number(id)));
      if (detail) setAlbum(detail);
      else setError('Could not load this album.');
    } catch (err) {
      setError(errorMessage(err, 'Could not load this album.'));
      presentRef.current({ message: errorMessage(err), duration: 2800, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load(true);
  }, [load]);

  const rename = () => {
    if (!album) return;
    presentAlert({
      header: 'Rename album',
      inputs: [{ name: 'name', value: album.name, placeholder: 'Album name' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            const name = String(data?.name || '').trim();
            if (!name) return false;
            try {
              await wrap((api) => api.updateAlbum(album.id, name));
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
    if (!album) return;
    presentAlert({
      header: 'Delete album?',
      message: `Delete “${album.name}”? Songs stay in the library.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          handler: async () => {
            try {
              const ok = await wrap(async (api) => {
                await api.deleteAlbum(album.id);
                return true;
              });
              if (!ok) return;
              history.replace('/tabs/albums');
            } catch (err) {
              present({ message: errorMessage(err), duration: 2800, color: 'danger' });
            }
          },
        },
      ],
    });
  };

  const tracks = album?.tracks || [];

  return (
    <IonPage>
      <PageHeader
        title={album?.name || 'Album'}
        backHref="/tabs/albums"
        extra={(
          <>
            <IonButton onClick={() => tracks.length && player.playTracks(tracks, 0)} disabled={!tracks.length || undefined}>Play</IonButton>
            <IonButton onClick={rename} disabled={!album || undefined}>Edit</IonButton>
            <IonButton color="danger" onClick={destroy} disabled={!album || undefined}>Delete</IonButton>
          </>
        )}
      />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={async (event) => { await load(); event.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        {album?.artist_name && !loading && <p className="detail-subtitle">{album.artist_name}</p>}
        {loading ? (
          <div className="page-loading"><IonSpinner name="crescent" /></div>
        ) : error ? (
          <div className="empty-state">
            <p>{error}</p>
            <IonButton onClick={() => { setLoading(true); load(); }}>Try again</IonButton>
          </div>
        ) : (
          <TrackList tracks={tracks} empty="No songs on this album yet." onReload={load} />
        )}
      </IonContent>
    </IonPage>
  );
};

export default AlbumDetail;
