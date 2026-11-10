# Task 3.4 — Stage 2: online VALIDATE rehearsal + lock measurement (Neon branch)

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.4**
**Branch used:** `br-jolly-pine-ahybtg2e` (name `v2-task-3.2-rehearsal`), a ready,
non-default, non-protected branch forked from the default `br-floral-scene-aha2ybfd`.
**Reused** (not newly created) because the Neon project is at its branch cap —
`create_branch` returns `422 branches limit exceeded`. The branch is disposable and
isolated; **nothing here touched the Neon default branch or the self-hosted
production Postgres**.
**Raw capture:** [`raw/rehearsal-neon-branch.txt`](raw/rehearsal-neon-branch.txt).

## Faithful reproduction of the production `NOT VALID` state

The branch (like its parent) is Django-built, so the June-named FKs are absent and
already-valid equivalents exist under Django names. To rehearse the real production
transition, Step A adds the **24 June-named tenant FKs `... NOT VALID`** via a guarded
`DO`-block — identical to how `apply_sql_migrations` builds the self-hosted production
DB from the raw June SQL, and identical to the test helper
`_reproduce_june_not_valid_fks`. `ADD CONSTRAINT ... NOT VALID` performs no table scan
(additive, non-destructive).

**Before-state (Step B):** `24` June-named FKs `convalidated=false`; `24` total
`NOT VALID` FKs in the schema. The task-3.1 verifier would report **24
`unvalidated_foreign_key` failures** here — the R15.4 blocker. Branch orphan preflight
(same 24 anti-joins as Stage 1): **0 orphans**, so `VALIDATE` will succeed.

## Lock measurement (design.md §19 "bounded locks")

One transaction validated a representative constraint and introspected the locks it
held:

```
ALTER TABLE user_institution_memberships VALIDATE CONSTRAINT memberships_user_id_fk;
SELECT c.relname, l.locktype, l.mode, l.granted
  FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
 WHERE c.relname = 'user_institution_memberships' AND l.locktype = 'relation';
-->  user_institution_memberships | relation | AccessShareLock          | t
     user_institution_memberships | relation | ShareUpdateExclusiveLock | t
```

**Measured lock: `ShareUpdateExclusiveLock`.** It does **not** conflict with
`AccessShareLock` / `RowShareLock` / `RowExclusiveLock`, so concurrent
`SELECT / INSERT / UPDATE / DELETE` keep running throughout validation; it conflicts
only with DDL, `VACUUM`, and another `ShareUpdateExclusive`. `VALIDATE CONSTRAINT` is
transaction-safe, so the migration runs inside the normal transactional
`apply_sql_migrations` path — no `CREATE INDEX CONCURRENTLY`, no long `ACCESS
EXCLUSIVE` hold. This is the control for the §19 risk *"Constraint creation blocks
production"*.

## Applying the real task-3.4 script + after-state

Step D ran `backend/scripts/2026_07_18_01_tenant_fk_validate.sql` **verbatim**. Its
`convalidated = false` guard skipped `memberships_user_id_fk` (already validated in the
lock-measurement step) and validated the remaining 23 — exercising idempotency.

**After-state (Step E):**

| Probe | Value |
|---|---|
| `NOT VALID` FKs anywhere in schema | **0** |
| June-named tenant FKs `convalidated=true` | **24** |
| Idempotent re-run (validate DO-block again) | matched **0** constraints, no error, still **0** NOT VALID |

## Schema manifest (task-3.1 tool), after-state

```
schema_manifest --emit schema-manifest-neon-branch-after.json \
    --label "neon-branch-task-3.4-after br-jolly-pine-ahybtg2e" --dsn-env <branch DSN>
  -> vendor=postgresql reduced=False tables=71
     fingerprint=sha256:c6b39faaadce1b143f2e9906f098ec28268777b16b3e4a5ce1e42ed64017c9d4
schema_manifest --verify schema-manifest-neon-branch-after.json
  -> "0 failures, 0 warning(s)"   (report: schema-manifest-verify-after.json)
```

**Required Evidence met: zero invalid tenant constraints in the schema manifest.**

## Cleanup / boundaries

- All mutation ran **only** on `br-jolly-pine-ahybtg2e`, branch id passed explicitly on
  every call. The Neon default branch and self-hosted production received **no** writes.
- The 24 reproduced-then-validated FKs remain on the disposable branch alongside its
  Django-named FKs (harmless, additive). They cannot be reset to `NOT VALID` without a
  destructive `DROP` (operator-gated), so the **before**-manifest half of the pair is
  emitted from local Postgres instead — see
  [`schema-manifest-local-before.json`](schema-manifest-local-before.json) (24 failures)
  and [`schema-manifest-local-after.json`](schema-manifest-local-after.json) (0).
- Deleting/resetting the branch is a destructive Neon op left to the operator.
