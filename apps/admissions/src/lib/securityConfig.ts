/**
 * Security configuration and Content Security Policy setup
 * Prevents code injection vulnerabilities including Function() constructor usage
 */

// Security patches module removed during migration cleanup

/**
 * Content Security Policy configuration
 */
export const CSP_CONFIG = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Required for Vite in development and JSON-LD injection
    "https://va.vercel-scripts.com",
    "https://pay.lenco.co",
    "https://pay.sandbox.lenco.co"
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for Tailwind CSS
    "data:",
    "https://fonts.googleapis.com"
  ],
  'style-src-elem': [
    "'self'",
    "'unsafe-inline'",
    "data:",
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
    "https://api.mihas.edu.zm",
    "https://*.neon.tech",
    "https://pay.lenco.co",
    "https://pay.sandbox.lenco.co"
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
}

/**
 * Input sanitization utilities — import from @/lib/sanitize for the canonical SecuritySanitizer.
 * This re-export is kept for backward compatibility within securityConfig consumers.
 */
export { SecuritySanitizer } from '@/lib/sanitize';

/**
 * Secure math expression parser (merged from securityPatches.ts).
 * Replaces eval()/Function() with a safe recursive descent parser.
 */
export class SecureCodeExecution {
  static evaluateMathExpression(expression: string): number {
    const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '');
    if (!sanitized || !/^[0-9+\-*/.() ]+$/.test(sanitized)) return 0;
    try { return this.parseMathExpression(sanitized); } catch { return 0; }
  }

  private static parseMathExpression(expr: string): number {
    let pos = 0;
    const clean = expr.replace(/\s/g, '');
    const parseNumber = (): number => {
      let num = '';
      while (pos < clean.length && /[0-9.]/.test(clean[pos]!)) num += clean[pos++];
      return parseFloat(num) || 0;
    };
    const parseFactor = (): number => {
      if (clean[pos] === '(') { pos++; const r = parseExpression(); pos++; return r; }
      return parseNumber();
    };
    const parseTerm = (): number => {
      let r = parseFactor();
      while (pos < clean.length && (clean[pos] === '*' || clean[pos] === '/')) {
        const op = clean[pos++]; const right = parseFactor();
        r = op === '*' ? r * right : r / right;
      }
      return r;
    };
    const parseExpression = (): number => {
      let r = parseTerm();
      while (pos < clean.length && (clean[pos] === '+' || clean[pos] === '-')) {
        const op = clean[pos++]; const right = parseTerm();
        r = op === '+' ? r + right : r - right;
      }
      return r;
    };
    return parseExpression();
  }
}

/**
 * Client-side rate limiter (consolidated from securityPatches.ts and securityEnhancements.ts).
 */
export class RateLimiter {
  private static requests = new Map<string, number[]>();

  static checkLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;
    if (!this.requests.has(identifier)) this.requests.set(identifier, []);
    const userRequests = this.requests.get(identifier)!;
    const valid = userRequests.filter(t => t > windowStart);
    if (valid.length >= maxRequests) return false;
    valid.push(now);
    this.requests.set(identifier, valid);
    return true;
  }

  static cleanup(): void {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [key, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(t => t > cutoff);
      if (valid.length === 0) this.requests.delete(key);
      else this.requests.set(key, valid);
    }
  }
}

/**
 * Initialize security measures - DISABLED FOR LOCAL DEVELOPMENT
 */
export function initializeSecurity(): void {
  // Security measures disabled for local development
}
