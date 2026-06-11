import { Download, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useOfficialDocument } from '@/hooks/useOfficialDocument'
import { useToastStore } from '@/hooks/useToast'
import { isOfficialDocumentOffered } from '@/lib/officialDocumentGate'

interface DownloadReceiptButtonProps {
  applicationId: string
  paymentStatus: string
  disabled?: boolean
}

/**
 * Download the official payment receipt from the backend (R7.1, R7.3).
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
}: DownloadReceiptButtonProps) {
  const { uiState, isBusy, error, download } = useOfficialDocument(applicationId, 'payment_receipt')
  const { addToast } = useToastStore()

  const handleDownload = async () => {
    const ok = await download()
    if (ok) {
      addToast('success', 'Receipt downloaded successfully')
    } else {
      addToast('error', error || 'Failed to generate receipt')
    }
  }

  if (!isOfficialDocumentOffered('payment_receipt', '', paymentStatus)) {
    return null
  }

  const isWorking = uiState === 'generating' || uiState === 'queued'
  const label =
    uiState === 'generating'
      ? 'Generating…'
      : uiState === 'queued'
        ? 'Queued…'
        : uiState === 'failed'
          ? 'Retry'
          : 'Download Receipt'

  return (
    <Button
      onClick={handleDownload}
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
          : <Download className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </Button>
  )
}
