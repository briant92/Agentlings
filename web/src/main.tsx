import '@fontsource/press-start-2p';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initCrt } from './ui/crt';
import { loadLooks } from './world/looks';

initCrt();

// Installed packs are read before the first render rather than during it: a
// level card is drawn synchronously and cannot wait on a fetch. loadLooks
// never rejects, so a server that is down delays the boot rather than
// blocking it, and the app comes up with its four built-in worlds.
void loadLooks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
