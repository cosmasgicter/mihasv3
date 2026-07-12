# Implementation Plan: System Performance Hardening

## Overview

This plan implements the performance- and reliability-only hardening described in
`design.md` against the live MIHAS/Beanola stack (Django 5 + DRF backend, the
`apps/admissions` React/Vite frontend, `.github/workflows/deploy.yml`, Caddy, an
additive SQL index under `backend/scripts/`). Every change must preserve the
`{"success": true, "data": ...}` envelope, field names/types/nesting, the
`/api/v1` REST contract, authorization decisions resolved through
`AdminCapabilityService` / `visible_institution_queryset(user)`, forward-only
payment transitions, the canonical truth map, and mobile-first usability (R13).

The work is sequenced by the design's recommended enable order:

1. The shared cache abstraction (`backend/apps/common/scoped_cache.py`) first —
   the dashboard, catalog, and capability caches are thin callers of it.
2. The **always-on, behavior-equivalent refactors** (single conditional-count
   query R2.5, payment-summary `Prefetch` R3, offerings prefetch fix R4.4, grade
   memoization R8, notification cursor R9, additive index R7, Celery bounding R6,
   deploy hardening R1) — these ship without a runtime flag.
3. The **flag-gated caches** in blast-radius order: `PERF_CACHE_CAPABILITIES`
   (R5) → `PERF_CACHE_DASHBOARD` (R2) → `PERF_CACHE_CATALOG` (R4).
4. The **frontend optimizations** (R10/R11) behind `VITE_PERF_FRONTEND`.
5. The cross-cutting verification gates (R12) and behavior/contract/tenant
   isolation preservation (R13) wired throughout.

Commands per steering: backend `cd backend && python3 -m pytest`; migration
dry-run `cd backend && python3 manage.py apply_sql_migrations --dry-run`;
frontend uses Bun (`bun run test:admissions`, admissions type-check). Additive
SQL lives under `backend/scripts/` and is applied by `apply_sql_migrations`.
Property tests use **hypothesis** (`backend/tests/property/`) and **fast-check**
(`apps/admissions/tests/property/`) at a minimum of **100 iterations** each, and
are tagged `# Feature: system-performance-hardening, Property {n}`.

Conventions:
- Sub-tasks marked with `*` are optional test/verification tasks and may be
  skipped for a faster MVP. Core implementation sub-tasks are never optional.
- Manual production deploy, applying the index on the production DB, flipping
  flags in production, and running `deploy/backup-db.sh` on the EC2 host are
  **operator follow-ups** outside the task checkboxes (see the final section).

## Tasks

- [x] 1. Shared cache abstraction and feature flags
  - [x] 1.1 Create `backend/apps/common/scoped_cache.py` and register flags
    - Implement `TenantScopeKeyBuilder.build_scope_signature(user)` deriving the
      signature from `visible_institution_queryset(user)` + the
      `AdminCapabilityService` result (user id, role, `is_super_admin`,
      `all_access`, sorted in-scope institution ids, institution filter),
      SHA-256-hashed to bound key length — never from raw role strings
    - Implement `cached_or_compute(namespace, scope_signature, compute, *, ttl, sub_key=None, enabled=True)`
      with the computes-on-miss / computes-on-cache-error / flag-off-bypass /
      never-cache-empty contract, modeled on `backend/apps/common/ai_cache.py`
    - Implement `invalidate(namespace, scope_signature, sub_key=None)` and
      `invalidate_user(namespace, user_id)` using the per-scope integer version
      token (`spc:ver:<namespace>:<scope_signature>`) bump for O(1) scope-wide
      invalidation
    - Add `PERF_CACHE_DASHBOARD`, `PERF_CACHE_CATALOG`, `PERF_CACHE_CAPABILITIES`
      (env→bool, default `False`) to `backend/config/settings/base.py`
    - _Requirements: 2.2, 2.8, 4.5, 4.7, 5.2, 13.3, 13.4_

  - [x]* 1.2 Property test: scope-key collision invariant
    - **Property 1: Scope-key collision invariant**
    - **Validates: Requirements 2.2, 4.5**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_scoped_cache_keys.py`

  - [x]* 1.3 Property test: cache failure degrades to computation
    - **Property 3: Cache failure degrades to computation**
    - **Validates: Requirements 2.8, 4.7**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_cache_degradation.py`

  - [x]* 1.4 Property test: invalidation is idempotent and forces recompute
    - **Property 4: Invalidation is idempotent and forces recompute**
    - **Validates: Requirements 2.4, 4.3, 5.4, 5.5, 5.6**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_cache_invalidation.py`

  - [x]* 1.5 Unit tests for TTL bounds and flag-off bypass
    - Assert dashboard TTL ∈ [30,60], catalog TTL ∈ [300,600], capability TTL == 60
    - Assert `enabled=False` calls `compute()` every time and never touches the cache
    - _Requirements: 2.3, 4.2, 5.2_

- [x] 2. Capture pre-feature output-equivalence baseline
  - [x] 2.1 Build golden-snapshot reference fixtures and a divergence harness scaffold
    - Capture pre-feature response envelopes and computed field values (golden
      snapshots from the current code path) for every endpoint changed by this
      feature: admin dashboard, application list (payment + grade fields),
      canonical-program list, scope/capabilities, notifications
    - Provide a reusable comparator the post-feature property/regression tests
      reuse to assert new-vs-old equality
    - _Requirements: 13.1, 13.2, 13.6_

- [x] 3. Application list payment summary optimization (R3, always-on)
  - [x] 3.1 Rewrite `_with_payment_summary` to prefetch the latest payment per application
    - In `backend/apps/applications/_view_helpers.py`, replace the 7 correlated
      `Subquery` annotations with a window-function-bounded
      `Prefetch("payment_set", ...)` (`ROW_NUMBER() OVER (PARTITION BY application_id ORDER BY -updated_at, -created_at)`),
      including the latest-successful row, and stop emitting `payment_summary_*` annotations
    - Ensure `_get_payment_summary` computes the summary from
      `obj._prefetched_objects_cache["payment_set"]`, treating verified states
      (`verified`, `paid`, `successful`, `force_approved`) as the same verified
      value and `deferred` as distinct, returning the no-payment summary when no row exists
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 3.2 Property test: payment summary equivalence
    - **Property 7: Payment summary equivalence**
    - **Validates: Requirements 3.3, 3.5**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_payment_summary.py`

  - [x]* 3.3 Regression tests for the five payment-summary cases
    - Assert paid / pending / failed / no-payment / multiple-payment summaries are
      identical to the pre-feature golden output (task 2.1)
    - _Requirements: 3.6_

- [x] 4. Application list serializer grade summary memoization (R8, always-on)
  - [x] 4.1 Memoize the grade summary in `ApplicationListSerializer`
    - In `backend/apps/applications/serializers.py`, compute the grade summary,
      total subjects, and points once per application per serializer instance
      (keyed by application id, mirroring `_payment_summary_cache`), deriving from
      prefetched grade records when available and issuing at most one grade query otherwise
    - Preserve the existing Zambian ECZ grading output exactly
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x]* 4.2 Property test: grade summary equivalence and single computation
    - **Property 9: Grade summary equivalence and single computation**
    - **Validates: Requirements 8.1, 8.4**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_grade_summary.py`

  - [x]* 4.3 Query-count regression test for grade computation
    - Using `CaptureQueriesContext`, assert the grade summary is computed at most
      once per application over a list of two or more applications and the
      grade-related query count stays constant as the page grows
    - _Requirements: 8.5, 8.6_

- [x] 5. Admin dashboard single conditional-count query (R2.5, always-on)
  - [x] 5.1 Collapse the dashboard application aggregates into one conditional-count query
    - In `AdminDashboardView.get` (`backend/apps/accounts/admin_user_views.py`),
      replace the many per-status/per-bucket `.count()` calls with a single
      `app_queryset.aggregate(...)` using `Count("id", filter=Q(...))` over the
      already-scoped queryset and the existing
      `activity_at = Coalesce(submitted_at, updated_at, created_at)` annotation
    - Produce values identical to the current field-by-field counts; bring total
      count/aggregate queries to ≤3
    - _Requirements: 2.5, 2.6_

  - [x]* 5.2 Property test: conditional-count aggregate equivalence
    - **Property 8: Conditional-count aggregate equivalence**
    - **Validates: Requirements 2.5**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_dashboard_counts.py`

  - [x]* 5.3 Query-count regression test for dashboard load
    - Using `CaptureQueriesContext`, assert the dashboard issues ≤3 count/aggregate
      queries (down from 12+)
    - _Requirements: 2.6_

- [x] 6. Canonical program offerings prefetch fix (R4.4, always-on)
  - [x] 6.1 Resolve offerings from a view-level prefetch instead of a per-object query
    - In the canonical-program list view, build
      `Prefetch("program_set", queryset=Program.objects.select_related("institution").filter(is_active=True, offering_status="active"))`
      (optionally narrowed by resolved institution)
    - Rewrite `CanonicalProgramSerializer.get_available_offerings`
      (`backend/apps/catalog/serializers.py`) to read offerings from the
      prefetched set (filtering by intake/institution in Python), preserving the
      `assignment_priority`, `name` ordering and neutral-vs-tenant grouping
    - _Requirements: 4.4_

  - [x]* 6.2 Query-count regression test for canonical-program list
    - Assert the canonical-program list issues no per-object offering query and the
      offerings query count stays constant as the number of programs grows
    - _Requirements: 4.4_

- [x] 7. Notification cursor pagination (R9, always-on, additive)
  - [x] 7.1 Add a cursor mode to `NotificationListView`
    - In `backend/apps/common/notification_views.py`, when `?after=<id>` is present,
      order by descending `(created_at, id)`, return rows strictly less than the
      anchor's composite key, cap at `min(pageSize default 20, max 100)`, omit/null
      `totalCount`, issue **no** `count()` query, and use the
      `{"success": true, "data": ...}` envelope
    - Preserve the page-number mode (no `after`) returning the existing
      `{page, pageSize, totalCount, results}` shape unchanged
    - Reject invalid `after` format with a 400 validation error and no notifications;
      return an empty `results` collection for a well-formed but unknown `after`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 7.2 Property test: notification cursor pagination correctness
    - **Property 11: Notification cursor pagination correctness**
    - **Validates: Requirements 9.1, 9.5**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_notification_cursor.py`

  - [x]* 7.3 Unit tests for cursor edge cases and backward compatibility
    - Invalid `after` → 400 with no notifications; valid-but-unknown `after` →
      empty envelope, no error; page-number mode response shape unchanged
    - _Requirements: 9.2, 9.4, 9.5_

- [x] 8. Composite index on `applications(status, submitted_at)` (R7, always-on)
  - [x] 8.1 Author the additive index SQL script
    - Create `backend/scripts/perf_idx_applications_status_submitted_at.sql` with
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_status_submitted_at ON applications (status, submitted_at);`
      written to run outside a transaction block (autocommit) so
      `apply_sql_migrations` executes it concurrently and re-runnably
    - Do **not** add any index on `applications.institution_ref_id` (already
      covered via `institution_id`)
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [x]* 8.2 Migration idempotence and index-scan test (Neon/test DB only)
    - **Property 5: Index migration is idempotent**
    - **Validates: Requirements 7.2, 7.4**
    - hypothesis + integration in `backend/tests/property/test_perf_index_migration.py`:
      run the script twice against a Postgres test DB, assert exactly one valid
      index and no failure; assert `EXPLAIN` shows an index/index-only scan (not a
      sequential scan) for the status+submitted_at query plan (R7.3). Validate on
      Neon/test DB and via `apply_sql_migrations --dry-run` only — never against production

- [x] 9. Celery payment poll and expiry task efficiency (R6, always-on)
  - [x] 9.1 Bound `poll_pending_payments_task`
    - In `backend/apps/documents/tasks.py`, process at most 10 payments per run (or
      a bounded `ThreadPoolExecutor(max_workers ≤5)`); apply a ≤10s timeout and ≤2
      retries to each external Lenco verification call
    - On timeout/retry exhaustion, skip the payment with **no** status transition
      (honoring `PaymentService._transition()` forward-only rules), record the
      failure (metric + log), and continue the run; tighten `soft_time_limit`/`time_limit`
      so a run completes within 90s wall-clock
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [x] 9.2 Batch the expiry tasks
    - In the draft/payment/condition/enrollment expiry tasks
      (`backend/apps/applications/tasks.py`, `backend/apps/documents/tasks.py`,
      `backend/apps/catalog/tasks.py`), persist stale transitions with a single
      `bulk_update` and create related notifications with a single `bulk_create`,
      processing ≤50 records per run where safe to batch (retain per-row
      `select_for_update` where required for correctness, e.g. payment expiry racing a webhook)
    - _Requirements: 6.4_

  - [x]* 9.3 Property test: Celery skip-on-exhaustion preserves forward-only status
    - **Property 13: Celery skip-on-exhaustion preserves forward-only status**
    - **Validates: Requirements 6.3**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_payment_poll.py`

  - [x]* 9.4 Integration test for run-time bound and per-call limits
    - With mocked Lenco latency, assert a single run completes ≤90s (R6.5), each
      call uses ≤10s timeout / ≤2 retries (R6.2), and the batch is ≤10 / pool ≤5 (R6.1)
    - _Requirements: 6.1, 6.2, 6.5_

- [x] 10. Deploy-time operational risk controls (R1, always-on)
  - [x] 10.1 Harden the deploy workflow
    - In `.github/workflows/deploy.yml`, inside the SSH script (`set -euo pipefail`):
      capture the previous backend/frontend image refs as the rollback anchor;
      record integer disk usage before and after deploy; gate on
      `DISK_THRESHOLD` (default 85, clamp 50–95) exiting non-zero with a message
      naming usage/threshold/step when usage ≥ threshold; prune stopped containers
      and dangling images while retaining the previous image (never `prune -a`);
      wrap pull + `up -d` in a rollback trap that re-pins `.env` to the previous
      images and restarts them leaving the `postgres` volume/DB untouched, then
      exits non-zero naming the failed step
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 10.2 Document the backup-and-restore drill with row-count verification
    - Extend `docs/runbooks/database-backup-restore.md` with a drill that backs up
      via `deploy/backup-db.sh`, restores into a scratch DB, and verifies per-table
      `SELECT count(*)` matches between source and restored DB (`applications`,
      `payments`, `notifications`, `user_institution_memberships`), failing on mismatch
    - _Requirements: 1.7_

  - [x]* 10.3 Property test: deploy disk threshold gate
    - **Property 12: Deploy disk threshold gate**
    - **Validates: Requirements 1.3, 1.4**
    - hypothesis over the gate logic (extracted into a testable shell/script
      helper), ≥100 iterations, `backend/tests/property/test_perf_deploy_gate.py`

- [x] 11. Checkpoint — always-on refactors green
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Capability cache (R5, `PERF_CACHE_CAPABILITIES`)
  - [x] 12.1 Wrap the capability/scope payload with a fail-closed cache
    - In `backend/apps/accounts/admin_user_views.py`, wrap
      `_build_capability_payload(user)` (the shared source for `GET /api/v1/admin/scope/`
      and `GET /api/v1/admin/capabilities/`) in
      `cached_or_compute("cap", str(user.pk), compute, ttl=60, enabled=PERF_CACHE_CAPABILITIES)`
    - Catch `CapabilityResolutionError` so the wrapper never stores it, call
      `invalidate_user("cap", user.pk)` to drop any existing entry, and re-raise so
      the view returns the existing fail-closed authorization error (zero
      capabilities, no tenant data)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 12.2 Add capability invalidation signals (≤1s, on_commit)
    - On `Profile.role` change, `UserInstitutionMembership`/`AccessGrant`
      create/update/delete, and `Institution.is_active` change, call
      `invalidate_user("cap", user_id)` (resolving tenant-scoped users via active
      memberships for institution changes), bound via `transaction.on_commit`
    - _Requirements: 5.4, 5.5, 5.6_

  - [x]* 12.3 Property test: fail-closed on capability resolution error
    - **Property 16: Fail-closed on capability resolution error**
    - **Validates: Requirements 5.3**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_capability_failclosed.py`

  - [x]* 12.4 Cache invalidation tests including stale-super-admin demotion
    - Assert role/membership/grant/tenant changes force the next read to recompute;
      assert that after a demotion the next scope/capabilities requests return zero
      `platform.*` capabilities and never serve a pre-change entry (R5.7)
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

- [x] 13. Dashboard aggregate cache (R2, `PERF_CACHE_DASHBOARD`)
  - [x] 13.1 Wrap the dashboard aggregate payload with the scoped cache
    - In `AdminDashboardView.get`, wrap the aggregate computation in
      `cached_or_compute("dash", build_scope_signature(user), compute, ttl=45, enabled=PERF_CACHE_DASHBOARD)`
      so a hit within TTL issues zero count/aggregate queries and a key mismatch
      recomputes scoped to the requester (never cross-tenant); backend-down falls
      back to direct DB computation with no error surfaced
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8, 13.3, 13.4_

  - [x] 13.2 Add dashboard invalidation signals (≤5s, on_commit)
    - On application status change, payment change, membership/grant change, and
      institution update within a scope, call `invalidate("dash", scope_signature)`
      via `transaction.on_commit`
    - _Requirements: 2.4_

  - [x]* 13.3 Dashboard cache hit and invalidation tests
    - Assert a cache hit within TTL issues zero count/aggregate queries; assert each
      triggering change forces the next read to recompute within the window
    - _Requirements: 2.1, 2.4_

- [x] 14. Catalog data cache (R4, `PERF_CACHE_CATALOG`)
  - [x] 14.1 Wrap catalog read responses with the scoped cache
    - Wrap programs / canonical programs / intakes / subjects / assignment-safe
      responses in `cached_or_compute("cat", scope_signature, compute, ttl=450, enabled=PERF_CACHE_CATALOG)`,
      embedding the resolved tenant scope id in the key; when the scope cannot be
      resolved, serve no tenant-scoped entry and compute under the neutral Beanola
      context; cache read/write failure computes from the catalog with no error surfaced
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7_

  - [x] 14.2 Invalidate catalog entries on admin writes before the response returns
    - On successful admin writes to programs, intakes, subjects, offerings, fees, or
      institution assignments, call `invalidate("cat", affected_scope)` synchronously
      within the same request (bumping the per-scope version token) before returning
    - _Requirements: 4.3_

  - [x]* 14.3 Catalog invalidation and neutral-context tests
    - Assert each catalog write forces the next read to recompute; assert an
      unresolved scope never serves a tenant-scoped entry and computes under the
      neutral Beanola context
    - _Requirements: 4.3, 4.6_

- [x] 15. Cross-cache tenant isolation
  - [x]* 15.1 Property test: no cross-tenant cache serve
    - **Property 2: No cross-tenant cache serve**
    - **Validates: Requirements 2.7, 4.5, 13.3, 13.4**
    - hypothesis across Dashboard_Cache, Catalog_Cache, and Capability_Cache,
      ≥100 iterations, `backend/tests/property/test_perf_cache_tenant_isolation.py`

- [x] 16. Checkpoint — backend caches green
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Frontend static asset and bundle optimization (R10, `VITE_PERF_FRONTEND`)
  - [x] 17.1 Compress oversized public PNG assets below 60KB
    - Recompress public PNG logos/signatures over 60KB (lossless/near-lossless)
      below 60KB, preserving rendered dimensions and visible content; commit the
      optimized files under `apps/admissions/public/`
    - _Requirements: 10.1_

  - [x] 17.2 Relocate PDF-only assets out of the public web-fetch path
    - Move assets used only by `@react-pdf` generation (e.g. `public/fonts/pdf/*`,
      scanned signature) so they are bundled/imported rather than publicly fetchable
    - _Requirements: 10.2_

  - [x] 17.3 Configure Caddy `/fonts/*` immutable caching
    - In the Caddy site config, serve `/fonts/*` with
      `Cache-Control: public, max-age=31536000, immutable`
    - _Requirements: 10.3_

  - [x] 17.4 Dynamically import the spreadsheet writer in the export action
    - In `apps/admissions/src/lib/exportUtils.ts`, load the writer via
      `await import('xlsx')` inside the export action so it is excluded from the
      initial bundle and loaded only on first export
    - _Requirements: 10.4_

  - [x] 17.5 Use a memoized Set for selection-membership checks
    - Replace `array.includes(id)` selection checks with a `useMemo`-built
      `Set<string>` and `set.has(id)`, returning identical results
    - _Requirements: 10.5, 10.8_

  - [x] 17.6 Set the admin card virtualization threshold to a fixed 40
    - Set the admin card virtualization threshold to the single fixed integer 40
      (within 30–50)
    - _Requirements: 10.6_

  - [x]* 17.7 Property test: selection-membership equivalence
    - **Property 14: Selection-membership equivalence**
    - **Validates: Requirements 10.5, 10.8**
    - fast-check, ≥100 iterations, `apps/admissions/tests/property/perfSelectionMembership.property.test.ts`

  - [x]* 17.8 Unit tests for dynamic import, threshold, and image fallback
    - Assert the xlsx module is dynamically imported (excluded from the initial
      bundle), the virtualization threshold is 40, and a static-asset load failure
      renders the existing `OptimizedImage` fallback preserving layout
    - _Requirements: 10.4, 10.6, 10.7_

- [x] 18. Admin dashboard polling consolidation (R11, `VITE_PERF_FRONTEND`)
  - [x] 18.1 Designate `useAdminDashboardPolling` as the sole polling owner
    - Make `useAdminDashboardPolling` the single owner of admin dashboard metric
      refetching; refactor `useStats` / app-stats refetch to consume the shared
      `['admin-dashboard-polling']` query cache via `useQuery` + `select` (like
      `useAdminPendingCount`) instead of issuing their own refetch; keep the
      polling interval no less frequent than 30s with fingerprint dedup; retain
      last-good stats and surface an error indication on failure without crashing;
      stop polling on unmount
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x]* 18.2 Property test: fingerprint dedup suppresses redundant updates
    - **Property 15: Fingerprint dedup suppresses redundant updates**
    - **Validates: Requirements 11.3**
    - fast-check, ≥100 iterations, `apps/admissions/tests/property/perfPollingFingerprint.property.test.ts`

  - [x]* 18.3 Polling owner mount/unmount/failure unit tests
    - Assert overlapping stats refetch exclusively through the owner on mount,
      non-owners issue no refetch, owner failure retains last-good stats and
      reschedules, and unmount stops all polling
    - _Requirements: 11.2, 11.4, 11.5, 11.6_

- [x] 19. Cross-cutting behavior, contract, and isolation preservation (R13)
  - [x]* 19.1 Property test: output equivalence pre/post feature
    - **Property 6: Output equivalence pre/post feature**
    - **Validates: Requirements 13.1, 13.2, 13.6, 9.2, 10.8**
    - hypothesis vs the golden baseline (task 2.1), ≥100 iterations,
      `backend/tests/property/test_perf_output_equivalence.py`

  - [x]* 19.2 Property test: constant query count under scaling
    - **Property 10: Constant query count under scaling**
    - **Validates: Requirements 3.4, 4.4, 8.2, 8.5**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_query_counts.py`

  - [x]* 19.3 Property test: authentication and CSRF preservation
    - **Property 17: Authentication and CSRF preservation**
    - **Validates: Requirements 13.5**
    - hypothesis, ≥100 iterations, `backend/tests/property/test_perf_csrf_preservation.py`

  - [x]* 19.4 Divergence regression check across changed endpoints
    - Wire the divergence harness (task 2.1) into a regression test that detects any
      pre/post output divergence for every endpoint changed by this feature
    - _Requirements: 13.6_

- [x] 20. Checkpoint — backend verification gate (R12.1)
  - Run the targeted query-count tests, full backend suite
    (`cd backend && python3 -m pytest`), migration dry-run
    (`cd backend && python3 manage.py apply_sql_migrations --dry-run`), and the
    cache invalidation tests. Ensure all pass with zero failures/errors; ask the
    user if questions arise.

- [x] 21. Checkpoint — frontend verification gate (R12.2)
  - Run `bun run test:admissions` and the admissions type-check. Ensure both pass
    with zero failures/errors; ask the user if questions arise.

- [x] 22. Final checkpoint — feature complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test/verification sub-tasks and can be
  skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each task references specific requirement sub-clauses for traceability, and each
  property test explicitly names its design property (P1–P17), the requirement
  clause it validates, the library (hypothesis/fast-check), the ≥100-iteration
  minimum, and its target file from the design's Testing Strategy table.
- The always-on, behavior-equivalent refactors (tasks 3–10) ship without a runtime
  flag; the three caches (tasks 12–14) and the frontend changes (tasks 17–18) are
  flag-gated (`PERF_CACHE_*`, `VITE_PERF_FRONTEND`) and enabled in blast-radius
  order: capabilities → dashboard → catalog → frontend.
- All cache reads/writes degrade gracefully (compute-on-miss / compute-on-error,
  never surface a cache error), embed the resolved tenant scope, and never serve
  one tenant's data to another.
- The index ships as additive SQL under `backend/scripts/` applied by
  `apply_sql_migrations`; it is validated on Neon/test DB and via `--dry-run` only.

## Operator Follow-Ups (outside the task checkboxes)

These steps are manual operator actions per the infrastructure steering and are
**not** coding tasks; they run after the verification gates are green:

- Take a production backup (`deploy/backup-db.sh` on the EC2 host) before any
  production change.
- Apply `backend/scripts/perf_idx_applications_status_submitted_at.sql` to
  production via `apply_sql_migrations` on the EC2 host (Neon-first, then
  production), confirming the concurrent index build completes valid.
- Flip the feature flags in production in enable order
  (`PERF_CACHE_CAPABILITIES` → `PERF_CACHE_DASHBOARD` → `PERF_CACHE_CATALOG` →
  `VITE_PERF_FRONTEND` on the next frontend build) and redeploy; rollback is a
  flag flip to `False` + redeploy with no schema revert.
- Run the documented backup/restore drill (task 10.2 runbook) against a scratch
  restore.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "5.1", "6.1", "7.1", "8.1", "9.1", "10.1", "10.2", "17.1", "17.2", "17.3", "17.4", "17.5", "17.6", "18.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "3.2", "3.3", "4.1", "5.2", "5.3", "6.2", "7.2", "7.3", "8.2", "9.2", "10.3", "12.1", "12.2", "14.1", "17.7", "17.8", "18.2", "18.3"] },
    { "id": 2, "tasks": ["4.2", "4.3", "9.3", "9.4", "12.3", "12.4", "13.1", "13.2", "14.2"] },
    { "id": 3, "tasks": ["13.3", "14.3", "15.1", "19.1", "19.2", "19.3", "19.4"] }
  ]
}
```
