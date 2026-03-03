/**
 * URL Validator — SSRF Prevention
 *
 * Validates URLs before server-side fetching to prevent Server-Side Request Forgery.
 * Only allows HTTPS URLs to allowlisted domains and rejects private IP ranges.
 */

/**
 * Allowlisted domains for server-side fetching.
 * Includes the application domain and the R2 storage public domain (from env).
 */
function getAllowedDomains(): string[] {
  const domains: string[] = ['apply.mihas.edu.zm'];

  const r2PublicUrl = process.env.R2_PUBLIC_URL;
  if (r2PublicUrl) {
    try {
      const parsed = new URL(r2PublicUrl);
      domains.push(parsed.hostname);
    } catch {
      // Invalid R2_PUBLIC_URL — skip
    }
  }

  const r2PublicDomain = process.env.R2_PUBLIC_DOMAIN;
  if (r2PublicDomain) {
    domains.push(r2PublicDomain);
  }

  return domains;
}

/**
 * Regex patterns matching private/reserved IPv4 and IPv6 ranges.
 */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,                          // 127.0.0.0/8 — loopback
  /^10\./,                           // 10.0.0.0/8 — private
  /^172\.(1[6-9]|2\d|3[01])\./,     // 172.16.0.0/12 — private
  /^192\.168\./,                     // 192.168.0.0/16 — private
  /^169\.254\./,                     // 169.254.0.0/16 — link-local
  /^0\./,                            // 0.0.0.0/8 — "this" network
  /^::1$/,                           // IPv6 loopback
  /^\[::1\]$/,                       // IPv6 loopback (bracketed)
  /^fc00:/i,                         // IPv6 ULA (fc00::/7)
  /^fd[0-9a-f]{2}:/i,               // IPv6 ULA (fd00::/8, part of fc00::/7)
  /^fe80:/i,                         // IPv6 link-local
];

/**
 * Check if a hostname is a private/reserved IP address.
 *
 * @param hostname - The hostname or IP address to check
 * @returns true if the hostname matches a private IP range
 */
export function isPrivateIP(hostname: string): boolean {
  // Strip IPv6 brackets if present
  const cleaned = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(cleaned));
}

/**
 * Validate that a URL is safe for server-side fetching.
 *
 * Checks:
 * 1. URL is parseable
 * 2. Scheme is HTTPS
 * 3. Hostname is not a private IP
 * 4. Hostname is in the allowed domains list
 *
 * @param url - The URL string to validate
 * @returns true if the URL is allowed for server-side fetching
 */
export function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Must be HTTPS
  if (parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname;

  // Reject private IPs
  if (isPrivateIP(hostname)) {
    return false;
  }

  // Must be on the allowlist
  const allowedDomains = getAllowedDomains();
  return allowedDomains.includes(hostname.toLowerCase());
}
