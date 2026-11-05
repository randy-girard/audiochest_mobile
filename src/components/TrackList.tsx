import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonModal,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonToast,
  useIonViewDidEnter,
} from '@ionic/react';
import { pause, playOutline } from 'ionicons/icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import { usePlayer } from '../PlayerContext';
import { sameTrackQueue } from '../playerAdvance';
import { schedulePlayingTrackScroll, scrollPlayingTrackIntoView } from '../trackScroll';
import { Playlist, Track } from '../types';
import { albumNames, displayTitle, errorMessage, playlistNames } from '../utils';
import EmptyState from './EmptyState';

interface TrackListProps {
  tracks: Track[];
  empty: string;
  onReload: () => Promise<void> | void;
  confirmMessage?: (track: Track) => string;
  onDelete?: (track: Track) => Promise<void>;
}

const TrackList: React.FC<TrackListProps> = ({ tracks, empty, onReload, confirmMessage, onDelete }) => {
  const { wrap } = useAuth();
  const player = usePlayer();
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();
  const [editing, setEditing] = useState<Track | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [form, setForm] = useState({
    title: '',
    track_title: '',
    artist_name: '',
    album_name: '',
    playlist_ids: [] as number[],
  });

  const closeSliding = (event: React.MouseEvent) => {
    const sliding = (event.target as HTMLElement).closest('ion-item-sliding') as HTMLIonItemSlidingElement | null;
    if (sliding && sliding.close) sliding.close();
  };

  const playAt = (index: number) => {
    const track = tracks[index];
    const isCurrent = player.current?.id === track.id;
    if (isCurrent && sameTrackQueue(player.queue, tracks)) {
      player.toggle();
      return;
    }
    skipScrollRef.current = true;
    player.playTracks(tracks, index);
  };

  const requestDelete = (event: React.MouseEvent, track: Track) => {
    closeSliding(event);
    const message = confirmMessage
      ? confirmMessage(track)
      : `Delete “${displayTitle(track)}” from the library? This cannot be undone.`;
    presentAlert({
      header: 'Delete track?',
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          handler: async () => {
            try {
              if (onDelete) {
                await onDelete(track);
              } else {
                const ok = await wrap(async (api) => {
                  await api.deleteTrack(track.id);
                  return true;
                });
                if (!ok) return;
              }
              presentToast({ message: 'Deleted.', duration: 1600, color: 'medium' });
              await onReload();
            } catch (error) {
              presentToast({ message: errorMessage(error), duration: 2800, color: 'danger' });
            }
          },
        },
      ],
    });
  };

  const openEdit = async (event: React.MouseEvent, track: Track) => {
    closeSliding(event);
    const lists = await wrap((api) => api.listPlaylists());
    setPlaylists(lists || []);
    setForm({
      title: track.title || '',
      track_title: track.track_title || '',
      artist_name: track.artist_name || '',
      album_name: track.album_name || '',
      playlist_ids: track.playlist_ids || [],
    });
    setEditing(track);
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const saved = await wrap((api) => api.updateTrack(editing.id, form));
      if (saved === undefined) return;
      presentToast({ message: 'Track saved.', duration: 1600, color: 'success' });
      setEditing(null);
      await onReload();
    } catch (error) {
      presentToast({ message: errorMessage(error), duration: 2800, color: 'danger' });
    }
  };

  const togglePlaylist = (id: number) => {
    setForm((current) => ({
      ...current,
      playlist_ids: current.playlist_ids.includes(id)
        ? current.playlist_ids.filter((item) => item !== id)
        : current.playlist_ids.concat(id),
    }));
  };

  const items = useMemo(() => tracks, [tracks]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const skipScrollRef = useRef(false);
  const currentId = player.current?.id;

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return undefined;
    }
    return schedulePlayingTrackScroll(listRef.current);
  }, [currentId, items]);

  useIonViewDidEnter(() => {
    void scrollPlayingTrackIntoView(listRef.current);
  });

  if (!items.length) return <EmptyState message={empty} />;

  return (
    <>
      <div className="track-list" ref={listRef}>
      <IonList>
        {items.map((track, index) => {
          const isCurrent = player.current?.id === track.id;
          return (
          <IonItemSliding key={track.id} data-playing-track={isCurrent ? 'true' : undefined}>
            <IonItem
              button
              detail={false}
              className={isCurrent ? 'track-playing' : undefined}
              data-playing-track={isCurrent ? 'true' : undefined}
              data-track-id={String(track.id)}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                playAt(index);
              }}
            >
              <IonIcon icon={isCurrent && player.playing ? pause : playOutline} slot="start" color="primary" />
              <IonLabel>
                <h2>{displayTitle(track)}</h2>
                <p>{[track.artist_name, track.album_name || albumNames(track).split(', ')[0], playlistNames(track)].filter(Boolean).join(' · ')}</p>
              </IonLabel>
            </IonItem>
            <IonItemOptions side="start">
              <IonItemOption color="medium" onClick={(event) => openEdit(event, track)}>
                Edit
              </IonItemOption>
            </IonItemOptions>
            <IonItemOptions side="end">
              <IonItemOption color="danger" onClick={(event) => requestDelete(event, track)}>
                Delete
              </IonItemOption>
            </IonItemOptions>
          </IonItemSliding>
          );
        })}
      </IonList>
      </div>

      <IonModal isOpen={!!editing} onDidDismiss={() => setEditing(null)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Edit track</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setEditing(null)}>Close</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <IonItem>
            <IonLabel position="stacked">Title</IonLabel>
            <IonInput value={form.title} onIonChange={(event) => setForm({ ...form, title: String(event.detail.value || '') })} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Track</IonLabel>
            <IonInput value={form.track_title} onIonChange={(event) => setForm({ ...form, track_title: String(event.detail.value || '') })} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Artist</IonLabel>
            <IonInput value={form.artist_name} onIonChange={(event) => setForm({ ...form, artist_name: String(event.detail.value || '') })} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Album</IonLabel>
            <IonInput value={form.album_name} onIonChange={(event) => setForm({ ...form, album_name: String(event.detail.value || '') })} />
          </IonItem>
          {playlists.length > 0 && (
            <>
              <p className="form-label">Playlists</p>
              {playlists.map((playlist) => (
                <IonItem key={playlist.id} button detail={false} onClick={() => togglePlaylist(playlist.id)}>
                  <IonLabel>{playlist.name}</IonLabel>
                  <span className="check">{form.playlist_ids.includes(playlist.id) ? '✓' : ''}</span>
                </IonItem>
              ))}
            </>
          )}
          <IonButton expand="block" className="ion-margin-top" onClick={saveEdit}>
            Save
          </IonButton>
        </IonContent>
      </IonModal>
    </>
  );
};

export default TrackList;
