# AI Data Flows

Everything that leaves the platform and reaches a generative model: which product
sends it, what it contains, and what protects it.

> **Rewritten by admissions-v2 task 12.4 (R11.1, R11.9).** Every path this
> document previously described has been deleted. Until this rewrite it told the
> reader that the admissions runtime sent applicant **full names, NRC/passport
> numbers, dates of birth and raw result-slip images** to the Vercel AI Gateway,
> and that four `AI_HARDENING_*` flags controlled the protections. None of that is
> true any more, and a false statement in this direction is not a stale
> paragraph — it is a data-protection claim about a live system holding real
> applicant records. The dated record of what those paths used to do lives in
> `docs/audits/ai-and-ocr-final.md` and in `docs/v2-evidence/7.4/` – `7.5/`; this
> file describes the present.

## Scope: one product, four calls

**Admissions makes no generative AI call.** Task 7.4 removed the admissions AI
service, its two endpoints, its cache, circuit breaker, prompt redactor,
throttles, flags and copy (R11.1). Task 12.4 scoped the remaining SDK
declaration to jobs-ops and added the guard below. The admissions surfaces that
used to be generative are now deterministic:

| Admissions surface | What it is now |
|---|---|
| Reviewer review brief | a deterministic readiness checklist computed by the same evaluator submission re-runs (payment gate, required documents, identity, grades/eligibility, duplicate/late flags, allowed next actions) |
| Student review-step summary | composed from stored fields and current validation results; names blockers, no generated prose |
| Grade extraction from a result slip | **server-side Tesseract** + a deterministic parser. No model. Candidates resolve only through the versioned alias catalogue, carry confidence and provenance, and require explicit student confirmation; a manual entry always wins and an unrecognised label stays unresolved rather than being guessed |
| Document classification, eligibility, verification, routing, decisions | deterministic services; never a model |

The **only** generative integration on the platform is `backend/apps/jobs/ai_service.py`,
which serves the jobs-ops operator dashboard. It has four functions, all
best-effort: a failure returns `None` and never blocks a flow.

## Gateway and models

| Django setting | Env var | Default | Used by |
|---|---|---|---|
| `JOBS_OPS_AI_GATEWAY_API_KEY` | `AI_GATEWAY_API_KEY` | (env) | the OpenAI-compatible client |
| `JOBS_OPS_AI_GATEWAY_BASE_URL` | `AI_GATEWAY_BASE_URL` | `https://ai-gateway.vercel.sh/v1` | the same |
| `JOBS_OPS_AI_MODEL_FAST` | `AI_MODEL_FAST` | `google/gemini-2.5-flash` | `score_job_match`, `generate_outreach_message`, `analyze_job_posting` |
| `JOBS_OPS_AI_MODEL_SMART` | `AI_MODEL_SMART` | `deepseek/deepseek-v3` | `tailor_resume` |
| `JOBS_OPS_AI_MODEL_ANALYSIS` | `AI_MODEL_ANALYSIS` | `openai/gpt-4o-mini` | configured, not currently invoked |

The setting names are namespaced; the **env var** names are not, deliberately, so
no deployment had to be re-keyed when task 7.4 moved them out of the shared
namespace. The `openai` package is the SDK, not the destination: it is pointed at
the Vercel AI Gateway base URL, so there is one outbound HTTP destination for all
AI traffic. `openai` is declared in `backend/requirements.txt` under an explicit
**jobs-ops-only** section, and its single importer in the whole backend is
`apps/jobs/ai_service.py`.

If the key is absent, `_get_client()` returns `None` and every function below
returns `None`. An unconfigured platform makes no AI call at all.

## Call-by-call data map (jobs-ops)

Read from `apps/jobs/ai_service.py`. The truncation limits are the ones in the
source, because "what leaves" is a function of them.

### 1. `score_job_match`

| Field | Value |
|---|---|
| Model | `JOBS_OPS_AI_MODEL_FAST` |
| Outbound | job title, company, location, `description[:500]`, `requirements[:300]`; candidate skills, experience, education, location |
| Outbound PII | the **candidate's** own profile signals. No name, no contact details, no identity number |
| Response | `{"score": 0-100, "reasons": [], "missing_skills": [], "strengths": []}`, `max_tokens=400`, `temperature=0` |
| Stored as | jobs-ops match/score fields |

### 2. `tailor_resume`

| Field | Value |
|---|---|
| Model | `JOBS_OPS_AI_MODEL_SMART` |
| Outbound | job title, company, `requirements[:500]`; **`resume_text[:1000]`** |
| Outbound PII | **highest on the platform.** A résumé excerpt is by construction the candidate's name, contact details and employment history. This is the one call whose payload is a person's own document |
| Response | tailored summary, achievements, cover letter, keywords; `max_tokens=1000`, `temperature=0.3` |
| Stored as | jobs-ops document/tailoring records |

### 3. `generate_outreach_message`

| Field | Value |
|---|---|
| Model | `JOBS_OPS_AI_MODEL_FAST` |
| Outbound | contact name, company, role; free-text context |
| Outbound PII | a **third party's** name and employer — someone who is not a platform user and did not consent |
| Response | `{"subject", "body", "follow_up_days"}`, `max_tokens=400`, `temperature=0.4`; the prompt forbids fabricated claims about the sender, which is the `product.md` hard constraint stated to the model as well as enforced by human review |
| Stored as | jobs-ops outreach drafts (approval-gated before sending) |

### 4. `analyze_job_posting`

| Field | Value |
|---|---|
| Model | `JOBS_OPS_AI_MODEL_FAST` |
| Outbound | `description[:2000]` — third-party published text |
| Outbound PII | none |
| Response | structured posting fields; `max_tokens=500`, `temperature=0` |

## Protections

There is no longer a circuit-breaker, cache, redactor or per-user AI throttle
layer: all four were part of the admissions AI hardening and were deleted with it.
What protects these calls today:

- **Fail-open-to-nothing.** Every function wraps its call in `try/except`, logs
  through `logger.exception`, and returns `None`. Jobs-ops callers already treat
  `None` as "AI unavailable, degrade gracefully", so no operator flow blocks on
  the gateway (`product.md`: never block core flows on third-party APIs).
- **Bounded cost and bounded output.** Every call sets `max_tokens`; the two
  extraction-style calls set `temperature=0`.
- **Human approval before anything leaves the platform toward a person.**
  Outreach drafts and application packages are approval-gated; the model writes a
  suggestion, an operator sends it.
- **Absent key ⇒ no call.**

## The admissions boundary, as a test

`backend/tests/unit/test_no_admissions_generative_ai_guard.py` (task 12.4) fails
if any of the following becomes true:

- a module under `apps/{accounts,applications,catalog,common,documents}` imports a
  generative client (`openai`, `anthropic`, `google.generativeai`, `litellm`,
  `cohere`) or reads a gateway/model setting;
- `openai`'s importer set in the backend grows beyond `apps/jobs/ai_service.py`;
- a retired module (`ai_service`, `ai_cache`, `ai_circuit_breaker`,
  `ai_prompt_redactor`), a retired flag (`AI_HARDENING_*`), a retired
  un-namespaced setting, or a retired route (`admin-summary`, `preview-summary`)
  comes back;
- `openai` leaves the jobs-ops-only section of `requirements.txt`;
- the admissions **frontend** declares any AI or browser-OCR package;
- and — the other direction — if `apps/jobs/ai_service.py` or the server-side OCR
  dependencies (`pytesseract`, `Pillow`) disappear. Isolation that could be
  satisfied by deleting the other product is not isolation.

A new backend app is also a failure until it is placed on one side of the
boundary, so the guard cannot quietly stop covering the surface.

## Gateway retention

**Still unconfirmed.** The Vercel AI Gateway states that prompt and completion
logs are kept for billing and abuse detection without publishing a retention
window. **Assume prompts are logged until proven otherwise.** With admissions out
of scope this now bears only on jobs-ops, where the sensitive payload is
`tailor_resume`'s résumé excerpt and `generate_outreach_message`'s third-party
contact details.

Open items, owned by jobs-ops rather than admissions-v2:

- obtain written confirmation of the retention window and record it here;
- decide whether a résumé excerpt should be redacted or truncated further before
  transmission, and whether an outreach contact's name is needed at all for the
  draft to be useful;
- decide whether candidates should be able to opt out of AI processing of their
  own résumé.

## What we deliberately do *not* do

- We do not send anything from the admissions product to a model (R11.1). Not a
  summary, not a slip image, not an eligibility decision.
- We do not redact the jobs-ops payloads today. Stating that plainly is the point:
  the protections listed above are availability and cost protections, not privacy
  ones.
- We do not retroactively delete prompts sent before task 7.4 removed the
  admissions paths; that needs a provider request and is not platform code.

## Reference

- Code: `backend/apps/jobs/ai_service.py`.
- Settings: `backend/config/settings/base.py` (`JOBS_OPS_AI_*`).
- Dependency: `backend/requirements.txt`, jobs-ops-only section.
- Guard: `backend/tests/unit/test_no_admissions_generative_ai_guard.py`.
- Deterministic admissions replacements: `backend/apps/documents/grade_extraction.py`
  (candidates), the review-workspace readiness query, and the wizard's
  deterministic submission summary.
- Historical record of the removed admissions paths: `docs/audits/ai-and-ocr-final.md`,
  `docs/v2-evidence/7.4/`, `docs/v2-evidence/7.5/`, `docs/v2-evidence/9.4/`.
