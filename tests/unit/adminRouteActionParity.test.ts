import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  it('keeps core admin routes defined in router config', () => {
    const routesSource = readSource('src/routes/config.tsx')

    for (const route of ADMIN_CORE_ROUTES) {
      expect(routesSource).toContain(`path: '${route}'`)
    }
  })

  it('keeps desktop, app-layout, and mobile admin navigation paths in parity', () => {
    const desktopSidebar = readSource('src/components/navigation/DesktopSidebar.tsx')
    const appLayout = readSource('src/components/navigation/AppLayout.tsx')
    const mobileNav = readSource('src/components/navigation/MobileBottomNav.tsx')

    for (const route of ADMIN_CORE_ROUTES) {
      expect(desktopSidebar, `DesktopSidebar missing ${route}`).toContain(route)
      expect(appLayout, `AppLayout adminNavItems missing ${route}`).toContain(route)
      expect(mobileNav, `MobileBottomNav missing ${route}`).toContain(route)
    }
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
