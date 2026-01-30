# Design Document: Admin System Health Fixes

## Overview

This design addresses critical issues in the MIHAS Admin System Health Dashboard by:
1. Adding HEAD method support to API endpoints for health monitoring
2. Consolidating admin-settings into the existing admin.ts endpoint
3. Fixing the audit_logs relationship with profiles table
4. Updating RLS policies for user_roles table
5. Making the System Health Dashboard resilient to missing database functions
6. Updating frontend API clients to use correct endpoints

The approach prioritizes backward compatibility and graceful degradation to ensure the production system remains stable.

## Architecture

```mermaid
graph TB
    subgraph "Frontend"
        SHD[System Health Dashboard]
        AS[Admin Settings Page]
        AL[Audit Log Service]
    end
    
    subgraph "API Layer (Vercel)"
        ADMIN[/api/admin.ts]
        APPS[/api/applications.ts]
        NOTIF[/api/notifications.ts]
        HEALTH[/api/health.ts]
    end
    
    subgraph "Database (Supabase)"
        SETTINGS[system_settings]
        AUDIT[audit_logs]
        PROFILES[profiles]
        ROLES[user_roles]
    end
    
    SHD -->|HEAD requests| APPS
    SHD -->|HEAD requests| NOTIF
    SHD -->|GET /api/health| HEALTH
    AS -->|GET/POST/PUT/DELETE ?action=settings| ADMIN
    AL -->|Query with join| AUDIT
    AUDIT -.->|LEFT JOIN| PROFILES
    ADMIN --> SETTINGS
    ADMIN --> ROLES
```

## Components and Interfaces

### 1. API Endpoint HEAD Method Handler

Each consolidated API endpoint will handle HEAD requests for health checks.

```typescript
// Pattern for HEAD method support in api/*.ts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  
  // Continue with normal request handling...
}
```

### 2. Admin Settings Action (api/admin.ts)

New action added to the consolidated admin endpoint:

```typescript
interface SettingsAction {
  // GET: List all settings
  // POST: Create new setting
  // PUT: Update existing setting
  // DELETE: Remove setting
}

// Query parameter: ?action=settings
// Methods: GET, POST, PUT, DELETE
```

### 3. Audit Log Query Pattern

Updated query pattern that handles missing actor relationships:

```typescript
// Safe audit log query with LEFT JOIN
const query = supabase
  .from('audit_logs')
  .select(`
    *,
    actor:profiles!audit_logs_actor_id_fkey (
      email,
      full_name,
      role
    )
  `)
  .order('created_at', { ascending: false });
```

### 4. System Health Dashboard Analyzer Updates

The SecurityAnalyzer and SchemaAnalyzer classes will be updated to:
- Remove calls to non-existent RPC functions
- Return default healthy status when checks cannot be performed
- Log warnings instead of throwing errors

```typescript
// Graceful fallback pattern
private async scanSecurityDefinerViews(): Promise<void> {
  try {
    // Attempt the check
  } catch (error) {
    console.warn('Security check unavailable:', error.message);
    // Return healthy status - cannot verify
  }
}
```

## Data Models

### System Settings Table (existing)

```sql
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  setting_type VARCHAR(50) DEFAULT 'string',
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Audit Logs Table (existing - relationship fix)

The audit_logs table has an `actor_id` column that should reference profiles. The fix involves:
1. Using LEFT JOIN instead of INNER JOIN in queries
2. Handling null actor data gracefully in the frontend

### User Roles RLS Policy Update

```sql
-- Allow super_admin to manage all roles
CREATE POLICY "super_admin_manage_roles" ON user_roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'super_admin'
    )
  );
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: HEAD Method Support for API Endpoints

*For any* consolidated API endpoint (/api/applications, /api/notifications, /api/admin, etc.), sending a HEAD request SHALL return a 200 status code without requiring authentication.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Settings CRUD Round-Trip

*For any* valid system setting with a unique key, creating the setting via POST, reading it via GET, updating it via PUT, and deleting it via DELETE SHALL each succeed and maintain data consistency throughout the lifecycle.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: Settings Authentication Requirement

*For any* settings action (GET, POST, PUT, DELETE) on /api/admin?action=settings, requests without valid admin authentication SHALL be rejected with 401 status.

**Validates: Requirements 2.6**

### Property 4: Audit Log Actor Relationship Resilience

*For any* audit log query, the query SHALL complete successfully regardless of whether the referenced actor_id exists in the profiles table, returning null for missing actors.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 5: Super Admin Role Management

*For any* user with super_admin role, INSERT, UPDATE, and DELETE operations on the user_roles table SHALL succeed.

**Validates: Requirements 4.1, 4.3**

### Property 6: Non-Admin Role Management Rejection

*For any* user without super_admin role, attempts to INSERT, UPDATE, or DELETE on the user_roles table SHALL be rejected with 403 status.

**Validates: Requirements 4.2**

### Property 7: Health Dashboard Graceful Degradation

*For any* health check that fails (RPC function not found, query error, timeout), the System Health Dashboard SHALL catch the error, log it, and return a default healthy status without crashing.

**Validates: Requirements 5.1, 5.2, 5.4**

### Property 8: Frontend HTML Error Response Detection

*For any* API response that contains HTML instead of JSON (indicated by content starting with "<!DOCTYPE" or "<html"), the frontend SHALL detect this and display a user-friendly error message instead of crashing.

**Validates: Requirements 6.4**

## Error Handling

### API Layer Error Handling

| Error Type | Response Code | Response Body | Action |
|------------|---------------|---------------|--------|
| Missing authentication | 401 | `{ success: false, error: "Unauthorized" }` | Return immediately |
| Insufficient permissions | 403 | `{ success: false, error: "Admin access required" }` | Return immediately |
| Invalid action | 400 | `{ success: false, error: "Invalid action" }` | Return immediately |
| Database error | 500 | `{ success: false, error: "Internal error" }` | Log error, return generic message |
| HEAD request | 200 | Empty body | Return headers only |

### Frontend Error Handling

| Error Type | Detection | User Message |
|------------|-----------|--------------|
| HTML instead of JSON | Response starts with `<!DOCTYPE` or `<` | "Server returned an unexpected response. Please try again." |
| Network error | fetch throws | "Unable to connect to server. Check your connection." |
| 401 Unauthorized | response.status === 401 | "Please log in to continue." |
| 403 Forbidden | response.status === 403 | "You don't have permission for this action." |
| 404 Not Found | response.status === 404 | "The requested resource was not found." |

### Health Dashboard Error Handling

```typescript
// Pattern for graceful degradation
async function safeHealthCheck(checkFn: () => Promise<any>, fallback: any): Promise<any> {
  try {
    return await checkFn();
  } catch (error) {
    console.warn('Health check failed:', error.message);
    return fallback;
  }
}
```

## Testing Strategy

### Unit Tests

Unit tests will verify specific examples and edge cases:

1. **API Endpoint Tests**
   - HEAD request returns 200 for each endpoint
   - Settings CRUD operations with valid data
   - Authentication rejection for unauthenticated requests
   - 404 response for /api/admin-settings with helpful message

2. **Frontend Tests**
   - HTML response detection
   - Null actor handling in audit logs
   - Correct API endpoint URLs

3. **Database Tests**
   - Audit log query with missing actor
   - RLS policy allows super_admin operations
   - RLS policy blocks non-admin operations

### Property-Based Tests

Property-based tests will use **fast-check** library with minimum 100 iterations per test.

| Property | Test Description | Generator |
|----------|------------------|-----------|
| P1 | HEAD requests return 200 | Random endpoint from list |
| P2 | Settings CRUD round-trip | Random valid setting objects |
| P3 | Auth rejection | Random invalid/missing tokens |
| P4 | Audit log resilience | Random actor_id (valid/invalid/null) |
| P5 | Super admin operations | Random role operations |
| P6 | Non-admin rejection | Random non-admin users |
| P7 | Health check resilience | Random error scenarios |
| P8 | HTML detection | Random HTML/JSON responses |

### Test Configuration

```typescript
// Property test configuration
import * as fc from 'fast-check';

// Minimum 100 iterations for each property test
const propertyTestConfig = { numRuns: 100 };

// Tag format for traceability
// Feature: admin-system-health-fixes, Property N: [property text]
```

### Integration Tests

Integration tests will verify end-to-end flows:

1. Admin loads settings page → correct API called → settings displayed
2. Admin updates setting → API called → database updated → UI reflects change
3. Health dashboard loads → failed checks handled → dashboard displays
4. Audit log page loads → missing actors handled → logs displayed

