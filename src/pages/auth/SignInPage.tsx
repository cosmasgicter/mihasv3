// @ts-nocheck
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
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AuthLoadingOverlay } from '@/components/ui/AuthLoadingOverlay';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Seo } from '@/components/seo/Seo';
import { staggerChild, animateClasses } from '@/lib/animations';
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
      const from = (location.state as any)?.from?.pathname;
      const role = result?.user?.role;
      const defaultRedirect = role === 'admin' || role === 'super_admin'
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
          <div
            className={animateClasses.slideUp}
            style={staggerChild(0, 100)}
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
          </div>

          <div
            className={animateClasses.slideUp}
            style={staggerChild(1, 100)}
          >
            <PasswordInput
              {...register('password')}
              label="Password"
              error={errors.password?.message}
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </div>

          {/* Error message with CSS transition */}
          {error && (
            <div className={`overflow-hidden ${animateClasses.fadeIn}`}>
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="text-sm font-medium text-destructive">{error}</div>
              </div>
            </div>
          )}

          <div
            className={animateClasses.slideUp}
            style={staggerChild(2, 100)}
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
          </div>
        </form>
      </AuthLayout>
    </>
  );
}
