/**
 * MCP Service - Database query interface
 *
 * TODO: No /api/mcp endpoint exists in the backend.
 * All methods are stubbed until the endpoint is implemented.
 * Previously used raw fetch() to non-existent /mcp/query and /mcp/schema routes.
 */

export class MCPService {
  static async query(_sql: string, _params?: any[]) {
    throw new Error('MCP query endpoint is not available. No /api/mcp endpoint exists in the backend.')
  }

  static async getSchema() {
    throw new Error('MCP schema endpoint is not available. No /api/mcp endpoint exists in the backend.')
  }

  static async getTableInfo(_tableName: string) {
    throw new Error('MCP table info endpoint is not available. No /api/mcp endpoint exists in the backend.')
  }
}
