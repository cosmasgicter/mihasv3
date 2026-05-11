/**
 * ExtractedResultsCard — shown above the grades grid after OCR succeeds.
 *
 * Displays exam metadata, subject summary, and consistency check chips.
 * Honest framing: "Final verification happens during admin review."
 */
import { CheckCircle, AlertCircle } from 'lucide-react'
import { decodeExamNumber } from '@/lib/eczExamNumber'
import { computeExtractionChecks, type ExtractionCheck } from '@/lib/eczExtractionChecks'

interface AiSubject {
  name: string
  grade: number
}

interface ExtractedResultsCardProps {
  examNumber?: string | null
  year?: string | null
  subjects: AiSubject[]
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

export function ExtractedResultsCard({ examNumber, year, subjects }: ExtractedResultsCardProps) {
  // Defense-in-depth: filter to well-formed subjects with valid 1-9 grades
  // even though useOcrGradeExtraction already filters. This keeps the card
  // safe if it's reused elsewhere with unvetted data.
  const validSubjects = (subjects ?? []).filter(
    (s): s is AiSubject =>
      !!s && typeof s.name === 'string' && s.name.length > 0 &&
      Number.isInteger(s.grade) && s.grade >= 1 && s.grade <= 9,
  )
  if (validSubjects.length === 0) return null

  const decoded = decodeExamNumber(examNumber)
  const checks = computeExtractionChecks(validSubjects, examNumber, year)

  const bestGrade = Math.min(...validSubjects.map(s => s.grade))
  const avgGrade = (validSubjects.reduce((sum, s) => sum + s.grade, 0) / validSubjects.length).toFixed(1)
  const bestSubjects = validSubjects.filter(s => s.grade === bestGrade).map(s => s.name)

  return (
    <div
      className="rounded-lg border border-green-200 bg-green-50/50 p-4 sm:p-5 animate-in fade-in duration-300"
      role="region"
      aria-label="Extracted result slip data"
      data-testid="extracted-results-card"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-green-800">Slip read successfully</span>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3 text-sm">
        {decoded.valid && (
          <div>
            <span className="block text-xs text-muted-foreground">Exam Number</span>
            <span className="font-medium text-foreground">{decoded.raw}</span>
          </div>
        )}
        {year && (
          <div>
            <span className="block text-xs text-muted-foreground">Year</span>
            <span className="font-medium text-foreground">{year}</span>
          </div>
        )}
        <div>
          <span className="block text-xs text-muted-foreground">Subjects</span>
          <span className="font-medium text-foreground">{validSubjects.length}</span>
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">Best Grade</span>
          <span className="font-medium text-foreground">
            {bestGrade} in {bestSubjects.slice(0, 2).join(', ')}
            {bestSubjects.length > 2 && ` +${bestSubjects.length - 2}`}
          </span>
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">Average</span>
          <span className="font-medium text-foreground">{avgGrade}</span>
        </div>
      </div>

      {/* Consistency chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {checks.map(check => (
          <CheckChip key={check.id} check={check} />
        ))}
      </div>

      {/* Honest framing */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        This is what we read from your slip — you can adjust any row below.
        Final verification against ECZ records happens during admin review.
      </p>
    </div>
  )
}
