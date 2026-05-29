# OCR + AI end-to-end audit

Direct audit performed via grep + read after the audit subagent silently no-op'd.

## Summary

- Total checks: 12
- Pass: 9
- Fail (real bug): 0
- Concern (worth tracking): 3

## Findings

### [PASS] 1. OCR never overwrites manual grades

The `useOcrGradeExtraction` hook returns matched grades to the consumer; the consumer (`useWizardController.handleOcrGrades` lines 1113-1116) explicitly filters with a `manualSubjectIds` Set so OCR-detected subjects whose subject_id already has a manual entry are skipped. The hook docstring was rewritten earlier in this session to match this behaviour.

### [CONCERN] 2. OCR timeout

Steering doc claims 30s timeout. Reality: the OCR Celery task in `backend/apps/documents/tasks.py:27` is decorated with `soft_time_limit=300, time_limit=360` (5 min soft, 6 min hard). The "30s" figure is stale doc; the actual ceiling is much more generous. Should update either steering or the task config.

Note: `backend/apps/documents/ocr_service.py` referenced by structure.md does not exist as a separate file; OCR is implemented inline in tasks.py. Steering doc reference is also stale.

### [PASS] 3. 24h Redis cache

`ai_cache.py:44`: `DEFAULT_TTL_SECONDS: int = 24 * 60 * 60`. Cache entries fingerprinted by application_id + updated_at + payment_status + status (`compute_application_fingerprint`). Off by default, gated by `AI_HARDENING_CACHE`.

### [PASS] 4. Force-refresh ?refresh=1 super-admin only

`admin_amendment_views.py:ApplicationAdminSummaryView.get` checks `request.user.role == "super_admin"` before honoring `?refresh=1`. Non-super-admins always read from cache. Logged for audit (`ai_cache: admin-summary force refresh app=%s by=%s`).

### [PASS] 5. PII redactor list

`ai_prompt_redactor.py:38-43` ADMIN_REDACTED_KEYS = ["full_name", "nrc_number", "passport_number", "date_of_birth", "date_of_birth_iso", "phone", ...]. Student preview also drops "full_name" and replaces with "first_name". Gated by `AI_HARDENING_REDACTION` (line 135, 170).

### [PASS] 6. Circuit breaker 5-min cooldown after 3 failures

`ai_circuit_breaker.py:44` `FAILURE_THRESHOLD: int = 3`. Line 47: `COOLDOWN_SECONDS: int = 300` (5 min). Gated by `AI_HARDENING_CIRCUIT_BREAKER` (line 155).

### [PASS] 7. Per-user rate limits

`backend/config/settings/base.py:393-395`:
- `ai_admin_summary: 60/hour`
- `ai_document_extract: 5/hour`
- `ai_student_preview: 10/hour`

Throttling applied via `AIUserScopedRateThrottle` (`throttling.py:100`) gated by `AI_HARDENING_RATE_LIMITS`.

### [PASS] 8. Graceful degradation

Missing API key returns `None` not 500. Confirmed via `with_circuit_breaker` wrapper that catches exceptions and falls through.

### [PASS] 9. AI gateway env var

`base.py:610`: `AI_GATEWAY_API_KEY = os.environ.get("AI_GATEWAY_API_KEY", "")`. Default empty string for safe fallback.

### [PASS] 10. Model tier configuration

`base.py:612-615`:
- `AI_MODEL_FAST = google/gemini-2.5-flash`
- `AI_MODEL_VISION = google/gemini-2.5-flash`
- `AI_MODEL_ANALYSIS = openai/gpt-4o-mini`
- `AI_MODEL_SMART = deepseek/deepseek-v3`

All four documented tiers configured.

### [PASS] 11. No PII logged on AI calls

Structured log entries use `app.id`, `request.user.id`, `name=` (breaker name), `attempts=` only. No raw PII appears in any AI-related log statement.

### [PASS] 12. Feature flag matrix

All four `AI_HARDENING_*` flags wired to gate the relevant code:
- `AI_HARDENING_CIRCUIT_BREAKER` → `ai_circuit_breaker.py:155`
- `AI_HARDENING_CACHE` → `ai_cache.py:88`
- `AI_HARDENING_REDACTION` → `ai_prompt_redactor.py:135, 170`
- `AI_HARDENING_RATE_LIMITS` → `throttling.py:111`

When any flag is False, the relevant code path is no-op (legacy unchanged).

## Action items

- [ ] Update `.kiro/steering/tech.md` line "OCR never overwrites manually entered grades. Timeout is 30 seconds." to reflect the actual 300s soft / 360s hard task limits — file: `.kiro/steering/tech.md`
- [ ] Update `.kiro/steering/structure.md` line referencing `backend/apps/documents/ocr_service.py` (the file does not exist; OCR is in tasks.py)
- [ ] (concern, not action) Verify the student-preview redaction docstring lists all keys actually dropped — see canonical-alignment audit for details
