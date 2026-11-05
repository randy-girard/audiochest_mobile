import { IonBackButton, IonButton, IonButtons, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/react';
import { settingsOutline } from 'ionicons/icons';
import React from 'react';

interface PageHeaderProps {
  title: string;
  backHref?: string;
  extra?: React.ReactNode;
  hideSettings?: boolean;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, backHref, extra, hideSettings }) => {
  return (
    <IonHeader>
      <IonToolbar>
        {backHref && (
          <IonButtons slot="start">
            <IonBackButton defaultHref={backHref} />
          </IonButtons>
        )}
        <IonTitle>{title}</IonTitle>
        <IonButtons slot="end">
          {extra}
          {!hideSettings && (
            <IonButton routerLink="/tabs/settings" routerDirection="forward">
              <IonIcon slot="icon-only" icon={settingsOutline} />
            </IonButton>
          )}
        </IonButtons>
      </IonToolbar>
    </IonHeader>
  );
};

export default PageHeader;
