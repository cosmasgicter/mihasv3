const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')

const APPLICATION_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected']

const SORT_COLUMN_MAP = {
  date: 'created_at',
  name: 'full_name',
  status: 'status',
  program: 'program',
  paymentStatus: 'payment_status',
  created_at: 'created_at',
  full_name: 'full_name'
}

const dependencies = {
  supabaseClient: supabaseAdminClient,
  getUserFromRequest
}

function sanitizeSearchTerm(value = '') {
  return value
    .trim()
    .replace(/[%_]/g, match => `\\${match}`)
    .replace(/,/g, '\\,')
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
}

function determineSortColumn(sortBy) {
  if (typeof sortBy === 'string' && SORT_COLUMN_MAP[sortBy]) {
    return SORT_COLUMN_MAP[sortBy]
  }

  if (typeof sortBy === 'string' && /^[a-z0-9_]+$/i.test(sortBy)) {
    return sortBy
  }

  return 'created_at'
}

function applyFilters(queryBuilder, filters = {}, { includeStatus = true } = {}) {
  let nextQuery = queryBuilder

  if (filters.mine && filters.userId) {
    nextQuery = nextQuery.eq('user_id', filters.userId)
  }

  if (includeStatus && filters.status) {
    nextQuery = nextQuery.eq('status', filters.status)
  }

  if (filters.program) {
    nextQuery = nextQuery.eq('program', filters.program)
  }

  if (filters.institution) {
    nextQuery = nextQuery.eq('institution', filters.institution)
  }

  if (filters.paymentStatus) {
    nextQuery = nextQuery.eq('payment_status', filters.paymentStatus)
  }

  if (filters.startDate) {
    nextQuery = nextQuery.gte('created_at', filters.startDate)
  }

  if (filters.endDate) {
    nextQuery = nextQuery.lte('created_at', filters.endDate)
  }

  if (filters.search) {
    const sanitized = sanitizeSearchTerm(filters.search)
    if (sanitized) {
      const pattern = `%${sanitized}%`
      nextQuery = nextQuery.or(
        ['full_name', 'email', 'application_number'].map(field => `${field}.ilike.${pattern}`).join(',')
      )
    }
  }

  return nextQuery
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end()
  }

  console.log(`${req.method} /api/applications - Headers:`, req.headers)

  if (req.method === 'GET') {
    try {
      const authContext = await dependencies.getUserFromRequest(req)
      if (authContext.error) {
        return res.status(401).json({ error: authContext.error })
      }

      const {
        page = 0,
        pageSize = 10,
        status,
        mine,
        search,
        program,
        institution,
        paymentStatus,
        startDate,
        endDate,
        sortBy,
        sortOrder,
        includeStats
      } = req.query

      const pageNumber = Number.isNaN(parseInt(page, 10)) ? 0 : parseInt(page, 10)
      const pageSizeNumber = Number.isNaN(parseInt(pageSize, 10)) ? 10 : parseInt(pageSize, 10)

      const from = pageNumber * pageSizeNumber
      const to = from + pageSizeNumber - 1

      const userId = authContext.user?.id
      const isAdmin = Boolean(authContext.isAdmin)
      const mineRequested = parseBoolean(mine)
      const shouldFilterByUser = Boolean(userId) && (!isAdmin || mineRequested)

      const filterOptions = {
        userId,
        mine: shouldFilterByUser,
        status,
        search,
        program,
        institution,
        paymentStatus,
        startDate,
        endDate
      }

      const sortColumn = determineSortColumn(sortBy)
      const sortAscending = typeof sortOrder === 'string' && sortOrder.toLowerCase() === 'asc'

      let query = applyFilters(
        dependencies.supabaseClient
          .from('applications_new')
          .select('*', { count: 'exact' }),
        filterOptions
      )

      query = query
        .order(sortColumn, { ascending: sortAscending })
        .range(from, to)

      const { data, error, count } = await query

      if (error) {
        return res.status(400).json({ error: error.message })
      }

      let stats

      if (parseBoolean(includeStats)) {
        const baseCountQuery = applyFilters(
          dependencies.supabaseClient
            .from('applications_new')
            .select('id', { count: 'exact', head: true }),
          filterOptions,
          { includeStatus: false }
        )

        const { count: baseCount, error: baseCountError } = await baseCountQuery

        if (baseCountError) {
          return res.status(400).json({ error: baseCountError.message })
        }

        const statusBreakdown = {}

        for (const statusValue of APPLICATION_STATUSES) {
          const statusQuery = applyFilters(
            dependencies.supabaseClient
              .from('applications_new')
              .select('id', { count: 'exact', head: true })
              .eq('status', statusValue),
            filterOptions,
            { includeStatus: false }
          )

          const { count: statusCount, error: statusError } = await statusQuery

          if (statusError) {
            return res.status(400).json({ error: statusError.message })
          }

          statusBreakdown[statusValue] = statusCount || 0
        }

        stats = {
          total: baseCount || 0,
          statusBreakdown
        }
      }

      return res.json({
        applications: data || [],
        totalCount: count || 0,
        page: pageNumber,
        pageSize: pageSizeNumber,
        ...(stats ? { stats } : {})
      })
    } catch (error) {
      console.error('Applications list error:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  if (req.method === 'POST') {
    try {
      const authContext = await dependencies.getUserFromRequest(req)
      if (authContext.error) {
        return res.status(401).json({ error: authContext.error })
      }

      let body = req.body
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (e) {
          return res.status(400).json({ error: 'Invalid JSON in request body' })
        }
      }

      console.log('POST /api/applications - Request body:', JSON.stringify(body, null, 2))
      console.log('POST /api/applications - User ID:', authContext.user.id)

      const applicationData = {
        ...body,
        user_id: authContext.user.id
      }

      const { data, error } = await dependencies.supabaseClient
        .from('applications_new')
        .insert(applicationData)
        .select()
        .single()

      if (error) {
        console.error('Database insert error:', error)
        return res.status(400).json({ error: error.message })
      }

      return res.status(201).json(data)
    } catch (error) {
      console.error('Application creation error:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const authContext = await dependencies.getUserFromRequest(req)
      if (authContext.error) {
        return res.status(401).json({ error: authContext.error })
      }

      let body = req.body
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (e) {
          return res.status(400).json({ error: 'Invalid JSON in request body' })
        }
      }

      const { data, error } = await dependencies.supabaseClient
        .from('applications_new')
        .insert({
          ...body,
          user_id: authContext.user.id
        })
        .select()
        .single()

      if (error) {
        return res.status(400).json({ error: error.message })
      }

      return res.status(201).json(data)
    } catch (error) {
      console.error('Application creation error:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  res.setHeader('Allow', 'GET,POST,PUT,HEAD,OPTIONS')
  return res.status(405).json({ error: 'Method not allowed' })
}

handler.__testables__ = {
  sanitizeSearchTerm,
  parseBoolean,
  determineSortColumn,
  applyFilters,
  APPLICATION_STATUSES,
  setDependencies: (overrides = {}) => {
    if (overrides.supabaseClient) {
      dependencies.supabaseClient = overrides.supabaseClient
    }
    if (overrides.getUserFromRequest) {
      dependencies.getUserFromRequest = overrides.getUserFromRequest
    }
    return { ...dependencies }
  },
  getDependencies: () => ({ ...dependencies })
}

module.exports = handler
