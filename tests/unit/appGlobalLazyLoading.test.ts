import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('App global utility bundle splitting', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')

  it('keeps heavy global utilities behind lazy imports', () => {
    const lazySpecifiers = [
      "import('@vercel/analytics/react')",
      "import('@vercel/speed-insights/react')",
      "import('@/components/ui/InstallBanner')",
      "import('@/components/pwa/OfflineIndicator')",
      "import('@/components/ServiceWorkerUpdatePrompt')",
      "import('@/components/auth/SessionMonitor')",
    ]

    for (const specifier of lazySpecifiers) {
      expect(appSource).toContain(specifier)
    }
  })

  it('avoids eager top-level imports for deferred utilities', () => {
    const eagerImports = [
      "from '@vercel/analytics/react'",
      "from '@vercel/speed-insights/react'",
      "from '@/components/ui/InstallBanner'",
      "from '@/components/pwa/OfflineIndicator'",
      "from '@/components/ServiceWorkerUpdatePrompt'",
      "from '@/components/auth/SessionMonitor'",
    ]

    for (const importFragment of eagerImports) {
      expect(appSource).not.toContain(importFragment)
    }
  })
})
