import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { adminNavRoutes, pathFor, routeByPath } from '@/routes/routeRegistry'

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8')

const ADMIN_CORE_ROUTES = [
  '/admin/dashboard',
  '/admin/applications',
  '/admin/users',
  '/admin/programs',
  '/admin/intakes',
  '/admin/audit',
  '/admin/settings',
]

describe('admin route + action parity checklist', () => {
  it('keeps core admin routes defined in the canonical route registry', () => {
    for (const route of ADMIN_CORE_ROUTES) {
      expect(routeByPath(route)?.path, route).toBe(route)
    }
  })

  it('keeps admin navigation paths derived from the canonical registry', () => {
    const navPaths = adminNavRoutes().map((route) => route.path)
    for (const route of ADMIN_CORE_ROUTES) {
      expect(navPaths, `admin nav missing ${route}`).toContain(route)
    }
    expect(pathFor('admin.tenants')).toBe('/admin/tenants')
  })

  it('keeps approval controls reachable from both card and table admin application flows', () => {
    const appCardSource = readSource('src/components/admin/applications/ApplicationCard.tsx')
    const appDetailModalSource = readSource('src/components/admin/applications/ApplicationDetailModal.tsx')
    const appTableViewSource = readSource('src/components/admin/applications/ApplicationsTableView.tsx')
    const adminApplicationsPage = readSource('src/pages/admin/Applications.tsx')

    expect(appCardSource).toContain('<ApplicationApprovalActions')
    expect(appDetailModalSource).toContain('<ApplicationApprovalActions')

    // Table flow must surface the modal (which now includes ApplicationApprovalActions)
    expect(appTableViewSource).toContain('onViewDetails(row.id)')
    expect(appTableViewSource).toContain('onViewDetails(row.id);')
    expect(adminApplicationsPage).toContain('onPaymentStatusUpdate={handlePaymentStatusUpdate}')
  })
})
