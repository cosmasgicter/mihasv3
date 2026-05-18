// Security utilities for sanitization and validation

/**
 * Canonical input sanitizer — trims whitespace, returns empty string for
 * null/undefined. This is the single source of truth; do not duplicate.
 */
export function sanitizeInput(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Sanitizes input for logging to prevent log injection attacks
 */
export function sanitizeForLog(input: unknown): string {
  if (input === null || input === undefined) {
    return 'null'
  }
  
  const str = String(input)
  // Remove potentially dangerous characters and limit length
  return str
    .replace(/[\r\n\t]/g, ' ')  // Replace newlines and tabs with spaces
    .replace(/[<>\"'`\\]/g, '')  // Remove HTML/script injection chars
    .substring(0, 500)  // Limit length
}

/**
 * Sanitizes HTML content to prevent XSS attacks
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Validates and sanitizes URLs to prevent SSRF attacks
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }
    
    // Block private IP ranges
    const hostname = parsed.hostname
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('169.254.') ||
      hostname === '::1'
    ) {
      return null
    }
    
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Validates file paths to prevent path traversal attacks
 */
export function sanitizeFilePath(path: string): string {
  return path
    .replace(/\.\./g, '')  // Remove path traversal sequences
    .replace(/[<>:"|?*]/g, '')  // Remove invalid filename characters
    .replace(/^\/+/, '')  // Remove leading slashes
    .substring(0, 255)  // Limit length
}

/**
 * Validates and sanitizes command arguments to prevent command injection
 */
export function sanitizeCommandArg(arg: string): string {
  // Only allow alphanumeric characters, hyphens, underscores, and dots
  return arg.replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 100)
}

/**
 * Validates origin for cross-origin communications
 */
export function isValidOrigin(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes(origin)
}

/**
 * Generates a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const randomArray = new Uint8Array(length)
  crypto.getRandomValues(randomArray)
  
  for (let i = 0; i < length; i++) {
    result += chars[randomArray[i]! % chars.length]
  }
  
  return result
}

/**
 * Validates CSRF token
 */
export function validateCsrfToken(token: string, expectedToken: string): boolean {
  if (!token || !expectedToken || token.length !== expectedToken.length) {
    return false
  }
  
  // Use constant-time comparison to prevent timing attacks
  let result = 0
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i)
  }
  
  return result === 0
}
