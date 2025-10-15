import { useState } from 'react'
import { supabase } from '@/lib/supabase'

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

export function useApplicationSubmitFixed() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const submitApplication = async (data: WizardFormData, applicationId: string, popUrl: string) => {
    try {
      setLoading(true)
      setError('')

      // Verify user authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        throw new Error('Authentication session expired. Please sign in again.')
      }

      // Prepare update data
      const updateData = {
        payment_method: data.payment_method || 'MTN Money',
        payer_name: data.payer_name || null,
        payer_phone: data.payer_phone || null,
        amount: data.amount || 153,
        paid_at: data.paid_at ? new Date(data.paid_at).toISOString() : null,
        momo_ref: data.momo_ref || null,
        pop_url: popUrl,
        status: 'submitted',
        submitted_at: new Date().toISOString()
      }

      // Update the application
      const { data: updatedApp, error: updateError } = await supabase
        .from('applications')
        .update(updateData)
        .eq('id', applicationId)
        .eq('user_id', user.id)
        .select()
        .single()
      
      if (updateError) {
        console.error('Database update error:', updateError)
        throw new Error(updateError.message || 'Failed to update application')
      }

      if (!updatedApp) {
        throw new Error('Application not found or access denied')
      }

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