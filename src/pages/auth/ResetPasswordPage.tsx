/**
 * ResetPasswordPage - Enhanced reset password page with animations
 * Consistent styling with other auth pages
 * 
 * @requirements 3.7 - Reset password with success/error state animations
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { durations } from '@/lib/animation-config';
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
  const { updatePassword } = useAuth();
  const [status, setStatus] = useState<ResetState>('verifying');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefersReducedMotion = useReducedMotion();

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
      setError('This password reset link is invalid or has expired.');
      setStatus('error');
      return;
    }

    let isMounted = true;

    const verifyResetToken = async () => {
      try {
        // Verify the reset token via our custom API
        const response = await fetch('/api/auth?action=verify-reset-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token })
        });

        const result = await response.json();

        if (!isMounted) return;

        if (!result.success) {
          setError(result.error || 'This password reset link is invalid or has expired.');
          setStatus('error');
          return;
        }

        // Store the token for use when submitting the new password
        setResetToken(token);

        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        setStatus('ready');
      } catch (error) {
        if (!isMounted) return;
        setError(error instanceof Error ? error.message : 'Unable to verify reset link. Please try again.');
        setStatus('error');
      }
    };

    verifyResetToken();

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const onSubmit = async (values: ResetPasswordForm) => {
    setError('');
    setLoading(true);

    try {
      // Use the custom API to reset password with the token
      const response = await fetch('/api/auth?action=reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          token: resetToken,
          password: values.password 
        })
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Failed to update password');
        setLoading(false);
        return;
      }

      reset({ password: '', confirmPassword: '' });
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Animation variants
  const contentVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : durations.normal,
        ease: 'easeOut',
      },
    },
  };

  const iconVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 200,
        damping: 15,
        delay: prefersReducedMotion ? 0 : 0.2,
      },
    },
  };

  const messageVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: {
      opacity: 1,
      height: 'auto',
      transition: {
        duration: prefersReducedMotion ? 0 : durations.normal,
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : durations.fast,
      },
    },
  };

  // Verifying state
  if (status === 'verifying') {
    return (
      <AuthLayout
        title="Verifying your link"
        description="Please wait while we verify your password reset link..."
        backLinkHref="/auth/signin"
        backLinkLabel="Back to sign in"
      >
        <motion.div
          className="flex flex-col items-center justify-center py-8 space-y-4"
          variants={contentVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div
            animate={prefersReducedMotion ? {} : { rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="h-12 w-12 text-primary" />
          </motion.div>
          <p className="text-sm text-muted-foreground">Verifying your password reset link...</p>
        </motion.div>
      </AuthLayout>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <AuthLayout
        title="Password updated!"
        description="Your password has been successfully reset"
        backLinkHref="/auth/signin"
        backLinkLabel="Back to sign in"
      >
        <motion.div
          className="space-y-6"
          variants={contentVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Success icon */}
          <motion.div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
            variants={iconVariants}
            initial="hidden"
            animate="visible"
          >
            <CheckCircle className="h-8 w-8 text-green-600" />
          </motion.div>

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
        </motion.div>
      </AuthLayout>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <AuthLayout
        title="Unable to reset password"
        description="There was a problem with your reset link"
        backLinkHref="/auth/signin"
        backLinkLabel="Back to sign in"
      >
        <motion.div
          className="space-y-6"
          variants={contentVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Error icon */}
          <motion.div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100"
            variants={iconVariants}
            initial="hidden"
            animate="visible"
          >
            <AlertCircle className="h-8 w-8 text-red-600" />
          </motion.div>

          {/* Error message */}
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <h3 className="text-base font-semibold text-red-700">Reset link invalid</h3>
            <p className="mt-1 text-sm text-red-600">{error}</p>
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
        </motion.div>
      </AuthLayout>
    );
  }

  // Ready state - show form
  return (
    <AuthLayout
      title="Choose a new password"
      description="Enter a new password for your account. Make sure it's strong and unique to keep your account secure."
      backLinkHref="/auth/signin"
      backLinkLabel="Back to sign in"
    >
      <motion.form
        className="space-y-6"
        onSubmit={handleSubmit(onSubmit)}
        variants={contentVariants}
        initial="hidden"
        animate="visible"
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
          disabled={loading}
        />

        <PasswordInput
          {...register('confirmPassword')}
          label="Confirm new password"
          required
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          disabled={loading}
        />

        {/* Error message */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              variants={messageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="overflow-hidden"
            >
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="text-sm font-medium text-destructive">{error}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          type="submit"
          className="w-full"
          variant="gradient"
          size="lg"
          loading={loading}
        >
          {loading ? (
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
      </motion.form>
    </AuthLayout>
  );
}
