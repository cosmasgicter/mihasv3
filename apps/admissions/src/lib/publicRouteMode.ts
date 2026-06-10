const MARKETING_PUBLIC_ROUTES = new Set([
  '/',
  '/404',
  '/contact',
  '/privacy',
  '/terms',
  '/track-application',
])

const NON_MARKETING_EXACT_ROUTES = new Set([
  '/apply',
  '/dashboard',
  '/login',
  '/settings',
  '/signin',
])

const NON_MARKETING_PREFIXES = [
  '/admin',
  '/auth',
  '/student',
]

const NON_MARKETING_DYNAMIC_PREFIXES = [
  '/application/',
]

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return '/'
  }

  const normalized = pathname.replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

export function isMarketingPublicRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname)

  // DEV-ONLY preview routes are public (no auth shell). Guarded here AND by
  // the route guard in App.tsx; in production builds the route is not mounted.
  if (import.meta.env.DEV && normalized.startsWith('/dev/')) {
    return true
  }

  if (MARKETING_PUBLIC_ROUTES.has(normalized)) {
    return true
  }

  if (NON_MARKETING_EXACT_ROUTES.has(normalized)) {
    return false
  }

  if (NON_MARKETING_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return false
  }

  if (NON_MARKETING_DYNAMIC_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false
  }

  return true
}

export default isMarketingPublicRoute
