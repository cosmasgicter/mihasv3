# ADR-004: Schema Ownership For `managed = False` Models

Date: 2026-04-21
Status: Accepted

## Context

The backend maps a pre-existing Neon/Postgres schema with Django models that
use `managed = False`. This preserves the current production schema, but it
means Django migrations are not the source of truth for structural changes.

The repo already contains:
- SQL migration scripts in `backend/scripts/*.sql`
- a live verification script in `backend/scripts/verify_migration.py`
- a static verification script in `backend/scripts/verify_schema_static.py`
- a `migration_history` table in the database model inventory

The unresolved problem was process clarity, not complete lack of mechanism.

## Decision

The source of truth for schema changes is:

1. SQL migration artifacts in `backend/scripts/*.sql`
2. the manually applied migration order documented in `docs/migration/2026-03-07-manual-migration-order.md`
3. verification via:
   - `python3 backend/scripts/verify_schema_static.py`
   - `python3 backend/scripts/verify_migration.py` against a live Postgres target

Django models remain `managed = False` and must be treated as a mapping layer,
not as schema ownership.

## Rules

1. Do not use `makemigrations` or `migrate` to evolve production schema for
   `managed = False` tables.
2. Every schema change must include a checked-in SQL artifact under
   `backend/scripts/`.
3. Every schema change must update the corresponding Django model mapping in
   `backend/apps/**/models.py`.
4. Every schema change must update any affected documentation or inventory
   tables in `docs/schema-ownership.md` if ownership or migration order changes.
5. Static verification must pass before merge.
6. Live verification must be run against a Postgres environment before
   production rollout.

## Consequences

Positive:
- matches the repo’s actual migration posture
- avoids pretending Django owns schema it does not own
- makes `managed = False` an explicit governance choice instead of tribal knowledge

Negative:
- engineers must write SQL and model changes together
- schema review burden moves from Django migration files to SQL artifacts and verification discipline

## Follow-ups

1. Add a CI step that runs `backend/scripts/verify_schema_static.py`.
2. Add a prod-like local Postgres profile so `verify_migration.py` is easier to run.
3. Keep `docs/schema-ownership.md` as the operational guide that implements this ADR.
