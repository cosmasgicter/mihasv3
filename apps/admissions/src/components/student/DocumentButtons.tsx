import { useState } from 'react'
import { Award, ChevronDown, Download, FileCheck, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDocumentGeneration } from '@/hooks/useDocumentGeneration'
import { useToastStore } from '@/hooks/useToast'
import { ApplicationSlipActions } from '@/components/student/ApplicationSlipActions'
import { isPaymentVerified } from '@/lib/paymentStatus'

interface DocumentButtonsProps {
  applicationId: string
  applicationNumber?: string
  status: string
  paymentStatus: string | null
}

export function DocumentButtons({ applicationId, applicationNumber, status, paymentStatus }: DocumentButtonsProps) {
  const { generateDocument } = useDocumentGeneration()
  const { addToast } = useToastStore()
  const [loadingType, setLoadingType] = useState<string | null>(null)

  const handleDownload = async (type: 'acceptance' | 'receipt' | 'conditional') => {
    setLoadingType(type)
    try {
      const success = await generateDocument(type, applicationId)
      if (success) {
        addToast('success', 'Document downloaded successfully')
      } else {
        addToast('error', 'Failed to generate document. Please try again.')
      }
    } finally {
      setLoadingType(null)
    }
  }

  const hasAcceptanceLetter = status === 'approved'
  const hasConditionalLetter = status === 'conditionally_approved'
  const hasReceipt = isPaymentVerified(paymentStatus)
  const hasSlip = status !== 'draft'

  if (!hasSlip && !hasAcceptanceLetter && !hasConditionalLetter && !hasReceipt) {
    return null
  }

  const acceptanceBtn = hasAcceptanceLetter && (
    <Button
      onClick={() => handleDownload('acceptance')}
      disabled={loadingType !== null}
      loading={loadingType === 'acceptance'}
      variant="outline"
      size="sm"
      className="min-h-11 w-full justify-center gap-2 border-green-500 text-green-700 hover:bg-green-50 sm:w-auto"
    >
      {loadingType !== 'acceptance' && <Award className="w-4 h-4" />}
      {loadingType === 'acceptance' ? 'Generating…' : 'Acceptance Letter'}
    </Button>
  )

  const conditionalBtn = hasConditionalLetter && (
    <Button
      onClick={() => handleDownload('conditional')}
      disabled={loadingType !== null}
      loading={loadingType === 'conditional'}
      variant="outline"
      size="sm"
      className="min-h-11 w-full justify-center gap-2 border-amber-500 text-amber-700 hover:bg-amber-50 sm:w-auto"
    >
      {loadingType !== 'conditional' && <FileCheck className="w-4 h-4" />}
      {loadingType === 'conditional' ? 'Generating…' : 'Conditional Acceptance'}
    </Button>
  )

  const receiptBtn = hasReceipt && (
    <Button
      onClick={() => handleDownload('receipt')}
      disabled={loadingType !== null}
      loading={loadingType === 'receipt'}
      variant="outline"
      size="sm"
      className="min-h-11 w-full justify-center gap-2 sm:w-auto"
    >
      {loadingType !== 'receipt' && <Download className="w-4 h-4" />}
      {loadingType === 'receipt' ? 'Generating…' : 'Payment Receipt'}
    </Button>
  )

  return (
    <>
      {/* Mobile: collapsible */}
      <details className="group w-full rounded-lg border border-border bg-muted/30 sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground marker:hidden">
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
