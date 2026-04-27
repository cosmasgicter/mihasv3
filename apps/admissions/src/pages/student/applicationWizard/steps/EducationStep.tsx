import { useEffect, useRef, useState } from 'react'

import { GraduationCap, X, CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import { FileUpload } from '@/components/ui/FileUpload'
import { EligibilityNotification } from '@/components/application/EligibilityNotification'
import { animateClasses, staggerChild } from '@/lib/animations'

// eslint-disable-next-line no-restricted-imports -- type import from eligibilityEngine until API-backed replacement is ready
import type { EligibilityResult } from '@/lib/eligibilityEngine'

import type { Grade12Subject, SubjectGrade } from '../types'
import { EDUCATION_UPLOAD_COPY } from '../lib/educationCatalog'
import type { ApplicationUploadState } from '../hooks/useApplicationFileUploads'

function getUploadStatus(file: File | null, uploadState: ApplicationUploadState | undefined, isUploaded?: boolean) {
  if (isUploaded) {
    return {
      label: 'Uploaded',
      className: 'border-success/30 bg-success/5 text-success',
    }
  }

  if (uploadState === 'uploading') {
    return {
      label: 'Uploading',
      className: 'border-primary/30 bg-primary/5 text-primary',
    }
  }

  if (uploadState === 'failed') {
    return {
      label: 'Needs retry',
      className: 'border-destructive/30 bg-destructive/5 text-destructive',
    }
  }

  if (file) {
    return {
      label: 'Selected',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    }
  }

  return {
    label: 'Not added',
    className: 'border-border bg-muted text-muted-foreground',
  }
}

function getPreviewType(file: File): 'image' | 'pdf' | 'other' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'application/pdf') return 'pdf'
  return 'other'
}

function useFilePreview(file: File | null, enabled?: boolean) {
  const [preview, setPreview] = useState<{ url: string; type: 'image' | 'pdf' | 'other' }>()

  useEffect(() => {
    if (!enabled || !file || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      setPreview(undefined)
      return undefined
    }

    const url = URL.createObjectURL(file)
    setPreview({ url, type: getPreviewType(file) })

    return () => {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url)
      }
    }
  }, [enabled, file])

  return preview
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
  uploadStates: Record<string, ApplicationUploadState>
  uploadedFiles: Record<string, boolean>
  addGrade: () => void
  removeGrade: (index: number) => void
  updateGrade: (index: number, field: keyof SubjectGrade, value: string | number) => void
  getUsedSubjects: () => string[]
  handleResultSlipUpload: (file: File | null) => void
  handleExtraKycUpload: (file: File | null) => void
  ocrStatus?: 'idle' | 'polling' | 'done' | 'failed'
  ocrExtractedCount?: number
  ocrFailureReason?: import('../hooks/useOcrGradeExtraction').OcrFailureReason
  onRetryOcr?: () => void
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
  uploadStates,
  uploadedFiles,
  addGrade,
  removeGrade,
  updateGrade,
  getUsedSubjects,
  handleResultSlipUpload,
  handleExtraKycUpload,
  ocrStatus,
  ocrExtractedCount,
  ocrFailureReason,
  onRetryOcr,
}: EducationStepProps) => {
  const lastSubjectRef = useRef<HTMLDivElement>(null)
  const prevGradeCountRef = useRef(selectedGrades.length)

  useEffect(() => {
    if (selectedGrades.length > prevGradeCountRef.current && lastSubjectRef.current) {
      lastSubjectRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    prevGradeCountRef.current = selectedGrades.length
  }, [selectedGrades.length])

  const resultSlipStatus = getUploadStatus(resultSlipFile, uploadStates.result_slip, uploadedFiles.result_slip)
  const identityStatus = getUploadStatus(extraKycFile, uploadStates.extra_kyc, uploadedFiles.extra_kyc)
  const resultSlipPreview = useFilePreview(resultSlipFile, uploadedFiles.result_slip)
  const identityPreview = useFilePreview(extraKycFile, uploadedFiles.extra_kyc)

  // Subject options for CanonicalSelect
  const getSubjectOptions = (currentSubjectId: string) => {
    const usedSubjects = getUsedSubjects()

    // Group subjects by level, then by category within each level
    const grade12 = subjects.filter(s => !s.level || s.level === 'grade12')
    const alevel = subjects.filter(s => s.level === 'alevel')

    const categoryOrder = ['core', 'sciences', 'commercial', 'humanities', 'technology', 'practical', 'languages']
    const categoryLabels: Record<string, string> = {
      core: '★ Core Subjects',
      sciences: '🔬 Sciences',
      commercial: '💼 Commercial',
      humanities: '📚 Humanities',
      technology: '💻 Technology & Technical',
      practical: '🎨 Practical & Creative',
      languages: '🌍 Languages',
    }

    const buildGroupedOptions = (list: typeof subjects) => {
      const grouped = new Map<string, typeof subjects>()
      for (const s of list) {
        const cat = s.category || 'other'
        if (!grouped.has(cat)) grouped.set(cat, [])
        grouped.get(cat)!.push(s)
      }

      const options: Array<{ value: string; label: string; disabled?: boolean }> = []
      for (const cat of categoryOrder) {
        const items = grouped.get(cat)
        if (!items || items.length === 0) continue
        options.push({ value: `__cat_${cat}`, label: categoryLabels[cat] || cat, disabled: true })
        for (const subject of items.sort((a, b) => a.name.localeCompare(b.name))) {
          const isUsed = usedSubjects.includes(subject.id) && currentSubjectId !== subject.id
          options.push({
            value: subject.id,
            label: `  ${subject.name}${isUsed ? ' (Already selected)' : ''}`,
            disabled: isUsed,
          })
        }
      }
      return options
    }

    const options: Array<{ value: string; label: string; disabled?: boolean }> = []

    if (grade12.length > 0) {
      options.push({ value: '__header_grade12', label: '━━ Grade 12 (ECZ) ━━', disabled: true })
      options.push(...buildGroupedOptions(grade12))
    }
    if (alevel.length > 0) {
      options.push({ value: '__header_alevel', label: '━━ A-Level (GCE Advanced) ━━', disabled: true })
      options.push(...buildGroupedOptions(alevel))
    }

    return options
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
      className={`bg-card rounded-2xl shadow-sm ring-1 ring-border/50 p-5 sm:p-8 ${animateClasses.fadeIn}`}
      data-testid="education-step"
    >
      <h2 className="text-lg font-semibold text-foreground mb-4">{title}</h2>

      <div className="space-y-6">
        {/* OCR progress indicator */}
        {ocrStatus === 'polling' && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary animate-in fade-in duration-300">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Scanning your result slip for grades…</span>
          </div>
        )}
        {ocrStatus === 'done' && ocrExtractedCount && ocrExtractedCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-600 animate-in fade-in duration-300" role="status">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span>Auto-populated {ocrExtractedCount} subject{ocrExtractedCount > 1 ? 's' : ''} from your result slip. Review them below and correct any mistakes.</span>
          </div>
        )}
        {ocrStatus === 'done' && (!ocrExtractedCount || ocrExtractedCount === 0) && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 animate-in fade-in duration-300" role="status">
            <span>Your result slip was scanned but we couldn't auto-detect any grades. Please add your subjects manually below — your upload is still saved.</span>
          </div>
        )}
        {ocrStatus === 'failed' && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 animate-in fade-in duration-300" role="alert">
            <span>
              {ocrFailureReason === 'server_failed'
                ? 'The grade scanner encountered an error processing your result slip. Please add your subjects manually — your upload is still saved.'
                : ocrFailureReason === 'skipped'
                  ? 'Your file is too large for automatic scanning. Please add your subjects manually below.'
                  : ocrFailureReason === 'no_text'
                    ? 'We couldn\'t read any text from your result slip. Make sure the image is clear and well-lit, then try again.'
                    : ocrFailureReason === 'no_grades_matched'
                      ? 'We found text in your result slip but couldn\'t match it to known subjects. Please add your subjects manually below.'
                      : 'Automatic grade scanning is taking longer than expected. You can keep going manually below without losing your upload.'}
            </span>
            {onRetryOcr && (
              <button type="button" onClick={onRetryOcr} className="shrink-0 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80">
                Retry scan
              </button>
            )}
          </div>
        )}

        <fieldset className="border-none p-0 m-0">
          <legend className="sr-only">Education Details</legend>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h3 className="text-md font-medium text-foreground">Grade 12 Subjects (<span className={selectedGrades.length < 5 ? 'text-red-500' : 'text-green-600'}>{selectedGrades.length}/5 minimum</span>)</h3>
            {selectedGrades.length === 0 && (
              <span className="sr-only">No subjects added yet</span>
            )}
          </div>

          {selectedGrades.length === 0 && (
            <div className={`mb-6 flex flex-col items-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center ${animateClasses.fadeIn}`}>
              <GraduationCap className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
              <p className="mt-4 text-base font-semibold text-foreground">Add your Grade 12 subjects to continue</p>
              <p className="mt-1 text-sm text-muted-foreground">You need at least 5 subjects with grades to proceed.</p>
              <Button
                type="button"
                onClick={event => {
                  event.preventDefault()
                  addGrade()
                }}
                className="mt-5 bg-primary hover:bg-primary touch-manipulation min-h-[44px]"
              >
                + Add First Subject
              </Button>
            </div>
          )}

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
        </fieldset>

        <fieldset className="border-none p-0 m-0">
          <legend className="sr-only">Document Uploads</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Result slip</h3>
                  <p className="mt-1 text-xs text-muted-foreground">PDF, JPG or PNG. Max 10MB.</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${resultSlipStatus.className}`}>
                  {resultSlipStatus.label}
                </span>
              </div>
              {uploadedFiles.result_slip && !resultSlipFile ? (
                <div className="flex flex-1 items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
                  <CheckCircle className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">Previously uploaded</p>
                    <button type="button" className="mt-1 text-xs underline text-muted-foreground hover:text-foreground" onClick={() => handleResultSlipUpload(null)}>
                      Replace file
                    </button>
                  </div>
                </div>
              ) : (
                <FileUpload
                  label={EDUCATION_UPLOAD_COPY.resultSlip.label}
                  accept=".pdf,.jpg,.jpeg,.png"
                  maxSize={10 * 1024 * 1024}
                  onChange={(files) => handleResultSlipUpload(files as File | null)}
                  value={resultSlipFile}
                  uploading={uploadStates.result_slip === 'uploading'}
                  progress={uploadProgress.result_slip}
                  preview={resultSlipPreview}
                />
              )}
            </div>

            <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">NRC or passport</h3>
                  <p className="mt-1 text-xs text-muted-foreground">PDF, JPG or PNG. Max 10MB.</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${identityStatus.className}`}>
                  {identityStatus.label}
                </span>
              </div>
              {uploadedFiles.extra_kyc && !extraKycFile ? (
                <div className="flex flex-1 items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
                  <CheckCircle className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">Previously uploaded</p>
                    <button type="button" className="mt-1 text-xs underline text-muted-foreground hover:text-foreground" onClick={() => handleExtraKycUpload(null)}>
                      Replace file
                    </button>
                  </div>
                </div>
              ) : (
                <FileUpload
                  label={EDUCATION_UPLOAD_COPY.identityDocument.label}
                  accept=".pdf,.jpg,.jpeg,.png"
                  maxSize={10 * 1024 * 1024}
                  onChange={(files) => handleExtraKycUpload(files as File | null)}
                  value={extraKycFile}
                  uploading={uploadStates.extra_kyc === 'uploading'}
                  progress={uploadProgress.extra_kyc}
                  preview={identityPreview}
                />
              )}
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  )
}

export default EducationStep
