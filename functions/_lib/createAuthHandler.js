import { supabaseAnonClient } from './supabaseClient.js'
import {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} from './rateLimiter.js'

function createAuthHandler(handler, options = {}) {
  const {
    rateLimitPrefix = 'auth',
    limiterOverrides = { maxAttempts: 8, windowMs: 60_000 }
  } = options

  return async function authRoute(req, res) {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization, x-requested-with')
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    if (!supabaseAnonClient) {
      return res.status(500).json({ error: 'Supabase anon key is not configured' })
    }

    try {
      const rateLimitKey = buildRateLimitKey(req, { prefix: rateLimitPrefix })
      const rateResult = await checkRateLimit(
        rateLimitKey,
        getLimiterConfig(rateLimitPrefix, limiterOverrides)
      )

      if (rateResult.isLimited) {
        attachRateLimitHeaders(res, rateResult)
        return res
          .status(429)
          .json({ error: 'Too many authentication attempts. Please try again later.' })
      }
    } catch (rateError) {
      console.error('Auth rate limiter error:', rateError)
      return res.status(503).json({ error: 'Rate limiter unavailable' })
    }

    try {
      return await handler(req, res, { supabaseClient: supabaseAnonClient })
    } catch (error) {
      console.error('Auth API error:', error)
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Internal server error' })
      }
    }
  }
}

export { createAuthHandler }
