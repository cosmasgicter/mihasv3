import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js'
import { withNetlifyHandler } from '../_lib/netlifyHandler.js'
import {
  updateStatusForApplications,
  insertStatusHistoryEntries,
  updatePaymentStatusForApplications,
  softDeleteApplications
} from './applicationActions.js'

const supabase = supabaseAdminClient

const ALLOWED_UPDATE_FIELDS = new Set([
  'full_name',
  'nrc_number',
  'passport_number',
  'date_of_birth',
  'sex',
  'phone',
  'email',
  'residence_town',
  'next_of_kin_name',
  'next_of_kin_phone',
  'program',
  'intake',
  'institution',
  'result_slip_url',
  'extra_kyc_url',
  'payment_method',
  'payer_name',
  'payer_phone',
  'amount',
  'paid_at',
  'momo_ref',
  'pop_url',
  'status',
  'submitted_at',
  'admin_feedback',
  'admin_feedback_date',
  'admin_feedback_by',
  'payment_status',
  'reviewed_by',
  'reviewed_at',
  'review_started_at',
  'review_notes',
  'decision_reason',
  'decision_date'
])

function parseJsonBody(body) {
  if (!body) return {}
  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (!trimmed) {
      return {}
    }

    try {
      return JSON.parse(trimmed)
    } catch (error) {
      throw new Error('Invalid JSON in request body')
    }
  }

  return body
}

async function fetchApplication(id) {
  const { data, error } = await supabase
    .from('applications_new')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Application not found')
  }

  return data
}

async function ensureAdmin(req) {
  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return { error: authContext.error, status }
  }

  return { authContext }
}

async function ensureApplicationAccess(req, applicationId) {
  const authContext = await getUserFromRequest(req)
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return { error: authContext.error, status }
  }

  if (authContext.isAdmin) {
    return { authContext }
  }

  const { data, error } = await supabase
    .from('applications_new')
    .select('id, user_id')
    .eq('id', applicationId)
    .maybeSingle()

  if (error) {
    return { error: error.message, status: 400 }
  }

  if (!data) {
    return { error: 'Application not found', status: 404 }
  }

  if (data.user_id !== authContext.user.id) {
    return { error: 'Access denied', status: 403 }
  }

  return { authContext }
}

function pickAllowedFields(payload) {
  const sanitized = {}
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) {
      sanitized[key] = value
    }
  }
  return sanitized
}

async function fetchApplicationDetails(id, includeParam) {
  const { data: application, error } = await supabase
    .from('applications_new')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!application) {
    return null
  }

  const result = { ...application }

  if (!includeParam) {
    return result
  }

  const includes = Array.isArray(includeParam)
    ? includeParam
    : String(includeParam).split(',').map(value => value.trim()).filter(Boolean)

  if (includes.includes('grades')) {
    const { data: grades } = await supabase
      .from('application_grades')
      .select('id, grade, subject_id, subjects(name)')
      .eq('application_id', id)
      .order('grade', { ascending: true })

    result.grades = grades || []
    const best5 = grades?.slice(0, 5) || []
    result.best5Points = best5.reduce((sum, grade) => sum + grade.grade, 0)
  }

  if (includes.includes('documents')) {
    const { data: documents } = await supabase
      .from('application_documents')
      .select('*')
      .eq('application_id', id)

    result.documents = documents || []
  }

  if (includes.includes('statusHistory')) {
    const { data: statusHistory } = await supabase
      .from('application_status_history')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: false })

    result.statusHistory = statusHistory || []
  }

  return result
}

async function handleStatusUpdate(req, res, id, body) {
  const { authContext, error, status } = await ensureAdmin(req)
  if (error) {
    return res.status(status).json({ error })
  }

  const newStatus = body.status
  if (!newStatus) {
    return res.status(400).json({ error: 'status is required' })
  }

  try {
    await updateStatusForApplications([id], newStatus)
    await insertStatusHistoryEntries([id], newStatus, authContext.user.id, body.notes)
    const updated = await fetchApplication(id)
    return res.status(200).json({ success: true, data: updated })
  } catch (updateError) {
    return res.status(400).json({ error: updateError.message })
  }
}

async function handlePaymentStatusUpdate(req, res, id, body) {
  const { authContext, error, status } = await ensureAdmin(req)
  if (error) {
    return res.status(status).json({ error })
  }

  const paymentStatus = body.paymentStatus
  if (!paymentStatus) {
    return res.status(400).json({ error: 'paymentStatus is required' })
  }

  try {
    await updatePaymentStatusForApplications([id], paymentStatus, { userId: authContext.user.id })
    const updated = await fetchApplication(id)
    return res.status(200).json({ success: true, data: updated })
  } catch (updateError) {
    return res.status(400).json({ error: updateError.message })
  }
}

async function handleDocumentVerification(req, res, id, body) {
  const { authContext, error, status } = await ensureAdmin(req)
  if (error) {
    return res.status(status).json({ error })
  }

  const verificationStatus = body.status
  if (!verificationStatus) {
    return res.status(400).json({ error: 'status is required' })
  }

  let documentId = body.documentId

  if (!documentId && body.documentType) {
    const { data: documentRecord, error: fetchError } = await supabase
      .from('application_documents')
      .select('id')
      .eq('application_id', id)
      .eq('document_type', body.documentType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      return res.status(400).json({ error: fetchError.message })
    }

    documentId = documentRecord?.id
  }

  if (!documentId) {
    return res.status(404).json({ error: 'Document not found' })
  }

  const timestamp = new Date().toISOString()
  const updatePayload = {
    verification_status: verificationStatus,
    verification_notes: body.notes ?? null,
    verified_at: timestamp,
    verified_by: authContext.user.id,
    updated_at: timestamp
  }

  const { data, error: updateError } = await supabase
    .from('application_documents')
    .update(updatePayload)
    .eq('id', documentId)
    .select()
    .single()

  if (updateError) {
    return res.status(400).json({ error: updateError.message })
  }

  return res.status(200).json({ success: true, document: data })
}

async function handleGradesSync(req, res, id, body) {
  const { error, status } = await ensureApplicationAccess(req, id)
  if (error) {
    return res.status(status).json({ error })
  }

  const grades = Array.isArray(body.grades) ? body.grades : []
  if (grades.length === 0) {
    return res.status(400).json({ error: 'grades must be a non-empty array' })
  }

  for (const grade of grades) {
    if (!grade.subject_id || typeof grade.grade !== 'number') {
      return res.status(400).json({ error: 'Each grade must include subject_id and grade' })
    }
  }

  await supabase
    .from('application_grades')
    .delete()
    .eq('application_id', id)

  const insertRows = grades.map(grade => ({
    application_id: id,
    subject_id: grade.subject_id,
    grade: grade.grade
  }))

  const { data, error: insertError } = await supabase
    .from('application_grades')
    .insert(insertRows)
    .select()

  if (insertError) {
    return res.status(400).json({ error: insertError.message })
  }

  return res.status(200).json({ success: true, grades: data })
}

async function handleSendNotification(req, res, id, body) {
  const { error, status } = await ensureAdmin(req)
  if (error) {
    return res.status(status).json({ error })
  }

  if (!body.title || !body.message) {
    return res.status(400).json({ error: 'title and message are required' })
  }

  try {
    const application = await fetchApplication(id)
    const title = body.title.replace('{application_number}', application.application_number || '')
    const message = body.message
      .replace('{full_name}', application.full_name || '')
      .replace('{application_number}', application.application_number || '')

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert({
        user_id: application.user_id,
        title,
        message,
        type: 'application_update'
      })

    if (notificationError) {
      return res.status(400).json({ error: notificationError.message })
    }

    return res.status(200).json({ success: true })
  } catch (notificationError) {
    return res.status(400).json({ error: notificationError.message })
  }
}

async function upsertSystemDocument(application, documentType) {
  const now = new Date().toISOString()
  const documentName = documentType === 'acceptance_letter'
    ? `Acceptance-Letter-${application.application_number || application.id}.pdf`
    : `Finance-Receipt-${application.application_number || application.id}.pdf`

  const basePayload = {
    document_type: documentType,
    document_name: documentName,
    system_generated: true,
    verification_status: 'pending',
    updated_at: now
  }

  const { data: existing, error: fetchError } = await supabase
    .from('application_documents')
    .select('id, file_url')
    .eq('application_id', application.id)
    .eq('document_type', documentType)
    .maybeSingle()

  if (fetchError) {
    throw new Error(fetchError.message)
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('application_documents')
      .update({ ...basePayload, file_url: existing.file_url || null })
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    return existing.id
  }

  const { data, error: insertError } = await supabase
    .from('application_documents')
    .insert({
      application_id: application.id,
      ...basePayload,
      file_url: null
    })
    .select('id')
    .single()

  if (insertError) {
    throw new Error(insertError.message)
  }

  return data.id
}

async function handleDocumentGeneration(req, res, id, action) {
  const { error, status } = await ensureAdmin(req)
  if (error) {
    return res.status(status).json({ error })
  }

  const documentType = action === 'generate_acceptance_letter'
    ? 'acceptance_letter'
    : 'finance_receipt'

  try {
    const application = await fetchApplication(id)
    const documentId = await upsertSystemDocument(application, documentType)
    return res.status(200).json({ success: true, documentId })
  } catch (generationError) {
    return res.status(400).json({ error: generationError.message })
  }
}

function extractScheduleMetadata(isoString) {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid scheduledAt value')
  }

  const iso = date.toISOString()
  const [datePart, timePart] = iso.split('T')
  return {
    scheduled_at: iso,
    interview_date: datePart,
    interview_time: timePart ? timePart.slice(0, 5) : null
  }
}

async function fetchExistingInterview(applicationId) {
  const { data, error } = await supabase
    .from('application_interviews')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function handleInterviewMutation(req, res, id, action, body) {
  const { authContext, error, status } = await ensureAdmin(req)
  if (error) {
    return res.status(status).json({ error })
  }

  try {
    const existing = await fetchExistingInterview(id)
    const now = new Date().toISOString()

    if (action === 'schedule_interview') {
      if (!body.scheduledAt || !body.mode) {
        return res.status(400).json({ error: 'scheduledAt and mode are required' })
      }

      const schedule = extractScheduleMetadata(body.scheduledAt)
      const payload = {
        application_id: id,
        ...schedule,
        mode: body.mode,
        location: body.location ?? null,
        notes: body.notes ?? null,
        status: 'scheduled',
        updated_at: now,
        updated_by: authContext.user.id,
        created_by: authContext.user.id
      }

      let response
      if (existing) {
        const { data, error: updateError } = await supabase
          .from('application_interviews')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single()

        if (updateError) {
          throw new Error(updateError.message)
        }
        response = data
      } else {
        const { data, error: insertError } = await supabase
          .from('application_interviews')
          .insert(payload)
          .select()
          .single()

        if (insertError) {
          throw new Error(insertError.message)
        }
        response = data
      }

      return res.status(200).json({ success: true, interview: response })
    }

    if (action === 'reschedule_interview') {
      if (!existing) {
        return res.status(404).json({ error: 'No interview found to reschedule' })
      }

      if (!body.scheduledAt) {
        return res.status(400).json({ error: 'scheduledAt is required' })
      }

      const schedule = extractScheduleMetadata(body.scheduledAt)
      const { data, error: updateError } = await supabase
        .from('application_interviews')
        .update({
          ...schedule,
          mode: body.mode ?? existing.mode,
          location: body.location ?? existing.location,
          notes: body.notes ?? existing.notes,
          status: 'rescheduled',
          updated_at: now,
          updated_by: authContext.user.id
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (updateError) {
        throw new Error(updateError.message)
      }

      return res.status(200).json({ success: true, interview: data })
    }

    if (action === 'cancel_interview') {
      if (!existing) {
        return res.status(404).json({ error: 'No interview found to cancel' })
      }

      const { data, error: updateError } = await supabase
        .from('application_interviews')
        .update({
          status: 'cancelled',
          notes: body.notes ?? existing.notes,
          updated_at: now,
          updated_by: authContext.user.id
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (updateError) {
        throw new Error(updateError.message)
      }

      return res.status(200).json({ success: true, interview: data })
    }

    return res.status(400).json({ error: 'Unsupported action' })
  } catch (interviewError) {
    return res.status(400).json({ error: interviewError.message })
  }
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { id, include } = req.query

  if (!id) {
    return res.status(400).json({ error: 'Application ID is required' })
  }

  try {
    if (req.method === 'GET') {
      const data = await fetchApplicationDetails(id, include)
      if (!data) {
        return res.status(404).json({ error: 'Application not found' })
      }

      return res.status(200).json({ success: true, data })
    }

    if (req.method === 'PUT') {
      let body
      try {
        body = parseJsonBody(req.body)
      } catch (parseError) {
        return res.status(400).json({ error: parseError.message })
      }
      const { error, status } = await ensureApplicationAccess(req, id)
      if (error) {
        return res.status(status).json({ error })
      }

      const updatePayload = pickAllowedFields(body)
      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update' })
      }

      updatePayload.updated_at = new Date().toISOString()

      const { data, error: updateError } = await supabase
        .from('applications_new')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (updateError) {
        return res.status(400).json({ error: updateError.message })
      }

      return res.status(200).json({ success: true, data })
    }

    if (req.method === 'PATCH') {
      let body
      try {
        body = parseJsonBody(req.body)
      } catch (parseError) {
        return res.status(400).json({ error: parseError.message })
      }
      const action = body.action

      if (!action) {
        return res.status(400).json({ error: 'Action is required' })
      }

      switch (action) {
        case 'update_status':
          return handleStatusUpdate(req, res, id, body)
        case 'update_payment_status':
          return handlePaymentStatusUpdate(req, res, id, body)
        case 'verify_document':
          return handleDocumentVerification(req, res, id, body)
        case 'sync_grades':
          return handleGradesSync(req, res, id, body)
        case 'send_notification':
          return handleSendNotification(req, res, id, body)
        case 'generate_acceptance_letter':
        case 'generate_finance_receipt':
          return handleDocumentGeneration(req, res, id, action)
        case 'schedule_interview':
        case 'reschedule_interview':
        case 'cancel_interview':
          return handleInterviewMutation(req, res, id, action, body)
        default:
          return res.status(400).json({ error: 'Unsupported action' })
      }
    }

    if (req.method === 'DELETE') {
      const { error, status } = await ensureAdmin(req)
      if (error) {
        return res.status(status).json({ error })
      }

      try {
        await softDeleteApplications([id])
        return res.status(204).end()
      } catch (deleteError) {
        return res.status(400).json({ error: deleteError.message })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
