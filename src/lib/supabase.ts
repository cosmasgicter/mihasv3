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

// ============================================================================
// Type Exports for Backward Compatibility
// ============================================================================

export interface Application {
  id: string;
  user_id: string;
  application_number?: string;
  tracking_code?: string;
  status: string;
  program?: string;
  intake?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  nrc?: string;
  date_of_birth?: string;
  gender?: string;
  nationality?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  postal_code?: string;
  result_slip_url?: string;
  created_at?: string;
  updated_at?: string;
  submitted_at?: string;
  payment_status?: string;
  payment_verified_at?: string;
  review_started_at?: string;
  decision_date?: string;
  decision_reason?: string;
  admin_feedback?: string;
  [key: string]: unknown;
}

export interface ApplicationInterview {
  id: string;
  application_id: string;
  scheduled_at: string;
  mode: 'in_person' | 'virtual' | 'phone';
  location?: string | null;
  interviewer_id?: string;
  status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  // Legacy field aliases for backward compatibility
  scheduled_date?: string;
  scheduled_time?: string;
}

export interface Program {
  id: string;
  name: string;
  code?: string;
  description?: string;
  duration_months?: number;
  institution_id?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Intake {
  id: string;
  name: string;
  start_date?: string;
  end_date?: string;
  application_deadline?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string;
  user_id?: string;
  email: string;
  role: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  date_of_birth?: string;
  sex?: string;
  residence_town?: string;
  nationality?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  avatar_url?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  postal_code?: string;
  [key: string]: unknown; // Allow additional fields for flexibility
}

export interface Subject {
  id: string;
  name: string;
  code?: string;
  category?: string;
  is_active?: boolean;
}

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: string;
  file_path?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApplicationGrade {
  id: string;
  application_id: string;
  subject_id: string;
  grade: string;
  points?: number;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Configuration
// ============================================================================

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

  select(columns?: string, options?: { count?: string; head?: boolean }) {
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

  upsert(data: unknown, options?: { onConflict?: string }) {
    console.warn(`[DEPRECATED] supabase.from('${this.tableName}').upsert() - Use API endpoints instead`);
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
  range(from: string | number, to: string | number) { return this; }
  textSearch(column: string, query: string) { return this; }
  filter(column: string, operator: string, value: unknown) { return this; }
  not(column: string, operator: string, value: unknown) { return this; }
  or(filters: string) { return this; }
  match(query: Record<string, unknown>) { return this; }
  order(column: string, options?: { ascending?: boolean }) { return this; }
  limit(count: number) { return this; }
  offset(count: number) { return this; }
  
  single(): Promise<{ data: any; error: Error }> {
    return Promise.resolve({ data: null, error: new Error('Use API endpoints instead of direct Supabase calls') });
  }
  
  maybeSingle(): Promise<{ data: any; error: Error }> {
    return Promise.resolve({ data: null, error: new Error('Use API endpoints instead of direct Supabase calls') });
  }

  async then(resolve: (value: { data: null; error: Error; count?: number }) => void) {
    resolve({ data: null, error: new Error('Use API endpoints instead of direct Supabase calls'), count: 0 });
  }
}

/**
 * Mock storage for backward compatibility
 */
const mockStorage = {
  from: (bucket: string) => ({
    upload: async (path?: string, file?: unknown, options?: unknown) => ({ data: null, error: new Error('Use /api/documents for uploads') }),
    download: async (path?: string) => ({ data: null, error: new Error('Use /api/documents for downloads') }),
    remove: async (paths?: string[]) => ({ data: null, error: new Error('Use /api/documents for deletions') }),
    list: async (path?: string) => ({ data: [], error: null }),
    getPublicUrl: (path?: string) => ({ data: { publicUrl: '' } }),
    createSignedUrl: async (path?: string, expiresIn?: number) => ({ data: null, error: new Error('Use /api/documents for signed URLs') }),
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
