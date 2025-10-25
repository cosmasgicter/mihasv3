import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from './AuthLayout'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[0-9]/, 'Password must include at least one number')
      .regex(/[A-Za-z]/, 'Password must include at least one letter'),
    confirmPassword: z.string(),
  })
  .refine(values => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>

type ResetState = 'verifying' | 'ready' | 'success' | 'error'

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const [status, setStatus] = useState<ResetState>('verifying')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  })

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('Password reset is currently unavailable. Please contact support.')
      setStatus('error')
      return
    }

    const hash = typeof window !== 'undefined' ? window.location.hash : ''

    if (!hash) {
      setError('This password reset link is invalid or has expired.')
      setStatus('error')
      return
    }

    let isMounted = true

    const verifySessionFromHash = async () => {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(hash)

        if (!isMounted) return

        if (error || !data.session) {
          setError(error?.message || 'This password reset link is invalid or has expired.')
          setStatus('error')
          return
        }

        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
        }

        setStatus('ready')
      } catch (error) {
        if (!isMounted) return
        setError(error instanceof Error ? error.message : 'Unable to verify reset link. Please try again.')
        setStatus('error')
      }
    }

    verifySessionFromHash()

    return () => {
      isMounted = false
    }
  }, [])

  const onSubmit = async (values: ResetPasswordForm) => {
    setError('')

    const result = await updatePassword(values.password)

    if (result.error) {
      setError(result.error)
      return
    }

    reset({ password: '', confirmPassword: '' })
    setStatus('success')
  }

  const renderContent = () => {
    if (status === 'verifying') {
      return (
        <div className="space-y-4 text-center">
          <p className="text-sm text-gray-900">Verifying your password reset link...</p>
        </div>
      )
    }

    if (status === 'success') {
      return (
        <div className="space-y-4 text-center">
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-6">
            <h3 className="text-lg font-semibold text-emerald-700">Password updated successfully</h3>
            <p className="mt-2 text-sm text-gray-900">
              Your password has been reset. You can now sign in with your new password.
            </p>
          </div>
          <Button
            type="button"
            variant="gradient"
            size="lg"
            className="w-full"
            onClick={() => navigate('/auth/signin')}
          >
            Return to sign in
          </Button>
        </div>
      )
    }

    if (status === 'error') {
      return (
        <div className="space-y-4 text-center">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <h3 className="text-lg font-semibold text-error">Unable to reset password</h3>
            <p className="mt-2 text-sm text-gray-900">{error}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => navigate('/auth/forgot-password')}
          >
            Request a new reset link
          </Button>
        </div>
      )
    }

    return (
      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        <PasswordInput
          {...register('password')}
          label="New password"
          required
          autoComplete="new-password"
          error={errors.password?.message}
        />

        <PasswordInput
          {...register('confirmPassword')}
          label="Confirm password"
          required
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
        />

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left shadow-sm">
            <div className="text-sm font-medium text-error">{error}</div>
          </div>
        )}

        <Button type="submit" className="w-full" variant="gradient" size="lg">
          Update password
        </Button>
      </form>
    )
  }

  return (
    <AuthLayout
      title="Choose a new password"
      description="Enter a new password for your account. Make sure it's strong and unique to keep your account secure."
      backLinkHref="/auth/signin"
      backLinkLabel="Back to sign in"
    >
      {renderContent()}
    </AuthLayout>
  )
}

