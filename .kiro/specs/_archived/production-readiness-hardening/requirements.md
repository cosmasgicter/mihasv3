# Requirements Document

## Introduction

This feature is a production-readiness and performance hardening initiative for the Beanola platform (Django 5 + DRF backend in `backend/`, the admissions React app in `apps/admissions/`, and the jobs-ops React app in `apps/jobs-ops/`).

The defining infrastructure constraint is that production runs on a **single 2GB AWS EC2 host** with a Docker Compose stack (Caddy edge, web/backend, Celery beat, Celery worker, Redis, Postgres). One box runs web serving, Postgres, Redis, Celery, OCR/PDF work, deploys, and backups under tight memory and disk headroom. The authoring database is Neon Postgres; production is the self-hosted Docker Postgres container `mihas-postgres-1`. Because of this topology, the dominant production risk is **operational** (disk, database, and Celery-worker starvation), not CSS or JavaScript bundle size.

The goal is to make the system production-ready under the current infrastructure by reducing database pressure, preventing repeated deploy failures, tightening admin and tenant performance paths, and removing frontend payload waste — all **without changing business behavior**.

Work in this initiative MUST be ordered **operational safety first, then database pressure, then frontend payload polish**. The priority sequence is P0 → P1 → P2 → frontend → polling → verification, and that ordering is itself a requirement (see Requirement 13).

## Glossary

- **P0 (Priority Zero)**: The highest-priority work class — operational safety and the most severe database-pressure risks that can take production down or block deploys. Shipped first.
- **P1 (Priority One)**: Important database-pressure and scope-resolution work that materially reduces load but is not immediately outage-causing. Shipped after all P0 work.
- **P2 (Priority Two)**: Lower-severity cleanup that reduces redundant computation. Shipped after P1 work.
- **DB_Pressure (Database Pressure)**: The aggregate query count, query cost, connection usage, and CPU/memory load placed on the single production Postgres instance by application request paths and background tasks.
- **Correlated_Subquery**: A SQL subquery that references the outer query and is re-executed once per outer row, producing N+1-style query amplification.
- **Conditional_Count_Aggregate**: A single aggregate query that computes multiple counts using conditional expressions (for example `COUNT(*) FILTER (WHERE ...)`) instead of issuing one count query per bucket.
- **Window_LATERAL_Query**: A SQL query using a window function or a `LATERAL` join to compute a per-group latest/derived row (for example the latest payment per application) in one pass instead of correlated subqueries.
- **Cache_Invalidation**: The act of evicting or refreshing a cached value when an underlying write makes the cached value stale, so readers do not observe outdated data beyond the allowed window.
- **Short_TTL (Short Time-To-Live)**: A deliberately small cache expiry window (for example 30–60 seconds) used so that cached aggregates self-heal quickly even without explicit invalidation.
- **Celery_Starvation**: A condition where the single Celery worker is blocked on slow or serial work (for example synchronous external HTTP calls) long enough that other queued tasks are delayed.
- **Concurrent_Index**: A Postgres index created with `CREATE INDEX CONCURRENTLY` so the build does not take a long lock that blocks writes on the target table.
- **Cursor_Pagination**: Pagination keyed by an opaque/ordered cursor (for example `?after=<id>`) that avoids computing a full row count on each page request.
- **Bundle_Guard**: A frontend CI check that fails the build when a tracked JavaScript chunk or asset exceeds an agreed size budget.
- **Backup_Restore_Drill**: A rehearsed, documented exercise that takes a production database backup and restores it to verify the backup is usable and the restore procedure works, producing recorded evidence.
- **Deploy_Workflow**: The CI/CD deployment process (`.github/workflows/deploy.yml`) plus the on-host Docker Compose steps that build/pull images and bring up the production stack.
- **Disk_Monitor**: The component (script or workflow step) that measures host disk usage and gates or alerts around deploys.
- **Admin_Dashboard_Service**: The backend code path that produces admin dashboard aggregate metrics.
- **Application_List_Service**: The backend code path that serializes the admin application list, including per-application payment summaries.
- **Catalog_Cache**: The Redis-backed cache layer for catalog reads (programs, canonical programs, intakes, subjects, assignment-safe catalog responses).
- **Scope_Cache**: The Redis-backed per-user cache for `/api/v1/admin/scope/` and `/api/v1/admin/capabilities/`.
- **Payment_Poll_Task**: The `poll_pending_payments_task` Celery task that polls Lenco for pending payments.
- **Migration_System**: The additive SQL script convention under `backend/scripts/` applied by `apply_sql_migrations`.
- **Notification_Service**: The backend notification list/polling code path consumed by student notification polling.
- **Verification_Gate**: A required, evidence-producing set of checks (tests, builds, dry-runs, drills) that a phase MUST pass before it ships.
- **Tenant_Isolation_Invariant**: The enterprise rule that a tenant-scoped actor must never observe, fetch, mutate, or infer another tenant's data or capabilities (see `.kiro/steering/enterprise-tenancy.md`).
- **Response_Shape**: The exact structure and field set of an existing API response (within the `{"success": true, "data": ...}` envelope), which MUST remain unchanged.

## Requirements

### Requirement 1: P0 — Deploy Safety and Operational Risk

**User Story:** As a platform operator, I want deploys on the single EC2 host to prune stale Docker artifacts, gate on disk headroom, and roll back cleanly on failure, so that production never fails silently from old-image buildup or a full disk.

#### Acceptance Criteria

1. WHEN a deploy is executed, THE Deploy_Workflow SHALL prune unused Docker images and stopped containers as an explicit named step, and SHALL record in the deploy output the count of images removed, the count of stopped containers removed, and the bytes reclaimed.
2. WHEN a deploy starts AND when a deploy finishes, THE Disk_Monitor SHALL measure host root-filesystem disk usage as a percentage (0 to 100, integer) and record each measured value as labeled deploy output identifying the measurement as pre-deploy or post-deploy.
3. THE Deploy_Workflow SHALL read the disk threshold from a configurable setting expressed as an integer percentage between 1 and 99 inclusive, defaulting to 85 when the setting is unset or outside this range.
4. IF the measured pre-deploy host disk usage percentage exceeds the configured disk threshold, THEN THE Deploy_Workflow SHALL stop the deploy before pulling or building any image, leave the currently running stack unchanged, exit with a non-zero status, and emit an error message stating the measured usage percentage and the configured threshold percentage.
5. IF an image pull, image build, or stack bring-up step does not complete successfully during deploy, THEN THE Deploy_Workflow SHALL halt forward progress, restore the previously running stack version, exit with a non-zero status, and emit an error message identifying the failed step.
6. WHEN a rollback is triggered by a failed deploy step, THE Deploy_Workflow SHALL verify within 120 seconds that the restored stack reports a healthy state, and IF the restored stack does not report healthy within 120 seconds, THEN THE Deploy_Workflow SHALL exit with a non-zero status and emit an error message indicating that rollback verification did not succeed within the timeout.
7. IF any deploy step does not complete successfully, THEN THE Deploy_Workflow SHALL surface a non-zero exit status and a failure message that names the failed step and states the observed failure condition.
8. WHEN the platform operator executes one Backup_Restore_Drill against a production-format backup, THE platform operator SHALL record drill evidence in a runbook file under `docs/runbooks/` that states the drill date, the backup source used, the restore outcome, and the verified post-restore row-count check.

### Requirement 2: P0 — Admin Dashboard Aggregate Pressure

**User Story:** As an admin, I want the admin dashboard to load without hammering Postgres with many uncached count queries, so that dashboard usage does not degrade the single database under concurrent load.

#### Acceptance Criteria

1. WHEN admin dashboard aggregates are requested AND a non-expired cache entry exists for the exact request scope (user scope, institution filter, role, and selected tenant), THE Admin_Dashboard_Service SHALL return the cached aggregate values without issuing any Postgres count or aggregate query for that request.
2. THE Admin_Dashboard_Service SHALL key each dashboard aggregate cache entry by the tuple of user scope, institution filter, role, and selected tenant, such that no cache entry is read or written across two requests whose tuples differ in any one field.
3. THE Admin_Dashboard_Service SHALL set a time-to-live between 30 and 60 seconds inclusive on every dashboard aggregate cache entry, and SHALL treat any entry whose age exceeds its time-to-live as absent.
4. WHEN an application status change, a payment change, a tenant membership change, a tenant grant change, or an institution update occurs, THE Admin_Dashboard_Service SHALL invalidate the dashboard aggregate cache entries for the affected scope so that no aggregate older than the change is served beyond the entry's remaining time-to-live (maximum 60 seconds).
5. THE Admin_Dashboard_Service SHALL compute all dashboard time-bucket counts using a single Conditional_Count_Aggregate query covering every time bucket, rather than one query per time bucket.
6. WHEN the admin dashboard is requested with no usable (present and non-expired) cache entry for the request scope, THE Admin_Dashboard_Service SHALL issue fewer than 12 count or aggregate queries to compute the dashboard metrics.
7. IF the cache backend is unavailable when dashboard aggregates are requested, THEN THE Admin_Dashboard_Service SHALL compute the aggregates directly from Postgres within the same fewer-than-12-query bound, return the freshly computed values, and indicate the degraded (uncached) path without returning an error to the caller.
8. IF a request resolves to a tenant scope for which the requesting user holds no active capability, THEN THE Admin_Dashboard_Service SHALL return no aggregate values for that scope and SHALL NOT serve any cache entry belonging to another scope.

### Requirement 3: P0 — Application List Payment Summary

**User Story:** As an admin, I want the application list to compute payment summaries without correlated per-row subqueries, so that loading the list does not multiply database queries per application row.

#### Acceptance Criteria

1. WHEN the admin application list is serialized, THE Application_List_Service SHALL produce each application's payment summary without issuing any of the seven correlated payment subqueries that were previously executed per application row.
2. THE Application_List_Service SHALL derive payment summaries either by prefetching the latest payment rows in at most one additional query and computing the summary in the serializer, OR by a single Window_LATERAL_Query that resolves the latest payment per application, such that the number of payment-related queries does not increase as the number of application rows increases.
3. WHEN an application has multiple payment records, THE Application_List_Service SHALL select the payment with the most recent creation timestamp as the basis for the payment summary.
4. THE Application_List_Service SHALL derive a single payment_status value in which the legacy states verified, paid, successful, force_approved, and deferred map to the same canonical derived payment_status used before this change.
5. THE Application_List_Service SHALL keep the application list API Response_Shape unchanged, including all existing payment summary field names, field ordering, and value semantics.
6. WHEN an application has a successful payment, a pending payment, a failed payment, no payment, or multiple payments, THE Application_List_Service SHALL return payment summary field values identical to the values produced by the pre-change implementation for the same application data.
7. THE Application_List_Service SHALL be covered by regression tests asserting identical payment summary field values for the paid, pending, failed, no-payment, and multiple-payment cases.
8. WHEN the admin application list is serialized, THE Application_List_Service SHALL be covered by a query-count regression test asserting that the total payment-related query count remains constant regardless of the number of application rows returned.

### Requirement 4: P1 — Catalog Cache

**User Story:** As a student or admin, I want catalog reads served from a short-lived cache, so that wizard, login, and catalog mounts reuse cached data instead of repeatedly querying the database.

#### Acceptance Criteria

1. THE Catalog_Cache SHALL cache catalog responses for programs, canonical programs, intakes, subjects, and assignment-safe catalog responses in Redis with a Short_TTL of between 300 and 600 seconds, after which the entry SHALL be treated as expired.
2. WHEN a catalog read is requested AND a non-expired Catalog_Cache entry exists for that read's cache key, THE Catalog_Cache SHALL serve the cached response without querying the database, and the served response SHALL be byte-for-byte identical to the response that was stored.
3. WHEN a catalog read is requested AND no non-expired Catalog_Cache entry exists for that read's cache key, THE Catalog_Cache SHALL resolve the response from the database, store it under that cache key with a Short_TTL of between 300 and 600 seconds, and serve that resolved response.
4. WHEN an admin write occurs to programs, intakes, subjects, offerings, fees, or institution assignments, THE Catalog_Cache SHALL invalidate every cached catalog response affected by that write before the next catalog read can be served, so that no read served after the write returns pre-write data.
5. THE Catalog_Cache SHALL resolve `CanonicalProgramSerializer.get_available_offerings` using offerings prefetched in the view so that the number of database queries to load available offerings does not increase with the number of canonical program rows in the response.
6. WHERE a catalog response is tenant-scoped, THE Catalog_Cache SHALL include the tenant scope in the cache key so that no cached catalog response is served across tenant scopes in violation of the Tenant_Isolation_Invariant.
7. IF Redis is unavailable when a catalog read is requested, THEN THE Catalog_Cache SHALL resolve the response directly from the database, serve it without raising an error to the caller, and skip the cache write, so that catalog reads continue to succeed while Redis is down.
8. WHERE a catalog read is a public or student catalog GET, THE Catalog_Cache SHALL return a response whose body and status are identical to the response produced by the uncached database path, introducing no change to public or student catalog GET behavior.

### Requirement 5: P1 — Tenant and Admin Scope Cache

**User Story:** As an admin, I want my resolved scope and capabilities cached briefly per user, so that navigation and admin guards do not re-resolve memberships and grants on every page change.

#### Acceptance Criteria

1. THE Scope_Cache SHALL cache `GET /api/v1/admin/scope/` and `GET /api/v1/admin/capabilities/` responses keyed per user with a time-to-live of 60 seconds, after which the entry expires and the next request for that user re-resolves through AdminCapabilityService.
2. WHEN a user's role changes, a membership or grant for that user is created, updated, or deleted, or an institution's activation state (`is_active`) changes, THE Scope_Cache SHALL invalidate every affected user's cached scope and capabilities entries within 5 seconds of the change being committed.
3. THE Scope_Cache SHALL key every cache entry by user identifier so that no user's request is ever served another user's cached scope or capabilities.
4. THE Scope_Cache SHALL NOT serve a cached capability set that grants a capability the user no longer holds beyond either 60 seconds (TTL expiry per criterion 1) or 5 seconds after an invalidating change (per criterion 2), whichever occurs first.
5. THE Scope_Cache SHALL be covered by automated tests proving that, after a scope change that removes super-admin or cross-tenant capabilities, a tenant admin's next resolved capability set obtained past the invalidation boundary defined in criterion 2 contains none of the removed capabilities.
6. WHERE the resolved scope is tenant-scoped, THE Scope_Cache SHALL preserve the Tenant_Isolation_Invariant so that a cached entry never exposes another tenant's capabilities and never serves a capability set superseded by an invalidating change beyond the 5-second boundary in criterion 2.
7. IF the Scope_Cache backend (Redis) is unavailable or returns an error during a cache read or write, THEN THE Scope_Cache SHALL resolve the user's scope and capabilities fresh through AdminCapabilityService, serve no cached entry, and allow the request to complete without surfacing a cache-related error to the caller.
8. IF an invalidation operation defined in criterion 2 fails to remove a cached entry, THEN THE Scope_Cache SHALL fail closed by treating the affected entries as expired so that no superseded scope or capability set is served beyond the 5-second invalidation boundary.

### Requirement 6: P1 — Celery Worker Starvation

**User Story:** As a platform operator, I want payment polling and expiry tasks to avoid blocking the single Celery worker, so that one slow external call cannot stall all background work.

#### Acceptance Criteria

1. WHEN the Payment_Poll_Task runs, THE Payment_Poll_Task SHALL process at most 10 pending payments per run (reduced from 50) AND SHALL issue external Lenco verification calls through a thread pool bounded to a maximum of 5 concurrent threads.
2. WHEN the Payment_Poll_Task issues an external HTTPS Lenco verification call, THE Payment_Poll_Task SHALL apply a connect-and-read timeout of 10 seconds per call AND SHALL retry a failed call at most 2 times (3 total attempts), with each attempt bound by the same 10-second timeout.
3. IF a Lenco verification call exceeds its 10-second timeout or exhausts its 2 retries, THEN THE Payment_Poll_Task SHALL skip that payment, leave the payment's status unchanged, record the failure to the error-monitoring pipeline, and continue processing the remaining payments in the run.
4. WHILE the Payment_Poll_Task is running, THE Celery worker SHALL remain able to dequeue and begin other queued tasks, AND no single Payment_Poll_Task run SHALL occupy the worker for more than 60 seconds of wall-clock time.
5. WHERE an expiry task updates 2 or more rows in a single run, THE expiry task SHALL persist those updates using a single `bulk_update` call and a single bulk notification-creation call instead of one `.save()` call per row, provided the resulting set of polled, expired, and notified records is identical to the per-row path.
6. THE Payment_Poll_Task and the converted expiry tasks SHALL produce the same set of polled, expired, and notified payment and application records as the pre-change per-row implementation, with no change to which payments are polled, which are expired, or which notifications are sent.

### Requirement 7: P1 — Database Indexes

**User Story:** As a platform operator, I want targeted, rollback-safe indexes that support the hottest query paths, so that dashboard, SLA, and admin-filter queries use efficient plans without risky schema changes.

#### Acceptance Criteria

1. THE Migration_System SHALL add a composite index named `idx_applications_status_submitted_at` on `applications(status, submitted_at)` using `CREATE INDEX CONCURRENTLY` with `IF NOT EXISTS`, outside any transaction block.
2. THE Migration_System SHALL deliver the index as an additive, rollback-safe SQL script under `backend/scripts/`, applied by `apply_sql_migrations`, that is idempotent and re-runnable, producing the same end state and exiting without error when re-run against a database where the index already exists.
3. THE Migration_System SHALL author and validate the index change on the Neon authoring database first, and SHALL apply it to the production database only after Neon validation is confirmed.
4. THE database index work SHALL NOT add an index on `applications(institution_ref_id)`, because `institution_ref` maps to `institution_id` and is already covered.
5. WHEN the index creation completes in an INVALID state (`CREATE INDEX CONCURRENTLY` did not finish successfully), THE Migration_System SHALL detect the invalid index and SHALL provide a `DROP INDEX CONCURRENTLY IF EXISTS` rollback path that removes the index without affecting any other schema object, and SHALL surface an error indicating the index build failed.
6. WHEN the SLA review task query, the dashboard status-and-time filter query, and the admin application filter query are executed, THE database SHALL produce a recorded EXPLAIN plan that shows an index scan, index-only scan, or bitmap index scan on `idx_applications_status_submitted_at` (rather than a sequential scan on `applications`) for each query where the composite index is expected to apply.
7. THE Migration_System SHALL NOT alter, drop, or modify any existing table data, column, or constraint, ensuring no business behavior changes result from the index work.

### Requirement 8: P2 — Application List Serializer Cleanup

**User Story:** As an admin, I want the application list serializer to compute each row's grade summary once, so that serialization does not redundantly recompute the same value.

#### Acceptance Criteria

1. WHEN an application row is serialized, THE ApplicationListSerializer SHALL compute that row's grade summary exactly once and reuse the memoized result for all subsequent field accesses within the same serializer instance for that application.
2. WHILE prefetched grade data is available on the application instance, THE ApplicationListSerializer SHALL derive the grade summary from the prefetched grades and SHALL NOT issue any additional database query for that row.
3. IF prefetched grade data is not available for an application row, THEN THE ApplicationListSerializer SHALL compute the grade summary from the application's grade records and return the same grade summary value that the prefetched path would produce.
4. WHEN a list of N applications is serialized, THE ApplicationListSerializer SHALL execute a total database query count that does not increase with N (constant with respect to the number of rows), and this behavior SHALL be enforced by an automated query-count regression test for list serialization.
5. WHEN an application row is serialized before and after this change, THE ApplicationListSerializer SHALL produce an identical grade summary value, preserving Zambian ECZ grading semantics with no change to serialized output.

### Requirement 9: P2 — Notification Polling Pagination

**User Story:** As a student, I want frequent notification polling to avoid repeated full row counts, so that polling stays cheap on the single database.

#### Acceptance Criteria

1. WHERE a notification list request supplies an `?after=<id>` cursor, THE Notification_Service SHALL return up to 50 notifications ordered by descending identifier using Cursor_Pagination, without computing a full notification count.
2. THE Notification_Service SHALL continue to accept the existing page-number pagination API for backward compatibility, and no removal date for the page-number API is enforced by this requirement.
3. IF a supplied `?after=<id>` cursor is not a positive integer or cannot be retrieved, THEN THE Notification_Service SHALL reject the request with a validation error and return no results.
4. THE Notification_Service SHALL keep the existing notification Response_Shape (`{page, pageSize, totalCount, results}` within the `{"success": true, "data": ...}` envelope) unchanged for both paths, setting `totalCount` to null on the cursor path and to a populated integer on the page-number path.
5. THE Notification_Service SHALL cap page size at 50 notifications for both the cursor and page-number paths.
6. WHEN a student client polls notifications using the cursor path, THE Notification_Service SHALL serve each poll response without executing a full-count query, regardless of how many consecutive polls occur.

### Requirement 10: Frontend Performance Payload Cleanup

**User Story:** As a user on a mobile or slow connection, I want oversized static assets and avoidable JavaScript trimmed, so that pages load smaller payloads without any change in behavior.

#### Acceptance Criteria

1. THE Frontend build SHALL compress each public PNG logo and signature asset whose file size exceeds 60KB to a target size of 60KB or less per asset, while preserving the asset's original pixel dimensions and alpha transparency.
2. WHERE a PDF-only asset is not referenced by any rendered UI component, THE Frontend SHALL relocate that asset out of public web-fetch paths while keeping it resolvable by the `@react-pdf` document system.
3. THE Caddy edge configuration SHALL serve responses for `/fonts/*` with a `Cache-Control` header that includes a `max-age` of 31536000 seconds and the `immutable` directive.
4. WHEN an export action runs, THE admin application code SHALL load `xlsxWriter` via dynamic import inside the export action rather than at module load.
5. THE admin selection code SHALL evaluate selected-id membership using a memoized `Set` lookup instead of an `Array.includes()` scan over `selectedIds`.
6. THE admin card list SHALL set its virtualization threshold to 40 items, replacing the previous threshold of 100.
7. THE frontend payload changes SHALL NOT alter any user-facing rendered output, including layout, displayed images, exported file contents, and OptimizedImage `onError` fallback behavior.
8. IF a compressed PNG logo or signature asset fails to load, THEN THE Frontend SHALL render the OptimizedImage `onError` fallback without altering surrounding page layout.
9. IF a relocated PDF-only asset cannot be resolved by the `@react-pdf` document system at document-generation time, THEN THE Frontend SHALL surface an error indicating the asset is unavailable and SHALL NOT silently render the document with a missing asset.

### Requirement 11: Admin Dashboard Polling Cleanup

**User Story:** As an admin, I want a single owner for dashboard metric polling, so that the dashboard does not double-poll overlapping admin stats.

#### Acceptance Criteria

1. THE admin frontend SHALL route all React Query polling for dashboard metrics through exactly one polling hook (`useAdminDashboardPolling`), such that the `useStats` / application-stats refetch path does not register its own polling interval for any dashboard metric already owned by `useAdminDashboardPolling`.
2. THE admin frontend SHALL designate `useAdminDashboardPolling` as the single owner of dashboard metric refresh, and any other consumer of the same dashboard metrics SHALL read from the shared React Query cache entry rather than issuing an independent polling request.
3. WHEN the admin dashboard is mounted, THE admin frontend SHALL maintain at most one in-flight network request per distinct dashboard metric at any point in time, with no second concurrent request issued for a metric whose request is already pending.
4. THE polling consolidation SHALL preserve the existing dashboard data-freshness behavior by keeping the prior polling interval unchanged and retaining fingerprint-based deduplication, so that the displayed metric values match the values that the pre-consolidation polling path would have produced for the same backend state.
5. IF a dashboard metric poll fails, THEN THE admin frontend SHALL retain the last successfully fetched metric values, SHALL NOT replace displayed values with empty or error placeholders, and SHALL surface a non-blocking indication that the metric could not be refreshed.

### Requirement 12: Verification Gates

**User Story:** As a platform operator, I want each phase gated by passing tests and recorded evidence, so that no hardening change ships without proof it is safe.

#### Acceptance Criteria

1. WHERE a phase changes backend code, THE Verification_Gate SHALL require all four of the following to complete with zero failures and zero errors before the phase may ship: the targeted query-count tests (measured query counts at or below their recorded baselines, with no N+1 regression), the full backend pytest suite, the migration dry-run (completing with no reported destructive or non-additive operation), and the cache-invalidation tests.
2. WHERE a phase changes the admissions frontend, THE Verification_Gate SHALL require all four of the following to complete before the phase may ship: the full admissions Vitest suite with zero failing tests, the type-check with zero type errors, the production build exiting successfully and emitting build artifacts, and the Bundle_Guard check reporting all bundle sizes at or below their configured budgets.
3. WHERE a phase changes operational tooling, THE Verification_Gate SHALL require all three of the following to complete before the phase may ship: the deploy dry-run finishing with no reported error, the disk-prune dry-run finishing with no reported error, and recorded Backup_Restore_Drill evidence confirming a restore that matches the source row counts.
4. IF any required Verification_Gate check for a phase reports a failure, a non-zero exit, or a missing required result, THEN THE Verification_Gate SHALL block the phase from shipping, SHALL retain the current shipped state unchanged, and SHALL surface an indication identifying which check failed, until that check is re-run and reports a passing result.
5. WHEN each required check for a phase completes, THE Verification_Gate SHALL record evidence for that check capturing the check identifier, the command executed, the pass or fail outcome, and the completion timestamp, before that phase is marked complete.
6. IF one or more required checks for a phase have no recorded evidence, THEN THE Verification_Gate SHALL treat the phase as incomplete and SHALL NOT mark it complete.

### Requirement 13: Cross-Cutting Hard Constraints

**User Story:** As a platform owner, I want every change in this initiative to preserve behavior, contracts, tenant isolation, and infrastructure safety rules, so that hardening never introduces regressions or security gaps.

#### Acceptance Criteria

1. THE initiative SHALL preserve existing business behavior across all changes, introducing no change to business outcomes.
2. THE initiative SHALL preserve existing API Response_Shapes, including field names, value semantics, and the `{"success": true, "data": ...}` envelope.
3. THE initiative SHALL preserve the enterprise Tenant_Isolation_Invariant so that no cache, query change, or optimization leaks, elevates, or staleness-grants capabilities or data across tenants.
4. THE initiative SHALL ship every production schema change as an additive, non-destructive SQL script under `backend/scripts/`, applied by `apply_sql_migrations`.
5. THE initiative SHALL author every database change on Neon first and copy it to production second.
6. THE initiative SHALL preserve auth cookie behavior, CSRF protections, admissions auto-save, and mobile-first usability.
7. WHERE a feature relies on the Redis-backed cache AND Redis is unavailable, THE feature SHALL degrade gracefully and serve correct results from the database without blocking core flows.
8. THE initiative SHALL sequence work in the order P0 operational safety, then P0 and P1 database pressure, then P2 cleanup, then frontend payload, then polling cleanup, then verification, so operational safety precedes database pressure work and database pressure work precedes frontend payload polish.
