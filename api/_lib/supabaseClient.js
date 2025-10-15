import { createClient } from '@supabase/supabase-js'
import { retryFetch } from './retryFetch.js'
import './dnsConfig.js'
import {
  mockSupabaseAdminClient,
  mockSupabaseAnonClient,
  MockSessionStore
} from './mockSupabaseClient.js'
import { mockUsers } from './mockData.js'

const rawMockFlag = process.env.MIHAS_USE_MOCK_DATA ?? 'false'
const useMockSupabase = String(rawMockFlag).toLowerCase() === 'true'

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

  console.log('[supabaseClient] SUPABASE_SERVICE_ROLE_KEY present:', !!supabaseServiceKey)
  console.log('[supabaseClient] Service key length:', supabaseServiceKey?.length)
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

  try {
    const { data: rolesData, error: rolesError } = await supabaseAdminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (rolesError) {
      console.log('[fetchRolesFromDatabase] Database error:', rolesError.message)
      // If user_roles table doesn't exist or has issues, check profiles table
      const { data: profileData, error: profileError } = await supabaseAdminClient
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      
      if (profileError) {
        console.log('[fetchRolesFromDatabase] Profile error:', profileError.message)
        return []
      }
      
      return profileData?.role ? [profileData.role] : []
    }

    return rolesData?.map(role => role.role) ?? []
  } catch (error) {
    console.log('[fetchRolesFromDatabase] Unexpected error:', error.message)
    return []
  }
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
    const parts = token.split('.')
    if (parts.length !== 3) {
      return { error: 'Invalid token format' }
    }
    
    let payload
    try {
      payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    } catch (e) {
      console.log('[getUserFromRequest] JWT decode error:', e.message)
      return { error: 'Invalid token format' }
    }
    
    const userId = payload.sub
    if (!userId) {
      return { error: 'Invalid token payload' }
    }
    
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return { error: 'Token expired' }
    }
    
    const { data: profile, error: userError } = await supabaseAdminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (userError) {
      console.log('[getUserFromRequest] Profile fetch error:', userError.message)
      return { error: 'User not found' }
    }
    
    if (!profile) {
      console.log('[getUserFromRequest] No profile found for user:', userId)
      return { error: 'User not found' }
    }
    
    const user = {
      id: profile.id,
      email: profile.email,
      app_metadata: {},
      user_metadata: {},
      role: profile.role
    }
    
    console.log('[getUserFromRequest] User loaded:', user.id, user.email)

    let roles
    try {
      roles = await resolveRoles(req, user)
    } catch (rolesError) {
      const metadataRoles = extractRolesFromUserToken(user)
      if (metadataRoles && metadataRoles.length > 0) {
        roles = metadataRoles
      } else {
        return { error: 'Access denied. You do not have permission for this action.' }
      }
    }

    const isAdmin = roles.some(role => ADMIN_ROLES.has(role))

    if (requireAdmin && !isAdmin) {
      return { error: 'Access denied. You do not have permission for this action.' }
    }

    return { user, roles, isAdmin }
  } catch (networkError) {
    console.error('[getUserFromRequest] Exception:', networkError.message)
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
