# Production Launch Checklist (Pre-Launch + Pre-Deploy)

> **Spec:** `.kiro/specs/beanola-production-readiness/` — Task 29.1, Requirements
> **R14.1** (pre-launch: freeze a release branch, confirm no uncommitted
> production code, confirm required env vars) and **R14.2** (pre-deploy: run the
> full Verification_Gate + production build, back up the production DB, apply
> migrations, run validation SQL).

## Purpose

The Operator-facing checklist the team works through **before** a Beanola
production deploy. It covers two phases:

1. **Pre-launch** — freeze the release, prove the working tree is clean, and
   confirm every required production env var is present.
2. **Pre-deploy** — run the full Verification_Gate + production build, back up
   the production database, apply migrations, and run the validation SQL.

After this checklist passes, run the **post-deploy** smoke set in
[`production-smoke-checklist.md`](production-smoke-checklist.md) and
[`post-deploy-smoke-check.md`](post-deploy-smoke-check.md), then apply the
graceful-degradation / rollback posture in
[`release-and-rollback.md`](release-and-rollback.md) if anything fails.

## Golden rule — Neon first, production second

**The database you author against is not the database production runs on.** See
[`.kiro/steering/infrastructure.md`](../../.kiro/steering/infrastructure.md) and
[`multi-tenant-beanola-rollout.md`](multi-tenant-beanola-rollout.md).

- **Neon** (serverless Postgres, project `mihasApplication` /
  `wild-bar-37055823`) is the **authoring / staging** DB. Prove every schema and
  data change here first — on a Neon branch for anything risky.
- **Production** is the self-hosted Docker Postgres container `mihas-postgres-1`
  on the EC2 box. The backup, migrate, and validation-SQL steps in this
  checklist are **operator steps run on the EC2 box during a maintenance
  window** — they are **never run from a development environment** and are
  **gated on explicit user confirmation**.

## Secret-handling rule

Every env var below is referenced **by key name only**. Never read, echo, paste,
or commit a secret value. Real values live in `~/mihas/.env` on the EC2 box
(`chmod 600`, never committed) or in the secret manager. `.env`/`.env.local` are
gitignored; only `.env.example` and `deploy/.env.prod.example` are tracked
templates.

## Environment

| Field | Value (fill in at run time) |
|-------|------------------------------|
| Release branch / tag | e.g. `release/2026.06`, tag `v2026.06.10-1` |
| Backend commit | |
| Frontend commit | |
| Frontend base URL | e.g. `https://apply.beanola.com` |
| Backend API base URL | e.g. `https://api.beanola.com` |
| Operator | |
| Date / time (UTC) | |

---

## Phase A — Pre-launch (R14.1)

### A.1 Freeze a release branch
- **Check:** Cut a release branch from the known-good commit and stop merging new
  feature work into it. Tag it with the date-based convention from
  [`release-and-rollback.md`](release-and-rollback.md) (`vYYYY.MM.DD-N`), e.g. via
  `./scripts/create_release_tag.sh` or `git tag vYYYY.MM.DD-N && git push origin <tag>`.
- **Expected:** A frozen release branch + tag exist; the backend commit, frontend
  commit, and any DB-change artifact are recorded in the Deployment Record
  Template in [`release-and-rollback.md`](release-and-rollback.md).
- **Result:** [ ] PASS / FAIL — Notes:

### A.2 Confirm no uncommitted production code
- **Check:** On the release branch, confirm the working tree is clean and nothing
  deployable is uncommitted or untracked:
  ```bash
  git status --porcelain        # expect zero output
  git rev-parse --abbrev-ref HEAD   # confirm you are on the release branch
  git log -1 --oneline          # record the head commit
  ```
- **Expected:** `git status --porcelain` prints nothing. All intended changes —
  including any new test files for the Verification_Gate (R13.4) — are committed;
  nothing required is left untracked.
- **Result:** [ ] PASS / FAIL — Notes:

### A.3 Confirm required production env vars are present (by key name)
- **Check:** On the EC2 box, confirm each required key is set in `~/mihas/.env`
  **without printing values** — e.g. check key presence only:
  ```bash
  cd ~/mihas
  for k in DATABASE_URL SECRET_KEY JWT_SIGNING_KEY ZOHO_SMTP_USERNAME \
           ZOHO_SMTP_PASSWORD ZOHO_FROM_EMAIL EMAIL_FROM RESEND_API_KEY \
           LENCO_API_SECRET_KEY LENCO_PUBLIC_KEY LENCO_API_BASE_URL \
           S3_ENDPOINT_URL S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY \
           CORS_ALLOWED_ORIGINS CSRF_TRUSTED_ORIGINS AUTH_COOKIE_DOMAIN \
           FRONTEND_URL GLITCHTIP_DSN; do
    grep -q "^$k=" .env && echo "$k present" || echo "$k MISSING"
  done
  ```
  > The production stack builds `DATABASE_URL` from the `POSTGRES_*` vars and
  > points it at the local `postgres` container (not Neon). If your deployment
  > sets `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` instead of a
  > literal `DATABASE_URL`, confirm those three keys are present.
- **Expected:** Every required key reports `present`. Each row in the R14.1
  inventory below is confirmed.

| R14.1 requirement | Env key(s) — confirm by name only | Template source |
|-------------------|-----------------------------------|-----------------|
| `DATABASE_URL` | `DATABASE_URL` (or `POSTGRES_DB` + `POSTGRES_USER` + `POSTGRES_PASSWORD`, from which compose builds the URL) | `backend/.env.example`, `deploy/.env.prod.example` |
| `SECRET_KEY` | `SECRET_KEY` | both |
| JWT signing key | `JWT_SIGNING_KEY` | both |
| Email sender credentials | `ZOHO_SMTP_USERNAME`, `ZOHO_SMTP_PASSWORD`, `ZOHO_FROM_EMAIL`, `EMAIL_FROM`, `RESEND_API_KEY` (fallback) | both |
| Lenco keys | `LENCO_API_SECRET_KEY`, `LENCO_PUBLIC_KEY`, `LENCO_API_BASE_URL` | both |
| R2 / S3 keys | `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | both |
| CORS origins | `CORS_ALLOWED_ORIGINS` (+ `CSRF_TRUSTED_ORIGINS`; `CORS_ALLOWED_ORIGIN_REGEXES` where used) | both |
| Cookie domain | `AUTH_COOKIE_DOMAIN` (prod default `.beanola.com`, env-driven in `config/settings/prod.py`) | `deploy/.env.prod.example` |
| Frontend base URL | `FRONTEND_URL` (backend default `https://apply.beanola.com`; on the box also `APP_HOST`) | `config/settings/base.py`, `deploy/.env.prod.example` |
| Error-monitoring DSN | `GLITCHTIP_DSN` (backend); frontend build uses `VITE_GLITCHTIP_DSN` | both |

  > Production safety: confirm `PAYMENT_DEV_BYPASS` is **false or unset** and
  > `DJANGO_SETTINGS_MODULE=config.settings.prod`. The dev-bypass payment vector
  > must never be enabled in production.
- **Result:** [ ] PASS / FAIL — Notes:

---

## Phase B — Pre-deploy (R14.2)

> **Gate:** Phase B's database steps (B.3 backup, B.4 migrate, B.5 validate) run
> **on the EC2 box, in a maintenance window, only after explicit user
> confirmation**. Prove every schema/data change on Neon first
> ([`multi-tenant-beanola-rollout.md`](multi-tenant-beanola-rollout.md)). Do not
> run them from a development environment.

### B.1 Run the full Verification_Gate (zero errors)
- **Check:** Run the CI-reproducible command set (R13.1) on the release branch:
  ```bash
  # Backend
  cd backend
  DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest tests/unit tests/property -q
  DJANGO_SETTINGS_MODULE=config.settings.test python3 manage.py check
  DJANGO_SETTINGS_MODULE=config.settings.test python3 manage.py spectacular --file /tmp/openapi.yaml

  # Admissions
  cd apps/admissions
  bun run type-check
  bun run lint
  bun run test
  ```
- **Expected:** Every command exits **zero**. The full Drift_Guard inventory runs
  in CI and is non-optional (R13.2, R13.6) — see the Verification_Gate section in
  `design.md`. CI fails on any type/lint/build failure, brand drift,
  unscoped-endpoint drift, or schema drift (R13.3).
- **Result:** [ ] PASS / FAIL — Notes:

### B.2 Production build
- **Check:** Build the admissions production bundle:
  ```bash
  cd apps/admissions
  bun run build
  ```
  Build the backend production image per the deploy workflow (GHCR image
  referenced by `BACKEND_IMAGE` in `~/mihas/.env`) — see `deploy/RUNBOOK.md`.
- **Expected:** Both builds succeed with zero errors. Record the resulting
  frontend commit/build id and backend image SHA in the Deployment Record.
- **Result:** [ ] PASS / FAIL — Notes:

### B.3 Back up the production DB — OPERATOR, on the EC2 box
- **Check:** Always back up before any production write. Run the repo's backup
  helper on the box (it `pg_dump`s out of the `mihas-postgres-1` container and
  ships to R2):
  ```bash
  ssh -i /home/cosmas/Downloads/mihasapplication2026.pem \
    ubuntu@ec2-13-244-37-190.af-south-1.compute.amazonaws.com
  cd ~/mihas
  ./deploy/backup-db.sh        # timestamped pg_dump → R2 (BACKUP_BUCKET)
  ```
  See [`database-backup-restore.md`](database-backup-restore.md) §"Production
  Backup Script" and `deploy/RUNBOOK.md` §3 for the dump format and cleanup
  rules. Increase `BACKUP_RETAIN_DAYS` before a risky cutover so the
  pre-migration backup survives the window.
- **Expected:** The backup completes and the dump is non-empty. No plaintext dump
  is left on disk (`shred -u` per the runbook).
- **Do NOT:** run this from the development environment.
- **Result:** [ ] PASS / FAIL — Notes:

### B.4 Apply migrations — OPERATOR, on the EC2 box
- **Check:** Production schema ships as additive, idempotent SQL scripts under
  `backend/scripts/`, applied by `apply_sql_migrations`. Confirm the
  migration-history prerequisite, dry-run, then apply:
  ```bash
  cd backend
  python manage.py apply_sql_migrations --dry-run   # confirm pending list + additive-only lint
  python manage.py apply_sql_migrations             # apply in the maintenance window
  ```
  > The production image also runs `apply_sql_migrations` on boot, so a normal
  > redeploy applies pending top-level migrations; running it manually lets you
  > watch the output before traffic resumes. The startup chain also runs
  > `seed_subjects` and `check_schema_drift` (see
  > [`post-deploy-smoke-check.md`](post-deploy-smoke-check.md)).
  Prove the same migrations on **Neon first** per
  [`multi-tenant-beanola-rollout.md`](multi-tenant-beanola-rollout.md).
- **Expected:** The dry-run lists the expected pending scripts in lexical order,
  the additive-only lint passes (no `DROP`/`TRUNCATE`/`DELETE`), and the apply
  records each file in `migration_history`. Re-running is a no-op.
- **Do NOT:** apply directly to production as the first place a change lands, or
  run from the development environment.
- **Result:** [ ] PASS / FAIL — Notes:

### B.5 Run validation SQL — OPERATOR, on the EC2 box
- **Check:** Against the just-migrated production DB, run the post-migration
  validation SQL (canonical set in
  [`multi-tenant-beanola-rollout.md`](multi-tenant-beanola-rollout.md) §5 and the
  handover doc), inside the container:
  ```bash
  cd ~/mihas
  docker compose -f docker-compose.prod.yml exec postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  ```
  ```sql
  select count(*) as canonical_programs from canonical_programs;
  select count(*) as programs_without_canonical
    from programs
    where canonical_program_id is null and coalesce(is_active, true) = true;
  select count(*) as applications_without_institution_id from applications where institution_id is null;
  select count(*) as applications_without_program_id   from applications where program_id is null;
  select count(*) as applications_without_offering_id  from applications where program_offering_id is null;
  select count(*) as applications_without_intake_id    from applications where intake_id is null;
  select hostname, count(*) from institution_domains group by hostname having count(*) > 1;
  select slug, count(*) from institutions where slug is not null group by slug having count(*) > 1;
  ```
  Also run the schema sanity checks from
  [`database-backup-restore.md`](database-backup-restore.md):
  `python3 backend/scripts/verify_schema_static.py` and
  `python3 manage.py check`.
- **Expected:** `canonical_programs` is non-zero; the duplicate hostname/slug
  queries return **zero** rows. Legacy applications with null canonical IDs are
  expected and must stay readable (triage in the backfill exception report before
  any `VALIDATE CONSTRAINT`).
- **Do NOT:** run against the Neon default branch as if it were production, or run
  from the development environment.
- **Result:** [ ] PASS / FAIL — Notes:

---

## Sign-off

| Field | Value |
|-------|-------|
| Phase A (pre-launch) all PASS? (Y/N) | |
| Phase B (pre-deploy) all PASS? (Y/N) | |
| If any FAIL, failing item IDs | |
| Verification_Gate zero errors? (Y/N) | |
| Production backup confirmed non-empty? (Y/N) | |
| Migrations applied + validation SQL clean? (Y/N) | |
| Recorded in Deployment Record (`release-and-rollback.md`)? (Y/N) | |
| Operator signature | |
| Date / time (UTC) | |

> On any FAIL, **stop the rollout** and follow
> [`release-and-rollback.md`](release-and-rollback.md). After a clean pass,
> proceed to the post-deploy smoke set.

## Related runbooks

- [production-smoke-checklist.md](production-smoke-checklist.md) — manual post-deploy critical-flow checklist (R14.3)
- [post-deploy-smoke-check.md](post-deploy-smoke-check.md) — automated deploy-time guards + smoke script
- [release-and-rollback.md](release-and-rollback.md) — release tagging, rollback flow, graceful-degradation posture
- [database-backup-restore.md](database-backup-restore.md) — backup script, restore procedure, rollback posture
- [multi-tenant-beanola-rollout.md](multi-tenant-beanola-rollout.md) — Neon-first gated cutover + validation SQL
- [`.kiro/steering/infrastructure.md`](../../.kiro/steering/infrastructure.md) — two-database topology (Neon vs production)
