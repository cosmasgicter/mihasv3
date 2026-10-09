/// <reference types="vite/client" />

interface PreloaderWindow {
  __dismissPreloader?: () => void
  __preloaderTimeout?: ReturnType<typeof setTimeout>
  __preloaderMaxTimeout?: ReturnType<typeof setTimeout>
}

// Augment the global Window interface
interface Window extends PreloaderWindow {}

interface ImportMetaEnv {
  /**
   * Polling-exceeded-timeout threshold for `usePaymentStatus` (R14.3).
   * Parsed as a number of milliseconds; defaults to 120_000 (2 min).
   */
  readonly VITE_PAYMENT_POLL_TIMEOUT_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
