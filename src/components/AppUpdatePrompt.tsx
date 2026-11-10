import { Capacitor } from '@capacitor/core';
import { useIonAlert, useIonToast } from '@ionic/react';
import React, { useEffect } from 'react';
import {
  checkForAppUpdate,
  installRelease,
  installedVersion,
  readAutoUpdate,
  readDismissedUpdate,
  updateIdentity,
  writeDismissedUpdate,
} from '../appUpdates';
import { errorMessage } from '../utils';

const AppUpdatePrompt: React.FC = () => {
  const [presentAlert] = useIonAlert();
  const [present] = useIonToast();

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return undefined;
    if (!readAutoUpdate(window.localStorage)) return undefined;
    let cancelled = false;

    const look = async () => {
      const local = await installedVersion();
      if (cancelled) return;
      const result = await checkForAppUpdate({
        manual: false,
        local,
        autoCheck: true,
        dismissed: readDismissedUpdate(window.localStorage),
      });
      if (cancelled || !result.offer || !result.remote) return;
      const remote = result.remote;
      presentAlert({
        header: 'Update available',
        message: `Version ${remote.versionName} is ready to install.`,
        buttons: [
          {
            text: 'Later',
            role: 'cancel',
            handler: () => writeDismissedUpdate(window.localStorage, updateIdentity(remote)),
          },
          {
            text: 'Install',
            handler: () => {
              installRelease(remote.apkUrl).catch((error) => {
                present({ message: errorMessage(error), duration: 4000, color: 'danger' });
              });
            },
          },
        ],
      });
    };

    look().catch(() => {
      // A failed automatic check stays quiet. Settings still has a manual check.
    });

    return () => {
      cancelled = true;
    };
  }, [present, presentAlert]);

  return null;
};

export default AppUpdatePrompt;
