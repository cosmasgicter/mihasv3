import { useState } from 'react'
import { generateApplicationSlip } from '@/lib/applicationSlip'
import { generateAcceptanceLetter } from '@/lib/acceptanceLetterGenerator'
import { generatePaymentReceipt } from '@/lib/receiptGenerator'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { getSupabaseClient } from '@/lib/supabase'

export function useDocumentGeneration() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateDocument = async (type: 'slip' | 'acceptance' | 'receipt', applicationId: string) => {
    setLoading(true)
    setError(null)

    try {
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      // Fetch application data
      const response = await fetch(
        `${getApiBaseUrl()}/applications/${applicationId}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch application data')
      }

      const result = await response.json()
      const application = result.application || result.data
      
      if (!application) {
        console.error('No application data in response:', result)
        throw new Error('No application data received')
      }

      if (!application.application_number || !application.public_tracking_code) {
        console.error('Missing required fields:', application)
        throw new Error('Missing required application fields')
      }
      
      let pdfBlob: Blob
      let filename: string

      switch (type) {
        case 'slip':
          pdfBlob = await generateApplicationSlip({
            public_tracking_code: application.public_tracking_code,
            application_number: application.application_number,
            status: application.status,
            payment_status: application.payment_status,
            submitted_at: application.submitted_at,
            updated_at: application.updated_at,
            program_name: application.program,
            intake_name: application.intake,
            institution: application.institution,
            full_name: application.full_name,
            email: application.email || '',
            phone: application.phone
          })
          filename = `application_slip_${application.application_number}.pdf`
          break

        case 'acceptance':
          if (application.status !== 'approved') {
            throw new Error('Application must be approved to generate acceptance letter')
          }
          pdfBlob = await generateAcceptanceLetter({
            applicationNumber: application.application_number,
            studentName: application.full_name,
            program: application.program,
            institution: application.institution || 'MIHAS',
            intake: application.intake,
            approvedDate: application.updated_at
          })
          filename = `acceptance_letter_${application.application_number}.pdf`
          break

        case 'receipt':
          if (application.payment_status !== 'verified') {
            throw new Error('Payment must be verified to generate receipt')
          }
          
          // Fetch receipt data
          const receiptResponse = await fetch(
            `${getApiBaseUrl()}/payments/generate-receipt?applicationId=${applicationId}`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`
              }
            }
          )
          
          if (!receiptResponse.ok) {
            throw new Error('Failed to fetch receipt data')
          }
          
          const { data: receiptData } = await receiptResponse.json()
          pdfBlob = await generatePaymentReceipt(receiptData)
          filename = `receipt_${receiptData.receiptNumber}.pdf`
          break

        default:
          throw new Error('Invalid document type')
      }

      // Download PDF
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate document'
      setError(message)
      return false
    } finally {
      setLoading(false)
    }
  }

  return { generateDocument, loading, error }
}
