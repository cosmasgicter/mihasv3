import { useState } from 'react'
import { secureStorage } from '@/lib/secureStorage'
import { Banner } from '@/components/ui/Banner'

/**
 * Banner shown when Web Crypto API is unavailable.
 * Informs the user that full draft recovery requires a modern browser.
 * Uses the canonical Banner component with the 'warning' variant.
 * Requirements: 19.4
 */
export function InsecureStorageBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || !secureStorage.showInsecureBanner) return null

  return (
    <Banner variant="warning" dismissible onDismiss={() => setDismissed(true)}>
      Your browser does not support secure storage. Draft data is saved
      without encryption and sensitive fields (ID numbers, medical info) are
      not stored locally. For full draft recovery, please use a modern
      browser.
    </Banner>
  )
}
