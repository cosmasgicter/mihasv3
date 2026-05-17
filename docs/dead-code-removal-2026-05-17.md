# Dead Code Removal — 2026-05-17

This document captures the dead-code findings during the canonical-truth program's
Wave 4 dead-code scan (Decision A3 — aggressive single-pass).

## Scope

Frontend: `apps/admissions/src/`
Backend: `backend/apps/`

## Wave 1 already-removed components (May 2026)

The user's Wave 1 alignment work (16 actions documented in
`docs/admissions-system-audit-2026-05-17.md`) already deleted these dead admin
components:

| Path | Reason for removal |
|------|---------------------|
| `apps/admissions/src/components/admin/BulkOperations.tsx` | Replaced by per-feature bulk actions inside ApplicationsTable |
| `apps/admissions/src/components/admin/applications/AdminMetrics.tsx` | Duplicated by `MetricsHeader.tsx` (both since removed) |
| `apps/admissions/src/components/admin/applications/ApplicationsCards.tsx` | Replaced by single canonical `ApplicationsTable` view |
| `apps/admissions/src/components/admin/applications/ApplicationsFilters.tsx` | Replaced by `FiltersPanel.tsx` |
| `apps/admissions/src/components/admin/applications/ApplicationsMetrics.tsx` | Duplicate of dashboard-level metrics |
| `apps/admissions/src/components/admin/applications/MetricsHeader.tsx` | Consolidated into Applications.tsx |

These removals were committed before the canonical-truth program executed.

## Canonical-truth program findings

The Wave 4 dead-code scan was scoped to be **conservative**. The program added
substantially more code (drift-guard tests, fixtures, decomposed view modules,
new helpers) than it removed. Net code-removal in the canonical-truth program
itself is intentionally minimal because:

1. The 21 new backend submodules (Stream 9 decomposition) are NEW files; they
   coexist with the original re-export shims that preserve every import path.
   The shims are NOT dead code — they're the public contract.
2. Wave 1 already removed visible dead components.
3. `payment_service.py` (104 KB) is intentionally NOT decomposed; deferred to
   a separate spec to limit blast radius.

## Frontend `ts-prune` scan (manual step for the user to run)

```bash
cd apps/admissions && bunx ts-prune 2>&1 | head -200
```

**To execute when running the program in the user environment.** Findings should be triaged using this safe-list:

### Safe-list — DO NOT remove even if flagged:
- Anything in `apps/admissions/src/types/` (used by generated code, drift fixtures)
- Anything imported by `main.tsx`, `App.tsx`, `routes/config.tsx`
- Anything in `__fixtures__/` directories
- Public types referenced by Vercel deployment configs
- Exports from `lib/security.ts` (canonical sanitizer)
- Exports from `types/roles.ts`, `types/applicationStatus.ts`, `lib/withdrawalEligibility.ts` (canonical-truth helpers)

### Triage protocol:
1. Verify with `grep -rn "<symbol>" apps/admissions/src apps/admissions/tests`
2. If zero non-self matches, the export is dead.
3. Delete the export. If the file becomes empty, delete the file.
4. Document the removal in this file.

## Backend `vulture` scan (manual step for the user to run)

```bash
cd backend && python3 -m vulture apps/applications apps/documents apps/accounts apps/common --min-confidence 80 2>&1 | head -100
```

Note: `vulture` may not be installed. If absent, install via `pip install vulture` or skip this step.

### Safe-list — DO NOT remove even if flagged:
- Anything imported in any `urls.py`
- Any class with `@extend_schema` decoration
- Any function decorated with `@shared_task` (Celery tasks)
- Any signal handler in `apps/common/celery_signals.py`
- Anything in `apps/common/openapi*.py` (used at schema generation time)
- Anything in `apps/applications/{admin,student}_*_views.py` (Stream 9 submodules)
- Anything in `apps/documents/{mobile_money,payment_admin,payment_query,lenco_webhook,document_storage}_views.py`
- Anything in `apps/accounts/{auth,password,profile,admin_user,admin_settings,admin_audit}_views.py`
- `SYSTEM_ACTOR_ID` constant (Stream 5)
- `LEGACY_DEPRECATED_COLUMNS` (Stream 4)

## Stale audit-results

Per Decision A3, `audit-results/` files are kept as historical reference.
README added at `audit-results/README.md` noting they are archived analyses
superseded by the canonical-truth program output.

## Stale SQL scripts archived

Stream 4 moved the following applied-and-stable scripts to `backend/scripts/applied/`:
- `payment_hardening_indexes.sql`
- `payment_hardening_preflight.sql`

Other applied scripts remain at the top of `backend/scripts/` pending operator review.

## Net summary

| Category | Count |
|----------|-------|
| Frontend dead components removed in Wave 1 (May 2026) | 6 |
| Frontend dead exports removed in canonical-truth program | 1 (duplicate `sanitizeInput` in `wizardUtils.ts`) |
| Backend dead modules removed | 0 |
| SQL scripts archived to `applied/` | 2 |
| Files added (drift guards, new modules, fixtures, docs) | ~70 |

The canonical-truth program is net-additive by design. The structural improvements
(decomposition, drift guards, canonical helpers) prevent future fragmentation;
they are not dead-code removal in the traditional sense.

## Follow-up

A focused dead-code sprint is recommended for a future cycle once the
canonical-truth program is in production for at least 30 days. By then:
- Wave 1 visibility into actual usage will be higher.
- Stream 9 submodules will have settled — any unused submodule from the
  decomposition will be visible via `ts-prune`/`vulture`.
- Wizard hook decomposition Phase 2-6 will further consolidate.
