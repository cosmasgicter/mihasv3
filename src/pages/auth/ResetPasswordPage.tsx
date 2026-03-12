/**
 * ResetPasswordPage - Enhanced reset password page with CSS animations
 * Consistent styling with other auth pages
 * 
 * @requirements 1.2 - CSS transitions/Tailwind instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior using CSS equivalents
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { animateClasses } from '@/lib/animations';
import { Seo } from '@/components/seo/Seo';
import { apiClient } from '@/services/client';
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  KeyRound,
  ArrowRight,
  RefreshCw
} from 'lucide-react';

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

    let isMounted = true;

    const verifyResetToken = async () => {
      try {
        await apiClient.request('/auth?action=verify-reset-token', {
          method: 'POST',
          body: JSON.stringify({ token })
        })

        if (!isMounted) return;

        // Store the token for use when submitting the new password
        setResetToken(token);

        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        setStatus('ready');
      } catch (error) {
        if (!isMounted) return;
        setVerifyError(error instanceof Error ? error.message : 'Unable to verify reset link. Please try again.');
        setStatus('error');
      }
    };

    verifyResetToken();

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const resetPasswordMutation = useMutation({
    mutationFn: async (values: ResetPasswordForm) => {
      await apiClient.request('/auth?action=reset-password', {
        method: 'POST',
        body: JSON.stringify({ 
          token: resetToken,
          password: values.password 
        })
      })
    },
    onSuccess: () => {
      reset({ password: '', confirmPassword: '' });
      setStatus('success');
    },
  });

  // Verifying state
  if (status === 'verifying') {
    return (
      <>
        <Seo
          title="Verify Reset Link | MIHAS-KATC Admissions"
          description="Verifying your MIHAS-KATC password reset link before allowing password update."
          path="/auth/reset-password"
        />
      <AuthLayout
        title="Verifying your link"
        description="Please wait while we verify your password reset link..."
        backLinkHref="/auth/signin"
        backLinkLabel="Back to sign in"
      >
        <div className={`flex flex-col items-center justify-center py-8 space-y-4 ${animateClasses.fadeIn}`}>
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Verifying your password reset link...</p>
        </div>
      </AuthLayout>
      </>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <>
        <Seo
          title="Password Updated | MIHAS-KATC Admissions"
          description="Your MIHAS-KATC account password was updated successfully. Sign in again to continue your application journey."
          path="/auth/reset-password"
        />
      <AuthLayout
        title="Password updated!"
        description="Your password has been successfully reset"
        backLinkHref="/auth/signin"
        backLinkLabel="Back to sign in"
      >
        <div className={`space-y-6 ${animateClasses.slideUp}`}>
          {/* Success icon */}
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 ${animateClasses.scaleIn}`}>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>

          {/* Success message */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <h3 className="text-base font-semibold text-green-700">Password updated successfully</h3>
            <p className="mt-1 text-sm text-green-600">
              Your password has been reset. You can now sign in with your new password.
            </p>
          </div>

          {/* Action */}
          <Button
            type="button"
            variant="gradient"
            size="lg"
            className="w-full"
            onClick={() => navigate('/auth/signin')}
          >
            Sign in with new password
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </AuthLayout>
      </>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <>
        <Seo
          title="Reset Link Error | MIHAS-KATC Admissions"
          description="The MIHAS-KATC password reset link is invalid or expired. Request a new link to continue."
          path="/auth/reset-password"
        />
      <AuthLayout
        title="Unable to reset password"
        description="There was a problem with your reset link"
        backLinkHref="/auth/signin"
        backLinkLabel="Back to sign in"
      >
        <div className={`space-y-6 ${animateClasses.slideUp}`}>
          {/* Error icon */}
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 ${animateClasses.scaleIn}`}>
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>

          {/* Error message */}
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <h3 className="text-base font-semibold text-red-700">Reset link invalid</h3>
            <p className="mt-1 text-sm text-red-600">{verifyError}</p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              type="button"
              variant="gradient"
              size="lg"
              className="w-full"
              onClick={() => navigate('/auth/forgot-password')}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Request a new reset link
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => navigate('/auth/signin')}
            >
              Return to sign in
            </Button>
          </div>
        </div>
      </AuthLayout>
      </>
    );
  }

  // Ready state - show form
  return (
    <>
      <Seo
        title="Set New Password | MIHAS-KATC Admissions"
        description="Create a new secure password for your MIHAS-KATC admissions account."
        path="/auth/reset-password"
      />
    <AuthLayout
      title="Choose a new password"
      description="Enter a new password for your account. Make sure it's strong and unique to keep your account secure."
      backLinkHref="/auth/signin"
      backLinkLabel="Back to sign in"
    >
      <form
        className={`space-y-6 ${animateClasses.slideUp}`}
        onSubmit={handleSubmit((values) => resetPasswordMutation.mutate(values))}
      >
        {/* Password icon */}
        <div className="flex justify-center mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
        </div>

        <PasswordInput
          {...register('password')}
          label="New password"
          required
          autoComplete="new-password"
          error={errors.password?.message}
          helperText="At least 8 characters with a number and letter"
          disabled={resetPasswordMutation.isPending}
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

        {/* Error message */}
        {resetPasswordMutation.error && (
          <div className={`overflow-hidden ${animateClasses.fadeIn}`}>
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm font-medium text-destructive">
                {(resetPasswordMutation.error as Error).message || 'Failed to update password. Please try again.'}
              </div>
            </div>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          variant="gradient"
          size="lg"
          loading={resetPasswordMutation.isPending}
        >
          {resetPasswordMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating password...
            </>
          ) : (
            'Update password'
          )}
        </Button>

        {/* Password requirements */}
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Password requirements:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-muted-foreground" />
              At least 8 characters long
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-muted-foreground" />
              Contains at least one number
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-muted-foreground" />
              Contains at least one letter
            </li>
          </ul>
        </div>
      </form>
    </AuthLayout>
    </>
  );
}
