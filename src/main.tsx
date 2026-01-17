import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize connection manager to suppress extension errors
import { connectionManager } from '@/lib/connectionFix'

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