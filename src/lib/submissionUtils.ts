import { supabase } from '@/lib/supabase'
import { SubmissionResult, SubmissionStatus, EmailReceipt, RetryConfig } from '@/types/submission'
import { ApplicationFormData } from '@/forms/applicationSchema'
import { sanitizeForLog } from './security'

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
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        to: receipt.to,
        subject: receipt.subject,
        template: 'application-receipt',
        data: {
          applicationNumber: receipt.applicationNumber,
          trackingCode: receipt.trackingCode,
          programName: receipt.programName,
          submissionDate: receipt.submissionDate,
          paymentStatus: receipt.paymentStatus
        }
      }
    })

    return !error
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
    await supabase
      .from('submission_logs')
      .insert({
        application_id: applicationId,
        status: status.status,
        message: status.message,
        timestamp: status.timestamp,
        step: status.step
      })
  } catch (error) {
    console.error('Failed to save submission status:', sanitizeForLog(error))
  }
}