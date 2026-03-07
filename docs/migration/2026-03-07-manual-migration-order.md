# Manual Migration Order

Date: 2026-03-07
Purpose: manual SQL application order for the restored MIHAS migration chain

## Apply Order

Run these in this exact order:

1. `migrations/001_extensions.sql`
2. `migrations/002_core_schema.sql`
3. `migrations/003_supporting_tables.sql`
4. `migrations/004_functions.sql`
5. `migrations/005_triggers.sql`
6. `migrations/006_data_migration.sql`
7. `migrations/007_password_reset_tokens.sql`
8. `migrations/008_notification_delivery.sql`
9. `migrations/009_document_migration_log.sql`
10. `migrations/010_user_permission_overrides.sql`
11. `migrations/011_payment_review_indexes.sql`
12. `migrations/add_csrf_tokens_table.sql`
13. `migrations/add_audit_retention_category.sql`
14. `migrations/add_password_reset_tokens_table.sql`
15. `migrations/add_login_attempts_table.sql`

## Why This Order

- `001` creates extensions and `migration_history`
- `002` creates core tables like `profiles`, `applications`, `audit_logs`, `notifications`
- `003` creates supporting tables like drafts, payments, settings, email queue, and notification preferences
- `004` creates functions used by later triggers
- `005` creates triggers that depend on the functions from `004`
- `006` seeds reference data
- `007` through `011` add later platform capabilities
- `011` adds payment-review and audit lookup indexes used by the newer admin/student payment metadata reads
- the legacy `add_*` files are still part of the real schema and should be applied after the numbered baseline

## Manual `psql` Example

```bash
psql "$DATABASE_URL" -f migrations/001_extensions.sql
psql "$DATABASE_URL" -f migrations/002_core_schema.sql
psql "$DATABASE_URL" -f migrations/003_supporting_tables.sql
psql "$DATABASE_URL" -f migrations/004_functions.sql
psql "$DATABASE_URL" -f migrations/005_triggers.sql
psql "$DATABASE_URL" -f migrations/006_data_migration.sql
psql "$DATABASE_URL" -f migrations/007_password_reset_tokens.sql
psql "$DATABASE_URL" -f migrations/008_notification_delivery.sql
psql "$DATABASE_URL" -f migrations/009_document_migration_log.sql
psql "$DATABASE_URL" -f migrations/010_user_permission_overrides.sql
psql "$DATABASE_URL" -f migrations/011_payment_review_indexes.sql
psql "$DATABASE_URL" -f migrations/add_csrf_tokens_table.sql
psql "$DATABASE_URL" -f migrations/add_audit_retention_category.sql
psql "$DATABASE_URL" -f migrations/add_password_reset_tokens_table.sql
psql "$DATABASE_URL" -f migrations/add_login_attempts_table.sql
```

## Runner Alternative

If you want to use the repo runner instead of manual `psql`, use:

```bash
bun run migrations/apply-migrations.ts
```

The runner now:

- ensures `migration_history` exists
- skips already-applied migrations
- records each successfully applied migration

## Important Note

Do not skip the legacy `add_*` files. The restored numbered chain gives you the baseline schema, but the legacy files still add:

- CSRF token storage
- audit retention metadata
- password reset token table compatibility
- login-attempt tracking for auth throttling/lockout
- per-user permission override storage for admin user management
- payment-review and payment-audit lookup indexes for the newer admin/student payment review surfaces
