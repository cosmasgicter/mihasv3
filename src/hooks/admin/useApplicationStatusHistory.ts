import { useState } from 'react'
import { applicationService } from '@/services/applications'

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
      const response = await applicationService.getById(applicationId, { include: ['statusHistory'] })
      const history = response.statusHistory || []
      setStatusHistory(history.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (error) {
      console.error('Error fetching status history:', error)
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