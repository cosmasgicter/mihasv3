import { useState } from 'react'
import { useBulkOperations } from '@/hooks/useBulkOperations'
import { exportToCSV, exportToExcel } from '@/lib/exportUtils'

interface ApplicationSummary {
  id: string
  [key: string]: any
}

export function useApplicationBulkActions() {
  const [selectedApplications, setSelectedApplications] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const { bulkUpdateStatus, bulkUpdatePaymentStatus } = useBulkOperations()

  const toggleSelection = (id: string) => {
    setSelectedApplications(prev => 
      prev.includes(id) 
        ? prev.filter(appId => appId !== id)
        : [...prev, id]
    )
  }

  const selectAll = (applicationIds: string[]) => {
    setSelectedApplications(
      selectedApplications.length === applicationIds.length ? [] : applicationIds
    )
  }

  const clearSelection = () => setSelectedApplications([])

  const performBulkStatusUpdate = async (status: string) => {
    if (selectedApplications.length === 0) return
    
    try {
      setLoading(true)
      await bulkUpdateStatus(selectedApplications, status)
      clearSelection()
    } catch (error) {
      console.error('Bulk status update failed:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const performBulkPaymentUpdate = async (paymentStatus: string) => {
    if (selectedApplications.length === 0) return
    
    try {
      setLoading(true)
      await bulkUpdatePaymentStatus(selectedApplications, paymentStatus)
      clearSelection()
    } catch (error) {
      console.error('Bulk payment update failed:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const exportApplications = async (applications: ApplicationSummary[], format: 'csv' | 'excel') => {
    const dataToExport = applications.map(app => ({
      ...app,
      submitted_at: app.submitted_at || app.created_at,
      paid_amount: app.paid_amount || 0,
      average_grade: app.average_grade || 0,
      age: app.age || 0,
      days_since_submission: app.days_since_submission || 0
    }))

    const filename = `applications_${new Date().toISOString().split('T')[0]}`

    if (format === 'csv') {
      await exportToCSV(dataToExport, `${filename}.csv`)
    } else {
      await exportToExcel(dataToExport, `${filename}.xlsx`)
    }
  }

  return {
    selectedApplications,
    loading,
    toggleSelection,
    selectAll,
    clearSelection,
    performBulkStatusUpdate,
    performBulkPaymentUpdate,
    exportApplications
  }
}