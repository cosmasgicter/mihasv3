/**
 * Notification Preferences Hook
 * Provides state management and operations for user notification preferences
 * Implements Requirements 6.2: Respect user consent settings for each notification channel
 */

import { useState, useEffect, useCallback } from 'react'
import { notificationService } from '@/services/notifications'
import { useAuth } from './useAuth'
import { toast } from './useToast'
import type { NotificationPreferences, PreferenceAuditEntry, ConsentStatus } from '@/types/notifications'

interface UseNotificationPreferencesReturn {
  preferences: NotificationPreferences | null
  auditTrail: PreferenceAuditEntry[]
  loading: boolean
  saving: boolean
  error: string | null
  
  // Actions
  loadPreferences: () => Promise<void>
  updateChannelConsent: (channel: string, enabled: boolean, reason?: string) => Promise<boolean>
  updateMultipleChannels: (channels: Record<string, boolean>, reason?: string) => Promise<boolean>
  updateQuietHours: (start: string, end: string, timezone: string, reason?: string) => Promise<boolean>
  checkChannelStatus: (channel: string) => Promise<ConsentStatus | null>
  exportPreferences: () => Promise<void>
  revokeAllConsents: (reason?: string) => Promise<boolean>
  
  // Utilities
  isChannelEnabled: (channel: string) => boolean
  isWithinQuietHours: () => boolean
  getConsentDate: (channel: string) => Date | null
}

export function useNotificationPreferences(): UseNotificationPreferencesReturn {
  const { user } = useAuth()
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [auditTrail, setAuditTrail] = useState<PreferenceAuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load preferences from API
  const loadPreferences = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)
      
      const response = await notificationService.getPreferences(true, 50)
      
      if (response.success) {
        setPreferences(response.preferences)
        setAuditTrail(response.audit_trail || [])
      } else {
        setError(response.error || 'Failed to load preferences')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load preferences'
      setError(errorMessage)
      console.error('Error loading preferences:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Update consent for a single channel
  const updateChannelConsent = useCallback(async (
    channel: string, 
    enabled: boolean, 
    reason?: string
  ): Promise<boolean> => {
    if (!user) return false

    try {
      setSaving(true)
      setError(null)
      
      const response = await notificationService.updatePreferences({
        action: 'update_channel',
        channel,
        enabled,
        reason: reason || `User ${enabled ? 'enabled' : 'disabled'} ${channel} notifications`
      })

      if (response.success) {
        setPreferences(response.preferences)
        
        toast({
          title: 'Preferences Updated',
          description: `${channel} notifications ${enabled ? 'enabled' : 'disabled'}`,
          variant: 'success'
        })
        
        // Reload to get updated audit trail
        await loadPreferences()
        return true
      } else {
        setError(response.error || 'Failed to update preferences')
        toast({
          title: 'Error',
          description: response.error || 'Failed to update preferences',
          variant: 'destructive'
        })
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update preferences'
      setError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
      return false
    } finally {
      setSaving(false)
    }
  }, [user, loadPreferences])

  // Update multiple channels at once
  const updateMultipleChannels = useCallback(async (
    channels: Record<string, boolean>, 
    reason?: string
  ): Promise<boolean> => {
    if (!user) return false

    try {
      setSaving(true)
      setError(null)
      
      const response = await notificationService.updatePreferences({
        action: 'update_multiple_channels',
        channels,
        reason: reason || 'Bulk channel preference update'
      })

      if (response.success) {
        setPreferences(response.preferences)
        
        toast({
          title: 'Preferences Updated',
          description: 'Multiple channel preferences updated successfully',
          variant: 'success'
        })
        
        // Reload to get updated audit trail
        await loadPreferences()
        return true
      } else {
        setError(response.error || 'Failed to update preferences')
        toast({
          title: 'Error',
          description: response.error || 'Failed to update preferences',
          variant: 'destructive'
        })
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update preferences'
      setError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
      return false
    } finally {
      setSaving(false)
    }
  }, [user, loadPreferences])

  // Update quiet hours settings
  const updateQuietHours = useCallback(async (
    start: string, 
    end: string, 
    timezone: string, 
    reason?: string
  ): Promise<boolean> => {
    if (!user) return false

    try {
      setSaving(true)
      setError(null)
      
      const response = await notificationService.updatePreferences({
        action: 'update_quiet_hours',
        quiet_hours_start: start,
        quiet_hours_end: end,
        timezone,
        reason: reason || 'Quiet hours preference update'
      })

      if (response.success) {
        setPreferences(response.preferences)
        
        toast({
          title: 'Quiet Hours Updated',
          description: 'Your quiet hours preferences have been saved',
          variant: 'success'
        })
        
        // Reload to get updated audit trail
        await loadPreferences()
        return true
      } else {
        setError(response.error || 'Failed to update quiet hours')
        toast({
          title: 'Error',
          description: response.error || 'Failed to update quiet hours',
          variant: 'destructive'
        })
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update quiet hours'
      setError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
      return false
    } finally {
      setSaving(false)
    }
  }, [user, loadPreferences])

  // Check consent status for a specific channel
  const checkChannelStatus = useCallback(async (channel: string): Promise<ConsentStatus | null> => {
    if (!user) return null

    try {
      const response = await notificationService.checkConsentStatus(user.id, channel)
      return response.success ? response : null
    } catch (err) {
      console.error('Error checking channel status:', err)
      return null
    }
  }, [user])

  // Export preferences data
  const exportPreferences = useCallback(async () => {
    if (!user) return

    try {
      const response = await notificationService.exportPreferences()
      
      if (response.success) {
        // Create and download file
        const blob = new Blob([JSON.stringify(response.export_data, null, 2)], {
          type: 'application/json'
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `notification-preferences-${user.id}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        toast({
          title: 'Export Complete',
          description: 'Your preferences have been exported',
          variant: 'success'
        })
      } else {
        toast({
          title: 'Export Failed',
          description: response.error || 'Failed to export preferences',
          variant: 'destructive'
        })
      }
    } catch (err) {
      console.error('Error exporting preferences:', err)
      toast({
        title: 'Export Failed',
        description: 'Failed to export preferences',
        variant: 'destructive'
      })
    }
  }, [user])

  // Revoke all consents
  const revokeAllConsents = useCallback(async (reason?: string): Promise<boolean> => {
    if (!user) return false

    try {
      setSaving(true)
      setError(null)
      
      const response = await notificationService.revokeAllConsents(
        user.id, 
        undefined, 
        reason || 'User requested to revoke all consents'
      )

      if (response.success) {
        toast({
          title: 'Consents Revoked',
          description: 'All notification consents have been revoked',
          variant: 'success'
        })
        
        // Reload preferences
        await loadPreferences()
        return true
      } else {
        setError(response.error || 'Failed to revoke consents')
        toast({
          title: 'Error',
          description: response.error || 'Failed to revoke consents',
          variant: 'destructive'
        })
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to revoke consents'
      setError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
      return false
    } finally {
      setSaving(false)
    }
  }, [user, loadPreferences])

  // Utility: Check if a channel is enabled
  const isChannelEnabled = useCallback((channel: string): boolean => {
    if (!preferences) return false
    return Boolean(preferences[`${channel}_enabled` as keyof NotificationPreferences])
  }, [preferences])

  // Utility: Check if current time is within quiet hours
  const isWithinQuietHours = useCallback((): boolean => {
    if (!preferences) return false

    const now = new Date()
    const userTime = new Intl.DateTimeFormat('en-US', {
      timeZone: preferences.timezone || 'Africa/Lusaka',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }).format(now)

    const currentTime = userTime
    const quietStart = preferences.quiet_hours_start || '22:00'
    const quietEnd = preferences.quiet_hours_end || '08:00'

    // Handle quiet hours that span midnight
    if (quietStart > quietEnd) {
      return currentTime >= quietStart || currentTime <= quietEnd
    } else {
      return currentTime >= quietStart && currentTime <= quietEnd
    }
  }, [preferences])

  // Utility: Get consent date for a channel
  const getConsentDate = useCallback((channel: string): Date | null => {
    if (!preferences) return null
    
    const consentField = `${channel}_consent_at` as keyof NotificationPreferences
    const consentAt = preferences[consentField] as string | undefined
    
    return consentAt ? new Date(consentAt) : null
  }, [preferences])

  // Load preferences on mount and when user changes
  useEffect(() => {
    if (user) {
      loadPreferences()
    } else {
      setPreferences(null)
      setAuditTrail([])
      setError(null)
    }
  }, [user, loadPreferences])

  return {
    preferences,
    auditTrail,
    loading,
    saving,
    error,
    
    // Actions
    loadPreferences,
    updateChannelConsent,
    updateMultipleChannels,
    updateQuietHours,
    checkChannelStatus,
    exportPreferences,
    revokeAllConsents,
    
    // Utilities
    isChannelEnabled,
    isWithinQuietHours,
    getConsentDate
  }
}