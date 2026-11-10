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
  IonToolbar,
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
import { Artist } from '../types';
import { errorMessage, matchesQuery } from '../utils';

const Artists: React.FC = () => {
  const { wrap, session } = useAuth();
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const [present] = useIonToast();
  const presentRef = useRef(present);
  presentRef.current = present;
  const [artists, setArtists] = useState<Artist[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await wrap((api) => api.listArtists());
      if (rows) setArtists(rows);
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
    artists.filter((artist) => matchesQuery(artist.name, query))
  ), [artists, query]);

  const create = () => {
    presentAlert({
      header: 'New artist',
      inputs: [{ name: 'name', placeholder: 'Artist name' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create',
          handler: async (data) => {
            const name = String(data?.name || '').trim();
            if (!name) return false;
            try {
              const created = await wrap((api) => api.createArtist(name));
              if (created) {
                await load();
                history.push(`/tabs/artists/${created.id}`);
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

  const remove = (artist: Artist) => {
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
              present({ message: 'Artist deleted.', duration: 1600, color: 'medium' });
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
        title="Artists"
        below={(
          <IonToolbar className="search-toolbar">
            <IonSearchbar value={query} placeholder="Search artists" onIonChange={(event) => setQuery(event.detail.value || '')} />
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
          <EmptyState message="No artists yet. Tap + to add one." />
        ) : (
          <IonList>
            {filtered.map((artist) => (
              <SwipeRow
                key={artist.id}
                title={artist.name}
                subtitle={`${artist.album_count || 0} albums`}
                onOpen={() => history.push(`/tabs/artists/${artist.id}`)}
                onDelete={() => remove(artist)}
              />
            ))}
          </IonList>
        )}
        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={create} aria-label="New artist">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default Artists;
