import { createClient } from '@supabase/supabase-js'
import { retryFetch } from './retryFetch.js'
import './dnsConfig.js'

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'admissions_officer'])
const REQUEST_ROLE_CACHE_SYMBOL = Symbol.for('mihas.roleCache')

// Hardcoded credentials for Cloudflare Workers
const supabaseUrl = 'https://mylgegkqoddcrxtwcclb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUxMjA4MywiZXhwIjoyMDczMDg4MDgzfQ.FsspKE5bjcG4TW8IvG-N0o7W0E7ljxznwlzJCm50ZRE';

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

const supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey, clientOptions)
const supabaseAnonClient = supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, clientOptions)
  : null

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
    }, error => {
      cache?.delete(user.id)
      throw error
    })

  cache?.set(user.id, fetchPromise)
  return fetchPromise
}

async function processProfile(req, profile, payload) {
  const user = {
    id: profile.id,
    email: profile.email,
    app_metadata: {},
    user_metadata: {},
    role: profile.role
  }
  
  console.log('[getUserFromRequest] User loaded:', user.id, user.email, 'role:', profile.role)

  let roles = profile.role ? [profile.role] : []
  
  try {
    const dbRoles = await resolveRoles(req, user)
    if (dbRoles && dbRoles.length > 0) {
      roles = dbRoles
    }
  } catch (rolesError) {
    console.log('[getUserFromRequest] Role resolution error, using profile role:', rolesError.message)
  }

  const isAdmin = roles.some(role => ADMIN_ROLES.has(role))

  return { user, roles, isAdmin }
}

async function getUserFromRequest(req, { requireAdmin = false } = {}) {
  const headers = req.headers || {}
  // Handle both plain objects and Headers instances
  const authHeader = typeof headers.get === 'function' 
    ? headers.get('authorization') || headers.get('Authorization')
    : headers.authorization || headers.Authorization
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
      // Cloudflare Workers compatible base64 decode
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(base64);
      payload = JSON.parse(decoded);
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
    
    console.log('[getUserFromRequest] Fetching profile for user:', userId)
    console.log('[getUserFromRequest] Supabase URL:', supabaseUrl)
    console.log('[getUserFromRequest] Service key exists:', !!supabaseServiceKey)
    
    const { data: profile, error: userError } = await supabaseAdminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    
    console.log('[getUserFromRequest] Query result - data:', !!profile, 'error:', userError?.message)
    
    if (userError) {
      console.log('[getUserFromRequest] Profile fetch error:', JSON.stringify(userError))
      return { error: 'User not found' }
    }
    
    if (!profile) {
      console.log('[getUserFromRequest] No profile found for user:', userId)
      // Try to create profile from JWT metadata
      const userEmail = payload.email
      const userName = payload.user_metadata?.full_name || payload.user_metadata?.name || 'User'
      const nameParts = userName.split(' ')
      
      const { error: createError } = await supabaseAdminClient
        .from('profiles')
        .insert({
          id: userId,
          email: userEmail,
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          role: 'student'
        })
      
      if (createError) {
        console.log('[getUserFromRequest] Failed to create profile:', createError.message)
        return { error: 'User profile not found' }
      }
      
      // Fetch the newly created profile
      const { data: newProfile } = await supabaseAdminClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (!newProfile) {
        return { error: 'User profile not found' }
      }
      
      return await processProfile(req, newProfile, payload)
    }
    
    const authContext = await processProfile(req, profile, payload)
    
    if (requireAdmin && !authContext.isAdmin) {
      return { error: 'Access denied. You do not have permission for this action.' }
    }

    return authContext
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
  clearRequestRoleCache
}
