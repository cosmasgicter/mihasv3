/**
 * SignInPage - Enhanced sign-in page with Supabase Auth
 * Uses SmoothUI animations and custom theming
 * 
 * @requirements 3.1, 3.3, 3.6 - Supabase Auth UI with loading states and error animations
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AuthLoadingOverlay } from '@/components/ui/AuthLoadingOverlay';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { durations } from '@/lib/animation-config';
import { AlertCircle } from 'lucide-react';

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type SignInForm = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInForm) => {
    setLoading(true);
    setError('');
    setIsAuthenticating(false);

    try {
      const result = await signIn(data.email, data.password);

      if (result?.error) {
        throw new Error(result.error);
      }

      // Log login event
      if (result?.session) {
        fetch('/api/auth/session', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${result.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'login' }),
        }).catch(() => {}); // Silent fail
      }

      // Show loading overlay and wait for auth state to settle
      setIsAuthenticating(true);
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Redirect to intended destination or dashboard
      const from = (location.state as any)?.from?.pathname;
      const redirectTo = from && from !== '/auth/signin' ? from : '/dashboard';

      navigate(redirectTo, { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to sign in. Please try again.';
      setError(message.includes('Invalid') ? 'Invalid email or password. Please try again.' : message);
      setLoading(false);
      setIsAuthenticating(false);
    }
  };

  // Animation variants for error message
  const errorVariants = {
    hidden: { 
      opacity: 0, 
      y: prefersReducedMotion ? 0 : -10,
      height: 0,
    },
    visible: { 
      opacity: 1, 
      y: 0,
      height: 'auto',
      transition: {
        duration: prefersReducedMotion ? 0 : durations.normal,
        ease: 'easeOut',
      },
    },
    exit: {
      opacity: 0,
      y: prefersReducedMotion ? 0 : -10,
      height: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : durations.fast,
      },
    },
  };

  // Animation variants for form fields
  const fieldVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 10 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: prefersReducedMotion ? 0 : i * 0.1,
        duration: prefersReducedMotion ? 0 : durations.normal,
      },
    }),
  };

  return (
    <>
      {isAuthenticating && <AuthLoadingOverlay message="Signing you in..." />}
      <AuthLayout
        title="Sign in to your account"
        description={
          <>
            Or{' '}
            <Link
              to="/auth/signup"
              className="font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
              create a new account
            </Link>
          </>
        }
        footer={
          <div className="space-y-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-background px-3 text-muted-foreground">Need help?</span>
              </div>
            </div>

            <div className="text-center">
              <Link
                to="/auth/forgot-password"
                className="text-sm font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
              >
                Forgot your password?
              </Link>
            </div>
          </div>
        }
      >
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <motion.div
            custom={0}
            variants={fieldVariants}
            initial="hidden"
            animate="visible"
          >
            <Input
              {...register('email')}
              type="email"
              label="Email address"
              error={errors.email?.message}
              autoComplete="email"
              disabled={loading}
              required
            />
          </motion.div>

          <motion.div
            custom={1}
            variants={fieldVariants}
            initial="hidden"
            animate="visible"
          >
            <PasswordInput
              {...register('password')}
              label="Password"
              error={errors.password?.message}
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </motion.div>

          {/* Error message with animation */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                variants={errorVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden"
              >
                <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="text-sm font-medium text-destructive">{error}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            custom={2}
            variants={fieldVariants}
            initial="hidden"
            animate="visible"
          >
            <Button
              type="submit"
              className="w-full"
              loading={loading}
              variant="gradient"
              size="lg"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </motion.div>
        </form>
      </AuthLayout>
    </>
  );
}
