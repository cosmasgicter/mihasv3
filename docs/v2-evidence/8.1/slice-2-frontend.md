# Task 8.1 — Slice 2 (frontend + closure): the client renders server money and computes none

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

_Requirements: R12.1, R12.2, R12.6_
_Findings: STU-08, DATA-05_
_Design: §10.1 (Fee Quote), §10.2 (provider phone/network routing is server-authored)_
_Required_Evidence (tasks.md): "quote contract tests **and source scan for fee/provider
hardcodes**" — the **source scan** half closes here. The contract-test half closed in
[`slice-1-quotes.md`](slice-1-quotes.md). Together they are the single claim; see
[`README.md`](README.md)._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of that commit (the whole admissions-v2 spec
  is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-29 (UTC).
- PBT: task 8.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is empty), so nothing is recorded through
  `update_pbt_status`. The suites added here are unit + source-scan tests; the two
  fast-check properties that touch PaymentStep (`admissionsFlowPreservation`) are
  pre-existing and stay green.
- Schema: **none**. This slice is frontend-only. No SQL, no Neon branch, no
  production contact.

## 1. What already existed before this slice

Task 8.1 was `[-]`. A prior session had landed the first frontend pass as untracked
working-tree files. Traced before changing anything:

| Layer | File | State found |
|---|---|---|
| Quote hook | `src/hooks/useFeeQuote.ts` | Present. Fetched `POST /payments/quote/` via `apiClient` directly. |
| Money formatter | `src/lib/serverAmount.ts` | Present, arithmetic-free. |
| 1% arithmetic | `src/components/student/PaymentForm.tsx` | Already deleted (`TRANSACTION_FEE_RATE`, `formatCurrency(amount * (1 + RATE))`, numeric `amount` prop). |
| Operator guessing | `src/components/student/PaymentForm.tsx` | Already deleted (`detectOperator`, the operator badge, the Zamtel→Airtel default). |
| Request shape | `src/services/payments.ts` | `initiateMobileMoney` already sent `{application_id, phone}` only. |
| Stable codes | `src/lib/paymentErrorCodes.ts` | The 5 quote codes + `FEE_NOT_CONFIGURED`/`FEE_AMBIGUOUS` mirrored, with copy; drift fixture + snapshot updated. |
| Wizard/payment page | `PaymentStep.tsx`, `Payment.tsx` | Consuming the quote; hardcoded K150/USD 20 empty state already gone. |
| **Source scan** | — | **Did not exist.** |
| Evidence | `docs/v2-evidence/8.1/slice-2-frontend.md`, `README.md` | Did not exist. |

So the honest state was: the deletions had been made but **nothing stopped them coming
back**, three client-side money transforms were still live on student surfaces, and the
five quote codes had copy but no *recovery action* — which is what R12.6 actually asks
for.

## 2. Requirement mapping

| AC | Where it is satisfied | Proof |
|---|---|---|
| **R12.1** — server-authored quote; the frontend performs no amount arithmetic | `useFeeQuote` → `createFeeQuote` (service) → `POST /api/v1/payments/quote/`; every amount stays a server string through `formatServerAmount`; `PaymentForm` takes `baseAmount`/`providerFee`/`totalAmount` strings | `feeQuoteAuthority.test.tsx` (server total ≠ base+1%, zero provider fee, no breakdown), `paymentStep.test.ts` ("renders the server total verbatim"), **`feeProviderSourceScan.test.ts`** rules 2–6 |
| **R12.2** — no hardcoded substitute when a fee is not configured | `useFeeQuote` fails closed: no quote → no amount, no `PaymentForm`, an explicit reason instead | `feeProviderSourceScan.test.ts` rules 7–11 (`K150`/`USD 20`, bare `amount = <number>` defaults, deleted `src/config/payments.ts`, deleted `useFeeResolver`, one formatter, no assumed currency symbol) |
| **R12.6** — server amounts, quote expiry, provider state, **recovery action** | `PAYMENT_CODE_RECOVERY` (total map, compile-enforced) + `recoveryActionForStableCode` + the shared `FeeQuoteRefusal` block; `expires_at` rendered as "held until …" / an expired notice with a refresh | `feeQuoteAuthority.test.tsx` → "quote stable codes — each refusal names what to do next" and "FeeQuoteRefusal — the student is told the reason and the recovery"; `paymentErrorCodesCoverage.test.ts` → "PAYMENT_CODE_RECOVERY — every refusal has a decided recovery" |

### The five quote codes and what the student can do

| stable code | recovery | affordance shown |
|---|---|---|
| `QUOTE_EXPIRED` | `refresh_quote` | "Refresh fee" button |
| `QUOTE_INVALID` | `refresh_quote` | "Refresh fee" button |
| `QUOTE_NOT_FOUND` | `refresh_quote` | "Refresh fee" button |
| `QUOTE_CONFIGURATION_CHANGED` | `refresh_quote` | "Refresh fee" button |
| `QUOTE_ALREADY_REDEEMED` | `check_status` | guidance only — **no** retry button |

`QUOTE_ALREADY_REDEEMED` deliberately gets no retry: a redeemed quote already funded a
Payment, and offering "pay again" there is how a student pays twice. `FEE_NOT_CONFIGURED`
/ `FEE_AMBIGUOUS` map to `contact_support` for the same reason in reverse — a school's
fee setup is not something a student can retry their way out of, so the block states the
reason and stops.

## 3. What this slice changed

### 3.1 The quote call moved into the payments domain service

`useFeeQuote` was calling `apiClient.request('/payments/quote/', …)` itself. The repo
convention (`tech.md`: "use app-local API service modules instead of raw fetch"; the
`no-restricted-imports` rule and `architectureEnforcement.test.ts`) puts transport in
`src/services/*`. Added `createFeeQuote` / `readFeeQuote` + the `FeeQuote` wire type to
`src/services/payments.ts`; the hook now imports the service and nothing else. The hook
keeps the `useState`/`useEffect` shape of the retired `useFeeResolver` so the mocked-hook
tests (`paymentStep.test.ts`, `application-wizard-accessibility.test.tsx`) and the
module-mocked `@tanstack/react-query` in `payment-page.test.tsx` keep working unchanged.

`readFeeQuote` (`GET`) is exported for the payment-page recovery journey in task 8.3; the
hook currently mints through `POST`, which the backend implements as mint-or-reuse.

### 3.2 Stable codes gained a decided recovery action

`PAYMENT_CODE_RECOVERY: Record<PaymentStableCode, PaymentNextAction | null>` in
`src/lib/paymentNextActions.ts` — a **total** record, so adding a stable code without
deciding its recovery is a compile error rather than a silently unhandled state. `null`
means "no self-service action; the copy is the whole answer". The existing
`PAYMENT_NEXT_ACTION_COPY` map and the drift guard were extended, not forked.

### 3.3 One place answers a refused quote

`src/components/student/FeeQuoteRefusal.tsx` — the wizard step and the payment page were
each writing their own "error message + Try again" block, with the payment page's button
labelled `Try again` even when re-pricing was the actual fix. Now both compose one block
that reads the recovery action, renders the labelled affordance only when acting *here*
is genuinely the fix, and otherwise shows the recovery guidance. It carries `role="alert"`
(a refusal replaces the price the student was reading) and a ≥44 px (`min-h-touch`)
target, and it asserts its own emptiness of money: `never renders an amount when the
quote was refused`.

### 3.4 Three surviving client-side money transforms, deleted

These were live, are all in the STU-08 class ("the client decides money"), and none of
them were caught by the earlier pass:

| Surface | Was | Now |
|---|---|---|
| `src/pages/student/Payment.tsx` | `formatCurrency()` — `Number(amount).toFixed(2)` plus a local `currency === 'ZMW' ? 'K' : …` symbol map | `formatLedgerAmount()` → `formatServerAmount`; ledger digits pass through, `'—'` when the server sent nothing |
| `src/components/student/applicationStatus/PaymentStatusBlock.tsx` | `` `K${applicationFee}` `` — a `K` in front of **every** currency, so a USD applicant read "K20.00" | `formatServerAmount(fee, paymentCurrency)`; new `paymentCurrency` prop threaded from `ApplicationStatus.tsx`; empty → "Shown on the payment step" |
| `src/pages/student/applicationWizard/steps/AssignedSchoolStep.tsx` | `Number(fee.amount).toLocaleString(…, {minimumFractionDigits: 2})` — client-chosen money precision on the assignment preview | `formatServerAmount(fee.amount, fee.currency)` |

`payment_currency` (already on the wire from
`ApplicationPaymentSummaryMixin.get_payment_currency`) was missing from the frontend
`Application` type; added.

Out of scope and deliberately untouched: `src/pages/admin/ProgramFees.tsx`
`formatFeeAmount` (admin *fee configuration* table, not student money authority — task
8.4 territory, and pinned by `adminDashboardOverhaul.test.tsx`), and the admin
application list/export amount columns (tasks 8.4 / 9.x).

### 3.5 The source scan — the closure artifact for STU-08

`apps/admissions/tests/unit/feeProviderSourceScan.test.ts`, 18 rules over
`apps/admissions/src` (**18 passed** — [`raw/frontend-fee-provider-source-scan.txt`](raw/frontend-fee-provider-source-scan.txt)):

| Group | Rules |
|---|---|
| No money arithmetic (R12.1) | self-check that the scan actually matches its 8 declared payment surfaces; no `TRANSACTION_FEE`/`FEE_RATE`/`PROVIDER_FEE_PERCENT` constant anywhere in `src/`; no `* (1 + …RATE)`, no `<money-identifier> *`, no `* 1.0x` / `* 0.0x` / `1.0x *`; no `+ - /` on an amount/fee/total/price identifier; no `toFixed`/`Math.round|floor|ceil`; no `parseFloat` |
| No invented amount (R12.2) | no `K150` / `USD 20` / `K153`; no bare `amount|fee|total = <number>` default; `src/config/payments.ts` stays deleted; `useFeeResolver` + `resolve-fee` stay gone; exactly **one** money formatter, and `serverAmount.ts` contains no `parseFloat`/`toFixed`/`Number(`/`Math.`; no assumed `K` currency prefix |
| Server-authored provider routing (§10.2) | no `detectOperator`/`MomoOperator`/`guessOperator`; no `^0?9[5-7]` / `^0?7[5-7]` prefix table; no client-assigned `operator` on a payment surface and no `operator` field in the request type; **and** the supported-network legend is still there (telling a student which networks work is information — deciding which network their number is was the bug) |
| Quote is the money source (R12.1, R12.6) | both student payment surfaces read `useFeeQuote`; the quote is fetched through `@/services/payments` with no `fetch(`; `PaymentForm` takes amount **strings** and no numeric `amount` prop; each of the five quote codes has copy *and* a decided recovery |

Scan hygiene, because a scan that over-matches gets deleted by the next person:
comment/JSDoc lines are skipped (a rule must not fail on prose describing the fix),
string literals are blanked for the identifier-arithmetic and bare-factor rules (so
`data-testid="fee-quote-error"` is not read as `fee - quote`, and a CSS `${i * 0.08}s`
animation delay is not read as a fee), `\*(?!\/)` so a JSX `{/* Application fee */}`
comment terminator is not a multiplication, and `src/generated/` is excluded because it
is emitted from the backend OpenAPI schema — it *declares* the server's own `operator`
field, and a type declaration cannot compute money.

**The scan was mutation-proven, not just run.** Re-introducing the finding in a scratch
`src/lib/__scanMutationProbe.ts` (a `TRANSACTION_FEE_RATE = 0.01`, an
`amount * (1 + TRANSACTION_FEE_RATE)`, and a `/^0?96/` operator detector) fails exactly
three rules; deleting the probe returns all 18 to green —
[`raw/frontend-source-scan-mutation-probe.txt`](raw/frontend-source-scan-mutation-probe.txt).

### 3.6 Files changed

| File | Change |
|---|---|
| `src/services/payments.ts` | + `FeeQuote` wire type, `createFeeQuote`, `readFeeQuote` |
| `src/hooks/useFeeQuote.ts` | consumes the service; error now carries `recovery` + `recoveryLabel` |
| `src/lib/paymentNextActions.ts` | + `PAYMENT_CODE_RECOVERY` (total map) + `recoveryActionForStableCode` |
| `src/components/student/FeeQuoteRefusal.tsx` | **new** — the one refusal block both surfaces use |
| `src/pages/student/applicationWizard/steps/PaymentStep.tsx` | uses `FeeQuoteRefusal`; expired/expiry notices read the canonical copy; explicit `fee-quote-unavailable` no-price state |
| `src/pages/student/Payment.tsx` | uses `FeeQuoteRefusal`; `formatCurrency` (toFixed + local symbol map) deleted |
| `src/components/student/applicationStatus/PaymentStatusBlock.tsx` | `K`-for-every-currency deleted; + `paymentCurrency` prop |
| `src/pages/student/ApplicationStatus.tsx` | threads `payment_currency` |
| `src/pages/student/applicationWizard/steps/AssignedSchoolStep.tsx` | `toLocaleString` re-quantisation deleted |
| `src/types/database.ts` | + `payment_currency` (already on the wire) |
| `tests/unit/feeProviderSourceScan.test.ts` | **new** — the 18-rule scan |
| `tests/unit/feeQuoteAuthority.test.tsx` | + 8 tests: recovery mapping + `FeeQuoteRefusal` behaviour |
| `tests/unit/paymentErrorCodesCoverage.test.ts` | + 3 tests: recovery-map coverage, no stale keys, accessor agreement |
| `tests/property/admissionsFlowPreservation.property.test.ts` | known-test-id set extended (§4.2) |
| `tests/unit/page-verification/payment-page.test.tsx` | ledger fixture corrected to the real DRF wire shape (§4.2) |

## 4. Verification (verbatim)

### 4.1 `cd apps/admissions && bun run test`

```
 FAIL  tests/unit/authPageFormMarkup.test.tsx > auth page form markup > uses honest helper copy instead of fake email availability states
 Test Files  1 failed | 456 passed | 1 skipped (458)
      Tests  1 failed | 3797 passed | 1 skipped (3799)
   Duration  113.53s (transform 58.87s, setup 13.37s, import 283.21s, tests 317.41s, environment 558.70s)
```

Per-file payment/fee/quote lines: [`raw/frontend-test.txt`](raw/frontend-test.txt).

**Baseline for comparison.** The same command was run *before* any change in this slice
(recorded in-session, not persisted to `raw/`):

```
 FAIL  tests/unit/authPageFormMarkup.test.tsx > auth page form markup > uses honest helper copy instead of fake email availability states
 Test Files  1 failed | 455 passed | 1 skipped (457)
      Tests  1 failed | 3768 passed | 1 skipped (3770)
```

So: **the same single failure before and after**, +1 file and +29 tests, all passing
(18 scan + 8 quote-recovery/refusal + 3 recovery-map coverage).

`authPageFormMarkup` is the pre-existing in-flight failure catalogued by slice 1. It is a
sign-up-page copy assertion (`We'll verify this address.`) with no payment, fee, quote,
or provider surface in it.

### 4.2 Failures I introduced, and their triage

My source changes broke **two** tests, both found before the final run and both resolved
test-side, deliberately. The first was caught by a targeted run of the payment/fee suites;
the second by the first full run, which therefore shows `2 failed` — the pre-existing one
plus this one ([`raw/frontend-test-first-run.txt`](raw/frontend-test-first-run.txt)):

1. `admissionsFlowPreservation.property.test.ts` → "no bypass mechanism visible in
   production mode": `expected [ 'payment-step', …(9) ] to include 'fee-quote-unavailable'`.
   The property asserts *found test-ids ⊆ known test-ids* — its invariant is that no
   **bypass** affordance renders unconditionally. I added the `fee-quote-unavailable`
   no-price state, which is instrumentation, not a bypass. **Triage: the test's allowed
   set needed the new id** (the same call the prior session made for the other
   `fee-quote-*` ids). The two bypass assertions in that property are untouched and still
   pass.
2. `page-verification/payment-page.test.tsx` → "displays payment record amounts and
   statuses" (found in the targeted run, so it is already green in the first full-run
   artifact): `expected … to contain 'K153.00'`, received `K153`. The fixture supplied
   `amount: 153` — a JS **number**. DRF serialises `Payment.amount` (a `DecimalField`,
   `COERCE_DECIMAL_TO_STRING` unset ⇒ default `True`) as the string `"153.00"`. The old
   client hid the fixture's inaccuracy by re-quantising with `toFixed(2)`; with the
   re-quantisation deleted, the fixture's own wrongness surfaced. **Triage: the fixture
   was unfaithful to the wire** — corrected to `'153.00'`, assertion kept as `K153.00`.
   The page-verification suite's whole premise is "actual Django response shapes", so
   this makes it more faithful, not less strict.

No implementation code was changed to make a test pass.

### 4.3 `cd apps/admissions && bun run lint`

```
✖ 22 problems (22 errors, 0 warnings)
  6 errors and 0 warnings potentially fixable with the `--fix` option.
error: script "lint" exited with code 1
```

Full output: [`raw/frontend-lint.txt`](raw/frontend-lint.txt). **22 — byte-identical in
count to the pre-existing set slice 1 catalogued, and none of them are mine.** All 22 sit
in 19 files that are either on the documented pending-migration allowlist in
`architectureEnforcement.test.ts` (`no-restricted-imports` on `@/services/client`:
`PaymentStep.tsx`, `Payment.tsx`, `ApplicationStatus.tsx`, `PaymentCallback.tsx`, the
wizard hooks, `UserImport.tsx`, `AISummaryPanel.tsx`, `ApplicationDetailModal.tsx`, the
dev preview hooks, the public tracker hook) or are unused `eslint-disable` directives in
`tests/harness-e2e/*`. Every file I created or added imports to is clean:
`FeeQuoteRefusal.tsx`, `useFeeQuote.ts`, `serverAmount.ts`, `paymentNextActions.ts`,
`services/payments.ts`, `feeProviderSourceScan.test.ts`.

Direction of travel: `useFeeQuote.ts` no longer imports the raw client at all (§3.1), so
this slice moved one hook off the transport without adding a new allowlist entry.
`PaymentStep.tsx` / `Payment.tsx` still import `apiClient` for `/payments/defer/`,
`/payments/dev-bypass/`, and the `/payments/` history list — those are task 8.2/8.3
migrations, not 8.1.

### 4.4 `cd apps/admissions && bun run build`

```
✓ 3606 modules transformed.
✓ built in 52.36s
✓ finalise-html: preload hint for LandingPage (assets/js/LandingPage-DtMNVutb.js)
✓ finalise-html: critters inlined critical CSS (HTML 11508 → 21120 bytes)
check-html-csp: scanned /home/cosmas/Downloads/mihasv3/apps/admissions/dist/index.html
  CSP script-src 'unsafe-inline': NO
  CSP style-src 'unsafe-inline':  YES
  inline <style> total bytes:     15038
  main <link rel=stylesheet>:     present
✓ check-html-csp: HTML is compatible with the production CSP.
```

Exit 0. The script is `tsc -p tsconfig.build.json --noEmit && vite build && check-html-csp`,
so this is also the type-check gate — the new `FeeQuote` type, the `paymentCurrency` prop,
and the total `PAYMENT_CODE_RECOVERY` record all type-check.
Full output: [`raw/frontend-build.txt`](raw/frontend-build.txt).

### 4.5 Source scan

```
 ✓ tests/unit/feeProviderSourceScan.test.ts (18 tests)
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

[`raw/frontend-fee-provider-source-scan.txt`](raw/frontend-fee-provider-source-scan.txt)
(per-rule), [`raw/frontend-source-scan-mutation-probe.txt`](raw/frontend-source-scan-mutation-probe.txt)
(the guard failing on a reintroduced finding, then green again).

## 5. Constraint compliance

| Constraint | How it holds |
|---|---|
| Server is the sole money authority; the frontend computes/defaults/guesses nothing | Every amount rendered is a server string; `formatServerAmount` only prefixes a currency marker; the 18-rule scan is the standing enforcement, mutation-proven |
| `useFeeResolver`/React Query patterns; app-local service modules, not raw `fetch` | Quote transport lives in `src/services/payments.ts`; the hook mirrors the retired `useFeeResolver` shape; `Payment.tsx` keeps its React Query wiring; the scan asserts no `fetch(` in the hook |
| Mobile-money-first UX, card fallback, defer preserved | Untouched ordering and affordances; `paymentStepLegacyPath.test.tsx` (3), `paymentStepMobileMoneyFirstPhase4.test.tsx` (1), `paymentFormButtonDisable.test.tsx` (4), `paymentStep.test.ts` (pay-later button present) all green |
| No retired pre-Lenco payment UX | Nothing reintroduced; no proof-of-payment upload, no hardcoded till numbers (`src/config/payments.ts` stays deleted, asserted) |
| `VITE_PAYMENT_HARDENING_UI` gating convention respected | The flag still gates only the Phase-4 recovery-store branch in `PaymentStep`; the fee quote is **not** flag-gated, because a correct price is not an opt-in. `paymentStepLegacyMode.test.tsx` (flag off) stays green |
| Stable-code drift guard green | `paymentErrorCodes.test.ts` (7) + `paymentErrorCodesCoverage.test.ts` (9, +3 mine) + `paymentErrorCodes.property.test.ts` (4) all pass; the backend mirror fixture and wording snapshot were already updated for the quote codes |
| Accessibility: focus/`aria-live`, ≥44 px, colour never alone | `FeeQuoteRefusal` is `role="alert"`; the expired/expiry notices are `role="status"`; every quote affordance is `min-h-touch`; the destructive-coloured message is always accompanied by text (never colour alone); `paymentStepAccessibilityPhase4.test.tsx` (3) and `application-wizard-accessibility.test.tsx` green |
| Design rules (`DESIGN.md`, design §13.3) | No new card nesting (the refusal renders inside the existing panel/border), no gradients or glass, Lucide-only icons, canonical `SectionCard`/`PageShell` untouched |
| No PII in logs; no raw phone persisted | No logging added; the MSISDN path is unchanged and still sends the phone only in the outbound initiation request |

## 6. What this slice does not claim

- **Task 8.2** (one payment state machine, retiring the duplicate legacy path and the
  default-off flag) and **task 8.3** (the full payment-page recovery/history ownership
  split, removing indefinite disabled controls and stale support copy) remain `[~]`.
  `readFeeQuote` is exported ready for 8.3's recovery journey but is not yet wired.
- **Task 8.4** (server-scoped fee administration/settlement) still owns
  `admin/ProgramFees.tsx` `formatFeeAmount` and the admin amount columns.
- Browser (Playwright) journeys for the payment recovery matrix are R12.7 / task 8.3
  evidence, not this slice's.
- The two remaining `@/services/client` imports on the student payment surfaces are
  8.2/8.3 migrations.
