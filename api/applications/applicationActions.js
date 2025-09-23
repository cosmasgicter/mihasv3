import { supabaseAdminClient } from '../_lib/supabaseClient.js'

const supabase = supabaseAdminClient

export function buildStatusUpdateData(status, timestamp = new Date().toISOString()) {
  const updateData = {
    status,
    updated_at: timestamp
  }

  if (status === 'under_review') {
    updateData.review_started_at = timestamp
  }

  if (['approved', 'rejected'].includes(status)) {
    updateData.decision_date = timestamp
  }

  return updateData
}

export async function updateStatusForApplications(applicationIds, status) {
  if (!status) {
    throw new Error('Status is required')
  }

  const timestamp = new Date().toISOString()
  const updateData = buildStatusUpdateData(status, timestamp)

  const { error } = await supabase
    .from('applications_new')
    .update(updateData)
    .in('id', applicationIds)

  if (error) {
    throw new Error(error.message)
  }

  return { updateData, timestamp }
}

export async function insertStatusHistoryEntries(applicationIds, status, userId, notes) {
  if (!userId) {
    return
  }

  const rows = applicationIds.map(applicationId => ({
    application_id: applicationId,
    status,
    changed_by: userId,
    notes: notes ?? null
  }))

  const { error } = await supabase
    .from('application_status_history')
    .insert(rows)

  if (error) {
    throw new Error(error.message)
  }
}

export async function updatePaymentStatusForApplications(applicationIds, paymentStatus, { userId } = {}) {
  if (!paymentStatus) {
    throw new Error('paymentStatus is required')
  }

  const timestamp = new Date().toISOString()
  const updateData = {
    payment_status: paymentStatus,
    updated_at: timestamp
  }

  if (paymentStatus === 'verified') {
    updateData.payment_verified_at = timestamp
    if (userId) {
      updateData.payment_verified_by = userId
    }
  }

  const { error } = await supabase
    .from('applications_new')
    .update(updateData)
    .in('id', applicationIds)

  if (error) {
    throw new Error(error.message)
  }

  return { updateData, timestamp }
}

export async function softDeleteApplications(applicationIds) {
  const timestamp = new Date().toISOString()
  const { error } = await supabase
    .from('applications_new')
    .update({ status: 'deleted', updated_at: timestamp })
    .in('id', applicationIds)

  if (error) {
    throw new Error(error.message)
  }

  return { timestamp }
}
