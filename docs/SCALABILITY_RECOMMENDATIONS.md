# Scalability Recommendations — MIHAS Application System

Concrete recommendations for scaling the MIHAS admissions portal (Vercel + Neon Postgres + Cloudflare R2) to handle thousands of daily users during peak intake periods.

---

## 1. Caching Strategies for High-Traffic Endpoints

### 1.1 Frontend: React Query Cache Profiles

The existing `src/lib/queryCacheConfig.ts` defines three cache profiles. For scale, tighten the `static` profile and add a `dashboard` profile:

```typescript
// src/lib/queryCacheConfig.ts — recommended additions
export const QUERY_CACHE_CONFIG = {
  critical: {
    staleTime: 30_000,        // 30s — application lists, payment status
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  },
  static: {
    staleTime: 15 * 60_000,   // 15 min (up from 5 min) — programs, intakes, subjects rarely change
    gcTime: 60 * 60_000,      // 1 hour
    refetchOnWindowFocus: false,
    retry: 1,
  },
  dashboard: {
    staleTime: 60_000,        // 1 min — admin dashboard stats
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  },
  polling: {
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  },
} as const;
```

### 1.2 Backend: HTTP Cache Headers on Vercel

Vercel's CDN respects `Cache-Control` headers. Add caching to read-only, public endpoints:

| Endpoint | Recommended Header | Rationale |
|----------|-------------------|-----------|
| `/api/catalog?type=programs` | `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` | Programs change infrequently; 5-min edge cache eliminates DB hits |
| `/api/catalog?type=intakes` | `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` | Same as programs |
| `/api/catalog?type=subjects` | `Cache-Control: public, s-maxage=3600, stale-while-revalidate=7200` | Subjects almost never change; 1-hour edge cache |
| `/api/health?action=ping` | `Cache-Control: public, s-maxage=60` | Health checks don't need real-time accuracy |
| `/api/admin?action=stats` | `Cache-Control: private, s-maxage=30` | Per-user, short-lived; `private` prevents CDN sharing |

Implementation in `api-src/catalog.ts`:

```typescript
// Add after computing the response, before sendSuccess()
case 'programs':
case 'intakes':
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  break;
case 'subjects':
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
  break;
```

### 1.3 Backend: In-Memory Cache for Hot Data

For endpoints called on every page load (session validation, catalog), use a lightweight in-memory TTL cache within the serverless function's warm instance:

```typescript
// lib/cache.ts — simple TTL cache for serverless warm instances
const cache = new Map<string, { data: unknown; expires: number }>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: unknown, ttlMs: number): void {
  // Cap at 100 entries to prevent memory leaks in long-lived instances
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expires: Date.now() + ttlMs });
}
```

Use for catalog queries (programs/intakes/subjects) with a 5-minute TTL. This avoids a Neon round-trip on every cold-start-free invocation.

---

## 2. Database Indexing Recommendations for Scale

### 2.1 Current Indexes (Already Applied)

```sql
idx_applications_status          ON applications(status)
idx_applications_created_at      ON applications(created_at)
idx_applications_user_id         ON applications(user_id)
idx_profiles_email               ON profiles(email)
idx_profiles_role                ON profiles(role)
idx_notifications_user_id        ON notifications(user_id)
idx_notifications_created_at     ON notifications(created_at)
idx_notifications_idempotency    ON notifications(idempotency_key)
idx_audit_logs_created_at        ON audit_logs(created_at)
idx_audit_logs_entity_type       ON audit_logs(entity_type)
idx_application_documents_app_id ON application_documents(application_id)
```

### 2.2 Recommended Additional Indexes

These target query patterns observed in `lib/queries.ts` and `api-src/*.ts`:

```sql
-- Composite index for admin application listing (filter by status + sort by date)
-- Covers: SELECT * FROM applications WHERE status = $1 ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_status_created
  ON applications(status, created_at DESC);

-- Composite index for user's applications (student dashboard)
-- Covers: SELECT * FROM applications WHERE user_id = $1 ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_user_created
  ON applications(user_id, created_at DESC);

-- Application number lookup (public tracker, unique constraint may already cover this)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_number
  ON applications(application_number) WHERE application_number IS NOT NULL;

-- Public tracking code lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_tracking_code
  ON applications(public_tracking_code) WHERE public_tracking_code IS NOT NULL;

-- Payment status filtering (admin payment review)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_payment_status
  ON applications(payment_status);

-- Notification read status for badge counts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_id, read) WHERE read = false;

-- Audit logs: actor lookup for user activity history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_actor
  ON audit_logs(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

-- Audit logs: composite for entity history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs(entity_type, entity_id, created_at DESC);

-- Device sessions: active sessions per user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_active
  ON device_sessions(user_id, is_active) WHERE is_active = true;

-- Document migration log: status tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doc_migration_status
  ON document_migration_log(status) WHERE status != 'migrated';
```

### 2.3 Index Maintenance

- Use `CREATE INDEX CONCURRENTLY` to avoid locking tables during creation
- Run `ANALYZE` after creating indexes: `ANALYZE applications; ANALYZE notifications; ANALYZE audit_logs;`
- Monitor index usage with: `SELECT indexrelname, idx_scan FROM pg_stat_user_indexes WHERE schemaname = 'public' ORDER BY idx_scan ASC;`
- Drop unused indexes (zero scans over 30 days) to reduce write overhead

---

## 3. Idempotency Patterns for Write Operations

### 3.1 Pattern: Client-Generated Idempotency Keys

For all mutating operations, the frontend should generate and send an `X-Idempotency-Key` header. The backend checks for a prior result before processing.

```typescript
// Frontend: generate key before mutation
const idempotencyKey = `${action}-${entityId}-${Date.now()}`;
await apiClient.post('/api/applications?action=submit', body, {
  headers: { 'X-Idempotency-Key': idempotencyKey }
});
```

```typescript
// Backend: check-then-execute pattern
async function withIdempotency(
  req: VercelRequest,
  res: VercelResponse,
  action: string,
  handler: () => Promise<unknown>
) {
  const key = req.headers['x-idempotency-key'] as string;
  if (!key) return handler(); // No key = no idempotency guarantee

  // Check if this key was already processed
  const existing = await query(
    `SELECT response_data FROM idempotency_log
     WHERE idempotency_key = $1 AND action = $2
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [key, action]
  );

  if (existing.rows.length > 0) {
    return sendSuccess(res, existing.rows[0].response_data);
  }

  const result = await handler();

  // Store the result for replay
  await query(
    `INSERT INTO idempotency_log (idempotency_key, action, response_data, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (idempotency_key, action) DO NOTHING`,
    [key, action, JSON.stringify(result)]
  );

  return result;
}
```

### 3.2 Endpoint-Specific Idempotency

| Endpoint | Action | Idempotency Strategy |
|----------|--------|---------------------|
| `/api/applications` | `submit` | Application ID as natural key — reject duplicate submissions for same `application.id` |
| `/api/auth` | `register` | Email uniqueness constraint — DB rejects duplicate registrations |
| `/api/auth` | `forgot-password` | Always return success (never reveal email existence); token generation is idempotent by email |
| `/api/documents` | `upload` | `application_id + document_type` composite key — upsert pattern |
| `/api/payments` | `receipt` | `application_id + payment_method + amount` — check for existing verified payment |
| `/api/notifications` | `send` | Already implemented via `idempotency_key` column (`event_type:entity_type:entity_id`) with 1-hour dedup window |
| `/api/admin` | `users` (create) | Email uniqueness constraint handles duplicates |

### 3.3 Auto-Save Idempotency (Application Wizard)

The 8-second auto-save is already naturally idempotent — it uses `UPDATE ... WHERE id = $1` which overwrites the previous draft. No additional idempotency mechanism needed. The `updated_at` timestamp ensures reconciliation picks the latest version.

### 3.4 Idempotency Log Table (If Implementing Full Pattern)

```sql
CREATE TABLE IF NOT EXISTS idempotency_log (
  idempotency_key TEXT NOT NULL,
  action TEXT NOT NULL,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (idempotency_key, action)
);

-- Auto-cleanup: remove entries older than 24 hours
-- Run via scheduled job or Vercel cron
DELETE FROM idempotency_log WHERE created_at < NOW() - INTERVAL '24 hours';
```

---

## 4. Observability Recommendations

### 4.1 Structured Logging

Replace ad-hoc `console.log`/`console.error` calls with structured JSON logs. Vercel captures stdout/stderr and makes them searchable in the dashboard.

```typescript
// lib/logger.ts — structured logger for Vercel
interface LogEntry {
  level: 'info' | 'warn' | 'error';
  msg: string;
  endpoint?: string;
  action?: string;
  durationMs?: number;
  statusCode?: number;
  userId?: string;  // Only the ID, never email/name (no PII)
  error?: string;
  [key: string]: unknown;
}

export function log(entry: LogEntry): void {
  const output = { ...entry, ts: new Date().toISOString() };
  if (entry.level === 'error') {
    console.error(JSON.stringify(output));
  } else {
    console.log(JSON.stringify(output));
  }
}
```

Usage in endpoints:

```typescript
const start = Date.now();
// ... handler logic ...
log({
  level: 'info',
  msg: 'request_complete',
  endpoint: '/api/applications',
  action,
  durationMs: Date.now() - start,
  statusCode: 200,
});
```

### 4.2 Key Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| API response time (p95) | Vercel Analytics / structured logs | > 2000ms |
| Neon query time (p95) | Structured logs with `durationMs` | > 500ms |
| Error rate (5xx) | Vercel dashboard | > 1% of requests |
| Arcjet block rate | `[ARCJET] BLOCKED` log entries | > 50/hour (possible attack) |
| Auth failure rate | Audit log `auth_failure` entries | > 20/hour per IP |
| Auto-save failure rate | Frontend error boundary logs | > 5% of saves |
| R2 upload failure rate | `[R2Storage]` error logs | Any failures |
| Cold start frequency | Vercel function logs | Informational |

### 4.3 Vercel-Native Monitoring

Vercel provides built-in observability on the Hobby plan:

- **Function Logs**: All `console.log`/`console.error` output, searchable by function name
- **Web Analytics**: Core Web Vitals (LCP, FID, CLS) — already tracked
- **Speed Insights**: Real user monitoring for performance

For production alerting beyond Vercel's built-in tools, consider:

- **Vercel Cron Jobs** (`vercel.json`): Schedule a `/api/health?action=db` check every 5 minutes
- **External uptime monitor** (e.g., BetterUptime free tier): Ping `/api/health?action=ping` every 60 seconds, alert on 3 consecutive failures

```json
// vercel.json — add cron for health checks
{
  "crons": [
    {
      "path": "/api/health?action=db",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### 4.4 Audit Log as Observability Source

The existing `audit_logs` table already captures state changes. For operational monitoring, query it periodically:

```sql
-- Failed auth attempts in last hour (brute force detection)
SELECT COUNT(*) FROM audit_logs
WHERE action = 'auth_failure' AND created_at > NOW() - INTERVAL '1 hour';

-- Application submissions per day (capacity planning)
SELECT DATE(created_at), COUNT(*) FROM audit_logs
WHERE action = 'create' AND entity_type = 'application'
GROUP BY DATE(created_at) ORDER BY 1 DESC LIMIT 30;

-- Slow operations (if durationMs is logged in changes JSONB)
SELECT * FROM audit_logs
WHERE (changes->>'durationMs')::int > 2000
ORDER BY created_at DESC LIMIT 20;
```

---

## 5. Neon Connection Pooling for High Concurrency

### 5.1 Current Architecture

The current `lib/db.ts` uses the Neon serverless driver (`@neondatabase/serverless`) which creates a new HTTP connection per query via `neon(connectionString)`. This is the recommended pattern for Vercel serverless functions — each invocation is stateless.

### 5.2 Neon Serverless Driver vs. Connection Pooling

Neon offers two connection modes:

| Mode | Connection String | Use Case |
|------|------------------|----------|
| **Serverless HTTP** (current) | `postgres://...@...neon.tech/...` | Vercel serverless functions — one query per HTTP request, no persistent connections |
| **Pooled WebSocket** | `postgres://...@...neon.tech/...?pgbouncer=true` | Long-running processes, high-frequency queries within a single invocation |

For Vercel serverless functions, the HTTP driver is correct. Each function invocation is short-lived, so persistent connection pools would be wasted.

### 5.3 Recommended: Enable Neon's Built-In Connection Pooler

Neon provides a PgBouncer-based connection pooler at no extra cost. Enable it in the Neon dashboard:

1. Go to **Neon Console → Project → Connection Settings**
2. Enable **Pooled connection** (uses port 5432 with `-pooler` suffix in hostname)
3. Update `DATABASE_URL` to use the pooled endpoint:

```
# Before (direct)
DATABASE_URL=postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require

# After (pooled — note the -pooler suffix)
DATABASE_URL=postgres://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

The pooled endpoint handles connection multiplexing server-side. No code changes needed in `lib/db.ts` — the Neon serverless driver works with both endpoints.

### 5.4 Neon Autoscaling Configuration

Neon's serverless Postgres autoscales compute. For the MIHAS intake periods:

| Setting | Recommended Value | Rationale |
|---------|------------------|-----------|
| Min compute | 0.25 CU | Scale to zero during off-hours (cost savings) |
| Max compute | 2 CU | Handle intake deadline surges |
| Autosuspend delay | 300 seconds (5 min) | Avoid cold starts during active usage |
| Connection limit | 100 (pooled) | PgBouncer default; sufficient for Vercel's concurrent function limit |

### 5.5 Query Optimization for Reduced Connection Pressure

Reduce the number of queries per request to minimize connection usage:

```typescript
// BAD: 3 separate queries for admin dashboard
const apps = await query('SELECT COUNT(*) FROM applications');
const users = await query('SELECT COUNT(*) FROM profiles');
const pending = await query('SELECT COUNT(*) FROM applications WHERE status = $1', ['submitted']);

// GOOD: Single query with CTEs
const stats = await query(`
  WITH app_counts AS (SELECT COUNT(*) as total FROM applications),
       user_counts AS (SELECT COUNT(*) as total FROM profiles),
       pending_counts AS (SELECT COUNT(*) as total FROM applications WHERE status = 'submitted')
  SELECT
    (SELECT total FROM app_counts) as total_applications,
    (SELECT total FROM user_counts) as total_users,
    (SELECT total FROM pending_counts) as pending_applications
`);
```

### 5.6 Transaction Discipline

The current `lib/db.ts` transaction implementation uses `BEGIN`/`COMMIT`/`ROLLBACK` as separate queries over the HTTP driver. For the Neon serverless driver, each `query()` call is an independent HTTP request, so multi-statement transactions require the WebSocket driver or Neon's `transaction()` API.

For critical multi-step operations (R2 migration, payment verification), use Neon's transaction endpoint:

```typescript
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!, { fullResults: true });

// Neon serverless transaction (single HTTP round-trip)
const results = await sql.transaction([
  sql`UPDATE applications SET payment_status = 'verified' WHERE id = ${appId}`,
  sql`INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('payment_verified', 'application', ${appId})`,
]);
```

---

## Summary: Priority Implementation Order

| Priority | Recommendation | Effort | Impact |
|----------|---------------|--------|--------|
| 1 | Enable Neon pooled connection endpoint | Config change | High — reduces connection overhead |
| 2 | Add `Cache-Control` headers to catalog endpoints | ~10 lines | High — eliminates most DB hits for public data |
| 3 | Add composite indexes for common query patterns | SQL migration | High — faster admin listing and student dashboard |
| 4 | Structured JSON logging | ~50 lines + refactor | Medium — enables alerting and debugging |
| 5 | Vercel cron health check | Config change | Medium — proactive failure detection |
| 6 | Extend React Query `static` staleTime to 15 min | 1 line | Low effort, medium impact |
| 7 | In-memory TTL cache for warm serverless instances | ~30 lines | Medium — reduces Neon calls during traffic spikes |
| 8 | Full idempotency log table | Migration + ~80 lines | Low priority — most writes are already naturally idempotent |
