import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { formatTimestamp } from '@/lib/dateFormat'
import { Calendar, Clock, Users, CheckCircle, XCircle } from 'lucide-react'
import { applicationService } from '@/services/applications'
import type { ApplicationInterview } from '@/types/database'
import type { ApplicationWithDetails, ApplicationDetailResponse } from './applicationDetailTypes'

interface ApplicationDetailInterviewProps {
  application: ApplicationWithDetails
  applicationData: ApplicationDetailResponse | null
  onApplicationDataChange: (data: ApplicationDetailResponse) => void
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

export function ApplicationDetailInterview({ application, applicationData, onApplicationDataChange }: ApplicationDetailInterviewProps) {
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

  const updateState = (updated: ApplicationInterview) => {
    if (!applicationData) return
    const next = {
      ...applicationData,
      interview: updated,
      application: { ...applicationData.application, interview: updated }
    }
    onApplicationDataChange(next)
    setForm({ scheduledAt: formatDateTimeLocal(updated.scheduled_at), mode: updated.mode, location: updated.location || '', notes: updated.notes || '' })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.scheduledAt) { setNotice({ type: 'error', message: 'Please select an interview date and time.' }); return }
    try {
      setIsSaving(true); setNotice(null)
      const scheduledIso = new Date(form.scheduledAt)
      if (Number.isNaN(scheduledIso.getTime())) throw new Error('Invalid interview date provided.')
      const payload = { scheduledAt: scheduledIso.toISOString(), mode: form.mode, location: form.location.trim() || undefined, notes: form.notes.trim() || undefined }
      const shouldSchedule = !currentInterview || currentInterview.status === 'cancelled'
      const result = shouldSchedule
        ? await applicationService.scheduleInterview(application.id, payload)
        : await applicationService.rescheduleInterview(application.id, payload)
      if (!result) throw new Error('No interview data was returned by the server.')
      updateState(result)
      setNotice({ type: 'success', message: shouldSchedule ? 'Interview scheduled successfully.' : 'Interview updated successfully.' })
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save interview details.' })
    } finally { setIsSaving(false) }
  }

  const handleCancel = async () => {
    if (!currentInterview || currentInterview.status === 'cancelled') { setNotice({ type: 'error', message: 'No active interview to cancel.' }); return }
    try {
      setIsCancelling(true); setNotice(null)
      const result = await applicationService.cancelInterview(application.id, { notes: form.notes.trim() || undefined })
      if (!result) throw new Error('Interview cancellation did not return updated details.')
      updateState(result)
      setNotice({ type: 'success', message: 'Interview cancelled successfully.' })
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Failed to cancel interview.' })
    } finally { setIsCancelling(false) }
  }

  const handleFieldChange = (field: 'scheduledAt' | 'mode' | 'location' | 'notes') =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(prev => ({ ...prev, [field]: event.target.value }))
    }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-white p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Interview Overview
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
              <div className="rounded-lg border border-border bg-slate-50 p-4">
                <p className="text-sm text-primary uppercase tracking-wide">Mode</p>
                <p className="text-lg font-semibold text-foreground">{formatInterviewModeLabel(currentInterview?.mode)}</p>
              </div>
              <div className="rounded-lg border border-border bg-slate-50 p-4">
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

      <div className="rounded-lg border border-border bg-white p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Manage Interview Schedule
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
            <Button type="submit" loading={isSaving} className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {hasActive ? 'Update interview' : 'Schedule interview'}
            </Button>
            {hasActive && (
              <Button type="button" variant="outline" loading={isCancelling} onClick={() => { void handleCancel() }} className="text-destructive border-destructive/30 hover:bg-destructive/5">
                <XCircle className="h-4 w-4 mr-2" />
                Cancel interview
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
