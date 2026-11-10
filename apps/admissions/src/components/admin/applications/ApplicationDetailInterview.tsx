import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { formatTimestamp } from '@/lib/dateFormat'
import { Calendar, Clock, Users, CheckCircle, XCircle } from 'lucide-react'
import type { ApplicationInterview } from '@/types/database'
import type { ApplicationWithDetails, ApplicationDetailResponse } from './applicationDetailTypes'

/**
 * Interview scheduling inside the review workspace (task 9.4, R8.3/R8.4).
 *
 * The three write paths used to be issued here through
 * `applicationService.scheduleInterview` / `rescheduleInterview` /
 * `cancelInterview` — unversioned, and offered to any actor who could open the
 * workspace. Both are now the workspace's: `canManage` is the server's own
 * `tenant.application.review` answer for this school, and each command carries
 * the version the workspace was read at, so an interview cannot be moved from a
 * view that has since been superseded.
 *
 * The component keeps its form and its own copy of the pending edit; it no longer
 * keeps its own copy of the *answer*. After a command the workspace refetches and
 * the current interview arrives from the one read.
 */
interface ApplicationDetailInterviewProps {
  application: ApplicationWithDetails
  applicationData: ApplicationDetailResponse | null
  /** `tenant.application.review` for this application's school. */
  canManage?: boolean
  /** True while a workspace command is in flight. */
  busy?: boolean
  /** Schedule a new interview. Resolves `true` when the server accepted it. */
  onSchedule?: (input: {
    scheduled_at: string
    mode: string
    location?: string
    notes?: string
  }) => Promise<boolean>
  /** Update the latest interview. */
  onUpdate?: (input: {
    scheduled_at: string
    mode: string
    location?: string
    notes?: string
  }) => Promise<boolean>
  /** Cancel the latest interview. */
  onCancel?: (input: { notes?: string }) => Promise<boolean>
}

const formatDateTimeLocal = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16)
}

const formatInterviewDateTime = (value?: string | null) => {
  if (!value) return 'Not scheduled'
  const result = formatTimestamp(value)
  return result === 'Not available' ? 'Not scheduled' : result
}

const formatInterviewModeLabel = (mode?: string | null) => {
  switch (mode) {
    case 'in_person': return 'In person'
    case 'virtual': return 'Virtual'
    case 'phone': return 'Phone'
    default: return mode || 'Not specified'
  }
}

const formatInterviewStatus = (status?: string | null) => {
  if (!status) return 'Not scheduled'
  return status.replace(/_/g, ' ')
}

export function ApplicationDetailInterview({
  applicationData,
  canManage = false,
  busy = false,
  onSchedule,
  onUpdate,
  onCancel,
}: ApplicationDetailInterviewProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [form, setForm] = useState({ scheduledAt: '', mode: 'in_person' as ApplicationInterview['mode'], location: '', notes: '' })

  const currentInterview = applicationData?.interview || applicationData?.application?.interview || null
  const hasActive = Boolean(currentInterview && currentInterview.status !== 'cancelled')

  useEffect(() => {
    if (!currentInterview || currentInterview.status === 'cancelled') {
      setForm(prev => ({ ...prev, scheduledAt: '', location: '', notes: '' }))
      return
    }
    setForm({
      scheduledAt: formatDateTimeLocal(currentInterview.scheduled_at),
      mode: currentInterview.mode,
      location: currentInterview.location || '',
      notes: currentInterview.notes || ''
    })
  }, [currentInterview?.id, currentInterview?.status, currentInterview?.scheduled_at])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canManage || !onSchedule || !onUpdate) return
    if (!form.scheduledAt) { setNotice({ type: 'error', message: 'Please select an interview date and time.' }); return }
    const scheduledIso = new Date(form.scheduledAt)
    if (Number.isNaN(scheduledIso.getTime())) {
      setNotice({ type: 'error', message: 'Invalid interview date provided.' })
      return
    }
    setIsSaving(true); setNotice(null)
    try {
      const payload = {
        scheduled_at: scheduledIso.toISOString(),
        mode: form.mode,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }
      const shouldSchedule = !currentInterview || currentInterview.status === 'cancelled'
      const ok = shouldSchedule ? await onSchedule(payload) : await onUpdate(payload)
      // The workspace reports its own outcome (a toast, and a refetch on either
      // a success or a version conflict). This notice is the in-panel echo, and
      // it never claims a success the command did not report.
      if (ok) {
        setNotice({
          type: 'success',
          message: shouldSchedule ? 'Interview scheduled successfully.' : 'Interview updated successfully.',
        })
      }
    } finally { setIsSaving(false) }
  }

  const handleCancel = async () => {
    if (!canManage || !onCancel) return
    if (!currentInterview || currentInterview.status === 'cancelled') { setNotice({ type: 'error', message: 'No active interview to cancel.' }); return }
    setIsCancelling(true); setNotice(null)
    try {
      const ok = await onCancel({ notes: form.notes.trim() || undefined })
      if (ok) setNotice({ type: 'success', message: 'Interview cancelled successfully.' })
    } finally { setIsCancelling(false) }
  }

  const handleFieldChange = (field: 'scheduledAt' | 'mode' | 'location' | 'notes') =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(prev => ({ ...prev, [field]: event.target.value }))
    }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Interview overview
        </h3>
        {hasActive ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-foreground">Scheduled for</p>
                <p className="text-base font-medium text-foreground">{formatInterviewDateTime(currentInterview?.scheduled_at)}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-muted p-4">
                <p className="text-sm text-primary uppercase tracking-wide">Mode</p>
                <p className="text-lg font-semibold text-foreground">{formatInterviewModeLabel(currentInterview?.mode)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted p-4">
                <p className="text-sm text-primary uppercase tracking-wide">Status</p>
                <p className="text-lg font-semibold text-foreground capitalize">{formatInterviewStatus(currentInterview?.status)}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Location / Link</p>
                <p className="text-base text-foreground">{currentInterview?.location || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Notes</p>
                <p className="text-base text-foreground">{currentInterview?.notes || 'No additional notes recorded.'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-foreground" />
            <p className="text-base font-medium text-foreground mb-1">No interview scheduled yet</p>
            <p className="text-sm text-foreground">Use the form below to schedule and notify the applicant about their interview.</p>
          </div>
        )}
      </div>

      {!canManage ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Manage interview schedule
          </h3>
          <p
            className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
            data-testid="interview-read-only"
          >
            You have read access to this interview. Scheduling, rescheduling, or cancelling it
            requires the review permission for this school.
          </p>
        </div>
      ) : (
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Manage interview schedule
        </h3>

        {notice && (
          <div className={`p-4 mb-4 rounded-lg border ${notice.type === 'success' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
            {notice.message}
          </div>
        )}

        <form onSubmit={event => { void handleSubmit(event) }} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="interview-scheduled-at">Interview date &amp; time</label>
              <input id="interview-scheduled-at" type="datetime-local" value={form.scheduledAt} onChange={handleFieldChange('scheduledAt')} className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="interview-mode">Interview mode</label>
              <select id="interview-mode" value={form.mode} onChange={handleFieldChange('mode')} className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring">
                <option value="in_person">In person</option>
                <option value="virtual">Virtual</option>
                <option value="phone">Phone</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="interview-location">Location / meeting link</label>
            <input id="interview-location" type="text" value={form.location} onChange={handleFieldChange('location')} placeholder={form.mode === 'virtual' ? 'Zoom/Teams link' : 'Campus room or venue'} className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="interview-notes">Notes for applicant</label>
            <textarea id="interview-notes" value={form.notes} onChange={handleFieldChange('notes')} rows={4} className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring" placeholder="Add preparation details, required documents or virtual meeting instructions" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              loading={isSaving}
              disabled={busy}
              data-testid="interview-save"
              className="flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              {hasActive ? 'Update interview' : 'Schedule interview'}
            </Button>
            {hasActive && (
              <Button type="button" variant="outline" loading={isCancelling} disabled={busy} data-testid="interview-cancel" onClick={() => { void handleCancel() }} className="text-destructive border-destructive/30 hover:bg-destructive/5">
                <XCircle className="h-4 w-4 mr-2" />
                Cancel interview
              </Button>
            )}
          </div>
        </form>
      </div>
      )}
    </div>
  )
}
