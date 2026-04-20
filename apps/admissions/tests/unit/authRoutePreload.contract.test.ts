import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const srcRoot = path.resolve(process.cwd(), 'src')

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf-8')
}

describe('auth route preload and session race contracts', () => {
  it('preloads sign-in and sign-up routes from the landing experience', () => {
    const routePreload = readSource('lib/routePreload.ts')
    const landingPage = readSource('pages/LandingPage.tsx')
    const publicHeader = readSource('components/layout/PublicSiteHeader.tsx')
    const hero = readSource('components/smoothui/shape-landing-hero.tsx')

    expect(routePreload).toContain("import('@/components/AuthenticatedRouteShell')")
    expect(routePreload).toContain("import('@/pages/auth/SignInPage')")
    expect(routePreload).toContain("import('@/pages/auth/SignUpPage')")
    expect(routePreload).toContain('scheduleLikelyAuthRoutePreload')
    expect(landingPage).toContain('scheduleLikelyAuthRoutePreload(900)')
    expect(publicHeader).toContain("preloadAuthRoutes('public-nav')")
    expect(hero).toContain("preloadAuthRoutes('hero-cta')")
  })

  it('preloads the first authenticated workspace after sign-in and sign-up', () => {
    const routePreload = readSource('lib/routePreload.ts')
    const signInPage = readSource('pages/auth/SignInPage.tsx')
    const signUpPage = readSource('pages/auth/SignUpPage.tsx')

    expect(routePreload).toContain("import('@/components/navigation/AppLayout')")
    expect(routePreload).toContain("import('@/pages/student/Dashboard')")
    expect(routePreload).toContain("import('@/pages/admin/Dashboard')")
    expect(signInPage).toContain('preloadPostAuthWorkspace')
    expect(signUpPage).toContain('preloadStudentWorkspaceRoute')
  })

  it('cancels stale session checks before and after auth cache seeding', () => {
    const sessionListener = readSource('hooks/auth/useSessionListener.ts')

    expect(sessionListener).toContain('SESSION_QUERY_KEY')
    expect(sessionListener).toContain("queryClient.setQueryData(SESSION_QUERY_KEY, { user: authUser })")
    expect(sessionListener).toContain("queryClient.setQueryData(SESSION_QUERY_KEY, { user: userPayload })")
  })
})
