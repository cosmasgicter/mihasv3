import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react'
import { apiClient } from '@/services/client'

type CallbackStatus = 'verifying' | 'successful' | 'failed' | 'pending'

const PAYMENT_ID_STORAGE_KEY = 'mihas:pending-payment-id'

export default function PaymentCallback() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<CallbackStatus>('verifying')
  const [message, setMessage] = useState('')

  const reference = searchParams.get('reference')
  const lencoStatus = searchParams.get('status')
  const errorMessage = searchParams.get('errorMessage')

  useEffect(() => {
    async function verify() {
      const paymentId = localStorage.getItem(PAYMENT_ID_STORAGE_KEY)

      if (lencoStatus === 'successful' || lencoStatus === 'paid') {
        if (paymentId) {
          try {
            await apiClient.request(`/payments/${encodeURIComponent(paymentId)}/verify/`, { method: 'POST' })
          } catch { /* webhook will handle it */ }
          localStorage.removeItem(PAYMENT_ID_STORAGE_KEY)
        }
        setStatus('successful')
        setMessage('Your payment was successful. You can close this tab and return to your application.')
        return
      }

      if (lencoStatus === 'failed') {
        localStorage.removeItem(PAYMENT_ID_STORAGE_KEY)
        setStatus('failed')
        setMessage(errorMessage || 'Your payment could not be processed. Please return to your application and try again.')
        return
      }

      // Pending or unknown — try to verify
      if (paymentId) {
        try {
          const result = await apiClient.request<{ status: string }>(`/payments/${encodeURIComponent(paymentId)}/verify/`, { method: 'POST' })
          if (result?.status === 'successful' || result?.status === 'paid') {
            localStorage.removeItem(PAYMENT_ID_STORAGE_KEY)
            setStatus('successful')
            setMessage('Your payment was successful. You can close this tab and return to your application.')
            return
          }
        } catch { /* fall through to pending */ }
      }

      setStatus('pending')
      setMessage('Your payment is being processed. You can close this tab and return to your application — your status will update automatically.')
    }

    verify()
  }, [lencoStatus, errorMessage, reference])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 text-center shadow-lg">
        {status === 'verifying' && (
          <>
            <Clock className="mx-auto h-12 w-12 animate-pulse text-muted-foreground" />
            <h1 className="text-xl font-semibold text-foreground">Verifying payment…</h1>
            <p className="text-muted-foreground">Please wait while we confirm your payment.</p>
          </>
        )}

        {status === 'successful' && (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="text-xl font-semibold text-foreground">Payment successful</h1>
            <p className="text-muted-foreground">{message}</p>
          </>
        )}

        {status === 'failed' && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="text-xl font-semibold text-foreground">Payment failed</h1>
            <p className="text-muted-foreground">{message}</p>
          </>
        )}

        {status === 'pending' && (
          <>
            <Clock className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="text-xl font-semibold text-foreground">Payment pending</h1>
            <p className="text-muted-foreground">{message}</p>
          </>
        )}

        <Link
          to="/student/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 min-h-touch text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" />Return to application
        </Link>
      </div>
    </div>
  )
}
