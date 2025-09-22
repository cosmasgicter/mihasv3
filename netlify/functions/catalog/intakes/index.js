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
  //   const rateKey = buildRateLimitKey(req, { prefix: 'catalog-intakes' })
  //   const rateResult = await checkRateLimit(
  //     rateKey,
  //     getLimiterConfig('catalog_intakes', { maxAttempts: 45, windowMs: 60_000 })
  //   )

  //   if (rateResult.isLimited) {
  //     attachRateLimitHeaders(res, rateResult)
  //     return res.status(429).json({ error: 'Too many catalog requests. Please slow down.' })
  //   }
  // } catch (rateError) {
  //   console.error('Catalog intakes rate limiter error:', rateError)
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
        .from('intakes')
        .select('*')
        .eq('is_active', true)
        .order('application_deadline')

      if (error) {
        return res.status(400).json({ error: error.message })
      }
      return res.status(200).json({ intakes: data || [] })

    case 'POST':
      const {
        name,
        year,
        start_date,
        end_date,
        application_deadline,
        total_capacity,
        available_spots
      } = req.body
      if (!name?.trim() || !year || !start_date || !end_date || !application_deadline || !total_capacity) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const { data: newIntake, error: createError } = await supabaseAdminClient
        .from('intakes')
        .insert({
          name: name.trim(),
          year,
          start_date,
          end_date,
          application_deadline,
          total_capacity,
          available_spots: available_spots ?? total_capacity,
          is_active: true
        })
        .select()

      if (createError) {
        return res.status(400).json({ error: createError.message })
      }
      return res.status(201).json({ intake: newIntake[0] })

    case 'PUT':
      const {
        id,
        name: updateName,
        year: updateYear,
        start_date: updateStart,
        end_date: updateEnd,
        application_deadline: updateDeadline,
        total_capacity: updateCapacity,
        available_spots: updateSpots
      } = req.body
      if (!id || !updateName?.trim() || !updateYear || !updateStart || !updateEnd || !updateDeadline || !updateCapacity) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const { data: updatedIntake, error: updateError } = await supabaseAdminClient
        .from('intakes')
        .update({
          name: updateName.trim(),
          year: updateYear,
          start_date: updateStart,
          end_date: updateEnd,
          application_deadline: updateDeadline,
          total_capacity: updateCapacity,
          available_spots: updateSpots ?? updateCapacity
        })
        .eq('id', id)
        .select()

      if (updateError) {
        return res.status(400).json({ error: updateError.message })
      }
      return res.status(200).json({ intake: updatedIntake[0] })

    case 'DELETE':
      const { id: deleteId } = req.body
      if (!deleteId) {
        return res.status(400).json({ error: 'Intake ID is required' })
      }

      const { data: deletedIntake, error: deleteError } = await supabaseAdminClient
        .from('intakes')
        .update({ is_active: false })
        .eq('id', deleteId)
        .select()

      if (deleteError) {
        return res.status(400).json({ error: deleteError.message })
      }
      return res.status(200).json({ intake: deletedIntake[0] })

    default:
      return res.status(405).json({ error: 'Method not allowed' })
  }
}
