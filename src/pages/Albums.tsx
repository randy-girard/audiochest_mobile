import {
  IonContent,
  IonList,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  IonToolbar,
  useIonAlert,
  useIonToast,
  useIonViewWillEnter,
} from '@ionic/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import SwipeRow from '../components/SwipeRow';
import { Album } from '../types';
import { errorMessage, matchesQuery } from '../utils';

const Albums: React.FC = () => {
  const { wrap, session } = useAuth();
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const [present] = useIonToast();
  const presentRef = useRef(present);
  presentRef.current = present;
  const [albums, setAlbums] = useState<Album[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await wrap((api) => api.listAlbums());
      if (rows) setAlbums(rows);
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
    albums.filter((album) => matchesQuery(album.name, query) || matchesQuery(album.artist_name, query))
  ), [albums, query]);

  const remove = (album: Album) => {
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
              present({ message: 'Album deleted.', duration: 1600, color: 'medium' });
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
      <PageHeader
        title="Albums"
        below={(
          <IonToolbar className="search-toolbar">
            <IonSearchbar value={query} placeholder="Search albums" onIonChange={(event) => setQuery(event.detail.value || '')} />
          </IonToolbar>
        )}
      />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={async (event) => { await load(); event.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        {loading ? (
          <div className="page-loading"><IonSpinner name="crescent" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No albums yet." />
        ) : (
          <IonList>
            {filtered.map((album) => (
              <SwipeRow
                key={album.id}
                title={album.name}
                subtitle={album.artist_name}
                onOpen={() => history.push(`/tabs/albums/${album.id}`)}
                onDelete={() => remove(album)}
              />
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Albums;
