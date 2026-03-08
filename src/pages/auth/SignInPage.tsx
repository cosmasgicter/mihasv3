/**
 * SignInPage - Enhanced sign-in page with CSS animations
 * Uses Tailwind animation classes and shared animation utilities
 * 
 * @requirements 1.2 - CSS transitions/Tailwind instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior using CSS equivalents
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
import { staggerChild, animateClasses } from '@/lib/animations';
import { FileText, KeyRound } from 'lucide-react';
import { InfoCallout } from '@/components/ui/InfoCallout';
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
      title: 'Sign In | MIHAS-KATC Admissions Portal',
      description: 'Sign in to the MIHAS-KATC admissions portal to continue your application, upload documents, and check admission updates.',
    },
    '/signin': {
      title: 'Login Access | MIHAS-KATC Admissions Portal',
      description: 'Access your MIHAS-KATC student admissions account to continue your enrollment journey and monitor progress.',
    },
    '/login': {
      title: 'Applicant Login | MIHAS-KATC Admissions',
      description: 'Applicant login for MIHAS-KATC. Securely sign in to manage applications, payments, and status updates.',
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

      // Show loading overlay
      setIsAuthenticating(true);

      // Redirect to intended destination when present; otherwise use role-based dashboard
      const locationState = location.state as { from?: { pathname?: string } } | null
      const from = locationState?.from?.pathname;
      const role = result?.user?.role;
      const defaultRedirect = isAdminRole(role)
        ? '/admin/dashboard'
        : '/student/dashboard';
      const redirectTo = from && from !== '/auth/signin' ? from : defaultRedirect;

      navigate(redirectTo, { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to sign in. Please try again.';
      setError(message.includes('Invalid') ? 'Invalid email or password. Please try again.' : message);
      setLoading(false);
      setIsAuthenticating(false);
    }
  };

  return (
    <>
      <Seo
        title={seoConfig.title}
        description={seoConfig.description}
        path={location.pathname}
      />
      {isAuthenticating && <AuthLoadingOverlay message="Signing you in..." />}
      <AuthLayout
        variant="signin"
        panelBadge="Returning applicant"
        title="Welcome back — sign in"
        description={
          <>
            Enter your credentials to access your dashboard, saved drafts, and application updates.{' '}
            <span className="block mt-2">
              Don&apos;t have an account?{' '}
              <Link
                to="/auth/signup"
                className="font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
              >
                Create one here
              </Link>
            </span>
          </>
        }
        footer={
          <div className="space-y-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-background px-3 text-muted-foreground">Need account help?</span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
              <Link
                to="/auth/forgot-password"
                className="text-sm font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
              >
                Forgot your password?
              </Link>
              <Link
                to="/auth/signup"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
              >
                Create a new account
              </Link>
            </div>
          </div>
        }
      >
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
          <InfoCallout
            icon={KeyRound}
            variant="info"
            title="Use this page only if you already created an applicant account."
            description="Your saved drafts, submitted applications, payment follow-up, and portal notifications appear after sign-in."
            className={animateClasses.fadeIn}
          />

          <fieldset
            className={`space-y-5 rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm ${animateClasses.slideUp}`}
            style={staggerChild(1, 100)}
          >
            <legend className="text-sm font-semibold text-foreground">Applicant sign-in details</legend>
            <p className="text-sm text-muted-foreground">
              Use the same account email and password you created during applicant registration.
            </p>

            <AnimatedInput
              {...register('email')}
              type="email"
              label="Account email"
              helperText="Use the email address you registered with."
              error={errors.email?.message}
              autoComplete="email"
              disabled={loading}
              required
            />

            <PasswordInput
              {...register('password')}
              label="Account password"
              helperText="This is the password for your MIHAS portal account."
              error={errors.password?.message}
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </fieldset>

          <InfoCallout
            icon={FileText}
            variant="neutral"
            title="Do not register twice."
            description="If you already signed up, use sign in so your existing drafts and notifications stay linked to one account."
            className={animateClasses.fadeIn}
          />

          {/* Error message with CSS transition */}
          {error && (
            <ErrorBanner
              error={{ status: 401, message: error }}
              className={animateClasses.fadeIn}
              onDismiss={() => setError('')}
            />
          )}

          <div
            className={animateClasses.slideUp}
            style={staggerChild(4, 100)}
          >
            <Button
              type="submit"
              className="w-full"
              loading={loading}
              variant="gradient"
              size="lg"
            >
              {loading ? 'Signing in...' : 'Sign in and open dashboard'}
            </Button>
          </div>
        </form>
      </AuthLayout>
    </>
  );
}
