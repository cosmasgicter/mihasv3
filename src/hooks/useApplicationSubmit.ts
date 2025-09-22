import { useState } from 'react'
import { supabase } from '@/lib/supabase'

// Simplified wizard data interface
interface WizardFormData {
  full_name: string
  nrc_number?: string
  passport_number?: string
  date_of_birth: string
  sex: string
  phone: string
  email: string
  residence_town: string
  next_of_kin_name?: string
  next_of_kin_phone?: string
  program: string
  intake: string
  payment_method?: string
  payer_name?: string
  payer_phone?: string
  amount?: number
  paid_at?: string
  momo_ref?: string
}

export function useWizardSubmit() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const submitApplication = async (data: WizardFormData, applicationId: string, popUrl: string) => {
    try {
      setLoading(true)
      setError('')

      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        throw new Error('Authentication session expired. Please sign in again.')
      }

      // Update the existing application with final submission data
      const { error: updateError } = await supabase
        .from('applications_new')
        .update({
          payment_method: data.payment_method || 'MTN Money',
          payer_name: data.payer_name || null,
          payer_phone: data.payer_phone || null,
          amount: data.amount || 153,
          paid_at: data.paid_at ? new Date(data.paid_at).toISOString() : null,
          momo_ref: data.momo_ref || null,
          pop_url: popUrl,
          status: 'submitted',
          submitted_at: new Date().toISOString()
        })
        .eq('id', applicationId)
        .eq('user_id', user.id) // Ensure user can only update their own application
      
      if (updateError) {
        throw new Error(updateError.message)
      }

      console.log('Application submitted successfully:', { applicationId })
      setSuccess(true)
      
    } catch (error) {
      console.error('Error submitting application:', error)
      
      let errorMessage = 'Failed to submit application'
      
      if (error instanceof Error) {
        if (error.message?.includes('auth') || error.message?.includes('JWT') || error.message?.includes('session')) {
          errorMessage = 'Authentication error. Please sign in again and try submitting.'
        } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.'
        } else if (error.message?.includes('403') || error.message?.includes('permission')) {
          errorMessage = 'Permission denied. Please ensure you are signed in and try again.'
        } else if (error.message?.includes('RLS') || error.message?.includes('policy')) {
          errorMessage = 'Access denied. Please sign in with the correct account and try again.'
        } else {
          errorMessage = error.message
        }
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return { submitApplication, loading, error, success }
}