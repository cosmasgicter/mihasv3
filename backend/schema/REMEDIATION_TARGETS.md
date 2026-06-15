# MIHAS API Remediation Targets

Target metrics for the API production-readiness remediation sprint. The CI
`api-quality` job compares current schema against these thresholds.

Generated: 2026-05-08
Baseline snapshot: `backend/schema/openapi.v1.baseline.yaml` (134 paths, 178 operations)

## Metric Table

| Metric | Baseline | Target | Enforced By |
|---|---|---|---|
| drf-spectacular errors | 56 → **0** (ACHIEVED 2026-05-08) | 0 | `make api-quality` (schema regen must have zero errors) |
| drf-spectacular warnings | 6 → **0** (ACHIEVED 2026-05-08) | 0 | `make api-quality` |
| Linter total issues | 930 → **657** (post-Phase 2-5 polish) | < 230 | `api_linter.py --format json` delta vs `lint_baseline.json` |
| Linter errors | 1 | 0 (or documented exception) | `api_linter.py` error count |
| Scorecard overall | 51.79 / F → 53.41 / F | ≥ 70 / C | `api_scorecard.py` overall score |
| Scorecard documentation | 32.94 / F → 44.09 / F | ≥ 80 / B | `api_scorecard.py` dimension |
| Scorecard consistency | 72.74 / C → 72.80 / C | ≥ 80 / B | `api_scorecard.py` dimension |
| Scorecard security | 64.48 / D → 60.48 / D | ≥ 80 / B | `api_scorecard.py` dimension |
| Untagged operations (tag=`api` only) | 39 → **0** (ACHIEVED 2026-05-08) | 0 | `tests/unit/test_schema_tags.py` |
| Operations without `summary` | 179 → **0** (ACHIEVED 2026-05-08) | 0 | `tests/unit/test_schema_summaries.py` |
| Redundant notification endpoints | 3 → **1 canonical + 2 deprecated** (ACHIEVED 2026-05-08) | 1 + 2 deprecated with Sunset | `tests/unit/test_notification_deprecation.py` |
| APIViews without `serializer_class` or `@extend_schema(request=...)` | 14 → **0** (ACHIEVED 2026-05-08) | 0 | schema regen error count |

## Phase 5-polish close-out (2026-05-08, follow-up after main sprint)

Additional polish landed after the initial Phase 5 close-out:

- **Type-hint warnings eliminated** — Added return type annotations to
  `get_request_ip`, `get_request_user_agent` (AuditLogSerializer) and
  `get_application_number`, `get_changed_by_name` (TimelineHistoryItemSerializer).
  drf-spectacular warnings 6 → 0.
- **OperationId collisions eliminated** — Split `NotificationMarkAllReadAliasView`
  into two distinct subclasses (`NotificationMarkAllReadAliasView` for
  `/mark-all-read/`, `NotificationMarkReadBatchAliasView` for `/mark-read/`)
  so each alias path has its own operation_id in the schema.
- **Missing error responses** — Added
  `apps.common.openapi.auto_document_error_responses` postprocessing hook that
  injects standard 400/401/403/404/500 error responses with
  `$ref: '#/components/schemas/ErrorResponse'` on every operation that doesn't
  declare them. Public-endpoint paths (health, webhook, login/register/refresh)
  skip 401/403. Linter issues 755 → 657 (−98), score 88.30 → 89.96.

Deltas:
- drf-spectacular errors: 0 (unchanged)
- drf-spectacular warnings: 6 → **0**
- Linter issues: 755 → **657** (−98 since Phase 4 close-out)
- Scorecard: 53.41 / F (unchanged — remaining linter issues are intentional
  snake_case naming which the scorecard penalizes)


## Scorecard dimensions that are intentionally NOT targeted

The scorecard's automated scoring does not understand Beanola platform conventions.
The following dimensions will remain "low" by the vanilla REST scoring rubric and
are documented exceptions, not regressions:

- **Performance** — Pagination is `{success, data: {page, pageSize, totalCount, results}}` envelope; scorecard expects flat `{data, pagination}`. Envelope is a documented v1 contract.
- **Usability** — No HATEOAS links (intentional; resource-style + envelope is the contract).
- **Naming** (snake_case) — Django/DRF standard for JSON responses. Matches field naming convention throughout.

## Remediation Phases

| Phase | Tasks | Files affected | Expected delta |
|---|---|---|---|
| 2 (quick wins) | T11–T13 | openapi.py (+1 extension), notification_urls/views (+alias subclass), ~10 view modules (tag annotations) | warnings 6→5, untagged ops 39→0, 2 endpoints deprecated |
| 3 (serializers) | T14–T16 | 14 view modules across documents/applications/accounts | errors 56→42 (2+9+3 serializers added) |
| 4 (summaries) | T17–T20 | every app module + SPECTACULAR_SETTINGS | ops w/o summary 179→0, docs grade F→B |

## Hold-the-line policy

Once the remediation sprint completes, these become the new baseline. The
`api-quality` CI job fails any PR that regresses from the post-sprint baseline.
New endpoints must ship with:

1. `serializer_class` (via `GenericAPIView`) or `@extend_schema(request=..., responses=...)` on an `APIView`
2. `@extend_schema(tags=["<domain>"], summary="...")` on every operation
3. No new untagged (only `api` tag) operations
4. No new `@extend_schema(deprecated=True)` endpoints without a `Sunset` header

Any exception must be documented in this file with justification.
