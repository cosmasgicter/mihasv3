import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Initialize connection manager to suppress extension errors
import { connectionManager } from '@/lib/connectionFix'

// Handle stale chunk errors after deployment (must run before app mounts)
// When a new build deploys, old hashed chunks no longer exist on the CDN.
// Browsers with a cached index.html still reference old chunk names, causing
// MIME type errors (HTML served instead of JS) or fetch failures.
if (typeof window !== 'undefined') {
  const RELOAD_KEY = 'mihas_chunk_reload'
  const RELOAD_TS_KEY = 'mihas_chunk_reload_ts'

  const shouldReload = (): boolean => {
    const lastReload = Number(sessionStorage.getItem(RELOAD_TS_KEY) || '0')
    // Only allow one auto-reload per 30 seconds to prevent loops
    return Date.now() - lastReload > 30_000
  }

  const doReload = () => {
    if (!shouldReload()) return
    sessionStorage.setItem(RELOAD_KEY, '1')
    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()))
    window.location.reload()
  }

  // Catch Vite's preload error event (fires for modulepreload link failures)
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    doReload()
  })

  // Catch dynamic import failures and MIME type errors at the window level
  window.addEventListener('error', (e) => {
    const msg = e.message || ''
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('MIME type') ||
      msg.includes('Expected a JavaScript module script')
    ) {
      e.preventDefault()
      doReload()
    }
  }, true)
}

// Suppress browser extension errors that interfere with the application
if (typeof window !== 'undefined') {
  connectionManager.suppressExtensionErrors()
  
  // Force light mode - prevent any dark mode
  document.documentElement.classList.remove('dark')
  document.documentElement.classList.add('light')
  document.documentElement.style.colorScheme = 'light'
  document.documentElement.setAttribute('data-theme', 'light')
  document.body.classList.remove('dark')
  document.body.classList.add('light')
  document.body.style.colorScheme = 'light'
  
  // Register service worker for offline support (deferred)
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    // Defer until after page load to not block initial render
    setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }, 3000)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)