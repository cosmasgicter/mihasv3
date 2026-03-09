/**
 * SignUpPage - Clean, minimal sign-up page
 *
 * @requirements 31.2, 31.4, 31.5 - Minimal layout, concise labels, touch targets
 */

import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/services/client';
import { Button } from '@/components/ui/Button';
import { AnimatedInput } from '@/components/smoothui/animated-input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AuthLoadingOverlay } from '@/components/ui/AuthLoadingOverlay';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ErrorBanner } from '@/components/ui/ErrorDisplay';
import { NotificationService } from '@/lib/notificationService';
import { Seo } from '@/components/seo/Seo';
import { sanitizeForLog } from '@/lib/security';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { animateClasses } from '@/lib/animations';

interface EmailCheckResponse {
  available: boolean;
}

export const signUpSchema = z
  .object({
    first_name: z.string().min(2, 'First name is required'),
    last_name: z.string().min(2, 'Last name is required'),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().min(10, 'Please enter a valid phone number'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type SignUpForm = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
  });

  const checkEmailAvailability = useCallback(async (email: string) => {
    if (!email || !email.includes('@')) {
      setEmailAvailable(null);
      return;
    }

    setEmailChecking(true);
    try {
      const response = await apiClient.request<EmailCheckResponse>(
        `/auth?action=check-email&email=${encodeURIComponent(email)}`,
      );
      const isAvailable = (response as EmailCheckResponse)?.available ?? null;
      setEmailAvailable(isAvailable);
      if (isAvailable === false) {
        setError('This email is already registered. Please sign in instead.');
      } else {
        setError('');
      }
    } catch (err) {
      console.warn('Email check error:', sanitizeForLog(err instanceof Error ? err.message : String(err)));
      setEmailAvailable(null);
    } finally {
      setEmailChecking(false);
    }
  }, []);

  const onSubmit = async (data: SignUpForm) => {
    if (emailAvailable === false) {
      setError('This email is already registered. Please sign in instead.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setIsRegistering(true);

    try {
      const { confirmPassword: _confirmPassword, first_name, last_name, ...rest } = data;
      const full_name = `${first_name} ${last_name}`;
      const result = await signUp(data.email, data.password, {
        full_name,
        first_name,
        last_name,
        ...rest,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      setSuccess('Account created! Redirecting...');
      setLoading(false);
      setIsRegistering(false);

      if (result.user?.id) {
        NotificationService.sendWelcomeNotification(result.user.id, full_name).catch((notificationError) => {
          console.error(
            'Welcome notification error:',
            sanitizeForLog(notificationError instanceof Error ? notificationError.message : String(notificationError)),
          );
        });
      }

      setTimeout(() => {
        navigate('/student/dashboard');
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create account. Please try again.';
      setError(message.includes('already registered') ? 'This email is already registered. Please sign in instead.' : message);
      setLoading(false);
      setIsRegistering(false);
    }
  };

  if (success) {
    return (
      <>
        <Seo
          title="Create Account | MIHAS Admissions"
          description="Create your MIHAS admissions account."
          path="/auth/signup"
        />
        <AuthLayout variant="signup" title="Account created!">
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle className="h-8 w-8" />
            </div>
            <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
            <Link to="/student/dashboard" className="block">
              <Button className="w-full min-h-[44px]" variant="gradient" size="lg">
                Go to dashboard
              </Button>
            </Link>
          </div>
        </AuthLayout>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Create Account | MIHAS Admissions"
        description="Create your MIHAS admissions account to start your application."
        path="/auth/signup"
      />
      {isRegistering && <AuthLoadingOverlay message="Creating your account..." />}
      <AuthLayout
        variant="signup"
        title="Create account"
        description={
          <>
            Already have an account?{' '}
            <Link
              to="/auth/signin"
              className="font-semibold text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
              Sign in
            </Link>
          </>
        }
      >
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          {error && (
            <ErrorBanner
              error={{ status: 400, message: error }}
              onDismiss={() => setError('')}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AnimatedInput
              {...register('first_name')}
              type="text"
              label="First name"
              error={errors.first_name?.message}
              disabled={loading}
              required
            />
            <AnimatedInput
              {...register('last_name')}
              type="text"
              label="Last name"
              error={errors.last_name?.message}
              disabled={loading}
              required
            />
          </div>

          <div className="relative">
            <AnimatedInput
              {...register('email', {
                onBlur: (e) => checkEmailAvailability(e.target.value),
              })}
              type="email"
              label="Email"
              error={errors.email?.message || (emailAvailable === false ? 'Already registered' : undefined)}
              autoComplete="email"
              disabled={loading}
              required
              className={
                emailAvailable === true
                  ? 'border-green-500 focus:ring-green-500'
                  : emailAvailable === false
                    ? 'border-red-500 focus:ring-red-500'
                    : ''
              }
            />
            <div className="mt-1 min-h-5" aria-live="polite">
              {emailChecking && (
                <span className="flex items-center gap-1.5 text-xs text-primary" role="status">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking...
                </span>
              )}
              {!emailChecking && emailAvailable === true && (
                <span className={`flex items-center gap-1.5 text-xs text-success ${animateClasses.fadeIn}`} role="status">
                  <CheckCircle className="h-3 w-3" /> Available
                </span>
              )}
              {!emailChecking && emailAvailable === false && (
                <span className={`flex items-center gap-1.5 text-xs text-destructive ${animateClasses.fadeIn}`} role="alert">
                  <XCircle className="h-3 w-3" />
                  Already registered.{' '}
                  <Link to="/auth/signin" className="underline hover:text-destructive">Sign in</Link>
                </span>
              )}
            </div>
          </div>

          <AnimatedInput
            {...register('phone')}
            type="tel"
            label="Phone number"
            error={errors.phone?.message}
            disabled={loading}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PasswordInput
              {...register('password')}
              label="Password"
              error={errors.password?.message}
              autoComplete="new-password"
              disabled={loading}
              required
            />
            <PasswordInput
              {...register('confirmPassword')}
              label="Confirm password"
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
              disabled={loading}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full min-h-[44px]"
            loading={loading}
            variant="gradient"
            size="lg"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By creating an account, you agree to our{' '}
            <Link to="/terms" className="text-primary hover:underline">Terms</Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
          </p>
        </form>
      </AuthLayout>
    </>
  );
}
