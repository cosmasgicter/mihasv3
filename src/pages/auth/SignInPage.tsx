import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { AuthLoadingOverlay } from '@/components/ui/AuthLoadingOverlay'
import { AuthLayout } from './AuthLayout'


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
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
  })

  const onSubmit = async (data: SignInForm) => {
    setLoading(true)
    setError('')

    try {
      const result = await signIn(data.email, data.password)
      
      if (result?.error) {
        throw new Error(result.error)
      }

      setIsAuthenticating(true)
      await new Promise(resolve => setTimeout(resolve, 500))
      navigate('/dashboard')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to sign in. Please try again.'
      setError(message.includes('Invalid') ? 'Invalid email or password. Please try again.' : message)
      setLoading(false)
    }
  }

  return (
    <>
      {isAuthenticating && <AuthLoadingOverlay message="Signing you in..." />}
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
              <div className="w-full border-t border-input/20" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-card/80 px-3 py-0.5 text-foreground">Need help?</span>
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
          autoComplete="email"
          disabled={loading}
          required
        />

        <PasswordInput
          {...register('password')}
          label="Password"
          error={errors.password?.message}
          autoComplete="current-password"
          disabled={loading}
          required
        />

        {error && (
          <div className="rounded-xl border border-destructive bg-destructive/10 p-4 text-left shadow-sm">
            <div className="text-sm font-medium text-destructive">{error}</div>
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
    </>
  )
}