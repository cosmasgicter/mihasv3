import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Textarea } from '@/components/ui/Textarea'
import { Turnstile } from '@/components/ui/Turnstile'
import { AuthLoadingOverlay } from '@/components/ui/AuthLoadingOverlay'
import { AuthLayout } from './AuthLayout'
import { NotificationService } from '@/lib/notificationService'

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
  residence_town: z.string().min(2, 'City is required'),
  nationality: z.string().min(2, 'Nationality is required'),
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
  const [isRegistering, setIsRegistering] = useState(false)
  const [emailChecking, setEmailChecking] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
  })

  // Removed auto-redirect to signin - now goes to dashboard

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

  const checkEmailAvailability = useCallback(async (email: string) => {
    if (!email || !email.includes('@')) {
      setEmailAvailable(null)
      return
    }

    setEmailChecking(true)
    try {
      const response = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      if (!response.ok) {
        console.warn('Email check failed:', response.status)
        setEmailAvailable(null)
        setEmailChecking(false)
        return
      }
      
      const result = await response.json()
      setEmailAvailable(result.available)
      if (!result.available) {
        setError('This email is already registered. Please sign in instead.')
      } else {
        setError('')
      }
    } catch (err) {
      console.warn('Email check error:', err)
      setEmailAvailable(null)
    } finally {
      setEmailChecking(false)
    }
  }, [])

  const onSubmit = async (data: SignUpForm) => {
    if (import.meta.env.VITE_TURNSTILE_SITE_KEY && !turnstileToken && import.meta.env.PROD) {
      setError('Please complete the security verification.')
      return
    }

    if (emailAvailable === false) {
      setError('This email is already registered. Please sign in instead.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    setIsRegistering(true)

    try {
      const { confirmPassword, ...userData } = data
      void confirmPassword
      
      const result = await signUp(data.email, data.password, {
        ...userData,
        turnstileToken
      })

      if (result?.error) {
        throw new Error(result.error)
      }

      if (!result?.session) {
        throw new Error('Account created but login failed. Please sign in manually.')
      }

      // Success - user is now logged in with session
      setSuccess('Account created successfully! You are now signed in.')
      setLoading(false)
      setIsRegistering(false)
      
      // Send welcome notification
      if (result.user?.id) {
        NotificationService.sendWelcomeNotification(result.user.id, userData.full_name).catch(console.error)
      }
      
      // Redirect to dashboard
      setTimeout(() => {
        navigate('/student/dashboard')
      }, 1500)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create account. Please try again.'
      setError(message.includes('already registered') ? 'This email is already registered. Please sign in instead.' : message)
      setTurnstileToken('')
      setTurnstileKey(prev => prev + 1)
      setLoading(false)
      setIsRegistering(false)
    }
  }

  if (success) {
    return (
      <>
        {isRegistering && <AuthLoadingOverlay message="Creating your account..." />}
        <AuthLayout
        title="Account created successfully!"
        description={success}
      >
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10 text-info-strong">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-body">Redirecting to your dashboard...</p>
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
    )
  }

  return (
    <>
      {isRegistering && <AuthLoadingOverlay message="Creating your account..." />}
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
            <div className="mt-2 min-h-[32px]">
              {emailChecking && (
                <div className="flex items-center gap-2 text-sm text-blue-600 animate-pulse">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="font-medium">Checking email availability...</span>
                </div>
              )}
              
              {emailAvailable === true && (
                <div className="flex items-center gap-2 text-sm text-green-600 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold">Perfect! This email is available</p>
                    <p className="text-xs text-green-600/80">You can proceed with registration</p>
                  </div>
                </div>
              )}
              
              {emailAvailable === false && (
                <div className="flex items-center gap-2 text-sm text-red-600 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex-shrink-0 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold">This email is already registered</p>
                    <p className="text-xs text-red-600/80">
                      Already have an account? <Link to="/auth/signin" className="underline hover:text-red-700">Sign in here</Link>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
            <label htmlFor="sex" className="mb-1 block text-sm font-medium text-body">
              Sex <span className="text-error">*</span>
            </label>
            <select
              {...register('sex')}
              id="sex"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-body placeholder:text-body transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
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
        </div>



        <div className="rounded-2xl border border-border bg-muted/50 p-6">
          <h3 className="text-lg font-semibold text-body">Next of Kin</h3>
          <p className="mt-1 text-sm text-body">
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
            <h3 className="text-lg font-semibold text-body">Security Verification</h3>
            <p className="mt-1 text-sm text-body">
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
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left shadow-sm">
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
    </>
  )
}
