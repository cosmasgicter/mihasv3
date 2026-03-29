const LIGHTWEIGHT_PUBLIC_ROUTES = new Set([
  '/auth/callback',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/signin',
  '/auth/signup',
  '/login',
  '/signin',
])

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return '/'
  }

  const normalized = pathname.replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

export function isLightweightPublicRoute(pathname: string): boolean {
  return LIGHTWEIGHT_PUBLIC_ROUTES.has(normalizePathname(pathname))
}

export default isLightweightPublicRoute
