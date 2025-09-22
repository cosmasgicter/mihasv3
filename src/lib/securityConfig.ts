/**
 * Security configuration and Content Security Policy setup
 * Prevents code injection vulnerabilities including Function() constructor usage
 */

import { initializeSecurityPatches } from './securityPatches'

/**
 * Content Security Policy configuration
 */
export const CSP_CONFIG = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Required for Vite in development
    "https://challenges.cloudflare.com", // Cloudflare Turnstile
    "https://*.supabase.co"
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for Tailwind CSS
    "https://fonts.googleapis.com"
  ],
  'font-src': [
    "'self'",
    "https://fonts.gstatic.com"
  ],
  'img-src': [
    "'self'",
    "data:",
    "blob:",
    "https:",
    "http:"
  ],
  'connect-src': [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co"
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],

  'upgrade-insecure-requests': []
}

/**
 * Generate CSP header string
 */
export function generateCSPHeader(): string {
  return Object.entries(CSP_CONFIG)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive.replace(/-/g, '-')
      }
      return `${directive.replace(/-/g, '-')} ${sources.join(' ')}`
    })
    .join('; ')
}

/**
 * Security headers configuration
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': generateCSPHeader(),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
}

/**
 * Disable dangerous global functions to prevent code injection - DISABLED FOR LOCAL DEVELOPMENT
 */
export function disableDangerousFunctions(): void {
  // Security functions disabled for local development
  console.log('Security functions disabled for local development')
}

/**
 * Input sanitization utilities
 */
export class SecuritySanitizer {
  /**
   * Sanitize HTML content to prevent XSS
   */
  static sanitizeHTML(html: string): string {
    const div = document.createElement('div')
    div.textContent = html
    return div.innerHTML
  }
  
  /**
   * Sanitize user input for safe display
   */
  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>\"'&]/g, (match) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        }
        return entities[match] || match
      })
      .trim()
      .substring(0, 1000) // Limit length
  }
  
  /**
   * Sanitize URL to prevent javascript: and data: schemes
   */
  static sanitizeURL(url: string): string {
    try {
      const urlObj = new URL(url)
      const allowedProtocols = ['http:', 'https:', 'mailto:']
      
      if (!allowedProtocols.includes(urlObj.protocol)) {
        throw new Error('Protocol not allowed')
      }
      
      return urlObj.toString()
    } catch {
      return '#'
    }
  }
  
  /**
   * Validate and sanitize JSON input
   */
  static sanitizeJSON(jsonString: string): any {
    try {
      // Remove potentially dangerous patterns
      const cleaned = jsonString
        .replace(/__proto__/g, '')
        .replace(/constructor/g, '')
        .replace(/prototype/g, '')
      
      const parsed = JSON.parse(cleaned)
      
      // Remove dangerous properties from parsed object
      if (parsed && typeof parsed === 'object') {
        this.removeDangerousProperties(parsed)
      }
      
      return parsed
    } catch (error) {
      throw new Error('Invalid JSON input')
    }
  }
  
  /**
   * Recursively remove dangerous properties from objects
   */
  private static removeDangerousProperties(obj: any): void {
    if (!obj || typeof obj !== 'object') return
    
    const dangerousProps = ['__proto__', 'constructor', 'prototype']
    
    for (const prop of dangerousProps) {
      delete obj[prop]
    }
    
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        this.removeDangerousProperties(value)
      }
    }
  }
}

/**
 * Rate limiting helpers backed by Supabase persistence.
 */
export interface RateLimitResult {
  isLimited: boolean
  count: number
  remaining: number
  resetAt: Date
  limit: number
}

interface RateLimitRecord {
  key: string
  count: number
  resetAt: Date
  windowMs: number
}

type ServerEnv = Record<string, string | undefined>

function getServerEnv(): ServerEnv {
  if (typeof process === 'undefined' || !process.env) {
    throw new Error('Rate limiter helpers are only available in a server environment')
  }
  return process.env
}

function resolveSupabaseRestUrl(env: ServerEnv): string {
  const baseUrl = env.SUPABASE_REST_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL
  if (!baseUrl) {
    throw new Error('Supabase URL is not configured for rate limiting')
  }
  return `${baseUrl.replace(/\/$/, '')}/rest/v1`
}

function resolveSupabaseServiceKey(env: ServerEnv): string {
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for rate limiting')
  }
  return key
}

function getRateLimitTable(env: ServerEnv): string {
  return env.RATE_LIMIT_TABLE || 'request_rate_limits'
}

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60000
const DEFAULT_RATE_LIMIT_MAX = 60

function getDefaultWindowMs(env: ServerEnv): number {
  const value = env.RATE_LIMIT_DEFAULT_WINDOW_MS || env.RATE_LIMIT_WINDOW_MS
  const parsed = value ? Number.parseInt(value, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_LIMIT_WINDOW_MS
}

function getDefaultMaxAttempts(env: ServerEnv): number {
  const value = env.RATE_LIMIT_DEFAULT_MAX_ATTEMPTS || env.RATE_LIMIT_MAX_REQUESTS
  const parsed = value ? Number.parseInt(value, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_LIMIT_MAX
}

async function fetchRateLimitRecord(key: string): Promise<RateLimitRecord | null> {
  const env = getServerEnv()
  const restUrl = resolveSupabaseRestUrl(env)
  const serviceKey = resolveSupabaseServiceKey(env)
  const table = getRateLimitTable(env)

  const response = await fetch(
    `${restUrl}/${table}?key=eq.${encodeURIComponent(key)}&select=key,count,reset_at,window_ms&limit=1`,
    {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json'
      }
    }
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Failed to read rate limit record: ${errorText}`)
  }

  const data = await response.json()
  const record = Array.isArray(data) ? data[0] : null

  if (!record) {
    return null
  }

  return {
    key: record.key,
    count: typeof record.count === 'number' ? record.count : 0,
    resetAt: record.reset_at ? new Date(record.reset_at) : new Date(Date.now()),
    windowMs: typeof record.window_ms === 'number' ? record.window_ms : getDefaultWindowMs(env)
  }
}

async function persistRateLimitRecord(record: RateLimitRecord): Promise<void> {
  const env = getServerEnv()
  const restUrl = resolveSupabaseRestUrl(env)
  const serviceKey = resolveSupabaseServiceKey(env)
  const table = getRateLimitTable(env)

  const response = await fetch(`${restUrl}/${table}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      key: record.key,
      count: record.count,
      reset_at: record.resetAt.toISOString(),
      window_ms: record.windowMs,
      updated_at: new Date().toISOString()
    })
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Failed to persist rate limit record: ${errorText}`)
  }
}

async function deleteRateLimitRecord(key: string): Promise<void> {
  const env = getServerEnv()
  const restUrl = resolveSupabaseRestUrl(env)
  const serviceKey = resolveSupabaseServiceKey(env)
  const table = getRateLimitTable(env)

  const response = await fetch(`${restUrl}/${table}?key=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json'
    }
  })

  if (!response.ok && response.status !== 204) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Failed to delete rate limit record: ${errorText}`)
  }
}

export interface RateLimitOptions {
  windowMs?: number
  maxAttempts?: number
  scope?: string
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function resolveRateLimitOptions(options: RateLimitOptions = {}): { windowMs: number; maxAttempts: number } {
  const env = getServerEnv()
  const scope = options.scope ? options.scope.toUpperCase().replace(/[^A-Z0-9]/g, '_') : 'GLOBAL'
  const scopedMax = env[`RATE_LIMIT_${scope}_MAX_ATTEMPTS`] || env[`RATE_LIMIT_${scope}_MAX`]
  const scopedWindow = env[`RATE_LIMIT_${scope}_WINDOW_MS`]

  const parsedMax = scopedMax ? Number.parseInt(scopedMax, 10) : NaN
  const parsedWindow = scopedWindow ? Number.parseInt(scopedWindow, 10) : NaN

  return {
    windowMs: isFiniteNumber(options.windowMs)
      ? options.windowMs
      : (Number.isFinite(parsedWindow) && parsedWindow > 0 ? parsedWindow : getDefaultWindowMs(env)),
    maxAttempts: isFiniteNumber(options.maxAttempts)
      ? options.maxAttempts
      : (Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : getDefaultMaxAttempts(env))
  }
}

export async function incrementRateLimitCounter(key: string, options: RateLimitOptions = {}): Promise<{ count: number; resetAt: Date }> {
  if (!key) {
    throw new Error('Rate limit key is required')
  }

  const { windowMs } = resolveRateLimitOptions(options)
  const now = Date.now()
  const existing = await fetchRateLimitRecord(key)

  let count = 1
  let resetAt = new Date(now + windowMs)

  if (existing && existing.resetAt.getTime() > now) {
    count = (existing.count || 0) + 1
    resetAt = existing.resetAt
  }

  await persistRateLimitRecord({ key, count, resetAt, windowMs })

  return { count, resetAt }
}

export async function checkPersistentRateLimit(key: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const { maxAttempts, windowMs } = resolveRateLimitOptions(options)
  const { count, resetAt } = await incrementRateLimitCounter(key, { windowMs })

  return {
    isLimited: count > maxAttempts,
    count,
    remaining: Math.max(0, maxAttempts - count),
    resetAt,
    limit: maxAttempts
  }
}

export async function clearPersistentRateLimit(key: string): Promise<void> {
  await deleteRateLimitRecord(key)
}

/**
 * Initialize security measures - DISABLED FOR LOCAL DEVELOPMENT
 */
export function initializeSecurity(): void {
  // Security measures disabled for local development
  console.log('Security measures disabled for local development')
}