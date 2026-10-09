/**
 * AcceptInvitationPage (admissions-v2 task 4.2 — staff invitation handoff).
 *
 * The invited tenant admin/reviewer lands here from the emailed single-use link
 * and sets their OWN password (R4.3). No password was ever set by, shown to, or
 * stored for the inviting admin. Public/unauthenticated — the invitee is not yet
 * signed in; the token in the URL is the sole guard. Mirrors ResetPasswordPage.
 */
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from '@/lib/zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle } from 'lucide-react'

import { AuthShell, AuthShellFooter, AuthShellLink } from '@/components/auth/AuthShell'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { AuthSkeleton } from '@/components/ui'
import { Seo } from '@/components/seo/Seo'
import { authService } from '@/services/auth'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'

const acceptInvitationSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type AcceptInvitationForm = z.infer<typeof acceptInvitationSchema>

type AcceptState = 'verifying' | 'ready' | 'success' | 'error'

export default function AcceptInvitationPage() {
  const [status, setStatus] = useState<AcceptState>('verifying')
  const [verifyError, setVerifyError] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AcceptInvitationForm>({
    resolver: zodResolver(acceptInvitationSchema),
  })

  useEffect(() => {
    const urlToken =
      searchParams.get('token') ||
      (typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '')
    if (!urlToken) {
      setVerifyError('This invitation link is invalid or has expired.')
      setStatus('error')
      return
    }
    setToken(urlToken)
    // Strip the token from the address bar so it is not left in history (R4.3).
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    setStatus('ready')
  }, [searchParams])

  const acceptMutation = useMutation({
    mutationFn: async (values: AcceptInvitationForm) => {
      await authService.acceptStaffInvitation({ token: token!, password: values.password })
    },
    onSuccess: () => {
      reset({ password: '', confirmPassword: '' })
      setStatus('success')
    },
    onError: (error: unknown) => {
      logApiError('accept-invitation', '/auth/staff-invitation/accept/', error)
      const message = toError(error).message || 'Failed to accept invitation'
      if (/expired|invalid|already been used/i.test(message)) {
        setVerifyError(
          'This invitation link is invalid, expired, or already used. Ask your administrator to resend it.',
        )
        setStatus('error')
      }
    },
  })

  if (status === 'verifying') {
    return (
      <>
        <Seo title="Verify Invitation | Beanola Admissions" description="Verifying your Beanola staff invitation link." path="/auth/accept-invitation" noindex />
        <AuthSkeleton />
      </>
    )
  }

  if (status === 'success') {
    return (
      <>
        <Seo title="Invitation Accepted | Beanola Admissions" description="Your Beanola staff account is ready. Sign in to continue." path="/auth/accept-invitation" noindex />
        <AuthShell
          title="Invitation accepted"
          description="Sign in with your new password to access your admissions workspace."
          footer={<AuthShellFooter><AuthShellLink to="/auth/signin">Sign in</AuthShellLink></AuthShellFooter>}
        >
          <div className="space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle className="h-8 w-8" aria-hidden="true" />
            </div>
            <Button type="button" variant="primary" size="lg" className="w-full min-h-[48px]" onClick={() => navigate('/auth/signin')}>
              Sign in
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </AuthShell>
      </>
    )
  }

  if (status === 'error') {
    return (
      <>
        <Seo title="Invitation Link Error | Beanola Admissions" description="The Beanola staff invitation link is invalid or expired." path="/auth/accept-invitation" noindex />
        <AuthShell
          title="Invitation link invalid"
          description={verifyError}
          footer={<AuthShellFooter><AuthShellLink to="/auth/signin">Back to sign in</AuthShellLink></AuthShellFooter>}
        >
          <div className="space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-8 w-8" aria-hidden="true" />
            </div>
            <Button type="button" variant="outline" className="w-full min-h-[48px]" onClick={() => navigate('/auth/signin')}>
              Return to sign in
            </Button>
          </div>
        </AuthShell>
      </>
    )
  }

  // Ready state — the invitee chooses their own password.
  return (
    <>
      <Seo title="Set Your Password | Beanola Admissions" description="Accept your Beanola staff invitation and set your own secure password." path="/auth/accept-invitation" noindex />
      <AuthShell
        title="Set your password"
        description="Choose your own password to accept the invitation and access your admissions workspace."
        footer={<AuthShellFooter><AuthShellLink to="/auth/signin">Back to sign in</AuthShellLink></AuthShellFooter>}
      >
        <form
          className="space-y-5"
          onSubmit={handleSubmit((values) => acceptMutation.mutate(values))}
          method="post"
          noValidate
        >
          <PasswordInput
            {...register('password')}
            label="Password"
            required
            autoComplete="new-password"
            error={errors.password?.message}
            helperText="At least 8 characters with a number and letter"
            disabled={acceptMutation.isPending}
            autoFocus
            className="min-h-[48px]"
          />
          <PasswordInput
            {...register('confirmPassword')}
            label="Confirm password"
            required
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            disabled={acceptMutation.isPending}
            className="min-h-[48px]"
          />

          {acceptMutation.error ? (
            <div role="alert" aria-live="assertive" aria-atomic="true">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-sm font-medium text-destructive">
                  {(acceptMutation.error as Error).message || 'Failed to accept invitation. Please try again.'}
                </div>
              </div>
            </div>
          ) : null}

          <Button type="submit" className="w-full min-h-[48px]" variant="primary" size="lg" loading={acceptMutation.isPending}>
            {acceptMutation.isPending ? 'Setting password...' : 'Accept invitation'}
          </Button>
        </form>
      </AuthShell>
    </>
  )
}
