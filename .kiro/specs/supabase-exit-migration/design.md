# Design Document: Supabase Exit Migration

## Overview

This design document specifies the complete migration from Supabase to an independent infrastructure stack:
- **Database**: Neon Postgres (serverless, branching, scale-to-zero)
- **Storage**: Cloudflare R2 (S3-compatible, zero egress fees)
- **Functions**: Vercel Serverless (max 12 functions, Bun runtime)

The migration preserves all existing functionality while eliminating Supabase vendor lock-in.

## Current State Analysis

### Database Inventory (Supabase PostgreSQL)

**Tables**: 97 tables in public schema
**Extensions Installed**: uuid-ossp, pgcrypto, pg_cron, pg_graphql, pg_stat_statements, supabase_vault, plpgsql
**Functions**: 102 stored procedures and trigger functions
**RLS Policies**: Enabled on all 97 tables (auth.uid() based)

#### Core Tables (Critical Path)
| Table | Rows | RLS | Foreign Keys | Notes |
|-------|------|-----|--------------|-------|
| profiles | 21 | Yes | auth.users | User profiles with password_hash, refresh_token_hash |
| applications | 28 | Yes | auth.users, profiles | Main application data |
| application_documents | 11 | Yes | applications | Document uploads |
| application_grades | 136 | Yes | applications, subjects | Grade records |
| device_sessions | 587 | Yes | auth.users | Session tracking |
| audit_logs | 657 | Yes | auth.users | Immutable audit trail |
| user_engagement_metrics | 26498 | Yes | auth.users | Analytics data |
| api_telemetry | 2398 | Yes | - | API monitoring |

#### Supporting Tables (Reference Data)
| Table | Rows | Purpose |
|-------|------|---------|
| programs | 4 | Academic programs |
| intakes | 3 | Enrollment periods |
| subjects | 17 | Grade 12 subjects |
| institutions | 2 | MIHAS, KATC |
| eligibility_rules | 25 | Admission criteria |
| regulatory_guidelines | 15 | HPCZ/GNC/NMCZ rules |

### Functions Inventory

#### RPC Functions (Called from Application)
| Function | Type | Migration Path |
|----------|------|----------------|
| get_admin_dashboard_stats | Query | API endpoint |
| get_admin_dashboard_overview | Query | API endpoint |
| perform_maintenance | Maintenance | Cron job / API |
| archive_old_applications | Maintenance | Cron job |
| cleanup_old_drafts | Maintenance | Cron job |
| create_backup_record | Utility | API endpoint |
| update_backup_status | Utility | API endpoint |
| check_database_health | Health | API endpoint |
| get_error_statistics | Analytics | API endpoint |
| generate_notification_dedup_hash | Utility | Application code |
| check_data_integrity | Health | API endpoint |
| exec_sql | Admin | Remove (security risk) |

#### Trigger Functions (Database-Level)
| Function | Trigger On | Migration Path |
|----------|------------|----------------|
| set_application_defaults | applications INSERT | Neon trigger |
| set_tracking_code | applications INSERT | Neon trigger |
| set_app_number | applications INSERT | Neon trigger |
| update_updated_at_column | Multiple tables | Neon trigger |
| notify_application_status_change | applications UPDATE | Application code |
| notify_status_change | applications UPDATE | Application code |
| prevent_audit_modification | audit_logs | Neon trigger |
| log_auth_event | auth events | Application code |
| sync_profile_role | profiles UPDATE | Application code |

#### Utility Functions (Keep in Neon)
| Function | Purpose |
|----------|---------|
| generate_application_number | Sequential numbering |
| generate_tracking_code | Public tracking codes |
| calculate_best_5_subjects_points | Grade calculation |
| is_passing_grade | Grade validation |
| validate_zambian_phone | Phone validation |
| validate_nrc | NRC validation |
| validate_email | Email validation |

### Storage Inventory

**Bucket**: app_docs
**Contents**: Application documents, receipts, result slips, KYC documents
**Access**: Signed URLs (private), some public URLs
**File Types**: PDF, JPG, JPEG, PNG
**Size Limit**: 10MB per file

### Current Vercel Functions (10 of 12 limit)
1. api/admin.ts
2. api/applications.ts
3. api/auth.ts
4. api/catalog.ts
5. api/documents.ts
6. api/health.ts
7. api/notifications.ts
8. api/payments.ts
9. api/sessions.ts
10. api/[...path].ts (catch-all)

**Available Slots**: 2 functions

## Target Architecture

### Database: Neon Postgres

```
┌─────────────────────────────────────────────────────────────┐
│                    Neon Postgres                             │
├─────────────────────────────────────────────────────────────┤
│  Connection: @neondatabase/serverless (HTTP/WebSocket)      │
│  Features: Branching, Autoscaling, Scale-to-zero            │
│  Extensions: uuid-ossp, pgcrypto (Neon-supported)           │
├─────────────────────────────────────────────────────────────┤
│  Schema: 97 tables (migrated from Supabase)                 │
│  Functions: ~50 utility functions (Neon-compatible)         │
│  Triggers: ~15 triggers (Neon-compatible)                   │
│  RLS: REMOVED (application-layer security)                  │
└─────────────────────────────────────────────────────────────┘
```

### Storage: Cloudflare R2

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare R2                             │
├─────────────────────────────────────────────────────────────┤
│  Bucket: mihas-app-docs                                      │
│  Access: S3-compatible API (@aws-sdk/client-s3)             │
│  Features: Zero egress, signed URLs, public URLs            │
├─────────────────────────────────────────────────────────────┤
│  Structure:                                                  │
│  ├── documents/{application_id}/{document_type}/            │
│  ├── receipts/{application_id}/                             │
│  └── public/                                                 │
└─────────────────────────────────────────────────────────────┘
```

### Security Architecture (RLS Replacement)

```
┌─────────────────────────────────────────────────────────────┐
│                Application-Layer Security                    │
├─────────────────────────────────────────────────────────────┤
│  1. JWT Middleware (api/_lib/auth/middleware.ts)            │
│     - Extract user from HTTP-only cookie                    │
│     - Verify JWT signature and expiration                   │
│     - Embed role and permissions in request context         │
├─────────────────────────────────────────────────────────────┤
│  2. Ownership Checks (per-endpoint)                         │
│     - Students: Own applications, documents, sessions       │
│     - Admins: All applications in their scope               │
│     - Super Admins: Full access                             │
├─────────────────────────────────────────────────────────────┤
│  3. Database Access                                          │
│     - Service role only (no direct user access)             │
│     - All queries through API layer                         │
│     - Parameterized queries (SQL injection prevention)      │
└─────────────────────────────────────────────────────────────┘
```

## Component Designs

### Component 1: Database Abstraction Layer

**File**: `api/_lib/db.ts` (existing, enhanced)

```typescript
// Already supports both Supabase and Neon
// Enhancement: Remove Supabase-specific code paths

interface DatabaseConfig {
  type: 'neon';
  connectionString: string;
}

// Query interface (unchanged)
export async function query<T>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>>;

// Transaction support (unchanged)
export async function transaction<T>(
  operations: QueryConfig[]
): Promise<QueryResult<T>[]>;
```

### Component 2: Storage Adapter

**File**: `api/_lib/storage.ts` (new)

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class R2StorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor(config: StorageConfig) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
  }

  async upload(path: string, file: Buffer, contentType: string): Promise<string>;
  async download(path: string): Promise<Buffer>;
  async getSignedUrl(path: string, expiresIn?: number): Promise<string>;
  async getPublicUrl(path: string): Promise<string>;
  async delete(path: string): Promise<void>;
  async exists(path: string): Promise<boolean>;
}
```

### Component 3: RLS Policy Replacement

**Mapping**: Supabase RLS → Application Middleware

| RLS Policy Pattern | Middleware Replacement |
|-------------------|------------------------|
| `auth.uid() = user_id` | `requireAuth()` + ownership check |
| `auth.jwt() ->> 'role' = 'admin'` | `requireRole(['admin', 'super_admin'])` |
| `is_active = true` | Query filter in endpoint |
| `SELECT only for students` | Role-based query builder |

**Implementation Pattern**:
```typescript
// Before (Supabase RLS)
// Policy: auth.uid() = user_id

// After (Application Layer)
async function getApplications(req: VercelRequest, res: VercelResponse) {
  const user = await requireAuth(req);
  
  if (user.role === 'student') {
    // Students see only their own applications
    const result = await query(
      'SELECT * FROM applications WHERE user_id = $1',
      [user.userId]
    );
  } else if (['admin', 'super_admin'].includes(user.role)) {
    // Admins see all applications
    const result = await query('SELECT * FROM applications');
  }
}
```

### Component 4: Migration SQL Bundle

**Structure**:
```
migrations/
├── 001_schema.sql          # Table definitions (DDL)
├── 002_indexes.sql         # Index definitions
├── 003_constraints.sql     # Foreign keys, checks
├── 004_functions.sql       # Utility functions
├── 005_triggers.sql        # Trigger definitions
├── 006_seed_data.sql       # Reference data
└── 007_data_migration.sql  # Data transfer scripts
```

**Neon Compatibility Notes**:
- Remove `auth.uid()` references → Use application-layer checks
- Remove `auth.jwt()` references → Use application-layer checks
- Remove `supabase_vault` references → Use environment variables
- Remove `pg_cron` jobs → Use Vercel Cron or external scheduler
- Keep `uuid-ossp`, `pgcrypto` → Neon-supported

### Component 5: Function Consolidation

**Current**: 10 functions
**Target**: 10 functions (no change needed)

| Function | Actions | Notes |
|----------|---------|-------|
| api/admin.ts | dashboard, users, settings, health, maintenance | Add health/maintenance |
| api/applications.ts | CRUD, review, grades, documents | Unchanged |
| api/auth.ts | login, logout, refresh, session, register | Unchanged |
| api/catalog.ts | programs, intakes, subjects | Unchanged |
| api/documents.ts | upload, download, extract | Update to R2 |
| api/health.ts | status, db-check | Unchanged |
| api/notifications.ts | preferences, send, list | Unchanged |
| api/payments.ts | verify, receipt | Unchanged |
| api/sessions.ts | track, list, revoke | Unchanged |
| api/[...path].ts | catch-all | Unchanged |

## Data Migration Strategy

### Phase 1: Schema Migration
1. Export Supabase schema (pg_dump --schema-only)
2. Remove Supabase-specific features (auth.uid(), RLS policies)
3. Convert to Neon-compatible SQL
4. Create Neon database with schema

### Phase 2: Data Migration
1. Export data from Supabase (pg_dump --data-only)
2. Transform data if needed (UUID preservation)
3. Import to Neon database
4. Verify row counts and integrity

### Phase 3: Storage Migration
1. List all files in Supabase Storage
2. Download files in batches
3. Upload to Cloudflare R2 with same paths
4. Update file URLs in database
5. Verify file integrity (checksums)

### Phase 4: Cutover
1. Enable dual-write mode (write to both)
2. Verify data consistency
3. Switch reads to Neon
4. Disable Supabase writes
5. Monitor for issues
6. Remove Supabase dependencies

## Environment Variables

### Remove (Supabase)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

### Add (Neon + R2)
```
# Neon Database
DATABASE_URL=postgres://user:pass@host.neon.tech/db?sslmode=require

# Cloudflare R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=mihas-app-docs
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data loss during migration | Low | Critical | Full backup, verification checksums |
| Performance degradation | Medium | High | Load testing, connection pooling |
| Storage URL breakage | Medium | High | URL rewriting, redirect rules |
| RLS bypass vulnerability | Low | Critical | Comprehensive middleware testing |
| Function limit exceeded | Low | Medium | Consolidation planning |
| Downtime during cutover | Medium | High | Blue-green deployment |

## Verification Checklist

### Database
- [ ] All 97 tables migrated
- [ ] All indexes recreated
- [ ] All foreign keys intact
- [ ] All triggers functional
- [ ] Row counts match source
- [ ] UUID preservation verified

### Storage
- [ ] All files migrated
- [ ] Signed URLs working
- [ ] Public URLs working
- [ ] File integrity verified
- [ ] Upload/download functional

### Security
- [ ] All RLS policies replaced
- [ ] Ownership checks working
- [ ] Role-based access working
- [ ] Audit logging functional
- [ ] No unauthorized access

### Application
- [ ] Auth flows working
- [ ] Application CRUD working
- [ ] Document upload working
- [ ] Payment verification working
- [ ] Admin operations working
- [ ] Auto-save functional
- [ ] Offline mode functional

## Correctness Properties

### Property 1: Data Integrity
**Validates: Requirement 2.8**
```
FOR ALL tables t IN source_database:
  row_count(t, source) == row_count(t, target)
  AND checksum(t, source) == checksum(t, target)
```

### Property 2: Security Equivalence
**Validates: Requirement 3.7**
```
FOR ALL RLS policies p IN source_database:
  EXISTS middleware_check m IN target_application:
    access_control(p) == access_control(m)
```

### Property 3: Storage Integrity
**Validates: Requirement 5.5**
```
FOR ALL files f IN source_storage:
  EXISTS file f' IN target_storage:
    path(f) == path(f')
    AND checksum(f) == checksum(f')
```

### Property 4: Function Limit Compliance
**Validates: Requirement 6.3**
```
count(vercel_functions) <= 12
```

### Property 5: Zero Data Loss
**Validates: Requirement 7.8**
```
FOR ALL records r created during migration:
  EXISTS r' IN target_database:
    r.id == r'.id AND r.data == r'.data
```
