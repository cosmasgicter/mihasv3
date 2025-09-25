import { createClient } from '@supabase/supabase-js'
import { retryFetch } from './retryFetch.js'
import './dnsConfig.js'
import {
  mockSupabaseAdminClient,
  mockSupabaseAnonClient,
  MockSessionStore
} from './mockSupabaseClient.js'
import { mockUsers } from './mockData.js'

const rawMockFlag = process.env.MIHAS_USE_MOCK_DATA ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')
const useMockSupabase = String(rawMockFlag).toLowerCase() !== 'false'

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'admissions_officer'])
const REQUEST_ROLE_CACHE_SYMBOL = Symbol.for('mihas.roleCache')

let supabaseAdminClient
let supabaseAnonClient

if (useMockSupabase) {
  supabaseAdminClient = mockSupabaseAdminClient
  supabaseAnonClient = mockSupabaseAnonClient
} else {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('VITE_SUPABASE_URL is not configured')
  }

  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side Supabase access')
  }

  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      fetch: (url, options = {}) => {
        return retryFetch(url, {
          ...options,
          timeout: 30000
        }, 3)
      }
    }
  }

  supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey, clientOptions)
  supabaseAnonClient = supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, clientOptions)
    : null
}

function getRequestRoleCache(req) {
  if (!req || typeof req !== 'object') {
    return null
  }

  if (req[REQUEST_ROLE_CACHE_SYMBOL]) {
    return req[REQUEST_ROLE_CACHE_SYMBOL]
  }

  const cache = new Map()
  try {
    Object.defineProperty(req, REQUEST_ROLE_CACHE_SYMBOL, {
      value: cache,
      enumerable: false,
      configurable: false
    })
  } catch (error) {
    req[REQUEST_ROLE_CACHE_SYMBOL] = cache
  }
  return cache
}

function extractRolesFromUserToken(user) {
  if (!user) {
    return null
  }

  const candidateSets = [
    user.app_metadata?.roles,
    user.user_metadata?.roles,
    user.app_metadata?.claims?.roles,
    user.user_metadata?.claims?.roles
  ]

  for (const candidate of candidateSets) {
    if (!candidate) {
      continue
    }

    if (Array.isArray(candidate)) {
      return candidate
    }

    if (typeof candidate === 'string') {
      return candidate.split(',').map(role => role.trim()).filter(Boolean)
    }
  }

  const singleRole = user.app_metadata?.role || user.user_metadata?.role
  if (typeof singleRole === 'string') {
    return [singleRole]
  }

  return null
}

async function fetchRolesFromDatabase(userId) {
  if (useMockSupabase) {
    const user = mockUsers.find(candidate => candidate.id === userId)
    return user ? [...user.roles] : []
  }

  const { data: rolesData, error: rolesError } = await supabaseAdminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (rolesError) {
    throw new Error(rolesError.message)
  }

  return rolesData?.map(role => role.role) ?? []
}

async function resolveRoles(req, user) {
  const cache = getRequestRoleCache(req)
  if (cache?.has(user.id)) {
    return cache.get(user.id)
  }

  const cachedFromToken = extractRolesFromUserToken(user)
  if (cachedFromToken) {
    cache?.set(user.id, cachedFromToken)
    return cachedFromToken
  }

  const fetchPromise = fetchRolesFromDatabase(user.id)
    .then(roles => {
      cache?.set(user.id, roles)
      return roles
    })
    .catch(error => {
      cache?.delete(user.id)
      throw error
    })

  cache?.set(user.id, fetchPromise)
  return fetchPromise
}

async function getUserFromRequest(req, { requireAdmin = false } = {}) {
  const headers = req.headers || {}
  const authHeader = headers.authorization || headers.Authorization
  if (!authHeader) {
    return { error: 'No authorization header provided' }
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return { error: 'Invalid authorization header' }
  }

  try {
    const { data, error } = await supabaseAdminClient.auth.getUser(token)
    if (error || !data?.user) {
      return { error: 'Invalid or expired token' }
    }

    const user = data.user
    let roles
    try {
      roles = await resolveRoles(req, user)
    } catch (rolesError) {
      return { error: rolesError.message }
    }

    const isAdmin = roles.some(role => ADMIN_ROLES.has(role))

    if (requireAdmin && !isAdmin) {
      return { error: 'Access denied' }
    }

    return { user, roles, isAdmin }
  } catch (networkError) {
    if (useMockSupabase) {
      return { error: 'Invalid or expired token' }
    }
    console.error('Network error in getUserFromRequest:', networkError)
    return { error: 'Service temporarily unavailable' }
  }
}

async function requireUser(req, options) {
  const authContext = await getUserFromRequest(req, options)
  if (authContext.error) {
    throw new Error(authContext.error)
  }
  return authContext
}

function clearRequestRoleCache(req) {
  const cache = req?.[REQUEST_ROLE_CACHE_SYMBOL]
  if (cache?.clear) {
    cache.clear()
  }
}

export {
  supabaseAdminClient,
  supabaseAnonClient,
  getUserFromRequest,
  requireUser,
  clearRequestRoleCache,
  useMockSupabase,
  MockSessionStore
}
