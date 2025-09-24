/**
 * Extension Conflict Prevention Utility
 * Prevents browser extension conflicts and connection errors
 */

// Prevent extension injection conflicts
export const preventExtensionConflicts = () => {
  if (typeof window === 'undefined') return

  // Disable common extension injection points
  const preventInjection = () => {
    // Block common extension script injection
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element
            
            // Remove suspicious extension scripts
            if (element.tagName === 'SCRIPT') {
              const src = element.getAttribute('src')
              const id = element.getAttribute('id')
              
              // Common extension script patterns
              if (src && (
                src.includes('chrome-extension://') ||
                src.includes('moz-extension://') ||
                src.includes('safari-extension://') ||
                src.includes('extension://')
              )) {
                element.remove()
                return
              }
              
              // Common extension IDs
              if (id && (
                id.includes('extension') ||
                id.includes('chrome') ||
                id.includes('addon')
              )) {
                element.remove()
                return
              }
            }
            
            // Remove extension iframes
            if (element.tagName === 'IFRAME') {
              const src = element.getAttribute('src')
              if (src && (
                src.includes('chrome-extension://') ||
                src.includes('moz-extension://') ||
                src.includes('safari-extension://') ||
                src.includes('extension://')
              )) {
                element.remove()
                return
              }
            }
          }
        })
      })
    })
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
    
    return observer
  }

  // Suppress extension-related console errors
  const suppressExtensionErrors = () => {
    const originalError = console.error
    console.error = (...args) => {
      const message = args.join(' ')
      
      // Filter out common extension errors
      if (
        message.includes('Could not establish connection') ||
        message.includes('Receiving end does not exist') ||
        message.includes('Extension context invalidated') ||
        message.includes('chrome-extension://') ||
        message.includes('moz-extension://') ||
        message.includes('safari-extension://') ||
        message.includes('Private Access Token challenge') ||
        message.includes('cdn-cgi/challenge-platform') ||
        message.includes('Failed to load resource') ||
        message.includes('Registration failed')
      ) {
        return // Suppress these errors
      }
      
      originalError.apply(console, args)
    }
  }

  // Block extension message passing
  const blockExtensionMessages = () => {
    // Override chrome.runtime if it exists
    if (typeof window.chrome !== 'undefined' && window.chrome.runtime) {
      const originalSendMessage = window.chrome.runtime.sendMessage
      window.chrome.runtime.sendMessage = (...args) => {
        // Silently ignore extension messages
        return Promise.resolve()
      }
    }
    
    // Block postMessage from extensions
    const originalPostMessage = window.postMessage
    window.postMessage = (message, targetOrigin, transfer) => {
      // Only allow messages from same origin
      if (typeof message === 'object' && message !== null) {
        const messageStr = JSON.stringify(message)
        if (
          messageStr.includes('extension') ||
          messageStr.includes('chrome-extension') ||
          messageStr.includes('moz-extension')
        ) {
          return // Block extension messages
        }
      }
      
      return originalPostMessage.call(window, message, targetOrigin, transfer)
    }
  }

  // Initialize all prevention measures
  try {
    suppressExtensionErrors()
    blockExtensionMessages()
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', preventInjection)
    } else {
      preventInjection()
    }
  } catch (error) {
    // Silently handle any errors in conflict prevention
  }
}

// Content Security Policy helper
export const addCSPMeta = () => {
  if (typeof document === 'undefined') return
  
  const existingCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
  if (existingCSP) return
  
  const cspMeta = document.createElement('meta')
  cspMeta.setAttribute('http-equiv', 'Content-Security-Policy')
  cspMeta.setAttribute('content', 
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: *; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: *; " +
    "style-src 'self' 'unsafe-inline' https: *; " +
    "img-src 'self' data: blob: https: *; " +
    "connect-src 'self' https: wss: ws: * data:; " +
    "font-src 'self' data: https: *; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self' *;"
  )
  
  document.head.appendChild(cspMeta)
}

// Initialize on import
if (typeof window !== 'undefined') {
  preventExtensionConflicts()
  addCSPMeta()
}