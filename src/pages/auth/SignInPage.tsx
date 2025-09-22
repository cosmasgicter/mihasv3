import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from './AuthLayout'
import { networkDiagnostics } from '@/lib/networkDiagnostics'

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type SignInForm = z.infer<typeof signInSchema>

export default function SignInPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
  })

  const onSubmit = async (data: SignInForm) => {
    console.log('Login attempt:', data.email)
    setLoading(true)
    setError('')

    try {
      // Quick network check
      const connectionTest = await networkDiagnostics.testConnection()
      
      if (connectionTest.status === 'offline') {
        setError('Network connection unavailable. Please check your internet connection.')
        return
      }
      
      if (connectionTest.status === 'slow') {
        setError('Slow network detected. Login may take longer than usual...')
      }

      const result = await signIn(data.email, data.password)
      console.log('Sign in result:', result)
      
      if (result?.error) {
        throw new Error(result.error)
      }

      console.log('Login successful, navigating to dashboard')
      navigate('/dashboard')
    } catch (error: unknown) {
      console.error('Sign in error:', error)
      setError(error instanceof Error ? error.message : 'Failed to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in to your account"
      description={(
        <>
          Or{' '}
          <Link
            to="/auth/signup"
            className="font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-md"
          >
            create a new account
          </Link>
        </>
      )}
      footer={(
        <div className="space-y-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-secondary/20" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white/80 px-3 py-0.5 text-secondary/70">Need help?</span>
            </div>
          </div>

          <div className="text-center">
            <Link
              to="/auth/forgot-password"
              className="text-sm font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-md"
            >
              Forgot your password?
            </Link>
          </div>
        </div>
      )}
    >
      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        <Input
          {...register('email')}
          type="email"
          label="Email address"
          error={errors.email?.message}
          required
        />

        <Input
          {...register('password')}
          type="password"
          label="Password"
          error={errors.password?.message}
          required
        />

        {error && (
          <div className="rounded-xl border border-red-200/70 bg-red-50/80 p-4 text-left shadow-sm">
            <div className="text-sm font-medium text-red-700">{error}</div>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          loading={loading}
          variant="gradient"
          size="lg"
        >
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}