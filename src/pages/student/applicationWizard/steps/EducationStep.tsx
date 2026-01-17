import type { ChangeEvent } from 'react'

import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { StandaloneSelect } from '@/components/ui/standalone-select'
import { AnimatedFileUpload } from '@/components/smoothui/animated-file-upload'
import { EligibilityNotification } from '@/components/application/EligibilityNotification'
import { durations, easings } from '@/lib/animation-config'

import type { EligibilityResult } from '@/lib/eligibility'

import type { Grade12Subject, SubjectGrade } from '../types'

interface EducationStepProps {
  title: string
  subjects: Grade12Subject[]
  selectedProgram?: string
  selectedGrades: SubjectGrade[]
  eligibilityCheck: EligibilityResult | null
  recommendedSubjects: string[]
  resultSlipFile: File | null
  extraKycFile: File | null
  uploadProgress: Record<string, number>
  uploadedFiles: Record<string, boolean>
  addGrade: () => void
  removeGrade: (index: number) => void
  updateGrade: (index: number, field: keyof SubjectGrade, value: string | number) => void
  getUsedSubjects: () => string[]
  handleResultSlipUpload: (event: ChangeEvent<HTMLInputElement>) => void
  handleExtraKycUpload: (event: ChangeEvent<HTMLInputElement>) => void
}

const EducationStep = ({
  title,
  subjects,
  selectedProgram,
  selectedGrades,
  eligibilityCheck,
  recommendedSubjects,
  resultSlipFile,
  extraKycFile,
  uploadProgress,
  uploadedFiles,
  addGrade,
  removeGrade,
  updateGrade,
  getUsedSubjects,
  handleResultSlipUpload,
  handleExtraKycUpload
}: EducationStepProps) => {
  const prefersReducedMotion = useReducedMotion()

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.05,
        delayChildren: prefersReducedMotion ? 0 : 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : durations.normal,
        ease: easings.easeOut,
      }
    },
  }

  // Subject options for StandaloneSelect
  const getSubjectOptions = (currentSubjectId: string) => {
    const usedSubjects = getUsedSubjects()
    return subjects.map(subject => {
      const isUsed = usedSubjects.includes(subject.id) && currentSubjectId !== subject.id
      return {
        value: subject.id,
        label: `${subject.name}${isUsed ? ' (Already selected)' : ''}`,
        disabled: isUsed,
      }
    })
  }

  // Grade options for StandaloneSelect
  const gradeOptions = [
    { value: '1', label: '1 (A+)' },
    { value: '2', label: '2 (A)' },
    { value: '3', label: '3 (B+)' },
    { value: '4', label: '4 (B)' },
    { value: '5', label: '5 (C+)' },
    { value: '6', label: '6 (C)' },
    { value: '7', label: '7 (D+)' },
    { value: '8', label: '8 (D)' },
    { value: '9', label: '9 (F)' },
  ]

  return (
    <motion.div
      key="step2"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
      className="bg-card rounded-lg shadow-lg p-4 sm:p-6 border border-border"
      data-testid="education-step"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>

      <motion.div 
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h3 className="text-md font-medium text-gray-900">Grade 12 Subjects (Minimum 5 required)</h3>
            <Button
              type="button"
              onClick={event => {
                event.preventDefault()
                addGrade()
              }}
              disabled={selectedGrades.length >= 10}
              className="w-full sm:w-auto bg-primary hover:bg-primary touch-manipulation min-h-[44px]"
            >
              + Add New Subject
            </Button>
          </div>

          {eligibilityCheck && selectedGrades.length >= 5 && (
            <div className="mb-4">
              <EligibilityNotification 
                eligibility={eligibilityCheck} 
                programName={selectedProgram}
              />
            </div>
          )}

          {selectedProgram && recommendedSubjects.length > 0 && (
            <motion.div
              className="mb-4 p-3 bg-primary/5 border border-primary/30 rounded-lg"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h4 className="text-sm font-medium text-primary-foreground mb-2">
                Recommended subjects for {selectedProgram}:
              </h4>
              <div className="flex flex-wrap gap-1">
                {recommendedSubjects.map((subject, index) => (
                  <span key={index} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                    {subject}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {selectedGrades.length > 0 && (
            <div className="hidden sm:grid grid-cols-12 gap-3 mb-2 text-xs font-medium text-gray-900 uppercase tracking-wide">
              <div className="col-span-6">Subject</div>
              <div className="col-span-3">Grade</div>
              <div className="col-span-3">Action</div>
            </div>
          )}

          <div className="space-y-3">
            {selectedGrades.map((grade, index) => (
              <motion.div
                key={index}
                className="flex flex-col sm:grid sm:grid-cols-12 items-stretch sm:items-center gap-3 p-3 sm:p-4 bg-muted rounded-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: prefersReducedMotion ? 0 : index * 0.05 }}
              >
                {/* Subject Select */}
                <div className="sm:col-span-6">
                  <label className="block text-xs font-medium text-gray-900 mb-1 sm:hidden">
                    Subject
                  </label>
                  <StandaloneSelect
                    value={grade.subject_id}
                    onChange={(value) => updateGrade(index, 'subject_id', value)}
                    options={getSubjectOptions(grade.subject_id)}
                    disabled={subjects.length === 0}
                    placeholder={subjects.length === 0 ? 'Loading subjects...' : 'Select subject'}
                    data-testid={`subject-select-${index}`}
                  />
                </div>

                {/* Grade Select */}
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-gray-900 mb-1 sm:hidden">
                    Grade
                  </label>
                  <StandaloneSelect
                    value={String(grade.grade)}
                    onChange={(value) => updateGrade(index, 'grade', parseInt(value))}
                    options={gradeOptions}
                    placeholder="Select grade"
                    data-testid={`grade-select-${index}`}
                  />
                </div>

                {/* Actions */}
                <div className="sm:col-span-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={event => {
                      event.preventDefault()
                      removeGrade(index)
                    }}
                    className="flex-1 sm:flex-none touch-manipulation min-h-[44px]"
                  >
                    <X className="h-4 w-4 sm:mr-0 mr-2" />
                    <span className="sm:hidden">Remove</span>
                  </Button>
                  {selectedGrades.length < 10 && (
                    <Button
                      type="button"
                      onClick={event => {
                        event.preventDefault()
                        addGrade()
                      }}
                      size="sm"
                      className="flex-1 sm:hidden bg-primary hover:bg-primary touch-manipulation min-h-[44px]"
                    >
                      + Add
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Document Uploads */}
        <motion.div 
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          variants={itemVariants}
        >
          <div>
            <motion.div 
              className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-sm text-blue-900">
                ✨ <strong>Auto-fill enabled:</strong> Upload your result slip and grades will be automatically extracted.
              </p>
            </motion.div>
            <AnimatedFileUpload
              label="Result Slip"
              required
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleResultSlipUpload}
              file={resultSlipFile}
              uploadProgress={uploadProgress.result_slip}
              isUploaded={uploadedFiles.result_slip}
              helperText="Upload a clear scan or photo of your Grade 12 result slip"
            />
          </div>

          <div>
            <AnimatedFileUpload
              label="Extra KYC Documents (Optional)"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleExtraKycUpload}
              file={extraKycFile}
              uploadProgress={uploadProgress.extra_kyc}
              isUploaded={uploadedFiles.extra_kyc}
              helperText="Upload any additional supporting documents"
            />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export default EducationStep
