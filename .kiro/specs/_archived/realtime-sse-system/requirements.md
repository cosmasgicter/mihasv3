# Requirements Document

## Introduction

End-to-end Server-Sent Events (SSE) realtime system for the MIHAS admissions platform. The system delivers instant push notifications, application status changes, payment updates, and interview scheduling events from the Django backend to the React frontend over SSE, with a polling fallback for degraded environments. A critical constraint is minimizing Redis usage on the pay-as-you-go Upstash plan — the architecture favors database-backed event queuing and Django ASGI streaming over Redis pub/sub.

The backend already has stub SSE views (`backend/apps/common/sse.py`) and the frontend has a robust SSE client (`sseClient.ts`) and realtime hook (`useRealtime.ts`), both currently disabled. This spec covers hardening the backend implementation, adding an event dispatch layer, re-enabling the frontend, and wiring notifications for instant delivery.

## Glossary

- **SSE_Endpoint**: The Django ASGI view at `GET /api/v1/events/stream/` that streams Server-Sent Events to authenticated clients
- **Poll_Endpoint**: The Django view at `GET /api/v1/events/poll/` that returns pending events as a JSON array for clients unable to maintain SSE connections
- **SSE_Client**: The frontend TypeScript module at `apps/admissions/src/lib/sseClient.ts` that manages EventSource connections with reconnection, backoff, and battery-friendly behavior
- **Realtime_Hook**: The React hook at `apps/admissions/src/hooks/useRealtime.ts` that wires the SSE_Client into React component lifecycle and dispatches events to subscribers
- **Notification_Hook**: The React hook at `apps/admissions/src/hooks/useStudentNotifications.ts` that manages the student notification list, polling, and read/delete operations
- **Event_Dispatcher**: A backend Python module that creates event records in the database when domain actions occur (notification creation, status changes, payment updates, interview scheduling). Uses explicit function calls (`dispatch_event(user_id, event_type, payload)`) from views — not Django signals.
- **Event_Table**: A database table (`sse_events`) that stores pending SSE events with user targeting, event type, payload, and delivery tracking
- **Rate_Limiter**: The `RateLimitMiddleware` in `backend/apps/common/middleware.py` that enforces per-scope request limits using Redis-backed django-ratelimit
- **Realtime_Store**: The Zustand store at `apps/admissions/src/stores/realtimeStore.ts` that deduplicates events by event_id and enforces version ordering per entity

## Requirements

### Requirement 1: SSE Stream Endpoint

**User Story:** As a student, I want to receive real-time updates over a persistent SSE connection, so that I see application status changes, notifications, and payment updates without refreshing the page.

#### Acceptance Criteria

1. WHEN an authenticated user opens a connection to `GET /api/v1/events/stream/`, THE SSE_Endpoint SHALL return a `text/event-stream` response with `Cache-Control: no-cache` and `X-Accel-Buffering: no` headers
2. WHILE a client is connected, THE SSE_Endpoint SHALL send a keepalive ping event every 15 seconds to prevent proxy timeouts
3. WHILE a client is connected, THE SSE_Endpoint SHALL query the Event_Table for unsent events targeting the connected user every 3 seconds and yield each as a named SSE event with a unique `id` field
4. WHEN the SSE_Endpoint has streamed for 55 seconds, THE SSE_Endpoint SHALL close the connection gracefully so the client can reconnect with `Last-Event-ID`
5. WHEN a client sends a `Last-Event-ID` header on reconnection, THE SSE_Endpoint SHALL resume streaming only events created after the referenced event
6. IF an unauthenticated request reaches the SSE_Endpoint, THEN THE SSE_Endpoint SHALL return HTTP 401 with a JSON error envelope. Authentication SHALL be performed manually inside the async view by extracting and validating the JWT from the `access_token` cookie, since DRF permission classes do not apply to raw ASGI streaming views.
7. THE SSE_Endpoint SHALL use Django ASGI async streaming response (`StreamingHttpResponse` with an async generator) to avoid blocking worker threads during long-lived connections
8. THE SSE_Endpoint SHALL NOT use Redis pub/sub for event delivery; event data SHALL be read from the Event_Table in Postgres

### Requirement 2: Polling Fallback Endpoint

**User Story:** As a student on an unreliable network, I want a polling fallback that returns pending events as JSON, so that I still receive updates when SSE connections fail.

#### Acceptance Criteria

1. WHEN an authenticated user sends `GET /api/v1/events/poll/`, THE Poll_Endpoint SHALL return a JSON envelope containing an array of unsent events for that user
2. WHEN the request includes a `lastEventId` query parameter, THE Poll_Endpoint SHALL return only events created after the referenced event
3. THE Poll_Endpoint SHALL mark returned events as delivered so subsequent polls do not re-deliver the same events
4. THE Poll_Endpoint SHALL return at most 50 events per request, ordered by creation time ascending
5. IF an unauthenticated request reaches the Poll_Endpoint, THEN THE Poll_Endpoint SHALL return HTTP 401 with a JSON error envelope

### Requirement 3: Database-Backed Event Table

**User Story:** As a platform operator, I want events queued in Postgres instead of Redis, so that the system does not consume excessive Redis requests on the pay-as-you-go Upstash plan.

#### Acceptance Criteria

1. THE Event_Table SHALL store each event with fields: `id` (UUID), `user_id` (FK to Profile), `event_type` (varchar), `payload` (JSONB), `created_at` (timestamptz), `delivered` (boolean, default false), and `delivered_at` (timestamptz, nullable)
2. THE Event_Table SHALL have a composite index on `(user_id, delivered, created_at)` to support efficient queries for undelivered events per user
3. WHEN an event is successfully streamed via SSE or returned via polling, THE SSE_Endpoint or Poll_Endpoint SHALL mark the event row as `delivered = true` and set `delivered_at`
4. THE Event_Table SHALL support the following `event_type` values: `notification`, `application_update`, `payment_update`, `interview_scheduled`, `dashboard_refresh`
5. A Celery Beat periodic task SHALL clean up delivered Event_Table rows older than 7 days, running daily at 04:00 UTC, processing in batches of 1000 rows to avoid long-running transactions
6. Undelivered events older than 7 days SHALL also be cleaned up to prevent unbounded row accumulation for inactive users
7. THE Event_Table SHALL enforce a maximum of 100 undelivered events per user; when the limit is reached, the oldest undelivered events SHALL be evicted (marked delivered) before inserting new ones

### Requirement 4: Event Dispatcher

**User Story:** As a platform operator, I want domain events automatically dispatched when key actions occur, so that students receive real-time updates without manual intervention.

#### Acceptance Criteria

1. WHEN a Notification record is created in the database, THE Event_Dispatcher SHALL create a corresponding `notification` event in the Event_Table targeting the notification's user
2. WHEN an application's status field changes, THE Event_Dispatcher SHALL create an `application_update` event in the Event_Table targeting the application's owner
3. WHEN a payment's status field changes, THE Event_Dispatcher SHALL create a `payment_update` event in the Event_Table targeting the payment's associated user
4. WHEN an interview is scheduled or rescheduled, THE Event_Dispatcher SHALL create an `interview_scheduled` event in the Event_Table targeting the interviewee
5. THE Event_Dispatcher SHALL include the entity ID, new status, and a human-readable summary in the event payload
6. THE Event_Dispatcher SHALL be implemented as an explicit function `dispatch_event(user_id, event_type, payload)` called directly from Django views that change state — NOT as Django signals or post_save hooks. This keeps event dispatch visible, debuggable, and traceable in the call stack.
7. THE Event_Dispatcher SHALL be callable from Django views, serializers, and Celery tasks without requiring Redis

### Requirement 5: Rate Limiting Exemption for SSE

**User Story:** As a platform operator, I want the SSE stream endpoint exempt from per-request rate limiting, so that long-lived connections do not exhaust rate limit quotas or generate unnecessary Redis requests.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL skip rate limit checks for requests to `/api/v1/events/stream/`
2. THE Rate_Limiter SHALL continue to enforce rate limits on `/api/v1/events/poll/` using the existing catch-all scope
3. WHEN the SSE_Endpoint is exempt from rate limiting, THE Rate_Limiter SHALL NOT increment any Redis counters for that request

### Requirement 6: Frontend SSE Client Re-enablement

**User Story:** As a student, I want the SSE connection to activate automatically when I log in, so that I receive real-time updates on my dashboard and notification bell.

#### Acceptance Criteria

1. WHEN a user is authenticated, THE Realtime_Hook SHALL initialize with `enabled: true` to establish an SSE connection to `GET /api/v1/events/stream/`
2. WHEN a user is authenticated, THE Realtime_Hook SHALL initialize with `pollingEnabled: true` so that polling activates as a fallback when SSE fails
3. THE SSE_Client SHALL connect with `withCredentials: true` to send JWT cookies cross-origin to `api.mihas.edu.zm`
4. WHEN the SSE connection fails after the maximum retry attempts, THE Realtime_Hook SHALL fall back to polling `GET /api/v1/events/poll/` with progressive interval backoff starting at 30 seconds
5. WHEN the browser tab becomes hidden, THE SSE_Client SHALL disconnect the EventSource to conserve battery and network resources
6. WHEN the browser tab becomes visible again, THE SSE_Client SHALL reconnect with retry count reset to zero

### Requirement 7: Notification Hook SSE Integration

**User Story:** As a student, I want my notification bell to update instantly when new notifications arrive via SSE, so that I do not have to wait for the next polling cycle.

#### Acceptance Criteria

1. WHEN a `notification` SSE event is received, THE Notification_Hook SHALL prepend the notification to the local notification list and increment the unread count
2. WHEN a `notification` SSE event is received, THE Notification_Hook SHALL normalize the event payload to match the `StudentNotification` type using the existing `normalizeNotificationPayload` function
3. WHILE SSE is connected, THE Notification_Hook SHALL reduce polling frequency to every 60 seconds as a consistency fallback
4. WHILE SSE is disconnected, THE Notification_Hook SHALL poll at the default 30-second interval
5. THE Notification_Hook SHALL deduplicate notifications by `id` to prevent duplicates when both SSE and polling deliver the same notification

### Requirement 8: Application Status Real-Time Updates

**User Story:** As a student, I want to see application status changes in real-time on my dashboard, so that I know immediately when an admin reviews my application.

#### Acceptance Criteria

1. WHEN an `application_update` SSE event is received, THE Realtime_Hook SHALL dispatch the event to all registered `application_update` subscribers
2. WHEN the student dashboard receives an `application_update` event, THE dashboard SHALL invalidate the relevant React Query caches and reload application data
3. THE `application_update` event payload SHALL include `application_id`, `status`, and `updated_at` fields

### Requirement 9: Reconnection Behavior

**User Story:** As a student on a mobile device, I want SSE reconnection to use exponential backoff with a retry cap, so that failed connections do not drain my battery or flood the server.

#### Acceptance Criteria

1. THE SSE_Client SHALL use exponential backoff starting at 1 second, doubling each attempt, capped at 30 seconds
2. THE SSE_Client SHALL stop reconnection attempts after 5 consecutive failures and fall back to polling
3. WHEN the SSE connection recovers after a failure, THE SSE_Client SHALL reset the retry counter to zero
4. WHEN the SSE_Client falls back to polling, THE Realtime_Hook SHALL use progressive interval backoff: 30 seconds initially, increasing by 1.5x after idle polls, capped at 120 seconds

### Requirement 10: Redis Cost Optimization

**User Story:** As a platform operator, I want the SSE system to minimize Redis usage, so that the Upstash pay-as-you-go bill stays within budget.

#### Acceptance Criteria

1. THE SSE_Endpoint SHALL NOT use Redis pub/sub, Redis streams, or Redis cache for event delivery or storage
2. THE Event_Dispatcher SHALL NOT write to Redis when creating events; events SHALL be written directly to Postgres
3. THE SSE_Endpoint keepalive pings SHALL NOT involve any Redis operations
4. WHEN the SSE_Endpoint queries for new events, THE SSE_Endpoint SHALL query Postgres directly using the indexed Event_Table
5. THE Poll_Endpoint SHALL NOT use Redis for event storage or delivery tracking

### Requirement 11: SSE Connection Capacity and Graceful Shutdown

**User Story:** As a platform operator, I want SSE connections bounded and gracefully handled during deploys, so that the single Koyeb instance is not overwhelmed and students experience minimal disruption during restarts.

#### Acceptance Criteria

1. THE SSE_Endpoint SHALL enforce a maximum of 50 concurrent SSE connections per Koyeb worker instance. When the limit is reached, new SSE connection attempts SHALL receive HTTP 503 with a `Retry-After: 5` header, causing the client to fall back to polling.
2. THE SSE_Endpoint's internal Postgres polling interval SHALL be 3 seconds, resulting in a maximum of ~17 queries per connection per 55-second lifecycle
3. WHEN the Koyeb instance receives a SIGTERM (deploy/restart), active SSE streaming responses SHALL terminate within the ASGI shutdown grace period. The 55-second connection lifecycle ensures most connections are already near their natural close point.
4. THE Event_Table design SHALL support future multi-instance scaling by using user_id-scoped queries (no server-affinity required) — each instance independently polls for its connected users' events
