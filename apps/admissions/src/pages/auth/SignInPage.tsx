/**
 * SignInPage - Clean, minimal sign-in page
 *
 * @requirements 31.1, 31.3, 31.6, 31.7 - Minimal layout, center-aligned card
 */

import { Link, useNavigate, useLocation } from 'react-router-dom';
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
import { isAdminRole } from '@/lib/auth/roles';
import { logApiError } from '@/lib/apiErrorLogger';
import { preloadPostAuthWorkspace } from '@/lib/routePreload';
import { onSignInEmailBlur, onLoginSuccess } from '@/lib/speculativePrefetch';

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
  '/apply',
  '/application',
  '/student/dashboard',
  '/student/application-wizard',
  '/student/application',
  '/student/status',
  '/student/payment',
  '/student/interview',
  '/student/settings',
  '/student/notifications',
  '/student/communications',
  '/student/history',
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
  const authErrorFromQuery = searchParams.get('error');

  const seoByPath = {
    '/auth/signin': {
      title: 'Sign In | MIHAS-KATC Admissions',
      description: 'Sign in to the MIHAS-KATC admissions portal.',
    },
    '/signin': {
      title: 'Login | MIHAS-KATC Admissions',
      description: 'Access your MIHAS-KATC student admissions account.',
    },
    '/login': {
      title: 'Login | MIHAS-KATC Admissions',
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

  const emailRegistration = register('email');
  const emailOnBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    onSignInEmailBlur();
    emailRegistration.onBlur(e);
  };

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
      onLoginSuccess(result, role ?? undefined);
      void preloadPostAuthWorkspace(isAdminRole(role));

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
    return message;
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

  const ERROR_MESSAGES: Record<string, string> = {
    session_expired: 'Your session has expired. Please sign in again.',
    unauthorized: 'Please sign in to access this page.',
    default: 'An error occurred. Please try again.',
  }
  const displayError = authErrorFromQuery ? (ERROR_MESSAGES[authErrorFromQuery] || ERROR_MESSAGES.default) : ''

  const serverFieldErrors = getFieldErrors(signInMutation.error as Error | null);
  const activeBannerMessage = signInMutation.error
    ? getErrorMessage(signInMutation.error as Error)
    : displayError;

  const dismissBanner = () => {
    if (signInMutation.error) {
      signInMutation.reset();
    }

    if (authErrorFromQuery) {
      const nextParams = new URLSearchParams(location.search);
      nextParams.delete('error');
      navigate(
        {
          pathname: location.pathname,
          search: nextParams.toString() ? `?${nextParams.toString()}` : '',
        },
        { replace: true },
      );
    }
  };

  return (
    <>
      <Seo title={seoConfig.title} description={seoConfig.description} path={location.pathname} />
      <AuthShell
        title="Sign in to your application"
        description={
          <>
            Welcome back. Pick up where you left off.{' '}
            <Link
              to="/auth/signup"
              className="font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
            >
              New here? Create an account
            </Link>
          </>
        }
        footer={
          <AuthShellFooter>
            <AuthShellLink to="/auth/forgot-password" emphasis="muted">Forgot your password?</AuthShellLink>
            <AuthShellLink to="/auth/signup">
              Create a new account
            </AuthShellLink>
          </AuthShellFooter>
        }
      >
        <form
          className={cn('space-y-5', signInMutation.isError && 'motion-safe:animate-shake')}
          onSubmit={handleSubmit((data) => signInMutation.mutate(data))}
          method="post"
          noValidate
        >
          <FormErrorAnnouncer errors={errors} fieldLabels={{ email: 'Email', password: 'Password' }} />

          {activeBannerMessage ? (
            <Banner variant="danger" dismissible onDismiss={dismissBanner}>
              {activeBannerMessage}
            </Banner>
          ) : null}

          <Input
            {...emailRegistration}
            onBlur={emailOnBlur}
            type="email"
            inputMode="email"
            label="Email"
            aria-label="Email"
            error={errors.email?.message || serverFieldErrors.email}
            autoComplete="email"
            disabled={signInMutation.isPending}
            required
            autoFocus
            className="min-h-[48px]"
          />

          <PasswordInput
            {...register('password')}
            label="Password"
            aria-label="Password"
            error={errors.password?.message || serverFieldErrors.password}
            autoComplete="current-password"
            disabled={signInMutation.isPending}
            required
            className="min-h-[48px]"
          />

          <Button
            type="submit"
            className="w-full min-h-[48px]"
            loading={signInMutation.isPending}
            variant="primary"
            size="lg"
          >
            {signInMutation.isPending ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </AuthShell>
    </>
  );
}
