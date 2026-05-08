# MIHAS API Versioning Policy

Authoritative versioning and compatibility policy for the Django REST API under `/api/v1/`.
This document is the contract between backend maintainers and frontend/integration consumers.

## 1. Versioning Strategy

**URL-based versioning.** Every endpoint lives under `/api/v1/`. When the contract needs a
breaking change, a new prefix is introduced (`/api/v2/`) and the two run in parallel until
the deprecation window closes.

- There is **no query-parameter versioning** (`?version=1`) — rejected for reasons of
  caching and test manually-triggering complexity.
- There is **no header-based versioning** (`Accept: application/vnd.mihas.v1+json`) — rejected
  for developer-experience reasons.
- **Health endpoints** (`/health/live/`, `/health/ready/`, `/health/redis/`) are unversioned
  and stable across API versions.

## 2. Response Envelope (Part of the v1 Contract)

All `/api/v1/` responses use one of two envelopes:

**Success:**
```json
{"success": true, "data": ...}
```

**Error:**
```json
{"success": false, "error": "human-readable message", "code": "MACHINE_CODE"}
```

Changing the envelope shape is a **breaking change** and requires a major-version bump.
See `.kiro/steering/tech.md` for the full platform contract.

## 3. Non-Breaking Changes (allowed within v1)

These can ship at any time without version bump or client notification:

- Adding a new endpoint
- Adding a new optional field to a request body
- Adding a new field to a response body (clients must tolerate unknown fields)
- Adding a new enum value (clients must handle unknown values gracefully)
- Making a required field optional
- Adding a new response status code
- Widening numeric ranges or loosening a validator
- Improving error messages (message text is not part of the contract — `code` is)
- Adding a new tag, summary, description, or OpenAPI metadata

## 4. Breaking Changes (require v2 or formal deprecation)

These must go through the deprecation process in § 5:

- Removing or renaming a field from a response body
- Making an optional field required
- Changing a field's type (e.g. `int` → `string`)
- Removing an endpoint
- Changing a URL structure (path params, path segments)
- Removing an enum value
- Narrowing validation (e.g. reducing max-length)
- Changing the envelope format itself
- Changing authentication requirements (adding auth to a previously public endpoint)
- Changing an error `code` that clients programmatically handle
- Removing a security scheme

The CI `api-quality` job runs `breaking_change_detector.py` against
`backend/schema/openapi.v1.baseline.yaml` on every PR and blocks merge if any breaking
change is detected.

## 5. Deprecation Process

1. **Announce** — Add `deprecated=True` to the affected `@extend_schema` decorator. The
   operation appears struck through in Swagger UI / ReDoc.
2. **Emit headers** on every response:
   - `Deprecation: true` (RFC 9745)
   - `Sunset: <HTTP-date>` (RFC 8594) — minimum **3 months** after announcement
   - `Link: <...>; rel="successor-version"` (RFC 8288) pointing at the replacement, if any
3. **Document** — Update `backend/schema/REMEDIATION_TARGETS.md` with the deprecation entry
   and target removal date.
4. **Monitor** — Track usage via access logs. If usage remains high as sunset approaches,
   extend the window rather than removing.
5. **Remove** only after `Sunset` has passed AND usage has dropped to zero.

**Reference implementation:** the `/api/v1/notifications/mark-all-read/` and `/mark-read/`
aliases deprecated on 2026-05-08 with Sunset: 2026-11-08. See
`backend/apps/common/notification_views.py::NotificationMarkAllReadAliasView`.

## 6. Baseline Management

`backend/schema/openapi.v1.baseline.yaml` and `backend/schema/lint_baseline.json` are the
locked "ground truth" that CI measures against. They are updated only at the end of a
remediation sprint via `make schema-baseline && make api-quality-baseline`, with a PR
description that documents what changed and why.

## 7. Discovering the Contract

| Surface | URL | Notes |
|---|---|---|
| Raw schema | `/api/v1/schema/` | OpenAPI 3.0.3 YAML, authenticated |
| Swagger UI | `/api/v1/docs/` | Interactive explorer |
| ReDoc | `/api/v1/redoc/` | Readable reference docs |
| Baseline file | `backend/schema/openapi.v1.baseline.yaml` | Authoritative snapshot |

## 8. Client Guidance

- Treat response fields not listed in the schema as optional / tolerate unknown fields.
- Treat response `code` values as programmatic — branch on `code`, not on `error` message text.
- Inspect `Deprecation` and `Sunset` headers on every response — plan migration before `Sunset`.
- Regenerate typed clients from `/api/v1/schema/` after each backend release.

## 9. Breaking-Change Exception Process

If an urgent security or correctness fix requires an immediate breaking change:

1. Add an entry to `backend/schema/REMEDIATION_TARGETS.md` under "Breaking-Change Exceptions"
   with date, endpoint, rationale, and approved-by.
2. Update `backend/schema/openapi.v1.baseline.yaml` in the same PR.
3. Notify known integrators via the operations channel within 24 hours of merge.
4. Document in `docs/api/ROLLBACK.md` how to revert if the change causes regressions.

Exceptions are rare. The default is to deprecate, wait, and remove.
