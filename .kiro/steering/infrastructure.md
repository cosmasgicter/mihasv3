# Infrastructure And Database Topology

This is the single most important operational distinction in the repo: **the
database you edit is not the database production runs on.** Read this before any
schema change, migration, data fix, or "run it against the DB" task.

## Two Databases, Two Worlds

| Environment | Where the DB lives | How you reach it | Role |
|-------------|--------------------|------------------|------|
| **Neon (serverless Postgres)** | Neon cloud, `us-east-1` | Neon MCP tools (preferred) or the `DATABASE_URL` in `backend/.env` | The **working / authoring** database. Branch it, edit it, test schema + data here first. |
| **Production (self-hosted)** | Docker Postgres container `mihas-postgres-1` (`postgres:17-alpine`) on the AWS EC2 box | SSH to the EC2 host, then `docker compose` exec into the `postgres` container | The **real production** database. Only receives changes after they are proven on Neon. |

The intended workflow is always **Neon first, production second**:

> Edit and validate the schema/data change on Neon (use a Neon branch for
> anything risky), prove it, then copy/apply it to the production Postgres on
> the EC2 server. Editing Neon and then copying to production is far easier and
> safer than editing production directly.

Never treat the local/Neon `DATABASE_URL` as production, and never hand-edit the
production container's database as the first step.

## Neon (authoring database)

- **Access via the Neon MCP power** (`kiroPowers` → `neon`). Prefer MCP tools
  (`run_sql`, `get_database_tables`, `describe_table_schema`, `create_branch`,
  `prepare_database_migration`) over raw `psql` for Neon work.
- Project: **`mihasApplication`** — project id `wild-bar-37055823`,
  org `org-nameless-field-86879910`, Postgres 17, region `aws-us-east-1`,
  proxy host `c-3.us-east-1.aws.neon.tech`.
- The default branch is the working copy. **For any risky schema or data change,
  create a Neon branch first** (`create_branch`), validate there, then apply to
  the Neon default branch. This mirrors how the multi-tenant migration was
  proven (see `docs/runbooks/multi-tenant-beanola-rollout.md`).
- `backend/.env` `DATABASE_URL` points at the Neon pooler endpoint
  (`ep-dawn-unit-...-pooler.c-3.us-east-1.aws.neon.tech/neondb`). This is the
  **dev/authoring** connection, not production.

### Neon MCP safety rules

- Destructive SQL (`DROP`, `DELETE`, `TRUNCATE`, `UPDATE`/`UPDATE` without a
  `WHERE`) and destructive MCP tools (`delete_project`, `delete_branch`,
  `reset_from_parent`, `complete_database_migration`) are **never run
  autonomously** — always confirm with the user and prefer testing on a
  temporary branch first.
- When operating on a temporary/dev branch, always pass that branch id
  explicitly and tell the user which branch you are using.

## Production (self-hosted EC2 stack)

- **Host:** `ec2-13-244-37-190.af-south-1.compute.amazonaws.com`
  (AWS EC2 t3.small, Ubuntu, `af-south-1`).
- **SSH:** `ssh -i /home/cosmas/Downloads/mihasapplication2026.pem ubuntu@ec2-13-244-37-190.af-south-1.compute.amazonaws.com`
  (key lives in `/home/cosmas/Downloads/`, not in the repo).
- **Stack:** single-host Docker Compose in `/home/ubuntu/mihas`, defined by
  `deploy/docker-compose.prod.yml` in this repo. Containers: `mihas-caddy-1`
  (edge, the only service with published ports 80/443), `mihas-web-1` (backend),
  `mihas-beat-1` (Celery beat), `mihas-celery-1` (Celery worker),
  `mihas-redis-1`, `mihas-postgres-1` (the production DB).
- **Production DB:** runs **inside Docker** as `mihas-postgres-1`. The backend
  connects over the compose network as `postgresql://mihas:<pw>@postgres:5432/mihas`.
  Postgres is **not** published on the host (nothing listens on the host's
  `5432`) — reach it only via `docker compose exec postgres ...` on the box.
- Production is **not Neon, not Koyeb, not Vercel** — the platform migrated to
  this self-hosted stack. The backend image runs `apply_sql_migrations` on boot.

### Reaching the production DB (on the box)

```bash
cd ~/mihas
# psql shell into the production DB
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
# row sanity check
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt" -c "SELECT count(*) FROM applications;"
```

## Copying Neon → Production

The authoritative procedure is **`deploy/RUNBOOK.md` §3 (Migrate the database:
Neon → local Postgres)**, plus `deploy/backup-db.sh`. In outline, run from the
box during a short maintenance window:

1. `pg_dump` from Neon in custom format into a local `neon-dump.pgcustom`.
2. Bring up only the `postgres` container.
3. `pg_restore --clean --if-exists` the dump into `mihas-postgres-1`.
4. Verify row counts (`\dt`, `SELECT count(*) FROM applications;`).
5. `shred -u neon-dump.pgcustom` — never leave a DB dump on disk.

Do not invent a different copy path; follow the RUNBOOK so the dump format,
flags, and cleanup stay consistent.

## Hard Rules

- **Author on Neon, then copy to production.** Never make production the first
  place a schema/data change lands.
- **Production schema changes ship as additive SQL scripts** under
  `backend/scripts/` (the `managed = False` convention from `tech.md`), applied
  by `apply_sql_migrations` — never as ad-hoc destructive edits.
- **Never run destructive SQL or destructive Neon MCP tools autonomously.**
  Confirm with the user; prefer a Neon branch.
- **Never commit real connection strings, the `.pem` key, or DB dumps.**
  `.env`/`.env.local` are gitignored and may hold real credentials locally; the
  SSH key stays in `/home/cosmas/Downloads/`.
- **Never expose the production Postgres on a public port.** It stays on the
  internal compose network behind Caddy.
- Treat any production DB write as **high-risk** per the safety guardrails:
  back up first (`deploy/backup-db.sh`), prove on Neon, then apply.

## Related Docs

- `deploy/RUNBOOK.md` — full managed→self-hosted migration + DB restore.
- `deploy/docker-compose.prod.yml` — the production stack definition.
- `deploy/backup-db.sh` — production DB backup (pg_dump from the container).
- `docs/runbooks/multi-tenant-beanola-rollout.md` — Neon-branch-first migration proof.
- `docs/runbooks/database-backup-restore.md` — backup/restore procedures.
- `docs/schema-ownership.md` — table-level ownership map.
