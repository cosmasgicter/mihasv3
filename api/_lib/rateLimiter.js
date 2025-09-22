const { supabaseAdminClient } = require('./supabaseClient')

const DEFAULT_WINDOW_MS = Number.parseInt(process.env.RATE_LIMIT_DEFAULT_WINDOW_MS || process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)
const DEFAULT_MAX_ATTEMPTS = Number.parseInt(process.env.RATE_LIMIT_DEFAULT_MAX_ATTEMPTS || process.env.RATE_LIMIT_MAX_REQUESTS || '60', 10)
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || 'request_rate_limits'

let currentStore = createInMemoryFallbackStore()

function createSupabaseRateLimitStore() {
  if (!supabaseAdminClient) {
    return createInMemoryFallbackStore()
  }

  return {
    async get(key) {
      try {
        const { data, error } = await supabaseAdminClient
          .from(RATE_LIMIT_TABLE)
          .select('key,count,reset_at,window_ms')
          .eq('key', key)
          .maybeSingle()

        if (error && error.code !== 'PGRST116') {
          console.warn('Rate limiter DB error, falling back to memory:', error.message)
          return null
        }

        if (!data) {
          return null
        }

        return {
          key: data.key,
          count: typeof data.count === 'number' ? data.count : 0,
          resetAt: data.reset_at ? new Date(data.reset_at) : null,
          windowMs: typeof data.window_ms === 'number' ? data.window_ms : DEFAULT_WINDOW_MS
        }
      } catch (error) {
        console.warn('Rate limiter get error, falling back:', error.message)
        return null
      }
    },
    async set(record) {
      try {
        const payload = {
          key: record.key,
          count: record.count,
          reset_at: record.resetAt.toISOString(),
          window_ms: record.windowMs,
          updated_at: new Date().toISOString()
        }

        const { error } = await supabaseAdminClient
          .from(RATE_LIMIT_TABLE)
          .upsert(payload, { onConflict: 'key' })

        if (error) {
          console.warn('Rate limiter set error:', error.message)
        }
      } catch (error) {
        console.warn('Rate limiter set error:', error.message)
      }
    },
    async delete(key) {
      try {
        const { error } = await supabaseAdminClient
          .from(RATE_LIMIT_TABLE)
          .delete()
          .eq('key', key)

        if (error) {
          console.warn('Rate limiter delete error:', error.message)
        }
      } catch (error) {
        console.warn('Rate limiter delete error:', error.message)
      }
    }
  }
}

function createInMemoryFallbackStore() {
  const map = new Map()

  return {
    async get(key) {
      return map.get(key) || null
    },
    async set(record) {
      map.set(record.key, record)
    },
    async delete(key) {
      map.delete(key)
    }
  }
}

function setRateLimiterStore(store) {
  currentStore = store
}

function getEnvNumber(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getLimiterConfig(prefix, overrides = {}) {
  const normalized = prefix ? prefix.toUpperCase().replace(/[^A-Z0-9]/g, '_') : 'GLOBAL'
  const maxEnv = getEnvNumber(`RATE_LIMIT_${normalized}_MAX_ATTEMPTS`, undefined)
    ?? getEnvNumber(`RATE_LIMIT_${normalized}_MAX`, undefined)
  const windowEnv = getEnvNumber(`RATE_LIMIT_${normalized}_WINDOW_MS`, undefined)

  return {
    maxAttempts: overrides.maxAttempts ?? maxEnv ?? DEFAULT_MAX_ATTEMPTS,
    windowMs: overrides.windowMs ?? windowEnv ?? DEFAULT_WINDOW_MS
  }
}

async function incrementRateLimit(key, options = {}) {
  if (!key) {
    throw new Error('Rate limit key is required')
  }

  const { windowMs } = getLimiterConfig('GLOBAL', options)
  const now = Date.now()
  const existing = await currentStore.get(key)

  let count = 1
  let resetAt = new Date(now + windowMs)

  if (existing?.resetAt && existing.resetAt.getTime() > now) {
    count = (existing.count || 0) + 1
    resetAt = existing.resetAt
  }

  await currentStore.set({ key, count, resetAt, windowMs })

  return { count, resetAt }
}

async function checkRateLimit(key, options = {}) {
  const { maxAttempts, windowMs } = getLimiterConfig('GLOBAL', options)
  const { count, resetAt } = await incrementRateLimit(key, { windowMs })

  return {
    isLimited: count > maxAttempts,
    count,
    remaining: Math.max(0, maxAttempts - count),
    resetAt,
    limit: maxAttempts
  }
}

async function clearRateLimit(key) {
  if (!key) {
    return
  }
  await currentStore.delete(key)
}

function getClientIp(req) {
  if (!req || !req.headers) {
    return 'unknown'
  }

  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp
  }

  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'
}

function buildRateLimitKey(req, { prefix = 'global', userId } = {}) {
  if (userId) {
    return `${prefix}:user:${userId}`
  }
  const ip = getClientIp(req)
  return `${prefix}:ip:${ip}`
}

function attachRateLimitHeaders(res, result) {
  if (!res || !result) {
    return
  }

  const retryAfterSeconds = Math.max(0, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))
  res.setHeader('Retry-After', retryAfterSeconds.toString())
  res.setHeader('X-RateLimit-Limit', result.limit.toString())
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString())
  res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000).toString())
}

module.exports = {
  checkRateLimit,
  clearRateLimit,
  incrementRateLimit,
  buildRateLimitKey,
  getClientIp,
  attachRateLimitHeaders,
  getLimiterConfig,
  setRateLimiterStore,
  createInMemoryFallbackStore
}

module.exports.default = module.exports
