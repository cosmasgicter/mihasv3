# Design Document: Website Quality Remediation

## Overview

This design addresses 33 quality issues across the MIHAS Application System (apply.mihas.edu.zm), a live production admissions portal. The remediation spans six domains: security, performance, accessibility, SEO, PWA, and code quality. All changes must preserve backward compatibility with 86 existing database tables, maintain the 8-second auto-save interval, preserve PWA offline functionality, and never log PII.

The work is organized into eight workstreams that can be executed incrementally without destabilizing the production build:

1. **Critical Security** (Reqs 1–4, 26–28, 33): Eliminate insecure PII storage, add CSRF protection, harden password reset, remove legacy auth, prevent SSRF, fix open redirects, remove hardcoded credentials, validate file uploads
2. **Security Hardening** (Reqs 5–8): Security headers, Zod validation, rate limiting, audit logging
3. **Performance** (Reqs 9–12, 29): localStorage optimization, image optimization, API client consolidation, code splitting, eliminate N+1 queries
4. **Accessibility** (Reqs 13–16): ARIA labels, keyboard navigation, color contrast, alt text
5. **SEO** (Reqs 17–18): Meta tags, structured data
6. **PWA** (Reqs 19–20, 32): Service worker conflicts, install prompts, fix SSE keepalive
7. **Code Quality** (Reqs 21–25, 30–31): Error handling, dead code, TypeScript strictness, test coverage, env validation, transaction wrapping, @ts-nocheck removal

## Architecture

### Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React 18 + TypeScript + Vite)                 │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐              │
│  │ Services  │ │ Zustand  │ │ React Query│              │
│  │ (client)  │ │ Stores   │ │ Cache      │              │
│  └─────┬─────┘ └──────────┘ └────────────┘              │
│        │  HTTP-only cookies (credentials: 'include')    │
└────────┼────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────┐
│  Vercel Edge (vercel.json headers)                      │
│  ┌──────────────────────────────────────────────┐       │
│  │ Arcjet (shield + bot + rate limit)           │       │
│  └──────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────┐       │
│  │ 12 Consolidated Serverless Functions         │       │
│  │ (api-src/*.ts → api/*.js)                    │       │
│  │ Query-parameter routing (?action=xxx)        │       │
│  └──────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────┐       │
│  │ lib/ (auth, db, errorHandler, auditLogger)   │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────┐
│  Neon Postgres (86 tables)                              │
└─────────────────────────────────────────────────────────┘
```

### Changes Introduced by This Remediation

The remediation does not alter the fundamental architecture. It hardens existing layers:

```
Browser Layer Changes:
  - SecureStorage: XOR cipher → Web Crypto AES-GCM with per-session keys
  - Auto-save: PII fields excluded from localStorage, server-only save path
  - localStorage reads: single mount-time read, in-memory cache via Zustand
  - Images: WebP with fallbacks, lazy loading, srcsets
  - API client: consolidate to single src/services/client.ts
  - Code splitting: React.lazy() for Recharts, Tesseract.js
  - Accessibility: ARIA labels, keyboard nav, focus management, contrast
  - SEO: OG/Twitter meta tags, JSON-LD structured data
  - PWA: single service worker (vite-plugin-pwa), install prompt hook
  - Error boundary: global React error boundary at app root
  - Open redirect prevention: validate notification action_url origin (Req 27)

Vercel Edge Changes:
  - vercel.json: CSP, Permissions-Policy, Referrer-Policy, HSTS on all routes
  - CSRF: token generation on login, validation middleware on POST/PATCH/DELETE
  - Zod schemas: per-action validation in each consolidated endpoint
  - Rate limiting: per-email progressive backoff, account lockout after 10 failures
  - Audit logging: coverage for all status changes, admin actions, auth events
  - SSRF prevention: URL allowlist + private IP blocking on document extract (Req 26)
  - File content validation: magic byte verification on uploads (Req 33)

Shared Lib Changes:
  - lib/auth/legacy.ts: remove Supabase references, add SHA-256→bcrypt migration
  - lib/csrf.ts: new CSRF token generation/validation module
  - lib/validation/: new Zod schema directory for API input validation
  - lib/envValidator.ts: new startup env validation module
  - lib/auditLogger.ts: expanded event coverage, retention policy metadata
  - lib/urlValidator.ts: new SSRF prevention and URL origin validation module
  - lib/fileValidator.ts: new magic byte validation module for uploads
  - lib/realtime.ts: fix SSE keepalive to 8s (within Vercel 10s timeout) (Req 32)

API Endpoint Changes:
  - api-src/applications.ts: batch grade INSERTs, wrap multi-step ops in transactions (Reqs 29, 30)
  - api-src/admin.ts: batch settings INSERTs, wrap reset in transaction (Reqs 29, 30)
  - api-src/documents.ts: add URL allowlist + magic byte validation (Reqs 26, 33)
  - api-src/notifications.ts: validate action_url domain on creation (Req 27)

Script/Config Changes:
  - scripts/test-user-flow.ts: remove hardcoded credentials, use env vars (Req 28)
  - scripts/set-passwords-and-notify.ts: remove hardcoded credentials, use env vars (Req 28)
  - 40+ src/ files: remove @ts-nocheck directives, fix type errors (Req 31)

Database Changes:
  - New table: csrf_tokens (user_id, token_hash, expires_at)
  - New table: password_reset_tokens (user_id, token_hash, expires_at, used_at)
  - New column on audit_logs: retention_category (standard | security)
  - No changes to existing 86 tables
```

## Components and Interfaces

### 1. SecureStorage Module (Req 1)

**File:** `src/lib/secureStorage.ts`

Replace XOR cipher with Web Crypto AES-GCM. Derive per-session encryption key from the user's session token using PBKDF2.

```typescript
interface SecureStorage {
  // Derive AES-GCM key from session token via PBKDF2
  deriveKey(sessionToken: string): Promise<CryptoKey>;
  // Encrypt and store non-PII data
  set(key: string, value: unknown): Promise<void>;
  // Decrypt and retrieve
  get<T>(key: string): Promise<T | null>;
  // Clear all session data on logout
  clearSession(): Promise<void>;
  // Check Web Crypto availability
  isSecureStorageAvailable(): boolean;
}
```

**PII filtering:** A `PII_FIELDS` constant lists fields to strip before localStorage writes: `nrc_number`, `passport_number`, `medical_conditions`, `phone`, `email`. The auto-save hook filters these before calling `secureStorage.set()`.

**Fallback:** If `crypto.subtle` is unavailable, store only non-PII fields in plain localStorage and show a notice banner.

### 2. CSRF Protection Module (Req 2)

**File:** `lib/csrf.ts`

```typescript
interface CSRFModule {
  // Generate 32-byte random token, store hash in DB, return raw token
  generateToken(userId: string): Promise<string>;
  // Validate token from X-CSRF-Token header against DB hash
  validateToken(userId: string, token: string): Promise<boolean>;
  // Rotate token (called during session refresh)
  rotateToken(userId: string): Promise<string>;
}
```

**Integration:** 
- On login success, generate CSRF token and return in `X-CSRF-Token` response header
- Frontend stores token in memory (Zustand auth store), attaches to all POST/PATCH/DELETE requests
- `lib/csrf.ts` middleware validates before handler logic
- Token rotated on `/api/auth?action=refresh`

### 3. Password Reset Hardening (Req 3)

**File:** `api-src/auth.ts` (new `password-reset-request` and `password-reset` actions)

```typescript
interface PasswordResetFlow {
  // Rate-limited: 3 per email per 15 min
  requestReset(email: string): Promise<void>;
  // Validate token, change password, invalidate all tokens for user
  executeReset(token: string, newPassword: string): Promise<void>;
}
```

**Database table:** `password_reset_tokens`
```sql
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  token_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash
  expires_at TIMESTAMPTZ NOT NULL,  -- 1 hour from creation
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_prt_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_token_hash ON password_reset_tokens(token_hash);
```

### 4. Legacy Auth Removal (Req 4)

**Files:** `lib/auth/legacy.ts`, `api-src/auth.ts`

Remove all plaintext and SHA-256 password comparison code paths. Add a one-time migration: on login, if `password_hash` is SHA-256 format (64 hex chars, no `$2` prefix), verify with SHA-256, then re-hash with bcrypt and update the DB row. After migration, only bcrypt verification remains.

Remove all Supabase Auth SDK imports from `api-src/auth.ts` and `lib/auth/legacy.ts`.

### 5. Security Headers (Req 5)

**File:** `vercel.json`

Add to the global `/(.*)`  headers block:
- `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.neon.tech; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- `Permissions-Policy`: `camera=(), microphone=(), geolocation=(), payment=()`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains` (move from API-only to global)

### 6. Zod Validation Layer (Req 6)

**Directory:** `lib/validation/`

```
lib/validation/
├── index.ts          # Re-exports all schemas
├── auth.ts           # login, register, password-change, password-reset schemas
├── applications.ts   # application CRUD schemas
├── admin.ts          # admin action schemas
├── documents.ts      # upload, extract schemas
├── payments.ts       # payment schemas
├── sessions.ts       # session action schemas
├── notifications.ts  # notification schemas
└── zambian.ts        # NRC format, +260 phone, ECZ grades 1-9
```

Each endpoint action gets a Zod schema. Validation middleware parses `req.body` and `req.query` before the switch statement. Failed validation returns HTTP 400 with field-level errors.

**Zambian-specific validators:**
```typescript
const nrcSchema = z.string().regex(/^\d{6}\/\d{2}\/\d$/, 'Invalid NRC format');
const zambianPhone = z.string().regex(/^\+260\d{9}$/, 'Must be +260 followed by 9 digits');
const eczGrade = z.number().int().min(1).max(9);
```

### 7. Rate Limiting & Account Protection (Req 7)

**Files:** `lib/arcjet.ts`, `api-src/auth.ts`

Arcjet already provides IP-based rate limiting. Add application-level per-email tracking:

- Track failed login attempts per email in a `login_attempts` table or in-memory (Neon query)
- After 5 failures for an email: 15-minute cooldown
- After 10 consecutive failures: 30-minute account lock + notification email via Resend
- Return `Retry-After` header on 429 responses

### 8. Audit Logging Expansion (Req 8)

**File:** `lib/auditLogger.ts`

Add new convenience functions:
- `logApplicationStatusChange(actorId, applicationId, oldStatus, newStatus)`
- `logAdminAction(actorId, actionType, entityType, entityId, changes)`
- `logPasswordReset(userId, ipAddress)`

Add `retention_category` field to audit log entries: `'standard'` (90-day) or `'security'` (365-day). Security events: login failures, role changes, password resets, account locks.

### 9. localStorage Optimization (Req 9)

**File:** `src/hooks/useAutoSave.ts`

- Read localStorage once on mount, cache in a module-level `Map<string, unknown>`
- All subsequent reads come from the in-memory cache
- Writes go to the in-memory cache immediately, then flush to localStorage via `requestIdleCallback` (or `setTimeout(fn, 0)` fallback) during the 8-second save interval
- Zero synchronous localStorage reads during render cycles after mount

### 10. Image Optimization (Req 10)

**Component:** `src/components/ui/OptimizedImage.tsx`

```typescript
interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  lazy?: boolean;       // default: true
  srcSet?: string;      // responsive breakpoints
  className?: string;
}
```

Wraps `<picture>` with WebP source and JPEG/PNG fallback. Applies `loading="lazy"` by default. Requires explicit `width`/`height` to prevent CLS.

### 11. API Client Consolidation (Req 11)

The old `src/lib/apiClient.ts` appears to already be removed. Verify no remaining imports reference it. If any `authFetch()` calls remain in hooks, migrate them to `apiClient.request()` from `src/services/client.ts`.

### 12. Code Splitting (Req 12)

- Wrap Recharts components with `React.lazy()` + `Suspense` with skeleton fallback
- Wrap Tesseract.js OCR with dynamic `import()` in the document upload step
- Add `ErrorBoundary` with retry button around lazy-loaded chunks
- Verify main bundle stays under 500KB gzipped after splitting

### 13–16. Accessibility (Reqs 13–16)

- **ARIA:** Add `aria-label`, `aria-invalid`, `aria-describedby`, `aria-required`, `aria-live` to all wizard form controls
- **Keyboard:** Use Radix UI primitives (already accessible) for modals/dialogs. Add focus trap, Escape-to-close, focus restoration. Visible 2px focus outlines.
- **Contrast:** Audit Tailwind color tokens in `tailwind.config.js`. Define accessible tokens meeting 4.5:1 (normal text) and 3:1 (large text, UI components). Pair status colors with text labels.
- **Alt text:** Audit all `<img>` tags. Add descriptive alt for informational images, `alt="" role="presentation"` for decorative. MIHAS logo: "Mukuba Institute of Health and Allied Sciences logo".

### 17–18. SEO (Reqs 17–18)

**File:** `index.html`

Add Open Graph and Twitter Card meta tags. Add JSON-LD scripts for `EducationalOrganization` and `WebApplication`.

**File:** `public/sitemap.xml`

Update URLs from `mihasv3.pages.dev` to `apply.mihas.edu.zm`. Add `<lastmod>` dates. Verify `robots.txt` Sitemap directive points to correct URL.

### 19–20. PWA (Reqs 19–20)

The legacy `public/sw.js` is already a no-op migration placeholder. The vite-plugin-pwa `injectManifest` strategy with `src/service-worker.ts` is the active worker.

- Ensure `public/sw.js` unregisters itself (already does via `skipWaiting` + `clients.claim`)
- Add `useInstallPrompt` hook to capture `beforeinstallprompt`, show custom banner, remember dismissal for 7 days
- Verify `manifest.json` has all required fields (already complete)

### 21. Error Handling Standardization (Req 21)

- Ensure all `api-src/*.ts` catch blocks use `sendError()` from `lib/errorHandler.ts`
- Add global `ErrorBoundary` component at app root with "Reload" button
- Add toast notification system for frontend API errors with retry option
- Log all caught errors via `logAuditEvent` with sanitized context

### 22. Dead Code Removal (Req 22)

- Search and remove all imports referencing: `supabase`, `sentry`, `umami`, `cloudflare`, `twilio`, `turnstile`
- Remove unreachable functions, components, hooks, and type definitions
- Remove env variable references for removed services
- Verify with full test suite + production build

### 23. TypeScript Strictness (Req 23)

Incremental approach:
1. Enable `strictNullChecks` first, fix all errors
2. Enable `noImplicitAny`, add explicit type annotations
3. Replace `as any` / `as unknown as T` with type guards
4. Add explicit return types to all exported functions in `lib/` and `api-src/`

### 24. Test Coverage (Req 24)

- Unit tests (Vitest) for all auth actions and wizard validation
- Property tests (fast-check) for SecureStorage round-trip
- E2E tests (Playwright) for full application flow
- Accessibility tests (axe-core) for login, registration, wizard steps
- Target: 80% line coverage on `lib/auth/` and `api-src/auth.ts`

### 25. Environment Validation (Req 25)

**File:** `lib/envValidator.ts`

```typescript
interface EnvValidator {
  // Validate all required env vars, throw descriptive error if missing
  validateServerEnv(): void;
  // Validate DATABASE_URL format
  validateDatabaseUrl(url: string): boolean;
  // Validate JWT secrets are >= 32 chars
  validateJwtSecrets(secret: string): boolean;
}
```

Called at the top of each serverless function (before handler logic). Returns HTTP 503 if validation fails.

**Vite plugin:** Add a Vite plugin or `vite.config.ts` `configResolved` hook that validates `VITE_*` env vars at build time.

### 26. SSRF Prevention in Document Extract (Req 26)

**File:** `lib/urlValidator.ts`

```typescript
interface URLValidator {
  // Validate URL is HTTPS and on the allowlist
  isAllowedUrl(url: string): boolean;
  // Check if URL resolves to a private IP range
  isPrivateIP(hostname: string): boolean;
}

const ALLOWED_DOMAINS = [
  'apply.mihas.edu.zm',
  // R2 storage domain from env
  process.env.R2_PUBLIC_DOMAIN,
].filter(Boolean);

const PRIVATE_IP_RANGES = [
  /^127\./,           // 127.0.0.0/8
  /^10\./,            // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,      // 192.168.0.0/16
  /^169\.254\./,      // 169.254.0.0/16
  /^0\./,             // 0.0.0.0/8
  /^::1$/,            // IPv6 loopback
  /^fc00:/,           // IPv6 ULA
  /^fe80:/,           // IPv6 link-local
];
```

**Integration in `api-src/documents.ts` handleExtract:**
1. Parse `documentUrl` with `new URL()`
2. Reject if scheme is not `https`
3. Reject if hostname matches private IP ranges
4. Reject if hostname is not in `ALLOWED_DOMAINS`
5. Set fetch timeout to 10 seconds via `AbortController`
6. Enforce 20MB max response size via streaming check

### 27. Open Redirect Prevention (Req 27)

**File:** `src/lib/urlSafety.ts`

```typescript
// Validate that a URL is safe to navigate to (same-origin or relative)
function isSafeNavigationUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true; // relative path
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}
```

**Integration:**
- `NotificationBell.tsx`: wrap `window.location.href = notification.action_url` with `isSafeNavigationUrl()` check
- `api-src/notifications.ts`: validate `action_url` on notification creation — reject absolute URLs not matching application domain

### 28. Hardcoded Credential Removal (Req 28)

**Files:** `scripts/test-user-flow.ts`, `scripts/set-passwords-and-notify.ts`

Replace all hardcoded passwords with environment variable references:

```typescript
// Before (INSECURE)
const PASSWORD = 'Beanola2025';

// After
const PASSWORD = process.env.TEST_PASSWORD;
if (!PASSWORD) throw new Error('TEST_PASSWORD env var required');
```

Add to `.gitignore`:
```
# Script credentials
.env.scripts
```

Create `.env.scripts.example` with placeholder values for documentation.

### 29. N+1 Query Elimination (Req 29)

**File:** `api-src/applications.ts` — grade sync

Replace the per-grade INSERT loop:
```typescript
// Before (N+1)
for (const g of grades) {
  const upsertQ = GradeQueries.upsert(applicationId, g.subject_id, g.grade);
  await query(upsertQ.text, upsertQ.values);
}

// After (single multi-row INSERT)
if (grades.length > 0) {
  const values: unknown[] = [];
  const placeholders: string[] = [];
  grades.forEach((g, i) => {
    const offset = i * 3;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
    values.push(applicationId, g.subject_id, g.grade);
  });
  await query(
    `INSERT INTO application_grades (application_id, subject_id, grade)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (application_id, subject_id) DO UPDATE SET grade = EXCLUDED.grade`,
    values
  );
}
```

**File:** `api-src/admin.ts` — handleResetSettings and handleImportSettings

Same pattern: collect all settings into a single multi-row INSERT/UPSERT.

### 30. Transaction Wrapping for Multi-Step Operations (Req 30)

**File:** `api-src/applications.ts`

Wrap grade sync (delete + insert) and review (status update + history insert) in transactions:

```typescript
// Grade sync — atomic delete + insert
await transaction([
  { text: deleteQ.text, values: deleteQ.values },
  { text: batchInsertQ.text, values: batchInsertQ.values },
]);

// Review — atomic status update + history insert
await transaction([
  { text: updateQ.text, values: updateQ.values },
  { text: historyQ.text, values: historyQ.values },
]);
```

**File:** `api-src/admin.ts`

Wrap settings reset (delete all + insert defaults) in a transaction.

The `transaction()` function in `lib/db.ts` already handles BEGIN/COMMIT/ROLLBACK with proper error propagation.

### 31. @ts-nocheck Removal Strategy (Req 31)

**Approach:** Incremental removal, prioritized by criticality.

**Phase 1 — Critical path files (must fix first):**
- `src/routes/config.tsx` — routing config, already has `@ts-nocheck`
- `src/hooks/usePWA.ts` — PWA functionality
- `src/forms/applicationSchema.ts` — Zod form schemas
- `src/data/applications.ts` — application data hooks

**Phase 2 — Admin hooks and services:**
- `src/hooks/admin/useApplicationsData.ts`
- `src/hooks/admin/useApplicationActions.ts`
- `src/hooks/admin/useApplicationDocuments.ts`
- `src/hooks/admin/useApplicationBulkActions.ts`
- `src/hooks/admin/useApplicationStatusHistory.ts`
- `src/services/alternativePathwayService.ts`
- `src/services/autoScaling.ts`
- `src/services/pushNotificationManager.ts`

**Phase 3 — Utility and component files:**
- All remaining `src/lib/*.ts` files with `@ts-nocheck`
- All remaining `src/components/**/*.tsx` files with `@ts-nocheck`
- All remaining `src/hooks/*.ts` files with `@ts-nocheck`

**For each file:**
1. Remove `@ts-nocheck`
2. Run `bun run build` to surface errors
3. Fix with proper types — add interfaces, type guards, explicit annotations
4. Never replace `@ts-nocheck` with per-line `@ts-ignore`

**Prerequisite:** This must complete before Req 23 (enabling `strictNullChecks`/`noImplicitAny`), since `@ts-nocheck` silently bypasses those flags.

### 32. SSE Keepalive Fix for Vercel (Req 32)

**File:** `lib/realtime.ts`

```typescript
// Before: 15-second keepalive exceeds Vercel's 10s serverless timeout
const keepalive = setInterval(() => { ... }, 15000);

// After: 8-second keepalive within Vercel's 10s timeout
// NOTE: Vercel serverless functions timeout at 10 seconds.
// Keepalive must fire before timeout to maintain the connection.
const KEEPALIVE_INTERVAL_MS = 8000;
const keepalive = setInterval(() => { ... }, KEEPALIVE_INTERVAL_MS);
```

**Connection cleanup:** Add explicit cleanup of the `connections` Map when connections close to prevent stale entries across serverless invocations:

```typescript
req.on("close", () => {
  clearInterval(keepalive);
  connections.delete(connectionId);
});
```

**Frontend reconnection:** Ensure SSE client hooks use `EventSource` with automatic reconnection and exponential backoff (1s initial, 30s max).

### 33. File Content Validation via Magic Bytes (Req 33)

**File:** `lib/fileValidator.ts`

```typescript
interface FileValidator {
  // Validate file content matches declared MIME type
  validateMagicBytes(buffer: Buffer, declaredMimeType: string): boolean;
  // Detect actual MIME type from magic bytes
  detectMimeType(buffer: Buffer): string | null;
}

const MAGIC_BYTES: Record<string, { bytes: number[]; offset: number }> = {
  'application/pdf': { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },  // %PDF
  'image/jpeg':      { bytes: [0xFF, 0xD8, 0xFF], offset: 0 },
  'image/png':       { bytes: [0x89, 0x50, 0x4E, 0x47], offset: 0 },  // .PNG
};
```

**Integration in `api-src/documents.ts` handleUpload:**
1. After base64 decode to `fileBuffer`, before R2 upload
2. Call `validateMagicBytes(fileBuffer, mimeType)`
3. If mismatch, return HTTP 400 `INVALID_FILE_CONTENT`
4. This runs before the existing MIME type allowlist check

## Data Models

### New Database Tables

#### csrf_tokens
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → profiles(id) |
| token_hash | VARCHAR(64) | NOT NULL (SHA-256) |
| expires_at | TIMESTAMPTZ | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

#### password_reset_tokens
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → profiles(id) |
| token_hash | VARCHAR(64) | NOT NULL (SHA-256) |
| expires_at | TIMESTAMPTZ | NOT NULL (1 hour) |
| used_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

#### login_attempts (for per-email rate limiting)
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| email_hash | VARCHAR(64) | NOT NULL (SHA-256 of email) |
| ip_hash | VARCHAR(64) | NOT NULL (SHA-256 of IP) |
| attempted_at | TIMESTAMPTZ | DEFAULT NOW() |
| success | BOOLEAN | DEFAULT FALSE |

### Modified Tables

#### audit_logs (add column)
| Column | Type | Constraints |
|--------|------|-------------|
| retention_category | VARCHAR(20) | DEFAULT 'standard', CHECK IN ('standard', 'security') |

### TypeScript Interfaces

```typescript
// PII fields to exclude from localStorage
const PII_FIELDS = ['nrc_number', 'passport_number', 'medical_conditions', 'phone', 'email'] as const;

// Env validation schema
interface RequiredServerEnv {
  DATABASE_URL: string;      // postgres:// or postgresql://
  JWT_SECRET: string;        // >= 32 chars
  JWT_REFRESH_SECRET: string; // >= 32 chars
  ARCJET_KEY: string;
}

// CSRF token record
interface CSRFTokenRecord {
  user_id: string;
  token_hash: string;
  expires_at: Date;
}

// Audit log retention
type RetentionCategory = 'standard' | 'security';
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: SecureStorage encryption round-trip

*For any* arbitrary JSON-serializable data and any valid session token, encrypting the data with `SecureStorage.set()` and then decrypting with `SecureStorage.get()` should return data deeply equal to the original.

**Validates: Requirements 1.1, 24.3**

### Property 2: PII field exclusion from client-side storage

*For any* form data object that may contain PII fields (nrc_number, passport_number, medical_conditions, phone, email), the client-side localStorage payload produced by the auto-save hook should contain none of those PII fields, while the server-side save payload should preserve all original fields including PII.

**Validates: Requirements 1.2, 1.6**

### Property 3: Session cleanup completeness

*For any* set of items stored via SecureStorage, after calling `clearSession()`, no keys with the secure storage prefix should remain in localStorage.

**Validates: Requirements 1.3**

### Property 4: CSRF token uniqueness and entropy

*For any* two CSRF tokens generated by `generateToken()`, they should be distinct, and each token should be at least 32 bytes of entropy when decoded.

**Validates: Requirements 2.1**

### Property 5: CSRF rejection on invalid token

*For any* POST, PATCH, or DELETE request where the `X-CSRF-Token` header is missing, empty, or contains a token not matching the server-side record, the API should respond with HTTP 403 and error code `CSRF_VALIDATION_FAILED`.

**Validates: Requirements 2.2, 2.3**

### Property 6: CSRF token rotation on refresh

*For any* session refresh operation, the CSRF token returned after refresh should differ from the token that was valid before the refresh.

**Validates: Requirements 2.5**

### Property 7: Password reset rate limiting

*For any* email address, after 3 password reset requests within a 15-minute window, subsequent requests for that email should be rejected with HTTP 429 and a `Retry-After` header.

**Validates: Requirements 3.1, 3.4**

### Property 8: Reset token invalidation on password change

*For any* user with one or more outstanding password reset tokens, after a successful password change, all of those tokens should fail validation.

**Validates: Requirements 3.2**

### Property 9: Single-use reset tokens

*For any* valid password reset token, after it is successfully used to change a password, using the same token again should fail with an invalid/expired token error.

**Validates: Requirements 3.3**

### Property 10: Bcrypt-only password hashing

*For any* non-empty password string, `hashPassword()` should produce a string matching the bcrypt format (`$2b$12$...`), and `verifyPassword(password, hash)` should return true for the original password and false for any different password.

**Validates: Requirements 4.3**

### Property 11: SHA-256 to bcrypt migration correctness

*For any* password, if it was previously hashed with SHA-256, the migration function should: (a) successfully verify the password against the SHA-256 hash, (b) produce a new bcrypt hash, and (c) the new bcrypt hash should verify correctly against the original password.

**Validates: Requirements 4.4**

### Property 12: Zod validation rejects invalid input with field errors

*For any* request body that violates a Zod schema (missing required fields, wrong types, out-of-range values), the API should return HTTP 400 with a response containing field-level validation error messages.

**Validates: Requirements 6.2**

### Property 13: Zambian data format validation

*For any* string, the NRC validator should accept only strings matching `^\d{6}/\d{2}/\d$`; the phone validator should accept only strings matching `^\+260\d{9}$`; the ECZ grade validator should accept only integers in the range 1–9. All other inputs should be rejected.

**Validates: Requirements 6.3, 6.5**

### Property 14: String input sanitization

*For any* string input, after sanitization the result should be trimmed of leading/trailing whitespace and contain no null bytes (`\0`).

**Validates: Requirements 6.4**

### Property 15: Per-email login progressive backoff

*For any* email address with 5 consecutive failed login attempts, subsequent login attempts for that email should be rejected for 15 minutes, regardless of whether the credentials are correct.

**Validates: Requirements 7.3**

### Property 16: Account lockout after consecutive failures

*For any* account with 10 consecutive failed login attempts, the account should be temporarily locked for 30 minutes, and a notification email should be queued.

**Validates: Requirements 7.4**

### Property 17: Audit log completeness and PII exclusion

*For any* state-changing operation (application status change, authentication event, or admin action), an audit log entry should be created containing: timestamp (ISO 8601), actor ID, action type, resource type, resource ID, IP address, and result. The entry should contain zero PII (no names, emails, NRC numbers, phone numbers, or medical data).

**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

### Property 18: localStorage read minimization

*For any* component using the auto-save hook, `localStorage.getItem` should be called at most once during the mount phase and zero times during subsequent render cycles.

**Validates: Requirements 9.1, 9.3**

### Property 19: Escape key closes overlays

*For any* open modal dialog, dropdown menu, or overlay panel, dispatching an `Escape` keydown event should cause it to close.

**Validates: Requirements 14.4**

### Property 20: ARIA attributes on form controls

*For any* form input, select, textarea, or file upload in the Application Wizard: it should have an `aria-label` or associated `<label>`; if required, it should have `aria-required="true"`; if in error state, it should have `aria-invalid="true"` and an `aria-describedby` referencing the error message; if it is an icon-only button, it should have an `aria-label`.

**Validates: Requirements 13.1, 13.2, 13.3, 13.5**

### Property 21: Color contrast meets WCAG AA

*For any* color token pair (foreground, background) defined in `tailwind.config.js` and used for text or UI components, the contrast ratio should be at least 4.5:1 for normal-sized text and at least 3:1 for large text and non-text UI components.

**Validates: Requirements 15.1, 15.2, 15.3, 15.5**

### Property 22: Alt text correctness by image type

*For any* `<img>` element rendered by the application, if the image is informational it should have a non-empty `alt` attribute, and if the image is decorative it should have `alt=""` and `role="presentation"`.

**Validates: Requirements 16.1, 16.2**

### Property 23: Install prompt frequency control

*For any* sequence of page navigations within a single session, the PWA install prompt should appear at most once. After dismissal, it should not appear again for 7 days (tracked via localStorage timestamp).

**Validates: Requirements 20.2, 20.3**

### Property 24: Environment variable validation

*For any* subset of the required environment variables (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ARCJET_KEY`), the validator should correctly identify all missing or empty variables and produce a descriptive error naming each one. Additionally, `DATABASE_URL` must start with `postgres://` or `postgresql://`, and JWT secrets must be at least 32 characters long.

**Validates: Requirements 25.1, 25.2, 25.3, 25.4**

### Property 25: SSRF URL validation

*For any* URL string provided as `documentUrl` to the extract endpoint, if the URL scheme is not `https`, or the hostname resolves to a private IP range, or the hostname is not in the allowed domains list, the API should reject the request with HTTP 400 and error code `INVALID_DOCUMENT_URL`.

**Validates: Requirements 26.1, 26.2**

### Property 26: Open redirect prevention

*For any* `action_url` string stored in a notification, if the URL is an absolute URL whose origin does not match the application domain, the frontend should not navigate to it, and the API should reject it during notification creation.

**Validates: Requirements 27.1, 27.2, 27.3**

### Property 27: No hardcoded credentials in source

*For any* file in the `scripts/` directory, the file content should contain zero plaintext passwords, API keys, or secrets. All credential values should be read from environment variables.

**Validates: Requirements 28.1, 28.3**

### Property 28: Batch query efficiency

*For any* set of N grades to insert, the application should execute at most 2 database queries (1 delete + 1 batch insert), not N+1 queries.

**Validates: Requirements 29.1**

### Property 29: Transaction atomicity

*For any* multi-step database operation (grade sync, status review, settings reset), if any step fails, all preceding steps in the same operation should be rolled back, leaving the database in its pre-operation state.

**Validates: Requirements 30.1, 30.2, 30.3, 30.4**

### Property 30: Magic byte validation

*For any* uploaded file, if the first bytes of the file content do not match the magic bytes for any allowed file type (PDF: `%PDF`, JPEG: `FF D8 FF`, PNG: `89 50 4E 47`), the upload should be rejected with HTTP 400 regardless of the declared MIME type.

**Validates: Requirements 33.1, 33.2, 33.3**

## Error Handling

### API Layer

All API endpoints follow a consistent error handling pattern:

1. **Zod validation** runs first — returns HTTP 400 with field-level errors on failure
2. **CSRF validation** runs on POST/PATCH/DELETE — returns HTTP 403 `CSRF_VALIDATION_FAILED`
3. **Auth middleware** (`requireAuth`/`requireRole`) — returns HTTP 401/403
4. **Business logic** wrapped in try/catch — all exceptions routed through `sendError(res, statusCode, message, code)`
5. **Audit logging** in catch blocks via `logAuditEvent` with sanitized context (no PII, no stack traces)

Error response envelope (unchanged):
```json
{ "success": false, "error": "Human-readable message", "code": "ERROR_CODE" }
```

Rate limit responses include `Retry-After` header with seconds until retry is allowed.

### Frontend

1. **Global ErrorBoundary** at app root catches unhandled React rendering errors, displays recovery UI with "Reload" button
2. **API error handling** in `src/services/client.ts` — enhanced error messages via `ApiErrorHandler`, toast notifications with retry option
3. **Lazy-load ErrorBoundary** wraps `React.lazy()` components — catches chunk load failures, shows retry button
4. **Offline detection** — service worker serves cached pages, displays offline indicator banner

### Environment Validation

- Serverless functions validate env vars on cold start before any handler logic
- Missing/invalid vars → HTTP 503 with descriptive error naming the missing variable
- Vite build validates `VITE_*` vars at build time — fails build with clear error

### Graceful Degradation

- Web Crypto unavailable → fall back to non-PII localStorage storage with notice banner
- Arcjet unavailable → fail secure (block request), return 503
- Resend email failure → queue with retry
- External eligibility APIs (HPCZ, GNC/NMCZ, ECZ) → advisory only, never blocking

## Testing Strategy

### Dual Testing Approach

This remediation uses both unit tests and property-based tests for comprehensive coverage:

- **Unit tests (Vitest):** Specific examples, edge cases, integration points, error conditions
- **Property-based tests (fast-check):** Universal properties across randomized inputs, minimum 100 iterations per property

Both are complementary — unit tests catch concrete bugs at specific values, property tests verify general correctness across the input space.

### Property-Based Testing Configuration

- **Library:** fast-check (already in project dependencies per `tests/property/` directory)
- **Minimum iterations:** 100 per property test
- **Tag format:** Each test tagged with a comment: `// Feature: website-quality-remediation, Property {N}: {title}`
- **Each correctness property maps to exactly one property-based test**

### Test Organization

```
tests/
├── unit/
│   ├── secureStorage.test.ts        # SecureStorage encrypt/decrypt, PII filtering, fallback
│   ├── csrf.test.ts                 # CSRF generation, validation, rotation
│   ├── passwordReset.test.ts        # Rate limiting, token invalidation, single-use
│   ├── authLegacyMigration.test.ts  # SHA-256 → bcrypt migration
│   ├── zodValidation.test.ts        # Schema validation for each endpoint action
│   ├── zambianValidation.test.ts    # NRC, phone, ECZ grade validators
│   ├── envValidator.test.ts         # Env var validation
│   ├── auditLogger.test.ts          # Audit entry creation, PII sanitization
│   ├── autoSave.test.ts             # localStorage read count, write batching
│   ├── installPrompt.test.ts        # PWA install prompt frequency
│   ├── urlValidator.test.ts         # SSRF prevention, private IP detection
│   ├── urlSafety.test.ts            # Open redirect prevention
│   ├── fileValidator.test.ts        # Magic byte validation
│   └── transactionWrapping.test.ts  # Multi-step operation atomicity
├── property/
│   ├── secureStorage.property.test.ts    # P1: round-trip, P2: PII exclusion, P3: cleanup
│   ├── csrf.property.test.ts             # P4: uniqueness, P5: rejection, P6: rotation
│   ├── passwordReset.property.test.ts    # P7: rate limit, P8: invalidation, P9: single-use
│   ├── password.property.test.ts         # P10: bcrypt format, P11: migration
│   ├── validation.property.test.ts       # P12: Zod errors, P13: Zambian formats, P14: sanitization
│   ├── rateLimiting.property.test.ts     # P15: backoff, P16: lockout
│   ├── auditLogger.property.test.ts      # P17: completeness + PII exclusion
│   ├── localStorage.property.test.ts     # P18: read minimization
│   ├── accessibility.property.test.ts    # P20: ARIA attributes, P21: contrast, P22: alt text
│   ├── installPrompt.property.test.ts    # P23: prompt frequency
│   ├── envValidator.property.test.ts     # P24: env validation
│   ├── urlValidator.property.test.ts     # P25: SSRF URL validation
│   ├── urlSafety.property.test.ts        # P26: open redirect prevention
│   ├── credentialScan.property.test.ts   # P27: no hardcoded credentials
│   ├── batchQuery.property.test.ts       # P28: batch query efficiency
│   ├── transaction.property.test.ts      # P29: transaction atomicity
│   └── fileValidator.property.test.ts    # P30: magic byte validation
├── integration/
│   └── securityHeaders.test.ts      # Verify vercel.json headers (CSP, HSTS, etc.)
└── e2e/
    ├── applicationFlow.e2e.ts       # Full flow: register → login → wizard → submit
    └── accessibility.e2e.ts         # axe-core on login, registration, wizard steps
```

### Coverage Targets

- `lib/auth/` and `api-src/auth.ts`: minimum 80% line coverage
- `lib/validation/`: minimum 90% line coverage (pure validation logic)
- `src/lib/secureStorage.ts`: minimum 90% line coverage

### Accessibility Testing

- **axe-core** integrated via Vitest or Playwright
- Verify zero critical or serious violations on: login page, registration page, each wizard step
- Run as part of CI pipeline
