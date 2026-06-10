/**
 * ResetPasswordPage - Enhanced reset password page with CSS animations
 * Consistent styling with other auth pages
 * 
 * @requirements 1.2 - CSS transitions/Tailwind instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior using CSS equivalents
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from '@/lib/zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AuthShell, AuthShellFooter, AuthShellLink } from '@/components/auth/AuthShell';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { AuthSkeleton } from '@/components/ui';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Seo } from '@/components/seo/Seo';
import { authService } from '@/services/auth';
import { logApiError } from '@/lib/apiErrorLogger';
import {
  AlertCircle,
  CheckCircle,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { toError } from '@/lib/toError'

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine(values => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

type ResetState = 'verifying' | 'ready' | 'success' | 'error';

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<ResetState>('verifying');
  const [verifyError, setVerifyError] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    // Get token from URL query params or hash
    const token = searchParams.get('token') || (typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '');

    if (!token) {
      setVerifyError('This password reset link is invalid or has expired.');
      setStatus('error');
      return;
    }

    setResetToken(token);

    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    setStatus('ready');
  }, [searchParams]);

  const resetPasswordMutation = useMutation({
    mutationFn: async (values: ResetPasswordForm) => {
      await authService.passwordResetConfirm({
        token: resetToken!,
        newPassword: values.password,
      })
    },
    onSuccess: () => {
      reset({ password: '', confirmPassword: '' });
      setStatus('success');
    },
    onError: (error: unknown) => {
      logApiError('reset-password', '/auth/password-reset/confirm/', error);
      // Handle token-expired errors
      const message = toError(error).message || 'Failed to update password';
      if (/expired|invalid.*token/i.test(message)) {
        setVerifyError('This password reset link has expired. Please request a new one.');
        setStatus('error');
      }
    },
  });

  // Verifying state
  if (status === 'verifying') {
    return (
      <>
        <Seo
          title="Verify Reset Link | Beanola Admissions"
          description="Verifying your Beanola password reset link before allowing password update."
          path="/auth/reset-password"
        />
        <AuthSkeleton />
      </>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <>
        <Seo
          title="Password Updated | Beanola Admissions"
          description="Your Beanola account password was updated successfully. Sign in again to continue your application journey."
          path="/auth/reset-password"
        />
        <AuthShell
          title="Password updated"
          description="Sign in with your new password to continue."
          footer={
            <AuthShellFooter>
              <AuthShellLink to="/auth/signin">Sign in</AuthShellLink>
            </AuthShellFooter>
          }
        >
          <div className="space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle className="h-8 w-8" aria-hidden="true" />
            </div>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full min-h-[48px]"
              onClick={() => navigate('/auth/signin')}
            >
              Sign in with new password
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </AuthShell>
      </>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <>
        <Seo
          title="Reset Link Error | Beanola Admissions"
          description="The Beanola password reset link is invalid or expired. Request a new link to continue."
          path="/auth/reset-password"
        />
        <AuthShell
          title="Reset link invalid"
          description={verifyError}
          footer={
            <AuthShellFooter>
              <AuthShellLink to="/auth/signin">Back to sign in</AuthShellLink>
            </AuthShellFooter>
          }
        >
          <div className="space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-8 w-8" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full min-h-[48px]"
                onClick={() => navigate('/auth/forgot-password')}
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Request a new reset link
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[48px]"
                onClick={() => navigate('/auth/signin')}
              >
                Return to sign in
              </Button>
            </div>
          </div>
        </AuthShell>
      </>
    );
  }

  // Ready state - show form
  return (
    <>
      <Seo
        title="Set New Password | Beanola Admissions"
        description="Create a new secure password for your Beanola admissions account."
        path="/auth/reset-password"
      />
      <AuthShell
        title="Choose a new password"
        description="At least 8 characters, with a number and a letter."
        footer={
          <AuthShellFooter>
            <AuthShellLink to="/auth/signin">Back to sign in</AuthShellLink>
          </AuthShellFooter>
        }
      >
        <form
          className="space-y-5"
          onSubmit={handleSubmit((values) => resetPasswordMutation.mutate(values))}
          method="post"
          noValidate
        >
          <PasswordInput
            {...register('password')}
            label="New password"
            required
            autoComplete="new-password"
            error={errors.password?.message}
            helperText="At least 8 characters with a number and letter"
            disabled={resetPasswordMutation.isPending}
            autoFocus
            className="min-h-[48px]"
          />

          <PasswordInput
            {...register('confirmPassword')}
            label="Confirm new password"
            required
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            disabled={resetPasswordMutation.isPending}
            className="min-h-[48px]"
          />

          {resetPasswordMutation.error ? (
            <div role="alert" aria-live="assertive" aria-atomic="true">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-sm font-medium text-destructive">
                  {(resetPasswordMutation.error as Error).message || 'Failed to update password. Please try again.'}
                </div>
              </div>
            </div>
          ) : null}

          <Button
            type="submit"
            className="w-full min-h-[48px]"
            variant="primary"
            size="lg"
            loading={resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? 'Updating password...' : 'Update password'}
          </Button>
        </form>
      </AuthShell>
    </>
  );
}
