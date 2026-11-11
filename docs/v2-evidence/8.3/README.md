# Task 8.3 — Complete the student payment ownership split

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Evidence index for task **8.3** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 8.3 Complete the student payment ownership split
  - Wizard handles pre-submit pay/defer.
  - Payment page handles submitted/deferred/failed/expired/pending recovery and
    history using tenant fee/support context.
  - Remove indefinite disabled controls and stale hardcoded support copy.
  - _Requirements: R12.3-R12.7, R13.1-R13.2_
  - _Findings: STU-08, STU-09, STU-24_
  - _Evidence: golden and every recovery browser journey_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the candidate
  is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-05/06 (UTC). An earlier attempt's browser run (2026-07-31,
  14 journeys failing) is superseded — see §6. Every artifact in `raw/` was then
  **re-captured end to end** on 2026-08-06 against a fresh `harness down && up`,
  and every number below reproduced (§7.7).
- Builds on **8.1** (the quote is the money contract) and **8.2** (one state
  machine, and `phase` as the answer to *who is being waited on*). This task spends
  that vocabulary in the UI; it adds none of its own.
- PBT: task 8.3 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- Backend: **no backend code changed in this task.** The payment suites,
  `manage.py check`, and the schema were re-run anyway and are unchanged (§7).
  Nothing was applied to Neon or production.

## The Required_Evidence claim

The `_Evidence:` line is one claim: *golden and every recovery browser journey*.
R12.3 names four post-submission states — deferred, failed, expired, pending
recovery — and pending recovery is two states since 8.2, because
`action_required` and `provider_processing` are different waits. So the matrix is
the golden path plus one journey per state, and the STU-24 claim, on **both**
required projects.

| # | Journey | Owner under test | Proves | chromium | mobile |
|---|---|---|---|---|---|
| 1 | golden: the wizard takes the payment, then the page owns the paid record | wizard → page | pre-submission pay is the wizard's; the page then shows it paid, with history and **no** pay affordance | ✓ 9.2s | ✓ 11.9s |
| 2 | deferred: the page names the choice and takes the payment after submission | page | a deferral is named as a decision, not an unpaid fee, and is payable here | ✓ 6.6s | ✓ 8.3s |
| 3 | failed: the page states nothing was charged and the retry succeeds | page | a failure says no money moved (`role="alert"`), and the retry works | ✓ 12.2s | ✓ 12.6s |
| 4 | pending, `action_required`: tells the student to approve, and offers a re-check | page | the student is told to approve on their handset and gets a live re-check — not a dead disabled button | ✓ 8.1s | ✓ 6.8s |
| 5 | pending, `provider_processing`: says wait, and never offers a retry | page | a provider-side wait offers **no** initiate control and **no** resend | ✓ 11.7s | ✓ 9.3s |
| 6 | expired: a reconciliation-expired attempt offers a fresh one | page | an expiry is not a charge and not a failure; the fee is still owed and payable | ✓ 11.4s | ✓ 8.1s |
| 7 | support copy comes from tenant context, not from the component (STU-24) | page | the affordance is resolved, and no platform/example-tenant address is printed | ✓ 3.1s | ✓ 1.8s |

**14 passed (2.1m)**, zero skips, strict gates active
([`raw/harness-payment-journeys.txt`](raw/harness-payment-journeys.txt)) on a
freshly-seeded stack (`harness/bin/harness down && up`, tmpfs Postgres). The
harness is left **drained** afterwards
([`raw/harness-drain.txt`](raw/harness-drain.txt)), and the negative gatecheck
still fails on all four gates
([`raw/harness-gatecheck-negative.txt`](raw/harness-gatecheck-negative.txt)).

Nothing is mocked. Each journey drives the real Django payment path against the
deterministic Lenco-compatible adapter, which decides every outcome from the
request itself:

| Phone ends | Adapter behaviour | State reached |
|---|---|---|
| `...0000000` | refuses the collection | `failed` |
| `...9999` | accepts, then two pending polls | `pending` / `action_required` |
| `...5555` | answers the collection POST with 503 | `pending` / `provider_processing` |
| anything else | settles immediately | `successful` |

`expired` has no adapter lever, because it is not a provider outcome: it is the
platform deciding an attempt is stale. Journey 6 runs the same
`PaymentService.expire_stale` that `poll_pending_payments_task` runs every ten
minutes, with the 24-hour cutoff compressed to zero (§4.3).

## What this task establishes

1. **The line is drawn, and both sides hold it.** The wizard shows a price, takes
   one payment, and offers deferral; it renders no history and no recovery. The
   payment page renders every post-submission state and the ledger behind it; it
   shows no draft. Neither claim is a comment — each is a rendering test, a
   source-scan rule, and a browser journey (§1).
2. **A pending payment is no longer a dead end.** Arriving at the payment page
   with a collection already open used to render "Awaiting Review" and nothing to
   do. It now names who is being waited on, using 8.2's server-derived `phase`,
   and offers a status re-check — and offers a *resend* only where re-sending
   cannot double-charge (§2).
3. **Support copy follows the tenant.** The page used to print one platform
   address into every tenant's UI. It now resolves the affordance from host
   context, with a neutral in-app route as the fallback — never a school's inbox
   that may not be the student's, and never MIHAS/KATC (§3).
4. **The money still comes from the server.** No amount is computed, defaulted, or
   re-quantised in the browser; the page prints ledger fields and quote fields and
   nothing else. `feeProviderSourceScan.test.ts` stays green and gained the
   ownership and STU-24 rules (§1.3).

## Files

```
docs/v2-evidence/8.3/
├── README.md                              ← this index
└── raw/
    ├── harness-payment-journeys.txt           (14 passed — the 7 journeys × 2 projects)
    ├── harness-drain.txt                      (drained, before and after the gatecheck)
    ├── harness-teardown.txt                   (stack down, volumes wiped)
    ├── harness-gatecheck-negative.txt         (4 failed — the gates still fire)
    ├── harness-required-profile.txt           (whole required profile: 40 passed / 2 failed)
    ├── harness-tenant-launch-isolation.txt    (those 2 failures reproduce alone — not this task)
    ├── ownership-split-unit-tests.txt         (113 passed — the 5 unit/source-scan files + the invariants)
    ├── frontend-test.txt                      (full frontend suite: 1 pre-existing failure)
    ├── frontend-lint.txt                      (21 errors — one fewer than 8.2, none new)
    ├── frontend-build.txt                     (exit 0, incl. tsc + CSP gate)
    ├── payment-suites-postgres.txt            (988 passed / 0 failed / 6 pre-existing errors)
    ├── django-check.txt                       (no issues)
    └── spectacular.txt                        (3 warnings / 116 errors — unchanged)
```

Source of the change:

| Path | What it is |
|---|---|
| `apps/admissions/src/pages/student/Payment.tsx` | rewritten as the post-submission surface: orders unsettled fees first (R13.1), hands drafts back to the wizard, renders the resolved support block |
| `apps/admissions/src/components/student/payment/PaymentApplicationCard.tsx` | **new** — one application's payment state, the one action for it, and its history |
| `apps/admissions/src/lib/paymentRecovery.ts` | **new** — the total `PaymentUiState → {label, tone, detail, action, allowsInitiate}` map, plus the `deferred` override and the resend rule |
| `apps/admissions/src/lib/tenantSupport.ts` | **new** — resolve the support affordance from tenant context, neutral platform route as fallback (STU-24) |
| `apps/admissions/tests/unit/paymentOwnershipSplit.test.tsx` | 14 rendering tests: every state, no indefinite disabled control, tenant support |
| `apps/admissions/tests/unit/paymentRecoveryPresentation.test.ts` | 37 tests on the pure mapper, including totality over `PaymentUiState` |
| `apps/admissions/tests/unit/tenantSupportContact.test.ts` | 11 tests on the resolver, both outcomes |
| `apps/admissions/tests/property/paymentRecovery.property.test.ts` | **new** — 6 invariants over the mapper's whole input space (§1.5) |
| `apps/admissions/tests/unit/feeProviderSourceScan.test.ts` | extended with the STU-24 and ownership rules (§1.3) |
| `apps/admissions/tests/harness-e2e/required/payment-ownership-split.spec.ts` | **new** — the 7 browser journeys |
| `apps/admissions/tests/harness-e2e/helpers/ops.ts` | the expiry sweep helper, plus `closeAbandonedAdapterCollection` (§4.3) |
| `apps/admissions/tests/harness-e2e/harness-fixtures.ts` | a browser **cancellation** is no longer counted as a platform refusal (§4.2) |
| `backend/config/settings/harness.py` | `RATELIMIT_ENABLE = False` for the harness topology only; the per-user payment throttle stays on (§4.1) |

---

## 1. The ownership split, as an enforced rule

### 1.1 What each surface owns

| | Wizard (`PaymentStep.tsx`) | Payment page (`/student/payment`) |
|---|---|---|
| Shows a price | yes — the server quote, with its expiry | only when the student opens the form to pay |
| Takes a first payment | **yes** | yes, for a fee still owed after submission |
| Offers deferral | **yes, and only here** | no — a deferral already made is *named* here, not offered |
| Post-submission recovery | no | **yes** — deferred, failed, expired, `action_required`, `provider_processing` |
| Payment history | no | **yes** |
| Drafts | yes | no — hands the student back to the wizard |

The two directions are separately enforced, because a split that only holds in one
direction is not a split:

- The page never shows a draft. `orderedApplications` filters `status === 'draft'`
  out, and the empty state for a student who has only a draft is a link back into
  the wizard — a path forward, not a dead end.
- The wizard never shows history or recovery. Journey 1 asserts
  `payment-history-toggle` and `payment-application` have **count 0** on the
  payment step, and the source scan forbids `listPayments` /
  `resolvePaymentRecovery` from appearing in `PaymentStep.tsx` at all.

### 1.2 No indefinite disabled control (R12.6)

The finding was not that a button was styled wrong; it was that a student who
arrived with a collection already open was shown a control they could never use
and no stated path to using it. The rule is now data, not styling:
`PaymentRecoveryPresentation.allowsInitiate` decides whether an initiate control
may render **at all**, so a waiting state does not render a disabled pay button —
it renders a wait and a re-check.

Three tests hold it:

| Test | Claim |
|---|---|
| `paymentOwnershipSplit.test.tsx` → "a recovered pending payment renders a wait state, not a dead pay button" | the pay affordance is absent, not disabled |
| `paymentOwnershipSplit.test.tsx` → "every rendered control in a waiting state is either enabled or explained" | no `button:disabled` survives in a waiting state |
| journeys 4, 5, 6 | `await target.locator('button:disabled').count()` is **0** on the live page, in all three recovery states, on both viewports |

The only `disabled` attributes left on either surface are the wizard's two
in-flight guards (`deferring`, `devBypassing`), which are transient by
construction and clear on response.

### 1.3 The source scan grew the ownership and STU-24 rules

`tests/unit/feeProviderSourceScan.test.ts` was task 8.1's guard against an
invented fee returning. It stays green (25 tests) and now also scans the same six
payment surfaces for the absences this task created. A rendering test proves the
right thing appears today; only a scan keeps the next empty state from hardcoding
the wrong thing:

| Rule | Fails when |
|---|---|
| no hardcoded support copy | a literal `mailto:`, an `@beanola/@mihas/@katc` address, a Zambian phone number, or "office hours"/"Mon–Fri" appears in payment source |
| no legacy tenant as the platform | a literal `MIHAS` / `KATC` appears in payment copy |
| the affordance is resolved | `Payment.tsx` and the card must go through `tenantSupport`, and the page must read `usePortalBrand` rather than hardcoding a title |
| the page owns recovery | the card must use `resolvePaymentRecovery` + `usePaymentStatus` |
| the wizard owns pre-submit | `PaymentStep.tsx` must contain no history, no `listPayments`, no `resolvePaymentRecovery` |
| no second copy of the wait budgets | `paymentRecovery.ts` must contain no literal `120`/`600` and no `timeoutSeconds:` of its own |

That last rule is the one worth naming: the budgets are the server's numbers, read
through 8.2's `PAYMENT_WAITING_STATES`, so the payment page and the wizard cannot
describe the same wait differently.

### 1.4 Constraints held through the change

| Constraint | How it is held |
|---|---|
| Server is the sole money authority — no frontend arithmetic, defaults, or provider-network guessing | the page renders ledger fields and quote fields verbatim; `feeProviderSourceScan.test.ts` (25 passed) forbids a `K`-prefixed interpolation, a K150/USD-20 default, and a re-quantised amount, and requires `Payment.tsx` itself to contain no `formatServerAmount` |
| `feeProviderSourceScan.test.ts` stays green | **25 passed**, and it gained six rules (§1.3) |
| `PaymentPhase` mirror guards stay green | `test_payment_phase_8_2.py` (25 across two runs) + `paymentPhaseUiStates.test.ts` (20) — this task reads the mirror and restates nothing, which the scan enforces |
| Stable-code drift guard stays green | `paymentErrorCodes.test.ts`, `derivePaymentUiState.test.ts` |
| Mobile-money-first, card fallback, defer preserved | `paymentStepLegacyPath.test.tsx` (Mobile Money is the default-selected tab), `paymentStepMobileMoneyFirstPhase4.test.tsx`, and journey 1's use of the deferral control |
| A polling timeout is never rendered as failed (R14.3) | `still_confirming` reuses 8.2's `provider_processing.onTimeout` copy; `usePaymentStatusNoFailedOnTimeout.test.ts` and `paymentRecoveryPresentation.test.ts` → "never reads a spent wait budget as a failure" |
| Accessibility | the state block is `role="alert"` + `aria-live="assertive"` for the three failure states and `role="status"` + `polite` otherwise; it takes focus when the state changes under the student (`tabIndex={-1}` + effect); every control carries `min-h-touch`; every status is a `StatusBadge` label, never colour alone. Journey 3 asserts the live `role="alert"`; `paymentStepAccessibilityPhase4.test.tsx` holds the wizard half |
| Design rules | one `PageShell`, `SectionCard` sections, `EmptyState` for both empty cases, `ErrorDisplay` for the load failure, `Button asChild` for links; the state block is an unframed tinted region rather than a nested card; Lucide only, no emoji, no gradient or glass |
| Additive, Neon-first, never production | no schema change, no migration, no DB write outside the throwaway harness and localtest stacks |

### 1.5 The corners of the mapper, not just its examples

`tests/property/paymentRecovery.property.test.ts` (6 tests, fast-check) covers what
a table test cannot: `resolvePaymentRecovery` takes six ledger statuses × eight
phases × two timeout flags × the whole stable-code catalogue, and the dangerous
cases are the rare corners rather than the rows someone thought to write down.

These are **task invariants, not numbered spec properties** — task 8.3 has no
property-based-testing sub-task, so nothing here is registered in the spec's
property register or reported through `update_pbt_status`. What they assert:

| Invariant | Why it matters |
|---|---|
| every combination resolves a decided presentation (non-empty label + detail, and an action iff an action label) | no input produces an undefined screen |
| `isWaiting` ⟹ `allowsInitiate === false` and `action !== 'pay'`; `isSettled` ⟹ `allowsInitiate === false` | the double-charge guard holds over the whole space, not just the states §1.2 lists |
| a spent budget on an un-refused pending row is `still_confirming` and never a `destructive` tone | R14.3 across every combination |
| `resendAvailable` ⟹ `phase === 'action_required'` **and** pending **and** budget spent; `provider_processing` ⟹ never | STU-09's asymmetry stated as an implication rather than two examples |
| the mapper is pure — same input, same view | no clock, no I/O, no hidden state |
| a wait budget is claimed only for the two server-derived waits, and it is 120 s vs 600 s | the student is chased sooner than the provider, and no third state invents a budget |

## 2. Pending is two states, and only one of them may be re-sent (STU-09)

8.2 made the backend derive *who is being waited on*. This task renders it, and
the difference is not cosmetic — it is a double-charge guard.

| | `action_required` | `provider_processing` |
|---|---|---|
| Badge | "Approve on your phone" | "With your provider" |
| Detail | enter your PIN, keep this page open | "there's nothing to do" |
| `data-payment-ui-state` | `action_required` | `provider_processing` |
| Wait budget (server) | **120 s** | **600 s** |
| Status re-check | offered, enabled | offered, enabled |
| Initiate control | **never** | **never** |
| Resend after the budget is spent | **offered** | **never** |

The resend asymmetry is the whole of STU-09 expressed as an affordance. A spent
`action_required` budget means the student was never prompted: no money moved, and
the service mints a fresh provider reference on the **same** payment row, so
nothing can be charged twice. A spent `provider_processing` budget means a
collection request is in Lenco's hands; a second one is exactly how a student gets
charged twice, so the way out is reconciliation, not the student.

`resolvePaymentRecovery` returns `resendAvailable` only for
`budgetSpent && phase === 'action_required'`, and both halves are asserted:

- `paymentRecoveryPresentation.test.ts` — "offers a resend only after an
  `action_required` budget" / "never offers a resend after a
  `provider_processing` budget".
- Journey 5 — `payment-resend-prompt` and `payment-pay-action` both have **count
  0** on the live page, and the detail text does **not** mention a PIN, because no
  prompt was ever issued.
- Journey 5 also reads `phase_timeout_seconds` **from the API** and asserts it is
  600, so the long budget is the server's answer rather than a UI constant.

A spent budget is never rendered as a failure (R14.3): `still_confirming` reuses
8.2's `provider_processing.onTimeout` copy, which tells the student they can leave
the page and that they will not be charged twice.

## 3. The support affordance is resolved, not printed (STU-24)

There are exactly two outcomes, and no third:

| Tenant context | Outcome |
|---|---|
| resolved school with a plausible contact address | `mailto:` **that school's** admissions inbox, subject and body pre-filled with non-PII context |
| shared/neutral portal, or no configured address | the in-app `/contact` route |

The neutral outcome prints **no address**, because none was configured. That is
the finding's point: the page used to print a platform address and an office phone
number into every tenant's UI regardless of who the tenant was, and the
enterprise-tenancy rule is that a missing tenant asset falls back to the neutral
Beanola context — never to a legacy example tenant.

Journey 7 proves it end to end on the neutral harness portal:
`data-support-kind="platform_contact_page"`, `href="/contact"`, and then a
whole-page text scan asserting the absence of `admissions@beanola.com`,
`support@beanola.com`, `+260 966`, `+260 961`, `mihas`, and `katc`.

## 4. Three things the harness had to learn

Getting a required browser journey to make an honest claim about payment recovery
exposed three harness problems. Each is recorded here because each is a change in
how evidence is produced, not a change in what the platform does.

### 4.1 One student per journey, and one relaxed rate limit

Two rate limits sit in front of these journeys and they need opposite answers.

`RateLimitMiddleware` budgets by **client IP** (`/auth/login/` 10/5m,
`/auth/register/` 5/5m). Every request in this harness — every student, the
platform admin, and the browser — arrives from one compose-network address, so
that budget cannot mean here what it means in production, where each applicant has
their own. `config.settings.harness` therefore sets `RATELIMIT_ENABLE = False`,
exactly as `config.settings.test` already does, with a comment saying it is the
topology being relaxed and not the platform.

`PaymentUserScopedRateThrottle` budgets **per user** (`payment_mobile_money`
6/min) and **stays on**, because a per-user budget means the same thing in a
harness as in production. That is why each journey registers its **own** student:
a single shared identity spent one student's collection budget across seven
journeys and the sixth was answered 429 — a refusal that tests how the spec shares
an account, not R12.3. One student per journey is also the more faithful
simulation. The platform admin is still shared, because it does no throttled
payment work.

### 4.2 A cancellation is not a refusal

The strict gate (R18.4) fails a run on any failed request the test did not declare
— correctly. But three of the golden journey's requests were failing as
`net::ERR_ABORTED` every single run, and they were *caused by the platform working
as designed*:

- auto-save is mandatory on every student form, so `useAutoSave` fires one last
  `PATCH /applications/{id}/` from `beforeunload`/`visibilitychange` when the form
  is dirty — a call that by construction cannot finish, because the document is
  already going away;
- that save's success bumps the draft store, which refetches the draft list;
- the education step's extraction assistance polls `/documents/{id}/info/` every
  3 s for a bounded 90 s, and `AbortController` cancels an in-flight save on
  unmount.

Waiting cannot remove these, because the navigation is what starts them. So two
changes were made, in this order:

1. **The journey leaves the wizard the way a student safely does**: it presses the
   wizard's own **Save Now**, waits for the save to finish, and waits for a window
   with no request in flight and none started for 1.2 s (deliberately shorter than
   the 3 s poll interval, so the window is reachable). This removed the *cause* of
   two of the three cancellations rather than the symptom, and it is the honest
   sequence: pay, save, submit.
   > It also surfaced an ordering bug in the journey. Saving *after* the submit
   > command is answered **403**, because a submitted application no longer accepts
   > a student draft write. That refusal is correct, and the journey now saves
   > before submitting.
2. **`harness-fixtures.ts` classifies `net::ERR_ABORTED` as a cancellation**, not
   a refusal: the browser withdrew the request, so the platform never answered it.
   Cancellations are recorded in `gate.cancelledRequests` (visible, and assertable
   by a test that wants to make a claim about them) and do not fail a run. Every
   other transport failure — `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`,
   `ERR_TIMED_OUT`, CSP blocks — and every HTTP ≥ 400 still does.

The second change is cross-cutting, so it was verified against the gate's own
negative project: **all 4 gatecheck tests still fail**, including the
failed-request gate, whose probe fetches an unresolvable host and so reports
`ERR_NAME_NOT_RESOLVED`
([`raw/harness-gatecheck-negative.txt`](raw/harness-gatecheck-negative.txt)).

> **Why the hand-off is a document navigation on both projects.** A client-side
> route change would sidestep the unload save entirely, but on mobile there is
> currently no in-app route to `/student/payment` from the wizard at all:
> `DesktopSidebar` is `hidden md:flex`, and `MobileBottomNav` exists but is not
> mounted anywhere. That gap belongs to tasks **10.1** ("add Communications to
> mobile More", mobile-nav E2E) and **11.2** ("suppress global bottom nav during
> the wizard"), both still open. Until one of them lands, `page.goto` is the only
> hand-off available at mobile width, so both projects use it.

### 4.3 The one collection nobody settles

The drain gate counts a collection unsettled until a status poll returns something
final. Journey 6's subject is an `expired` payment — the one state where the
platform deliberately walks away from an open provider collection and never polls
that reference again. So after the sweep, the adapter reported an unsettled
collection forever and the drain gate failed for the one journey whose subject is
exactly that:

```
queue-depth: {"broker_queue_depth": 0, "unsettled_payment_collections": 2,
  "unsettled_references": ["BNL-…-1785975122473", "BNL-…-1785975195815"]}
[harness] ✗ 2 payment collection(s) never settled
```

Both references had been polled **once** and answered `pay-offline` — one per
project, both from journey 6.

A real provider closes its own side out eventually. `closeAbandonedAdapterCollection`
says the same thing to the simulator, explicitly and per reference, using the
adapter's own vocabulary (`pending_polls: 0` — "this reference needs no further
poll", which is exactly true of an expired attempt). It never touches the
platform's ledger: the row stays `expired`, which is the point of the journey. The
abandonment is declared rather than hidden, and every other collection still has
to settle the honest way — which is why the final drain reads clean **before** the
gatecheck deliberately dirties it again, and clean after
([`raw/harness-drain.txt`](raw/harness-drain.txt)).

## 5. The authority documents said the opposite

STU-09 is not only a UI finding. Part of the contradiction lived in the steering
itself: `product.md` said *"Student payment outside the wizard is read-only.
`/student/payment` is a history and guidance surface, not a payment entry form"*,
and `structure.md` described the page as *"Read-only payment history and payment
guidance"* — while submitted, deferred, and failed applications had nowhere else to
recover. Leaving those sentences in place would preserve the drift the finding is
about, so they were corrected with the code:

| Document | Change |
|---|---|
| `.kiro/steering/product.md` | the read-only bullet is replaced by the split: wizard owns pre-submission pay-or-defer and renders no history/recovery; `/student/payment` owns deferred/failed/expired/pending recovery plus history and may take a payment for a fee still owed after submission; it never shows a draft |
| `.kiro/steering/tech.md` | the same rule as a frontend convention with *"do not restore the read-only description — that contradiction is finding STU-09"*, plus `paymentRecovery`, `tenantSupport`, and `PaymentApplicationCard` in the payment component table |
| `.kiro/steering/structure.md` | the high-risk-flow description corrected, the recovery card added, and a "Files Added During Admissions-V2 Task 8.3" table including the two harness-level changes (§4) |
| `docs/canonical-truth-map.md` | new **"Student payment ownership split"** section: which surface owns what, `allowsInitiate` as the double-charge guard, `resendAvailable`'s asymmetry, the tenant support resolver, and the drift guards that hold each |

## 6. The superseded run

An earlier attempt captured a browser run on 2026-07-31 in which **all 14
journeys failed**. It is superseded, and the three causes were fixed rather than
worked around:

| Failure then | Cause | Fixed by |
|---|---|---|
| `GET /catalog/canonical-programs/?intake=…` → **500** | backend filter | resolves 200 now (verified directly against the harness edge); another task's fix in the same in-flight worktree |
| admin submit → **400 `PROFILE_INCOMPLETE`** | the journey's draft fixture carried no NRC | `harnessNrc()` in `helpers/api.ts` — a unique, format-valid NRC per journey |
| super-admin login → **429 `RATE_LIMITED`** | one compose-network IP against an IP-keyed budget | `RATELIMIT_ENABLE = False` in `config.settings.harness` (§4.1) |

The run in this directory is a fresh `harness down && harness up` — SPA rebuilt,
tmpfs Postgres re-seeded, no carried-over state.

## 7. Verification (verbatim)

### 7.1 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 3894 passed / 1 skipped** (463 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **21 errors, 0 warnings** | [`frontend-lint.txt`](raw/frontend-lint.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |
| `tsc --noEmit -p tsconfig.json` (the full one, tests included) | 552 errors, **down 2** from the pre-task 554 — the two were `type Page` imported from `harness-fixtures`, which now re-exports it; zero in `tests/harness-e2e/` | — |
| the task's own units + invariants | **113 passed** across 6 files | [`ownership-split-unit-tests.txt`](raw/ownership-split-unit-tests.txt) |

vs 8.2's run: **+76 tests passing, +5 test files**, same single failure.

That failure is `tests/unit/authPageFormMarkup.test.tsx`, which asserts the SignUp
helper copy "We'll verify this address." while the page in this worktree says
"We'll send account updates here." — another in-flight task's edit, catalogued in
[8.1 §4.1](../8.1/slice-2-frontend.md), the task 7.5 evidence, and
[8.2 §6.5](../8.2/README.md). Unrelated to payments.

**Lint went 22 → 21, and the one that disappeared is this task's file.**
`src/pages/student/Payment.tsx` used to import `@/services/client` directly, which
the R14.3 architecture rule forbids for pages and components; the rebuilt page
reads through `@/services/payments` and `@/services/applications`. Every remaining
error is on a file this task did not touch, except `PaymentStep.tsx`, whose
`import { apiClient } from '@/services/client'` is an **unchanged context line**
(the wizard's defer command; converging it belongs to the R14.3 lane). The two
`harness-fixtures.ts` entries are the same pre-existing unused
`eslint-disable` directives 8.2 recorded at lines 128/130, now at 161/163 because
this task added lines above them.

Every capture in `raw/` is from the same re-verification pass (§7.7), taken after
the last source edit, so `ops.ts:155` and `harness-fixtures.ts:161/163` are the
line numbers the current tree actually reports.

### 7.2 Browser journeys

| Run | Result | Artifact |
|---|---|---|
| the 7 journeys × 2 required projects | **14 passed (2.1m)**, zero skips | [`harness-payment-journeys.txt`](raw/harness-payment-journeys.txt) |
| drain gate, after the journeys | broker 0, unsettled 0 — **exit 0** | [`harness-drain.txt`](raw/harness-drain.txt) |
| gatecheck-negative (**must fail**) | **4 failed** — console, failed-request, skip, undrained | [`harness-gatecheck-negative.txt`](raw/harness-gatecheck-negative.txt) |
| drain gate again, after the gatecheck dirtied the queue | broker 0, unsettled 0 — **exit 0** | [`harness-drain.txt`](raw/harness-drain.txt) |
| the whole required profile, both projects | **40 passed / 2 failed (3.3m)** | [`harness-required-profile.txt`](raw/harness-required-profile.txt) |
| teardown | stack down, volumes wiped — **exit 0** | [`harness-teardown.txt`](raw/harness-teardown.txt) |

> **How the browser is launched here.** Playwright's bundled Chromium has no build
> for this machine's OS (`Playwright does not support chromium on ubuntu26.04-x64`),
> so every run above uses `playwright.harness.config.ts`'s documented escape hatch:
> `HARNESS_PW_CHANNEL=chrome`, against the system `google-chrome`. Omitting it fails
> all 14 journeys at launch with *"Executable doesn't exist at
> …/chromium_headless_shell-1208/…"* — an environment fact, not a platform one. The
> default (bundled Chromium) is unchanged and is still what CI's `ubuntu-latest`
> runner uses.

The whole profile was run because §4.2 changed a shared fixture. The 2 failures
are both `tenant-launch.spec.ts` → "the wizard exposes program / intake / fee /
routing steps on mobile" (TEN-02, R7.3 — task 4.3's spec), and they **reproduce
when that file is run alone**
([`harness-tenant-launch-isolation.txt`](raw/harness-tenant-launch-isolation.txt):
2 passed, 1 failed), so they are independent of this task. The cause is visible in
the failure log and is a locator defect rather than a platform one:
`getByText('Fees').first()` resolves to the **sidebar** nav label "Program Fees",
which is `hidden md:flex` at mobile width, instead of the onboarding wizard's own
Fees step. Left for that task.

### 7.3 Backend payment / fee / document / webhook suites

`python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "payment|fee|document|webhook")`
— 103 files, the same selection 8.1 §4.3 and 8.2 §6.1 used, against the isolated
`mihas-localtest` Postgres (`DATABASE_URL=<localtest 5433> TESTING=1`). Neon and
production were not touched.

| Run | Result |
|---|---|
| 8.2 final | 3 failed, 971 passed, 64 skipped, 2 xfailed, 1 xpassed, **6 errors** |
| **8.3** | **0 failed, 988 passed**, 64 skipped, 2 xfailed, 1 xpassed, **6 errors** |

[`payment-suites-postgres.txt`](raw/payment-suites-postgres.txt). The 6 errors are
**byte-identical by name** to 8.2's (the three `test_application_review_payment_gate`
reversal/legacy cases and the three `test_payment_review_reopen` cases). The 3
failures 8.2 catalogued — the Postgres-only document-version cases from
[8.1 §4.4](../8.1/slice-1-quotes.md) — now pass; that is another lane's fix
landing in the same in-flight worktree, not this task's work, since the only
backend file this task touches is `config/settings/harness.py` (§4.1) — a settings
module for the throwaway harness topology that no dev, test, staging, or
production settings module imports. No application code, no schema, no migration.

### 7.4 Django system checks

`cd backend && python3 manage.py check`

```
LENCO_API_SECRET_KEY is not set — payment processing will be unavailable.
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`django-check.txt`](raw/django-check.txt). The LENCO line is the expected
local-dev notice — this machine holds no provider credential, which is why the
browser journeys drive the deterministic adapter instead.

### 7.5 OpenAPI schema

Re-run for comparison even though no backend code changed:

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — identical to 8.2's counts.

### 7.6 Failures introduced by this task

**Zero.**

| Scope | Evidence |
|---|---|
| Browser journeys | 14/14 pass on a fresh stack; the 2 residual required-profile failures reproduce in isolation and belong to task 4.3 (§7.2) |
| Strict gates | all 4 gatecheck probes still fail after the fixture change (§4.2, §7.2) |
| Frontend | same 1 pre-existing failure; lint **down** one error, and the one removed is this task's file (§7.1) |
| Backend | 0 failed (from 3), same 6 errors by name, `check` clean, schema unchanged (§7.3–7.5) |

### 7.7 The re-verification pass

Every artifact in `raw/` was re-captured end to end on 2026-08-06 — a full
`harness down`, `harness up` (SPA rebuilt, tmpfs Postgres re-seeded), the journeys,
both drains, the gatecheck, the whole required profile, and teardown — plus all four
static gates and the schema. Nothing was carried over from the earlier capture.

| Gate | Then | Re-verified |
|---|---|---|
| `bun run test` | 1 failed / 3894 passed / 1 skipped | **identical** — same single `authPageFormMarkup` failure |
| `bun run lint` | 21 errors, 0 warnings | **identical**, same 18 files |
| `bun run build` | exit 0 | **exit 0** |
| the task's units + invariants | 107 / 5 files | **113 / 6 files** (the invariants are now captured with them) |
| 7 journeys × 2 projects | 14 passed | **14 passed (2.1m)** |
| drain, gatecheck-negative | clean; 4 failed | **clean; 4 failed** |
| whole required profile | 40 passed / 2 failed | **40 passed / 2 failed** — the same two `tenant-launch` mobile cases, reproduced in isolation again |
| backend payment suites | 988 passed / 6 errors | **988 passed / 6 errors**, same names |
| `manage.py check` | no issues (1 silenced) | **no issues (1 silenced)** |
| schema | 3 warnings / 116 errors | **3 warnings / 116 errors** |

Two facts worth recording because each cost a failed run before it was understood:

1. **The browser channel** (§7.2). Bundled Chromium has no build for this OS; the
   run needs `HARNESS_PW_CHANNEL=chrome`.
2. **`manage.py check` must be run with the repo's own environment.** Exporting a
   `TESTING=1` or a substitute `REDIS_URL` first flips `CACHES` to `LocMemCache`
   (`base.py` `_is_testing`), and the check then reports
   `django_ratelimit.E003 — not a shared cache`. That is the override talking, not
   the platform: the canonical `cd backend && python3 manage.py check` is clean.

## 8. Not claimed here

- **Fee administration and settlement** (server-scoped filtering, aggregates,
  reconciliation state, export, redaction, audit) is task **8.4**. This task
  changed nothing in the admin fee or settlement surfaces.
- **The mobile primary navigation** — four destinations plus More, and the wizard
  suppressing it — is tasks **10.1** and **11.2**. `MobileBottomNav` exists and is
  unmounted; §4.2 explains why that shapes the journey's hand-off but not its
  claim.
- **The card fallback path is preserved, not journey-proven.** Mobile money is the
  primary method and every journey uses it, because the harness CSP deliberately
  blocks `pay.lenco.co` so the stack can never reach the real gateway. The card
  widget remains available in `PaymentForm` and is covered by unit tests;
  exercising it in a browser needs a widget stand-in, which no task has yet
  specified.
- **`applications.payment_status` as a projection** (ADR-001) and the state machine
  itself are 8.2's. This task reads them.
- **The 403 on a student draft write after submission** (§4.2) is correct
  behaviour that this journey stumbled into. Whether the *wizard* should notice a
  submitted application under it and stop trying to save is a question for the
  wizard/draft lane, not a payment finding.
