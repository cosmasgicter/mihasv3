# MIHAS API Rollback Runbook

Instructions for reverting changes from the API production-readiness remediation sprint.

**General principle:** prefer a **new commit that reverts** (`git revert`) over force-pushing.
Every rollback should leave a clean git history that CI can verify.

---

## Preconditions

1. You have push access to `main` or can open a PR that will be merge-queued.
2. The staging environment is healthy. (Verify: `curl -sf https://staging.mihas.edu.zm/health/ready/`.)
3. You can run `make api-quality` locally to validate the revert before pushing.

---

## Section 1 — Rolling back a serializer change (Phase 3, T14-T16)

**Symptom:** A newly-added serializer rejects a payload that the previous code accepted, or
the frontend is failing because a schema shape changed unexpectedly.

**Scope of revert:**
- `backend/apps/documents/serializers.py` (payment serializers)
- `backend/apps/documents/views.py` (payment view wiring)
- `backend/apps/applications/serializers.py` (application serializers)
- `backend/apps/applications/student_views.py`, `admin_views.py` (application view wiring)
- `backend/apps/accounts/batch_views.py` (batch import serializer)
- `backend/apps/common/template_views.py` (template serializers)

**Procedure:**

```bash
# Identify the commit range. For Phase 3 the commits are tagged; find them:
git log --oneline --grep "T1[456]" main

# Revert a specific commit (creates a new commit that undoes it):
git revert <SHA>

# Or, if the entire Phase 3 needs to roll back:
git revert <OLDEST_T14_SHA>..<NEWEST_T16_SHA>

# Verify schema + lint + breaking-change detector locally:
cd backend && make api-quality

# Expected delta: drf-spectacular errors go from 0 back up to the original (~56).
# Linter issues go back up.
# This is EXPECTED for the revert — commit with explanation.

# Push through normal PR process:
git push origin HEAD:revert-phase-3-serializers
gh pr create --title "revert: API Phase 3 serializers due to <reason>" --body "See linked incident"
```

**Post-revert verification (production):**

```bash
# 1. Smoke-test on staging first
python backend/scripts/staging_smoke.py --base-url https://staging.mihas.edu.zm --token $TOKEN

# 2. Then production
curl -sf ***REMOVED***/api/v1/payments/mobile-money/ -X POST \
    -H "Content-Type: application/json" -d '{}' | jq .
# Should return the legacy error shape: {"success": false, "error": "...", "code": "VALIDATION_ERROR"}

# 3. Monitor GlitchTip for new error classes for 30 min after deploy
```

**Rollback of rollback:** The Phase 3 commits are in git history. Re-apply via cherry-pick
if the revert was wrong: `git cherry-pick <original-SHA>`.

---

## Section 2 — Rolling back the notification deprecation (Phase 2, T12)

**Symptom:** Frontend tests fail because `Deprecation: true` header is present and a strict
HTTP header parser rejects responses, or usage metrics confirm the aliases are needed longer.

**Scope of revert:**
- `backend/apps/common/notification_views.py` (remove `NotificationMarkAllReadAliasView` class)
- `backend/apps/common/notification_urls.py` (route aliases back to canonical view)
- `backend/tests/unit/test_notification_deprecation.py` (delete or skip)
- `backend/tests/unit/test_view_auth_classification.py` (remove the alias from the classification list)

**Procedure:**

```bash
# Find the commit
git log --oneline --grep "T12\|notification.*deprecat" main

# Revert
git revert <SHA>

# Update the baseline since this IS a schema change
cd backend && make schema-baseline && make api-quality-baseline

# Commit the refreshed baseline alongside the revert
git add backend/schema/
git commit --amend --no-edit
```

**Expected schema delta:** The two alias operations lose `deprecated=true`; their response
headers drop `Deprecation` and `Sunset`. No data-model changes.

**No data migration needed** — this is a pure URL-routing + header change.

---

## Section 3 — Rolling back the tag sweep (Phase 2, T13)

**Symptom:** Swagger UI tag grouping broke a downstream tool; custom tooling relies on the
operation appearing under the default `api` tag.

**Scope of revert:**
- `backend/config/settings/base.py` (remove the `auto_tag_by_url_prefix` postprocessing hook)
- `backend/apps/common/openapi.py` (remove `auto_tag_by_url_prefix` and `_URL_PREFIX_TAG_MAP`)
- Individual view files that got explicit `@extend_schema(tags=[...])` additions

**Minimal revert (keeps explicit tags, disables just the URL-prefix hook):**

```python
# In backend/config/settings/base.py, comment out or remove:
"POSTPROCESSING_HOOKS": [
    # "apps.common.openapi.auto_tag_by_url_prefix",  # disabled on 2026-XX-XX
    "apps.common.openapi.auto_summary_from_operation_id",
],
```

**Expected schema delta:** ~27 operations revert to tag `api` only. Explicit tags on
individual views remain.

**Full revert (drop everything):** Use `git revert` on the T13 commit range and refresh
the baseline as in § 1.

---

## Section 4 — Rolling back the OpenAPI auth extension (Phase 2, T11)

**Symptom:** `SessionView` security metadata on the generated schema causes a tool to
misbehave (unlikely — this only adds information).

**Scope of revert:**
- `backend/apps/common/openapi.py` (remove `OptionalJWTCookieAuthenticationScheme`)
- `backend/tests/unit/test_openapi_extensions.py` (delete)

**Procedure:**

```bash
git revert <T11_SHA>
# No data migration, no URL change. Schema re-regenerates cleanly.
```

**Expected schema delta:** `SessionView` loses its security block;
`optionalJwtBearerAuth` / `optionalJwtCookieAuth` schemes disappear from `components.securitySchemes`.

---

## Section 5 — Baseline refresh (any phase)

After any revert, regenerate the baseline so the `api-quality` CI gate reflects the new
ground truth:

```bash
cd backend
make schema-baseline        # regen openapi.v1.baseline.yaml
make api-quality-baseline   # regen lint_baseline.json
git add schema/
git commit -m "chore: refresh baseline after rollback of <change>"
```

Document in the PR description:
- What was reverted and why
- Expected metric deltas (errors, warnings, linter issues)
- Any follow-up remediation plan

---

## Production-health verification checklist

After **any** rollback deploys to production, verify within 30 minutes:

- [ ] `/health/ready/` returns 200
- [ ] GlitchTip dashboard shows no new error classes
- [ ] Koyeb logs show no repeated 5xx on affected endpoints
- [ ] Affected frontend workflow smoke-tested (submit, notify-read, payment init)
- [ ] Staging smoke harness passed: `python backend/scripts/staging_smoke.py --base-url $PROD_URL`

If ANY of these fail, roll forward to the latest known-good commit instead of digging further.

---

## Emergency: production is broken and we're not sure which change caused it

1. **Confirm scope.** Is it really from an API change? Check Koyeb deploy history:
   ```
   koyeb deployment list --service mihas-api | head
   ```
2. **Identify the last-known-good deploy SHA.** Use GlitchTip timestamps + Koyeb to bisect.
3. **Roll back to that SHA via Koyeb (not via git).** This is faster than reverting.
   ```
   koyeb deployment redeploy --service mihas-api --sha <LAST_KNOWN_GOOD>
   ```
4. Only then, open a git PR to revert the offending commit — so the next deploy doesn't
   re-apply the broken change.

Runbook author: MIHAS API Remediation Team  
Last updated: 2026-05-08
