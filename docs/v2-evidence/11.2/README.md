# Task 11.2 — Recompose the mobile wizard

Evidence index for task **11.2** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

> **Status: closed (`[x]`).** This index has two halves. §1-§12 are the first pass,
> which deliberately left the checkbox at `[-]` with two open items. The **second
> pass** starts at §13 and closes both — it also falsifies the first pass's §9
> diagnosis and its §6.1 reasoning, and says so explicitly. Read §13-§22 for the
> current state; §1-§12 are kept as written, wrong readings included.

```
- [x] 11.2 Recompose the mobile wizard
  - Suppress global bottom nav during the wizard.
  - Use one safe-area action bar, compact progress/current blockers, integrated
    draft picker, and mobile-accessible context/checklist.
  - Decompose the giant controller/index along state-machine boundaries only
    after behavior characterization.
  - _Requirements: R10.2, R16.1-R16.3, R16.7-R16.8_
  - _Findings: STU-02, STU-03, MAINT-01_
  - _Evidence: viewport/zoom/offline/keyboard/safe-area Playwright artifacts_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-10 (UTC).
- **The checkbox stays `[-]`, deliberately.** Two things are not done, and both are
  named precisely in §11: the **controller** half of MAINT-01's split (1,773 lines,
  untouched — the index half landed, 1,371 → 1,090 with seven modules extracted),
  and **one failing characterisation leg** on the mobile project that I could not
  attribute to either side (§9). Everything else in the task's bullets landed and is
  evidenced below.
- **Characterisation came first, and this README can prove the order.** MAINT-01's
  remedy is a sequence, not a pair of activities, so 23 unit cases and 8 browser
  journeys were written and run **green against the unchanged tree** before a single
  source file moved: [`raw/characterisation-before.txt`](raw/characterisation-before.txt),
  [`raw/harness-characterisation-before.txt`](raw/harness-characterisation-before.txt).
  The same files after the move: [`raw/harness-characterisation-after.txt`](raw/harness-characterisation-after.txt)
  (7 of 8; §9 is the eighth).
- **Schema: no.** No SQL script, no migration, no model change, **no backend change
  at all** — 6.5 already publishes every blocker this surface renders. The OpenAPI
  contract is unchanged and was not regenerated; §7.4 records the `manage.py check`
  that proves the backend is untouched rather than merely claimed to be.
- PBT: task 11.2 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`), so nothing is recorded through
  `update_pbt_status` and no numbered spec property is claimed. Stated rather than
  silently skipped.
- **Task 11.1 deferred two things here and both are answered**: wizard step
  deep-linking (§5 — the wizard now honours `?step=` on a first load and 11.1's route
  table carries the server's own `step`), and the wizard's own recomposition (§3, §4,
  §6). 11.1 also left the unsaved-changes `window.confirm` as "11.2's or 11.5's":
  **it is this task's**, for the reason in §8.

## The Required_Evidence claim

The `_Evidence:` line names five artifact kinds. All five are produced by
assertions, not taken by hand.

| Claim | Where it is settled |
|---|---|
| **viewport** | [`screenshots/wizard-{320,375,390}-{chromium,mobile}-required.png`](screenshots/) — journey 1 of the browser spec at the three widths R16.7 names, on both projects. Each is captured by the same journey that first proves no horizontal overflow, nothing competing with the action bar, and every control in the bar and the context panel ≥ 44 px measured from layout boxes |
| **zoom** | [`screenshots/wizard-320-text200.png`](screenshots/wizard-320-text200.png) — journey 7, 320 px with a 32 px root font, asserting the progress summary and the action bar *reflow* rather than clipping |
| **offline** | [`screenshots/wizard-390-offline.png`](screenshots/wizard-390-offline.png) — journey 5, with the browser context genuinely offline: the bar says so in words, typing still works, no dialog appears, and the value survives the reconnect |
| **keyboard** | [`screenshots/wizard-390-keyboard.png`](screenshots/wizard-390-keyboard.png) — journey 6, the visual viewport shrunk the way an on-screen keyboard shrinks it, asserting the bar releases its sticky position and the focused field is not underneath it. Plus journey 2, which opens the context disclosure **by `Enter`**, not by tap |
| **safe-area** | journey 1's `paddingBottom` assertion on the bar's own computed style at each width, and [`screenshots/wizard-320-context-open.png`](screenshots/wizard-320-context-open.png) |

### The browser journeys

| Journey | The claim it settles |
|---|---|
| **1. one bottom surface at 320 / 375 / 390** | the shell's global bottom navigation is absent from the route, **nothing** else is anchored near the bottom, the bar pads for the safe area, no horizontal overflow, ≥ 44 px targets, and the primary control is hit-testable |
| **2. the checklist reaches a phone** | the context disclosure exists at 320 px, opens by keyboard, and lists the step's requirements — the surface STU-03 says mobile lost entirely |
| **3. the blockers are the platform's** | the rendered blocker rows carry the readiness endpoint's own `code`s and its own sentences, and the count is the platform's count |
| **4. deep-linking** | a reachable `?step=` opens that step; an unreachable one is **not followed** and is explained |
| **5. offline** | the student is told, typing is never interrupted, and the work is still there on reconnect |
| **6. the on-screen keyboard** | the bar stops being sticky, so the field being typed into is not covered |
| **7. 200% text at 320** | the summary and the bar reflow rather than clip |

## What this task establishes

1. **The wizard's "current blockers" are the platform's, not the browser's** (§4).
   The line it replaces read *"Missing: Assigned school, NRC or passport +8 more"* —
   a list computed from form fields, which is exactly the defect 11.1 removed from
   the dashboard. Blockers now come from task 6.5's readiness, on the same query key
   the dashboard uses, and "we could not check" is kept apart from "nothing is
   outstanding".
2. **One anchored bottom surface, where there were four** (§3). The wizard's own
   sticky footer, the global bottom navigation, a floating `Drafts (n)` button at
   `top-20 right-4` and a floating shortcuts button could all be on a phone at once.
3. **The checklist and context exist at every width** (§6). They were inside
   `hidden lg:block`: not collapsed, not moved — a phone had no way to reach them.
4. **One draft picker, and it is not mounted beside the form** (§6.1). The
   full-page choice screen and the floating drawer were two pickers with two
   mental models and different commands; they are now one component with all
   three commands, on the screen that has no wizard form. That last clause is a
   correction the browser run forced, and §6.1 records the false diagnosis it
   nearly produced.
5. **Deep-linking, with the gate honoured** (§5). 11.1 declined to deep-link
   because "a link that silently lands on the wrong step is worse than one that
   lands where the student left off". Both halves of that are respected: reachable
   steps are opened, unreachable ones leave the student where they are and say why.
6. **The index is decomposed, verbatim, behind characterisation** (§7.7, §10).
   1,371 → 1,090 lines, five views and two pure libs; and the extraction caught a
   real regression *I* had written into a hand-reconstructed validation function
   before any test ran (§10.1).
7. **Auto-save stayed silent and resilient** — asserted as an absence (no dialog,
   no interruption, value intact) rather than as an indicator (§7.6, journey 5).

## Files

```
docs/v2-evidence/11.2/
├── README.md                                       ← this index
├── screenshots/
│   ├── wizard-320-chromium-required.png                (journey 1, desktop project at 320x568)
│   ├── wizard-320-mobile-required.png                  (journey 1, mobile project at 320x568)
│   ├── wizard-375-chromium-required.png
│   ├── wizard-375-mobile-required.png
│   ├── wizard-390-chromium-required.png
│   ├── wizard-390-mobile-required.png
│   ├── wizard-320-context-open.png                     (journey 2, the disclosure opened by Enter)
│   ├── wizard-390-offline.png                          (journey 5, context genuinely offline)
│   ├── wizard-390-keyboard.png                         (journey 6, visual viewport shrunk)
│   └── wizard-320-text200.png                          (journey 7, 320px at a 32px root font)
└── raw/
    ├── frontend-test-baseline.txt                      (BEFORE any change: 1 failed / 4352 passed / 1 skipped, 485 files)
    ├── frontend-test.txt                               (candidate: 1 failed / 4406 passed / 1 skipped, 486 files)
    ├── frontend-lint-baseline.txt                      (17 errors, before)
    ├── frontend-lint.txt                               (17 errors, after)
    ├── frontend-lint-files.txt                         (14 files — byte-identical to the baseline set)
    ├── frontend-build.txt                              (exit 0, incl. tsc and the CSP gate)
    ├── django-check.txt                                (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── characterisation-before.txt                     (23 unit cases, green on the UNCHANGED tree)
    ├── harness-characterisation-before.txt             (8 browser journeys, green on the UNCHANGED tree)
    ├── harness-characterisation-after.txt              (the same file after the move: 7 passed, 1 failed — §9)
    ├── harness-characterisation-after-autosave-isolated.txt (§9's leg alone, reproduced)
    ├── harness-experiment-no-picker.txt                 (§6.1's controlled run — and §6.1 says why one green run was not proof)
    ├── harness-wizard-mobile.txt                        (14 passed — 7 journeys × desktop + mobile)
    ├── harness-required-suite.txt                       (the whole required profile: 169 passed / 5 failed / 8 did not run — §7.5)
    ├── harness-gatecheck.txt                            (4 failed, as required — the gates fire)
    ├── harness-drain.txt                                (broker 0, unsettled payment collections 0)
    │
    │   ── second pass (§13-§22) ─────────────────────────────────────────────────
    ├── diagnosis-autosave-measurements-pass2.txt        (§14/§16: renders, interval arms/ticks, writes, the tap, the bar)
    ├── frontend-test-pass2.txt                          (1 failed / 4417 passed / 1 skipped, 487 files)
    ├── frontend-lint-pass2.txt                          (17 errors — unchanged)
    ├── frontend-lint-files-pass2.txt                    (14 files — byte-identical to the baseline set)
    ├── frontend-build-pass2.txt                         (exit 0, incl. tsc and the CSP gate)
    ├── django-check-pass2.txt                           (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── harness-characterisation-after-pass2.txt         (8 of 8 — §9's leg green on both projects)
    ├── harness-wizard-mobile-pass2.txt                  (16 passed — 8 journeys × desktop + mobile)
    ├── harness-required-suite-pass2.txt                 (180 passed / 4 failed / 2 did not run — §19.6)
    ├── harness-gatecheck-pass2.txt                      (4 failed, as required)
    └── harness-drain-pass2.txt                          (broker 0, unsettled payment collections 0)
```

Source of the second pass's change (added to the table above):

| Path | What it is |
|---|---|
| `…/applicationWizard/hooks/wizard/useWizardStepAdvance.ts` | **new** — the forward command, **472 lines lifted verbatim** out of the controller |
| `…/applicationWizard/hooks/wizard/useWizardSubmission.ts` | **new** — the submit command, **176 lines lifted verbatim**; takes the API client as a parameter so it imports no transport |
| `…/applicationWizard/hooks/wizard/useWizardAssignment.ts` | **new** — the assigned-school checkpoint's reads, **106 lines lifted verbatim** |
| `…/applicationWizard/hooks/useWizardController.ts` | **1,773 → 1,110**; three workflows extracted, 17 orphaned imports removed |
| `…/applicationWizard/lib/draftResume.ts` | `DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST` + `fillDraftPersonalFieldsFromRecord` — the §2.2 fix, pure and total |
| `…/applicationWizard/hooks/wizard/useWizardDraftLoader.ts` | hydration reads the authoritative row for the nine fields the list projection omits |
| `src/hooks/useAutoSave.ts` | the 8-second interval is armed once and calls the latest `saveData` through a ref — it had **never** fired on the wizard |
| `…/applicationWizard/hooks/useSmartAutoSave.ts` | stable `changedFields` identity — the ~190-renders-per-second loop |
| `tests/unit/wizardDraftResume.test.ts` | **+7 cases** for the fill |
| `tests/property/wizardDraftHydration.property.test.ts` | **new** — 4 fast-check invariants over the fill |
| `tests/harness-e2e/required/student-wizard-mobile.spec.ts` | **journey 8** (rehydration), journey 1's hit test made real, journey 5's chunk race removed |
| `tests/unit/{useWizardController.contract,submitIdempotency,wizardAssignmentPatchLock}.test.ts` | three source-location pins repointed; every behavioural claim unchanged (§18.1) |

Source of the change:

| Path | What it is |
|---|---|
| `apps/admissions/src/pages/student/applicationWizard/index.tsx` | recomposed: **1,371 → 1,090** lines. No `metrics={[…]}`, one action bar, the context panel at every width, `?step=` honoured, the product dialog for unsaved edits |
| `…/components/WizardProgressSummary.tsx` | **new** — compact progress and the platform's blockers. Reads no form field and derives no requirement; a case asserts that from source |
| `…/components/WizardActionBar.tsx` | **new** — the one anchored bottom surface: back, forward/submit, manual save, draft state, `env(safe-area-inset-bottom)`, and it releases its sticky position when the keyboard opens |
| `…/components/WizardContextPanel.tsx` | **new** — checklist + preview + step notes as one instance: an ARIA disclosure below `lg`, an open region at `lg` and above |
| `…/components/WizardDraftPicker.tsx` | **new** — one draft list with continue / **rename** / delete, used by the choice screen. Not mounted inside the wizard (§6.1) |
| `…/components/WizardStepRenderer.tsx` | **new** — the six-branch step `switch`, lifted verbatim, typed against the controller's own result |
| `…/lib/wizardChecklist.ts` | **new** — the per-step checklist, lifted verbatim out of a render-scope closure |
| `…/lib/wizardValidationErrors.ts` | **new** — `collectStepValidationErrors`, lifted **verbatim** including the `gradesHydrating` guard (§10.1) |
| `…/lib/wizardStepDeepLink.ts` | **new** — `?step=` resolution against the wizard's own reachability gate |
| `…/hooks/useWizardReadiness.ts` | **new** — the wizard's first read of task 6.5's readiness, on the dashboard's query key |
| `…/components/EnhancedProgressIndicator.tsx` | `compact` prop (default `false`, so every existing caller and its property test are byte-identical) drops the mobile step label and the duplicate progress bar |
| `…/hooks/useWizardController.ts` | one line: the result interface is `export`ed so the extracted views can be typed against it |
| `…/components/{AnalyticsDashboard,DraftManager}.tsx`, `…/lib/progressSummary.ts`, `…/hooks/useEstimatedTime.ts` | **deleted** (§3) |
| `apps/admissions/tests/unit/wizardProgressSummary.test.ts` | **deleted** with the helper it tested |
| `apps/admissions/src/lib/studentNextAction.ts` | 11.1's route table carries the server's `step` into the draft link (§5.2) |
| `apps/admissions/src/routes/routeRegistry.ts` | `studentApplicationResumePath(id, step?)` + `WIZARD_DEEP_LINK_STEPS`, drift-guarded against `steps/config.ts` |
| `apps/admissions/tests/unit/applicationWizardCharacterisation.test.ts` | **new** — 23 cases, written and run **before** the move |
| `apps/admissions/tests/harness-e2e/required/student-wizard-characterisation.spec.ts` | **new** — 8 journeys, likewise |
| `apps/admissions/tests/unit/wizardMobileRecomposition.test.tsx` | **new** — 32 cases: the claims that are *supposed* to change |
| `apps/admissions/tests/harness-e2e/required/student-wizard-mobile.spec.ts` | **new** — the 7 required journeys, desktop and mobile |
| `apps/admissions/tests/unit/applicationWizardUxGuard.test.ts` | reads the wizard as one *surface* instead of one file, plus two new placement claims (§7.7) |
| `apps/admissions/tests/unit/studentDashboardTaskFirst.test.tsx`, `tests/property/test_bug3_preservation.test.ts`, `tests/unit/studentNextActionServerVocabulary.test.ts` | three other lanes' **source-location** pins repointed at the new locations; every behavioural claim is unchanged and §7.7 lists them one by one |

---

## 1. What was wrong (STU-02, STU-03, MAINT-01)

STU-03:

> The wizard is extremely coupled and long, and mobile loses the desktop
> checklist/context. A floating draft manager and wizard footer compete with global
> bottom navigation.

Read against the page as it was, that is five separate defects:

| # | What the wizard did | Why it is a defect |
|---|---|---|
| 1 | rendered four `PageShell` metric tiles — "Current step", "Completion", "Estimated time", "Draft status" | `PageShell` renders `metrics` *between* the title and the children, so on a phone the first viewport was four tiles and the work was below them. R16.1 inverted, literally. "Estimated time" was a guess about the student's own pace |
| 2 | printed `Missing: Assigned school, NRC or passport +8 more` from `buildWizardReadiness` | a blocker list derived in the browser. The browser cannot see capacity, duplicates, the intake window, an unconfigured fee, or the versioned document contract, so the sentence a student read and the decision the platform would make could disagree |
| 3 | put the checklist, the application preview, the "Your Progress" tiles and the step notes in `<aside className="hidden lg:col-span-1 lg:block">` | on a phone the whole "what does this step need, and what have I already told you" surface was absent |
| 4 | anchored **four** surfaces to a phone viewport: its own sticky footer, the shell's bottom navigation, a floating `Drafts (n)` button at `top-20 right-4` (over the mobile header's profile / notifications / logout controls), and a floating shortcuts button | R16.3 asks for **one** mobile bottom action surface and says the global bar must not compete |
| 5 | offered **two** draft pickers — a full-page choice screen with continue + delete, and a floating drawer with continue + rename + delete | two mental models, different commands, and the one that STU-03 names by hand was the one pinned over the header |

Plus MAINT-01, which is a number: `index.tsx` at 1,371 lines and
`useWizardController.ts` at 1,766, mixing orchestration, validation, persistence and
rendering. Its remedy names an order — *"Add characterization tests, then split"* —
and §7.6 and §10 are what that order bought.

## 2. Characterisation first, and what it cost to do honestly

Two suites, both green on the unchanged tree before anything moved.

**`applicationWizardCharacterisation.test.ts` — 23 cases.** The wizard's *pure*
boundaries: the six-state step table and its ids, the reachability gates, the
navigation reducer (clamping, the caller's veto, the before-prev hook), the readiness
rail (including the STU-11 duplicate/non-canonical refusals and the deferred fee),
the draft-intent parser, the document-surface fallback, and `resolveDraftResumeStepId`.

It is deliberately **behavioural, not source-scanning**. `applicationWizardUxGuard`
already read `index.tsx` as text, and that is precisely the kind of test a
decomposition breaks for no behavioural reason: it pins where code lives. These cases
call the modules and compare answers, so moving a function cannot fail them and
changing what it answers cannot pass them.

**`student-wizard-characterisation.spec.ts` — 4 journeys × 2 projects.** The parts
that only exist once composed: the step order walked against a real assignment
resolution, autosave writing **silently** while a student types, the draft picker
asking instead of choosing, and the two gates (payment behind the checkpoint, submit
behind readiness) asserted from the student's side of the glass.

### 2.1 The first draft of it was wrong, and that is the point

The first version assumed a resumed draft opens at step 1. It does not:
`resolveDraftResumeStepId` opens the first step whose work is outstanding, so a draft
with a programme and a name opens at **Education**. The first run therefore watched
step 1 during hydration and then had the wizard move underneath it — three journeys
failed for a reason that was entirely the test's
([`raw/harness-characterisation-before.txt`](raw/harness-characterisation-before.txt)
is the corrected, green run).

Characterising the wizard's *actual* behaviour is the whole job, so the resume rule
became five more unit cases and the journeys were rewritten around it.

### 2.2 One leg had to be weakened to stay honest

The autosave journey originally asserted that a manual save's value comes back on the
next resume. **It does not, on this tree**: the town reaches the platform (asserted
against the API) and is then not re-hydrated into the field. That is a `useWizardDraftLoader`
question — task 6.3's state machine, finding STU-02 — and this task does not touch it.
Asserting it would make the characterisation file fail *before and after*, which is
the one thing a characterisation file must not do, so the file says out loud what it
does not assert and why.

## 3. What was removed rather than moved

| Surface | What it was | Why removal and not relocation |
|---|---|---|
| the four `PageShell` metrics | current step / completion / estimated time / draft status | three are restated in one line by the progress summary; the fourth measured the student's pace. A case asserts `metrics={[` is absent |
| `AnalyticsDashboard` | "Completion" and "Last Save" as two large numbers, plus an *N completed / N in progress* tally | to render them it fetched up to **100** of the student's applications, on a page whose job is one application. R16.5's redundant metrics with a network cost attached |
| `lib/progressSummary.ts` + its 3-case test | the pure helper behind those tiles | its only consumer is gone; a tested-but-dead helper is worse than neither |
| `DraftManager` | the floating `Drafts (n)` trigger and its right-hand drawer | §6.1. Its three commands survive in `WizardDraftPicker` |
| `useEstimatedTime` | "about 4 minutes left" | a claim about how fast this student types |
| the indicator's mobile progress bar and step label | a second `Overall Progress` bar and a second "Step 4 of 6" | one number, once (behind a `compact` prop so the component's own property test stays byte-identical) |

What was **kept**, because de-fluffing is not deleting: the step rail (it is
navigation, and it is how a student goes back), the mode banner ("New application" /
"Resuming draft" / "Local draft" — R10.1's explicit intent, made a compact pill
instead of a full-width box), the offline notice, the duplicate-draft conflict
choices, the validation summary with its field links, and the step notes.

## 4. The blockers are read, not derived (R16.1, STU-03)

`useWizardReadiness` reads task 6.5's
`GET /api/v2/student/applications/{id}/readiness/` — produced by the same evaluator
`POST /applications/{id}/submit/` re-runs under its row locks — through task 11.1's
`studentReadinessService`, on the **same React Query key** the dashboard uses, so a
student arriving from the dashboard's next-action panel does not pay for a second
identical read. It never fires before an online draft exists, so step 1 costs nothing.

Three states are kept apart, and the middle one is the one that matters:

- *"Checking what is still needed…"* — the read is in flight;
- *"We could not check your application just now. Everything you have entered is
  saved."* — with the page's own "Check again" as the control;
- *"Nothing is outstanding on your application right now."*

Collapsing the second into the third would tell a student they are done when the
platform was never asked. It is the same distinction 11.1 established on the
dashboard, for the same reason.

**`buildWizardReadiness` is deliberately not replaced.** It is per-field form
validation, it is what keeps the wizard usable with no network, and it still gates the
step controls. *What may be submitted* is the platform's answer; *what is left to type
on this step* is the form's. Two questions, two sources — and the 23 characterisation
cases pin the second one so the split cannot quietly drift.

## 5. Deep-linking: task 11.1's deferral, answered (R10.2)

11.1 recorded its reason for not doing this:

> The wizard only honours `?step=` on history navigation; deep-linking it is task
> 11.2's lane, and a link that silently lands on the wrong step is worse than one
> that lands where the student left off.

### 5.1 The wizard side

`resolveWizardDeepLinkStep` reads `?step=` against `steps/config`'s **existing**
reachability gate (R10.3: nothing past the assigned-school checkpoint is reachable
until the backend has resolved the assignment and the fee). Reachable → open it.
Real but not reachable → **stay where the resume machine put you** and say why.

That last rule is a correction the browser forced, twice:

- the first version *clamped* to the checkpoint, which dragged a student backwards
  out of the step they were already working in;
- the second used a 4-second grace period, which raced the catalog load and refused a
  perfectly good `?step=personal` on one project and not the other.

It now waits for the gate to **conclude** rather than for a clock: the effect
re-decides when the answer arrives, and explains itself only once no answer can
change the outcome. The URL is read from a ref captured on first render, because the
wizard's own history sync overwrites `?step=` on mount — reading it later reads the
wizard's own value.

### 5.2 The dashboard side

The server already publishes `step` on every `allowed_next_actions` entry, and its
vocabulary *is* this wizard's `StepKey` minus `assignedSchool` (the checkpoint is this
app's gate, not work the platform asks for). So 11.1's route table passes it through:
`add-grades` now goes to
`/student/application-wizard?mode=resume&draftId=…&step=education`.

The step keys live in `routeRegistry` as `WIZARD_DEEP_LINK_STEPS` rather than being
imported from the wizard, because no `src/lib` or `src/routes` module imports from
`src/pages` today and this task is not the place to start; a case asserts the tuple
equals `wizardSteps.map(s => s.key)`, so the two cannot drift. An unrecognised step is
dropped by the builder, which makes it incapable of emitting a `?step=` the wizard
would ignore.

## 6. One surface, one picker, and context everywhere (R16.1-R16.3)

`WizardActionBar` is the only element the wizard anchors: `sticky bottom-0` on a
phone, `sm:static` on a desktop, `pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]`
so the primary control clears a home indicator, and `relative` while the on-screen
keyboard is open — because a sticky bar plus a shrunken visual viewport is how a
keyboard ends up covering the field being typed into. Journey 1 asserts nothing else
is anchored near the bottom (computed from `position` and the laid-out rect, not from
class names) and journey 6 measures the field's clearance.

The shell's own bar was **already** suppressed on the wizard route by `AppLayout`, and
nothing asserted it — so nothing stopped it coming back. Both halves are now pinned:
the suppression and the `pb-6` that would otherwise leave a phantom 5 rem gap.

`WizardContextPanel` is **one instance in two placements**: CSS grid puts it beside
the form at `lg` and after it on a phone, where it is a real ARIA disclosure — a 44 px
button with `aria-expanded` / `aria-controls`, closed by default so it does not push
the form down, openable by `Enter`. Rendering it twice (`lg:hidden` + `hidden lg:block`)
would duplicate every heading for a screen reader, which is why the viewport
difference lives inside the panel instead of outside it.

### 6.1 The draft picker, and the false diagnosis it nearly produced

`WizardDraftPicker` is the union of the two pickers that existed: continue, **rename**
(task 6.2's validated `draft_name`, which the full-page screen never offered) and
delete through the product `ConfirmAlertDialog` and task 11.1's one scoped
`deleteStudentDraft`. R16.1 forbids a compact layout from losing commands, so deleting
the drawer had to keep its rename.

The first version of this recomposition embedded that picker **inside** the wizard, in
the context column. The characterisation suite then failed on the mobile project: a
manual save came back with the *profile's* town instead of the one the student had just
typed, with two other typed fields wiped. `useMultiDraft` re-lists the student's drafts
on every draft-store revision, so mounting it inside the wizard put a second reader of
draft state next to the one state machine that owns it — which is what R10.2 forbids in
so many words. A controlled run with that block removed passed the same journey in 19 s
([`raw/harness-experiment-no-picker.txt`](raw/harness-experiment-no-picker.txt)).

**That one green run was not proof, and saying so is the point of this section.** After
replacing the embedded picker with a *link* (two navigations, no data subscription), the
same leg failed again on the same project (§9). So the second reader was not the cause,
the single green run was luck, and the diagnosis in this paragraph would have been
false if it had been written from that run alone.

The link stayed anyway, on its own merits: R10.2 says the state machine owns hydration
and everything else is a pure adapter or view, and a live draft list inside the wizard
is not a view. The command survives on every viewport, which is what R16.1 asks; both
"Switch application" and "Start a new application" go through the same
unsaved-changes dialog as "Back to Dashboard", because a student who taps them
mid-sentence is leaving edits behind just as much.

## 7. Verification (verbatim)

### 7.1 Frontend suites, against a measured baseline

```
cd apps/admissions && bun run test -- --run
```

| Run | Result |
|---|---|
| **baseline** — captured **before** any change on this tree | **1 failed, 4352 passed, 1 skipped** (485 files) — [`frontend-test-baseline.txt`](raw/frontend-test-baseline.txt) |
| **11.2 (candidate)** | **1 failed, 4406 passed, 1 skipped** (486 files) — [`frontend-test.txt`](raw/frontend-test.txt) |

- **New failures: 0.** The failing set is one test both ways, and it is the same one:
  `authPageFormMarkup.test.tsx > uses honest helper copy instead of fake email
  availability states` — the **sign-up page's** helper copy, a surface this task does
  not touch, and the same single pre-existing failure tasks 10.6 and 11.1 recorded.
- **Nothing was fixed either**, which is the honest reading: this task claims no
  repair of another lane's failure.
- **+54 passing, and the arithmetic closes exactly**: 4406 − 4352 = 54 = 23 (new
  characterisation) + 32 (new recomposition) + 2 (two new cases in the UX guard) − 3
  (the deleted `wizardProgressSummary` suite). +1 file net for the same reason.
- Unlike 11.1's, this baseline is a **real before-run**, not a reconstruction: it was
  captured on the unchanged tree before the first edit.

### 7.2 Lint

```
cd apps/admissions && bun run lint    # 17 errors, 14 files
```

The total is unchanged at **17** and the file set is **byte-identical** to the
pre-change set (`diff` of the two file lists is empty) —
[`frontend-lint.txt`](raw/frontend-lint.txt),
[`frontend-lint-baseline.txt`](raw/frontend-lint-baseline.txt),
[`frontend-lint-files.txt`](raw/frontend-lint-files.txt). None of the 14 is a file
this task created.

### 7.3 Build

```
cd apps/admissions && bun run build   # exit 0
```

Including `tsc` and the CSP gate ([`frontend-build.txt`](raw/frontend-build.txt)).
`tsc --noEmit` reports **zero** errors under `src/`. (It reports 656 pre-existing
errors under `tests/`, which is the tree's standing state and outside the build gate.)

### 7.4 Django check

```
cd backend && .venv/bin/python3 manage.py check   # no issues (1 silenced)
```

No `TESTING=1`, no substitute `REDIS_URL` — [`django-check.txt`](raw/django-check.txt).
Run because this task consumes a backend contract and changes none of it; a clean
check on the real settings is the cheapest proof the backend is untouched rather than
merely claimed to be. The OpenAPI contract is unchanged and was **not** regenerated.

### 7.5 The browser gate

Run against the isolated local harness (task 0.4) with the strict gates active,
`HARNESS_PW_CHANNEL=chrome`, after `harness/bin/harness up` and a
`harness/bin/harness build` after **every** code change, and **torn down afterwards**
(`harness down`, volumes wiped).

| Run | Result |
|---|---|
| this task's mobile journeys, on the final build | **14 passed** — 7 journeys × desktop + mobile, zero skips ([`harness-wizard-mobile.txt`](raw/harness-wizard-mobile.txt)) |
| this task's characterisation journeys, final build | **7 passed, 1 failed** ([`harness-characterisation-after.txt`](raw/harness-characterisation-after.txt) — §9) |
| the same characterisation file, **before** any change | **8 passed** ([`harness-characterisation-before.txt`](raw/harness-characterisation-before.txt)) |
| the whole required profile | **169 passed**, 5 failed, 8 did not run ([`harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | broker 0, unsettled payment collections 0 ([`harness-drain.txt`](raw/harness-drain.txt)) |

### 7.6 The five required-profile failures, attributed

| Failure | Reading |
|---|---|
| `tenant-launch.spec.ts:139` × **both** projects | **stable pre-existing.** The same pair tasks 10.5, 10.6 and 11.1 each recorded on this tree at this base commit |
| `admin-applications-roster.spec.ts:325` × **both** projects | **pre-existing admin-lane flake.** 11.1 recorded this exact spec and line as a flake (it failed on mobile in 11.1's run and passed in the run before). An ADM-lane count/pagination assertion; not a surface this task renders |
| `student-wizard-characterisation.spec.ts:255` (mobile only) | **mine, and unattributed** — §9 |

### 7.7 Four other-lane pins were repointed, one needed nothing, and none changed a claim

A decomposition breaks *source-location* pins by construction. Each was moved to the
new location with its behavioural claim intact, and each edit says which task moved it
and why:

| Test | What it pinned | Where it points now |
|---|---|---|
| `applicationWizardUxGuard.test.ts` (this task's own lane) | a dozen strings in `index.tsx` | the wizard as one **surface** (page + the five views), plus two *new* placement claims: exactly one file anchors a bottom surface, and no `window.confirm` survives |
| `test_bug3_hydration_race.test.ts` | `gradesHydrating` appears in `index.tsx` | **unchanged, and passing.** The page still destructures `gradesHydrating` from the controller and hands it to the validator, so its assertion is still true where it stands. Worth stating precisely: the split did not require this file to move, and it was not touched |
| `test_bug3_preservation.test.ts` | `currentStepConfig.key === 'education'`, `gradeCount < 5` in `index.tsx` | the same rules in `wizardValidationErrors.ts`, plus the page composing them |
| `studentDashboardTaskFirst.test.tsx` (11.1) × 2 cases | the wizard's `DraftManager.tsx` and `index.tsx` reaching `deleteStudentDraft` | `WizardDraftPicker.tsx` and `useMultiDraft.ts`; the wizard page is now asserted to contain **no** `window.confirm` and no re-implemented delete |
| `studentNextActionServerVocabulary.test.ts` (11.1) | the draft href had no `step` | the href now carries `&step=education`, with the reason and 11.1's own deferral quoted at the assertion |

Two source-scanning cases needed comment-stripping, for the reason 11.1 also hit: the
code that removed a surface is also the code documenting why it was removed, so a
naive substring scan trips on the explanation of the very thing it checks for.

## 8. The unsaved-changes dialog is this task's (R16.6)

Task 11.1 left `window.confirm('You have unsaved changes. Are you sure you want to
leave?')` in place and named "11.2 or 11.5" as its owner. **It is 11.2's**, for two
reasons: it belongs to the back affordance this recomposition rewrites, so 11.5 would
have had to edit a line this task was already moving; and a native confirm cannot say
what the product dialog says — that the work is *already saved on this device*, that
the draft will still be there, and that "Save now" exists. It is now
`ConfirmAlertDialog`, focus-trapped and escape-closable, shared by "Back to
Dashboard", "Switch application" and "Start a new application", and a case asserts the
whole wizard surface contains no `window.confirm` at all.

## 9. The one failing leg, stated rather than smoothed over

`student-wizard-characterisation.spec.ts:255` — *"saves silently while a student
types, and the value survives a refresh"* — **passes on the desktop project and fails
on the mobile project** after the change. Before the change it passed on both.

What the failure looks like, from the run's own DOM snapshot: the manual save's poll
reads `Lusaka` (the profile's town) where the student typed `Kabwe`, and the personal
fields the journey had just filled — NRC and phone — are **empty**. That is a draft
re-hydration overwriting live edits, not a save that did not fire.

What I can and cannot say:

- **It reproduces**: three of four observed runs on the mobile project
  ([`harness-characterisation-after.txt`](raw/harness-characterisation-after.txt),
  [`harness-characterisation-after-autosave-isolated.txt`](raw/harness-characterisation-after-autosave-isolated.txt),
  [`harness-required-suite.txt`](raw/harness-required-suite.txt)).
- **The first hypothesis was wrong.** §6.1's embedded draft list looked like the cause
  and one controlled run supported it; removing it entirely did not fix the leg.
- **The subject is draft hydration** — `useWizardDraftLoader` /
  `useWizardDraftPersistence` / profile auto-populate — which is task **6.3**'s state
  machine and finding **STU-02**. This task changed none of those files.
- **I have not established whether the recomposition made an existing race more
  likely.** It is a regression *candidate*, and I am not claiming exoneration. The
  related pre-existing behaviour §2.2 records (a saved town not re-hydrating on the
  next resume) was reproduced on the **unchanged** tree, before any edit, which is at
  least evidence that this area was already fragile.
- **I did not fix it**, and R10.2 says why the fix does not belong in a view: hydration
  is the state machine's, and the state machine is the half of MAINT-01 this run did
  not touch.

This is the reason the checkbox stays `[-]` rather than `[x]`.

## 10. What the extraction caught

### 10.1 A validation function I had rewritten instead of moved

The first draft of the decomposition re-authored `collectStepValidationErrors` from
its call sites instead of lifting it. Two existing property tests failed within
minutes, and the diff against `git show HEAD:…index.tsx` showed what my version had
silently dropped: the **`gradesHydrating` guard** (without it the education step tells
a student they have zero subjects while the server's grades are still loading — the
exact defect `test_bug3_hydration_race.test.ts` exists to prevent), the
duplicate-subject error, the review step's still-uploading guard, and six field labels
("Full Name" → "Full name", "City/Town" → "Residence town", …).

It is now lifted verbatim into `wizardValidationErrors.ts`, labels included, with a
docstring saying that converging those labels with the readiness rail's wording is a
copy decision that deserves its own diff.

**This is exactly what MAINT-01's ordering is for**, and it is worth being blunt: the
tests that caught it were not mine, they were two other lanes' property tests that
happened to pin the strings. Had they not existed, a `[x]` on this task would have
shipped a silent regression in the wizard's validation.

### 10.2 A hook after an early return

Extracting the leave-confirmation into a shared callback put three `useCallback`s
below `if (authLoading || restoringDraft) return <WizardSkeleton />`. The browser run
answered with React error #300 on every journey — the whole wizard replaced by an
error boundary. Caught in the harness, fixed before any evidence was written; recorded
because "the unit suite was green" is not the same as "the page renders".

### 10.3 Two 44 px and reflow defects, in code I had just written

Journey 1 measured the icon-only "Save Now" control at **40 × 44** at 320 px
(`min-h-touch` sizes the height, not the width). Journey 7 measured the primary
control extending **36 px past the bar** at a 32 px root font. Both were fixed in the
component (`min-w-touch`; `flex-wrap` + `whitespace-normal`), and both are the reason
the required evidence asks for geometry from a browser rather than class names from a
linter.

## 11. Not claimed here, and what remains

- **The controller is not split.** `useWizardController.ts` is **1,773** lines (up
  one, from exporting its result type). MAINT-01's index half landed — 1,371 → 1,090,
  with `WizardStepRenderer`, `WizardProgressSummary`, `WizardActionBar`,
  `WizardContextPanel`, `WizardDraftPicker`, `wizardChecklist.ts` and
  `wizardValidationErrors.ts` extracted — and the controller half is a second pass. It
  now has what it needs: 23 pure cases and 8 browser journeys standing in front of it,
  and `hooks/wizard/` already holds the seams (`useWizardNavigation`,
  `useWizardDraftLoader`, `useWizardDraftPersistence`, `useWizardGrades`,
  `useWizardFileUploads`, `useWizardSessionRecovery`). Task **12.1** names the same
  work.
- **§9's failing leg is open**, and it is the other reason for `[-]`.
- **Draft hydration is untouched.** Both the pre-existing gap (§2.2) and §9 are
  6.3/STU-02's; a view may not fix them.
- **`buildWizardReadiness` still drives the step gates.** Only the *displayed*
  blockers moved to the server (§4).
- **The step rail is kept, not redesigned.** `EnhancedProgressIndicator` gained one
  optional prop and lost nothing by default; its property test's rendered output is
  byte-identical.
- **No first-viewport marketing block, PageShell metrics on other pages, or AI
  language was touched.** Those are task **11.5**'s bullet. The metrics removed here
  are the wizard's own, because they sat above the wizard's own work.
- **`MobileBottomNav.tsx` was left alone.** It is unreferenced by any component
  (`AppLayout` renders `BottomNavigation`), so it cannot compete with anything;
  deleting dead files is task **12.4**'s lane.
- **No new capability, no new route, no new endpoint.** The catalogue stays at 17
  `platform.*` + 17 `tenant.*`. `?step=` is a query parameter on an existing route.
- **No schema change and no contract change.** Nothing to rehearse on Neon, nothing
  to regenerate.
- **The pre-existing failures are not fixed**: 1 frontend, 17 lint, and 4 harness (2
  stable `tenant-launch`, 2 admin-lane flake). Each is shown against a real before-run
  and attributed elsewhere (§7.1, §7.2, §7.6).

## 12. Design (PRODUCT.md / DESIGN.md)

Read before writing the surfaces, and asserted where it is assertable.

- **Tokens only.** `border-border`, `bg-card`, `text-foreground`,
  `text-muted-foreground`, `bg-muted`, `text-primary`, `text-destructive`,
  `text-warning`, `text-success`. No hex, no arbitrary colour. `text-warning-strong`
  was **avoided** deliberately: it is a `legibility.css` utility carrying a `dark:`
  variant, and DESIGN.md bans unsupported dark styles.
- **No purple gradient, no gradient text, no glassmorphism, no nested card, no
  emoji, no `dark:` utility** across every file this task added. The bar's old
  `backdrop-blur-sm` went with it.
- **44 px targets**, measured in the browser from layout boxes at three widths on both
  projects — which is how the 40 px "Save Now" was caught (§10.3).
- **Status is never colour alone.** The offline badge is a `WifiOff` icon *and* the
  words "Offline — saved on this device"; the blocker header is an `AlertCircle` *and*
  a count; the checklist rows are `CheckCircle`/`Circle` *and* labels.
- **Icons are Lucide.** `AlertCircle`, `ArrowLeft`, `ArrowRight`, `ChevronDown`,
  `ClipboardList`, `Clock`, `FilePlus2`, `FileText`, `HelpCircle`, `Loader2`,
  `Pencil`, `Save`, `Send`, `Trash2`, `WifiOff`.
- **Reduced motion respected**: every transition and both spinners carry
  `motion-reduce:`, and the global rule in `index.css` is untouched.
- **Reflow, not clipping**, at 200% text — and the `flex-wrap` / `break-words` that
  make it true were added *because* the browser run measured the clipping (§10.3).
- **Auto-save stayed silent**, which is a hard product constraint and is asserted as
  an absence: no dialog, no modal, no interruption, and the typed value still in the
  field through a full debounce-plus-interval window, online and offline.

---

# Second pass — the two open items, closed

Everything above is the first pass and is left as it was written, including the two
readings it got wrong. This half says which, and why, and what closed the task.

- Base commit: unchanged — `bae29a28d9657f288b3339062adb31285959c966` (branch `main`);
  the candidate is still working-tree changes on top of it.
- Captured: 2026-08-10 (UTC), after the first pass.
- **The checkbox is now `[x]`.** §11 named two things as remaining and both are done:
  the controller half of MAINT-01's split (**1,773 → 1,110** lines, three modules
  lifted verbatim) and §9's failing characterisation leg (**8 of 8 journeys pass on
  both projects**). What is *not* claimed is listed in §22, and none of it is a
  bullet of task 11.2.
- PBT: still **no numbered property-based-testing sub-task**, so nothing is recorded
  through `update_pbt_status`. Four fast-check properties were added anyway (§15) and
  are labelled as task invariants, not numbered spec properties.
- **Schema: still no.** No SQL, no migration, no model change, no backend change at
  all. §19.4 records the `manage.py check` on the real settings that proves it rather
  than asserting it. The OpenAPI contract is unchanged and was not regenerated.

## 13. The starting state was not the state §7 measured

Before anything else: the tree this pass inherited did not build.

```
src/pages/student/applicationWizard/hooks/wizard/useWizardDraftLoader.ts(271,11):
  error TS2741: Property 'id' is missing in type 'Record<string, unknown>' …
```

Three files had been edited after the first pass captured its evidence, and none of
those edits are mentioned in §1-§12:

| File | What was in it | State |
|---|---|---|
| `hooks/wizard/useWizardDraftLoader.ts` | a first attempt at reading the draft *record* for the fields the list projection omits, and a comment citing this README's own §2.2 | **did not type-check** |
| `hooks/useAutoSave.ts` | the interval fix in §14, plus two leftover `globalThis.__DIAG` probes | worked, undocumented |
| `hooks/useSmartAutoSave.ts` | the render-loop fix in §14, plus a leftover `__DIAG_RENDERS` counter | worked, undocumented |

So: an unfinished second attempt at §9 existed, it was already most of the answer,
and it was invisible from the evidence. This pass reverted the loader edit to get a
buildable baseline, reproduced §9 from that baseline, and only then re-applied a fix —
which is the order that produced §14's measurements. All three leftover probes are
removed; a grep for `__DIAG` in `src/` returns nothing.

## 14. §9, diagnosed: the reading in §9 is wrong, and here is the measurement

§9 says:

> the manual save's poll reads `Lusaka` (the profile's town) where the student typed
> `Kabwe`, and the personal fields the journey had just filled — NRC and phone — are
> **empty**. That is a draft re-hydration overwriting live edits, not a save that did
> not fire.

**It is a save that did not fire, and nothing re-hydrated.** Both halves of that
sentence are falsified by measurement, and `Lusaka` is not the profile's town — the
harness creates the draft row with `residence_town: 'Lusaka'`
(`tests/harness-e2e/helpers/api.ts`), and the row still held its creation values
because the row was never written to. Full numbers:
[`raw/diagnosis-autosave-measurements-pass2.txt`](raw/diagnosis-autosave-measurements-pass2.txt).

With the base commit's shapes restored, one 25-second wizard session on the mobile
project:

| | base-commit shapes | as shipped |
|---|---|---|
| renders in a 12 s window | **1,595** (~133/s) | **17** (~1/s) |
| autosave interval armed | **3,467** | **1** |
| autosave interval fired | **0** | **2** |
| application writes that left the browser | **0** | 1 PUT at 8.9 s |
| the form, at every checkpoint | `Kabwe`, `123456/78/9` | `Kabwe`, `123456/78/9` |
| the row afterwards | `Lusaka`, `945355/54/4`, `Harness Student` — its **creation** values | `Kabwe`, `123456/78/9`, `Characterisation Student` |

Two defects, both **pre-existing at the base commit**, both in files task 11.2 never
touched:

1. **`useAutoSave`'s interval never elapsed.** The effect that arms the 8-second
   schedule listed `saveData` in its dependencies; `saveData`'s identity changes
   whenever `onSave` does, and the wizard's adapter hands in a fresh `onSave` closure
   on every render. So the timer was torn down and re-armed on every render — armed
   3,467 times, fired 0. On the wizard, **no autosave write had ever left the
   browser.** Fixed by arming once per `(enabled, interval)` and calling the latest
   `saveData` through a ref.
2. **`useSmartAutoSave` re-rendered the wizard unconditionally.** Its
   changed-fields effect wrote a *new array* on every render — even an empty one —
   and `currentValues` is a fresh `watch()` object every render, so the effect ran,
   set state, and ran again: ~133-191 renders a second for as long as autosave was
   enabled. Fixed by keeping the array's identity stable when its value has not
   changed.

The second is why the first was decisive: an effect re-armed 190 times a second never
elapses. Together they meant the leg's only chance of persisting anything was the
manual tap — and on the mobile project that tap does not reach the control (§16).

### 14.1 So: introduced by the recomposition, or a pre-existing race made more likely?

**Neither, in the terms §9 framed it — and the honest answer is that the recomposition
removed the leg's last working write path rather than breaking hydration.**

What can be said with evidence:

- The **defect** is pre-existing. Both shapes are the base commit's, in
  `src/hooks/useAutoSave.ts` and `hooks/useSmartAutoSave.ts`. Neither file is in the
  first pass's change table, and restoring either shape reproduces the failure.
- The **hydration** claim is withdrawn. No hydration ran twice, and the form held the
  typed values at every checkpoint including after the save. Draft re-hydration was
  never involved.
- The **leg passed before the recomposition** because the manual tap landed then. It
  fails after because the tap no longer lands on the mobile project — and the control
  it has to land on is `WizardActionBar`, which this task created. That is the
  recomposition's contribution, and it is a contribution to the *symptom*, not to the
  defect: with autosave silently dead, the tap was the only writer, so anything that
  cost the tap turned a dead autosave into a red test.
- Why it took the second pass to see this: with autosave dead, **the wizard's
  8-second save had never worked on this tree at all**, and no test asserted that a
  write leaves the browser on a timer. The leg asserted a *value on the server* and
  was satisfied by either writer, so the dead one stayed invisible until the surviving
  one broke.

The exoneration §9 declined to claim is therefore still declined, precisely: this
task's component is why the leg went red, and two pre-existing defects are why it
could. Both are now fixed, and the fix is in the persistence layer where R10.2 puts
it — not in a view.

### 14.2 §2.2's gap is a *different* defect, and it is now closed too

§2.2 records, as unfixed, that a saved town does not come back on the next resume.
The task asked whether it is the same defect as §9. **It is not.**

- §9 is a **write** defect: nothing reached the platform.
- §2.2 is a **read** defect: the platform holds the answer and the wizard hydrates
  from the wrong source. `draftApplications` is the application *list*, and
  `ApplicationListSerializer` (`backend/apps/applications/serializers.py`) carries
  `full_name`, `email`, `phone` — and **no other personal answer**. So resume wrote
  `''` over nine stored fields: NRC, passport, date of birth, sex, residence town,
  country, nationality, and both next-of-kin values.

Measured directly, one step after a resume and before any typing, against a row that
held both values: `{"nrc":"","town":""}`.

That measurement also explains the observation §9 built its story on. The "NRC and
phone are empty" in the failure snapshot was not typed values being wiped — those
fields **arrive empty on every resume**, which is §2.2. One symptom, two causes,
merged into one wrong diagnosis.

Closed by `fillDraftPersonalFieldsFromRecord` (`lib/draftResume.ts`), read by the
loader — the hydration owner R10.2 names — which now reads the authoritative row for
the answers the projection omits. Direction of authority is explicit and tested: the
record supplies only what the list lacks, the list still wins on everything it
carries (programme, intake, institution, status, payment), and **a blank never wins**.
A failed record read returns the list item unchanged, so a resume is never blocked by
it. One extra `GET /applications/{id}/` per resume, in the resume path only.

## 15. What was added for it

| Path | What it is |
|---|---|
| `…/applicationWizard/lib/draftResume.ts` | `DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST` + `fillDraftPersonalFieldsFromRecord` — **new**, pure, total; the nine fields named once, next to the serializer that omits them |
| `…/hooks/wizard/useWizardDraftLoader.ts` | reads the row for those nine fields before hydrating; the comment says which serializer and why |
| `src/hooks/useAutoSave.ts` | the interval is armed once per `(enabled, interval)` and calls the latest `saveData` through a ref; the note carries the arm/fire numbers |
| `…/hooks/useSmartAutoSave.ts` | stable `changedFields` identity; the note carries the render numbers |
| `tests/unit/wizardDraftResume.test.ts` | **+7 cases**: the field list, the fill, the two directions of authority, whitespace, no readable record, idempotence |
| `tests/property/wizardDraftHydration.property.test.ts` | **new, 4 fast-check properties** over the fill's whole input space: a present list value is never replaced; no field outside the nine is touched; a field only ever moves absent → present; pure and idempotent. Task invariants, not numbered spec properties |
| `tests/harness-e2e/required/student-wizard-mobile.spec.ts` | **journey 8** — a resumed draft rehydrates the answers the projection omits, asserted against the platform's own row rather than against the fixture |

## 16. Two vacuous passes found while diagnosing, and what each turned out to be

Neither is a product defect. Both are recorded because a green assertion that cannot
fail is worse than a red one.

**16.1 The manual tap in the failing leg never reaches the control (mobile).**
Playwright reports the click as successful, the button is enabled, its box measures
44 × 44 — and zero click listeners fire on it. After `scrollIntoViewIfNeeded()` plus a
1.2 s settle, the same click lands and `forceSave` runs. The shell sets
`scroll-behavior: smooth`, so the auto-scroll animates and the event is dispatched at
a coordinate the control has already left. A student taps what they can see, so this
is a **test-interaction artifact**. It is not fixed in the characterisation file,
because that file must read identically before and after a change and its 8 journeys
must pass unchanged — but it does mean the leg's manual-save assertion is satisfied by
the restored 8-second autosave write, not by the tap. Stated rather than implied.

**16.2 The action bar is not anchored, at any width — and journey 1's hit test passed
because of it.** Measured: `position: sticky`, `rect.top 751` in a **727**-high
viewport with a **2,915** px document. `PageShell`'s root is `overflow-x-hidden`, and
`overflow-x: hidden` computes `overflow-y: auto`, which makes it a scroll container;
a `sticky` child of a container as tall as its own content has no range to stick in.
So journey 1's comment —

> at 375 and 390 the step's own content is short enough that the bar sits at the
> natural end of the page instead of against the viewport

— is the right observation with the wrong cause, and it is not a width question.
Worse, journey 1's *hit test* asked `elementFromPoint(...)?.closest(bar) === null` on
an un-scrolled page: for a control below the fold, `elementFromPoint` answers `null`,
`undefined === null` is `false`, and the claim passed **because** the control was
off-screen. That assertion now scrolls the control into view, waits for the smooth
scroll to settle, and demands a positive answer (`'the action bar'`). It passes at
320, 375 and 390 on both projects.

The layout itself is deliberately **not** changed. Making the bar truly viewport-
anchored needs either the shell's `overflow-x-hidden` relaxed on `PageShell`, `MAIN`
and `body` — a global layout change affecting every page — or a portal out of the
transformed subtree. Both are larger than this task's bullet and belong with whoever
owns `PageShell`. What is fixed here is the claim: the bar is the wizard's one bottom
action surface at the end of the form, nothing competes with it, and the assertion
that says so can now fail.

## 17. A third race, in journey 5, made deterministic

Journey 5 (offline) began failing on both projects — the page replaced by
*"Something went wrong: Cannot read properties of undefined (reading
'SessionMonitor')"*. The shell imports its heavy global UI on a deferral
(`useDeferredHydration(…, 1800)` in `AuthenticatedRouteShell`), so a lazy chunk
request can start *after* the wizard has settled; cutting the network mid-flight fails
that chunk, and a failed `lazy()` import takes its subtree to the error boundary.
Observed both ways on the same build.

The journey now waits until the app has stopped fetching before it cuts the network
(`waitForNetworkQuiet`) — the app's own activity, not a clock, for the reason §5.1
gives about the deep-link gate. Green on both projects on three consecutive runs. The
underlying question — whether a failed lazy chunk should take a page down — is the
shell's, not the wizard's, and is left alone.

## 18. MAINT-01's controller half: 1,773 → 1,110, lifted verbatim

Three seams, in `hooks/wizard/` where §11 said the seams already were. Each is one
bounded workflow, each body is **byte-identical** to the block it replaced, and both
facts are checked mechanically rather than asserted (the extraction script compared
the new file's body against the captured original line by line; all three reported
`verbatim: True`).

| New module | Lines lifted | The workflow it owns |
|---|---|---|
| `hooks/wizard/useWizardStepAdvance.ts` | **472** | the forward command: the programme/intake pair, the assigned-school checkpoint, draft create/update plus the reroute command, the education gates and grade sync, and the payment gate |
| `hooks/wizard/useWizardSubmission.ts` | **176** | the submit command: final readiness, the idempotent submit, the institution label, cache invalidation, and every recoverable failure including R2.7's assignment re-run |
| `hooks/wizard/useWizardAssignment.ts` | **106** | the assigned-school checkpoint's own reads: preview, resolved-or-not, recovery guidance, the contact mailto, and the interest list |

- **Dependency lists are unchanged in content and order.** Adding the setters and
  refs the lint rule would like changes *when* a callback is rebuilt, which is a
  behaviour change a lift may not make. Where that produced an unnecessary
  `eslint-disable`, the directive was removed rather than left as a new warning.
- **No transport import was added.** The submit command reads the institution
  catalogue through the API client; rather than import it (R14.3 forbids it, and the
  repo's `no-restricted-imports` rule enforces it) the client is injected as a
  parameter *named* `apiClient`, so the body stays byte-identical and the new module
  stays free of transport. The controller, which already owns that import, supplies it.
- **Why verbatim and not tidier**: §10.1. The first pass re-authored one validation
  function and silently dropped the `gradesHydrating` guard, the duplicate-subject
  error, the still-uploading guard and six field labels — caught by two *other* lanes'
  property tests. Nothing here was retyped.
- **17 imports the extraction orphaned were removed** from the controller. Fourteen
  more were already dead before this session (earlier refactors into `hooks/wizard/`
  left them); those are left alone, because dead-code cleanup is task **12.4**'s lane
  and mixing it in would make this diff unreadable.
- What remains in the controller is state, catalog/identity resolution, the grades
  and upload adapters, OCR, readiness, the effects, and the result object. Task
  **12.1** names the same work and now has three fewer workflows to move.

### 18.1 Three more source-location pins repointed, no claim changed

The same class §7.7 handled, for the same reason: a decomposition breaks pins on
*where code lives* by construction.

| Test | What it pinned | Where it points now |
|---|---|---|
| `tests/unit/useWizardController.contract.test.ts` | `goToStep(currentStepIndex + 1)` in the controller | the controller plus its extracted sub-hooks as one surface — the list its own comment already described, with two entries added |
| `tests/unit/submitIdempotency.test.ts` (2 cases) | `buildSubmitIdempotencyKey(applicationId)` and exactly one `Idempotency-Key` header, in the controller | controller + `useWizardSubmission.ts`, joined — so "exactly once" is still a real count across both |
| `tests/unit/wizardAssignmentPatchLock.test.ts` (3 cases) | the update payload carrying no assignment field, and the rejected-reroute guard, in the controller | `useWizardStepAdvance.ts`, with the reroute case reading the command and its adapter together |

Every behavioural claim is the same claim about the same strings, and the strings moved
without being retyped.

## 19. Verification (verbatim)

### 19.1 Frontend suites, against the first pass's numbers

```
cd apps/admissions && bun run test -- --run
```

| Run | Result |
|---|---|
| first pass | 1 failed, 4406 passed, 1 skipped (486 files) |
| **second pass** | **1 failed, 4417 passed, 1 skipped (487 files)** — [`frontend-test-pass2.txt`](raw/frontend-test-pass2.txt) |

- **New failures: 0.** The one failure is the same one both passes recorded:
  `authPageFormMarkup.test.tsx > uses honest helper copy instead of fake email
  availability states` — the **sign-up page's** helper copy, which neither pass
  touches. Not fixed here either; this task claims no repair of another lane's failure.
- **+11 passing, and the arithmetic closes exactly**: 4417 − 4406 = 11 = 7 (new
  `wizardDraftResume` cases) + 4 (new `wizardDraftHydration` properties). +1 file for
  the same reason.
- The three source-pin files that the split broke are counted at their existing
  totals: they were repointed, not rewritten, and none gained or lost a case.

### 19.2 Lint

```
cd apps/admissions && bun run lint    # 17 errors, 14 files
```

**Unchanged at 17**, and the file set is byte-identical to both the baseline and the
first pass's set (`diff` of the two sorted lists is empty) —
[`frontend-lint-pass2.txt`](raw/frontend-lint-pass2.txt),
[`frontend-lint-files-pass2.txt`](raw/frontend-lint-files-pass2.txt). None of the 14
is a file either pass created. The three new modules contribute **zero** findings,
which is why the submit command takes its client as a parameter (§18).

### 19.3 Build

```
cd apps/admissions && bun run build   # exit 0
```

Including `tsc` and the CSP gate ([`frontend-build-pass2.txt`](raw/frontend-build-pass2.txt)).
`tsc -p tsconfig.build.json --noEmit` reports **zero** errors — which is also the
first thing this pass had to restore (§13).

### 19.4 Django check

```
cd backend && .venv/bin/python3 manage.py check   # no issues (1 silenced)
```

No `TESTING=1`, no substitute `REDIS_URL` —
[`django-check-pass2.txt`](raw/django-check-pass2.txt). Run for the same reason as
§7.4: this task consumes a backend contract and changes none of it.

### 19.5 The browser gate

Isolated local harness (task 0.4), strict gates active, `HARNESS_PW_CHANNEL=chrome`,
`harness/bin/harness build` after **every** code change, and **torn down afterwards**
(`harness down`, volumes wiped — verified: zero harness containers running).

| Run | Result |
|---|---|
| the characterisation journeys, final build | **8 passed** — 4 journeys × desktop + mobile, zero skips ([`harness-characterisation-after-pass2.txt`](raw/harness-characterisation-after-pass2.txt)). §9's leg is green on both projects |
| this task's wizard journeys, final build | **16 passed** — 8 journeys × desktop + mobile ([`harness-wizard-mobile-pass2.txt`](raw/harness-wizard-mobile-pass2.txt)) |
| the whole required profile | **180 passed**, 4 failed, 2 did not run ([`harness-required-suite-pass2.txt`](raw/harness-required-suite-pass2.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`harness-gatecheck-pass2.txt`](raw/harness-gatecheck-pass2.txt)) |
| drain | broker 0, unsettled payment collections 0 ([`harness-drain-pass2.txt`](raw/harness-drain-pass2.txt)) |

Against the first pass's 169 passed / 5 failed: **+11 passing** (journey 8 × 2, the
characterisation leg that was failing, and the admin-roster pair that was flaking,
plus the journeys the first run's 8 non-starters never reached).

### 19.6 The four required-profile failures, attributed

| Failure | Reading |
|---|---|
| `tenant-launch.spec.ts:139` × **both** projects | **stable pre-existing.** The same pair tasks 10.5, 10.6, 11.1 and this task's first pass each recorded at this base commit |
| `admin-dashboard-metrics.spec.ts:356` (desktop only) | **admin-lane flake.** Re-run in isolation on the same build: **passes**. Same species as the `admin-applications-roster:325` flake the first pass recorded — and that pair now passes |
| `official-document-durability.spec.ts:536` (mobile only) | **another lane's, and not attributable to this task.** See below |

The official-document failure deserves the detail, because it is the one appearance
this pass cannot dismiss with a re-run:

- It **reproduces** deterministically on the mobile project, in the full profile and
  in isolation, and on a **freshly seeded** stack (torn down, volumes wiped, brought
  up again) — so it is not accumulated harness state.
- It **passed on mobile in the first pass's run** at this same base commit
  (`raw/harness-required-suite.txt`, line 151).
- The surface is `/student/application-status` (`ApplicationStatus.tsx` plus the
  document actions), and its failure snapshot shows the reason: the document actions
  are inside a **collapsed disclosure** on mobile, so the journey's `:visible` locator
  finds nothing. That is a rendering decision by that page.
- **Nothing this task changed is reachable from it.** `useAutoSave` /
  `useSmartAutoSave` have exactly three consumers in `src/`, all of them wizard files;
  `ApplicationStatus.tsx`, `ApplicationSlipActions.tsx` and `DocumentButtons.tsx`
  import nothing from `applicationWizard/`, `useAutoSave` or `draftResume`.
- So it is the **official-documents lane's** (task 10.6 / STU-18), and it is not fixed
  here — the same rule this task applied to the sign-up helper copy, the 17 lint
  errors and `tenant-launch`.

## 20. Design (PRODUCT.md / DESIGN.md)

No new surface was added, so §12 stands unchanged. The one visual-adjacent change is
an assertion, not a style: journey 1's hit test now proves the primary control is
reachable instead of passing while it is off-screen (§16.2). No token, colour, icon,
motion or target size changed; the three new modules render nothing.

## 21. Hard constraints

- **Auto-save is mandatory and resilient, and must never be removed without a
  replacement.** This pass is the first time on this tree that the wizard's 8-second
  autosave *actually writes* (§14: 0 writes before, 1 per interval after). Nothing was
  removed; a schedule that never elapsed now elapses, and the manual save is untouched.
- **Drafts survive refresh, reconnect and interruption.** Journey 5 (offline → type →
  reconnect) and the characterisation autosave leg both assert it, on both projects.
- **Local snapshots stay recovery caches, keyed by user + application.** Unchanged;
  task 6.3's single-application-addressed cleanup is untouched, and no payment-recovery
  record is read or written here.
- **No PII in logs.** The one new log line names a failed record read and carries
  `sanitizeForLog(...)` of the error message only.
- **Mobile-first usability preserved.** 16 wizard journeys × 3 widths, plus the
  strengthened hit test.

## 22. Not claimed here, and what remains

- **The controller is smaller, not finished.** 1,773 → **1,110**. Task **12.1** owns
  the rest (state, catalog/identity resolution, grades/uploads/OCR adapters, the
  effects, the result object), and now has three fewer workflows to move.
- **The action bar is still not viewport-anchored** (§16.2). The claim is corrected
  and the assertion is real; the layout fix needs `PageShell`'s `overflow-x-hidden`
  relaxed across the shell or a portal, and belongs to whoever owns `PageShell`.
- **The manual-save tap is still not what satisfies the leg** (§16.1). The artifact is
  Playwright's smooth-scroll dispatch, not the product, and the characterisation file
  is deliberately left unchanged.
- **A failed lazy chunk still takes a page to the error boundary** (§17). Journey 5 no
  longer races it; the shell's chunk-loading resilience is not this task's.
- **`buildWizardReadiness` still drives the step gates.** Only the *displayed*
  blockers come from the server (§4).
- **Fourteen pre-existing dead imports remain in the controller** (§18) — task 12.4's
  lane.
- **The pre-existing failures are not fixed**: 1 frontend, 17 lint, and 4 harness (2
  stable `tenant-launch`, 1 admin-lane flake, 1 official-documents-lane mobile
  failure). Each is measured against a real run and attributed elsewhere (§19.1,
  §19.2, §19.6).
- **No new capability, route, endpoint, schema or contract.** The catalogue stays at
  17 `platform.*` + 17 `tenant.*`; nothing to rehearse on Neon, nothing to regenerate.
