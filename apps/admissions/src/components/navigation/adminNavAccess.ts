import type { CapabilityValue } from '@/contexts/CapabilityContext'
import { adminNavRoutes } from '@/routes/routeRegistry'

type AdminNavCapabilities = Pick<CapabilityValue, 'isSuperAdmin'>
type AdminNavItem = { href?: string; to?: string }

const SUPER_ADMIN_ONLY_ADMIN_PATHS = new Set(
  adminNavRoutes()
    .filter((route) => route.requiresSuperAdmin)
    .map((route) => route.path),
)

function normalizePath(path: string): string {
  const [withoutHash] = path.split('#')
  const [withoutQuery] = (withoutHash ?? path).split('?')
  const normalizedPath = withoutQuery || path
  if (normalizedPath.length > 1) {
    return normalizedPath.replace(/\/+$/, '')
  }
  return normalizedPath
}

export function canSeeAdminNavPath(caps: AdminNavCapabilities, path: string): boolean {
  const normalizedPath = normalizePath(path)
  return !SUPER_ADMIN_ONLY_ADMIN_PATHS.has(normalizedPath) || caps.isSuperAdmin
}

export function filterAdminNavItems<T extends AdminNavItem>(
  items: T[],
  caps: AdminNavCapabilities,
): T[] {
  return items.filter((item) => canSeeAdminNavPath(caps, item.to ?? item.href ?? ''))
}
