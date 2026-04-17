import { Award, ChevronDown, Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDocumentGeneration } from '@/hooks/useDocumentGeneration'
import { useToastStore } from '@/hooks/useToast'
import { logger } from '@/lib/logger'
import { ApplicationSlipActions } from '@/components/student/ApplicationSlipActions'
import { isPaymentVerified } from '@/lib/paymentStatus'

interface DocumentButtonsProps {
  applicationId: string
  applicationNumber?: string
  status: string
  paymentStatus: string | null
}

export function DocumentButtons({ applicationId, applicationNumber, status, paymentStatus }: DocumentButtonsProps) {
  const { generateDocument, loading } = useDocumentGeneration()
  const { addToast } = useToastStore()

  const handleDownload = async (type: 'acceptance' | 'receipt') => {
    logger.debug('[DocumentButtons] handleDownload called for type:', type)
    const success = await generateDocument(type, applicationId)
    logger.debug('[DocumentButtons] generateDocument returned:', success)
    if (success) {
      addToast('success', 'Document downloaded successfully')
    } else {
      addToast('error', 'Failed to generate document')
    }
  }

  const hasAcceptanceLetter = status === 'approved'
  const hasReceipt = isPaymentVerified(paymentStatus)
  const hasSlip = status !== 'draft'

  if (!hasSlip && !hasAcceptanceLetter && !hasReceipt) {
    return null
  }

  const actions = (
    <>
      {hasSlip && (
        <ApplicationSlipActions
          applicationId={applicationId}
          applicationNumber={applicationNumber}
        />
      )}

      {hasAcceptanceLetter && (
        <Button
          onClick={() => handleDownload('acceptance')}
          disabled={loading}
          variant="outline"
          size="sm"
          className="min-h-11 w-full justify-center gap-2 border-green-500 text-green-700 hover:bg-green-50 sm:w-auto"
        >
          <Award className="w-4 h-4" />
          Acceptance Letter
        </Button>
      )}

      {hasReceipt && (
        <Button
          onClick={() => handleDownload('receipt')}
          disabled={loading}
          variant="outline"
          size="sm"
          className="min-h-11 w-full justify-center gap-2 sm:w-auto"
        >
          <Download className="w-4 h-4" />
          Payment Receipt
        </Button>
      )}
    </>
  )

  return (
    <>
      <details className="group w-full rounded-xl border border-border bg-muted/30 sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground marker:hidden">
          <span className="inline-flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            Documents
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-2 border-t border-border px-3 py-3">
          {hasSlip && (
            <ApplicationSlipActions
              applicationId={applicationId}
              applicationNumber={applicationNumber}
              compact
            />
          )}
          {hasAcceptanceLetter && (
            <Button
              onClick={() => handleDownload('acceptance')}
              disabled={loading}
              variant="outline"
              size="sm"
              className="min-h-11 w-full justify-center gap-2 border-green-500 text-green-700 hover:bg-green-50"
            >
              <Award className="w-4 h-4" />
              Acceptance Letter
            </Button>
          )}
          {hasReceipt && (
            <Button
              onClick={() => handleDownload('receipt')}
              disabled={loading}
              variant="outline"
              size="sm"
              className="min-h-11 w-full justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Payment Receipt
            </Button>
          )}
        </div>
      </details>
      <div className="hidden w-full flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
        {actions}
      </div>
    </>
  )
}
