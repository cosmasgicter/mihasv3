# Schema Ownership

Operational guide for the accepted policy in
`docs/decision/2026-04-21-adr-004-schema-ownership.md`.

## Source Of Truth

For `managed = False` models, the schema source of truth is:

1. SQL artifacts in `backend/scripts/*.sql`
2. migration ordering guidance in
   `docs/migration/2026-03-07-manual-migration-order.md`
3. verification scripts:
   - `python3 backend/scripts/verify_schema_static.py`
   - `python3 backend/scripts/verify_migration.py`

Django model files are mapping definitions, not schema ownership.

## Required Change Workflow

1. Add or update a SQL artifact in `backend/scripts/`
2. Update the corresponding Django model mapping
3. Run static verification:

```bash
python3 backend/scripts/verify_schema_static.py
```

4. Run live verification against a Postgres target before rollout:

```bash
python3 backend/scripts/verify_migration.py
```

5. Update this document if table ownership, inventory, or migration order changes

## Rules

- Do not use `makemigrations` / `migrate` to evolve production schema for
  `managed = False` tables
- every table-mapping model must declare explicit `db_table`
- every structural change must ship SQL plus model update in the same change

## Existing Verification Assets

Static verification:
- confirms expected table mappings
- checks FK relationships at the model layer
- reports index coverage expectations

Live verification:
- checks row counts
- checks foreign-key integrity
- checks index presence in Postgres
- records immutable verification logs under `backend/migration_logs/`

## Inventory Note

The repo already carries table and migration context in:
- `backend/scripts/*.sql`
- `backend/migration_logs/`
- `backend/scripts/verify_schema_static.py`
- `backend/scripts/verify_migration.py`

Keep those assets aligned with model changes.
