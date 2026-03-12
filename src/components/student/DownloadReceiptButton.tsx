import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { usePaymentReceipt } from '@/hooks/usePaymentReceipt'
import { useToastStore } from '@/hooks/useToast'

interface DownloadReceiptButtonProps {
  applicationId: string
  paymentStatus: string
  disabled?: boolean
}

export function DownloadReceiptButton({ 
  applicationId, 
  paymentStatus,
  disabled 
}: DownloadReceiptButtonProps) {
  const { generateReceipt, loading } = usePaymentReceipt()
  const { addToast } = useToastStore()

  const handleDownload = async () => {
    const success = await generateReceipt(applicationId)
    if (success) {
      addToast('success', 'Receipt downloaded successfully')
    } else {
      addToast('error', 'Failed to generate receipt')
    }
  }

  if (paymentStatus !== 'verified') {
    return null
  }

  return (
    <Button
      onClick={handleDownload}
      disabled={disabled || loading}
      loading={loading}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <Download className="w-4 h-4" />
      {loading ? 'Generating...' : 'Download Receipt'}
    </Button>
  )
}
