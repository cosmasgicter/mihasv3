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
   * Payment-hardening Phase 4 UI gate. When `"true"`, `PaymentStep`
   * drives its render from `derivePaymentUiState(...)` and uses the
   * paymentRecoveryStore for resume-on-refresh. Default: undefined (off).
   */
  readonly VITE_PAYMENT_HARDENING_UI?: 'true' | 'false'

  /**
   * Polling-exceeded-timeout threshold for `usePaymentStatus` (R14.3).
   * Parsed as a number of milliseconds; defaults to 120_000 (2 min).
   */
  readonly VITE_PAYMENT_POLL_TIMEOUT_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
