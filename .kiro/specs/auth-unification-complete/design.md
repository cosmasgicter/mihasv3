# Auth Unification - Technical Design

## Overview

This document details the technical approach for completing the auth migration from hybrid Supabase/Custom to unified custom JWT authentication.

---

## 1. Architecture

### 1.1 Current State (Hybrid)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  Token Sources:                                                  │
│  ├── localStorage['mihas-auth-token']  ← XSS VULNERABLE         │
│  ├── supabase.auth.getSession()        ← LEGACY                 │
│  └── HTTP-only cookies                 ← NOT USED BY FRONTEND   │
│                                                                  │
│  Auth Hooks:                                                     │
│  ├── useSessionListener.ts → Uses Supabase + localStorage       │
│  ├── useAuth.ts            → Uses custom API                    │
│  └── authApi.ts            → Uses Supabase tokens               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  Auth Methods:                                                   │
│  ├── api/_lib/auth/middleware.ts  → Custom JWT (3 endpoints)    │
│  └── api/_lib/supabaseClient.ts   → Supabase SDK (5 endpoints)  │
│                                                                  │
│  Database Access:                                                │
│  ├── api/_lib/db.ts + queries.ts  → Abstraction (3 endpoints)   │
│  └── supabaseAdmin.from()         → Direct SDK (5 endpoints)    │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Target State (Unified)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  Token Source: HTTP-only cookies ONLY                           │
│                                                                  │
│  Auth Flow:                                                      │
│  ├── Login  → POST /api/auth?action=login → Cookie set          │
│  ├── Check  → GET /api/auth?action=session → Read from cookie   │
│  ├── Logout → POST /api/auth?action=logout → Cookie cleared     │
│  └── All API calls use credentials: 'include'                   │
│                                                                  │
│  State Management:                                               │
│  ├── authStore.ts  → Zustand (UI state only)                    │
│  └── useAuth.ts    → React Query (server state)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  Auth: api/_lib/auth/middleware.ts (ALL endpoints)              │
│  ├── getAuthUser()   → Extract from cookie/Bearer               │
│  ├── requireAuth()   → Require valid token                      │
│  └── requireRole()   → Require specific role                    │
│                                                                  │
│  Database: api/_lib/db.ts + queries.ts (ALL endpoints)          │
│  └── query<T>(sql, params) → Type-safe queries                  │
│                                                                  │
│  Security: withArcjetProtection() (ALL endpoints)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Backend Migration Design

### 2.1 Endpoint Migration Pattern

Each endpoint follows this migration pattern:

**Before (Supabase SDK):**
```typescript
import { supabaseAdmin, getUserFromRequest } from './_lib/supabaseClient';

export default async function handler(req, res) {
  const auth = await getUserFromRequest(req);
  if ('error' in auth) return sendError(res, auth.error, 401);
  
  const { data, error } = await supabaseAdmin
    .from('table')
    .select('*')
    .eq('user_id', auth.user.id);
}
```

**After (Custom Auth + DB Abstraction):**
```typescript
import { getAuthUser, requireAuth } from './_lib/auth/middleware';
import { withArcjetProtection } from './_lib/arcjet';
import { query } from './_lib/db';
import { TableQueries } from './_lib/queries';

async function handler(req, res) {
  const user = await requireAuth(req);
  
  const q = TableQueries.findByUserId(user.userId);
  const result = await query(q.text, q.values);
}

export default withArcjetProtection(handler, 'general');
```

### 2.2 Query Builder Extensions

Add to `api/_lib/queries.ts`:

```typescript
// Applications queries
export const ApplicationQueries = {
  findAll: () => ({
    text: `SELECT * FROM applications ORDER BY created_at DESC`,
    values: []
  }),
  
  findByUserId: (userId: string) => ({
    text: `SELECT * FROM applications WHERE user_id = $1 ORDER BY created_at DESC`,
    values: [userId]
  }),
  
  findById: (id: string) => ({
    text: `SELECT * FROM applications WHERE id = $1`,
    values: [id]
  }),
  
  findByIdWithDetails: (id: string) => ({
    text: `
      SELECT a.*, 
             json_agg(DISTINCT d.*) as documents,
             json_agg(DISTINCT g.*) as grades
      FROM applications a
      LEFT JOIN application_documents d ON d.application_id = a.id
      LEFT JOIN application_grades g ON g.application_id = a.id
      WHERE a.id = $1
      GROUP BY a.id
    `,
    values: [id]
  }),
  
  updateStatus: (id: string, status: string, reviewedBy: string, notes?: string) => ({
    text: `
      UPDATE applications 
      SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_notes = $4, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    values: [id, status, reviewedBy, notes || null]
  }),
  
  // ... more queries
};

// Documents queries
export const DocumentQueries = {
  findAll: () => ({
    text: `SELECT * FROM application_documents ORDER BY created_at DESC`,
    values: []
  }),
  
  findByApplicationId: (applicationId: string) => ({
    text: `SELECT * FROM application_documents WHERE application_id = $1`,
    values: [applicationId]
  }),
  
  create: (doc: DocumentCreateParams) => ({
    text: `
      INSERT INTO application_documents (id, application_id, document_type, document_name, file_url, file_size, mime_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    values: [doc.id, doc.applicationId, doc.documentType, doc.documentName, doc.fileUrl, doc.fileSize, doc.mimeType]
  }),
};

// Catalog queries (public, no auth)
export const CatalogQueries = {
  getPrograms: () => ({
    text: `
      SELECT p.*, i.id as institution_id, i.name as institution_name, i.slug as institution_slug
      FROM programs p
      LEFT JOIN institutions i ON i.id = p.institution_id
      ORDER BY p.created_at DESC
    `,
    values: []
  }),
  
  getIntakes: () => ({
    text: `SELECT * FROM intakes ORDER BY created_at DESC`,
    values: []
  }),
  
  getSubjects: () => ({
    text: `SELECT * FROM grade12_subjects WHERE is_active = true ORDER BY name`,
    values: []
  }),
};

// Notifications queries
export const NotificationQueries = {
  getPreferences: (userId: string) => ({
    text: `SELECT * FROM notification_preferences WHERE user_id = $1`,
    values: [userId]
  }),
  
  upsertPreferences: (userId: string, prefs: NotificationPrefs) => ({
    text: `
      INSERT INTO notification_preferences (user_id, email_enabled, push_enabled, sms_enabled)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET
        email_enabled = $2, push_enabled = $3, sms_enabled = $4, updated_at = NOW()
      RETURNING *
    `,
    values: [userId, prefs.email, prefs.push, prefs.sms]
  }),
};

// Payments queries
export const PaymentQueries = {
  getApplicationForReceipt: (applicationId: string, userId: string) => ({
    text: `
      SELECT a.*, p.full_name as applicant_name
      FROM applications a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.id = $1 AND (a.user_id = $2 OR EXISTS (
        SELECT 1 FROM profiles WHERE id = $2 AND role IN ('admin', 'super_admin')
      ))
    `,
    values: [applicationId, userId]
  }),
};
```

### 2.3 Arcjet Rate Limit Configuration

Add to `api/_lib/arcjet.ts`:

```typescript
export const RATE_LIMITS = {
  auth: { requests: 5, window: '5m' },
  sessions: { requests: 30, window: '10m' },
  admin: { requests: 20, window: '10m' },
  applications: { requests: 60, window: '10m' },
  catalog: { requests: 100, window: '10m' },  // Higher for public endpoint
  documents: { requests: 30, window: '10m' },
  notifications: { requests: 50, window: '10m' },
  payments: { requests: 20, window: '10m' },
  general: { requests: 60, window: '10m' },
};
```

---

## 3. Frontend Migration Design

### 3.1 Remove localStorage Token Storage

**Files to modify:**
- `src/hooks/auth/useSessionListener.ts`
- `src/lib/api/authApi.ts`

**Pattern:**
```typescript
// BEFORE
const storedToken = localStorage.getItem('mihas-auth-token');
const response = await fetch(url, {
  headers: { 'Authorization': `Bearer ${storedToken}` }
});

// AFTER
const response = await fetch(url, {
  credentials: 'include',  // Send HTTP-only cookies
});
```

### 3.2 Auth API Client Rewrite

**`src/lib/api/authApi.ts`:**
```typescript
const API_BASE = '/api';

/**
 * Fetch with credentials (HTTP-only cookies)
 */
async function authFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  
  return response.json();
}

export async function fetchUserRole() {
  try {
    const data = await authFetch<{ success: boolean; data: AuthUserRole }>(`${API_BASE}/auth?action=roles`);
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string) {
  return authFetch<{ success: boolean; data: { user: AuthUser } }>(`${API_BASE}/auth?action=login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return authFetch<{ success: boolean }>(`${API_BASE}/auth?action=logout`, {
    method: 'POST',
  });
}

export async function getSession() {
  return authFetch<{ success: boolean; data: { user: AuthUser } }>(`${API_BASE}/auth?action=session`);
}

export async function register(data: RegisterData) {
  return authFetch<{ success: boolean; data: { user: AuthUser } }>(`${API_BASE}/auth?action=register`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function requestPasswordReset(email: string) {
  return authFetch<{ success: boolean }>(`${API_BASE}/auth?action=forgot-password`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string) {
  return authFetch<{ success: boolean }>(`${API_BASE}/auth?action=reset-password`, {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}
```

### 3.3 Session Listener Rewrite

**`src/hooks/auth/useSessionListener.ts`:**
```typescript
export function useSessionListener() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Check session on mount via API (cookies sent automatically)
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const response = await fetch('/api/auth?action=session', {
          credentials: 'include',
        });
        
        if (!mounted) return;
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.user) {
            setUser(data.data.user);
          } else {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    checkSession();
    return () => { mounted = false; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    queryClient.clear();
    
    const response = await fetch('/api/auth?action=login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();
    
    if (!response.ok || !result.success) {
      return { error: result.error || 'Login failed' };
    }

    // Cookies are set by the API - just update local state
    if (result.data?.user) {
      setUser(result.data.user);
      window.dispatchEvent(new CustomEvent('userLoggedIn', { 
        detail: { userId: result.data.user.id } 
      }));
    }

    return { user: result.data?.user };
  }, [queryClient]);

  const signUp = useCallback(async (email: string, password: string, userData: any) => {
    const response = await fetch('/api/auth?action=register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...userData }),
    });

    const result = await response.json();
    
    if (!response.ok || !result.success) {
      return { error: result.error || 'Registration failed' };
    }

    // Auto-login after registration (cookies set by API)
    if (result.data?.user) {
      setUser(result.data.user);
    }

    return { user: result.data?.user };
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    queryClient.clear();
    
    // Fire-and-forget logout
    fetch('/api/auth?action=logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  }, [queryClient]);

  // ... password reset methods

  return { user, loading, signIn, signUp, signOut };
}
```

### 3.4 Supabase Client Cleanup

**`src/lib/supabase.ts`** - Keep only database/storage client:
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseClient: SupabaseClient | null = null;

/**
 * Get Supabase client for DATABASE and STORAGE only
 * Auth is handled by custom JWT system
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient && isSupabaseConfigured) {
    supabaseClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: false,  // No auth session management
        autoRefreshToken: false,
      },
      // NO realtime configuration - use SSE/polling instead
    });
  }
  
  if (!supabaseClient) {
    throw new Error('Supabase not configured');
  }
  
  return supabaseClient;
}

// Export for storage operations only
export const supabase = {
  storage: {
    from: (bucket: string) => getSupabaseClient().storage.from(bucket),
  },
};

// Type exports (keep these)
export type { UserProfile, Application, Program, Intake, ... };
```

---

## 4. Migration Sequence

### Phase 1: Backend Endpoints (No Breaking Changes)
1. Add query builders to `api/_lib/queries.ts`
2. Migrate `api/catalog.ts` (public, lowest risk)
3. Migrate `api/applications.ts`
4. Migrate `api/documents.ts`
5. Migrate `api/notifications.ts`
6. Migrate `api/payments.ts`
7. Add Arcjet protection to all endpoints

### Phase 2: Frontend Auth (Coordinated Change)
1. Update `src/lib/api/authApi.ts` to use credentials
2. Update `src/hooks/auth/useSessionListener.ts` to remove localStorage
3. Update all API calls to use `credentials: 'include'`
4. Test auth flow end-to-end

### Phase 3: Cleanup
1. Remove auth methods from `api/_lib/supabaseClient.ts`
2. Remove auth config from `src/lib/supabase.ts`
3. Remove Supabase Realtime configuration
4. Update steering documentation

---

## 5. Testing Strategy

### 5.1 Backend Tests
- Unit tests for each migrated endpoint
- Integration tests for auth flow
- Rate limit tests for Arcjet

### 5.2 Frontend Tests
- Auth flow tests (login, logout, session check)
- Cookie handling tests
- Error handling tests

### 5.3 E2E Tests
- Full user journey: register → login → use app → logout
- Session persistence across page reloads
- Token refresh flow

---

## 6. Rollback Plan

If issues arise:
1. Backend endpoints can fall back to Supabase SDK (keep imports commented)
2. Frontend can re-enable localStorage token storage
3. Database abstraction layer supports both Supabase REST and direct SDK

---

## 7. Security Considerations

- HTTP-only cookies prevent XSS token theft
- SameSite=Strict prevents CSRF
- Arcjet provides rate limiting and bot protection
- Deterministic RBAC prevents privilege escalation
- Audit logging tracks all auth events
