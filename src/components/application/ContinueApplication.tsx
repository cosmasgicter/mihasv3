import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { applicationSessionManager } from '@/lib/applicationSession'
import { formatDate } from '@/lib/utils'
import { FileText, Clock, AlertTriangle, Trash2, RefreshCw } from 'lucide-react'

interface DraftInfo {
  exists: boolean
  step?: number
  lastSaved?: string
  progress?: string
  expiresAt?: string
}

export function ContinueApplication() {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const [draftInfo, setDraftInfo] = useState<DraftInfo>({ exists: false })
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())

  useEffect(() => {
    if (user) {
      loadDraftInfo()
    }
  }, [user])

  // Update timer every minute
  useEffect(() => {
    if (!draftInfo.exists || !draftInfo.expiresAt) return

    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [draftInfo.exists, draftInfo.expiresAt])

  const loadDraftInfo = async () => {
    if (!user) return
    
    try {
      setLoading(true)
      const info = await applicationSessionManager.getDraftInfo(profile?.user_id || user.id)
      setDraftInfo(info)
    } catch (error) {
      console.error('Error loading draft info:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDraft = async () => {
    if (!user || !confirm('Are you sure you want to delete your saved draft? This action cannot be undone.')) {
      return
    }

    try {
      setDeleting(true)
      await applicationSessionManager.deleteDraft(profile?.user_id || user.id)
      setDraftInfo({ exists: false })
    } catch (error) {
      console.error('Error deleting draft:', error)
    } finally {
      setDeleting(false)
    }
  }

  const isExpiringSoon = () => {
    if (!draftInfo.expiresAt) return false
    const expiryTime = new Date(draftInfo.expiresAt).getTime()
    const hoursUntilExpiry = (expiryTime - currentTime) / (1000 * 60 * 60)
    return hoursUntilExpiry < 2 // Less than 2 hours
  }

  const getTimeUntilExpiry = () => {
    if (!draftInfo.expiresAt) return ''
    const expiryTime = new Date(draftInfo.expiresAt).getTime()
    const msUntilExpiry = expiryTime - currentTime
    
    if (msUntilExpiry <= 0) return 'Expired'
    
    const hours = Math.floor(msUntilExpiry / (1000 * 60 * 60))
    const minutes = Math.floor((msUntilExpiry % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-3">
          <RefreshCw className="h-5 w-5 text-gray-400 animate-spin" />
          <span className="text-gray-600">Checking for saved applications...</span>
        </div>
      </div>
    )
  }

  if (!draftInfo.exists) {
    return (
      <div className="bg-primary border border-primary/20 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-primary mb-2">
              Ready to Apply?
            </h2>
            <p className="text-primary">
              Start your application to join programs at Kalulushi Training Centre or Mukuba Institute of Health and Applied Sciences
            </p>
          </div>
          <Link to="/student/application-wizard">
            <Button className="bg-primary hover:bg-primary">
              <FileText className="h-4 w-4 mr-2" />
              Start New Application
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={`border rounded-lg p-6 ${
      isExpiringSoon() ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-3">
            <FileText className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-semibold text-gray-900">
              Continue Your Application
            </h2>
            {isExpiringSoon() && (
              <div className="flex items-center space-x-1 text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Expiring Soon</span>
              </div>
            )}
          </div>

          <div className="space-y-2 text-sm text-gray-600 mb-4">
            <div className="flex items-center justify-between">
              <span>Progress:</span>
              <span className="font-medium">{draftInfo.progress}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Last saved:</span>
              <span className="font-medium">
                {draftInfo.lastSaved ? formatDate(draftInfo.lastSaved) : 'Unknown'}
              </span>
            </div>
            
            {draftInfo.expiresAt && (
              <div className="flex items-center justify-between">
                <span>Expires in:</span>
                <span className={`font-medium ${
                  isExpiringSoon() ? 'text-yellow-600' : 'text-gray-900'
                }`}>
                  {getTimeUntilExpiry()}
                </span>
              </div>
            )}
          </div>

          {isExpiringSoon() && (
            <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3 mb-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  Your draft will expire soon. Continue your application to save your progress.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex space-x-3 ml-6">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteDraft}
            disabled={deleting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            {deleting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
          
          <Link to="/student/application-wizard" state={{ continueApplication: true }}>
            <Button className="bg-primary hover:bg-primary">
              <FileText className="h-4 w-4 mr-2" />
              Continue Application
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}