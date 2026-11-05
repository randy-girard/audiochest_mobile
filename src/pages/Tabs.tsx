import { IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react';
import { albums, list, musicalNotes, people } from 'ionicons/icons';
import React from 'react';
import { Redirect, Route } from 'react-router-dom';
import AlbumDetail from './AlbumDetail';
import Albums from './Albums';
import ArtistDetail from './ArtistDetail';
import Artists from './Artists';
import PlaylistDetail from './PlaylistDetail';
import Playlists from './Playlists';
import Settings from './Settings';
import Tracks from './Tracks';

const Tabs: React.FC = () => {
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route exact path="/tabs/tracks" component={Tracks} />
        <Route exact path="/tabs/albums" component={Albums} />
        <Route exact path="/tabs/albums/:id" component={AlbumDetail} />
        <Route exact path="/tabs/playlists" component={Playlists} />
        <Route exact path="/tabs/playlists/:id" component={PlaylistDetail} />
        <Route exact path="/tabs/artists" component={Artists} />
        <Route exact path="/tabs/artists/:id" component={ArtistDetail} />
        <Route exact path="/tabs/settings" component={Settings} />
        <Route exact path="/tabs">
          <Redirect to="/tabs/tracks" />
        </Route>
      </IonRouterOutlet>
      <IonTabBar slot="bottom">
        <IonTabButton tab="tracks" href="/tabs/tracks">
          <IonIcon icon={musicalNotes} />
          <IonLabel>Tracks</IonLabel>
        </IonTabButton>
        <IonTabButton tab="albums" href="/tabs/albums">
          <IonIcon icon={albums} />
          <IonLabel>Albums</IonLabel>
        </IonTabButton>
        <IonTabButton tab="playlists" href="/tabs/playlists">
          <IonIcon icon={list} />
          <IonLabel>Playlists</IonLabel>
        </IonTabButton>
        <IonTabButton tab="artists" href="/tabs/artists">
          <IonIcon icon={people} />
          <IonLabel>Artists</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
};

export default Tabs;
