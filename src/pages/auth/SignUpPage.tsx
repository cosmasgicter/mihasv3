/**
 * SignUpPage - Enhanced sign-up page with SmoothUI animations
 * Uses animated input components with inline validation
 * 
 * @requirements 3.4, 3.5 - SmoothUI animated inputs with inline validation
 */

import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormSelect } from '@/components/ui/form-select';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Turnstile } from '@/components/ui/Turnstile';
import { AuthLoadingOverlay } from '@/components/ui/AuthLoadingOverlay';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { NotificationService } from '@/lib/notificationService';
import { durations } from '@/lib/animation-config';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Globe,
  Users
} from 'lucide-react';

const signUpSchema = z.object({
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
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [isRegistering, setIsRegistering] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
  });

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setError('');
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
    setError('Security verification failed. Please try again.');
    setTurnstileKey(prev => prev + 1);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('');
    setError('Security verification expired. Please verify again.');
  }, []);

  const checkEmailAvailability = useCallback(async (email: string) => {
    if (!email || !email.includes('@')) {
      setEmailAvailable(null);
      return;
    }

    setEmailChecking(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (error) {
        console.warn('Email check error:', error);
        setEmailAvailable(null);
      } else {
        const emailExists = !!data;
        setEmailAvailable(!emailExists);
        if (emailExists) {
          setError('This email is already registered. Please sign in instead.');
        } else {
          setError('');
        }
      }
    } catch (err) {
      console.warn('Email check error:', err);
      setEmailAvailable(null);
    } finally {
      setEmailChecking(false);
    }
  }, []);

  const onSubmit = async (data: SignUpForm) => {
    if (import.meta.env.VITE_TURNSTILE_SITE_KEY && !turnstileToken && import.meta.env.PROD) {
      setError('Please complete the security verification.');
      return;
    }

    if (emailAvailable === false) {
      setError('This email is already registered. Please sign in instead.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setIsRegistering(true);

    try {
      const { confirmPassword, ...userData } = data;
      void confirmPassword;

      const result = await signUp(data.email, data.password, {
        ...userData,
        turnstileToken
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      if (!result?.session) {
        throw new Error('Account created but login failed. Please sign in manually.');
      }

      // Success - user is now logged in with session
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create account. Please try again.';
      setError(message.includes('already registered') ? 'This email is already registered. Please sign in instead.' : message);
      setTurnstileToken('');
      setTurnstileKey(prev => prev + 1);
      setLoading(false);
      setIsRegistering(false);
    }
  };

  // Animation variants
  const sectionVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: prefersReducedMotion ? 0 : i * 0.1,
        duration: prefersReducedMotion ? 0 : durations.normal,
      },
    }),
  };

  const errorVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: { 
      opacity: 1, 
      height: 'auto',
      transition: { duration: prefersReducedMotion ? 0 : durations.normal },
    },
    exit: { 
      opacity: 0, 
      height: 0,
      transition: { duration: prefersReducedMotion ? 0 : durations.fast },
    },
  };

  // Success state
  if (success) {
    return (
      <>
        {isRegistering && <AuthLoadingOverlay message="Creating your account..." />}
        <AuthLayout
          title="Account created successfully!"
          description={success}
        >
          <motion.div 
            className="space-y-6 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : durations.normal }}
          >
            <motion.div 
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ 
                type: 'spring', 
                stiffness: 200, 
                damping: 15,
                delay: prefersReducedMotion ? 0 : 0.2,
              }}
            >
              <CheckCircle className="h-8 w-8" />
            </motion.div>
            <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
            <div className="space-y-3">
              <Link to="/student/dashboard" className="block">
                <Button className="w-full" variant="gradient" size="lg">
                  Go to Dashboard Now
                </Button>
              </Link>
            </div>
          </motion.div>
        </AuthLayout>
      </>
    );
  }

  return (
    <>
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
          <motion.div
            custom={0}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                {...register('full_name')}
                type="text"
                label="Full Name"
                error={errors.full_name?.message}
                required
              />

              <div className="relative">
                <Input
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
                <AnimatePresence mode="wait">
                  {emailChecking && (
                    <motion.div
                      key="checking"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="mt-2 flex items-center gap-2 text-sm text-blue-600"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="font-medium">Checking availability...</span>
                    </motion.div>
                  )}

                  {!emailChecking && emailAvailable === true && (
                    <motion.div
                      key="available"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="mt-2 flex items-center gap-2 text-sm text-green-600"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">Email available</span>
                    </motion.div>
                  )}

                  {!emailChecking && emailAvailable === false && (
                    <motion.div
                      key="unavailable"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="mt-2 flex items-center gap-2 text-sm text-red-600"
                    >
                      <XCircle className="h-4 w-4" />
                      <span className="font-medium">
                        Already registered.{' '}
                        <Link to="/auth/signin" className="underline hover:text-red-700">
                          Sign in
                        </Link>
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {/* Password Section */}
          <motion.div
            custom={1}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
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
          </motion.div>

          {/* Contact Information */}
          <motion.div
            custom={2}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <Input
              {...register('phone')}
              type="tel"
              label="Phone Number"
              error={errors.phone?.message}
              required
            />

            <Input
              {...register('date_of_birth')}
              type="date"
              label="Date of Birth"
              error={errors.date_of_birth?.message}
              required
            />
          </motion.div>

          {/* Demographics */}
          <motion.div
            custom={3}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
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

            <Input
              {...register('residence_town')}
              type="text"
              label="City/Town"
              placeholder="Kitwe"
              error={errors.residence_town?.message}
              disabled={loading}
              required
            />

            <Input
              {...register('nationality')}
              type="text"
              label="Nationality"
              placeholder="Zambian"
              error={errors.nationality?.message}
              disabled={loading}
              required
            />
          </motion.div>

          {/* Next of Kin Section */}
          <motion.div
            custom={4}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-border bg-muted/30 p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">Next of Kin</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Provide the details of a trusted contact we can reach in case of emergencies.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                {...register('next_of_kin_name')}
                type="text"
                label="Next of Kin Name"
                error={errors.next_of_kin_name?.message}
                required
              />

              <Input
                {...register('next_of_kin_phone')}
                type="tel"
                label="Next of Kin Phone"
                error={errors.next_of_kin_phone?.message}
                required
              />
            </div>
          </motion.div>

          {/* Turnstile Verification */}
          {import.meta.env.VITE_TURNSTILE_SITE_KEY && (
            <motion.div
              custom={5}
              variants={sectionVariants}
              initial="hidden"
              animate="visible"
              className="rounded-xl border border-border bg-muted/30 p-5"
            >
              <h3 className="text-base font-semibold text-foreground mb-2">Security Verification</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Complete the verification step to keep your account secure.
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
            </motion.div>
          )}

          {/* Error Message */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                variants={errorVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden"
              >
                <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="text-sm font-medium text-destructive">{error}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit Button */}
          <motion.div
            custom={6}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
          >
            <Button
              type="submit"
              className="w-full"
              loading={loading}
              disabled={import.meta.env.VITE_TURNSTILE_SITE_KEY && !turnstileToken && import.meta.env.PROD}
              variant="gradient"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </motion.div>

          {/* Terms */}
          <motion.p
            custom={7}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className="text-center text-xs text-muted-foreground"
          >
            By creating an account, you agree to our{' '}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </motion.p>
        </form>
      </AuthLayout>
    </>
  );
}
