import { ApplicationFormData, UploadedFile } from '@/forms/applicationSchema'
import { Application } from '@/lib/supabase'

export type OfflineRecordType = 'application_draft' | 'document_upload' | 'form_submission'

export interface OfflineApplicationDraftData {
  form_data: Partial<ApplicationFormData>
  uploaded_files: UploadedFile[]
  current_step: number
  version: number
}

export interface OfflineFormSubmissionData extends Partial<Application> {
  application_fee?: number
  payment_method?: string
  payer_name?: string
  payer_phone?: string
  amount?: number
  paid_at?: string
  momo_ref?: string
  pop_url?: string
}

export interface OfflineDocumentUploadData {
  application_id: string
  files: UploadedFile[]
  metadata?: Record<string, string>
}

export type OfflineDataPayloadMap = {
  application_draft: OfflineApplicationDraftData
  document_upload: OfflineDocumentUploadData
  form_submission: OfflineFormSubmissionData
}

export type OfflineQueueItem<TType extends OfflineRecordType = OfflineRecordType> = {
  id: string
  type: TType
  data: OfflineDataPayloadMap[TType]
  timestamp: number
  userId: string
}

export type NewOfflineQueueItem<TType extends OfflineRecordType = OfflineRecordType> = Omit<
  OfflineQueueItem<TType>,
  'id' | 'timestamp'
>

export type OfflineQueuePayload = OfflineQueueItem['data']
