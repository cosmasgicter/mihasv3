import type { ChangeEvent } from 'react'

import { motion } from 'framer-motion'
import { CheckCircle, X } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { EligibilityNotification } from '@/components/application/EligibilityNotification'

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
  return (
    <motion.div
      key="step2"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      className="bg-card rounded-lg shadow-lg p-6 border border-border"
      data-testid="education-step"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>

      <div className="space-y-6">
        <div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h3 className="text-md font-medium text-gray-900">Grade 12 Subjects (Minimum 5 required)</h3>
            <Button
              type="button"
              onClick={event => {
                event.preventDefault()
                addGrade()
              }}
              disabled={selectedGrades.length >= 10}
              className="w-full sm:w-auto bg-primary hover:bg-primary"
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
              <div className="col-span-8">Subject</div>
              <div className="col-span-2">Grade</div>
              <div className="col-span-2">Action</div>
            </div>
          )}

          <div className="space-y-3">
            {selectedGrades.map((grade, index) => (
              <div key={index}>
                <motion.div
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 bg-muted rounded-lg"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-medium text-gray-900 mb-1 sm:hidden">
                      Subject
                    </label>
                    <select
                      value={grade.subject_id}
                      onChange={event => updateGrade(index, 'subject_id', event.target.value)}
                      className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-primary"
                      disabled={subjects.length === 0}
                    >
                      <option value="">{subjects.length === 0 ? 'Loading subjects...' : 'Select subject'}</option>
                      {subjects.map(subject => {
                        const isUsed = getUsedSubjects().includes(subject.id) && grade.subject_id !== subject.id
                        return (
                          <option key={subject.id} value={subject.id} disabled={isUsed}>
                            {subject.name} {isUsed ? '(Already selected)' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div className="w-full sm:w-24">
                    <label className="block text-xs font-medium text-gray-900 mb-1 sm:hidden">Grade</label>
                    <select
                      value={grade.grade}
                      onChange={event => updateGrade(index, 'grade', parseInt(event.target.value))}
                      className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-primary"
                    >
                      <option value={1}>1 (A+)</option>
                      <option value={2}>2 (A)</option>
                      <option value={3}>3 (B+)</option>
                      <option value={4}>4 (B)</option>
                      <option value={5}>5 (C+)</option>
                      <option value={6}>6 (C)</option>
                      <option value={7}>7 (D+)</option>
                      <option value={8}>8 (D)</option>
                      <option value={9}>9 (F)</option>
                    </select>
                  </div>

                  <div className="w-full sm:w-auto flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={event => {
                        event.preventDefault()
                        removeGrade(index)
                      }}
                      className="flex-1 sm:flex-none"
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
                        className="flex-1 sm:flex-none bg-primary hover:bg-primary"
                      >
                        + Add
                      </Button>
                    )}
                  </div>
                </motion.div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Result Slip <span className="text-error">*</span>
            </label>
            <motion.div 
              className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-sm text-blue-900">
                ✨ <strong>Auto-fill enabled:</strong> Upload your result slip and grades will be automatically extracted and populated below.
              </p>
            </motion.div>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleResultSlipUpload}
                className="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/5 file:text-primary hover:file:bg-primary/10"
              />

              {resultSlipFile && (
                <div className="mt-2 flex items-center text-sm text-warning-strong">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {resultSlipFile.name}
                </div>
              )}
              {uploadProgress.result_slip !== undefined && (
                <div className="mt-2">
                  <div className="flex justify-between text-sm text-gray-900 mb-1">
                    <span>Uploading...</span>
                    <span>{uploadProgress.result_slip}%</span>
                  </div>
                  <div className="w-full bg-skeleton rounded-full h-2">
                    <motion.div
                      className="bg-primary h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress.result_slip}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
              {uploadedFiles.result_slip && (
                <motion.div
                  className="mt-2 flex items-center text-sm text-accent"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Upload complete! Ready to proceed.
                </motion.div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Extra KYC Documents (Optional)
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleExtraKycUpload}
                className="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/5 file:text-primary hover:file:bg-primary/10"
              />
              {extraKycFile && (
                <div className="mt-2 flex items-center text-sm text-warning-strong">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {extraKycFile.name}
                </div>
              )}
              {uploadProgress.extra_kyc !== undefined && (
                <div className="mt-2">
                  <div className="flex justify-between text-sm text-gray-900 mb-1">
                    <span>Uploading...</span>
                    <span>{uploadProgress.extra_kyc}%</span>
                  </div>
                  <div className="w-full bg-skeleton rounded-full h-2">
                    <motion.div
                      className="bg-primary h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress.extra_kyc}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
              {uploadedFiles.extra_kyc && (
                <motion.div
                  className="mt-2 flex items-center text-sm text-accent"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Upload complete!
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default EducationStep
