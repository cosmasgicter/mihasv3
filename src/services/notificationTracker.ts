/**
 * Notification Delivery Tracking System
 * Requirements: 9.4 - Add notification scheduling and delivery tracking
 */

export interface NotificationDeliveryStatus {
  id: string
  userId: string
  type: 'push' | 'email' | 'sms' | 'whatsapp' | 'in-app'
  title: string
  body: string
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'clicked' | 'dismissed'
  scheduledFor?: Date
  sentAt?: Date
  deliveredAt?: Date
  clickedAt?: Date
  dismissedAt?: Date
  failureReason?: string
  retryCount: number
  metadata?: Record<string, any>
}

export interface DeliveryMetrics {
  totalSent: number
  totalDelivered: number
  totalClicked: number
  totalDismissed: number
  totalFailed: number
  deliveryRate: number
  clickRate: number
  dismissalRate: number
  failureRate: number
}

class NotificationTracker {
  private deliveryLog: Map<string, NotificationDeliveryStatus> = new Map()
  private listeners: Set<(status: NotificationDeliveryStatus) => void> = new Set()

  constructor() {
    this.loadDeliveryLog()
    this.setupServiceWorkerListener()
  }

  /**
   * Track notification sending
   */
  trackSent(notification: {
    id: string
    userId: string
    type: NotificationDeliveryStatus['type']
    title: string
    body: string
    scheduledFor?: Date
    metadata?: Record<string, any>
  }): void {
    const status: NotificationDeliveryStatus = {
      ...notification,
      status: 'sent',
      sentAt: new Date(),
      retryCount: 0
    }

    this.deliveryLog.set(notification.id, status)
    this.saveDeliveryLog()
    this.notifyListeners(status)
  }

  /**
   * Track notification delivery
   */
  trackDelivered(notificationId: string): void {
    const status = this.deliveryLog.get(notificationId)
    if (status) {
      status.status = 'delivered'
      status.deliveredAt = new Date()
      
      this.deliveryLog.set(notificationId, status)
      this.saveDeliveryLog()
      this.notifyListeners(status)
    }
  }

  /**
   * Track notification click
   */
  trackClicked(notificationId: string, action?: string): void {
    const status = this.deliveryLog.get(notificationId)
    if (status) {
      status.status = 'clicked'
      status.clickedAt = new Date()
      
      if (action) {
        status.metadata = { ...status.metadata, clickAction: action }
      }
      
      this.deliveryLog.set(notificationId, status)
      this.saveDeliveryLog()
      this.notifyListeners(status)
    }
  }

  /**
   * Track notification dismissal
   */
  trackDismissed(notificationId: string): void {
    const status = this.deliveryLog.get(notificationId)
    if (status) {
      status.status = 'dismissed'
      status.dismissedAt = new Date()
      
      this.deliveryLog.set(notificationId, status)
      this.saveDeliveryLog()
      this.notifyListeners(status)
    }
  }

  /**
   * Track notification failure
   */
  trackFailed(notificationId: string, reason: string): void {
    const status = this.deliveryLog.get(notificationId)
    if (status) {
      status.status = 'failed'
      status.failureReason = reason
      status.retryCount += 1
      
      this.deliveryLog.set(notificationId, status)
      this.saveDeliveryLog()
      this.notifyListeners(status)
    }
  }

  /**
   * Get notification status
   */
  getStatus(notificationId: string): NotificationDeliveryStatus | null {
    return this.deliveryLog.get(notificationId) || null
  }

  /**
   * Get all notifications for a user
   */
  getUserNotifications(userId: string): NotificationDeliveryStatus[] {
    return Array.from(this.deliveryLog.values())
      .filter(status => status.userId === userId)
      .sort((a, b) => (b.sentAt?.getTime() || 0) - (a.sentAt?.getTime() || 0))
  }

  /**
   * Get delivery metrics for a user
   */
  getUserMetrics(userId: string, days: number = 30): DeliveryMetrics {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const notifications = this.getUserNotifications(userId)
      .filter(n => n.sentAt && n.sentAt >= cutoff)

    const totalSent = notifications.length
    const totalDelivered = notifications.filter(n => n.status === 'delivered' || n.status === 'clicked').length
    const totalClicked = notifications.filter(n => n.status === 'clicked').length
    const totalDismissed = notifications.filter(n => n.status === 'dismissed').length
    const totalFailed = notifications.filter(n => n.status === 'failed').length

    return {
      totalSent,
      totalDelivered,
      totalClicked,
      totalDismissed,
      totalFailed,
      deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
      clickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
      dismissalRate: totalDelivered > 0 ? (totalDismissed / totalDelivered) * 100 : 0,
      failureRate: totalSent > 0 ? (totalFailed / totalSent) * 100 : 0
    }
  }

  /**
   * Get system-wide metrics
   */
  getSystemMetrics(days: number = 30): DeliveryMetrics {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const notifications = Array.from(this.deliveryLog.values())
      .filter(n => n.sentAt && n.sentAt >= cutoff)

    const totalSent = notifications.length
    const totalDelivered = notifications.filter(n => n.status === 'delivered' || n.status === 'clicked').length
    const totalClicked = notifications.filter(n => n.status === 'clicked').length
    const totalDismissed = notifications.filter(n => n.status === 'dismissed').length
    const totalFailed = notifications.filter(n => n.status === 'failed').length

    return {
      totalSent,
      totalDelivered,
      totalClicked,
      totalDismissed,
      totalFailed,
      deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
      clickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
      dismissalRate: totalDelivered > 0 ? (totalDismissed / totalDelivered) * 100 : 0,
      failureRate: totalSent > 0 ? (totalFailed / totalSent) * 100 : 0
    }
  }

  /**
   * Add status change listener
   */
  addListener(callback: (status: NotificationDeliveryStatus) => void): () => void {
    this.listeners.add(callback)
    
    return () => {
      this.listeners.delete(callback)
    }
  }

  /**
   * Clean up old notifications
   */
  cleanup(maxAge: number = 90): void {
    const cutoff = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000)
    
    for (const [id, status] of this.deliveryLog.entries()) {
      if (status.sentAt && status.sentAt < cutoff) {
        this.deliveryLog.delete(id)
      }
    }
    
    this.saveDeliveryLog()
  }

  /**
   * Export delivery data
   */
  exportData(userId?: string): NotificationDeliveryStatus[] {
    const notifications = Array.from(this.deliveryLog.values())
    
    if (userId) {
      return notifications.filter(n => n.userId === userId)
    }
    
    return notifications
  }

  /**
   * Setup service worker message listener for tracking
   */
  private setupServiceWorkerListener(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const { type, notificationId, action } = event.data
        
        switch (type) {
          case 'notification-click':
            this.trackClicked(notificationId, action)
            break
          case 'notification-close':
            this.trackDismissed(notificationId)
            break
        }
      })
    }
  }

  /**
   * Notify all listeners of status change
   */
  private notifyListeners(status: NotificationDeliveryStatus): void {
    this.listeners.forEach(callback => {
      try {
        callback(status)
      } catch (error) {
        console.error('Error in notification tracker listener:', error)
      }
    })
  }

  /**
   * Load delivery log from localStorage
   */
  private loadDeliveryLog(): void {
    try {
      const stored = localStorage.getItem('notification_delivery_log')
      if (stored) {
        const data = JSON.parse(stored)
        
        // Convert date strings back to Date objects
        for (const [id, status] of Object.entries(data)) {
          const typedStatus = status as any
          if (typedStatus.scheduledFor) typedStatus.scheduledFor = new Date(typedStatus.scheduledFor)
          if (typedStatus.sentAt) typedStatus.sentAt = new Date(typedStatus.sentAt)
          if (typedStatus.deliveredAt) typedStatus.deliveredAt = new Date(typedStatus.deliveredAt)
          if (typedStatus.clickedAt) typedStatus.clickedAt = new Date(typedStatus.clickedAt)
          if (typedStatus.dismissedAt) typedStatus.dismissedAt = new Date(typedStatus.dismissedAt)
          
          this.deliveryLog.set(id, typedStatus as NotificationDeliveryStatus)
        }
      }
    } catch (error) {
      console.error('Failed to load notification delivery log:', error)
    }
  }

  /**
   * Save delivery log to localStorage
   */
  private saveDeliveryLog(): void {
    try {
      const data = Object.fromEntries(this.deliveryLog)
      localStorage.setItem('notification_delivery_log', JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save notification delivery log:', error)
    }
  }
}

export const notificationTracker = new NotificationTracker()

// Cleanup old notifications on startup
notificationTracker.cleanup()

export default notificationTracker