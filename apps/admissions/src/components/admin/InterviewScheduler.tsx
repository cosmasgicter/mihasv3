import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/hooks/useToast'
import { Calendar, MapPin, Video } from 'lucide-react'
import { applicationService } from '@/services/applications'

interface InterviewSchedulerProps {
  applicationId: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function InterviewScheduler({ applicationId, onSuccess, onCancel }: InterviewSchedulerProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    scheduled_at: '',
    mode: 'in_person',
    location: '',
    notes: ''
  })
  const { addToast } = useToastStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await applicationService.scheduleInterview(applicationId, {
        scheduledAt: new Date(formData.scheduled_at).toISOString(),
        mode: formData.mode as 'in_person' | 'virtual' | 'phone',
        location: formData.location,
        notes: formData.notes || undefined,
      })

      addToast('success', 'Interview scheduled successfully')
      onSuccess?.()
    } catch (error) {
      addToast('error', 'Failed to schedule interview')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">
          <Calendar className="inline w-4 h-4 mr-1" />
          Date & Time
        </label>
        <input
          type="datetime-local"
          required
          value={formData.scheduled_at}
          onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Mode</label>
        <select
          value={formData.mode}
          onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="in_person">In-Person</option>
          <option value="virtual">Virtual</option>
          <option value="phone">Phone</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          {formData.mode === 'virtual' ? <Video className="inline w-4 h-4 mr-1" /> : <MapPin className="inline w-4 h-4 mr-1" />}
          {formData.mode === 'virtual' ? 'Meeting Link' : 'Location'}
        </label>
        <input
          type="text"
          required
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          placeholder={formData.mode === 'virtual' ? 'https://meet.google.com/...' : 'Room 101, Admin Block'}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Notes (Optional)</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border rounded-lg"
          placeholder="Additional instructions..."
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Scheduling...' : 'Schedule Interview'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
