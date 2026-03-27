import { query } from './db';

// --- Idempotency key helpers ---

interface IdempotencyRecord {
  key: string;
  endpoint: string;
  response_json: unknown;
  created_at: string;
}

const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9:_-]+$/;

/**
 * Validate idempotency key format.
 * Alphanumeric + colons, underscores, hyphens. Max 128 chars.
 * Returns normalized key or empty string if invalid.
 *
 * Requirements: 10.5
 */
export function normalizeIdempotencyKey(rawHeader: string | string[] | undefined): string {
  if (!rawHeader) return '';
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length > IDEMPOTENCY_KEY_MAX_LENGTH) return '';
  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) return '';
  return normalized;
}

/**
 * Scope key by userId:endpoint:key to prevent cross-user collisions.
 *
 * Requirements: 10.4
 */
export function scopeIdempotencyKey(userId: string, endpoint: string, key: string): string {
  return `${userId}:${endpoint}:${key}`;
}

/**
 * Check if an idempotency key already exists and is not expired (24h window).
 * Returns the cached response if found, null otherwise.
 *
 * Requirements: 10.1, 10.2
 */
export async function checkIdempotencyKey(userId: string, key: string, endpoint: string): Promise<unknown | null> {
  if (!key) return null;
  const scopedKey = scopeIdempotencyKey(userId, endpoint, key);
  try {
    const result = await query<IdempotencyRecord>(
      `SELECT response_json FROM idempotency_keys
       WHERE key = $1 AND endpoint = $2
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [scopedKey, endpoint]
    );
    if (result.rowCount > 0) {
      return result.rows[0].response_json;
    }
    return null;
  } catch (err) {
    console.error('[idempotency] Error checking key:', err);
    return null;
  }
}

/**
 * Store an idempotency key with its response for future deduplication.
 * Also cleans up expired keys older than 24 hours.
 *
 * Requirements: 10.3, 10.9
 */
export async function storeIdempotencyKey(userId: string, key: string, endpoint: string, responseData: unknown): Promise<void> {
  if (!key) return;
  const scopedKey = scopeIdempotencyKey(userId, endpoint, key);
  try {
    await query(
      `INSERT INTO idempotency_keys (key, endpoint, response_json, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET response_json = $3, created_at = NOW()`,
      [scopedKey, endpoint, JSON.stringify(responseData)]
    );
    // Periodic cleanup: delete expired keys (non-blocking, best-effort)
    query(
      `DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours'`
    ).catch((err) => console.error('[idempotency] Cleanup error:', err));
  } catch (err) {
    console.error('[idempotency] Error storing key:', err);
  }
}
