/**
 * Supabase Stub - MIGRATION COMPLETE
 * 
 * This file provides stub exports for backward compatibility.
 * All actual data operations now go through the API endpoints.
 * 
 * For new code, use:
 * - src/lib/apiClient.ts for API calls
 * - /api/documents for file operations
 * - /api/auth for authentication
 */

// Configuration status - always true since we use API endpoints
export const isSupabaseConfigured = true;

export const SUPABASE_STATUS_EVENT = 'mihas:database-status';

export interface SupabaseStatusDetail {
  available: boolean;
  message?: string;
}

export const SUPABASE_MISSING_CONFIG_MESSAGE =
  'Database connection is handled via API endpoints.';

/**
 * Mock query builder for backward compatibility
 */
class MockQueryBuilder {
  private tableName: string;
  
  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns?: string) {
    console.warn(`[DEPRECATED] supabase.from('${this.tableName}').select() - Use API endpoints instead`);
    return this;
  }

  insert(data: unknown) {
    console.warn(`[DEPRECATED] supabase.from('${this.tableName}').insert() - Use API endpoints instead`);
    return this;
  }

  update(data: unknown) {
    console.warn(`[DEPRECATED] supabase.from('${this.tableName}').update() - Use API endpoints instead`);
    return this;
  }

  delete() {
    console.warn(`[DEPRECATED] supabase.from('${this.tableName}').delete() - Use API endpoints instead`);
    return this;
  }

  eq(column: string, value: unknown) { return this; }
  neq(column: string, value: unknown) { return this; }
  gt(column: string, value: unknown) { return this; }
  gte(column: string, value: unknown) { return this; }
  lt(column: string, value: unknown) { return this; }
  lte(column: string, value: unknown) { return this; }
  like(column: string, value: string) { return this; }
  ilike(column: string, value: string) { return this; }
  is(column: string, value: unknown) { return this; }
  in(column: string, values: unknown[]) { return this; }
  contains(column: string, value: unknown) { return this; }
  containedBy(column: string, value: unknown) { return this; }
  range(column: string, range: string) { return this; }
  textSearch(column: string, query: string) { return this; }
  filter(column: string, operator: string, value: unknown) { return this; }
  not(column: string, operator: string, value: unknown) { return this; }
  or(filters: string) { return this; }
  match(query: Record<string, unknown>) { return this; }
  order(column: string, options?: { ascending?: boolean }) { return this; }
  limit(count: number) { return this; }
  offset(count: number) { return this; }
  single() { return this; }
  maybeSingle() { return this; }

  async then(resolve: (value: { data: null; error: Error }) => void) {
    resolve({ data: null, error: new Error('Use API endpoints instead of direct Supabase calls') });
  }
}

/**
 * Mock storage for backward compatibility
 */
const mockStorage = {
  from: (bucket: string) => ({
    upload: async () => ({ data: null, error: new Error('Use /api/documents for uploads') }),
    download: async () => ({ data: null, error: new Error('Use /api/documents for downloads') }),
    remove: async () => ({ data: null, error: new Error('Use /api/documents for deletions') }),
    list: async () => ({ data: [], error: null }),
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
    createSignedUrl: async () => ({ data: null, error: new Error('Use /api/documents for signed URLs') }),
  }),
  listBuckets: async () => ({ data: [], error: null }),
  createBucket: async () => ({ data: null, error: new Error('Buckets are pre-configured in R2') }),
};

/**
 * Mock functions for backward compatibility
 */
const mockFunctions = {
  invoke: async (functionName: string) => {
    console.warn(`[DEPRECATED] supabase.functions.invoke('${functionName}') - Use fetch('/api/...') instead`);
    return { data: null, error: new Error('Use API endpoints instead') };
  },
};

/**
 * Mock auth for backward compatibility
 */
const mockAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
  signOut: async () => ({ error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
};

/**
 * Mock Supabase client
 * @deprecated Use apiClient.ts instead
 */
class SupabaseStub {
  storage = mockStorage;
  functions = mockFunctions;
  auth = mockAuth;

  from(table: string) {
    return new MockQueryBuilder(table);
  }

  rpc(functionName: string, params?: unknown) {
    console.warn(`[DEPRECATED] supabase.rpc('${functionName}') - Use API endpoints instead`);
    return Promise.resolve({ data: null, error: new Error('Use API endpoints instead') });
  }
}

const stubClient = new SupabaseStub();

/**
 * @deprecated Use apiClient.ts instead
 */
export const supabase = stubClient;

/**
 * @deprecated Use apiClient.ts instead
 */
export const getSupabaseClient = () => stubClient;

/**
 * @deprecated Use apiClient.ts instead
 */
export const createSupabaseClient = () => stubClient;
