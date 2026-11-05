import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import React, { useEffect, useMemo, useState } from 'react';
import { Redirect, useHistory, useLocation } from 'react-router-dom';
import { AuthError } from '../api';
import { useAuth } from '../AuthContext';
import { errorMessage } from '../utils';

const Login: React.FC = () => {
  const { login, switchTo, session, instances, lastServer, lastEmail } = useAuth();
  const history = useHistory();
  const location = useLocation();
  const [present] = useIonToast();
  const params = new URLSearchParams(location.search);
  const adding = params.get('add') === '1';
  const [server, setServer] = useState(params.get('server') || (adding ? '' : lastServer));
  const [email, setEmail] = useState(params.get('email') || (adding ? '' : lastEmail));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(location.search);
    const nextServer = next.get('server');
    const nextEmail = next.get('email');
    if (nextServer) setServer(nextServer);
    if (nextEmail) setEmail(nextEmail);
  }, [location.search]);

  const saved = useMemo(() => (
    adding ? [] : instances
  ), [adding, instances]);

  const finish = (isAdding: boolean) => {
    history.replace(isAdding ? '/tabs/settings' : '/tabs/tracks');
  };

  if (session && !adding && !busy) {
    return <Redirect to="/tabs/tracks" />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const isAdding = adding || new URLSearchParams(window.location.search).get('add') === '1';
    setBusy(true);
    try {
      await login(server, email, password);
      setPassword('');
      finish(isAdding);
    } catch (error) {
      present({ message: errorMessage(error, 'Could not sign in.'), duration: 2800, color: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const selectSaved = async (id: string, hasToken: boolean, nextServer: string, nextEmail: string) => {
    if (!hasToken) {
      setServer(nextServer);
      setEmail(nextEmail);
      return;
    }
    setBusy(true);
    try {
      await switchTo(id);
      finish(adding);
    } catch (error) {
      setServer(nextServer);
      setEmail(nextEmail);
      present({
        message: error instanceof AuthError ? error.message : errorMessage(error, 'Sign in again for this instance.'),
        duration: 2800,
        color: 'warning',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{adding ? 'Add instance' : 'AudioChest'}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="login-hero">
          <span className="login-mark">AC</span>
          <h1>{adding ? 'Add an AudioChest' : 'Sign in'}</h1>
          <p>
            {adding
              ? `Currently using ${session?.email} on ${session?.server}. Sign in to another server with the same email/password flow as the desktop app.`
              : 'Enter the server URL, email, and password. The password is sent once and is not saved.'}
          </p>
        </div>

        {saved.length > 0 && (
          <>
            <p className="section-label">Saved instances</p>
            <IonList>
              {saved.map((instance) => (
                <IonItem
                  key={instance.id}
                  button
                  detail={false}
                  disabled={busy || undefined}
                  onClick={() => selectSaved(instance.id, !!instance.token, instance.server, instance.email)}
                >
                  <IonLabel>
                    <h2>{instance.name}</h2>
                    <p>{instance.server}</p>
                  </IonLabel>
                  <IonNote slot="end">{instance.token ? 'Saved' : 'Sign in'}</IonNote>
                </IonItem>
              ))}
            </IonList>
          </>
        )}

        <form onSubmit={submit}>
          <IonItem>
            <IonLabel position="stacked">Server</IonLabel>
            <IonInput
              type="url"
              inputmode="url"
              value={server}
              placeholder="https://your-server"
              onIonChange={(event) => setServer(String(event.detail.value || ''))}
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Email</IonLabel>
            <IonInput
              type="email"
              value={email}
              autocomplete="username"
              placeholder="you@example.com"
              onIonChange={(event) => setEmail(String(event.detail.value || ''))}
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Password</IonLabel>
            <IonInput
              type="password"
              value={password}
              autocomplete="current-password"
              onIonChange={(event) => setPassword(String(event.detail.value || ''))}
            />
          </IonItem>
          <IonNote className="ion-padding-start ion-padding-top">
            On a phone, use the computer’s LAN URL, not localhost.
          </IonNote>
          <IonButton expand="block" type="submit" className="ion-margin-top" disabled={busy || undefined}>
            {busy ? 'Signing in…' : adding ? 'Add and switch' : 'Sign in'}
          </IonButton>
          {adding && (
            <IonButton expand="block" fill="clear" type="button" onClick={() => history.replace('/tabs/settings')}>
              Cancel
            </IonButton>
          )}
        </form>
      </IonContent>
    </IonPage>
  );
};

export default Login;
