import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { validateSearchTerm } from '../utils/trackerUtils'

export interface PublicApplicationStatus {
  public_tracking_code: string
  application_number: string
  status: string
  payment_status: string | null
  submitted_at: string | null
  updated_at: string | null
  program_name: string | null
  intake_name: string | null
  institution: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  admin_feedback?: string | null
  admin_feedback_date?: string | null
}

export const useApplicationTracker = () => {
  const [searchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [application, setApplication] = useState<PublicApplicationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const searchApplication = useCallback(async (term: string) => {
    const trimmedTerm = term.trim()

    if (!trimmedTerm) {
      setError('Please enter an application number or tracking code')
      return
    }

    if (!validateSearchTerm(trimmedTerm)) {
      setError('Invalid search term. Use only letters, numbers, hyphens, and underscores (max 50 characters)')
      return
    }

    try {
      setLoading(true)
      setError('')
      setApplication(null)

      const { data, error: searchError } = await supabase
        .from('public_application_status')
        .select('public_tracking_code, application_number, status, payment_status, submitted_at, updated_at, program_name, intake_name, institution, full_name, email, phone, admin_feedback, admin_feedback_date')
        .or(`application_number.eq."${trimmedTerm}",public_tracking_code.eq."${trimmedTerm}"`)
        .maybeSingle()

      if (searchError) throw searchError

      if (!data) {
        setError('Application not found. Please check your application number or tracking code.')
        setSearched(true)
        return
      }

      setApplication({
        ...(data as PublicApplicationStatus),
        payment_status: (data as PublicApplicationStatus)?.payment_status ?? 'pending_review'
      })
      setSearched(true)
    } catch (error: any) {
      logger.error('Error searching application:', error)
      setError('An error occurred while searching. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) return

    const trimmed = code.trim()
    if (!validateSearchTerm(trimmed)) {
      setError('Invalid tracking code provided in the link. Please verify and try again.')
      return
    }

    setSearchTerm(trimmed)
    searchApplication(trimmed)
  }, [searchParams, searchApplication])

  return {
    searchTerm,
    setSearchTerm,
    application,
    setApplication,
    loading,
    error,
    setError,
    searched,
    setSearched,
    searchApplication
  }
}
