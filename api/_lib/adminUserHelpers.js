import { supabaseAdminClient } from './supabaseClient.js'

async function fetchUserProfile(userId) {
  const { data, error } = await supabaseAdminClient
    .from('profiles')
    .select('id, email, first_name, last_name, phone, role, is_active, created_at')
    .eq('id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  if (!data) return null

  return {
    user_id: data.id,
    email: data.email,
    full_name: [data.first_name, data.last_name].filter(Boolean).join(' '),
    phone: data.phone || '',
    role: data.role,
    is_active: data.is_active,
    created_at: data.created_at
  }
}

async function fetchActiveRole(userId) {
  const { data, error } = await supabaseAdminClient
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  return data ?? null
}

async function syncUserRole(userId, role) {
  if (!role) {
    return
  }

  const { error: upsertError } = await supabaseAdminClient
    .from('user_roles')
    .upsert(
      { user_id: userId, role, is_active: true },
      { onConflict: 'user_id' }
    )

  if (upsertError) {
    throw upsertError
  }
}

function parseUserId(rawId) {
  if (Array.isArray(rawId)) {
    return rawId[0]
  }
  if (typeof rawId === 'string') {
    return rawId
  }
  return null
}

function parseAction(rawAction) {
  if (Array.isArray(rawAction)) {
    return rawAction[0] ?? null
  }
  if (typeof rawAction === 'string') {
    return rawAction
  }
  return null
}

function parseRequestBody(body) {
  if (!body) {
    return {}
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch (error) {
      throw new Error('Invalid JSON body')
    }
  }

  return body
}

async function updateAuthUserMetadata(userId, updates) {
  const authUpdates = {}

  if (typeof updates.email === 'string' && updates.email.trim()) {
    authUpdates.email = updates.email.trim()
  }

  const userMetadata = {}
  if (Object.prototype.hasOwnProperty.call(updates, 'full_name')) {
    userMetadata.full_name = updates.full_name
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'phone')) {
    userMetadata.phone = updates.phone
  }
  if (Object.keys(userMetadata).length > 0) {
    authUpdates.user_metadata = userMetadata
  }

  const appMetadata = {}
  if (typeof updates.role === 'string' && updates.role.trim()) {
    const role = updates.role.trim()
    appMetadata.role = role
    appMetadata.roles = [role]
  }
  if (Object.keys(appMetadata).length > 0) {
    authUpdates.app_metadata = appMetadata
  }

  if (Object.keys(authUpdates).length === 0) {
    return
  }

  const { error } = await supabaseAdminClient.auth.admin.updateUserById(userId, authUpdates)
  if (error) {
    throw error
  }
}

export {
  fetchUserProfile,
  fetchActiveRole,
  syncUserRole,
  parseUserId,
  parseAction,
  parseRequestBody,
  updateAuthUserMetadata
}
