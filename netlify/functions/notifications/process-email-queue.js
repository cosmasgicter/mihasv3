const { supabaseAdminClient } = require('../_lib/supabaseClient')

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { data: emails } = await supabaseAdminClient
      .from('email_notifications')
      .select('*')
      .eq('status', 'pending')
      .limit(10)

    let sent = 0, failed = 0

    for (const email of emails || []) {
      try {
        const { error } = await supabaseAdminClient.functions.invoke('send-email', {
          body: { to: email.recipient_email, subject: email.subject, html: email.body }
        })

        if (error) throw error

        await supabaseAdminClient
          .from('email_notifications')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', email.id)
        
        sent++
      } catch (error) {
        await supabaseAdminClient
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

    return res.status(200).json({ sent, failed })
  } catch (error) {
    console.error('Queue processing error:', error)
    return res.status(500).json({ error: error.message })
  }
}