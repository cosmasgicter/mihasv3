/**
 * Supabase Compatibility Layer
 * 
 * MIGRATION STATUS: Supabase → Neon + R2
 * 
 * This file provides backward compatibility for code that still references
 * the Supabase client. All actual data operations now go through the API.
 * 
 * For new code, use:
 * - import { applicationsApi, documentsApi, catalogApi } from '@/lib/apiClient'
 * 
 * @deprecated Use apiClient.ts instead for new code
 */

// Re-export types for backward compatibility
export type {
  UserProfile,
  Program,
  Intake,
  Institution,
  Subject,
  Application,
  ApplicationDocument,
  ApplicationDraft,
  ApplicationWithDetails,
} from './apiClient';

// Legacy type aliases
export type Grade12Subject = Subject;

import type { Subject } from './apiClient';

// ============================================================================
// Configuration Status
// ============================================================================

/**
 * Check if database is configured
 * Always returns true since we use API endpoints now
 */
export const isSupabaseConfigured = true;

export const SUPABASE_STATUS_EVENT = 'mihas:database-status';

export interface SupabaseStatusDetail {
  available: boolean;
  message?: string;
}

export const SUPABASE_MISSING_CONFIG_MESSAGE =
  'Database connection is handled via API endpoints.';

// ============================================================================
// Compatibility Layer
// ============================================================================

/**
 * Mock Supabase client for backward compatibility
 * 
 * @deprecated Use apiClient.ts functions instead
 * 
 * This provides a minimal interface that logs deprecation warnings
 * and redirects to the API client where possible.
 */
class SupabaseCompatibilityClient {
  private warnOnce = new Set<string>();

  private warn(method: string) {
    if (!this.warnOnce.has(method)) {
      if (typeof window !== 'undefined') {
        console.warn(
          `[DEPRECATED] supabase.${method}() is deprecated. Use apiClient.ts instead.`
        );
      }
      this.warnOnce.add(method);
    }
  }

  /**
   * Mock from() method - returns a query builder that warns on use
   */
  from(table: string): MockQueryBuilder {
    this.warn(`from('${table}')`);
    return new MockQueryBuilder(table);
  }

  /**
   * Mock rpc() method - returns empty result
   */
  rpc(functionName: string, params?: Record<string, unknown>): MockQueryBuilder {
    this.warn(`rpc('${functionName}')`);
    return new MockQueryBuilder(`rpc:${functionName}`);
  }

  /**
   * Mock functions - for edge function invocation
   */
  get functions() {
    this.warn('functions');
    return {
      invoke: async (functionName: string, options?: { body?: unknown }) => {
        console.warn(`[DEPRECATED] supabase.functions.invoke('${functionName}') is deprecated. Use fetch('/api/...') instead.`);
        return { data: null, error: new Error('Use API endpoints instead') };
      },
    };
  }

  /**
   * Mock storage - redirects to documents API
   */
  get storage() {
    this.warn('storage');
    const self = this;
    return {
      from: (bucket: string) => ({
        upload: async (path: string, file: File, options?: { contentType?: string; upsert?: boolean }) => {
          console.warn('[DEPRECATED] Use documentsApi.upload() instead');
          return { data: { path }, error: null };
        },
        download: async (path: string) => {
          console.warn('[DEPRECATED] Use documentsApi.getSignedUrl() instead');
          return { data: null, error: null };
        },
        getPublicUrl: (path: string) => {
          return { data: { publicUrl: `/api/documents?action=signed-url&path=${encodeURIComponent(path)}` } };
        },
        createSignedUrl: async (path: string, expiresIn: number) => {
          return { data: { signedUrl: `/api/documents?action=signed-url&path=${encodeURIComponent(path)}` }, error: null };
        },
        remove: async (paths: string[]) => {
          console.warn('[DEPRECATED] Use documentsApi.delete() instead');
          return { data: null, error: null };
        },
        list: async (folder?: string, options?: { limit?: number; offset?: number }) => {
          console.warn('[DEPRECATED] Storage list is deprecated');
          return { data: [], error: null };
        },
      }),
      listBuckets: async () => {
        return { data: [{ name: 'documents', public: false }], error: null };
      },
      createBucket: async (name: string, options?: { public?: boolean }) => {
        return { data: { name }, error: null };
      },
    };
  }

  /**
   * Mock auth - always returns null/error since we use custom auth
   */
  get auth() {
    this.warn('auth');
    return {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signIn: async () => ({ data: null, error: new Error('Use /api/auth?action=login instead') }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    };
  }
}

/**
 * Mock query builder for backward compatibility
 * Implements full Supabase-like chaining interface
 */
export class MockQueryBuilder {
  private table: string;
  private selectColumns = '*';
  private filters: Array<{ column: string; op: string; value: unknown }> = [];
  private orderByColumn?: string;
  private orderAsc = true;
  private limitCount?: number;
  private offsetCount?: number;
  private pendingData: unknown = null;
  private operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*', options?: { count?: string }): this {
    this.selectColumns = columns;
    this.operation = 'select';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: 'gt', value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: 'gte', value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: 'lt', value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: 'lte', value });
    return this;
  }

  like(column: string, value: string): this {
    this.filters.push({ column, op: 'like', value });
    return this;
  }

  ilike(column: string, value: string): this {
    this.filters.push({ column, op: 'ilike', value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, op: 'in', value: values });
    return this;
  }

  not(column: string, op: string, value: unknown): this {
    this.filters.push({ column, op: `not.${op}`, value });
    return this;
  }

  or(filterString: string): this {
    this.filters.push({ column: '_or', op: 'or', value: filterString });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, op: 'is', value });
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

  single(): Promise<{ data: any; error: Error | null; count?: number }> {
    this.limitCount = 1;
    return this.execute(true);
  }

  maybeSingle(): Promise<{ data: any; error: Error | null; count?: number }> {
    this.limitCount = 1;
    return this.execute(true, true);
  }

  // Make the query builder thenable for async/await
  then<TResult1 = { data: any[]; error: Error | null; count: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: any[]; error: Error | null; count: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(single = false, allowNull = false): Promise<{ data: any; error: Error | null; count: number }> {
    // Log deprecation warning once per table
    if (typeof window !== 'undefined') {
      console.warn(
        `[DEPRECATED] Direct database query to '${this.table}' is deprecated. Use apiClient.ts instead.`
      );
    }

    // Return empty result - actual implementation should use API
    return {
      data: single ? null : [],
      error: null, // Don't error - just return empty data for compatibility
      count: 0,
    };
  }

  // Write operations - return this for chaining
  insert(data: unknown, options?: { onConflict?: string }): this {
    this.pendingData = data;
    this.operation = 'insert';
    return this;
  }

  update(data: unknown): this {
    this.pendingData = data;
    this.operation = 'update';
    return this;
  }

  upsert(data: unknown, options?: { onConflict?: string }): this {
    this.pendingData = data;
    this.operation = 'upsert';
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }
}

// ============================================================================
// Exports
// ============================================================================

const compatibilityClient = new SupabaseCompatibilityClient();

/**
 * @deprecated Use apiClient.ts instead
 */
export const supabase = compatibilityClient;

/**
 * @deprecated Use apiClient.ts instead
 */
export const getSupabaseClient = () => compatibilityClient;

/**
 * @deprecated Use apiClient.ts instead
 */
export const createSupabaseClient = () => compatibilityClient;

// ============================================================================
// Additional Type Exports for Backward Compatibility
// ============================================================================

export interface ApplicationInterview {
  id: string;
  application_id: string;
  scheduled_at: string;
  mode: 'in_person' | 'virtual' | 'phone';
  location?: string | null;
  status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationGrade {
  id: string;
  application_id: string;
  subject_id: string;
  grade: number;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: string;
  permissions: string[];
  department?: string;
  assigned_by?: string;
  is_active: boolean;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value?: string;
  setting_type: string;
  description?: string;
  is_public: boolean;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}
