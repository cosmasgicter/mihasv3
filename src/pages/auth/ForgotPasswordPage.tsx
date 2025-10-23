import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from './AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Turnstile } from '@/components/ui/Turnstile'
import { useAuth } from '@/contexts/AuthContext'

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileKey, setTurnstileKey] = useState(0)

  const requireTurnstileVerification = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY) && import.meta.env.PROD

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token)
    setError('')
  }, [])

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('')
    setTurnstileKey(prev => prev + 1)
    setError('Security verification failed. Please try again.')
  }, [])

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('')
    setError('Security verification expired. Please verify again.')
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordForm) => {
    if (requireTurnstileVerification && !turnstileToken) {
      setError('Please complete the security verification.')
      return
    }

    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const result = await requestPasswordReset(data.email, turnstileToken || undefined)

      if (result.error) {
        setError(result.error)
        return
      }

      setSuccess(
        'Password reset instructions have been sent to your email if an account exists. Please check your inbox.',
      )
      setTurnstileToken('')
      setTurnstileKey(prev => prev + 1)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Unable to process your request. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter the email associated with your account and we will send you instructions to reset your password."
      backLinkHref="/auth/signin"
      backLinkLabel="Back to sign in"
    >
      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        <Input
          {...register('email')}
          type="email"
          label="Email address"
          required
          autoComplete="email"
          error={errors.email?.message}
        />

        {error && (
          <div className="rounded-xl border border-destructive/30/70 bg-destructive/5/30/80 p-4 text-left shadow-sm">
            <div className="text-sm font-medium text-error">{error}</div>
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-left shadow-sm">
            <div className="text-sm font-medium text-emerald-700">{success}</div>
          </div>
        )}

        {Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY) && (
          <div className="rounded-xl border border-primary/10 bg-primary/5 p-4">
            <Turnstile
              key={turnstileKey}
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
              onVerify={handleTurnstileVerify}
              onError={handleTurnstileError}
              onExpire={handleTurnstileExpire}
            />
          </div>
        )}

        <Button type="submit" className="w-full" loading={loading} variant="gradient" size="lg">
          Send reset instructions
        </Button>
      </form>
    </AuthLayout>
  )
}

