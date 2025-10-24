import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/components/ui/Toast'

export function WorkflowRuleForm({ onSuccess }: { onSuccess?: () => void }) {
  const [rule, setRule] = useState({
    name: '',
    trigger_event: 'status_changed',
    conditions: [],
    actions: [],
    enabled: true,
    priority: 0
  })
  const [loading, setLoading] = useState(false)
  const { addToast } = useToastStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/workflows/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
      })

      if (!response.ok) throw new Error('Failed to create rule')

      addToast('success', 'Workflow rule created')
      onSuccess?.()
    } catch (error) {
      addToast('error', 'Failed to create rule')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Rule Name</label>
        <input
          type="text"
          required
          value={rule.name}
          onChange={(e) => setRule({ ...rule, name: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
          placeholder="Auto-approve high scores"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Trigger Event</label>
        <select
          value={rule.trigger_event}
          onChange={(e) => setRule({ ...rule, trigger_event: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="application_submitted">Application Submitted</option>
          <option value="status_changed">Status Changed</option>
          <option value="payment_verified">Payment Verified</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Priority</label>
        <input
          type="number"
          value={rule.priority}
          onChange={(e) => setRule({ ...rule, priority: parseInt(e.target.value) })}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
          className="w-4 h-4"
        />
        <label className="text-sm">Enabled</label>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Rule'}
      </Button>
    </form>
  )
}
