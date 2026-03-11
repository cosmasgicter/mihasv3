/**
 * ForgotPasswordPage - Enhanced forgot password page with CSS animations
 * Consistent styling with other auth pages
 * 
 * @requirements 1.2 - CSS transitions/Tailwind instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior using CSS equivalents
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { animateClasses } from '@/lib/animations';
import { Seo } from '@/components/seo/Seo';
import { 
  Loader2, 
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
  const [success, setSuccess] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setSuccess('');
    setLoading(true);

    try {
      // Fire the request but always show the same confirmation message
      // regardless of whether the email exists — prevents email enumeration
      await requestPasswordReset(data.email);
    } catch {
      // Swallow errors silently — we never reveal whether the email exists
    } finally {
      setLoading(false);
      setSuccess(
        'If an account with that email exists, we\'ve sent password reset instructions. Please check your inbox and spam folder.',
      );
    }
  };

  // Success state
  if (success) {
    return (
      <>
        <Seo
          title="Check Your Email | MIHAS-KATC Password Reset"
          description="Password reset requested. Check your email for instructions to regain access to your MIHAS-KATC admissions account."
          path="/auth/forgot-password"
        />
      <AuthLayout
        title="Check your email"
        description="We've sent you password reset instructions"
        backLinkHref="/auth/signin"
        backLinkLabel="Back to sign in"
      >
        <div className={`space-y-6 ${animateClasses.scaleIn}`}>
          {/* Success icon */}
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 ${animateClasses.scaleIn}`}>
            <Mail className="h-8 w-8 text-green-600" />
          </div>

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
        </div>
      </AuthLayout>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Forgot Password | MIHAS-KATC Admissions Portal"
        description="Request a secure password reset link to recover access to your MIHAS-KATC admissions account."
        path="/auth/forgot-password"
      />
    <AuthLayout
      title="Reset your password"
      description="Enter the email associated with your account and we'll send you instructions to reset your password."
      backLinkHref="/auth/signin"
      backLinkLabel="Back to sign in"
    >
      <form
        className={`space-y-6 ${animateClasses.slideUp}`}
        onSubmit={handleSubmit(onSubmit)}
      >
        <Input
          {...register('email')}
          type="email"
          label="Email address"
          required
          autoComplete="email"
          error={errors.email?.message}
          disabled={loading}
          className="min-h-[48px]"
        />

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
      </form>
    </AuthLayout>
    </>
  );
}
