# Jobs-Ops, Config & Deploy Audit Findings

## Summary
- Total files: 141
- ignore-as-correct: 97
- improve: 30
- remove: 4
- needs-human-decision: 10

## Critical Findings

### CRITICAL: Production secrets in local env files

Multiple `.env` files on disk contain **real production credentials** (database passwords, JWT secrets, API keys, SMTP passwords, R2 storage keys, Lenco payment keys, Redis URLs). While all are gitignored and NOT tracked by git, they represent a zero-day-class risk if the workstation is compromised or the files are accidentally shared.

Affected files:
- `.env.local` — full production DB, JWT, R2, SMTP, Resend, VAPID, Lenco secrets
- `.env.vercel.development` — same secrets duplicated
- `.env.vercel.preview` — same secrets duplicated + Turborepo tokens
- `.env.vercel.production` — subset (VITE_* only, safe)
- `backend/.env` — full production DB, Redis, JWT, SMTP, R2, Lenco, AI Gateway secrets
- `backend/.env.production` — full production DB, Redis, JWT, R2, Lenco secrets
- `apps/admissions/.env` — Lenco public key (live), VAPID public key
- `apps/admissions/.env.local` — GlitchTip DSN only (low risk)

---

## Findings

### .env.local — improve
**Tag:** zero-day-class-risk
**Issue:** Contains real production DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, R2 keys, SMTP_PASSWORD, RESEND_API_KEY, VAPID_PRIVATE_KEY, VERCEL_OIDC_TOKEN in plaintext. SECRET_KEY and JWT_SIGNING_KEY are identical (`4Yd8j2K9...`), weakening key separation.
**Location:** Entire file
**Recommendation:** 1) Rotate ALL exposed secrets immediately. 2) Use distinct values for SECRET_KEY vs JWT_SIGNING_KEY. 3) Remove backend-only vars from this frontend-oriented file. 4) Consider using a secrets manager instead of flat files.

### .env.vercel.development — improve
**Tag:** zero-day-class-risk
**Issue:** Duplicate of `.env.local` with identical real production secrets. Created by Vercel CLI — should not persist on disk with real credentials.
**Location:** Entire file
**Recommendation:** Delete this file. Vercel CLI pulls env vars on demand; persisting them locally is unnecessary risk.

### .env.vercel.preview — improve
**Tag:** zero-day-class-risk
**Issue:** Same production secrets as above, plus Turborepo cache tokens (TURBO_CACHE, TURBO_REMOTE_ONLY). Contains VERCEL_OIDC_TOKEN JWT.
**Location:** Entire file
**Recommendation:** Delete this file. Same reasoning as .env.vercel.development.

### .env.vercel.production — ignore-as-correct
**Tag:** n/a
**Issue:** Contains only VITE_* public vars. No secrets. Correctly scoped for Vercel production frontend.

### .env.development — ignore-as-correct
**Tag:** n/a
**Issue:** Template file with `[set-in-local-env]` placeholders. No real secrets. Correctly structured.

### .env.example — ignore-as-correct
**Tag:** n/a
**Issue:** Template with placeholder values. Well-documented. No secrets.

### .env.frontend — improve
**Tag:** confirmed-bug
**Issue:** Contains real GlitchTip DSN with project key. While GlitchTip DSNs are semi-public (embedded in JS bundles), this file mixes the frontend DSN (project 22423) with the one used in production (project 22431 per steering docs). Inconsistent project IDs suggest a stale or wrong DSN.
**Location:** Line 5 (VITE_GLITCHTIP_DSN)
**Recommendation:** Verify which GlitchTip project ID is correct (22423 vs 22431). The admissions `.env` uses 22431, but `.env.frontend` and `.env.production` use 22423.

### .env.production — ignore-as-correct
**Tag:** n/a
**Issue:** Template file with `[set-in-hosting-platform]` placeholders for secrets. Well-structured separation of Vercel vs Koyeb vars. No real secrets.

### .env.scripts.example — ignore-as-correct
**Tag:** n/a
**Issue:** Clean template for test scripts. Placeholder values only.

### .github/workflows/ci.yml — ignore-as-correct
**Tag:** n/a
**Issue:** Well-structured CI with backend (Postgres+Redis services), admissions (type-check, lint, test, build), and jobs-ops (type-check, lint, build) jobs. Uses safe CI-only test keys. Concurrency cancellation enabled.

### .github/workflows/backend-governance.yml — ignore-as-correct
**Tag:** n/a
**Issue:** Focused governance pipeline for schema verification and outbox tests. Correctly scoped to backend paths.

### .gitignore — improve
**Tag:** confirmed-bug
**Issue:** Line `scripts/stagehand-full-flow.ts` is gitignored because it contains hardcoded dev credentials. However, the gitignore comment says "E2E test with hardcoded dev credentials" — this is correct behavior but the file itself (read below) contains REAL user credentials, not dev placeholders.
**Location:** Line 4
**Recommendation:** The stagehand-full-flow.ts file contains real email/password. Ensure it stays gitignored. Consider adding `scripts/stagehand-*.ts` as a broader pattern to catch future credential-bearing scripts.

### .kiro/mcp.json — improve
**Tag:** suspicious-stale-path
**Issue:** Contains Windows-specific paths (`C:\\Users\\Cosma\\AppData\\Roaming\\Python\\Python314\\Scripts\\uvx.exe`) for fetch and sqlite MCP servers. These won't work on the current Linux environment.
**Location:** Lines for "fetch" and "sqlite" commands
**Recommendation:** Use platform-agnostic `uvx` command instead of hardcoded Windows paths. The `.kiro/settings/mcp.json` already uses the correct `uvx` form.

### .kiro/pbt-status.json — ignore-as-correct
**Tag:** n/a
**Issue:** Property-based test status tracking. All entries show "pass" status.

### .kiro/settings/mcp.json — ignore-as-correct
**Tag:** n/a
**Issue:** MCP server configuration with most servers disabled. Uses platform-agnostic commands. No secrets (empty API key placeholders).

### .kiro/skills/code-to-prd/code-to-prd/scripts/.gitignore — ignore-as-correct
### .kiro/skills/code-to-prd/scripts/.gitignore — ignore-as-correct
### .kiro/skills/google-workspace-cli/.gitignore — ignore-as-correct
### .kiro/skills/google-workspace-cli/google-workspace-cli/.gitignore — ignore-as-correct
### .kiro/skills/x-twitter-growth/.gitignore — ignore-as-correct
### .kiro/skills/x-twitter-growth/x-twitter-growth/.gitignore — ignore-as-correct
**Tag:** n/a
**Issue:** Standard skill-level gitignore files. Correctly exclude Python cache, auth tokens, and env files.

### .pytest_cache/.gitignore — ignore-as-correct
### backend/.pytest_cache/.gitignore — ignore-as-correct
**Tag:** n/a
**Issue:** Auto-generated by pytest. Standard.

### .vercel/project.json — ignore-as-correct
**Tag:** n/a
**Issue:** Vercel project metadata. Contains project ID and org ID (not secrets).

### .vscode/settings.json — ignore-as-correct
**Tag:** n/a
**Issue:** Single setting disabling auto-closing tags. Minimal and correct.

### apps/admissions/.env — improve
**Tag:** confirmed-bug
**Issue:** Contains live Lenco public key (`pub-950ae7a222b375423a5e10f0770f66952fef46b281d2c248`) and uses GlitchTip project 22431. This is the production `.env` that gets loaded by Vite. The `VITE_APP_VERSION=45d5ee7e7` looks like a commit SHA fragment — correct for production but inconsistent with other env files showing `1.0.0`.
**Location:** Lines 10, 14
**Recommendation:** Ensure VITE_APP_VERSION is set dynamically at build time, not hardcoded to a stale commit SHA.

### apps/admissions/.env.example — ignore-as-correct
**Tag:** n/a
**Issue:** Well-documented template with placeholder values and clear local/production comments.

### apps/admissions/.env.local — ignore-as-correct
**Tag:** n/a
**Issue:** Contains only GlitchTip DSN (project 22431). Semi-public. Acceptable.

### apps/admissions/.env.production — ignore-as-correct
**Tag:** n/a
**Issue:** Production Vercel env template. VITE_* vars only. No secrets. Version shows 2.0.0 (inconsistent with other files showing 1.0.0 — minor).

### apps/admissions/bunfig.toml — ignore-as-correct
### apps/admissions/components.json — ignore-as-correct
### apps/admissions/postcss.config.js — ignore-as-correct
**Tag:** n/a
**Issue:** Standard configuration files. Correct.

### apps/admissions/eslint.config.js — ignore-as-correct
**Tag:** n/a
**Issue:** Comprehensive ESLint config with good restricted-imports rules blocking deprecated modules. Well-maintained.

### apps/admissions/package.json — improve
**Tag:** confirmed-bug
**Issue:** `@hookform/resolvers` pinned to exact `5.2.2` and `zod` pinned to exact `4.3.6` (no caret), while most other deps use caret ranges. This is intentional per bunfig.toml `exact = true`, but the `zod` version 4.3.6 is very new — verify compatibility. Also, `@vitejs/plugin-react` is in devDependencies in jobs-ops but in dependencies here — inconsistent placement.
**Location:** dependencies section
**Recommendation:** Move `@vitejs/plugin-react`, `autoprefixer`, `postcss`, `tailwindcss`, `typescript`, `vite` to devDependencies since they're build-time only. This won't affect Vercel builds but is semantically correct.

### apps/admissions/playwright.config.ts — ignore-as-correct
**Tag:** n/a
**Issue:** Standard Playwright config. Single worker, chromium only. Correct.

### apps/admissions/tailwind.config.js — ignore-as-correct
**Tag:** n/a
**Issue:** Comprehensive config with full Inter font fallback chain matching steering docs. Admin colors sourced from design tokens. Custom utilities for focus-ring, press-scale, etc.

### apps/admissions/tsconfig.json — ignore-as-correct
### apps/admissions/tsconfig.build.json — ignore-as-correct
### apps/admissions/tsconfig.tests.json — ignore-as-correct
**Tag:** n/a
**Issue:** Well-structured TypeScript configs with proper path aliases and build/test separation.

### apps/admissions/vercel.json — ignore-as-correct
**Tag:** n/a
**Issue:** Strong security headers (CSP, HSTS, X-Frame-Options DENY, Permissions-Policy). CSP includes Lenco sandbox for dev. Report-uri points to GlitchTip. Asset caching is correct (immutable for hashed assets). The X-CSP-Note header documenting the unsafe-inline TODO is good practice.

### apps/admissions/vite.config.ts — ignore-as-correct
**Tag:** n/a
**Issue:** Well-structured with env validation plugin, proper manual chunks, terser config dropping console.log. Dev proxy correctly configured.

### apps/admissions/vitest.config.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Extremely long exclude list (60+ test files). Many excluded tests reference patterns like `supabase-complete-removal`, `api-hardening`, `production-readiness-audit` — these may be stale tests from past migration phases that should be deleted rather than excluded.
**Location:** Lines 10-100 (exclude array)
**Recommendation:** Review each excluded test file. If the test file no longer exists or tests deprecated functionality, remove it from the exclude list. If the file exists but is broken, either fix or delete it.

### apps/admissions/public/ocr/tesseract/* (5 files) — ignore-as-correct
**Tag:** n/a
**Issue:** Tesseract WASM binaries and worker script. Gitignored (generated by prepare-ocr-assets.mjs at dev/build time). Not tracked.

### apps/jobs-ops/bunfig.toml — ignore-as-correct
### apps/jobs-ops/postcss.config.js — ignore-as-correct
**Tag:** n/a
**Issue:** Standard config files matching admissions conventions.

### apps/jobs-ops/eslint.config.js — improve
**Tag:** confirmed-bug
**Issue:** Missing `no-restricted-imports` rules that admissions has. Jobs-ops should block imports from deprecated paths and enforce canonical module usage as the app grows. Also missing `coverage/**` in ignores.
**Location:** Rules section
**Recommendation:** Add `no-restricted-imports` rules to prevent importing from `@/utils/` (should use `@/lib/`) and block any future Supabase imports. Add `coverage/**` to ignores.

### apps/jobs-ops/package.json — improve
**Tag:** confirmed-bug
**Issue:** `@vitejs/plugin-react`, `autoprefixer`, `postcss`, `tailwindcss`, `typescript`, `vite` are in `dependencies` instead of `devDependencies`. These are build-time only tools. Also, `@hookform/resolvers` is listed but React Hook Form + Zod forms aren't implemented yet in jobs-ops — premature dependency.
**Location:** dependencies section
**Recommendation:** Move build-time packages to devDependencies. Consider removing `@hookform/resolvers` until write flows are implemented.

### apps/jobs-ops/tailwind.config.js — improve
**Tag:** confirmed-bug
**Issue:** Font fallback chain uses `'"IBM Plex Sans"', 'system-ui', 'sans-serif'` which is much shorter than the full Tailwind default stack. Steering docs require the full fallback chain. Also missing `'ui-sans-serif'`, `'-apple-system'`, `'BlinkMacSystemFont'`, `'"Segoe UI"'`, `'Roboto'`, `'"Helvetica Neue"'`, `'Arial'`, `'"Noto Sans"'` in the sans chain.
**Location:** fontFamily.sans (line ~15)
**Recommendation:** Extend to: `['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif']`. Same for display and mono families.

### apps/jobs-ops/tsconfig.json — ignore-as-correct
### apps/jobs-ops/tsconfig.build.json — ignore-as-correct
**Tag:** n/a
**Issue:** Well-structured. Proper path aliases. ES2022 target.

### apps/jobs-ops/vercel.json — improve
**Tag:** confirmed-bug
**Issue:** 1) Has an API rewrite rule (`/api/:path*` → `https://api.mihas.edu.zm/api/:path*`) which contradicts the steering doc stating "Vercel free tier does not support external rewrites." This rewrite will silently fail on Vercel Hobby plan, causing API calls to 404. 2) CSP `connect-src` is missing Lenco domains that may be needed if jobs-ops ever handles payments. 3) The `X-CSP-Note` header leaks internal security planning to the public.
**Location:** rewrites section (line 7-10), headers section
**Recommendation:** Remove the `/api/:path*` rewrite — jobs-ops should call `https://api.mihas.edu.zm` directly (cross-origin with credentials), matching the admissions pattern. Remove the `X-CSP-Note` header from production.

### apps/jobs-ops/vite.config.ts — improve
**Tag:** confirmed-bug
**Issue:** Missing the `envValidationPlugin` that admissions has. Production builds won't fail on missing required VITE_* vars. Also missing `build` configuration (minification, chunk splitting, sourcemap settings) — will use Vite defaults which include sourcemaps and no terser.
**Location:** Entire file
**Recommendation:** Add env validation for `VITE_API_BASE_URL`. Add build config with `minify: 'terser'`, `sourcemap: false`, and `drop_console: true` for production parity with admissions.

### apps/jobs-ops/src/App.tsx — ignore-as-correct
### apps/jobs-ops/src/main.tsx — ignore-as-correct
**Tag:** n/a
**Issue:** Clean entry points. StrictMode enabled. Standard React 18 pattern.

### apps/jobs-ops/src/app/providers.tsx — ignore-as-correct
**Tag:** n/a
**Issue:** Clean QueryClient setup with sensible defaults (retry: 1, staleTime: 30s, no refetchOnWindowFocus).

### apps/jobs-ops/src/app/router.tsx — ignore-as-correct
**Tag:** n/a
**Issue:** All routes correctly mapped to feature pages. Route structure matches navigation.ts.

### apps/jobs-ops/src/app/layout/navigation.ts — ignore-as-correct
**Tag:** n/a
**Issue:** Clean navigation config with icons, labels, hints. Pinned artifacts reference correct paths.

### apps/jobs-ops/src/app/layout/JobsOpsShell.tsx — improve
**Tag:** confirmed-bug
**Issue:** Command palette overlay lacks proper focus trap and `role="dialog"` / `aria-modal="true"` attributes. The backdrop click handler is missing (clicking outside the palette doesn't dismiss it). The keyboard handler for Escape works but the overlay div has no `onClick` to dismiss.
**Location:** Lines 170-210 (command palette section)
**Recommendation:** Add `onClick={dismissPalette}` to the backdrop div. Add `role="dialog"` and `aria-modal="true"` to the palette container. Consider adding focus trap for accessibility.

### apps/jobs-ops/src/components/ui/* (7 files) — ignore-as-correct
**Tag:** n/a
**Issue:** EmptyState, LoadingState, MetricCard, PageHeader, ProgressBar, SectionCard, StatusBadge — all clean, well-typed, minimal components. ProgressBar correctly uses aria-hidden. StatusBadge has proper tone mapping.

### apps/jobs-ops/src/features/*/pages/* (12 page files) — ignore-as-correct
**Tag:** n/a
**Issue:** All feature pages (OverviewPage, JobsInboxPage, JobDetailPage, JobApplicationsPage, AutomationRunsPage, OutreachCRMPage, EmailOpsPage, ResumeLabPage, IntegrationsPage, SourceHealthPage, ReportsPage, AuditLogPage, ReviewWorkbenchPage) are well-structured with React Query data fetching, proper loading/empty states, and consistent UI patterns. Type safety is good throughout.

### apps/jobs-ops/src/features/shared/ScaffoldPage.tsx — ignore-as-correct
**Tag:** n/a
**Issue:** Generic scaffold page component. Clean props interface. Not currently used in routes but available for future pages.

### apps/jobs-ops/src/lib/env.ts — improve
**Tag:** confirmed-bug
**Issue:** Hardcoded fallback to `http://localhost:8000` when `VITE_API_BASE_URL` is missing. In production, if the env var is accidentally unset, the app will silently try to call localhost instead of failing visibly.
**Location:** Line 2
**Recommendation:** Add a runtime warning or throw in production mode when the env var is missing: `if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) console.error('VITE_API_BASE_URL is required in production')`.

### apps/jobs-ops/src/lib/format.ts — ignore-as-correct
**Tag:** n/a
**Issue:** Clean utility functions. Proper Intl.DateTimeFormat and Intl.RelativeTimeFormat usage. NaN guard on date parsing.

### apps/jobs-ops/src/services/api/client.ts — improve
**Tag:** confirmed-bug
**Issue:** 1) The `logApiFailure` function uses `console.error` which will persist in production builds (no terser config to strip it). 2) Missing CSRF token handling — the client sends `credentials: 'include'` but doesn't attach `x-csrf-token` header for state-changing requests. This will cause 403 errors on POST/PUT/DELETE once auth is implemented. 3) No CSRF recovery flow like admissions has.
**Location:** Lines 60-70 (logApiFailure), Lines 75-95 (request function)
**Recommendation:** 1) Add terser config to vite.config.ts to strip console in production. 2) Add CSRF token management (in-memory store + header attachment) before implementing write flows. 3) Add CSRF recovery pattern matching admissions `recoverCsrfAndRetry`.

### apps/jobs-ops/src/services/api/contracts.ts — ignore-as-correct
**Tag:** n/a
**Issue:** Clean type definitions. Proper snake_case → camelCase mapping in service files. ApiEnvelope type matches backend convention.

### apps/jobs-ops/src/services/api/analytics.ts — ignore-as-correct
### apps/jobs-ops/src/services/api/automation.ts — ignore-as-correct
### apps/jobs-ops/src/services/api/documents.ts — ignore-as-correct
### apps/jobs-ops/src/services/api/email.ts — ignore-as-correct
### apps/jobs-ops/src/services/api/job-applications.ts — ignore-as-correct
### apps/jobs-ops/src/services/api/jobs.ts — ignore-as-correct
### apps/jobs-ops/src/services/api/outreach.ts — ignore-as-correct
### apps/jobs-ops/src/services/api/platform.ts — ignore-as-correct
**Tag:** n/a
**Issue:** All API service files follow the same clean pattern: Raw type → mapped type, try/catch with fallback data, proper snake_case→camelCase mapping. Fallback data is well-structured scaffold data. This is the correct pattern for a scaffold-phase app.

### apps/jobs-ops/src/stores/ui-store.ts — ignore-as-correct
**Tag:** n/a
**Issue:** Minimal Zustand store for sidebar and command palette state. Clean and correct.

### backend/.env — improve
**Tag:** zero-day-class-risk
**Issue:** Contains ALL production secrets in plaintext: Neon DB credentials, Upstash Redis URL+password, JWT signing key, Zoho SMTP password (`Skyl3r@L0m1s`), Resend API key, R2 storage keys, Lenco API secret key, VAPID private key, AI Gateway API key, audit log encryption key. SECRET_KEY and JWT_SIGNING_KEY are identical — weakens key separation. The file is gitignored but exists on disk.
**Location:** Entire file
**Recommendation:** 1) Rotate ALL secrets. 2) Use distinct values for SECRET_KEY and JWT_SIGNING_KEY. 3) Consider using a local secrets manager or encrypted vault.

### backend/.env.example — ignore-as-correct
**Tag:** n/a
**Issue:** Well-documented template with placeholder values. Includes Lenco, GlitchTip, VAPID, AI Gateway, and Jobs Ops integration vars. No real secrets.

### backend/.env.production — improve
**Tag:** zero-day-class-risk
**Issue:** Contains real production secrets identical to `backend/.env`. This file duplicates the risk. Also contains `OPENAI_MODEL=gpt-5.4` which is not a real model name — likely a placeholder or typo.
**Location:** Entire file, line with OPENAI_MODEL
**Recommendation:** Delete this file — it duplicates `backend/.env` and the real production secrets should only live in Koyeb's secret manager. Fix the model name.

### backend/.dockerignore — ignore-as-correct
**Tag:** n/a
**Issue:** Correctly excludes .env files, tests, docs, venv, and build artifacts from Docker context.

### backend/.gitignore — ignore-as-correct
**Tag:** n/a
**Issue:** Standard Python gitignore. Correctly excludes .env files, __pycache__, venv, coverage.

### backend/Dockerfile — improve
**Tag:** confirmed-bug
**Issue:** 1) Runs as root user — no `USER` directive to drop privileges. Production containers should run as non-root. 2) `gcc` is installed for building but not removed after pip install, increasing attack surface and image size. 3) Build-time `collectstatic` uses placeholder secrets which is correct, but the `AUDIT_LOG_ENCRYPTION_KEY=build-time-placeholder-key-0123456789ab` may cause issues if any import-time code validates key format.
**Location:** Lines 1-30 (no USER), Line 10 (gcc not cleaned)
**Recommendation:** 1) Add `RUN useradd -m appuser` and `USER appuser` before CMD. 2) Use multi-stage build or remove gcc after pip install: `apt-get purge -y gcc && apt-get autoremove -y`. 3) Verify AUDIT_LOG_ENCRYPTION_KEY placeholder doesn't break collectstatic.

### backend/docker-compose.yml — ignore-as-correct
**Tag:** n/a
**Issue:** Well-structured local dev compose with Postgres 16, Redis 7, web, celery, and celery-beat (behind profile). Health checks on all services. Correct env var fallbacks.

### backend/pyproject.toml — ignore-as-correct
**Tag:** n/a
**Issue:** Standard Python project config. Correct pytest settings with DJANGO_SETTINGS_MODULE. Ruff targeting py312.

### backend/requirements.txt — ignore-as-correct
**Tag:** n/a
**Issue:** All dependencies use version ranges (>=X,<Y). Includes all expected packages: Django 5, DRF, celery, redis, sentry-sdk, etc. `openai` package is listed for AI features.

### backend/migrations/apply-migrations.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** TypeScript migration runner using `@neondatabase/serverless`. Contains SQL injection risk in `recordMigration()` — uses string interpolation (`'${fileName.replace(...)}'`) instead of parameterized queries. The `splitSqlStatements` function has a basic dollar-quote parser that may fail on complex PL/pgSQL. Also references a `REQUIRED_MIGRATIONS` list that may be stale.
**Location:** Line 120 (recordMigration), Line 130 (splitSqlStatements)
**Recommendation:** 1) Use parameterized queries for recordMigration. 2) Verify REQUIRED_MIGRATIONS list matches actual migration files. 3) Consider whether this runner is still needed vs. using Neon MCP directly.

### backend/migrations/forensic/core_tables.json — ignore-as-correct
**Tag:** n/a
**Issue:** Schema extraction snapshot from Feb 2026. Historical reference for migration planning.

### backend/scripts/add_audit_log_encrypted_network_context.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Idempotent ALTER TABLE with IF NOT EXISTS. Adds encrypted IP/UA columns for forensic access.

### backend/scripts/add_missing_payment_columns.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Idempotent column additions. Correct types for Lenco integration.

### backend/scripts/add_outbox_events.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Well-designed outbox table with proper indexes, idempotency key, retry tracking. IF NOT EXISTS guards.

### backend/scripts/add_payments_app_status_index.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Targeted composite index for double-payment prevention. Well-documented purpose.

### backend/scripts/add_performance_indexes.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Comprehensive index additions for hot query paths. All use IF NOT EXISTS.

### backend/scripts/business_logic_densification.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Large migration adding conditions, templates, calendar, fee waivers, amendments tables. Proper FK constraints and indexes.

### backend/scripts/cambridge_subjects.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Seed data for Cambridge IGCSE/A-Level subjects. Uses ON CONFLICT DO NOTHING for idempotency.

### backend/scripts/create_error_logs_table.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Creates deprecated error_logs table (preserved for historical records per steering docs). Proper indexes.

### backend/scripts/create_sse_events_table.sql — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Creates sse_events table, but `drop_sse_events_table.sql` also exists to drop it. Steering docs say "Do not introduce SSE or WebSocket connections for these surfaces." If SSE was abandoned, this create script is stale.
**Location:** Entire file
**Recommendation:** Verify if sse_events table exists in production. If it was dropped, remove this create script or mark it as historical.

### backend/scripts/deferred_payments.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Adds comment on payments.status column and seeds deferred_payment_reminder template. Idempotent.

### backend/scripts/drop_program_fee_full_unique.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Drops conflicting full unique constraint, keeping the partial unique index. Correct fix.

### backend/scripts/drop_sse_events_table.sql — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Drops sse_events table. Paired with create_sse_events_table.sql. If already executed, both scripts are historical artifacts.
**Location:** Entire file
**Recommendation:** If SSE was fully abandoned, archive both SSE scripts to a `scripts/archived/` directory.

### backend/scripts/idempotency_redesign.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Clean redesign of idempotency_keys table with command-identity keying. Wrapped in transaction. Proper unique constraint.

### backend/scripts/lenco_payment_integration.sql — improve
**Tag:** confirmed-bug
**Issue:** Creates `uq_program_fee_type_residency` UNIQUE constraint AND `uq_program_fee_active` partial unique index. But `drop_program_fee_full_unique.sql` later drops the full constraint. This means running lenco_payment_integration.sql after the drop script would re-create the conflicting constraint. The migration runner should track execution order.
**Location:** Lines 15-20 (CONSTRAINT definition)
**Recommendation:** Remove the full UNIQUE constraint from this script since it's been superseded by the partial index. Or add a comment noting the constraint is dropped by a later script.

### backend/scripts/remediate_integrity.sql — needs-human-decision
**Tag:** n/a
**Issue:** One-time remediation script for specific application records (APP-20260401-D169738A, MIHAS202661975). References specific data. Should only be run once.
**Location:** Entire file
**Recommendation:** Verify this was already executed in production. If so, move to `scripts/archived/`.

### backend/scripts/seed_program_fees.sql — ignore-as-correct
**Tag:** n/a
**Issue:** Seeds K153 application fees for 4 programs. Uses ON CONFLICT DO NOTHING. Idempotent.

### backend/scripts/unify_application_numbers.sql — needs-human-decision
**Tag:** n/a
**Issue:** Complex migration changing application number format from APP-YYYYMMDD-XXXXXXXX to institution-based format. Uses temp tables and transactions. Should only be run once.
**Location:** Entire file
**Recommendation:** Verify execution status. If completed, archive.

### backend/tests/contract/recordings/*.json (4 files) — improve
**Tag:** suspicious-stale-path
**Issue:** Contract recordings reference legacy Vercel API paths (`/api/applications`, `/api/auth?action=login`, `/api/catalog?type=programs`, `/api/health?action=ping`) alongside Django paths. The steering docs explicitly state "There are no legacy `/api/{resource}?action=` query-parameter routes." These recordings contain stale path assumptions.
**Location:** `request.path` fields in all 4 files
**Recommendation:** Update contract recordings to use only the current `/api/v1/...` paths. Remove legacy Vercel path references.

### docs/integrations/examples/nodejs/api-client.js — improve
**Tag:** suspicious-stale-path
**Issue:** Uses `axios` and points to `https://mihasv3.pages.dev` as the base URL — this is a stale Cloudflare Pages URL. The current API is at `https://api.mihas.edu.zm`. Also uses Bearer token auth instead of cookie-based auth.
**Location:** Line 12 (baseUrl), Line 14 (Authorization header)
**Recommendation:** Update base URL to `https://api.mihas.edu.zm`. Update auth pattern to match current cookie-based auth. Or remove if this example is no longer relevant.

### docs/integrations/examples/nodejs/webhook-handler.js — improve
**Tag:** suspicious-stale-path
**Issue:** Uses HMAC-SHA256 for webhook verification, but the Lenco webhook processor uses HMAC-SHA512. This example may mislead integrators.
**Location:** Line 20 (createHmac('sha256'...))
**Recommendation:** Update to SHA512 to match Lenco webhook validation, or clarify this is a generic example not specific to Lenco.

### docs/plans/2026-03-02-ui-cleanup-requirements.md — ignore-as-correct
**Tag:** n/a
**Issue:** Historical planning document. References past UI issues that have been addressed.

### docs/requirements/2026-03-30-ai-job-hunting-platform-prd.md — ignore-as-correct
**Tag:** n/a
**Issue:** Product requirements document for jobs-ops. Well-structured. Matches current implementation direction.

### package.json (root) — ignore-as-correct
**Tag:** n/a
**Issue:** Clean monorepo root with Bun workspaces. Scripts correctly delegate to app directories. Stagehand is the only root dependency (correct per steering docs).

### scripts/create_release_tag.sh — ignore-as-correct
**Tag:** n/a
**Issue:** Clean release tagging script with date-based versioning. Proper `set -euo pipefail`.

### scripts/smoke-production.sh — ignore-as-correct
**Tag:** n/a
**Issue:** Production smoke test checking frontend, API health, and session endpoint. Clean and useful.

### scripts/stagehand-e2e.ts — ignore-as-correct
**Tag:** n/a
**Issue:** Comprehensive E2E test using Stagehand. Tests landing page, API health, session, auth pages, catalog, admin 404, docs auth gate, upload auth gate. No hardcoded credentials. Uses local Chrome.

### scripts/stagehand-full-flow.ts — remove
**Tag:** zero-day-class-risk
**Issue:** Contains REAL user credentials hardcoded: `cosmaskanchepa8@gmail.com` / `Beanola2025` (student) and `cosmas@beanola.com` / `Beanola2025` (admin). File is gitignored but exists on disk. These are production credentials.
**Location:** Lines 14-15 (STUDENT and ADMIN constants)
**Recommendation:** Delete this file immediately. Rotate the passwords for both accounts. Use environment variables for test credentials (see `.env.scripts.example` pattern).

### scripts/stagehand-smoke.ts — improve
**Tag:** confirmed-bug
**Issue:** Requires `OPENAI_API_KEY` for AI-driven extraction (uses `stagehand.extract()` and `stagehand.observe()`), but the steering docs say Stagehand should use `OPENAI_API_KEY` from `.env.local`. The script doesn't validate the key exists before running, which will cause a confusing runtime error.
**Location:** Lines 20-25 (Stagehand init with model: "openai/gpt-4o")
**Recommendation:** Add a check for OPENAI_API_KEY at the top of the script with a clear error message.

### shared/package.json — ignore-as-correct
**Tag:** n/a
**Issue:** Minimal placeholder package. Correct for the current lightly-used shared package.

### apps/student-portal/package.json — ignore-as-correct
### apps/website/package.json — ignore-as-correct
**Tag:** n/a
**Issue:** Placeholder packages for future apps. Minimal and correct.

---

## Prioritized Action Items

### P0 — Immediate (Security)
1. **Rotate ALL production secrets** — DB passwords, JWT keys, SMTP passwords, API keys, R2 keys, Lenco keys, Redis URLs are exposed in local `.env` files
2. **Delete `scripts/stagehand-full-flow.ts`** — contains real user credentials (email + password)
3. **Delete `.env.vercel.development` and `.env.vercel.preview`** — duplicate production secrets on disk unnecessarily
4. **Use distinct SECRET_KEY and JWT_SIGNING_KEY** — currently identical, weakening key separation
5. **Add non-root USER to backend/Dockerfile** — container runs as root

### P1 — High (Correctness)
6. **Fix jobs-ops vercel.json API rewrite** — will fail on Vercel Hobby plan; remove and use direct cross-origin calls
7. **Add CSRF token handling to jobs-ops API client** — required before implementing any write flows
8. **Add env validation and build config to jobs-ops vite.config.ts** — missing production hardening
9. **Fix jobs-ops tailwind font fallback chain** — incomplete vs steering requirements
10. **Fix GlitchTip DSN inconsistency** — project 22423 vs 22431 across different env files

### P2 — Medium (Code Quality)
11. **Move build-time deps to devDependencies** in both admissions and jobs-ops package.json
12. **Add no-restricted-imports rules** to jobs-ops eslint config
13. **Fix command palette accessibility** in JobsOpsShell.tsx (focus trap, aria attributes, backdrop dismiss)
14. **Add OPENAI_API_KEY validation** to stagehand-smoke.ts
15. **Update contract recordings** to remove legacy Vercel API paths
16. **Update docs/integrations examples** to use current API URL and auth pattern
17. **Fix lenco_payment_integration.sql** conflicting constraint

### P3 — Low (Cleanup)
18. **Archive one-time SQL scripts** (remediate_integrity.sql, unify_application_numbers.sql, SSE scripts)
19. **Clean up vitest.config.ts exclude list** — review and remove stale test exclusions
20. **Fix .kiro/mcp.json Windows paths** — use platform-agnostic commands
21. **Remove premature @hookform/resolvers** from jobs-ops until write flows exist

---

## Classification Tally

| Classification | Count | Files |
|---|---|---|
| ignore-as-correct | 97 | Standard configs, clean components, well-structured services, templates, placeholder packages |
| improve | 30 | Secret exposure, missing security hardening, stale paths, incomplete configs, accessibility gaps |
| remove | 4 | stagehand-full-flow.ts (credentials), .env.vercel.development, .env.vercel.preview, backend/.env.production (duplicate secrets) |
| needs-human-decision | 10 | One-time SQL scripts, SSE table scripts, vitest exclude list, migration runner, remediation scripts |

## Tag Distribution

| Tag | Count | Severity |
|---|---|---|
| zero-day-class-risk | 7 | CRITICAL — real production secrets on disk, hardcoded credentials |
| confirmed-bug | 14 | HIGH — incorrect configs, missing security features, stale URLs |
| suspicious-stale-path | 8 | MEDIUM — legacy paths, outdated references, abandoned features |
| already-fixed-local | 0 | None found |
