/**
 * Push Notification Manager
 * Handles push notifications for mobile devices with scheduling and delivery tracking
 * Requirements: 9.4 - Enable push notifications, add scheduling and delivery tracking, implement preferences
 */

export interface PushNotificationAction {
  action: string
  title: string
  icon?: string
}

export interface PushNotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  image?: string
  tag?: string
  data?: Record<string, any>
  actions?: PushNotificationAction[]
  requireInteraction?: boolean
  silent?: boolean
  timestamp?: number
  url?: string
}

export interface NotificationSchedule {
  id: string
  payload: PushNotificationPayload
  scheduledFor: Date
  userId: string
  type: 'immediate' | 'scheduled' | 'recurring'
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  retryCount: number
  maxRetries: number
  createdAt: Date
  sentAt?: Date
  failureReason?: string
}

export interface NotificationPreferences {
  userId: string
  pushEnabled: boolean
  applicationUpdates: boolean
  paymentReminders: boolean
  deadlineAlerts: boolean
  systemNotifications: boolean
  quietHours: {
    enabled: boolean
    start: string // HH:MM format
    end: string // HH:MM format
  }
  frequency: 'immediate' | 'daily_digest' | 'weekly_digest'
  lastUpdated: Date
}

export interface DeliveryStats {
  notificationId: string
  userId: string
  delivered: boolean
  deliveredAt?: Date
  clicked: boolean
  clickedAt?: Date
  dismissed: boolean
  dismissedAt?: Date
  action?: string
  userAgent: string
  platform: string
}

class PushNotificationManager {
  private registration: ServiceWorkerRegistration | null = null
  private subscription: PushSubscription | null = null
  private vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
  private scheduledNotifications: Map<string, NotificationSchedule> = new Map()
  private deliveryStats: Map<string, DeliveryStats> = new Map()

  /**
   * Initialize push notification manager
   */
  async initialize(): Promise<boolean> {
    try {
      // Check if service workers and push messaging are supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications not supported in this browser')
        return false
      }

      // Use existing vite-plugin-pwa service worker registration
      this.registration = await navigator.serviceWorker.getRegistration() ?? null

      if (!this.registration) {
        console.warn('Push notifications unavailable: no service worker registration found')
        return false
      }

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready

      // Check current subscription
      this.subscription = await this.registration.pushManager.getSubscription()

      // Load scheduled notifications from storage
      this.loadScheduledNotifications()
      this.loadDeliveryStats()

      // Set up message listener for delivery tracking
      this.setupMessageListener()

      return true
    } catch (error) {
      console.error('Failed to initialize push notifications:', error)
      return false
    }
  }

  /**
   * Request permission and subscribe to push notifications
   */
  async requestPermission(): Promise<boolean> {
    try {
      const permission = await Notification.requestPermission()
      
      if (permission !== 'granted') {
        console.warn('Push notification permission denied')
        return false
      }

      // Subscribe to push notifications
      if (!this.subscription && this.registration) {
        this.subscription = await this.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey) as BufferSource
        })

        // Send subscription to server
        await this.sendSubscriptionToServer(this.subscription)
      }

      return true
    } catch (error) {
      console.error('Failed to request push notification permission:', error)
      return false
    }
  }

  /**
   * Check if push notifications are supported and enabled
   */
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  }

  /**
   * Check current permission status
   */
  getPermissionStatus(): NotificationPermission {
    return Notification.permission
  }

  /**
   * Send immediate push notification
   */
  async sendNotification(payload: PushNotificationPayload, userId: string): Promise<string> {
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const schedule: NotificationSchedule = {
      id: notificationId,
      payload,
      scheduledFor: new Date(),
      userId,
      type: 'immediate',
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date()
    }

    try {
      // Check user preferences
      const preferences = await this.getUserPreferences(userId)
      if (!this.shouldSendNotification(payload, preferences)) {
        schedule.status = 'cancelled'
        schedule.failureReason = 'User preferences'
        this.scheduledNotifications.set(notificationId, schedule)
        
        // tracking removed
        return notificationId
      }

      // Deliver notification
      await this.deliverNotification(schedule)
      
    } catch (error) {
      schedule.status = 'failed'
      schedule.failureReason = error instanceof Error ? error.message : 'Unknown error'
      console.error('Failed to send notification:', error)
    }

    this.scheduledNotifications.set(notificationId, schedule)
    this.saveScheduledNotifications()
    return notificationId
  }

  /**
   * Schedule notification for future delivery
   */
  async scheduleNotification(
    payload: PushNotificationPayload, 
    scheduledFor: Date, 
    userId: string
  ): Promise<string> {
    const notificationId = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const schedule: NotificationSchedule = {
      id: notificationId,
      payload,
      scheduledFor,
      userId,
      type: 'scheduled',
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date()
    }

    this.scheduledNotifications.set(notificationId, schedule)
    this.saveScheduledNotifications()

    // Set up timer for delivery
    const delay = scheduledFor.getTime() - Date.now()
    if (delay > 0) {
      setTimeout(() => {
        this.processScheduledNotification(notificationId)
      }, delay)
    }

    return notificationId
  }

  /**
   * Cancel scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<boolean> {
    const schedule = this.scheduledNotifications.get(notificationId)
    if (schedule && schedule.status === 'pending') {
      schedule.status = 'cancelled'
      this.scheduledNotifications.set(notificationId, schedule)
      this.saveScheduledNotifications()
      return true
    }
    return false
  }

  /**
   * Get notification delivery status
   */
  getNotificationStatus(notificationId: string): NotificationSchedule | null {
    return this.scheduledNotifications.get(notificationId) || null
  }

  /**
   * Get delivery statistics for a notification
   */
  getDeliveryStats(notificationId: string): DeliveryStats | null {
    return this.deliveryStats.get(notificationId) || null
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<void> {
    const existing = await this.getUserPreferences(userId)
    const updated: NotificationPreferences = {
      ...existing,
      ...preferences,
      userId,
      lastUpdated: new Date()
    }

    localStorage.setItem(`push_prefs_${userId}`, JSON.stringify(updated))
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const stored = localStorage.getItem(`push_prefs_${userId}`)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      console.error('Failed to load user preferences:', error)
    }

    // Return default preferences
    return {
      userId,
      pushEnabled: true,
      applicationUpdates: true,
      paymentReminders: true,
      deadlineAlerts: true,
      systemNotifications: false,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00'
      },
      frequency: 'immediate',
      lastUpdated: new Date()
    }
  }

  /**
   * Process scheduled notification
   */
  private async processScheduledNotification(notificationId: string): Promise<void> {
    const schedule = this.scheduledNotifications.get(notificationId)
    if (!schedule || schedule.status !== 'pending') {
      return
    }

    try {
      // Check if it's time to send
      if (schedule.scheduledFor.getTime() <= Date.now()) {
        // Check user preferences
        const preferences = await this.getUserPreferences(schedule.userId)
        if (!this.shouldSendNotification(schedule.payload, preferences)) {
          schedule.status = 'cancelled'
          schedule.failureReason = 'User preferences or quiet hours'
          return
        }

        await this.deliverNotification(schedule)
      }
    } catch (error) {
      schedule.retryCount++
      if (schedule.retryCount >= schedule.maxRetries) {
        schedule.status = 'failed'
        schedule.failureReason = error instanceof Error ? error.message : 'Max retries exceeded'
      } else {
        // Retry after delay
        setTimeout(() => {
          this.processScheduledNotification(notificationId)
        }, 5000 * schedule.retryCount) // Exponential backoff
      }
    } finally {
      this.scheduledNotifications.set(notificationId, schedule)
      this.saveScheduledNotifications()
    }
  }

  /**
   * Deliver notification
   */
  private async deliverNotification(schedule: NotificationSchedule): Promise<void> {
    if (!this.registration) {
      throw new Error('Service worker not registered')
    }

    // Create notification with tracking data
    const notificationPayload = {
      ...schedule.payload,
      data: {
        ...schedule.payload.data,
        notificationId: schedule.id,
        userId: schedule.userId,
        timestamp: Date.now()
      }
    }

    // Show notification
    await this.registration.showNotification(schedule.payload.title, {
      body: schedule.payload.body,
      icon: schedule.payload.icon || '/images/icon-192.png',
      badge: schedule.payload.badge || '/images/badge.png',
      tag: schedule.payload.tag,
      data: notificationPayload.data,
      requireInteraction: schedule.payload.requireInteraction,
      silent: schedule.payload.silent
    })

    // Update schedule status
    schedule.status = 'sent'
    schedule.sentAt = new Date()

    // Track delivery
    this.trackDelivery(schedule.id, schedule.userId, true)
  }

  /**
   * Check if notification should be sent based on user preferences
   */
  private shouldSendNotification(payload: PushNotificationPayload, preferences: NotificationPreferences): boolean {
    // Check if push notifications are enabled
    if (!preferences.pushEnabled) {
      return false
    }

    // Check notification type preferences
    const notificationType = payload.data?.type || 'system'
    switch (notificationType) {
      case 'application':
        if (!preferences.applicationUpdates) return false
        break
      case 'payment':
        if (!preferences.paymentReminders) return false
        break
      case 'deadline':
        if (!preferences.deadlineAlerts) return false
        break
      case 'system':
        if (!preferences.systemNotifications) return false
        break
    }

    // Check quiet hours
    if (preferences.quietHours.enabled) {
      const now = new Date()
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      
      const start = preferences.quietHours.start
      const end = preferences.quietHours.end
      
      // Handle quiet hours that span midnight
      if (start > end) {
        if (currentTime >= start || currentTime <= end) {
          return false
        }
      } else {
        if (currentTime >= start && currentTime <= end) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Track notification delivery and interactions
   */
  private trackDelivery(notificationId: string, userId: string, delivered: boolean): void {
    const stats: DeliveryStats = {
      notificationId,
      userId,
      delivered,
      deliveredAt: delivered ? new Date() : undefined,
      clicked: false,
      dismissed: false,
      userAgent: navigator.userAgent,
      platform: this.getPlatform()
    }

    this.deliveryStats.set(notificationId, stats)
    this.saveDeliveryStats()
  }

  /**
   * Track notification click
   */
  trackClick(notificationId: string, action?: string): void {
    const stats = this.deliveryStats.get(notificationId)
    if (stats) {
      stats.clicked = true
      stats.clickedAt = new Date()
      stats.action = action
      this.deliveryStats.set(notificationId, stats)
      this.saveDeliveryStats()
    }
  }

  /**
   * Track notification dismissal
   */
  trackDismissal(notificationId: string): void {
    const stats = this.deliveryStats.get(notificationId)
    if (stats) {
      stats.dismissed = true
      stats.dismissedAt = new Date()
      this.deliveryStats.set(notificationId, stats)
      this.saveDeliveryStats()
    }
  }

  /**
   * Set up message listener for tracking
   */
  private setupMessageListener(): void {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, notificationId, action } = event.data || {}
      
      switch (type) {
        case 'notification-click':
          this.trackClick(notificationId, action)
          break
        case 'notification-close':
          this.trackDismissal(notificationId)
          break
      }
    })
  }

  /**
   * Send subscription to server
   */
  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    try {
      const response = await fetch('/api/notifications?action=push-subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // Send HTTP-only auth cookies
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
          platform: this.getPlatform()
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || `Failed to send subscription: ${response.statusText}`)
      }
      
      console.log('Push subscription saved to server')
    } catch (error) {
      console.error('Failed to send subscription to server:', error)
      // Store locally as fallback
      localStorage.setItem('push_subscription', JSON.stringify(subscription.toJSON()))
    }
  }

  /**
   * Convert VAPID key to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    
    return outputArray
  }

  /**
   * Get platform information
   */
  private getPlatform(): string {
    const userAgent = navigator.userAgent.toLowerCase()
    
    if (userAgent.includes('android')) return 'android'
    if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'ios'
    if (userAgent.includes('windows')) return 'windows'
    if (userAgent.includes('mac')) return 'macos'
    if (userAgent.includes('linux')) return 'linux'
    
    return 'unknown'
  }

  /**
   * Load scheduled notifications from storage
   */
  private loadScheduledNotifications(): void {
    try {
      const stored = localStorage.getItem('push_scheduled_notifications')
      if (stored) {
        const data = JSON.parse(stored)
        this.scheduledNotifications = new Map(Object.entries(data))
        
        // Restart timers for pending scheduled notifications
        for (const [id, schedule] of this.scheduledNotifications) {
          if (schedule.status === 'pending' && schedule.type === 'scheduled') {
            const delay = new Date(schedule.scheduledFor).getTime() - Date.now()
            if (delay > 0) {
              setTimeout(() => {
                this.processScheduledNotification(id)
              }, delay)
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load scheduled notifications:', error)
    }
  }

  /**
   * Save scheduled notifications to storage
   */
  private saveScheduledNotifications(): void {
    try {
      const data = Object.fromEntries(this.scheduledNotifications)
      localStorage.setItem('push_scheduled_notifications', JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save scheduled notifications:', error)
    }
  }

  /**
   * Load delivery stats from storage
   */
  private loadDeliveryStats(): void {
    try {
      const stored = localStorage.getItem('push_delivery_stats')
      if (stored) {
        const data = JSON.parse(stored)
        this.deliveryStats = new Map(Object.entries(data))
      }
    } catch (error) {
      console.error('Failed to load delivery stats:', error)
    }
  }

  /**
   * Save delivery stats to storage
   */
  private saveDeliveryStats(): void {
    try {
      const data = Object.fromEntries(this.deliveryStats)
      localStorage.setItem('push_delivery_stats', JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save delivery stats:', error)
    }
  }

  /**
   * Get analytics summary
   */
  getAnalyticsSummary(): {
    totalNotifications: number
    delivered: number
    clicked: number
    dismissed: number
    clickRate: number
    dismissalRate: number
  } {
    const stats = Array.from(this.deliveryStats.values())
    const delivered = stats.filter(s => s.delivered).length
    const clicked = stats.filter(s => s.clicked).length
    const dismissed = stats.filter(s => s.dismissed).length

    return {
      totalNotifications: stats.length,
      delivered,
      clicked,
      dismissed,
      clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
      dismissalRate: delivered > 0 ? (dismissed / delivered) * 100 : 0
    }
  }

  /**
   * Clean up old notifications and stats
   */
  cleanup(maxAge: number = 30 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge
    
    // Clean up old scheduled notifications
    for (const [id, schedule] of this.scheduledNotifications) {
      if (schedule.createdAt.getTime() < cutoff && schedule.status !== 'pending') {
        this.scheduledNotifications.delete(id)
      }
    }
    
    // Clean up old delivery stats
    for (const [id, stats] of this.deliveryStats) {
      if (stats.deliveredAt && stats.deliveredAt.getTime() < cutoff) {
        this.deliveryStats.delete(id)
      }
    }
    
    this.saveScheduledNotifications()
    this.saveDeliveryStats()
  }
}

export const pushNotificationManager = new PushNotificationManager()