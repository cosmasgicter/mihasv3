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

interface PreferencesResponse {
  preferences: NotificationPreferences
  audit_trail?: PreferenceAuditEntry[]
}

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
      
      const response = await notificationService.getPreferences() as PreferencesResponse | null
      
      if (response) {
        setPreferences(response.preferences)
        setAuditTrail(response.audit_trail || [])
      } else {
        setError('Failed to load preferences')
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
    _reason?: string
  ): Promise<boolean> => {
    if (!user) return false

    try {
      setSaving(true)
      setError(null)
      
      const payload: Record<string, boolean> = {}
      payload[`${channel}_enabled`] = enabled
      const response = await notificationService.updatePreferences(payload as Parameters<typeof notificationService.updatePreferences>[0]) as PreferencesResponse | null

      if (response) {
        setPreferences(response.preferences)
        
        toast.success(
          'Preferences Updated',
          `${channel} notifications ${enabled ? 'enabled' : 'disabled'}`
        )
        
        // Reload to get updated audit trail
        await loadPreferences()
        return true
      } else {
        setError('Failed to update preferences')
        toast.error('Error', 'Failed to update preferences')
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update preferences'
      setError(errorMessage)
      toast.error('Error', errorMessage)
      return false
    } finally {
      setSaving(false)
    }
  }, [user, loadPreferences])


  // Update multiple channels at once
  const updateMultipleChannels = useCallback(async (
    channels: Record<string, boolean>, 
    _reason?: string
  ): Promise<boolean> => {
    if (!user) return false

    try {
      setSaving(true)
      setError(null)
      
      const payload: Record<string, boolean> = {}
      for (const [channel, enabled] of Object.entries(channels)) {
        payload[`${channel}_enabled`] = enabled
      }
      const response = await notificationService.updatePreferences(payload as Parameters<typeof notificationService.updatePreferences>[0]) as PreferencesResponse | null

      if (response) {
        setPreferences(response.preferences)
        
        toast.success(
          'Preferences Updated',
          'Multiple channel preferences updated successfully'
        )
        
        // Reload to get updated audit trail
        await loadPreferences()
        return true
      } else {
        setError('Failed to update preferences')
        toast.error('Error', 'Failed to update preferences')
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update preferences'
      setError(errorMessage)
      toast.error('Error', errorMessage)
      return false
    } finally {
      setSaving(false)
    }
  }, [user, loadPreferences])

  // Update quiet hours settings
  const updateQuietHours = useCallback(async (
    start: string, 
    end: string, 
    _timezone: string, 
    _reason?: string
  ): Promise<boolean> => {
    if (!user) return false

    try {
      setSaving(true)
      setError(null)
      
      const response = await notificationService.updatePreferences({
        quiet_hours_start: start,
        quiet_hours_end: end,
      }) as PreferencesResponse | null

      if (response) {
        setPreferences(response.preferences)
        
        toast.success(
          'Quiet Hours Updated',
          'Your quiet hours preferences have been saved'
        )
        
        // Reload to get updated audit trail
        await loadPreferences()
        return true
      } else {
        setError('Failed to update quiet hours')
        toast.error('Error', 'Failed to update quiet hours')
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update quiet hours'
      setError(errorMessage)
      toast.error('Error', errorMessage)
      return false
    } finally {
      setSaving(false)
    }
  }, [user, loadPreferences])

  // Check consent status for a specific channel
  const checkChannelStatus = useCallback(async (channel: string): Promise<ConsentStatus | null> => {
    if (!user || !preferences) return null

    // Derive consent status from loaded preferences — no separate endpoint needed
    const key = `${channel}_enabled` as keyof NotificationPreferences
    const enabled = Boolean(preferences[key])
    return { success: true, user_id: user.id, channel, enabled } satisfies ConsentStatus
  }, [user, preferences])

  // Export preferences data
  const exportPreferences = useCallback(async () => {
    if (!user || !preferences) return

    try {
      const exportData = {
        userId: user.id,
        preferences,
        auditTrail,
        exportedAt: new Date().toISOString()
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
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

      toast.success('Export Complete', 'Your preferences have been exported')
    } catch (err) {
      console.error('Error exporting preferences:', err)
      toast.error('Export Failed', 'Failed to export preferences')
    }
  }, [user, preferences, auditTrail])

  // Revoke all consents — update all channels to disabled via preferences endpoint
  const revokeAllConsents = useCallback(async (_reason?: string): Promise<boolean> => {
    if (!user) return false

    try {
      setSaving(true)
      setError(null)
      
      const response = await notificationService.updatePreferences({
        sms_enabled: false,
        whatsapp_enabled: false,
        application_updates: false,
        payment_reminders: false,
        interview_reminders: false,
        marketing_emails: false
      }) as PreferencesResponse | null

      if (response) {
        toast.success('Consents Revoked', 'All notification consents have been revoked')
        
        await loadPreferences()
        return true
      } else {
        setError('Failed to revoke consents')
        toast.error('Error', 'Failed to revoke consents')
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to revoke consents'
      setError(errorMessage)
      toast.error('Error', errorMessage)
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
