const { supabaseAdminClient } = require('./supabaseClient')

async function fetchUserProfile(userId) {
  const { data, error } = await supabaseAdminClient
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  return data ?? null
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

  const { error: deactivateError } = await supabaseAdminClient
    .from('user_roles')
    .update({ is_active: false })
    .eq('user_id', userId)
    .neq('role', role)

  if (deactivateError && deactivateError.code !== 'PGRST116') {
    throw deactivateError
  }

  const { data: existingRole, error: fetchError } = await supabaseAdminClient
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role', role)
    .maybeSingle()

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw fetchError
  }

  if (existingRole) {
    const { error: activateError } = await supabaseAdminClient
      .from('user_roles')
      .update({ is_active: true })
      .eq('id', existingRole.id)

    if (activateError) {
      throw activateError
    }
    return
  }

  const { error: insertError } = await supabaseAdminClient
    .from('user_roles')
    .insert({ user_id: userId, role, is_active: true })

  if (insertError) {
    throw insertError
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

module.exports = {
  fetchUserProfile,
  fetchActiveRole,
  syncUserRole,
  parseUserId,
  parseAction,
  parseRequestBody,
  updateAuthUserMetadata
}
