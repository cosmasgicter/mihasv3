import { useCallback, useEffect, useState } from 'react'

import { logger } from '@/lib/logger'
import { toError } from '@/lib/toError'
import { officialDocumentService, type OfficialDocumentStatus } from '@/services/officialDocuments'

export interface SubmittedApplicationSummary {
  applicationNumber: string | null
  trackingCode: string | null
  program: string | null
  institution: string | null
  intake?: string | null
  fullName?: string | null
  email?: string | null
  phone?: string | null
  nationality?: string | null
  status?: string | null
  paymentStatus?: string | null
  submittedAt?: string | null
  updatedAt?: string | null
}

export interface SlipCacheState {
  objectUrl?: string
  publicUrl?: string
  path?: string
  documentId?: string
}

export interface ToastAPI {
  showSuccess?: (title: string, message?: string) => void
  showError?: (title: string, message?: string) => void
  showInfo?: (title: string, message?: string) => void
  showWarning?: (title: string, message?: string) => void
}

export interface UseApplicationSlipOptions {
  submittedApplication: SubmittedApplicationSummary | null
  applicationId: string | null
  success: boolean
  toast: ToastAPI
}

export interface UseApplicationSlipResult {
  slipCache: SlipCacheState | null
  persistingSlip: boolean
  slipLoading: boolean
  emailLoading: boolean
  handleDownloadSlip: () => Promise<void>
  handleEmailSlip: () => Promise<void>
  dismissSlipProgress: () => void
}

export function useApplicationSlip({
  submittedApplication,
  applicationId,
  success,
  toast,
}: UseApplicationSlipOptions): UseApplicationSlipResult {
  const [slipCache, setSlipCache] = useState<SlipCacheState | null>(null)
  const [slipLoading, setSlipLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [persistingSlip, setPersistingSlip] = useState(false)

  useEffect(() => {
    if (success) {
      return
    }

    setSlipCache(null)
  }, [success])

  const dismissSlipProgress = useCallback(() => {
    setPersistingSlip(false)
    setSlipLoading(false)
    setEmailLoading(false)
  }, [])

  const triggerDownload = useCallback((url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    setTimeout(() => document.body.removeChild(link), 100)
  }, [])

  const waitForSlip = useCallback(async (): Promise<OfficialDocumentStatus> => {
    if (!applicationId) {
      throw new Error('Application id is missing')
    }

    const assertReady = (status: OfficialDocumentStatus | null): OfficialDocumentStatus | null => {
      if (!status) {
        return null
      }
      if (status.status === 'failed') {
        throw new Error('Application slip generation failed. Please contact admissions support.')
      }
      if (status.status === 'ready' && status.download_url) {
        return status
      }
      return null
    }

    setPersistingSlip(true)
    const generated = await officialDocumentService.generateOfficialDocument(applicationId, 'application_slip')
    const ready = assertReady(generated)
    if (ready) {
      return ready
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 1500))
      const status = await officialDocumentService.getOfficialDocument(applicationId, 'application_slip')
      const polledReady = assertReady(status)
      if (polledReady) {
        return polledReady
      }
    }

    throw new Error('Application slip is still being prepared. Please try again shortly.')
  }, [applicationId])

  const handleDownloadSlip = useCallback(async () => {
    if (!submittedApplication) {
      toast.showError?.('Slip unavailable', 'We could not find your submitted application details.')
      return
    }
    if (!applicationId) {
      toast.showError?.('Slip unavailable', 'We could not find your application id.')
      return
    }

    const identifier = submittedApplication.applicationNumber || submittedApplication.trackingCode || 'Unknown'
    const filename = `Application-Slip-${identifier}.pdf`

    if (persistingSlip && !slipCache?.publicUrl) {
      toast.showInfo?.('Preparing slip', 'We are still preparing your application slip. Please try again shortly.')
      return
    }

    try {
      setSlipLoading(true)
      const status = await waitForSlip()
      setSlipCache({
        publicUrl: status.download_url,
        documentId: status.document_id ?? undefined,
      })
      triggerDownload(status.download_url as string, filename)
    } catch (error) {
      logger.error('Slip download failed:', error)
      const message = toError(error).message || 'Unable to download slip'
      toast.showError?.('Download failed', message)
    } finally {
      setSlipLoading(false)
      setPersistingSlip(false)
    }
  }, [applicationId, persistingSlip, slipCache?.publicUrl, submittedApplication, toast, triggerDownload, waitForSlip])

  const handleEmailSlip = useCallback(async () => {
    if (!submittedApplication?.applicationNumber || !applicationId) {
      toast.showError?.('Slip unavailable', 'Missing application details for slip delivery.')
      return
    }
    const email = submittedApplication.email?.trim()
    if (!email) {
      toast.showError?.('Email unavailable', 'We could not find an email address for this application.')
      return
    }

    try {
      setEmailLoading(true)
      const status = await waitForSlip()
      setSlipCache({
        publicUrl: status.download_url,
        documentId: status.document_id ?? undefined,
      })
      await officialDocumentService.emailOfficialDocument(applicationId, 'application_slip', email)
      toast.showSuccess?.('Email queued', `Application slip will be sent to ${email}`)
    } catch (error) {
      logger.error('Slip email failed:', error)
      const message = toError(error).message || 'Unable to email slip'
      toast.showWarning?.('Email failed', `${message}. Please use Download Slip to continue.`)
    } finally {
      setEmailLoading(false)
      setPersistingSlip(false)
    }
  }, [applicationId, submittedApplication, toast, waitForSlip])

  return {
    slipCache,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
    dismissSlipProgress
  }
}

export default useApplicationSlip
