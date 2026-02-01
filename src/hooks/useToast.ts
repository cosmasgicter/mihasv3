/**
 * useToast Hook
 * 
 * Re-exports the toast store from the UI components for convenience.
 * This allows importing from @/hooks/useToast instead of @/components/ui/Toast
 */

export { useToastStore, useToast } from '@/components/ui/Toast'

// Also export a standalone toast function for use outside React components
import { useToastStore } from '@/components/ui/Toast'

export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().success(title, message),
  error: (title: string, message?: string) => useToastStore.getState().error(title, message),
  info: (title: string, message?: string) => useToastStore.getState().info(title, message),
}

export default useToastStore
