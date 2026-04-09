/**
 * SignInPage - Clean, minimal sign-in page
 *
 * @requirements 31.1, 31.3, 31.6, 31.7 - Minimal layout, center-aligned card
 */

import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Banner } from '@/components/ui/Banner';
import { FormErrorAnnouncer } from '@/components/ui/FormErrorAnnouncer';
import { Seo } from '@/components/seo/Seo';
import { isAdminRole } from '@/lib/auth/roles';
import { logApiError } from '@/lib/apiErrorLogger';

const ADMIN_REDIRECT_ALLOWLIST = [
  '/admin/dashboard',
  '/admin/applications',
  '/admin/programs',
  '/admin/intakes',
  '/admin/users',
  '/admin/audit',
  '/admin/settings',
] as const;

const STUDENT_REDIRECT_ALLOWLIST = [
  '/student/dashboard',
  '/student/application-wizard',
  '/student/application',
  '/student/status',
  '/student/payment',
  '/student/interview',
  '/student/settings',
  '/student/notifications',
] as const;

function matchesAllowlistPath(pathname: string, allowlist: readonly string[]): boolean {
  return allowlist.some((allowedPath) => pathname === allowedPath || pathname.startsWith(`${allowedPath}/`));
}

export function getRoleSafeRedirectPath({
  requestedRedirect,
  role,
}: {
  requestedRedirect: string | null | undefined
  role: string | null | undefined
}): string {
  const admin = isAdminRole(role)
  const defaultRedirect = admin ? '/admin/dashboard' : '/student/dashboard'

  if (!requestedRedirect || requestedRedirect === '/auth/signin') {
    return defaultRedirect
  }

  try {
    const parsed = new URL(requestedRedirect, 'http://localhost')
    const normalizedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`
    const allowlist = admin ? ADMIN_REDIRECT_ALLOWLIST : STUDENT_REDIRECT_ALLOWLIST
    return matchesAllowlistPath(parsed.pathname, allowlist) ? normalizedPath : defaultRedirect
  } catch {
    return defaultRedirect
  }
}

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type SignInForm = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const redirectFromQuery = searchParams.get('redirect');

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

  const signInMutation = useMutation({
    mutationFn: async (data: SignInForm) => {
      const result = await signIn(data.email, data.password);

      if (result?.error) {
        throw new Error(result.error);
      }

      return result;
    },
    onSuccess: (result) => {
      const locationState = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
      const fromPath = locationState?.from?.pathname;
      const fromSearch = locationState?.from?.search || '';
      const fromHash = locationState?.from?.hash || '';
      const fromState = fromPath ? `${fromPath}${fromSearch}${fromHash}` : null;
      const storedRedirect = typeof window !== 'undefined'
        ? sessionStorage.getItem('mihas:post-auth-redirect')
        : null;
      const role = result?.user?.role;
      const requestedRedirect = fromState || redirectFromQuery || storedRedirect;
      const redirectTo = getRoleSafeRedirectPath({ requestedRedirect, role });

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('mihas:post-auth-redirect');
      }

      navigate(redirectTo, { replace: true });
    },
    onError: (error: unknown) => {
      logApiError('sign-in', '/auth/login/', error);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('mihas:post-auth-redirect');
      }
    },
  });

  const getErrorMessage = (error: Error | null) => {
    if (!error) return '';
    const message = error.message || 'Failed to sign in. Please try again.';
    return message.includes('Invalid') ? 'Invalid email or password.' : message;
  };

  // Extract field-level errors from Django validation responses
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

  const serverFieldErrors = getFieldErrors(signInMutation.error as Error | null);

  return (
    <>
      <Seo title={seoConfig.title} description={seoConfig.description} path={location.pathname} />
      <AuthLayout
        variant="signin"
        title="Sign in"
        description={
          <>
            Don&apos;t have an account?{' '}
            <Link
              to="/auth/signup"
              className="font-semibold text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
            >
              Create one
            </Link>
          </>
        }
        footer={
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
            <Link
              to="/auth/forgot-password"
              className="text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
            >
              Forgot your password?
            </Link>
            <Link
              to="/auth/signup"
              className="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
            >
              Create a new account
            </Link>
          </div>
        }
      >
        <form className="space-y-6" onSubmit={handleSubmit((data) => signInMutation.mutate(data))} noValidate>
          <FormErrorAnnouncer errors={errors} fieldLabels={{ email: 'Email', password: 'Password' }} />
          {signInMutation.error ? (
            <Banner variant="error" dismissible onDismiss={() => signInMutation.reset()}>
              {getErrorMessage(signInMutation.error as Error)}
            </Banner>
          ) : null}

          <fieldset className="space-y-5 rounded-2xl border border-border/60 bg-background/80 p-4 sm:p-5">
            <legend className="text-sm font-semibold text-foreground">Applicant sign-in details</legend>

            <Input
              {...register('email')}
              type="email"
              label="Account email"
              error={errors.email?.message || serverFieldErrors.email}
              autoComplete="email"
              disabled={signInMutation.isPending}
              required
              className="min-h-[48px]"
            />

            <PasswordInput
              {...register('password')}
              label="Account password"
              error={errors.password?.message || serverFieldErrors.password}
              autoComplete="current-password"
              disabled={signInMutation.isPending}
              required
              className="min-h-[48px]"
            />
          </fieldset>

          <Button
            type="submit"
            className="w-full min-h-[48px]"
            loading={signInMutation.isPending}
            variant="gradient"
            size="lg"
          >
            {signInMutation.isPending ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </AuthLayout>
    </>
  );
}
