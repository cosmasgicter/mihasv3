const { supabaseAdminClient } = require('./supabaseClient')

function normalizeMetadata(metadata) {
  if (metadata === null || metadata === undefined) {
    return {}
  }

  if (metadata instanceof Error) {
    return { message: metadata.message, stack: metadata.stack }
  }

  if (typeof metadata === 'object') {
    try {
      return JSON.parse(JSON.stringify(metadata))
    } catch (serializationError) {
      return { description: String(metadata), serializationError: serializationError.message }
    }
  }

  return { value: metadata }
}

function extractRequestContext(req) {
  if (!req || typeof req !== 'object') {
    return {}
  }

  const forwardedFor = req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip']
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : req.socket?.remoteAddress || null

  const userAgentHeader = req.headers?.['user-agent'] || req.headers?.['user_agent'] || null
  const requestIdHeader =
    req.headers?.['x-request-id'] || req.headers?.['cf-ray'] || null

  return {
    request_ip: ipAddress || null,
    user_agent: Array.isArray(userAgentHeader) ? userAgentHeader.join(' ') : userAgentHeader || null,
    request_id: Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader || null
  }
}

async function logAuditEvent({
  req,
  action,
  actorId,
  actorEmail,
  actorRoles,
  targetTable,
  targetId,
  targetLabel,
  metadata
}) {
  if (!action) {
    return
  }

  try {
    const payload = {
      action,
      user_id: actorId || null,
      actor_id: actorId || null,
      actor_email: actorEmail || null,
      actor_roles: Array.isArray(actorRoles) ? actorRoles : actorRoles ? [actorRoles] : [],
      table_name: targetTable || null,
      record_id: targetId ? String(targetId) : null,
      details: normalizeMetadata(metadata),
      ip_address: extractRequestContext(req).request_ip,
      user_agent: extractRequestContext(req).user_agent
    }

    const { error } = await supabaseAdminClient.from('system_audit_log').insert(payload)
    if (error) {
      console.error('Failed to record audit event', { error, action })
    }
  } catch (error) {
    console.error('Audit logger error', { action, error })
  }
}

module.exports = {
  logAuditEvent
}
