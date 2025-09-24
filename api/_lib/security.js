// Security utilities for API endpoints

/**
 * Validates CSRF token to prevent cross-site request forgery
 */
export function validateCsrfToken(token, sessionToken) {
  if (!token || !sessionToken) {
    return false
  }
  
  // Simple validation - in production, use proper CSRF token generation/validation
  // This should be replaced with a proper CSRF implementation
  const expectedToken = generateCsrfToken(sessionToken)
  return token === expectedToken
}

/**
 * Generates CSRF token based on session
 */
export function generateCsrfToken(sessionToken) {
  if (!sessionToken) {
    return null
  }
  
  // Simple implementation - should use proper cryptographic methods in production
  return Buffer.from(sessionToken).toString('base64').substring(0, 32)
}

/**
 * Sanitizes input for logging
 */
export function sanitizeForLog(input) {
  if (input === null || input === undefined) {
    return 'null'
  }
  
  const str = String(input)
  return str
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[<>"'`\\]/g, '')
    .substring(0, 500)
}

/**
 * Validates origin for CORS
 */
export function isValidOrigin(origin, allowedOrigins = []) {
  if (!origin) return false
  
  const defaultAllowed = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://mihas-application.netlify.app',
    process.env.VITE_APP_URL
  ].filter(Boolean)
  
  const allAllowed = [...defaultAllowed, ...allowedOrigins]
  return allAllowed.includes(origin)
}

/**
 * Rate limiting utility
 */
const rateLimitMap = new Map()

export function checkRateLimit(identifier, maxRequests = 100, windowMs = 60000) {
  const now = Date.now()
  const windowStart = now - windowMs
  
  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, [])
  }
  
  const requests = rateLimitMap.get(identifier)
  
  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => timestamp > windowStart)
  
  if (validRequests.length >= maxRequests) {
    return false
  }
  
  validRequests.push(now)
  rateLimitMap.set(identifier, validRequests)
  
  return true
}