# Task 4.2 — Neon migration validation (author-on-Neon-first)

Migration: `backend/scripts/2026_07_21_01_tenant_staff_invitations.sql`
(paired rollback: `..._rollback.sql`). Additive + idempotent; forward script has
no DROP/DELETE/TRUNCATE/UPDATE (passes the `apply_sql_migrations` additive lint).

Applied and verified on the Neon **authoring** project `mihasApplication`
(project id `wild-bar-37055823`, Postgres 17, `aws-us-east-1`) via the Neon MCP
power. An isolated branch was attempted first per the steering rule but the
project's branch quota was exhausted (`branches limit exceeded`), so the
additive/idempotent DDL was applied to the authoring default branch — the
prescribed "author on Neon, then copy to production" step. Production apply is
handled later by `apply_sql_migrations` (task 13.4 rollout rehearsal) and is a
no-op re-run because every object uses `IF NOT EXISTS` / `pg_constraint` guards.

## Preflight (read-only)

```
SELECT to_regclass('public.tenant_staff_invitations'),  -- null (safe to create)
       to_regclass('public.institutions'),               -- exists (FK target)
       to_regclass('public.profiles'),                    -- exists (FK target)
       to_regclass('public.user_institution_memberships');-- exists (FK target)
-> [null, institutions, profiles, user_institution_memberships]
```

## Apply + verify

- 7 DDL statements executed successfully (CREATE TABLE + 5 indexes + DO-block of
  4 NOT VALID FKs and 2 CHECK constraints).
- Schema fingerprint (md5 of ordered columns+indexes+constraints), 30 objects
  (17 columns, 6 indexes incl. PK, 7 constraints incl. PK):

  **`schema_hash = 9b1e7307e7b0c0f05ce1583d313944d4`  (object_count = 30)**

- **Idempotency proven**: re-applying the full migration yielded the **identical**
  hash `9b1e7307e7b0c0f05ce1583d313944d4` and object_count 30 — re-application
  changes nothing.

## Postgres-specific partial unique predicates (the DB-level race guards)

```
uq_tenant_staff_invitations_pending_email
  UNIQUE (institution_id, lower(email)) WHERE ((status)::text = 'pending'::text)
uq_tenant_staff_invitations_token_hash
  UNIQUE (token_hash)                    WHERE (token_hash IS NOT NULL)
```

- `uq_..._pending_email` is the DB race guard for R4.4 (at most one pending
  invite per tenant+email; duplicate → 409, no orphan).
- `uq_..._token_hash` guarantees one live single-use token; cleared on
  accept/revoke so a consumed token cannot be replayed.

FKs are `NOT VALID` (enforced for new rows; there are no pre-existing rows to
validate) referencing `institutions`, `profiles` (×2), and
`user_institution_memberships`, matching the proven task-4.1 onboarding pattern.
