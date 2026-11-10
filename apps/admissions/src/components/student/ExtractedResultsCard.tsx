/**
 * ExtractedResultsCard — the explicit-confirmation surface for deterministic OCR
 * suggestions, shown above the grades grid.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 7.5.
 * Requirements: R11.4 — extracted candidates "SHALL include provenance/confidence
 *               and require explicit confirmation before they become application
 *               data"; R11.10 — low-confidence handling and "no automatic
 *               authority for extracted values".
 * Findings:     STU-06.
 *
 * Before 7.5 this card was a receipt: the grades had already been written into the
 * grid and the card told the student what had happened to their form. It is now
 * the decision point — nothing reaches the grid until the student ticks rows and
 * presses the confirm button, and every row shows where the value came from
 * (source line, matched alias) and how confident the deterministic parser is.
 *
 * Manual entry is never gated on this card: it renders above a grid that is always
 * editable, and "Enter grades myself" dismisses it entirely.
 */
import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { decodeExamNumber } from '@/lib/eczExamNumber'
import { computeExtractionChecks, type ExtractionCheck } from '@/lib/eczExtractionChecks'
import type {
  OcrGradeCandidate,
  OcrWithheldCandidate,
} from '@/pages/student/applicationWizard/hooks/useOcrGradeExtraction'

interface ExtractedResultsCardProps {
  examNumber?: string | null
  year?: string | null
  candidates: OcrGradeCandidate[]
  withheld?: OcrWithheldCandidate[]
  parserVersion?: string | null
  /** Called with the subject ids the student ticked. Never called implicitly. */
  onConfirm: (subjectIds: string[]) => void
  onDismiss: () => void
}

const WITHHELD_COPY: Record<OcrWithheldCandidate['status'], string> = {
  low_confidence: 'read with low confidence',
  unresolved: 'not a subject we recognise',
  duplicate: 'the same subject read twice',
  invalid_grade: 'grade outside the 1–9 scale',
}

function CheckChip({ check }: { check: ExtractionCheck }) {
  const isPass = check.status === 'pass'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        isPass
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}
    >
      {isPass ? (
        <CheckCircle className="h-3 w-3" aria-hidden="true" />
      ) : (
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
      )}
      {check.label}
    </span>
  )
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'High confidence'
  if (confidence >= 0.8) return 'Good confidence'
  return 'Lower confidence'
}

export function ExtractedResultsCard({
  examNumber,
  year,
  candidates,
  withheld = [],
  parserVersion,
  onConfirm,
  onDismiss,
}: ExtractedResultsCardProps) {
  // Defense-in-depth: only well-formed candidates with a canonical id and a 1-9
  // grade are ever offered, even if this card is reused with unvetted data.
  const valid = (candidates ?? []).filter(
    candidate =>
      !!candidate &&
      typeof candidate.subject_id === 'string' &&
      candidate.subject_id.length > 0 &&
      Number.isInteger(candidate.grade) &&
      candidate.grade >= 1 &&
      candidate.grade <= 9,
  )

  // A stable identity for "this candidate set", so a re-scan that genuinely
  // changes the suggestions resets the ticks while a parent re-render does not.
  const signature = valid.map(candidate => `${candidate.subject_id}:${candidate.grade}`).join('|')
  const [selected, setSelected] = useState<string[]>(() => valid.map(c => c.subject_id))

  useEffect(() => {
    setSelected(signature ? signature.split('|').map(entry => entry.split(':')[0] as string) : [])
  }, [signature])

  if (valid.length === 0) return null

  const decoded = decodeExamNumber(examNumber)
  const checks = computeExtractionChecks(
    valid.map(c => ({ name: c.subject_name, grade: c.grade })),
    examNumber,
    year,
  )

  const toggle = (subjectId: string) => {
    setSelected(prev =>
      prev.includes(subjectId) ? prev.filter(id => id !== subjectId) : [...prev, subjectId],
    )
  }

  return (
    <div
      className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5 animate-in fade-in duration-300"
      role="region"
      aria-label="Suggested grades read from your result slip"
      data-testid="extracted-results-card"
    >
      <div className="flex items-center gap-2 mb-1">
        <ScanLine className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <span className="text-base sm:text-sm font-semibold text-foreground">
          We read {valid.length} subject{valid.length > 1 ? 's' : ''} from your slip
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        These are suggestions, not your answers. Tick the rows you want to use, then confirm — nothing
        is added to your application until you do.
      </p>

      <ul className="space-y-2 mb-4" data-testid="ocr-candidate-list">
        {valid.map(candidate => {
          const checkboxId = `ocr-candidate-${candidate.subject_id}`
          return (
            <li key={candidate.subject_id}>
              <label
                htmlFor={checkboxId}
                className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 cursor-pointer min-h-touch"
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={selected.includes(candidate.subject_id)}
                  onChange={() => toggle(candidate.subject_id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                  data-testid={`ocr-candidate-${candidate.subject_code || candidate.subject_id}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-base sm:text-sm font-medium text-foreground">{candidate.subject_name}</span>
                    <span className="text-base sm:text-sm text-foreground">grade {candidate.grade}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {confidenceLabel(candidate.confidence)} ({Math.round(candidate.confidence * 100)}%)
                    {' · '}
                    {candidate.match === 'alias' && candidate.matched_alias
                      ? `matched "${candidate.matched_alias}" in the subject catalogue`
                      : 'name matched the subject catalogue exactly'}
                    {candidate.source_line > 0 ? ` · slip line ${candidate.source_line}` : ''}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {withheld.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-800 mb-1">
            {withheld.length} row{withheld.length > 1 ? 's' : ''} we will not suggest — please enter
            {withheld.length > 1 ? ' them' : ' it'} yourself:
          </p>
          <ul className="space-y-0.5">
            {withheld.map((row, index) => (
              <li key={`${row.raw_label}-${row.source_line}-${index}`} className="text-xs text-amber-700">
                {row.raw_label || row.subject_name || 'Unreadable row'}
                {row.grade !== null ? ` (grade ${row.grade})` : ''} — {WITHHELD_COPY[row.status]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {checks.map(check => (
          <CheckChip key={check.id} check={check} />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          onClick={() => onConfirm(selected)}
          disabled={selected.length === 0}
          className="min-h-touch touch-manipulation"
          data-testid="ocr-confirm-candidates"
        >
          Use {selected.length} selected grade{selected.length === 1 ? '' : 's'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDismiss}
          className="min-h-touch touch-manipulation"
          data-testid="ocr-dismiss-candidates"
        >
          Enter grades myself
        </Button>
      </div>

      <div className="mt-3 space-y-1">
        {decoded.valid && (
          <p className="text-xs text-muted-foreground">
            Exam number read: {decoded.raw}
            {year ? ` · ${year}` : ''}
          </p>
        )}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Read on our servers by deterministic text recognition
          {parserVersion ? ` (${parserVersion})` : ''} — no AI. Your slip stays on file and final
          verification against ECZ records happens during admin review.
        </p>
      </div>
    </div>
  )
}
