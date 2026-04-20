import { describe, expect, it } from 'vitest'

import { isLightweightPublicRoute } from '@/lib/routeRuntime'

describe('route runtime classification', () => {
  it('treats auth entry routes as lightweight public routes', () => {
    expect(isLightweightPublicRoute('/auth/signin')).toBe(true)
    expect(isLightweightPublicRoute('/login')).toBe(true)
    expect(isLightweightPublicRoute('/auth/signup')).toBe(true)
    expect(isLightweightPublicRoute('/auth/forgot-password')).toBe(true)
  })

  it('does not treat application dashboards as lightweight public routes', () => {
    expect(isLightweightPublicRoute('/student/dashboard')).toBe(false)
    expect(isLightweightPublicRoute('/admin/dashboard')).toBe(false)
  })
})
