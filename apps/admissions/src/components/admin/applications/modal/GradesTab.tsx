import { GraduationCap, CheckCircle, XCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { calculateBestFivePoints, sanitizeGradeValue } from '@/utils/grades'

interface Grade {
  subject_id: string
  grade: number
  subject_name?: string
}

export function GradesTab({ grades, loading }: { grades: Grade[], loading: boolean }) {
  if (loading) return (
    <div className="space-y-3 py-4" role="status" aria-label="Loading grades">
      <div className="flex justify-between p-4 bg-blue-50 rounded-lg">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-12" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex justify-between p-3 border rounded-lg">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
  if (grades.length === 0) return <div className="text-center py-8"><GraduationCap className="h-8 w-8 mx-auto mb-2" /><p>No grades</p></div>

  const normalized = grades.map(g => ({ ...g, normalized: sanitizeGradeValue(g.grade) })).filter((g): g is Grade & { normalized: number } => g.normalized !== null)
  const bestFive = normalized.sort((a, b) => a.normalized - b.normalized).slice(0, 5)
  const bestFiveIds = new Set(bestFive.map(g => g.subject_id))
  const points = calculateBestFivePoints(normalized.map(g => g.normalized))

  return (
    <div className="space-y-4">
      <div className="flex justify-between p-4 bg-blue-50 rounded-lg">
        <div><p className="text-sm font-medium">{grades.length} Subjects</p></div>
        <div><p className="text-lg font-bold">{points}</p><p className="text-xs">Points</p></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {grades.map((g, i) => {
          const norm = sanitizeGradeValue(g.grade)
          const best = norm !== null && bestFiveIds.has(g.subject_id)
          return (
            <div key={i} className={`flex justify-between p-3 border rounded-lg ${best ? 'bg-green-50' : 'bg-card'}`}>
              <span>{g.subject_name}{best && <span className="ml-2 text-xs text-accent">BEST 5</span>}</span>
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${norm && norm <= 6 ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
                {norm && norm <= 6 ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {g.grade}
                <span className="sr-only">{norm && norm <= 6 ? '(Pass)' : '(Fail)'}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
