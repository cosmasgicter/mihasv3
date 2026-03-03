import { secureStorage } from '@/lib/secureStorage'

/**
 * Banner shown when Web Crypto API is unavailable.
 * Informs the user that full draft recovery requires a modern browser.
 */
export function InsecureStorageBanner() {
  if (!secureStorage.showInsecureBanner) return null

  return (
    <div
      role="alert"
      className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2"
    >
      <span aria-hidden="true" className="text-amber-500 mt-0.5">⚠</span>
      <p>
        Your browser does not support secure storage. Draft data is saved
        without encryption and sensitive fields (ID numbers, medical info) are
        not stored locally. For full draft recovery, please use a modern
        browser.
      </p>
    </div>
  )
}
