import { Capacitor } from '@capacitor/core';
import {
  IonButton,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonToggle,
  useIonToast,
} from '@ionic/react';
import React, { useEffect, useState } from 'react';
import {
  APP_VERSION_CODE,
  APP_VERSION_NAME,
  RemoteRelease,
  checkForAppUpdate,
  installRelease,
  installedVersion,
  readAutoUpdate,
  readDismissedUpdate,
  writeAutoUpdate,
} from '../appUpdates';
import { errorMessage } from '../utils';

const AppUpdateSection: React.FC = () => {
  const [present] = useIonToast();
  const [version, setVersion] = useState(`${APP_VERSION_NAME} (${APP_VERSION_CODE})`);
  const [auto, setAuto] = useState(() => readAutoUpdate(window.localStorage));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [release, setRelease] = useState<RemoteRelease | null>(null);
  const [newer, setNewer] = useState(false);
  const android = Capacitor.getPlatform() === 'android';

  useEffect(() => {
    installedVersion()
      .then((info) => setVersion(`${info.versionName} (${info.versionCode})`))
      .catch(() => undefined);
  }, []);

  const check = async () => {
    setBusy(true);
    try {
      const local = await installedVersion();
      setVersion(`${local.versionName} (${local.versionCode})`);
      const result = await checkForAppUpdate({
        manual: true,
        local,
        autoCheck: readAutoUpdate(window.localStorage),
        dismissed: readDismissedUpdate(window.localStorage),
      });
      setRelease(result.remote);
      setNewer(result.newer);
      if (result.error) setMessage(result.error);
      else if (result.newer && result.remote) setMessage(`Version ${result.remote.versionName} is available.`);
      else setMessage('This install is up to date.');
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    if (!release) return;
    setBusy(true);
    try {
      await installRelease(release.apkUrl);
    } catch (error) {
      present({ message: errorMessage(error), duration: 4000, color: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="section-label">App updates</p>
      <IonList>
        <IonItem>
          <IonLabel>
            <h2>Installed version</h2>
            <p>{version}</p>
          </IonLabel>
        </IonItem>
        <IonItem>
          <IonLabel>Check for updates automatically</IonLabel>
          <IonToggle
            checked={auto}
            onIonChange={(event) => {
              const enabled = event.detail.checked;
              setAuto(enabled);
              writeAutoUpdate(window.localStorage, enabled);
            }}
          />
        </IonItem>
      </IonList>
      <div className="ion-padding">
        <IonButton expand="block" onClick={check} disabled={busy || undefined}>
          {busy ? 'Working…' : 'Check for updates'}
        </IonButton>
        {newer && release && android ? (
          <IonButton expand="block" className="ion-margin-top" onClick={install} disabled={busy || undefined}>
            Download and install
          </IonButton>
        ) : null}
        {newer && release && !android ? (
          <IonButton expand="block" className="ion-margin-top" href={release.pageUrl} target="_blank" rel="noreferrer">
            View release
          </IonButton>
        ) : null}
        {message ? (
          <IonNote className="ion-padding-top" style={{ display: 'block' }}>{message}</IonNote>
        ) : null}
        <IonNote className="ion-padding-top" style={{ display: 'block' }}>
          Updates come from GitHub releases tagged v1.2.3. Each release records versionName and versionCode. Android asks you to confirm before it replaces this install.
        </IonNote>
      </div>
    </>
  );
};

export default AppUpdateSection;
