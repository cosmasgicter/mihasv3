import { supabase } from '@/lib/supabase'

const COLUMNS = 'id, application_number, status, created_at, submitted_at, user_id, full_name, email, phone, program, intake, institution, payment_status, application_fee, paid_amount'

export const optimizedApplicationService = {
  async list(filters: any, limit = 50) {
    let query = supabase
      .from('admin_application_detailed')
      .select(COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (filters.searchTerm) {
      const pattern = `%${filters.searchTerm}%`
      query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern},application_number.ilike.${pattern}`)
    }

    if (filters.statusFilter) {
      query = query.eq('status', filters.statusFilter)
    }

    if (filters.paymentFilter) {
      query = query.eq('payment_status', filters.paymentFilter)
    }

    if (filters.programFilter) {
      query = query.eq('program', filters.programFilter)
    }

    if (filters.institutionFilter) {
      query = query.eq('institution', filters.institutionFilter)
    }

    return query
  },

  async getById(id: string) {
    return supabase
      .from('applications')
      .select('*, profiles!inner(full_name, email)')
      .eq('id', id)
      .single()
  }
}
