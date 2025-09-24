import { createClient } from '@supabase/supabase-js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js'
import { createDurationTimer, reportFunctionExecution, reportQueueMetrics } from './_lib/scalingMetrics.js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const measureDuration = createDurationTimer()

  try {
    const { data: emails, count, error: fetchError } = await supabase
      .from('email_notifications')
      .select('*', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchError) {
      throw fetchError
    }

    let sent = 0, failed = 0

    const pendingCount = count ?? emails?.length ?? 0
    const oldestEmail = emails?.[0] || null
    const oldestEntryAgeMs = oldestEmail?.created_at
      ? Date.now() - new Date(oldestEmail.created_at).getTime()
      : null

    if (pendingCount !== null && pendingCount !== undefined) {
      await reportQueueMetrics('notifications-process-email-queue', {
        depth: pendingCount,
        oldestEntryAgeMs,
        attributes: { stage: 'pre-dispatch' }
      })
    }

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

    const remainingDepth = Math.max((pendingCount || 0) - sent, 0)

    await reportQueueMetrics('notifications-process-email-queue', {
      depth: remainingDepth,
      oldestEntryAgeMs: null,
      attributes: { stage: 'post-dispatch' }
    })

    await reportFunctionExecution('notifications-process-email-queue', {
      durationMs: measureDuration(),
      status: 'success',
      queueDepth: remainingDepth,
      attributes: { processed: sent, failed }
    })

    res.json({ sent, failed })
  } catch (error) {
    await reportFunctionExecution('notifications-process-email-queue', {
      durationMs: measureDuration(),
      status: 'error',
      errorMessage: error?.message,
      attributes: { stage: 'handler' }
    })
    res.status(500).json({ error: error.message })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
