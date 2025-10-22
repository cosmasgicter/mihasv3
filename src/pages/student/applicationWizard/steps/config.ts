import type { LucideIcon } from 'lucide-react'
import { FileText, Sparkles, CreditCard, Send } from 'lucide-react'

export type StepKey = 'basicKyc' | 'education' | 'payment' | 'submit'

export interface WizardStepConfig {
  id: number
  key: StepKey
  progressTitle: string
  title: string
  description: string
  icon: LucideIcon
  nextButtonLabel: string
}

export const wizardSteps: WizardStepConfig[] = [
  {
    id: 1,
    key: 'basicKyc',
    progressTitle: 'Basic Info',
    title: 'Step 1: Basic KYC Information',
    description: 'Provide your personal details and select your program',
    icon: FileText,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 2,
    key: 'education',
    progressTitle: 'Education',
    title: 'Step 2: Education & Documents',
    description: 'Enter your grades and upload required documents',
    icon: Sparkles,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 3,
    key: 'payment',
    progressTitle: 'Payment',
    title: 'Step 3: Payment Information',
    description: 'Submit your payment details and proof of payment',
    icon: CreditCard,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 4,
    key: 'submit',
    progressTitle: 'Review',
    title: 'Step 4: Review & Submit',
    description: 'Review your application and submit for processing',
    icon: Send,
    nextButtonLabel: 'Submit Application'
  }
]

export const saveNowLabel = 'Save Now'
export const previousButtonLabel = 'Previous'

export const getStepIndexById = (stepId: number): number =>
  wizardSteps.findIndex(step => step.id === stepId)

export const getStepByKey = (key: StepKey): WizardStepConfig | undefined =>
  wizardSteps.find(step => step.key === key)
