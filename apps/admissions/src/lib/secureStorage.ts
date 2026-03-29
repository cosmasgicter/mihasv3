/**
 * Secure Storage Utility
 * Provides AES-GCM encrypted storage for sensitive application data.
 * Per-session encryption key derived from user session token via PBKDF2.
 *
 * Fallback: If Web Crypto API is unavailable, stores only non-PII fields
 * in plain localStorage and exposes a flag for the UI to show a notice.
 */

import { logger } from './logger'

/** Fields classified as PII — must never be written to localStorage */
export const PII_FIELDS = [
  'nrc_number',
  'passport_number',
  'medical_conditions',
  'phone',
  'email',
] as const

export type PiiField = (typeof PII_FIELDS)[number]

/**
 * Remove PII fields from an object (shallow).
 * Returns a new object without any keys listed in PII_FIELDS.
 */
export function stripPiiFields<T extends Record<string, unknown>>(data: T): Omit<T, PiiField> {
  const stripped = { ...data }
  for (const field of PII_FIELDS) {
    delete (stripped as Record<string, unknown>)[field]
  }
  return stripped as Omit<T, PiiField>
}

// ── Crypto helpers ──────────────────────────────────────────────────────

const STORAGE_PREFIX = 'mihas_secure_'
const SALT_KEY = `${STORAGE_PREFIX}__salt__`
const IV_BYTES = 12 // AES-GCM recommended IV length
const PBKDF2_ITERATIONS = 100_000

/** Check whether the Web Crypto subtle API is available */
function isCryptoAvailable(): boolean {
  try {
    return (
      typeof globalThis.crypto !== 'undefined' &&
      typeof globalThis.crypto.subtle !== 'undefined' &&
      typeof globalThis.crypto.subtle.deriveKey === 'function'
    )
  } catch {
    return false
  }
}

/** Get or create a persistent salt stored in localStorage */
function getOrCreateSalt(): Uint8Array {
  try {
    const existing = localStorage.getItem(SALT_KEY)
    if (existing) {
      return Uint8Array.from(atob(existing), (c) => c.charCodeAt(0))
    }
  } catch {
    // ignore — will create a new salt
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  try {
    localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)))
  } catch {
    // If we can't persist the salt, encryption will still work for this session
    // but previously stored data won't be decryptable after page reload.
  }
  return salt
}

/** Derive an AES-GCM CryptoKey from a session token via PBKDF2 */
async function deriveKey(sessionToken: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const normalizedSalt = new Uint8Array(salt)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionToken),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      // Normalize to a fresh typed array so WebCrypto receives a compatible
      // BufferSource across browser and Node/Vitest environments.
      salt: normalizedSalt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypt a string with AES-GCM, returning base64(iv + ciphertext) */
async function encryptValue(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  )

  // Concatenate IV + ciphertext so we can extract IV on decrypt
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return btoa(String.fromCharCode(...combined))
}

/** Decrypt a base64(iv + ciphertext) string with AES-GCM */
async function decryptValue(encoded: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, IV_BYTES)
  const ciphertext = combined.slice(IV_BYTES)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )

  return new TextDecoder().decode(decrypted)
}

// ── SecureStorage class ─────────────────────────────────────────────────

class SecureStorage {
  readonly STORAGE_PREFIX = STORAGE_PREFIX
  private cryptoKey: CryptoKey | null = null
  private _isSecure = false
  private _initialized = false
  /** True when Web Crypto is unavailable — UI should show a notice */
  public showInsecureBanner = false

  /** Whether the storage is using real encryption */
  isSecureStorageAvailable(): boolean {
    return isCryptoAvailable()
  }

  /**
   * Initialise the per-session encryption key.
   * Must be called after the user authenticates.
   */
  async init(sessionToken: string): Promise<void> {
    if (!isCryptoAvailable()) {
      this._isSecure = false
      this.showInsecureBanner = true
      this._initialized = true
      logger.warn('Web Crypto API unavailable — falling back to non-PII plain storage')
      return
    }

    try {
      const salt = getOrCreateSalt()
      this.cryptoKey = await deriveKey(sessionToken, salt)
      this._isSecure = true
      this.showInsecureBanner = false
      this._initialized = true
    } catch (error) {
      logger.error('Failed to derive encryption key', { error })
      this._isSecure = false
      this.showInsecureBanner = true
      this._initialized = true
    }
  }

  /** Whether init() has been called */
  get initialized(): boolean {
    return this._initialized
  }

  /** Whether real encryption is active */
  get isSecure(): boolean {
    return this._isSecure
  }

  /**
   * Store a value. If crypto is available the value is AES-GCM encrypted.
   * In fallback mode only non-PII fields are stored in plain JSON.
   */
  async set(key: string, value: unknown): Promise<void> {
    const storageKey = this.STORAGE_PREFIX + key

    try {
      if (this._isSecure && this.cryptoKey) {
        const json = JSON.stringify(value)
        const encrypted = await encryptValue(json, this.cryptoKey)
        localStorage.setItem(storageKey, encrypted)
      } else {
        // Fallback: strip PII before storing in plain text
        const safe =
          value && typeof value === 'object' && !Array.isArray(value)
            ? stripPiiFields(value as Record<string, unknown>)
            : value
        localStorage.setItem(storageKey, JSON.stringify(safe))
      }
    } catch (error) {
      logger.error('Failed to set secure storage value', { key, error })
      throw error
    }
  }

  /**
   * Retrieve and decrypt a value.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const storageKey = this.STORAGE_PREFIX + key

    try {
      const raw = localStorage.getItem(storageKey)
      if (raw === null) return null

      if (this._isSecure && this.cryptoKey) {
        const json = await decryptValue(raw, this.cryptoKey)
        return JSON.parse(json) as T
      }

      // Fallback: plain JSON
      return JSON.parse(raw) as T
    } catch (error) {
      logger.error('Failed to get secure storage value', { key, error })
      return null
    }
  }

  /** Delete a single key */
  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.STORAGE_PREFIX + key)
    } catch (error) {
      logger.error('Failed to delete secure storage value', { key, error })
      throw error
    }
  }

  /** Check if a key exists */
  async has(key: string): Promise<boolean> {
    try {
      return localStorage.getItem(this.STORAGE_PREFIX + key) !== null
    } catch (error) {
      logger.error('Failed to check secure storage key', { key, error })
      return false
    }
  }

  /**
   * Remove ALL keys with the secure prefix from localStorage.
   * Should be called on logout to wipe session data.
   */
  async clearSession(): Promise<void> {
    try {
      const keysToRemove = Object.keys(localStorage).filter((k) =>
        k.startsWith(this.STORAGE_PREFIX),
      )
      for (const k of keysToRemove) {
        localStorage.removeItem(k)
      }
      this.cryptoKey = null
      this._isSecure = false
      this._initialized = false
    } catch (error) {
      logger.error('Failed to clear secure storage session', { error })
      throw error
    }
  }

  /** List all keys (without prefix) currently in secure storage */
  async keys(): Promise<string[]> {
    try {
      return Object.keys(localStorage)
        .filter((k) => k.startsWith(this.STORAGE_PREFIX))
        .map((k) => k.substring(this.STORAGE_PREFIX.length))
    } catch (error) {
      logger.error('Failed to get secure storage keys', { error })
      return []
    }
  }

  /** Calculate approximate storage size in bytes */
  getSize(): number {
    try {
      let totalSize = 0
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(this.STORAGE_PREFIX)) {
          const value = localStorage.getItem(key)
          if (value) totalSize += key.length + value.length
        }
      }
      return totalSize
    } catch (error) {
      logger.error('Failed to calculate secure storage size', { error })
      return 0
    }
  }
}

export const secureStorage = new SecureStorage()
