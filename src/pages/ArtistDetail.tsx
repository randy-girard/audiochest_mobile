import {
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
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
import { Artist } from '../types';
import { errorMessage } from '../utils';

const ArtistDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const { wrap } = useAuth();
  const player = usePlayer();
  const [presentAlert] = useIonAlert();
  const [present] = useIonToast();
  const [artist, setArtist] = useState<Artist | null>(null);
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
      const detail = await wrapRef.current((api) => api.getArtist(Number(id)));
      if (detail) setArtist(detail);
      else setError('Could not load this artist.');
    } catch (err) {
      setError(errorMessage(err, 'Could not load this artist.'));
      presentRef.current({ message: errorMessage(err), duration: 2800, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load(true);
  }, [load]);

  const rename = () => {
    if (!artist) return;
    presentAlert({
      header: 'Rename artist',
      inputs: [{ name: 'name', value: artist.name, placeholder: 'Artist name' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            const name = String(data?.name || '').trim();
            if (!name) return false;
            try {
              await wrap((api) => api.updateArtist(artist.id, name));
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

  const addAlbum = () => {
    if (!artist) return;
    presentAlert({
      header: 'New album',
      inputs: [{ name: 'name', placeholder: 'Album name' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create',
          handler: async (data) => {
            const name = String(data?.name || '').trim();
            if (!name) return false;
            try {
              const created = await wrap((api) => api.createAlbum(artist.id, name));
              if (created) history.push(`/tabs/albums/${created.id}`);
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
    if (!artist) return;
    presentAlert({
      header: 'Delete artist?',
      message: `Delete “${artist.name}” and their albums? Songs stay in the library.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          handler: async () => {
            try {
              const ok = await wrap(async (api) => {
                await api.deleteArtist(artist.id);
                return true;
              });
              if (!ok) return;
              history.replace('/tabs/artists');
            } catch (err) {
              present({ message: errorMessage(err), duration: 2800, color: 'danger' });
            }
          },
        },
      ],
    });
  };

  const tracks = artist?.tracks || [];
  const albums = artist?.albums || [];

  return (
    <IonPage>
      <PageHeader
        title={artist?.name || 'Artist'}
        backHref="/tabs/artists"
        extra={(
          <>
            <IonButton onClick={() => tracks.length && player.playTracks(tracks, 0)} disabled={!tracks.length || undefined}>Play</IonButton>
            <IonButton onClick={addAlbum} disabled={!artist || undefined}>Album</IonButton>
            <IonButton onClick={rename} disabled={!artist || undefined}>Edit</IonButton>
            <IonButton color="danger" onClick={destroy} disabled={!artist || undefined}>Delete</IonButton>
          </>
        )}
      />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={async (event) => { await load(); event.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        {loading ? (
          <div className="page-loading"><IonSpinner name="crescent" /></div>
        ) : error ? (
          <div className="empty-state">
            <p>{error}</p>
            <IonButton onClick={() => { setLoading(true); load(); }}>Try again</IonButton>
          </div>
        ) : (
          <>
            {albums.length > 0 && (
              <>
                <p className="section-label">Albums</p>
                <IonList>
                  {albums.map((album) => (
                    <IonItem key={album.id} button detail routerLink={`/tabs/albums/${album.id}`}>
                      <IonLabel>{album.name}</IonLabel>
                    </IonItem>
                  ))}
                </IonList>
              </>
            )}
            <p className="section-label">Songs</p>
            <TrackList tracks={tracks} empty="No songs for this artist yet." onReload={load} />
          </>
        )}
      </IonContent>
    </IonPage>
  );
};

export default ArtistDetail;
