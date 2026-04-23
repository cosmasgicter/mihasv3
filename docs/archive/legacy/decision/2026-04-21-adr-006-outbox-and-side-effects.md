# ADR-006: Durable Side-Effect Delivery Model

Date: 2026-04-21
Status: Accepted

## Context

The platform persists several side effects:
- in-app notifications in `notifications`
- email delivery intent in `email_queue`

Historically, side-effect creation and dispatch logic was duplicated across
views, services, and Celery tasks. Email reliability was improved with an
outbox-style `EmailQueue`, but the implementation was still ad hoc.

## Decision

The durable side-effect model is:

1. Persist intent first.
2. Dispatch asynchronously where delivery is external or retriable.
3. Centralize side-effect creation through shared helpers instead of open-coded
   `Notification.objects.create(...)` and `EmailQueue.objects.create(...)`
   patterns.

The current shared helper entry points are:
- `apps.common.outbox.create_notification(...)`
- `apps.common.outbox.queue_email(...)`

Email remains the only side effect with a full queue/retry worker path today.
Notifications are durable rows but not worker-driven.

## Rules

1. New email-producing code must use `queue_email(...)`.
2. New notification-producing code should use `create_notification(...)`.
3. Code should not call `send_email_task.delay(...)` directly from business
   logic.
4. Delivery reliability features belong in the shared outbox/task layer, not
   reimplemented in each feature module.

## Current Guarantees

Email:
- persistent outbox row before delivery attempt
- duplicate queued tasks are harmless because delivery is claim-based
- stale `processing` rows are reclaimed by the sweep

Notifications:
- durable DB row creation
- no distributed worker claim/retry lifecycle yet

## Consequences

Positive:
- one place to evolve delivery policy
- less duplicate wiring
- easier auditability of side effects

Negative:
- this is still not a single generic outbox table
- non-email side effects remain less mature than email delivery

## Follow-ups

1. Add a persisted lease/claim timestamp when schema governance allows it.
2. Extend the same pattern to additional durable side effects if they require
   retries or external dispatch.
