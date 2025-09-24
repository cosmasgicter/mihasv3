import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  try {
    const { data: emails, error: fetchError } = await supabase
      .from('email_notifications')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchError) throw fetchError

    let sent = 0, failed = 0

    for (const email of emails || []) {
      try {
        const { data: result, error: invocationError } = await supabase.functions.invoke('send-email', {
          body: { to: email.recipient_email, subject: email.subject, html: email.body }
        })

        if (!invocationError && result?.success) {
          await supabase
            .from('email_notifications')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', email.id)
          sent++
        } else {
          await supabase
            .from('email_notifications')
            .update({
              status: 'failed',
              error_message: invocationError?.message || 'Send failed',
              retry_count: (email.retry_count || 0) + 1
            })
            .eq('id', email.id)
          failed++
        }
      } catch (error) {
        await supabase
          .from('email_notifications')
          .update({
            status: 'failed',
            error_message: error.message,
            retry_count: (email.retry_count || 0) + 1
          })
          .eq('id', email.id)
        failed++
      }
    }

    return new Response(JSON.stringify({ sent, failed }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers })
  }
}
