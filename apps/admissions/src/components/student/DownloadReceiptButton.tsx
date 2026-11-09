import { useEffect, useRef } from 'react'
import type React from 'react'
import { AlertTriangle, ExternalLink, FileText, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useOfficialDocument } from '@/hooks/useOfficialDocument'
import { useToastStore } from '@/hooks/useToast'
import { isOfficialDocumentOffered } from '@/lib/officialDocumentGate'

interface DownloadReceiptButtonProps {
  applicationId: string
  paymentStatus: string
  disabled?: boolean
  /**
   * What to render when the receipt cannot be issued at all — a tenant whose
   * document profile, template, logo, or signature is not configured yet.
   *
   * Task 8.3 (R12.6, STU-24): the previous behaviour was a button labelled "Setup
   * Required" that was disabled from then on, with no stated condition for
   * becoming enabled and no path forward — and it leaked a tenant-configuration
   * instruction to a student. Callers now supply the recovery path (usually the
   * tenant support contact) and the control disappears instead of dying.
   */
  unavailableFallback?: React.ReactNode
}

/**
 * Prepare, then open, the official payment receipt from the backend (R7.1, R7.3).
 *
 * SJR task 3.17/3.20 (R5-a, R5-f): "Download Receipt" is retired. The control is
 * "Prepare receipt" until the receipt exists, then an "Open receipt" link to the
 * in-app opener, which signs when it is opened. Nothing is opened in code after an
 * await, and no copy claims a download that did not happen.
 *
 *
 * Sources the receipt PDF from `services/officialDocuments.ts` via
 * `useOfficialDocument` — the authoritative tenant-branded backend record — and
 * surfaces the `Queued`/`Generating`/`Ready`/`Failed` backend states (R7.2).
 * The R5 payment gate is enforced here: the action only renders when payment is
 * verified; the backend additionally 404-masks not-permitted requests.
 */
export function DownloadReceiptButton({
  applicationId,
  paymentStatus,
  disabled,
  unavailableFallback,
}: DownloadReceiptButtonProps) {
  const { uiState, isBusy, error, prepare, openHref } = useOfficialDocument(applicationId, 'payment_receipt')
  const { addToast } = useToastStore()
  const openRef = useRef<HTMLAnchorElement>(null)
  const focusOpenRef = useRef(false)
  const handlePrepare = async () => {
    const ok = await prepare()
    if (ok) {
      focusOpenRef.current = true
      addToast('success', 'Receipt is ready to open')
    } else {
      addToast('error', error || 'Failed to generate receipt')
    }
  }
  // The pressed control becomes the link that replaces it: keep keyboard focus.
  useEffect(() => {
    if (openHref && focusOpenRef.current) {
      focusOpenRef.current = false
      openRef.current?.focus()
    }
  }, [openHref])

  if (!isOfficialDocumentOffered('payment_receipt', '', paymentStatus)) {
    return null
  }

  const isWorking = uiState === 'generating' || uiState === 'queued'

  // The receipt genuinely cannot be issued for this tenant yet. Say so in the
  // student's terms — their payment is not in question — and hand over to the
  // recovery path the caller supplied, rather than leaving a dead control on
  // screen (task 8.3, R12.6, STU-24).
  if (uiState === 'setup_required') {
    return (
      <div className="space-y-2" role="status" data-testid="receipt-unavailable">
        <p className="flex items-start gap-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            Your payment is confirmed. The receipt document is not available to download yet —
            admissions can send you a copy.
          </span>
        </p>
        {unavailableFallback}
      </div>
    )
  }

  if (openHref && !isWorking && uiState !== 'failed') {
    return (
      <Button asChild variant="outline" size="sm" className="min-h-touch gap-2">
        <a ref={openRef} href={openHref} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open receipt
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </Button>
    )
  }
  const label =
    uiState === 'generating'
      ? 'Generating…'
      : uiState === 'queued'
        ? 'Queued…'
        : uiState === 'failed'
          ? 'Retry'
          : 'Prepare receipt'
  return (
    <Button
      onClick={handlePrepare}
      disabled={disabled || isBusy}
      loading={isWorking}
      variant="outline"
      size="sm"
      aria-live="polite"
      className="min-h-touch gap-2"
    >
      {!isWorking && (
        uiState === 'failed'
          ? <RotateCcw className="h-4 w-4" aria-hidden="true" />
          : <FileText className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </Button>
  )
}
