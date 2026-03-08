/**
 * SignUpPage - Structured sign-up page with clearer account-creation labeling
 *
 * @requirements 1.2 - CSS transitions/Tailwind instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior using CSS equivalents
 * @requirements 4.1, 4.3, 4.4, 4.8 - Zod validation, inline errors, loading state, type safety
 */

import { useState, useCallback, useId, type ReactNode } from 'react';
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
import { ErrorBanner } from '@/components/ui/ErrorDisplay';
import { NotificationService } from '@/lib/notificationService';
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions';
import { Seo } from '@/components/seo/Seo';
import { staggerChild, animateClasses } from '@/lib/animations';
import { useResidenceLocationOptions } from '@/hooks/useResidenceLocationOptions';
import { cn } from '@/lib/utils';
import { sanitizeForLog } from '@/lib/security';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Users,
  KeyRound,
  FileText,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import { InfoCallout } from '@/components/ui/InfoCallout';

interface EmailCheckResponse {
  available: boolean;
}

export const signUpSchema = z
  .object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
    full_name: z.string().min(2, 'Full name must be at least 2 characters'),
    phone: z.string().min(10, 'Please enter a valid phone number'),
    date_of_birth: z
      .string()
      .min(1, 'Date of birth is required')
      .refine(
        (date) => {
          const parsed = new Date(date);
          const year = parsed.getFullYear();
          const currentYear = new Date().getFullYear();
          return !isNaN(parsed.getTime()) && year >= 1900 && year <= currentYear - 16;
        },
        {
          message: 'Please enter a valid date of birth (must be at least 16 years old)',
        },
      ),
    sex: z.enum(['Male', 'Female'] as const, { error: 'Please select a sex' }),
    country: z.string().min(2, 'Country is required'),
    residence_town: z.string().min(2, 'City is required'),
    nationality: z.string().min(2, 'Nationality is required'),
    next_of_kin_name: z.string().min(2, 'Next of kin name is required'),
    next_of_kin_phone: z.string().min(10, 'Next of kin phone is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type SignUpForm = z.infer<typeof signUpSchema>;

interface SignUpSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}

function SignUpSection({ icon: Icon, title, description, children, className }: SignUpSectionProps) {
  const descriptionId = useId();

  return (
    <fieldset
      aria-describedby={descriptionId}
      className={cn('rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm', className)}
    >
      <legend className="text-base font-semibold text-foreground">{title}</legend>
      <div className="mb-4 mt-3 flex items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </fieldset>
  );
}

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
    watch,
    formState: { errors },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      country: DEFAULT_RESIDENCE_COUNTRY,
    },
  });

  const selectedCountry = watch('country');
  const { countryOptions, cityOptions, loadingCountries, loadingCities } = useResidenceLocationOptions(selectedCountry);
  const residenceTownDatalistId = 'signup-residence-town-options';

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
      const { confirmPassword: _confirmPassword, ...userData } = data;
      const result = await signUp(data.email, data.password, {
        ...userData,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      setSuccess('Account created successfully! You are now signed in.');
      setLoading(false);
      setIsRegistering(false);

      if (result.user?.id) {
        NotificationService.sendWelcomeNotification(result.user.id, userData.full_name).catch((notificationError) => {
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
          title="Create Account | MIHAS-KATC Admissions Portal"
          description="Create your MIHAS-KATC admissions account to start your nursing or allied health application and submit required details securely."
          path="/auth/signup"
        />
        {isRegistering && <AuthLoadingOverlay message="Creating your account..." />}
        <AuthLayout
          variant="signup"
          panelBadge="Account ready"
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
                  Go to dashboard now
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
        variant="signup"
        panelBadge="New applicant registration"
        title="Create a new account"
        description={
          <>
            Set up your secure portal account to begin the admissions process. Programme choice, academic details, and document upload come after sign-in.{' '}
            <span className="block mt-2">
              Already have an account?{' '}
              <Link
                to="/auth/signin"
                className="font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
              >
                Sign in instead
              </Link>
            </span>
          </>
        }
      >
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
          <InfoCallout
            icon={FileText}
            variant="success"
            title="Create one account first, then start your application after sign-in."
            description="The details below are reused to prefill your profile and keep the application wizard consistent with your account."
            className={animateClasses.fadeIn}
          />

          <div className={animateClasses.slideUp} style={staggerChild(1, 100)}>
            <SignUpSection
              icon={KeyRound}
              title="Portal access"
              description="Set the details you will use every time you return to the admissions portal."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AnimatedInput
                  {...register('full_name')}
                  type="text"
                  label="Full name"
                  helperText="Use the same name that should appear on your application records."
                  error={errors.full_name?.message}
                  required
                />

                <div className="relative">
                  <AnimatedInput
                    {...register('email', {
                      onBlur: (e) => checkEmailAvailability(e.target.value),
                    })}
                    type="email"
                    label="Account email"
                    helperText="This becomes your sign-in username."
                    error={errors.email?.message || (emailAvailable === false ? 'This email is already registered' : undefined)}
                    autoComplete="email"
                    required
                    className={
                      emailAvailable === true
                        ? 'border-green-500 focus:ring-green-500'
                        : emailAvailable === false
                          ? 'border-red-500 focus:ring-red-500'
                          : ''
                    }
                  />

                  <div className="mt-2 min-h-6" aria-live="polite">
                    {emailChecking && (
                      <div className={`flex items-center gap-2 text-sm text-primary ${animateClasses.fadeIn}`} role="status">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="font-medium">Checking availability...</span>
                      </div>
                    )}

                    {!emailChecking && emailAvailable === true && (
                      <div className={`flex items-center gap-2 text-sm text-success ${animateClasses.fadeIn}`} role="status">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium">Email available</span>
                      </div>
                    )}

                    {!emailChecking && emailAvailable === false && (
                      <div className={`flex items-center gap-2 text-sm text-destructive ${animateClasses.fadeIn}`} role="alert">
                        <XCircle className="h-4 w-4" />
                        <span className="font-medium">
                          Already registered.{' '}
                          <Link to="/auth/signin" className="underline underline-offset-2 hover:text-destructive">
                            Sign in
                          </Link>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <PasswordInput
                  {...register('password')}
                  label="Create password"
                  error={errors.password?.message}
                  helperText="Use at least 6 characters."
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />

                <PasswordInput
                  {...register('confirmPassword')}
                  label="Confirm password"
                  helperText="Repeat the same password to confirm it."
                  error={errors.confirmPassword?.message}
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />
              </div>
            </SignUpSection>
          </div>

          <div className={animateClasses.slideUp} style={staggerChild(2, 100)}>
            <SignUpSection
              icon={FileText}
              title="Profile basics"
              description="These details appear on your account immediately and carry forward into your application."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatedInput
                  {...register('phone')}
                  type="tel"
                  label="Phone number"
                  helperText="Use the number that should receive application updates."
                  error={errors.phone?.message}
                  required
                />

                <AnimatedInput
                  {...register('date_of_birth')}
                  type="date"
                  label="Date of birth"
                  error={errors.date_of_birth?.message}
                  required
                />

                <FormSelect
                  name="sex"
                  control={control}
                  options={[
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' },
                  ]}
                  label="Sex"
                  placeholder="Select sex"
                  error={errors.sex?.message}
                  disabled={loading}
                  required
                />
              </div>
            </SignUpSection>
          </div>

          <div className={animateClasses.slideUp} style={staggerChild(3, 100)}>
            <SignUpSection
              icon={MapPin}
              title="Residence and identity"
              description="Capture where you currently live so your student profile and application wizard stay aligned."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormSelect
                  name="country"
                  control={control}
                  options={countryOptions}
                  label="Country of residence"
                  placeholder="Select country"
                  error={errors.country?.message}
                  disabled={loading || loadingCountries}
                  helperText="Defaults to Zambia. Change it only if you currently live elsewhere."
                  required
                />

                <AnimatedInput
                  {...register('residence_town')}
                  type="text"
                  label="City or town"
                  list={residenceTownDatalistId}
                  placeholder={selectedCountry === DEFAULT_RESIDENCE_COUNTRY ? 'Kitwe' : 'Start typing your city or town'}
                  error={errors.residence_town?.message}
                  helperText={
                    loadingCities
                      ? 'Loading city and town options...'
                      : `Suggestions are filtered for ${selectedCountry || DEFAULT_RESIDENCE_COUNTRY}. You can still type your town manually.`
                  }
                  disabled={loading}
                  required
                />
                <datalist id={residenceTownDatalistId}>
                  {cityOptions.map((option) => (
                    <option key={option.value} value={option.value} />
                  ))}
                </datalist>

                <AnimatedInput
                  {...register('nationality')}
                  type="text"
                  label="Nationality"
                  placeholder="Zambian"
                  helperText="This is your citizenship, not your current residence."
                  error={errors.nationality?.message}
                  disabled={loading}
                  required
                />
              </div>
            </SignUpSection>
          </div>

          <div className={animateClasses.slideUp} style={staggerChild(4, 100)}>
            <SignUpSection
              icon={Users}
              title="Emergency contact"
              description="Provide a trusted contact we can reach if we cannot contact you directly."
              className="bg-muted/20"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AnimatedInput
                  {...register('next_of_kin_name')}
                  type="text"
                  label="Next of kin name"
                  error={errors.next_of_kin_name?.message}
                  required
                />

                <AnimatedInput
                  {...register('next_of_kin_phone')}
                  type="tel"
                  label="Next of kin phone"
                  error={errors.next_of_kin_phone?.message}
                  required
                />
              </div>
            </SignUpSection>
          </div>

          {error && (
            <ErrorBanner
              error={{ status: 400, message: error }}
              className={animateClasses.fadeIn}
              onDismiss={() => setError('')}
            />
          )}

          <div className={animateClasses.slideUp} style={staggerChild(5, 100)}>
            <Button
              type="submit"
              className="w-full"
              loading={loading}
              variant="gradient"
              size="lg"
            >
              {loading ? 'Creating account...' : 'Create account and continue'}
            </Button>
          </div>

          <p className={`text-center text-xs text-muted-foreground ${animateClasses.fadeIn}`} style={staggerChild(6, 100)}>
            By creating an account, you agree to our{' '}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>

          <div className={`text-center ${animateClasses.fadeIn}`} style={staggerChild(7, 100)}>
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                to="/auth/signin"
                className="font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
              >
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </AuthLayout>
    </>
  );
}
