# RLS Policy to API Middleware Replacement Guide

## Overview

Supabase RLS (Row Level Security) policies have been replaced with API middleware ownership checks in the Neon migration. This document maps the original RLS policies to their API middleware equivalents.

## Why Replace RLS?

1. **Neon doesn't use Supabase Auth** - RLS policies relied on `auth.uid()` and `auth.jwt()` which are Supabase-specific
2. **API-first architecture** - All database access goes through our API endpoints, making middleware checks sufficient
3. **Performance** - Middleware checks are faster than database-level policy evaluation
4. **Flexibility** - Easier to implement complex business logic in TypeScript

## Replacement Mapping

### Profiles Table

| Original RLS Policy | API Middleware Replacement |
|---------------------|---------------------------|
| `auth.uid() = id` (SELECT own profile) | `requireAuth()` + `user.id === profileId` |
| `auth.uid() = id` (UPDATE own profile) | `requireAuth()` + `user.id === profileId` |
| `is_admin_user()` (SELECT all) | `requireRole(['admin', 'super_admin'])` |

**Implementation**: `api/_lib/auth/ownership.ts`
```typescript
export function checkProfileOwnership(userId: string, profileId: string): boolean {
  return userId === profileId;
}
```

### Applications Table

| Original RLS Policy | API Middleware Replacement |
|---------------------|---------------------------|
| `auth.uid() = user_id` (SELECT own) | `requireAuth()` + `checkApplicationOwnership()` |
| `auth.uid() = user_id` (INSERT) | `requireAuth()` + auto-set `user_id` from token |
| `auth.uid() = user_id` (UPDATE own) | `requireAuth()` + `checkApplicationOwnership()` |
| `is_admin_user()` (SELECT all) | `requireRole(['admin', 'super_admin', 'reviewer'])` |
| `is_admin_user()` (UPDATE status) | `requireRole(['admin', 'super_admin'])` |

**Implementation**: `api/_lib/auth/ownership.ts`
```typescript
export async function checkApplicationOwnership(
  userId: string, 
  applicationId: string,
  userRole: string
): Promise<boolean> {
  // Admins can access all applications
  if (['admin', 'super_admin', 'reviewer'].includes(userRole)) {
    return true;
  }
  
  // Students can only access their own applications
  const result = await query(
    'SELECT user_id FROM applications WHERE id = $1',
    [applicationId]
  );
  return result.rows[0]?.user_id === userId;
}
```

### Application Documents Table

| Original RLS Policy | API Middleware Replacement |
|---------------------|---------------------------|
| `auth.uid() = (SELECT user_id FROM applications WHERE id = application_id)` | `checkDocumentOwnership()` |
| `is_admin_user()` (SELECT all) | `requireRole(['admin', 'super_admin', 'reviewer'])` |

**Implementation**: `api/_lib/auth/ownership.ts`
```typescript
export async function checkDocumentOwnership(
  userId: string,
  documentId: string,
  userRole: string
): Promise<boolean> {
  if (['admin', 'super_admin', 'reviewer'].includes(userRole)) {
    return true;
  }
  
  const result = await query(`
    SELECT a.user_id 
    FROM application_documents d
    JOIN applications a ON a.id = d.application_id
    WHERE d.id = $1
  `, [documentId]);
  return result.rows[0]?.user_id === userId;
}
```

### Device Sessions Table

| Original RLS Policy | API Middleware Replacement |
|---------------------|---------------------------|
| `auth.uid() = user_id` (SELECT own) | `requireAuth()` + `checkSessionOwnership()` |
| `auth.uid() = user_id` (DELETE own) | `requireAuth()` + `checkSessionOwnership()` |

**Implementation**: `api/_lib/auth/ownership.ts`
```typescript
export function checkSessionOwnership(userId: string, sessionUserId: string): boolean {
  return userId === sessionUserId;
}
```

### Audit Logs Table

| Original RLS Policy | API Middleware Replacement |
|---------------------|---------------------------|
| `is_admin_user()` (SELECT) | `requireRole(['admin', 'super_admin'])` |
| DENY UPDATE/DELETE | Trigger `prevent_audit_modification()` |

### Notifications Table

| Original RLS Policy | API Middleware Replacement |
|---------------------|---------------------------|
| `auth.uid() = user_id` (SELECT own) | `requireAuth()` + `user.id === notification.user_id` |
| `auth.uid() = user_id` (UPDATE read status) | `requireAuth()` + ownership check |

## API Endpoint Updates

### api/applications.ts

```typescript
// GET /api/applications?action=details&id=xxx
case 'details': {
  const user = await requireAuth(req);
  const { id } = req.query;
  
  // Ownership check replaces RLS
  const hasAccess = await checkApplicationOwnership(user.id, id, user.role);
  if (!hasAccess) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  
  // Proceed with query...
}
```

### api/documents.ts

```typescript
// GET /api/documents?action=download&id=xxx
case 'download': {
  const user = await requireAuth(req);
  const { id } = req.query;
  
  // Ownership check replaces RLS
  const hasAccess = await checkDocumentOwnership(user.id, id, user.role);
  if (!hasAccess) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  
  // Proceed with download...
}
```

### api/sessions.ts

```typescript
// GET /api/sessions?action=list
case 'list': {
  const user = await requireAuth(req);
  
  // Only return user's own sessions (replaces RLS)
  const result = await query(
    'SELECT * FROM device_sessions WHERE user_id = $1 AND is_active = true',
    [user.id]
  );
  
  return res.json({ success: true, data: result.rows });
}
```

## Security Considerations

1. **Always use `requireAuth()`** before any database operation
2. **Always check ownership** for user-specific resources
3. **Use `requireRole()`** for admin-only operations
4. **Never trust client-provided user IDs** - always use the ID from the JWT token
5. **Log access denials** for security monitoring

## Testing

Property-based tests verify that:
1. Ownership checks match original RLS policy behavior
2. Role-based access matches original RLS policy behavior
3. No unauthorized access is possible through any endpoint
