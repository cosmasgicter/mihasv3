/**
 * Audit Logger Service
 * Logs all critical actions for compliance and security
 */

export class AuditLogger {
  constructor(supabase) {
    this.supabase = supabase
  }

  async log({ actorId, action, entityType, entityId, changes, ipAddress, userAgent }) {
    try {
      const { error } = await this.supabase
        .from('audit_logs')
        .insert({
          actor_id: actorId,
          action,
          entity_type: entityType,
          entity_id: entityId,
          changes: changes || {},
          ip_address: ipAddress,
          user_agent: userAgent,
          created_at: new Date().toISOString()
        })

      if (error) throw error
    } catch (error) {
      console.error('Audit log failed:', error)
    }
  }

  async logApplicationAction(actorId, action, applicationId, changes, request) {
    return this.log({
      actorId,
      action,
      entityType: 'application',
      entityId: applicationId,
      changes,
      ipAddress: request?.headers?.get('cf-connecting-ip') || request?.headers?.get('x-forwarded-for'),
      userAgent: request?.headers?.get('user-agent')
    })
  }

  async logUserAction(actorId, action, userId, changes, request) {
    return this.log({
      actorId,
      action,
      entityType: 'user',
      entityId: userId,
      changes,
      ipAddress: request?.headers?.get('cf-connecting-ip') || request?.headers?.get('x-forwarded-for'),
      userAgent: request?.headers?.get('user-agent')
    })
  }
}
