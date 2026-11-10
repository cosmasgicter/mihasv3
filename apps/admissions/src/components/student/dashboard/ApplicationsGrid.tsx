/**
 * The dashboard's applications section (admissions-v2 task 11.1).
 *
 * Requirements: R13.1, R16.1, R16.4, R16.5. Findings: STU-04, MAINT-02.
 *
 * One column, three sections, in the order the student needs them: the
 * applications the school has, the deadlines that constrain them, and the profile
 * details support will ask for. It sits *below* `NextActionPanel`, which is the
 * whole point of R13.1.
 *
 * What was removed here rather than moved:
 *
 * - **`QuickActions`** — two cards, "Complete Payment" → `/student/payment` and
 *   "View Interview Details" → `/student/interview`. Both are items in the global
 *   bottom navigation *and* both are actions the platform now publishes through
 *   the next-action panel, so the same student was offered the same payment three
 *   times on one screen. That is the "quick actions duplicate bottom navigation"
 *   half of STU-04, and R16.5 names duplicate quick actions directly.
 * - **`ApplicationTimeline`** — a narrative assembled in the browser from the
 *   application's timestamp columns, which stamped `new Date()` on events that had
 *   no recorded time ("Payment Proof Under Review", "Submit Application") and
 *   presented them beside real ones. The recorded transitions live at
 *   `/student/history` (the student's own cross-application timeline, actor and
 *   note included) and on the workspace's `ApplicationHistory` (task 10.6). A
 *   third, invented copy on the dashboard is MAINT-02.
 * - **the three-across grid** — a `lg:grid-cols-3` split that put the
 *   applications list beside a stack of four sidebar cards. At 320 px it was one
 *   column anyway; on desktop it made the passive column as prominent as the
 *   applications.
 */
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, Clock, FileText, User } from 'lucide-react'

import type { Application, Intake } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { EmptyState } from '@/components/ui/EmptyState'
import { ApplicationListItem } from '@/components/student/ApplicationListItem'
import { formatDate } from '@/lib/utils'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { getBestValue } from '@/hooks/useProfileAutoPopulation'
import { studentApplicationNewPath } from '@/routes/routeRegistry'

interface ProfileData {
  full_name?: string | null
  phone?: string | null
  address?: string | null
}

interface UserData {
  email?: string | null
}

interface MetadataData {
  full_name?: string | null
  phone?: string | null
  address?: string | null
}

interface ApplicationsGridProps {
  submittedApplications: Application[]
  intakes: Intake[]
  applicationsError: string
  intakesError: string
  interviewsError: string
  hasDraft: boolean
  profile: ProfileData | null | undefined
  user: UserData | null | undefined
  metadata: MetadataData
  onRetry: () => void
}

export function ApplicationsGrid({
  submittedApplications,
  intakes,
  applicationsError,
  intakesError,
  interviewsError,
  hasDraft,
  profile,
  user,
  metadata,
  onRetry,
}: ApplicationsGridProps) {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <SectionCard
        title="My applications"
        icon={<FileText className="h-5 w-5" />}
        headerVariant="tinted"
        contentClassName="p-0"
      >
        {applicationsError ? (
          <div className="px-4 py-6 sm:px-6">
            <ErrorDisplay
              title="Applications failed to load"
              message={applicationsError}
              onRetry={onRetry}
              variant="inline"
            />
          </div>
        ) : submittedApplications.length === 0 ? (
          <div className="px-4 py-10 sm:px-6">
            {hasDraft ? (
              <EmptyState
                icon={<Clock className="h-12 w-12" />}
                heading="Nothing submitted yet"
                description="Submitted applications appear here. Your draft is above."
              />
            ) : (
              <EmptyState
                icon={<FileText className="h-12 w-12" />}
                heading="No applications yet"
                description="Applications you submit appear here with their status and documents."
                action={{
                  label: 'Start an application',
                  onClick: () => navigate(studentApplicationNewPath()),
                  variant: 'primary',
                }}
              />
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {submittedApplications.map((application, index) => (
              <ApplicationListItem
                key={application.id}
                application={application}
                index={index}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {interviewsError && (
        <ErrorDisplay
          title="Interviews failed to load"
          message={interviewsError}
          onRetry={onRetry}
          variant="inline"
        />
      )}

      <SectionCard title="Intake deadlines" icon={<Calendar className="h-5 w-5" />} padding="sm">
        {intakesError ? (
          <ErrorDisplay
            title="Intakes failed to load"
            message={intakesError}
            onRetry={onRetry}
            variant="inline"
          />
        ) : intakes.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-12 w-12" />}
            heading="No upcoming deadlines yet"
            description="The next intake and its deadline will appear here."
          />
        ) : (
          <ul className="divide-y divide-border/45">
            {intakes.slice(0, 3).map((intake) => (
              <li
                key={intake.id}
                className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="break-words text-base sm:text-sm font-medium text-foreground">
                  {intake.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  Closes{' '}
                  <time dateTime={intake.application_deadline}>
                    {formatDate(intake.application_deadline)}
                  </time>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/*
        The details admissions and support read back to the student. Kept, because
        a wrong phone number is how a student misses an interview call — but
        flattened: it was four bordered, tinted boxes inside a card, which is the
        nested-card shape DESIGN.md bans, and it carried a "Profile completion"
        percentage that measured the form rather than telling the student anything
        they had to act on.
      */}
      <SectionCard title="Your details" icon={<User className="h-5 w-5" />} padding="sm">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <ProfileFact
            label="Full name"
            value={sanitizeForDisplay(
              getBestValue(profile?.full_name, metadata.full_name, user?.email?.split('@')[0]),
            )}
          />
          <ProfileFact label="Email" value={sanitizeForDisplay(user?.email) || 'Not provided'} />
          <ProfileFact
            label="Phone"
            value={sanitizeForDisplay(getBestValue(profile?.phone, metadata.phone, 'Not provided'))}
          />
          <ProfileFact
            label="Residence"
            value={sanitizeForDisplay(
              getBestValue(profile?.address, metadata.address, 'Not provided'),
            )}
          />
        </dl>
        <Button asChild variant="outline" size="sm" className="mt-4 min-h-touch w-full sm:w-auto">
          <Link to="/student/settings">Update your details</Link>
        </Button>
      </SectionCard>
    </div>
  )
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-base sm:text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}
