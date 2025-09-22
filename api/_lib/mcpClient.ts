import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL environment variable is required')
}

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

export class SupabaseMCPClient {
  private static instance: SupabaseMCPClient
  
  static getInstance(): SupabaseMCPClient {
    if (!SupabaseMCPClient.instance) {
      SupabaseMCPClient.instance = new SupabaseMCPClient()
    }
    return SupabaseMCPClient.instance
  }

  async query(sql: string, params?: any[]) {
    try {
      const { data, error } = await supabase.rpc('execute_sql', {
        query: sql,
        parameters: params || []
      })
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('MCP Supabase query error:', error)
      throw error
    }
  }

  async getSchema() {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_schema')
      .eq('table_schema', 'public')
    
    if (error) throw error
    return data
  }

  async getTableInfo(tableName: string) {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', tableName)
    
    if (error) throw error
    return data
  }
}

export const mcpSupabase = SupabaseMCPClient.getInstance()