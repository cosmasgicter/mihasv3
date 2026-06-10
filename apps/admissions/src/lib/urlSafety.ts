/**
 * URL Safety — Open Redirect Prevention
 *
 * Validates that navigation URLs are safe (same-origin or relative paths).
 * Prevents open redirect attacks via notification action_url or other
 * user-controlled navigation targets.
 *
 * Feature: website-quality-remediation, Requirement 27
 */

/** The canonical application domain used for server-side validation. */
export const APPLICATION_DOMAIN = 'apply.beanola.com';

/**
 * Check whether a URL is safe to navigate to from the frontend.
 *
 * Allowed:
 *  - Relative paths starting with `/` (but NOT protocol-relative `//`)
 *  - Absolute URLs whose origin matches `window.location.origin`
 *
 * Rejected:
 *  - Protocol-relative URLs (`//evil.com/path`)
 *  - Absolute URLs pointing to a different origin
 *  - `javascript:`, `data:`, `vbscript:` and other dangerous schemes
 *  - Empty or malformed strings
 */
export function isSafeNavigationUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  // Reject protocol-relative URLs (e.g. //evil.com/path)
  if (trimmed.startsWith('//')) return false;

  // Allow relative paths starting with /
  if (trimmed.startsWith('/')) return true;

  // For absolute URLs, verify same origin
  try {
    const origin =
      typeof window !== 'undefined' && window.location
        ? window.location.origin
        : `https://${APPLICATION_DOMAIN}`;
    const parsed = new URL(trimmed, origin);
    return parsed.origin === origin;
  } catch {
    return false;
  }
}

/**
 * Server-side variant: check whether an action_url is safe for the
 * application domain. Used when creating/storing notifications.
 *
 * Allowed:
 *  - Relative paths starting with `/` (but NOT `//`)
 *  - Absolute HTTPS URLs whose hostname is exactly `APPLICATION_DOMAIN`
 *
 * Rejected:
 *  - Everything else (different domains, non-HTTPS, protocol-relative, etc.)
 */
export function isSafeActionUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  // Reject protocol-relative URLs
  if (trimmed.startsWith('//')) return false;

  // Allow relative paths
  if (trimmed.startsWith('/')) return true;

  // Validate absolute URLs
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === APPLICATION_DOMAIN
    );
  } catch {
    return false;
  }
}
