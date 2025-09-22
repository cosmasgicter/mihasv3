const { supabaseAdminClient } = require('./supabaseClient')

async function getActiveConsent(userId, consentType) {
  if (!userId || !consentType) {
    return null
  }

  const { data, error } = await supabaseAdminClient
    .from('user_consents')
    .select('*')
    .eq('user_id', userId)
    .eq('consent_type', consentType)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data || null
}

async function listConsents(userId) {
  if (!userId) {
    return []
  }

  const { data, error } = await supabaseAdminClient
    .from('user_consents')
    .select('*')
    .eq('user_id', userId)
    .order('granted_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

async function listActiveConsentUserIds(consentType) {
  if (!consentType) {
    return []
  }

  const { data, error } = await supabaseAdminClient
    .from('user_consents')
    .select('user_id')
    .eq('consent_type', consentType)
    .is('revoked_at', null)

  if (error) {
    throw new Error(error.message)
  }

  return (data || []).map(record => record.user_id)
}

async function grantConsent({ userId, consentType, actorId, source, metadata, notes }) {
  if (!userId || !consentType) {
    throw new Error('userId and consentType are required')
  }

  const existing = await getActiveConsent(userId, consentType)
  if (existing) {
    return existing
  }

  const payload = {
    user_id: userId,
    consent_type: consentType,
    granted: true,
    granted_at: new Date().toISOString(),
    granted_by: actorId || userId,
    source: source || null,
    metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : {},
    notes: notes || null
  }

  const { data, error } = await supabaseAdminClient
    .from('user_consents')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function revokeConsent({ userId, consentType, actorId, notes }) {
  if (!userId || !consentType) {
    throw new Error('userId and consentType are required')
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdminClient
    .from('user_consents')
    .update({
      revoked_at: now,
      revoked_by: actorId || userId,
      notes: notes || null
    })
    .eq('user_id', userId)
    .eq('consent_type', consentType)
    .is('revoked_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data || null
}

async function hasActiveConsent(userId, consentType) {
  const record = await getActiveConsent(userId, consentType)
  return { active: Boolean(record), record }
}

module.exports = {
  getActiveConsent,
  hasActiveConsent,
  listConsents,
  listActiveConsentUserIds,
  grantConsent,
  revokeConsent
}
