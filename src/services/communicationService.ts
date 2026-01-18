/**
 * Communication Service
 * Handles sending messages to applicants via multiple channels
 * 
 * Requirements: 5.4 - Admin-applicant communication
 */

import { supabase } from '@/lib/supabase'

export interface CommunicationRequest {
  applicantId: string
  channel: 'email' | 'sms' | 'in-app'
  message: string
  template?: string
  subject?: string
}

export interface CommunicationResponse {
  success: boolean
  communicationId?: string
  error?: string
}

export interface CommunicationHistory {
  id: string
  applicant_id: string
  channel: 'email' | 'sms' | 'in-app'
  subject?: string
  message: string
  template?: string
  status: 'sent' | 'failed' | 'pending'
  sent_by: string
  sent_by_name?: string
  sent_at: string
  error_message?: string
}

/**
 * Send a message to an applicant
 * @param request - Communication request data
 * @returns Promise with communication result
 */
export async function sendToApplicant(
  request: CommunicationRequest
): Promise<CommunicationResponse> {
  try {
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      throw new Error('Authentication required')
    }

    // Get applicant details
    const { data: applicant, error: applicantError } = await supabase
      .from('profiles')
      .select('user_id, full_name, email, phone')
      .eq('user_id', request.applicantId)
      .single()

    if (applicantError || !applicant) {
      throw new Error('Applicant not found')
    }

    // Validate channel availability
    if (request.channel === 'email' && !applicant.email) {
      throw new Error('Applicant does not have an email address')
    }

    if (request.channel === 'sms' && !applicant.phone) {
      throw new Error('Applicant does not have a phone number')
    }

    // Create communication record
    const { data: communication, error: commError } = await supabase
      .from('applicant_communications')
      .insert({
        applicant_id: request.applicantId,
        channel: request.channel,
        subject: request.subject,
        message: request.message,
        template: request.template,
        sent_by: session.user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (commError) {
      throw new Error(`Failed to create communication record: ${commError.message}`)
    }

    // Send the message via the appropriate channel
    let sendResult: { success: boolean; error?: string }

    switch (request.channel) {
      case 'email':
        sendResult = await sendEmailMessage({
          to: applicant.email,
          subject: request.subject || 'Message from MIHAS Admissions',
          message: request.message,
          applicantName: applicant.full_name
        })
        break

      case 'sms':
        sendResult = await sendSMSMessage({
          to: applicant.phone,
          message: request.message
        })
        break

      case 'in-app':
        sendResult = await sendInAppMessage({
          userId: request.applicantId,
          title: request.subject || 'Message from Admissions',
          message: request.message
        })
        break

      default:
        throw new Error(`Unsupported channel: ${request.channel}`)
    }

    // Update communication status
    const finalStatus = sendResult.success ? 'sent' : 'failed'
    await supabase
      .from('applicant_communications')
      .update({
        status: finalStatus,
        error_message: sendResult.error || null,
        sent_at: new Date().toISOString()
      })
      .eq('id', communication.id)

    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Failed to send message')
    }

    return {
      success: true,
      communicationId: communication.id
    }
  } catch (error) {
    console.error('Communication service error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message'
    }
  }
}

/**
 * Send email message
 */
async function sendEmailMessage(params: {
  to: string
  subject: string
  message: string
  applicantName: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    const response = await fetch('/api/send/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({
        to: params.to,
        subject: params.subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0066cc;">Message from MIHAS Admissions</h2>
            <p>Dear ${params.applicantName},</p>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
              ${params.message.replace(/\n/g, '<br>')}
            </div>
            <p style="color: #666; font-size: 14px;">
              This is an automated message from the MIHAS Application System. 
              Please do not reply to this email.
            </p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
              Mukuba Institute of Health and Allied Sciences<br>
              Admissions Office
            </p>
          </div>
        `
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to send email')
    }

    return { success: true }
  } catch (error) {
    console.error('Email send error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email'
    }
  }
}

/**
 * Send SMS message
 */
async function sendSMSMessage(params: {
  to: string
  message: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    const response = await fetch('/api/send/sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({
        to: params.to,
        message: `MIHAS: ${params.message}`
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to send SMS')
    }

    return { success: true }
  } catch (error) {
    console.error('SMS send error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS'
    }
  }
}

/**
 * Send in-app message (notification)
 */
async function sendInAppMessage(params: {
  userId: string
  title: string
  message: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('in_app_notifications')
      .insert({
        user_id: params.userId,
        title: params.title,
        content: params.message,
        type: 'admin_message',
        read: false
      })

    if (error) {
      throw error
    }

    return { success: true }
  } catch (error) {
    console.error('In-app message error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send in-app message'
    }
  }
}

/**
 * Get communication history for an applicant
 * @param applicantId - Applicant user ID
 * @returns Promise with communication history
 */
export async function getCommunicationHistory(
  applicantId: string
): Promise<CommunicationHistory[]> {
  try {
    const { data, error } = await supabase
      .from('applicant_communications')
      .select(`
        *,
        sent_by_profile:profiles!applicant_communications_sent_by_fkey(full_name)
      `)
      .eq('applicant_id', applicantId)
      .order('sent_at', { ascending: false })

    if (error) {
      throw error
    }

    return (data || []).map((comm: any) => ({
      id: comm.id,
      applicant_id: comm.applicant_id,
      channel: comm.channel,
      subject: comm.subject,
      message: comm.message,
      template: comm.template,
      status: comm.status,
      sent_by: comm.sent_by,
      sent_by_name: comm.sent_by_profile?.full_name,
      sent_at: comm.sent_at,
      error_message: comm.error_message
    }))
  } catch (error) {
    console.error('Error fetching communication history:', error)
    return []
  }
}

/**
 * Get last contacted timestamp for an applicant
 * @param applicantId - Applicant user ID
 * @returns Promise with last contacted date or null
 */
export async function getLastContactedAt(
  applicantId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('applicant_communications')
      .select('sent_at')
      .eq('applicant_id', applicantId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    return data.sent_at
  } catch (error) {
    console.error('Error fetching last contacted:', error)
    return null
  }
}
