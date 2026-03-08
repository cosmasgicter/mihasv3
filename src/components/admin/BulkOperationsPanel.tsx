import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Mail, RefreshCw, Download } from 'lucide-react'
import { useToastStore } from '@/components/ui/Toast'
import { apiClient } from '@/services/client'

export function BulkOperationsPanel() {
  const [loading, setLoading] = useState(false)
  const [emailData, setEmailData] = useState({ subject: '', message: '', userIds: [] as string[] })
  const [statusData, setStatusData] = useState({ status: 'submitted', applicationIds: [] as string[] })
  const toast = useToastStore()

  const handleBulkEmail = async () => {
    if (!emailData.subject || !emailData.message || !emailData.userIds.length) {
      toast.error('Please fill all fields and select users')
      return
    }

    setLoading(true)
    try {
      const result = await apiClient.request<{ success?: number; failed?: number; errors?: string[] }>('/admin?action=bulk-email', {
        method: 'POST',
        body: JSON.stringify(emailData)
      })
      toast.success(`Sent ${result?.success ?? 0} emails. ${result?.failed ?? 0} failed.`)
      setEmailData({ subject: '', message: '', userIds: [] })
    } catch (error: any) {
      toast.error(error.message || 'Failed to send emails')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkStatusUpdate = async () => {
    if (!statusData.applicationIds.length) {
      toast.error('Please select applications')
      return
    }

    setLoading(true)
    try {
      const result = await apiClient.request<{ success?: number; failed?: number; errors?: string[] }>('/admin?action=bulk-status', {
        method: 'POST',
        body: JSON.stringify(statusData)
      })
      toast.success(`Updated ${result?.success ?? 0} applications. ${result?.failed ?? 0} failed.`)
      setStatusData({ status: 'submitted', applicationIds: [] })
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin?action=export-users', {
        credentials: 'include'
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `users-export-${Date.now()}.csv`
        a.click()
        toast.success('Export completed')
      } else {
        throw new Error('Export failed')
      }
    } catch (error: any) {
      toast.error(error.message || 'Export failed')
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
            <option value="submitted">Submitted</option>
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
