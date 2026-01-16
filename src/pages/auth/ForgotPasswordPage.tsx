/**
 * ForgotPasswordPage - Enhanced forgot password page with animations
 * Consistent styling with other auth pages
 * 
 * @requirements 3.7 - Forgot password with success/error state animations
 */

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Turnstile } from '@/components/ui/Turnstile';
import { useAuth } from '@/contexts/AuthContext';
import { durations } from '@/lib/animation-config';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  Mail,
  ArrowRight
} from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const requireTurnstileVerification = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY) && import.meta.env.PROD;

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setError('');
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
    setTurnstileKey(prev => prev + 1);
    setError('Security verification failed. Please try again.');
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('');
    setError('Security verification expired. Please verify again.');
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    if (requireTurnstileVerification && !turnstileToken) {
      setError('Please complete the security verification.');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const result = await requestPasswordReset(data.email, turnstileToken || undefined);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(
        'Password reset instructions have been sent to your email if an account exists. Please check your inbox.',
      );
      setTurnstileToken('');
      setTurnstileKey(prev => prev + 1);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Unable to process your request. Please try again.');
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

  const messageVariants = {
    hidden: { opacity: 0, height: 0, marginTop: 0 },
    visible: {
      opacity: 1,
      height: 'auto',
      marginTop: 16,
      transition: {
        duration: prefersReducedMotion ? 0 : durations.normal,
        ease: 'easeOut',
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      marginTop: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : durations.fast,
      },
    },
  };

  // Success state
  if (success) {
    return (
      <AuthLayout
        title="Check your email"
        description="We've sent you password reset instructions"
        backLinkHref="/auth/signin"
        backLinkLabel="Back to sign in"
      >
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : durations.normal }}
        >
          {/* Success icon */}
          <motion.div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 15,
              delay: prefersReducedMotion ? 0 : 0.2,
            }}
          >
            <Mail className="h-8 w-8 text-green-600" />
          </motion.div>

          {/* Success message */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-sm text-green-700">{success}</p>
          </div>

          {/* Instructions */}
          <div className="space-y-3 text-center text-sm text-muted-foreground">
            <p>Didn't receive the email? Check your spam folder or try again.</p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setSuccess('');
                setTurnstileKey(prev => prev + 1);
              }}
            >
              Try another email
            </Button>
            <Link to="/auth/signin" className="block">
              <Button variant="gradient" className="w-full" size="lg">
                Return to sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter the email associated with your account and we'll send you instructions to reset your password."
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
        <Input
          {...register('email')}
          type="email"
          label="Email address"
          required
          autoComplete="email"
          error={errors.email?.message}
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

        {/* Turnstile verification */}
        {Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY) && (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground mb-3 text-center">
              Complete the security verification
            </p>
            <div className="flex justify-center">
              <Turnstile
                key={turnstileKey}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                onVerify={handleTurnstileVerify}
                onError={handleTurnstileError}
                onExpire={handleTurnstileExpire}
              />
            </div>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          loading={loading}
          variant="gradient"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            'Send reset instructions'
          )}
        </Button>

        {/* Help text */}
        <p className="text-center text-xs text-muted-foreground">
          Remember your password?{' '}
          <Link to="/auth/signin" className="text-primary hover:underline">
            Sign in instead
          </Link>
        </p>
      </motion.form>
    </AuthLayout>
  );
}
