import { FileText, GraduationCap, CreditCard, Send, type LucideIcon } from 'lucide-react'

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
    progressTitle: 'Personal',
    title: 'Personal details',
    description: 'Select your programme and confirm your details.',
    icon: FileText,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 2,
    key: 'education',
    progressTitle: 'Education',
    title: 'Education',
    description: 'Add grades and upload documents.',
    icon: GraduationCap,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 3,
    key: 'payment',
    progressTitle: 'Payment',
    title: 'Payment',
    description: 'Pay the application fee.',
    icon: CreditCard,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 4,
    key: 'submit',
    progressTitle: 'Review',
    title: 'Review',
    description: 'Confirm and submit.',
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
