/**
 * Tenant admin route entry (`/admin/tenants`).
 *
 * Thin capability switcher (enterprise-tenant-authority, task 13.1). It renders
 * one of three authority-specific surfaces derived from the backend Capability
 * set — never a single all-powerful console:
 *   - `SuperAdminTenantConsole`     when `isSuperAdmin` (full platform-owner UX).
 *   - `TenantAdminSchoolConsole`    when `isTenantAdmin` (assigned school only).
 *   - a clear no-access state       otherwise (R11.5) — PageShell + EmptyState
 *     with NO leaked tenant data.
 *
 * The default export stays `AdminTenants` so the route config
 * (`@/pages/admin/Tenants`) keeps working. The backend remains the security
 * boundary; this switch is a usability layer.
 */
import { ShieldAlert } from 'lucide-react'

import { Seo } from '@/components/seo/Seo'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageShell } from '@/components/ui/PageShell'
import { DashboardSkeleton } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'

import { SuperAdminTenantConsole } from './tenants/SuperAdminTenantConsole'
import { TenantAdminSchoolConsole } from './tenants/TenantAdminSchoolConsole'

export default function AdminTenants() {
  const { isSuperAdmin, isTenantAdmin, isLoading } = useCapabilities()

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (isSuperAdmin) {
    return <SuperAdminTenantConsole />
  }

  if (isTenantAdmin) {
    return <TenantAdminSchoolConsole />
  }

  // No platform reach and no tenant scope — render a clear no-access state with
  // no tenant data (R11.5).
  return (
    <>
      <Seo title="Tenants | Beanola Admissions" description="Tenant administration." path="/admin/tenants" noindex />
      <PageShell title="Tenant administration" tone="admin" maxWidth="full">
        <EmptyState
          icon={<ShieldAlert />}
          heading="No access"
          description="Your account is not authorized to manage tenants or schools. Contact your platform administrator if you believe this is an error."
        />
      </PageShell>
    </>
  )
}
