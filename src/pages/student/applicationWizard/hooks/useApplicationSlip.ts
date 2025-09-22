import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApplicationSlipData } from '@/lib/applicationSlip'
import type { SlipServiceOptions, SlipServiceResult } from '@/lib/slipService'

export interface SubmittedApplicationSummary {
  applicationNumber: string | null
  trackingCode: string | null
  program: string | null
  institution: string | null
  intake?: string | null
  fullName?: string | null
  email?: string | null
  phone?: string | null
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
  slipPayload: ApplicationSlipData | null
  success: boolean
  toast: ToastAPI
  createApplicationSlip: (data: ApplicationSlipData, options?: SlipServiceOptions) => Promise<SlipServiceResult>
  onEmailUpdate?: (email: string) => void
}

export interface UseApplicationSlipResult {
  slipCache: SlipCacheState | null
  persistingSlip: boolean
  slipLoading: boolean
  emailLoading: boolean
  handleDownloadSlip: () => Promise<void>
  handleEmailSlip: () => Promise<void>
}

export function useApplicationSlip({
  submittedApplication,
  slipPayload,
  success,
  toast,
  createApplicationSlip,
  onEmailUpdate
}: UseApplicationSlipOptions): UseApplicationSlipResult {
  const [slipCache, setSlipCache] = useState<SlipCacheState | null>(null)
  const [slipLoading, setSlipLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [persistingSlip, setPersistingSlip] = useState(false)
  const hasPersistedSlipRef = useRef(false)

  useEffect(() => () => {
    if (slipCache?.objectUrl) {
      URL.revokeObjectURL(slipCache.objectUrl)
    }
  }, [slipCache?.objectUrl])

  useEffect(() => {
    if (success) {
      return
    }

    hasPersistedSlipRef.current = false
    setSlipCache(prev => {
      if (!prev) {
        return prev
      }

      if (prev.objectUrl) {
        URL.revokeObjectURL(prev.objectUrl)
      }

      return null
    })
  }, [success])

  useEffect(() => {
    if (!success || !slipPayload || hasPersistedSlipRef.current) {
      return
    }

    let cancelled = false

    const persist = async () => {
      setPersistingSlip(true)
      try {
        const result = await createApplicationSlip(slipPayload, { toast })

        if (cancelled) {
          return
        }

        if (result.error) {
          toast.showError?.('Slip unavailable', result.error)
          return
        }

        setSlipCache(prev => {
          if (prev?.objectUrl && result.blob) {
            URL.revokeObjectURL(prev.objectUrl)
          }

          const objectUrl = result.blob ? URL.createObjectURL(result.blob) : prev?.objectUrl

          return {
            objectUrl,
            publicUrl: result.publicUrl || prev?.publicUrl,
            path: result.path || prev?.path,
            documentId: result.documentId || prev?.documentId
          }
        })

        hasPersistedSlipRef.current = true
      } catch (error) {
        if (!cancelled) {
          console.error('Automatic slip persistence failed:', error)
        }
      } finally {
        if (!cancelled) {
          setPersistingSlip(false)
        }
      }
    }

    persist()

    return () => {
      cancelled = true
    }
  }, [success, slipPayload, toast, createApplicationSlip])

  const triggerDownload = useCallback((url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  const handleDownloadSlip = useCallback(async () => {
    if (!submittedApplication) {
      toast.showError?.('Slip unavailable', 'We could not find your submitted application details.')
      return
    }

    const identifier = submittedApplication.applicationNumber || submittedApplication.trackingCode || 'Unknown'
    const filename = `Application-Slip-${identifier}.pdf`

    if (slipCache?.objectUrl) {
      triggerDownload(slipCache.objectUrl, filename)
      return
    }

    if (persistingSlip && !slipCache?.publicUrl) {
      toast.showInfo?.('Preparing slip', 'We are still preparing your application slip. Please try again shortly.')
      return
    }

    try {
      setSlipLoading(true)

      if (slipCache?.publicUrl && !slipCache.objectUrl) {
        const response = await fetch(slipCache.publicUrl)
        if (!response.ok) {
          throw new Error('Unable to download stored application slip')
        }

        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        setSlipCache(prev => {
          if (prev?.objectUrl) {
            URL.revokeObjectURL(prev.objectUrl)
          }
          return { ...prev, objectUrl }
        })
        triggerDownload(objectUrl, filename)
        return
      }

      if (!slipPayload) {
        toast.showError?.('Slip unavailable', 'Missing application data for slip generation.')
        return
      }

      const result = await createApplicationSlip(slipPayload, { toast })

      if (result.error) {
        toast.showError?.('Download failed', result.error)
        return
      }

      const objectUrl = result.blob ? URL.createObjectURL(result.blob) : undefined
      const downloadUrl = objectUrl || result.publicUrl

      if (!downloadUrl) {
        toast.showError?.('Download failed', 'We could not prepare the application slip for download.')
        return
      }

      setSlipCache(prev => {
        if (prev?.objectUrl && objectUrl && prev.objectUrl !== objectUrl) {
          URL.revokeObjectURL(prev.objectUrl)
        }
        return {
          objectUrl: objectUrl || prev?.objectUrl,
          publicUrl: result.publicUrl || prev?.publicUrl,
          path: result.path || prev?.path,
          documentId: result.documentId || prev?.documentId
        }
      })

      triggerDownload(downloadUrl, filename)
    } catch (error) {
      console.error('Slip download failed:', error)
      const message = error instanceof Error ? error.message : 'Unable to download slip'
      toast.showError?.('Download failed', message)
    } finally {
      setSlipLoading(false)
    }
  }, [submittedApplication, slipCache, persistingSlip, slipPayload, toast, triggerDownload, createApplicationSlip])

  const handleEmailSlip = useCallback(async () => {
    if (!slipPayload || !submittedApplication) {
      toast.showError?.('Slip unavailable', 'Missing application details for slip delivery.')
      return
    }

    let emailAddress = submittedApplication.email?.trim() || slipPayload.email?.trim() || ''
    if (!emailAddress) {
      const promptResult = window.prompt('Enter the email address to send your application slip to:')
      emailAddress = promptResult?.trim() || ''
    }

    if (!emailAddress) {
      toast.showError?.('Email required', 'Please provide an email address to receive the slip.')
      return
    }

    const payload: ApplicationSlipData = { ...slipPayload, email: emailAddress }

    try {
      setEmailLoading(true)
      const result = await createApplicationSlip(payload, { toast, sendEmail: true })

      if (result.error || result.emailError) {
        const message = result.error || result.emailError || 'We could not email the slip.'
        toast.showError?.('Email failed', message)
        return
      }

      setSlipCache(prev => {
        if (prev?.objectUrl && result.blob) {
          URL.revokeObjectURL(prev.objectUrl)
        }

        const objectUrl = result.blob ? URL.createObjectURL(result.blob) : prev?.objectUrl

        return {
          objectUrl,
          publicUrl: result.publicUrl || prev?.publicUrl,
          path: result.path || prev?.path,
          documentId: result.documentId || prev?.documentId
        }
      })

      onEmailUpdate?.(emailAddress)
    } catch (error) {
      console.error('Slip email failed:', error)
      const message = error instanceof Error ? error.message : 'Unable to email slip'
      toast.showError?.('Email failed', message)
    } finally {
      setEmailLoading(false)
    }
  }, [slipPayload, submittedApplication, toast, createApplicationSlip, onEmailUpdate])

  return {
    slipCache,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip
  }
}

export default useApplicationSlip
