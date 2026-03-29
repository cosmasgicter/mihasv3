import { Download, Award } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDocumentGeneration } from '@/hooks/useDocumentGeneration'
import { useToastStore } from '@/hooks/useToast'
import { logger } from '@/lib/logger'
import { ApplicationSlipActions } from '@/components/student/ApplicationSlipActions'

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

  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'draft' && (
        <ApplicationSlipActions
          applicationId={applicationId}
          applicationNumber={applicationNumber}
        />
      )}

      {/* Acceptance Letter - Only for approved */}
      {status === 'approved' && (
        <Button
          onClick={() => handleDownload('acceptance')}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-2 border-green-500 text-green-700 hover:bg-green-50"
        >
          <Award className="w-4 h-4" />
          Acceptance Letter
        </Button>
      )}

      {/* Payment Receipt - Only for verified payments */}
      {paymentStatus === 'verified' && (
        <Button
          onClick={() => handleDownload('receipt')}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Payment Receipt
        </Button>
      )}
    </div>
  )
}
