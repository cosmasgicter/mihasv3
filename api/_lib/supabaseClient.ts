/**
 * Database Client - Neon Postgres
 * 
 * MIGRATION STATUS: Supabase → Neon + R2
 * 
 * This file provides backward compatibility for code that still references
 * the Supabase admin client. All database operations now go through db.ts.
 * Storage operations go through storage.ts (R2).
 * 
 * For new code, use:
 * - import { query, transaction } from './db'
 * - import { getR2Storage } from './storage'
 * 
 * @deprecated Use db.ts and storage.ts instead
 */

import { query, QueryResult } from './db';
import { getR2Storage } from './storage';

// Re-export the Bun-compatible Base64 utility for use by other modules
export { decodeBase64Url } from './base64';

/**
 * Mock query builder for backward compatibility
 * Converts Supabase-style queries to SQL
 */
class MockQueryBuilder<T = Record<string, unknown>> {
  private table: string;
  private selectColumns = '*';
  private filters: Array<{ column: string; op: string; value: unknown }> = [];
  private orderByColumn?: string;
  private orderAsc = true;
  private limitCount?: number;
  private offsetCount?: number;
  private returningColumns?: string;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*', _options?: { count?: string }) {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: '=', value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, op: '!=', value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ column, op: '>', value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, op: '>=', value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ column, op: '<', value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, op: '<=', value });
    return this;
  }

  like(column: string, value: string) {
    this.filters.push({ column, op: 'LIKE', value });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ column, op: 'ILIKE', value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, op: 'IN', value: values });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ column, op: 'IS', value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderByColumn = column;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  async single(): Promise<{ data: T | null; error: Error | null }> {
    this.limitCount = 1;
    const result = await this.execute();
    return {
      data: result.data?.[0] || null,
      error: result.error,
    };
  }

  async maybeSingle(): Promise<{ data: T | null; error: Error | null }> {
    return this.single();
  }

  private buildWhereClause(): { sql: string; params: unknown[] } {
    if (this.filters.length === 0) {
      return { sql: '', params: [] };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const filter of this.filters) {
      if (filter.op === 'IN' && Array.isArray(filter.value)) {
        const placeholders = filter.value.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`${filter.column} IN (${placeholders})`);
        params.push(...filter.value);
      } else if (filter.op === 'IS') {
        conditions.push(`${filter.column} IS ${filter.value === null ? 'NULL' : 'NOT NULL'}`);
      } else {
        conditions.push(`${filter.column} ${filter.op} $${paramIndex++}`);
        params.push(filter.value);
      }
    }

    return { sql: ` WHERE ${conditions.join(' AND ')}`, params };
  }

  private async execute(): Promise<{ data: T[] | null; error: Error | null; count?: number }> {
    try {
      const { sql: whereClause, params } = this.buildWhereClause();
      
      let sqlQuery = `SELECT ${this.selectColumns} FROM ${this.table}${whereClause}`;
      
      if (this.orderByColumn) {
        sqlQuery += ` ORDER BY ${this.orderByColumn} ${this.orderAsc ? 'ASC' : 'DESC'}`;
      }
      
      if (this.limitCount !== undefined) {
        sqlQuery += ` LIMIT ${this.limitCount}`;
      }
      
      if (this.offsetCount !== undefined) {
        sqlQuery += ` OFFSET ${this.offsetCount}`;
      }

      const result = await query<T>(sqlQuery, params);
      return { data: result.rows, error: null, count: result.rowCount };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async then<TResult>(
    resolve: (value: { data: T[] | null; error: Error | null }) => TResult
  ): Promise<TResult> {
    const result = await this.execute();
    return resolve(result);
  }

  // Write operations
  async insert(data: Partial<T> | Partial<T>[]): Promise<{ data: T[] | null; error: Error | null }> {
    try {
      const rows = Array.isArray(data) ? data : [data];
      const results: T[] = [];

      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        
        const sqlQuery = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
        const result = await query<T>(sqlQuery, values);
        if (result.rows[0]) {
          results.push(result.rows[0]);
        }
      }

      return { data: results, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async update(data: Partial<T>): Promise<{ data: T[] | null; error: Error | null }> {
    try {
      const { sql: whereClause, params: whereParams } = this.buildWhereClause();
      
      const columns = Object.keys(data);
      const values = Object.values(data);
      const setClause = columns.map((col, i) => `${col} = $${whereParams.length + i + 1}`).join(', ');
      
      const sqlQuery = `UPDATE ${this.table} SET ${setClause}${whereClause} RETURNING *`;
      const result = await query<T>(sqlQuery, [...whereParams, ...values]);
      
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async upsert(
    data: Partial<T> | Partial<T>[],
    options?: { onConflict?: string }
  ): Promise<{ data: T[] | null; error: Error | null }> {
    try {
      const rows = Array.isArray(data) ? data : [data];
      const results: T[] = [];

      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const updateClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
        
        const conflictTarget = options?.onConflict || 'id';
        const sqlQuery = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders}) 
                          ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateClause} RETURNING *`;
        
        const result = await query<T>(sqlQuery, values);
        if (result.rows[0]) {
          results.push(result.rows[0]);
        }
      }

      return { data: results, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async delete(): Promise<{ data: T[] | null; error: Error | null }> {
    try {
      const { sql: whereClause, params } = this.buildWhereClause();
      const sqlQuery = `DELETE FROM ${this.table}${whereClause} RETURNING *`;
      const result = await query<T>(sqlQuery, params);
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }
}

/**
 * Mock storage interface for R2
 */
const mockStorage = {
  from: (bucket: string) => {
    const r2 = getR2Storage();
    
    return {
      async upload(path: string, file: Buffer | Blob, options?: { contentType?: string }) {
        const buffer = file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;
        const result = await r2.upload(`${bucket}/${path}`, buffer, options?.contentType);
        
        if (result.success) {
          return { data: { path: result.path }, error: null };
        }
        return { data: null, error: new Error(result.error) };
      },

      async download(path: string) {
        const data = await r2.download(`${bucket}/${path}`);
        if (data) {
          return { data, error: null };
        }
        return { data: null, error: new Error('File not found') };
      },

      getPublicUrl(path: string) {
        return { data: { publicUrl: r2.getPublicUrl(`${bucket}/${path}`) } };
      },

      async createSignedUrl(path: string, expiresIn: number) {
        const url = r2.getSignedUrl(`${bucket}/${path}`, expiresIn);
        return { data: { signedUrl: url }, error: null };
      },

      async remove(paths: string[]) {
        const errors: string[] = [];
        for (const path of paths) {
          const success = await r2.delete(`${bucket}/${path}`);
          if (!success) {
            errors.push(path);
          }
        }
        if (errors.length > 0) {
          return { data: null, error: new Error(`Failed to delete: ${errors.join(', ')}`) };
        }
        return { data: { message: 'Deleted' }, error: null };
      },

      async list(prefix?: string, options?: { limit?: number }) {
        const files = await r2.list(prefix ? `${bucket}/${prefix}` : bucket, options?.limit);
        return { data: files.map(f => ({ name: f })), error: null };
      },
    };
  },
};

/**
 * Mock RPC function - converts to direct SQL
 */
async function mockRpc(fn: string, params?: Record<string, unknown>) {
  console.warn(`[DEPRECATED] supabaseAdmin.rpc('${fn}') is deprecated. Use direct SQL queries instead.`);
  
  // Handle common RPC functions
  switch (fn) {
    case 'get_admin_dashboard_stats':
      // This should be called via /api/admin?action=stats instead
      return { data: null, error: new Error('Use /api/admin?action=stats instead') };
    
    default:
      return { data: null, error: new Error(`RPC function '${fn}' not supported. Use direct SQL.`) };
  }
}

/**
 * Get admin client - now returns mock client that uses db.ts
 * @deprecated Use query() from db.ts directly
 */
export function getSupabaseAdmin() {
  return {
    from: <T = Record<string, unknown>>(table: string) => new MockQueryBuilder<T>(table),
    storage: mockStorage,
    rpc: mockRpc,
  };
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use query() from db.ts and getR2Storage() from storage.ts
 */
export const supabaseAdmin = {
  from: <T = Record<string, unknown>>(table: string) => new MockQueryBuilder<T>(table),
  storage: mockStorage,
  rpc: mockRpc,
};
