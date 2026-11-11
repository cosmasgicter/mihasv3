# Task 4.3 — Make onboarding configuration steps real canonical mutations

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Requirements **R4.2,
R4.5–R4.7, R6.3, R7.3** · Findings **TEN-02, TEN-03, TEN-05, TEN-07** · Design
§6.1 (aggregate/states), §6.2 (readiness invariants), §7 (canonical catalog &
assignment), §13.2 (admin IA).

Candidate commit (base): `bae29a28d9657f288b3339062adb31285959c966` (this task's
changes are staged in the working tree on top of it).
Schema fingerprint: **no schema change** — this task adds no SQL migration. The
only backend data change is an additive, harness-only ORM seed of the platform
canonical-program catalogue in `harness_bootstrap` (idempotent, never runs in
production).

## What the change does

The tenant onboarding wizard's **Program** and **Intake** steps were
instructional placeholders ("open the console's Offerings tab…"), so the wizard
could not create a tenant's launch-readiness records and there was **no frontend
consumer** of the canonical catalog write path (findings **TEN-02, TEN-03**).
This task turns them into **real canonical mutations** and adds the missing
**Fees** and **Routing-simulation** steps, all driven by **scoped selectors**
instead of raw UUID entry (**TEN-05**):

| Wizard step | Canonical command (already-shipped endpoint) | Write authority |
|-------------|----------------------------------------------|-----------------|
| Program offerings | `createOffering` → `POST /api/v1/catalog/programs/` | selected **canonical_program_id** (never a display string) — TEN-03 |
| Intake & capacity | `createProgramIntake` → `POST /api/v1/admin/program-intakes/` | selected offering + intake IDs + seat capacity — TEN-03 |
| Fees | `createProgramFee` → `POST /api/v1/programs/{id}/fees/` | selected offering + type + residency + amount |
| Routing simulation | `simulateRouting` → `POST /api/v1/admin/routing/simulate/` | selected canonical program + intake (read-only dry-run) |

Every selector is an accessible, tenant-scoped `<select>` populated from a
scoped list (canonical programs, the tenant's own offerings, global intakes) —
no operator ever pastes a raw UUID (**TEN-05**). Launch readiness reuses task
4.1's canonical `build_tenant_readiness` (design §6.2) unchanged, and the wizard
still gates "Finish onboarding" on it.

The two former placeholders and the "use the console" instructional prose are
removed; the wizard is now self-sufficient for a clean-database launch (R4.2,
R4.7).

## Files

Frontend:
- `apps/admissions/src/pages/admin/tenants/onboardingCatalogSteps.tsx` **(new)** —
  `WizardProgramsStep`, `WizardIntakesStep`, `WizardFeesStep` (real canonical
  mutations + scoped selectors).
- `apps/admissions/src/pages/admin/tenants/RoutingSimulatorPanel.tsx` — extracted
  a card-less `RoutingSimulatorBody` so the wizard embeds the identical "Test
  routing" experience without nesting cards (design §13.3); `RoutingSimulatorPanel`
  now wraps it (console behaviour unchanged).
- `apps/admissions/src/pages/admin/tenants/TenantOnboardingWizard.tsx` — wired the
  new step bodies, added the **Fees** and **Routing simulation** steps, relabelled
  "Branding" → "Branding & support" and "Program assignments/Intake availability"
  → "Program offerings/Intake & capacity", removed the instructional placeholders.
- `apps/admissions/src/pages/admin/tenants/TenantAccessGrantsPanel.tsx` — replaced
  the console's raw "User/Profile ID" and "Program offering ID" text inputs with
  a tenant-scoped user **search selector** (`searchStaffCandidates`, resolved to
  the canonical user id at submit) and an offering **`<select>`** (`listOfferings`)
  — closing the access-grant half of TEN-05 with existing services. (An
  application-scoped grant still takes the application id directly; a scoped
  application search selector is owned by the Phase 9 admin-applications work.)

Backend (harness-only, additive):
- `backend/apps/common/management/commands/harness_bootstrap.py` — seed the
  platform canonical-program catalogue (`CANON-DRN`, `CANON-CM`) so the clean
  A/B launch journey assigns offerings from real canonical programs it *fetches*
  (never a hardcoded/seed-specific id — R4.7).

Tests:
- `apps/admissions/tests/unit/onboardingCatalogSteps.test.tsx` **(new)** — the
  three steps call the canonical mutations with the *selected* IDs (proves scoped
  selectors + canonical write authority + capacity + fee).
- `apps/admissions/tests/unit/tenantAccessGrantsPanel.test.tsx` **(new)** — the
  access-grant user field resolves the searched email to a canonical user id and
  the program-offering scope uses a scoped offering select (TEN-05).
- `apps/admissions/tests/integration/tenantOnboardingWizard.integration.test.tsx`
  — updated the stale enterprise-tenant-authority walk to the current wizard
  (task 4.2 atomic `inviteStaff`, no initial-password field; task 4.3 extra
  steps). It was already failing pre-change (it asserted the removed
  `userService.create`/`createMembership` invite flow).
- `apps/admissions/tests/harness-e2e/required/tenant-launch.spec.ts` **(new)** —
  the clean-database tenant A/B launch journey (see below).
- `apps/admissions/tests/harness-e2e/helpers/api.ts` — added canonical config
  helpers (`listCanonicalPrograms`, `createIntake`, `assignOffering`,
  `linkIntake`, `createFee`, `listTenantOfferings`).
- `backend/tests/unit/test_harness_bootstrap_canonical_seed.py` **(new)** —
  canonical-program seed creates the catalogue and is idempotent.

## Verified in this execution

- **Frontend type-check** — `tsc -p tsconfig.build.json --noEmit` clean
  (`raw/frontend-type-check.txt`, EXIT=0).
- **Frontend lint** — ESLint `--max-warnings 0` clean on all changed files
  (`raw/frontend-lint.txt`, EXIT=0).
- **Frontend build** — full production build (tsc + vite build + CSP check)
  succeeds and stays CSP-compatible (`raw/frontend-build.txt`, EXIT=0).
- **Frontend unit/integration** — 6 suites / 22 tests incl. the three new
  canonical steps, the access-grant scoped selectors, and the updated wizard
  walk (`raw/frontend-unit-tests.txt`, EXIT=0). The wider wizard/tenant set
  (10 suites / **145 tests**) also passes.
- **Backend** — 63 passed across the onboarding workflow + service, the
  program-intake create endpoint, tenant readiness config items, and the new
  harness canonical-seed test (`raw/backend-tests.txt`, EXIT=0).
- **Django system check** — no issues.

## The clean-database tenant A/B launch journey (Required_Evidence)

`apps/admissions/tests/harness-e2e/required/tenant-launch.spec.ts` proves R4.7 /
TEN-07 in the task-0.4 harness: it creates **two same-shaped tenants**, assigns
each an offering from the **same** canonical program (the realistic
same-program-across-two-schools case), links a fresh intake with capacity,
configures a fee — all through the canonical mutation endpoints — and asserts
cross-tenant **isolation** (each tenant's scoped offering list contains only its
own offering; both link back to the shared canonical program; fees are
offering-scoped). It then smoke-tests the wizard UI on **desktop (1280×800)** and
**mobile (390×844)** viewports, asserting the real Program/Intake/Fee/Routing
steps render. Nothing relies on a seed-specific tenant id or a pre-linked
offering — every id is created or fetched at run time.

### Not executed in this isolated run

- The Playwright harness journey (`required/tenant-launch.spec.ts`) needs the
  local E2E harness stack (Postgres/Redis/backend/frontend/adapters + `mailpit`)
  from task 0.4, which is not spun up inside this subagent execution — exactly
  as task 4.2's browser invite spec was deferred. It is part of the required
  matrix executed in **task 13.2**. The spec, the `harness_bootstrap` canonical
  seed it depends on, and the API helpers are all in place and type-check
  cleanly.
- Full production apply of anything: **N/A — no schema/SQL change** in this task.
- No Neon schema rehearsal was required (no schema change).

## Scoped deferral — TEN-02 "institutions start active" → Phase 5

Finding TEN-02's primary defects (program/intake steps are placeholders; no
canonical-catalog frontend consumer) are **closed** here. TEN-02 also notes
"institutions start active": the wizard creates the institution via the v1
`AdminInstitutionSerializer`, which defaults `is_active=True`.

Flipping onboarding to **create the institution inactive** (draft) and only
activate through task 4.1's audited, blocker-gated `activate` command was
evaluated and **deliberately deferred to Phase 5**, because it is *unsafe today*:
`OfferingAssignmentService.assign` and the catalog offering listing filter on the
**offering** `is_active`/`offering_status`, **not** on `institution.is_active`
(verified in `backend/apps/catalog/services.py`). Several config serializers
(`ProgramCreateUpdateSerializer.validate_institution_id`,
`AdminRequiredDocumentSerializer`) also require an **active** institution before
they will accept offerings/required-documents. So configuring a draft (inactive)
tenant's offerings during onboarding would either be rejected by those
validators or — if relaxed — let a draft tenant's offering **route and appear in
the shared portal before launch** (a premature-exposure / isolation regression).

Guaranteeing institution-active filtering across routing + catalog and moving
the config serializers onto the canonical draft model is the canonical-catalog
work owned by **tasks 5.1–5.4** (and the institution-scope hardening in Phase 3).
Doing it here would duplicate or pre-empt that work and risk their property
tests. The wizard's readiness-gated "Finish onboarding" (reusing 4.1's
`build_tenant_readiness`) already prevents completing onboarding until every
blocking config record exists, so an operator cannot leave a half-configured
tenant. This deferral is recorded honestly per R1.5 (deferred work is not
reported as complete).

## Reuse (not duplicated)

- Task 4.1 durable onboarding aggregate + `build_tenant_readiness` (readiness
  gate) — consumed unchanged via the existing `getReadiness` query.
- Task 4.2 atomic `inviteStaff` handoff — the invite step is unchanged.
- Existing canonical endpoints (`/catalog/programs/`, `/admin/program-intakes/`,
  `/programs/{id}/fees/`, `/admin/routing/simulate/`) and the frontend service
  methods already present in `services/admin/tenants.ts`.
- `RoutingSimulatorBody` is shared between the console panel and the wizard.
