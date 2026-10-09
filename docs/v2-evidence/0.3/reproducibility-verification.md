# Task 0.3 — Inventory reproducibility verification

Re-ran `scripts/inventory_admissions_v2.py` against current source with the
backend virtualenv (`backend/.venv`, Django 5.2.14) on 2026-07-13.

## Result

| Metric | Committed evidence | Re-run | Match |
|--------|--------------------|--------|-------|
| Backend routes | 180 | 180 | yes |
| Platform capabilities | 17 | 17 | yes |
| Tenant capabilities | 17 | 17 | yes |
| Raw role-check hits | 135 in 36 files | 135 in 36 files | yes |
| Status machines | 2 | 2 | yes |
| Beat scheduled tasks | 17 | 17 | yes |
| Page/component direct API calls | 17 | 17 | yes |
| Backend admissions-AI boundary files | 7 | 7 | yes |
| Frontend routes | 35 | 35 | yes |
| Unclassified routes | 0 | 0 | yes |

`backend_routes.json`, `capabilities.json`, and `role_checks.json` are byte-identical
after stripping the `generated_at_utc`/`git_commit` envelope fields.

## Zero-unclassified route report

`zero-unclassified-route-report.md` reports 0 unclassified of 180 backend routes,
partitioned as: authenticated 58, tenant_capability 63, platform_capability 19,
public 16, owner 11, internal_callback 5, api_docs 3, health 3, api_root 1,
django_admin 1.

## New findings

None. The inventory surfaced no new reproducible issue beyond the 70 already
registered in `findings.md`; every backend route classified without a residual
"unknown" bucket, so no finding was appended for this task.

Reproduced-from commit: see `inventory/inventory-summary.json` `git_commit`.
