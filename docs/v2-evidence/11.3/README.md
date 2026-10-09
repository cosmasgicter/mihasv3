# Task 11.3 — Reduce application/document action density

Evidence index for task **11.3** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [x] 11.3 Reduce application/document action density
  - Show application status/next action first.
  - Use one primary document action and accessible menu/sheet for download/email
    and historical documents; keep live status feedback outside dense rows.
  - _Requirements: R13.1-R13.2, R16.1-R16.7_
  - _Findings: STU-05, STU-18_
  - _Evidence: long-name/mobile snapshots and keyboard/screen-reader tests_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-10 (UTC).
- **This session found partial work already in the tree** (the presenter, the
  recomposed `DocumentButtons`, the row's next-action block, the property test and
  the three measured baselines) and finished it. §3 records the one thing that
  partial work had **wrong**, which no unit test could have caught and the browser
  gate did.
- **Schema: no.** No SQL script, no migration, no model change, **no backend
  change at all** — tasks 10.3, 10.4 and 11.1 already publish everything these
  surfaces render. The OpenAPI contract is unchanged and was not regenerated; §4.4
  records the `manage.py check` that proves the backend is untouched rather than
  merely claiming it.
- PBT: task 11.3 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`), so nothing is recorded through
  `update_pbt_status` and no numbered spec property is claimed. The six fast-check
  invariants in `officialDocumentPresentation.property.test.ts` are **task
  invariants**, and the file says so at the top. Stated rather than silently
  skipped.
- **Two tasks pointed work here, and both are answered.** Task 11.1 §11 recorded
  that *"the application row is not de-densified — `ApplicationListItem` still
  carries its details grid, its waitlist/conditions/enrollment blocks and its
  document actions"* (§2, §5). Task 11.2 §19.6 recorded
  `official-document-durability.spec.ts:536` failing on the mobile project because
  *"the document actions are inside a collapsed disclosure on mobile, so the
  journey's `:visible` locator finds nothing"* — **the fix was the surface**, and
  §6 says why, with the measurement.

## The Required_Evidence claim

The `_Evidence:` line names three artifact kinds. All three are produced by
assertions, not taken by hand.

| Claim | Where it is settled |
|---|---|
| **long-name** | Journey 1 seeds an institution named *"Beanola Metropolitan Institute of Advanced Clinical and Biomedical Sciences"* and an intake named *"January 2027 Extended Late-Entry Intake for Returning and Transferring Applicants"*, asserts one of them is on screen, and then asserts `scrollWidth - clientWidth <= 1` at each width. Journey 2 does the same for the dashboard row, closed **and** open. §7.1 states plainly which display snapshot a journey can and cannot author, and why the programme name is not one of them |
| **mobile snapshots** | [`screenshots/documents-{320,375,390}-{chromium,mobile}-required.png`](screenshots/) — journey 1 at the three widths R16.7 names, on both projects, taken **before** the sheet is opened because the resting surface is what STU-05 is about. Plus [`documents-320-open-*`](screenshots/) (the sheet holding all five commands) and [`dashboard-row-320-*`](screenshots/) (the row at its narrowest) |
| **keyboard / screen-reader** | Journey 3 (`:focus-visible` + a computed focus ring, `Enter` to open, every revealed command focusable *and* enabled, `Tab` order, `Enter` to close) and journey 4 (one live region, in the tree only when reachable, one name per document, `aria-controls` resolving to the element that holds the commands, and the region narrating the platform's own words) |

### The browser journeys

| Journey | The claim it settles |
|---|---|
| **1. one action at 320 / 375 / 390** | the panel states what the platform has *before* any control; exactly **one** of three available documents gets a prominent control; the sheet's label counts what it hides and opening it yields exactly that many commands; every target is ≥ 44 px **measured**; no horizontal overflow with a long institution and intake name in the page |
| **2. the dashboard row is not a stack of stacks** | the row's next action is above its documents in the DOM *and* on screen; the row adds **no** prominent document control and exactly one control in total; its live region is out of the accessibility tree while the sheet is closed |
| **3. a keyboard reaches every command** | the trigger is focusable with visible focus, `Enter` opens and closes it, and every command it revealed is focusable and operable |
| **4. a screen reader is told once** | one polite region for the whole surface, outside the sheet at panel density; each document named exactly once; `aria-controls` resolves; and the region's sentence names the document the platform is actually working on |

## What this task establishes

1. **One prominent control where there were three, and every command still
   reachable** (§4.1, journey 1). An approved application with a settled fee
   offers an acceptance letter, an application slip and a payment receipt. Before
   this task that was three equally prominent downloads plus three email
   affordances — and the slip's email affordance was a text input the platform
   would refuse. It is one button and one counted sheet now, and the sheet's count
   is asserted to be honest.
2. **The surface is rendered once, at every width** (§2). It used to render
   **twice** — a `sm:hidden` mobile `<details>` and a `hidden sm:flex` desktop row
   — so every document mounted two `useOfficialDocument` instances with two
   independent states, a screen reader met every heading twice, and up to eight
   `aria-live` regions competed on one card.
3. **A phone student can see that a document exists without opening anything**
   (§6). The pre-11.3 mobile `<details>` was **collapsed by default and held the
   only controls**, labelled just "Documents". A student whose acceptance letter
   was ready saw a closed box. That is not a density fix; it is the platform
   publishing a ready artifact and the surface hiding it — and it is exactly why
   11.2's §19.6 failure was real rather than a locator problem.
4. **The row leads with the platform's next action, and adds no document
   prominence of its own** (§5). A prominent per-application download *is*
   STU-05's stack, multiplied by the number of applications on the dashboard, so
   at `row` density even the download lives in the sheet — and the live region
   lives in there with it, which is the "keep live status feedback outside dense
   rows" half of the bullet.
5. **Nothing here decides what a document *is*** (§7.2). Issuance eligibility is
   `isOfficialDocumentOffered`'s (a pure mirror), read-existing eligibility and
   the `historical` flag are the server's (task 10.4), the next action is task
   11.1's resolver reading task 10.3's readiness or the canonical payment status,
   and this task decides only **order and prominence** — in a pure function with
   no hook, no request and no status rule.
6. **The one thing the partial work had wrong was invisible to jsdom** (§3). The
   sheet's `hidden` attribute was defeated by its own `flex` utility class, so in
   a real browser every command was visible at all times while
   `aria-expanded="false"` claimed otherwise. The whole density fix was inert, and
   only a laid-out page could say so.

## Files

```
docs/v2-evidence/11.3/
├── README.md                                    ← this index
├── screenshots/
│   ├── documents-320-chromium-required.png          (journey 1, desktop project at 320x568, sheet closed)
│   ├── documents-320-mobile-required.png            (journey 1, mobile project at 320x568, sheet closed)
│   ├── documents-375-chromium-required.png
│   ├── documents-375-mobile-required.png
│   ├── documents-390-chromium-required.png
│   ├── documents-390-mobile-required.png
│   ├── documents-320-open-chromium-required.png     (journey 1, the sheet holding all five commands)
│   ├── documents-320-open-mobile-required.png
│   ├── dashboard-row-320-chromium-required.png      (journey 2, the row at its narrowest, resting)
│   └── dashboard-row-320-mobile-required.png
└── raw/
    ├── frontend-test-baseline.txt                   (BEFORE any 11.3 source change: 1 failed / 4417 passed / 1 skipped, 487 files)
    ├── frontend-test.txt                            (candidate: 1 failed / 4442 passed / 1 skipped, 489 files)
    ├── frontend-lint-baseline.txt                   (17 errors, before)
    ├── frontend-lint-files-baseline.txt             (14 files, before)
    ├── frontend-lint.txt                            (17 errors, after)
    ├── frontend-lint-files.txt                      (14 files — byte-identical to the baseline set)
    ├── frontend-build.txt                           (exit 0, incl. tsc and the CSP gate)
    ├── django-check.txt                             (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── harness-required-suite.txt                   (FRESH stack: 192 passed / 2 failed / 0 did not run — §4.5)
    ├── harness-gatecheck.txt                        (4 failed, as required — the gates fire)
    ├── harness-drain.txt                            (broker 0, unsettled payment collections 0)
    │
    │   ── the attribution work behind §4.6 ──────────────────────────────────────
    ├── harness-required-suite-accumulated.txt       (the same profile on an ACCUMULATED stack: 187 / 3 / 4)
    ├── harness-flake-isolation.txt                  (the three accumulated-stack failures, each green in isolation)
    ├── harness-roster-page-count.txt                (the roster's own brittle page-count regex, reproduced)
    └── harness-golden-lifecycle-repointed.txt       (the golden lifecycle green on both projects after §8)
```

Source of the change:

| Path | What it is |
|---|---|
| `apps/admissions/src/lib/officialDocumentPresentation.ts` | **new**, 239 lines — the pure presenter. `presentOfficialDocuments` (the primary/overflow split), `officialDocumentSummary` (the status sentence), `officialDocumentOverflowLabel` (the count), `announceOfficialDocumentState` (the one live sentence), and `OFFICIAL_DOCUMENT_COPY` / `OFFICIAL_DOCUMENT_PRIORITY`. No hook, no request, no status rule |
| `apps/admissions/src/components/student/DocumentButtons.tsx` | **157 → 489**. Rendered **once** at every width, status first, one primary control, one counted ARIA disclosure, one live region, `density: 'panel' \| 'row'`. The `hidden`/`flex` fix and the "one container deep" panel treatment are both here (§3, §9) |
| `apps/admissions/src/components/student/ApplicationSlipActions.tsx` | **deleted** (196 lines). It existed to give the slip two equally prominent buttons plus an inline `<input type="email">` the platform refuses. Folded into `DocumentButtons` |
| `apps/admissions/src/components/student/ApplicationListItem.tsx` | **215 → 274**. Status and the platform's next action first; the two browser-derived commands (payment, enrollment) replaced by task 11.1's resolver; the enrollment block kept as *status*; the documents at `row` density |
| `apps/admissions/src/pages/student/ApplicationStatus.tsx` | the hero block, the browser-derived "Decision snapshot" and `PageShell`'s four passive `metrics` tiles removed from above the student's own action; task 11.1's `NextActionPanel` is the first thing on the page (§5.2) |
| `apps/admissions/src/components/student/applicationStatus/NextActionCards.tsx` | the duplicate payment affordance removed (R16.5): the page used to derive `{href, label}` in the browser and hand it down, while the resolver answers the same question |
| `apps/admissions/src/lib/officialDocumentGate.ts` | one doc comment: `ApplicationSlipActions` was folded in. The gate itself is **unchanged** — it is still exactly the issuance mirror |
| `apps/admissions/tests/unit/documentActionDensity.test.tsx` | **new**, 19 cases — the DOM-answerable half: how many prominent controls, what order, which element owns the live region, whether the disclosure carries real ARIA state, and the `hidden`/`flex` agreement guard §3 forced |
| `apps/admissions/tests/property/officialDocumentPresentation.property.test.ts` | **new**, 6 fast-check invariants over the presenter's whole input space — five of them are the statement *"no command is lost"* |
| `apps/admissions/tests/harness-e2e/required/student-document-density.spec.ts` | **new** — the 4 required journeys, desktop and mobile |
| `apps/admissions/tests/unit/documentUiStates.test.tsx` | the slip's three service-path claims moved from `ApplicationSlipActions` to `DocumentButtons`; one case replaced (§7.3) |
| `apps/admissions/tests/harness-e2e/required/official-document-durability.spec.ts` | **one helper repointed** (§6.2). Every behavioural claim unchanged |
| `apps/admissions/tests/harness-e2e/required/student-lifecycle-golden.spec.ts` | **three pins repointed** (§8). Every behavioural claim unchanged |

---

## 1. What was wrong (STU-05, STU-18)

STU-05, verbatim: *"Application document actions become a tall stack of equally
prominent buttons on mobile."* Remedy: *"Present status first, one primary action,
and an accessible overflow/menu for secondary document commands."*

The state that produces the stack is a real one — an approved application whose
fee is settled. It offers three documents, and the pre-11.3 surface gave each of
them a button of the same weight, plus an email affordance each. On the dashboard
that whole cluster was repeated per application.

STU-18's surface clauses were the other half: *"Existing documents are hidden
after terminal status"* and *"generic email is missing"*. Task 10.4 fixed the
backend and the offering rule; what it could not fix from there is that on a phone
the controls were **inside a collapsed box**, so a student could not tell there
was anything to open.

## 2. The duplicate render, which is the root of most of it

`DocumentButtons` ended in this, verbatim from the base commit:

```tsx
{/* Mobile: collapsible */}
<details className="group w-full rounded-lg border border-border bg-muted/30 sm:hidden">
  <summary …>Documents<ChevronDown …/></summary>
  <div className="space-y-2 border-t border-border px-3 py-3">
    {hasSlip && <ApplicationSlipActions … compact />}
    {acceptanceBtn}{conditionalBtn}{receiptBtn}
  </div>
</details>
{/* Desktop: inline */}
<div className="hidden w-full flex-col gap-2 sm:flex …">
  {hasSlip && <ApplicationSlipActions … />}
  {acceptanceBtn}{conditionalBtn}{receiptBtn}
</div>
```

Every consequence below follows from those two branches existing at once:

- each document type mounted **two** `useOfficialDocument` instances with two
  independent states, so the copy a student pressed was not the copy the other
  viewport would have driven;
- a screen reader met every document heading, note and `role="alert"` twice;
- each control carried its own `aria-live="polite"` — `ApplicationSlipActions`
  had one on the download button *and* one on its success line — so a card with
  four documents had up to eight live regions bolted to elements whose own
  accessible names were changing;
- the mobile branch was **collapsed by default and held the only controls**.

The surface renders once now, at every width. That is what makes "one primary
action" a statement about the product rather than about a breakpoint.

## 3. The one thing the partial work had wrong, and only a browser could say so

The sheet was written as a permanently-`flex` container carrying the `hidden`
attribute:

```tsx
<div id={panelId} hidden={!open}
     className="flex w-full flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
```

Journey 1 failed on **both** projects, at 320 px, on the first run:

```
Error: the closed panel offers the primary plus the sheet trigger at 320
expect(received).toBe(expected) // Object.is equality
Expected: 2
Received: 5
```

`[hidden] { display: none }` and `.flex { display: flex }` have **equal
specificity** — an attribute selector and a class selector are both `0,1,0` — so
source order decides, and Tailwind emits utilities after preflight. `.flex` wins.
The attribute was inert.

So the surface shipped with **every command visible at all times**, while
`aria-expanded="false"` told assistive technology the opposite. The density fix
was decorative: the "sheet" was a heading over a flat stack. That is STU-05 back
again, wearing the fix's clothes.

Why no unit test caught it: jsdom computes no `display` from a class name. Every
jsdom assertion about the closed sheet — `hidden` present, `aria-expanded`
`false`, panel still mounted — was **true**, and the surface was still broken.

Two things were done about it:

1. the class list now agrees with the attribute
   (`${open ? 'flex' : 'hidden'}`), and the attribute is **kept** rather than
   replaced, because it is what declaratively removes the subtree from the
   accessibility tree and the tab order;
2. a jsdom-side regression guard was added — *"agrees with itself about display:
   the attribute and the class say the same thing"* — which is the strongest form
   of the claim jsdom can hold, and it fails if either half drifts.

This is the reason journey 1 asserts a **count of visible buttons** rather than
`toBeHidden()` on the panel: a container assertion would have passed on the
broken build too, because Playwright's visibility check on the panel's own box
was not what was wrong — its children were reachable.

## 4. Verification (verbatim)

### 4.1 Frontend suites, against a measured baseline

```
cd apps/admissions && bun run test -- --run
```

| Run | Result |
|---|---|
| baseline (before any 11.3 source change) | 1 failed, 4417 passed, 1 skipped (487 files) — [`frontend-test-baseline.txt`](raw/frontend-test-baseline.txt) |
| **candidate** | **1 failed, 4442 passed, 1 skipped (489 files)** — [`frontend-test.txt`](raw/frontend-test.txt) |

- The baseline is byte-for-byte the numbers task 11.2's second pass recorded
  (1 / 4417 / 1 over 487), which is the check that it is a real "before" and not a
  re-measurement of the candidate.
- **New failures: 0.** The one failure is the same one 11.1 and both of 11.2's
  passes recorded: `authPageFormMarkup.test.tsx > uses honest helper copy instead
  of fake email availability states` — the **sign-up page's** helper copy, which
  this task does not touch. Not fixed here; this task claims no repair of another
  lane's failure.
- **+25 passing, and the arithmetic closes exactly**: 4442 − 4417 = 25 = 19
  (`documentActionDensity`) + 6 (`officialDocumentPresentation` properties). +2
  files for the same two.
- `documentUiStates.test.tsx` is counted at its existing total: three of its cases
  changed *subject* (`ApplicationSlipActions` → `DocumentButtons`) and one was
  replaced by its own inverse (§7.3), so the file neither gained nor lost a case.

### 4.2 Lint

```
cd apps/admissions && bun run lint    # 17 errors, 14 files
```

**Unchanged at 17**, and the file set is **byte-identical** to the baseline set
(`diff` of the two sorted lists is empty) — [`frontend-lint.txt`](raw/frontend-lint.txt),
[`frontend-lint-files.txt`](raw/frontend-lint-files.txt). None of the 14 is a file
this task created. The presenter, the recomposed component, the two test files and
the browser spec contribute **zero** findings.

One honest note: an intermediate run of this task's own spec was 18/15, because
the ordering assertion carried an `eslint-disable-next-line no-bitwise` for a rule
this config does not enable. The directive was removed rather than the count
explained away.

### 4.3 Build

```
cd apps/admissions && bun run build   # exit 0
```

Including `tsc -p tsconfig.build.json --noEmit` (**zero** errors) and the CSP gate
— [`frontend-build.txt`](raw/frontend-build.txt).

The full `tsconfig.json` (which includes `tests/`) has pre-existing
`noUncheckedIndexedAccess` findings in other lanes' test files. This task's two
new test files and its spec contribute **zero** of them; that was checked
explicitly, and seven were fixed in this task's own files before they were left.

### 4.4 Django check

```
cd backend && .venv/bin/python3 manage.py check   # no issues (1 silenced)
```

No `TESTING=1`, no substitute `REDIS_URL` —
[`django-check.txt`](raw/django-check.txt). Run for the same reason 11.2 ran it:
this task consumes three backend contracts (10.3's readiness, 10.4's
official-document family, 8.3's payment status) and changes none of them.

### 4.5 The browser gate

Isolated local harness (task 0.4), strict gates active, `HARNESS_PW_CHANNEL=chrome`,
`harness/bin/harness build` after **every** source change, and **torn down
afterwards** (`harness down`, volumes wiped — verified: 0 harness containers, 0
harness volumes).

| Run | Result |
|---|---|
| this task's journeys | **8 passed** — 4 journeys × desktop + mobile, zero skips (inside the profile run, tests **72-75** and **169-172**) |
| the whole required profile, **fresh stack** | **192 passed**, 2 failed, **0 did not run** ([`harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | broker 0, unsettled payment collections 0 ([`harness-drain.txt`](raw/harness-drain.txt)) |

Against 11.2's 180 passed / 4 failed / 2 did not run: **+12 passing**, and it
closes exactly:

| | |
|---|---|
| +8 | this task's journeys × two projects |
| +1 | `official-document-durability.spec.ts` terminal-read on **mobile** — 11.2's §19.6 failure, fixed by the surface (§6) |
| +2 | the two `official-document-durability` legs that never ran in 11.2 because that failure aborted the serial file |
| +1 | `admin-dashboard-metrics.spec.ts:356`, which 11.2 recorded as an admin-lane flake |
| **180 + 12 = 192** | |

### 4.6 The two remaining failures, attributed

| Failure | Reading |
|---|---|
| `tenant-launch.spec.ts:139` × **both** projects | **stable pre-existing.** The same pair tasks 10.5, 10.6, 11.1 and both of 11.2's passes each recorded at this base commit. Its assertion is `getByText('Fees')` against a `Program Fees` step label the onboarding wizard renders `hidden` on mobile — the tenant lane's, not this one's |

Nothing else failed on the fresh stack. That result is worth one paragraph,
because an earlier run on an **accumulated** stack failed five more times and none
of them was real:

- `ocr-manual-fallback:146`, `student-wizard-mobile:279` and
  `admin-dashboard-metrics:356` each failed once on the accumulated stack and each
  **passes in isolation on the same build**
  ([`harness-flake-isolation.txt`](raw/harness-flake-isolation.txt)). Two are
  wizard-step races of the species 11.2 documented (§16-§17 there); the third is
  the admin-lane flake 11.2's first pass already named.
- `admin-applications-roster:325` failed with
  `Expected pattern: /Page 1 of [2-9]\d*/ · Received string: "Page 1 of 16"`
  ([`harness-roster-page-count.txt`](raw/harness-roster-page-count.txt)). That
  regex cannot match a two-digit page count beginning with `1`, so the roster
  spec passes or fails according to **how many applications the harness database
  happens to hold** — it is volume-dependent, not code-dependent. It is the admin
  lane's assertion, and it is **not** fixed here; on a freshly seeded stack it
  passes, which is the condition every other task measured under.
- The four `admin-applications-roster` legs that "did not run" on that stack were
  aborted by the same serial failure. On the fresh stack all four run and pass.

This is why §4.5's numbers come from a stack that was torn down with volumes wiped
and brought up again: an accumulated harness database is not a property of the
candidate, and reporting its flakes as failures would have been as dishonest as
hiding them.

## 5. Status and the next action, first (R13.1, R16.1)

### 5.1 The row

`ApplicationListItem` used to end in a cluster of up to seven controls and to
**derive two of them in the browser**: a `Complete Payment` button behind
`requiresStudentPaymentAction(...)` and a `Confirm Enrollment` button behind
`can_confirm && deadline`. Both are now read from task 11.1's
`resolveStudentNextAction`, which takes its verb, its label and its blocker
sentence from whichever server contract governs the application — task 10.3's
enrollment readiness published on the row, or the canonical payment status routed
to the surface task 8.3 owns.

The row asks for **no readiness of its own**: a submitted application's next
action is already on the row it was given, and a draft's next action belongs to
the dashboard's own panel and to the wizard. So the block costs no request.

Order is asserted, not asserted-about. `documentActionDensity.test.tsx` compares
document positions (next action → intake grid, next action → documents), and
journey 2 additionally compares **`boundingBox().y`**, because "first" is a claim
about the screen and not only about the markup.

The enrollment deadline stays in the row — as *status*, with its countdown, paired
with an icon and a sentence rather than signalled by colour. One row, one command.

### 5.2 The workspace

`ApplicationStatus.tsx` opened with a hero headline (*"A single view of where your
application stands and what happens next"*), three explanatory pills and a
paragraph describing how the page is organised, beside a "Decision snapshot" card
whose two tiles restated the header badge and **derived a priority in the
browser** — "Resolve payment" / "Prepare for interview" / "Confirm enrollment" /
"Watch review progress". Above all of that, `PageShell`'s `metrics` array put four
more passive tiles between the page title and the content.

All of it sat where the student's own next action belongs, and one of them was the
STU-04 derivation task 11.1 removed from the dashboard, on a second surface.
Task 11.1's `NextActionPanel` is the first thing on the page now, rendering the
server's own label, the server's own blocker sentence and the rest of the server's
actions in the server's order.

**On the overlap with task 11.5**: 11.5 owns "remove first-viewport marketing
blocks … and feature-description prose" generally. This task removed *this*
block because "show application status/next action first" cannot be satisfied
while a manifesto and a browser-derived snapshot occupy the space the action
belongs in. The rest of 11.5's de-fluff on this page and elsewhere is still
11.5's, and §11 lists what was left.

## 6. 11.2's §19.6 failure: the fix is the surface

11.2 recorded `official-document-durability.spec.ts:536` failing on the mobile
project, reproducing on a freshly seeded stack, passing in its own first pass at
the same base commit, and proved no import path from anything it had changed. It
attributed the failure to *"a rendering decision by that page"* and left it.

**That attribution was right, and the rendering decision was the defect.** The
journey asserts that an artifact the platform has already issued *stays offered*
once the application is terminal (STU-18). On mobile the only controls were inside
a `<details>` that was collapsed by default and labelled "Documents", so
`[data-testid="official-document-application_slip"]:visible` correctly resolved to
nothing. The journey was telling the truth: on a phone, the student could not see
their issued slip.

### 6.1 What fixed it

Nothing in the journey. The surface renders once at every width now, and the
primary document's control is visible **without opening anything** — so the
locator finds it. On the fresh profile the leg passes on **both** projects
(`harness-required-suite.txt`, tests **49** and **146**), and the two legs that
never ran behind it in 11.2 now run and pass too.

### 6.2 And one stale helper, repointed

`documentAction()` in that spec existed only to pick the visible copy out of two,
and did it by probing `details:has(summary:has-text("Documents"))`. Neither the
duplicate nor the `<details>` exists any more, so the helper was describing a DOM
shape that is gone.

It now looks for the control directly and falls back to opening the **counted
ARIA disclosure** when the document it wants is not the primary — which is a real
part of the journey rather than an inconvenience, because "secondary documents
live behind one control" is what the task set out to do. Its docstring records
both the old shape and why the failure happened, so the history is not lost.

Every behavioural claim in that file is unchanged. This is the same kind of change
11.2 made in its §7.7 / §18.1 — a source-location pin following a surface it
names — and it is stated here rather than folded into a diff.

## 7. Boundaries this task did not cross

### 7.1 The long name a journey can honestly plant

The programme name a student sees is the **canonical** programme's name
(`assignment_resolution.py`: `program_name=canonical.name`), and canonical
programmes are platform records with no create route — a journey cannot plant a
long one without inventing a write path that does not exist. The two display
snapshots a journey *can* author are the **institution** and the **intake** name,
and both render on surfaces this task changed. Those carry the long-name stress,
alongside the counted disclosure label, and the spec's header says so in the same
words. Substituting them quietly would have been the easy version.

### 7.2 Who decides what a document is

| Question | Whose answer | How this surface gets it |
|---|---|---|
| may a **new** artifact be minted from today's status and payment? | the issuance policy, mirrored purely | `isOfficialDocumentOffered` — untouched here |
| has the platform **already issued** one, and is it `historical`? | the server (task 10.4) | `useIssuedOfficialDocuments` — a fact about stored rows, so the browser asks |
| what is the student's **next action**? | task 11.1's resolver over 10.3's readiness / the canonical payment status | `resolveStudentNextAction` — no readiness request from the row |
| what is the **job status** of a document? | the server (task 10.4) | `useOfficialDocument` |
| which document gets the **one button**, and what does the surface say? | **this task** | `presentOfficialDocuments` — pure, total, order-independent |

### 7.3 One test case is gone, and deliberately

`documentUiStates.test.tsx` had *"blocks an invalid email address before calling
the service"*, guarding a prefilled `<input type="email">`. The platform emails an
official record to its owner and refuses every other address with
`RECIPIENT_NOT_PERMITTED` (task 10.4), so that input accepted a parent's address
and then failed at the API with a 400. Its replacement asserts the input is
**absent** — the same protection stated as a property of the surface instead of as
a client-side format check. The other three cases in that block moved subject from
`ApplicationSlipActions` to `DocumentButtons`; their claims are unchanged.

## 8. Three pins in the golden lifecycle, repointed

`student-lifecycle-golden.spec.ts` is task 10.6's, and this task changed the page
it reads. Three pins followed it; every behavioural claim is unchanged, and each
is annotated in place with what it used to read and why it moved.

| Pin | Was | Is | Why |
|---|---|---|---|
| `workspaceHeading` | `/A single view of where your application stands/` | `/^Application #/` | that heading was the hero block §5.2 removed. The page's identifying heading is `PageShell`'s own title — which is already what `official-document-durability.spec.ts` matches on, so the two specs now agree instead of pinning two different strings |
| the deferred-fee leg | `a[href^="/student/payment"]` inside the **"Next actions"** card | the same locator inside the **`student-next-action`** panel | that card carried a *second*, browser-derived copy of the payment action. R16.5 calls two controls for one action a duplicate affordance, so the derived one is gone and the read one is at the top of the page. Still scoped to a container, for the original reason: the desktop sidebar links to `/student/payment` too |
| the official-document leg | open `details`, then `official-document-application_slip:visible` | open `document-options-trigger`, then the same control | by that point the application is **approved**, so the primary control is the *acceptance letter* and the slip is a secondary document — behind the counted sheet, which is STU-05's remedy rather than an obstacle to it |

The third one is the honest cost of this task: reaching a **specific
non-primary** document now takes one tap. That is the trade STU-05 asks for, it is
counted and named on the trigger, and journey 3 proves the tap is reachable by
keyboard.

## 9. Design (PRODUCT.md / DESIGN.md)

- **No new token, colour, font or motion.** Existing tokens only: `bg-primary` /
  `text-primary-foreground` for the one primary control, `outline` and `ghost` for
  everything in the sheet, `text-muted-foreground` for the status sentence,
  `min-h-touch` / `min-h-touch-lg` for targets.
- **44 px, measured.** Journey 1 asserts `height >= 44` **and** `width >= 44` from
  each control's own layout box, at all three widths, on both projects — not from
  a class name. The unit test's `min-h-touch` check is the weaker guard that no
  control ships without the token at all.
- **Never colour alone.** Every state is a word: `Generating…`, `Queued…`,
  `Retry`, `Setup Required`, *"Issued copy on record"*, and the live region's
  sentence. `historical` is a sentence, not a tint — and not a warning, because
  the document is lawful and readable.
- **One container deep.** The sheet was written with
  `rounded-lg border border-border bg-muted/30 p-3`, which made it a second card
  inside the workspace's `SectionCard` and a second card inside the dashboard row
  — *"Cardocalypse. No cards nested inside cards inside cards. One container
  deep."* It carries no border and no background now. Task 11.2's
  `WizardContextPanel` settled the same question the same way: the card treatment
  belongs to the trigger and to the content, never to the disclosure panel. Caught
  by reading the 320 px screenshot this task's own journey produced.
- **No purple gradient, no gradient text, no glassmorphism, no emoji.** Icons are
  Lucide (`Award`, `FileCheck`, `Download`, `Mail`, `FileText`, `ChevronDown`,
  `RotateCcw`, `AlertTriangle`), every one `aria-hidden`.
- **Reduced motion respected.** The chevron's rotation and the trigger's colour
  transition both carry `motion-reduce:transition-none`; the global rule in
  `index.css` is untouched.
- **No marketing copy, no AI framing, no feature narration.** The surface says
  what the platform has and what the student can do with it. §5.2 removed the one
  paragraph on this page that described how the page was organised.

## 10. Hard constraints

- **Mobile-first usability preserved, and this is the task that restores it here.**
  The pre-11.3 mobile branch hid every document control behind a collapsed,
  uncounted box. 4 journeys × 2 projects, with journey 1 walking 320 / 375 / 390
  and journey 2 at 320, and with overflow and target size **measured** rather than
  asserted from class names.
- **Auto-save untouched.** No wizard file, no `useAutoSave` consumer and no draft
  code is in this change. `ApplicationListItem`, `DocumentButtons` and
  `ApplicationStatus.tsx` import nothing from `applicationWizard/`.
- **Official documents stay backend-rendered.** Every download and email goes
  through `services/officialDocuments.ts` via `useOfficialDocument`; nothing here
  reaches `@/lib/pdf`. `documentUiStates.test.tsx` asserts exactly that, per type.
- **No PII.** The presenter handles document type strings and copy. The recovery
  path passes an `applicationNumber` for support context — not an address, not a
  name. Nothing is logged.
- **No double charge, no double command.** The hook's own re-entrancy guard is
  what makes a double tap safe; the surface additionally keeps a control from
  *looking* available while the platform is already working on that document. The
  sheet stays mounted (`hidden`) rather than unmounting, so an action in flight is
  not torn down by collapsing it, and each document keeps exactly **one**
  `useOfficialDocument` instance.
- **Backward compatibility.** No schema, no contract, no route, no capability. The
  catalogue stays at 17 `platform.*` + 17 `tenant.*`. Nothing to rehearse on Neon,
  nothing to regenerate.

## 11. Not claimed here, and what remains

- **`ApplicationStatus.tsx` is not split.** 591 → 804 lines, and it is still one
  long page. Task **12.1** owns the split; 10.6 and this task both added to it
  rather than decomposing it.
- **The dashboard row still sits inside a second card.** `ApplicationsGrid`
  renders a bordered container and `ApplicationListItem` renders its own bordered
  card inside it — visible in [`dashboard-row-320-mobile-required.png`](screenshots/dashboard-row-320-mobile-required.png).
  That nesting predates this task and is task **11.5**'s "duplicate cards" bullet.
  This task removed the nesting it introduced (§9), not the nesting it inherited.
- **The row's waitlist and conditions blocks are still browser-fetched per row.**
  Two `useQuery` calls per waitlisted / conditionally-approved row. They are
  *status*, not commands, so they are outside this bullet — but they are the kind
  of per-row request task 12.1's consolidation should answer.
- **The rest of 11.5's de-fluff is untouched**: the first-viewport marketing
  blocks elsewhere, `/student/history`'s metrics row, remaining `window.confirm`
  calls, and the AI language.
- **`tenant-launch.spec.ts:139` is not fixed** (§4.6), and neither is the sign-up
  helper-copy test or any of the 17 lint errors. Each is measured against a real
  run and attributed elsewhere.
- **The roster's brittle page-count regex is not fixed** (§4.6). It is the admin
  lane's assertion; it passes on a freshly seeded stack, and this task's evidence
  is measured on one.
- **The two wizard flakes are not fixed** (§4.6). Both pass in isolation, both are
  the species 11.2 documented, and neither is reachable from this change.
- **No new capability, route, endpoint, schema or contract.**
