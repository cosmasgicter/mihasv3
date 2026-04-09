import { Calendar, Clock, MapPin, Video, Phone } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Interview {
  id: string
  scheduled_at: string
  mode: string
  location: string
  status: string
  notes?: string
}

interface InterviewDetailsProps {
  interview: Interview
}

function isMeetingLink(value?: string | null) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}

export function InterviewDetails({ interview }: InterviewDetailsProps) {
  const getIcon = () => {
    switch (interview.mode) {
      case 'virtual': return <Video className="w-5 h-5 text-primary" />
      case 'phone': return <Phone className="w-5 h-5 text-primary" />
      default: return <MapPin className="w-5 h-5 text-primary" />
    }
  }

  const getStatusColor = () => {
    switch (interview.status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-foreground'
    }
  }

  const meetingLink = isMeetingLink(interview.location) ? interview.location : null

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Interview Scheduled
        </h3>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor()}`}>
          {interview.status.toUpperCase()}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="font-medium">Date & Time</p>
            <p className="text-sm text-muted-foreground">{formatDate(interview.scheduled_at)}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          {getIcon()}
          <div>
            <p className="font-medium">{interview.mode === 'virtual' ? 'Meeting Link' : 'Location'}</p>
            {interview.mode === 'virtual' ? (
              meetingLink ? (
                <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                  {meetingLink}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">Meeting link will be shared by admissions.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">{interview.location || 'Location to be confirmed'}</p>
            )}
          </div>
        </div>

        {interview.notes && (
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm font-medium mb-1">Additional Notes</p>
            <p className="text-sm text-muted-foreground">{interview.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
