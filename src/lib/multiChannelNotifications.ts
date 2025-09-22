import { supabase } from '@/lib/supabase'
import { sanitizeForLog } from '@/lib/security'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { notificationService } from '@/services/notifications'

// Get the application base URL for notification links
const getAppBaseUrl = () => {
  const apiBase = getApiBaseUrl()
  return import.meta.env.VITE_APP_BASE_URL || apiBase
}

export interface NotificationChannel {
  type: 'email' | 'sms' | 'whatsapp' | 'push' | 'in_app'
  enabled: boolean
  priority: number
}

export interface NotificationPreferences {
  channels: NotificationChannel[]
  optimalTiming: boolean
  frequency: 'immediate' | 'daily' | 'weekly'
  sms_opt_in_at?: string | null
  sms_opt_in_source?: string | null
  sms_opt_in_actor?: string | null
  sms_opt_out_at?: string | null
  sms_opt_out_source?: string | null
  sms_opt_out_actor?: string | null
  sms_opt_out_reason?: string | null
  whatsapp_opt_in_at?: string | null
  whatsapp_opt_in_source?: string | null
  whatsapp_opt_in_actor?: string | null
  whatsapp_opt_out_at?: string | null
  whatsapp_opt_out_source?: string | null
  whatsapp_opt_out_actor?: string | null
  whatsapp_opt_out_reason?: string | null
}

export interface NotificationTemplate {
  id: string
  type: string
  channels: string[]
  subject: string
  content: string
  variables: string[]
}

interface ChannelDeliveryResult {
  channel: string
  success: boolean
  status?: string
  messageId?: string | null
}

export class MultiChannelNotificationService {
  private static instance: MultiChannelNotificationService
  
  static getInstance(): MultiChannelNotificationService {
    if (!MultiChannelNotificationService.instance) {
      MultiChannelNotificationService.instance = new MultiChannelNotificationService()
    }
    return MultiChannelNotificationService.instance
  }

  async sendNotification(
    userId: string,
    type: string,
    data: Record<string, unknown>,
    channels?: string[]
  ): Promise<boolean> {
    try {
      const preferences = await this.getUserPreferences(userId)
      const template = await this.getTemplate(type)
      const targetChannels = channels || this.selectOptimalChannels(preferences, type)
      
      const results = await Promise.all(
        targetChannels.map(channel =>
          this.sendToChannel(channel, userId, type, template, data, preferences)
        )
      )

      await this.logNotification(userId, type, targetChannels, results)

      return results.some(result => result.success)
    } catch (error) {
      const sanitizedError = error instanceof Error ? error.message : 'Unknown error'
      console.error('Notification sending failed:', sanitizedError)
      return false
    }
  }

  async sendProactiveReminder(userId: string, applicationId: string): Promise<void> {
    const { data: application } = await supabase
      .from('applications_new')
      .select('*')
      .eq('id', applicationId)
      .single()

    if (!application) return

    const reminders = this.generateProactiveReminders(application)
    
    for (const reminder of reminders) {
      await this.sendNotification(userId, reminder.type, {
        ...reminder.data,
        application_id: applicationId
      })
    }
  }

  private async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    const { data } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    const defaults: NotificationPreferences = {
      channels: this.ensureChannelDefaults(),
      optimalTiming: true,
      frequency: 'immediate',
      sms_opt_in_at: null,
      sms_opt_in_source: null,
      sms_opt_in_actor: null,
      sms_opt_out_at: null,
      sms_opt_out_source: null,
      sms_opt_out_actor: null,
      sms_opt_out_reason: null,
      whatsapp_opt_in_at: null,
      whatsapp_opt_in_source: null,
      whatsapp_opt_in_actor: null,
      whatsapp_opt_out_at: null,
      whatsapp_opt_out_source: null,
      whatsapp_opt_out_actor: null,
      whatsapp_opt_out_reason: null
    }

    if (!data) {
      return defaults
    }

    return {
      ...defaults,
      ...data,
      channels: this.ensureChannelDefaults(data.channels as NotificationChannel[] | null | undefined),
      optimalTiming: typeof data.optimalTiming === 'boolean' ? data.optimalTiming : defaults.optimalTiming,
      frequency: ['immediate', 'daily', 'weekly'].includes(data.frequency) ? data.frequency : defaults.frequency,
      sms_opt_in_at: data.sms_opt_in_at ?? defaults.sms_opt_in_at,
      sms_opt_in_source: data.sms_opt_in_source ?? defaults.sms_opt_in_source,
      sms_opt_in_actor: data.sms_opt_in_actor ?? defaults.sms_opt_in_actor,
      sms_opt_out_at: data.sms_opt_out_at ?? defaults.sms_opt_out_at,
      sms_opt_out_source: data.sms_opt_out_source ?? defaults.sms_opt_out_source,
      sms_opt_out_actor: data.sms_opt_out_actor ?? defaults.sms_opt_out_actor,
      sms_opt_out_reason: data.sms_opt_out_reason ?? defaults.sms_opt_out_reason,
      whatsapp_opt_in_at: data.whatsapp_opt_in_at ?? defaults.whatsapp_opt_in_at,
      whatsapp_opt_in_source: data.whatsapp_opt_in_source ?? defaults.whatsapp_opt_in_source,
      whatsapp_opt_in_actor: data.whatsapp_opt_in_actor ?? defaults.whatsapp_opt_in_actor,
      whatsapp_opt_out_at: data.whatsapp_opt_out_at ?? defaults.whatsapp_opt_out_at,
      whatsapp_opt_out_source: data.whatsapp_opt_out_source ?? defaults.whatsapp_opt_out_source,
      whatsapp_opt_out_actor: data.whatsapp_opt_out_actor ?? defaults.whatsapp_opt_out_actor,
      whatsapp_opt_out_reason: data.whatsapp_opt_out_reason ?? defaults.whatsapp_opt_out_reason
    }
  }

  private ensureChannelDefaults(
    channels: NotificationChannel[] | null | undefined = []
  ): NotificationChannel[] {
    const defaults: NotificationChannel[] = [
      { type: 'email', enabled: true, priority: 1 },
      { type: 'sms', enabled: false, priority: 2 },
      { type: 'whatsapp', enabled: false, priority: 3 },
      { type: 'in_app', enabled: true, priority: 4 }
    ]

    const channelMap = new Map(defaults.map(entry => [entry.type, { ...entry }]))

    if (Array.isArray(channels)) {
      channels.forEach(entry => {
        if (!entry || !entry.type) {
          return
        }

        const parsedPriority = Number(entry.priority)
        const normalizedPriority = Number.isFinite(parsedPriority)
          ? parsedPriority
          : channelMap.get(entry.type)?.priority

        channelMap.set(entry.type, {
          type: entry.type,
          enabled: Boolean(entry.enabled),
          priority: normalizedPriority ?? defaults.length + 1
        })
      })
    }

    return Array.from(channelMap.values()).sort((a, b) => a.priority - b.priority)
  }

  private async getTemplate(type: string): Promise<NotificationTemplate> {
    const templates: Record<string, NotificationTemplate> = {
      application_submitted: {
        id: 'app_submitted',
        type: 'application_submitted',
        channels: ['email', 'in_app'],
        subject: '✅ Application Submitted Successfully - {{program}}',
        content: `Dear {{full_name}},\n\nYour application for {{program}} has been successfully submitted!\n\n📋 Tracking Code: {{tracking_code}}\n⏰ Expected Processing: 3-5 business days\n\nYou can track your application status anytime at: ${getAppBaseUrl()}/track-application\n\nThank you for choosing {{institution}}!`,
        variables: ['program', 'tracking_code', 'full_name', 'institution']
      },
      document_missing: {
        id: 'doc_missing',
        type: 'document_missing',
        channels: ['email', 'in_app'],
        subject: '📄 Missing Documents - Action Required',
        content: `Dear {{full_name}},\n\nYour application requires the following documents:\n\n❌ {{missing_documents}}\n\n⏰ Deadline: {{deadline}}\n\nPlease upload these documents to continue processing your application.\n\nLogin to complete: ${getAppBaseUrl()}/apply`,
        variables: ['full_name', 'missing_documents', 'deadline']
      },
      status_update: {
        id: 'status_update',
        type: 'status_update',
        channels: ['email', 'in_app'],
        subject: '🔄 Application Status Update - {{status}}',
        content: `Dear {{full_name}},\n\nYour application status has been updated:\n\n📊 New Status: {{status}}\n💬 Message: {{message}}\n\nTrack your application: ${getAppBaseUrl()}/track-application\n\nFor questions, contact us at info@{{institution_domain}}.edu.zm`,
        variables: ['status', 'message', 'full_name', 'institution_domain']
      },
      application_approved: {
        id: 'app_approved',
        type: 'application_approved',
        channels: ['email', 'sms', 'in_app'],
        subject: '🎉 Congratulations! Application Approved',
        content: 'Dear {{full_name}},\n\nCongratulations! Your application for {{program}} has been APPROVED!\n\n🎓 Program: {{program}}\n📅 Next Steps: You will receive enrollment details within 48 hours\n\nWelcome to {{institution}}!',
        variables: ['full_name', 'program', 'institution']
      },
      incomplete_application: {
        id: 'incomplete_app',
        type: 'incomplete_application',
        channels: ['email', 'in_app'],
        subject: '⚠️ Incomplete Application - Please Complete',
        content: `Dear {{full_name}},\n\nYour application is incomplete:\n\n❌ {{missing_info}}\n📊 Current: {{current_count}} items\n\nPlease complete your application to proceed.\n\nContinue here: ${getAppBaseUrl()}/apply`,
        variables: ['full_name', 'missing_info', 'current_count']
      }
    }

    return templates[type] || templates.status_update
  }

  private selectOptimalChannels(preferences: NotificationPreferences, type: string): string[] {
    const urgentTypes = ['document_missing', 'deadline_reminder']
    const isUrgent = urgentTypes.includes(type)

    const eligibleChannels = preferences.channels
      .filter(channel => this.isChannelDispatchAllowed(preferences, channel.type))
      .sort((a, b) => a.priority - b.priority)
      .map(channel => channel.type)

    if (eligibleChannels.length === 0) {
      const fallback = ['in_app', 'email'].find(channel => this.isChannelDispatchAllowed(preferences, channel))
      return fallback ? [fallback] : []
    }

    if (isUrgent) {
      return eligibleChannels
    }

    return eligibleChannels.slice(0, 1)
  }

  private isChannelDispatchAllowed(preferences: NotificationPreferences, channel: string): boolean {
    const entry = preferences.channels.find(item => item.type === channel)
    if (!entry || !entry.enabled) {
      return false
    }

    if (channel === 'sms') {
      return Boolean(preferences.sms_opt_in_at) && !preferences.sms_opt_out_at
    }

    if (channel === 'whatsapp') {
      return Boolean(preferences.whatsapp_opt_in_at) && !preferences.whatsapp_opt_out_at
    }

    return true
  }

  private async sendToChannel(
    channel: string,
    userId: string,
    type: string,
    template: NotificationTemplate,
    data: Record<string, unknown>,
    preferences: NotificationPreferences
  ): Promise<ChannelDeliveryResult> {
    if (!this.isChannelDispatchAllowed(preferences, channel)) {
      return { channel, success: false, status: 'blocked' }
    }

    const content = this.personalizeContent(template.content, data)
    const subject = this.personalizeContent(template.subject, data)

    switch (channel) {
      case 'email': {
        const success = await this.sendEmail(userId, subject, content)
        return { channel, success, status: success ? 'sent' : 'failed' }
      }
      case 'sms':
        return this.dispatchChannelThroughApi('sms', userId, type, content)
      case 'whatsapp':
        return this.dispatchChannelThroughApi('whatsapp', userId, type, content)
      case 'push': {
        const success = await this.sendPushNotification(userId, subject, content)
        return { channel, success, status: success ? 'sent' : 'failed' }
      }
      case 'in_app': {
        const success = await this.sendInAppNotification(userId, subject, content)
        return { channel, success, status: success ? 'sent' : 'failed' }
      }
      default:
        return { channel, success: false, status: 'unsupported' }
    }
  }

  private async dispatchChannelThroughApi(
    channel: 'sms' | 'whatsapp',
    userId: string,
    type: string,
    content: string
  ): Promise<ChannelDeliveryResult> {
    try {
      const response = await notificationService.dispatchChannel({
        userId,
        channel,
        type,
        content
      })

      return {
        channel,
        success: true,
        status: response?.status || 'sent',
        messageId: response?.messageId ?? null
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`${channel.toUpperCase()} dispatch failed:`, sanitizeForLog(message))
      const normalizedMessage = message.toLowerCase()
      const blocked = normalizedMessage.includes('precondition failed') || normalizedMessage.includes('opt-in')

      return {
        channel,
        success: false,
        status: blocked ? 'blocked' : 'error'
      }
    }
  }

  private personalizeContent(template: string, data: Record<string, unknown>): string {
    let content = template
    Object.entries(data).forEach(([key, value]) => {
      const serializedValue = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), serializedValue)
    })
    return content
  }

  private async sendEmail(userId: string, subject: string, content: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('email')
        .eq('user_id', userId)
        .single()

      if (error) {
        console.error('Email lookup failed:', {
          userId: sanitizeForLog(userId),
          error: sanitizeForLog(error.message || 'Unknown error')
        })
        return false
      }

      const recipientEmail = data?.email?.trim()

      if (!recipientEmail) {
        console.warn('Email notification skipped: missing email address for user', sanitizeForLog(userId))
        return false
      }

      // In production, integrate with email service (SendGrid, AWS SES, etc.)
      console.log('Email sent:', {
        to: sanitizeForLog(recipientEmail),
        subject: sanitizeForLog(subject),
        content: sanitizeForLog(content)
      })
      return true
    } catch (error) {
      const sanitizedError = error instanceof Error ? error.message : 'Unknown error'
      console.error('Email sending failed:', sanitizedError)
      return false
    }
  }

  private async sendPushNotification(userId: string, title: string, content: string): Promise<boolean> {
    try {
      // In production, integrate with push notification service
      console.log('Push notification sent:', { userId: sanitizeForLog(userId), title: sanitizeForLog(title), content: sanitizeForLog(content) })
      return true
    } catch (error) {
      const sanitizedError = error instanceof Error ? error.message : 'Unknown error'
      console.error('Push notification failed:', sanitizedError)
      return false
    }
  }

  private async sendInAppNotification(userId: string, title: string, content: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .insert({
          user_id: userId,
          title,
          content,
          type: 'info',
          read: false
        })

      return !error
    } catch (error) {
      const sanitizedError = error instanceof Error ? error.message : 'Unknown error'
      console.error('In-app notification failed:', sanitizedError)
      return false
    }
  }

  private generateProactiveReminders(
    application: {
      result_slip_url?: string | null
      pop_url?: string | null
      full_name?: string | null
    }
  ): Array<{ type: string; data: Record<string, string> }> {
    const reminders: Array<{ type: string; data: Record<string, string> }> = []
    const fullName = application.full_name ?? ''

    if (!application.result_slip_url) {
      reminders.push({
        type: 'document_missing',
        data: {
          full_name: fullName,
          missing_documents: 'Result Slip',
          deadline: '7 days'
        }
      })
    }

    if (!application.pop_url) {
      reminders.push({
        type: 'document_missing',
        data: {
          full_name: fullName,
          missing_documents: 'Proof of Payment',
          deadline: '3 days'
        }
      })
    }

    return reminders
  }

  private async logNotification(
    userId: string,
    type: string,
    channels: string[],
    results: ChannelDeliveryResult[]
  ): Promise<void> {
    const channelStatuses: Record<string, string> = {}
    const providerMessageIds: Record<string, string> = {}

    let successCount = 0

    results.forEach(result => {
      const status = result.status || (result.success ? 'sent' : 'failed')
      channelStatuses[result.channel] = status

      if (result.messageId) {
        providerMessageIds[result.channel] = result.messageId
      }

      if (result.success) {
        successCount += 1
      }
    })

    const { error } = await supabase
      .from('notification_logs')
      .insert({
        user_id: userId,
        type,
        channels,
        success_count: successCount,
        total_count: results.length,
        sent_at: new Date().toISOString(),
        channel_statuses: channelStatuses,
        provider_message_ids: providerMessageIds
      })

    if (error) {
      const sanitizedError = error.message || 'Unknown error'
      console.error('Failed to log notification:', sanitizedError)
    }
  }
}

export const multiChannelNotifications = MultiChannelNotificationService.getInstance()