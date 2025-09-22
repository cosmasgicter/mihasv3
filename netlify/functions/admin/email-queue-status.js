import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get queue statistics
    const { data: stats, error } = await supabase
      .from('email_notifications')
      .select('status, retry_count')

    if (error) throw error

    const summary = stats.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1
      if (row.status === 'failed') {
        acc.failed_retries = (acc.failed_retries || 0) + (row.retry_count || 0)
      }
      return acc
    }, {})

    // Get recent failures
    const { data: recentFailures } = await supabase
      .from('email_notifications')
      .select('id, recipient_email, error_message, retry_count, created_at')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(5)

    res.status(200).json({
      summary,
      recent_failures: recentFailures || [],
      last_checked: new Date().toISOString()
    })

  } catch (error) {
    console.error('Queue status error:', error)
    res.status(500).json({ error: error.message })
  }
}