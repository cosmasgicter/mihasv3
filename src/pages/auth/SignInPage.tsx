/**
 * SignInPage - Clean, minimal sign-in page
 *
 * @requirements 31.1, 31.3, 31.6, 31.7 - Minimal layout, center-aligned card
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { AnimatedInput } from '@/components/smoothui/animated-input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AuthLoadingOverlay } from '@/components/ui/AuthLoadingOverlay';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ErrorBanner } from '@/components/ui/ErrorDisplay';
import { Seo } from '@/components/seo/Seo';
import { isAdminRole } from '@/lib/auth/roles';

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

  const seoByPath = {
    '/auth/signin': {
      title: 'Sign In | MIHAS Admissions',
      description: 'Sign in to the MIHAS admissions portal.',
    },
    '/signin': {
      title: 'Login | MIHAS Admissions',
      description: 'Access your MIHAS student admissions account.',
    },
    '/login': {
      title: 'Login | MIHAS Admissions',
      description: 'Sign in to manage applications and status updates.',
    },
  } as const;
  const seoConfig = seoByPath[location.pathname as keyof typeof seoByPath] || seoByPath['/auth/signin'];

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

      setIsAuthenticating(true);

      const locationState = location.state as { from?: { pathname?: string } } | null;
      const from = locationState?.from?.pathname;
      const role = result?.user?.role;
      const defaultRedirect = isAdminRole(role) ? '/admin/dashboard' : '/student/dashboard';
      const redirectTo = from && from !== '/auth/signin' ? from : defaultRedirect;

      navigate(redirectTo, { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to sign in. Please try again.';
      setError(message.includes('Invalid') ? 'Invalid email or password.' : message);
      setLoading(false);
      setIsAuthenticating(false);
    }
  };

  return (
    <>
      <Seo title={seoConfig.title} description={seoConfig.description} path={location.pathname} />
      {isAuthenticating && <AuthLoadingOverlay message="Signing you in..." />}
      <AuthLayout
        variant="signin"
        title="Sign in"
        description={
          <>
            Don&apos;t have an account?{' '}
            <Link
              to="/auth/signup"
              className="font-semibold text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
              Create one
            </Link>
          </>
        }
        footer={
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
            <Link
              to="/auth/forgot-password"
              className="text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
              Forgot your password?
            </Link>
            <Link
              to="/auth/signup"
              className="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
              Create a new account
            </Link>
          </div>
        }
      >
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          {error && (
            <ErrorBanner
              error={{ status: 401, message: error }}
              onDismiss={() => setError('')}
            />
          )}

          <AnimatedInput
            {...register('email')}
            type="email"
            label="Email"
            error={errors.email?.message}
            autoComplete="email"
            disabled={loading}
            required
          />

          <PasswordInput
            {...register('password')}
            label="Password"
            error={errors.password?.message}
            autoComplete="current-password"
            disabled={loading}
            required
          />

          <Button
            type="submit"
            className="w-full min-h-[44px]"
            loading={loading}
            variant="gradient"
            size="lg"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </AuthLayout>
    </>
  );
}
