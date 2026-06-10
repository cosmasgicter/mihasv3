/**
 * Interview Page
 * 
 * Displays scheduled interviews for the student's applications.
 * Shows upcoming and past interviews with details like date, time, mode, and location.
 * 
 * @requirements 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.2, 6.3, 6.4
 */

import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDate } from '@/lib/dateFormat'
import { Seo } from '@/components/seo/Seo'
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Video, 
  Phone, 
  Users,
  ArrowLeft,
  ExternalLink,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { PageShell } from '@/components/ui/PageShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Skeleton } from '@/components/ui'
import { interviewsService } from '@/services/interviews'
import { useAuth } from '@/contexts/AuthContext'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { toError } from '@/lib/toError'

interface Interview {
  id: string
  scheduled_at: string
  mode: 'in_person' | 'virtual' | 'phone'
  location: string | null
  status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled'
  notes: string | null
  application_id: string
  program_name: string | null
}

/**
 * Returns the appropriate icon for interview mode
 * @requirements 4.2 - Show interview mode
 */
function getModeIcon(mode: Interview['mode']) {
  switch (mode) {
    case 'virtual':
      return <Video className="h-4 w-4" />
    case 'phone':
      return <Phone className="h-4 w-4" />
    case 'in_person':
    default:
      return <Users className="h-4 w-4" />
  }
}

/**
 * Returns human-readable mode label
 * @requirements 4.2 - Show interview mode
 */
function getModeLabel(mode: Interview['mode']): string {
  switch (mode) {
    case 'virtual':
      return 'Virtual Meeting'
    case 'phone':
      return 'Phone Call'
    case 'in_person':
    default:
      return 'In Person'
  }
}

/**
 * Returns the appropriate badge variant and icon for interview status
 * @requirements 4.5 - Show interview status
 */
function getStatusDisplay(status: Interview['status']): {
  variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'default'
  label: string
  icon: React.ReactNode
} {
  switch (status) {
    case 'scheduled':
      return {
        variant: 'default',
        label: 'Scheduled',
        icon: <Clock className="h-3.5 w-3.5" />
      }
    case 'rescheduled':
      return {
        variant: 'warning',
        label: 'Rescheduled',
        icon: <RefreshCw className="h-3.5 w-3.5" />
      }
    case 'completed':
      return {
        variant: 'success',
        label: 'Completed',
        icon: <CheckCircle className="h-3.5 w-3.5" />
      }
    case 'cancelled':
      return {
        variant: 'destructive',
        label: 'Cancelled',
        icon: <XCircle className="h-3.5 w-3.5" />
      }
    default:
      return {
        variant: 'secondary',
        label: status,
        icon: <Clock className="h-3.5 w-3.5" />
      }
  }
}

/**
 * Extracts meeting link from notes field if present
 * @requirements 4.3 - Show Join Meeting button if meeting link exists
 */
function extractMeetingLink(...sources: Array<string | null | undefined>): string | null {
  const text = sources.filter(Boolean).join(' ')

  if (!text) return null

  // Common patterns for meeting links
  const urlPatterns = [
    /https?:\/\/[^\s]+zoom[^\s]*/i,
    /https?:\/\/[^\s]+teams[^\s]*/i,
    /https?:\/\/[^\s]+meet\.google[^\s]*/i,
    /https?:\/\/[^\s]+webex[^\s]*/i,
    /https?:\/\/[^\s]+/i // Generic URL fallback
  ]
  
  for (const pattern of urlPatterns) {
    const match = text.match(pattern)
    if (match) return match[0]
  }
  
  return null
}

/**
 * Formats date and time for display
 * @requirements 4.1 - Display scheduled_at date and time
 */
function formatDateTime(dateString: string): { date: string; time: string } {
  const parsed = new Date(dateString)

  if (Number.isNaN(parsed.getTime())) {
    return {
      date: dateString,
      time: dateString,
    }
  }

  return {
    date: formatDate(dateString),
    time: parsed.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}

export default function InterviewPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const {
    data: interviews = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Interview[]>({
    queryKey: ['student-interviews', user?.id],
    queryFn: async () => {
      // @requirements 3.2 - Query application_interviews for the student's applications.
      // Uses interviewsService which auto-unwraps the API envelope.
      const data = await interviewsService.list()
      return (data?.interviews || []).map((item) => ({
        id: item.id,
        scheduled_at: item.scheduled_at,
        mode: item.mode,
        location: item.location,
        status: item.status,
        notes: item.notes,
        application_id: item.application_id,
        program_name: item.program || null
      }))
    },
    enabled: Boolean(user?.id),
    ...CACHE_CONFIG.applications,
  })

  // @requirements 4.6 - Separate upcoming interviews from past interviews
  const { upcomingInterviews, pastInterviews } = useMemo(() => {
    const now = new Date()
    const upcoming: Interview[] = []
    const past: Interview[] = []

    interviews.forEach(interview => {
      const interviewDate = new Date(interview.scheduled_at)
      const activeUpcomingStatus = interview.status === 'scheduled' || interview.status === 'rescheduled'
      if (activeUpcomingStatus && interviewDate >= now) {
        upcoming.push(interview)
      } else {
        past.push(interview)
      }
    })

    // Sort upcoming by date ascending, past by date descending
    upcoming.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    past.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())

    return { upcomingInterviews: upcoming, pastInterviews: past }
  }, [interviews])

  // @requirements 6.3 - Display loading spinner
  if (isLoading) {
    return (
      <>
      <Seo
        title="My Interview | Beanola Admissions"
        description="View your scheduled interviews and prepare for your Beanola admission process."
        path="/student/interview"
        noindex
      />
      <PageShell title="Interview Schedule" subtitle="Loading interview information...">
        <div className="space-y-6" role="status" aria-label="Loading interview information">
          <div className="rounded-lg border border-primary/20 bg-card p-6">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="mt-6 space-y-4">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-44" />
                      <Skeleton className="h-4 w-64" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-24 rounded-full" />
                      <Skeleton className="h-8 w-20 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageShell>
      </>
    )
  }

  return (
    <>
      <Seo
        title="My Interview | Beanola Admissions"
        description="View your scheduled interviews and prepare for your Beanola admission process."
        path="/student/interview"
        noindex
      />
    <PageShell
      title="Interview Schedule"
      subtitle="View your scheduled interviews and prepare for your admission process."
      eyebrow="Interview Journey"
      tone="student"
      metrics={[
        { label: 'Upcoming', value: upcomingInterviews.length, helper: 'Interviews still ahead of you' },
        { label: 'Past', value: pastInterviews.length, helper: 'Completed or closed interview records' },
        { label: 'Total', value: interviews.length, helper: 'All interview records tied to your account' },
        { label: 'State', value: error ? 'Needs attention' : 'Ready', helper: error instanceof Error ? error.message : 'Use this page to prepare and review details' },
      ]}
    >
        {/* @requirements 3.5 - Back to Dashboard navigation link */}
        <div className="mb-6">
          <Link 
            to="/student/dashboard" 
            className="inline-flex min-h-touch items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Link>
        </div>

        {/* Error Display */}
        {/* @requirements 6.2 - Display error message on failure */}
        {error && (
          <ErrorDisplay
            variant="section"
            title="Unable to load interview information"
            message={toError(error).message || 'Failed to load interview information. Please try again.'}
            onRetry={() => void refetch()}
            className="mb-6"
          />
        )}

        <div className="grid gap-6">
          {/* Upcoming Interviews Section */}
          {/* @requirements 4.6 - Display upcoming interviews section */}
          {upcomingInterviews.length > 0 && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Upcoming Interviews
                </CardTitle>
                <CardDescription>
                  Interviews scheduled for the future
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {upcomingInterviews.map((interview) => (
                    <InterviewCard key={interview.id} interview={interview} isUpcoming={true} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Past Interviews Section */}
          {/* @requirements 4.6 - Display past interviews section */}
          {pastInterviews.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  Past Interviews
                </CardTitle>
                <CardDescription>
                  Previously scheduled interviews
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pastInterviews.map((interview) => (
                    <InterviewCard key={interview.id} interview={interview} isUpcoming={false} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {/* @requirements 3.4 - Display appropriate empty state message */}
          {interviews.length === 0 && !error && (
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <EmptyState
                  icon={<Calendar className="h-12 w-12" />}
                  heading="No Scheduled Interviews"
                  description="You don't have any interviews scheduled yet. Once your application is reviewed, you'll receive an interview invitation."
                  action={{
                    label: 'Return to Dashboard',
                    onClick: () => navigate('/student/dashboard'),
                    variant: 'outline',
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Help Card */}
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Need to reschedule your interview?
                </p>
                <p className="text-xs text-muted-foreground">
                  Contact the admissions office at{' '}
                  <a href="mailto:admissions@mihas.edu.zm" className="text-primary hover:underline">
                    admissions@mihas.edu.zm
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
    </PageShell>
    </>
  )
}

/**
 * Interview Card Component
 * Displays individual interview details
 * @requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
function InterviewCard({ interview, isUpcoming }: { interview: Interview; isUpcoming: boolean }) {
  const { date, time } = formatDateTime(interview.scheduled_at)
  const statusDisplay = getStatusDisplay(interview.status)
  const meetingLink = interview.mode === 'virtual'
    ? extractMeetingLink(interview.location, interview.notes)
    : null
  const modeDetail = (() => {
    if (interview.mode === 'in_person' && interview.location) {
      return { icon: <MapPin className="h-4 w-4 flex-shrink-0" />, text: interview.location }
    }

    if (interview.mode === 'phone' && interview.location) {
      return { icon: <Phone className="h-4 w-4 flex-shrink-0" />, text: interview.location }
    }

    if (interview.mode === 'virtual' && meetingLink) {
      return { icon: <Video className="h-4 w-4 flex-shrink-0" />, text: 'Meeting link available' }
    }

    if (interview.mode === 'virtual') {
      return { icon: <Video className="h-4 w-4 flex-shrink-0" />, text: 'Meeting details will be shared before the interview' }
    }

    return null
  })()

  return (
    <div 
      className={`rounded-lg border p-4 transition-colors ${
        isUpcoming 
          ? 'border-primary/30 bg-primary/5' 
          : 'border-border bg-card'
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0 space-y-3">
          {/* Program Name */}
          <p className="font-semibold text-foreground truncate">
            {interview.program_name || 'Application Interview'}
          </p>
          
          {/* Date, Time, Mode -- compact row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              {date}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 flex-shrink-0" />
              {time}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
              {getModeIcon(interview.mode)}
              {getModeLabel(interview.mode)}
            </span>
          </div>

          {/* Location / link detail */}
          {modeDetail && (
            <p className="text-sm text-muted-foreground flex items-start gap-1.5 break-words">
              <span className="shrink-0 mt-0.5">{modeDetail.icon}</span>
              <span className="min-w-0 break-words">{modeDetail.text}</span>
            </p>
          )}

          {/* Status Badge */}
          <Badge variant={statusDisplay.variant} className="flex items-center gap-1 w-fit">
            {statusDisplay.icon}
            {statusDisplay.label}
          </Badge>

          {/* Reminder copy for upcoming */}
          {isUpcoming && (
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Please arrive 10 minutes early. Bring your NRC or passport for identification.
            </p>
          )}
        </div>

        {/* Join Meeting Button */}
        {isUpcoming && interview.mode === 'virtual' && meetingLink && (
          <div className="flex-shrink-0">
            <Button
              asChild
              variant="primary"
              className="min-h-touch"
            >
              <a
                href={meetingLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Video className="h-4 w-4 mr-2" />
                Join Meeting
                <ExternalLink className="h-3.5 w-3.5 ml-2" />
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
