import React, { useState } from 'react'
import { CheckCircle2, Download, Mail, X } from 'lucide-react'

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

  if (!email || !trackingCode || !application.application_number) return null

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
  const [showEmailInput, setShowEmailInput] = useState(false)
  const [emailAddress, setEmailAddress] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const fetchSlipPayload = async (targetEmail?: string) => {
    const response = await applicationService.getById(applicationId)
    const application = response?.application
    if (!application) throw new Error('Application details are unavailable')

    const payload = buildSlipPayload(application as Record<string, any>, user?.email, user?.id, applicationId)
    if (!payload) throw new Error('Missing application details required for the slip')

    if (targetEmail) payload.email = targetEmail
    return payload
  }

  const triggerBlobDownload = (blob: Blob) => {
    const name = applicationNumber || applicationId
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `application-slip-${name}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const payload = await fetchSlipPayload()
      const result = await createApplicationSlip(payload, {
        toast: {
          showSuccess: (t, m) => toast.success(t, m),
          showError: (t, m) => toast.error(t, m),
          showInfo: (t, m) => toast.info(t, m),
          showWarning: (t, m) => toast.warning(t, m),
        },
      })
      if (result.error) throw new Error(result.error)
      if (!result.blob) throw new Error('The slip could not be generated for download')
      triggerBlobDownload(result.blob)
    } catch (error) {
      toast.error('Download Failed', error instanceof Error ? error.message : 'Unable to download the slip')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleEmailOpen = () => {
    setShowEmailInput(true)
    setEmailAddress(user?.email || '')
    setSentTo(null)
    setEmailError(null)
  }

  const handleEmailSend = async () => {
    const target = emailAddress.trim()
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setEmailError('Please enter a valid email address')
      return
    }

    setIsEmailing(true)
    setEmailError(null)
    setSentTo(null)

    try {
      const payload = await fetchSlipPayload(target)
      const result = await createApplicationSlip(payload, {
        sendEmail: true,
        toast: {
          showSuccess: (t, m) => toast.success(t, m),
          showError: (t, m) => toast.error(t, m),
          showInfo: (t, m) => toast.info(t, m),
          showWarning: (t, m) => toast.warning(t, m),
        },
      })

      if (result.error) throw new Error(result.error)

      if (result.emailError) {
        if (result.blob) {
          triggerBlobDownload(result.blob)
          setEmailError('Email could not be sent. Your slip is downloading instead.')
        } else {
          setEmailError(result.emailError)
        }
        return
      }

      setSentTo(target)
      setTimeout(() => { setSentTo(null); setShowEmailInput(false) }, 5000)
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Unable to email the slip')
    } finally {
      setIsEmailing(false)
    }
  }

  return (
    <div className={compact ? 'flex w-full flex-col gap-2' : 'flex w-full flex-col gap-3'}>
      <div className={compact ? 'flex w-full flex-col gap-2' : 'flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:w-auto'}>
        <Button
          onClick={handleDownload}
          disabled={isDownloading}
          variant="secondary"
          className={compact
            ? 'min-h-[44px] w-full justify-center gap-2 rounded-xl border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:border-slate-400'
            : 'min-h-[44px] w-full justify-center gap-2 rounded-xl border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:border-slate-400 sm:w-auto'
          }
          loading={isDownloading}
        >
          {!isDownloading && <Download className="h-4 w-4" />}
          <span>{isDownloading ? 'Generating...' : 'Download Slip'}</span>
        </Button>

        {!showEmailInput && (
          <Button
            onClick={handleEmailOpen}
            variant="primary"
            className={compact
              ? 'min-h-[44px] w-full justify-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90'
              : 'min-h-[44px] w-full justify-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto'
            }
          >
            <Mail className="h-4 w-4" />
            <span>Email Slip</span>
          </Button>
        )}
      </div>

      {showEmailInput && (
        <div className="flex w-full flex-col gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={emailAddress}
              onChange={(e) => { setEmailAddress(e.target.value); setEmailError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleEmailSend() }}
              placeholder="Enter email address"
              autoFocus
              className="h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              disabled={isEmailing}
              aria-label="Email address for application slip"
            />
            <Button
              onClick={handleEmailSend}
              disabled={isEmailing || !emailAddress.trim()}
              variant="primary"
              className="min-h-[44px] rounded-xl bg-primary px-5 text-primary-foreground hover:bg-primary/90"
              loading={isEmailing}
            >
              {!isEmailing && <Mail className="h-4 w-4" />}
              <span>{isEmailing ? 'Sending...' : 'Send'}</span>
            </Button>
            <button
              onClick={() => { setShowEmailInput(false); setEmailError(null); setSentTo(null) }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Cancel email"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {sentTo && (
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 animate-fade-in" role="status" aria-live="polite">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Slip sent to {sentTo}</span>
            </div>
          )}

          {emailError && (
            <div className="flex items-center justify-between text-sm text-red-600 animate-fade-in" role="alert">
              <span>{emailError}</span>
              <button
                onClick={handleEmailSend}
                className="ml-2 shrink-0 text-xs font-medium text-red-700 underline hover:text-red-800"
                type="button"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
