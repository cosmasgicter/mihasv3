import { NotificationService } from '@/lib/notificationService'

/**
 * Test utility to create sample notifications for the current user
 * Use this in the browser console or as a button in dev mode
 */
export async function createTestNotifications(userId: string) {
  if (!userId) {
    console.error('User ID is required')
    return
  }

  const notifications = [
    {
      title: '🎉 Welcome to MIHAS!',
      content: 'Your account has been created successfully. Start your application journey today!',
      type: 'success' as const,
      actionUrl: '/student/application-wizard'
    },
    {
      title: '📋 Application Reminder',
      content: 'Don\'t forget to complete your application. The deadline is approaching!',
      type: 'warning' as const,
      actionUrl: '/student/application-wizard'
    },
    {
      title: '✅ Document Uploaded',
      content: 'Your Grade 12 certificate has been uploaded successfully.',
      type: 'success' as const
    },
    {
      title: 'ℹ️ System Update',
      content: 'We\'ve updated our application system with new features. Check them out!',
      type: 'info' as const
    },
    {
      title: '⏰ Deadline Alert',
      content: 'Application deadline for January 2025 intake is in 7 days.',
      type: 'warning' as const,
      actionUrl: '/student/application-wizard'
    }
  ]

  console.log('Creating test notifications...')
  
  for (const notification of notifications) {
    const success = await NotificationService.sendNotification({
      userId,
      ...notification
    })
    
    if (success) {
      console.log(`✓ Created: ${notification.title}`)
    } else {
      console.error(`✗ Failed: ${notification.title}`)
    }
    
    // Small delay between notifications
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log('Test notifications created!')
}

/**
 * Create a single test notification
 */
export async function createSingleNotification(
  userId: string,
  title: string,
  content: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
) {
  return NotificationService.sendNotification({
    userId,
    title,
    content,
    type
  })
}
