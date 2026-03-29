import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiClient } from '@/services/client'
import { logger } from '@/lib/logger'
import { normalizeSearchTerm, validateSearchTerm } from '../utils/trackerUtils'

export interface PublicApplicationStatus {
  application_number: string | null
  status: string
  payment_status: string | null
  program_name: string | null
  intake_name: string | null
  institution: string | null
  email: string | null
  submitted_at: string | null
  updated_at: string | null
  feedback_summary: string | null
  admin_feedback?: string | null
  admin_feedback_date?: string | null
}

interface TrackApplicationResponse {
  application?: {
    application_number: string
    status: string
    payment_status?: string | null
    program_name: string | null
    intake_name: string | null
    institution?: string | null
    email?: string | null
    submitted_at: string | null
    updated_at: string | null
    feedback_summary: string | null
  }
  status?: string
  program?: string | null
  intake?: string | null
  created_at?: string | null
}

export const useApplicationTracker = () => {
  const [searchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [application, setApplication] = useState<PublicApplicationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const searchApplication = useCallback(async (term: string) => {
    const normalizedTerm = normalizeSearchTerm(term)

    if (!normalizedTerm) {
      setError('Please enter an application number or tracking code')
      return
    }

    if (!validateSearchTerm(normalizedTerm)) {
      setError('Invalid search term. Use only letters, numbers, hyphens, and underscores (max 50 characters)')
      return
    }

    try {
      setLoading(true)
      setError('')
      setApplication(null)

      const result = await apiClient.request<TrackApplicationResponse>(`/applications?action=track&code=${encodeURIComponent(normalizedTerm)}`)

      const data = result?.application ?? result ?? null

      if (!data) {
        setError('Application not found. Please check your application number or tracking code.')
        setSearched(true)
        return
      }

      setApplication({
        application_number: data.application_number ?? null,
        status: data.status,
        payment_status: data.payment_status ?? null,
        feedback_summary: data.feedback_summary ?? null,
        submitted_at: data.submitted_at ?? data.created_at ?? null,
        updated_at: data.updated_at ?? null,
        program_name: data.program_name ?? data.program ?? null,
        intake_name: data.intake_name ?? data.intake ?? null,
        institution: data.institution ?? null,
        email: data.email ?? null,
        admin_feedback: data.feedback_summary ?? null,
        admin_feedback_date: null
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

    const normalizedCode = normalizeSearchTerm(code)
    if (!validateSearchTerm(normalizedCode)) {
      setError('Invalid tracking code provided in the link. Please verify and try again.')
      return
    }

    setSearchTerm(normalizedCode)
    searchApplication(normalizedCode)
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
