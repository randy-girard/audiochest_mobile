import {
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonList,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  useIonAlert,
  useIonToast,
  useIonViewWillEnter,
} from '@ionic/react';
import { add } from 'ionicons/icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import SwipeRow from '../components/SwipeRow';
import { Playlist } from '../types';
import { errorMessage, matchesQuery } from '../utils';

const Playlists: React.FC = () => {
  const { wrap, session } = useAuth();
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const [present] = useIonToast();
  const presentRef = useRef(present);
  presentRef.current = present;
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await wrap((api) => api.listPlaylists());
      if (rows) setPlaylists(rows);
    } catch (error) {
      presentRef.current({ message: errorMessage(error), duration: 2800, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [wrap]);

  useIonViewWillEnter(() => {
    load();
  });

  useEffect(() => {
    load();
  }, [session?.server, session?.token, load]);

  const filtered = useMemo(() => (
    playlists.filter((playlist) => matchesQuery(playlist.name, query))
  ), [playlists, query]);

  const create = () => {
    presentAlert({
      header: 'New playlist',
      inputs: [{ name: 'name', placeholder: 'Playlist name' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create',
          handler: async (data) => {
            const name = String(data?.name || '').trim();
            if (!name) {
              present({ message: 'Enter a playlist name.', duration: 2000, color: 'warning' });
              return false;
            }
            try {
              const created = await wrap((api) => api.createPlaylist(name));
              if (created) {
                present({ message: 'Playlist created.', duration: 1600, color: 'success' });
                await load();
                history.push(`/tabs/playlists/${created.id}`);
              }
            } catch (error) {
              present({ message: errorMessage(error), duration: 2800, color: 'danger' });
            }
            return true;
          },
        },
      ],
    });
  };

  const remove = (playlist: Playlist) => {
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
              present({ message: 'Playlist deleted.', duration: 1600, color: 'medium' });
              await load();
            } catch (error) {
              present({ message: errorMessage(error), duration: 2800, color: 'danger' });
            }
          },
        },
      ],
    });
  };

  return (
    <IonPage>
      <PageHeader title="Playlists" />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={async (event) => { await load(); event.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        <IonSearchbar value={query} placeholder="Search playlists" onIonChange={(event) => setQuery(event.detail.value || '')} />
        {loading ? (
          <div className="page-loading"><IonSpinner name="crescent" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No playlists yet. Tap + to create one." />
        ) : (
          <IonList>
            {filtered.map((playlist) => (
              <SwipeRow
                key={playlist.id}
                title={playlist.name}
                subtitle={`${playlist.track_count || 0} tracks`}
                onOpen={() => history.push(`/tabs/playlists/${playlist.id}`)}
                onDelete={() => remove(playlist)}
              />
            ))}
          </IonList>
        )}
        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={create} aria-label="New playlist">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default Playlists;
