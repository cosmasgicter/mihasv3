# Task 12.1, second pass — the backend split, before → after

Line counts are `wc -l`. `scripts/module-size-report.ts` reads one more line per
file (it counts the trailing newline), which is why it prints `program_views.py`
as 722 and `admin_domain_views.py` as 497; the 16-line difference across the 16
files is exactly the +16 in the aggregate reconciliation at the bottom.

## `apps/catalog/admin_views.py` — 2,072 → 96 (re-export shim) + 8 modules

| Module | Lines | What it owns |
|---|---:|---|
| `admin_views.py` | **2,072 → 96** | re-export shim: documented compatibility owner + removal condition, wildcard re-exports plus **explicit** re-exports of every underscore-prefixed name a first-party caller or test reaches for |
| `_admin_view_helpers.py` | **new**, 261 | the shared 403/404/409 answer vocabulary, the one capability gate (`_write_allowed`), the one scope resolution (`_scope_institution_ids` / `_readable_institution_queryset`), the one pagination wrapper, and the two institution-child base views that implement *scope before lookup* for every child resource |
| `admin_tenant_views.py` | **new**, 208 | the tenant record, its launch readiness, its offerings |
| `admin_domain_views.py` | **new**, 496 | the seven domain lifecycle commands, all validated through the one `DomainStatusMachine` |
| `admin_asset_views.py` | **new**, 338 | branding-asset multipart upload (R13.3) + stored-object validation on manual registration (R13.2) |
| `admin_document_config_views.py` | **new**, 298 | templates, document profiles incl. the clone-by-INSERT versioning (R8.5/R8.8), required documents |
| `admin_access_views.py` | **new**, 231 | memberships + access grants — the two surfaces that revoke in-flight sessions on every successful write (R3.5) |
| `admin_routing_views.py` | **new**, 157 | the routing simulator (creates no application row) |
| `admin_audit_views.py` | **new**, 279 | the platform feed (`platform.audit.read_all`) and the per-institution feed (scoped, `tenant.audit.read`, SQL-filtered, audited CSV export) |
| | **2,364** | 2,072 + 292 |

## `apps/catalog/views.py` — 1,570 → 85 (re-export shim) + 6 modules

| Module | Lines | What it owns |
|---|---:|---|
| `views.py` | **1,570 → 85** | re-export shim; explicitly re-exports `Program` / `Intake` / `Subject` / `Institution` and `StandardPagination` because several suites patch `apps.catalog.views.<Model>.objects` and `apps.catalog.views.StandardPagination.paginate_queryset` |
| `_catalog_view_helpers.py` | **new**, 398 | the nine named OpenAPI response envelopes, the read-scope resolution (`_is_admin` / `_scope_*_queryset_for_request` / `_resolve_public_request_context`), and the tenant-scoped read cache (`_catalog_scope_signature` + `_cached_catalog_payload`) |
| `context_views.py` | **new**, 46 | `GET /catalog/context/` |
| `program_views.py` | **new**, 721 | `/catalog/programs/`, `/canonical-programs/`, `/assignment-preview/` |
| `intake_views.py` | **new**, 256 | `/catalog/intakes/` |
| `subject_views.py` | **new**, 69 | `GET /catalog/subjects/` |
| `institution_views.py` | **new**, 267 | `/catalog/institutions/` |
| | **1,842** | 1,570 + 272 |

## Aggregate, from `scripts/module-size-report.ts --threshold 400`

| Measure | pass-2 before | pass-2 after |
|---|---:|---:|
| `backend/apps` files | 324 | **338** |
| `backend/apps` total lines | 88,098 | **88,678** |
| over 400 lines | 73 | **73** |
| over 800 lines | 24 | **22** |
| over 1,000 lines | 17 | **15** |
| import cycles | 7 | **7** |
| largest SCC | 116 | **116** |
| largest catalog view module | 2,072 | **722** |

Reconciliation: 292 + 272 = **564** new lines of hand-written headers and import
blocks, plus the report's +1 per file over 16 files = **580**, which is exactly
88,678 − 88,098. Nothing unaccounted.

`over 400` staying at 73 is the honest reading, not a null result: the two
originals left the band (2,072 → 96, 1,570 → 85) and two of their pieces entered
it (`program_views.py` 722, `admin_domain_views.py` 497). The bands that moved
are the ones that matter for MAINT-01 — over 800 and over 1,000 each dropped by
2, and both drops are these two files.

## The cost, stated: fan-in on the shared modules went up

Fourteen modules now import what two used to, so the shared modules they all
depend on gained importers. Measured, not estimated:

| Module | fan-in before | after |
|---|---:|---:|
| `backend/apps/catalog/models.py` | 58 | **68** |
| `backend/apps/catalog/services.py` | 47 | **52** |
| `backend/apps/catalog/admin_serializers.py` | 2 | **8** |
| `backend/apps/catalog/tenant_audit_service.py` | 31 | **32** |

`services.py` at 52 importers is worth naming twice: it holds
`AdminCapabilityService`, and this split raised its fan-in by 5 without touching
it. That strengthens rather than weakens the case for leaving it to its own task.

## The two pre-existing backend cycles are byte-identical before and after

```
[7] applications/_view_helpers.py -> condition_evidence_service.py ->
    condition_manager.py -> enrollment_service.py -> serializers.py ->
    services.py -> waitlist_manager.py
[3] documents/payment_service.py -> payment_service_mixins/__init__.py ->
    payment_service_mixins/_initiation.py
[3] applications/tasks/pdf/render_context.py -> tasks/pdf/renderers/__init__.py ->
    tasks/pdf_generation.py
[2] common/outbox.py -> common/tasks.py
[2] common/communication_history.py -> common/notification_preferences.py
[2] common/email/__init__.py -> common/email/render.py
```

Read before splitting (pass-1 §11 #3). No split module imports the shim, so the
shim → split-module edges are acyclic, and none of the 14 modules imports into
any of the six backend components above.
