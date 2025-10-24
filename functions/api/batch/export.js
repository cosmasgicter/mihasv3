import { supabaseAdminClient } from '../../_lib/supabaseClient.js'

export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdminClient.auth.getUser(token)
  
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { data: profile } = await supabaseAdminClient.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const { data: users, error } = await supabaseAdminClient
      .from('profiles')
      .select('id, email, full_name, role, phone, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    const csv = [
      ['ID', 'Email', 'Full Name', 'Role', 'Phone', 'Created At'].join(','),
      ...users.map(u => [
        u.id,
        u.email,
        `"${u.full_name || ''}"`,
        u.role,
        u.phone || '',
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
