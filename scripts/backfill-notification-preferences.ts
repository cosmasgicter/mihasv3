import { query } from '../lib/db'

async function runBackfill() {
  await query(`
    ALTER TABLE user_notification_preferences
      ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN,
      ADD COLUMN IF NOT EXISTS in_app_enabled BOOLEAN,
      ADD COLUMN IF NOT EXISTS marketing_emails BOOLEAN
  `)

  await query(`
    INSERT INTO user_notification_preferences (
      id,
      user_id,
      email_enabled,
      push_enabled,
      sms_enabled,
      whatsapp_enabled,
      in_app_enabled,
      application_updates,
      payment_reminders,
      interview_reminders,
      marketing_emails,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      p.id,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      FALSE,
      NOW(),
      NOW()
    FROM profiles p
    LEFT JOIN user_notification_preferences np ON np.user_id = p.id
    WHERE np.user_id IS NULL
  `)

  const result = await query(`
    UPDATE user_notification_preferences
    SET
      email_enabled = TRUE,
      push_enabled = TRUE,
      sms_enabled = COALESCE(sms_enabled, TRUE),
      whatsapp_enabled = COALESCE(whatsapp_enabled, TRUE),
      in_app_enabled = TRUE,
      application_updates = COALESCE(application_updates, TRUE),
      payment_reminders = COALESCE(payment_reminders, TRUE),
      interview_reminders = COALESCE(interview_reminders, TRUE),
      marketing_emails = COALESCE(marketing_emails, FALSE),
      updated_at = NOW()
    WHERE
      email_enabled IS NULL
      OR email_enabled = FALSE
      OR push_enabled IS NULL
      OR push_enabled = FALSE
      OR in_app_enabled IS NULL
      OR in_app_enabled = FALSE
      OR sms_enabled IS NULL
      OR whatsapp_enabled IS NULL
      OR application_updates IS NULL
      OR payment_reminders IS NULL
      OR interview_reminders IS NULL
      OR marketing_emails IS NULL
  `)

  console.log(`[backfill-notification-preferences] Updated rows: ${result.rowCount ?? 0}`)
}

runBackfill()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[backfill-notification-preferences] Failed:', error)
    process.exit(1)
  })
