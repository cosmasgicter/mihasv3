# Multi-Tenant Beanola — Post-Migration Backfill Exception Report

Spec: `.kiro/specs/multi-tenant-beanola-admissions/` — Phase 1, task 3.3.

This report records the post-migration validation SQL results and the manual
exception triage for legacy applications that the additive tenant migration
(`backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql`) could
not link to canonical IDs by best-effort string match.

## Environment

- **Project:** `wild-bar-37055823` (`mihasApplication`, Neon, Postgres 17).
- **Validated on staging branch:** `br-tiny-bonus-ahz81bof`
  (`staging-multitenant-beanola-0001`), forked from `main`
  (`br-floral-scene-aha2ybfd`). Production `main` was never mutated.
- **Date:** Phase 1 staging proof.

## Post-migration validation SQL results (initial apply)

Ran the handover validation set (`docs/multi-tenant-beanola-handover.md` §5):

| Check | Result |
|-------|--------|
| `canonical_programs` count | 4 |
| programs without canonical link (active) | 0 |
| applications missing `institution_id` | 18 |
| applications missing `program_id` | 18 |
| applications missing `program_offering_id` | 18 |
| applications missing `intake_id` | 18 |
| duplicate hostnames | 0 |
| duplicate slugs | 0 |
| duplicate active memberships | 0 |

All four "applications missing X" counts are the **same 18 rows** — a row links
all four IDs together or none, because the backfill `UPDATE` matches the
institution+offering+intake triple in one join.

## Exception triage — the 18 unlinked applications

Grouping the 18 unlinked rows by their legacy string snapshots and probing which
name component failed to match:

| legacy `institution` | legacy `program` | legacy `intake` | apps | institution name match | program name match | intake name match |
|----------------------|------------------|-----------------|------|------------------------|--------------------|-------------------|
| KATC  | Diploma in Clinical Medicine          | January 2026 Intake | 4 | ✗ | ✓ | ✓ |
| MIHAS | Diploma in Registered Nursing         | July 2026 Intake    | 3 | ✗ | ✓ | ✓ |
| MIHAS | Diploma in Registered Nursing         | January 2026 Intake | 3 | ✗ | ✓ | ✓ |
| KATC  | Diploma in Environmental Health       | January 2026 Intake | 2 | ✗ | ✓ | ✓ |
| MIHAS | Diploma in Registered Nursing         | January 2027 Intake | 2 | ✗ | ✓ | ✓ |
| MIHAS | Certificate In Psychosocial Counselling | January 2026 Intake | 1 | ✗ | ✓ | ✓ |
| MIHAS | Certificate In Psychosocial Counselling | July 2026 Intake    | 1 | ✗ | ✓ | ✓ |
| KATC  | Diploma in Clinical Medicine          | January 2027 Intake | 1 | ✗ | ✓ | ✓ |
| KATC  | Diploma in Clinical Medicine          | July 2026 Intake    | 1 | ✗ | ✓ | ✓ |

**Total: 18 applications, 9 distinct (institution, program, intake) groups.**

### Root cause (not ambiguity — a backfill predicate gap)

Every unlinked row matched on `program` and `intake` name but **failed the
institution match**. The reason:

- Legacy `applications.institution` stores the institution **code**
  (`MIHAS`, `KATC`).
- `institutions.name` (and `full_name`) store the **full name**
  (`Mukuba Institute of Health and Allied Sciences`,
  `Kalulushi Training Centre`).
- The original backfill matched only `lower(i.name) = lower(a.institution)`,
  so the code-valued snapshot never matched the full-name column.

These rows are therefore **not ambiguous** — they are deterministically
resolvable via the institution code. A uniqueness probe confirmed each of the
18 rows resolves to **exactly one** `(institution, offering, intake)` triple
(zero rows with `match_count > 1`).

### Resolution (root-cause fix, not a manual patch)

The migration backfill predicate was extended to match the institution **code
or** the full name:

```sql
WHERE (lower(i.name) = lower(a.institution) OR lower(i.code) = lower(a.institution))
  AND lower(p.name) = lower(a.program)
  AND (p.institution_id = i.id OR p.institution_id IS NULL)
  AND lower(it.name) = lower(a.intake);
```

This change is committed to
`backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql`, so the
production application (task 28) links these rows automatically. It remains
additive and idempotent (`COALESCE` fills only nulls; re-running is a no-op).

Applying the code-aware backfill on the staging branch linked **all 18**
remaining rows. Final state on `br-tiny-bonus-ahz81bof`:

| Check | Result |
|-------|--------|
| applications total | 33 |
| applications with `institution_id` | 33 |
| applications with `program_id` | 33 |
| applications with `program_offering_id` | 33 |
| applications with `intake_id` | 33 |
| applications still null | **0** |

## Manual exceptions requiring human decision

**None.** After the root-cause backfill fix, zero legacy applications remain
unlinked, and none required arbitrary/ambiguous attribution. Had any row been
genuinely ambiguous (matching more than one offering, or a program/intake name
with no live row), it would be left null and listed here for an operator to
resolve by hand — the migration never guesses.

## Notes

- The 18 rows were preserved and readable throughout (the migration only fills
  nullable IDs; legacy string columns are untouched), so even before the
  supplementary backfill no data was lost or hidden.
- `NOT VALID` foreign keys were validated only **after** this backfill triage
  (task 3.4), per the design's migration strategy.
