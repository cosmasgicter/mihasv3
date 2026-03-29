/**
 * In-memory CSRF token store.
 *
 * The token is received from the server in the X-CSRF-Token response header
 * after login and refresh, and attached to all POST/PATCH/PUT/DELETE requests.
 *
 * Stored in a module-level variable — never persisted to localStorage or
 * sessionStorage. Cleared on logout.
 */

let csrfToken: string | null = null;

/** Store the CSRF token received from the server. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Get the current CSRF token (may be null before login). */
export function getCsrfToken(): string | null {
  return csrfToken;
}

/** Clear the CSRF token (called on logout). */
export function clearCsrfToken(): void {
  csrfToken = null;
}
