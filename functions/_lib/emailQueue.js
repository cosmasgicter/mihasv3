import { supabaseAdminClient } from './supabaseClient.js';

/**
 * Queue an email for later processing
 */
export async function queueEmail({ to, subject, html, priority = 'normal', scheduledFor = null }) {
  try {
    const { data, error } = await supabaseAdminClient
      .from('email_queue')
      .insert({
        to_email: to,
        subject,
        template: html,
        priority,
        status: 'pending',
        scheduled_for: scheduledFor,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Failed to queue email:', error);
    return { success: false, error: error.message };
  }
}
