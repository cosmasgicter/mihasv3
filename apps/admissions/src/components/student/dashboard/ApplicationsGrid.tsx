import { Link, useNavigate } from 'react-router-dom'
import type { Application, Intake } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { EmptyState } from '@/components/ui/EmptyState'
import { ApplicationListItem } from '@/components/student/ApplicationListItem'
import { ApplicationTimeline } from '@/components/student/ApplicationTimeline'
import { QuickActions } from '@/components/student/QuickActions'
import { formatDate } from '@/lib/utils'
import { staggerChild, animateClasses } from '@/lib/animations'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { getBestValue } from '@/hooks/useProfileAutoPopulation'
import { User, FileText, Clock, Calendar } from 'lucide-react'

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
  applications: Application[]
  intakes: Intake[]
  applicationsError: string
  intakesError: string
  interviewsError: string
  totalDraftCount: number
  hasPendingPayment: boolean
  hasScheduledInterview: boolean
  isClearingAllDrafts: boolean
  profile: ProfileData | null | undefined
  user: UserData | null | undefined
  metadata: MetadataData
  onRetry: () => void
  onClearAllDrafts: () => void
}

export function ApplicationsGrid({
  submittedApplications,
  applications,
  intakes,
  applicationsError,
  intakesError,
  interviewsError,
  totalDraftCount,
  hasPendingPayment,
  hasScheduledInterview,
  isClearingAllDrafts,
  profile,
  user,
  metadata,
  onRetry,
  onClearAllDrafts,
}: ApplicationsGridProps) {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
      <SectionCard
        className="lg:col-span-2"
        title="My applications"
        description="Review submitted applications, payment progress, and document actions after you complete the draft above."
        icon={<FileText className="h-5 w-5" />}
        headerVariant="tinted"
        contentClassName="p-0"
      >
        {applicationsError ? (
          <div className="px-6 py-6">
            <ErrorDisplay
              title="Applications failed to load"
              message={applicationsError}
              onRetry={onRetry}
              variant="inline"
            />
          </div>
        ) : submittedApplications.length === 0 ? (
          totalDraftCount > 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={<Clock className="h-12 w-12" />}
                heading="Your application is still in draft"
                description="Continue the saved draft above when you are ready. Submitted applications will appear here once you complete the full flow."
              />
            </div>
          ) : (
            <div className="px-6 py-12">
              <EmptyState
                icon={<FileText className="h-12 w-12" />}
                heading="No applications yet"
                description="Start your journey by submitting your first application. We'll guide you every step of the way."
                action={{
                  label: 'New Application',
                  onClick: () => navigate('/student/application-wizard?new=true'),
                  variant: 'primary',
                }}
              />
            </div>
          )
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

      <div className="space-y-6">
        <SectionCard
          title="Profile summary"
          description="Keep your details current for faster assistance."
          icon={<User className="h-5 w-5" />}
        >
          <div className="grid gap-2.5">
            <div className="rounded-lg border border-border bg-muted px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Full name</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground break-words">
                {sanitizeForDisplay(getBestValue(profile?.full_name, metadata.full_name, user?.email?.split('@')[0]))}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground break-all">{sanitizeForDisplay(user?.email) || 'Not provided'}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground break-words">
                {sanitizeForDisplay(getBestValue(profile?.phone, metadata.phone, 'Not provided'))}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Residence</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground break-words">
                {sanitizeForDisplay(getBestValue(profile?.address, metadata.address, 'Not provided'))}
              </p>
            </div>
          </div>
          <Link to="/student/settings" className="block">
            <Button variant="outline" size="sm" className="mt-4 min-h-touch w-full transition-colors duration-150 hover:border-primary/30">
              Update profile
            </Button>
          </Link>
        </SectionCard>

        <SectionCard
          title="Upcoming deadlines"
          description="Key dates for upcoming intakes."
          icon={<Clock className="h-5 w-5" />}
        >
          <div className="space-y-2.5">
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
                description="Check back soon for the next intake and application deadline."
              />
            ) : (
              intakes.slice(0, 3).map((intake, index) => (
                <div
                  key={intake.id}
                  className={`rounded-lg border border-warning/25 bg-warning/5 px-4 py-3 transition-colors duration-150 hover:border-warning/40 ${animateClasses.slideUp}`}
                  style={staggerChild(index, 100)}
                >
                  <p className="text-sm font-semibold text-foreground">{intake.name}</p>
                  <p className="mt-0.5 text-xs font-medium text-warning">Deadline: {formatDate(intake.application_deadline)}</p>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <ApplicationTimeline applications={applications} />

        {interviewsError && (
          <ErrorDisplay
            title="Interviews failed to load"
            message={interviewsError}
            onRetry={onRetry}
            variant="inline"
          />
        )}
        <QuickActions
          hasDrafts={totalDraftCount > 0}
          hasPendingPayment={hasPendingPayment}
          hasScheduledInterview={hasScheduledInterview}
          onClearAllDrafts={onClearAllDrafts}
          isClearingDrafts={isClearingAllDrafts}
        />
      </div>
    </div>
  )
}
