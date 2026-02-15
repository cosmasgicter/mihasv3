/**
 * ForgotPasswordPage - Enhanced forgot password page with CSS animations
 * Consistent styling with other auth pages
 * 
 * @requirements 1.2 - CSS transitions/Tailwind instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior using CSS equivalents
 */

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Turnstile } from '@/components/ui/Turnstile';
import { useAuth } from '@/contexts/AuthContext';
import { animateClasses } from '@/lib/animations';
import { 
  Loader2, 
  AlertCircle, 
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

  // Success state
  if (success) {
    return (
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
        </div>
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
        />

        {/* Error message */}
        {error && (
          <div className={`overflow-hidden ${animateClasses.fadeIn}`}>
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm font-medium text-destructive">{error}</div>
            </div>
          </div>
        )}

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
      </form>
    </AuthLayout>
  );
}
