# MIHAS Audit — BATCH 6 (Catalog, Analytics, Jobs-Ops Backend) + BATCH 14 (Root Config, CI/CD, Deployment)

Generated: 2026-06-26

---

## CRITICAL FINDINGS

### F1 · `zero-day-class-risk` — `.env.vercel.development` / `.env.vercel.preview` contain production secrets on disk

**Files:** `.env.vercel.development`, `.env.vercel.preview`

These files are gitignored (confirmed via `git check-ignore`) and NOT tracked in the repository. However, they exist on the developer workstation with **real production credentials** in plaintext:

- `DATABASE_URL` with full Neon Postgres connection string (user + password)
- `R2_SECRET_ACCESS_KEY` (Cloudflare R2 storage)
- `RESEND_API_KEY` (email sending)
- `JWT_SECRET` and `JWT_REFRESH_SECRET` (auth signing keys)
- `SMTP_PASSWORD` (Zoho SMTP)
- `VAPID_PRIVATE_KEY` (push notifications)
- `ARCJET_KEY` (rate limiting service)
- `VERCEL_OIDC_TOKEN` (Vercel deployment token)

**Risk:** Any workstation compromise, accidental `tar`/`zip` of the project root, or file-sharing tool sync leaks all production secrets. The `.env.vercel.development` file confusingly contains **production** `DATABASE_URL` and `VITE_NODE_ENV="production"` — this is a naming/content mismatch that increases the chance of accidental misuse.

**Action:**
1. Delete these files from the workstation immediately.
2. Rotate ALL secrets found in these files (DB password, JWT keys, R2 keys, SMTP password, Resend key, VAPID private key).
3. Use Vercel CLI `vercel env pull` only into a single `.env.local` that is also gitignored, and never store production secrets in development-labeled files.

---

### F2 · `confirmed-bug` — `integrations/views.py` — `TelegramConnectView`, `TelegramTestView`, `OpenAITestView` return raw dicts, not envelope

**File:** `backend/apps/integrations/views.py`

All four views return raw dict responses without the `{"success": true, "data": ...}` envelope:

```python
# TelegramConnectView.post
return Response({"id": uuid.uuid4(), "chat_id": "scaffold-chat-id", ...})

# TelegramTestView.post
return Response({"message": "...", "status": "sent", "reference_id": uuid.uuid4()})

# OpenAITestView.post
return Response({"message": "...", "status": "ok", "reference_id": uuid.uuid4()})

# TelegramWebhookView.post (webhook — AllowAny, acceptable to skip envelope)
```

The webhook view is unauthenticated and can reasonably skip the envelope, but the three authenticated views violate the platform contract.

**Action:** Wrap responses in `{"success": True, "data": {...}}`.

---

### F3 · `confirmed-bug` — `integrations/email_views.py` — `EmailMessageListView` and `EmailThreadListView` return raw pagination without envelope

**File:** `backend/apps/integrations/email_views.py`

```python
# EmailMessageListView.get
return Response({"page": 1, "pageSize": 20, "totalCount": len(messages), "results": messages})

# EmailThreadListView.get
return Response({"page": 1, "pageSize": 20, "totalCount": len(threads), "results": threads})
```

Missing `{"success": True, "data": {...}}` wrapper. Frontend expects the envelope.

**Action:** Wrap in envelope: `Response({"success": True, "data": {"page": ..., "results": ...}})`.

---

### F4 · `confirmed-bug` — `integrations/email_views.py` — `ZohoConnectView` returns raw dict without envelope

**File:** `backend/apps/integrations/email_views.py`

```python
return Response({"id": uuid.uuid4(), "provider": "zoho", ...}, status=201)
```

**Action:** Wrap in `{"success": True, "data": {...}}`.

---

### F5 · `confirmed-bug` — `analytics/views.py` — `FunnelAnalyticsView` returns raw data on cache hit, no envelope

**File:** `backend/apps/analytics/views.py`

```python
cached = cache.get(cache_key)
if cached:
    return Response(cached)  # raw dict, no envelope
```

The cache stores the raw `data` dict. On cache hit, the response is `{"funnel": ..., "timing": ..., "payments": ...}` without the `{"success": true, "data": ...}` envelope. On cache miss with live data, same issue. Only the fallback path (`sample_funnel_analytics()`) may or may not have the envelope depending on the seed function.

**Action:** Wrap all return paths in the envelope.

---

### F6 · `confirmed-bug` — `analytics/views.py` — `SourceAnalyticsView` and `OutreachAnalyticsView` return raw sample data without envelope

**File:** `backend/apps/analytics/views.py`

```python
class SourceAnalyticsView(APIView):
    def get(self, request):
        return Response(sample_source_analytics())  # raw list/dict

class OutreachAnalyticsView(APIView):
    def get(self, request):
        return Response(sample_outreach_analytics())  # raw dict
```

**Action:** Wrap in `{"success": True, "data": ...}`.

---

### F7 · `confirmed-bug` — `analytics/views.py` — `DailyDigestReportView` returns raw sample data without envelope

**File:** `backend/apps/analytics/views.py`

```python
class DailyDigestReportView(APIView):
    def get(self, request):
        return Response(sample_daily_digest())  # raw dict
```

**Action:** Wrap in `{"success": True, "data": ...}`.

---

### F8 · `confirmed-bug` — `catalog/views.py` — Multiple views return raw serializer data without envelope

**File:** `backend/apps/catalog/views.py`

The following return paths skip the `{"success": true, "data": ...}` envelope:

| View | Method | Return |
|------|--------|--------|
| `ProgramListCreateView.get` | GET | `paginator.get_paginated_response(serializer.data)` or `Response(serializer.data)` — raw |
| `ProgramListCreateView.post` | POST | `Response(out.data, status=201)` — raw |
| `ProgramDetailView.get` | GET | `Response(serializer.data)` — raw |
| `ProgramDetailView.patch` | PATCH | `Response(out.data)` — raw |
| `ProgramDetailView.delete` | DELETE | `Response({"message": "..."})` — raw |
| `IntakeListCreateView.get` | GET | `Response(serializer.data)` — raw |
| `IntakeListCreateView.post` | POST | `Response(out.data, status=201)` — raw |
| `IntakeDetailView.get/patch` | GET/PATCH | `Response(serializer.data)` — raw |
| `IntakeDetailView.delete` | DELETE | `Response({"message": "..."})` — raw |
| `SubjectListView.get` | GET | `Response(serializer.data)` — raw |
| `InstitutionListCreateView.get` | GET | `Response(serializer.data)` — raw |
| `InstitutionListCreateView.post` | POST | `Response(out.data, status=201)` — raw |
| `InstitutionDetailView.get/patch` | GET/PATCH | `Response(serializer.data)` — raw |
| `InstitutionDetailView.delete` | DELETE | `Response({"message": "..."})` — raw |

This is the most impactful envelope drift in the audit. Catalog is a production domain (not scaffold), so the frontend is likely already adapted to raw responses — but this violates the stated contract.

**Action:** Wrap all catalog responses in the envelope. Coordinate with frontend to ensure compatibility.

---

### F9 · `improve` — `analytics/views.py` — `FunnelAnalyticsView` uses MD5 for cache key

**File:** `backend/apps/analytics/views.py`

```python
cache_key = f"admissions_funnel:{hashlib.md5(json.dumps(filters, sort_keys=True).encode()).hexdigest()}"
```

MD5 is not a security concern for cache keys (no collision attack vector here), but it's inconsistent with the rest of the codebase which uses SHA-256 (e.g., `catalog/tasks.py` uses `hashlib.sha256`). Minor consistency issue.

---

### F10 · `improve` — `analytics/admissions_analytics.py` — `_apply_filters` uses `icontains` for institution/program filtering

**File:** `backend/apps/analytics/admissions_analytics.py`

```python
if filters.get("institution"):
    qs = qs.filter(institution__icontains=filters["institution"])
if filters.get("program"):
    qs = qs.filter(program__icontains=filters["program"])
```

These filter on string fields with `icontains`, which means the `institution` and `program` query params from the frontend are substring-matched. If these are meant to be UUID or exact-match filters (as the frontend likely sends institution/program IDs), this is a logic bug. If they're name-based search, it's fine but should be documented.

**Action:** Clarify whether these should be UUID lookups or name searches. If UUID, use `institution_id=` / `program_id=`.

---

### F11 · `improve` — `automation/views.py` — `PublicReadWriteProtectedMixin` allows unauthenticated GET on all automation endpoints

**File:** `backend/apps/automation/views.py`

```python
class PublicReadWriteProtectedMixin:
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [permission() for permission in self.permission_classes]
```

This makes `GET /api/v1/automation/rules/`, `GET /api/v1/automation/runs/`, and `GET /api/v1/automation/runs/{id}/` publicly accessible without authentication. Automation rules and run data are operationally sensitive. The same mixin pattern exists in `outreach/views.py` and `jobs/views.py` for `JobApplicationListCreateView` and `JobApplicationDetailView`.

**Action:** Remove `PublicReadWriteProtectedMixin` from automation views. Automation data should require authentication. For jobs/outreach, evaluate whether public read access is intentional per the product spec ("Jobs-ops currently exposes public read-oriented scaffold routes for some surfaces").

---

### F12 · `improve` — No rate limiting on any jobs-ops, analytics, automation, outreach, or integrations endpoints

**Files:** All views in `backend/apps/jobs/`, `backend/apps/analytics/`, `backend/apps/automation/`, `backend/apps/outreach/`, `backend/apps/integrations/`

None of these views have `throttle_classes` set. The AI-powered endpoints (`JobScoreView`, `JobTailorDocumentsView`, `OutreachMessageGenerateView`) are particularly concerning — they call external LLM APIs and could be abused for cost amplification.

**Action:** Add throttle classes, especially to AI-powered endpoints.

---

### F13 · `improve` — CI pipeline has no security scanning, no SAST, no dependency audit

**File:** `.github/workflows/ci.yml`

The CI pipeline runs:
- Django checks
- Critical backend test slice
- Circular import check
- Contract parity tests
- Full unit + property tests
- Admissions: type-check, critical tests, lint, unit tests, build
- Jobs-ops: type-check, lint, build

Missing:
- `pip-audit` or `safety` for Python dependency vulnerabilities
- `bun audit` or equivalent for JS dependency vulnerabilities
- No SAST scanning (bandit, semgrep, etc.)
- No secret scanning (trufflehog, gitleaks)
- No Docker image scanning (if applicable)

**Action:** Add at minimum `pip-audit` and secret scanning steps.

---

### F14 · `improve` — CI pipeline missing jobs-ops unit tests

**File:** `.github/workflows/ci.yml`

The `jobs-ops` CI job runs type-check, lint, and build — but no unit tests (`bun run test` is not called). The `admissions` job runs `bun run test`. If jobs-ops has tests, they're not being run in CI.

---

### F15 · `improve` — `apps/admissions/vercel.json` missing `upgrade-insecure-requests` in CSP

**File:** `apps/admissions/vercel.json`

The admissions CSP header does include `upgrade-insecure-requests` (confirmed in the file). However, the `apps/jobs-ops/vercel.json` CSP does NOT include `upgrade-insecure-requests`.

**Action:** Add `upgrade-insecure-requests` to the jobs-ops CSP.

---

### F16 · `improve` — `apps/jobs-ops/vercel.json` — CSP `report-uri` uses deprecated directive

**File:** `apps/jobs-ops/vercel.json`

Both vercel.json files use `report-uri` which is deprecated in favor of `report-to`. This is a low-priority improvement since `report-uri` still works in most browsers and GlitchTip supports it.

---

## SUMMARY TABLE — Correct / Low-Risk Files

| File | Classification | Notes |
|------|---------------|-------|
| `backend/config/urls.py` | `ignore-as-correct` | Feature flag gating via `ENABLE_JOBS_OPS_ROUTES` is properly implemented |
| `backend/apps/catalog/models.py` | `ignore-as-correct` | Clean model definitions, `managed=False` for Neon tables |
| `backend/apps/catalog/serializers.py` | `ignore-as-correct` | Proper validation, `validate_institution_id` checks active status |
| `backend/apps/catalog/urls.py` | `ignore-as-correct` | Clean resource-style routing |
| `backend/apps/catalog/intake_date_computer.py` | `ignore-as-correct` | Pure functions, well-tested, no DB access |
| `backend/apps/catalog/tasks.py` | `ignore-as-correct` | Proper retry, idempotency, throttled alerts, sentry integration |
| `backend/apps/jobs/models.py` | `ignore-as-correct` | `managed=False` scaffold models, clean |
| `backend/apps/jobs/serializers.py` | `ignore-as-correct` | Read-only scaffold serializers |
| `backend/apps/jobs/urls.py` | `ignore-as-correct` | Clean routing |
| `backend/apps/jobs/application_urls.py` | `ignore-as-correct` | Clean routing |
| `backend/apps/jobs/tasks.py` | `ignore-as-correct` | Stub tasks, clearly marked for replacement |
| `backend/apps/jobs/ai_service.py` | `ignore-as-correct` | Graceful degradation (returns None on failure), `lru_cache` for client |
| `backend/apps/automation/urls.py` | `ignore-as-correct` | Clean routing |
| `backend/apps/automation/serializers.py` | `ignore-as-correct` | Clean scaffold serializers |
| `backend/apps/automation/tasks.py` | `ignore-as-correct` | Stub task, clearly marked |
| `backend/apps/outreach/urls.py` | `ignore-as-correct` | Clean routing |
| `backend/apps/outreach/serializers.py` | `ignore-as-correct` | Clean scaffold serializers |
| `backend/apps/integrations/urls.py` | `ignore-as-correct` | Clean routing |
| `backend/apps/integrations/serializers.py` | `ignore-as-correct` | Clean scaffold serializers |
| `backend/apps/integrations/tasks.py` | `ignore-as-correct` | Stub task |
| `backend/apps/analytics/urls.py` | `ignore-as-correct` | Clean routing |
| `backend/apps/analytics/serializers.py` | `ignore-as-correct` | Clean scaffold serializers |
| `backend/apps/analytics/report_urls.py` | `ignore-as-correct` | Clean routing |
| `backend/apps/common/email_urls.py` | `ignore-as-correct` | Lazy imports to avoid circular deps — good pattern |
| `backend/apps/common/openapi_helpers.py` | `ignore-as-correct` | Clean envelope/pagination helpers |
| `.github/workflows/backend-governance.yml` | `ignore-as-correct` | Focused governance checks, properly scoped |
| `package.json` | `ignore-as-correct` | Clean Bun workspace config |
| `shared/package.json` | `ignore-as-correct` | Minimal shared package |
| `.env.example` | `ignore-as-correct` | Template with placeholders only |
| `.env.scripts.example` | `ignore-as-correct` | Template with placeholders only |
| `.env.production` | `ignore-as-correct` | Template with `[set-in-hosting-platform]` placeholders |
| `.env.development` | `ignore-as-correct` | Template with `[set-in-local-env]` placeholders |
| `.env.vercel.production` | `ignore-as-correct` | Only contains public VITE_* vars, no secrets |
| `.env.frontend` | `ignore-as-correct` | Only contains public VITE_* vars, no secrets |
| `.gitignore` | `ignore-as-correct` | Properly excludes `.env.vercel.*`, `.env.frontend`, `.env.local` |
| `scripts/create_release_tag.sh` | `ignore-as-correct` | Clean date-based tagging |
| `scripts/smoke-production.sh` | `ignore-as-correct` | Proper smoke checks for health and frontend |
| `apps/admissions/vercel.json` | `ignore-as-correct` | Comprehensive security headers including CSP, HSTS, Permissions-Policy |
| `backend/apps/analytics/admissions_analytics.py` | `improve` | See F10 — `icontains` filter ambiguity |

---

## FINDINGS BY SEVERITY

### Zero-Day Class Risk (1)
| # | File | Issue |
|---|------|-------|
| F1 | `.env.vercel.development`, `.env.vercel.preview` | Production secrets (DB, JWT, SMTP, R2, Resend) in plaintext on disk |

### Confirmed Bugs — Envelope Drift (7)
| # | File | Issue |
|---|------|-------|
| F2 | `backend/apps/integrations/views.py` | 3 authenticated views return raw dicts |
| F3 | `backend/apps/integrations/email_views.py` | EmailMessage/ThreadListView missing envelope |
| F4 | `backend/apps/integrations/email_views.py` | ZohoConnectView missing envelope |
| F5 | `backend/apps/analytics/views.py` | FunnelAnalyticsView cache hit returns raw data |
| F6 | `backend/apps/analytics/views.py` | Source/OutreachAnalyticsView missing envelope |
| F7 | `backend/apps/analytics/views.py` | DailyDigestReportView missing envelope |
| F8 | `backend/apps/catalog/views.py` | ~15 return paths across all catalog views missing envelope |

### Improve (6)
| # | File | Issue |
|---|------|-------|
| F9 | `backend/apps/analytics/views.py` | MD5 for cache key (consistency) |
| F10 | `backend/apps/analytics/admissions_analytics.py` | `icontains` filter ambiguity |
| F11 | `backend/apps/automation/views.py` | PublicReadWriteProtectedMixin exposes automation data publicly |
| F12 | All jobs-ops views | No rate limiting, especially on AI endpoints |
| F13 | `.github/workflows/ci.yml` | No security scanning (pip-audit, SAST, secret scan) |
| F14 | `.github/workflows/ci.yml` | Jobs-ops unit tests not run in CI |
| F15 | `apps/jobs-ops/vercel.json` | Missing `upgrade-insecure-requests` in CSP |
| F16 | Both `vercel.json` | `report-uri` deprecated (low priority) |

---

## JOBS-OPS VIEWS — Envelope Compliance Check

| View | File | Envelope? |
|------|------|-----------|
| `JobListView.get` | `jobs/views.py` | ✅ Yes |
| `DiscoveryRunCreateView.post` | `jobs/views.py` | ✅ Yes |
| `DiscoveryRunDetailView.get` | `jobs/views.py` | ✅ Yes |
| `JobDetailView.get` | `jobs/views.py` | ✅ Yes |
| `JobScoreView.post` | `jobs/views.py` | ✅ Yes |
| `JobTailorDocumentsView.post` | `jobs/views.py` | ✅ Yes |
| `JobDismissView.post` | `jobs/views.py` | ✅ Yes |
| `JobWatchView.post` | `jobs/views.py` | ✅ Yes |
| `JobApplicationListCreateView` | `jobs/views.py` | ✅ Yes |
| `JobApplicationDetailView` | `jobs/views.py` | ✅ Yes |
| All JobApplication action views | `jobs/views.py` | ✅ Yes |
| `AutomationRuleListCreateView` | `automation/views.py` | ✅ Yes |
| `AutomationRunListCreateView` | `automation/views.py` | ✅ Yes |
| `AutomationRunDetailView` | `automation/views.py` | ✅ Yes |
| `AutomationRunApproveView` | `automation/views.py` | ✅ Yes |
| `AutomationRunCancelView` | `automation/views.py` | ✅ Yes |
| `OutreachContactListCreateView` | `outreach/views.py` | ✅ Yes |
| `OutreachContactEnrichView` | `outreach/views.py` | ✅ Yes |
| `OutreachCampaignListCreateView` | `outreach/views.py` | ✅ Yes |
| `OutreachMessageGenerateView` | `outreach/views.py` | ✅ Yes |
| `OutreachMessageSendView` | `outreach/views.py` | ✅ Yes |
| `TelegramConnectView` | `integrations/views.py` | ❌ **No** |
| `TelegramTestView` | `integrations/views.py` | ❌ **No** |
| `OpenAITestView` | `integrations/views.py` | ❌ **No** |
| `TelegramWebhookView` | `integrations/views.py` | ⚠️ Webhook (AllowAny) — acceptable |
| `ZohoConnectView` | `integrations/email_views.py` | ❌ **No** |
| `EmailMessageListView` | `integrations/email_views.py` | ❌ **No** |
| `EmailThreadListView` | `integrations/email_views.py` | ❌ **No** |
| `EmailDeliveryWebhookView` | `integrations/email_views.py` | ⚠️ Webhook — uses `build_action_payload` (partial) |
| `FunnelAnalyticsView` | `analytics/views.py` | ❌ **No** |
| `SourceAnalyticsView` | `analytics/views.py` | ❌ **No** |
| `OutreachAnalyticsView` | `analytics/views.py` | ❌ **No** |
| `DailyDigestReportView` | `analytics/views.py` | ❌ **No** |

---

## FEATURE FLAG GATING — Verified Correct

`backend/config/urls.py` properly gates all jobs-ops routes behind `settings.ENABLE_JOBS_OPS_ROUTES`:
- `jobs/`, `job-applications/`, `outreach/`, `automation/`, `integrations/`, `analytics/`, `reports/`

All gated routes are in a single conditional block. No jobs-ops routes leak into the ungated section.

---

## SQL INJECTION — No Vectors Found

All database access uses Django ORM (`objects.filter()`, `objects.get()`, `objects.create()`). No raw SQL queries in any audited file. The `admissions_analytics.py` service uses ORM aggregation exclusively.

## SECRETS IN CONFIG — Summary

| File | Tracked in Git? | Contains Real Secrets? | Status |
|------|----------------|----------------------|--------|
| `.env.vercel.development` | No (gitignored) | **YES — CRITICAL** | Delete + rotate |
| `.env.vercel.preview` | No (gitignored) | **YES — CRITICAL** | Delete + rotate |
| `.env.vercel.production` | No (gitignored) | No (VITE_* only) | OK |
| `.env.frontend` | No (gitignored) | No (VITE_* only) | OK |
| `.env.development` | **Yes (tracked)** | No (placeholders) | OK |
| `.env.production` | **Yes (tracked)** | No (placeholders) | OK |
| `.env.example` | Yes (tracked) | No (placeholders) | OK |
| `.env.scripts.example` | Yes (tracked) | No (placeholders) | OK |
