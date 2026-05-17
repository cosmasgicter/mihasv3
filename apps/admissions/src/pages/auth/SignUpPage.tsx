/**
 * SignUpPage - Clean, minimal sign-up page
 *
 * @requirements 31.2, 31.4, 31.5 - Minimal layout, concise labels, touch targets
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AuthShell, AuthShellFooter, AuthShellLink } from '@/components/auth/AuthShell';
import { Banner } from '@/components/ui/Banner';
import { FormErrorAnnouncer } from '@/components/ui/FormErrorAnnouncer';
import { Seo } from '@/components/seo/Seo';
import { CheckCircle } from 'lucide-react';
import { logApiError } from '@/lib/apiErrorLogger';
import { preloadStudentWorkspaceRoute } from '@/lib/routePreload';

export const signUpSchema = z
  .object({
    first_name: z.string().min(2, 'First name is required'),
    last_name: z.string().min(2, 'Last name is required'),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().min(10, 'Please enter a valid phone number'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
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
  const [success, setSuccess] = useState('');
  const redirectTimerRef = useRef<number | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
  });

  const passwordValue = watch('password', '');

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const signUpMutation = useMutation({
    mutationFn: async (data: SignUpForm) => {
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

      return result;
    },
    onSuccess: () => {
      setSuccess('Account created. Opening your dashboard...');
      void preloadStudentWorkspaceRoute('signup-success');

      redirectTimerRef.current = window.setTimeout(() => {
        navigate('/student/dashboard');
      }, 350);
    },
    onError: (error: unknown) => {
      logApiError('sign-up', '/auth/register/', error);
    },
  });

  const getErrorMessage = (error: Error | null) => {
    if (!error) return '';
    const message = error.message || 'Failed to create account. Please try again.';
    if (
      message.includes('already registered') ||
      message.includes('already exists') ||
      message.includes('sign you in after registration')
    ) {
      return 'This email may already be registered. Please sign in instead.'
    }
    return message
  };

  // Extract field-level errors from Django validation responses (details/fieldErrors)
  const getFieldErrors = (error: Error | null): Record<string, string> => {
    if (!error) return {};
    try {
      const parsed = error as Error & { fieldErrors?: Record<string, string | string[]>; details?: Record<string, string | string[]> };
      const fieldErrors = parsed.fieldErrors || parsed.details;
      if (fieldErrors && typeof fieldErrors === 'object') {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(fieldErrors)) {
          result[key] = Array.isArray(value) ? (value[0] ?? '') : String(value);
        }
        return result;
      }
    } catch {
      // Ignore parsing errors
    }
    return {};
  };

  const serverFieldErrors = getFieldErrors(signUpMutation.error as Error | null);

  if (success) {
    return (
      <>
        <Seo
          title="Create Account | MIHAS Admissions"
          description="Create your MIHAS admissions account."
          path="/auth/signup"
        />
        <AuthShell title="Account created" description="Opening your dashboard…">
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle className="h-8 w-8" aria-hidden="true" />
            </div>
            <Link to="/student/dashboard" className="block">
              <Button className="w-full min-h-[48px]" variant="primary" size="lg">
                Open dashboard
              </Button>
            </Link>
          </div>
        </AuthShell>
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
      <AuthShell
        title="Create account"
        description={
          <>
            Already have an account?{' '}
            <Link
              to="/auth/signin"
              className="font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
            >
              Sign in
            </Link>
          </>
        }
        footer={
          <AuthShellFooter>
            <AuthShellLink to="/auth/signin">Sign in instead</AuthShellLink>
            <AuthShellLink to="/auth/forgot-password" emphasis="muted">
              Forgot password?
            </AuthShellLink>
          </AuthShellFooter>
        }
      >
        <form
          className={cn('space-y-5', signUpMutation.isError && 'motion-safe:animate-shake')}
          onSubmit={handleSubmit((data) => signUpMutation.mutate(data))}
          method="post"
          noValidate
        >
          <FormErrorAnnouncer
            errors={errors}
            fieldLabels={{
              email: 'Email',
              password: 'Password',
              confirmPassword: 'Confirm password',
              first_name: 'First name',
              last_name: 'Last name',
              phone: 'Phone number',
            }}
          />
          {signUpMutation.error ? (
            <Banner variant="error" dismissible onDismiss={() => signUpMutation.reset()}>
              {getErrorMessage(signUpMutation.error as Error)}
            </Banner>
          ) : null}

          {/* Profile basics — first, because we ask for them most often */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              {...register('first_name')}
              type="text"
              inputMode="text"
              label="First name"
              aria-label="First name"
              error={errors.first_name?.message || serverFieldErrors.first_name}
              autoComplete="given-name"
              disabled={signUpMutation.isPending}
              required
              autoFocus
              className="min-h-[48px]"
            />
            <Input
              {...register('last_name')}
              type="text"
              inputMode="text"
              label="Last name"
              aria-label="Last name"
              error={errors.last_name?.message || serverFieldErrors.last_name}
              autoComplete="family-name"
              disabled={signUpMutation.isPending}
              required
              className="min-h-[48px]"
            />
          </div>

          <Input
            {...register('email')}
            type="email"
            inputMode="email"
            label="Email"
            aria-label="Email"
            error={errors.email?.message || serverFieldErrors.email}
            helperText="We'll verify this address. If you already have an account, sign in instead."
            autoComplete="email"
            disabled={signUpMutation.isPending}
            required
            className="min-h-[48px]"
          />

          <Input
            {...register('phone')}
            type="tel"
            inputMode="tel"
            label="Phone number"
            aria-label="Phone number"
            error={errors.phone?.message || serverFieldErrors.phone}
            autoComplete="tel"
            disabled={signUpMutation.isPending}
            required
            className="min-h-[48px]"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PasswordInput
              {...register('password')}
              label="Password"
              aria-label="Password"
              error={errors.password?.message || serverFieldErrors.password}
              autoComplete="new-password"
              disabled={signUpMutation.isPending}
              required
              className="min-h-[48px]"
            />
            <PasswordInput
              {...register('confirmPassword')}
              label="Confirm password"
              aria-label="Confirm password"
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
              disabled={signUpMutation.isPending}
              required
              className="min-h-[48px]"
            />
          </div>

          {passwordValue.length > 0 && (() => {
            const checks = [
              passwordValue.length >= 8,
              /[A-Z]/.test(passwordValue),
              /[0-9]/.test(passwordValue),
              /[^A-Za-z0-9]/.test(passwordValue),
            ]
            const strength = checks.filter(Boolean).length
            const label = ['Weak', 'Fair', 'Good', 'Strong'][strength - 1] || 'Weak'
            // Use semantic status tokens, not raw colors
            const color =
              strength >= 4 ? 'bg-success'
              : strength === 3 ? 'bg-warning'
              : strength === 2 ? 'bg-warning/60'
              : 'bg-destructive'
            return (
              <div className="space-y-1.5" aria-live="polite">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors',
                        level <= strength ? color : 'bg-muted',
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Password strength: <span className="font-medium text-foreground">{label}</span>
                </p>
              </div>
            )
          })()}

          <Button
            type="submit"
            className="w-full min-h-[48px]"
            loading={signUpMutation.isPending}
            variant="primary"
            size="lg"
          >
            {signUpMutation.isPending ? 'Creating account...' : 'Create account'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By creating an account, you agree to our{' '}
            <Link to="/terms" className="text-primary hover:underline">Terms</Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
          </p>
        </form>
      </AuthShell>
    </>
  );
}
