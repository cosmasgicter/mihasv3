import { supabase } from '../lib/supabase'

export class MCPService {
  private static resolveUrl(path: string) {
    if (/^https?:\/\//i.test(path)) {
      return path
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL || ''
    if (!baseUrl) {
      return path
    }

    try {
      return new URL(path, baseUrl).toString()
    } catch (error) {
      console.warn('Failed to resolve MCP service URL, falling back to relative path', error)
      return path
    }
  }

  private static async makeRequest(path: string, options: RequestInit = {}) {
    // Get the current session token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('Authentication required')
    }

    const endpoint = this.resolveUrl(path)
    const headers = {
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers as Record<string, string> ?? {})
    }

    if (options.body && !('Content-Type' in headers)) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(endpoint, {
      ...options,
      headers
    })

    if (!response.ok) {
      throw new Error(`MCP API error: ${response.statusText}`)
    }

    return response.json()
  }

  static async query(sql: string, params?: any[]) {
    return this.makeRequest('/api/mcp/query', {
      method: 'POST',
      body: JSON.stringify({ sql, params }),
    })
  }

  static async getSchema() {
    return this.makeRequest('/api/mcp/schema')
  }

  static async getTableInfo(tableName: string) {
    const queryParam = encodeURIComponent(tableName)
    return this.makeRequest(`/api/mcp/schema?table=${queryParam}`)
  }
}