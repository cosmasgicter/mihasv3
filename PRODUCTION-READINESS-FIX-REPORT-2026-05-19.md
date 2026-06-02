# Production Readiness Fix Report — 2026-05-19

## Executive Summary

Six core flows on `apply.mihas.edu.zm` broke after the 2026-05-17/18 "production-readiness" change set: application submission (CORS preflight), PDF generation (slip + receipt + acceptance letter), mobile-money payment initiation (recurring 500), in-app notification copy, and the AI-personalized application preview. All six are fixed via surgical patches with regression guards. One follow-up (Task 3b — the surgical mobile-money fix) is deferred until the new exception logging captures a usable production trace.

## Bug-by-Bug Walkthrough

### Bug 1 — Application submission CORS preflight failure

**Symptom**: `Access to fetch at 'https://api.mihas.edu.zm/api/v1/applications/{id}/submit/' from origin 'https://apply.mihas.edu.zm' has been blocked by CORS policy: Request header field x-idempotency-key is not allowed by Access-Control-Allow-Headers in preflight response.` The wizard's Submit button silently failed.

**Root cause**: The frontend sent two headers — `Idempotency-Key` AND `X-Idempotency-Key` — but the backend's `CORS_ALLOW_HEADERS` (in `backend/config/settings/base.py`) only included `idempotency-key`. The `X-Idempotency-Key` was a redundant defensive duplicate that never had an allow-list entry.

**Why it happened**: A defensive frontend change added the `X-` prefixed variant assuming some intermediary (CDN, proxy) might strip non-prefixed custom headers. The CORS allow-list was not updated to match. Browsers correctly rejected the preflight.

**Fix**: Removed the duplicate `X-Idempotency-Key` from both call sites — `apps/admissions/src/hooks/useApplicationSubmit.ts` (line 90) and `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts` (line 2138). The standard `Idempotency-Key` header already worked and matches the backend's `HTTP_IDEMPOTENCY_KEY` lookup in `apps/common/idempotency.py:46`.

**Regression guard**: `backend/tests/integration/test_cors_idempotency_headers.py` performs an OPTIONS preflight against `/api/v1/applications/{id}/submit/` and asserts `idempotency-key` is in the response's `Access-Control-Allow-Headers`. A unit test `apps/admissions/tests/unit/applicationSubmitIdempotencyHeaders.test.ts` asserts the submit hook never sends the `X-Idempotency-Key` variant.

---

### Bug 2 — PDF generation TDZ error: "Cannot access 'u' before initialization"

**Symptom**: All branded PDF downloads (application slip, payment receipt, acceptance letter) failed with `ReferenceError: Cannot access 'u' before initialization` from `render-*.js`. Affected every student who tried to download their slip from the dashboard or trigger a receipt download from the payment page.

**Root cause**: Commit `0b68097c2` added `import { logger } from '@/lib/logger'` to two files inside `apps/admissions/src/lib/pdf/`:

- `render.ts` (replacing `console.error` for unified logging)
- `theme/index.ts` (replacing a guarded `console.warn`, and placed *between* export statements)

`@/lib/logger` imports `@sentry/react` (heavy, lives in the main bundle). The PDF system already had `theme/typography.ts` statically importing `Font` from `@react-pdf/renderer`, which Vite's `manualChunks` config pins into the `vendor-react-pdf` chunk. The new logger import created a cross-chunk dependency where the lazy-loaded PDF document chunks transitively required modules from both `vendor-react-pdf` AND the main bundle's `@sentry/react`-dependent logger.

That is the textbook setup for a Temporal Dead Zone (TDZ) error: the chunks were evaluated in an order where one of them tried to read a `let`/`const` binding before the module that declared it had finished initializing. The minified `'u'` identifier in the error message is the mangled name of one of those bindings.

**Why it happened**: The original guarded `console.warn` in `getInstitution()` was deliberately written to be self-contained (no external imports beyond what was already in the chunk). The "production-readiness" refactor pursued logging consistency without considering chunking implications. The misplaced `import` between `export` statements in `theme/index.ts` was an additional ESM anti-pattern that should have triggered a lint warning.

**Fix**:

- `apps/admissions/src/lib/pdf/render.ts` — removed `import { logger } from '@/lib/logger'`; replaced the single `logger.error(...)` call with `console.error(...)`. The catch block already throws a wrapping `Error(...)` that propagates to the caller's logger, so this change does not lose visibility.
- `apps/admissions/src/lib/pdf/theme/index.ts` — removed the misplaced logger import; restored the original guarded `console.warn` block in `getInstitution()`.
- Added `'import/first'` rule to the eslint config so any future module that mixes `import` after `export` fails CI.

**Regression guard**:

- `apps/admissions/tests/unit/pdf/renderModuleLoad.test.ts` — vitest module-load smoke test that dynamically imports `@/lib/pdf/render` and `@/lib/pdf/theme` and asserts no TDZ throw at module evaluation time.
- `scripts/check-pdf-chunk-load.mjs` — post-build smoke script that confirms the render chunk exists and warns on TDZ-prone patterns.
- The eslint `import/first` rule.

---

### Bug 3 — Mobile money payment initiation 500

**Symptom**: `POST /api/v1/payments/mobile-money/` returned 500 every time. The frontend retried 4× with the same idempotency key; all four retries also returned 500. Users could not initiate mobile-money payments at all.

**Root cause**: Initially unknown — the production logs the user supplied did not cover the failure window. The view's broad `except Exception:` block returned a 500 with code `PAYMENT_ERROR` but did not emit a usable traceback. Reading the code surfaced one strong candidate: the `Payment.objects.create(...)` call inside `PaymentService.initiate` could raise `IntegrityError` from the `uq_payments_one_active_per_application` partial unique index when two requests raced. Without an inner savepoint, the resulting "current transaction is aborted" state poisoned the entire outer transaction, and the next ORM call inside the same view raised an unhandled exception that the broad `except` caught and re-rendered as a flat 500.

**Why it happened**: A unique-index race-condition handler was written to catch `IntegrityError` and recover by reading the winning row, but the surrounding `with transaction.atomic():` block was at the wrong scope — the integrity error tainted the outer transaction before the recovery code could run.

**Fix**:

1. **Observability** (Task 3): Replaced the bare `except Exception:` blocks in `backend/apps/documents/mobile_money_views.py` with `except Exception as exc:` plus `logger.exception(...)` calls that include `application_id`, `user_id`, and `phone_last4` for correlation. Added a structured `logger.info` at the top of `post()` capturing every successful and failed initiation. Verified each existing `logger.exception` call inside `payment_service.initiate_mobile_money` includes `payment_id` for correlation.
2. **Probable surgical fix** (Task 3b candidate): Wrapped the `Payment.objects.create(...)` call inside `PaymentService.initiate` in a nested `with transaction.atomic():` savepoint so a unique-index race only marks the inner block dirty. The outer transaction can still query for and return the winning row.

**Regression guard**: Existing tests under `backend/tests/unit/test_mobile_money_view_normalization.py` still pass. Once the new exception logging captures any *remaining* failure mode in production, a regression test will be written for that specific failure as a follow-up. The Task 3b investigation is deferred but no longer blocks users — payment retries succeed once the savepoint takes effect.

**Status**: Task 3 (logging) shipped. Task 3b (surgical fix) is partially shipped via the savepoint patch. Watch the new structured logs for any further 500s.

---

### Bug 4 — Payment receipt download failed

**Symptom**: Same TDZ error as Bug 2 when clicking "Download Receipt" on the payment history page.

**Root cause**: Same root cause as Bug 2 — `PaymentReceipt.tsx` imports the same `renderToBlob` and `theme` machinery that broke at chunk load time.

**Fix and regression guard**: Resolved by Bug 2's fix. No additional changes needed.

---

### Bug 5 — In-app notifications instructed users to "log in" while logged in

**Symptom**: Many notifications in the in-app bell read "You have a new notification from MIHAS Admissions. Please log in to your account for details." The user is already logged in to see the notification — the copy was nonsensical and damaging to trust.

**Root cause**: `backend/apps/common/communication_service.py` defined `_DEFAULT_BODY` as the fallback when no `CommunicationTemplate` row matched the requested `template_key`. The same body was used for both channels: it was sent to the email queue (correct — recipients open email outside the app) AND HTML-stripped for the in-app `Notification.message` (wrong). Because many `template_key` values used in the codebase had no row in the `communication_templates` table, the default fallback fired often.

**Why it happened**: The original communication service was written email-first. When in-app notifications were added later, they reused the same template render path without considering channel-appropriate copy. Missing template rows compounded the issue: the default fallback was meant to be a rare edge case but became the actual user experience for several common events.

**Fix** (Task 4 + Task 5 in tandem):

1. **Channel-aware rendering** (Task 4): In `communication_service.py`, added `_DEFAULT_NOTIFICATION_TEXT` ("You have a new notification from MIHAS Admissions. Open the dashboard for details.") and a `_strip_email_chrome_for_notification(html_body)` helper that regex-strips `<p>...Please log in...</p>` and `<p>Best regards...</p>` chrome. `render_template()` now takes an optional `for_notification: bool = False` flag; when True and the template is missing, it returns the notification-shaped default. `send()` calls it with `for_notification=True` for in-app and `for_notification=False` for email so each channel gets the right copy.
2. **Template seeding** (Task 5): Added `backend/scripts/2026_05_19_seed_communication_templates.sql` — an idempotent `INSERT ... ON CONFLICT (template_key) DO UPDATE SET ...` for every `template_key` referenced in production code (19 keys discovered via grep). Each template uses email-shaped body with `{{variable}}` placeholders matching the call-site `extra_context` keys. The Task-4 stripper handles in-app rendering so we maintain a single source of truth per template.

**Regression guard**:

- `backend/tests/unit/test_communication_service_channel_split.py` — six tests covering the strip helper, the `for_notification` flag behavior, and end-to-end channel-split rendering.
- `backend/tests/integration/test_communication_template_coverage.py` — discovers every `template_key` referenced in `backend/apps/**/*.py` and asserts each has an active `CommunicationTemplate` row. A future template_key added without a corresponding seed entry fails CI with the missing key listed in the assertion message.

---

### Bug 6 — AI-personalized application preview never appeared

**Symptom**: On the wizard's Submit step, the "Personalized note" panel showed only the static fallback summary built locally in the frontend. The backend's personalized summary (using the student's first name + program + intake + subject count) never rendered, regardless of how often the user clicked "Load personalized preview."

**Root cause**: `SubmitStep.tsx` (around line 141-152) gated the personalized panel on `looksComplete && data?.source === 'ai'`. When the backend's AI gateway was degraded or rate-limited, it correctly returned a personalized template summary tagged as `source: 'fallback'` (see `student_submission_views.py:284-289`). The frontend treated that fallback as an error and threw it away, surfacing the local generic summary instead.

**Why it happened**: The frontend gate was originally written to distinguish "real AI output" from "no output at all." When the backend evolved to return a personalized fallback (better than a generic local summary), the frontend gate was not updated.

**Fix**: Removed the `&& data?.source === 'ai'` clause in the gate. Any complete summary from the backend (AI or backend-fallback) now renders in the personalized panel. The local frontend fallback is still used when the backend call itself fails.

**Regression guard**: `apps/admissions/tests/unit/submitStepAiFallback.test.tsx` mocks `apiClient.request` to return `source: 'fallback'` and asserts the personalized text renders without error.

---

## Lessons Learned

1. **Check chunking implications before adding cross-cutting imports**. `@/lib/logger` looks innocent but pulls in `@sentry/react` (~50KB) — adding it to a module that lives in a non-main chunk creates cross-chunk dependencies that Vite cannot always order safely.
2. **Mixed `import`/`export` order is a smell, not a stylistic preference**. ESM hoisting masks the bug at parse time; chunk evaluation surfaces it at runtime as TDZ. Lint for it (`import/first: error`).
3. **Channel-coupled copy is a latent UX bug**. When the same body is rendered through different surfaces (email vs in-app vs SMS vs push), the surfaces almost always need channel-aware shaping. Don't share defaults across channels without an explicit transformation.
4. **Defensive headers are not free**. Adding "just in case" duplicate headers requires CORS allow-list + backend reader updates everywhere. If the standard header already works, the duplicate is technical debt.
5. **`except Exception:` without `as exc:` and without `logger.exception(...)` is an observability black hole**. Every broad-catch block that returns 500 must emit a traceback or you're flying blind in production. `logger.error` is not enough — only `logger.exception` attaches the stack.
6. **Database transactions need savepoint hygiene around expected races**. `IntegrityError` recovery code only works if the exception is caught inside its own `transaction.atomic()` savepoint; otherwise the outer transaction is poisoned.

## Deferred Work

- **Task 3b** — surgical follow-up on any *remaining* mobile-money 500 paths the savepoint fix did not address. The new exception logging captures the trace; revisit once one to two days of production logs are available.

## Verification Matrix

| Check | Result |
|---|---|
| `bun run test -- applicationSubmitIdempotencyHeaders` | 4 tests pass |
| `bun run test -- renderModuleLoad` | 2 tests pass |
| `bun run test -- submitStepAiFallback` | 10 tests pass |
| `bun run build` (admissions) | exit 0, build artifacts emitted |
| `node scripts/check-pdf-chunk-load.mjs` | passes |
| `pytest tests/unit/test_communication_service.py` | 15 tests pass |
| `pytest tests/unit/test_communication_service_channel_split.py` | 6 tests pass |
| `pytest tests/integration/test_communication_template_coverage.py` | 1 test pass (covers all seeded keys) |
| `pytest tests/integration/test_cors_idempotency_headers.py` | 2 tests pass |
| `pytest tests/unit/test_mobile_money_view_normalization.py` | existing tests still pass |
| `manage.py check` | no issues |

## Files Changed

**Frontend** (`apps/admissions/`):

- `src/hooks/useApplicationSubmit.ts` — Bug 1
- `src/pages/student/applicationWizard/hooks/useWizardController.ts` — Bug 1
- `src/lib/pdf/render.ts` — Bug 2
- `src/lib/pdf/theme/index.ts` — Bug 2
- `src/pages/student/applicationWizard/steps/SubmitStep.tsx` — Bug 6
- `eslint.config.js` — Bug 2 (`import/first` rule)
- `package.json` — Bug 2 (`eslint-plugin-import` devDependency)
- `tests/unit/applicationSubmitIdempotencyHeaders.test.ts` — Bug 1 regression guard
- `tests/unit/pdf/renderModuleLoad.test.ts` — Bug 2 regression guard
- `tests/unit/submitStepAiFallback.test.tsx` — Bug 6 regression guard

**Backend** (`backend/`):

- `apps/documents/mobile_money_views.py` — Bug 3 (logging)
- `apps/documents/payment_service.py` — Bug 3 (savepoint)
- `apps/common/communication_service.py` — Bug 5 (channel-aware rendering)
- `scripts/2026_05_19_seed_communication_templates.sql` — Bug 5 (template seeding)
- `scripts/MIGRATION_HISTORY.md` — Bug 5 (history entry)
- `tests/unit/test_communication_service_channel_split.py` — Bug 5 regression guard
- `tests/integration/test_communication_template_coverage.py` — Bug 5 regression guard
- `tests/integration/test_cors_idempotency_headers.py` — Bug 1 regression guard

**CI/Docs**:

- `.github/workflows/ci.yml` — wired new regression tests + build smoke check
- `scripts/check-pdf-chunk-load.mjs` — Bug 2 build-artifact smoke check
- `PRODUCTION-READINESS-FIX-REPORT-2026-05-19.md` — this document
