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

import { query } from './db';
import { getR2Storage } from './storage';

// Re-export the Bun-compatible Base64 utility for use by other modules
export { decodeBase64Url } from './base64';

type QueryOperation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

interface Filter {
  column: string;
  op: string;
  value: unknown;
}

/**
 * Mock query builder for backward compatibility
 * Converts Supabase-style queries to SQL
 */
class MockQueryBuilder<T = Record<string, unknown>> {
  private table: string;
  private operation: QueryOperation = 'select';
  private selectColumns = '*';
  private filters: Filter[] = [];
  private orderByColumn?: string;
  private orderAsc = true;
  private limitCount?: number;
  private offsetCount?: number;
  private insertData?: Partial<T> | Partial<T>[];
  private updateData?: Partial<T>;
  private upsertConflict?: string;
  private countOnly = false;
  private headOnly = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*', options?: { count?: string; head?: boolean }): this {
    this.operation = 'select';
    this.selectColumns = columns;
    if (options?.count === 'exact') {
      this.countOnly = true;
    }
    if (options?.head) {
      this.headOnly = true;
    }
    return this;
  }

  insert(data: Partial<T> | Partial<T>[]): this {
    this.operation = 'insert';
    this.insertData = data;
    return this;
  }

  update(data: Partial<T>): this {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  upsert(data: Partial<T> | Partial<T>[], options?: { onConflict?: string }): this {
    this.operation = 'upsert';
    this.insertData = data;
    this.upsertConflict = options?.onConflict || 'id';
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: '=', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: '!=', value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: '>', value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: '>=', value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: '<', value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: '<=', value });
    return this;
  }

  like(column: string, value: string): this {
    this.filters.push({ column, op: 'LIKE', value });
    return this;
  }

  ilike(column: string, value: string): this {
    this.filters.push({ column, op: 'ILIKE', value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, op: 'IN', value: values });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, op: 'IS', value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderByColumn = column;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  async single(): Promise<{ data: T | null; error: Error | null; code?: string }> {
    this.limitCount = 1;
    const result = await this.execute();
    if (result.error) {
      return { data: null, error: result.error, code: (result.error as Error & { code?: string }).code };
    }
    if (!result.data || result.data.length === 0) {
      return { data: null, error: new Error('No rows returned'), code: 'PGRST116' };
    }
    return { data: result.data[0], error: null };
  }

  async maybeSingle(): Promise<{ data: T | null; error: Error | null }> {
    this.limitCount = 1;
    const result = await this.execute();
    return {
      data: result.data?.[0] || null,
      error: result.error,
    };
  }

  private buildWhereClause(): { sql: string; params: unknown[]; nextIndex: number } {
    if (this.filters.length === 0) {
      return { sql: '', params: [], nextIndex: 1 };
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

    return { sql: ` WHERE ${conditions.join(' AND ')}`, params, nextIndex: paramIndex };
  }

  private async executeSelect(): Promise<{ data: T[] | null; error: Error | null; count?: number }> {
    try {
      const { sql: whereClause, params } = this.buildWhereClause();

      // Handle count-only queries
      if (this.countOnly && this.headOnly) {
        const countQuery = `SELECT COUNT(*) as count FROM ${this.table}${whereClause}`;
        const result = await query<{ count: string }>(countQuery, params);
        const count = parseInt(result.rows[0]?.count || '0', 10);
        return { data: null, error: null, count };
      }

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

      // If count was requested, get it separately
      let count: number | undefined;
      if (this.countOnly) {
        const countQuery = `SELECT COUNT(*) as count FROM ${this.table}${whereClause}`;
        const countResult = await query<{ count: string }>(countQuery, params);
        count = parseInt(countResult.rows[0]?.count || '0', 10);
      }

      return { data: result.rows, error: null, count };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  private async executeInsert(): Promise<{ data: T[] | null; error: Error | null }> {
    try {
      const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const results: T[] = [];

      for (const row of rows) {
        if (!row) continue;
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
      const err = error as Error & { code?: string };
      return { data: null, error: err };
    }
  }

  private async executeUpdate(): Promise<{ data: T[] | null; error: Error | null }> {
    try {
      if (!this.updateData) {
        return { data: [], error: null };
      }

      const { sql: whereClause, params: whereParams, nextIndex } = this.buildWhereClause();

      const columns = Object.keys(this.updateData);
      const values = Object.values(this.updateData);
      const setClause = columns.map((col, i) => `${col} = $${nextIndex + i}`).join(', ');

      const sqlQuery = `UPDATE ${this.table} SET ${setClause}${whereClause} RETURNING *`;
      const result = await query<T>(sqlQuery, [...whereParams, ...values]);

      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  private async executeDelete(): Promise<{ data: T[] | null; error: Error | null }> {
    try {
      const { sql: whereClause, params } = this.buildWhereClause();
      const sqlQuery = `DELETE FROM ${this.table}${whereClause} RETURNING *`;
      const result = await query<T>(sqlQuery, params);
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  private async executeUpsert(): Promise<{ data: T[] | null; error: Error | null }> {
    try {
      const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const results: T[] = [];

      for (const row of rows) {
        if (!row) continue;
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const updateClause = columns
          .filter(col => col !== this.upsertConflict)
          .map((col, i) => `${col} = EXCLUDED.${col}`)
          .join(', ');

        const sqlQuery = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders}) 
                          ON CONFLICT (${this.upsertConflict}) DO UPDATE SET ${updateClause} RETURNING *`;

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

  private async execute(): Promise<{ data: T[] | null; error: Error | null; count?: number }> {
    switch (this.operation) {
      case 'insert':
        return this.executeInsert();
      case 'update':
        return this.executeUpdate();
      case 'delete':
        return this.executeDelete();
      case 'upsert':
        return this.executeUpsert();
      case 'select':
      default:
        return this.executeSelect();
    }
  }

  // Make the builder thenable so it can be awaited directly
  async then<TResult1 = { data: T[] | null; error: Error | null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: T[] | null; error: Error | null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this.execute();
      return onfulfilled ? onfulfilled(result) : result as unknown as TResult1;
    } catch (error) {
      if (onrejected) {
        return onrejected(error);
      }
      throw error;
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
      async upload(path: string, file: Buffer | Blob, options?: { contentType?: string; upsert?: boolean }) {
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
async function mockRpc(fn: string, _params?: Record<string, unknown>) {
  console.warn(`[DEPRECATED] supabaseAdmin.rpc('${fn}') is deprecated. Use direct SQL queries instead.`);
  return { data: null, error: new Error(`RPC function '${fn}' not supported. Use direct SQL.`) };
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
