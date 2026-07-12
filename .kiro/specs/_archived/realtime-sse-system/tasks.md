# Implementation Plan: Realtime SSE System

## Overview

Replace the existing stub SSE implementation with a production-grade, database-backed Server-Sent Events system. The implementation proceeds bottom-up: data layer first (SQL table, Django model), then event dispatch, then SSE/poll endpoints, then middleware/config, then frontend re-enablement, and finally wiring dispatch calls into existing views.

## Tasks

- [x] 1. Create SSE events database table and Django model
  - [x] 1.1 Create SQL migration script `backend/scripts/create_sse_events_table.sql`
    - Define `sse_events` table with columns: `id` (UUID PK, default `gen_random_uuid()`), `user_id` (UUID NOT NULL FK → `profiles(id) ON DELETE CASCADE`), `event_type` (VARCHAR(50) NOT NULL), `payload` (JSONB NOT NULL DEFAULT '{}'), `entity_id` (UUID nullable), `delivered` (BOOLEAN NOT NULL DEFAULT false), `delivered_at` (TIMESTAMPTZ nullable), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
    - Create partial index `idx_sse_events_user_undelivered` on `(user_id, delivered, created_at) WHERE delivered = false`
    - Create partial index `idx_sse_events_cleanup_delivered` on `(delivered, delivered_at) WHERE delivered = true`
    - Create partial index `idx_sse_events_cleanup_undelivered` on `(delivered, created_at) WHERE delivered = false`
    - Neon DB is PG 17 — `gen_random_uuid()` is native, no extension needed
    - _Requirements: 3.1, 3.2_

  - [x] 1.2 Execute the SQL migration against Neon Postgres
    - Use the Neon MCP `prepare_database_migration` tool to apply the DDL from task 1.1 on a temporary branch
    - Verify the table and indexes exist on the temporary branch using `run_sql` (e.g., `SELECT * FROM information_schema.columns WHERE table_name = 'sse_events'`)
    - Commit the migration to the main branch using `complete_database_migration`
    - Project ID: `wild-bar-37055823`
    - _Requirements: 3.1, 3.2_

  - [x] 1.3 Add `SSEEvent` model to `backend/apps/common/models.py`
    - `managed = False`, `db_table = 'sse_events'`, consistent with `AuditLog` and `ErrorLog` patterns
    - Fields: `id` (UUIDField PK), `user` (FK to `accounts.Profile`, on_delete=CASCADE), `event_type` (CharField max_length=50), `payload` (JSONField default=dict), `entity_id` (UUIDField nullable), `delivered` (BooleanField default=False), `delivered_at` (DateTimeField nullable), `created_at` (DateTimeField auto_now_add=True)
    - _Requirements: 3.1_

- [x] 2. Implement event dispatcher
  - [x] 2.1 Create `backend/apps/common/event_dispatcher.py` with `dispatch_event(user_id, event_type, payload, entity_id=None)`
    - Validate `event_type` against allowed set (`notification`, `application_update`, `payment_update`, `interview_scheduled`, `dashboard_refresh`); raise `ValueError` for invalid types
    - Create `SSEEvent` row in Postgres with `delivered=false`
    - Enforce per-user cap of 100 undelivered events: when exceeded, evict oldest undelivered events by marking them delivered before inserting
    - No Redis usage — direct Postgres writes only
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 3.7, 10.2_

  - [x] 2.2 Write property test for dispatch_event round-trip persistence
    - **Property 8: SSEEvent persistence round-trip**
    - **Validates: Requirements 3.1**
    - File: `backend/tests/property/test_event_dispatcher.py`

  - [x] 2.3 Write property test for event type validation
    - **Property 9: Event type validation**
    - **Validates: Requirements 3.4**
    - File: `backend/tests/property/test_event_dispatcher.py`

  - [x] 2.4 Write property test for per-user undelivered event cap
    - **Property 11: Per-user undelivered event cap**
    - **Validates: Requirements 3.7**
    - File: `backend/tests/property/test_event_dispatcher.py`

  - [x] 2.5 Write property test for dispatch_event creates SSEEvent for valid domain actions
    - **Property 12: dispatch_event creates SSEEvent for valid domain actions**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - File: `backend/tests/property/test_event_dispatcher.py`

- [x] 3. Checkpoint — Verify event dispatcher
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Rewrite SSE stream and poll endpoints
  - [x] 4.1 Rewrite `backend/apps/common/sse.py` — SSE async stream view
    - Replace existing `SSEStreamView` class with a standalone async function `sse_stream_view`
    - **Auth:** Manual JWT extraction from `access_token` cookie (same signing key/algorithm as `JWTAuthenticationMiddleware`). Use `pyjwt.decode()` directly — DRF permission classes don't apply to raw ASGI views.
    - Return 401 JSON if unauthenticated
    - **Capacity:** Module-level connection counter with `threading.Lock` — return 503 with `Retry-After: 5` when 50 concurrent connections exceeded. Decrement counter in a `finally` block to ensure cleanup on any exit path.
    - **Async generator:** Query `sse_events` every 3s via `sync_to_async(SSEEvent.objects.filter(...))`, yield named SSE events with `id` field, mark delivered after yield using `sync_to_async(SSEEvent.objects.filter(id__in=...).update(...))`
    - **Resume:** Support `Last-Event-ID` header — stream only events created after the referenced event's `created_at`
    - **Keepalive:** Ping every 15s (use `asyncio.sleep` with time tracking, not a separate timer)
    - **Lifecycle:** Close connection after 55s
    - Hardcode `"version": 1` in SSE output envelope (no DB column)
    - `StreamingHttpResponse` with `Cache-Control: no-cache`, `X-Accel-Buffering: no` headers
    - **Error resilience:** If DB query fails mid-stream, log error, yield SSE comment line (`:`), continue to next poll cycle. Do not crash the stream.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 10.1, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4_

  - [x] 4.2 Rewrite `backend/apps/common/sse.py` — Poll endpoint
    - Replace existing `SSEPollView` to read from `sse_events` instead of `notifications`
    - Return max 50 undelivered events for authenticated user, ordered by `created_at` ascending
    - Mark returned events as `delivered=true` with `delivered_at` timestamp
    - Support `lastEventId` query parameter for resume
    - Return 401 for unauthenticated requests
    - Hardcode `"version": 1` in output envelope
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 10.5_

  - [x] 4.3 Update `backend/apps/common/event_urls.py` to register the new async stream view and poll view
    - Replace class-based `SSEStreamView.as_view()` with the async function `sse_stream_view`
    - Update `SSEPollView` import
    - _Requirements: 1.1, 2.1_

  - [x] 4.4 Write property test for SSE event delivery completeness
    - **Property 1: SSE event delivery completeness**
    - **Validates: Requirements 1.3**
    - File: `backend/tests/property/test_sse_delivery.py`

  - [x] 4.5 Write property test for Last-Event-ID filtering
    - **Property 2: Last-Event-ID filtering for SSE stream**
    - **Validates: Requirements 1.5**
    - File: `backend/tests/property/test_sse_delivery.py`

  - [x] 4.6 Write property test for delivery marking after retrieval
    - **Property 6: Delivery marking after retrieval**
    - **Validates: Requirements 2.3, 3.3**
    - File: `backend/tests/property/test_sse_delivery.py`

  - [x] 4.7 Write property test for poll returns at most 50 events ordered ascending
    - **Property 7: Poll returns at most 50 events ordered ascending**
    - **Validates: Requirements 2.4**
    - File: `backend/tests/property/test_sse_delivery.py`

  - [x] 4.8 Write property test for unauthenticated SSE returns 401
    - **Property 3: Unauthenticated SSE returns 401**
    - **Validates: Requirements 1.6**
    - File: `backend/tests/property/test_sse_auth.py`

  - [x] 4.9 Write property test for poll returns undelivered events for authenticated user
    - **Property 4: Poll returns undelivered events for authenticated user**
    - **Validates: Requirements 2.1**
    - File: `backend/tests/property/test_poll_endpoint.py`

  - [x] 4.10 Write property test for lastEventId filtering for poll endpoint
    - **Property 5: lastEventId filtering for poll endpoint**
    - **Validates: Requirements 2.2**
    - File: `backend/tests/property/test_poll_endpoint.py`

  - [x] 4.11 Write property test for connection capacity limit
    - **Property 20: Connection capacity limit**
    - **Validates: Requirements 11.1**
    - File: `backend/tests/property/test_sse_delivery.py`

- [x] 5. Checkpoint — Verify SSE and poll endpoints
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Add rate limiter exemption and Celery Beat cleanup
  - [x] 6.1 Update `backend/apps/common/middleware.py` — exempt SSE stream from rate limiting
    - Add `("/api/v1/events/stream/", None)` as the first entry in `RateLimitMiddleware.SCOPE_LIMITS`
    - When rate is `None`, skip rate limit check entirely (no Redis counter increment)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 6.2 Add `cleanup_sse_events_task` to `backend/apps/common/tasks.py`
    - Delete delivered events where `delivered_at` is older than 7 days, in batches of 1000
    - Delete undelivered events where `created_at` is older than 7 days, in batches of 1000
    - _Requirements: 3.5, 3.6_

  - [x] 6.3 Add Celery Beat schedule entry in `backend/config/settings/base.py`
    - Schedule `cleanup_sse_events_task` at `crontab(hour=4, minute=0)` (04:00 UTC daily)
    - _Requirements: 3.5_

  - [x] 6.4 Write property test for cleanup removes events older than 7 days
    - **Property 10: Cleanup removes events older than 7 days**
    - **Validates: Requirements 3.5, 3.6**
    - File: `backend/tests/property/test_event_cleanup.py`

- [x] 7. Checkpoint — Verify backend is complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Re-enable frontend SSE client and notification integration
  - [x] 8.1 Update `apps/admissions/src/hooks/useRealtime.ts` — re-enable SSE defaults
    - Change `enabled: false` → `enabled: true`
    - Change `pollingEnabled: false` → `pollingEnabled: true`
    - Change `maxReconnectAttempts: 3` → `maxReconnectAttempts: 5` in `DEFAULT_OPTIONS`
    - Verify progressive polling backoff (30s × 1.5^n, capped at 120s) is already implemented
    - _Requirements: 6.1, 6.2, 6.4, 9.2, 9.4_

  - [x] 8.2 Update `apps/admissions/src/hooks/useStudentNotifications.ts` — SSE notification integration
    - Subscribe to `notification` SSE events via `useRealtime`
    - When SSE `notification` event received: normalize payload with `normalizeNotificationPayload`, prepend to notification list, increment unread count
    - When SSE is connected: reduce polling interval to 60s
    - When SSE is disconnected: poll at default 30s
    - Deduplicate notifications by `id` before prepending
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.3 Write property test for exponential backoff formula
    - **Property 14: Exponential backoff formula**
    - **Validates: Requirements 9.1**
    - File: `apps/admissions/tests/unit/sse-backoff.test.ts`

  - [x] 8.4 Write property test for progressive polling backoff formula
    - **Property 15: Progressive polling backoff formula**
    - **Validates: Requirements 6.4, 9.4**
    - File: `apps/admissions/tests/unit/sse-backoff.test.ts`

  - [x] 8.5 Write property test for notification SSE event prepend and unread count
    - **Property 16: Notification SSE event prepend and unread count**
    - **Validates: Requirements 7.1**
    - File: `apps/admissions/tests/unit/notification-ingestion.test.ts`

  - [x] 8.6 Write property test for normalizeNotificationPayload preserves data
    - **Property 17: normalizeNotificationPayload preserves data**
    - **Validates: Requirements 7.2**
    - File: `apps/admissions/tests/unit/notification-ingestion.test.ts`

  - [x] 8.7 Write property test for notification deduplication by id
    - **Property 18: Notification deduplication by id**
    - **Validates: Requirements 7.5**
    - File: `apps/admissions/tests/unit/notification-ingestion.test.ts`

  - [x] 8.8 Write property test for subscriber dispatch for application_update events
    - **Property 19: Subscriber dispatch for application_update events**
    - **Validates: Requirements 8.1**
    - File: `apps/admissions/tests/unit/realtime-dispatch.test.ts`

- [x] 9. Wire dispatch_event calls into existing views
  - [x] 9.1 Add `dispatch_event` calls to `backend/apps/applications/views.py` — ApplicationReviewView
    - After successful status transition in `ApplicationReviewView.post`, call `dispatch_event(user_id=app.user_id, event_type='application_update', payload={'application_id': str(app.id), 'status': new_status, 'updated_at': ...}, entity_id=app.id)`
    - After successful payment status update, call `dispatch_event` with `event_type='payment_update'`
    - _Requirements: 4.2, 4.3, 4.5, 8.3_

  - [x] 9.2 Add `dispatch_event` calls to `backend/apps/common/notification_views.py` — NotificationSendView
    - After `Notification.objects.create()` in `NotificationSendView.post`, call `dispatch_event(user_id=data['user_id'], event_type='notification', payload={'notification_id': str(notification.id), 'title': data['title'], 'message': data['message'], 'type': data.get('type', 'general')}, entity_id=notification.id)`
    - Also add dispatch in `NotificationListView.post` delegation path
    - _Requirements: 4.1, 4.5_

  - [x] 9.3 Write property test for event payload contains required fields
    - **Property 13: Event payload contains required fields**
    - **Validates: Requirements 4.5, 8.3**
    - File: `backend/tests/property/test_event_dispatcher.py`

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property tests — can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The design uses Python (Django) and TypeScript (React) — no language selection needed
- The SSE stream view is a standalone async function, not a DRF class-based view
- `event_urls.py` already exists and is already included in `config/urls.py` — task 4.3 updates it in place
- The `version` field is hardcoded to 1 in output, not stored in the database
- **Neon project ID:** `wild-bar-37055823` (PG 17, `gen_random_uuid()` native)
- **Database migration:** Use Neon MCP `prepare_database_migration` → verify → `complete_database_migration` for safe branch-based DDL application
- **Riskiest task:** 4.1 (async ASGI streaming view) — if issues arise during implementation, consider splitting into sub-tasks: auth extraction, connection counter, async generator, keepalive/lifecycle
