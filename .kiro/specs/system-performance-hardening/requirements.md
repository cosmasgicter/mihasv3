# Requirements Document

## Introduction

This feature hardens the MIHAS/Beanola platform for production operation on the
current self-hosted infrastructure (AWS EC2 Docker Compose stack, Neon Postgres
authoring database, Celery + Redis, Caddy edge) without changing any business
behavior or API response shapes. The work targets four pressure points observed
in the live system: deploy-time operational risk (disk exhaustion from image
buildup and silent deploy failures), backend database pressure (uncached admin
dashboard aggregates and correlated per-row payment subqueries), tenant/admin
scope resolution cost, Celery worker starvation, missing composite indexes, and
frontend payload waste.

Every change in this feature is performance- and reliability-oriented. None of
the changes may alter the canonical truth map, tenant isolation guarantees,
authentication/CSRF protections, the `/api/v1` REST contract, the
`{"success": true, "data": ...}` response envelope, or mobile-first usability.
All caching introduced here must be tenant-scope-correct and must never serve
one tenant's data to another tenant.

## Glossary

- **Platform**: The Beanola-owned multi-tenant admissions system, comprising the
  Django 5 + DRF backend, the React/Vite admissions and jobs-ops frontends, and
  the supporting EC2 Docker, Neon Postgres, Celery, Redis, and Caddy infrastructure.
- **Deploy_Workflow**: The GitHub Actions deployment pipeline defined in
  `.github/workflows/deploy.yml` that builds, pulls, and runs Docker images on
  the production EC2 host.
- **Production_Host**: The self-hosted AWS EC2 instance running the production
  Docker Compose stack defined in `deploy/docker-compose.prod.yml`.
- **Admin_Dashboard**: The admin overview surface that aggregates application,
  payment, and status counts for the authenticated admin's tenant scope.
- **Dashboard_Aggregate**: A computed count or summary value displayed on the
  Admin_Dashboard (for example, time-bucketed application counts and status
  totals).
- **Application_List_API**: The backend endpoint serving the paginated admin
  list of applications, including derived payment summary fields per application row.
- **Payment_Summary**: The set of payment-related fields (for example latest
  payment status, amount, and paid/pending/failed indicators) derived per
  application from canonical payment records.
- **Catalog_Data**: Programs, canonical programs, intakes, subjects, and
  assignment-safe catalog responses consumed by the wizard, login prefetch, and
  catalog mounts.
- **Scope_Endpoint**: `GET /api/v1/admin/scope/`, which returns the
  authenticated user's resolved tenant scope.
- **Capabilities_Endpoint**: `GET /api/v1/admin/capabilities/`, which returns the
  authenticated user's resolved capability set.
- **Capability_Cache**: The per-user cache of Scope_Endpoint and
  Capabilities_Endpoint responses introduced by this feature.
- **Catalog_Cache**: The Redis cache of Catalog_Data responses introduced by this
  feature.
- **Dashboard_Cache**: The cache of Dashboard_Aggregate values introduced by this
  feature.
- **Payment_Poll_Task**: The `poll_pending_payments_task` Celery task that polls
  the Lenco API for pending payments.
- **Celery_Worker**: The single production Celery worker container
  (`mihas-celery-1`) that executes background tasks.
- **Expiry_Task**: A periodic Celery task that transitions stale records to an
  expired state and creates related notifications (for example draft, payment,
  condition, and enrollment expiry tasks).
- **Applications_Table**: The `applications` Postgres table.
- **List_Serializer**: `ApplicationListSerializer`, which serializes application
  rows for the Application_List_API.
- **Grade_Summary**: The computed academic grade summary value produced per
  application by the List_Serializer.
- **Notifications_API**: The student-facing notification listing endpoint that is
  polled frequently by the student frontend.
- **Static_Asset**: A file served from the admissions app `public/` directory or
  through the Caddy edge (for example logos, signatures, fonts).
- **Admin_Polling_Source**: A frontend hook or query that periodically refetches
  admin dashboard metrics (for example `useAdminDashboardPolling`, `useStats`,
  application stats refetch).
- **Tenant_Scope_Key**: The composite cache key dimension that uniquely
  identifies a tenant-scoped view, composed of user scope, institution filter,
  role, and selected tenant.
- **Business_Behavior**: The externally observable functional outcomes of the
  Platform, including API response shapes, computed field values, authorization
  decisions, and student/admin workflow results.

## Requirements

### Requirement 1: Deploy-Time Operational Risk Controls (P0)

**User Story:** As a platform operator, I want the deploy workflow to prune old
Docker images, alert on disk usage, and roll back on failure, so that deploys
cannot fail silently from disk exhaustion or partial image rollout.

#### Acceptance Criteria

1. WHEN the Deploy_Workflow runs, THE Deploy_Workflow SHALL prune unused Docker
   images on the Production_Host while retaining the immediately previous image
   version required for rollback, as a defined workflow step.
2. WHEN the Deploy_Workflow runs, THE Deploy_Workflow SHALL prune stopped Docker
   containers on the Production_Host as a defined workflow step.
3. WHEN the Deploy_Workflow starts and again after the deploy step completes, THE
   Deploy_Workflow SHALL record the Production_Host disk usage as an integer
   percentage between 0 and 100 in the workflow run log.
4. IF the Production_Host disk usage percentage is at or above the configured
   threshold (default 85, configurable within the inclusive range 50 to 95) before
   the deploy step runs, THEN THE Deploy_Workflow SHALL halt the deploy with a
   non-zero exit status and emit an error message naming the measured usage
   percentage, the configured threshold, and the failed step.
5. IF the image pull, image build, or container start step fails during a deploy,
   THEN THE Deploy_Workflow SHALL restore the immediately previous running image
   version while leaving the production database and volumes unchanged.
6. IF a deploy step fails, THEN THE Deploy_Workflow SHALL report the failure with a
   non-zero exit status and an error message naming the failed step.
7. THE Platform SHALL provide a documented backup-and-restore drill procedure for
   the production database in the repository runbooks, including a verification
   step that confirms the restored database row counts match the backup.

### Requirement 2: Admin Dashboard Aggregate Caching (P0)

**User Story:** As an admin, I want dashboard aggregates served from a short-lived
cache, so that loading the dashboard does not run many uncached count queries
against the database.

#### Acceptance Criteria

1. WHEN the Admin_Dashboard requests Dashboard_Aggregate values AND a
   Dashboard_Cache entry exists for the requesting user's Tenant_Scope_Key whose age
   since storage is less than its assigned time-to-live, THE Platform SHALL serve
   the cached values for that Tenant_Scope_Key without issuing count or aggregate
   database queries.
2. THE Platform SHALL key each Dashboard_Cache entry by a Tenant_Scope_Key composed
   of the requesting user's user scope, institution filter, role, and selected
   tenant, such that no two distinct combinations of those four attributes share a
   cache entry.
3. WHEN the Admin_Dashboard requests Dashboard_Aggregate values AND no
   Dashboard_Cache entry exists for the requesting user's Tenant_Scope_Key, or the
   existing entry's age is greater than or equal to its time-to-live, THE Platform
   SHALL compute the Dashboard_Aggregate values and store them in the
   Dashboard_Cache keyed by that Tenant_Scope_Key with a time-to-live between 30 and
   60 seconds inclusive.
4. WHEN an application status change, payment change, tenant membership or grant
   change, or institution update occurs within a Tenant_Scope_Key, THE Platform
   SHALL delete the affected Dashboard_Cache entries for that Tenant_Scope_Key within
   5 seconds of the change being committed.
5. WHEN the Platform computes time-bucketed Dashboard_Aggregate counts, THE
   Platform SHALL compute them in a single aggregate database query using
   conditional counts (Django Count with filter= or Case/When).
6. WHEN the Admin_Dashboard is loaded, THE Platform SHALL issue no more than 3 count
   or aggregate database queries in total, down from the pre-feature count of 12 or
   more.
7. IF a candidate Dashboard_Cache entry's stored key does not exactly match the
   requesting user's Tenant_Scope_Key, THEN THE Platform SHALL treat the entry as
   absent, SHALL NOT serve its values, and SHALL recompute values scoped to the
   requesting user's Tenant_Scope_Key, so that no Dashboard_Aggregate values are
   served across tenant boundaries.
8. IF the Dashboard_Cache backend is unavailable when the Admin_Dashboard requests
   Dashboard_Aggregate values, THEN THE Platform SHALL compute the
   Dashboard_Aggregate values directly from the database, return them for the
   requesting user's Tenant_Scope_Key, and complete the request without surfacing a
   cache error to the caller.

### Requirement 3: Application List Payment Summary Optimization (P0)

**User Story:** As an admin, I want the application list to derive payment summary
fields without per-row correlated subqueries, so that the list endpoint runs far
fewer database queries while returning identical payment data.

#### Acceptance Criteria

1. WHEN the Application_List_API serializes a page of applications, THE
   Application_List_API SHALL derive each Payment_Summary while issuing zero of the
   seven per-row correlated payment subqueries used before this feature.
2. THE Application_List_API SHALL derive Payment_Summary fields either by
   prefetching the latest payment row per application (the most recent payment row
   by creation time) and computing the summary in the serializer, or by using a
   single window-function or LATERAL latest-payment query.
3. THE Application_List_API SHALL return a response with the same shape and the
   same Payment_Summary field values as before this feature for applications that
   are paid, pending, failed, have no payment, or have multiple payments, treating
   the canonical verified states (verified, paid, successful, force_approved) as the
   same verified value and treating deferred as a distinct status.
4. WHEN the Application_List_API serializes a page of applications, THE
   Application_List_API SHALL issue a database query count that does not grow with
   the number of applications on the page and that is strictly lower than the
   pre-feature query count for any page containing two or more applications.
5. IF latest-payment derivation yields no payment row for an application, THEN THE
   Application_List_API SHALL return a no-payment Payment_Summary for that
   application without failing the request or omitting the remaining applications on
   the page.
6. THE Platform SHALL include regression tests covering the paid, pending, failed,
   no-payment, and multiple-payment Payment_Summary cases that assert the
   Payment_Summary field values are identical to the pre-feature output.

### Requirement 4: Catalog Data Caching (P1)

**User Story:** As a student or admin, I want catalog responses served from a
Redis cache, so that wizard, login, and catalog mounts reuse cached data instead
of re-querying the catalog on every request.

#### Acceptance Criteria

1. WHEN a request reads Catalog_Data for programs, canonical programs, intakes,
   subjects, or assignment-safe catalog responses AND a Catalog_Cache entry exists
   that is within its time-to-live and has not been invalidated and whose key
   matches the request, THE Platform SHALL serve the response from the Catalog_Cache.
2. WHEN no valid Catalog_Cache entry exists for a Catalog_Data request, THE
   Platform SHALL compute the response and store it in the Catalog_Cache with a
   time-to-live between 300 and 600 seconds inclusive.
3. WHEN an admin write to programs, intakes, subjects, offerings, fees, or
   institution assignments completes successfully, THE Platform SHALL invalidate the
   Catalog_Cache entries whose responses derive from the written records before the
   write request returns.
4. WHEN the Platform serializes canonical program offerings, THE Platform SHALL
   resolve available offerings using offerings prefetched in the view rather than a
   per-object query in `CanonicalProgramSerializer.get_available_offerings`.
5. THE Platform SHALL include the resolved tenant scope identifier in each
   Catalog_Cache entry key so that a cached response is reused only within the same
   tenant scope from which it was computed.
6. IF the tenant scope for a Catalog_Data request cannot be resolved, THEN THE
   Platform SHALL NOT serve any tenant-scoped Catalog_Cache entry and SHALL compute
   the response under the neutral Beanola context.
7. IF the Catalog_Cache backend is unavailable or a cache read or write fails, THEN
   THE Platform SHALL compute the response from the catalog and complete the request
   without surfacing a cache error to the caller.

### Requirement 5: Tenant and Admin Scope Caching (P1)

**User Story:** As an admin, I want my scope and capabilities cached per user for
a short interval, so that navigation and admin guards do not re-resolve
memberships and grants on every page change.

#### Acceptance Criteria

1. WHEN the Scope_Endpoint or Capabilities_Endpoint is requested AND a per-user
   Capability_Cache entry exists for the requesting user whose age since storage is
   at most 60 seconds, THE Platform SHALL serve the response from the
   Capability_Cache.
2. WHEN the Scope_Endpoint or Capabilities_Endpoint is requested AND no
   Capability_Cache entry exists for the requesting user, or the existing entry's
   age exceeds 60 seconds, THE Platform SHALL resolve the response and store it in
   the Capability_Cache with a per-user time-to-live of 60 seconds.
3. IF resolving the requesting user's scope or capabilities raises a
   CapabilityResolutionError, THEN THE Platform SHALL NOT store or serve a
   Capability_Cache entry, SHALL remove any existing entry for that user, and SHALL
   return an authorization error exposing zero capabilities and no tenant data.
4. WHEN a user's role changes, THE Platform SHALL invalidate that user's
   Capability_Cache entries within 1 second of the change being committed, such that
   the next request re-resolves rather than serving any pre-change entry.
5. WHEN a membership or access grant is created, updated, or deleted for a user,
   THE Platform SHALL invalidate that user's Capability_Cache entries within 1
   second of the change being committed, such that the next request re-resolves
   rather than serving any pre-change entry.
6. WHEN a tenant's activation state changes, THE Platform SHALL invalidate the
   Capability_Cache entries of users scoped to that tenant within 1 second of the
   change being committed, such that the next request re-resolves rather than
   serving any pre-change entry.
7. THE Platform SHALL include a test proving that, after a scope change demoting a
   user from super-admin authority, the user's next Scope_Endpoint and
   Capabilities_Endpoint requests return zero super-admin permissions and never
   serve a pre-change Capability_Cache entry.

### Requirement 6: Celery Payment Poll and Expiry Task Efficiency (P1)

**User Story:** As a platform operator, I want the payment poll task bounded and
expiry tasks batched, so that one slow external payment poll cannot block the
single Celery worker for an extended period.

#### Acceptance Criteria

1. WHEN the Payment_Poll_Task runs, THE Payment_Poll_Task SHALL process external
   Lenco verification either with a per-run batch size of at most 10 payments or by
   parallelizing the external Lenco calls with a bounded thread pool of at most 5
   concurrent calls.
2. WHEN the Payment_Poll_Task performs an external HTTPS verification call, THE
   Payment_Poll_Task SHALL apply a timeout of at most 10 seconds and a retry limit
   of at most 2 retries to that call.
3. IF an external HTTPS verification call exhausts its timeout and retry limit, THEN
   THE Payment_Poll_Task SHALL skip that payment without transitioning its status
   (honoring forward-only transition rules), record the failure, and continue
   processing the remaining payments in the run.
4. WHEN an Expiry_Task transitions multiple stale records, THE Expiry_Task SHALL
   persist the transitions using a single bulk update and create related
   notifications with a single bulk insert, processing at most 50 records per run
   where the operation is safe to batch.
5. WHILE the Payment_Poll_Task is executing a single run, THE Celery_Worker SHALL
   complete that run within 90 seconds of wall-clock time so that it does not remain
   blocked for the duration of all external calls in that run.

### Requirement 7: Database Index Additions (P1)

**User Story:** As a platform operator, I want a composite index on application
status and submission time, so that dashboard, SLA, and admin filter queries use
an index instead of scanning.

#### Acceptance Criteria

1. THE Platform SHALL add a composite index on the Applications_Table whose key
   order is `status` first and `submitted_at` second.
2. WHEN the index migration runs, THE Platform SHALL create the composite index
   concurrently outside a transaction block and guard creation with an existence
   check so that re-running the migration does not create a duplicate index or fail.
3. WHEN the review SLA task, dashboard status and time filters, or admin
   application filter queries run after the index is added, THE Platform SHALL
   produce a query plan that uses an index scan or index-only scan on the new
   composite index rather than a sequential scan for queries filtering on `status`
   and `submitted_at`.
4. IF concurrent creation of the composite index is interrupted or leaves an invalid
   index, THEN THE Platform SHALL leave existing query behavior unchanged and allow
   the migration to be safely re-run.
5. THE Platform SHALL NOT add an index on `applications.institution_ref_id`,
   because `institution_ref` maps to `institution_id` and is already covered.

### Requirement 8: Application List Serializer Grade Summary Memoization (P2)

**User Story:** As an admin, I want the grade summary computed once per
application during list serialization, so that the same value is not recomputed
multiple times per row.

#### Acceptance Criteria

1. WHEN the List_Serializer serializes a single application, THE List_Serializer
   SHALL compute the Grade_Summary for that application at most once per serializer
   instance and reuse the computed value across every field that requires it.
2. WHEN the List_Serializer computes the Grade_Summary AND prefetched grade records
   are available for the application, THE List_Serializer SHALL derive the
   Grade_Summary from the prefetched records without issuing any additional query.
3. IF prefetched grade records are not available for the application, THEN THE
   List_Serializer SHALL issue at most one grade query for that application.
4. THE List_Serializer SHALL produce a Grade_Summary value equal to the existing
   single-application computation under Zambian ECZ grading semantics.
5. WHEN the List_Serializer serializes a list of applications using prefetched
   grades, THE Platform SHALL keep the total grade-related query count constant as
   the number of applications grows from zero to the page size.
6. THE Platform SHALL include a query-count regression test asserting that, over a
   list of two or more applications, the Grade_Summary is computed at most once per
   application.

### Requirement 9: Notification Cursor Pagination (P2)

**User Story:** As a student, I want notification polling to use cursor
pagination, so that frequent polling avoids repeated full-table counts.

#### Acceptance Criteria

1. WHERE a notification request supplies an `after` identifier, THE Notifications_API
   SHALL return notifications whose identifier is strictly less than the supplied
   `after` identifier, ordered by descending identifier, returning a default of 20
   and a maximum of 100 notifications per request, using the
   `{"success": true, "data": ...}` envelope, and SHALL NOT execute a full
   result-count query (totalCount omitted or null in cursor responses).
2. WHEN a notification request supplies no `after` identifier, THE Notifications_API
   SHALL accept the existing page-number request format and return its existing
   `{page, pageSize, totalCount, results}` response shape unchanged for backward
   compatibility.
3. WHEN the student frontend polls the Notifications_API using the `after`
   identifier, THE Notifications_API SHALL return the response within 2 seconds under
   nominal load and SHALL NOT issue a full-count query for that request.
4. IF a notification request supplies an `after` identifier that is not a valid
   identifier format, THEN THE Notifications_API SHALL reject the request with a
   validation error response indicating the `after` identifier is invalid, and SHALL
   NOT return any notifications.
5. IF a notification request supplies an `after` identifier that is valid in format
   but matches no existing notification, THEN THE Notifications_API SHALL return an
   empty results collection using the `{"success": true, "data": ...}` envelope
   without raising an error.

### Requirement 10: Frontend Static Asset and Bundle Optimization

**User Story:** As a user on a mobile or degraded network, I want smaller static
assets and admin bundles, so that pages load faster without any change in behavior.

#### Acceptance Criteria

1. WHERE a public PNG logo or signature asset exceeds 60 kilobytes before
   optimization, THE Platform SHALL store a compressed version below 60 kilobytes
   while preserving the asset's rendered dimensions and visible content.
2. WHERE a PDF-only asset is not fetched by the user interface, THE Platform SHALL
   serve that asset from a path outside the public web-fetch asset paths.
3. THE Platform SHALL configure the Caddy edge to serve `/fonts/*` responses with a
   cache-control directive that is immutable and sets a max-age of at least 31536000
   seconds.
4. WHEN the admin export action runs, THE Platform SHALL load the spreadsheet writer
   module through a dynamic import inside the export action so that the module is
   excluded from the initial bundle and loaded only on the first export.
5. WHEN selection membership is checked against a set of selected identifiers, THE
   Platform SHALL evaluate membership using a memoized Set lookup that returns the
   same result as an array `includes` scan over the identical collection.
6. THE Platform SHALL set the admin card virtualization threshold to a single fixed
   integer within the inclusive range 30 to 50 rendered items.
7. IF a static asset fails to load, THEN THE Platform SHALL render the existing
   OptimizedImage fallback while preserving the surrounding layout.
8. THE Platform SHALL preserve identical observable output for the asset, export,
   selection, and virtualization changes in this requirement, including the same
   rendered content, the same export file contents, and the same selection results.

### Requirement 11: Admin Dashboard Polling Consolidation

**User Story:** As an admin, I want a single owner for dashboard metric polling,
so that the dashboard does not double-poll overlapping admin statistics.

#### Acceptance Criteria

1. THE Platform SHALL designate exactly one Admin_Polling_Source, selected from the
   candidate sources `useAdminDashboardPolling`, `useStats`, and application stats
   refetch, as the sole owner of admin dashboard metric refetching.
2. WHEN the Admin_Dashboard is mounted, THE Platform SHALL refetch the overlapping
   admin statistics (the metric set shared across the candidate sources) exclusively
   through the designated Admin_Polling_Source.
3. WHILE the Admin_Dashboard is mounted, THE Platform SHALL refetch the overlapping
   admin statistics at a polling interval no less frequent than the interval in
   effect before consolidation, and SHALL apply React Query fingerprint
   deduplication so that an unchanged fingerprint produces no redundant network
   refetch.
4. WHILE the Admin_Dashboard is mounted, THE non-designated candidate sources SHALL
   NOT issue any refetch for the overlapping admin statistics.
5. IF a refetch through the designated Admin_Polling_Source fails, THEN THE Platform
   SHALL retain the last successfully fetched statistics, surface an error indication
   to the admin, and schedule the next refetch at the configured interval without
   crashing the dashboard.
6. WHEN the Admin_Dashboard is unmounted, THE Platform SHALL stop all polling
   through the designated Admin_Polling_Source.

### Requirement 12: Verification Gates

**User Story:** As an engineer, I want defined verification gates for this feature,
so that backend and frontend changes are proven before release.

#### Acceptance Criteria

1. WHEN backend changes in this feature are verified, THE Platform SHALL run the
   targeted query-count tests, the full backend test suite (`cd backend && python3
   -m pytest`), a migration dry-run (`apply_sql_migrations --dry-run`), and the
   cache invalidation tests, and SHALL treat the backend gate as passed only when
   every one of those checks completes with zero failures and zero errors.
2. WHEN frontend changes in this feature are verified, THE Platform SHALL run the
   full admissions test suite (`bun run test:admissions`) and the admissions
   type-check, and SHALL treat the frontend gate as passed only when both complete
   with zero failures and zero errors.
3. IF any check within a verification gate reports one or more failures or errors,
   THEN THE Platform SHALL mark that gate as failed, identify which check failed,
   and treat the corresponding change as not ready for release.
4. IF any check within a verification gate cannot complete or returns an
   indeterminate result, THEN THE Platform SHALL treat that gate as failed and the
   corresponding change as not ready for release.

### Requirement 13: Behavior, Contract, and Tenant Isolation Preservation (Cross-Cutting)

**User Story:** As a platform owner, I want every optimization in this feature to
preserve business behavior, API contracts, and tenant isolation, so that
performance work never leaks data or changes outcomes.

#### Acceptance Criteria

1. THE Platform SHALL preserve, for every endpoint changed by this feature and for
   identical inputs, the same response envelope (`{"success": true, "data": ...}`),
   the same field names, the same value types, the same nesting depth, and the same
   pagination structure served before this feature.
2. THE Platform SHALL produce, for identical inputs and identical persisted state,
   the same computed field values, the same authorization decisions, and the same
   resulting persisted state as before this feature for all changes in this feature.
3. WHEN any cache introduced by this feature serves a response, THE Platform SHALL
   serve only data belonging to the requesting user's resolved tenant scope as
   determined by `visible_institution_queryset(user)`.
4. IF a cache lookup cannot confirm that a cached entry belongs to the requesting
   user's resolved tenant scope, THEN THE Platform SHALL recompute the response and
   SHALL NOT disclose any tenant identifier, name, count, or attribute from the
   non-matching entry.
5. THE Platform SHALL preserve existing cookie-based authentication (DRF
   authentication setting `request.user`) and CSRF protection (accepting a valid
   token and rejecting a missing or invalid token with no state change) for all
   endpoints changed by this feature.
6. THE Platform SHALL include a regression check that detects divergence between
   pre-feature and post-feature output for the endpoints changed by this feature.
7. THE Platform SHALL preserve mobile-first usability (usable at viewports of 320
   pixels and wider, touch targets of at least 44 by 44 pixels, no horizontal
   overflow) and the canonical truth map entries for all changes in this feature.
