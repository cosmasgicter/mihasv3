import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { data: emails } = await supabase
      .from('email_notifications')
      .select('*')
      .eq('status', 'pending')
      .limit(10)

    let sent = 0, failed = 0

    for (const email of emails || []) {
      try {
        const { error } = await supabase.functions.invoke('send-email', {
          body: { to: email.recipient_email, subject: email.subject, html: email.body }
        })

        if (error) throw error

        await supabase
          .from('email_notifications')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', email.id)
        
        sent++
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

    res.json({ sent, failed })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}