import { createClient } from '../../_lib/supabaseClient.js'
import { sendEmail } from '../../_lib/emailService.js'

export async function onRequestPost(context) {
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY)
  
  const authHeader = context.request.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  try {
    const { userIds, subject, message } = await context.request.json()

    if (!userIds?.length || !subject || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    const { data: users } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds)

    const results = { success: 0, failed: 0, errors: [] }

    for (const user of users || []) {
      try {
        await sendEmail({
          to: user.email,
          subject,
          html: `<p>Dear ${user.full_name || 'User'},</p><p>${message}</p>`
        })
        results.success++
      } catch (error) {
        results.failed++
        results.errors.push(`${user.email}: ${error.message}`)
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
