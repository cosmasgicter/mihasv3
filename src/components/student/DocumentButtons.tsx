import { Download, FileText, Award } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDocumentGeneration } from '@/hooks/useDocumentGeneration'
import { useToastStore } from '@/components/ui/Toast'

interface DocumentButtonsProps {
  applicationId: string
  status: string
  paymentStatus: string
}

export function DocumentButtons({ applicationId, status, paymentStatus }: DocumentButtonsProps) {
  const { generateDocument, loading } = useDocumentGeneration()
  const { addToast } = useToastStore()

  const handleDownload = async (type: 'slip' | 'acceptance' | 'receipt') => {
    console.log('[DocumentButtons] handleDownload called for type:', type)
    const success = await generateDocument(type, applicationId)
    console.log('[DocumentButtons] generateDocument returned:', success)
    if (success) {
      addToast('success', 'Document downloaded successfully')
    } else {
      addToast('error', 'Failed to generate document')
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {/* Application Slip - Always available after submission */}
      {status !== 'draft' && (
        <Button
          onClick={() => handleDownload('slip')}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <FileText className="w-4 h-4" />
          Application Slip
        </Button>
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
