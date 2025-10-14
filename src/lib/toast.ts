// Simple toast utility without React context
export const toast = {
  success: (message: string) => {
    console.log('✅ Success:', message)
    // You can replace this with a proper toast implementation
    if (typeof window !== 'undefined') {
      // Simple browser notification for now
      const event = new CustomEvent('toast', {
        detail: { type: 'success', message }
      })
      window.dispatchEvent(event)
    }
  },
  
  error: (message: string) => {
    console.error('❌ Error:', message)
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'error', message }
      })
      window.dispatchEvent(event)
    }
  },
  
  warning: (message: string) => {
    console.warn('⚠️ Warning:', message)
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'warning', message }
      })
      window.dispatchEvent(event)
    }
  },
  
  info: (message: string) => {
    console.info('ℹ️ Info:', message)
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'info', message }
      })
      window.dispatchEvent(event)
    }
  }
}