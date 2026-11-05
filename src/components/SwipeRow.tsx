import { IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel } from '@ionic/react';
import React from 'react';

interface SwipeRowProps {
  title: string;
  subtitle?: string;
  onOpen: () => void;
  onDelete: () => void;
}

const SwipeRow: React.FC<SwipeRowProps> = ({ title, subtitle, onOpen, onDelete }) => {
  const closeSliding = (event: React.MouseEvent) => {
    const sliding = (event.target as HTMLElement).closest('ion-item-sliding') as HTMLIonItemSlidingElement | null;
    if (sliding && sliding.close) sliding.close();
  };

  return (
    <IonItemSliding>
      <IonItem button detail onClick={onOpen}>
        <IonLabel>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </IonLabel>
      </IonItem>
      <IonItemOptions side="end">
        <IonItemOption
          color="danger"
          onClick={(event) => {
            closeSliding(event);
            onDelete();
          }}
        >
          Delete
        </IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  );
};

export default SwipeRow;
