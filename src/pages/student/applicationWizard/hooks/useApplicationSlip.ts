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

  // Disabled automatic slip generation to prevent rate limiting and errors
  // Slip is now generated only when user clicks download or email buttons

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
          console.error('Slip download failed:', response.status)
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

      if (!result.blob) {
        toast.showError?.('Download failed', 'We could not prepare the application slip for download.')
        return
      }

      const objectUrl = URL.createObjectURL(result.blob)

      setSlipCache(prev => {
        if (prev?.objectUrl && prev.objectUrl !== objectUrl) {
          URL.revokeObjectURL(prev.objectUrl)
        }
        return {
          objectUrl,
          publicUrl: result.publicUrl || prev?.publicUrl,
          path: result.path || prev?.path,
          documentId: result.documentId || prev?.documentId
        }
      })

      triggerDownload(objectUrl, filename)
    } catch (error) {
      console.error('Slip download failed:', error)
      const message = error instanceof Error ? error.message : 'Unable to download slip'
      toast.showError?.('Download failed', message)
    } finally {
      setSlipLoading(false)
    }
  }, [submittedApplication, slipCache, persistingSlip, slipPayload, toast, triggerDownload, createApplicationSlip])

  const handleEmailSlip = useCallback(async () => {
    if (!submittedApplication?.applicationNumber) {
      toast.showError?.('Slip unavailable', 'Missing application details for slip delivery.')
      return
    }

    try {
      setEmailLoading(true)
      toast.showInfo?.('Sending email', 'Preparing to send your application slip...')

      // First ensure slip is downloaded/generated
      if (!slipCache?.publicUrl && !slipCache?.objectUrl) {
        await handleDownloadSlip()
      }

      // Call endpoint with application number
      const session = await import('@/lib/supabase').then(m => m.supabase.auth.getSession())
      const emailResponse = await fetch('/applications/email/slip-with-attachment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`
        },
        body: JSON.stringify({ 
          applicationNumber: submittedApplication.applicationNumber 
        })
      })

      const result = await emailResponse.json()

      if (!emailResponse.ok || !result.success) {
        throw new Error(result.error || 'Failed to send email')
      }

      toast.showSuccess?.('Email sent', `Application slip has been sent to ${submittedApplication.email}`)
    } catch (error) {
      console.error('Slip email failed:', error)
      const message = error instanceof Error ? error.message : 'Unable to email slip'
      toast.showError?.('Email failed', message)
    } finally {
      setEmailLoading(false)
    }
  }, [submittedApplication, slipCache, toast, handleDownloadSlip])

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
