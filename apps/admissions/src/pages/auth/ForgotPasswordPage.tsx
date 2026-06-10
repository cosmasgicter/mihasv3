/**
 * ForgotPasswordPage - Enhanced forgot password page with CSS animations
 * Consistent styling with other auth pages
 * 
 * @requirements 1.2 - CSS transitions/Tailwind instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior using CSS equivalents
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from '@/lib/zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AuthShell, AuthShellFooter, AuthShellLink } from '@/components/auth/AuthShell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { logApiError } from '@/lib/apiErrorLogger';
import { Seo } from '@/components/seo/Seo';
import { 
  Mail,
  ArrowRight
} from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [success, setSuccess] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const resetRequestMutation = useMutation({
    mutationFn: async (data: ForgotPasswordForm) => {
      // Fire the request but always show the same confirmation message
      // regardless of whether the email exists — prevents email enumeration
      try {
        await requestPasswordReset(data.email);
      } catch (error) {
        // Log the error for diagnostics but don't reveal to user (anti-enumeration)
        logApiError('forgot-password', '/auth/password-reset/', error);
      }
    },
    onSettled: () => {
      setSuccess(
        'If an account with that email exists, we\'ve sent password reset instructions. Please check your inbox and spam folder.',
      );
    },
  });

  // Success state
  if (success) {
    return (
      <>
        <Seo
          title="Check Your Email | Beanola Password Reset"
          description="Password reset requested. Check your email for instructions to regain access to your Beanola admissions account."
          path="/auth/forgot-password"
        />
        <AuthShell
          title="Check your email"
          description="We've sent password reset instructions if your account exists."
          footer={
            <AuthShellFooter>
              <AuthShellLink to="/auth/signin">Return to sign in</AuthShellLink>
              <AuthShellLink to="/auth/forgot-password" emphasis="muted">
                Try another email
              </AuthShellLink>
            </AuthShellFooter>
          }
        >
          <div className="space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <Mail className="h-8 w-8" aria-hidden="true" />
            </div>

            <div className="rounded-lg border border-success/20 bg-success/5 p-4 text-center">
              <p className="text-sm text-success">{success}</p>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              Didn't receive the email? Check your spam folder or try again with a different email.
            </p>

            <Button
              type="button"
              variant="outline"
              className="w-full min-h-[48px]"
              onClick={() => setSuccess('')}
            >
              Try another email
            </Button>
          </div>
        </AuthShell>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Forgot Password | Beanola Admissions Portal"
        description="Request a secure password reset link to recover access to your Beanola admissions account."
        path="/auth/forgot-password"
      />
      <AuthShell
        title="Reset your password"
        description="Enter the email associated with your account. We'll send you instructions."
        footer={
          <AuthShellFooter>
            <AuthShellLink to="/auth/signin">Back to sign in</AuthShellLink>
            <AuthShellLink to="/auth/signup" emphasis="muted">
              Create an account
            </AuthShellLink>
          </AuthShellFooter>
        }
      >
        <form
          className="space-y-5"
          onSubmit={handleSubmit((data) => resetRequestMutation.mutate(data))}
          method="post"
          noValidate
        >
          <Input
            {...register('email')}
            type="email"
            inputMode="email"
            label="Email"
            required
            autoComplete="email"
            error={errors.email?.message}
            disabled={resetRequestMutation.isPending}
            autoFocus
            className="min-h-[48px]"
          />

          <Button
            type="submit"
            className="w-full min-h-[48px]"
            loading={resetRequestMutation.isPending}
            variant="primary"
            size="lg"
          >
            {resetRequestMutation.isPending ? 'Sending...' : 'Send reset instructions'}
            {!resetRequestMutation.isPending && <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />}
          </Button>
        </form>
      </AuthShell>
    </>
  );
}
