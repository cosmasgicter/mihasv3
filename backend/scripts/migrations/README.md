# SQL migrations — auto-applied on container startup

Every `.sql` file in this directory is picked up by the
`apply_sql_migrations` management command and run once per database.
The command runs as part of the production Docker CMD before
`uvicorn` starts, so the schema is guaranteed to match the Django
models by the time requests hit the app.

## Conventions

- **Filename**: `NNNN_description.sql` where `NNNN` is a 4-digit
  zero-padded sequence number. Files are applied in lexicographic
  order.
- **Idempotent**: every migration must be safe to run twice — use
  `IF NOT EXISTS` guards, `ON CONFLICT DO NOTHING`, `DO $$ BEGIN IF
  ... END IF; END $$;` etc.
- **Additive-only**: never drop columns, never rename columns,
  never add constraints that existing rows violate. Destructive or
  high-risk changes belong as separate hand-run scripts outside
  this directory.
- **Tracking**: applied migrations are recorded in the
  `applied_sql_migrations` table. Even if the SQL is idempotent,
  an applied migration will not run again unless its row is
  removed from that table.

## What does NOT go here

- **Rollback scripts** (`*_rollback.sql`). Rollbacks are explicit
  operator actions, not automatic deploy steps.
- **Preflight / diagnostic scripts** (`*_preflight.sql`). These
  read but should not write; keep them separate so operators can
  run them on demand.
- **Python-driven backfills** (`*.py`). Scripts that need
  application code context stay as standalone scripts.

## Operator commands

```bash
# Preview without applying
python manage.py apply_sql_migrations --dry-run

# Apply
python manage.py apply_sql_migrations

# Apply from a custom directory (useful for tests)
python manage.py apply_sql_migrations --migrations-dir /tmp/fixtures/
```
