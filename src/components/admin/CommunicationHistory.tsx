/**
 * Communication History Component
 * Displays the history of communications sent to an applicant
 * 
 * Requirements: 5.4 - Communication history tracking
 */

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Badge } from '@/components/ui'
import { Alert } from '@/components/ui/Alert'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Mail, MessageSquare, Phone, Clock, CheckCircle, XCircle, AlertCircle, User } from 'lucide-react'
// Types inlined after communicationService removal (legacy Supabase code)
interface CommunicationHistoryType {
  id: string
  applicant_id: string
  channel: 'email' | 'sms' | 'in-app'
  subject?: string
  message: string
  template?: string
  status: 'sent' | 'failed' | 'pending'
  sent_by: string
  sent_by_name?: string
  sent_at: string
  error_message?: string
}

// Stub functions — communication history requires backend migration to Neon
async function getCommunicationHistory(_applicantId: string): Promise<CommunicationHistoryType[]> {
  return []
}

async function getLastContactedAt(_applicantId: string): Promise<string | null> {
  return null
}
import { cn } from '@/lib/utils'

interface CommunicationHistoryProps {
  applicantId: string
  className?: string
}

export function CommunicationHistory({ applicantId, className }: CommunicationHistoryProps) {
  const [history, setHistory] = useState<CommunicationHistoryType[]>([])
  const [lastContacted, setLastContacted] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadHistory()
  }, [applicantId])

  const loadHistory = async () => {
    setLoading(true)
    setError(null)

    try {
      const [historyData, lastContactedData] = await Promise.all([
        getCommunicationHistory(applicantId),
        getLastContactedAt(applicantId)
      ])

      setHistory(historyData)
      setLastContacted(lastContactedData)
    } catch (err) {
      console.error('Error loading communication history:', err)
      setError('Failed to load communication history')
    } finally {
      setLoading(false)
    }
  }

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="w-4 h-4" />
      case 'sms':
        return <Phone className="w-4 h-4" />
      case 'in-app':
        return <MessageSquare className="w-4 h-4" />
      default:
        return null
    }
  }

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case 'email':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'sms':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'in-app':
        return 'text-purple-600 bg-purple-50 border-purple-200'
      default:
        return 'text-muted-foreground bg-gray-50 border-gray-200'
    }
  }

  const getStatusBadge = (status: string) => {
    const config = {
      sent: { icon: CheckCircle, color: 'bg-green-100 text-green-800 border-green-300', label: 'Sent' },
      failed: { icon: XCircle, color: 'bg-red-100 text-red-800 border-red-300', label: 'Failed' },
      pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: 'Pending' }
    }

    const { icon: Icon, color, label } = config[status as keyof typeof config] || config.pending

    return (
      <Badge variant="outline" className={cn('border', color)}>
        <Icon className="w-3 h-3 mr-1" />
        {label}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Communication History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Communication History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="error">
            <AlertCircle className="h-4 w-4" />
            <div className="ml-2">{error}</div>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Communication History
          </CardTitle>
          {lastContacted && (
            <div className="text-sm text-muted-foreground">
              Last contacted: {formatDate(lastContacted)}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <div className="ml-2">
              No communications have been sent to this applicant yet.
            </div>
          </Alert>
        ) : (
          <div className="space-y-4">
            {history.map((comm) => (
              <div
                key={comm.id}
                className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn('p-2 rounded-lg border', getChannelColor(comm.channel))}>
                      {getChannelIcon(comm.channel)}
                    </div>
                    <div>
                      <div className="font-medium text-sm capitalize">{comm.channel}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(comm.sent_at)}
                      </div>
                    </div>
                  </div>
                  {getStatusBadge(comm.status)}
                </div>

                {/* Subject (for emails) */}
                {comm.subject && (
                  <div className="mb-2">
                    <div className="text-sm font-medium text-foreground">
                      {comm.subject}
                    </div>
                  </div>
                )}

                {/* Message */}
                <div className="bg-muted/30 rounded-lg p-3 mb-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {comm.message}
                  </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>Sent by {comm.sent_by_name || 'Unknown'}</span>
                  </div>
                  {comm.template && (
                    <div className="flex items-center gap-1">
                      <span>Template: {comm.template}</span>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {comm.status === 'failed' && comm.error_message && (
                  <Alert variant="error" className="mt-3">
                    <AlertCircle className="h-4 w-4" />
                    <div className="ml-2 text-xs">
                      {comm.error_message}
                    </div>
                  </Alert>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
