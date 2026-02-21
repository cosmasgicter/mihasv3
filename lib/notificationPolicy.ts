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

// ---------------------------------------------------------------------------
// Email type mapping — maps notification types to email templates and
// user preference keys for opt-out checks.
// Requirements: 3.6, 6.3
// ---------------------------------------------------------------------------

/**
 * Preference columns on the `user_notification_preferences` table that
 * control whether a category of email may be sent.
 */
export type NotificationPreferenceKey =
  | 'application_updates'
  | 'payment_reminders'
  | 'interview_reminders'
  | 'marketing_emails';

/**
 * Maps a notification type to its email template and the user-preference
 * column that gates delivery.  A `null` preferenceKey means the email is
 * mandatory and always sent regardless of user preferences.
 */
export interface EmailMapping {
  templateName: string;
  preferenceKey: NotificationPreferenceKey | null;
}

/**
 * Canonical mapping from notification type strings to email metadata.
 * Only types listed here are considered email-eligible.
 */
export const EMAIL_TYPE_MAP: Record<string, EmailMapping> = {
  'welcome':                   { templateName: 'welcome',                preferenceKey: null },
  'application_submitted':     { templateName: 'application-submitted',  preferenceKey: 'application_updates' },
  'application_status_change': { templateName: 'status-change',          preferenceKey: null },
  'payment_verified':          { templateName: 'payment-verified',       preferenceKey: null },
  'interview_scheduled':       { templateName: 'interview-scheduled',    preferenceKey: null },
  'info':                      { templateName: 'generic',                preferenceKey: 'application_updates' },
  'warning':                   { templateName: 'generic',                preferenceKey: 'application_updates' },
};

/**
 * Look up the email mapping for a given notification type.
 * Returns the mapping if the type is email-eligible, or `null` otherwise.
 */
export function getEmailMapping(type: string): EmailMapping | null {
  return EMAIL_TYPE_MAP[type] ?? null;
}
