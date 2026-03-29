import React from 'react'
import { UseFormReturn } from 'react-hook-form'
import { ApplicationFormData } from '@/forms/applicationSchema'

interface StepProps {
  form: UseFormReturn<ApplicationFormData>
  onNext: () => void
  onPrev: () => void
  isLastStep?: boolean
}

export function PersonalInfoStep({ form, onNext }: StepProps) {
  // Extract personal info form fields here
  return (
    <div className="space-y-6">
      <h2 className="text-lg sm:text-xl md:text-2xl font-bold break-words">Personal Information</h2>
      {/* Personal info form fields */}
    </div>
  )
}

export function EducationStep({ form, onNext, onPrev }: StepProps) {
  // Extract education form fields here
  return (
    <div className="space-y-6">
      <h2 className="text-lg sm:text-xl md:text-2xl font-bold break-words">Educational Background</h2>
      {/* Education form fields */}
    </div>
  )
}

export function DocumentsStep({ form, onNext, onPrev }: StepProps) {
  // Extract document upload fields here
  return (
    <div className="space-y-6">
      <h2 className="text-lg sm:text-xl md:text-2xl font-bold break-words">Required Documents</h2>
      {/* Document upload fields */}
    </div>
  )
}

export function ReviewStep({ form, onPrev, isLastStep }: StepProps) {
  // Extract review and submit logic here
  return (
    <div className="space-y-6">
      <h2 className="text-lg sm:text-xl md:text-2xl font-bold break-words">Review & Submit</h2>
      {/* Review form data */}
    </div>
  )
}