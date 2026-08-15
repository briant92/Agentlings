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
//
// "Delays rather than blocks" was a claim this file made and could not keep
// (D-185). `loadLooks` awaits a fetch with no timeout and, until the same
// entry fixed it, an `img.decode()` that in some conditions never answers at
// all — and the whole first render waited on it, so the app was a blank page
// with nothing written on it anywhere. The bound below is what makes the
// sentence above true whatever `loadLooks` grows to await: worlds are worth
// waiting a moment for and are never worth an app that never appears.
const BOOT_WAIT_MS = 10_000;

const mount = () => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

void Promise.race([
  loadLooks(),
  new Promise((resolve) => setTimeout(resolve, BOOT_WAIT_MS)),
]).then(mount);
