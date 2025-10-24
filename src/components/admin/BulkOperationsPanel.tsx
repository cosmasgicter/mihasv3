import React, { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Mail, RefreshCw, Download, Upload } from 'lucide-react'
import { useToastStore } from '@/stores/toastStore'

export function BulkOperationsPanel() {
  const [loading, setLoading] = useState(false)
  const [emailData, setEmailData] = useState({ subject: '', message: '', userIds: [] as string[] })
  const [statusData, setStatusData] = useState({ status: 'pending', applicationIds: [] as string[] })
  const { addToast } = useToastStore()

  const handleBulkEmail = async () => {
    if (!emailData.subject || !emailData.message || !emailData.userIds.length) {
      addToast({ type: 'error', message: 'Please fill all fields and select users' })
      return
    }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/batch/email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      })

      const result = await response.json()
      if (response.ok) {
        addToast({ 
          type: 'success', 
          message: `Sent ${result.success} emails. ${result.failed} failed.` 
        })
        setEmailData({ subject: '', message: '', userIds: [] })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      addToast({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleBulkStatusUpdate = async () => {
    if (!statusData.applicationIds.length) {
      addToast({ type: 'error', message: 'Please select applications' })
      return
    }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/batch/status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(statusData)
      })

      const result = await response.json()
      if (response.ok) {
        addToast({ 
          type: 'success', 
          message: `Updated ${result.success} applications. ${result.failed} failed.` 
        })
        setStatusData({ status: 'pending', applicationIds: [] })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      addToast({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/batch/export', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `users-export-${Date.now()}.csv`
        a.click()
        addToast({ type: 'success', message: 'Export completed' })
      } else {
        throw new Error('Export failed')
      }
    } catch (error) {
      addToast({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Bulk Email
        </h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Subject"
            value={emailData.subject}
            onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
          />
          <textarea
            placeholder="Message"
            value={emailData.message}
            onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
            className="w-full px-3 py-2 border rounded-md h-24"
          />
          <Button onClick={handleBulkEmail} loading={loading}>
            <Mail className="h-4 w-4 mr-2" />
            Send Bulk Email
          </Button>
        </div>
      </div>

      <div className="bg-card p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Bulk Status Update
        </h3>
        <div className="space-y-3">
          <select
            value={statusData.status}
            onChange={(e) => setStatusData({ ...statusData, status: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <Button onClick={handleBulkStatusUpdate} loading={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Update Status
          </Button>
        </div>
      </div>

      <div className="bg-card p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export Users
        </h3>
        <Button onClick={handleExport} loading={loading}>
          <Download className="h-4 w-4 mr-2" />
          Export to CSV
        </Button>
      </div>
    </div>
  )
}
