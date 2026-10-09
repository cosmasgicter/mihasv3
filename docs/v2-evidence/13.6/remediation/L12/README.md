# Task 13.6 remediation — L12

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · remediation item **L12** of
[`docs/v2-evidence/13.6/README.md`](../../README.md) §8.1

Requirements: **R14.3** — pages and components consume domain service modules, not the raw
transport; **R14.5** — a legacy allowance shrinks and exposes its exit criteria;
**R14.7, R15.6** — a registered exception carries an owner and a removal date;
**R18.5** — an evidence artifact is a run record, not a claim

Closes: clause **(iii)** of the 13.6 gate, on its lint limb only

---

## THE VERDICT: L12 CLOSED — 15 → 0, all fifteen fixed in code, none suppressed

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  bun run lint      15 errors / 13 files   →   **0 errors, EXIT=0**        │
  │                                                                          │
  │  cause A  9 errors / 9 files  no-restricted-imports on the raw transport  │
  │                               (R14.3)  →  moved onto 5 domain services    │
  │  cause B  6 errors / 5 files  stale eslint-disable directives             │
  │             B1  3  no-restricted-imports  — a flat-config override        │
  │             B2  2  no-explicit-any        — rule never enabled            │
  │             B3  1  no-constant-condition  — rule never enabled            │
  │                                                                          │
  │  code fixes         **15 of 15**                                          │
  │  config decisions   **0**  — eslint.config.js unchanged by L12             │
  │  eslint-disable directives added  **0**  (3 at HEAD  →  0 now)            │
  │                                                                          │
  │  LEGACY_EXCEPTIONS register   9 entries  →  **0**, owner + window kept     │
  │                                                                          │
  │  type-check   EXIT=0            (held)                                    │
  │  build        clean, EXIT=0     (held)                                    │
  │  test         1 failed / **4619** passed / 1 skipped over 495 files        │
  │               was 1 / 4618 / 1 over 495  →  **+1 passed, failures held**   │
  │               the 1 failure is authPageFormMarkup.test.tsx — pre-existing, │
  │               another lane's, untouched                                    │
  │                                                                          │
  │  REGRESSION FOUND AND REPAIRED IN THIS BATCH:                             │
  │    the first suite run was **2 failed / 4618 passed**. L12's own move      │
  │    broke tests/unit/useDocumentGeneration.test.tsx. §5 — the run that      │
  │    caught it is kept as raw/04.                                           │
  │                                                                          │
  │  validate:tailwind  **EXIT=127** — reported, not chased. §6.3              │
  │                                                                          │
  │  NOT closed:  clause (iii)'s other limbs (36 failing tests, 128 whole-tree │
  │               failures) and clauses (i), (ii), (iv), (v). L7, L8 and the   │
  │               operator items O1–O10 belong to other batches.               │
  └──────────────────────────────────────────────────────────────────────────┘
```

| | before | after (this batch) |
|---|---|---|
| `bun run lint` | **15 errors / 13 files** — [`../L9-L11/raw/14`](../L9-L11/raw/14-frontend-lint.txt), first recorded [`../L5-L6/raw/12`](../L5-L6/raw/12-frontend-lint.txt) | **0 errors, EXIT=0** — [`raw/01`](raw/01-frontend-lint-after.txt) |
| files importing the raw transport from `src/pages` / `src/components` | **9** | **0** — [`raw/06`](raw/06-per-error-before-after.txt) |
| `eslint-disable` directives in `apps/admissions/{src,tests}` | **3** tracked + 3 uncommitted = 6 reported unused | **0** — [`raw/06`](raw/06-per-error-before-after.txt) |
| `LEGACY_EXCEPTIONS` (`architectureEnforcement.test.ts`) | **9** entries | **0**, owner and window retained and asserted — [`raw/07`](raw/07-l12-seam-suites.txt), [`raw/08`](raw/08-drift-guard-invariant.txt) |
| `bun run test` | 1 failed / 4618 passed / 1 skipped / 495 files | **1 failed / 4619 passed / 1 skipped / 495 files** — [`raw/05`](raw/05-frontend-whole-suite-after.txt) |
| `bun run type-check` | exit 0 | **EXIT=0** — [`raw/02`](raw/02-frontend-type-check.txt) |
| `bun run build` | clean | **clean, EXIT=0** — [`raw/03`](raw/03-frontend-build.txt) |

```
docs/v2-evidence/13.6/remediation/L12/
├── README.md                                     <- this document
└── raw/
    ├── 01-frontend-lint-after.txt                <- the gate: 0 errors, EXIT=0
    ├── 02-frontend-type-check.txt                <- EXIT=0
    ├── 03-frontend-build.txt                     <- vite build + check-html-csp, EXIT=0
    ├── 04-frontend-whole-suite-before-test-repair.txt
    │                                             <- the run that CAUGHT L12's own regression
    │                                                (2 failed / 4618 passed). Kept on purpose — §5
    ├── 05-frontend-whole-suite-after.txt         <- 1 failed / 4619 passed / 1 skipped / 495 files
    ├── 06-per-error-before-after.txt             <- all 15 sites, HEAD line vs now, + suppression
    │                                                census + the rule-intact diff
    ├── 07-l12-seam-suites.txt                    <- the 6 suites that assert on what L12 moved
    ├── 08-drift-guard-invariant.txt              <- the backend guard that reads this file's
    │                                                constant still has its subject
    ├── 09-validate-tailwind-127.txt              <- exit 127, and why it is not a lint failure
    ├── 10-git-state.txt                          <- nothing committed, nothing staged by L12
    ├── 11-stale-directive-causes.txt             <- eslint --print-config per site: why each of
    │                                                the 6 directives went stale
    ├── l12-per-error-probe.sh                    <- re-runnable, raw/06's instrument
    ├── l12-config-cause-probe.sh                 <- re-runnable, raw/11's instrument
    ├── l12_effective_config.py                   <- the print-config reader raw/11 pipes into
    └── l12-drift-guard-probe.py                  <- re-runnable, raw/08's instrument
```

---

## 1. The 15, one row each

Baseline citations are `file:line` **as the baseline recorded them**
([`../L9-L11/raw/14-frontend-lint.txt`](../L9-L11/raw/14-frontend-lint.txt)); "now reads"
citations are `file:line` in the tree this batch leaves behind. Grouped by cause, as
§8.1's item asks, not by file — which is why one file appears twice and one appears in
both clusters.

### Cause A — nine real R14.3 violations: a page reaching past the service boundary

Rule: `no-restricted-imports`, the R14.3 block of `eslint.config.js:150-168`. It forbids
`src/pages/**` and `src/components/**` from importing `@/services/client` and six other
transport-internal modules. Nine files did. **These were not false positives** — the
effective config at each site carries `@/services/client`, measured in
[`raw/11`](raw/11-stale-directive-causes.txt).

| # | baseline site | what it imported | cause | what changed | now reads |
|---|---|---|---|---|---|
| 1 | `pages/dev/hooks/useDocumentGeneration.ts:20` | `apiClient` | a dev preview hook carried its **own** payment-list unwrap and receipt fetch | both transports moved to the payments service; the hook's two private narrower row/receipt types became aliases of the service's | `useDocumentGeneration.ts:25` → `listPayments` (`payments.ts:222`), `readPaymentReceipt` (`payments.ts:325`) |
| 2 | `pages/dev/hooks/usePaymentReceipt.ts:10` | `apiClient` | **the same two endpoints again** — a second private copy in a sibling hook | deleted; both hooks call the one reader | `usePaymentReceipt.ts:10` → the same two |
| 3 | `pages/student/PaymentCallback.tsx:4` | `apiClient` | the return-from-provider page issued `POST /payments/{id}/verify/` itself, twice in one file | uses the payments service's existing `verifyPayment` — nothing new was written for this one | `PaymentCallback.tsx:4` → `verifyPayment` (`payments.ts:140`) |
| 4 | `…/hooks/useApplicationFileUploads.ts:8` | `apiClient` | a retry-once `GET /auth/session/` probe — a transport concern — lived in a wizard hook | the probe moved **whole** to a new service module: same two calls, same 1 s delay, same message | `useApplicationFileUploads.ts:6` → `verifySessionWithRetry` (`sessionProbe.ts:74`), `isAuthError` (`:48`), `delay` (`:62`) |
| 5 | `…/hooks/useSmartAutoSave.ts:4` | `AuthenticationError` | the error class was **defined in transport**, so a page that wanted to *handle* a dead session had no way to name it | class moved to a new `services/errors.ts`; `authInterceptor.ts:30` and `client.ts:32` re-export it, so there is still exactly one definition and every `instanceof` holds | `useSmartAutoSave.ts:4` → `AuthenticationError` (`errors.ts:42`) |
| 6 | `…/hooks/useWizardController.ts:18` | `apiClient` | **two** call sites in one file: the OCR retry (`POST /documents/{id}/extract/` with `{force:true}`) and an institutions read | `documentService.extract` gained the one flag the endpoint already accepted, sent only when asked; the institutions read went to the catalogue service | `useWizardController.ts:18` → `documentService.extract` (`documents.ts:33`), used at `:631` and `:857`; the institutions read now at `wizard/useWizardSubmission.ts:172` → `institutionService.list` (`catalog.ts:713`) |
| 7 | `…/hooks/wizard/useWizardFileUploads.ts:6` | `apiClient` | a private document-list read **plus** a third `extract` call | `documentService.listByApplication` absorbed the second response branch the wizard needed | `useWizardFileUploads.ts:6` → `listByApplication` (`documents.ts:97`) at `:88`, `extract` at `:97` |
| 8 | `…/hooks/wizard/wizardControllerUtils.ts:4` | `AuthenticationError` | same cause as #5 | same fix, same one definition | `wizardControllerUtils.ts:4` → `errors.ts:42` |
| 9 | `…/steps/PaymentStep.tsx:8` | `apiClient` | a wizard **step component** issuing `POST /payments/defer/` and `POST /payments/dev-bypass/` | both moved to the payments service, same endpoints, same bodies | `PaymentStep.tsx:8` → `deferPayment` (`payments.ts:280`), `devBypassPayment` (`payments.ts:295`) |

**Nine errors, five destinations, and one thing worth naming: three of the nine were the
same read twice.** #1 and #2 both fetched `GET /payments/?application_id=…` and
`GET /payments/{id}/receipt/` with their own unwrapping; #6 and #7 both fired
`POST /documents/{id}/extract/`. The rule was not only pointing at a layering
violation — it was pointing at duplication that the layering violation made easy.

### Cause B — six stale `eslint-disable` directives, three sub-causes

Every one of these was written when it did something. What each measures is in
[`raw/11`](raw/11-stale-directive-causes.txt), read from `eslint --print-config` at the
site — the resolved config is the only thing `--report-unused-disable-directives` compares
a directive against.

| # | baseline site | directive | cause | what changed |
|---|---|---|---|---|
| 10 | `…/hooks/useWizardController.ts:14` | `no-restricted-imports` for `@/lib/eligibilityEngine` | **B1.** Flat config *replaces* a rule's options rather than merging them. The R14.3 block comes **after** the `migratedModuleFiles` block and also matches `src/pages/**`, so for this file the effective `no-restricted-imports` carries the seven transport patterns and **not** the `eligibilityEngine` pattern this directive named | directive deleted, the `eligibilityEngine` import **kept** (`:14`) |
| 11 | `…/steps/EducationStep.tsx:13` | same | same as B1 | directive deleted, the type import **kept** (`:13`) |
| 12 | `…/steps/SubmitStep.tsx:36` | same | same as B1 | directive deleted, the type import **kept** (`:36`) |
| 13 | `tests/harness-e2e/harness-fixtures.ts:161` | `@typescript-eslint/no-explicit-any` | **B2.** That rule is **not enabled anywhere in this config** — `--print-config` reports it off, and the string does not appear in `eslint.config.js`. A disable for a rule that is off is unused at every line of every file | directive deleted, the `(test as any).skip = forbid(…)` cast **kept** (`:161`) |
| 14 | `tests/harness-e2e/harness-fixtures.ts:163` | same | same as B2 | directive deleted, `(test as any).fixme = forbid(…)` **kept** (`:162`) |
| 15 | `tests/harness-e2e/helpers/ops.ts:320` | `no-constant-condition` | **B3.** Also not enabled in this config. And even if it were, the rule's own default `checkLoops: "allExceptWhileTrue"` permits `while (true)` — so the directive was unnecessary under both readings | directive deleted, the `while (true)` poll loop **kept** (`:320`) |

**The B1 claim is measured, with a control.** For
`hooks/useWizardController.ts` and `steps/EducationStep.tsx`, `--print-config` reports one
pattern group (the transport seven) and `'@/lib/eligibilityEngine' in the effective
patterns? **False**`. For `src/hooks/queries/useApplicationQueries.ts` — same
`migratedModuleFiles` glob, *not* under `src/pages`, so no R14.3 override — it reports two
groups and `eligibilityEngine … **True**`. Same rule, same register, opposite answer,
decided purely by whether a later block matched the path
([`raw/11`](raw/11-stale-directive-causes.txt)).

That matters for attribution: **B1's three directives were not wrong when written.** They
went stale the moment the R14.3 block landed — which is uncommitted spec work, so those
three errors are the spec's own layering change reporting a side effect on itself, and
`--report-unused-disable-directives` is the flag that noticed.

### 1.1 The 15 → 0 arithmetic

| cause | errors | files | code fix | config decision |
|---|---:|---:|---|---|
| A — R14.3 transport imports | 9 | 9 | 9 | 0 |
| B1 — stale, shadowed by a later config block | 3 | 3 | 3 | 0 |
| B2 — stale, rule never enabled | 2 | 1 | 2 | 0 |
| B3 — stale, rule never enabled | 1 | 1 | 1 | 0 |
| **total** | **15** | **13** | **15** | **0** |

13 files, not 15, because `useWizardController.ts` carried one of each cluster and
`harness-fixtures.ts` carried two of B2.

---

## 2. No config decision was taken, and the rule was not weakened

**`apps/admissions/eslint.config.js` was not edited by L12.** The full worktree diff for
that file is in [`raw/06`](raw/06-per-error-before-after.txt) and is **additions only** —
the R14.3 block, uncommitted spec work that predates this batch. Every one of its seven
patterns and its message survive verbatim. No `-` line touches a rule, an option, a
severity or a `files` glob.

So the per-error table's "config decision" column is empty, and this section exists to say
so explicitly rather than by omission: **there was no rule L12 judged should not apply.**
The R14.3 rule is right about all nine files, and the three shadowed B1 directives are not
an argument for changing the rule — they are an argument for deleting three comments,
which is what happened.

Two things were deliberately **not** done, either of which would have reached zero faster:

1. **No `eslint-disable` was added.** The census in
   [`raw/06`](raw/06-per-error-before-after.txt) is exact: **3** directives at `HEAD` in
   `apps/admissions/{src,tests}`, **0** now. The single remaining grep hit is prose inside
   a comment in `architectureEnforcement.test.ts:101` describing this history; it has no
   `-line`/`-next-line` form, ESLint does not read it as a directive, and
   `--report-unused-disable-directives` would have flagged it if it did.
2. **No `--report-unused-disable-directives` was removed from the gate.** Dropping that
   flag from `package.json:17` would have erased six of the fifteen without changing a
   line of code. The flag is still there — quoted at the end of
   [`raw/11`](raw/11-stale-directive-causes.txt).

---

## 3. The `LEGACY_EXCEPTIONS` register went to zero, and stayed a register

`apps/admissions/tests/unit/architectureEnforcement.test.ts` is the grep twin of the R14.3
ESLint rule, with a documented allowlist. Its nine entries were **exactly** cause A's nine
files. Its own second test says *"a migrated file MUST be removed from the allowlist"*, so
migrating all nine forced the register to empty.

An empty allowlist makes the three existing tests vacuous, and two things could then be
lost quietly. Both are now asserted directly by a **fourth** test, `'the register keeps its
owner and its window even while it is empty'`:

| at risk | why it matters | how it is held |
|---|---|---|
| `LEGACY_EXCEPTION_REMOVE_BY = '2027-02-07'` | a **backend** guard reads this constant out of this file's *source* to stop one announced window drifting across three languages. Deleting it as "unused" would silently remove that guard's subject | asserted to match `/^\d{4}-\d{2}-\d{2}$/`; verified against the canonical register in [`raw/08`](raw/08-drift-guard-invariant.txt) |
| `LEGACY_EXCEPTION_OWNER = 'platform-admissions'` | the next entry needs a default owner and window to inherit. An entry added without them is the exact defect item **L10** was filed to fix (GATE-13.6-01) | asserted non-empty |

[`raw/08`](raw/08-drift-guard-invariant.txt): the canonical
`COMPATIBILITY_SURFACES['catalog.legacy_institution_write'].end_date` is **2027-02-07**
(`ANNOUNCED_ON 2026-08-11` + 180 days), both frontend registers spell **2027-02-07**, the
owner constant survives, and live `LEGACY_EXCEPTIONS` entries are **0**. `RESULT: PASS`.

**Why that guard was checked by a probe and not by pytest.** The guard lives in
`backend/tests/unit/test_compatibility_surfaces_12_2.py`, and
`backend/tests/conftest.py` needs a Postgres connection this task is not permitted to open
— L12 is frontend-only and forbidden from touching any database. `compatibility_register.py`
imports nothing but stdlib, so `raw/l12-drift-guard-probe.py` loads it standalone and
evaluates the same two reads the guard makes. **What is claimed is the invariant, not a
pytest run.** §7 item 6.

---

## 4. What L12 did *not* fold into a service, and why

Three of the nine files' fixes needed a new home. The choices are recorded because each
had a cheaper wrong answer.

| decision | the cheaper wrong answer | why it was refused |
|---|---|---|
| `AuthenticationError` **defined** in a new `services/errors.ts`, re-exported by `authInterceptor.ts:30` and `client.ts:32` | re-export it from `services/applications.ts` so the grep passes | `architectureEnforcement.test.ts` already warned, in prose about `ApplicationStatus.tsx`, that *"inventing a re-export to satisfy a grep would be worse than saying so here"*. A re-export leaves the class defined in transport and adds a second path to it. Defining it once, outside transport, is the cause fix: **an error thrown across the service boundary is part of that layer's contract, not an internal of its transport** |
| the session probe as its own `services/sessionProbe.ts` | call the existing `authService.session()` | `authService.session()` swallows every failure and returns `null` — correct for bootstrap, useless here. This caller must tell *"expired, stop"* from *"the network blinked, carry on"*, because it runs immediately before a file upload and a wrong answer either loses the file or blocks a working upload. It keeps its own error discrimination |
| `documentService.extract({force})` — one optional flag | a second `extractForce` method | the endpoint already accepted `{force:true}`; a second method would be a second path to one endpoint. The flag is sent **only when asked for**, so an ordinary first extraction's request is byte-for-byte what it was |

**One behaviour changed, and it is not a relocation.** The institutions matcher that moved
to `wizard/useWizardSubmission.ts:172` also compared `inst.slug`.
`InstitutionSerializer` (`backend/apps/catalog/serializers.py:13-24`) serves
`id, name, code, full_name, type, address, phone, email, website,
accreditation_status, is_active, description, created_at, updated_at` — **there is no
`slug`**, so that comparison could never match. `code` is the field that short identifier
actually exists in and takes its place; `id` and `name` are unchanged, and `name` is the
one that resolves the display snapshot the call is looking up. Recorded as a change, not
smuggled in as a move.

---

## 5. L12 broke a test, the gate caught it, and the repair kept every assertion

This is the part a "15 → 0" headline would hide.

The **first** whole-suite run after the transport moves was **2 failed / 4618 passed**
([`raw/04`](raw/04-frontend-whole-suite-before-test-repair.txt)). The second failure was
L12's own:

```
FAIL tests/unit/useDocumentGeneration.test.tsx
  > validates and generates receipt data from the backend receipt endpoint when available
AssertionError: expected 1st "vi.fn()" call to have been called with
  [ '/payments/?application_id=3' ], but called only 0 times
```

**The mechanism, not the symptom.** That test stubbed `@/services/client` with a factory
returning `{ apiClient }` only. Once the receipt path went through
`services/payments.ts` — which imports `{ apiClient, buildQueryString }` from that same
module — `buildQueryString` resolved to `undefined`, `listPayments` threw a `TypeError`,
and the hook's own `fetchSuccessfulPayment` `catch` turned a broken mock into a silent
*"no payment found"* fallback. So the test failed on an assertion about call **count**,
several steps downstream of the actual break. A hook that degrades gracefully will also
degrade quietly.

**The repair, and what it did not do.** `tests/unit/useDocumentGeneration.test.tsx:47-72`
now exports the **real** `buildQueryString`, imported inside the mock factory from
`@/services/apiHelpers` — the module that defines it, which has **zero imports**, so
nothing transport-shaped is dragged into the test.

- **No assertion was deleted, relaxed, or re-pointed at a weaker fact.** Both endpoint
  assertions still read `'/payments/?application_id=3'` and
  `'/payments/pay-abcdef12/receipt/'`, still `toHaveBeenNthCalledWith` in that order, and
  the `generatePaymentReceipt` payload assertion (`receiptNumber: 'PAY-ABCD'`, `amount:
  150`, `paymentReference: 'TX-123'`) is untouched.
- The query string is still built by the code that builds it in production, so the pinned
  endpoint is not a hand-written literal agreeing with another hand-written literal.
- The assertions are now **strictly stronger**: they prove the same two endpoints are
  reached *and* that they are reached through the payments domain service the R14.3 rule
  requires.

All 6 cases in that file pass ([`raw/07`](raw/07-l12-seam-suites.txt)), and the whole
suite returned to one failure ([`raw/05`](raw/05-frontend-whole-suite-after.txt)).

`raw/04` is kept deliberately. The regression is evidence that the gate was run before the
verdict was written, rather than after it was decided.

---

## 6. Verification

### 6.1 The four required gates

| gate | baseline | this batch | raw |
|---|---|---|---|
| `bun run lint` | **15 errors / 13 files** ([`../L9-L11/raw/14`](../L9-L11/raw/14-frontend-lint.txt)) | **0 errors, 0 warnings, EXIT=0** | [`01`](raw/01-frontend-lint-after.txt) |
| `bun run test` | 1 failed / 4618 passed / 1 skipped, 495 files ([`../L9-L11/raw/17`](../L9-L11/raw/17-frontend-whole-suite-after.txt)) | **1 failed / 4619 passed / 1 skipped, 495 files** in 125.97 s | [`05`](raw/05-frontend-whole-suite-after.txt) |
| `bun run type-check` | exit 0 ([`../L9-L11/raw/13`](../L9-L11/raw/13-frontend-type-check.txt)) | **EXIT=0** | [`02`](raw/02-frontend-type-check.txt) |
| `bun run build` | clean ([`../L5-L6/raw/02`](../L5-L6/raw/02-frontend-build.txt)) | **EXIT=0**, `✓ built in 28.98s`, `✓ check-html-csp: HTML is compatible with the production CSP`, `CSP script-src 'unsafe-inline': NO` | [`03`](raw/03-frontend-build.txt) |

**All four gates were run twice**, because the test repair in §5 landed *after* the first
pass and it edits a file under `tests/` — which `bun run lint` covers. `raw/01` and
`raw/02` carry both runs; `raw/03` is the re-run; `raw/05` is already the post-repair run.
Every number quoted above is from the **final** tree.

**On the test delta.** Total cases went **4620 → 4621**: L12 added exactly one, the fourth
`architectureEnforcement` test in §3. Passes went **4618 → 4619** and failures held at
**1**. The one failure is `tests/unit/authPageFormMarkup.test.tsx > uses honest helper copy
instead of fake email availability states` — the same pre-existing failure L5-L6 and L9-L11
both recorded, another lane's, and L12 did not open that file or the page it asserts on.

**On the four `error`-matching lines inside the build output.** Three are chunk filenames
(`apiErrorLogger-…`, `FormErrorAnnouncer-…`, `errorReporter-…`). The fourth is Rollup's
pre-existing `(!)` advisory that `src/lib/logger.ts` is both statically and dynamically
imported. Neither is a build failure, and neither is new. (`raw/03` greps to six, not four:
this document's own header note in that file says the word twice.)

### 6.2 The seams L12 moved

`bun x vitest run` over the six suites that assert on what moved: **20 passed / 6 files**
([`raw/07`](raw/07-l12-seam-suites.txt)).

| suite | what it holds | result |
|---|---|---|
| `unit/architectureEnforcement.test.ts` | the grep twin of the R14.3 rule; allowlist empty; owner + window retained | **4 passed** |
| `unit/documentFlowDriftGuard.test.ts` | the other dated frontend register, unmodified by L12 | **6 passed** |
| `unit/useDocumentGeneration.test.tsx` | the dev receipt path — §5 | **6 passed** |
| `unit/usePaymentStatus.test.ts` | the payments-service list reader L12 extended | **1 passed** |
| `property/fileUploadRetryOnAuthError.property.test.ts` | the probe's retry-once behaviour, now in `sessionProbe` | **2 passed** |
| `property/fileUploadProceedOnNetworkError.property.test.ts` | the probe's "network blink ⇒ proceed" behaviour | **1 passed** |

The two property suites matter most: they are the reason the probe's move can be called a
relocation. They import the wizard hook, which re-exports the three moved symbols, and they
pass unchanged.

### 6.3 `bun run validate:tailwind` — EXIT 127, reported and not chased

```
$ ./scripts/validate-tailwind-classes.sh
/usr/bin/bash: line 1: ./scripts/validate-tailwind-classes.sh: No such file or directory
error: script "validate:tailwind" exited with code 127
```

`package.json:20` points at a file that **does not exist in the worktree and is not
tracked at `HEAD`** — `git ls-tree HEAD` returns nothing for it, so no revision of this
repository can run it ([`raw/09`](raw/09-validate-tailwind-127.txt)). 127 is a missing
file, not a lint result: it reports nothing about any Tailwind class. It is pre-existing,
L12 changed no Tailwind class and no script, and per §8.1's instruction it is recorded
here and left alone. It belongs to whoever owns `package.json`'s script list.

### 6.4 The harness was not run

No Playwright. Nothing in L12 changes a rendered surface: cause A moves where a request is
issued from, not what is requested, and cause B deletes comments. Where a request payload
*could* have shifted, the assertion is at the endpoint (§5) or in the two property suites
(§6.2).

---

## 7. What is NOT claimed

1. **Clause (iii) is not closed — only its lint limb.** 13.6 §7 records clause (iii) as
   *"86 absent tests closed here, but 36 now fail, 1 error, 128 whole-tree failures, 15
   lint errors"*. **The 15 lint errors are 0.** The 36, the 1 and the 128 are untouched and
   are not L12's.
2. **The gate is still 2 PASS / 3 FAIL.** L12 moves no clause verdict on its own. Clauses
   (i) and (ii) need §8.2, and B1/B2/B3 remain open.
3. **`tasks.md` was not touched.** No checkbox moved — not 13.6's, not any task's.
4. **`.config.kiro` was not touched**; spec status is still `planned`.
5. **`docs/canonical-truth-map.md` and `findings.md` were not touched.** L12 introduces no
   domain concept, no route, no capability, no enum, and files no finding.
   `canonical-truth-map.md` shows as modified in the worktree — that is another lane's
   uncommitted work, present before this batch ([`raw/10`](raw/10-git-state.txt)).
6. **The backend drift guard was not run as a test.** §3 verifies its *invariant* with a
   standalone probe because `backend/tests/conftest.py` requires a Postgres connection.
   What is claimed is that the constant the guard reads survived L12's edit and matches the
   canonical register — **not** a green pytest run.
7. **The backend suite was not run at all.** L12 changed no Python. The comparison at
   [`../L9-L11/raw/18`](../L9-L11/raw/18-backend-whole-tree-after.txt) (94 failed / 5239
   passed / 1 error) is neither re-measured nor claimed to hold.
8. **No production contact.** No SSH, no `.pem` read, no query, no write, no deploy, no
   restart, no migration.
9. **No database of any kind was touched.** Not Neon — no branch created, read, or reset;
   not `v2_snap_13_4` / `v2_fresh_13_4` / `v2_batch_13_4` / `v2_snap_13_6`; not the local
   test Postgres. The frontend suite needs none, and the one backend module read
   (`compatibility_register.py`) is stdlib-only and was loaded as a file.
10. **No other lane's failure was fixed**: not `authPageFormMarkup.test.tsx`, not
    `tenant-launch.spec.ts:139`, not the 14 task-9.2 perf-golden divergences, not
    `ocr-manual-fallback.spec.ts:146`, not `design-system-defluff.spec.ts:664`. None was
    opened.
11. **No test, assertion or guardrail was weakened.** §5 is the one test L12 edited, and it
    kept both endpoint assertions, their order, and the payload assertion. The R14.3 rule,
    the `--report-unused-disable-directives` flag, and the register's owner and window all
    survive (§2, §3).
12. **The nine migrated call sites are not claimed to be behaviour-identical by
    inspection alone** — they are claimed endpoint-identical, and that is what was checked:
    HEAD's `apiClient` call sites were read against the service functions they became
    (§1 cause A, [`raw/06`](raw/06-per-error-before-after.txt)). One deliberate difference
    is stated in §4, and no runtime trace was taken.
13. **`validate:tailwind` was not fixed** (§6.3), and no Tailwind class was validated by
    this batch.
14. **L7 and L8 were left alone**, as were operator items O1–O10.
15. **L12's change set is attributed by evidence, not by `git`.** The whole admissions-v2
    tree is uncommitted (963 worktree entries), so `git status` cannot separate L12 from
    the other lanes. §8.1's list is established per file by comparing the baseline error
    site against `HEAD` ([`raw/06`](raw/06-per-error-before-after.txt)) and by the
    `13.6 remediation L12` marker each touched file carries.
16. **Nothing was committed. Nothing was staged by L12.** The index already carried 9
    staged backend deletions from the de-AI lane before this batch; they were neither
    added nor removed here ([`raw/10`](raw/10-git-state.txt)).

---

## 8. State left behind

### 8.1 Changed files — 22 carry an L12 change, 2 of which L12 created

Counted from the list below and cross-read against
[`raw/10`](raw/10-git-state.txt). "Created by L12" means the file did not exist in any form
before this item: that is **two** files, `errors.ts` and `sessionProbe.ts`. Four others show
as untracked in `git status` (`useWizardSubmission.ts`, `harness-fixtures.ts`, `ops.ts`,
`architectureEnforcement.test.ts`) — those are **other lanes'** uncommitted files that L12
edited, and calling them "new" would take credit for them.

**Cause A — the four domain services that received the transports (4 files, 2 created):**

| file | change |
|---|---|
| `src/services/errors.ts` | **created by L12** — `AuthenticationError` (`:42`) with its `status = 401`. Defined here, not re-exported from here |
| `src/services/sessionProbe.ts` | **created by L12** — `isAuthError` (`:48`), `delay` (`:62`), `verifySessionWithRetry` (`:74`), moved whole out of the wizard hook |
| `src/services/payments.ts` | `deferPayment` (`:280`), `devBypassPayment` (`:295`), `PaymentReceipt` + `readPaymentReceipt` (`:325`); `PaymentRow` declares the two optional `PaymentSerializer` fields the receipt callers read (`:167-173`) |
| `src/services/documents.ts` | `extract` takes the endpoint's existing optional `force` (`:33`); `listByApplication` absorbs the wizard's `{results}` branch (`:97`) |

`src/services/catalog.ts` is **not** in that count: it was *consumed*, not extended —
`institutionService.list` (`:713`) already existed, so the institutions read had a canonical
reader waiting for it. Its worktree diff belongs to another lane.

**Cause A — the transport modules that now re-export one definition (2 files):**

| file | change |
|---|---|
| `src/services/authInterceptor.ts` | `AuthenticationError` re-exported from `./errors` (`:30`) instead of defined here |
| `src/services/client.ts` | imports and re-exports the same one class (`:21`, `:32`); its two internal `throw new AuthenticationError()` sites are unchanged |

**Cause A — the callers: ten files for nine baseline errors, because
`useWizardController.ts` had two call sites and another lane's extraction,
`useWizardSubmission.ts`, ended up holding one of them:**

`pages/dev/hooks/useDocumentGeneration.ts` · `pages/dev/hooks/usePaymentReceipt.ts` ·
`pages/student/PaymentCallback.tsx` ·
`…/applicationWizard/hooks/useApplicationFileUploads.ts` ·
`…/hooks/useSmartAutoSave.ts` · `…/hooks/useWizardController.ts` ·
`…/hooks/wizard/useWizardFileUploads.ts` · `…/hooks/wizard/wizardControllerUtils.ts` ·
`…/hooks/wizard/useWizardSubmission.ts` · `…/steps/PaymentStep.tsx`

**Cause B — six directive deletions across 5 files, four of them not already counted
above:**

`…/hooks/useWizardController.ts` (already counted in cause A) · `…/steps/EducationStep.tsx`
· `…/steps/SubmitStep.tsx` · `tests/harness-e2e/harness-fixtures.ts` (two directives) ·
`tests/harness-e2e/helpers/ops.ts`. In each case the directive went and the code it guarded
stayed ([`raw/06`](raw/06-per-error-before-after.txt)). The last two are the harness lane's
own untracked files; L12 edited them because the errors were in L12's fifteen, not because
it owns the harness.

**Tests (2 files):**

| file | change |
|---|---|
| `tests/unit/architectureEnforcement.test.ts` | `LEGACY_EXCEPTIONS` **9 → 0** with a per-entry account of what each became; **one new test** holding the owner and the window while the register is empty (§3) |
| `tests/unit/useDocumentGeneration.test.tsx` | the `@/services/client` mock exports the **real** `buildQueryString` (`:47-72`). No assertion changed (§5) |

**This batch's own evidence:** this README + 11 raw artifacts + 4 re-runnable instruments.

**Not changed:** `eslint.config.js` (§2), `package.json`, any Tailwind class, any design
token, any schema, migration, SQL script, settings module, CI workflow, or dependency. No
Python.

### 8.2 Untouched

| item | state |
|---|---|
| `tasks.md`, `.config.kiro`, `docs/canonical-truth-map.md`, `findings.md` | **unchanged by L12** — no L12 edit; `canonical-truth-map.md`'s worktree diff is another lane's, pre-existing |
| `apps/admissions/eslint.config.js` | **unchanged** — the gate was not edited to make itself pass (§2) |
| `apps/admissions/package.json` | **unchanged** — `--report-unused-disable-directives` still in the lint script, `validate:tailwind` still broken (§6.3) |
| `docs/v2-evidence/13.6/README.md` and its §8.1 rows | **unchanged** — L12 is not ticked there; that is the next pass's call |
| every other task's `docs/v2-evidence/**` | **read, never written.** `0.4/`, `2.2/`, `11.1`–`11.5/`, `13.3/` untouched. `L7-L8-L12/` is another batch's in-flight directory and was not written into — see §9 on the pointer correction |
| `authPageFormMarkup.test.tsx` and the page it asserts on | **not opened** |
| `tests/unit/documentFlowDriftGuard.test.ts` | **unchanged** — read and run only ([`raw/07`](raw/07-l12-seam-suites.txt)) |
| `backend/**` | **unchanged.** `serializers.py:13-24` and `compatibility_register.py` were read to check two claims (§4, §3) |
| production Postgres / EC2 · Neon, any branch · the four scratch databases · the local test stack | **never contacted** |
| secrets | no DSN, password, token or key appears in this directory |

### 8.3 Git

**Nothing committed. Nothing staged by L12.** Branch `main` at
`bae29a28d9657f288b3339062adb31285959c966` with the V2 tree dirty (963 entries), as the
earlier batches left it ([`raw/10`](raw/10-git-state.txt)). The index still carries the **9
pre-existing staged deletions** from the de-AI work (tasks 7.4 / 12.4) — staged before this
batch, untouched here, because unstaging another lane's index is not L12's call. Every L12
file is unstaged or untracked; `git add` was not run.

---

## 9. For 13.6's next pass

**Closed outright:**

| item | why |
|---|---|
| **L12** — the 15 frontend lint errors in 13 files | §1. `bun run lint` is **0 errors, EXIT=0** ([`raw/01`](raw/01-frontend-lint-after.txt)). 15 of 15 fixed in code, 0 config decisions, 0 directives added, the rule and its reporting flag intact (§2), and the register that shadowed nine of them is now **empty** while keeping its owner and window (§3) |

**Handed forward as named follow-ups:**

1. **`bun run validate:tailwind` still exits 127** — `package.json:20` points at
   `scripts/validate-tailwind-classes.sh`, which exists in no revision of this repository
   ([`raw/09`](raw/09-validate-tailwind-127.txt)). Two legitimate answers: restore the
   script, or delete the script entry. A gate that cannot run is worse than an absent one,
   because a `bun run` sweep reads 127 as noise. Owner: whoever holds `package.json`.
2. **`LEGACY_EXCEPTIONS` is empty, and empty is not retired.** Its four tests still run and
   the first now has nothing to forgive. The window `2027-02-07` is still **evaluated** by
   two guards, so it will eventually fail on purpose; when it does, the answers are the
   same two L10 named — remove the entries, or announce a new window in
   `compatibility_register.py`. **Do not delete `LEGACY_EXCEPTION_REMOVE_BY` as unused**:
   a backend guard reads it out of this file's source (§3).
3. **The evidence pointer in three files was corrected to this directory.**
   `src/services/errors.ts:29`, `src/services/sessionProbe.ts:30` and
   `tests/unit/architectureEnforcement.test.ts:126` cited
   `13.6/remediation/L7-L8-L12/README.md` §4. That directory exists but holds only L7 and
   L8 raw artifacts and no README; §8.1 schedules L7 and L8 to other lanes. Writing L12's
   verdict into their in-flight directory risked a collision, so this batch wrote
   `L12/` — still nested under `13.6/remediation/`, no new top-level evidence directory —
   and repointed the three comments. **If the L7-L8 batch later publishes a combined
   README, the three pointers move with it, not this document.**

**Not touched, and not claimed:** **L7** (the 19 brand-neutral fallback templates,
GATE-13.4-01 / TEN-09), **L8** (the three instruments writing into `docs/v2-evidence/**`,
GATE-13.1-07), and **O1–O10**, all of which need an operator. **B1**, **B2** and **B3**
remain open. Clause (iii)'s other limbs — 36 failing tests, 1 error, 128 whole-tree
failures — belong to the lanes that own them.

One generalisation, earned here rather than borrowed. **A lint error is a claim about the
code, and a stale suppression is a claim about the linter — and the second kind rots
silently.** Six of these fifteen were suppressions that had stopped meaning anything: three
because a later config block quietly replaced the rule options they named, three because
they named rules this project never enabled. None was ever reported until
`--report-unused-disable-directives` was in the gate command, and once it was, they were
indistinguishable in the output from nine genuine architecture violations. The lesson is
not "delete stale comments". It is that **a suppression needs the same expiry treatment as
an exemption register** — L10 gave `LEGACY_EXCEPTIONS` an owner and a date for exactly this
reason, and an inline `eslint-disable` is the same promise with nobody's name on it. The
cheapest defence is the one already in `package.json:17`: ask the linter, every run,
which of your suppressions still do anything.
