import { describe, expect, it } from 'vitest'

import {
  resolveServiceWorkerUpdateTrigger,
  shouldAutoReloadForServiceWorkerUpdate,
} from '@/lib/serviceWorkerUpdatePolicy'

describe('serviceWorkerUpdatePolicy', () => {
  it('auto reloads only for low-risk non-home, non-dashboard routes', () => {
    expect(shouldAutoReloadForServiceWorkerUpdate('/auth/signin')).toBe(true)
    expect(shouldAutoReloadForServiceWorkerUpdate('/login')).toBe(true)
    expect(shouldAutoReloadForServiceWorkerUpdate('/track-application')).toBe(true)
    expect(shouldAutoReloadForServiceWorkerUpdate('/contact')).toBe(true)
  })


  it('does not auto reload on home or dashboard routes', () => {
    expect(shouldAutoReloadForServiceWorkerUpdate('/')).toBe(false)
    expect(shouldAutoReloadForServiceWorkerUpdate('/dashboard')).toBe(false)
    expect(shouldAutoReloadForServiceWorkerUpdate('/student/dashboard')).toBe(false)
    expect(shouldAutoReloadForServiceWorkerUpdate('/admin/dashboard')).toBe(false)
  })

  it('does not auto reload while the user is likely editing a form', () => {
    expect(shouldAutoReloadForServiceWorkerUpdate('/apply')).toBe(false)
    expect(shouldAutoReloadForServiceWorkerUpdate('/student/application-wizard')).toBe(false)
    expect(shouldAutoReloadForServiceWorkerUpdate('/student/settings')).toBe(false)
    expect(shouldAutoReloadForServiceWorkerUpdate('/student/payment')).toBe(false)
  })

  it('prefers skip-waiting when a waiting service worker exists', () => {
    expect(resolveServiceWorkerUpdateTrigger({
      hasWaitingWorker: true,
      updateAvailable: true,
    })).toBe('skip_waiting')
  })

  it('falls back to a reload when an activated update exists without a waiting worker', () => {
    expect(resolveServiceWorkerUpdateTrigger({
      hasWaitingWorker: false,
      updateAvailable: true,
    })).toBe('reload')
  })

  it('does nothing when no update is available', () => {
    expect(resolveServiceWorkerUpdateTrigger({
      hasWaitingWorker: false,
      updateAvailable: false,
    })).toBe('noop')
  })
})
