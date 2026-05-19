import { useState } from 'react'
import { applicationService } from '@/services/applications'
import { logger } from '@/lib/logger'

interface StatusHistory {
  id: string
  status: string
  changed_by: string
  notes?: string
  created_at: string
}

export function useApplicationStatusHistory() {
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([])
  const [loading, setLoading] = useState(false)

  const fetchStatusHistory = async (applicationId: string) => {
    try {
      setLoading(true)
      const response = await applicationService.getSummary(applicationId)
      const history = Array.isArray(response?.status_history)
        ? (response.status_history as StatusHistory[])
        : []
      setStatusHistory(history.sort((a: StatusHistory, b: StatusHistory) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (error) {
      logger.error('Error fetching status history:', error)
      setStatusHistory([])
    } finally {
      setLoading(false)
    }
  }

  return {
    statusHistory,
    loading,
    fetchStatusHistory
  }
}
