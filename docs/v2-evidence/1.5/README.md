# Task 1.5 Evidence — Generate the V2 TypeScript client from candidate OpenAPI

_Requirements: R14.2-R14.6 · Findings: API-02, API-04_
_Required_Evidence: generated-client reproducibility diff, typecheck, architecture test._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`)
- Candidate: working-tree changes on top of the base commit.
- Captured: 2026-07-15 (UTC).

## What already existed (in-flight partial work)

Task 1.5 had landed a substantial partial:

- `scripts/generate-api-types.sh` — pipeline that (1) generates the candidate
  OpenAPI schema from the backend via `drf-spectacular` and (2) generates strict
  TS types via `openapi-typescript --immutable`.
- `apps/admissions/src/generated/api.d.ts` — generated strict `paths`,
  `components`, and `operations` types (readonly/immutable).
- `apps/admissions/src/generated/index.ts` — the hand-maintained barrel that
  re-exports generated types plus convenience aliases for domain services.
- `apps/admissions/eslint.config.js` — the R14.3 architecture rule: a
  `no-restricted-imports` block scoped to `src/pages/**` and `src/components/**`
  forbidding `@/services/client` and transport internals.
- `apps/admissions/tests/unit/architectureEnforcement.test.ts` — a grep-based
  architecture gate with a `LEGACY_EXCEPTIONS` allowlist.
- `backend/schema/openapi.v2.candidate.yaml` — a committed candidate schema.

Two gaps made the slice incomplete against R14.2–R14.6 and design §14.3:

1. **Generation was not reproducible.** The committed candidate schema was stale
   (missing the five `/api/v2/**` demo endpoints added by task 1.3), and — worse —
   generation was **nondeterministic**: `BatchUserItemSerializer.role` used
   `serializers.ChoiceField(choices=list(VALID_ROLES))` where `VALID_ROLES` is a
   Python `set`. `list(set)` ordering depends on `PYTHONHASHSEED`, so the emitted
   OpenAPI enum re-ordered between runs, guaranteeing a non-empty regeneration diff.
2. **No domain service had been converted to the strict client** as the reference
   pattern, and no service had its permissive normalizer removed (R14.5).

## What this task added / changed

### 1. Reproducible generation (R14.2, design §14.3)

- `backend/apps/accounts/batch_views.py`: `choices=list(VALID_ROLES)` →
  `choices=sorted(VALID_ROLES)`. This is the only nondeterministic enum source in
  the backend (`grep -rn "ChoiceField(choices=list("` → single match).
  Behaviour is unchanged (same four valid roles; only the declared enum order is
  now stable). This is the sole production change required to make the emitted
  schema deterministic.
- Regenerated `backend/schema/openapi.v2.candidate.yaml` and
  `apps/admissions/src/generated/api.d.ts` from current source. The regenerated
  schema now includes the five `/api/v2/**` demo endpoints (from task 1.3).
- **Result:** regeneration is byte-identical at HEAD, and two independent
  generations under `PYTHONHASHSEED=random` are byte-identical
  (`raw/reproducibility-diff.txt`).

### 2. Reference domain-service conversion + normalizer removal (R14.3, R14.5)

`apps/admissions/src/services/interviews.ts` is the reference conversion:

- Now imports strict generated types `ApplicationInterview` and
  `ApplicationInterviewWrite` from `@/generated` (aliases added to
  `src/generated/index.ts`).
- The permissive `normalizeInterviewsResponse` — which sniffed six shapes (bare
  array, `{data}`, `{data:{interviews}}`, `{data:{results}}`, `{interviews}`,
  `{results}`) — was **deleted**. After the canonical envelope (task 1.3) and the
  unified client (task 1.4), the interview list endpoints return
  `{success, data: ApplicationInterview[]}` and the client unwraps exactly one
  envelope level, so the strict contract is `ApplicationInterview[]`. The backend
  was confirmed to return that envelope on every interview response
  (`backend/apps/applications/interview_views.py`).
- A single typed mapper `toInterview(record: ApplicationInterview): Interview`
  narrows the generated `mode`/`status` (`string`) to the domain unions and
  defaults nullable optionals — this is a strict contract map, not a permissive
  normalizer. The `Interview`/`InterviewMode`/`InterviewStatus` domain exports are
  preserved (consumed by three pages/components and Property 8).

### 3. Architecture enforcement made meaningful + shrinking (R14.3)

- `apps/admissions/tests/unit/architectureEnforcement.test.ts` now has **two**
  guarantees:
  1. no *new* page/component may import the raw client (original test); and
  2. **no stale allowlist entries** — every `LEGACY_EXCEPTIONS` entry must still
     import the raw client (or be deleted). Once a later phase task migrates a
     file, its exception becomes stale and the test fails until removed. This
     makes the allowlist provably **shrinking**, never a blanket exemption.
- The `LEGACY_EXCEPTIONS` list is finite (18 entries), documented, and annotated
  with the phase task that migrates each group (Phase 6/7/8/9/10). It is **not**
  the security boundary — the ESLint rule still hard-errors on every one of the
  18 files so `bun run lint` visibly flags them until migrated.

### Not-yet-migrated files (honest status per R1.5)

The 18 first-party pages/components that still import `@/services/client` are the
`LEGACY_EXCEPTIONS` set. They are migrated by later phase tasks (2.x auth/tenant,
8.x payments, 9.x admin review/users, 10.x public tracking / official documents),
exactly as the plan sequences. This task delivers the mechanism (rule + green,
shrinking test) and the reference pattern; it deliberately does not migrate all
18 (that is later-phase work). The reference conversion (`interviews.ts`) does
not itself reduce the 18 because those files import the client for other domains
(payments, uploads, tracker); interviews consumers already used the service.

## Verification (exact commands)

| Command | Result | Raw |
|---|---|---|
| `./scripts/generate-api-types.sh` then diff vs committed | **schema + types regen diff EMPTY (reproducible at HEAD)** | `raw/reproducibility-diff.txt` |
| two `manage.py spectacular` runs under `PYTHONHASHSEED=random` | **byte-identical (deterministic)** | `raw/reproducibility-diff.txt` |
| `cd apps/admissions && bun run type-check` | **PASS (exit 0)** — generated types + reference service compile | `raw/type-check.txt` |
| `bun x vitest run tests/unit/architectureEnforcement.test.ts` | **2 tests PASS** (no-new-violations + no-stale-allowlist) | `raw/architecture-test.txt` |
| `bun x vitest run` interviews/service-normalization/page-verification | **4 files / 89 tests PASS** | `raw/reference-conversion-tests.txt` |
| `cd apps/admissions && bun run lint` | **24 errors (exit 1); 18 are R14.3, unchanged from baseline; 0 new** | `raw/lint.txt` |
| `pytest test_admin_user_management_hardening.py test_admin_serializers.py` | **14 PASS** — `sorted(VALID_ROLES)` change safe | `raw/backend-batch-import-tests.txt` |

Lint note (R14.3): the 24 errors equal the task-0.5 baseline — 18
`no-restricted-imports` (the pending-migration allowlist) + 6 pre-existing
`unused-eslint-disable` directives in wizard/task-0.4-harness files this task did
not touch. The reference conversion added **zero** new violations;
`services/interviews.ts` is an allowed client consumer and is not flagged.

## Requirement mapping

- **R14.2** — OpenAPI is generated from the candidate backend and now reproducible
  (deterministic enum). ✓
- **R14.3** — frontend consumes generated strict types through a domain service
  (`interviews.ts`); direct client imports from pages/components fail the lint +
  architecture check. ✓
- **R14.4** — the unified client from task 1.4 is reused (the service calls
  `apiClient.request`); no client fork. ✓
- **R14.5** — the reference service's permissive normalizer
  (`normalizeInterviewsResponse`) is deleted. ✓ (remaining services' normalizers
  are removed as each is migrated — Phase 12.2.)
- **R14.6** — generated fixtures typecheck against the same OpenAPI artifact
  (`bun run type-check` compiles `src/generated/*` and the reference service). ✓
