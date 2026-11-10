# Task 8.1 — Slice 1 (backend): expiring server-authored fee quotes

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

_Requirements: R12.1, R12.2, R12.6_
_Findings: STU-08, DATA-05_
_Design: design.md §10.1 (Fee Quote), §10.2 (provider routing is server-authored)_
_Required_Evidence (tasks.md): "quote contract tests and source scan for fee/provider
hardcodes" — the **contract tests** half plus the schema-constraint proof are closed
here. The **source scan** and the frontend deletion (1% arithmetic, hardcoded empty
amounts, provider network guessing) are slice 2 and are NOT claimed by this file._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of that commit (the whole admissions-v2
  spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-29 (UTC).
- PBT: task 8.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is empty). Nothing to record via
  `update_pbt_status`.
- Schema: **one additive script**,
  `backend/scripts/2026_07_30_01_payment_fee_quotes.sql`
  (sha256 `3b8979de1449019d586b982de4495f487d04296c7d419b35900ad71cee3ae2f8`),
  plus its `_rollback` sibling. Applied by `apply_sql_migrations`.
- **Neon branch used: `br-jolly-pine-ahybtg2e`** (`v2-task-3.2-rehearsal`, parent =
  default `br-floral-scene-aha2ybfd`), project `wild-bar-37055823`. A dedicated
  branch could not be created — the project's branch limit is currently exceeded —
  so the existing in-flight rehearsal branch was reused, which is the same branch
  tasks 3.2/3.3 rehearsed on. **Production was never touched.**

## 1. What already existed before this slice

Task 8.1 was already `[-]` (in progress). A prior session had landed most of the
backend half as **untracked** working-tree files. Traced before changing anything:

| Layer | File | State found |
|---|---|---|
| Canonical resolver (task 5.4) | `backend/apps/documents/fee_resolver.py` | Complete. `FeeResolver` resolves only from canonical `program_fees` keyed on the offering **object** + fee type + residency; 0 rows → `FEE_NOT_CONFIGURED` (422), >1 → `FEE_AMBIGUOUS` (409); no display-name lookup, no default amount. **Extended, not forked.** |
| Quote model | `backend/apps/documents/models.py` → `FeeQuote` | Complete, `managed=False` → `payment_fee_quotes`. |
| Quote service | `backend/apps/documents/fee_quote_service.py` | Complete: mint/reuse/supersede, HMAC-SHA256 signing, TTL, fee-configuration fingerprint, single-use `redeem()`, `create_and_redeem()`. |
| Quote endpoint | `backend/apps/documents/fee_quote_views.py` | Complete: `POST`/`GET /api/v1/payments/quote/`. |
| Payment binding | `backend/apps/documents/payment_service_mixins/_initiation.py` → `_bind_fee_quote` | Complete; called from all three student-funded paths (initiate, defer, mobile-money `initiate`). |
| Stable codes | `backend/apps/documents/payment_error_codes.py` | 5 quote codes registered; frontend mirror + drift fixture already in place. |
| Schema | `backend/scripts/2026_07_30_01_payment_fee_quotes.sql` (+ rollback) | Present, additive, idempotent — **but carried a self-contradictory constraint** (§3). |
| Tests | `tests/unit/test_fee_quote_contract_8_1.py`, `test_fee_quote_endpoint_8_1.py` | Present — **5 failing on SQLite, 1 wrong on Postgres, 2 pre-existing suites broken on Postgres** (§3). |
| Evidence | `docs/v2-evidence/8.1/` | Did not exist. |

So the honest state was: the implementation was written but **had never been run
green on a real Postgres, and had never been proven on Neon**.

## 2. Requirement mapping

| AC | Where it is satisfied | Proof |
|---|---|---|
| **R12.1** — expiring quote from canonical offering, intake, residency, fee type, currency, provider-fee policy, and configuration version; frontend does no arithmetic | `FeeQuoteService.create_quote` / `resolve_quote_inputs`; `payment_fee_quotes` columns; `FeeQuoteService.as_dict` returns every number as a string | `test_quote_amounts_come_from_canonical_fee_and_server_policy`, `test_provider_fee_follows_server_policy_not_a_client_constant`, `test_quote_expiry_comes_from_the_configured_ttl`, `test_wire_shape_carries_every_number_the_ui_needs` |
| **R12.2** — no unique active fee → `FEE_NOT_CONFIGURED`, never a hardcoded substitute | `FeeResolver` fail-closed (5.4) propagated through the quote command and the endpoint | `test_missing_fee_configuration_fails_closed_with_no_amount`, `test_quote_endpoint_fails_closed_when_no_fee_is_configured`, `test_initiation_without_a_configured_fee_creates_no_payment_and_no_quote` |
| **R12.6** — UI is given server amounts, quote expiry, provider state, recovery action | wire shape carries `base/provider/total/currency/bearer/residency/expires_at/status`; each refusal is a stable code with recovery semantics (`QUOTE_EXPIRED` and `QUOTE_CONFIGURATION_CHANGED` are `retryable`) | `test_wire_shape_carries_every_number_the_ui_needs`, `test_quote_endpoint_get_refuses_an_expired_quote`. **The UI consuming this is slice 2.** |

The four scope items you named:

1. **Server-authored quote persistence** carrying fee configuration version, base
   amount, provider fee, total, currency, provider-fee bearer, residency, expiry,
   signature/status — all present as first-class columns (§ Neon introspection).
2. **The quote is the only thing that can fund a payment** — `_bind_fee_quote`
   runs inside the same transaction that creates the Payment, on all three
   student-funded paths. `expected_base_amount` is passed in, so a Payment can
   only be funded by a quote naming the same money.
3. **Expired / tampered / already-redeemed quotes are refused with a registered
   stable code** — `QUOTE_EXPIRED`, `QUOTE_INVALID`, `QUOTE_ALREADY_REDEEMED`,
   `QUOTE_CONFIGURATION_CHANGED`, `QUOTE_NOT_FOUND` in
   `payment_error_codes.PAYMENT_ERROR_CODES`, snapshot-pinned by
   `test_payment_error_codes_snapshot.py` and mirrored on the frontend.
4. **Quote contract tests** covering amount authority, expiry rejection,
   signature/status validation, config-version binding, and redeemed-quote
   rejection — 41 tests, all green on Postgres (§4).

### Scope boundary: three non-student Payment writers

Three `Payment.objects.create` sites are deliberately **not** quote-funded, and
this is a boundary rather than a gap: `payment_service_mixins/_admin.py`
(admin-override placeholder), `payment_helpers.py` (admin-review synthetic row),
and `payment_widget_views.py` (dev bypass, 404 in production via
`require_not_dev_bypass_in_production`). All three are zero-amount administrative
resolutions under staff authority — they do not charge a student, so there is no
consent to record. Per ADR-002 these are ledger states, not collections.

## 3. What this slice changed

Four changes, all driven by running the code rather than reading it.

### 3.1 A real schema defect: `ON DELETE SET NULL` vs the redeemed-binding CHECK

`payment_fee_quotes.payment_id` is `ON DELETE SET NULL`, but
`chk_payment_fee_quotes_redeemed_binding` required `payment_id IS NOT NULL` on a
redeemed quote. The FK therefore produced exactly the state the CHECK forbade:
**deleting any Payment that a quote had funded failed outright.** This was not a
test artifact — it would have blocked real payment-lifecycle cleanup, and it broke
two pre-existing Postgres suites
(`test_property_1_race_safety`,
`test_property_11b_initiate_ignores_injected_financial_fields`) plus a
transaction-abort cascade (`test_property_19_retry_limit_threshold`).

Corrected in `backend/scripts/2026_07_30_01_payment_fee_quotes.sql` and mirrored
in `tests/conftest.py`:

```
BEFORE: (status='redeemed' AND payment_id IS NOT NULL AND redeemed_at IS NOT NULL)
     OR (status<>'redeemed' AND payment_id IS NULL AND redeemed_at IS NULL)

AFTER:  (status='redeemed' AND redeemed_at IS NOT NULL)
     OR (status<>'redeemed' AND payment_id IS NULL AND redeemed_at IS NULL)
```

What is preserved: `redeemed` can never be a bare label (a redeemed quote must be
timestamped), and an unredeemed quote can never claim a payment. What is now
tolerated: the FK's own documented outcome. A spent quote whose payment row was
removed keeps its status, amounts, signature and `redeemed_at` — it remains the
audit record of what the student was asked to pay. Single-use is carried by
`status` (`redeem()` refuses every non-`active` status), so a nulled `payment_id`
cannot resurrect a spent quote — asserted by the new
`test_deleting_the_funded_payment_leaves_the_quote_as_spent_evidence`.

The script self-heals: it replaces the constraint only when the stored definition
still contains `payment_id IS NOT NULL`, so a first production apply installs the
correct definition directly and an already-rehearsed branch converges.

### 3.2 A tamper vector the database already made impossible

`test_tampered_amount_fails_signature_verification` simulated tampering by writing
`base_amount=1.00, total_amount=1.00` while leaving `provider_fee=3.00` — refused
by `chk_payment_fee_quotes_total_is_sum` on Postgres, so the test failed for the
wrong reason and never reached the signature assertion. The tamper is now kept
internally self-consistent (`1.00 + 0.01 = 1.01`): the only tamper worth asserting
against is the one the CHECK constraints cannot see, and the signature must still
catch it. It does.

### 3.3 The fast suite now enforces the two uniqueness invariants

`FeeQuote` is `managed=False`, so `schema_editor.create_model` emits the table but
neither the partial unique indexes nor the CHECKs. They were mirrored in
`tests/conftest.py` inside the **Postgres-only** block, so on the SQLite fast
suite two contradictory live prices — and two quotes funding one payment — were
both possible, and the four DB tests failed. `uq_payment_fee_quotes_one_active`
and `uq_payment_fee_quotes_payment` are vendor-neutral (SQLite supports partial
unique indexes), so they moved to the vendor-neutral section and the fast suite
now genuinely enforces them.

### 3.4 The money CHECKs are Postgres-gated, matching existing convention

SQLite cannot `ALTER TABLE ADD CONSTRAINT CHECK`, so the four money/binding CHECK
tests carry `pg_only` — the same `connection.vendor != "postgresql"` skip already
used by `tests/unit/test_integrity_constraints_3_3.py`. They are **not**
unverified: they run green against real Postgres (§4) and are proven live on Neon
(§5). The skip reason names the reason and the active backend.

Files changed by this slice:

| File | Change |
|---|---|
| `backend/scripts/2026_07_30_01_payment_fee_quotes.sql` | corrected redeemed-binding CHECK + self-healing replacement + reasoning comment |
| `backend/tests/conftest.py` | vendor-neutral fee-quote partial unique indexes; mirrored corrected CHECK |
| `backend/tests/unit/test_fee_quote_contract_8_1.py` | DB-legal tamper vector; `pg_only` gate; split the binding test into both halves; new SET-NULL-tolerance test |

## 4. Test results (verbatim)

### 4.1 Quote contract + endpoint suites — real Postgres

`cd backend && DJANGO_SETTINGS_MODULE=config.settings.dev TESTING=1 DATABASE_URL=<localtest 5433> python3 -m pytest tests/unit/test_fee_quote_contract_8_1.py tests/unit/test_fee_quote_endpoint_8_1.py`

```
41 passed, 1 warning in 5.37s
```

Per-test list: [`raw/quote-contract-tests-postgres.txt`](raw/quote-contract-tests-postgres.txt).

### 4.2 Same suites — SQLite fast suite

```
37 passed, 4 skipped, 1 warning in 2.39s
SKIPPED [4] payment_fee_quotes money CHECK constraints are Postgres DDL; active backend is 'sqlite'.
```

[`raw/quote-contract-tests-sqlite.txt`](raw/quote-contract-tests-sqlite.txt).

### 4.3 Payment + fee + document suites (100 files)

`python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "payment|fee|document|webhook")`

| Run | Before this slice | After this slice |
|---|---|---|
| SQLite fast suite | 1 failed, 883 passed, 6 errors | **1 failed, 888 passed, 99 skipped, 2 xfailed, 1 xpassed, 6 errors** |
| Real Postgres | 6 failed, 907 passed, 15 errors | **3 failed, 921 passed, 64 skipped, 2 xfailed, 1 xpassed, 6 errors** |

### 4.4 Failures I introduced vs pre-existing in-flight failures

**Introduced by this slice: zero.**

The 7 residual issues on **both** backends are byte-identical to the failures
already recorded in the task 7.5 evidence
(`docs/v2-evidence/7.5/raw/backend-full-pytest.txt`), i.e. they predate this slice:

```
FAILED tests/property/test_official_document_lifecycle_properties.py::TestOfficialDocumentLifecycleProperty::test_repeated_generation_reuses_single_current_version
ERROR  tests/unit/test_payment_review_reopen.py::test_reopen_failed_payment_to_pending_succeeds
ERROR  tests/unit/test_payment_review_reopen.py::test_reopen_deferred_payment_to_pending_succeeds
ERROR  tests/unit/test_payment_review_reopen.py::test_reopen_successful_payment_blocked_409
ERROR  tests/unit/test_application_review_payment_gate.py::TestApplicationReviewPaymentGate::test_approval_accepts_legacy_paid_payment_row
ERROR  tests/unit/test_application_review_payment_gate.py::TestAdminReviewCannotReverseSuccessfulPayment::test_review_refuses_to_reverse_successful_payment_to_failed
ERROR  tests/unit/test_application_review_payment_gate.py::TestAdminReviewCannotReverseSuccessfulPayment::test_review_refuses_to_reverse_successful_payment_to_pending
```

The 2 extra Postgres-only failures are task 3.5 / 7.3 document-version territory
(`uq_application_documents_one_current`), not fee quotes — 7.3 is still `[-]`:

```
FAILED tests/unit/test_payment_document_reconciliation_3_5.py::test_document_versions_assigned_and_one_current_enforced
FAILED tests/unit/test_payment_document_reconciliation_3_5.py::test_full_sequence_is_idempotent
```

**Fixed by this slice** (all were 8.1-caused, Postgres-only, and are now green):
`test_property_1_race_safety`, `test_property_11b_initiate_ignores_injected_financial_fields`,
`test_property_19_retry_limit_threshold`, and the 9
`test_payment_reconciliation_task.py` errors that cascaded from the aborted
transactions.

### 4.5 Django system checks

`cd backend && python3 manage.py check`

```
System check identified no issues (1 silenced).
```

[`raw/django-check.txt`](raw/django-check.txt).

### 4.6 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`

```
Schema generation summary:
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

`/api/v1/payments/quote/` is present with typed request/response serializers and
explicit `@extend_schema` on both methods, so **zero** of the 116 errors are
fee-quote related (`grep -ci "feequote\|fee_quote"` on the generator output → `0`).
Every error comes from other in-flight V2 `APIView`s that have not declared a
serializer yet (`common/v2/demo_views.py`, `catalog/onboarding_v2_views.py`,
`catalog/change_request_v2_views.py`, `catalog/staff_invitation_views.py`) — the
0.5 baseline already recorded this class of error as non-fatal.
[`raw/spectacular.txt`](raw/spectacular.txt).

## 5. Schema constraint proof + Neon branch

Full introspection, the `apply_sql_migrations` run, the recorded checksum, the
idempotent re-run, and the six behavioural refusals are in
[`raw/neon-branch-schema-proof.txt`](raw/neon-branch-schema-proof.txt). Summary:

- **Branch: `br-jolly-pine-ahybtg2e`** (`v2-task-3.2-rehearsal`), project
  `wild-bar-37055823`. Production untouched; this script has never been applied
  to the self-hosted production Postgres.
- Applied through `apply_sql_migrations` (scoped via `--migrations-dir` to the one
  script). `migration_history` row:
  `2026_07_30_01_payment_fee_quotes.sql`, checksum
  `ffcef96b663ecc20b4e6797e1cfa030eec42862e3b6c972bd643a20dee4e1855`.
- Re-run → `All 1 migrations already applied. Nothing to do.` The apply itself ran
  against objects an earlier rehearsal had already created and completed with zero
  errors, which demonstrates the idempotence guarantee on real objects.
- 13 constraints + 5 indexes live and matching the script.
- Each of the six money/uniqueness invariants refuses a real bad INSERT on the
  branch, and `SELECT count(*) FROM payment_fee_quotes` is **0** afterwards — no
  refusal partially wrote.
- The corrected redeemed-binding CHECK was applied as constraint-level DDL only
  (guarded `DROP CONSTRAINT` + immediate `ADD CONSTRAINT`) on the zero-row table,
  with explicit operator approval, and verified live.

## 6. Constraint compliance

| Constraint | How it holds |
|---|---|
| Server is the sole money authority | Every amount on a quote is resolved server-side from canonical `program_fees` + the server provider-fee policy. `total_amount = base_amount + provider_fee` is a DB CHECK, so no caller can persist arithmetic that does not add up. |
| `Payment` stays source of truth | The quote records consent; `Payment` remains the ledger (ADR-001). `payments` has no FK to `payment_fee_quotes` — the dependency points the other way — so a quote can never gate or alter a payment amount. |
| No raw phone numbers persisted | This slice adds no phone field. `payment_fee_quotes` has no contact column; MSISDN handling is untouched. |
| `{"success": true, "data": ...}` envelope | `FeeQuoteView` returns `{"success": True, "data": FeeQuoteService.as_dict(quote)}`; errors use the nested payment-error envelope with a stable `code`. Covered by `test_quote_endpoint_returns_every_server_authored_number`. |
| Tenant fee config scoped before lookup | The fee resolves from the application's canonical `program_offering` binding (task 5.2), never a display name, so a same-name offering in another tenant can never satisfy a quote — `test_quote_is_isolated_to_its_own_tenant_offering`. The endpoint is owner-class: a valid-but-non-owned application id returns the canonical 404 mask via `authorize_owned_application` (AUTH-07) — `test_quote_endpoint_masks_another_students_application_as_not_found`. `FeeQuoteService.load_for_application` scopes by `application_id` before the fetch. |
| Additive SQL under `backend/scripts/`, applied by `apply_sql_migrations`, proven on Neon first | §5. One brand-new table plus its constraints/indexes; no `DROP COLUMN`/`DROP TABLE`/`TRUNCATE`/unbounded `DELETE`/narrowing `ALTER`. |
| Never production; no destructive SQL without asking | Production untouched. The only `DROP` was the guarded constraint replacement on the zero-row rehearsal-branch table, run **after** explicit operator approval. |

## 7. What remains for slice 2

Not started, not claimed anywhere above:

1. **Delete the frontend 1% arithmetic.** The retired client-side
   `TRANSACTION_FEE_RATE`-style computation in the wizard `PaymentStep.tsx` and
   student `Payment.tsx` — the server now owns this as
   `PAYMENT_PROVIDER_FEE_PERCENT` / `_FIXED` / `_CAP` / `_BEARER` and returns it
   on the quote as `provider_fee` + `bearer`.
2. **Delete the hardcoded empty-state amounts** (K150 / USD 20) and render
   `base_amount` / `provider_fee` / `total_amount` / `currency` / `expires_at`
   straight from the quote, with an explicit no-quote state instead of a
   placeholder price.
3. **Delete provider network guessing** on the client; consume the server-authored
   provider routing (design §10.2).
4. **Wire the frontend to `POST/GET /api/v1/payments/quote/`** and surface the five
   quote stable codes with their recovery actions (the code mirror and copy map
   already exist in `apps/admissions/src/lib/paymentErrorCodes.ts`).
5. **The source scan** — the grep report proving zero remaining fee/provider
   hardcodes across frontend and backend, which is the second half of the
   `_Evidence:` line in `tasks.md` and the closure artifact for STU-08.
6. Frontend gates: `bun run test`, `bun run lint`, `bun run build` for
   `apps/admissions`.

Task 8.1 should stay `[-]` until slice 2 lands.
