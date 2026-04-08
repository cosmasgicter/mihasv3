/**
 * Interview Page
 * 
 * Displays scheduled interviews for the student's applications.
 * Shows upcoming and past interviews with details like date, time, mode, and location.
 * 
 * @requirements 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.2, 6.3, 6.4
 */

import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, formatTimestamp } from '@/lib/dateFormat'
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Video, 
  Phone, 
  Users,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { PageShell } from '@/components/ui/PageShell'
import { Skeleton } from '@/components/ui/skeleton'
import { interviewsService } from '@/services/interviews'
import { useAuth } from '@/contexts/AuthContext'

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

interface InterviewPageState {
  loading: boolean
  error: string | null
  interviews: Interview[]
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
function extractMeetingLink(notes: string | null): string | null {
  if (!notes) return null
  
  // Common patterns for meeting links
  const urlPatterns = [
    /https?:\/\/[^\s]+zoom[^\s]*/i,
    /https?:\/\/[^\s]+teams[^\s]*/i,
    /https?:\/\/[^\s]+meet\.google[^\s]*/i,
    /https?:\/\/[^\s]+webex[^\s]*/i,
    /https?:\/\/[^\s]+/i // Generic URL fallback
  ]
  
  for (const pattern of urlPatterns) {
    const match = notes.match(pattern)
    if (match) return match[0]
  }
  
  return null
}

/**
 * Formats date and time for display
 * @requirements 4.1 - Display scheduled_at date and time
 */
function formatDateTime(dateString: string): { date: string; time: string } {
  return {
    date: formatDate(dateString),
    time: formatTimestamp(dateString),
  }
}

export default function InterviewPage() {
  const { user } = useAuth()
  const [state, setState] = useState<InterviewPageState>({
    loading: true,
    error: null,
    interviews: []
  })

  useEffect(() => {
    async function fetchInterviews() {
      if (!user?.id) {
        setState(prev => ({ ...prev, loading: false }))
        return
      }

      try {
        setState(prev => ({ ...prev, error: null }))
        
        // @requirements 3.2 - Query application_interviews for the student's applications
        // Uses interviewsService which auto-unwraps the API envelope
        const data = await interviewsService.list()

        // Transform data to match Interview interface
        const interviews: Interview[] = (data?.interviews || []).map((item) => ({
          id: item.id,
          scheduled_at: item.scheduled_at,
          mode: item.mode,
          location: item.location,
          status: item.status,
          notes: item.notes,
          application_id: item.application_id,
          program_name: item.program || null
        }))

        setState(prev => ({ ...prev, interviews, loading: false }))
      } catch (err) {
        console.error('Error fetching interviews:', err)
        // @requirements 6.2 - Display error message on failure
        setState(prev => ({
          ...prev,
          error: 'Failed to load interview information. Please try again.',
          loading: false
        }))
      }
    }

    fetchInterviews()
  }, [user?.id])

  // @requirements 4.6 - Separate upcoming interviews from past interviews
  const { upcomingInterviews, pastInterviews } = useMemo(() => {
    const now = new Date()
    const upcoming: Interview[] = []
    const past: Interview[] = []

    state.interviews.forEach(interview => {
      const interviewDate = new Date(interview.scheduled_at)
      if (interviewDate >= now) {
        upcoming.push(interview)
      } else {
        past.push(interview)
      }
    })

    // Sort upcoming by date ascending, past by date descending
    upcoming.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    past.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())

    return { upcomingInterviews: upcoming, pastInterviews: past }
  }, [state.interviews])

  // @requirements 6.3 - Display loading spinner
  if (state.loading) {
    return (
      <PageShell title="Interview Schedule" subtitle="Loading interview information...">
        <div className="space-y-6" role="status" aria-label="Loading interview information">
          <div className="rounded-xl border border-primary/20 bg-card p-6">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="mt-6 space-y-4">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="rounded-xl border border-border bg-background p-4">
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
    )
  }

  return (
    <PageShell
      title="Interview Schedule"
      subtitle="View your scheduled interviews and prepare for your admission process."
    >
        {/* @requirements 3.5 - Back to Dashboard navigation link */}
        <div className="mb-6">
          <Link 
            to="/student/dashboard" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Link>
        </div>

        {/* Error Display */}
        {/* @requirements 6.2 - Display error message on failure */}
        {state.error && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p>{state.error}</p>
              </div>
            </CardContent>
          </Card>
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
          {state.interviews.length === 0 && !state.error && (
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Scheduled Interviews</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    You don't have any interviews scheduled yet. Once your application is reviewed,
                    you'll receive an interview invitation.
                  </p>
                  <Link to="/student/dashboard">
                    <Button variant="outline">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Return to Dashboard
                    </Button>
                  </Link>
                </div>
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
  const meetingLink = interview.mode === 'virtual' ? extractMeetingLink(interview.notes) : null

  return (
    <div 
      className={`p-4 rounded-lg border transition-colors ${
        isUpcoming 
          ? 'border-primary/30 bg-primary/5 hover:bg-primary/10' 
          : 'border-border bg-card hover:bg-muted/50'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Program Name */}
          <p className="font-medium text-foreground truncate mb-2">
            {interview.program_name || 'Application Interview'}
          </p>
          
          {/* Date and Time */}
          {/* @requirements 4.1 - Display scheduled_at date and time */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            <span>{date}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>{time}</span>
          </div>

          {/* Mode and Location */}
          {/* @requirements 4.2 - Show interview mode */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="inline-flex items-center gap-1.5 text-sm bg-secondary/50 px-2 py-1 rounded">
              {getModeIcon(interview.mode)}
              <span>{getModeLabel(interview.mode)}</span>
            </div>
            
            {/* @requirements 4.4 - Display location for in_person interviews */}
            {interview.mode === 'in_person' && interview.location && (
              <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span>{interview.location}</span>
              </div>
            )}
          </div>

          {/* Status Badge */}
          {/* @requirements 4.5 - Show interview status */}
          <Badge variant={statusDisplay.variant} className="flex items-center gap-1 w-fit">
            {statusDisplay.icon}
            {statusDisplay.label}
          </Badge>
        </div>

        {/* Join Meeting Button */}
        {/* @requirements 4.3 - Show Join Meeting button for virtual interviews */}
        {isUpcoming && interview.mode === 'virtual' && meetingLink && (
          <div className="flex-shrink-0">
            <a 
              href={meetingLink} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90">
                <Video className="h-4 w-4 mr-2" />
                Join Meeting
                <ExternalLink className="h-3.5 w-3.5 ml-2" />
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
