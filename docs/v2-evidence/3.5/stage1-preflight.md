# Task 3.5 — Stage 1: read-only preflight (Neon default/authoring branch)

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

**Branch:** `br-floral-scene-aha2ybfd` (Neon default / authoring). **Read-only,
no mutation.** Raw results: [`raw/preflight-neon-default.txt`](raw/preflight-neon-default.txt).
Queries: [`inventory.sql`](inventory.sql).

## Payment orphan / duplicate inventory (Block A/B) — DATA-11

| Metric | Value | Meaning |
|---|---|---|
| total_payments | 21 | |
| null_application_orphans | **0** | no `Payment.application IS NULL` rows |
| dangling_application_fk | **0** | FK intact (`convalidated=true`) |
| dup_txn_ref_groups | 0 | `uq_payments_transaction_reference_present` already enforces this |
| apps_with_multiple_payments | 5 | **legitimate histories, not duplicates** (max 1 active) |
| FK `payments_application_id_fkey` | `ON DELETE SET NULL` | drift vs the Django model `on_delete=CASCADE`; the raw-SQL orphan vector |

The 5 multi-payment applications are `failed,failed,successful` /
`expired,expired,expired` / `expired,deferred,successful` /
`failed,successful` × 2 — ordinary retry/expiry sequences. The existing
`uq_payments_one_active_per_application` partial unique index already guarantees
at most one active (`pending`/`deferred`) payment per application, so there is no
duplicate-payment remediation to do. **Making `Payment.application` mandatory is a
clean operation on the authoring DB** (zero orphans to recover or quarantine).

## Payment-projection mismatch baseline (Block C) — the reason columns stay

| Metric | Value |
|---|---|
| total_apps | 33 |
| apps_with_any_payment | 13 |
| reverse_orphans_verified_no_paymentrow | **18** |
| verified_payment_but_status_not_verified | **0** |

18 applications carry `payment_status = 'verified'`/`'force_approved'` with **no**
canonical `Payment` row — the AUDIT-2.3-001 legacy pre-Lenco manual
proof-of-payment cohort. This mismatch is **non-zero**, which is exactly why the
deprecated application payment columns are **preserved** as read-only snapshots in
this task; contraction is owned by **task 12.3** after the mismatch and use
telemetry reach zero (R15.6/R15.9). The reverse direction is already clean (0
cases of a verified payment whose application summary disagrees), confirming the
ADR-001 derivation is sound going forward.

## Deprecated application payment columns (Block D) — PRESERVE

All 11 deprecated columns exist and hold live legacy values
(`payer_phone` 13, `pop_url` 12, `momo_ref` 1, `paid_at` 17, `payment_verified_*`
13, `payment_status` 31, …). **Task 3.5 does not drop, rewrite, or read them** —
proven by the always-on test
`TestPreservesDeprecatedPaymentColumns` and the Postgres test
`test_deprecated_application_payment_values_preserved`.

## Document duplicate inventory (Block E) — STU-19 / R11.8

| Metric | Value |
|---|---|
| total_docs | 91 |
| dup_app_doctype_groups | **10** |
| docs_null_app | 0 |

By type: `application_slip` 7 groups / 17 to supersede; `extra_kyc` 2 / 7;
`result_slip` 1 / 1. **25 rows** become non-current superseded history; each of the
10 groups keeps exactly one current version. The `is_current` backfill must run
**before** the one-current partial unique index can be built.

## Derivation of the task-3.5 plan

1. **Payments** — add `application_quarantined` flag + `payment_orphan_exceptions`
   ledger; add `CHECK (application_id IS NOT NULL OR application_quarantined)`
   `NOT VALID`; backfill recovers/quarantines orphans (0 here); validate the CHECK;
   reconcile the FK `SET NULL -> CASCADE`.
2. **Documents** — add immutable `version`/`is_current`/`supersedes_id`/
   `superseded_at`/`content_hash`/`uploaded_by`/`provenance`; backfill versions +
   one current per group (preserving older versions); build the one-current partial
   unique index; validate the version CHECK + provenance FKs.
