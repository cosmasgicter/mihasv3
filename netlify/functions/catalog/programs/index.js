const { supabaseAdminClient, getUserFromRequest } = require('../../_lib/supabaseClient')
const {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} = require('../../_lib/rateLimiter')

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
  //   const rateKey = buildRateLimitKey(req, { prefix: 'catalog-programs' })
  //   const rateResult = await checkRateLimit(
  //     rateKey,
  //     getLimiterConfig('catalog_programs', { maxAttempts: 45, windowMs: 60_000 })
  //   )

  //   if (rateResult.isLimited) {
  //     attachRateLimitHeaders(res, rateResult)
  //     return res.status(429).json({ error: 'Too many catalog requests. Please slow down.' })
  //   }
  // } catch (rateError) {
  //   console.error('Catalog programs rate limiter error:', rateError)
  //   return res.status(503).json({ error: 'Rate limiter unavailable' })
  // }

  // Allow public access for GET requests
  if (req.method !== 'GET') {
    const authContext = await getUserFromRequest(req, { requireAdmin: true })
    if (authContext.error) {
      return res.status(401).json({ error: authContext.error })
    }
  }

  switch (req.method) {
    case 'GET':
      const { data, error } = await supabaseAdminClient
        .from('programs')
        .select(`*, institutions (id, name, slug)`)
        .eq('is_active', true)
        .order('name')

      if (error) {
        return res.status(400).json({ error: error.message })
      }
      return res.status(200).json({ programs: data || [] })

    case 'POST':
      const { name, description, duration_years, institution_id } = req.body
      if (!name?.trim() || !institution_id || !duration_years) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const { data: newProgram, error: createError } = await supabaseAdminClient
        .from('programs')
        .insert({ name: name.trim(), description: description?.trim() || null, duration_years, institution_id, is_active: true })
        .select()

      if (createError) {
        return res.status(400).json({ error: createError.message })
      }
      return res.status(201).json({ program: newProgram[0] })

    case 'PUT':
      const {
        id,
        name: updateName,
        description: updateDesc,
        duration_years: updateDuration,
        institution_id: updateInstitution
      } = req.body
      if (!id || !updateName?.trim() || !updateInstitution || !updateDuration) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const { data: updatedProgram, error: updateError } = await supabaseAdminClient
        .from('programs')
        .update({ name: updateName.trim(), description: updateDesc?.trim() || null, duration_years: updateDuration, institution_id: updateInstitution })
        .eq('id', id)
        .select()

      if (updateError) {
        return res.status(400).json({ error: updateError.message })
      }
      return res.status(200).json({ program: updatedProgram[0] })

    case 'DELETE':
      const { id: deleteId } = req.body
      if (!deleteId) {
        return res.status(400).json({ error: 'Program ID is required' })
      }

      const { data: deletedProgram, error: deleteError } = await supabaseAdminClient
        .from('programs')
        .update({ is_active: false })
        .eq('id', deleteId)
        .select()

      if (deleteError) {
        return res.status(400).json({ error: deleteError.message })
      }
      return res.status(200).json({ program: deletedProgram[0] })

    default:
      return res.status(405).json({ error: 'Method not allowed' })
  }
}
