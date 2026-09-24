import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadRuntimeConfig } from './runtimeConfig'

// Load the Foundry-injected runtime-config.json (backend + console-service URLs
// + API key + tenant) BEFORE importing App. App and its transitive api/*
// modules read these values in module-level consts at import time, so the
// config must be on window first. Falls back to VITE_* env when no
// runtime-config.json is served (standalone `npm run dev`).
loadRuntimeConfig().finally(async () => {
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
