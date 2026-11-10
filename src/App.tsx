import { IonApp, IonRouterOutlet, IonSpinner } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import React from 'react';
import { Redirect, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import AppUpdatePrompt from './components/AppUpdatePrompt';
import PlayerBar from './components/PlayerBar';
import { PlayerProvider } from './PlayerContext';
import Login from './pages/Login';
import Tabs from './pages/Tabs';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import './theme/variables.css';
import './App.css';

const AppRoutes: React.FC = () => {
  const { ready, session } = useAuth();

  if (!ready) {
    return (
      <div className="page-loading">
        <IonSpinner name="crescent" />
      </div>
    );
  }

  return (
    <IonReactRouter>
      <IonRouterOutlet>
        <Route path="/login">
          <Login />
        </Route>
        <Route path="/tabs">
          {session ? <Tabs /> : <Redirect to="/login" />}
        </Route>
        <Route exact path="/">
          <Redirect to={session ? '/tabs/tracks' : '/login'} />
        </Route>
      </IonRouterOutlet>
      {session ? <PlayerBar /> : null}
    </IonReactRouter>
  );
};

const App: React.FC = () => (
  <IonApp>
    <AuthProvider>
      <PlayerProvider>
        <AppRoutes />
        <AppUpdatePrompt />
      </PlayerProvider>
    </AuthProvider>
  </IonApp>
);

export default App;
