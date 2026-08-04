import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PersonaProvider } from './personaContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersonaProvider>
      <App />
    </PersonaProvider>
  </React.StrictMode>,
);
