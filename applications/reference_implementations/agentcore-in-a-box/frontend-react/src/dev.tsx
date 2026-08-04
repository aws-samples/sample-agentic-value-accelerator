// dev.tsx — DEV-ONLY entry (served at /dev.html). Seeds a signed-in session with realistic
// mock data (see devSeed.ts) and mounts the real App, so every authed surface renders locally
// with no backend. NOT part of the production build (vite only emits index.html by default).
import React from 'react';
import { createRoot } from 'react-dom/client';
import { seedDev } from './devSeed';
import { App } from './App';
import { PersonaProvider } from './personaContext';
import './styles.css';

seedDev();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersonaProvider>
      <App />
    </PersonaProvider>
  </React.StrictMode>,
);
