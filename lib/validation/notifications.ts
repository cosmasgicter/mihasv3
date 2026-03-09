/**
 * Notifications endpoint Zod validation schemas
 */
import { z } from 'zod';
import { nonEmptySanitizedString, optionalSanitizedString } from './sanitize';

/** POST — mark notification as read */
export const markReadBodySchema = z.object({
  notificationId: nonEmptySanitizedString,
});

/** POST — delete notification */
export const deleteNotificationBodySchema = z.object({
  notificationId: nonEmptySanitizedString,
});

/** POST — check duplicate */
export const checkDuplicateBodySchema = z.object({
  type: nonEmptySanitizedString,
  userId: nonEmptySanitizedString,
  entityId: optionalSanitizedString,
});

/** POST — create notification */
export const createNotificationBodySchema = z.object({
  user_id: optionalSanitizedString,
  type: optionalSanitizedString,
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
  action_url: optionalSanitizedString,
  entity_type: optionalSanitizedString,
  entity_id: optionalSanitizedString,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

/** POST — send notification (with email) */
export const sendNotificationBodySchema = z.object({
  user_id: nonEmptySanitizedString,
  type: optionalSanitizedString,
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
  action_url: optionalSanitizedString,
  entity_type: optionalSanitizedString,
  entity_id: optionalSanitizedString,
});

/** POST — update preferences */
export const updatePreferencesBodySchema = z.object({
  email_notifications: z.boolean().optional(),
  push_notifications: z.boolean().optional(),
  sms_notifications: z.boolean().optional(),
  notification_types: z.record(z.string(), z.boolean()).optional(),
}).partial();
