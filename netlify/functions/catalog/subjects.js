const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')
const {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} = require('../_lib/rateLimiter')

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  // Rate limiting temporarily disabled for testing
  // try {
  //   const rateKey = buildRateLimitKey(req, { prefix: 'catalog-subjects' })
  //   const rateResult = await checkRateLimit(
  //     rateKey,
  //     getLimiterConfig('catalog_subjects', { maxAttempts: 45, windowMs: 60_000 })
  //   )

  //   if (rateResult.isLimited) {
  //     attachRateLimitHeaders(res, rateResult)
  //     return res.status(429).json({ error: 'Too many catalog requests. Please slow down.' })
  //   }
  // } catch (rateError) {
  //   console.error('Catalog subjects rate limiter error:', rateError)
  //   return res.status(503).json({ error: 'Rate limiter unavailable' })
  // }

  // Allow public access for subjects

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { data, error } = await supabaseAdminClient
    .from('grade12_subjects')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ subjects: data || [] })
}
