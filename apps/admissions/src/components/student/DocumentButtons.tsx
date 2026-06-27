import { AlertTriangle, Award, ChevronDown, Download, FileCheck, FileText, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/hooks/useToast'
import {
  useOfficialDocument,
  type OfficialDocumentUiState,
} from '@/hooks/useOfficialDocument'
import { ApplicationSlipActions } from '@/components/student/ApplicationSlipActions'
import { isOfficialDocumentOffered } from '@/lib/officialDocumentGate'
import type { OfficialDocumentType } from '@/services/officialDocuments'

interface DocumentButtonsProps {
  applicationId: string
  applicationNumber?: string
  status: string
  paymentStatus: string | null
}

/** Map a UI state to the in-button label for an official-document action. */
function actionLabel(uiState: OfficialDocumentUiState, restingLabel: string): string {
  switch (uiState) {
    case 'generating':
      return 'Generating…'
    case 'queued':
      return 'Queued…'
    case 'failed':
      return 'Retry'
    case 'setup_required':
      return 'Setup Required'
    default:
      return restingLabel
  }
}

interface OfficialDocActionProps {
  applicationId: string
  documentType: OfficialDocumentType
  restingLabel: string
  icon: React.ReactNode
  /** Extra classes for tenant/status accenting (kept WCAG AA, no gradients). */
  className?: string
}

/**
 * A single backend-sourced official-document download button.
 *
 * Sources the document from `services/officialDocuments.ts` via
 * `useOfficialDocument` (R7.1) — never a client `@/lib/pdf` render. Surfaces the
 * backend `Queued`/`Generating`/`Ready`/`Failed` states (R7.2) and downloads the
 * authoritative stored record on success (R7.3).
 */
function OfficialDocAction({ applicationId, documentType, restingLabel, icon, className }: OfficialDocActionProps) {
  const { uiState, isBusy, error, download } = useOfficialDocument(applicationId, documentType)
  const { addToast } = useToastStore()

  const handleClick = async () => {
    const ok = await download()
    if (ok) {
      addToast('success', 'Document downloaded successfully')
    } else {
      addToast('error', error || 'Failed to generate document. Please try again.')
    }
  }

  const showSpinnerIcon = uiState === 'generating' || uiState === 'queued'
  const leadingIcon = uiState === 'failed'
    ? <RotateCcw className="h-4 w-4" aria-hidden="true" />
    : uiState === 'setup_required'
      ? <AlertTriangle className="h-4 w-4" aria-hidden="true" />
    : !showSpinnerIcon
      ? icon
      : null

  return (
    <Button
      onClick={handleClick}
      disabled={isBusy || uiState === 'setup_required'}
      loading={showSpinnerIcon}
      variant="outline"
      size="sm"
      aria-live="polite"
      className={`min-h-touch w-full justify-center gap-2 sm:w-auto ${className ?? ''}`}
    >
      {leadingIcon}
      {actionLabel(uiState, restingLabel)}
    </Button>
  )
}

export function DocumentButtons({ applicationId, applicationNumber, status, paymentStatus }: DocumentButtonsProps) {
  const hasAcceptanceLetter = isOfficialDocumentOffered('acceptance_letter', status, paymentStatus)
  const hasConditionalLetter = isOfficialDocumentOffered('conditional_offer', status, paymentStatus)
  const hasReceipt = isOfficialDocumentOffered('payment_receipt', status, paymentStatus)
  const hasSlip = isOfficialDocumentOffered('application_slip', status, paymentStatus)

  if (!hasSlip && !hasAcceptanceLetter && !hasConditionalLetter && !hasReceipt) {
    return null
  }

  const acceptanceBtn = hasAcceptanceLetter && (
    <OfficialDocAction
      applicationId={applicationId}
      documentType="acceptance_letter"
      restingLabel="Acceptance Letter"
      icon={<Award className="h-4 w-4" aria-hidden="true" />}
      className="border-green-700 text-green-800 hover:bg-green-50"
    />
  )

  const conditionalBtn = hasConditionalLetter && (
    <OfficialDocAction
      applicationId={applicationId}
      documentType="conditional_offer"
      restingLabel="Conditional Acceptance"
      icon={<FileCheck className="h-4 w-4" aria-hidden="true" />}
      className="border-amber-700 text-amber-800 hover:bg-amber-50"
    />
  )

  const receiptBtn = hasReceipt && (
    <OfficialDocAction
      applicationId={applicationId}
      documentType="payment_receipt"
      restingLabel="Payment Receipt"
      icon={<Download className="h-4 w-4" aria-hidden="true" />}
    />
  )

  return (
    <>
      {/* Mobile: collapsible */}
      <details className="group w-full rounded-lg border border-border bg-muted/30 sm:hidden">
        <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground marker:hidden">
          <span className="inline-flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            Documents
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-2 border-t border-border px-3 py-3">
          {hasSlip && <ApplicationSlipActions applicationId={applicationId} applicationNumber={applicationNumber} compact />}
          {acceptanceBtn}
          {conditionalBtn}
          {receiptBtn}
        </div>
      </details>

      {/* Desktop: inline */}
      <div className="hidden w-full flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
        {hasSlip && <ApplicationSlipActions applicationId={applicationId} applicationNumber={applicationNumber} />}
        {acceptanceBtn}
        {conditionalBtn}
        {receiptBtn}
      </div>
    </>
  )
}
