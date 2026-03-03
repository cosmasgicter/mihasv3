import { useEffect } from 'react'

/**
 * Listens for the Escape key on the document and calls the provided
 * callback when pressed. The listener is only active while `isActive`
 * is true and automatically cleans up on unmount or deactivation.
 */
export function useEscapeKey(isActive: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onEscape()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onEscape])
}
