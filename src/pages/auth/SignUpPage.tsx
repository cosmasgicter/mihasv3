/**
 * SignUpPage - Enhanced sign-up page with CSS animations
 * Uses Tailwind animation classes and shared animation utilities
 * 
 * @requirements 1.2 - CSS transitions/Tailwind instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior using CSS equivalents
 * @requirements 4.1, 4.3, 4.4, 4.8 - Zod validation, inline errors, loading state, type safety
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
import { FormSelect } from '@/components/ui/form-select';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AuthLoadingOverlay } from '@/components/ui/AuthLoadingOverlay';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { NotificationService } from '@/lib/notificationService';
import { Seo } from '@/components/seo/Seo';
import { staggerChild, animateClasses } from '@/lib/animations';
import { 
  Loader2,
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Users
} from 'lucide-react';

/** Email availability check response shape */
interface EmailCheckResponse {
  available: boolean;
}

export const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  date_of_birth: z.string()
    .min(1, 'Date of birth is required')
    .refine((date) => {
      const parsed = new Date(date);
      const year = parsed.getFullYear();
      const currentYear = new Date().getFullYear();
      return !isNaN(parsed.getTime()) && year >= 1900 && year <= currentYear - 16;
    }, {
      message: 'Please enter a valid date of birth (must be at least 16 years old)'
    }),
  sex: z.enum(['Male', 'Female'], { required_error: 'Please select a sex' }),
  residence_town: z.string().min(2, 'City is required'),
  nationality: z.string().min(2, 'Nationality is required'),
  next_of_kin_name: z.string().min(2, 'Next of kin name is required'),
  next_of_kin_phone: z.string().min(10, 'Next of kin phone is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
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
    control,
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
      // MIGRATED: Using new API client instead of legacy authApi
      const response = await apiClient.request<EmailCheckResponse>(`/auth?action=check-email&email=${encodeURIComponent(email)}`);

      const isAvailable = (response as EmailCheckResponse)?.available ?? null;
      setEmailAvailable(isAvailable);
      if (isAvailable === false) {
        setError('This email is already registered. Please sign in instead.');
      } else {
        setError('');
      }
    } catch (err) {
      console.warn('Email check error:', err);
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
      const { confirmPassword: _confirmPassword, ...userData } = data;

      const result = await signUp(data.email, data.password, {
        ...userData,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      // Success - account was created and backend returned authenticated user data
      setSuccess('Account created successfully! You are now signed in.');
      setLoading(false);
      setIsRegistering(false);

      // Send welcome notification
      if (result.user?.id) {
        NotificationService.sendWelcomeNotification(result.user.id, userData.full_name).catch(console.error);
      }

      // Redirect to dashboard
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

  // Success state
  if (success) {
    return (
      <>
      <Seo
        title="Create Account | MIHAS-KATC Admissions Portal"
        description="Create your MIHAS-KATC admissions account to start your nursing or allied health application and submit required details securely."
        path="/auth/signup"
      />
        {isRegistering && <AuthLoadingOverlay message="Creating your account..." />}
        <AuthLayout
          title="Account created successfully!"
          description={success}
        >
          <div className={`space-y-6 text-center ${animateClasses.scaleIn}`}>
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 ${animateClasses.scaleIn}`}>
              <CheckCircle className="h-8 w-8" />
            </div>
            <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
            <div className="space-y-3">
              <Link to="/student/dashboard" className="block">
                <Button className="w-full" variant="gradient" size="lg">
                  Go to Dashboard Now
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
        title="Create Account | MIHAS-KATC Admissions Portal"
        description="Create your MIHAS-KATC admissions account to start your nursing or allied health application and submit required details securely."
        path="/auth/signup"
      />
      {isRegistering && <AuthLoadingOverlay message="Creating your account..." />}
      <AuthLayout
        title="Create your account"
        description={
          <>
            Already have an account?{' '}
            <Link
              to="/auth/signin"
              className="font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
              Sign in here
            </Link>
          </>
        }
      >
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {/* Personal Information Section */}
          <div
            className={`space-y-4 ${animateClasses.slideUp}`}
            style={staggerChild(0, 100)}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AnimatedInput
                {...register('full_name')}
                type="text"
                label="Full Name"
                error={errors.full_name?.message}
                required
              />

              <div className="relative">
                <AnimatedInput
                  {...register('email', {
                    onBlur: (e) => checkEmailAvailability(e.target.value)
                  })}
                  type="email"
                  label="Email Address"
                  error={errors.email?.message || (emailAvailable === false ? 'This email is already registered' : undefined)}
                  autoComplete="email"
                  required
                  className={emailAvailable === true ? 'border-green-500 focus:ring-green-500' : emailAvailable === false ? 'border-red-500 focus:ring-red-500' : ''}
                />

                {/* Email Status Indicator */}
                {emailChecking && (
                  <div className={`mt-2 flex items-center gap-2 text-sm text-blue-600 ${animateClasses.fadeIn}`}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="font-medium">Checking availability...</span>
                  </div>
                )}

                {!emailChecking && emailAvailable === true && (
                  <div className={`mt-2 flex items-center gap-2 text-sm text-green-600 ${animateClasses.fadeIn}`}>
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Email available</span>
                  </div>
                )}

                {!emailChecking && emailAvailable === false && (
                  <div className={`mt-2 flex items-center gap-2 text-sm text-red-600 ${animateClasses.fadeIn}`}>
                    <XCircle className="h-4 w-4" />
                    <span className="font-medium">
                      Already registered.{' '}
                      <Link to="/auth/signin" className="underline hover:text-red-700">
                        Sign in
                      </Link>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Password Section */}
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${animateClasses.slideUp}`}
            style={staggerChild(1, 100)}
          >
            <PasswordInput
              {...register('password')}
              label="Create Password"
              error={errors.password?.message}
              helperText="Must be at least 6 characters"
              autoComplete="new-password"
              disabled={loading}
              required
            />

            <PasswordInput
              {...register('confirmPassword')}
              label="Confirm Password"
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
              disabled={loading}
              required
            />
          </div>

          {/* Contact Information */}
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${animateClasses.slideUp}`}
            style={staggerChild(2, 100)}
          >
            <AnimatedInput
              {...register('phone')}
              type="tel"
              label="Phone Number"
              error={errors.phone?.message}
              required
            />

            <AnimatedInput
              {...register('date_of_birth')}
              type="date"
              label="Date of Birth"
              error={errors.date_of_birth?.message}
              required
            />
          </div>

          {/* Demographics */}
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${animateClasses.slideUp}`}
            style={staggerChild(3, 100)}
          >
            <FormSelect
              name="sex"
              control={control}
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
              ]}
              label="Sex"
              placeholder="Select Sex"
              error={errors.sex?.message}
              disabled={loading}
              required
            />

            <AnimatedInput
              {...register('residence_town')}
              type="text"
              label="City/Town"
              placeholder="Kitwe"
              error={errors.residence_town?.message}
              disabled={loading}
              required
            />

            <AnimatedInput
              {...register('nationality')}
              type="text"
              label="Nationality"
              placeholder="Zambian"
              error={errors.nationality?.message}
              disabled={loading}
              required
            />
          </div>

          {/* Next of Kin Section */}
          <div
            className={`rounded-xl border border-border bg-muted/30 p-5 ${animateClasses.slideUp}`}
            style={staggerChild(4, 100)}
          >
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">Next of Kin</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Provide the details of a trusted contact we can reach in case of emergencies.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AnimatedInput
                {...register('next_of_kin_name')}
                type="text"
                label="Next of Kin Name"
                error={errors.next_of_kin_name?.message}
                required
              />

              <AnimatedInput
                {...register('next_of_kin_phone')}
                type="tel"
                label="Next of Kin Phone"
                error={errors.next_of_kin_phone?.message}
                required
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className={`overflow-hidden ${animateClasses.fadeIn}`}>
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="text-sm font-medium text-destructive">{error}</div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div
            className={animateClasses.slideUp}
            style={staggerChild(6, 100)}
          >
            <Button
              type="submit"
              className="w-full"
              loading={loading}
              variant="gradient"
              size="lg"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </div>

          {/* Terms */}
          <p
            className={`text-center text-xs text-muted-foreground ${animateClasses.fadeIn}`}
            style={staggerChild(7, 100)}
          >
            By creating an account, you agree to our{' '}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </form>
      </AuthLayout>
    </>
  );
}
