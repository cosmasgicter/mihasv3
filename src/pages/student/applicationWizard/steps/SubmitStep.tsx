import { motion } from 'framer-motion'
import type { UseFormReturn } from 'react-hook-form'

import type { EligibilityResult } from '@/lib/eligibility'

import type { Grade12Subject, SubjectGrade, WizardFormData } from '../types'

interface SubmitStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  subjects: Grade12Subject[]
  selectedGrades: SubjectGrade[]
  eligibilityCheck: EligibilityResult | null
  resultSlipFile: File | null
  extraKycFile: File | null
  proofOfPaymentFile: File | null
  confirmSubmission: boolean
  onConfirmChange: (value: boolean) => void
}

const gradeLabelMap: Record<number, string> = {
  1: 'A+',
  2: 'A',
  3: 'B+',
  4: 'B',
  5: 'C+',
  6: 'C',
  7: 'D+',
  8: 'D',
  9: 'F'
}

const SubmitStep = ({
  title,
  form,
  subjects,
  selectedGrades,
  eligibilityCheck,
  resultSlipFile,
  extraKycFile,
  proofOfPaymentFile,
  confirmSubmission,
  onConfirmChange
}: SubmitStepProps) => {
  const watch = form.watch

  return (
    <motion.div
      key="step4"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-lg shadow-lg p-6 border border-gray-100"
      data-testid="submit-step"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>

      <div className="space-y-4">
        <p className="text-gray-600">
          Please review all your information before submitting. Once submitted, you cannot make changes.
        </p>

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Application Summary</h3>
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              <strong>Name:</strong> {watch('full_name')}
            </p>
            <p>
              <strong>Program:</strong> {watch('program')}
            </p>
            <p>
              <strong>Intake:</strong> {watch('intake')}
            </p>
            <div>
              <p>
                <strong>Subjects ({selectedGrades.length}):</strong>
              </p>
              <div className="ml-4 mt-1 space-y-1">
                {selectedGrades.map((grade, index) => {
                  const subject = subjects.find(subjectItem => subjectItem.id === grade.subject_id)
                  const subjectName = subject?.name || grade.subject_id || 'Loading...'
                  const gradeLabel = gradeLabelMap[grade.grade] || grade.grade

                  return (
                    <p key={index} className="text-sm">
                      • {subjectName}: {gradeLabel} ({grade.grade})
                    </p>
                  )
                })}
                {selectedGrades.length === 0 && (
                  <p className="text-sm text-gray-500">No subjects selected</p>
                )}
              </div>
            </div>
            {eligibilityCheck && (
              <div>
                <p>
                  <strong>Eligibility:</strong>
                  <span className={eligibilityCheck.eligible ? 'text-green-600' : 'text-yellow-600'}>
                    {eligibilityCheck.eligible ? ' ✓ Meets Requirements' : ' ⚠ Advisory Only'}
                  </span>
                  {eligibilityCheck.score && (
                    <span className="ml-2 text-blue-600">({eligibilityCheck.score}%)</span>
                  )}
                </p>
                {!eligibilityCheck.eligible && (
                  <p className="text-sm text-yellow-600 mt-1">{eligibilityCheck.message}</p>
                )}
              </div>
            )}
            <p>
              <strong>Documents:</strong> {resultSlipFile ? '✓' : '✗'} Result slip, {extraKycFile ? '✓' : '✗'} Extra KYC
            </p>
            <p>
              <strong>Payment:</strong> {proofOfPaymentFile ? '✓' : '✗'} Proof of payment uploaded
            </p>
          </div>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="confirm"
            className="mr-2"
            checked={confirmSubmission}
            onChange={event => onConfirmChange(event.target.checked)}
            required
          />
          <label htmlFor="confirm" className="text-sm text-gray-700">
            I confirm that all information provided is accurate and complete.
          </label>
        </div>

        {!confirmSubmission && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              ⚠️ Please confirm that all information is accurate before you can submit your application.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default SubmitStep
