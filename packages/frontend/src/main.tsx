import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './registerSW';
import { bridgeOAuthRedirectToHashRoute } from './oauthRedirectBridge';

// Before mounting: the router must see the corrected location on its very
// first render, or it resolves the wrong route and bounces to login.
bridgeOAuthRedirectToHashRoute();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Last, and after the app is mounted: the shell it caches should be the one that
// rendered, and nothing about starting up should wait on it.
registerServiceWorker();
