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

function normalizeApplicationRecords(records) {
  if (!Array.isArray(records)) {
    return []
  }

  return records.filter(record => record && typeof record === 'object')
}

function buildIntakeAdjustmentMap(applications, nextStatus) {
  if (!Array.isArray(applications) || applications.length === 0) {
    return new Map()
  }

  const adjustments = new Map()

  for (const application of applications) {
    const previousStatus = application?.status
    if (previousStatus === nextStatus) {
      continue
    }

    let identifierValue = typeof application?.intake_id === 'string' ? application.intake_id.trim() : ''
    let identifierColumn = 'id'

    if (!identifierValue) {
      identifierValue = typeof application?.intake === 'string' ? application.intake.trim() : ''
      identifierColumn = 'name'
    }

    if (!identifierValue) {
      continue
    }

    let delta = 0

    if (previousStatus === 'approved' && nextStatus !== 'approved') {
      delta = 1
    } else if (previousStatus !== 'approved' && nextStatus === 'approved') {
      delta = -1
    }

    if (delta === 0) {
      continue
    }

    const mapKey = `${identifierColumn}:${identifierValue}`
    const current = adjustments.get(mapKey)

    adjustments.set(mapKey, {
      column: identifierColumn,
      value: identifierValue,
      delta: (current?.delta ?? 0) + delta
    })
  }

  return adjustments
}

async function applyIntakeAdjustments(adjustments) {
  if (!(adjustments instanceof Map) || adjustments.size === 0) {
    return
  }

  for (const { column, value, delta } of adjustments.values()) {
    if (!delta) {
      continue
    }

    const { data: intake, error: fetchError } = await supabase
      .from('intakes')
      .select('id, available_spots, total_capacity')
      .eq(column, value)
      .maybeSingle()

    if (fetchError) {
      throw new Error(fetchError.message)
    }

    if (!intake) {
      continue
    }

    const currentSpots = typeof intake.available_spots === 'number' ? intake.available_spots : 0
    const totalCapacity = typeof intake.total_capacity === 'number' ? intake.total_capacity : currentSpots

    let nextSpots = currentSpots + delta
    if (delta < 0) {
      nextSpots = Math.max(0, nextSpots)
    } else {
      nextSpots = Math.min(totalCapacity, nextSpots)
    }

    if (nextSpots === currentSpots) {
      continue
    }

    const { error: updateError } = await supabase
      .from('intakes')
      .update({ available_spots: nextSpots })
      .eq(column, value)

    if (updateError) {
      throw new Error(updateError.message)
    }
  }
}

export async function updateStatusForApplications(applicationIds, status) {
  if (!status) {
    throw new Error('Status is required')
  }

  const timestamp = new Date().toISOString()

  const { data: existingRecords, error: existingError } = await supabase
    .from('applications')
    .select('id, status, intake_id, intake')
    .in('id', applicationIds)

  if (existingError) {
    throw new Error(existingError.message)
  }

  const applications = normalizeApplicationRecords(existingRecords)
  const intakeAdjustments = buildIntakeAdjustmentMap(applications, status)
  const updateData = buildStatusUpdateData(status, timestamp)

  const { error } = await supabase
    .from('applications')
    .update(updateData)
    .in('id', applicationIds)

  if (error) {
    throw new Error(error.message)
  }

  try {
    await applyIntakeAdjustments(intakeAdjustments)
  } catch (adjustmentError) {
    console.error('Failed to update intake availability:', adjustmentError)
    throw adjustmentError
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
    .from('applications')
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
    .from('applications')
    .update({ status: 'deleted', updated_at: timestamp })
    .in('id', applicationIds)

  if (error) {
    throw new Error(error.message)
  }

  return { timestamp }
}
