import { useEffect, useRef } from 'react'

import { X } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import { FileUpload } from '@/components/ui/FileUpload'
import { EligibilityNotification } from '@/components/application/EligibilityNotification'
import { animateClasses, staggerChild } from '@/lib/animations'

// eslint-disable-next-line no-restricted-imports -- type import from eligibilityEngine until API-backed replacement is ready
import type { EligibilityResult } from '@/lib/eligibilityEngine'

import type { Grade12Subject, SubjectGrade } from '../types'
import { EDUCATION_UPLOAD_COPY } from '../lib/educationCatalog'

function getUploadStatus(file: File | null, isUploaded?: boolean) {
  if (isUploaded) {
    return {
      label: 'Uploaded',
      className: 'border-success/30 bg-success/5 text-success',
    }
  }

  if (file) {
    return {
      label: 'Ready to upload',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    }
  }

  return {
    label: 'Not added',
    className: 'border-border bg-muted text-muted-foreground',
  }
}

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
  handleResultSlipUpload: (file: File | null) => void
  handleExtraKycUpload: (file: File | null) => void
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
  const lastSubjectRef = useRef<HTMLDivElement>(null)
  const prevGradeCountRef = useRef(selectedGrades.length)

  useEffect(() => {
    if (selectedGrades.length > prevGradeCountRef.current && lastSubjectRef.current) {
      lastSubjectRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    prevGradeCountRef.current = selectedGrades.length
  }, [selectedGrades.length])

  const resultSlipStatus = getUploadStatus(resultSlipFile, uploadedFiles.result_slip)
  const identityStatus = getUploadStatus(extraKycFile, uploadedFiles.extra_kyc)

  // Subject options for CanonicalSelect
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

  // Grade options for CanonicalSelect
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
    <div
      key="step2"
      className={`bg-card rounded-lg shadow-lg p-4 sm:p-6 border border-border ${animateClasses.fadeIn}`}
      data-testid="education-step"
    >
      <h2 className="text-lg font-semibold text-foreground mb-4">{title}</h2>

      <div className="space-y-6">
        <div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h3 className="text-md font-medium text-foreground">Grade 12 Subjects (Minimum 5 required)</h3>
            {selectedGrades.length === 0 && (
              <Button
                type="button"
                onClick={event => {
                  event.preventDefault()
                  addGrade()
                }}
                disabled={selectedGrades.length >= 10}
                className="w-full sm:w-auto bg-primary hover:bg-primary touch-manipulation min-h-[44px]"
              >
                + Add Your First Subject
              </Button>
            )}
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
            <div
              className={`mb-4 p-3 bg-primary/5 border border-primary/30 rounded-lg ${animateClasses.slideUp}`}
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
            </div>
          )}

          {selectedGrades.length > 0 && (
            <div className="hidden sm:grid grid-cols-12 gap-3 mb-2 text-xs font-medium text-foreground uppercase tracking-wide">
              <div className="col-span-6">Subject</div>
              <div className="col-span-3">Grade</div>
              <div className="col-span-3">Action</div>
            </div>
          )}

          <div className="space-y-3">
            {selectedGrades.map((grade, index) => (
              <div
                key={index}
                ref={index === selectedGrades.length - 1 ? lastSubjectRef : undefined}
                className={`flex flex-col sm:grid sm:grid-cols-12 items-stretch sm:items-center gap-3 p-3 sm:p-4 bg-muted rounded-lg ${animateClasses.slideUp}`}
                style={staggerChild(index)}
              >
                {/* Subject Select */}
                <div className="sm:col-span-6">
                  <label className="block text-xs font-medium text-foreground mb-1 sm:hidden">
                    Subject
                  </label>
                  <CanonicalSelect
                    value={grade.subject_id}
                    onChange={(value) => updateGrade(index, 'subject_id', value)}
                    options={getSubjectOptions(grade.subject_id)}
                    disabled={subjects.length === 0}
                    placeholder={subjects.length === 0 ? 'Loading subjects...' : 'Select subject'}
                    aria-label={`Subject ${index + 1}`}
                  />
                </div>

                {/* Grade Select */}
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-foreground mb-1 sm:hidden">
                    Grade
                  </label>
                  <CanonicalSelect
                    value={String(grade.grade)}
                    onChange={(value) => updateGrade(index, 'grade', parseInt(value))}
                    options={gradeOptions}
                    placeholder="Select grade"
                    aria-label={`Grade for subject ${index + 1}`}
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
                    aria-label={`Remove subject ${index + 1}`}
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
                      aria-label="Add another subject"
                      className="flex-1 sm:hidden bg-primary hover:bg-primary touch-manipulation min-h-[44px]"
                    >
                      + Add
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {selectedGrades.length > 0 && selectedGrades.length < 10 && (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={event => {
                  event.preventDefault()
                  addGrade()
                }}
                className="w-full min-h-[44px] border-dashed"
              >
                + Add another subject below
              </Button>
            </div>
          )}
        </div>

        {/* Document Uploads */}
        <div className="rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Document checklist</h3>
              <p className="mt-2 text-sm text-foreground">
                Keep academic evidence separate from identity support documents. The result slip is the main upload for this step; the identity document is only for supporting KYC verification when needed.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[22rem]">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Required</p>
                <p className="mt-1 text-sm font-medium text-blue-950">Academic result slip</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Optional</p>
                <p className="mt-1 text-sm font-medium text-amber-950">NRC or passport copy</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Academic document</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload your result slip here so the wizard can prefill your academic record accurately.
                </p>
              </div>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Required
              </span>
            </div>
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload status</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {resultSlipFile?.name || 'No result slip selected yet'}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${resultSlipStatus.className}`}>
                {resultSlipStatus.label}
              </span>
            </div>
            <div className="mb-3">
              <p className="mt-1 text-sm text-muted-foreground">
                Use this slot for your examination result slip only. The upload is used to extract subject names and grades automatically.
              </p>
            </div>
            <div
              className={`mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg ${animateClasses.slideUp}`}
            >
              <p className="text-sm text-blue-900">
                ✨ <strong>Auto-fill enabled:</strong> Upload your result slip and grades will be automatically extracted.
              </p>
            </div>
            <FileUpload
              label={EDUCATION_UPLOAD_COPY.resultSlip.label}
              accept=".pdf,.jpg,.jpeg,.png"
              maxSize={10 * 1024 * 1024}
              onChange={(files) => handleResultSlipUpload(files as File | null)}
              value={resultSlipFile}
              uploading={uploadProgress.result_slip !== undefined && uploadProgress.result_slip < 100}
              progress={uploadProgress.result_slip}
              preview={uploadedFiles.result_slip && resultSlipFile ? {
                url: URL.createObjectURL(resultSlipFile),
                type: resultSlipFile.type.startsWith('image/') ? 'image' : 'pdf'
              } : undefined}
            />
          </div>

          <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Identity support document</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only upload this when you want to support the KYC details already entered in the earlier step.
                </p>
              </div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                Optional
              </span>
            </div>
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload status</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {extraKycFile?.name || 'No identity support document selected'}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${identityStatus.className}`}>
                {identityStatus.label}
              </span>
            </div>
            <div className="mb-3">
              <p className="mt-1 text-sm text-muted-foreground">
                This slot is for a clear NRC or passport copy only. It is not another academic upload.
              </p>
            </div>
            <div
              className={`mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg ${animateClasses.slideUp}`}
            >
              <p className="text-sm text-amber-900">
                Your identity details are captured in the KYC step. Upload this document only when you want to support verification with a clear NRC or passport copy.
              </p>
            </div>
            <FileUpload
              label={EDUCATION_UPLOAD_COPY.identityDocument.label}
              accept=".pdf,.jpg,.jpeg,.png"
              maxSize={10 * 1024 * 1024}
              onChange={(files) => handleExtraKycUpload(files as File | null)}
              value={extraKycFile}
              uploading={uploadProgress.extra_kyc !== undefined && uploadProgress.extra_kyc < 100}
              progress={uploadProgress.extra_kyc}
              preview={uploadedFiles.extra_kyc && extraKycFile ? {
                url: URL.createObjectURL(extraKycFile),
                type: extraKycFile.type.startsWith('image/') ? 'image' : 'pdf'
              } : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default EducationStep
