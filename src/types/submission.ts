export interface SubmissionResult {
  success: boolean
  applicationId?: string
  referenceNumber?: string
  trackingCode?: string
  error?: string
  retryCount?: number
}

export interface SubmissionStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retry'
  message: string
  timestamp: string
  step?: string
}

export interface EmailReceipt {
  to: string
  subject: string
  applicationNumber: string
  trackingCode: string
  programName: string
  submissionDate: string
  paymentStatus: string
}

export interface RetryConfig {
  maxRetries: number
  retryDelay: number
  backoffMultiplier: number
}