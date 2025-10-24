import { supabaseAdminClient } from '../../_lib/supabaseClient.js'

export async function onRequestGet(context) {
  const supabase = supabaseAdminClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY)
  
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
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, phone_number, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    const csv = [
      ['ID', 'Email', 'Full Name', 'Role', 'Phone', 'Created At'].join(','),
      ...users.map(u => [
        u.id,
        u.email,
        `"${u.full_name || ''}"`,
        u.role,
        u.phone_number || '',
        new Date(u.created_at).toISOString()
      ].join(','))
    ].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="users-export-${Date.now()}.csv"`
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
