import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize connection manager to suppress extension errors
import { connectionManager } from '@/lib/connectionFix'

// Suppress browser extension errors that interfere with the application
if (typeof window !== 'undefined') {
  connectionManager.suppressExtensionErrors()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)