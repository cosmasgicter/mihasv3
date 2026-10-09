/**
 * The student workspace's derived progress timeline (admissions-v2 task 12.1,
 * MAINT-01).
 *
 * Lifted **verbatim** out of `pages/student/ApplicationStatus.tsx`, where it was
 * a closure named `getTimeline` reading `application` from the component scope.
 * Nothing about which steps appear, in what order, with which copy or which
 * `completed` flag has changed — the only edit is that the application arrives as
 * an argument instead of being captured, which is what makes it testable without
 * mounting a page.
 *
 * It sits beside `StatusTimeline`, the component that renders it, rather than in
 * `lib/`: this is not a platform-wide helper, it is one surface's derivation, and
 * the canonical *record* of what actually happened is the server's
 * `ApplicationStatusHistory` (rendered by `ApplicationHistory`). This list
 * deliberately includes steps that have not happened yet, which is why it must
 * not be mistaken for the record.
 */
import type { ApplicationWithDetails } from '@/types/database'
import { formatTimestamp } from '@/lib/dateFormat'

export interface ApplicationTimeline {
  status: string
  date: string | undefined
  description: string
  completed: boolean
}

/**
 * A scheduled interview time, or the copy the workspace shows when the platform
 * has not recorded one. `formatTimestamp` answers `'Not available'` for an
 * unparseable value; on this surface the honest reading of a missing interview
 * time is that it is still to be confirmed, not that it is unavailable.
 */
export function formatInterviewDateTime(value?: string | null): string {
  if (!value) return 'To be confirmed'
  const result = formatTimestamp(value)
  return result === 'Not available' ? 'To be confirmed' : result
}

export function buildApplicationTimeline(
  application: ApplicationWithDetails | null
): ApplicationTimeline[] {
  if (!application) return []

  const timeline: ApplicationTimeline[] = [
    application.status === 'draft'
      ? { status: 'draft', date: application.created_at, description: 'Application draft started', completed: true }
      : { status: 'submitted', date: application.submitted_at || application.created_at, description: 'Application submitted successfully', completed: true }
  ]

  if (application.interview && application.interview.status !== 'cancelled') {
    timeline.push({
      status: 'interview_scheduled',
      date: application.interview.scheduled_at,
      description: `Interview scheduled for ${formatInterviewDateTime(application.interview.scheduled_at)}`,
      completed: application.interview.scheduled_at ? new Date(application.interview.scheduled_at) < new Date() : false
    })
  }

  if (['under_review', 'approved', 'rejected', 'waitlisted', 'conditionally_approved', 'enrolled', 'enrollment_expired'].includes(application.status)) {
    timeline.push({
      status: 'under_review',
      date: application.review_started_at || application.updated_at,
      description: 'Application currently under review by admissions',
      completed: application.status !== 'under_review'
    })
  }

  if (application.status === 'waitlisted') {
    timeline.push({
      status: 'waitlisted',
      date: application.updated_at,
      description: 'Application has been waitlisted \u2014 you will be notified if a spot opens',
      completed: true
    })
  }

  if (['approved', 'rejected', 'conditionally_approved'].includes(application.status)) {
    timeline.push({
      status: application.status,
      date: application.decision_date || application.updated_at,
      description: application.status === 'approved'
        ? 'Application approved'
        : application.status === 'conditionally_approved'
          ? 'Application conditionally approved'
          : 'Application not successful',
      completed: true
    })
  }

  if (application.status === 'enrolled') {
    timeline.push({ status: 'approved', date: application.decision_date || application.updated_at, description: 'Application approved', completed: true })
    timeline.push({ status: 'enrolled', date: application.updated_at, description: 'Enrollment confirmed', completed: true })
  }

  if (application.status === 'withdrawn') {
    timeline.push({ status: 'withdrawn', date: application.updated_at, description: 'Application withdrawn', completed: true })
  }

  if (application.status === 'expired' || application.status === 'enrollment_expired') {
    timeline.push({
      status: application.status,
      date: application.updated_at,
      description: application.status === 'expired' ? 'Application expired' : 'Enrollment confirmation window expired',
      completed: true
    })
  }

  return timeline
}
