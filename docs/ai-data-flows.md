# AI Data Flows

Everything that leaves the platform and reaches the Vercel AI Gateway
(or any other AI provider), what it contains, how long it can live
outside our infrastructure, and the protective layers we wrap around
it.

## Scope

This document covers the four AI-touching code paths in
`backend/apps/common/ai_service.py`:

1. `extract_text_from_image` — vision OCR on uploaded result slips
   and identity documents.
2. `analyze_document` — structured extraction from OCR text (grades,
   exam number, year).
3. `generate_admin_review_summary` — admin-facing review brief.
4. `generate_student_preview_summary` — student-facing encouraging
   summary on the wizard review step.

`summarize_application` also exists but is currently unreferenced by
any view or task; it inherits the same protections because it shares
the Vercel AI Gateway backend.

## Gateway and models

| Setting | Default | Used by |
|---------|---------|---------|
| `AI_GATEWAY_API_KEY` | (env) | OpenAI-compatible client |
| `AI_GATEWAY_BASE_URL` | `https://ai-gateway.vercel.sh/v1` | OpenAI-compatible client |
| `AI_MODEL_VISION` | `google/gemini-2.5-flash` | `extract_text_from_image` |
| `AI_MODEL_FAST` | `google/gemini-2.5-flash` | `generate_student_preview_summary`, `summarize_application` |
| `AI_MODEL_ANALYSIS` | `openai/gpt-4o-mini` | `analyze_document`, `generate_admin_review_summary` |
| `AI_MODEL_SMART` | `deepseek-v3` | (configured, not currently invoked) |

The OpenAI Python SDK is pointed at the Vercel AI Gateway base URL;
from the platform's perspective there is only one outbound HTTP
destination for AI traffic.

## Call-by-call data map

### 1. `extract_text_from_image` — vision OCR

| Field | Value |
|-------|-------|
| Caller | `apps.documents.tasks.extract_document_text_task` (Celery) |
| Model | `AI_MODEL_VISION` (Gemini 2.5 Flash) |
| Outbound payload | Raw document bytes (JPEG/PNG/PDF first page), base64-encoded, plus a fixed instruction prompt |
| Outbound PII | High: slip images by construction contain candidate full name, exam number, DOB, school name, signature |
| Response | Extracted text (≤ 2000 tokens) |
| Stored as | `application_documents.extracted_text` (TEXT) |
| Retention | Persisted to the Neon database indefinitely (subject to the 365-day security retention policy) |

**Protections applied:**

- Circuit breaker (`ai.vision`).
- No per-user rate limit on the initial upload (the upload itself is
  rate-limited by Celery concurrency), but force re-extraction is
  capped at 5 per hour per user (`ai_document_extract` scope).
- Non-redactable: the whole value proposition of OCR is reading the
  document. The mitigations are prevention of *accidental* retries
  and graceful degradation (Tesseract fallback, `ocr_skipped`
  status).

### 2. `analyze_document` — structured OCR extraction

| Field | Value |
|-------|-------|
| Caller | `apps.documents.tasks.extract_document_text_task` (Celery), called on the OCR text output |
| Model | `AI_MODEL_ANALYSIS` (gpt-4o-mini) |
| Outbound payload | The OCR text from step 1, wrapped in `<<<DOC>>>` delimiters with an anti-injection system instruction, plus the canonical ECZ subject whitelist |
| Outbound PII | Same content as the slip text (name, exam number, DOB if printed) |
| Response | JSON: `{subjects: [{name, grade}], exam_number, year}` |
| Stored as | `application_documents.verification_notes` (JSON), plus `ecz_exam_number` + `ecz_exam_year` columns |
| Retention | Same as step 1 |

**Protections applied:**

- Circuit breaker (`ai.analyze_document`).
- `max_tokens=800`, `temperature=0` — deterministic for the same
  input and bounded in cost.
- Post-parse schema validation (element count cap, grade coercion,
  exam-number format check) in `analyze_document` itself plus second
  layer in `documents.tasks` (only accepts 10- or 12-digit exam
  numbers; clamps year to `current - 10` … `current + 1`).
- Prompt injection: untrusted document text is wrapped in delimiters
  and the system prompt explicitly instructs the model to treat the
  block as data.

### 3. `generate_admin_review_summary` — admin review brief

| Field | Value |
|-------|-------|
| Caller | `ApplicationAdminSummaryView.get` (`GET /api/v1/applications/{id}/admin-summary/`) |
| Model | `AI_MODEL_ANALYSIS` (gpt-4o-mini) |
| Outbound payload (flag off) | full_name, program, institution, intake, NRC **or** passport number, nationality, sex, date_of_birth, payment_status, documents_summary, grades_summary |
| Outbound payload (flag on, `AI_HARDENING_REDACTION=true`) | program, institution, intake, age_bracket, identity_status (`on_file`/`not_provided`), nationality, sex, payment_status, documents_summary, grades_summary |
| Outbound PII (flag on) | Low — no direct identifier, only reasoning signals |
| Response | 3-4 sentence plain text |
| Stored as | Not stored; cached in Redis for 24 h (Phase 1.3) |
| Retention | Prompt retention depends on Vercel AI Gateway policy (see below) |

**Protections applied:**

- Circuit breaker (`ai.admin_review`).
- Per-admin rate throttle (`ai_admin_summary`, 60/hour).
- 24-hour Redis cache keyed by `(application_id, updated_at, payment_status, status)`.
- Super-admin bypass via `?refresh=1` query param — audit-logged.
- PII redaction via `redact_for_admin_summary` (Phase 2) — strips
  full_name, NRC, passport, DOB, contact details; adds age_bracket
  + identity_status.

### 4. `generate_student_preview_summary` — student review personalisation

| Field | Value |
|-------|-------|
| Caller | `ApplicationPreviewSummaryView.get` (`GET /api/v1/applications/{id}/preview-summary/`) |
| Model | `AI_MODEL_FAST` (Gemini 2.5 Flash) |
| Outbound payload (flag off) | full_name, program, institution, intake, grades_summary, subjects_count |
| Outbound payload (flag on) | first_name (derived), program, institution, intake, grades_summary, subjects_count |
| Outbound PII (flag on) | Low — first name only; no direct identifier |
| Response | 2-3 sentence encouraging prose, temperature 0.7 |
| Stored as | Not stored; cached in Redis for 24 h keyed by grades fingerprint |
| Retention | Prompt retention depends on Vercel AI Gateway policy |

**Protections applied:**

- Circuit breaker (`ai.student_preview`).
- Per-student rate throttle (`ai_student_preview`, 10/hour).
- 24-hour Redis cache keyed by `(application_id, updated_at, grades_fingerprint, intake)`.
- PII redaction via `redact_for_student_preview` (Phase 2).
- Existing 15-second client-side timeout + deterministic template
  fallback on AI failure.

## Feature flags

All four AI-hardening behaviours are independently toggleable so each
can be enabled and measured in isolation, and any phase can be rolled
back with a flag flip (no schema changes across Phases 1–3).

| Flag | Default | Scope | Disabling reverts to |
|------|---------|-------|----------------------|
| `AI_HARDENING_CIRCUIT_BREAKER` | `False` | Every AI call | No protection — direct upstream call |
| `AI_HARDENING_RATE_LIMITS` | `False` | `ai_admin_summary`, `ai_student_preview`, `ai_document_extract` | No per-user throttle |
| `AI_HARDENING_CACHE` | `False` | `admin_summary`, `student_preview` | Every page view triggers a fresh call |
| `AI_HARDENING_REDACTION` | `False` | `admin_summary`, `student_preview` | Full PII sent to AI Gateway |

## Vercel AI Gateway retention

**Status: unconfirmed.** As of the time of this document, the Vercel
AI Gateway's public pricing page states prompt and completion logs
are stored for billing + abuse detection but does not publish a
retention window. **Follow-up (not in this code change):** request
written confirmation from Vercel and document the number here.

**Assume** prompts are logged until proven otherwise. The redaction
layer (Phase 2) is the pragmatic response to that assumption for the
two summary endpoints.

## What we deliberately do *not* do

- **We do not move off Vercel AI Gateway in this phase.** The gateway
  is an explicit choice and switching providers is a separate
  evaluation.
- **We do not retroactively delete prompts that were sent before
  Phase 2 shipped.** That requires a Vercel API / support ticket
  that is out of scope for the platform code.
- **We do not provide student opt-out UI for AI processing.** That is
  a future consent-flow task and is tracked separately.
- **OCR image bytes are not redacted before transmission.** The
  content is the task; the mitigations are retry limits and a
  circuit breaker.

## Reference

- Code: `backend/apps/common/ai_service.py`,
  `backend/apps/common/ai_circuit_breaker.py`,
  `backend/apps/common/ai_cache.py`,
  `backend/apps/common/ai_prompt_redactor.py`,
  `backend/apps/common/throttling.py`.
- Tests: `backend/tests/unit/test_ai_*.py`.
- Flags: `backend/config/settings/base.py` (`AI_HARDENING_*`).
- Consumers: `backend/apps/applications/admin_views.py`,
  `backend/apps/applications/student_views.py`,
  `backend/apps/documents/views.py`,
  `backend/apps/documents/tasks.py`.
