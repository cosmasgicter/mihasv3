import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { FileText, Calendar, Clock, Plus } from 'lucide-react'
import { useToastStore } from '@/stores/toastStore'

interface ReportTemplate {
  id: string
  report_name: string
  report_type: string
  schedule_enabled: boolean
  schedule_frequency: string | null
  next_scheduled_at: string | null
  created_at: string
}

export function ReportTemplates() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTemplate, setNewTemplate] = useState({
    reportName: '',
    reportType: 'monthly',
    scheduleEnabled: false,
    scheduleFrequency: 'monthly'
  })
  const { addToast } = useToastStore()

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/reports/templates', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.reports || [])
      }
    } catch (error) {
      addToast({ type: 'error', message: 'Failed to load templates' })
    } finally {
      setLoading(false)
    }
  }

  const createTemplate = async () => {
    if (!newTemplate.reportName) {
      addToast({ type: 'error', message: 'Report name is required' })
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/reports/templates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newTemplate)
      })

      if (response.ok) {
        addToast({ type: 'success', message: 'Template created successfully' })
        setShowCreate(false)
        setNewTemplate({ reportName: '', reportType: 'monthly', scheduleEnabled: false, scheduleFrequency: 'monthly' })
        loadTemplates()
      } else {
        throw new Error('Failed to create template')
      }
    } catch (error) {
      addToast({ type: 'error', message: error.message })
    }
  }

  const toggleSchedule = async (reportId: string, enabled: boolean, frequency: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/reports/schedule', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reportId, scheduleEnabled: enabled, scheduleFrequency: frequency })
      })

      if (response.ok) {
        addToast({ type: 'success', message: `Schedule ${enabled ? 'enabled' : 'disabled'}` })
        loadTemplates()
      } else {
        throw new Error('Failed to update schedule')
      }
    } catch (error) {
      addToast({ type: 'error', message: error.message })
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading templates...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Report Templates</h3>
        <Button onClick={() => setShowCreate(!showCreate)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {showCreate && (
        <div className="bg-card p-4 rounded-lg border space-y-3">
          <input
            type="text"
            placeholder="Report Name"
            value={newTemplate.reportName}
            onChange={(e) => setNewTemplate({ ...newTemplate, reportName: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
          />
          <select
            value={newTemplate.reportType}
            onChange={(e) => setNewTemplate({ ...newTemplate, reportType: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="daily">Daily Report</option>
            <option value="weekly">Weekly Report</option>
            <option value="monthly">Monthly Report</option>
            <option value="regulatory">Regulatory Report</option>
          </select>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={newTemplate.scheduleEnabled}
              onChange={(e) => setNewTemplate({ ...newTemplate, scheduleEnabled: e.target.checked })}
              className="mr-2"
            />
            <span className="text-sm">Enable automatic scheduling</span>
          </label>
          {newTemplate.scheduleEnabled && (
            <select
              value={newTemplate.scheduleFrequency}
              onChange={(e) => setNewTemplate({ ...newTemplate, scheduleFrequency: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          )}
          <div className="flex gap-2">
            <Button onClick={createTemplate}>Create</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {templates.map((template) => (
          <div key={template.id} className="bg-card p-4 rounded-lg border">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold">{template.report_name}</h4>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Type: {template.report_type}
                </p>
                {template.schedule_enabled && (
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <Clock className="h-4 w-4" />
                    <span>Scheduled: {template.schedule_frequency}</span>
                    {template.next_scheduled_at && (
                      <span className="text-muted-foreground">
                        Next: {new Date(template.next_scheduled_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant={template.schedule_enabled ? 'secondary' : 'outline'}
                onClick={() => toggleSchedule(
                  template.id,
                  !template.schedule_enabled,
                  template.schedule_frequency || 'monthly'
                )}
              >
                <Calendar className="h-4 w-4 mr-2" />
                {template.schedule_enabled ? 'Disable' : 'Enable'} Schedule
              </Button>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No report templates yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  )
}
