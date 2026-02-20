/**
 * Notification policy enforcement constants and helpers.
 *
 * Mandatory notification types always require email delivery,
 * regardless of user preferences. These are operational events
 * that students must be informed about.
 *
 * Requirements: 13.3, 13.4
 */
export const MANDATORY_EMAIL_TYPES = [
  'application_status_change',
  'payment_verified',
  'interview_scheduled',
] as const;

/**
 * Check whether a notification type requires email delivery regardless
 * of user opt-out preferences.
 */
export function isMandatoryEmailType(type: string): boolean {
  return (MANDATORY_EMAIL_TYPES as readonly string[]).includes(type);
}
