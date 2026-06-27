// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PRODUCT_ROUTES,
  accessibleAdminNavRoutes,
  adminNavRoutes,
  pathFor,
  routeById,
  routeByPath,
  routesByGuard,
  studentApplicationLocalResumePath,
  studentApplicationNewPath,
  studentApplicationResumePath,
} from '@/routes/routeRegistry'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SRC_ROOT = path.resolve(__dirname, '../../src')

const migratedRouteConsumerFiles = [
  'components/DashboardRedirect.tsx',
  'components/navigation/AppLayout.tsx',
  'components/navigation/DesktopSidebar.tsx',
  'components/navigation/MobileBottomNav.tsx',
  'components/navigation/adminNavAccess.ts',
  'components/navigation/tenantNav.ts',
  'components/ui/BottomNavigation.tsx',
  'pages/NotFoundPage.tsx',
  'pages/auth/SignInPage.tsx',
]

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function concretePath(pattern: string): string {
  return pattern.replace(/:[^/]+/g, 'example-id')
}

describe('canonical route registry', () => {
  it('resolves every route id back to a concrete path', () => {
    for (const route of PRODUCT_ROUTES) {
      expect(routeById(route.id).path, route.id).toBe(route.path)
      expect(pathFor(route.id), route.id).toBe(route.path)
    }
  })

  it('resolves canonical paths and aliases to their canonical route', () => {
    for (const route of PRODUCT_ROUTES) {
      expect(routeByPath(concretePath(route.path))?.id, route.path).toBe(route.id)

      for (const alias of route.aliases ?? []) {
        expect(routeByPath(concretePath(alias))?.id, alias).toBe(route.id)
      }
    }
  })

  it('keeps the shared tenant console available to tenant admins', () => {
    const route = routeById('admin.tenants')

    expect(route.path).toBe('/admin/tenants')
    expect(route.requiresSuperAdmin).not.toBe(true)
  })

  it('keeps tenant onboarding platform-only', () => {
    const route = routeById('admin.tenantOnboarding')

    expect(route.path).toBe('/admin/tenants/new')
    expect(route.requiresSuperAdmin).toBe(true)
  })

  it('keeps admin nav authorization derived from the same route metadata', () => {
    const tenantAdminPaths = accessibleAdminNavRoutes({ isSuperAdmin: false }).map((route) => route.path)
    const superAdminPaths = accessibleAdminNavRoutes({ isSuperAdmin: true }).map((route) => route.path)
    const allAdminNavPaths = adminNavRoutes().map((route) => route.path)

    expect(tenantAdminPaths).toContain('/admin/tenants')
    expect(tenantAdminPaths).not.toContain('/admin/settings')
    expect(tenantAdminPaths).not.toContain('/admin/audit')
    expect(superAdminPaths).toEqual(allAdminNavPaths)
  })

  it('does not expose the Django admin path as a product route', () => {
    const routePaths = PRODUCT_ROUTES.flatMap((route) => [route.path, ...(route.aliases ?? [])])

    expect(routePaths.filter((routePath) => routePath.includes('beanola-admin-panel'))).toEqual([])
  })

  it('keeps auth redirect allowlists tied to registry guards', () => {
    const signInSource = readFileSync(path.join(SRC_ROOT, 'pages/auth/SignInPage.tsx'), 'utf8')

    expect(signInSource).toContain('routesByGuard')
    expect(routesByGuard('admin').map((route) => route.path)).toContain('/admin/dashboard')
    expect(routesByGuard('student').map((route) => route.path)).toContain('/student/dashboard')
  })

  it('builds explicit student draft intent paths', () => {
    expect(studentApplicationNewPath()).toBe('/student/application-wizard?mode=new')
    expect(studentApplicationNewPath({ programId: 'program-1' })).toBe('/student/application-wizard?mode=new&programId=program-1')
    expect(studentApplicationResumePath('draft-1')).toBe('/student/application-wizard?mode=resume&draftId=draft-1')
    expect(studentApplicationLocalResumePath()).toBe('/student/application-wizard?localDraft=true')
  })

  it('keeps migrated route consumers free of hard-coded admin product paths', () => {
    const offenders: string[] = []

    for (const relativePath of migratedRouteConsumerFiles) {
      const absolutePath = path.join(SRC_ROOT, relativePath)
      const source = stripComments(readFileSync(absolutePath, 'utf8'))
      if (/['"`]\/admin\//.test(source)) {
        offenders.push(relativePath)
      }
    }

    expect(offenders).toEqual([])
  })
})
