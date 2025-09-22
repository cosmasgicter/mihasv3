import DOMPurify from 'dompurify';

// Security utilities for input sanitization and validation

type CryptoGlobal = typeof globalThis & { msCrypto?: Crypto }

function getCrypto(): Crypto | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined
  }

  const globalCrypto = (globalThis as CryptoGlobal).crypto ?? (globalThis as CryptoGlobal).msCrypto

  return globalCrypto ?? undefined
}

function generateUuidFromRandomValues(cryptoObj: Crypto): string {
  const randomBytes = new Uint8Array(16)
  cryptoObj.getRandomValues(randomBytes)

  // Per RFC 4122 section 4.4
  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80

  const toHex = (value: number) => value.toString(16).padStart(2, '0')

  const segments = [
    Array.from(randomBytes.subarray(0, 4), toHex).join(''),
    Array.from(randomBytes.subarray(4, 6), toHex).join(''),
    Array.from(randomBytes.subarray(6, 8), toHex).join(''),
    Array.from(randomBytes.subarray(8, 10), toHex).join(''),
    Array.from(randomBytes.subarray(10, 16), toHex).join('')
  ]

  return segments.join('-')
}

export function getSecureId(): string {
  const cryptoObj = getCrypto()

  if (cryptoObj?.randomUUID) {
    try {
      return cryptoObj.randomUUID()
    } catch {
      // Fallback to manual generation if randomUUID throws
    }
  }

  if (cryptoObj?.getRandomValues) {
    return generateUuidFromRandomValues(cryptoObj)
  }

  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export const generateSecureId = getSecureId

/**
 * Sanitize input for logging to prevent log injection
 */
export function sanitizeForLog(input: string): string {
  if (typeof input !== 'string') {
    return String(input).substring(0, 500)
  }
  
  return input
    .replace(/[\r\n\t]/g, ' ') // Remove newlines and tabs
    .replace(/[<>\"'`\\]/g, '') // Remove potentially dangerous characters
    .substring(0, 500) // Limit length
}

/**
 * Sanitize HTML content to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') {
    return ''
  }
  
  return DOMPurify.sanitize(input);
}

/**
 * Validate and sanitize file paths to prevent path traversal
 */
export function sanitizePath(path: string): string {
  if (typeof path !== 'string') {
    throw new Error('Invalid path type')
  }
  
  // Remove dangerous characters and sequences
  const sanitized = path
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[<>:"|?*]/g, '') // Remove invalid filename characters
    .replace(/^\/+/, '') // Remove leading slashes
    .substring(0, 255) // Limit length
  
  if (!sanitized || sanitized.includes('..')) {
    throw new Error('Invalid file path')
  }
  
  return sanitized
}

/**
 * Validate origin for cross-origin communications
 */
export function validateOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (!origin || typeof origin !== 'string') {
    return false
  }
  
  return allowedOrigins.includes(origin)
}

/**
 * Sanitize object for safe serialization
 */
export function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }
  
  if (typeof obj === 'string') {
    return sanitizeForLog(obj)
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj
  }
  
  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map(item => sanitizeObject(item))
  }
  
  if (typeof obj === 'object') {
    const sanitized: Record<string, any> = {}
    const allowedKeys = Object.keys(obj).slice(0, 50) // Limit object size
    
    for (const key of allowedKeys) {
      if (typeof key === 'string' && key.length < 100) {
        sanitized[sanitizeForLog(key)] = sanitizeObject(obj[key])
      }
    }
    
    return sanitized
  }
  
  return String(obj).substring(0, 500)
}