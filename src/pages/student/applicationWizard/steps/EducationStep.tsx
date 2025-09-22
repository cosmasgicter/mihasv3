import type { ChangeEvent } from 'react'

import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle, X } from 'lucide-react'

import { Button } from '@/components/ui/Button'

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
      className="bg-white rounded-lg shadow-lg p-6 border border-gray-100"
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
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
            >
              + Add New Subject
            </Button>
          </div>

          {eligibilityCheck && selectedGrades.length >= 5 && (
            <motion.div
              className={`mb-4 p-4 rounded-lg border ${
                eligibilityCheck.eligible ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
              }`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center mb-2">
                {eligibilityCheck.eligible ? (
                  <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
                )}
                <span
                  className={`font-medium ${eligibilityCheck.eligible ? 'text-green-800' : 'text-yellow-800'}`}
                >
                  {eligibilityCheck.eligible
                    ? `✓ Meets Basic Requirements for ${selectedProgram}`
                    : `⚠ Advisory for ${selectedProgram}`}
                </span>
                {eligibilityCheck.score && (
                  <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                    Score: {eligibilityCheck.score}%
                  </span>
                )}
              </div>
              <p
                className={`text-sm mb-2 ${eligibilityCheck.eligible ? 'text-green-700' : 'text-yellow-700'}`}
              >
                {eligibilityCheck.message}
              </p>
              {!eligibilityCheck.eligible && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-xs text-blue-800 font-medium">
                    ℹ️ You can still proceed with your application. Please consult with the institution for guidance on
                    requirements.
                  </p>
                </div>
              )}
              {eligibilityCheck.recommendations && eligibilityCheck.recommendations.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-600 mb-1">Recommendations:</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {eligibilityCheck.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start">
                        <span className="mr-1">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {selectedProgram && recommendedSubjects.length > 0 && (
            <motion.div
              className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h4 className="text-sm font-medium text-blue-800 mb-2">
                Recommended subjects for {selectedProgram}:
              </h4>
              <div className="flex flex-wrap gap-1">
                {recommendedSubjects.map((subject, index) => (
                  <span key={index} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                    {subject}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {selectedGrades.length > 0 && (
            <div className="hidden sm:grid grid-cols-12 gap-3 mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <div className="col-span-8">Subject</div>
              <div className="col-span-2">Grade</div>
              <div className="col-span-2">Action</div>
            </div>
          )}

          <div className="space-y-3">
            {selectedGrades.map((grade, index) => (
              <div key={index}>
                <motion.div
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-medium text-gray-700 mb-1 sm:hidden">
                      Subject
                    </label>
                    <select
                      value={grade.subject_id}
                      onChange={event => updateGrade(index, 'subject_id', event.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    <label className="block text-xs font-medium text-gray-700 mb-1 sm:hidden">Grade</label>
                    <select
                      value={grade.grade}
                      onChange={event => updateGrade(index, 'grade', parseInt(event.target.value))}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                        className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Result Slip <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleResultSlipUpload}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />

              {resultSlipFile && (
                <div className="mt-2 flex items-center text-sm text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {resultSlipFile.name}
                </div>
              )}
              {uploadProgress.result_slip !== undefined && (
                <div className="mt-2">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Uploading...</span>
                    <span>{uploadProgress.result_slip}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <motion.div
                      className="bg-blue-600 h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress.result_slip}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
              {uploadedFiles.result_slip && (
                <motion.div
                  className="mt-2 text-sm text-green-600"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  ✓ Upload complete!
                </motion.div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Extra KYC Documents (Optional)
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleExtraKycUpload}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {extraKycFile && (
                <div className="mt-2 flex items-center text-sm text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {extraKycFile.name}
                </div>
              )}
              {uploadProgress.extra_kyc !== undefined && (
                <div className="mt-2">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Uploading...</span>
                    <span>{uploadProgress.extra_kyc}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <motion.div
                      className="bg-blue-600 h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress.extra_kyc}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
              {uploadedFiles.extra_kyc && (
                <motion.div
                  className="mt-2 text-sm text-green-600"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  ✓ Upload complete!
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
