import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/components/ui/Toast'
import { Calendar, Clock, MapPin, Video, X } from 'lucide-react'

interface InterviewSchedulerProps {
  applicationId: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function InterviewScheduler({ applicationId, onSuccess, onCancel }: InterviewSchedulerProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    scheduled_at: '',
    mode: 'in-person',
    location: '',
    notes: ''
  })
  const { addToast } = useToastStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/applications/${applicationId}/interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) throw new Error('Failed to schedule interview')

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
          <option value="in-person">In-Person</option>
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
