import { useState } from 'react'
import { generatePaymentReceipt } from '@/lib/receiptGenerator'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { getSupabaseClient } from '@/lib/supabase'

export function usePaymentReceipt() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateReceipt = async (applicationId: string) => {
    setLoading(true)
    setError(null)

    try {
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(
        `${getApiBaseUrl()}/payments/generate-receipt?applicationId=${applicationId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate receipt')
      }

      const { data } = await response.json()
      
      const pdfBlob = await generatePaymentReceipt(data)
      
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `receipt_${data.receiptNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate receipt'
      setError(message)
      return false
    } finally {
      setLoading(false)
    }
  }

  return { generateReceipt, loading, error }
}
