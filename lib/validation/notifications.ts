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
  user_id: optionalSanitizedString,
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
  type: optionalSanitizedString,
  entity_type: optionalSanitizedString,
  entity_id: optionalSanitizedString,
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

/** POST — preferences (hardened) */
export const preferencesBodySchema = z.object({
  sms_enabled: z.boolean().optional(),
  application_updates: z.boolean().optional(),
  payment_reminders: z.boolean().optional(),
  interview_reminders: z.boolean().optional(),
  marketing_emails: z.boolean().optional(),
  quiet_hours_start: optionalSanitizedString,
  quiet_hours_end: optionalSanitizedString,
});
