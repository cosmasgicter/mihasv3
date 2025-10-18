import {
  supabaseAdminClient,
  getUserFromRequest,
  clearRequestRoleCache
} from '../../_lib/supabaseClient.js'
import { logAuditEvent } from '../../_lib/auditLogger.js'
import {
  fetchUserProfile,
  syncUserRole,
  parseUserId,
  parseRequestBody,
  updateAuthUserMetadata
} from '../../_lib/adminUserHelpers.js'
import { withNetlifyHandler } from '../../_lib/netlifyHandler.js'

async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  try {
    const authContext = await getUserFromRequest(req, { requireAdmin: true })
    if (authContext?.error) {
      const status = authContext.error === 'Access denied' ? 403 : 401
      return res.status(status).json({ error: authContext.error })
    }
    if (!authContext || !authContext.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { user, roles = [] } = authContext
    const userId = parseUserId(req.query?.id)

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' })
    }

    if (req.method === 'GET') {
      const profile = await fetchUserProfile(userId)
      if (!profile) {
        return res.status(404).json({ error: 'User not found' })
      }

      await logAuditEvent({
        req,
        action: 'admin.users.view',
        actorId: user.id,
        actorEmail: user.email || null,
        actorRoles: roles,
        targetTable: 'user_profiles',
        targetId: userId,
        metadata: { found: true }
      })

      return res.status(200).json(profile)
    }

    if (req.method === 'PUT') {
      const payload = parseRequestBody(req.body)
      const allowedFields = ['full_name', 'email', 'phone', 'role']
      const updates = {}

      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
          updates[field] = payload[field]
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update' })
      }

      await updateAuthUserMetadata(userId, updates)

      const profileUpdates = {}
      if (updates.full_name) {
        const nameParts = updates.full_name.trim().split(' ')
        profileUpdates.first_name = nameParts[0] || ''
        profileUpdates.last_name = nameParts.slice(1).join(' ') || ''
      }
      if (updates.email) profileUpdates.email = updates.email
      if (updates.phone) profileUpdates.phone = updates.phone
      if (updates.role) profileUpdates.role = updates.role

      const { data: updatedProfile, error: updateError } = await supabaseAdminClient
        .from('profiles')
        .update(profileUpdates)
        .eq('id', userId)
        .select('id, email, first_name, last_name, phone, role, created_at')
        .single()

      if (updateError) {
        if (updateError.code === 'PGRST116') {
          return res.status(404).json({ error: 'User not found' })
        }
        throw updateError
      }

      if (updates.role) {
        const { error: roleError } = await supabaseAdminClient
          .from('user_roles')
          .upsert(
            { user_id: userId, role: updates.role, is_active: true },
            { onConflict: 'user_id' }
          )
        
        if (roleError) {
          console.error('Role sync error:', roleError)
          throw roleError
        }
        
        clearRequestRoleCache(req)
      }

      await logAuditEvent({
        req,
        action: 'admin.users.update',
        actorId: user.id,
        actorEmail: user.email || null,
        actorRoles: roles,
        targetTable: 'profiles',
        targetId: userId,
        metadata: { updatedFields: Object.keys(updates) }
      })

      const mappedProfile = {
        user_id: updatedProfile.id,
        email: updatedProfile.email,
        full_name: [updatedProfile.first_name, updatedProfile.last_name].filter(Boolean).join(' '),
        phone: updatedProfile.phone || '',
        role: updatedProfile.role,
        created_at: updatedProfile.created_at
      }

      return res.status(200).json({ data: mappedProfile })
    }

    if (req.method === 'DELETE') {
      const profile = await fetchUserProfile(userId)
      if (!profile) {
        return res.status(404).json({ error: 'User not found' })
      }

      const { error: deleteAuthError } = await supabaseAdminClient.auth.admin.deleteUser(userId)
      if (deleteAuthError && !/not\s+found/i.test(deleteAuthError.message || '')) {
        throw deleteAuthError
      }

      const { error: deleteRolesError } = await supabaseAdminClient
        .from('user_roles')
        .delete()
        .eq('user_id', userId)

      if (deleteRolesError) {
        throw deleteRolesError
      }

      const { error: deleteProfileError } = await supabaseAdminClient
        .from('profiles')
        .delete()
        .eq('id', userId)

      if (deleteProfileError) {
        throw deleteProfileError
      }

      clearRequestRoleCache(req)
      await logAuditEvent({
        req,
        action: 'admin.users.delete',
        actorId: user.id,
        actorEmail: user.email || null,
        actorRoles: roles,
        targetTable: 'profiles',
        targetId: userId,
        metadata: { profileEmail: profile.email }
      })

      return res.status(200).json({ success: true })
    }

    res.setHeader('Allow', 'GET,PUT,DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Admin user detail handler error:', error)
    console.error('Error stack:', error.stack)
    console.error('Error details:', JSON.stringify(error, null, 2))
    const statusCode = error.message === 'Access denied' ? 403 : 500
    return res.status(statusCode).json({ error: error.message || 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
