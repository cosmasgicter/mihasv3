import { useCallback, useEffect, useMemo, useRef } from 'react'

import { AlertCircle, CheckCircle2, GraduationCap, X } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import { EligibilityNotification } from '@/components/application/EligibilityNotification'
import { ExtractedResultsCard } from '@/components/student/ExtractedResultsCard'
import { RequiredDocumentsPanel } from '@/components/student/RequiredDocumentsPanel'
import type { UseRequiredDocumentsResult } from '@/hooks/useRequiredDocuments'
import { animateClasses, staggerChild } from '@/lib/animations'

import type { EligibilityResult } from '@/lib/eligibilityEngine'

import type { Grade12Subject, SubjectGrade } from '../types'
import { isCanonicalSubjectId } from '@/lib/canonicalSubjectId'
import { cn } from '@/lib/utils'
import { rateLimitMessage } from '@/lib/rateLimitCopy'
import { validateLiveGrades, type RowDiagnostic } from '../lib/liveGradeValidation'

interface EducationStepProps {
  subjects: Grade12Subject[]
  selectedProgram?: string
  selectedGrades: SubjectGrade[]
  eligibilityCheck: EligibilityResult | null
  recommendedSubjects: string[]
  /**
   * The application's versioned required-document contract (task 7.2, R11.6).
   * This step renders one upload control per server requirement — it holds no
   * document-type list of its own (STU-13).
   */
  requiredDocuments: UseRequiredDocumentsResult
  addGrade: () => void
  removeGrade: (index: number) => void
  updateGrade: (index: number, field: keyof SubjectGrade, value: string | number) => void
  getUsedSubjects: () => string[]
  /**
   * Deterministic OCR assistance (task 7.5, R11.4). `suggested` means candidates
   * are waiting for the student's explicit confirmation — it never means the grid
   * has been populated. `applied` is only reachable through
   * `onConfirmOcrCandidates`.
   */
  ocrStatus?: 'idle' | 'polling' | 'suggested' | 'applied' | 'dismissed' | 'failed'
  ocrCandidates?: import('../hooks/useOcrGradeExtraction').OcrGradeCandidate[]
  ocrWithheld?: import('../hooks/useOcrGradeExtraction').OcrWithheldCandidate[]
  ocrAppliedCount?: number
  ocrFailureReason?: import('../hooks/useOcrGradeExtraction').OcrFailureReason
  /** When OCR can be retried after a rate limit, if the server said. */
  ocrRetryAfterSeconds?: number | null
  ocrExtractionMeta?: import('../hooks/useOcrGradeExtraction').OcrExtractionMeta | null
  onConfirmOcrCandidates?: (subjectIds: string[]) => void
  onDismissOcrCandidates?: () => void
  onRetryOcr?: () => void
}

const EducationStep = ({
  subjects,
  selectedProgram,
  selectedGrades,
  eligibilityCheck,
  recommendedSubjects,
  requiredDocuments,
  addGrade,
  removeGrade,
  updateGrade,
  getUsedSubjects,
  ocrStatus,
  ocrCandidates,
  ocrWithheld,
  ocrAppliedCount,
  ocrFailureReason,
  ocrRetryAfterSeconds,
  ocrExtractionMeta,
  onConfirmOcrCandidates,
  onDismissOcrCandidates,
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

  // Intro copy derived from the contract, so it can never promise a limit or a
  // document count the server did not publish.
  const uploadIntro = useMemo(() => {
    const required = requiredDocuments.requirements.filter(requirement => requirement.required)
    if (requiredDocuments.contractError) {
      return 'We could not read the documents this application needs yet.'
    }
    if (required.length === 0) {
      return 'Files upload automatically and save as you go.'
    }
    return `${required.length === 1 ? 'This document is' : `These ${required.length} documents are`} required before you continue. A clear phone photo works. Files upload automatically and save as you go.`
  }, [requiredDocuments.contractError, requiredDocuments.requirements])

  const handleRequirementFile = useCallback(
    (documentType: string, file: File | null) => {
      void requiredDocuments.selectFile(documentType, file)
    },
    [requiredDocuments],
  )

  const handleRequirementRetry = useCallback(
    (documentType: string) => {
      void requiredDocuments.retry(documentType)
    },
    [requiredDocuments],
  )

  // Task 7.3 (R11.8, STU-19): removal is a server command over the immutable
  // version, so the requirement only returns to "needs a file" after the server
  // says the version is no longer current.
  const handleRequirementRemove = useCallback(
    (documentType: string) => {
      void requiredDocuments.removeDocument(documentType)
    },
    [requiredDocuments],
  )

  const subjectCounts = selectedGrades.reduce((counts, grade) => {
    if (grade.subject_id) {
      counts.set(grade.subject_id, (counts.get(grade.subject_id) ?? 0) + 1)
    }
    return counts
  }, new Map<string, number>())
  const uniqueValidSubjectCount = new Set(
    selectedGrades
      .filter(grade => grade.subject_id && Number(grade.grade) >= 1 && Number(grade.grade) <= 9)
      .map(grade => grade.subject_id)
  ).size

  // Per-row diagnostics for inline hints. Computed in parallel to
  // selectedGrades so diagnosticsByIndex[i] describes selectedGrades[i].
  // See lib/liveGradeValidation.ts for the full issue taxonomy.
  const liveValidation = validateLiveGrades(selectedGrades)
  const diagnosticsByIndex: RowDiagnostic[] = liveValidation.diagnostics

  // Subject options for CanonicalSelect
  const getSubjectOptions = (currentSubjectId: string) => {
    const usedSubjects = getUsedSubjects()

    // Group subjects by level, then by category within each level
    const grade12 = subjects.filter(s => !s.level || s.level === 'grade12')
    const alevel = subjects.filter(s => s.level === 'alevel')

    const categoryOrder = ['core', 'sciences', 'commercial', 'humanities', 'technology', 'practical', 'languages']
    // Plain-text category labels. Emoji are not used as structural icons
    // (DESIGN.md §5 / R7.5); these are option-group headings inside a native
    // select where Lucide JSX cannot render, so plain text is the canonical fix.
    const categoryLabels: Record<string, string> = {
      core: 'Core Subjects',
      sciences: 'Sciences',
      commercial: 'Commercial',
      humanities: 'Humanities',
      technology: 'Technology & Technical',
      practical: 'Practical & Creative',
      languages: 'Languages',
    }

    const buildGroupedOptions = (list: typeof subjects) => {
      const grouped = new Map<string, typeof subjects>()
      for (const s of list) {
        const cat = s.category || 'other'
        if (!grouped.has(cat)) grouped.set(cat, [])
        grouped.get(cat)!.push(s)
      }

      const options: Array<{ value: string; label: string; disabled?: boolean }> = []
      // R11.5: every server subject must be reachable. Known categories keep their
      // curated order; anything else (a tenant category, a new ECZ grouping) lands
      // in a trailing group rather than disappearing from the selector.
      const orderedCategories = [
        ...categoryOrder.filter(cat => grouped.has(cat)),
        ...Array.from(grouped.keys()).filter(cat => !categoryOrder.includes(cat)).sort(),
      ]
      for (const cat of orderedCategories) {
        const items = grouped.get(cat)
        if (!items || items.length === 0) continue
        options.push({
          value: `__cat_${cat}`,
          label: categoryLabels[cat] || 'Other Subjects',
          disabled: true,
        })
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
      className={`bg-card rounded-lg shadow-sm ring-1 ring-border/50 p-5 sm:p-8 ${animateClasses.fadeIn}`}
      data-testid="education-step"
    >

      <div className="space-y-6">
        {/* OCR progress indicator */}
        {ocrStatus === 'polling' && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-base sm:text-sm text-primary animate-in fade-in duration-300">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Scanning your result slip for grades…</span>
          </div>
        )}
        {/*
          R11.4: candidates are offered, never applied. The confirmation card is
          the only path from a read to the grid, and it sits above a grid that is
          editable in every state — including while the scan is still running.
        */}
        {ocrStatus === 'suggested' && ocrCandidates && ocrCandidates.length > 0 && (
          <ExtractedResultsCard
            examNumber={ocrExtractionMeta?.examNumber ?? null}
            year={ocrExtractionMeta?.year ?? null}
            candidates={ocrCandidates}
            withheld={ocrWithheld ?? []}
            parserVersion={ocrExtractionMeta?.parserVersion ?? null}
            onConfirm={subjectIds => onConfirmOcrCandidates?.(subjectIds)}
            onDismiss={() => onDismissOcrCandidates?.()}
          />
        )}
        {ocrStatus === 'applied' && ocrAppliedCount && ocrAppliedCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 text-base sm:text-sm text-green-600 animate-in fade-in duration-300" role="status">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span>Added {ocrAppliedCount} confirmed subject{ocrAppliedCount > 1 ? 's' : ''}. Check each grade below and edit anything that is wrong.</span>
          </div>
        )}
        {ocrStatus === 'dismissed' && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-base sm:text-sm text-muted-foreground animate-in fade-in duration-300" role="status">
            <span>Suggestions dismissed. Add your subjects below. Your upload is still saved.</span>
          </div>
        )}
        {ocrStatus === 'failed' && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-base sm:text-sm text-amber-700 animate-in fade-in duration-300" role="alert">
            <span>
              {ocrFailureReason === 'server_failed'
                ? 'The grade scanner encountered an error processing your result slip. Please add your subjects manually. Your upload is still saved.'
                : ocrFailureReason === 'skipped'
                  ? 'Your file is too large for automatic scanning. Please add your subjects manually below.'
                  : ocrFailureReason === 'no_text'
                    ? 'We couldn\'t read any text from your result slip. Make sure the image is clear and well-lit, then try again.'
                    : ocrFailureReason === 'rate_limited'
                    ? `${rateLimitMessage(ocrRetryAfterSeconds ?? null)} You can add your subjects manually below. Your upload is still saved.`
                    : ocrFailureReason === 'not_started' || ocrFailureReason === 'missing'
                    ? 'Automatic grade scanning is not available for this upload. Please add your subjects manually below. Your upload is still saved.'
                    : ocrFailureReason === 'no_grades_matched'
                      ? 'We found text in your result slip but couldn\'t match it to the subject catalogue confidently enough to suggest anything. Please add your subjects manually below.'
                      : 'Automatic grade scanning is taking longer than expected. You can keep going manually below without losing your upload.'}
            </span>
            {onRetryOcr && (
              <button type="button" onClick={onRetryOcr} className="shrink-0 min-h-touch inline-flex items-center text-base sm:text-sm font-medium text-primary underline underline-offset-2 hover:text-link-hover">
                Retry scan
              </button>
            )}
          </div>
        )}

        <fieldset className="border-none p-0 m-0">
          <legend className="sr-only">Education details</legend>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            {/*
              Tokens, AA, and never colour alone (GATE-13.3-12, 13.6 §8.1 item L6).

              This counter was `text-red-500` / `text-green-600` — raw Tailwind
              palette steps on a *status* message, which `DESIGN.md` forbids
              independently of contrast, and #ef4444 on white measures **3.76 : 1**,
              under AA. axe reported it as a serious `color-contrast` row.
              `text-destructive` (#dc2626, 5.25 : 1) and `text-success` (#047857,
              5.6 : 1) are the semantic tokens, and the icon carries the same
              meaning for anyone who cannot use the hue.
            */}
            <div className="min-w-0">
              <h2 className="text-md font-medium text-foreground">Grade 12 Subjects</h2>
              {/*
                The counter is its own line, not a parenthetical (13.6 §8.1 item L6).

                Reviewing this batch's own 320 px screenshot — the discipline
                GATE-13.3-16 exists to enforce — showed the heading breaking as
                `Grade 12 Subjects (` / `0/5 unique minimum` / `)`, with the closing
                bracket orphaned on a line of its own: an `inline-flex` badge is an
                atomic box, so the parentheses could not stay with it. A count of
                progress is a status, not part of the section's name, so it reads as
                one.
              */}
              <p
                className={cn(
                  'mt-1 inline-flex items-center gap-1.5 text-base sm:text-sm font-semibold',
                  uniqueValidSubjectCount < 5 ? 'text-destructive' : 'text-success',
                )}
              >
                {uniqueValidSubjectCount < 5 ? (
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                {/*
                  The wording is deliberately unchanged.
                  `tests/harness-e2e/required/ocr-manual-fallback.spec.ts:217,252`
                  locates this counter by its exact text (`3/5 unique minimum`,
                  `5/5 unique minimum`) while walking the OCR-confirmation journey.
                  That spec belongs to the wizard lane and is outside this batch, so
                  L6 changed the token, the icon and the layout — not the string.
                */}
                <span>{uniqueValidSubjectCount}/5 unique minimum</span>
              </p>
            </div>
            {selectedGrades.length === 0 && (
              <span className="sr-only">No subjects added yet</span>
            )}
          </div>

          {selectedGrades.length === 0 && (
            <div className={`mb-6 flex flex-col items-center rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center ${animateClasses.fadeIn}`}>
              <GraduationCap className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
              <p className="mt-4 text-base font-semibold text-foreground">Add your Grade 12 subjects to continue</p>
              <p className="mt-1 text-base sm:text-sm text-muted-foreground">You need at least 5 subjects with grades to proceed.</p>
              <Button
                type="button"
                onClick={event => {
                  event.preventDefault()
                  addGrade()
                }}
                className="mt-5 bg-primary hover:bg-primary touch-manipulation min-h-touch"
              >
                + Add First Subject
              </Button>
            </div>
          )}

          {eligibilityCheck && uniqueValidSubjectCount >= 5 && (
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
              {/*
                GATE-13.3-12, continued. Two rows on this one panel:

                * the heading was `text-primary-foreground` — **white** (#ffffff) —
                  on `bg-primary/5`, a near-white wash. That is ~1.1 : 1, not a
                  marginal miss; and
                * the five chips were `bg-primary/10 text-primary`, the same
                  **4.49 : 1** pair as the bottom-nav label.

                Both now use the token pair the design system already has for a
                tinted surface: `accent` / `accent-foreground` (#dbeafe / #1e40af,
                7.2 : 1). `h4` is unchanged — it follows the `h3` above it, so it
                skips no level.
              */}
              <h3 className="text-sm font-medium text-accent-foreground mb-2">
                Recommended subjects for {selectedProgram}:
              </h3>
              <div className="flex flex-wrap gap-1">
                {recommendedSubjects.map((subject, index) => (
                  <span data-text-role="caption" key={index} className="px-2 py-1 bg-accent text-accent-foreground text-sm sm:text-xs rounded">
                    {subject}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedGrades.length > 0 && (
            <div data-text-role="caption" className="hidden sm:grid grid-cols-12 gap-3 mb-2 text-sm sm:text-xs font-medium text-foreground uppercase tracking-wide">
              <div className="col-span-6">Subject</div>
              <div className="col-span-3">Grade</div>
              <div className="col-span-3">Action</div>
            </div>
          )}

          <div className="space-y-3">
            {selectedGrades.map((grade, index) => {
              const isDuplicate = Boolean(grade.subject_id && (subjectCounts.get(grade.subject_id) ?? 0) > 1)
              const diagnostic = diagnosticsByIndex[index]?.issue ?? null
              // Which inline hints apply per row
              const gradeHint =
                diagnostic === 'missing_grade'
                  ? 'Enter a grade between 1 and 9.'
                  : diagnostic === 'invalid_grade_range'
                  ? 'Grade must be between 1 and 9.'
                  : null
              const subjectHint =
                diagnostic === 'missing_subject'
                  ? 'Pick a subject to match this grade.'
                  : diagnostic === 'unresolved_subject'
                  ? 'This subject is no longer in the list. Please pick it again.'
                  : null
              return (
              <div
                key={grade.row_id || `${grade.subject_id || 'empty'}-${index}`}
                ref={index === selectedGrades.length - 1 ? lastSubjectRef : undefined}
                className={`flex flex-col sm:grid sm:grid-cols-12 items-stretch sm:items-center gap-3 p-3 sm:p-4 bg-muted rounded-lg ${isDuplicate ? 'ring-1 ring-destructive/60' : ''} ${animateClasses.slideUp}`}
                style={staggerChild(index)}
              >
                {/* Subject Select */}
                <div className="sm:col-span-6">
                  <label className="block text-base sm:text-sm font-medium text-foreground mb-1 sm:hidden">
                    Subject
                  </label>
                  <CanonicalSelect
                    value={isCanonicalSubjectId(grade.subject_id) ? grade.subject_id : ''}
                    onChange={(value) => updateGrade(index, 'subject_id', value)}
                    options={getSubjectOptions(grade.subject_id)}
                    disabled={subjects.length === 0}
                    placeholder={subjects.length === 0 ? 'Loading subjects…' : 'Select subject'}
                    aria-label={`Subject ${index + 1}`}
                    error={isDuplicate || diagnostic === 'unresolved_subject'}
                  />
                  {isDuplicate && (
                    <p className="mt-1 text-base sm:text-sm font-medium text-destructive" role="alert">
                      This subject is already selected in another row.
                    </p>
                  )}
                  {!isDuplicate && subjectHint && (
                    <p className="mt-1 text-base sm:text-sm font-medium text-destructive" role="alert">
                      {subjectHint}
                    </p>
                  )}
                </div>

                {/* Grade Select */}
                <div className="sm:col-span-3">
                  <label className="block text-base sm:text-sm font-medium text-foreground mb-1 sm:hidden">
                    Grade
                  </label>
                  <CanonicalSelect
                    value={String(grade.grade)}
                    onChange={(value) => updateGrade(index, 'grade', parseInt(value))}
                    options={gradeOptions}
                    placeholder="Select grade"
                    aria-label={`Grade for subject ${index + 1}`}
                  />
                  {gradeHint && (
                    <p className="mt-1 text-base sm:text-sm font-medium text-destructive" role="alert">
                      {gradeHint}
                    </p>
                  )}
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
                    className="flex-1 sm:flex-none touch-manipulation min-h-touch"
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
                      className="flex-1 sm:hidden bg-primary hover:bg-primary touch-manipulation min-h-touch"
                    >
                      + Add
                    </Button>
                  )}
                </div>
              </div>
              )
            })}
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
                className="w-full min-h-touch border-dashed"
              >
                + Add another subject below
              </Button>
            </div>
          )}
        </fieldset>

        <fieldset className="border-none p-0 m-0">
          <legend className="sr-only">Document uploads</legend>
          <div className="mb-4">
            <h2 className="text-md font-medium text-foreground">Upload your documents</h2>
            <p className="mt-1 text-base sm:text-sm text-muted-foreground">
              {uploadIntro}
            </p>
          </div>
          {/*
            R11.6 / STU-13: every control below is generated from the application's
            versioned requirement snapshot, so a tenant-configured document type —
            including a custom one — is uploadable here instead of being an
            invisible submission blocker. This step publishes no document-type
            list, accept list, or size limit of its own.
          */}
          <RequiredDocumentsPanel
            requirements={requiredDocuments.requirements}
            uploadStates={requiredDocuments.uploadStates}
            loading={requiredDocuments.loading}
            contractError={requiredDocuments.contractError}
            contractErrorRetryable={requiredDocuments.contractErrorRetryable}
            onReload={requiredDocuments.reload}
            onSelectFile={handleRequirementFile}
            onRetry={handleRequirementRetry}
            onLocalError={requiredDocuments.reportLocalError}
            onBeginReplace={requiredDocuments.beginReplace}
            onCancelReplace={requiredDocuments.cancelReplace}
            onRemove={handleRequirementRemove}
          />
        </fieldset>
      </div>
    </div>
  )
}

export default EducationStep
