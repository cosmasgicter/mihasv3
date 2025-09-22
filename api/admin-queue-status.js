import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const { data } = await supabase
    .from('email_notifications')
    .select('status, retry_count, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const stats = data?.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {}) || {}

  const failures = data?.filter(row => row.status === 'failed').slice(0, 5) || []

  res.json({ stats, failures, total: data?.length || 0 })
}