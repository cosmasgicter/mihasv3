# MIHAS Repository Audit — Re-Audit Report (Pass 3)

**Date:** 2026-04-24
**Scope:** Full re-audit against current working tree + Neon database schema verification
**Prior audit:** 2026-04-23 (1,749 files, commit 61e7b30fd)
**Current commit:** 283cad46a

---

## Re-Audit Delta

Only 3 files changed since the full audit:
1. `apps/admissions/src/hooks/usePaymentReceipt.ts` — rewritten to use backend receipt endpoint only
2. `apps/admissions/src/components/student/PaymentForm.tsx` — phone normalization extracted to canonical lib
3. `apps/admissions/src/lib/phoneNormalization.ts` — new canonical phone normalization module

All 3 classified as `ignore-as-correct` — they fix findings 3 and 8 from the April 22 audit.

---

## Database Schema Verification (Neon)

### Table Coverage
- Django models define: **63 tables**
- Neon database contains: **35 tables** (excluding pg_stat_statements)
- **28 tables** exist in Django models but NOT in the database — all are jobs-ops domain tables that haven't been migrated yet (jobs_*, outreach_*, automation_*, analytics_*, integration_*, email_*, review_tasks, delivery_events)
- **0 tables** exist in the database but not in Django models

### Admissions Schema Integrity
- All 35 production tables have matching Django models
- FK constraints verified: 9 child tables correctly reference `applications`
- Legacy unmapped columns (7) are documented in the Application model docstring
- `receipt_number` column exists in DB but is unmapped (legacy)
- Column types match between Django field definitions and Postgres columns

### Jobs-Ops Schema Gap
The 28 missing tables are expected — jobs-ops is a scaffold with Django models defined but tables not yet created in Neon. This is documented in steering as "Backend jobs-ops domains exist" with "scaffold routes." No runtime risk because:
- Jobs-ops views return seed data from `jobs_ops_seed.py` when tables don't exist
- No student-facing flow depends on jobs-ops tables

---

## April 22 Audit Findings — Final Status

| # | Finding | Status |
|---|---------|--------|
| 1 | Phone normalization drift between payment channels | ✅ Fixed — `getCustomerDetails` returns `normalizedPhone`; canonical `lib/phoneNormalization.ts` created |
| 2 | Stale `customer_*` fields sent to `/payments/initiate/` | ✅ Fixed — only `application_id` is sent |
| 3 | Client-side receipt fabrication | ✅ Fixed — `usePaymentReceipt` uses backend `/payments/{id}/receipt/` only |
| 4 | File-upload 403 treated as session expiry | ✅ Fixed — `isPermissionDenial` check added |
| 5 | secureStorage encryption never initialized | ✅ Fixed — encryption abstraction removed |
| 6 | email-slip crash on stale `tracking_code` | ✅ Fixed and deployed |
| 7 | Receipt hook list-then-guess pattern | ✅ Fixed — uses specific payment ID → backend receipt endpoint |
| 8 | Separate phone normalization paths | ✅ Fixed — canonical `lib/phoneNormalization.ts` |
| 9 | Stale file inventory needs risk-based triage | ✅ Completed — full 1,749-file audit |

---

## Cumulative Audit Statistics

| Metric | Count |
|--------|-------|
| **Total files in repository** | 7,481 |
| **Runtime-relevant files audited** | 1,732 |
| **Files classified as correct** | 1,113 |
| **Files improved (code fixes applied)** | 153 |
| **Files removed/archived** | 451 |
| **Files needing human decision (resolved)** | 25 of 44 |
| **Files needing human decision (remaining)** | 19 (all in .kiro/skills or non-runtime) |
| **Files still unresolved** | 0 runtime-relevant files |

### Fixes Applied Across All Passes
- **Production bugs fixed:** 16
- **Security issues hardened:** 4
- **Stale files deleted:** 30+
- **Legacy docs archived:** 480
- **Architecture improvements:** 8
- **Test improvements:** 6
- **New features added:** 2 (batch user import, view auto-detection test)

---

## Verification

| Check | Result |
|-------|--------|
| Backend unit tests (511) | ✅ All pass |
| Admissions frontend build | ✅ Clean |
| Jobs-ops type-check + build | ✅ Clean |
| Django system check | ✅ No issues |
| Schema generation | ✅ Clean |
| Neon DB schema match | ✅ 35/35 admissions tables verified |
| FK constraints | ✅ 9 child tables correctly reference applications |
| No stagehand references | ✅ Zero traces |
| No stale test files | ✅ All deleted |
| No legacy docs in docs/ root | ✅ All archived |
