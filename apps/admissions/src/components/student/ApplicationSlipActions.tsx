import { useState } from 'react'
import { CheckCircle2, Download, Mail, RotateCcw, X } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { useOfficialDocument } from '@/hooks/useOfficialDocument'
import { toast } from '@/hooks/useToast'

interface ApplicationSlipActionsProps {
  applicationId: string
  /** Retained for backward compatibility with callers; the backend names the file. */
  applicationNumber?: string
  compact?: boolean
}

/**
 * Download and email the official application slip from the backend (R7.1).
 *
 * Both actions go through `services/officialDocuments.ts` via
 * `useOfficialDocument('application_slip')`: the download streams the
 * authoritative stored backend record (R7.3) and the email path emails the
 * backend-stored slip — never a locally generated blob (R7.4). The button
 * labels reflect the backend `Queued`/`Generating`/`Ready`/`Failed` states
 * (R7.2). The R5 status gate (slip only after a non-draft submission) is
 * enforced by the caller (`DocumentButtons` renders this only when
 * `status !== 'draft'`); the backend additionally 404-masks out-of-scope
 * requests, which degrade to a friendly error here.
 *
 * The client `@/lib/pdf`/`slipService` generators are intentionally no longer
 * referenced from this student official-download path (R7.6).
 */
export function ApplicationSlipActions({ applicationId, compact = false }: ApplicationSlipActionsProps) {
  const { user } = useAuth()
  const { uiState, isBusy, download, email } = useOfficialDocument(applicationId, 'application_slip')

  const [showEmailInput, setShowEmailInput] = useState(false)
  const [emailAddress, setEmailAddress] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const isWorking = uiState === 'generating' || uiState === 'queued'
  const workingLabel = uiState === 'queued' ? 'Queued…' : 'Generating...'

  const handleDownload = async () => {
    const ok = await download()
    if (!ok) {
      toast.error('Download Failed', 'Unable to download the slip. Please try again.')
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

    setEmailError(null)
    setSentTo(null)

    const ok = await email(target)
    if (ok) {
      setSentTo(target)
      setTimeout(() => { setSentTo(null); setShowEmailInput(false) }, 5000)
    } else {
      // No local-blob fallback for official documents (R7.4/R7.6): surface a
      // clear, retry-able error instead of emailing a client render.
      setEmailError('Email could not be sent. Please try again.')
    }
  }

  return (
    <div className={compact ? 'flex w-full flex-col gap-2' : 'flex w-full flex-col gap-3'}>
      <div className={compact ? 'flex w-full flex-col gap-2' : 'flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:w-auto'}>
        <Button
          onClick={handleDownload}
          disabled={isBusy}
          variant="secondary"
          aria-live="polite"
          className={compact
            ? 'min-h-touch w-full justify-center gap-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted hover:border-border'
            : 'min-h-touch w-full justify-center gap-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted hover:border-border sm:w-auto'
          }
          loading={isWorking}
        >
          {!isWorking && (
            uiState === 'failed'
              ? <RotateCcw className="h-4 w-4" aria-hidden="true" />
              : <Download className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{isWorking ? workingLabel : uiState === 'failed' ? 'Retry Download' : 'Download Slip'}</span>
        </Button>

        {!showEmailInput && (
          <Button
            onClick={handleEmailOpen}
            variant="primary"
            disabled={isBusy}
            className={compact
              ? 'min-h-touch w-full justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90'
              : 'min-h-touch w-full justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto'
            }
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            <span>Email Slip</span>
          </Button>
        )}
      </div>

      {showEmailInput && (
        <div className="flex w-full flex-col gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={emailAddress}
              onChange={(e) => { setEmailAddress(e.target.value); setEmailError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleEmailSend() }}
              placeholder="Enter email address"
              autoFocus
              className="h-12 flex-1 rounded-lg border border-border bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              disabled={isBusy}
              aria-label="Email address for application slip"
            />
            <Button
              onClick={handleEmailSend}
              disabled={isBusy || !emailAddress.trim()}
              variant="primary"
              className="min-h-touch rounded-lg bg-primary px-5 text-primary-foreground hover:bg-primary/90"
              loading={isWorking}
            >
              {!isWorking && <Mail className="h-4 w-4" aria-hidden="true" />}
              <span>{isWorking ? 'Sending...' : 'Send'}</span>
            </Button>
            <button
              onClick={() => { setShowEmailInput(false); setEmailError(null); setSentTo(null) }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Cancel email"
              type="button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {sentTo && (
            <div className="flex items-center gap-2 text-sm font-medium text-success animate-fade-in" role="status" aria-live="polite">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Slip sent to {sentTo}</span>
            </div>
          )}

          {emailError && (
            <div className="flex items-center justify-between text-sm text-destructive animate-fade-in" role="alert">
              <span>{emailError}</span>
              <button
                onClick={handleEmailSend}
                className="ml-2 shrink-0 text-xs font-medium text-destructive underline hover:text-destructive/80"
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
