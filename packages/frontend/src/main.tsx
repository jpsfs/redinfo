import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './registerSW';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Last, and after the app is mounted: the shell it caches should be the one that
// rendered, and nothing about starting up should wait on it.
registerServiceWorker();
