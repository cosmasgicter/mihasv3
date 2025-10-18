export const toast = {
  success: (message: string) => {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'success', title: message }
      })
      window.dispatchEvent(event)
    }
  },
  
  error: (message: string) => {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'error', title: message }
      })
      window.dispatchEvent(event)
    }
  },
  
  warning: (message: string) => {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'warning', title: message }
      })
      window.dispatchEvent(event)
    }
  },
  
  info: (message: string) => {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'info', title: message }
      })
      window.dispatchEvent(event)
    }
  }
}