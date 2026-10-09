# Task 5.1 Evidence — Retire legacy catalog writes from the frontend

_Requirements: R7.1-R7.5, R14.7 · Findings: TEN-03, DATA-01, API-02_
_Required_Evidence: source/telemetry proof of zero first-party legacy catalog
callers + the strict V2 catalog services/hooks + backend/frontend verification
(type-check/lint/build, backend suites, authority-matrix gate green) + a catalog
E2E spec (execution deferred to 13.2)._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`)
- Candidate: working-tree changes on top of the base commit (the whole
  admissions-v2 spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-23 (UTC).
- Schema: **no schema change in 5.1.** The canonical `CanonicalProgram`/`Program`
  (offering)/`Intake`/`ProgramIntake` tables and the canonical assignment columns
  were already delivered by Phase 3 (`2026_07_16_*` scripts). 5.1 is code-only.

## What task 1.5 delivered, and whether it was sufficient

1.5 delivered a **types-only** generated client and the architecture guardrail:

- `apps/admissions/src/generated/api.d.ts` — strict `paths`/`components`/
  `operations` types generated from the candidate OpenAPI (`openapi-typescript
  --immutable`). It **includes** the catalog paths (`/api/v1/catalog/programs/`,
  `/catalog/intakes/`, `/catalog/institutions/`, `/admin/…`).
- `apps/admissions/src/generated/index.ts` — the barrel + convenience aliases.
- `apps/admissions/eslint.config.js` — the R14.3 `no-restricted-imports` rule
  forbidding raw `@/services/client` imports from `src/pages/**` and
  `src/components/**`, plus the shrinking `LEGACY_EXCEPTIONS` allowlist and its
  green `architectureEnforcement.test.ts`.
- One reference service conversion (`services/interviews.ts`): imports strict
  generated types and calls the unified `apiClient.request` (task 1.4). It is a
  **types + unified-transport** pattern, not a generated runtime fetch client.

**Sufficiency for catalog:** 1.5's generated artifact is types-only; it does not
ship a runtime request client, so the catalog V2 layer follows the exact same
reference pattern — domain services over the one unified `apiClient`, consumed by
pages through domain hooks — rather than inventing a second parallel transport.
The catalog domain types are currently explicit hand-authored interfaces
(`CanonicalProgramOption`, `CatalogIntake`, `CatalogOffering`, `UpdateOfferingPayload`,
plus the reused `Tenant*` shapes from task 4.3). Tightening those to import the
generated `operations` request/response types is a Phase 12.2 refinement and is
noted there; it was **not** required to close 5.1 and would not change any call
site. No second client was introduced (design §3, §14.3 honoured).

## State on entry (prior interrupted dispatch) vs. what this dispatch completed

A prior 5.1 dispatch had already landed the bulk of the slice:

- **Frontend (already present):** the strict canonical catalog domain service
  `services/admin/catalog.ts`, the React-Query hooks `hooks/admin/useCatalogAdmin.ts`,
  and the three admin pages already converted to them —
  `pages/admin/Programs.tsx` (offering create/update/deactivate + institution
  CRUD via canonical), `pages/admin/Intakes.tsx` (canonical `/admin/intakes/`
  via `useIntakeMutations`), `pages/admin/ProgramFees.tsx` (canonical FeeSchedule
  via `useFeeMutations`). The program create form (`programFormSchemas.ts`)
  already **requires** `canonical_program_id`.
- **Backend (already present + wired):** `apps/catalog/legacy_write_telemetry.py`,
  the freeze/telemetry wiring in `apps/catalog/views.py` (program/intake/institution
  create+detail), the canonical `apps/catalog/admin_intake_views.py` home routed in
  `admin_urls.py`, the authority-matrix registration in
  `scripts/authority_matrix_registry.py` (finding TEN-03), and
  `tests/unit/test_catalog_write_freeze.py`.

**Remaining work completed by this dispatch:**

1. **Closed the last first-party legacy caller (grep-loop + cleanup).** The grep
   loop found `apps/admissions/src/data/catalog.ts` still exposed dead legacy
   write hooks (`useCreateProgram/UpdateProgram/DeleteProgram` +
   `useCreateIntake/UpdateIntake/DeleteIntake`) that called the frozen
   `programService`/`intakeService`. These hooks had **zero consumers** (the only
   real consumers — `usePortalBrand.ts`, wizard `useWizardController.ts` — use the
   read hooks only). Removed the dead write hooks and the now-unused
   `programService`/`intakeService`/`useMutation`/`useQueryClient` imports. The
   read hooks (`usePrograms`, `useIntakes`, `useSubjects`, `useContext`,
   `useAssignmentPreview`, `useProgramsForIntake`) and their query keys are
   unchanged (verified by `consolidation-cache-keys.test.ts`).
2. **Authored the catalog E2E spec** (`tests/harness-e2e/deferred/catalog-canonical-writes.spec.ts`),
   execution deferred to 13.2 (see below).
3. **Captured the Required_Evidence** (this directory).

## Source + telemetry: zero first-party legacy catalog-write callers (R7.3, R14.7)

Raw: [`raw/grep-loop-zero-legacy-callers.txt`](./raw/grep-loop-zero-legacy-callers.txt)

- **Legacy write services** (`programService`/`intakeService`/`institutionService`
  in `@/services/catalog`) — **zero code callers**; the only remaining references
  are documentation comments. They are retained **frozen** (not deleted) until
  the Phase 12.2 removal gate, per the plan's "delete legacy only at the named
  exit gate" rule.
- **Legacy write mutation hooks** (`data/catalog.ts`) — **removed**; zero
  references remain.
- **Only live catalog write transport** is the CANONICAL offering create
  (`tenantAdminService.createOffering` → `POST /catalog/programs/` **with**
  `canonical_program_id`), consumed exclusively through the canonical
  `catalogAdminService` / `useCatalogAdmin` domain layer.
- **Deprecation/usage telemetry (R14.7)** is wired on every frozen legacy write
  in `apps/catalog/views.py` via `apps/catalog/legacy_write_telemetry.py`:
  - `record_catalog_write()` — bounded-cardinality, PII-safe counters
    (`catalog.legacy_write` / `catalog.canonical_write`) tagged by
    resource/method/outcome/caller/role, mirrored as a structured log.
  - `mark_deprecated()` — RFC 8594 `Deprecation: true` + `Link: <successor>;
    rel="successor-version"` + `X-Legacy-Catalog-Write` on legacy responses.
  - `canonical_program_required_response()` — stable `400 CANONICAL_PROGRAM_REQUIRED`
    when an offering write omits the canonical link (R7.1).

## The strict V2 catalog services/hooks (R7.1-R7.5)

Canonical ownership graph (design §7.1): `CanonicalProgram -> ProgramOffering ->
IntakeOffering / FeeSchedule / RequirementProfile`.

| Layer | File | Role |
|---|---|---|
| Domain service | `apps/admissions/src/services/admin/catalog.ts` | `catalogAdminService` — the single catalog write authority. Composes task-4.3 `tenantAdminService` canonical methods (`createOffering`, `createProgramIntake`, `listProgramFees`, `createProgramFee`) + adds `listCanonicalPrograms`, `updateOffering`/`deactivateOffering`, `updateFee`/`deactivateFee`, canonical intake CRUD (`/admin/intakes/`), and institution CRUD. Canonical UUIDs only. |
| Domain hooks | `apps/admissions/src/hooks/admin/useCatalogAdmin.ts` | React-Query hooks (`useCanonicalPrograms`, `useCatalogOfferings`, `useCatalogIntakes`, `useProgramFees`, `useOfferingMutations`, `useIntakeMutations`, `useFeeMutations`, `useInstitutionMutations`) with a stable `catalogKeys` factory + invalidation. Pages import these, never the raw client. |
| Pages | `pages/admin/Programs.tsx`, `Intakes.tsx`, `ProgramFees.tsx` | Consume the domain service/hooks. Program create form requires `canonical_program_id`. |
| Backend canonical home | `apps/catalog/admin_intake_views.py` | `GET/POST /api/v1/admin/intakes/` + `/{id}/`, gated by `platform.intake.manage`, audited `tenant.intake.<verb>`. |
| Backend freeze/telemetry | `apps/catalog/legacy_write_telemetry.py` + `apps/catalog/views.py` | R7.1 freeze + R14.7 deprecation/usage telemetry (see above). |

Backend SQL invariants for the graph (R7.4) were delivered in Phase 3 (task 3.3):
unique `(program_offering_id, intake_id)`, one active fee
`(program_offering_id, fee_type, residency)`, `IntegrityError` → `409`.

## Verification

Backend raw: [`raw/backend-verification.txt`](./raw/backend-verification.txt) ·
Frontend raw: [`raw/frontend-verification.txt`](./raw/frontend-verification.txt)

| Command | Result |
|---|---|
| `pytest tests/unit/test_catalog_write_freeze.py` | **12 passed** — R7.1 freeze (reject w/o `canonical_program_id`, no row), canonical create 201 (not deprecated), legacy institution/intake create deprecation headers, `/admin/intakes/` super-admin CRUD + student 403 |
| `pytest tests/unit/test_authority_matrix_v2.py` (authority-matrix gate) | **16 passed** — zero-unclassified gate green; `/api/v1/admin/intakes/` + `/{id}/` registered (finding TEN-03); registry↔live-route drift guard clean |
| `bun run type-check` (admissions) | **PASS (exit 0)** |
| `bun run build` (admissions production build) | **PASS** — built in 55.72s; `check-html-csp` production-CSP compatible |
| `eslint` (5.1 catalog files, `--max-warnings 0`) | **PASS (exit 0)** — no new violations |
| `vitest run` (admin-programs, admin-intakes, serviceNormalization, architectureEnforcement, consolidation-cache-keys) | **5 files / 56 tests passed** |

## Catalog E2E spec (execution deferred to 13.2 — stated)

`apps/admissions/tests/harness-e2e/deferred/catalog-canonical-writes.spec.ts`
(3 journeys), authored in `deferred/` following the task-4.4
`domain-lifecycle.spec.ts` convention. It is **not** run by the strict required
Playwright projects yet; **execution is deferred to task 13.2**, which wires the
catalog journey into the two-tenant golden + adversarial matrix (same-name
cross-tenant isolation, concurrent last-seat, offline injection) and runs it on a
harness with the seeded canonical-program catalogue. Until then the same
semantics are proven now at the backend level (`test_catalog_write_freeze.py`,
authority-matrix gate) and frontend level (page-verification + architecture
tests). The spec drives:

1. R7.1 freeze — `POST /catalog/programs/` without `canonical_program_id` → 400
   `CANONICAL_PROGRAM_REQUIRED`, no row.
2. Canonical write — assign offering (canonical program id), link intake via the
   canonical `/admin/intakes/` home, configure a fee; offering appears on the
   tenant-scoped listing.
3. R14.7 — legacy `/catalog/intakes/` write still succeeds but carries the
   `Deprecation` / `Link` / `X-Legacy-Catalog-Write` headers.
4. R7.7 — two same-name tenants offering the same canonical program stay isolated
   on their scoped listings.

## Requirement mapping

- **R7.1** — new catalog writes follow Canonical_Program → Program_Offering →
  Intake_Offering; offering create is frozen without `canonical_program_id`
  (backend `CANONICAL_PROGRAM_REQUIRED`; frontend form requires it). No
  display-string identifiers. ✓
- **R7.2** — the server derives tenant/snapshots/fee/requirements from canonical
  IDs (task 4.3 canonical commands reused). ✓ (assignment resolution deepened in 5.2)
- **R7.3** — admin UI creates/edits/deactivates offerings, intakes, and fees
  through canonical endpoints; **legacy catalog write routes have no frontend
  caller** (grep-loop). ✓
- **R7.4** — DB enforces unique offering/intake + one active fee; duplicate races
  → 409 (Phase 3 task 3.3; surfaced by the fee dialog error path). ✓
- **R7.5** — offering writes fail closed with a stable configuration error when
  the canonical link is missing (`CANONICAL_PROGRAM_REQUIRED`); readiness blockers
  are the onboarding/readiness surface (task 4.3). ✓ (fee/readiness closure in 5.4/6.5)
- **R14.7** — the frozen `/api/v1/` legacy catalog writes expose
  deprecation/usage telemetry until the Phase 12.2 zero-caller removal gate. ✓

## Verified vs. deferred (honest status)

- **Verified now:** zero first-party legacy catalog-write callers (source);
  backend freeze + deprecation telemetry + canonical `/admin/intakes/` home (12
  tests); authority-matrix gate green with the new routes (16 tests); admissions
  type-check, production build, targeted lint, and 56 catalog unit tests.
- **Deferred (by plan):** catalog E2E **execution** → task 13.2; physical removal
  of the frozen legacy write routes/services → Phase 12.2 (after telemetry proves
  zero external callers); tightening catalog domain types onto the generated
  `operations` types → Phase 12.2 refinement.
- **PBT:** task 5.1 has no numbered property-based-testing sub-task
  (`tasks.meta.json` → `pbtResults: {}`); none to record.
