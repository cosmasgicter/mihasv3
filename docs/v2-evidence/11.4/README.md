# Task 11.4 — Make admin surfaces complete on mobile

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Evidence index for task **11.4** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [x] 11.4 Make admin surfaces complete on mobile
  - Preserve server filters/pagination and every authorized command in compact
    records/detail sheets for applications, users, tenants, catalog, audit, and
    settlement.
  - Replace raw UUID controls with search selectors.
  - _Requirements: R6, R8, R16_
  - _Findings: ADM-01, ADM-03, ADM-05, ADM-06, TEN-05_
  - _Evidence: 390-width admin journey matrix with no hidden action or overflow_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-10 (UTC).
- **Schema: no.** No SQL script, no migration, no model change, **no backend
  change at all** — tasks 8.4, 9.1, 9.3 and 9.5 already publish every filter,
  page, aggregate, command and export these surfaces render, and this task
  consumes them. The OpenAPI contract is unchanged and was not regenerated; §4.4
  records the `manage.py check` that proves the backend is untouched rather than
  merely claiming it. (`git status backend/` shows other in-flight lanes' edits;
  none of them are this task's.)
- PBT: task 11.4 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`, and `update_pbt_status` refuses the
  task as "not a PBT task"), so nothing is recorded through `update_pbt_status`
  and no numbered spec property is claimed. The ten fast-check invariants in
  `adminRecordCommands.property.test.ts` are **task invariants**, and the file
  says so at the top. Stated rather than silently skipped.
- **Three earlier tasks pointed work here, and all three are answered.** 11.3
  §4.6 attributed the admin-lane flakes and found that
  `admin-applications-roster.spec.ts:325` *"passes or fails according to how many
  applications the harness database happens to hold"* — §7 fixes that assertion
  properly and says exactly what changed. 9.1 / 9.3 / 8.4 / 9.5 built the
  server-owned filters, pagination, aggregates and exports — §3 is the record that
  none of it is lost on a phone, and this task rebuilt none of it. 4.3 replaced
  the onboarding and access-grant UUID fields with scoped selectors and named the
  application selector as Phase 9's — §6 closes the remaining five fields with
  **that** selector rather than a second one.

## The Required_Evidence claim

The `_Evidence:` line is one claim with three parts: a **390-width matrix**, **no
hidden action**, **no overflow**. All three are produced by assertions, not taken
by hand.

| Claim | Where it is settled |
|---|---|
| **390-width matrix** | `admin-mobile-journeys.spec.ts` — 6 journeys × desktop + mobile = **12 passing**, each one setting the viewport to 390 × 844 explicitly so the claim is about the *width* and not about the project. Applications, users, audit, catalog + fees, keyboard, and the tenant console (which carries settlement). Sixteen screenshots in [`screenshots/`](screenshots/) |
| **no hidden action** | every record's disclosure is opened and the commands it revealed are **counted against the number on its trigger** (`expectHonestDisclosure`), then each one is asserted **enabled**; journey 5 reaches every one of them by `Tab` and operates the trigger with `Enter`; and the catalog journey asserts the three fields the record list used to drop are present *with values* |
| **no overflow** | `expectNoOverflow` measures `scrollWidth - clientWidth <= 1` on **every** surface before each journey finishes, and names the widest offending element when it fails. A long institution and a long intake name are planted in the seeded data so the measurement is made against a record that stresses the layout. Plus `expectNotClipped`, which caught the sort control rendering `Cont` for `Contact` |

### The browser journeys

| Journey | The claim it settles |
|---|---|
| **1. the applications roster** | the filter sheet opens at 390 and a filter chosen in it reaches the wire as the **registered** `status=`; the page indicator parses as the server's two numbers and the page controls are either operable or correctly disabled; each row offers exactly **two** controls at rest — one primary and one counted trigger; the sheet holds the decision block's own `submitted → under_review` command; every target ≥ 44 px measured |
| **2. the user directory** | sort is reachable **off** the desktop table, leaves the browser as `sort=email` / `order=asc|desc`, and renders its own key without clipping; each row keeps all four commands behind one counted sheet; the page controls are 44 px |
| **3. the audit trail** | the filter form is reachable and an applied filter reaches the wire; the page indicator and the page controls are present; an entry's disclosure carries `aria-expanded`, its `aria-controls` resolves, and the machine-authored change payload wraps instead of pushing the page sideways |
| **4. the catalog record lists** | the intake record carries `start_date`, `end_date` and `max_capacity` — the three `desktop`-priority columns the card view **dropped entirely** — plus its Edit and Delete commands with visible labels; the fee report does not overflow |
| **5. a keyboard** | the trigger is focusable with a painted focus ring, `Enter` opens it, every command it hid takes focus in order and is enabled, and `Enter` closes it |
| **6. the tenant console** | **no** control anywhere on the console asks an operator to paste an identifier; the replaced fields are populated `<select>`s; the settlement filter is a 44 px target |

## What this task establishes

1. **A compact admin record is not a shorter record** (§2.1). `ResponsiveTable`
   handed its card view only the `always` columns and **dropped every `desktop`
   one**, so an operator on a phone could not see an intake's start date, end
   date or seat capacity, an institution's code or active-programme count, or a
   programme's duration *at all*. R16.1 permits a compact record list; it does not
   permit withholding a field the server sent.
2. **Sort was reachable only from a layout** (§2.2). The user directory's sort
   keys lived in the desktop table's column headers, so below `lg` an operator
   could read the directory and not order it — server state that a phone could not
   set, which is precisely what R16.1's "without losing … state" forbids.
3. **One primary command where a roster row had up to ten** (§2.3, §3.1). A
   submitted application's row carried four status buttons, up to three payment
   buttons, a full-width "View Details", a "Contact", and a third control whose
   only behaviour was `onViewDetails` again under a document icon. It is one
   prominent control and one counted sheet now, and the count is **drift-guarded**
   against what the decision block really renders.
4. **The count on a disclosure is provably honest** (§3.2). `adminApplicationCommands`
   enumerates the decision block's commands, and `adminMobileCompleteness` renders
   the real component across the whole `(11 statuses × 5 payment states × 2
   authority values)` cross-product and asserts the two agree. A trigger that says
   "2 more actions" and reveals one is 11.3's defect with a number bolted on.
5. **No admin write form asks an operator to paste an identifier** (§6). Five raw
   UUID fields are gone — two on required documents, two on document-profile
   scope, one on an application-scoped grant — replaced with task 4.3's selector
   over scoped lists, including the tenant-scoped **application** selector 4.3
   deferred to Phase 9 and 9.1 built.
6. **Four defects only a laid-out page could show** (§5). A `null` fee printed as
   the string `Knull` on every roster row; two audit filter `<label>`s were not
   associated with their `<select>`s, so both filters were **unnamed** controls; the
   sort control clipped `Contact` to `Cont`; and the row's primary and the decision
   block's transition were both accessibly named "Review". None of them is visible
   to jsdom, and one of them was found by *reading the journey's own screenshot*.
7. **The roster's volume-dependent assertion is fixed properly** (§7). Not
   reseeded around: the assertion now reads the server's two numbers and states the
   claim it always meant.

## Files

```
docs/v2-evidence/11.4/
├── README.md                                   ← this index
├── screenshots/
│   ├── admin-applications-390-{chromium,mobile}-required.png       (journey 1, a roster row at rest)
│   ├── admin-applications-390-open-{chromium,mobile}-required.png  (journey 1, the sheet holding every decision)
│   ├── admin-users-390-{chromium,mobile}-required.png              (journey 2, the directory record list + the sort control)
│   ├── admin-audit-390-{chromium,mobile}-required.png              (journey 3, an audit entry at rest)
│   ├── admin-audit-390-open-{chromium,mobile}-required.png         (journey 3, the change payload wrapped)
│   ├── admin-intakes-390-{chromium,mobile}-required.png            (journey 4, the intake record with its dates + capacity)
│   ├── admin-fees-390-{chromium,mobile}-required.png               (journey 4, the scoped fee report)
│   └── admin-tenants-390-{chromium,mobile}-required.png            (journey 6, the console with no UUID field)
└── raw/
    ├── frontend-test-baseline.txt   (BEFORE any 11.4 source change: 1 failed / 4442 passed / 1 skipped, 489 files)
    ├── frontend-test.txt            (candidate: 1 failed / 4478 passed / 1 skipped, 491 files)
    ├── frontend-lint.txt            (17 errors — unchanged)
    ├── frontend-lint-files.txt      (14 files — identical set to 11.3's)
    ├── frontend-build.txt           (exit 0, incl. tsc and the CSP gate)
    ├── django-check.txt             (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── harness-required-suite.txt   (FRESH stack: 204 passed / 2 failed / 0 did not run — §4.5)
    ├── harness-gatecheck.txt        (4 failed, as required — the gates fire)
    └── harness-drain.txt            (broker 0, unsettled payment collections 0)
```

Source of the change:

| Path | What it is |
|---|---|
| `apps/admissions/src/lib/adminRecordCommands.ts` | **new**, 119 lines — the pure presenter. `presentAdminRecordCommands` (the primary/overflow split), `adminRecordOverflowLabel` (the count, in words), `announceAdminRecordState` (the one live sentence). No hook, no request, no authority rule |
| `apps/admissions/src/lib/adminApplicationCommands.ts` | **new**, 147 lines — the applications enumeration: `applicationStatusCommands`, `applicationPaymentCommands`, `applicationDecisionCommands(Count)`. A **mirror** of `ApplicationApprovalActions`, drift-guarded against it, existing so the roster row's disclosure can count honestly |
| `apps/admissions/src/components/admin/AdminRecordActions.tsx` | **new**, 194 lines — the disclosure: one primary, a counted `aria-expanded`/`aria-controls` trigger, a panel that keeps `hidden` and its display utility **in agreement**, no card treatment of its own, and one polite region outside the cluster |
| `apps/admissions/src/components/ui/ResponsiveTable.tsx` | now 280 lines. `CardView` receives **every** column and renders both priorities (`always` first, `desktop` after); `priority` now decides only which column earns the headline. Rows wrap (`flex-wrap`, `min-w-0`, `break-words`) so a long value cannot widen the card |
| `apps/admissions/src/components/admin/users/UsersTableSection.tsx` | now 271 lines. A phone-width sort control driving the same `TOGGLE_SORT` and the same registered `SORTABLE_COLUMNS`; stacked below `sm` so its own key is not clipped; every pagination target `min-h-touch`/`min-w-touch` (they were `min-h-[36px]`) and the strip wraps |
| `apps/admissions/src/components/admin/UserRowCard.tsx` | now 252 lines. `UserMobileCard`'s four flat buttons became one primary (`Edit`) plus a counted sheet naming the account it belongs to. The desktop row is untouched |
| `apps/admissions/src/components/admin/applications/ApplicationCard.tsx` | now 442 lines. One primary (`Open review`) + a counted sheet holding the decision block and `Contact applicant`; the duplicate result-slip control deleted; the `Knull` fee line rendered only when the server sent amounts |
| `apps/admissions/src/components/admin/applications/ApplicationApprovalActions.tsx` | now 707 lines. One new prop, `showStatusSummary` (default `true`): when the block is *listed* inside a record's disclosure it drops the status pair and the four status-only badges the card already publishes, and its two `default`-variant commands step down to `outline` so the row has one primary. **Every status branch, label and handler is unchanged** — other lanes' preservation tests read this file's source |
| `apps/admissions/src/pages/admin/AuditTrail.tsx` | now 884 lines. The entry's "View details" is a real disclosure (`aria-expanded`, `aria-controls`, `hidden` in agreement with its display class); the change payload wraps; and the three unnamed filter controls (`Entity`, `Category`, `Page size`) are associated with their labels |
| `apps/admissions/src/pages/admin/tenants/TenantDocumentsPanel.tsx` | now 273 lines. Offering and canonical-programme UUID inputs → scoped `<select>`s over `listOfferings` and the platform canonical catalogue |
| `apps/admissions/src/pages/admin/tenants/ProfilesPanel.tsx` | now 728 lines. Canonical-programme and intake UUID inputs → scoped `<select>`s |
| `apps/admissions/src/pages/admin/tenants/TenantAccessGrantsPanel.tsx` | now 334 lines. The application-scoped grant's raw id → a tenant-scoped selector over task 9.1's roster query (`institution_id` resolved server-side before any lookup) |
| `apps/admissions/tests/unit/adminMobileCompleteness.test.tsx` | **new**, 446 lines / 26 cases — the DOM-answerable half, including the cross-product drift guard and the `hidden`/display agreement guard |
| `apps/admissions/tests/property/adminRecordCommands.property.test.ts` | **new**, 213 lines / 10 fast-check invariants over the presenters' whole input space — four of them are the statement *"no command is lost"* |
| `apps/admissions/tests/harness-e2e/required/admin-mobile-journeys.spec.ts` | **new**, 846 lines — the 6 required journeys, desktop and mobile |
| `apps/admissions/tests/harness-e2e/required/admin-applications-roster.spec.ts` | **one assertion replaced** (§7). Every behavioural claim unchanged |
| `apps/admissions/tests/harness-e2e/required/admin-review-workspace.spec.ts` | **one pin repointed** (§8): `/view details/i` → `/open review/i`. Every behavioural claim unchanged |

---

## 1. What was wrong

R16.1, verbatim: *"THE student experience SHALL be designed at 320 CSS pixels
first; admin tables MAY become compact record lists or detail sheets **without
losing commands, filters, state, or pagination**."*

The permission was taken and the condition was not met. Four different surfaces
read that clause as licence to render *less*:

| Surface | What a 390 px operator could not do |
|---|---|
| catalog (intakes, programmes, institutions, fees) | see an intake's start date, end date or seat capacity; an institution's code or active-programme count; a programme's duration. The card view was handed only the `always` columns |
| user directory | order the directory. Sort lived in the desktop table's `<th>` buttons only |
| applications roster | find anything under the row's own controls. Up to ten equally prominent targets per row, repeated per application |
| audit trail | know that a disclosure had opened, or which filter a `<select>` filtered |

And TEN-05's remedy — *"tenant-scoped, server-backed searchable selectors with
accessible labels and no cross-tenant result leakage"* — was five fields short.

## 2. Where the completeness was lost, precisely

### 2.1 A `filter` in the wrong layer (catalog)

`ResponsiveTable` ended in this, verbatim from the base commit:

```tsx
{/* Mobile: stacked card layout */}
<div className="md:hidden">
  <CardView
    columns={columns.filter((col) => col.priority === 'always')}
    …
```

`CardView` could not render a `desktop` field because it was **never given one**.
Both priorities render now, in the table's own declaration order — so a column
carrying the row's commands stays where the table put it (last) instead of being
reshuffled into the middle of the card by a priority-first sort, and `priority`
means "which field earns the headline" rather than "which fields exist".

This one is worth a paragraph because the first fix was **inert**: it changed
`CardView`'s internals while the parent kept filtering, so nothing changed on
screen. The new jsdom case (`renders desktop-priority fields instead of dropping
them`) failed on that version and named it. Same species as 11.3 §3 — a fix in
the wrong layer that looked right in the diff — caught one step earlier.

### 2.2 Sort as a property of a breakpoint (users)

`UsersTableSection` renders a card list below `lg` and a table from `lg`. Every
sort control was a `<button>` inside a `<th>` in the table branch. The reducer's
`TOGGLE_SORT`, the registered `SORT_FIELDS`, the `sort=`/`order=` on the wire —
all of task 9.3's server-side sort — were reachable only from a layout.

The control added below `lg` dispatches the **same** action over the **same**
`SORTABLE_COLUMNS`, so the two surfaces cannot drift into two vocabularies, and a
sorted view stays reproducible from a URL. Direction is a word (`Ascending` /
`Descending`), never an arrow alone.

### 2.3 Ten controls per row (applications)

The roster row's cluster, at the base commit: the decision block's up-to-four
status buttons and up-to-three payment buttons, then a full-width primary "View
Details", then "Contact" for a draft, then — inside `documentsCount > 0` — a third
control whose entire behaviour was `onViewDetails(app.id)` again, under a
`FileText` icon and a `title="Result Slip"`. That last one is R16.5's duplicate
affordance in its purest form: two controls, one action, one of them unlabelled.

## 3. What was preserved, and how that is shown

### 3.1 Every authorized command

`AdminRecordActions` does not filter commands; it **orders** them. The panel is
`hidden` rather than unmounted, so a command in flight is not torn down by
collapsing the sheet, and the four "nothing is lost" invariants in
`adminRecordCommands.property.test.ts` say it over the presenter's whole input
space: the two halves partition the input, no command appears in both, the count
equals what the panel holds, and nothing is prominent only when there is nothing
to do.

### 3.2 …and the count that hides them is true

The roster row is the hard case, because its commands live inside
`ApplicationApprovalActions` and that component's per-status branches are read by
two other lanes' preservation tests
(`approvalFlowPreservation.property.test.ts` reads its **source text**;
`admissionsFlowPreservation.property.test.ts` renders it and compares button
labels). Rewriting it into data was not available.

So the enumeration is a **declared mirror**, and the guard is the cross-product:

```
for status in APPLICATION_STATUSES (11)
  for paymentStatus in CanonicalPaymentStatus (5)
    for canVerifyPayment in {true, false}
      render the real component; compare its buttons to the enumeration
```

110 comparisons. If either side gains or loses a command the guard fails, rather
than the trigger quietly lying. That is the strongest form of "the count is
honest" available without deleting another lane's tests.

### 3.3 Server filters, pages and aggregates — consumed, not rebuilt

Nothing in this task computes a filter, a page, a total or an aggregate.

| Surface | Whose answer | How the journey proves the browser did not invent it |
|---|---|---|
| roster filters / page / totals | task 9.1's `ApplicationQueryService` | the mobile sheet's `status` filter is asserted **on the wire** as the registered `status=submitted`; the page indicator is parsed as the server's `Page N of M` |
| directory sort / page | task 9.3's `user_directory_service` | `sort=email` and both `order=` values are asserted on the wire |
| audit list / page | task 9.5's institution-scoped audit endpoint | an applied category filter is asserted on the wire |
| settlement filter / totals / export | task 8.4's `SettlementQueryService` | the reconciliation filter is present and a 44 px target at 390; the panel already renders the server's aggregates and its `can_export` |
| fee report | task 8.4's `AdminFeeListView` | the report renders at 390 without overflow |

The one place this task touches money is a **deletion**: the roster card printed
`K${paid_amount || 0} / K${application_fee}` with both fields `null` on a roster
row, which rendered the literal string `K0 / Knull`. Task 9.1's own rule for that
contract is that unknown means "not on this surface" and renders nothing; the line
is now conditional on the server having sent an amount.

## 4. Verification (verbatim)

### 4.1 Frontend suites, against a measured baseline

```
cd apps/admissions && bun run test -- --run
```

| Run | Result |
|---|---|
| baseline (before any 11.4 source change) | 1 failed, 4442 passed, 1 skipped (489 files) — [`frontend-test-baseline.txt`](raw/frontend-test-baseline.txt) |
| **candidate** | **1 failed, 4478 passed, 1 skipped (491 files)** — [`frontend-test.txt`](raw/frontend-test.txt) |

- The baseline is byte-for-byte the numbers task 11.3 recorded for its candidate
  (1 / 4442 / 1 over 489), which is the check that it is a real "before" and not a
  re-measurement of this candidate.
- **New failures: 0.** The one failure is the same one 11.1, 11.2 and 11.3 each
  recorded: `authPageFormMarkup.test.tsx > uses honest helper copy instead of fake
  email availability states` — the **sign-up page's** helper copy, which this task
  does not touch. Not fixed here; this task claims no repair of another lane's
  failure.
- **+36 passing, and the arithmetic closes exactly**: 4478 − 4442 = 36 = 26
  (`adminMobileCompleteness`) + 10 (`adminRecordCommands` invariants). +2 files for
  the same two.
- The four suites that pin `ApplicationApprovalActions`
  (`approvalFlowPreservation`, `approvalFlowBugCondition`,
  `admissionsFlowPreservation`, `admissionsFlowBugCondition`) and
  `adminRouteActionParity` all pass unchanged — checked explicitly, because the
  one prop added to that component could have broken any of them.

### 4.2 Lint

```
cd apps/admissions && bun run lint    # 17 errors, 14 files
```

**Unchanged at 17**, and the file set is **identical** to 11.3's baseline set
(`diff` of the two sorted, path-normalised lists is empty) —
[`frontend-lint.txt`](raw/frontend-lint.txt),
[`frontend-lint-files.txt`](raw/frontend-lint-files.txt). None of the 14 is a file
this task created. The three new modules, the two new test files and the browser
spec contribute **zero** findings.

One honest note: an intermediate run of the roster spec was 18/15, because a
docstring quoting the old page-count regex contained `*/` and terminated its own
block comment. The docstring was reworded rather than the count explained away.

### 4.3 Build and type-check

```
cd apps/admissions && bun run build             # exit 0
cd apps/admissions && npx tsc -p tsconfig.json --noEmit   # 0 errors
```

Including `tsc -p tsconfig.build.json --noEmit` and the CSP gate —
[`frontend-build.txt`](raw/frontend-build.txt). The **full** `tsconfig.json`
(which includes `tests/`) reports **zero** errors, so the new browser spec and the
two new test files add none.

### 4.4 Django check

```
cd backend && env -u TESTING -u REDIS_URL .venv/bin/python3 manage.py check
# System check identified no issues (1 silenced).
```

No `TESTING=1`, no substitute `REDIS_URL` —
[`django-check.txt`](raw/django-check.txt). Run for the same reason 11.2 and 11.3
ran it: this task consumes five backend contracts (9.1's roster query, 9.3's
directory, 9.5's tenant audit, 8.4's settlement and fee reports, and the review
workspace's command matrix) and changes none of them.

### 4.5 The browser gate

Isolated local harness (task 0.4), strict gates active, `HARNESS_PW_CHANNEL=chrome`,
`harness/bin/harness build` after **every** source change, measured on a **freshly
seeded** stack (torn down, volumes wiped, brought up again — as 11.3 did rather
than on an accumulated one), and **torn down afterwards** (verified: 0 harness
containers, 0 harness volumes).

| Run | Result |
|---|---|
| this task's journeys | **12 passed** — 6 journeys × desktop + mobile, zero skips (tests **12-17** and **115-120** inside the profile run) |
| the whole required profile, **fresh stack** | **204 passed**, 2 failed, **0 did not run** ([`harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | broker 0, unsettled payment collections 0 ([`harness-drain.txt`](raw/harness-drain.txt)) |

Against 11.3's 192 passed / 2 failed / 0 did not run: **+12 passing**, and it
closes exactly — 12 = this task's 6 journeys × two projects. Nothing else moved.

### 4.6 The two remaining failures, attributed

| Failure | Reading |
|---|---|
| `tenant-launch.spec.ts:139` × **both** projects | **stable pre-existing.** The same pair tasks 10.5, 10.6, 11.1, 11.2 (both passes) and 11.3 each recorded at this base commit. Its assertion is `getByText('Fees')` against a `Program Fees` step label the onboarding wizard renders `hidden` on mobile — the tenant lane's, not this one's |

Nothing else failed. None of the flakes 11.3 catalogued
(`ocr-manual-fallback:146`, `student-wizard-mobile:279`,
`admin-dashboard-metrics:356`, `admin-applications-roster:325`) appeared on the
fresh stack, which is the condition 11.3 recorded them as being conditional on.

**And two of this task's own failures are worth recording rather than hiding**,
because both were found by the *full profile* after passing in isolation:

- `admin-review-workspace.spec.ts:375` failed on both projects because it clicks
  `/view details/i` on the roster and this task renamed that control. That is
  **this task's** breakage of another lane's spec, and §8 repoints it.
- this task's own journey 2 failed on both projects with `Element is not attached
  to the DOM`. Sorting refetches the directory and React replaces every row, so a
  node resolved before the refetch is detached while it is in flight — invisible on
  a short list, reproducible on the longer one the full profile seeds. The journey
  now makes the layout claim against a settled list and the wire claim after it,
  which removes the race rather than waiting it out.

## 5. Four defects only a laid-out page could show

Every one of these was invisible to the 26 jsdom cases, and each is now either
fixed with an assertion behind it or fixed and named.

### 5.1 `K0 / Knull`

The roster card printed the fee line unconditionally. The scoped roster contract
carries no money (`application_fee: null`, `paid_amount: null` — task 9.1 states
this in the type's own comments), so **every row at every width** rendered the
string `Knull`. Found by reading journey 1's own 390 px screenshot; fixed by
rendering the line only when the server sent an amount.

### 5.2 Two unnamed filter controls, and a third

`getByLabel('Category')` timed out in journey 3. The audit page's `Entity` and
`Category` `<label>`s were siblings of their `<select>`s with **no** `htmlFor`, and
the page-size control had a `<span>` for a label — so all three were unnamed
controls (WCAG 4.1.2): a screen reader announced "combo box" with no indication of
what it filtered, and tapping the visible word did not move focus into the
control. Associated with `htmlFor`/`id`, which keeps the visible word as the
accessible name so "Label in Name" (2.5.3) holds too.

### 5.3 `Cont`

Journey 2's screenshot showed the sort selector reading **`Cont`** — the registered
key `Contact`, clipped. A single wrapping row could not fit a label, a selector and
a direction control at 390 px. The panel stacks below `sm` now, and
`expectNotClipped` measures `scrollWidth - clientWidth` on the selector itself so
the regression cannot return silently. jsdom has no intrinsic text width; it could
never have said this.

### 5.4 Two controls named "Review"

The row's primary was going to be labelled "Review", and the decision block's
`submitted → under_review` command is *already* labelled "Review". One row, two
differently-behaving controls, one accessible name (R16.2). The primary is
"Open review". This is also why journey 1 asserts the sheet contains `Review`
**and** the visible primary is `Open review`, exactly: the two are now
distinguishable by name, and the journey depends on their being so.

## 6. TEN-05: five fields, and the selector 4.3 already chose

Task 4.3 replaced the onboarding wizard's placeholders and this console's user and
offering UUID fields with scoped selectors, and recorded what it left: *"An
application-scoped grant still takes the application id directly; a tenant-scoped
application search selector is owned by the admin-applications work in Phase 9."*

| Field | Was | Is | Source of the options |
|---|---|---|---|
| required document → offering | `<Input placeholder="Optional UUID">` | scoped `<select>` | `tenantAdminService.listOfferings(institutionId)` — this school's own offerings |
| required document → canonical program | `<Input placeholder="Optional UUID">` | scoped `<select>` | `catalogService.getCanonicalPrograms()` — the platform catalogue |
| document profile → canonical program | `<Input placeholder="Optional UUID">` | scoped `<select>` | the same platform catalogue |
| document profile → intake | `<Input placeholder="Optional UUID">` | scoped `<select>` | `catalogService.getIntakes()` |
| access grant → application | `<Input placeholder="Application ID">` | tenant-scoped `<select>` | task 9.1's `applicationRosterService.getRoster({ institution_id })` |

The application selector is the one that needed Phase 9: `institution_id` is a
**server** filter resolved against the actor's scope *before* any lookup, so the
list cannot contain another school's application and an out-of-scope identifier is
a masked 404 rather than a confirming empty page. It is bounded at 50 recent
applications on purpose — a scoped grant is an exception for a named application,
not a browse surface, and the roster page is where an operator finds one at scale.

Journey 6 scans the **whole rendered console** for
`input[placeholder*="UUID"]` and `input[aria-label$=" ID"]` and asserts zero, so a
panel this task did not edit fails the journey if it grows a raw field. The jsdom
suite makes the same claim over five panels' source with comments stripped —
because two of those files now *document* the field they replaced, quoting its old
`placeholder`, and a scan that matched prose would forbid recording the history.

## 7. The roster's volume-dependent assertion, fixed properly

11.3 §4.6 recorded `admin-applications-roster.spec.ts:325` failing with
`Expected pattern: /Page 1 of [2-9]\d*/ · Received string: "Page 1 of 16"`, and
left it as the admin lane's.

It is this lane's, and it is **not a flake**. The pattern says "a page count whose
first digit is 2-9". The claim is "more than one page". Those coincide at 2-9 and
at 20-99 and diverge at 10-19, so the assertion passed or failed according to how
many applications the harness database happened to hold — a **volume-dependent**
assertion masquerading as a code-dependent one.

Fixed by making the claim the assertion, in a named helper:

```ts
const match = text.match(/^Page (\d+) of (\d+)$/);
if (!match) return `unparsed: ${text}`;
if (Number(match[1]) !== expectedPage) return `on page ${current}`;
if (Number(match[2]) < 2) return `only ${totalPages} page`;
return 'ok';
```

Three properties this has and the regex did not: the parse is **exact**, so a
malformed indicator fails here instead of being tolerated by a loose match; the
multi-page precondition is a **number comparison**, so it holds at any volume; and
a failure reports *which* of the three things was wrong. Applied at all three call
sites (page 1, page 2, back to page 1). No reseeding, no `pageSize` change, and no
behavioural claim in that file altered.

## 8. One pin repointed in another lane's spec

`admin-review-workspace.spec.ts` is task 9.2's, and it opens the workspace from
the roster row this task recomposed.

| Pin | Was | Is | Why |
|---|---|---|---|
| `openWorkspace` | `getByRole('button', { name: /view details/i })` | `/open review/i` | that control is the row's one prominent command, and §5.4 renamed it so it stops colliding with the decision block's own "Review" |

Every behavioural claim in that file — one read, none of the six retired calls,
the version a decision carries, the reviewer scoping, the read-only refusal — is
unchanged. This is the same kind of change 11.2 made in its §7.7 / §18.1 and 11.3
in its §6.2 and §8: a source-location pin following a surface it names, stated here
rather than folded into a diff.

## 9. Design (PRODUCT.md / DESIGN.md)

- **No new token, colour, font, size or motion.** Existing tokens only:
  `bg-primary` / `text-primary-foreground` for the one primary control, `outline`
  for everything in the sheet, `border-border` / `bg-card` / `bg-muted/30` for
  containers, `text-muted-foreground` for labels, `min-h-touch` / `min-w-touch`
  for targets.
- **44 px, measured.** `expectTouchTargets` reads each control's own layout box
  for height **and** width across every command surface in journeys 1, 2 and 4,
  and the settlement filter in journey 6 — not from a class name. The jsdom guard
  that no `min-h-[36px]` survives is the weaker statement that the token is
  present at all.
- **Never colour alone.** The sort direction is the word `Ascending` / `Descending`
  beside its chevron; the disclosure trigger states a count in words; every status
  the surfaces render already carries a label and a Lucide icon; the destructive
  command is the word `Deactivate` in an outline button, not a red block.
- **One container deep.** The disclosure panel carries **no** border, background or
  shadow — asserted in jsdom (`not.toMatch(/\bborder\b|\bbg-card\b|\bshadow/)`).
  The card treatment belongs to the trigger and to the content, never to the panel.
  11.3's `DocumentButtons` and 11.2's `WizardContextPanel` settled the same
  question the same way.
- **No purple gradient, no gradient text, no glassmorphism, no emoji.** Icons are
  Lucide (`ChevronDown`, `ChevronUp`, `ArrowDownUp`, `Eye`, `EyeOff`), every one
  `aria-hidden`.
- **Reduced motion respected.** The chevron's rotation carries
  `motion-reduce:transition-none`; the global rule in `index.css` is untouched.
- **No marketing copy, no AI framing, no feature narration** added. The one copy
  decision is the disclosure's label, which states a number.

## 10. Hard constraints

- **Mobile-first usability preserved, and this is the task that restores it on
  the admin side.** 6 journeys × 2 projects at 390 × 844, with overflow, target
  size and text clipping **measured** rather than asserted from class names.
- **Auto-save untouched.** No wizard file, no `useAutoSave` consumer and no draft
  code is in this change.
- **Backend permissions remain the only boundary.** Nothing here decides whether a
  command is authorized: the enumeration mirrors what the renderer offers, the
  renderer already takes `canVerifyPayment` from the server's published command
  matrix, and every command still goes through the same endpoint that re-enforces
  it. Hiding a control is convenience; the absence is never the boundary.
- **Tenant isolation unchanged, and the new selector strengthens it.** The
  application selector sends `institution_id` and lets the server scope before
  lookup; it invents no client-side filter and no new endpoint.
- **No PII.** The presenters handle status strings and labels. The live region
  names an application by its `application_number` and a user record by the email
  already rendered on the card. Nothing is logged.
- **Backward compatibility.** No schema, no contract, no route, no capability. The
  catalogue stays at 17 `platform.*` + 17 `tenant.*`. Nothing to rehearse on Neon,
  nothing to regenerate.

## 11. Not claimed here, and what remains

- **The desktop tables are unchanged.** `UserTableRow`, the roster's
  `EnhancedDataTable` view and `ResponsiveTable`'s `TableView` keep their existing
  shape; this task changed what the *compact* record does and left the wide one
  alone.
- **The roster's table view still paginates and searches in the browser.**
  `ApplicationsTableView` hands `EnhancedDataTable` a `pageSize={10}` and a client
  search over the server page it was given — a second, page-derived pagination
  inside a server-paginated roster. It is unreachable below `sm` (the view toggle
  is `hidden sm:flex` and mobile is forced to cards), so it is outside this
  bullet's "on mobile" scope, but it is a live remnant of ADM-01's habit and
  belongs to whoever finishes that lane.
- **The platform-wide audit export is still the loaded page.** `/admin/audit`
  exports `response.entries` through `@/lib/auditExports`. Task 9.5 gave the
  **tenant** audit panel a page-independent server export; the platform-wide page
  did not get one, and R6.5's "the frontend SHALL NOT export only its loaded page"
  is not satisfied there. Not this task's bullet, and stated rather than left to be
  discovered.
- **Inherited card nesting remains.** The roster card still renders a bordered
  programme block inside itself, the settlement panel renders bordered record cards
  inside a `SectionCard`, and the audit entry's expanded panel renders two cards.
  This task removed the nesting it would have introduced (§9) and none of what it
  inherited — task **11.5**'s "duplicate cards" bullet.
- **`PageShell`'s metrics still sit above the record lists.** On `/admin/intakes`
  four passive tiles occupy the first viewport, which is why journey 4 scrolls the
  record into view to photograph it. Task **11.5** owns removing them.
- **Non-token colour utilities remain** on the roster card's draft banner
  (`bg-yellow-50`, `text-yellow-800`) and in the decision block's status badges
  (`bg-green-100`, `bg-blue-100`, …). Task **11.5**'s "stray dark/ad-hoc utilities"
  bullet.
- **`Joined Unknown`** appears on directory rows whose `created_at` the server did
  not send. That is the user serializer's field contract (ADM-03 / task 9.3), not a
  layout question.
- **The dangling `•`** between the institution and the intake on a wrapped roster
  card is a wrap artifact, not a lost command or an overflow. Left.
- **`ApplicationApprovalActions` is not decomposed.** 707 lines, still one long
  per-status branch tree, and this task added a prop to it rather than splitting
  it — deliberately, because two other lanes' preservation tests read its source.
  Task **12.1** owns the split.
- **`tenant-launch.spec.ts:139` is not fixed** (§4.6), and neither is the sign-up
  helper-copy test nor any of the 17 lint errors. Each is measured against a real
  run and attributed elsewhere.
- **No new capability, route, endpoint, schema or contract.**
