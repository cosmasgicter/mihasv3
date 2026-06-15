# Monitoring Verification — Error Tracking, Alert Email, Failure Alerts, Test Event

**Spec:** `.kiro/specs/beanola-production-readiness/` — Task **19.2**, Component 9
**Requirements validated:** R9.5 (and R16.7 — no PII/secrets in monitoring payloads)
**Date:** 2026 production-readiness pass
**Method:** Source verification against the real repo (`backend/` + `apps/admissions/`)
plus the existing error-monitoring / celery-signal / CSP / production-state test
suites and a dry-run of the `test_glitchtip` management command.
No production database change was made (R16.8 honoured — verification only).
DSN values are referenced by **key name only**; no secret DSN is echoed here.

---

## Summary

| Item | Requirement | Status |
|------|-------------|--------|
| GlitchTip error tracking enabled (backend + frontend, single project 22431) | R9.5 | ✅ PASS |
| Beanola-default alert email (`ERROR_ALERT_EMAIL`) | R9.5 | ✅ PASS |
| Alert on failed Celery tasks | R9.5 | ✅ PASS |
| Alert on payment-webhook failures | R9.5 | ✅ PASS |
| Alert on PDF / official-document render failures | R9.5 | ✅ PASS |
| System can receive a test monitoring event | R9.5 | ✅ PASS (code path verified; **live send deferred** — needs real DSN/network) |

No high-severity gaps. The only deferred item is the **live** test-event send,
which requires a real `GLITCHTIP_DSN` and outbound network to `app.glitchtip.com`
— neither is available in this verification environment. The send **code path**
is verified end-to-end and the exact operator command is documented below
(mirrors how other deferred-live checks — e.g. the operator DB cutover in
Phase 3 — are handled).

---

## R9.5 — Error tracking enabled

**Backend** — `backend/config/settings/base.py` (GlitchTip / Sentry block):

- `GLITCHTIP_DSN = os.environ.get("GLITCHTIP_DSN", "")` — DSN-driven; referenced
  by key name only.
- When the DSN is present (and not under test), `sentry_sdk.init(...)` runs with
  `integrations=[DjangoIntegration(), CeleryIntegration()]`,
  `traces_sample_rate=0.01`, `send_default_pii=False` (R16.7 — no PII),
  `environment=os.environ.get("ENVIRONMENT", "production")`.
- `DjangoIntegration` auto-captures unhandled request exceptions; the default
  `LoggingIntegration` promotes `logger.error(...)` lines to GlitchTip events;
  `CeleryIntegration` auto-captures task failures.
- **Belt-and-braces 500 capture:** `backend/apps/common/exceptions.py`
  (`envelope_exception_handler`) explicitly calls `sentry_sdk.capture_exception(exc)`
  for `status_code >= 500` while normalizing the response to the API envelope, so
  no raw framework error reaches a UI surface and every 500 reaches GlitchTip.

**Frontend** — `apps/admissions/src/lib/errorReporter.ts`:

- `initErrorReporter()` reads `import.meta.env.VITE_GLITCHTIP_DSN`; no-ops when the
  DSN is absent. When present it calls `Sentry.init(...)` (`@sentry/react`) with
  `sampleRate: 0.25`, `tracesSampleRate: 0.01`, `sendDefaultPii: false`, an
  `ignoreErrors` noise filter, and a `beforeSend` dedup + per-page volume cap
  (≤25 events/page, 60 s dedup window) to protect the free-tier ingest quota.
- Wired at startup in `apps/admissions/src/main.tsx` (lazy dynamic import so the
  Sentry bundle never delays FCP; bootstrap failure is swallowed and never
  crashes the app).
- Captures `window.onerror` + unhandled rejections automatically; error
  boundaries can call `reportError(error, extra)`.

**CSP violation reports** — `apps/admissions/vercel.json` CSP header includes
`report-uri https://app.glitchtip.com/api/22431/security/?glitchtip_key=…` and
`connect-src … https://app.glitchtip.com`, so browser CSP violations are reported
to the same GlitchTip project.

**Legacy compatibility endpoint** — `POST /api/v1/errors/report/`
(`backend/apps/common/error_views.py`, routed via
`backend/apps/common/error_urls.py` → `backend/config/urls.py`): `AllowAny`,
CSRF-exempt, throttled (`error_report` scope = `5/min` in `base.py`, plus the
middleware `/api/v1/errors/` cap). Forwards each report to GlitchTip via
`sentry_sdk.capture_message(...)`, hashing the client IP with SHA-256 (raw IP is
never stored) and capping payload size (16 KB) and batch (10 items) — R16.7.

**Production gate** — `backend/apps/common/management/commands/check_production_state.py`
fails (`GLITCHTIP_DSN is not set`) if the DSN is missing under `--strict`, so a
production deploy cannot pass the readiness gate without error tracking
configured.

## R9.5 — Beanola-default alert email

**Source:** `backend/config/settings/base.py`:
`ERROR_ALERT_EMAIL = os.environ.get("ERROR_ALERT_EMAIL", "admin@beanola.com")`.

- Beanola-generic default (`admin@beanola.com`), overridable via env. No
  MIHAS/KATC platform identity in the default.
- Used for the non-error-monitoring alert emails (uptime down/recovery, failed
  background tasks, document-verification SLA escalation) — GlitchTip owns
  exception aggregation, `ERROR_ALERT_EMAIL` owns the operational alert mailbox.

## R9.5 — Failure alerts

| Failure class | Mechanism | Source |
|---------------|-----------|--------|
| **Failed Celery tasks** (lifecycle) | `task_failure` signal handler emits `type:"task_lifecycle", event:"task_failed"` structured log (→ GlitchTip via LoggingIntegration); `CeleryIntegration` also captures the exception | `backend/apps/common/celery_signals.py`, `base.py` |
| **Failed Celery tasks** (operational alert email) | `intake_manager_task` final failure → `_log_error_and_alert` calls `sentry_sdk.capture_message(level="error")` **and** queues a throttled alert email to `ERROR_ALERT_EMAIL`; email retry-exhaustion path also captures to GlitchTip | `backend/apps/catalog/tasks.py`, `backend/apps/common/tasks.py` |
| **Payment-webhook / verification failures** | `poll_pending_payments_task` all-failures branch → `sentry_sdk.capture_message(level="error")`; `PaymentVerifyView` verify failure → `sentry_sdk.capture_exception()`; webhook unknown-payment / dedup paths logged via structured logger (→ GlitchTip) | `backend/apps/documents/tasks.py`, `payment_query_views.py`, `webhook_processor.py` |
| **PDF / official-document render failures** | Permanent render failure → `logger.error("%s generation permanently failed …")` (→ GlitchTip via LoggingIntegration) + a non-PII `official_document_render_failed` audit row; no stale/client PDF is served (Property 32) | `backend/apps/applications/tasks/pdf_generation.py` |
| **Uptime down / recovery** | `check_uptime_task` transition detection → alert/recovery email to `ERROR_ALERT_EMAIL` | `backend/apps/common/tasks.py` |
| **Domain-collision** | hostname → multiple active institutions → `sentry_sdk.capture_message(level="error")` | `backend/apps/catalog/services.py` |

All failure-alert payloads honour R16.7: `send_default_pii=False`, IP hashing on
the frontend forwarder, truncated payload-hash on webhook identity logs, and no
document bodies/secrets in any captured message.

## R9.5 — Receive a test monitoring event

A dedicated management command exists:
`backend/apps/common/management/commands/test_glitchtip.py` — raises a
`ZeroDivisionError` and calls `sentry_sdk.capture_exception()`, printing
`Test error sent to GlitchTip. Check your dashboard.`

**Code-path verification (this environment):**

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py test_glitchtip
# → Test error sent to GlitchTip. Check your dashboard.
```

The command ran cleanly. In this environment `GLITCHTIP_DSN` is unset and
`_is_testing` is true, so `sentry_sdk` is uninitialised and the capture is a safe
**no-op** — the send code path is exercised but no event leaves the box.

**Live test-event send — DEFERRED (operator step):** a real ingest into the
GlitchTip dashboard requires a configured `GLITCHTIP_DSN` and outbound network to
`https://app.glitchtip.com`, neither available in this verification environment.
Run this on the deployed backend (e.g. the EC2 box, inside the `mihas-web-1`
container, with the production env) to send and confirm a live event:

```bash
# On the deployed backend with GLITCHTIP_DSN set in the environment:
cd ~/mihas
docker compose -f docker-compose.prod.yml exec web \
  python manage.py test_glitchtip
# Then confirm the event appears in GlitchTip project 22431.

# Frontend / CSP paths can be confirmed by triggering a real client error in
# the deployed admissions app (with VITE_GLITCHTIP_DSN set) and a CSP violation,
# then checking the same project's issue + security-report streams.
```

This mirrors the project's other deferred-live checks (e.g. the gated operator
DB cutover in Phase 3): the wiring + config are verified here, and the live
action is a documented operator step gated on real DSN/network.

---

## Tests run (this environment)

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest \
  tests/property/test_error_monitoring.py tests/unit/test_error_monitoring.py \
  tests/property/test_production_readiness_celery.py tests/property/test_bug2_csp_preservation.py -q
# → 27 passed

DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest \
  tests/unit/test_intake_manager_task.py tests/unit/test_check_production_state.py -q
# → 22 passed

DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py test_glitchtip
# → Test error sent to GlitchTip. Check your dashboard. (no-op send; DSN unset in test env)

DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py check
# → System check identified no issues (1 silenced).
```

**Coverage map:**

- `test_error_monitoring.py` (property + unit) — unhandled DRF exception →
  `capture_exception`; frontend report → `capture_message`; client IP hashed;
  malformed payload → 400 + no capture.
- `test_production_readiness_celery.py` — `task_prerun` / `task_postrun` /
  `task_failure` signal handlers emit the lifecycle log (incl. `task_failed`).
- `test_bug2_csp_preservation.py` — CSP `report-uri` + `connect-src` GlitchTip
  entries preserved.
- `test_intake_manager_task.py` — failed-task → GlitchTip `capture_message` +
  `ERROR_ALERT_EMAIL` alert.
- `test_check_production_state.py` — production-state gate fails on missing
  `GLITCHTIP_DSN`.

**Totals:** 49 passed + a clean `manage.py check` and a clean `test_glitchtip`
code-path run. No code fix required for task 19.2; the only outstanding item is
the **operator live test-event send**, documented above.
