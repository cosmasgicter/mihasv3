import { supabaseAdminClient } from './supabaseClient.js'

async function getActiveConsent(userId, consentType) {
  try {
    if (!userId || !consentType) {
      return null
    }

    const { data, error } = await supabaseAdminClient
      .from('user_consents')
      .select('id, user_id, consent_type, granted, granted_at, granted_by, revoked_at, source, metadata, notes')
      .eq('user_id', userId)
      .eq('consent_type', consentType)
      .is('revoked_at', null)
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    return data || null
  } catch (error) {
    console.error('Error getting active consent:', error)
    throw error
  }
}

async function listConsents(userId) {
  try {
    if (!userId) {
      return []
    }

    const { data, error } = await supabaseAdminClient
      .from('user_consents')
      .select('id, user_id, consent_type, granted, granted_at, granted_by, revoked_at, revoked_by, source, metadata, notes')
      .eq('user_id', userId)
      .order('granted_at', { ascending: false })
      .limit(100) // Reasonable limit for user consents

    if (error) {
      throw new Error(error.message)
    }

    return data || []
  } catch (error) {
    console.error('Error listing consents:', error)
    throw error
  }
}

async function listActiveConsentUserIds(consentType) {
  try {
    if (!consentType) {
      return []
    }

    const { data, error } = await supabaseAdminClient
      .from('user_consents')
      .select('user_id')
      .eq('consent_type', consentType)
      .is('revoked_at', null)
      .limit(10000) // Reasonable limit for bulk operations

    if (error) {
      throw new Error(error.message)
    }

    return (data || []).map(record => record.user_id)
  } catch (error) {
    console.error('Error listing active consent user IDs:', error)
    throw error
  }
}

async function grantConsent({ userId, consentType, actorId, source, metadata, notes }) {
  try {
    if (!userId || !consentType) {
      throw new Error('userId and consentType are required')
    }

    // Check for existing consent
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
      .select('id, user_id, consent_type, granted, granted_at, granted_by, source, metadata, notes')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  } catch (error) {
    console.error('Error granting consent:', error)
    throw error
  }
}

async function revokeConsent({ userId, consentType, actorId, notes }) {
  try {
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
      .select('id, user_id, consent_type, granted, granted_at, revoked_at, revoked_by, notes')
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    return data || null
  } catch (error) {
    console.error('Error revoking consent:', error)
    throw error
  }
}

async function hasActiveConsent(userId, consentType) {
  try {
    const record = await getActiveConsent(userId, consentType)
    return { active: Boolean(record), record }
  } catch (error) {
    console.error('Error checking active consent:', error)
    return { active: false, record: null, error: error.message }
  }
}

export {
  getActiveConsent,
  hasActiveConsent,
  listConsents,
  listActiveConsentUserIds,
  grantConsent,
  revokeConsent
}
