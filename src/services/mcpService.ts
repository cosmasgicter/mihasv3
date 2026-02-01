/**
 * MCP Service - Database query interface
 * Uses HTTP-only cookie authentication
 */

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
      return path
    }
  }

  private static async makeRequest(path: string, options: RequestInit = {}) {
    const endpoint = this.resolveUrl(path)
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> ?? {})
    }

    if (options.body && !('Content-Type' in headers)) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(endpoint, {
      ...options,
      credentials: 'include', // Use HTTP-only cookie auth
      headers
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required')
      }
      throw new Error(`MCP API error: ${response.statusText}`)
    }

    return response.json()
  }

  static async query(sql: string, params?: any[]) {
    return this.makeRequest('/mcp/query', {
      method: 'POST',
      body: JSON.stringify({ sql, params }),
    })
  }

  static async getSchema() {
    return this.makeRequest('/mcp/schema')
  }

  static async getTableInfo(tableName: string) {
    const queryParam = encodeURIComponent(tableName)
    return this.makeRequest(`/mcp/schema?table=${queryParam}`)
  }
}