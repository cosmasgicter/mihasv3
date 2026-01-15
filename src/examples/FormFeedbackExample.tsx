/**
 * Form Feedback Example
 * Demonstrates how to use the form feedback system
 * This file serves as documentation and can be removed in production
 */

import React from 'react'
import { useFormSubmission } from '@/components/ui/FormFeedback'
import { FormFeedback, FormSubmitButton, InlineFormFeedback } from '@/components/ui/FormFeedback'
import { Input } from '@/components/ui/input'

export function FormFeedbackExample() {
  const { status, message, details, startSubmission, setSuccess, setError, reset } = useFormSubmission()
  const [email, setEmail] = React.useState('')
  const [emailError, setEmailError] = React.useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Reset previous errors
    setEmailError('')
    reset()

    // Validate email
    if (!email) {
      setEmailError('Email is required')
      return
    }

    if (!email.includes('@')) {
      setEmailError('Please enter a valid email address')
      return
    }

    // Start submission (shows loading state immediately)
    startSubmission()

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Success
      setSuccess('Form submitted successfully!')
      
      // Reset form after success
      setTimeout(() => {
        setEmail('')
        reset()
      }, 3000)
    } catch (error) {
      // Error with details
      setError(
        'Failed to submit form',
        [
          'Please check your internet connection',
          'If the problem persists, contact support'
        ]
      )
    }
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Form Feedback Example</h2>

      {/* Global form feedback */}
      <FormFeedback
        status={status}
        message={message}
        details={details}
        onDismiss={reset}
        autoHide
        className="mb-4"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            type="email"
            label="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
            placeholder="you@example.com"
          />
          {emailError && (
            <InlineFormFeedback
              type="error"
              message={emailError}
            />
          )}
        </div>

        <FormSubmitButton
          isLoading={status === 'loading'}
          loadingText="Submitting..."
          className="w-full"
        >
          Submit Form
        </FormSubmitButton>
      </form>

      {/* Usage instructions */}
      <div className="mt-8 p-4 bg-slate-50 rounded-lg text-sm">
        <h3 className="font-semibold mb-2">Usage Instructions:</h3>
        <ul className="space-y-1 text-slate-600">
          <li>• Try submitting with an empty email</li>
          <li>• Try submitting with an invalid email</li>
          <li>• Submit with a valid email to see success state</li>
          <li>• Notice the immediate feedback (within 100ms)</li>
        </ul>
      </div>
    </div>
  )
}

/**
 * Example with multiple fields and validation
 */
export function ComplexFormExample() {
  const { status, message, details, startSubmission, setSuccess, setError } = useFormSubmission()
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    password: '',
  })
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!formData.name) errors.name = 'Name is required'
    if (!formData.email) errors.email = 'Email is required'
    else if (!formData.email.includes('@')) errors.email = 'Invalid email'
    if (!formData.password) errors.password = 'Password is required'
    else if (formData.password.length < 8) errors.password = 'Password must be at least 8 characters'

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      setError('Please fix the errors below')
      return
    }

    startSubmission()

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000))
      setSuccess('Account created successfully!')
    } catch (error) {
      setError('Failed to create account', ['Please try again later'])
    }
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Complex Form Example</h2>

      <FormFeedback
        status={status}
        message={message}
        details={details}
        className="mb-4"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Full Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={fieldErrors.name}
        />

        <Input
          type="email"
          label="Email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          error={fieldErrors.email}
        />

        <Input
          type="password"
          label="Password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          error={fieldErrors.password}
        />

        <FormSubmitButton
          isLoading={status === 'loading'}
          className="w-full"
        >
          Create Account
        </FormSubmitButton>
      </form>
    </div>
  )
}
