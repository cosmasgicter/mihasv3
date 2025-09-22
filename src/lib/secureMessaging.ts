// Secure cross-origin messaging utilities
import { validateOrigin, sanitizeForLog } from './security'

const ALLOWED_ORIGINS = [
  'https://mihas-katc.com',
  'https://www.mihas-katc.com',
  'https://katc.edu.zm',
  'https://mihas.edu.zm',
  'https://application.mihas.edu.zm',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177'
]

export const setupSecureMessageListener = (callback: (data: any) => void) => {
  const messageHandler = (event: MessageEvent) => {
    // Verify origin
    if (!validateOrigin(event.origin, ALLOWED_ORIGINS)) {
      console.warn('Message from unauthorized origin:', sanitizeForLog(event.origin))
      return
    }
    
    // Validate message structure
    if (!event.data || typeof event.data !== 'object') {
      console.warn('Invalid message format')
      return
    }
    
    callback(event.data)
  }
  
  window.addEventListener('message', messageHandler)
  
  return () => {
    window.removeEventListener('message', messageHandler)
  }
}

export const sendSecureMessage = (targetWindow: Window, data: any, targetOrigin: string) => {
  // Always verify origin before sending
  if (!targetOrigin || targetOrigin === '*') {
    throw new Error('Target origin must be specified')
  }
  
  if (!validateOrigin(targetOrigin, ALLOWED_ORIGINS)) {
    throw new Error('Unauthorized target origin')
  }
  
  // Sanitize data before sending
  const sanitizedData = {
    ...data,
    timestamp: Date.now()
  }
  
  targetWindow.postMessage(sanitizedData, targetOrigin)
}