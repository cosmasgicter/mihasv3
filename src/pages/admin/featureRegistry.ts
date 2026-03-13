/**
 * Admin page feature registry.
 *
 * Keep this list limited to intentionally staged modules that are not yet
 * reachable via `src/routes/config.tsx`.
 */
export const STAGED_ADMIN_PAGE_MODULES = [
  '@/pages/admin/CacheMonitor',
  '@/pages/admin/EligibilityManagement',
] as const
