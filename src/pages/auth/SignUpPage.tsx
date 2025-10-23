import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TextArea } from '@/components/ui/TextArea'
import { Turnstile } from '@/components/ui/Turnstile'
import { AuthLayout } from './AuthLayout'

const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  date_of_birth: z.string()
    .min(1, 'Date of birth is required')
    .refine((date) => {
      const parsed = new Date(date)
      const year = parsed.getFullYear()
      const currentYear = new Date().getFullYear()
      return !isNaN(parsed.getTime()) && year >= 1900 && year <= currentYear - 16
    }, {
      message: 'Please enter a valid date of birth (must be at least 16 years old)'
    }),
  sex: z.enum(['Male', 'Female'], { required_error: 'Please select a sex' }),
  nationality: z.string().min(2, 'Nationality is required'),
  address: z.string().min(10, 'Please enter your full address'),
  city: z.string().min(2, 'City is required'),
  next_of_kin_name: z.string().min(2, 'Next of kin name is required'),
  next_of_kin_phone: z.string().min(10, 'Next of kin phone is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type SignUpForm = z.infer<typeof signUpSchema>

export default function SignUpPage() {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileKey, setTurnstileKey] = useState(0)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
  })

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        navigate('/auth/signin')
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [success, navigate])

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token)
    setError('')
  }, [])

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('')
    setError('Security verification failed. Please try again.')
    setTurnstileKey(prev => prev + 1)
  }, [])

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('')
    setError('Security verification expired. Please verify again.')
  }, [])

  const onSubmit = async (data: SignUpForm) => {
    // Require Turnstile token if site key is configured and not in development
    if (import.meta.env.VITE_TURNSTILE_SITE_KEY && !turnstileToken && import.meta.env.PROD) {
      setError('Please complete the security verification.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      // Proceed with sign up
      const { confirmPassword, ...userData } = data
      void confirmPassword
      const result = await signUp(data.email, data.password, {
        ...userData,
        turnstileToken
      })

      if (result?.error) {
        throw new Error(result.error)
      }

      setSuccess('Account created successfully! Redirecting to sign in...')
    } catch (error) {
      logger.error('Sign up error:', error)
      setError(error instanceof Error ? error.message : 'Failed to create account. Please try again.')
      // Reset Turnstile on error
      setTurnstileToken('')
      setTurnstileKey(prev => prev + 1)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout
        title="Account created successfully!"
        description={success}
      >
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/5/300/10 text-primary">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-foreground">Redirecting to sign in page...</p>
          <div className="space-y-3">
            <Link to="/auth/signin" className="block">
              <Button className="w-full" variant="gradient" size="lg">
                Go to Sign In Now
              </Button>
            </Link>
            <Link
              to="/"
              className="block"
            >
              <Button variant="outline" className="w-full" size="lg">
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      description={(
        <>
          Already have an account?{' '}
          <Link
            to="/auth/signin"
            className="font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-md"
          >
            Sign in here
          </Link>
        </>
      )}
    >
      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Input
            {...register('full_name')}
            type="text"
            label="Full Name"
            error={errors.full_name?.message}
            required
          />

          <Input
            {...register('email')}
            type="email"
            label="Email Address"
            error={errors.email?.message}
            autoComplete="email"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Input
            {...register('password')}
            type="password"
            label="Create Password"
            error={errors.password?.message}
            helperText="Must be at least 6 characters"
            autoComplete="new-password"
            required
          />

          <Input
            {...register('confirmPassword')}
            type="password"
            label="Confirm Password"
            error={errors.confirmPassword?.message}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label htmlFor="sex" className="mb-1 block text-sm font-medium text-foreground">
              Sex <span className="text-error">*</span>
            </label>
            <select
              {...register('sex')}
              id="sex"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
            >
              <option value="">Select Sex</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            {errors.sex && (
              <p className="mt-1 text-sm text-destructive">{errors.sex.message}</p>
            )}
          </div>

          <Input
            {...register('nationality')}
            type="text"
            label="Nationality"
            error={errors.nationality?.message}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <TextArea
            {...register('address')}
            label="Full Address"
            error={errors.address?.message}
            rows={3}
            required
          />

          <Input
            {...register('city')}
            type="text"
            label="City"
            error={errors.city?.message}
            required
          />
        </div>

        <div className="rounded-2xl border border-border bg-muted/50 p-6">
          <h3 className="text-lg font-semibold text-foreground">Next of Kin</h3>
          <p className="mt-1 text-sm text-foreground">
            Provide the details of a trusted contact we can reach in case of emergencies.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
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
        </div>

        {import.meta.env.VITE_TURNSTILE_SITE_KEY && (
          <div className="rounded-2xl border border-input/10 bg-card/80 p-6">
            <h3 className="text-lg font-semibold text-foreground">Security Verification</h3>
            <p className="mt-1 text-sm text-foreground">
              Complete the verification step to keep your account secure.
            </p>
            <div className="mt-4 flex justify-center">
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

        {error && (
          <div className="rounded-xl border border-destructive/30/70 bg-destructive/5/30/80 p-4 text-left shadow-sm">
            <div className="text-sm font-medium text-error">{error}</div>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          loading={loading}
          disabled={import.meta.env.VITE_TURNSTILE_SITE_KEY && !turnstileToken && import.meta.env.PROD}
          variant="gradient"
          size="lg"
        >
          Create Account
        </Button>
      </form>
    </AuthLayout>
  )
}
