/**
 * The persisted canonical grades a reviewer reads (R11.4) — extracted from
 * `ApplicationDetailModal.tsx` by admissions-v2 task **12.1** (MAINT-01),
 * verbatim.
 *
 * Read-only by design: a student enters grades, a reviewer reads them. Task 9.4
 * §15 recorded that deliberately — there is no grade-mutation command, so there is
 * nothing here to version-guard.
 */
import { GraduationCap } from 'lucide-react'

// Concrete module paths, not the `@/components/ui` barrel (task 12.1): the barrel
// re-exports the whole primitive set, so importing it puts a new module inside the
// pre-existing barrel import cycle. Same component, one fewer edge.
import { Skeleton } from '@/components/ui/skeleton'
import { calculateBestFivePoints, sanitizeGradeValue } from '@/lib/grades'
import type { Grade } from './applicationDetailTypes'


export function GradesDisplay({ grades, loading }: { grades: Grade[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading grades">
        <div className="flex justify-between rounded-lg border border-border bg-muted p-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-12" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex justify-between rounded-lg border p-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-10 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (grades.length === 0) {
    return (
      <div className="py-8 text-center text-foreground">
        <GraduationCap className="mx-auto mb-2 h-8 w-8 text-foreground" />
        <p className="text-sm">No grades recorded</p>
      </div>
    )
  }

  const normalizedGrades = grades
    .map((grade) => ({ ...grade, normalized: sanitizeGradeValue(grade.grade) }))
    .filter((grade): grade is Grade & { normalized: number } => grade.normalized !== null)

  const bestFiveSubjectIds = new Set(
    [...normalizedGrades].sort((a, b) => a.normalized - b.normalized).slice(0, 5).map((g) => g.subject_id),
  )
  const totalPoints = calculateBestFivePoints(normalizedGrades.map((grade) => grade.normalized))
  const gradeBadgeClass = (normalized: number | null) => {
    if (normalized === null) return 'border-border bg-muted text-foreground'
    if (normalized <= 3) return 'border-success/30 bg-success/10 text-success'
    if (normalized <= 6) return 'border-warning/30 bg-warning/10 text-warning'
    return 'border-destructive/30 bg-destructive/10 text-destructive'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm">
        <div>
          <p className="text-base font-semibold text-foreground">{grades.length} Subjects</p>
          <p className="text-xs font-medium text-muted-foreground">Grade 12 results</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-foreground">{totalPoints}</p>
          <p className="text-xs font-medium text-muted-foreground">Best 5 points</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {grades.map((grade, index) => {
          const normalized = sanitizeGradeValue(grade.grade)
          const isBestFive = normalized !== null && bestFiveSubjectIds.has(grade.subject_id)
          return (
            <div
              key={`${grade.subject_id}-${index}`}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                isBestFive ? 'border-success/30 bg-success/5' : 'border-border bg-card'
              }`}
            >
              <div className="min-w-0 pr-3">
                <span className="break-words text-sm font-semibold text-foreground">
                  {grade.subject_name}
                </span>
                {isBestFive && (
                  <span className="ml-2 inline-flex rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                    BEST 5
                  </span>
                )}
              </div>
              <span
                className={`inline-flex min-w-11 items-center justify-center rounded-md border px-3 py-1 text-sm font-bold ${gradeBadgeClass(normalized)}`}
              >
                {grade.grade}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

