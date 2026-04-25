# Notification & Communication System — UX Audit

**Date:** 2026-04-25
**Auditor:** Kiro (automated deep-read audit)
**Scope:** Every notification-related file in the MIHAS monorepo — frontend components, hooks, services, backend views, models, tasks, templates, and outbox infrastructure.

---

## Executive Summary

The notification system is **architecturally solid** — outbox pattern, dual-provider email fallback, optimistic UI mutations, polling with visibility-aware backoff, and idempotent notification creation. However, there are **12 concrete bugs/gaps** ranging from data-loss-level backend issues to UX friction that degrades the student experience. The most critical: `markAllRead` silently drops `read_at` timestamps, the frontend/backend field name mismatch (`read` vs `is_read`) relies on fragile normalization, and the SMS channel is wired in the UI but has **zero backend delivery infrastructure**.

---

## Prioritized Findings

### P0 — Data Integrity / Silent Failures

#### 1. `markAllRead` does NOT set `read_at` on the backend
- **File:** `backend/apps/common/notification_views.py`, lines 518–525
- **Issue:** `NotificationMarkAllReadView._mark_all_read()` uses a bulk `.update(is_read=True)` but **never sets `read_at`**. Compare with `NotificationMarkReadView._mark_read()` (line 482) which correctly sets `read_at = timezone.now()`.
- **Impact:** Every notification marked via "Mark all read" has `read_at = NULL` in the database. Any future analytics, audit trail, or "read X minutes ago" display will be wrong. The frontend optimistic update (line 130 of `useNotificationPolling.ts`) sets a fake `read_at` client-side, masking the bug until the next poll overwrites it with `null`.
- **Fix:** Change line 520 to: `.update(is_read=True, read_at=timezone.now())`

#### 2. Frontend/backend field name mismatch: `read` vs `is_read`
- **Files:** `backend/apps/common/models.py` line 101 (`is_read`), `backend/apps/common/notification_views.py` line 74 (serializer exposes `is_read`), `apps/admissions/src/types/notifications.ts` line 6 (frontend expects `read`), `apps/admissions/src/services/notifications.ts` lines 68–72 (normalization)
- **Issue:** The backend model and serializer use `is_read`. The frontend type uses `read`. The `normalizeNotification()` function in `notifications.ts` bridges this with a fallback chain (`raw.read ?? raw.is_read`), but this is fragile — if the backend ever changes the serializer field name or adds a new field, the normalization silently breaks.
- **Impact:** Currently works due to the normalization layer, but any developer touching either side without reading both will introduce a regression. The normalization also means `is_read` is never explicitly tested in the frontend type system.
- **Recommendation:** Either rename the backend serializer field to `read` (breaking change, needs migration) or add an explicit `read` alias in `NotificationItemSerializer`. Document the mapping.

#### 3. SMS channel is a UI-only facade — no backend delivery
- **Files:** `apps/admissions/src/pages/student/NotificationSettings.tsx` (entire SMS card), `backend/apps/common/models.py` line 131 (`sms_enabled`), `backend/apps/common/notification_views.py` lines 131–200 (preferences view)
- **Issue:** The NotificationSettings page renders a full SMS opt-in/opt-out card with consent toggle, phone number display, and status badges. The backend stores `sms_enabled` in `UserNotificationPreference`. But **there is no SMS sending infrastructure anywhere in the codebase** — no Twilio, no Africa's Talking, no SMS gateway. The `send_bulk_notifications_task` (tasks.py line 163) only checks `email_enabled` and sends email. SMS preference is stored but never read by any delivery path.
- **Impact:** Students who opt into SMS receive nothing. This is a broken promise in the UI. Worse, the toggle gives a "SMS Alerts enabled" success message, creating false confidence.
- **Fix:** Either (a) remove the SMS card from NotificationSettings and hide `sms_enabled` until an SMS provider is integrated, or (b) add a clear "Coming soon" badge and disable the toggle.

---

### P1 — UX Bugs / Functional Gaps

#### 4. CommunicationModal templates use `{name}` but CommunicationService uses `{{variable}}`
- **Files:** `apps/admissions/src/components/admin/CommunicationModal.tsx` lines 42–73 (hardcoded `MESSAGE_TEMPLATES` with `{name}` placeholder), `backend/apps/common/communication_service.py` line 18 (`_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")`)
- **Issue:** The frontend CommunicationModal has its own hardcoded template list with `{name}` single-brace placeholders. The backend CommunicationService uses `{{variable}}` double-brace placeholders and reads from the `communication_templates` database table. These are **two completely separate template systems** that don't talk to each other.
- **Impact:** Admin templates edited via `PUT /api/v1/admin/templates/{key}/` have no effect on the CommunicationModal. The modal's templates are frozen in the frontend bundle. If an admin customizes the "Draft Application Reminder" template in the database, the CommunicationModal still shows the hardcoded version.
- **Fix:** The CommunicationModal should fetch templates from the backend (`GET /api/v1/admin/templates/`) instead of using hardcoded `MESSAGE_TEMPLATES`. The `{name}` placeholder format should be migrated to `{{student_name}}` for consistency.

#### 5. CommunicationModal `onSend` is optional and has no default backend integration
- **File:** `apps/admissions/src/components/admin/CommunicationModal.tsx` line 30 (`onSend?: (data: CommunicationData) => Promise<void>`)
- **Issue:** The `onSend` prop is optional. If the parent component doesn't pass it, clicking "Send Message" does nothing except show a success message and close the modal. The component has no built-in API call — it's a pure UI shell that depends entirely on the parent to wire up the actual send logic.
- **Impact:** Any admin page that renders `<CommunicationModal>` without an `onSend` handler silently swallows messages. There's no error, no warning, just a fake success animation.
- **Fix:** Either make `onSend` required, or add a default implementation that calls `notificationService.send()` + `POST /api/v1/email/send/` based on the selected channel.

#### 6. Notification panel uses `window.location.href` for navigation instead of React Router
- **File:** `apps/admissions/src/components/student/NotificationBell.tsx` lines 47–52
- **Issue:** When a user clicks a notification with an `action_url`, the code does `window.location.href = notification.action_url`. This triggers a full page reload instead of a client-side navigation via React Router.
- **Impact:** Every notification click causes a full SPA reload — losing React Query cache, Zustand state, scroll position, and any unsaved form state. On slow Zambian mobile networks, this adds 2–5 seconds of unnecessary load time.
- **Fix:** Use `navigate(notification.action_url)` from React Router for internal URLs (those starting with `/`). Only fall back to `window.location.href` for external URLs.

#### 7. NotificationItem delete button is invisible until hover — inaccessible on touch devices
- **File:** `apps/admissions/src/components/student/NotificationItem.tsx` lines 87–97
- **Issue:** The delete button has `opacity-0 group-hover:opacity-100 focus:opacity-100`. On mobile/touch devices, there is no hover state. The button is invisible and unreachable unless the user happens to tab to it (unlikely on mobile).
- **Impact:** Mobile students (the primary user base per product constraints) cannot delete notifications from the bell panel. They must navigate to the full NotificationSettings page to delete.
- **Fix:** Add `touch:opacity-100` or use a swipe-to-delete pattern for mobile. Alternatively, always show the delete button at reduced opacity.

#### 8. Toast container positioned top-right can overlap notification panel
- **File:** `apps/admissions/src/components/ui/Toast.tsx` lines 155–160 (`fixed top-4 left-4 right-4 md:left-auto md:right-4 z-50`), `apps/admissions/src/components/student/NotificationBell.tsx` line 72 (`z-[9999]`)
- **Issue:** The toast container is `z-50` positioned top-right. The notification panel is `z-[9999]`. While the panel wins the z-index battle, toasts that fire while the panel is open appear behind it and are invisible to the user.
- **Impact:** If a notification action triggers a toast (e.g., "Marked as read" error), the user won't see it because the panel covers it.
- **Fix:** Either dismiss the notification panel when a toast fires, or position toasts above the panel z-index when the panel is open.

---

### P2 — Performance / Efficiency

#### 9. Notification polling fetches ALL notifications every 60 seconds — no pagination or delta
- **Files:** `apps/admissions/src/hooks/useNotificationPolling.ts` line 88 (`notificationService.list()`), `apps/admissions/src/services/notifications.ts` line 148 (calls `GET /notifications/` with no params), `backend/apps/common/notification_views.py` lines 388–400 (returns all notifications when no pagination params)
- **Issue:** Every 60 seconds, the frontend fetches the **entire notification list** for the user. The backend returns all notifications without pagination when no `page`/`pageSize` params are provided (line 388–400). For a student with 50+ notifications over a semester, this is an ever-growing payload.
- **Impact:** Wasted bandwidth on mobile networks. The response payload grows linearly with notification count and is never trimmed. No `since` or `after` parameter exists for delta fetching.
- **Fix:** (a) Add `?pageSize=20&page=1` to the polling request to cap the payload. (b) Better: add a `?since={last_created_at}` parameter to the backend for delta polling — only return notifications newer than the last known one. (c) Add a lightweight `GET /api/v1/notifications/count/` endpoint that returns just the unread count, and only fetch the full list when the panel is opened.

#### 10. `useNotificationPolling` runs on every page, including admin pages
- **File:** `apps/admissions/src/components/student/NotificationBell.tsx` line 14 (unconditionally calls `useNotificationPolling()`)
- **Issue:** The `NotificationBell` component calls `useNotificationPolling()` which starts a 60-second polling loop. If `NotificationBell` is rendered in the admin layout (which it likely is, since it's in the navigation), admin users are polling the student notification endpoint — which returns their own notifications (if any) but is architecturally wrong for admin users who should have a separate notification stream.
- **Impact:** Unnecessary API calls for admin users. If admins have no notifications, this is pure waste. If they do, mixing admin and student notification semantics in one endpoint is confusing.
- **Recommendation:** Conditionally enable polling based on user role, or separate admin/student notification streams.

---

### P3 — Maintainability / Minor UX

#### 11. Dual notification creation paths create inconsistency
- **Files:** `backend/apps/common/communication_service.py` line 112 (`create_notification()` via CommunicationService.send), `backend/apps/applications/tasks.py` lines 115/204/260 (direct `create_notification()` calls), `backend/apps/applications/admin_views.py` lines 755/852 (direct `create_notification()` calls)
- **Issue:** Notifications are created through two paths: (a) `CommunicationService.send()` which renders a template and creates both notification + email, and (b) direct `create_notification()` calls scattered across tasks and views with hardcoded strings. The direct calls bypass the template system entirely.
- **Impact:** Template changes in the database don't affect notifications created via direct `create_notification()`. There's no single place to audit all notification copy. Some notifications have rich HTML (via templates), others have plain text (via direct calls).
- **Recommendation:** Migrate all direct `create_notification()` calls to use `CommunicationService.send()` with appropriate template keys. This centralizes copy management and ensures consistent formatting.

#### 12. CommunicationModal character limit is enforced client-side only
- **File:** `apps/admissions/src/components/admin/CommunicationModal.tsx` lines 148–149 (character limit logic), line 167 (send button disabled when `remainingChars < 0`)
- **Issue:** The 160-char SMS limit and 1000-char email limit are enforced only in the frontend. The backend `NotificationSendSerializer` (notification_views.py line 62) has `message = serializers.CharField()` with no `max_length`. An API call bypassing the modal can send arbitrarily long messages.
- **Impact:** Low risk since only admins can send, but violates defense-in-depth. A long SMS message would be silently truncated or rejected by the (non-existent) SMS provider.
- **Fix:** Add `max_length=5000` to the backend serializer as a safety net.

#### 13. No notification sound or haptic feedback
- **Files:** `apps/admissions/src/components/student/NotificationBell.tsx` lines 24–38 (browser Notification API used, but no audio)
- **Issue:** When new notifications arrive, the bell icon bounces and a browser notification fires (if permission was previously granted). But there's no audio cue or haptic feedback. The browser notification only fires if `Notification.permission === 'granted'` — the app never requests permission proactively (which is correct), but this means most users will never see browser notifications.
- **Impact:** Students who aren't actively looking at the bell icon will miss new notifications. The bounce animation is subtle and lasts only 1.5 seconds.
- **Recommendation:** Low priority. Consider adding an optional notification sound (with user preference toggle) for critical notifications like interview reminders or approval decisions.

#### 14. NotificationSettings page has no pagination for the inbox list
- **File:** `apps/admissions/src/pages/student/NotificationSettings.tsx` lines 250–310 (renders all notifications in a flat list)
- **Issue:** The NotificationSettings page renders every notification returned by `useNotificationPolling()` in a single scrollable list with no pagination, virtualization, or "load more" pattern.
- **Impact:** For students with many notifications, this page becomes slow to render and scroll. Combined with finding #9 (all notifications fetched), this is a compounding performance issue.
- **Fix:** Add pagination or virtual scrolling. The backend already supports `?page=1&pageSize=20`.

---

## Architecture Assessment

### What Works Well

| Area | Assessment |
|------|-----------|
| **Outbox pattern** | `outbox.py` persists intent (EmailQueue/Notification rows) before attempting delivery. If Celery broker is down, the `process_pending_emails_task` sweep picks up orphaned rows. This is production-grade. |
| **Dual email provider** | SMTP (Zoho) → Resend fallback with exponential backoff (60s/120s/240s). Claim-based deduplication prevents double-sends. Solid. |
| **Optimistic mutations** | `useNotificationPolling.ts` uses React Query optimistic updates with rollback on error for markRead, markAllRead, and delete. Instant UI feedback. |
| **Polling backoff** | Tab-hidden detection pauses polling after 5 minutes. Error backoff uses exponential delay capped at 5 minutes. 429 responses stop retries immediately. Battery-friendly. |
| **Idempotent notification creation** | `Notification.idempotency_key` with unique constraint prevents duplicate notifications from retried tasks. |
| **Toast deduplication** | 3-second dedup window prevents toast spam from rapid state changes. Escape key dismisses all toasts. Separate `aria-live` regions for assertive (error/warning) and polite (success/info). |
| **Input sanitization** | `sanitizeText()` applied to notification title and content before rendering. `isSafeNavigationUrl()` validates action URLs before navigation. |
| **Focus trap** | Notification panel uses `useFocusTrap` and `useEscapeKey` for keyboard accessibility. |
| **Email template** | `get_base_email_html()` produces a polished, responsive email shell with proper XHTML, MSO compatibility, and mobile breakpoints. |

### What Needs Work

| Area | Assessment |
|------|-----------|
| **Template system fragmentation** | Two separate template systems (frontend hardcoded, backend DB-driven) that don't communicate. |
| **SMS channel** | UI exists, preference stored, but zero delivery infrastructure. |
| **No real-time push** | Polling-only. No WebSocket, SSE, or push notification infrastructure. Acceptable for current scale but will need addressing as user base grows. |
| **No notification grouping** | Multiple notifications about the same application appear as separate items. No "3 updates about Application #APP-20260420-ABCD1234" grouping. |
| **No notification expiry** | Notifications accumulate forever. No TTL, no auto-archive, no cleanup task. The `cleanup_audit_logs_task` handles audit logs but nothing handles old notifications. |
| **Admin notification UX** | Admins have two separate modals (`CommunicationModal` and `SendNotificationModal`) with different capabilities and no shared infrastructure. |

---

## File Reference Index

| File | Lines | Role |
|------|-------|------|
| `backend/apps/common/models.py` | 88–115 | `Notification` model, `UserNotificationPreference` model |
| `backend/apps/common/models.py` | 117–148 | `EmailQueue` model |
| `backend/apps/common/models.py` | 195–210 | `CommunicationTemplate` model |
| `backend/apps/common/outbox.py` | 47–90 | `create_notification()`, `queue_email()` |
| `backend/apps/common/notification_views.py` | 131–200 | Preference CRUD |
| `backend/apps/common/notification_views.py` | 206–270 | Admin send notification |
| `backend/apps/common/notification_views.py` | 349–420 | List notifications (student) |
| `backend/apps/common/notification_views.py` | 459–490 | Mark single read |
| `backend/apps/common/notification_views.py` | 509–535 | Mark all read (**BUG: no read_at**) |
| `backend/apps/common/communication_service.py` | 1–140 | Template rendering + dispatch |
| `backend/apps/common/email_templates.py` | 1–130 | Base email HTML wrapper |
| `backend/apps/common/tasks.py` | 1–100 | Email delivery task with SMTP/Resend fallback |
| `backend/apps/common/tasks.py` | 130–200 | Bulk notification task |
| `apps/admissions/src/hooks/useNotificationPolling.ts` | 1–190 | Polling hook with visibility backoff |
| `apps/admissions/src/services/notifications.ts` | 1–200 | API service + normalization |
| `apps/admissions/src/types/notifications.ts` | 1–70 | TypeScript types |
| `apps/admissions/src/components/student/NotificationBell.tsx` | 1–160 | Bell + panel UI |
| `apps/admissions/src/components/student/NotificationItem.tsx` | 1–100 | Individual notification row |
| `apps/admissions/src/components/ui/Toast.tsx` | 1–250 | Toast store + container |
| `apps/admissions/src/components/admin/CommunicationModal.tsx` | 1–230 | Admin multi-channel message modal |
| `apps/admissions/src/components/admin/applications/SendNotificationModal.tsx` | 1–90 | Simple admin notification modal |
| `apps/admissions/src/pages/student/NotificationSettings.tsx` | 1–320 | Full notification settings + inbox page |
| `apps/admissions/src/pages/student/Dashboard.tsx` | 1–400 | Dashboard (uses polling, toasts) |
| `apps/admissions/src/components/student/DashboardStatusOverview.tsx` | 1–250 | Status cards with sr-only live region |

---

## Recommended Fix Order

1. **P0-1:** Fix `markAllRead` to set `read_at` — 1-line backend fix, immediate data integrity win
2. **P0-3:** Hide or disable SMS channel UI until a provider is integrated — prevents broken promises
3. **P1-6:** Replace `window.location.href` with React Router `navigate()` — major mobile UX improvement
4. **P1-4:** Fetch templates from backend in CommunicationModal — unifies template management
5. **P1-7:** Make delete button visible on touch devices — mobile accessibility fix
6. **P2-9:** Add pagination to notification polling — bandwidth savings on mobile
7. **P1-5:** Make `onSend` required or add default implementation — prevents silent message loss
8. **P1-8:** Fix toast/panel z-index overlap — minor but confusing
9. **P0-2:** Align field naming (`read` vs `is_read`) — reduces fragility
10. **P3-11:** Consolidate notification creation through CommunicationService — long-term maintainability
11. **P3-14:** Add pagination to NotificationSettings inbox — performance at scale
12. **P3-12:** Add backend `max_length` to notification message serializer — defense in depth
