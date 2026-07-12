# Requirements Document

## Introduction

Migrate the MIHAS platform primary database from Neon Postgres (0.25 CU, us-east-1) to Koyeb Postgres (eu-central-1), co-located with the API backend. The migration eliminates cross-region latency between the Django API and its database, improves connection reliability by removing Neon's scale-to-zero cold starts, and takes advantage of the upgraded Koyeb backend (0.5 vCPU, 1 GB RAM). Neon is retained as a cold backup with periodic pg_dump restores for disaster recovery.

## Glossary

- **Koyeb_Postgres**: The target Koyeb-managed PostgreSQL instance in eu-central-1, connection string `postgres://[user]:[password]@[host]/[database]`
- **Neon_Postgres**: The current Neon-managed PostgreSQL instance (0.25 CU) in us-east-1 with scale-to-zero and built-in connection pooling
- **Migration_Operator**: The engineer or admin executing the database migration procedure
- **API_Backend**: The Django 5 + DRF application running on Koyeb (Uvicorn ASGI, 2 workers, 0.5 vCPU, 1 GB RAM)
- **Celery_Worker**: The Celery background worker service on Koyeb that connects to the same DATABASE_URL
- **Celery_Beat**: The dedicated Celery Beat scheduler service (single instance) on Koyeb
- **Cold_Backup**: A non-real-time backup copy of the database maintained on Neon via periodic pg_dump/pg_restore
- **Maintenance_Window**: A scheduled period of planned downtime during which the database cutover occurs
- **DATABASE_URL**: The environment variable consumed by dj_database_url to configure the Django database connection
- **pg_dump**: PostgreSQL utility that produces a logical backup of a database including schema, data, indexes, constraints, and triggers
- **pg_restore**: PostgreSQL utility that restores a database from a pg_dump archive
- **CONN_MAX_AGE**: Django setting controlling how long a database connection is reused within a worker process

## Requirements

### Requirement 1: Pre-Migration Data Snapshot

**User Story:** As a Migration_Operator, I want to create a verified snapshot of the Neon database before migration, so that I have a known-good restore point if anything goes wrong.

#### Acceptance Criteria

1. WHEN the Migration_Operator initiates the pre-migration procedure, THE Migration_Operator SHALL create a full pg_dump of Neon_Postgres in custom format (`-Fc`) that includes all schemas, tables, indexes, constraints, triggers, sequences, and data
2. WHEN the pg_dump completes, THE Migration_Operator SHALL verify the dump file integrity by running `pg_restore --list` against the archive and confirming the table count matches the source database
3. THE Migration_Operator SHALL store the pre-migration dump file in a dated directory with the naming convention `mihas_pre_migration_YYYYMMDD_HHMMSS.dump`

### Requirement 2: Schema and Data Migration to Koyeb Postgres

**User Story:** As a Migration_Operator, I want to migrate all database objects and data from Neon to Koyeb Postgres, so that the new database is a complete replica of production.

#### Acceptance Criteria

1. WHEN the Migration_Operator begins the migration, THE Migration_Operator SHALL put the API_Backend into read-only mode by setting the `READ_ONLY_MODE=true` environment variable on Koyeb to prevent data writes during migration
2. WHEN read-only mode is confirmed active, THE Migration_Operator SHALL create a fresh pg_dump of Neon_Postgres capturing the final production state
3. WHEN the fresh dump is ready, THE Migration_Operator SHALL restore the dump to Koyeb_Postgres using `pg_restore` with the `--no-owner` and `--no-privileges` flags to avoid permission conflicts
4. WHEN pg_restore completes, THE Migration_Operator SHALL verify row counts for all tables match between Neon_Postgres and Koyeb_Postgres
5. WHEN pg_restore completes, THE Migration_Operator SHALL verify that all indexes, constraints, triggers, and sequences exist on Koyeb_Postgres by comparing `\di`, `\d`, and sequence current values between both databases
6. IF pg_restore reports errors, THEN THE Migration_Operator SHALL review the error log, resolve schema conflicts, and re-run the restore before proceeding

### Requirement 3: Environment Variable Cutover

**User Story:** As a Migration_Operator, I want to update the DATABASE_URL on all Koyeb services to point to Koyeb Postgres, so that the API backend and workers use the new database.

#### Acceptance Criteria

1. WHEN data migration verification passes, THE Migration_Operator SHALL update the DATABASE_URL environment variable on the API_Backend Koyeb service to the Koyeb_Postgres connection string
2. WHEN data migration verification passes, THE Migration_Operator SHALL update the DATABASE_URL environment variable on the Celery_Worker Koyeb service to the same Koyeb_Postgres connection string
3. WHEN data migration verification passes, THE Migration_Operator SHALL update the DATABASE_URL environment variable on the Celery_Beat Koyeb service to the same Koyeb_Postgres connection string
4. WHEN all DATABASE_URL variables are updated, THE Migration_Operator SHALL trigger a redeployment of all three Koyeb services
5. WHEN redeployment completes, THE Migration_Operator SHALL disable read-only mode by setting `READ_ONLY_MODE=false`

### Requirement 4: Connection Configuration Adjustment

**User Story:** As a Migration_Operator, I want to adjust the Django database connection settings for the co-located Koyeb Postgres, so that the connection pool is optimized for the new low-latency environment.

#### Acceptance Criteria

1. THE API_Backend SHALL connect to Koyeb_Postgres with `CONN_MAX_AGE=600` to take advantage of the persistent co-located connection (increased from 300 seconds since cold starts are eliminated)
2. THE API_Backend SHALL connect to Koyeb_Postgres with `conn_health_checks=True` to validate connections before use
3. WHEN Koyeb_Postgres requires SSL, THE API_Backend SHALL connect with `ssl_require=True`; WHEN Koyeb_Postgres does not require SSL for co-located services, THE API_Backend SHALL connect without the SSL requirement to reduce connection overhead
4. THE API_Backend SHALL read the `CONN_MAX_AGE` value from an environment variable `DB_CONN_MAX_AGE` with a default of 600, allowing runtime tuning without code changes
5. THE API_Backend SHALL read the SSL requirement from an environment variable `DB_SSL_REQUIRE` with a default of `true`, allowing the operator to disable SSL for co-located connections

### Requirement 5: Post-Cutover Verification

**User Story:** As a Migration_Operator, I want to verify that the platform is fully operational on Koyeb Postgres, so that I can confirm the migration succeeded before decommissioning the old connection.

#### Acceptance Criteria

1. WHEN the API_Backend restarts on Koyeb_Postgres, THE Migration_Operator SHALL verify the health endpoint `GET /health/ready/` returns a 200 response
2. WHEN the health check passes, THE Migration_Operator SHALL verify a student login flow completes (authentication, profile fetch, dashboard load)
3. WHEN the health check passes, THE Migration_Operator SHALL verify an admin login flow completes (authentication, application list, review actions)
4. WHEN the health check passes, THE Migration_Operator SHALL verify Celery_Worker processes a test task by checking the Celery task log or triggering a known periodic task
5. WHEN the health check passes, THE Migration_Operator SHALL verify Celery_Beat dispatches scheduled tasks by confirming the `check_uptime_task` fires within its scheduled interval
6. WHEN the health check passes, THE Migration_Operator SHALL run the backend test suite (`python3 -m pytest`) against the Koyeb_Postgres connection to confirm no regressions
7. IF any verification step fails, THEN THE Migration_Operator SHALL execute the rollback procedure defined in Requirement 8

### Requirement 6: Periodic Backup from Koyeb to Neon

**User Story:** As a Migration_Operator, I want to set up periodic pg_dump backups from Koyeb Postgres with the ability to restore to Neon, so that Neon serves as a cold disaster recovery target.

#### Acceptance Criteria

1. THE Migration_Operator SHALL create a backup script that runs `pg_dump -Fc` against Koyeb_Postgres and stores the dump file with the naming convention `mihas_backup_YYYYMMDD_HHMMSS.dump`
2. THE backup script SHALL be scheduled to run daily (or at a frequency chosen by the Migration_Operator)
3. THE backup script SHALL retain the last 7 daily backups and delete older files to manage storage
4. THE Migration_Operator SHALL document a restore procedure that takes a backup dump file and restores it to Neon_Postgres using `pg_restore --clean --no-owner --no-privileges`
5. WHEN a restore to Neon is needed, THE Migration_Operator SHALL update the DATABASE_URL on all Koyeb services to the Neon_Postgres connection string as the failover procedure
6. IF the backup script fails, THEN THE backup script SHALL log the failure with a timestamp and exit with a non-zero status code

### Requirement 7: Environment File Updates

**User Story:** As a Migration_Operator, I want to update all repository environment files to reflect the new Koyeb Postgres connection, so that the codebase documentation stays accurate.

#### Acceptance Criteria

1. THE Migration_Operator SHALL update `backend/.env.production` to set DATABASE_URL to the Koyeb_Postgres connection string
2. THE Migration_Operator SHALL update `backend/.env` to set DATABASE_URL to the Koyeb_Postgres connection string
3. THE Migration_Operator SHALL add `DB_CONN_MAX_AGE` and `DB_SSL_REQUIRE` entries to `backend/.env.production` and `backend/.env`
4. THE Migration_Operator SHALL update the database connection comments in `backend/config/settings/base.py` to reference Koyeb Postgres instead of Neon Postgres
5. THE Migration_Operator SHALL update `.kiro/steering/tech.md` to reflect Koyeb Postgres as the primary database and Neon as cold backup
6. THE Migration_Operator SHALL update `.kiro/steering/product.md` to replace references to "Neon schema" with "Koyeb Postgres schema" where applicable, while noting Neon as the cold backup

### Requirement 8: Rollback Procedure

**User Story:** As a Migration_Operator, I want a documented rollback procedure, so that I can revert to Neon Postgres within minutes if Koyeb Postgres has critical issues after cutover.

#### Acceptance Criteria

1. THE Migration_Operator SHALL document a rollback procedure that restores DATABASE_URL to the Neon_Postgres connection string on all Koyeb services
2. THE rollback procedure SHALL include setting `READ_ONLY_MODE=true` before switching back to prevent split-brain writes
3. THE rollback procedure SHALL include a step to dump any new data written to Koyeb_Postgres after cutover and before rollback, so that data written during the Koyeb period is not lost
4. THE rollback procedure SHALL include reverting `DB_CONN_MAX_AGE` and `DB_SSL_REQUIRE` to Neon-appropriate values (300 and true respectively)
5. WHEN the rollback is executed, THE Migration_Operator SHALL re-run the post-cutover verification steps from Requirement 5 against Neon_Postgres
6. THE rollback procedure SHALL be executable within 10 minutes from the decision to rollback

### Requirement 9: Backup Script Creation

**User Story:** As a Migration_Operator, I want a ready-to-use backup shell script in the repository, so that periodic backups can be scheduled immediately after migration.

#### Acceptance Criteria

1. THE Migration_Operator SHALL create a backup script at `backend/scripts/backup_koyeb_to_neon.sh` that accepts the Koyeb_Postgres connection string as an argument or reads it from the `DATABASE_URL` environment variable
2. THE backup script SHALL produce a pg_dump in custom format (`-Fc`) with a timestamped filename
3. THE backup script SHALL support a `--restore-to-neon` flag that takes a dump file path and the Neon_Postgres connection string, and restores the dump using `pg_restore --clean --no-owner --no-privileges`
4. THE backup script SHALL validate that `pg_dump` and `pg_restore` are available before executing
5. THE backup script SHALL exit with a non-zero status code and a descriptive error message on any failure
6. THE backup script SHALL log start time, end time, dump file size, and success or failure status to stdout

### Requirement 10: Django Settings Code Update

**User Story:** As a Migration_Operator, I want the Django settings to support configurable connection parameters via environment variables, so that the connection pool can be tuned for different database providers without code changes.

#### Acceptance Criteria

1. THE API_Backend SHALL read `DB_CONN_MAX_AGE` from environment variables and pass it as an integer to `dj_database_url.config(conn_max_age=...)`, defaulting to 600
2. THE API_Backend SHALL read `DB_SSL_REQUIRE` from environment variables and pass it as a boolean to `dj_database_url.config(ssl_require=...)`, defaulting to `true`
3. THE API_Backend SHALL preserve `conn_health_checks=True` as a hardcoded default since health checks are beneficial for all database providers
4. WHEN `DB_SSL_REQUIRE` is set to `false`, THE API_Backend SHALL connect without SSL requirement
5. WHEN `DB_SSL_REQUIRE` is set to `true` or is not set, THE API_Backend SHALL connect with SSL required
