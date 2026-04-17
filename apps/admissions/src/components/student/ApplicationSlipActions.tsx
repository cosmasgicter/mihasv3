import React, { useState } from 'react'
import { Download, Loader2, Mail } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { createApplicationSlip } from '@/lib/slipService'
import type { ApplicationSlipData } from '@/lib/applicationSlip'
import { applicationService } from '@/services/applications'
import { toast } from '@/hooks/useToast'

interface ApplicationSlipActionsProps {
  applicationId: string
  applicationNumber?: string
  compact?: boolean
}

function buildSlipPayload(
  application: Record<string, any>,
  fallbackEmail?: string,
  userId?: string,
  applicationId?: string
): ApplicationSlipData | null {
  const email = application.email || fallbackEmail
  const trackingCode = application.public_tracking_code

  if (!email || !trackingCode || !application.application_number) {
    return null
  }

  return {
    application_id: applicationId || application.id || undefined,
    public_tracking_code: trackingCode,
    application_number: application.application_number,
    status: application.status || 'submitted',
    payment_status: application.payment_status ?? null,
    submitted_at: application.submitted_at ?? null,
    updated_at: application.updated_at ?? null,
    program_name: application.program ?? application.program_name ?? null,
    intake_name: application.intake ?? application.intake_name ?? null,
    institution: application.institution ?? null,
    institution_name: application.institution_name ?? null,
    full_name: application.full_name ?? null,
    email,
    phone: application.phone ?? null,
    nationality: application.nationality ?? null,
    admin_feedback: application.admin_feedback ?? null,
    admin_feedback_date: application.admin_feedback_date ?? null,
    userId,
  }
}

export function ApplicationSlipActions({ applicationId, applicationNumber, compact = false }: ApplicationSlipActionsProps) {
  const { user } = useAuth()
  const [isDownloading, setIsDownloading] = useState(false)
  const [isEmailing, setIsEmailing] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailStatusMessage, setEmailStatusMessage] = useState<string | null>(null)

  const prepareSlip = async (sendEmail: boolean) => {
    const response = await applicationService.getById(applicationId)
    const application = response?.application

    if (!application) {
      throw new Error('Application details are unavailable')
    }

    const slipPayload = buildSlipPayload(application as Record<string, any>, user?.email, user?.id, applicationId)
    if (!slipPayload) {
      throw new Error('Missing application details required for the slip')
    }

    const result = await createApplicationSlip(slipPayload, {
      sendEmail,
      toast: {
        showSuccess: (title, message) => toast.success(title, message),
        showError: (title, message) => toast.error(title, message),
        showInfo: (title, message) => toast.info(title, message),
        showWarning: (title, message) => toast.warning(title, message),
      }
    })

    if (result.error) {
      throw new Error(result.error)
    }

    return result
  }

  const triggerBlobDownload = (blob: Blob) => {
    const resolvedApplicationNumber = applicationNumber || applicationId
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `application-slip-${resolvedApplicationNumber}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const result = await prepareSlip(false)

      if (!result.blob) {
        throw new Error('The slip could not be generated for download')
      }

      triggerBlobDownload(result.blob)
    } catch (error) {
      console.error('Download failed:', error)
      toast.error('Download Failed', error instanceof Error ? error.message : 'Unable to download the slip')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleEmailRequest = async () => {
    if (isEmailing) return

    setIsEmailing(true)
    setEmailStatusMessage(null)
    try {
      const result = await prepareSlip(true)

      if (result.emailError) {
        if (result.blob) {
          triggerBlobDownload(result.blob)
          setEmailStatusMessage('Email could not be sent. Your slip is downloading now so you can share it manually.')
          toast.warning('Email unavailable', 'We could not send email right now. Your slip is downloading instead.')
          return
        }
        setEmailStatusMessage(result.emailError)
        return
      }

      setEmailSent(true)
      setEmailStatusMessage('Application slip emailed successfully.')
      window.setTimeout(() => setEmailSent(false), 5000)
    } catch (error) {
      console.error('Email failed:', error)
      const message = error instanceof Error ? error.message : 'Unable to email the slip'
      setEmailStatusMessage(message)
      toast.error('Email Failed', message)
    } finally {
      setIsEmailing(false)
    }
  }

  const emailDisabled = isEmailing || emailSent

  return (
    <div className={compact ? 'flex w-full flex-col gap-2' : 'flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap'}>
      <Button
        onClick={handleDownload}
        disabled={isDownloading}
        variant="secondary"
        className={compact
          ? 'min-h-11 w-full justify-center gap-2 border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:border-slate-400 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:shadow-none'
          : 'min-h-11 w-full justify-center gap-2 border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:border-slate-400 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:shadow-none sm:w-auto'
        }
        loading={isDownloading}
      >
        {!isDownloading && <Download className="h-4 w-4" />}
        <span>{isDownloading ? 'Generating...' : 'Download Slip'}</span>
      </Button>

      <Button
        onClick={handleEmailRequest}
        disabled={emailDisabled}
        variant="primary"
        className={compact
          ? 'min-h-11 w-full justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:text-primary-foreground disabled:opacity-100 disabled:cursor-not-allowed'
          : 'min-h-11 w-full justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:text-primary-foreground disabled:opacity-100 disabled:cursor-not-allowed sm:w-auto'
        }
        loading={isEmailing}
      >
        {!isEmailing && <Mail className="h-4 w-4" />}
        <span>
          {isEmailing ? 'Sending...' : emailSent ? 'Email Sent!' : 'Email Slip'}
        </span>
      </Button>

      {(emailSent || emailStatusMessage) && (
        <div
          className={`text-sm font-medium animate-fade-in ${
            emailSent ? 'text-success' : 'text-warning'
          }`}
          role="status"
          aria-live="polite"
        >
          {emailStatusMessage ?? '✓ Application slip will be sent to your email shortly'}
        </div>
      )}
    </div>
  )
}
