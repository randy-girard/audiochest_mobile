import {
  IonButton,
  IonContent,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { AuthError } from '../api';
import { useAuth } from '../AuthContext';
import { usePlayer } from '../PlayerContext';
import PageHeader from '../components/PageHeader';
import { Instance } from '../types';
import { errorMessage } from '../utils';

const Settings: React.FC = () => {
  const { session, instances, activeId, switchTo, renameInstance, removeInstance, logout } = useAuth();
  const player = usePlayer();
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const [present] = useIonToast();
  const [busy, setBusy] = useState(false);

  const closeSliding = (event: React.MouseEvent) => {
    const sliding = (event.target as HTMLElement).closest('ion-item-sliding') as HTMLIonItemSlidingElement | null;
    if (sliding && sliding.close) sliding.close();
  };

  const activate = async (instance: Instance) => {
    if (instance.id === activeId && instance.token) return;
    if (!instance.token) {
      history.push(`/login?add=1&server=${encodeURIComponent(instance.server)}&email=${encodeURIComponent(instance.email)}`);
      return;
    }
    setBusy(true);
    try {
      player.stop();
      await switchTo(instance.id);
      present({ message: `Using ${instance.name}.`, duration: 1600, color: 'success' });
      history.replace('/tabs/tracks');
    } catch (error) {
      present({
        message: error instanceof AuthError ? error.message : errorMessage(error),
        duration: 2800,
        color: 'danger',
      });
      history.push(`/login?add=1&server=${encodeURIComponent(instance.server)}&email=${encodeURIComponent(instance.email)}`);
    } finally {
      setBusy(false);
    }
  };

  const rename = (instance: Instance) => {
    presentAlert({
      header: 'Rename instance',
      inputs: [{ name: 'name', value: instance.name, placeholder: 'Home, laptop, NAS…' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data) => {
            renameInstance(instance.id, String(data?.name || ''));
          },
        },
      ],
    });
  };

  const remove = (event: React.MouseEvent, instance: Instance) => {
    closeSliding(event);
    presentAlert({
      header: 'Remove instance?',
      message: `Remove “${instance.name}” from this phone? This revokes its saved token.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          handler: async () => {
            setBusy(true);
            try {
              if (instance.id === activeId) player.stop();
              await removeInstance(instance.id);
            } catch (error) {
              present({ message: errorMessage(error), duration: 2800, color: 'danger' });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    });
  };

  const signOut = async () => {
    setBusy(true);
    try {
      player.stop();
      await logout();
      history.replace('/login');
    } catch (error) {
      present({ message: errorMessage(error), duration: 2800, color: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonPage>
      <PageHeader title="Settings" backHref="/tabs/tracks" hideSettings />
      <IonContent>
        <p className="section-label">Current instance</p>
        <IonList>
          <IonItem>
            <IonLabel>
              <h2>Signed in as</h2>
              <p>{session?.email}</p>
            </IonLabel>
          </IonItem>
          <IonItem>
            <IonLabel>
              <h2>Server</h2>
              <p>{session?.server}</p>
            </IonLabel>
          </IonItem>
        </IonList>
        <div className="ion-padding-start ion-padding-end">
          <IonNote>
            Sign in uses the same email/password request as the desktop app. The password is sent once and is not saved. Each instance keeps its own token.
          </IonNote>
        </div>

        <p className="section-label">AudioChest instances</p>
        <IonList>
          {instances.map((instance) => (
            <IonItemSliding key={instance.id}>
              <IonItem button detail={false} disabled={busy || undefined} onClick={() => activate(instance)}>
                <IonLabel>
                  <h2>{instance.name}</h2>
                  <p>{instance.email}</p>
                  <p>{instance.server}</p>
                </IonLabel>
                <IonNote slot="end">{instance.id === activeId && instance.token ? 'Active' : instance.token ? 'Saved' : 'Signed out'}</IonNote>
              </IonItem>
              <IonItemOptions side="start">
                <IonItemOption color="medium" onClick={() => rename(instance)}>Rename</IonItemOption>
              </IonItemOptions>
              <IonItemOptions side="end">
                <IonItemOption color="danger" onClick={(event) => remove(event, instance)}>Remove</IonItemOption>
              </IonItemOptions>
            </IonItemSliding>
          ))}
        </IonList>

        <div className="ion-padding">
          <IonButton expand="block" onClick={() => history.push('/login?add=1')} disabled={busy || undefined}>
            Add instance
          </IonButton>
          <IonButton expand="block" color="medium" className="ion-margin-top" onClick={signOut} disabled={busy || undefined}>
            {busy ? 'Signing out…' : 'Sign out'}
          </IonButton>
          <IonNote className="ion-padding-top" style={{ display: 'block' }}>
            Sign out revokes this instance’s token. Other saved AudioChests stay on the phone. Swipe an instance left to remove it.
          </IonNote>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Settings;
