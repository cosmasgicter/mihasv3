import { sanitizeForLog } from './security'
import { apiClient } from '@/services/client'
import { logger } from '@/lib/logger'
import { toError } from '@/lib/toError'

export interface PersistSlipResult {
  success: boolean
  path?: string
  publicUrl?: string
  documentId?: string
  error?: string
}

type UploadedSlipDocument = {
  id: string
  file_url?: string
  document_name?: string
}

type ApplicationDocumentReference = {
  id?: string
  file_url?: string
  document_name?: string
}

async function uploadSlipViaDocumentsApi(applicationId: string, applicationNumber: string, blob: Blob) {
  const fileName = `application-slip-${applicationNumber}.pdf`
  const formData = new FormData()
  formData.append('file', blob, fileName)
  formData.append('application_id', applicationId)
  formData.append('document_type', 'application_slip')

  return apiClient.request<UploadedSlipDocument>('/documents/upload/', {
    method: 'POST',
    body: formData,
  })
}

export async function repairLegacyDocumentReference(reference: string, applicationId?: string): Promise<{ publicUrl?: string; path?: string }> {
  if (!reference?.trim()) {
    return {}
  }

  if (/^https?:\/\//.test(reference)) {
    return { publicUrl: reference, path: reference }
  }

  if (!applicationId) {
    return {}
  }

  try {
    const documents = await apiClient.request<ApplicationDocumentReference[]>(
      `/applications/${encodeURIComponent(applicationId)}/documents`,
    )
    const normalizedReference = reference.trim()
    const resolved = documents?.find((document) =>
      document?.id === normalizedReference ||
      document?.document_name === normalizedReference ||
      document?.file_url === normalizedReference,
    )

    return {
      publicUrl: resolved?.file_url,
      path: resolved?.id || resolved?.document_name,
    }
  } catch (error) {
    logger.error(
      'Failed to resolve legacy document reference:',
      sanitizeForLog(toError(error).message),
    )
    return {}
  }
}

export async function persistSlip(
  applicationNumber: string,
  blob: Blob,
  userId?: string,
  applicationId?: string,
): Promise<PersistSlipResult> {
  const trimmedNumber = (applicationNumber || '').trim()
  void userId
  if (!trimmedNumber) {
    return { success: false, error: 'Application number is required to persist slip' }
  }

  if (!applicationId?.trim()) {
    return {
      success: false,
      error: 'Automatic slip storage requires a saved application record',
    }
  }

  try {
    const uploadResult = await uploadSlipViaDocumentsApi(applicationId, trimmedNumber, blob)

    if (!uploadResult?.id || !uploadResult.file_url) {
      return { success: false, error: 'Failed to upload application slip' }
    }

    return {
      success: true,
      path: uploadResult.id,
      publicUrl: uploadResult.file_url,
      documentId: uploadResult.id,
    }
  } catch (error) {
    logger.error('Persist error:', sanitizeForLog(toError(error).message))
    return { success: false, error: toError(error).message || 'Failed to persist application slip' }
  }
}
