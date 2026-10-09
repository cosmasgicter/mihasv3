# Task 8.1 — Implement expiring server-authored fee quotes

Evidence index for task **8.1** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [ ] 8.1 Implement expiring server-authored fee quotes
  - Store configuration version, base/provider/total amounts, currency, bearer,
    residency, expiry, and signature/status.
  - Delete frontend 1 percent arithmetic, hardcoded empty amounts, and provider
    network guessing.
  - _Requirements: R12.1-R12.2, R12.6_
  - _Findings: STU-08, DATA-05_
  - _Evidence: quote contract tests and source scan for fee/provider hardcodes_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the candidate
  is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-29 (UTC).
- PBT: task 8.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is empty). Nothing is recorded via
  `update_pbt_status`.

## The Required_Evidence claim, and where each half is proven

The `_Evidence:` line is one claim with two halves. Neither slice claims the other's.

| Half of the claim | Slice | Document | Result |
|---|---|---|---|
| **Quote contract tests** — amount authority, expiry rejection, signature/status validation, config-version binding, redeemed-quote rejection, tenant isolation, fail-closed `FEE_NOT_CONFIGURED` | 1 (backend) | [`slice-1-quotes.md`](slice-1-quotes.md) | **41 passed** on real Postgres (37 passed / 4 Postgres-only-DDL skips on the SQLite fast suite); schema proven on a Neon branch; production untouched |
| **Source scan for fee/provider hardcodes** — zero frontend fee arithmetic, zero hardcoded/defaulted amounts, zero client-side provider-network guessing | 2 (frontend) | [`slice-2-frontend.md`](slice-2-frontend.md) | **18 passed**, and mutation-proven: re-introducing the finding fails exactly 3 rules |

## What the two slices together establish

1. **The money is minted on the server.** `POST/GET /api/v1/payments/quote/` returns
   `configuration_version`, `base_amount`, `provider_fee`, `total_amount`, `currency`,
   `bearer`, `residency_category`, `expires_at`, `status`, and a signature — all as
   first-class columns on `payment_fee_quotes`, with `total = base + provider` enforced by
   a database CHECK (slice 1 §2, §5).
2. **Only a quote can fund a student payment.** `_bind_fee_quote` runs inside the same
   transaction that creates the `Payment`, on all three student-funded paths, with
   `expected_base_amount` passed in (slice 1 §2).
3. **Every refusal is a registered stable code with recovery semantics.**
   `QUOTE_EXPIRED`, `QUOTE_INVALID`, `QUOTE_ALREADY_REDEEMED`,
   `QUOTE_CONFIGURATION_CHANGED`, `QUOTE_NOT_FOUND` — backend catalogue
   (snapshot-pinned), frontend mirror with copy, and a **total** code→recovery-action map
   the compiler enforces (slice 1 §2, slice 2 §2, §3.2).
4. **The client renders those numbers and computes none of them.** The 1% arithmetic, the
   K150/USD 20 empty state, the prefix-based Airtel/MTN detection with its Zamtel→Airtel
   default, the `Number(...).toFixed(2)` re-quantisation, and the `K`-for-every-currency
   prefix are all deleted — and an executable scan keeps them deleted (slice 2 §3.4, §3.5).

## Files

```
docs/v2-evidence/8.1/
├── README.md                  ← this index (the single Required_Evidence claim)
├── slice-1-quotes.md          ← backend: quote model/service/endpoint/binding + contract tests
├── slice-2-frontend.md        ← frontend: deletions, quote wiring, recovery actions + source scan
└── raw/
    ├── quote-contract-tests-postgres.txt        (41 passed, real Postgres)
    ├── quote-contract-tests-sqlite.txt          (37 passed, 4 pg-only skips)
    ├── neon-branch-schema-proof.txt             (13 constraints + 5 indexes; 6 behavioural refusals)
    ├── django-check.txt                         (no issues)
    ├── spectacular.txt                          (0 of the 116 pre-existing errors are fee-quote)
    ├── frontend-fee-provider-source-scan.txt    (18 scan rules, per-rule)
    ├── frontend-source-scan-mutation-probe.txt  (the guard failing on a reintroduced finding)
    ├── frontend-test.txt                        (full frontend suite, final)
    ├── frontend-test-first-run.txt              (full suite before the two test-side corrections)
    ├── frontend-lint.txt                        (22 pre-existing errors, none new)
    └── frontend-build.txt                       (exit 0, incl. tsc + CSP gate)
```

## Gate results at a glance

| Gate | Command | Result |
|---|---|---|
| Backend quote suites | `python3 -m pytest tests/unit/test_fee_quote_contract_8_1.py tests/unit/test_fee_quote_endpoint_8_1.py` | 41 passed (Postgres) |
| Django checks | `python3 manage.py check` | no issues (1 silenced) |
| OpenAPI | `python3 manage.py spectacular` | `/payments/quote/` typed; 0 fee-quote errors |
| Frontend tests | `cd apps/admissions && bun run test` | 1 failed / 3797 passed / 1 skipped — the single failure (`authPageFormMarkup`) is pre-existing and payment-unrelated |
| Frontend lint | `cd apps/admissions && bun run lint` | 22 errors, all pre-existing (allowlisted `@/services/client` imports + harness unused-disable directives) |
| Frontend build | `cd apps/admissions && bun run build` | exit 0 (includes `tsc --noEmit` and the CSP check) |
| Source scan | `bun x vitest run tests/unit/feeProviderSourceScan.test.ts` | 18 passed; 3 rules fire when the finding is reintroduced |

## Not claimed here

Tasks **8.2** (single payment state machine, retiring the duplicate legacy path),
**8.3** (student payment ownership split and the recovery/history journeys), and **8.4**
(server-scoped fee administration and settlement) remain `[~]`. The three non-student
`Payment.objects.create` sites (admin override placeholder, admin-review synthetic row,
dev bypass) are deliberately outside the quote path — see slice 1 §2 "Scope boundary".
