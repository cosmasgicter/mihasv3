/**
 * Submission Utilities
 * 
 * NOTE: This module is deprecated and not currently in use.
 * Keeping for reference only.
 */

import { sanitizeForLog } from './security'
import { renderApplicationReceiptEmail } from './emailTemplates'

// Type definitions for deprecated module
interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
}

interface SubmissionResult {
  success: boolean;
  error?: string;
  retryCount?: number;
}

interface SubmissionStatus {
  status: 'processing' | 'completed' | 'failed';
  message: string;
  timestamp: string;
  step?: string;
}

interface EmailReceipt {
  to: string;
  subject: string;
  [key: string]: unknown;
}

interface ApplicationFormData {
  program_id?: string;
  intake_id?: string;
  date_of_birth?: string;
  sex?: string;
  nationality?: string;
  physical_address?: string;
  nrc_number?: string;
  passport_number?: string;
  criminal_record?: boolean;
  employment_status?: string;
  previous_education?: string;
  grades_or_gpa?: string;
  motivation_letter?: string;
  career_goals?: string;
  english_proficiency?: string;
  computer_skills?: string;
  references?: string;
  financial_sponsor?: string;
  payment_method?: string;
  declaration?: boolean;
  information_accuracy?: boolean;
  professional_conduct?: boolean;
}

const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2
}

export const generateReferenceNumber = (): string => {
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.random().toString(36).substr(2, 4).toUpperCase()
  return `MIHAS${timestamp}${random}`
}

export const generateTrackingCode = (): string => {
  return `TRK${Math.random().toString(36).substr(2, 8).toUpperCase()}`
}

export const submitWithRetry = async (
  submitFunction: () => Promise<SubmissionResult>,
  onStatusUpdate?: (status: SubmissionStatus) => void
): Promise<SubmissionResult> => {
  try {
    onStatusUpdate?.({
      status: 'processing',
      message: 'Submitting application...',
      timestamp: new Date().toISOString(),
      step: 'submission'
    })

    // SECURE: This is calling a function parameter, not Function constructor
    const result = await submitFunction()
    
    if (result.success) {
      onStatusUpdate?.({
        status: 'completed',
        message: 'Application submitted successfully',
        timestamp: new Date().toISOString()
      })
      return result
    }
    
    throw new Error(result.error || 'Submission failed')
  } catch (error: any) {
    const errorMessage = error.message || 'Network error'
    
    onStatusUpdate?.({
      status: 'failed',
      message: errorMessage,
      timestamp: new Date().toISOString()
    })

    return {
      success: false,
      error: errorMessage,
      retryCount: 0
    }
  }
}

export const validateSubmissionData = (data: ApplicationFormData): string[] => {
  const errors: string[] = []
  
  if (!data.program_id) errors.push('Program selection is required')
  if (!data.intake_id) errors.push('Intake selection is required')
  if (!data.date_of_birth) errors.push('Date of birth is required')
  if (!data.sex) errors.push('Sex is required')
  if (!data.nationality) errors.push('Nationality is required')
  if (!data.physical_address) errors.push('Physical address is required')
  if (!data.nrc_number && !data.passport_number) errors.push('Either NRC or Passport number is required')
  if (data.criminal_record === undefined) errors.push('Criminal record declaration is required')
  if (!data.employment_status) errors.push('Employment status is required')
  if (!data.previous_education) errors.push('Previous education is required')
  if (!data.grades_or_gpa) errors.push('Grades/GPA is required')
  if (!data.motivation_letter) errors.push('Motivation letter is required')
  if (!data.career_goals) errors.push('Career goals are required')
  if (!data.english_proficiency) errors.push('English proficiency is required')
  if (!data.computer_skills) errors.push('Computer skills are required')
  if (!data.references) errors.push('References are required')
  if (!data.financial_sponsor) errors.push('Financial sponsor is required')
  if (!data.payment_method) errors.push('Payment method is required')
  if (!data.declaration) errors.push('Declaration must be accepted')
  if (!data.information_accuracy) errors.push('Information accuracy must be confirmed')
  if (!data.professional_conduct) errors.push('Professional conduct agreement is required')
  
  return errors
}

export const sendEmailReceipt = async (receipt: EmailReceipt): Promise<boolean> => {
  try {
    const html = renderApplicationReceiptEmail(receipt)

    // Use the notifications API instead of Supabase functions
    const response = await fetch('/api/notifications?action=send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        to: receipt.to,
        subject: receipt.subject,
        html
      })
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      const errorMessage = data?.error || 'Email provider rejected the receipt message'
      console.error('Receipt email provider error:', sanitizeForLog(errorMessage))
      return false
    }

    return true
  } catch (error) {
    console.error('Failed to send email receipt:', sanitizeForLog(error))
    return false
  }
}

export const saveSubmissionStatus = async (
  applicationId: string,
  status: SubmissionStatus
): Promise<void> => {
  try {
    // This is a deprecated function - submission logs should be handled by the API
    console.log('Submission status:', applicationId, status.status, status.message)
  } catch (error) {
    console.error('Failed to save submission status:', sanitizeForLog(error))
  }
}