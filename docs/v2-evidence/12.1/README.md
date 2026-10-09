# Task 12.1 — Split oversized modules after behavior is protected

Evidence index for task **12.1** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

> **This task ran in two passes, and this document is in two halves.** Everything
> up to §11 is the **first pass** (frontend, 2026-08-10), which honestly recorded
> `[-]` because it had not done the backend half. Everything from
> **[§12 onward](#12-the-second-pass-the-backend-half-9-deferred)** is the
> **second pass** (backend, 2026-08-11), which did it. §9 has been corrected in
> place — it said "no backend change at all", which the second pass makes false —
> but its *reasoning* is left intact, because that reasoning is precisely what
> the second pass had to answer before it was allowed to move anything.
>
> The checkbox is **`[x]`** as of the second pass. §21 is the list of what is
> deliberately still unsplit and why, and §22 is what a future task inherits.

```
- [-] 12.1 Split oversized modules after behavior is protected
  - Extract domain commands/queries from large catalog/application views and
    state-machine/adapters/sections from wizard, onboarding, application, and
    user pages.
  - Follow existing domain patterns; do not add generic repositories or a new
    state library without measured need.
  - _Requirements: R14.3-R14.5, R17.5_
  - _Findings: MAINT-01_
  - _Evidence: characterization tests unchanged, size/dependency report, no cycle increase_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-10 (UTC).
- **Schema: no**, in both passes. No SQL script, no migration, no model change.
  **First pass: no backend change at all** — §9 stated the backend half plainly as
  *not done*, which was the reason that pass ended `[-]`; §5.5 records the
  `manage.py check` that proved the backend was untouched rather than claiming it.
  **Second pass: backend code moved but the contract did not** — §14 records the
  OpenAPI schema regenerated and **byte-identical** (same SHA-256) to a pre-split
  anchor, so there is still nothing to rehearse on Neon and nothing to migrate.
- PBT: task 12.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`), so nothing is recorded through
  `update_pbt_status` and no numbered spec property is claimed. Stated rather than
  silently skipped.
- **First pass ended `[-]`.** Four of the modules five earlier tasks named by
  name were split; the backend catalog/application views, the tenant onboarding
  wizard and the user pages were not. §10 is that list, with numbers. The second
  pass closed the backend half (§12–§20) and left the onboarding wizard
  deliberately unsplit with the reason (§21).
- **Working tree inspected first.** No partial 12.1 work existed: no
  `docs/v2-evidence/12.1/`, and every named module was at the size its lane had
  recorded. The `[-]` marker came from the dispatch, not from a prior run.

## The Required_Evidence claim

The `_Evidence:` line is one claim with three parts. Each is produced by a
measurement in [`raw/`](raw/), not by inspection.

| Claim | Where it is settled |
|---|---|
| **characterization tests unchanged** | §4 — 4,538 → **4,584** passing, **0 new failures**, and the arithmetic closes exactly: +46 = 29 + 17 new cases in two new files, with **no case deleted**. Every behavioural assertion in all nine characterisation suites that read these modules is the same assertion; §4.2 is the honest list of the **eight source-location pins** that were repointed, why each had to be, and what each now measures instead |
| **size/dependency report** | [`raw/size-dependency-before.txt`](raw/size-dependency-before.txt) → [`raw/size-dependency-after.txt`](raw/size-dependency-after.txt), produced by [`scripts/module-size-report.ts`](../../../scripts/module-size-report.ts) — a new, dependency-free tool that measures size, fan-in/fan-out and cycles over both surfaces in one pass, so a "before" is reproducible rather than remembered. [`raw/size-dependency-head-commit.txt`](raw/size-dependency-head-commit.txt) is the same scan at the base commit, for context on how much of the current state Phase 11 already changed |
| **no cycle increase** | Tarjan SCC over the first-party import graph: **7 → 7** cycles, largest component **116 → 116** nodes. §3.5 records the one place this nearly went wrong — two extracted components joined the pre-existing barrel cycle and pushed the largest SCC to 118 until their imports were repointed at concrete modules |

### The browser gate

Task 12.1 adds **no** browser journey, deliberately: it changes no rendered
output, so a new journey would assert something no other journey already covers.
What it must show is that the existing ones still pass on a fresh stack, which
§5.6 records.

## What this task establishes

1. **The four modules five earlier tasks pointed here by name are split, and
   three of them by more than half.** 807 → **369**, 689 → **366**, 1,443 → **785**,
   1,110 → **1,047**. Files over 800 lines: **13 → 11**. Over 1,000: **4 → 3**.
2. **A split is only safe if the characterisation is about behaviour, and half of
   this codebase's was about file paths** (§4.2). Nine suites read these four
   modules; eight assertions broke, and **not one of them was behavioural** — every
   single break was a claim about which file a string lives in. That is the finding
   worth carrying forward: MAINT-01's remedy says "add characterization tests, then
   split", and a source-text pin is not the kind of characterisation that survives
   the second half of that sentence.
3. **A pin can be repointed without weakening it, and three of these got
   stronger** (§4.2). `studentWorkspaceConsolidation`'s 51 cases now read the
   workspace's **module set** rather than one file, so an assertion can no longer be
   satisfied by leaving a string in a file nothing renders. 11.5's decision-block
   claims now scan three modules instead of one. `mobileResponsiveness`'s 44 px
   claim now walks the page's composed surface, using the walker that file had
   already written for exactly this case.
4. **Two pins did not need repointing, because the split was shaped around them**
   (§3.2). `approvalFlowPreservation` reads `ApplicationApprovalActions.tsx`'s source
   for a `currentStatus === '<status>'` branch per status and for
   `handleStatusUpdate('approved')` within 1,200 characters of the `under_review`
   branch. Task 11.4 declined to split the file for that reason. So the **payment**
   half moved and the **application-status** half stayed, and both pins are still
   literally true. The dispatch allowed either; the smaller change is the honest one.
5. **The page stopped touching transport, and the allowlist shrank** (§3.1).
   `ApplicationStatus.tsx` was on `architectureEnforcement`'s pending-migration
   allowlist because it imported `@/services/client` for one `AuthenticationError`
   guard. The guard moved with the query into the hook layer, the entry became
   stale, and the test's second assertion — the one that exists so the allowlist can
   only shrink — demanded its removal. **14 → 13** files. §3.1 states plainly that
   the import was *relocated*, not eliminated.
6. **`findProgramId` is not a formatting helper** (§3.4). 65 lines deciding which
   *canonical* program a restored display name means — exact id, exact name,
   institution-hinted tie-break, partial name, then `''` to fail validation — sat in
   the middle of a 1,110-line hook. The canonical truth map makes ids the sole
   authority and `applications.program` a display snapshot, so this ladder is the
   code that keeps those two apart. It now has a module with a name.
7. **The extraction was performed by line range, not retyped** (§3.6). 11.2 §10.1
   is the cautionary tale — it re-authored a validation function and silently dropped
   a hydration guard, a duplicate-subject error, an upload guard and six field
   labels, caught only by other lanes' property tests. The wizard extraction here
   asserts the moved text is **byte-identical** before it writes the file, and the
   script that does it is in [`raw/`](raw/wizard-extract.py).
8. **A cycle count can stay flat while the graph gets worse, and this one nearly
   did** (§3.5). Two of the new components imported `@/components/ui`, the barrel
   that re-exports every primitive, which put them inside the pre-existing 116-node
   barrel SCC. The cycle *count* would have read 7 → 7 either way. Concrete module
   paths brought the largest component back to exactly 116.

## Files

```
docs/v2-evidence/12.1/
├── README.md                              ← this index
└── raw/
    ├── size-dependency-before.txt         (working tree at dispatch: 57 frontend + 73 backend over 400, 7 cycles)
    ├── size-dependency-after.txt          (candidate: 55 frontend + 73 backend over 400, 7 cycles)
    ├── size-dependency-head-commit.txt    (the base commit, for context)
    ├── module-sizes.md                    (the 18 modules this task touched, before → after)
    ├── wizard-extract.py                  (the byte-identity extraction script, §3.6)
    ├── frontend-test-baseline.txt         (baseline: 1 failed, 4538 passed, 1 skipped / 491 files)
    ├── frontend-test.txt                  (candidate: 1 failed, 4584 passed, 1 skipped / 493 files)
    ├── frontend-lint.txt                  (15 errors, 13 files — from 11.5's 16 / 14)
    ├── frontend-lint-files.txt            (the 13, and the diff against 11.5's 14)
    ├── frontend-build.txt                 (exit 0, incl. tsc and the CSP gate)
    ├── django-check.txt                   (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── harness-up.txt                     (fresh stack: volumes wiped, rebuilt, reseeded)
    ├── harness-required-suite.txt         (the required profile on that fresh stack)
    ├── harness-gatecheck.txt              (must fail — the gates fire)
    ├── harness-drain.txt                  (broker 0, unsettled payment collections 0)
    └── harness-down.txt                   (teardown: 0 containers, 0 volumes)
```

Source of the change. Every row is an extraction; no row changes rendered output.

| Path | Lines | What it is |
|---|---|---|
| `scripts/module-size-report.ts` | **new**, 372 | Size + fan-in/fan-out + Tarjan SCC over `apps/admissions/src` and `backend/apps`, with `--ref` to measure a git ref. Dependency-free: no madge, no dependency-cruiser |
| **`…/pages/student/ApplicationStatus.tsx`** | **807 → 369** | composes; no longer fetches, mutates, validates or derives |
| `…/hooks/student/useApplicationWorkspace.ts` | **new**, 276 | 4 reads + 4 commands + the state each command owns |
| `…/components/student/applicationStatus/applicationTimeline.ts` | **new**, 111 | the derived progress list, pure |
| `…/components/student/applicationStatus/workspacePresentation.ts` | **new**, 138 | every label and fee sentence, pure |
| `…/components/student/applicationStatus/ApplicationDetailsSection.tsx` | **new**, 74 | the details grid + `DetailRow` |
| `…/components/student/applicationStatus/WorkspaceAside.tsx` | **new**, 126 | the right-hand column |
| **`…/components/admin/applications/ApplicationApprovalActions.tsx`** | **689 → 366** | keeps the application-status branch tree two lanes pin by source |
| `…/components/admin/applications/PaymentDecisionControls.tsx` | **new**, 246 | the payment branch tree + its notes dialog |
| `…/components/admin/applications/paymentReviewCopy.ts` | **new**, 66 | the dialog copy map, and the block's one client-side rule |
| `…/components/admin/applications/approvalActionTokens.ts` | **new**, 38 | one tone vocabulary for both halves (11.5's, verbatim) |
| `…/hooks/admin/useApprovalActionCommands.ts` | **new**, 179 | both commands + the dialog state |
| **`…/components/admin/applications/ApplicationDetailModal.tsx`** | **1,443 → 785** | the sheet: its tab, its focus trap, its markup |
| `…/components/admin/applications/AssignReviewerControl.tsx` | **new**, 179 | reviewer assignment (AUTH-03), verbatim |
| `…/components/admin/applications/GradesDisplay.tsx` | **new**, 111 | persisted canonical grades, read-only |
| `…/components/admin/applications/ReviewDecisionLists.tsx` | **new**, 234 | amendment + condition review, verbatim |
| `…/hooks/admin/useReviewWorkspaceSession.ts` | **new**, 337 | the one read, six projections, 11 versioned commands |
| **`…/applicationWizard/hooks/useWizardController.ts`** | **1,110 → 1,047** | still the largest module this task touched — §10 |
| `…/applicationWizard/hooks/wizard/useWizardCatalogIdentity.ts` | **new**, 152 | the catalog lists + the canonical-identity resolvers, byte-identical |
| `apps/admissions/tests/unit/applicationWorkspaceDecomposition.test.ts` | **new**, 29 cases | the student workspace's extracted derivation, exercised directly |
| `apps/admissions/tests/unit/approvalActionsDecomposition.test.tsx` | **new**, 17 cases | the decision block's copy map, its payment branches, and the split itself |
| `…/tests/unit/studentWorkspaceConsolidation.test.tsx` | pin repointed | 51 cases now read the workspace's module set (§4.2 #1) |
| `…/tests/unit/productDesignDeFluff.test.tsx` | pin repointed | 2 decision-block claims now scan 3 modules (§4.2 #2) |
| `…/tests/unit/mobileResponsiveness.test.ts` | pin repointed | 22.4 uses the file's own composed-surface walker (§4.2 #3) |
| `…/tests/unit/architectureEnforcement.test.ts` | allowlist shrank | `ApplicationStatus.tsx` removed, with the reason (§3.1) |
| `…/tests/property/test_bug2_auth_error.test.ts` | pin repointed | reads the hook that now holds the `queryFn` (§4.2 #4) |
| `…/tests/property/test_bug2_preservation.test.ts` | pin repointed | same, plus the two-part `enabled` gate (§4.2 #5) |

---

## 1. What was wrong

MAINT-01, verbatim:

> Core frontend and backend files exceed 800 to 1,800 lines and mix
> orchestration, validation, persistence, and rendering. … Add characterization
> tests, then split by bounded workflow **without changing behavior or inventing
> generic abstractions**.

R14.3 requires domain service modules rather than direct client calls from pages
and components. R17.5 is the list/pagination/budget clause, which this task
touches only insofar as §10 restates the per-row reads two earlier tasks flagged
and this one did not fix.

Five earlier tasks each ended by naming a module they had left here, with the
reason. All five are answered — four by splitting, one (the backend half) by
being explicit that it is not done:

| Named by | Module | At dispatch | Now |
|---|---|---:|---|
| 11.2 §22 | `useWizardController.ts` | 1,110 | **1,047** — §3.4; the honest reading is in §10 |
| 11.4 §11 | `ApplicationApprovalActions.tsx` | 689 | **366** — §3.2 |
| 11.3 §11 + 10.6 §12 | `ApplicationStatus.tsx` | 807 | **369** — §3.1 |
| 9.4 §15 | `ApplicationDetailModal.tsx` | 1,443 | **785** — §3.3 |
| the bullet itself | backend catalog/application views, onboarding, user pages | 2,072 / 1,570 / 1,174 / 653 | **unchanged** — §9 |

## 2. Behaviour was protected before anything moved

The dispatch's instruction, and 11.2 §10.1's cautionary tale, both reduce to one
rule: **prove the tree green first, then move code, never re-author it.**

### 2.1 The baseline, measured on the unchanged tree

```
cd apps/admissions && bun run test
# Test Files  1 failed | 489 passed | 1 skipped (491)
#      Tests  1 failed | 4538 passed | 1 skipped (4540)
```

[`raw/frontend-test-baseline.txt`](raw/frontend-test-baseline.txt). This is
**exactly** 11.5's recorded candidate, down to the test count, so the tree this
task started from is the tree 11.5 finished with — no drift to account for, and the
one failure is the same pre-existing sign-up helper-copy assertion five lanes have
now each recorded.

### 2.2 Which modules already had characterisation

The dispatch's precondition. Checked before any file moved:

| Module | Characterisation at dispatch |
|---|---|
| `ApplicationStatus.tsx` | **yes** — `studentWorkspaceConsolidation.test.tsx`, 51 cases (task 10.6) + `student-lifecycle-golden.spec.ts` + `test_bug2_*` (2 files, 11 cases) |
| `ApplicationApprovalActions.tsx` | **yes** — `approvalFlowPreservation` (source text) + `admissionsFlowPreservation` (renders and compares labels) + `adminMobileCompleteness` (26) + `adminRouteActionParity` |
| `ApplicationDetailModal.tsx` | **yes** — `reviewWorkspaceServerOwned.test.tsx`, 25 cases (task 9.4) |
| `useWizardController.ts` | **yes** — `useWizardController.contract.test.ts` + 11 more suites, 105 cases |
| backend catalog/application views | **not audited here** — §9 |

Nothing in this task's scope needed characterisation written from scratch, which is
why §9's backend deferral is the honest boundary rather than a convenience: writing
characterisation for a 2,072-line view module is the first half of that work, not a
footnote to this one.

### 2.3 What "lift verbatim" was made to mean

Three different mechanisms, in increasing strictness:

1. `ApplicationStatus.tsx` and `ApplicationApprovalActions.tsx` — blocks moved by
   hand, then the existing characterisation re-run. The render-comparing suites
   (`admissionsFlowPreservation`, `adminMobileCompleteness`) are the real guard
   here: they assert the rendered button set per `status × paymentStatus`, so a
   dropped branch fails immediately.
2. `ApplicationDetailModal.tsx` — the four sub-components extracted **by line
   range** with a script, then the missing imports added one at a time from
   `tsc`'s own output. No block retyped.
3. `useWizardController.ts` — extracted by line range **and asserted
   byte-identical before the file is written**
   ([`raw/wizard-extract.py`](raw/wizard-extract.py)). §3.6.

## 3. The four splits

### 3.1 `ApplicationStatus.tsx` — 807 → 369

The module 11.3 §11 recorded as *"591 → 804 lines, and it is still one long page.
Task 12.1 owns the split"*, and 10.6 §12 recorded as *"this task added the
protection — 50 cases and a browser journey — which is the precondition that task
names, not the split itself."*

Four concerns, four owners, following the shape task 9.4 established for the
admin side (`hooks/admin/useReviewWorkspace.ts` + `workspaceAdapters.ts` +
`ReviewReadinessPanel.tsx`):

| Module | What it owns |
|---|---|
| `hooks/student/useApplicationWorkspace.ts` | the one detail read, the conditions / amendments / waitlist reads, and the withdraw / enroll / amend / condition-evidence commands with the state each owns. Every cache key, `enabled` predicate, `staleTime`, invalidation and toast is the one that was there |
| `…/applicationStatus/applicationTimeline.ts` | `buildApplicationTimeline` — was a closure named `getTimeline` reading `application` from component scope. The only edit is that the application arrives as an argument |
| `…/applicationStatus/workspacePresentation.ts` | the status label, the fee sentence, the institution display-snapshot read, the title and the subtitle |
| `…/applicationStatus/ApplicationDetailsSection.tsx`, `WorkspaceAside.tsx` | two sections that were inline JSX |

**Two things this made possible that were not possible before.**

The fee copy is now testable. `resolvePaymentStatusDescription` has six branches,
one of which is task 10.6's `deferred` case — the sentence that closed a real dead
end where a student who chose to pay later read *"Payment still needs attention
before review can continue"* and was offered nothing to do, while
`deferred_payment_reminder_task` emailed them about the same fee daily. It was a
five-deep ternary chain inside a component; it is now six table-driven cases plus a
totality case asserting that **no** status the server can send leaves a student
without a sentence.

And the page stopped touching transport. `ApplicationStatus.tsx` was on
`architectureEnforcement`'s pending-migration allowlist for one import:
`AuthenticationError` from `@/services/client`, used by the `queryFn`'s re-throw so
the global auth redirect can fire. The guard moved with the query, the allowlist
entry went stale, and the test's second assertion — the one whose whole purpose is
that the allowlist may only shrink — demanded its removal. **14 → 13 entries**, and
the lint file set dropped by exactly that one file (§5.2).

Stated plainly, because it would be easy to over-claim: the import was
**relocated**, not eliminated. The rule's boundary is `src/pages` + `src/components`;
the hook layer is where task 9.4 put the same concern for the admin workspace; and
`AuthenticationError` is the shared client's error class, which the applications
domain service does not re-export. Inventing a re-export to satisfy a grep would be
worse than saying this here, and the comment in the test says the same thing.

### 3.2 `ApplicationApprovalActions.tsx` — 689 → 366, shaped around two lanes' pins

11.4 §11: *"707 lines, still one long per-status branch tree, and this task added a
prop to it rather than splitting it — deliberately, because two other lanes'
preservation tests read its source."*

Those tests are the constraint, and they are asymmetric:

- `approvalFlowPreservation.property.test.ts` reads **this file's source text** and
  asserts a `currentStatus === '<status>'` branch exists for each of `draft`,
  `submitted`, `under_review`, `approved`, `rejected`, plus
  `handleStatusUpdate('approved')` and `('rejected')` within **1,200 characters** of
  the `under_review` branch. Positional, and about the application-status half only.
- `admissionsFlowPreservation.property.test.ts` **renders** the component and
  compares button labels across `status × paymentStatus`. Behavioural, and about
  both halves.

So the split was shaped to satisfy the first without repointing it: the
**payment** half moved out, the **application-status** branch tree stayed. Both
pins are still literally true, and the render-comparing pin is what proves the
payment half survived the move.

| Module | What moved |
|---|---|
| `paymentReviewCopy.ts` | the dialog copy map — was a `useMemo` over one string, so the memo bought nothing. `notesRequired` is not copy: it is the block's **only** client-side rule (a rejection must carry a reason the student can act on), and it now has a test that does not mount a dialog |
| `useApprovalActionCommands.ts` | `handleStatusUpdate` with its three confirmation gates, the dialog state, and `handlePaymentUpdate` with its `PAYMENT_RECORD_REQUIRED` reading |
| `PaymentDecisionControls.tsx` | the four `normalizedPaymentStatus` branches, the read-only capability explanation, and the notes dialog |
| `approvalActionTokens.ts` | the three outline tone classes and the status callout — **one** definition now shared by both halves rather than two copies |

The tone tokens are worth a sentence. Task 11.5 measured those washes: a
tone-coloured label on a 10 % wash of its own tone is 4.37 : 1 (`warning`) and
4.48 : 1 (`info`), under AA, so the hover wash is `/5`. Two copies of that value is
how one of them drifts back to `/10` in six months. A new case asserts both modules
import the shared tokens and neither redeclares them.

### 3.3 `ApplicationDetailModal.tsx` — 1,443 → 785

Task 9.4 §15 is unusually direct about this file:

> **`MAINT-01` is not closed by line count, and `ApplicationDetailModal.tsx` did
> not shrink.** It went from 846 to 1365 lines. What moved out is the
> *orchestration* … What stayed — and grew — is rendering.

So this task moved the rendering, plus the layer between the two:

| Module | Lines | What it is |
|---|---:|---|
| `useReviewWorkspaceSession.ts` | 337 | the one read, its six projections, the conflict-aware `runCommand`, and the eleven versioned decision handlers |
| `ReviewDecisionLists.tsx` | 234 | `AmendmentReviewList` + `ConditionReviewList` — the two paths that had no control before 9.4 added them |
| `AssignReviewerControl.tsx` | 179 | reviewer assignment (AUTH-03), with its own popover and candidate search |
| `GradesDisplay.tsx` | 111 | persisted canonical grades, read-only by design |

Every contract is unchanged and 9.4's 25 cases say so: each command still sends the
`version` the read returned; a 409 `VERSION_CONFLICT` is still reported as *someone
else decided first* and still refetches rather than surfacing a generic failure;
capabilities still come from `workspace.capabilities` and still fail closed to
`NO_WORKSPACE_CAPABILITIES`; and the backend still re-enforces every check.

What stayed in the component is the **sheet**: `isClient`, `activeTab`, the
notification modal, the focus trap, and the markup. That division is stated in the
hook's header, because "why is this state here and that state there" is the
question a future reader will actually have.

### 3.4 `useWizardController.ts` — 1,110 → 1,047, and why that number is small

11.2 §22 named five things: *"state, catalog/identity resolution, the
grades/uploads/OCR adapters, the effects and the result object"*. This task took
**one** of the five — catalog/identity resolution — and the honest reading is in
§10, not here.

What moved is the code that answers *which canonical program and which canonical
intake a student means*:

- `findProgramId` — 65 lines. Exact id, then exact name, then an
  institution-hinted tie-break when two programmes share a name, then partial
  name, then `''` to fail validation deliberately.
- `resolveProgramIdentity`, `resolveIntakeIdentity`, `deriveInstitutionLabel`,
  `programIds`, `intakeIds`, and the `programs` / `intakes` state.

This matters more than its line count. The wizard's form holds whatever the draft
restored, which may be a **display name** rather than a UUID; the canonical truth
map makes canonical ids the sole authority for routing and scoping and
`applications.program` / `.intake` display snapshots. `findProgramId`'s ladder is
the code that keeps those two apart, and it was 65 unnamed lines in the middle of a
1,110-line hook.

**What stayed, and the reason, because it is an ordering constraint rather than a
preference.** Four effects stayed in the controller: two that copy a query payload
into `programs` / `intakes`, and two that write a resolved id back through
`setValue`. The chain is `programIds` → `schema` → `resolver` → `form` →
`watch('intake')` → `useProgramsForIntake(...)` → `programsData`. So the state and
the resolvers must exist **before** the form, and the effects that populate them
read a query that exists **after** it. Moving the effects would mean either
splitting one concern across two hooks for a purely mechanical reason, or
reordering effects in the file whose effect ordering is the thing the reconciliation
exists to defend (the "Order-A race", where the catalog cache resolves before the
draft restore). The constraint is written into the extracted module's header rather
than left to be rediscovered.

### 3.5 The cycle that nearly got worse while the count stayed flat

7 cycles before, 7 after. But the first measurement after the split read a
**118-node** largest component, up from 116, and the cycle *count* would have read
7 → 7 either way.

The cause: `GradesDisplay.tsx` and `PaymentDecisionControls.tsx` imported
`@/components/ui`, the barrel that re-exports every primitive, which puts an
importer inside the pre-existing barrel SCC. Repointed at concrete modules
(`@/components/ui/skeleton`, `@/components/ui/Dialog`, `…/Button`, `…/textarea`,
`…/StatusBadge`) the largest component is back to exactly **116**, and each file
carries a comment saying why the concrete path is deliberate.

Recorded because it is the failure mode of a cycle *count* as a gate: a split can
add nodes to an existing cycle without adding a cycle. The report prints component
size for that reason.

### 3.6 The 11.2 §10.1 lesson, mechanised

11.2 §10.1 re-authored a validation function instead of lifting it and silently
dropped a hydration guard, a duplicate-subject error, an upload guard and six field
labels — caught only by other lanes' property tests.

So the wizard extraction is done by a script that asserts its own boundaries and
then asserts the moved text is present byte-for-byte in what it writes, before it
writes it:

```python
assert lines[256].strip() == 'const findProgramId = useCallback('
...
for label, block in [('state', state_block), ('resolvers', resolver_block)]:
    assert '\n'.join(block) in written, label
```

[`raw/wizard-extract.py`](raw/wizard-extract.py). It printed *"all four blocks
byte-identical"*. The same line-range mechanism moved the four sub-components out
of `ApplicationDetailModal.tsx`; the missing imports were then added one at a time
from `tsc`'s own error list, which names each missing symbol and its line rather
than leaving it to a judgement call.

## 4. Characterisation tests unchanged — the claim, and its one caveat

### 4.1 The arithmetic closes exactly

| Run | Result |
|---|---|
| baseline (unchanged tree) | 1 failed, **4538** passed, 1 skipped (491 files) — [`raw/frontend-test-baseline.txt`](raw/frontend-test-baseline.txt) |
| **candidate** | 1 failed, **4584** passed, 1 skipped (493 files) — [`raw/frontend-test.txt`](raw/frontend-test.txt) |

- **New failures: 0.** The one failure is the same one 11.1, 11.2, 11.3, 11.4 and
  11.5 each recorded: `authPageFormMarkup.test.tsx > uses honest helper copy instead
  of fake email availability states` — the **sign-up page's** helper copy, which this
  task does not touch. Not fixed here; this task claims no repair of another lane's
  failure.
- **4538 + 46 = 4584**, and **no case was deleted**. The +46 is 29
  (`applicationWorkspaceDecomposition.test.ts`) + 17
  (`approvalActionsDecomposition.test.tsx`). File count 491 + 2 = 493. Both closes
  are exact, which is the check that matters for a task whose whole claim is "the
  behaviour is the same": a split that quietly lost a case would show up as a
  smaller delta, not as a failure.
- Checked explicitly, because these are the suites that read the four modules:
  `studentWorkspaceConsolidation` (51), `reviewWorkspaceServerOwned` (25),
  `adminMobileCompleteness` (26), `approvalFlowPreservation`,
  `approvalFlowBugCondition`, `admissionsFlowPreservation`,
  `admissionsFlowBugCondition`, `adminRouteActionParity`, `productDesignDeFluff`
  (70), `useWizardController.contract` and the eleven other wizard suites (105) —
  all pass, none altered in what it asserts.

### 4.2 Eight source-location pins repointed, and not one behavioural claim changed

This is the caveat, stated in full rather than folded into the diff. **Eight
assertions broke, and every single one was a claim about which file a string lives
in.** No assertion about behaviour broke at any point in this task.

That is itself the finding worth carrying forward. MAINT-01's remedy is *"add
characterization tests, then split by bounded workflow"* — and a test that reads
`readFileSync(oneFile)` cannot survive the second half of that sentence. Where a
suite already had a module-set convention, this task used it; where it did not, it
introduced one and said so.

| # | Pin | Was | Is | Why |
|---|---|---|---|---|
| 1 | `studentWorkspaceConsolidation.test.tsx` — 51 cases, `WORKSPACE_SOURCE` / `WORKSPACE_CODE` | `readFileSync('pages/student/ApplicationStatus.tsx')` | the concatenation of the page **plus the five modules the split extracted from it**, named explicitly | 10+ of the 51 cases read the page's text (`TrackingLinkAction`, `label="Nationality"`, `<ConditionsTimeline`, the `application-workspace` cache key, `hasDeferredFee`, …). The set is finite and derived from the page's own imports, **not** its transitive closure — a transitive walk would drag in `components/ui` and make every `not.toContain` claim vacuous. **Stronger than before**: a claim can no longer be satisfied by leaving a string in a file nothing renders |
| 2 | `productDesignDeFluff.test.tsx` — the decision block's raw-palette claim and its `StatusBadge`-label claim | `readCode('ApplicationApprovalActions.tsx')` | `DECISION_BLOCK_MODULES` — the component + `PaymentDecisionControls.tsx` + `approvalActionTokens.ts` | Three of the eleven required labels (`Awaiting Payment`, `Deferred`, `Verified`) moved with the payment branches that render them. **Strictly more surface scanned**, same rule |
| 3 | `mobileResponsiveness.test.ts` — 22.4, "uses Button or delegates" | `readComponent(page)` (single file) | `readPageWithExtractedComponents(page)` | The page's two `onClick` handlers moved into the aside it extracted. The walker is **this file's own** answer to exactly that — its docstring says *"so that extracted sub-components are still considered part of the page's surface area"* — and 22.3's sibling cases already use it. It is a strict superset of the single-file read, so no page that passed before can fail now |
| 4 | `test_bug2_auth_error.test.ts` — 3 cases, `APPLICATION_STATUS_PATH` | the page | `hooks/student/useApplicationWorkspace.ts` | The `queryFn` these cases exist to defend — including the `AuthenticationError` re-throw that lets the global auth redirect fire — is in the hook now, verbatim. Pure path repoint |
| 5 | `test_bug2_preservation.test.ts` — the `enabled` gate | `toContain('enabled: !!id && !!user')` | `toContain('enabled: !!id && enabled')` in the hook **and** `toContain('useApplicationWorkspace(id, !!user)')` in the page | The gate is now stated in two places, so the assertion is stated in two halves. A hook that reached into `AuthContext` itself to preserve one literal would be the worse design; the assertion follows the code rather than the code following the assertion |
| 6 | `test_bug2_preservation.test.ts` — the `ErrorDisplay` branch | the page (via the shared constant) | the page (via an explicit page constant) | This one is about *rendering*, and rendering did not move. It only broke because it shared a constant with #4 |
| 7 | `architectureEnforcement.test.ts` — `LEGACY_EXCEPTIONS` | included `src/pages/student/ApplicationStatus.tsx` | entry removed, **14 → 13** | Not a repoint: the test's second assertion exists so the allowlist can only shrink, and it **demanded** this removal once the page stopped importing the raw client. §3.1 states that the import was relocated into the hook layer, not eliminated |
| 8 | `useWizardController.contract.test.ts` | already a 4-file module set (task 11.2 established it) | unchanged | Nothing to repoint — 11.2 had already faced this and written the convention this task follows elsewhere |

Two pins that **did not** need repointing, because the split was shaped around
them: `approvalFlowPreservation`'s five `currentStatus === '<status>'` source
assertions and its 1,200-character `handleStatusUpdate` adjacency window (§3.2).
The dispatch permitted either keeping the claim true or repointing and saying so;
keeping it true was available here, so it was taken.

### 4.3 What the two new test files add that no existing suite could

Not coverage for its own sake — both files test something that was **unreachable**
while the code was inside a component.

`applicationWorkspaceDecomposition.test.ts` (29 cases): the timeline builder's
every branch (draft vs submitted opening step, `submitted_at` fallback, past vs
future interview completion, cancelled-interview omission, the seven statuses that
add the review step and the four that do not, three decision sentences,
`decision_date` preference, enrolled's two rows in order, expired vs
enrollment-expired, withdrawal), the fee copy's six branches **plus a totality case
over six unknown statuses**, and the presentation builder's title / subtitle /
institution-snapshot / deferral / review-note / status-label answers.

`approvalActionsDecomposition.test.tsx` (17 cases): the dialog copy map for all
four decisions plus five unknown inputs, a case asserting `notesRequired` is true
for **exactly** `rejected` and `deferred`, the payment half's four rendered
branches, the verified terminal state, the no-capability explanation, the
`showStatusSummary` suppression, the whole-block disabled state, one shared tone
vocabulary, the two source pins that stayed true, and a case that no module of the
block reaches the network.

## 5. Verification (verbatim)

### 5.1 Frontend suites

§4.1. `1 failed | 4584 passed | 1 skipped (4586)` over 493 files; 0 new failures.

### 5.2 Lint

```
cd apps/admissions && bun run lint    # 15 errors, 13 files
```

**15, down from 11.5's 16**, and the file set is 11.5's **minus exactly one**:

```
$ diff <11.5's 14 files> <this task's 13 files>
3d2
< src/pages/student/ApplicationStatus.tsx
```

[`raw/frontend-lint.txt`](raw/frontend-lint.txt),
[`raw/frontend-lint-files.txt`](raw/frontend-lint-files.txt). The file that left is
§3.1's: the page no longer imports the raw transport client, so the
`no-restricted-imports` error and the `LEGACY_EXCEPTIONS` entry went together. That
is R14.3 satisfied by removing a violation rather than by an `eslint-disable`.

None of the 13 remaining files is one this task created: the 5 new student-workspace
modules, the 4 new decision-block modules, the 4 new review-workspace modules, the
new wizard module, the new report script and the two new test files contribute
**zero** findings.

### 5.3 Type-check and build

```
cd apps/admissions && bun run build   # exit 0
```

Including `tsc -p tsconfig.build.json --noEmit` and the CSP gate —
[`raw/frontend-build.txt`](raw/frontend-build.txt). `tsc` was the working
instrument for this task rather than a final gate: the `ApplicationDetailModal`
extraction produced a list of named missing-symbol errors, and working through that
list is what made "add the imports the moved code needs" a mechanical step instead
of a judgement call.

### 5.4 The size, dependency and cycle report

```
bun scripts/module-size-report.ts --threshold 400            # working tree
bun scripts/module-size-report.ts --threshold 400 --ref HEAD # the base commit
```

| Measure | Before | After |
|---|---:|---:|
| `apps/admissions/src` files over 400 lines | 57 | **55** |
| over 800 | 13 | **11** |
| over 1,000 | 4 | **3** |
| `backend/apps` files over 400 lines | 73 | 73 |
| import cycles | 7 | **7** |
| largest SCC | 116 | **116** |

[`raw/size-dependency-before.txt`](raw/size-dependency-before.txt),
[`raw/size-dependency-after.txt`](raw/size-dependency-after.txt),
[`raw/module-sizes.md`](raw/module-sizes.md).

The tool is new and deliberately dependency-free — no madge, no
dependency-cruiser. It resolves the two module systems this repo actually has
(TS/TSX with the `@/` alias, including **dynamic** `import()` because this app
route-splits with it, and Python packages under `backend/apps`), excludes
`src/generated/` (`api.d.ts` alone is 24k lines and would dominate every number),
and runs Tarjan iteratively because a 900-module graph exceeds the JS stack. `--ref`
extracts a git ref with `git archive` into a temp directory and measures there, so a
"before" is reproducible rather than remembered.

### 5.5 Django check

```
cd backend && env -u TESTING -u REDIS_URL .venv/bin/python3 manage.py check
# System check identified no issues (1 silenced).
```

No `TESTING=1`, no substitute `REDIS_URL` —
[`raw/django-check.txt`](raw/django-check.txt). Run for one reason: to make the
"no backend change at all" claim in §9 a measurement rather than an assertion.

### 5.6 The browser gate

Isolated local harness (task 0.4), strict gates active,
`HARNESS_PW_CHANNEL=chrome`, SPA rebuilt **after** every source change, measured
on a **freshly seeded** stack (torn down, volumes wiped, brought up again), and
**torn down afterwards**.

| Run | Result |
|---|---|
| the whole required profile, **fresh stack** | **216 passed**, 4 failed, **0 did not run** ([`raw/harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| the two extra failures, **re-run in isolation on the same live stack** | 1 of 2 passes; the other moves project ([`raw/harness-flake-isolation.txt`](raw/harness-flake-isolation.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`raw/harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | `{"broker_queue_depth": 0, "unsettled_payment_collections": 0, "unsettled_references": []}` ([`raw/harness-drain.txt`](raw/harness-drain.txt)) |
| teardown | 0 harness containers, 0 harness volumes ([`raw/harness-down.txt`](raw/harness-down.txt)) |

Against 11.5's **218 passed / 2 failed / 0 did not run**: the total is the same
**220**, and this task adds no journey (§"The browser gate", above — it changes no
rendered output, so a new journey would assert nothing a current one does not).

### 5.7 The four failures, attributed — and one of them re-run to prove it

| Failure | Reading |
|---|---|
| `tenant-launch.spec.ts:139` × **both** projects | **stable pre-existing.** The same pair tasks 10.5, 10.6, 11.1, 11.2 (both passes), 11.3, 11.4 and 11.5 each recorded at this base commit. Its assertion is `getByText('Fees')` against a `Program Fees` step label the onboarding wizard renders `hidden` on mobile — the tenant lane's, not this one's. Note the label it wants lives in `TenantOnboardingWizard.tsx`, which §10 records as **not split by this task** |
| `student-wizard-mobile.spec.ts:279` [chromium] | **flake, confirmed by re-run.** 11.3 §4.6 catalogued this exact spec:line as one of three that *"each failed once on the accumulated stack and each passes in isolation on the same build"*. Re-run here on the **same live stack**, both projects: it **passes** ([`raw/harness-flake-isolation.txt`](raw/harness-flake-isolation.txt)). A wizard-step race of the species 11.2 §16–§17 documented |
| `admin-dashboard-metrics.spec.ts:356` [mobile] | **flake, confirmed by re-run — and by *which* project it chose.** 11.3 §4.6 catalogued it; 11.5 §5.5 recorded it failing *"on runs 4 and 5 (once on one project, once on both)"*. The full run here failed it on **mobile**; the isolated re-run failed it on **chromium** and passed it on mobile. A failure that changes project between runs of the same build is not a regression. Its assertion is `getByTestId('dashboard-freshness')` on `/admin/dashboard` — task 9.2's surface (`pages/admin/Dashboard.tsx`, `services/admin/dashboard.ts`), neither of which this task touches |

None of the four is fixed here, and none is this task's. Stated with the evidence
that distinguishes "not mine" from "not looked at": the two flakes were re-run, and
the stable pair has seven prior recordings.

## 6. Design (PRODUCT.md / DESIGN.md)

- **No new token, colour, font, size, shadow tier or motion.** This task moves
  markup; the only class-level change anywhere is the two barrel→concrete import
  repoints in §3.5, which change no class.
- **The tone vocabulary got harder to break, not softer** (§3.2): `OUTLINE_*` and
  `STATUS_CALLOUT` have one definition, in one module, with 11.5's contrast
  measurements written above them, and a case asserting neither consumer
  redeclares them.
- **`StatusBadge`'s "never colour alone" guarantee is untouched** and 11.5's claim
  now scans three modules rather than one (§4.2 #2), so the eleven labels it
  requires cannot be lost to a move.
- **44 px targets, reduced motion, one container deep, no gradient/glassmorphism/
  emoji** — all unchanged, and `productDesignDeFluff`'s 70 cases (including its
  whole-tree 44 px scan and its six contrast guards) pass.

## 7. Hard constraints

- **Auto-save untouched.** The wizard extraction took the catalog lists and the
  identity resolvers. It touched no `useAutoSave` consumer, no `useSmartAutoSave`,
  no draft persistence, no `SaveStatusIndicator`, and no hydration path — and
  `test_bug3_hydration_race`, `test_bug3_preservation`, `draftRoundTrip` and
  `submissionPayload` all pass unchanged.
- **Mobile-first usability preserved.** No rendered output changed; the mobile
  project's 108 journeys are the measurement.
- **Backend permissions remain the only boundary.** Nothing here decides whether a
  command is authorized. `canVerifyPayment` still comes from the server's published
  command matrix; `workspace.capabilities` still fails closed to
  `NO_WORKSPACE_CAPABILITIES`; every command still goes through the endpoint that
  re-enforces it. The extracted hooks talk to domain service modules and to
  callbacks their callers supply — a case asserts no module of the decision block
  reaches the network at all.
- **Every write is still a versioned command.** 9.4's version/409 contract is
  asserted by its own 25 cases, which passed unaltered.
- **Tenant isolation unchanged.** No scoping decision moved; no query gained or lost
  a filter.
- **No PII.** This task moves labels, class names and status strings.
- **Backward compatibility.** No schema, no contract, no route, no capability. The
  catalogue stays at 17 `platform.*` + 17 `tenant.*`. Nothing to rehearse on Neon,
  nothing to regenerate.

## 8. Constraints the bullet imposes, and how each was honoured

> Follow existing domain patterns; do not add generic repositories or a new state
> library without measured need.

- **No generic repository.** Every extracted hook is named for one workspace and
  returns that workspace's own data and commands. There is no
  `useResource<T>`, no `createStore`, no shared base class, and no abstraction
  parameterised over entity type.
- **No new state library.** React `useState` + React Query + the existing Zustand
  toast store, exactly as before. No dependency was added to `package.json` by this
  task.
- **Existing domain patterns followed, not invented.** Orchestration hooks →
  `src/hooks/{admin,student}/use*.ts`, which is where task 9.4 put
  `useReviewWorkspace.ts`. Presentational sections → `src/components/{admin,student}/{domain}/`,
  which is where the nine existing `applicationStatus/` sections already live. Pure
  derivation → beside the component that renders it, which is where 9.4 put
  `workspaceAdapters.ts`. The wizard's sub-hook went to
  `applicationWizard/hooks/wizard/`, joining the eleven task 11.2 put there.
- **`src/lib/` deliberately not used** for the two pure student modules. They are one
  surface's derivation, not platform-wide helpers; `lib/` is where
  `studentNextAction.ts` and `paymentStatus.ts` live *because* four surfaces read
  them. Putting a one-caller function there would be the beginning of the
  catch-all that MAINT-01 is about.

## 9. The backend half was not done in the first pass, and that was the reason for `[-]`

> **Corrected by the second pass.** This section was written as *"the backend half
> is not done"*, and for the first pass that was true and measured. It is **no
> longer true**: the second pass split `catalog/admin_views.py` and
> `catalog/views.py`, and §12–§20 are the record. Two things in this section
> survive unchanged and are the reason it is corrected rather than deleted:
> **reason #1 is the gating step the second pass had to do first** (and did —
> §13), and **reasons #2 and #3 still stand exactly as written** —
> `catalog/services.py` is still untouched (§21) and the two backend cycles were
> read before anything moved (§17). The table below is the pre-second-pass state;
> `admin_views.py` is now 96 lines and `views.py` 85.

The bullet names *"large catalog/application views"* on the backend and *"onboarding
and user pages"* on the frontend. In the first pass **none of them changed**, and
`manage.py check` in §5.5 is the measurement of that, not a formality.

| Module | Lines | Fan-in | Fan-out |
|---|---:|---:|---:|
| `backend/apps/catalog/admin_views.py` | 2,072 | 2 | 18 |
| `backend/apps/catalog/services.py` | 1,871 | **47** | 3 |
| `backend/apps/applications/readiness_service.py` | 1,734 | 3 | 10 |
| `backend/apps/catalog/views.py` | 1,570 | 1 | 13 |
| `backend/apps/applications/query_service.py` | 1,359 | 4 | 7 |
| … 68 more over 400 lines | | | |

Why this was not attempted *in the first pass* rather than attempted badly:

1. **The precondition is not met.** *(Second pass: met — it wrote the
   characterisation first, §13.)* §2.2 is the audit: every frontend module this
   task split already had characterisation, written by the lane that grew it.
   `catalog/admin_views.py` and `catalog/views.py` have endpoint tests, but not
   characterisation of the kind a split needs — a per-view record of request shape,
   authority resolution, scoping order, envelope and error code that would fail if a
   move dropped one. Writing that for 3,642 lines of view code across two modules is
   the first half of the work, not a footnote to this one.
2. **`catalog/services.py` has 47 first-party importers** *(52 after the second
   pass — §20 measures the rise and §21 explains why it makes this reason
   stronger, not weaker)* — the highest fan-in in the repo, because it holds
   `AdminCapabilityService`, the authority every tenant-sensitive decision
   resolves through. A split there is a change to the
   authority model's own module boundary, and steering is explicit that
   authorization must resolve through that one service. It needs its own task, its
   own cross-tenant denial matrix, and a decision recorded in the canonical truth
   map.
3. **The two backend cycles a split would have to respect are pre-existing and
   real**: the 7-module `applications` cycle
   (`_view_helpers` → `condition_evidence_service` → `condition_manager` →
   `enrollment_service` → `serializers` → `services` → `waitlist_manager`) and the
   3-module `payment_service_mixins` cycle. Splitting a view module that imports into
   that cycle without first understanding it is how a cycle count goes from 7 to 9.

The frontend modules the bullet names and this task did not split:

| Module | Lines | Why not |
|---|---:|---|
| `pages/admin/tenants/TenantOnboardingWizard.tsx` | 1,174 | the tenant lane's; `tenant-launch.spec.ts:139` — the stable failure §5.7 attributes — asserts against *this file's* step labels, so a split here must fix or repoint that assertion, which is the tenant lane's call |
| `pages/admin/Applications.tsx` | 869 | the roster page; §10 restates its unfixed client-side pagination remnant |
| `pages/admin/AuditTrail.tsx` | 897 | 11.4 §11 recorded its page-only export as an open R6.5 gap; a split should not land before that decision |
| `pages/admin/Users.tsx` | 653 | the user directory (task 9.3's lane) |
| `pages/student/Settings.tsx` | 710 | dirty-state and autosave-critical; needs its own characterisation first |
| `applicationWizard/index.tsx` | 1,091 | 11.2's lane; the wizard's own view composition |
| `services/*.ts` (910 / 950 / 857 / 787) | | domain service modules are *already* the pattern R14.3 asks for; length there is API surface, not mixed concerns |

## 10. Not claimed here, and what remains

- **`useWizardController.ts` is 1,047 lines and is the least-finished of the
  four.** 11.2 §22 named five things; this task took one (§3.4). The four that
  remain: the controller's own ~30 `useState` declarations, the grades/uploads/OCR
  adapters, the remaining effects, and the ~120-key result object. The result object
  is the interesting one and the reason a naive split would be worse than none: 3
  consumers destructure it, `applicationWizard/index.tsx` is 1,091 lines of that
  destructuring, and splitting the object without splitting its consumer moves the
  problem rather than solving it.
- **The controller's 14 pre-existing dead imports remain** — task 12.4's lane, as
  11.2 §18 recorded. This task added none and removed none.
- ~~**The backend is untouched** — §9, with the numbers.~~ **True of the first
  pass only.** The second pass split both catalog view modules; §12–§20. What
  remains untouched on the backend, and why, is §21.
- **`ApplicationDetailModal.tsx` is 785 lines**, not small. What remains is the
  overview tab (~300 lines of field rendering) and the tab bar with its keyboard
  handling. Both are markup; neither mixes concerns any more.
- **The roster's table view still paginates and searches in the browser.** 11.4 §11
  named it (`ApplicationsTableView` hands `EnhancedDataTable` a `pageSize={10}` and a
  client search over a server page) and called it *"a live remnant of ADM-01's habit
  [that] belongs to whoever finishes that lane"*. This task did not fix it, and it is
  outside this bullet — the bullet is about splitting modules, not about moving a
  query to the server. Restated rather than quietly dropped.
- **The dashboard row's per-row waitlist and conditions `useQuery` calls remain.**
  11.3 §11 named them and said *"they are the kind of per-row request task 12.1's
  consolidation should answer"*. They were not answered. The honest reading: this
  task's bullet is decomposition, and consolidating two per-row reads into one
  server contract is a **behaviour** change to a read path — the opposite of "without
  changing behavior". It needs an endpoint decision (the applications list would have
  to carry waitlist position and condition counts), which is task 9.1's contract, not
  a refactor. Named as unfinished rather than reinterpreted as out of scope.
- **The platform-wide audit export is still the loaded page** — 11.4 §11 and 11.5
  §10. Unchanged.
- **The 15 lint errors are not fixed** beyond the one that disappeared with §3.1's
  migration, and **`tenant-launch.spec.ts:139`**, the sign-up helper-copy test, and
  the two flakes in §5.7 are not fixed. Each is measured against a real run and
  attributed elsewhere.
- **`bun run validate:tailwind` is still a broken npm script** (points at a shell
  script that has never existed; exits 127). 11.5 §10 recorded it; still true, still
  unrelated.
- **No new capability, route, endpoint, schema or contract.**

## 11. What the next dispatch on this task should do first

Stated because the ordering is not obvious and getting it wrong is expensive:

1. **Write characterisation for `catalog/admin_views.py` and `catalog/views.py`
   before touching either** — per view: authority resolved, scoping applied *before*
   lookup, request shape, envelope, and every registered error code. §9 explains why
   this is the gating step.
2. **Leave `catalog/services.py` for its own task.** 47 importers and the authority
   model; a module-boundary change there needs a canonical-truth-map entry and a
   cross-tenant denial matrix, not a refactor pass.
3. **Read the two pre-existing backend cycles first** (§9 #3), so a view split does
   not import into one.
4. **For `TenantOnboardingWizard.tsx`, resolve `tenant-launch.spec.ts:139` first** —
   the failing assertion reads that file's step labels, so a split without a decision
   on it either inherits a failure or silently repoints a claim.
5. **Use the size report on both sides of every split**
   (`bun scripts/module-size-report.ts`), and watch the **largest SCC**, not only the
   cycle count — §3.5 is why.

---
---

# Second pass — the backend half

- Captured: 2026-08-11 (UTC). Same base commit
  `bae29a28d9657f288b3339062adb31285959c966`, same working-tree candidate.
- Ran in two sittings. The first wrote the characterisation suite and performed
  the split; a transport failure ended it before anything was measured. This
  document's second-pass half is the measurement, the one regression the split
  actually caused and its fix, and the close.
- **Schema: no.** §14 is the OpenAPI schema regenerated and **byte-identical**
  (SHA-256 `35fe05d4…`) to a pre-split anchor. No SQL, no migration, no model,
  no route, no capability.
- PBT: still **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing recorded through
  `update_pbt_status`; no numbered spec property claimed. The 187-case
  characterisation suite is example-based by design (§13).
- **Work already on disk was verified, not redone.** The split was already
  written when this sitting began. §12 is how byte-identity was established
  *after the fact*, which is harder than asserting it at write time and is the
  reason this half exists.

## The Required_Evidence claim — second pass

| Claim | Where it is settled |
|---|---|
| **characterization tests unchanged** | §13 (the 187-case suite written **before** the split, 187/187 passing), §15 (the 49-file backend selection: **34 failed / 773 passed / 0 errors**, every failure attributed, and the arithmetic against the pre-split capture closing exactly: 496 passed + 17 artifact-errored = 513), §16 (frontend **1 failed / 4584 passed / 1 skipped over 493 files** — identical to the pass-1 candidate, to the test), and §18 (harness **218 passed / 2 failed / 0 did not run** on a freshly seeded stack) |
| **size/dependency report** | [`raw/size-dependency-pass2-before.txt`](raw/size-dependency-pass2-before.txt) → [`raw/size-dependency-pass2-after.txt`](raw/size-dependency-pass2-after.txt) (the file pass 2 left empty), summarised in §20 and itemised in [`raw/pass2-module-sizes.md`](raw/pass2-module-sizes.md). Over 800: **24 → 22**; over 1,000: **17 → 15**; over 400: **73 → 73**, and §20 says why that is a real reading rather than a null one |
| **no cycle increase** | §17 — **7 → 7** cycles, largest SCC **116 → 116**, and all six backend components byte-identical before and after. The two pre-existing backend cycles were read first, per pass-1 §11 #3 |
| **the split changed no behaviour** | §12 (62 of 94 moved definitions byte-identical to the base commit, the other 32 attributed per definition), §14 (byte-identical OpenAPI contract), and §15's positive measurement: the `canonical_program_list` golden snapshot — a **catalog** endpoint's whole response envelope, committed 2026-06-21 — shows **zero divergence** through the split |

### The browser gate

Unchanged reasoning from the first pass: this task adds **no** browser journey,
because it changes no rendered output. §18 records the existing ones passing on a
fresh stack.

## What the second pass establishes

1. **Byte-identity can be established after the fact, and was** (§12). The
   extraction script's `--plan verify` needs a retained pre-split copy; none was
   kept, so it correctly reports *"no pre-split copy retained; skipping"* and
   proves nothing. The substitute anchors on the base commit and reports, per
   definition, byte-identical / differs-with-a-diff / absent-at-anchor, then
   proves the split is a **partition** — nothing invented, nothing lost.
2. **The split caused exactly one regression, and it was a gate, not a
   behaviour** (§19). `test_view_auth_classification.py` went **38 → 75**
   unclassified views, because its discovery keys on `obj.__module__` and 37
   classified views changed defining module. Repointed: back to exactly **38**,
   the **same view set**. This is the one thing in this task that was genuinely
   this pass's to fix, and the dispatch was right to predict it.
3. **The highest-risk thing was the safest** (§14). Nine named response
   envelopes moved into `_catalog_view_helpers.py`, and drf-spectacular derives
   component names from classes — a rename would be a contract break. The schema
   is byte-identical, 214 components, 0 renamed. It could not have drifted,
   because those names are explicit arguments to `envelope_serializer(name, …)`,
   but the measurement is the evidence and the argument is only the explanation.
4. **A re-export shim has to re-export the private names too, and the tests say
   which** (§13.3). Several suites patch
   `apps.catalog.views.{Program,Intake,Subject,Institution}.objects` and
   `apps.catalog.views.StandardPagination.paginate_queryset`; `test_perf_catalog_cache.py`
   imports `_catalog_scope_signature` and `test_perf_scoped_cache_ttl.py` imports
   `_CATALOG_CACHE_TTL`. `import *` skips underscore names, so both shims list
   them explicitly. All those suites pass.
5. **The count that did not move is the honest headline** (§20). Backend files
   over 400 lines: **73 → 73**. Two files left the band and two of their pieces
   entered it. The bands that moved are over 800 (24 → 22) and over 1,000
   (17 → 15), and both moves are these two files. Reporting 73 → 73 first is the
   point — a decomposition that halves the largest module does not necessarily
   move a threshold count, and pass 1 §3.5 is the same lesson about cycles.
6. **The cost is a fan-in rise, and it is measured, not glossed** (§20). Fourteen
   modules import what two did, so `catalog/models.py` went 58 → 68 importers,
   `catalog/services.py` **47 → 52**, `admin_serializers.py` 2 → 8. The
   `services.py` number is why §21 keeps declining it.
7. **The "before" number in the pass-2 baseline was unmeasurable, and is now
   measured** (§15.1). Its 17 errors were all one
   `psycopg2.errors.DuplicateDatabase` — a concurrent test-DB collision, not a
   signal. Re-run serially with no other pytest process, those 17 tests run and
   pass, and the reconciliation closes to the test.

## Files added by the second pass

```
docs/v2-evidence/12.1/raw/
├── backend-view-extract.py             (the AST-span extractor, written by pass 2)
├── backend-split-identity-check.py     (NEW — how byte-identity was established, §12)
├── backend-split-identity.txt          (NEW — its output: 62/94 identical, partition clean)
├── openapi-schema-pass2.txt            (NEW — byte-identical schema + why the anchor is valid)
├── django-check-pass2.txt              (NEW — no issues, no TESTING=1, no substitute REDIS_URL)
├── pass2-backend-selection.txt         (NEW — the exact 49 files §15 ran)
├── pass2-catalog-suites-before.txt     (pass 2's pre-split capture: 20F/802P/6s/17 ERRORS)
├── pass2-catalog-suites-after.txt      (NEW — serial, 0 errors: 34F/773P over 49 files)
├── pass2-characterisation-suite.txt    (NEW — 187 passed)
├── pass2-module-sizes.md               (NEW — every module before → after, + the fan-in cost)
├── size-dependency-pass2-before.txt    (pass 2's before-scan)
├── size-dependency-pass2-after.txt     (NEW — the after-scan pass 2 left empty)
├── pass2-frontend-test.txt             (NEW — 1F/4584P/1s over 493 files)
├── pass2-frontend-lint.txt             (NEW — 15 errors, 13 files)
├── pass2-frontend-lint-files.txt       (NEW — the 13, identical to pass 1's 13)
├── pass2-frontend-build.txt            (NEW — exit 0, incl. tsc and the CSP gate)
├── pass2-harness-up.txt                (NEW — fresh stack: volumes wiped, rebuilt, reseeded)
├── pass2-harness-required-suite.txt    (NEW — 218 passed, 2 failed, 0 did not run)
├── pass2-harness-gatecheck.txt         (NEW — 4 failed, as required)
├── pass2-harness-drain.txt             (NEW — broker 0, unsettled collections 0)
└── pass2-harness-down.txt              (NEW — teardown: 0 containers, 0 volumes)
```

Source of the change. Every row is an extraction; no row changes an endpoint's
answer. Full table with per-module responsibilities in
[`raw/pass2-module-sizes.md`](raw/pass2-module-sizes.md).

| Path | Lines | What it is |
|---|---|---|
| **`backend/apps/catalog/admin_views.py`** | **2,072 → 96** | re-export shim, documented compatibility owner + removal condition |
| `…/catalog/_admin_view_helpers.py` | **new**, 261 | the shared refusal vocabulary, the one capability gate, the one scope resolution, the two institution-child base views |
| `…/catalog/admin_tenant_views.py` | **new**, 208 | the tenant record, readiness, offerings |
| `…/catalog/admin_domain_views.py` | **new**, 496 | the seven domain lifecycle commands |
| `…/catalog/admin_asset_views.py` | **new**, 338 | branding-asset upload + stored-object validation |
| `…/catalog/admin_document_config_views.py` | **new**, 298 | templates, profiles (incl. clone-by-INSERT), required documents |
| `…/catalog/admin_access_views.py` | **new**, 231 | memberships + access grants (session revocation on write) |
| `…/catalog/admin_routing_views.py` | **new**, 157 | the routing simulator |
| `…/catalog/admin_audit_views.py` | **new**, 279 | the platform feed + the per-institution feed |
| **`backend/apps/catalog/views.py`** | **1,570 → 85** | re-export shim, incl. the explicit model/pagination re-exports the patch-based suites need |
| `…/catalog/_catalog_view_helpers.py` | **new**, 398 | the nine named envelopes, the read scope, the read cache |
| `…/catalog/context_views.py` | **new**, 46 | `/catalog/context/` |
| `…/catalog/program_views.py` | **new**, 721 | `/catalog/programs/`, `/canonical-programs/`, `/assignment-preview/` |
| `…/catalog/intake_views.py` | **new**, 256 | `/catalog/intakes/` |
| `…/catalog/subject_views.py` | **new**, 69 | `/catalog/subjects/` |
| `…/catalog/institution_views.py` | **new**, 267 | `/catalog/institutions/` |
| `backend/tests/unit/test_catalog_view_characterisation_12_1.py` | **new**, 1,484 / **187 cases** | the characterisation the first pass named as the gating step — written **before** anything moved |
| `backend/tests/unit/test_view_auth_classification.py` | 37 entries repointed | §19: the one regression the split caused, and its fix |
| `docs/v2-evidence/12.1/raw/backend-view-extract.py` | 856 | the AST-span extractor with write-time byte-identity assertions |
| `docs/v2-evidence/12.1/raw/backend-split-identity-check.py` | **new**, 418 | §12: after-the-fact byte-identity + partition check + the residual bound |

---

## 12. The second pass, the backend half §9 deferred

### 12.1 `--plan verify` proves nothing here, and says so

```
$ python3 docs/v2-evidence/12.1/raw/backend-view-extract.py --plan verify
admin: no pre-split copy retained; skipping
catalog: no pre-split copy retained; skipping
```

That is the script behaving correctly. Its `verify` mode re-diffs against a
retained `_admin_source.py` / `_catalog_source.py`; pass 2 kept neither, and the
pre-split bytes are unrecoverable by every other route too — the file was
overwritten by the shim, and `__pycache__/admin_views.cpython-314.pyc` was
overwritten in the same second (01:38), so even the `.pyc` header's source-size
field is gone. There is no stash and no dangling blob.

**"It imports cleanly" is not evidence**, and neither is "the script asserted
byte-identity when it wrote the file" — files in the split were edited *after* the
script ran (`admin_tenant_views.py` at 01:40, `subject_views.py` at 01:41, both
after the 01:37 batch), so the write-time guarantee does not cover the current
state.

### 12.2 The method that does work: anchor on the base commit, then attribute

[`raw/backend-split-identity-check.py`](raw/backend-split-identity-check.py), output in
[`raw/backend-split-identity.txt`](raw/backend-split-identity.txt). It imports
`backend-view-extract.py` so the span logic **under test is the span logic that
produced the split** — a span bug shows up as a mismatch instead of cancelling
out. Then, per planned definition:

1. `git show HEAD:<module>` into a temp file;
2. cut the definition's exact span out of that copy;
3. assert the span appears **byte-for-byte** in the split module the plan assigns it to;
4. for every mismatch, print a unified diff and require attribution.

Step 4 is necessary because the anchor is not the pre-split state:
`admin_views.py` was **2,072** lines in the working tree at dispatch against
**1,805** at `HEAD`, so 267 lines of *other* lanes' uncommitted work sit between
them. The claim this settles is therefore precise, and it is the right one:
**the split introduced no textual change of its own.**

### 12.3 The result

| | `admin_views.py` | `views.py` |
|---|---:|---:|
| planned definitions | 52 | 42 |
| **byte-identical to the base commit** | **36** | **26** |
| differ (attributed below) | 9 | 11 |
| not present at the base commit | 7 | 5 |

**62 of 94 moved definitions are byte-identical to a commit neither pass could
have edited.** The other 32 split two ways:

- **20 differ**, and every delta's introduced symbols resolve to a module that
  predates the split by *weeks*. The script prints the provenance table:
  `apply_institution_profile_change`, `apply_program_offering_change`,
  `create_institution_domain` ← `canonical_config_commands.py` (mtime
  **2026-07-23**, whose own comments read *"moved here from admin_views"*);
  `mark_deprecated`, `record_catalog_write`,
  `canonical_program_required_response` ← `legacy_write_telemetry.py` (07-23);
  `active_subjects_queryset`, `aliases_by_code`, `SUBJECT_CATALOG_VERSION` ←
  `subject_catalog.py` (07-26); `OfferingDirectoryService` ← `services.py`
  (07-26); `TenantAuditService` ← `tenant_audit_service.py` (08-09). A body that
  calls a function added on 07-23 was written on 07-23, not at 01:37 on 08-11.
  These are tasks 4.4 / 4.5 / 7.1 / 9.5 / R14.7's changes, carried through
  verbatim.
- **12 are absent at the anchor** because an in-flight task added them:
  `AdminTenantDomain{Retry,Approve,Reject,Reactivate}View` and
  `_get_domain_or_404` / `_domain_transition_conflict_response` /
  `_integrity_conflict_response` (task 4.4's lifecycle work), and
  `_resolve_intake_filter` + the four catalog selector/filter constants.

### 12.4 The split is a partition, which a per-definition diff cannot show

Two further checks, both clean:

- **Nothing invented on the way out.** Every top-level definition in the 8 admin
  modules and the 6 catalog modules is in the plan. (86 and 79 further names are
  bound by the hand-written headers — imports, and one `logger`.)
- **Nothing lost on the way out.** Five names exist at the anchor but not in the
  plan, and each is *findable*: `_DOMAIN_VERIFICATION_TOKEN_BYTES`,
  `_generate_dns_target`, `_build_dns_record`, `_domain_verification_base` now
  live in `canonical_config_commands.py` de-underscored, and `_readiness_item` in
  `tenant_readiness.py`. All five are task 4.5's relocations, and both shims
  re-export what callers still reach for. Nothing is defined nowhere.

### 12.5 The bound on anything the method cannot see

Because the pre-split bytes are gone, the arithmetic cannot be made
non-circular. What it *can* do is bound the residual:

```
admin_views.py    HEAD: 1805 = 66 header + 1625 definition + 114 separator/other
                  pre-split (recorded independently): 2072
                  split modules carry: 1873 definition lines
                  => implied pre-split header/import block: 85 (vs 66 at HEAD)

views.py          HEAD: 1356 = 59 header + 1241 definition + 56 separator/other
                  pre-split (recorded independently): 1570
                  split modules carry: 1435 definition lines
                  => implied pre-split header/import block: 79 (vs 59 at HEAD)
```

The pre-split totals (2,072 / 1,570) come from §9's table and
[`raw/size-dependency-pass2-before.txt`](raw/size-dependency-pass2-before.txt) —
measured before the split, independently of this script. The residual headers land
**19 and 20 lines above** the anchor's, which is the right size for the ~13
symbols the deltas newly import across four `from … import` statements. A silently
dropped body would inflate the residual by its own length, so any unaccounted
loss is bounded at **under 20 lines per module**, and the added imports already
occupy that. Stated as a bound rather than a proof, because that is what it is.

## 13. Behaviour was protected before anything moved — and this time it had to be written

§2.2's audit found the backend precondition unmet: those modules had endpoint
tests, but not *characterisation of the kind a split needs*. Pass 2 wrote it
first, which is the correct ordering and the reason this half could proceed.

[`backend/tests/unit/test_catalog_view_characterisation_12_1.py`](../../../backend/tests/unit/test_catalog_view_characterisation_12_1.py)
— 1,484 lines, **187 cases**, all passing
([`raw/pass2-characterisation-suite.txt`](raw/pass2-characterisation-suite.txt)).

### 13.1 Its two design rules are the first pass's own findings, applied

Both are stated in its docstring, and both matter more than the case count:

1. **Nothing in it reads a source file.** §4.2 is the list of eight pins that
   broke during the frontend half, and *every one* was a claim about which file a
   string lives in. A characterisation that cannot survive the move it exists to
   protect is not characterisation. Every assertion here drives a real request
   through the real URL conf and reads the real response. That is why the split
   broke **zero** of its 187 cases.
2. **The contract is declared once, as data.** `ADMIN_VIEW_CONTRACT` and
   `CATALOG_VIEW_CONTRACT` are tables of `(route, view class, methods, capability
   per method, scoping mode, every registered error code)`, and the tests are
   parametrised over them. A view that moves module costs exactly one line (its
   import); a view that silently loses a gate fails.

### 13.2 What it actually pins, per view

- **Route identity** — the URL name, the path and the view class stay bound
  together. This is the assertion a module split must not break, and it is
  checked by `resolve(url).func.view_class is contract.view`.
- **Handler set** — a split that forgets to carry a method leaves a smaller
  handler set; one that merges two views leaves a larger one.
- **Authority, and that it precedes the payload.** Every `platform.*`-gated write
  is driven with a *scoped tenant-admin* (who holds no platform capability) on
  their **own** institution and must answer 403 with a **registered** code — not
  an incidental 500 and not a serializer 400. Then the same request is repeated
  with a deliberately invalid body and must **still** answer 403, which is the
  property an "extract the serializer call into a helper" move can silently
  invert. The other half of the claim is measured too: a super-admin holds every
  one of those capabilities, so the gate is not simply closed.
- **Scope before lookup.** Each institution-child detail surface is probed with
  tenant A's institution id paired with tenant B's item id, as a **super-admin**
  so the capability gate passes and the only thing left deciding the answer is
  the scoped queryset. Answer must be 404, and the body must contain neither
  tenant B's name nor its id. If a split ever fetched the row and scoped
  afterwards, these start succeeding.
- **Envelope and registered error codes** per route.

The fixture that makes this real is `production_scope`, which turns off
`AccessScopeService._test_settings_active` so the suite measures the actual
membership/grant authority rather than the test-admin shortcut.

### 13.3 The shim contract the tests dictated

`import *` skips underscore-prefixed names, and the suites depend on several:

| What a suite does | Why the shim needs an explicit re-export |
|---|---|
| `@patch("apps.catalog.views.Program.objects")` (and `Intake` / `Subject` / `Institution`) | the model names must keep resolving through `views` |
| `@patch("apps.catalog.views.StandardPagination.paginate_queryset")` | same, for the pagination class |
| `test_perf_catalog_cache.py` imports `_catalog_scope_signature` | underscore name, skipped by `import *` |
| `test_perf_scoped_cache_ttl.py` imports `_CATALOG_CACHE_TTL` | same |
| `staff_invitation_views.py` imports `_audit_config_change`, `_scope_institution_ids` from `admin_views` | first-party caller, underscore names |

Both shims list them explicitly, with a comment naming the caller. All of those
suites pass (§15) — `test_perf_catalog_cache.py` and
`test_perf_scoped_cache_ttl.py` included, which is the direct measurement that
this part of the shim works.

## 14. The OpenAPI contract is byte-identical — the highest-risk item, measured

[`raw/openapi-schema-pass2.txt`](raw/openapi-schema-pass2.txt).

The risk is real: nine named response envelopes moved into
`_catalog_view_helpers.py`, and drf-spectacular derives component names from
classes, so a renamed component would be a contract break.

**The anchor is valid, and that is checkable.** `backend/schema/openapi.v2.candidate.yaml`
was generated 2026-08-09 11:48. Every backend `.py` modified between then and now
is one of the split's own 16 files and nothing else:

```
$ cd backend && find apps config -name '*.py' -newermt '2026-08-09 11:48' | sort
# → exactly the 14 split modules + the 2 shims
```

So the only possible cause of a schema difference is the split.

```
$ cd backend && env -u TESTING -u REDIS_URL .venv/bin/python3 manage.py spectacular \
      --file /tmp/schema-after-split.yaml       # exit 0

$ diff schema/openapi.v2.candidate.yaml /tmp/schema-after-split.yaml   # no output

$ sha256sum schema/openapi.v2.candidate.yaml /tmp/schema-after-split.yaml
35fe05d4cd3fa69ddfa9b0f0b3f9370c4649fa83b8258f29dc9100231cc3ef58  schema/openapi.v2.candidate.yaml
35fe05d4cd3fa69ddfa9b0f0b3f9370c4649fa83b8258f29dc9100231cc3ef58  /tmp/schema-after-split.yaml
```

**22,135 lines, 214 components, 0 renamed, 0 added, 0 removed.** No difference to
explain.

The explanation of *why* it could not drift is secondary to the measurement but
worth recording: those envelopes are built by
`apps/common/openapi_helpers.py::envelope_serializer(name, …)` /
`paginated_serializer(name, …)`, so the component name is an **explicit
argument**, not the defining module — which is why they appear as
`CatalogProgramListResponse`, `CatalogInstitutionResponse`,
`CatalogMessageResponse` and so on. A module move cannot touch them.

Generation diagnostics are unchanged and necessarily so (identical output):
3 warnings (`operationId` collisions on `/api/v1/admin/intakes/`,
`/api/v2/admin/change-requests/`, `/api/v2/admin/onboarding/`) and 116
"unable to guess serializer" fallbacks on plain `APIView`s in
`staff_invitation_views.py`, `onboarding_v2_views.py`, `change_request_v2_views.py`
and `common/v2/demo_views.py`. All pre-existing, none in a split module, none
this task's.

## 15. The backend suites

### 15.1 The pass-2 baseline's 17 errors were an artifact, and the re-run proves it

[`raw/pass2-catalog-suites-before.txt`](raw/pass2-catalog-suites-before.txt) reads
`20 failed, 802 passed, 6 skipped, 772 warnings, 17 errors`. All **17** are the
same thing:

```
E   psycopg2.errors.DuplicateDatabase: database "test_mihas_localtest" already exists
```

— a concurrent test-DB collision, in three property files
(`test_access_scope_properties.py` 8, `test_authority_matrix_generated.py` 6,
`test_capability_derivation.py` 3). Not a signal about anything. It matters
because 17 tests **never ran**, so "no new failures" was unmeasurable against
that capture.

Re-run **serially, with no other pytest process**, against the isolated
throwaway `mihas_localtest` Postgres (`127.0.0.1:5433`) and local Redis
(`127.0.0.1:6380`) — Neon and production untouched — with a verified-empty
`test_%` database list before starting. The same 39 files that capture covers:

| | pre-split capture | serial re-run |
|---|---|---|
| collected | 533 | **533** |
| failed | 20 | **20**, the **same 20 by name, in the same order** |
| errored | **17** | **0** |
| skipped | 0 | **0** |
| passed | 496 *(derived)* | **513** *(measured)* |

**496 + 17 = 513.** The count closes exactly: every one of the 17
artifact-errored tests now runs and passes, and **no test changed status**.

The one derived number is labelled as such. The capture's selection was **wider**
than these 39 files (845 collected, and its extra files hold its 6 skips — this
subset has none), so its per-file pass count is not printed in it. The 496 comes
from `533 − 20 failed − 17 errored`, and that is sound because pytest collection
for a fixed file set is deterministic and **no test file in the 39 was modified by
the split**: the two dynamic suites are keyed on a route registry
(`test_authority_matrix_v2.py`) and on a single discovery function
(`test_view_auth_classification.py`, one test), so neither can change its
*collected* count when a class moves module. Only its result can — and §19 is that
result.

The pre-split tree itself is unrecoverable (§12.1), so this is the strongest
available before/after: same file set, same collection, same failures name for
name, and the 17 errors resolved rather than inherited.

### 15.2 The selection this pass actually ran, and why it is wider

[`raw/pass2-backend-selection.txt`](raw/pass2-backend-selection.txt) — **49
files**: the 39 the pre-split capture covers, plus the new characterisation suite,
plus the **9** files that reference the split modules and were outside that
capture. That addition is deliberate: those 9 are exactly where a shim can fail,
because they `import` from `apps.catalog.views` / `admin_views` or patch through
it — `test_perf_catalog_cache.py`, `test_perf_scoped_cache_ttl.py`,
`test_envelope_consistency.py`, `test_optional_public_auth.py`,
`test_catalog_properties.py`, `test_scenario_query_override_fail_closed.py`,
`test_perf_output_equivalence.py`, `test_perf_golden_snapshots.py`,
`test_perf_divergence_regression.py`. The list was produced by
`grep -rln 'apps\.catalog\.\(views\|admin_views\)' tests/`, not by judgement.

```
$ cd backend && DATABASE_URL=<mihas_localtest 5433> REDIS_URL=<local 6380> TESTING=1 \
    .venv/bin/python3 -m pytest $(cat raw/pass2-backend-selection.txt) -q
34 failed, 773 passed, 891 warnings in 52.54s
```

[`raw/pass2-catalog-suites-after.txt`](raw/pass2-catalog-suites-after.txt). Zero
errors, zero skips, 807 collected. **187 of the 773 passing are the new
characterisation cases.** Of the 9 additions, the six that exercise the shim
directly all pass — `test_perf_catalog_cache.py` (imports
`_catalog_scope_signature` **through** `apps.catalog.views`),
`test_perf_scoped_cache_ttl.py` (imports `_CATALOG_CACHE_TTL` the same way),
`test_envelope_consistency.py`, `test_optional_public_auth.py`,
`test_catalog_properties.py` and `test_scenario_query_override_fail_closed.py`.
The other three fail, for task 9.2's reason, and §15.3–§15.4 are why that is both
attributable and useful.

### 15.3 All 34 failures attributed

**20 of them are the pre-split capture's 20**, name for name (§15.1), and the
dispatch names them as other lanes':

| Failure | Lane |
|---|---|
| `test_authority_matrix_v2.py::test_no_stale_registry_entries` + `::test_zero_unclassified_gate_passes_on_live_surface` | the 2 stale route-registry entries `/email-slip/` and `/preview-summary/`. Route paths, not module paths — untouched by this split |
| `test_view_auth_classification.py::test_all_api_views_are_classified` | 38 unclassified views. **This one the split did move, and §19 is the fix that moved it back** |
| `test_perf_capability_invalidation.py` × 5, `test_production_scope_masking_properties.py` × 3, `test_cross_tenant_isolation.py` × 2, `test_admissions_v2_authority_policies.py` × 2, `test_capability_endpoint_shape.py`, `test_capability_gated_writes.py`, `test_cross_tenant_invisibility.py`, `test_admin_scope_endpoint.py`, `test_scoped_access_matrix.py` | pre-existing; several diff only in `request_id` |

**14 are new to this wider selection, and all 14 are task 9.2's admin-dashboard
contract rewrite against a golden baseline committed 2026-06-21.** The diffs are
unambiguous: the candidate has 9.2's `data.metrics` / `data.freshness` /
`data.health` / `data.scope` / `data.sources` / `data.windows`, and the baseline
has the pre-9.2 `data.applications.today_created` / `data.users.active`. The
endpoints are `admin_dashboard`, `notifications`, `notifications_cursor` and
`application_list` — `apps/accounts` and `apps/common`, none of them touched.
A catalog view split cannot add `data.metrics` to the admin dashboard payload.
Not fixed here; not this task's.

### 15.4 The positive measurement hiding in those failures

`test_perf_divergence_regression.py` covers five endpoints, and one of them is
`canonical_program_list` — a **catalog** endpoint, served by
`program_views.CanonicalProgramListView`. The consolidated divergence failure
names three diverging endpoints: `admin_dashboard`, `notifications`,
`notifications_cursor`. **`canonical_program_list` and `admin_scope` show zero
divergence**, and `test_endpoint_output_is_stable_run_to_run[canonical_program_list]`
passes.

So a catalog endpoint's **whole response envelope** is byte-equal to a golden
snapshot committed on 2026-06-21, measured *through* the split, by an independent
lane's tool. That is the behavioural proof this task wanted, and it arrived from a
suite that was failing for someone else's reason.

### 15.5 Django system checks

```
$ cd backend && env -u TESTING -u REDIS_URL .venv/bin/python3 manage.py check
System check identified no issues (1 silenced).
```

[`raw/django-check-pass2.txt`](raw/django-check-pass2.txt). No `TESTING=1`, no
substitute `REDIS_URL` — both produce a spurious `django_ratelimit.E003`. In the
first pass this measured "the backend is untouched"; here it measures that 14 new
modules and two shims import cleanly and every URL conf still resolves.

## 16. Frontend regression gates

The frontend was **not touched** by the second pass, so these are regression
checks against the pass-1 candidate. All three match it exactly.

| Gate | Pass-1 candidate | Second pass |
|---|---|---|
| `bun run test` | 1 failed, 4584 passed, 1 skipped / 493 files | **identical** ([`raw/pass2-frontend-test.txt`](raw/pass2-frontend-test.txt)) |
| `bun run lint` | 15 errors, 13 files | **identical**, and the file **set** is the same 13 ([`raw/pass2-frontend-lint-files.txt`](raw/pass2-frontend-lint-files.txt)) |
| `bun run build` | exit 0 | **exit 0**, incl. `tsc -p tsconfig.build.json --noEmit`, the critters inline and the CSP gate ([`raw/pass2-frontend-build.txt`](raw/pass2-frontend-build.txt)) |

The one failure is the same pre-existing
`authPageFormMarkup.test.tsx > uses honest helper copy instead of fake email
availability states` — the **sign-up page's** helper copy, which six lanes have
now each recorded. Not fixed here.

## 17. Cycles: 7 → 7, largest SCC 116 → 116, all six backend components identical

Per pass-1 §11 #5, the **largest SCC** is watched and not only the count. Both
held, and the component-size list is identical member for member:
`[116] [7] [3] [3] [2] [2] [2]` before and after.

Per pass-1 §11 #3, the two pre-existing backend cycles were **read before
anything moved**, and both are unchanged:

```
[7] applications/_view_helpers.py -> condition_evidence_service.py ->
    condition_manager.py -> enrollment_service.py -> serializers.py ->
    services.py -> waitlist_manager.py
[3] documents/payment_service.py -> payment_service_mixins/__init__.py ->
    payment_service_mixins/_initiation.py
```

The split imported into **neither**. The structural reason is worth stating,
because a re-export shim is an obvious cycle risk: the shim imports the split
modules and **no split module imports the shim**, so those 16 edges are acyclic
by construction. `admin_urls.py`, `urls.py` and `staff_invitation_views.py` keep
importing the shim, which adds no back-edge.

## 18. The browser gate, on a freshly seeded stack

Isolated local harness (task 0.4), strict gates active,
`HARNESS_PW_CHANNEL=chrome` (bundled Chromium is unsupported on this OS), SPA
rebuilt by `harness up` after the source change, volumes wiped and reseeded, and
**torn down afterwards**.

| Run | Result |
|---|---|
| `harness down` then `harness up` | volumes wiped, SPA rebuilt, backend healthy (schema + seed), edge serving ([`raw/pass2-harness-up.txt`](raw/pass2-harness-up.txt)) |
| the whole required profile, **fresh stack** | **218 passed**, 2 failed, **0 did not run** — 15.8 min ([`raw/pass2-harness-required-suite.txt`](raw/pass2-harness-required-suite.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`raw/pass2-harness-gatecheck.txt`](raw/pass2-harness-gatecheck.txt)) |
| drain | `{"broker_queue_depth": 0, "celery_queues": ["celery"], "unsettled_payment_collections": 0, "unsettled_references": []}` ([`raw/pass2-harness-drain.txt`](raw/pass2-harness-drain.txt)) |
| teardown | 0 harness containers, 0 harness volumes ([`raw/pass2-harness-down.txt`](raw/pass2-harness-down.txt)) |

Total 220, the same as pass 1's. Pass 1 recorded **216 passed / 4 failed**; this
run is **218 / 2**, and the difference is *not* an improvement this task made —
the two flakes pass-1 §5.7 caught and re-ran (`student-wizard-mobile.spec.ts:279`
and `admin-dashboard-metrics.spec.ts:356`) simply did not flake this time. Which
is itself the fifth independent confirmation that they are flakes.

The 2 remaining failures are `tenant-launch.spec.ts:139` on **both** projects —
the same stable pair tasks 10.5, 10.6, 11.1, 11.2, 11.3, 11.4 and 11.5 each
recorded at this base commit, and pass-1 §5.7 attributed. Its assertion is
`getByText('Fees')` against a `Program Fees` step label that
`TenantOnboardingWizard.tsx` renders `hidden` on mobile — the tenant lane's, and
§21 is why this task declines that file.

## 19. The one regression the split caused, and its fix

The dispatch predicted this precisely: *"a class moving module can change how
that test discovers it. If it did, that is yours to resolve."* It did.

`tests/unit/test_view_auth_classification.py` discovers views with
`obj.__module__ == full_module`, so a class is only ever found under the module
that **defines** it. Its classification sets named `apps.catalog.admin_views.*`
and `apps.catalog.views.*`. After the split those 37 views are defined elsewhere,
so they fell out of every bucket:

```
Found 75 APIView subclass(es) not in any classification list    (was 38)
```

**38 → 75**, i.e. 41 views newly unclassified and 4 old paths gone. Not a
behaviour change — a gate that stopped measuring — but a gate this task broke, so
this task fixes it.

**The fix, and the convention it follows.** 37 canonical split-module entries
added, keeping the shim paths alongside them. That is this file's **own existing
precedent**, twice over: task 9.3 pinned both `apps.accounts.admin_user_views.*`
and `apps.accounts.user_directory_views.*` with a comment saying why, and the
`apps.applications` split is pinned the same way
(`apps.applications.views.ApplicationTrackView` *and*
`apps.applications.public_views.ApplicationTrackView`). Additive, so no entry a
future reader needs can have been removed.

```
Found 38 APIView subclass(es) not in any classification list
```

**Back to exactly 38, and the same 38 views** — verified by diffing the full
discovered-minus-classified set against the pre-split list with the four domain
lifecycle views' module path normalised: **identical set**.

Those four are the deliberate part. `AdminTenantDomain{Retry,Approve,Reject,Reactivate}View`
were **already unclassified before this split**, under `apps.catalog.admin_views`
— task 4.4 added them and never classified them. Classifying them would have
improved another lane's number under cover of a refactor, so they are left
unclassified under their new module path and a comment in the file says so. The
gate's count is unchanged **in both directions**, which is the honest outcome:
the test still fails, for exactly the reason it failed before.

## 20. Size and dependency — the after-scan that was missing

`raw/size-dependency-pass2-after.txt` was **0 bytes**; pass 2 never ran the
after-measurement. It is now run.

```
$ bun scripts/module-size-report.ts --threshold 400
```

| Measure | pass-2 before | pass-2 after |
|---|---:|---:|
| `backend/apps` files | 324 | **338** |
| `backend/apps` total lines | 88,098 | **88,678** |
| over 400 lines | 73 | **73** |
| over 800 lines | 24 | **22** |
| over 1,000 lines | 17 | **15** |
| largest catalog view module | 2,072 | **722** |
| import cycles | 7 | **7** |
| largest SCC | 116 | **116** |
| `apps/admissions/src` files over 400 | 55 | 55 (frontend untouched) |

Itemised in [`raw/pass2-module-sizes.md`](raw/pass2-module-sizes.md).

**Over 400 staying at 73 is the honest headline, and it is a real reading rather
than a null one.** Two files left the band (2,072 → 96 and 1,570 → 85) and two of
their pieces entered it (`program_views.py` 722, `admin_domain_views.py` 497).
The bands that moved are the ones MAINT-01 is about — over 800 and over 1,000
each dropped by 2 — and both drops are these two files. Pass 1 §3.5 recorded the
same shape of lesson about cycle counts; a threshold count is a coarse instrument
in both directions.

**The lines reconcile with nothing unaccounted.** 292 new lines on the admin side
and 272 on the catalog side = 564 hand-written header/import lines, plus the
report's +1 per file across 16 files = **580**, which is exactly
88,678 − 88,098.

**The cost, measured rather than glossed.** Fourteen modules now import what two
did, so the shared modules gained importers:

| Module | fan-in before | after |
|---|---:|---:|
| `backend/apps/catalog/models.py` | 58 | **68** |
| `backend/apps/catalog/services.py` | 47 | **52** |
| `backend/apps/catalog/admin_serializers.py` | 2 | **8** |
| `backend/apps/catalog/tenant_audit_service.py` | 31 | **32** |

That is the trade a decomposition makes and it should be visible. The
`services.py` row is the one that matters: **47 → 52 importers without this task
touching the file**, which is §21's first entry and makes its case stronger, not
weaker.

## 21. What remains unsplit, and why — stated, not omitted

### `backend/apps/catalog/services.py` — 1,871 lines, **52** first-party importers. Untouched.

Deliberately, and this is a measurement rather than an omission: the file is
byte-identical, and §12's partition check confirms nothing moved into or out of
it. It holds `AdminCapabilityService`, the authority every tenant-sensitive
decision resolves through, and steering is explicit that authorization must
resolve through that one service. A module-boundary change there needs **its own
task, its own cross-tenant denial matrix, and a canonical-truth-map entry** — not
a refactor pass. Pass-1 §9 #2 and §11 #2 both said this, and this pass raising
its fan-in from 47 to 52 is a reason to hold the line harder.

### `apps/admissions/src/pages/admin/tenants/TenantOnboardingWizard.tsx` — 1,174 lines. Declined, out loud.

`tenant-launch.spec.ts:139` asserts `getByText('Fees')` against **this file's**
step labels, and it fails on both projects (§18) — a failure now recorded by nine
consecutive tasks, including both passes of this one. Splitting the file without
first deciding what to do about that assertion means either inheriting a failure
or silently repointing a claim, and pass-1 §4.2 is 3,000 words on why silently
repointing a claim is the expensive mistake. The decision belongs to the tenant
lane. **Declining is correct; declining silently is not**, which is why it has a
heading.

### Everything else pass-1 §9 listed on the frontend is still unsplit

`pages/admin/Applications.tsx` (869), `AuditTrail.tsx` (897), `Users.tsx` (653),
`pages/student/Settings.tsx` (710), `applicationWizard/index.tsx` (1,091), and
`useWizardController.ts` (1,047, the least-finished of pass 1's four — §10). The
reasons in §9's table are unchanged and are not restated here.

### `backend/apps/applications/*` was not touched either

`readiness_service.py` (1,734) and `query_service.py` (1,359) are the two large
ones. They are **services**, not view modules, and the bullet's backend clause is
about *views*. The applications **views** were already split into
`student_*`/`admin_*`/`public_*`/`document_*`/`interview_*`/`history_*` +
`_view_helpers.py` by the production-readiness work — which is the exact shape
this pass copied for catalog, and the reason both shims say so in their
docstrings.

## 22. Not claimed by the second pass

- **No numbered spec property.** §"PBT" above. The 187 characterisation cases are
  example-based, parametrised over a declared contract table.
- **No behaviour improved anywhere.** Every moved definition is the one that was
  there. Two documented contract strengthenings would have been out of scope and
  none was made.
- **No other lane's failure fixed**, and each was measured rather than assumed:
  the 2 stale route-registry entries, the 38 unclassified views (restored to 38,
  §19, not reduced), the 14 task-9.2 perf-golden divergences, the 20 pre-existing
  backend failures, `authPageFormMarkup.test.tsx`, the 15 lint errors,
  `tenant-launch.spec.ts:139` ×2, and `bun run validate:tailwind` still exiting
  127.
- **The two flakes were not re-run in isolation this pass**, because they did not
  fail (§18). Pass-1 §5.7 has the isolation runs.
- **The pre-split bytes are gone and no method recovers them.** §12.5 states the
  bound that follows (under 20 lines per module, already occupied by the imports
  the deltas require) rather than implying a proof.
- **`--plan verify` is still the better tool for the next split.** It is
  unexercised here only because no pre-split copy was retained. A future split
  should keep `_<plan>_source.py` until the task closes; §23 #1.
- **No new capability, route, endpoint, schema, contract, model or migration.**
  The catalogue stays at 17 `platform.*` + 17 `tenant.*`. Nothing to rehearse on
  Neon; production untouched. The only databases used were the throwaway
  `mihas_localtest` Postgres and the task-0.4 harness.

## 23. What a future task on these modules should do first

The checkbox is `[x]`, so this is not a continuation plan — it is what the next
person splitting a backend module in this repo should know:

1. **Keep the pre-split copy until the task closes.** `backend-view-extract.py`
   already looks for `_<plan>_source.py` and its `--plan verify` mode is designed
   around it. Deleting it cost this pass a day and reduced a proof to a bound
   (§12.5). Copy the module to `_<plan>_source.py` before the first write and
   delete it in the final commit.
2. **Grep for `__module__`-keyed tests before you move a class.**
   `test_view_auth_classification.py` is the one in this repo (§19), and its
   38→75 jump is invisible unless you run it. A registry keyed on **route path**
   (`test_authority_matrix_v2.py`) is immune; one keyed on **module path** is not.
3. **Regenerate the OpenAPI schema and diff it, even when you are sure.** §14 is
   two minutes of work that converts the highest-risk claim in a view split into
   a SHA-256 match.
4. **Check whether the shim needs underscore re-exports, and let the tests tell
   you which.** §13.3 is the list for these two modules; `grep -rn
   'apps\.<app>\.<module>\.' tests/` produces it for the next one.
5. **`catalog/services.py` is its own task.** 52 importers, `AdminCapabilityService`,
   a cross-tenant denial matrix, and a canonical-truth-map entry (§21).
6. **Watch the largest SCC and the fan-in table, not the cycle count and not the
   over-400 count.** Pass-1 §3.5 is the cycle-count lesson; §20 is the
   threshold-count one.
