import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js'
import { logAuditEvent } from '../../_lib/auditLogger.js'
import { withNetlifyHandler } from '../../_lib/netlifyHandler.js'

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authContext = await getUserFromRequest(req)
  if (authContext.error || !authContext.isAdmin) {
    return res.status(401).json({ error: 'Admin access required' })
  }

  const { applicationId, status, notes } = req.body
  if (!applicationId || !status) {
    return res.status(400).json({ error: 'Application ID and status are required' })
  }

  try {
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    }

    if (status === 'under_review') {
      updateData.review_started_at = new Date().toISOString()
    }

    if (['approved', 'rejected'].includes(status)) {
      updateData.decision_date = new Date().toISOString()
    }

    const { data, error } = await supabaseAdminClient
      .from('applications')
      .update(updateData)
      .eq('id', applicationId)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    // Add to status history
    await supabaseAdminClient
      .from('application_status_history')
      .insert({
        application_id: applicationId,
        status,
        changed_by: authContext.user.id,
        notes: notes || null
      })

    // Send status update email
    if (data.email && ['approved', 'rejected', 'pending_documents'].includes(status)) {
      try {
        const { 
          generateApplicationApprovedEmail, 
          generateApplicationRejectedEmail, 
          generatePendingDocumentsEmail 
        } = await import('../../_lib/emailTemplates.js');
        
        let emailHtml, subject;
        
        if (status === 'approved') {
          emailHtml = generateApplicationApprovedEmail({
            full_name: data.full_name,
            application_number: data.application_number,
            program_name: data.program,
            institution: data.institution
          });
          subject = `🎉 Application Approved - ${data.program}`;
        } else if (status === 'rejected') {
          emailHtml = generateApplicationRejectedEmail({
            full_name: data.full_name,
            application_number: data.application_number,
            program_name: data.program
          });
          subject = `Application Status Update - ${data.program}`;
        } else if (status === 'pending_documents') {
          emailHtml = generatePendingDocumentsEmail({
            full_name: data.full_name,
            application_number: data.application_number,
            program_name: data.program
          });
          subject = `📄 Missing Documents Required - ${data.program}`;
        }
        
        await supabaseAdminClient.functions.invoke('send-email', {
          body: {
            to: data.email,
            subject,
            html: emailHtml
          }
        });
      } catch (emailError) {
        console.error('Failed to send status update email:', emailError);
      }
    }

    await logAuditEvent({
      req,
      action: 'applications.status.update',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email,
      actorRoles: authContext.roles,
      targetTable: 'applications',
      targetId: applicationId,
      metadata: { status, notes }
    })

    return res.status(200).json(data)
  } catch (error) {
    console.error('Status update error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
