/**
 * Toast Store
 * 
 * Re-exports the toast store from the UI components.
 * This allows importing from @/stores/toastStore for consistency with other stores.
 */

export { useToastStore, useToast } from '@/components/ui/Toast'
export type { } from '@/components/ui/Toast'

// Re-export the store as default
import { useToastStore } from '@/components/ui/Toast'
export default useToastStore
