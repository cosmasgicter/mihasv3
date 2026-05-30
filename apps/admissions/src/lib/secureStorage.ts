/**
 * Secure Storage — AES-GCM Web Crypto and PII stripping utilities.
 */
import { logger } from '@/lib/logger'

const STORAGE_PREFIX = 'mihas_secure_'
const SALT_KEY = 'mihas_secure_salt'
const IV_BYTES = 12
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
      salt: salt.buffer as ArrayBuffer,
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

export const PII_FIELDS = [
  'password', 'token', 'secret', 'nrc', 'passport_number',
  'date_of_birth', 'bank_account', 'credit_card',
  'nrc_number', 'medical_conditions', 'phone', 'email',
  'passport',
]

const PII_FIELD_SET = new Set(PII_FIELDS.map((field) => field.toLowerCase()))
const PII_NORMALIZED_FIELDS = new Set(
  PII_FIELDS.map((field) => field.replace(/[^a-z0-9]/gi, '').toLowerCase()),
)
const PII_KEY_SUFFIXES = ['email', 'phone', 'nrc', 'passport', 'dateofbirth']
const PII_KEY_CONTAINS = ['password', 'token', 'secret', 'bankaccount', 'creditcard', 'medicalconditions']

function isPiiField(field: string): boolean {
  const lowered = field.toLowerCase()
  const normalized = field.replace(/[^a-z0-9]/gi, '').toLowerCase()

  return (
    PII_FIELD_SET.has(lowered) ||
    PII_NORMALIZED_FIELDS.has(normalized) ||
    PII_KEY_SUFFIXES.some((suffix) => (
      normalized === suffix ||
      normalized.startsWith(suffix) ||
      normalized.endsWith(suffix)
    )) ||
    PII_KEY_CONTAINS.some((needle) => normalized.includes(needle))
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function stripPiiValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripPiiValue)
  }

  if (!isPlainObject(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isPiiField(key))
      .map(([key, entryValue]) => [key, stripPiiValue(entryValue)]),
  )
}

/** Strip PII fields from an object before persisting */
export function stripPiiFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return stripPiiValue(obj) as Partial<T>
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
          value && typeof value === 'object'
            ? stripPiiValue(value)
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
        .filter((k) => k.startsWith(this.STORAGE_PREFIX) && k !== SALT_KEY)
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

/** Backward-compatible export of clearSession */
export async function clearSession(): Promise<void> {
  await secureStorage.clearSession()
}
