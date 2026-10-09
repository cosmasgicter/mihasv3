# Migration manifest — legacy-column contraction

Task **12.3** of `.kiro/specs/admissions-v2-canonical-rebuild/`.
Captured 2026-08-11 (UTC). Requirements R15.1, R15.6, R15.7, R15.8.

**Status: AUTHORED AND REHEARSED, NOT APPLIED — anywhere.** Not on the Neon
default branch, not on the Neon rehearsal branch, not on production. The
migration's own guards refuse (`raw/neon-rehearsal.txt` Part A) and the
rehearsal round trip aborts by design (Part B). Nothing in this manifest
describes a state change that has happened.

## 1. Files

| # | File | Role | Lint | Swept? |
|---|---|---|---|---|
| 1 | `docs/v2-evidence/12.3/invariants.sql` | read-only gates; run first, on any deployment | n/a (SELECT only) | no — under `docs/`, following task 3.5's `inventory.sql` precedent |
| 2 | `backend/scripts/future/legacy_columns_contract_2026_08_15.sql` | the contraction, with all five gates as fail-closed guards | **non-additive** (`DROP COLUMN`) | no — `future/` is not recursed into |
| 3 | `backend/scripts/future/legacy_columns_contract_2026_08_15_rollback.sql` | bookkeeping rollback | n/a | no — `*_rollback.sql` is excluded by suffix anyway |
| 4 | `backend/scripts/legacy_columns_drop_2026_08_15.sql` | **superseded**, neutralised to a refusing stub | now additive-clean | no — named in `EXCLUDED_TOP_LEVEL_FILES` |

Measured, not assumed — the additive lint's own function run against each file:

```
$ # apply_sql_migrations._find_non_additive_violations(<file>)
scripts/legacy_columns_drop_2026_08_15.sql          : ['DROP COLUMN', 'DROP TABLE']   (before neutralising)
scripts/future/legacy_columns_contract_2026_08_15.sql: ['DROP COLUMN']
scripts/schema_cleanup_drop_stale_columns.sql        : ['DROP COLUMN']                 (already applied, for reference)
```

## 2. Scope

**Contracted by file 2 — 7 columns of `applications`:**

| column | successor | why safe | why still blocked |
|---|---|---|---|
| `payment_method` | `payments.payment_method` | ORM-unmapped; 0 production refs | 17 rows non-null |
| `payer_name` | `payments.metadata` (redacted) | ORM-unmapped; 0 refs anywhere | 15 rows non-null (PII) |
| `payer_phone` | `payments.metadata` → `phone_hash` / `phone_last4` (jsonb keys, not columns — ADR-005) | ORM-unmapped; 0 refs anywhere | 13 rows non-null (raw PII) |
| `amount` | `payments.amount` | ORM-unmapped; 0 production refs | 17 rows non-null |
| `paid_at` | `payments.verified_at` | ORM-unmapped; 0 production refs | 17 rows non-null |
| `momo_ref` | `payments.transaction_reference` | ORM-unmapped; 0 refs anywhere | 1 row non-null |
| `pop_url` | none (Lenco is the record) | ORM-unmapped; 0 refs anywhere | 12 rows non-null |

**Deliberately out of scope, each a registered Legacy_Exception
(`backend/apps/common/compatibility_register.py`, announced end date
2027-02-07):**

| thing | why not contracted |
|---|---|
| `applications.payment_verified_at` | declared model field; 8 production refs; 3 hits in the generated OpenAPI contract; rendered by `ApplicationDetailsSection.tsx` |
| `applications.payment_verified_by` | declared FK; 14 production refs; 2 contract hits; 3 `select_related()` sites; dropping it while the FK is declared breaks every `Application` query |
| `profiles.refresh_token_hash` / `failed_login_attempts` / `locked_until` | **already contracted** 2026-07-12 by `schema_cleanup_drop_stale_columns.sql`; columns absent, model fields absent |
| `error_logs` (whole table) | 186 historical rows, no canonical destination; still an `EXPECTED_TABLE` in `verify_schema_static.py:71` and `verify_migration.py:80`; and a table is not a column |

## 3. Order of operations (the operator's sequence)

Each step is gated on the previous one. Steps 1–4 are read-only.

1. **Measure.** Run file 1 on the target database. Record the output.
2. **Read Gate 1b.** If `unbacked_money_rows > 0`, **stop** — the columns are the
   only record of those payments. The unblocking work is a backfill, not a flag.
3. **Read Gate 2.** If `missing_canonical_ids > 0`, **stop** — run the canonical
   assignment backfill (task 3.2) on that database first.
4. **Read Gate 3.** If `projection_mismatches > 0`, **stop** — the payment lane
   owns it (`raw/invariants-neon.txt` Gate 3 names the root cause).
5. **Neon branch.** `git mv` file 2 to the top level of `backend/scripts/`,
   author nothing new (file 3 already exists), then
   `apply_sql_migrations --dry-run` to confirm discovery, then
   `apply_sql_migrations --allow-non-additive`. Re-run to assert an idempotent
   no-op.
6. **Neon default.** Same command. Re-measure with file 1: every Gate 1 count
   for the 7 columns must now be absent rather than zero.
7. **Production.** `raw/production-procedure.md`. Backup first. Operator only.
8. **Close out.** Remove the 7 columns from `legacy_columns.py`, drop the
   `prelenco_payment_columns` entry from the compatibility register, update
   `test_schema_drift_strict.py`'s exclusions, and move file 2 to
   `backend/scripts/applied/`.

**`--allow-non-additive` is mandatory at steps 5–7.** Without it the additive
lint rejects the file pre-execution. Do not add the flag to the container CMD to
make this easier: the flag being absent from `backend/Dockerfile` is what stops a
contraction from ever running unattended.

## 4. Locking and online safety

`ALTER TABLE ... DROP COLUMN` takes `ACCESS EXCLUSIVE` on `applications` for the
duration of the transaction. It marks the column dropped in `pg_attribute` and
does **not** rewrite the heap, so the work is O(1) in table size — but the lock
still queues behind, and then blocks, every reader and writer of `applications`.
All seven drops are in one transaction, so the lock is taken once.

The practical risk is not duration, it is **lock queueing**: a long-running
`SELECT` on `applications` will hold the `ALTER` waiting, and everything arriving
behind the `ALTER` waits too. Set `lock_timeout` (the production procedure does)
so the migration gives up rather than stalling the platform.

No rehearsed duration is quoted. The rehearsal table holds 33 rows; a timing from
it would be a number without meaning at production scale, and stating the lock
class is the honest substitute.

## 5. Rollback

| Layer | Mechanism | Recovers |
|---|---|---|
| Bookkeeping | file 3 — `DELETE FROM migration_history WHERE migration_name = ...` | re-runnability, drift-checker state |
| Schema + data, Neon | branch reset from parent, or a new branch from a pre-apply timestamp (Neon PITR) | everything |
| Schema + data, production | restore the `deploy/backup-db.sh` dump taken in step 1 of the production procedure, per `docs/runbooks/database-backup-restore.md` | everything |

`ADD COLUMN` is deliberately absent from file 3 (R9.2), and re-adding the columns
would not recover their values in any case. **The rollback of record for a
contraction is a restore**, which is why the production procedure takes the
backup before anything else and why Neon PITR is explicitly noted as *not*
covering production — the two databases are unrelated
(`.kiro/steering/infrastructure.md`).

Rehearsed: `raw/neon-rehearsal.txt` Part B — 7 columns dropped, then rolled back,
with 33 rows, 92 legacy values, 21 payments and 0 `migration_history` rows
confirmed unchanged afterwards.

## 6. Schema fingerprint (R15.8)

| Deployment | migrations applied | contract recorded |
|---|---|---|
| Neon DEFAULT | 44 | no |
| Neon `br-jolly-pine-ahybtg2e` | 50 | no |
| Production (`mihas-postgres-1`) | **not measured — deliberately** | not applied |

`legacy_columns_drop_2026_08_15.sql` appears in no `migration_history` Neon can
see; it was never applied anywhere. OpenAPI contract SHA-256 is unchanged from
task 12.1/12.2's anchor — `raw/openapi-schema.txt` is why that is the correct
reading rather than a null one.
