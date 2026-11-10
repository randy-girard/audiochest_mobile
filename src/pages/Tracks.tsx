import {
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  IonToolbar,
  useIonToast,
  useIonViewWillEnter,
} from '@ionic/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import PageHeader from '../components/PageHeader';
import TrackList from '../components/TrackList';
import { Track } from '../types';
import { displayTitle, errorMessage, matchesQuery } from '../utils';

const Tracks: React.FC = () => {
  const { wrap, session } = useAuth();
  const [present] = useIonToast();
  const presentRef = useRef(present);
  presentRef.current = present;
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await wrap((api) => api.listTracks());
      if (rows) setTracks(rows);
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

  const filtered = useMemo(() => {
    return tracks.filter((track) => (
      matchesQuery(displayTitle(track), query) ||
      matchesQuery(track.artist_name, query) ||
      matchesQuery(track.album_name, query)
    ));
  }, [tracks, query]);

  const refresh = async (event: CustomEvent) => {
    await load();
    (event.detail as { complete: () => void }).complete();
  };

  return (
    <IonPage>
      <PageHeader
        title="Tracks"
        below={(
          <IonToolbar className="search-toolbar">
            <IonSearchbar value={query} placeholder="Search tracks" onIonChange={(event) => setQuery(event.detail.value || '')} />
          </IonToolbar>
        )}
      />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={refresh}>
          <IonRefresherContent />
        </IonRefresher>
        {loading ? (
          <div className="page-loading"><IonSpinner name="crescent" /></div>
        ) : (
          <TrackList tracks={filtered} empty="No tracks yet." onReload={load} />
        )}
      </IonContent>
    </IonPage>
  );
};

export default Tracks;
