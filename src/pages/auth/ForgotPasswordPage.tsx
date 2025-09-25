import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from './AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordForm) => {
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const result = await requestPasswordReset(data.email)

      if (result.error) {
        setError(result.error)
        return
      }

      setSuccess(
        'Password reset instructions have been sent to your email if an account exists. Please check your inbox.',
      )
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
          error={errors.email?.message}
        />

        {error && (
          <div className="rounded-xl border border-red-200/70 bg-red-50/80 p-4 text-left shadow-sm">
            <div className="text-sm font-medium text-red-700">{error}</div>
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-left shadow-sm">
            <div className="text-sm font-medium text-emerald-700">{success}</div>
          </div>
        )}

        <Button type="submit" className="w-full" loading={loading} variant="gradient" size="lg">
          Send reset instructions
        </Button>
      </form>
    </AuthLayout>
  )
}

