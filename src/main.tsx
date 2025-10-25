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
  
  // Register service worker for offline support - defer to avoid blocking
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }, 2000)
    })
  }
}

const root = document.getElementById('root')!
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)