import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Self-heal stale-chunk-after-deploy: when a lazily-imported chunk 404s because a
// new build replaced its hash while the tab was open, Vite fires `vite:preloadError`.
// Reload once (guarded against loops) to pull the fresh index.html + assets.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const KEY = 'vite:preloadError:lastReload'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(KEY, String(Date.now()))
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
