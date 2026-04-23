# Security Hardening Audit Results

**Date:** 2026-04-23  
**Auditor:** harden-security orchestrated session  
**Scope:** MIHAS monorepo — 7 findings from prior security audit

---

## H1: Hardcoded keys in `.kiro/mcp.json`

**Verdict: FALSE POSITIVE**  
**Severity: N/A**  
**Fixed: N/A**

All API key fields in `.kiro/mcp.json` are empty strings:

- `CONTEXT7_API_KEY`: `""` (line 38)
- `GITHUB_PERSONAL_ACCESS_TOKEN`: `""` (line 47)
- `BRAVE_API_KEY`: `""` (line 56)

No real secrets are committed. The file contains only MCP server configuration with tool commands (`npx`, `uvx`) and empty credential placeholders. Not a zero-day-class risk.

---

## H2: Dockerfile runs as root

**Verdict: CONFIRMED**  
**Severity: HIGH**  
**Fixed: No**

Evidence from `backend/Dockerfile`:

1. **No `USER` directive** — the container runs the entire application as `root`. The `CMD` on the final line launches uvicorn as root.
2. **`gcc` is NOT cleaned after pip install** — `gcc` is installed on line 8 (`apt-get install -y ... gcc`) and never removed. The `rm -rf /var/lib/apt/lists/*` only cleans the apt cache, not the installed packages. `gcc` remains in the production image, expanding the attack surface.

Specific issues:
- Line 8: `gcc` installed as build dependency
- Line 10: Only `rm -rf /var/lib/apt/lists/*` — does not `apt-get purge gcc`
- No `USER` directive anywhere in the file
- No `RUN useradd` or `RUN adduser` to create a non-root user

Recommended fix:
```dockerfile
# After pip install, remove build tools
RUN apt-get purge -y gcc && apt-get autoremove -y

# Before CMD, drop to non-root
RUN adduser --disabled-password --gecos '' appuser
USER appuser
```

---

## H3: Stagehand scripts with hardcoded credentials

**Verdict: CONFIRMED — CRITICAL**  
**Severity: CRITICAL**  
**Fixed: No**

File: `scripts/stagehand-full-flow.ts`, lines 13–14:

```typescript
const STUDENT = { email: "cosmaskanchepa8@gmail.com", password: "Beanola2025" };
const ADMIN = { email: "cosmas@beanola.com", password: "Beanola2025" };
```

Real production user credentials (email + password) are hardcoded in a committed script file. This includes:
- A real student account email and password
- A real admin account email and password
- Both share the same password (`Beanola2025`), indicating password reuse

This is a **credential exposure** — anyone with repo access has admin credentials. The script is used for E2E testing against the production URL (`***REMOVED***`).

Immediate actions required:
1. Rotate both passwords immediately
2. Move credentials to environment variables
3. Consider whether this file should be in `.gitignore`

---

## H4: Backend envelope format missing

**Verdict: PARTIALLY CONFIRMED**  
**Severity: MEDIUM**  
**Fixed: No**

The `EnvelopeRenderer` is configured as the default renderer in `backend/config/settings/base.py` (lines 324–325), which auto-wraps all `Response(data)` calls in `{"success": true, "data": ...}`. This means views that return raw `Response(serializer.data)` will be auto-wrapped by the renderer.

However, several views bypass the envelope for specific responses:

### `backend/apps/catalog/views.py`
- **List endpoints (programs, intakes, subjects, institutions):** Return `Response(serializer.data)` — **auto-wrapped by EnvelopeRenderer** ✅
- **Program detail GET** (line ~178): Returns `Response(serializer.data)` — auto-wrapped ✅
- **Deactivate responses** (lines ~195, ~296, ~413): Return `Response({"message": "..."})` — auto-wrapped as `{"success": true, "data": {"message": "..."}}` which is non-standard (should be `{"success": true, "data": {"message": ...}}` or a proper message envelope). Technically works but inconsistent.

### `backend/apps/analytics/views.py`
- **FunnelAnalyticsView** (line ~50): Returns `Response(data)` where `data` is a dict with `funnel`, `timing`, `payments` keys — auto-wrapped ✅
- **SourceAnalyticsView** (line ~57): Returns `Response(sample_source_analytics())` — auto-wrapped ✅

### `backend/apps/applications/interview_views.py`
- **ApplicationInterviewListView.get** (line ~62): Returns `Response(ApplicationInterviewSerializer(interviews, many=True).data)` — this is a raw list, auto-wrapped as `{"success": true, "data": [...]}` ✅
- **ApplicationInterviewView.get** (line ~100): Same pattern — auto-wrapped ✅
- **ApplicationInterviewView.post** (line ~130): Returns `Response(response_data, status=201)` — auto-wrapped, but `response_data` may already contain extra keys like `warnings` that get nested inside `data` ✅

**Conclusion:** The `EnvelopeRenderer` handles wrapping automatically. The views don't need explicit envelope code. This finding is a **FALSE POSITIVE** for the specific claim of missing envelopes, but the deactivate endpoints in catalog return `{"message": "..."}` without `"success": true` in the view code (the renderer adds it).

---

## H5: Analytics timedelta serialization

**Verdict: CONFIRMED**  
**Severity: MEDIUM**  
**Fixed: No**

File: `backend/apps/analytics/admissions_analytics.py`, lines 28–33:

```python
def timing_metrics(self, filters: dict) -> dict:
    qs = Application.objects.exclude(submitted_at=None)
    qs = self._apply_filters(qs, filters)
    return qs.aggregate(
        avg_draft_to_submit_days=Avg(F("submitted_at") - F("created_at")),
        avg_submit_to_review_days=Avg(F("review_started_at") - F("submitted_at")),
        avg_review_to_decision_days=Avg(F("review_started_at") - F("decision_date")),
    )
```

Django's `Avg(F("datetime") - F("datetime"))` returns `datetime.timedelta` objects (or `None`). These are **not JSON-serializable**. When the `FunnelAnalyticsView` includes `timing_metrics()` in its response (line ~50 of `views.py`), the `EnvelopeRenderer` will call `json.dumps()` which will raise `TypeError: Object of type timedelta is not JSON serializable`.

This currently works only because:
1. The cache hit path returns previously-serialized data, OR
2. The exception is caught on line ~53 and falls back to `sample_funnel_analytics()`

The fallback masks the bug — live analytics data will always fail serialization and return sample data instead.

Recommended fix: Convert timedelta to days (float) before returning:
```python
result = qs.aggregate(...)
return {k: v.total_seconds() / 86400 if v else None for k, v in result.items()}
```

---

## H6: Stale test files referencing non-existent paths

**Verdict: CONFIRMED**  
**Severity: LOW**  
**Fixed: No**

All three test files exist and reference paths that do not exist in the repo:

### `apps/admissions/tests/unit/profileApiSchemaDrift.test.ts`
- **Line 6:** `path.resolve(__dirname, '../../api-src/auth.ts')` — `api-src/` directory does not exist anywhere in the repo.
- This test will fail with `ENOENT` on every run.

### `apps/admissions/tests/integration/mime-types.integration.test.ts`
- **Line 87:** `path.join(process.cwd(), 'api/_lib/errorHandler.ts')` — `api/_lib/` directory does not exist.
- **Line 19, 39:** References `vercel.json` at `process.cwd()` — may work if run from `apps/admissions/` but fragile.
- This test will fail with `ENOENT` when it hits the `api/_lib/` reference.

### `apps/admissions/tests/integration/schemaVerification.test.ts`
- References `002_core_schema.sql` and `003_supporting_tables.sql` migration files — neither exists in the repo.
- This test will fail with `ENOENT`.

These are legacy test files from a previous architecture (pre-Django migration) that were never cleaned up. They reference the retired `api-src/` and `api/` directory structures.

---

## H7: vercel.json CSP `unsafe-inline`

**Verdict: CONFIRMED**  
**Severity: MEDIUM**  
**Fixed: No (acknowledged as known limitation)**

File: `apps/admissions/vercel.json`, Content-Security-Policy header value:

```
script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://pay.lenco.co https://pay.sandbox.lenco.co
```

`'unsafe-inline'` is present in `script-src`, which allows execution of inline `<script>` tags and `javascript:` URIs. This weakens XSS protections.

However, the file includes an explicit acknowledgment header:

```json
{
  "key": "X-CSP-Note",
  "value": "TODO: Replace unsafe-inline with nonce-based CSP when server-side rendering is feasible. See docs/security-api-audit-2026-04.md finding H2. Current unsafe-inline is required because Vercel static deploys cannot inject per-request nonces."
}
```

This is a **known limitation** of Vercel static deploys — without SSR, there's no way to inject per-request nonces. The `unsafe-inline` is also present in `style-src` and `style-src-elem`, which is standard for Tailwind CSS.

**Note:** `'unsafe-inline'` in `script-src` is the higher-risk item. The style directives are lower concern.

---

## Summary

| Finding | Verdict | Severity | Fixed |
|---------|---------|----------|-------|
| H1: Hardcoded keys in mcp.json | FALSE POSITIVE | N/A | N/A |
| H2: Dockerfile runs as root | CONFIRMED | HIGH | No |
| H3: Stagehand hardcoded credentials | CONFIRMED | **CRITICAL** | No |
| H4: Backend envelope format missing | FALSE POSITIVE | N/A | N/A |
| H5: Analytics timedelta serialization | CONFIRMED | MEDIUM | No |
| H6: Stale test files | CONFIRMED | LOW | No |
| H7: CSP unsafe-inline | CONFIRMED (known) | MEDIUM | No (acknowledged) |

### Priority Actions

1. **IMMEDIATE:** Rotate credentials exposed in H3 (`Beanola2025` for both accounts)
2. **HIGH:** Add non-root user to Dockerfile and purge `gcc` (H2)
3. **MEDIUM:** Fix timedelta serialization in analytics (H5)
4. **MEDIUM:** Plan nonce-based CSP migration when SSR becomes feasible (H7)
5. **LOW:** Delete stale test files (H6)
