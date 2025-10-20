import { getSupabaseClient } from '@/lib/supabase'

export async function syncUserRole(userId: string, role: string) {
  const supabase = getSupabaseClient()

  const { data: existingRole } = await supabase
    .from('user_roles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (existingRole) {
    await supabase
      .from('user_roles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
  } else {
    await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role,
        is_active: true
      })
  }

  await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
}
