# Task 11.1 — Recompose the student dashboard around next action

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Evidence index for task **11.1** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 11.1 Recompose the student dashboard around next action
  - Put server-derived blocker/action first; make active draft/application status
    concise; remove decorative metrics and duplicate QuickActions.
  - Move destructive draft cleanup to scoped draft management.
  - _Requirements: R13.1, R16.1, R16.4-R16.8_
  - _Findings: STU-04, STU-12, MAINT-02_
  - _Evidence: 320/375/390 screenshots and task-first usability assertions_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-09 (UTC). **An earlier dispatch of this task was interrupted**
  after the code and the three test suites landed, and after one harness run
  captured screenshots — but before the property suite had ever been run, before
  the two questions task 10.6 deferred here were answered, and before this README
  existed. §10 records exactly what was inherited and the **four real defects** the
  gates then found: one in the inherited code (found by its own unused property
  suite), one contradiction inside the inherited tests, and two in the product that
  no test was looking for.
- **STU-04 is not "the dashboard is ugly". It is that the dashboard's most
  prominent claim was the one it was least qualified to make.** It derived the
  student's next action from three booleans computed in the browser — a draft
  exists, a payment looks unpaid, an interview is scheduled — so it could say
  *"finish your saved application draft"* while the platform would have refused
  that submission for a missing NRC the student was never shown.
- This task **closes both questions task 10.6 §9.2 and §12 deferred to it**: the
  shared `requiresStudentPaymentAction` helper is widened (§4), and
  `/student/history` survives, for a stated contract reason (§5).
- **Schema: no.** No SQL script, no migration, no model change, **no backend change
  at all** — 6.5, 10.2, 10.3 and 10.4 already publish everything this surface
  renders. The OpenAPI contract is therefore unchanged and was not regenerated;
  §7.4 records the `manage.py check` that proves the backend is untouched rather
  than merely claimed to be.
- PBT: task 11.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`), so nothing is recorded through
  `update_pbt_status` and no numbered spec property is claimed. It does carry a
  **task-level** property suite (8 invariants over the resolver's whole input
  space), the same way 8.3 does, and one of those invariants found a real defect
  (§10.1). Stated rather than silently skipped.

## The Required_Evidence claim

The `_Evidence:` line names **two** things.

| Claim | Where it is settled |
|---|---|
| **320/375/390 screenshots** | [`screenshots/`](screenshots/) — `dashboard-{320,375,390}-{chromium,mobile}-required.png`, captured by journey 5 of the browser spec at the three widths R16.7 names, on **both** projects, plus `dashboard-320-text200.png` from the 200%-text journey. They are produced by an assertion, not taken by hand: the same journey that captures each one first proves no horizontal overflow, the action above the fold, and every control in the panel and the draft card at ≥ 44 px ([`raw/harness-dashboard-task-first.txt`](raw/harness-dashboard-task-first.txt)) |
| **task-first usability assertions** | [`studentDashboardTaskFirst.test.tsx`](../../../apps/admissions/tests/unit/studentDashboardTaskFirst.test.tsx) (31 cases), [`studentNextActionServerVocabulary.test.ts`](../../../apps/admissions/tests/unit/studentNextActionServerVocabulary.test.ts) (19), [`studentNextAction.property.test.ts`](../../../apps/admissions/tests/property/studentNextAction.property.test.ts) (8) — **58** cases; and in the browser, [`student-dashboard-task-first.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/student-dashboard-task-first.spec.ts)'s six journeys × 2 projects |

### The browser journey's six legs

R13.1 is two claims a unit test cannot make together — that the action is the
*platform's* and that it is *first* — so both halves need a real readiness
evaluation and real layout geometry.

| Leg | The claim it settles |
|---|---|
| **1. the platform's own first blocker, first** | the readiness endpoint is asked directly, and the dashboard's heading is its first action's label, its detail is that action's blocker sentence **verbatim**, and no laid-out section sits above the panel (geometry from one layout pass, not source order) |
| **2. the action moves when the platform's answer moves** | saving the minimum grades through the student's own endpoint changes the platform's first action, and the dashboard changes with it — a dashboard that derived its own would not move |
| **3. nothing decorative survives** | no metric tile in the page header (structurally: zero `div.grid > div` in `<header>`), no clear-all, no second and third payment affordance, and none of the six removed labels |
| **4. draft cleanup is scoped and dialog-confirmed** | deleting one of two drafts leaves the other — asserted in the UI **and** against the platform's own list — through a `role="alertdialog"` that says the others survive, with a `page.on('dialog')` listener proving no `window.confirm` fired |
| **5. 320 / 375 / 390** | no horizontal overflow, the action above the fold, ≥ 44 px targets measured from layout boxes, and a screenshot at each width |
| **6. 200% text size** | at 320 px with a 32 px root font, nothing inside the panel extends past the panel and the heading keeps usable line width — it **reflows** rather than being clipped by the shell's `overflow-x-hidden` (R16.8) |

Why leg 6 is 200% text and not 400% zoom: WCAG 1.4.10 reflow at 400% zoom is
*defined* as equivalent to a 320 CSS-pixel viewport, which is exactly what leg 5
measures. 1.4.4 resize-text is the different question, and it is the one that
breaks a rem-padded card at 320 px.

## What this task establishes

1. **The next action is the platform's, and it is first.** Task 6.5's readiness
   (`blockers`, `allowed_next_actions`, `can_submit`) before submission; task
   10.3's enrollment readiness (`state`, `definition`, `blockers`,
   `allowed_actions`) after a decision; the canonical payment status for a fee
   still owed. The dashboard authors no verb, no label and no blocker sentence (§2).
2. **The one genuinely local thing is a route table**, because an action verb is
   not a URL: the server publishes `{action, label, blocker_code}` and cannot know
   this app's routes. `STUDENT_NEXT_ACTION_ROUTES` is *total* over both backend
   services' vocabulary, and a drift guard parses those two Python modules to keep
   it that way (§2.2).
3. **"We could not check" is not "nothing to do."** The panel has five honest
   states and keeps the third and fifth apart — the collapse that STU-15 named on
   the enrollment card (§2.3).
4. **Four dashboard surfaces are gone, not moved** (§3): the three-metric page
   header, `DashboardStatusOverview`, `QuickActions`, and `ApplicationTimeline` —
   plus `NextActionCard` and `ContinueApplication`, the two components that carried
   the browser-derived action and the clear-all.
5. **A deferral is a promise to pay, not a resolution** — 10.6 §9.2's deferred
   question, answered in the shared helper so all four student surfaces agree,
   with the submission gate deliberately left alone (§4).
6. **`/student/history` survives**, because it is a different contract from the
   workspace's own history, and the recomposition stops the dashboard linking to it
   (§5).
7. **Destructive draft cleanup is scoped, and there is one command.** Not two
   surfaces — **three** (§6). The third was the wizard's draft-choice screen, and it
   was the last `window.confirm` owning a destructive draft workflow.
8. **Two questions were answered rather than inherited, and four defects were
   found** by running what the interrupted dispatch had written but never run (§10).

## Files

```
docs/v2-evidence/11.1/
├── README.md                                        ← this index
├── screenshots/
│   ├── dashboard-320-chromium-required.png              (leg 5, desktop project at 320x568)
│   ├── dashboard-320-mobile-required.png                (leg 5, mobile project at 320x568)
│   ├── dashboard-375-chromium-required.png
│   ├── dashboard-375-mobile-required.png
│   ├── dashboard-390-chromium-required.png
│   ├── dashboard-390-mobile-required.png
│   └── dashboard-320-text200.png                        (leg 6, 320px at a 32px root font)
└── raw/
    ├── frontend-test.txt                                (1 pre-existing failure / 4352 passed / 1 skipped, 485 files)
    ├── frontend-test-baseline.txt                       (the same run with only this task's 3 new suites excluded: 1 / 4294, 482 files)
    ├── frontend-lint.txt                                (17 errors)
    ├── frontend-lint-files.txt                          (14 files — byte-identical to 10.6's set)
    ├── frontend-build.txt                               (exit 0, incl. tsc and the CSP gate)
    ├── django-check.txt                                 (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── harness-dashboard-task-first.txt                 (12 passed — 6 journeys × desktop + mobile)
    ├── harness-required-suite.txt                       (the whole required profile: 146 passed / 4 failed / 10 did not run — §7.5)
    ├── harness-preexisting-isolated.txt                 (the three non-11.1 failures re-run in isolation: one passes, two reproduce)
    ├── harness-officialdoc-file-run1.txt                (10.4's spec, whole file, mobile: :536 fails after :450)
    ├── harness-officialdoc-file-run2.txt                (the same, reproduced)
    ├── harness-officialdoc-isolated-with-11-1-edit.txt  (:536 alone, with this task's edit: passes in 3.4s)
    ├── harness-officialdoc-isolated-without-11-1-edit.txt (:536 alone, edit reverted: passes in 3.1s — the controlled experiment, §7.6)
    ├── harness-gatecheck.txt                            (4 failed, as required — the gates fire)
    └── harness-drain.txt                                (broker 0, unsettled payment collections 0)
```

Source of the change:

| Path | What it is |
|---|---|
| `apps/admissions/src/lib/studentNextAction.ts` | **new** — the resolver and the route table. Adds no rule: it selects *which* server payload is rendered and *where* each verb goes, and decides nothing about what the payload says |
| `apps/admissions/src/services/studentReadiness.ts` | **new** — the first student consumer of task 6.5's `GET /api/v2/student/applications/{id}/readiness/`. Answers `null` when the platform declines, never "nothing to do" |
| `apps/admissions/src/hooks/useStudentNextAction.ts` | **new** — one readiness query, for one application, only while a draft exists (§2.4) |
| `apps/admissions/src/components/student/dashboard/NextActionPanel.tsx` | **new** — the panel. Renders the server's label, the server's blocker sentence, and the rest of the server's actions in the server's order |
| `apps/admissions/src/components/student/dashboard/DraftManagementCard.tsx` | **new** — one row per draft, each addressed by its own id: continue, or delete through the product dialog |
| `apps/admissions/src/lib/studentDraftCleanup.ts` | **new** — the one scoped delete command (one user, one application, task 6.3's addressed local cleanup, the payment-linked refusal as protection) |
| `apps/admissions/src/pages/student/Dashboard.tsx` | recomposed: next action, then drafts, then applications. No `metrics`, no `/student/payment` link, no clear-all |
| `apps/admissions/src/components/student/dashboard/ApplicationsGrid.tsx` | one column; `QuickActions` and `ApplicationTimeline` removed rather than moved; the profile block flattened out of four nested tinted boxes |
| `apps/admissions/src/components/student/dashboard/NextActionCard.tsx` | **deleted** — the browser-derived action |
| `apps/admissions/src/components/student/{QuickActions,DashboardStatusOverview,ApplicationTimeline}.tsx` | **deleted** (§3) |
| `apps/admissions/src/components/application/ContinueApplication.tsx` | **deleted** — its "Delete" called `clearAllDrafts(userId)` |
| `apps/admissions/src/lib/paymentStatus.ts` | `requiresStudentPaymentAction` includes `deferred`; `isPaymentResolvedForProgress` deliberately unchanged (§4) |
| `apps/admissions/src/pages/student/ApplicationStatus.tsx` | 10.6's local `\|\| hasDeferredFee` removed as redundant; the behaviour and the copy are unchanged (§4.1) |
| `apps/admissions/src/components/student/ApplicationListItem.tsx` | the one raw workspace path repointed at the builder (§10.3) |
| `apps/admissions/src/routes/routeRegistry.ts` | `studentApplicationWorkspacePath` refuses a dot-segment id instead of percent-encoding it into a traversal path (§10.1) |
| `apps/admissions/src/pages/student/applicationWizard/index.tsx` | the **third** hand-rolled scoped delete replaced by `deleteStudentDraft` + the product dialog (§6, §10.4) |
| `apps/admissions/src/pages/student/applicationWizard/components/DraftManager.tsx`, `hooks/useMultiDraft.ts` | the wizard drawer moved onto the same command and the same dialog |
| `apps/admissions/src/pages/student/lib/dashboardReducer.ts` | `clearAllDrafts` gone |
| `apps/admissions/tests/unit/studentDashboardTaskFirst.test.tsx` | **new** — 31 cases (§8.1) |
| `apps/admissions/tests/unit/studentNextActionServerVocabulary.test.ts` | **new** — 19 cases, parsing both backend services (§8.2) |
| `apps/admissions/tests/property/studentNextAction.property.test.ts` | **new** — 8 invariants over the resolver's whole input space (§8.3) |
| `apps/admissions/tests/harness-e2e/required/student-dashboard-task-first.spec.ts` | **new** — the six journeys, desktop and mobile |
| `apps/admissions/tests/unit/studentWorkspaceConsolidation.test.tsx` | 10.6's pinning case reads the opposite claim now, deliberately (§4.2) |
| `apps/admissions/tests/unit/applicationWizardUxGuard.test.ts` | asserts the payment protection where it now lives (§6.1) |
| `apps/admissions/tests/unit/studentNextActionRoutes.test.tsx` | moved off the deleted `NextActionCard` onto the resolver |

---

## 1. What was wrong (STU-04, STU-12, MAINT-02)

STU-04:

> Student dashboard metrics and repeated card/action systems obscure the next
> required action. Quick actions duplicate bottom navigation and destructive draft
> clearing appears beside normal actions.

Read against the page as it was, that is four separate defects:

| # | What the dashboard did | Why it is a defect |
|---|---|---|
| 1 | derived the next action from `totalDraftCount > 0`, `hasPendingPayment`, `hasScheduledInterview` | the browser cannot see the platform's blockers, so the page's headline could contradict what submission would actually do |
| 2 | rendered "Submitted applications", "Profile completion", "Action needed" in the `PageShell` header — **above** the action | R13.1's ordering, literally inverted. Two of the three were counts, and "Profile completion" measured a form |
| 3 | rendered `DashboardStatusOverview` (four more tiles, a "Latest Application Status" card duplicating the row beneath it, a payment alert) and `QuickActions` ("Complete Payment", "View Interview Details") | the same fee was offered **three** times on one screen, and both quick actions are items in the global bottom navigation |
| 4 | offered "Delete" beside "Continue application", calling `clearAllDrafts(userId)` | a student with two drafts who wanted to abandon one lost both — and every draft key in `localStorage` |

Defect 4 is also STU-12's fourth clause ("clear only the addressed application
cache") and defect 3's invented timeline is MAINT-02's ("decorative metrics …
redundant feature descriptions").

R13.1 names the remedy:

> THE dashboard SHALL order each student's next required action before passive
> metrics and SHALL derive it from backend allowed-next-action data.

Both halves matter, and neither implies the other: an action first that the
browser invented is still defect 1, and a server-derived action below four metric
tiles is still defect 2.

## 2. The next action is read, not derived (R13.1)

### 2.1 Three server contracts, one at a time

`resolveStudentNextAction` asks whichever contract governs the application's
current lifecycle point, in this order:

| Lifecycle point | Contract | Where it comes from |
|---|---|---|
| an editable draft | `readiness.allowed_next_actions` + `readiness.blockers` | task **6.5**, `GET /api/v2/student/applications/{id}/readiness/` — the same evaluator `POST /applications/{id}/submit/` re-runs under its row locks |
| after a decision | `enrollment.allowed_actions` + `enrollment.blockers` + `enrollment.definition` | task **10.3**, published **on the application row** and re-run under the enrollment lock |
| a fee still owed after submission | `normalizePaymentStatus(payment_status)` | the canonical status, routed to the surface task **8.3** gave ownership of post-submission collection (R12.3) |

Two exclusions are deliberate, and both are the inverse of a finding rather than
an omission:

- **`confirmed` and `not_applicable` enrollment states are skipped.** Their
  `allowed_actions` are informational ("Your place is confirmed"); presenting one
  as the student's *next required action* is the STU-15 defect read backwards.
- **A draft's unpaid fee does not reach the payment branch.** It is already
  covered by 6.5's `PAYMENT_REQUIRED` blocker, and the wizard owns pre-submission
  pay-or-defer (R12.3). Same verb, two owners, which is why `isDraft` is in the
  route context at all.

`null` from the resolver means *this application is waiting on the school*. It
never means "readiness was unavailable": an unevaluable draft still yields the
platform's own `retry`, because 6.5 answers `CONFIGURATION_UNAVAILABLE` as a
**blocker**, not as silence.

### 2.2 The one local decision is a route table, and it is guarded

The server publishes `{action, label, blocker_code}` and cannot know this app's
routes. `STUDENT_NEXT_ACTION_ROUTES` maps each verb onto a canonical path built
from the `routeRegistry` builders. Two rules decide every entry: a pre-submission
verb goes to **the draft** (addressed by id, `?mode=resume&draftId=…`, never a bare
wizard visit — the draft-lifecycle rule in `enterprise-tenancy.md`), and a
post-submission verb goes to **the one canonical workspace** (task 10.6, R13.13),
except a fee, which goes to `/student/payment`.

It never decides *whether* an action applies. And because a table can silently
fall behind the platform, `studentNextActionServerVocabulary.test.ts` parses
`readiness_service.py` and `enrollment_service.py`, extracts every `"action":`
verb, and asserts the table is total over their union **and** contains nothing
they do not publish. Same shape as task 8.2's `payment_phase` mirror guard, for
the same reason: a mirror that is not mechanically compared is a mirror that
drifts.

The table is deliberately *not* deep-linked into a wizard step. The wizard only
honours `?step=` on history navigation; deep-linking it is task 11.2's lane, and a
link that silently lands on the wrong step is worse than one that lands where the
student left off.

### 2.3 The panel's five states, and the two that must not merge

`resolveHeading` checks in order: an action exists → loading → readiness
unavailable → no application → nothing outstanding. The third against the fifth is
the distinction that matters, and it is the same one `enrollmentReadinessOf` makes
for the post-decision half:

- *"We could not check your application just now"* — with the student's saved work
  named as safe, and the page's own reload as the control;
- *"Nothing needs you right now"* — the platform published no outstanding action.

Collapsing them would tell a student they are done when the platform has not been
asked.

### 2.4 One extra request, and only while a draft exists

Readiness is read for **one** application — the subject — and not per row.
`GET …/readiness/` runs the whole submission evaluation (assignment resolution,
canonical grades, versioned document requirements, capacity, duplicates, the
intake window), so fanning it out over a page of applications would make the
dashboard the most expensive read in the product to answer a question only the
subject has. Every other lifecycle point already answers without a second request:
10.3's readiness rides the application row, and the fee state *is* the row's
status.

`selectNextActionSubject` is a **selection**, not a derivation: the editable draft
the student has started, else the most recently active application. It decides
whose payload is rendered and nothing about what it says.

## 3. What was removed rather than moved

| Surface | What it was | Why removal and not relocation |
|---|---|---|
| the `PageShell` `metrics` array | "Submitted applications", "Profile completion", "Action needed" | it renders *between* the page title and the children, so a metrics array is literally above the next action. Journey 3 asserts zero metric tiles in `<header>` **structurally**, not by label, because two of those labels are ordinary English that legitimately appears in prose |
| `DashboardStatusOverview` | four metric tiles, a "Latest Application Status" card, a payment alert | the status card duplicated the application row beneath it and the alert duplicated the payment action. Nothing in it was a fact the student could act on that the row or the panel did not already carry |
| `QuickActions` | "Complete Payment" → `/student/payment`, "View Interview Details" → `/student/interview` | both are items in the global bottom navigation *and* both are actions the platform now publishes through the panel. R16.5 names duplicate quick actions directly |
| `ApplicationTimeline` | a narrative assembled in the browser from the application's timestamp columns | it stamped `new Date()` on events with no recorded time ("Payment Proof Under Review", "Submit Application") and showed them beside real ones. The recorded transitions live at `/student/history` and on the workspace's `ApplicationHistory` (10.6); a third invented copy is MAINT-02 |
| the `lg:grid-cols-3` split | applications beside a stack of four sidebar cards | at 320 px it was one column anyway; on desktop it made the passive column as prominent as the applications |
| the draft card's metric table | progress %, last saved, "expires in", plus a countdown recomputed from the browser clock every minute, plus its own Refresh beside the page's | a countdown from the browser clock is a claim about the server's expiry policy that the browser cannot make |

What was **kept**, and why, because de-fluffing is not deleting: the profile facts
(a wrong phone number is how a student misses an interview call — flattened out of
four nested tinted boxes, which is the nested-card shape DESIGN.md bans, and
stripped of the "Profile completion" percentage), the intake deadlines, and the
per-application rows.

One thing the removal itself surfaced: the draft card originally printed
`Saved {formatDate(...)}` unconditionally, and the first browser run rendered
**"Saved Not available"** — `applications.created_at` / `updated_at` are nullable
with no database default, so a freshly created draft can carry neither. The row now
says nothing rather than saying that. The missing default is a schema-truth
question for Phase 3 (R15.2), not something to paper over with a browser clock.

## 4. The deferred fee: 10.6 §9.2's question, answered (R13.1, STU-09)

Task 10.6 found that a student who chose to pay later reached the canonical
workspace, read *"Payment still needs attention before review can continue"*, and
was offered **nothing to do** — while `deferred_payment_reminder_task` emailed them
about that same fee every day. It fixed it *locally* and wrote down why:

> **The shared helper is deliberately not widened.** It also drives
> `Dashboard.tsx`, `ApplicationListItem.tsx` and `DashboardStatusOverview.tsx`,
> whose recomposition is task **11.1**'s lane; changing it here would silently move
> three surfaces this task measures nothing about. A case asserts the helper is
> unchanged, so the restraint is pinned rather than remembered.

This is that lane, and the dashboard is one of the three surfaces. So
`requiresStudentPaymentAction` now includes `deferred`, and the four student
surfaces agree that a deferral is a **promise to pay**, not a resolution.

**The submission gate is a different question and is untouched.**
`isPaymentResolvedForProgress` answers "may this application be submitted", where a
deferral *is* resolved — that is what deferring means. Two questions, two helpers,
and the pinning case asserts both halves so the widening cannot leak into the gate.

### 4.1 The local widening is now redundant, and is gone

With the helper answering for `deferred`, `ApplicationStatus.tsx`'s
`needsPaymentAttention = requiresStudentPaymentAction(...) || hasDeferredFee` had a
dead second operand. It is removed. `hasDeferredFee` stays, because it still earns
its keep on the *copy* — the sentence that names the student's own choice
("You chose to pay this fee later") rather than warning them about something they
forgot. The behaviour 10.6 established is unchanged and is still asserted by its
own three cases.

### 4.2 10.6's pinning case reads the opposite claim now, on purpose

The case that pinned the helper as unchanged has not quietly disappeared: it now
asserts the widening, and its docstring records that 10.6 named this task as the
lane that would change it. That is the whole value of pinning a restraint — the
next lane has to *edit* the assertion, so the change is deliberate and visible in
the diff rather than silent.

## 5. `/student/history` survives (10.6 §12's question)

Task 10.6 left it open:

> `/student/history` is untouched. It is the student's own cross-application
> history page, not a second copy of *this* application's status history … Whether
> it survives the dashboard recomposition is task **11.1**'s question.

**It survives**, and the reason is a contract difference rather than a preference:

| Surface | Reads | Scope |
|---|---|---|
| `/student/history` | `GET /applications/history/` | **every** application the student has, paginated, grouped by application number |
| the workspace's `ApplicationHistory` (10.6) | the `statusHistory` include on the detail read it already made | **one** application |

R13.13 gives the workspace *an application's* history. Nothing else owns the
cross-application record, so removing this page would delete a read rather than
de-duplicate one — the same reasoning 10.6 used to keep communications as one inbox
reached by a link instead of building a per-application feed.

What the recomposition **does** change: the dashboard no longer links to it. It is
reached from navigation, so the record stays available without competing with the
next action for the first viewport. A case asserts both halves — the page exists
and reads the cross-application endpoint, and neither the dashboard nor its
applications section links to it.

Not claimed: `/student/history`'s own `PageShell` metrics row is still there. That
is task **11.5**'s bullet ("remove … PageShell implementation metrics") and
touching it here would be this task measuring a surface it is not recomposing.

## 6. Scoped draft cleanup — three surfaces, one command (STU-12, R16.6)

`deleteStudentDraft` deletes **one** application through the canonical scoped
endpoint, clears **only** that `(user, application)` local snapshot through task
6.3's `clearWizardDraftCache`, treats a 404 as already-gone so a double press is
not an error, surfaces `DRAFT_HAS_PAYMENT_ACTIVITY` as a **refusal** rather than a
failure (a draft with money against it is protected, not broken), and dispatches
one `draftCleared` event carrying only the id it addressed.

There were **three** hand-rolled copies of that, not the two the module's own
docstring assumed:

| Surface | Before | Now |
|---|---|---|
| the dashboard | `ContinueApplication`'s "Delete" → `clearAllDrafts(userId)` | `DraftManagementCard`, per draft, product dialog |
| the wizard's draft drawer | its own delete behind `window.confirm` | the same command, the same dialog |
| **the wizard's draft-choice screen** | its own inline `applicationService.delete` + its own payment-refusal branch + `window.confirm('Delete this draft? This cannot be undone.')` | the same command, the same dialog |

The third was found by grepping the student surfaces after the first two were
converted — no test was looking for it, and its own lane's guard was asserting a
symbol rather than a behaviour (§6.1). It is the worst of the three for R16.6's
reason: a native confirm cannot name *which* draft is going, and cannot say the
others survive. The product dialog does both, and journey 4 presses it while a
`page.on('dialog')` listener stands by to catch a native one.

The local-only draft (a device snapshot with no server row behind it) is offered as
resumable and deliberately **not** deletable: there is no application id to
address, so the only honest scoped command is to open it.

### 6.1 One guard moved with the behaviour

`applicationWizardUxGuard.test.ts` asserted `isProtectedDraftPaymentError` appeared
in the wizard's source — which pinned *where* the payment refusal was handled, not
*that* it was handled. Now that the wizard issues the command instead of
re-implementing it, the symbol is in `studentDraftCleanup.ts`. The claim is
asserted where the behaviour lives, plus the wizard reaching it; and
`studentDashboardTaskFirst.test.tsx` §5 makes the converse claim — no surface
re-implements the command.

## 7. Verification (verbatim)

### 7.1 Frontend suites, against a measured baseline

```
cd apps/admissions && bun run test -- --run
```

| Run | Result |
|---|---|
| **11.1 (candidate)** | **1 failed, 4352 passed, 1 skipped** (485 files) — [`frontend-test.txt`](raw/frontend-test.txt) |
| **baseline** — the same run with only this task's three new suites excluded | **1 failed, 4294 passed, 1 skipped** (482 files) — [`frontend-test-baseline.txt`](raw/frontend-test-baseline.txt) |

- **New failures: 0.** The failing set is one test both ways, and it is the same
  one: `authPageFormMarkup.test.tsx > uses honest helper copy instead of fake email
  availability states` — the **sign-up page's** helper copy, a surface this task
  does not touch, and the same single pre-existing failure task 10.6 recorded.
- **Nothing was fixed either**, which is the honest reading: this task claims no
  repair of another lane's failure.
- **+58 passing, exactly**: 4352 − 4294 = 58 = 31 + 19 + 8, this task's three
  suites and nothing else. +3 files.

**How the baseline was produced, stated rather than glossed.** The worktree carries
the whole admissions-v2 spec, so `git stash` cannot separate this task's edits from
other lanes' uncommitted work on the same shared files. The baseline therefore
drops this task's three new *test* files and leaves its code edits in place: it is a
**reconstruction, not a checkout**. Its value is the attribution it supports — the
one failure is present with and without this task's suites — and the stronger claim
is next to it: this task's code edits are also exercised by four *pre-existing*
suites (`studentNextActionRoutes`, `studentWorkspaceConsolidation`,
`page-verification/student-dashboard`, `applicationWizardUxGuard`), and all four
pass in the candidate.

### 7.2 Lint

```
cd apps/admissions && bun run lint    # 17 errors, 14 files
```

The total is unchanged at **17** and the file set is **byte-identical** to 10.6's
(`diff` of the two `frontend-lint-files.txt` is empty) —
[`frontend-lint.txt`](raw/frontend-lint.txt),
[`frontend-lint-files.txt`](raw/frontend-lint-files.txt). None of the 14 is a file
this task created.

### 7.3 Build

```
cd apps/admissions && bun run build   # exit 0
```

Including `tsc` and the CSP gate ([`frontend-build.txt`](raw/frontend-build.txt)).
`tsc --noEmit` reports **zero** errors under `src/`.

### 7.4 Django check

```
cd backend && .venv/bin/python3 manage.py check   # no issues (1 silenced)
```

No `TESTING=1`, no substitute `REDIS_URL` — [`django-check.txt`](raw/django-check.txt).
Run because this task consumes four backend contracts and changes none of them; a
clean check on the real settings is the cheapest proof that the backend is
untouched rather than merely claimed to be. The OpenAPI contract is unchanged and
was **not** regenerated, because nothing about the published API moved.

### 7.5 The browser gate

Run against the isolated local harness (task 0.4) with the strict gates active,
`HARNESS_PW_CHANNEL=chrome`, after `harness/bin/harness up` (which builds the SPA
and wipes volumes) and a `harness/bin/harness build` after the last code change,
and **torn down afterwards**.

| Run | Result |
|---|---|
| this task's journey alone, on the final build | **12 passed** — 6 journeys × desktop + mobile, zero skips ([`harness-dashboard-task-first.txt`](raw/harness-dashboard-task-first.txt)) |
| the whole required profile | **146 passed**, 4 failed, 10 did not run ([`harness-required-suite.txt`](raw/harness-required-suite.txt)) — and this task's 12 are among the 146 |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | broker 0, unsettled payment collections 0 ([`harness-drain.txt`](raw/harness-drain.txt)) |

### 7.6 The four required-profile failures, attributed

None is in a surface this task touches, and the failing set is **not stable across
runs** — which is itself the attribution.

| Failure | Reading |
|---|---|
| `tenant-launch.spec.ts:139` × **both** projects | **stable pre-existing.** Byte-identical to the two failures tasks 10.5 and 10.6 each recorded on this same tree at this same base commit |
| `admin-user-directory.spec.ts:227` (mobile) | **flake.** Passes in isolation ([`harness-preexisting-isolated.txt`](raw/harness-preexisting-isolated.txt)) and passed in the profile's earlier run. Same admin-lane family 10.5 recorded (`raw/harness-admin-lane-isolated.txt`) and 10.6 observed again |
| `admin-applications-roster.spec.ts:325` (mobile) | **flake, reproduced.** Passed in the profile's earlier run on the previous build, fails in this one and in isolation. Same lane, same family; an ADM-lane count/pagination assertion, and not a surface this task renders |
| `official-document-durability.spec.ts:536` (mobile) | **pre-existing test-side race in 10.4's spec**, diagnosed below. Failed in the profile's earlier run; passed in this one |

Two earlier readings of the same profile, kept because the *variation* is the
evidence: an earlier run on the pre-wizard-change build read **155 passed / 3
failed** (`tenant-launch` × 2, `official-document:536`), and this one reads **146 /
4**. This task's 12 passed in both.

**The `official-document:536` diagnosis, and the controlled experiment that
exonerates this task.** The test asks the workspace for the slip control on a
`withdrawn` application. For a terminal application `isOfficialDocumentOffered`
says no, so `DocumentButtons` renders `null` until the *stored-row* read
(`useIssuedOfficialDocuments`) resolves — and on mobile the control lives inside a
`<details>` that starts **closed**. The spec's own `documentAction` helper calls
`isVisible()` on that disclosure **without waiting for it**; when it runs before the
read resolves, the disclosure is not there, the helper skips the click, and the
`:visible` locator then waits out its 30 s on a disclosure nobody opened. It is
deterministic given that journey 1 of the same file ran first, and it passes in
**3 s** when the test is run alone.

The experiment ([`harness-officialdoc-isolated-with-11-1-edit.txt`](raw/harness-officialdoc-isolated-with-11-1-edit.txt),
[`harness-officialdoc-isolated-without-11-1-edit.txt`](raw/harness-officialdoc-isolated-without-11-1-edit.txt)):
the only edit this task makes to that page is §4.1's `needsPaymentAttention` line.
The test was run alone **with** the edit (3.4 s, passed) and with the edit
**reverted and the SPA rebuilt** (3.1 s, passed); and the whole file was run twice
with the edit (failed both times,
[`run1`](raw/harness-officialdoc-file-run1.txt) / [`run2`](raw/harness-officialdoc-file-run2.txt)).
The variable is test ordering, not this task's code. It is also identical *by
construction*: that fixture's application is never paid, so
`requiresStudentPaymentAction('not_paid')` is `true` before and after the widening.

**Not fixed**, deliberately: it is 10.4's spec, the defect is in its helper, and
this task claims no repair of another lane's failure.

## 8. The suites

### 8.1 `studentDashboardTaskFirst.test.tsx` — 31 cases

Organised the way the finding is. §1 the action is the platform's and not the
browser's (9) — including a case asserting the *panel* reads no
`payment_status` and no `requiresStudentPaymentAction`, because a panel that
branches on a lifecycle status has started deriving again. §2 it comes first (3),
including "no `metrics={`", which is the header-above-the-action defect. §3 the
draft and the applications section are concise (6), including the two questions
10.6 deferred (§5's `/student/history`, and the builder guard). §4 the decorative
metrics and duplicate quick actions are gone (5), including the five deleted files
asserted **absent from disk** and the payment link counted at zero. §5 destructive
cleanup is scoped (8), including all three surfaces and the `window.confirm` that
is gone from the draft-delete path but deliberately still present on the wizard's
unsaved-changes guard, which is another lane's.

Source-scanning cases strip comments first: the code that removed a surface is also
the code documenting why, so a naive substring scan is tripped by the explanation
of the very thing it checks for.

### 8.2 `studentNextActionServerVocabulary.test.ts` — 19 cases

The drift guard (§2.2). It parses `readiness_service.py` and
`enrollment_service.py`, and its **first** case asserts the parse found a
non-trivial vocabulary (≥ 10 and ≥ 4 verbs, including `submit-application` and
`confirm-enrollment`) — because a parse that silently found nothing would make
every case after it vacuously true.

### 8.3 `studentNextAction.property.test.ts` — 8 invariants

Task invariants over the resolver's whole input space, not numbered spec
properties: never invents a label; never invents a blocker sentence (it is a
payload message, the state definition, or `null`); pure and non-mutating; answers a
same-origin path or an honest `null`, never a foreign or malformed URL; encodes the
application id into every path it builds (**this one found a real defect** — §10.1);
never routes a non-draft application into the wizard (**this one found a gap**);
always resumes a draft by its own id, never a bare wizard visit; and never asks a
student to pay twice for one application.

## 9. Design (PRODUCT.md / DESIGN.md)

Read before writing the surfaces, and asserted where it is assertable.

- **Tokens only.** `border-border`, `bg-card`, `text-foreground`,
  `text-muted-foreground`, `bg-muted`, `text-primary`, `text-destructive`,
  `bg-success/5`. No hex, no arbitrary colour.
- **No purple gradient, no gradient text, no glassmorphism, no nested card, no
  emoji, no `dark:` utility** — scanned across every file this task added, zero
  matches. The profile block was *flattened* precisely because four bordered tinted
  boxes inside a card is the nested-card shape DESIGN.md bans.
- **44 px targets**, measured in the browser from layout boxes rather than inferred
  from class names, at all three widths and on both projects. The 0.5 px tolerance
  is Chromium's fractional box reporting, and a violation prints its measured size
  to three decimals so a real regression reads as one.
- **Status is never colour alone.** The panel's application badge carries the status
  word *and* a Lucide icon; a case asserts both.
- **Icons are Lucide.** `AlertCircle`, `ArrowRight`, `CheckCircle2`, `Clock`,
  `RefreshCw`, `FileText`, `FilePlus2`, `Trash2`, `Calendar`, `User`.
- **Reflow, not clipping**, at 200% text — and the `flex-wrap` / `break-words` that
  make it true were added *because* the browser run found the eyebrow row being
  clipped by the shell's `overflow-x-hidden` at 320 px with a 32 px root font.
  Clipped text is the failure R16.8 names; wrapped text is not.
- **The first-viewport marketing block is not this task's.** R16.5's promotional
  copy and the `PageShell` metrics on *other* pages are task **11.5**'s bullet.

## 10. What the interrupted dispatch left, and the four defects the gates found

The first dispatch landed the code, the three suites and the browser spec, ran the
browser spec once (the screenshots), and stopped. Inherited:

| Inherited | State on arrival |
|---|---|
| `studentNextAction.ts`, `studentReadiness.ts`, `useStudentNextAction.ts`, `NextActionPanel`, `DraftManagementCard`, `studentDraftCleanup.ts` | correct in shape; **one real defect** (§10.1) |
| `Dashboard.tsx` recomposed, five components deleted, `dashboardReducer` cleaned | correct; re-verified by the 31-case suite and journey 3 |
| the widened `requiresStudentPaymentAction` + the edited 10.6 pinning case | the widening was right; the pinning case **contradicted the code** (§10.2) |
| `studentDashboardTaskFirst.test.tsx` (31), `studentNextActionServerVocabulary.test.ts` (19) | passed on first run |
| `studentNextAction.property.test.ts` | **had never been run**: 1 of 8 invariants failed, with a counterexample (§10.1) |
| `screenshots/` | captured, but on a build three defects old; re-captured |
| `raw/`, this README, both of 10.6's deferred questions | **empty / unanswered** |

### 10.1 A path-traversal counterexample, in a guard that looked complete

```
Property failed after 260 tests
Counterexample: ["..", "complete-profile", false]
AssertionError: expected [ '', 'student', 'application', …(2) ] to not include '..'
```

`studentApplicationWorkspacePath` guarded its id with `encodeURIComponent`, and
10.6 recorded that guard as the reason a hostile id "becomes
`a%2F..%2F..%2Fadmin` rather than a path segment" — which is true, because the
slashes become `%2F`. What it cannot do is escape a **bare** `.` or `..`: `.` is an
unreserved character, so `encodeURIComponent('..')` is `'..'`, and the builder
emitted `/student/application/../status`.

Percent-encoding the dots is not a fix either: the URL standard defines a
double-dot segment ASCII-case-insensitively as `..`, `.%2e`, `%2e.` **or**
`%2e%2e`, so `%2E%2E` is normalised away exactly like `..`. The honest answer is
that such an id is not an application id, so the builder answers the dashboard —
the same fallback `DuplicateRouteRedirect` already uses for a missing param.

Reachability today is nil: the id always comes from the platform's own application
list. The property is a hardening claim, and the fix belongs in the builder rather
than in the caller that found it, because two other surfaces (10.6's workspace and
the application row) call the same builder — a guard in one caller of a shared
builder is the shape of defect this spec keeps closing.

**Triage, stated:** the test was correct, the counterexample was a real defect, and
the specification needed no change. There is no numbered PBT sub-task for 11.1, so
nothing was recorded through `update_pbt_status`.

### 10.2 A pinning test that contradicted the code it pinned

The inherited edit to 10.6's pinning case rewrote its docstring to say the
workspace's local `|| hasDeferredFee` was "redundant and gone" — while the code
still had it **and** an assertion three lines up still required it. Both readings
were in the same file.

Resolved in the direction the docstring intended, because it is the correct one
once the helper answers for `deferred`: the redundant operand is removed (§4.1),
the assertion now reads the plain call, and `hasDeferredFee` is asserted where it
still does work — selecting the copy that names the student's own choice.

### 10.3 One raw workspace path, and a drift guard that was never written

`routeRegistry`'s docstring said "`studentWorkspaceRouteDrift.test.ts` fails if a
raw string appears instead". That file does not exist, and exactly one raw string
was left — `ApplicationListItem`'s Confirm-Enrollment link, built by hand. It is a
hole in §10.1's fix, because a caller that builds the path itself does not get the
guard. The link is repointed at the builder, the docstring now names the guard that
actually exists, and that guard is a case in this task's own suite covering all
four student surfaces.

### 10.4 The third `window.confirm` on a destructive draft workflow

Found by grepping the student surfaces after the first two draft-delete paths were
converted. `studentDraftCleanup.ts`'s own docstring asserted there were two scoped
surfaces; the wizard's draft-choice screen was a third, with its own inline
`applicationService.delete`, its own payment-refusal branch, and
`window.confirm('Delete this draft? This cannot be undone.')` — which R16.6 forbids
from owning a production workflow. §6 is the fix; §6.1 is the guard that was
asserting the wrong thing and now asserts the behaviour.

## 11. Not claimed here

- **The first-viewport marketing block, the `PageShell` metrics on other pages, the
  AI language and the remaining `window.confirm` on the wizard's unsaved-changes
  guard are not touched.** They are task **11.5**'s bullet, and the wizard's own
  recomposition is **11.2**'s.
- **`/student/history` is kept, not redesigned.** Its metrics row is 11.5's.
- **The application row is not de-densified.** `ApplicationListItem` still carries
  its details grid, its waitlist/conditions/enrollment blocks and its document
  actions; "show application status/next action first, one primary document action"
  is task **11.3**'s bullet (STU-05, STU-18). This task changed two lines in it —
  the builder link and, through the shared helper, that a deferral now shows a fee
  affordance there too.
- **No wizard step is deep-linked.** §2.2 states why; 11.2 owns it.
- **`ApplicationStatus.tsx` is not split.** Task **12.1** owns that, and 10.6
  already added the protection it needs.
- **No new capability, no new route, no new endpoint.** The catalogue stays at 17
  `platform.*` + 17 `tenant.*`. This task consumes four existing contracts.
- **No schema change and no contract change.** Nothing to rehearse on Neon,
  nothing to regenerate.
- **The pre-existing failures are not fixed**: 1 frontend, 17 lint, and 4 harness
  (2 stable, 2 flaky/ordering). Each is shown against a baseline or a controlled
  experiment and attributed elsewhere (§7.1, §7.2, §7.6).
