# LOCAL TESTING — safe, isolated, never touches production

This sets up a **throwaway copy** of the backend on your own machine so you can
test changes without any risk to:

- the **live site** students are applying on (`api.mihas.edu.zm`, the EC2 box)
- the **Neon** authoring database

Everything below runs on **localhost only** with its **own throwaway database**.
You can wipe it and start over any time. **No git commits are involved.**

> Golden rule: while testing locally you only ever run the commands in this
> file. You never run anything against the EC2 server or Neon.

---

## What makes this safe (the isolation)

| Concern | How it's isolated |
|--------|-------------------|
| Database | A separate local Postgres (`mihas_localtest`) in its own Docker volume. Not Neon, not production. |
| Secrets / env | Uses `backend/.env.local.test` only. It never reads `backend/.env` (which points at Neon). |
| Payments / email / AI / storage | All faked or disabled in `.env.local.test` — nothing leaves your machine. |
| Ports | Bound to `127.0.0.1` only (Postgres 5433, Redis 6380, API 8000). |
| Project name | Runs under the Docker project `mihas-localtest`, separate from any other stack. |

---

## Prerequisites (one time)

- Docker Desktop (or Docker Engine) running.
- Bun installed (for the frontend) — https://bun.sh.
- A terminal opened at the repo root: `cd ~/Downloads/mihasv3`.

---

## PART 1 — Start the backend (API + DB + Redis + worker)

```bash
cd backend

# Build and start the isolated stack (own project name + env file).
docker compose -p mihas-localtest \
  -f docker-compose.local-test.yml \
  --env-file .env.local.test \
  up -d --build
```

Wait ~20 seconds, then confirm all 4 services are healthy/up:

```bash
docker compose -p mihas-localtest -f docker-compose.local-test.yml ps
```

### 1a. Prove it's NOT pointing at Neon (do this once to reassure yourself)

```bash
docker compose -p mihas-localtest -f docker-compose.local-test.yml exec web \
  python3 -c "import os; u=os.environ['DATABASE_URL']; print(u); assert 'neon' not in u and 'localtest' in u, 'NOT ISOLATED'; print('OK: local throwaway DB, not Neon')"
```
You should see `OK: local throwaway DB, not Neon`. If it errors, stop and tell me.

---

## PART 2 — Create the database schema (empty — no production data)

This builds the tables from the repo's SQL, with **zero applicant data**.

```bash
# 2a. Full base schema (creates all tables incl. migration_history).
docker compose -p mihas-localtest -f docker-compose.local-test.yml exec -T postgres \
  psql -U postgres -d mihas_localtest < scripts/00_full_schema.sql

# 2b. The migration-history prerequisite (adds the checksum column the
#     auto-runner needs).
docker compose -p mihas-localtest -f docker-compose.local-test.yml exec -T postgres \
  psql -U postgres -d mihas_localtest < scripts/2026_05_22_migration_history_extend.sql

# 2c. Apply the remaining SQL migrations in order (idempotent).
docker compose -p mihas-localtest -f docker-compose.local-test.yml exec web \
  python3 manage.py apply_sql_migrations
```

Confirm the schema is healthy (this is the same check the server runs on boot):

```bash
docker compose -p mihas-localtest -f docker-compose.local-test.yml exec web \
  python3 manage.py check
```

> Optional: seed reference data (subjects) so dropdowns aren't empty:
> ```bash
> docker compose -p mihas-localtest -f docker-compose.local-test.yml exec web \
>   python3 manage.py seed_subjects
> ```

---

## PART 3 — Run the backend test suite

Tests run against the local DB, never Neon.

```bash
docker compose -p mihas-localtest -f docker-compose.local-test.yml exec web \
  python3 -m pytest tests/unit tests/property -q
```

Run a single area while iterating, e.g. the multi-tenant work:

```bash
docker compose -p mihas-localtest -f docker-compose.local-test.yml exec web \
  python3 -m pytest tests/ -k "tenant or assignment or scope or canonical" -q
```

Django system + schema checks:

```bash
docker compose -p mihas-localtest -f docker-compose.local-test.yml exec web \
  python3 manage.py check
docker compose -p mihas-localtest -f docker-compose.local-test.yml exec web \
  python3 manage.py spectacular --file /tmp/schema.yaml
```

---

## PART 4 — Run the frontend against your local backend

In a **second terminal**:

```bash
cd apps/admissions
bun install            # first time only
bun run dev
```

- The dev server prints a URL (usually `http://localhost:5173`).
- Its `/api` calls proxy to your **local** backend at `127.0.0.1:8000` by
  default — NOT the live API. (Don't create a `.env.local` with
  `VITE_API_BASE_URL=https://api.mihas.edu.zm`; that's only for production.)

Frontend checks while iterating:

```bash
cd apps/admissions
bun run type-check
bun run lint
bun run test          # vitest unit/property
bun run build         # production build sanity
```

---

## PART 5 — (Optional) End-to-end / browser testing

With the backend (Part 1–2) and frontend (Part 4) running, point Playwright at
the local URL. Run from wherever your E2E specs live, e.g.:

```bash
# example — adjust to your spec location
npx playwright test --config <your-playwright-config>
```
Use the local `http://localhost:5173` as the base URL, never the live domain.

---

## PART 6 — Tear down / reset

Stop the stack but keep the database:
```bash
cd backend
docker compose -p mihas-localtest -f docker-compose.local-test.yml stop
```

Start it again later:
```bash
docker compose -p mihas-localtest -f docker-compose.local-test.yml start
```

**Wipe everything** (throwaway DB included) for a clean slate:
```bash
docker compose -p mihas-localtest -f docker-compose.local-test.yml down -v
```
Then redo Part 1 and Part 2 to rebuild fresh.

---

## When testing + QA is done (the ONLY time you go near production)

Only after you're satisfied locally:

1. Review your changes: `git status` then `git diff`.
2. Commit + push (this triggers the deploy pipeline that builds images).
3. Follow `deploy/RUNBOOK.md` for the production release + post-deploy smoke
   check.

Until then, nothing you do locally can affect the students applying on the live
site.

---

## Troubleshooting

- **Port already in use (5433/6380/8000):** something else is using it. Either
  stop that, or change the left-hand port in `docker-compose.local-test.yml`.
- **`MIGRATION_HISTORY_NOT_EXTENDED`:** you skipped Part 2b — run it, then 2c.
- **`web` keeps restarting:** check logs:
  `docker compose -p mihas-localtest -f docker-compose.local-test.yml logs web`
- **Want to confirm isolation again:** re-run the check in Part 1a.


---


# PART R — REAL-MONEY mode (production Lenco, K1 self-payments)

This is the **fully real** profile: production Lenco (`api.lenco.co`), **live**
keys, **real money**. The plan is to set every fee to **K1** and pay yourself
(you own the Lenco account, so funds come back; you only lose the transaction
fee). Production security + payment/AI hardening are ON.

Files (unchanged from the realistic profile, now pointed at live Lenco):
- settings `config.settings.local_real`, backend env `backend/.env.local.real`
- compose `backend/docker-compose.local-real.yml` (project `mihas-localreal`)
- frontend env `apps/admissions/.env.local`

## R0 — The ONE rule that protects live students: do not touch the webhook

Your **production** backend (`api.mihas.edu.zm`) is the registered Lenco
**webhook** receiver for real applicants. Lenco typically allows **one global
webhook URL per account**. If you repoint it at your laptop, **every live
student's payment confirmation would be diverted to your machine** and silently
break on production. So:

> **DO NOT add, change, or register a webhook URL in the Lenco dashboard for
> local testing. Leave it exactly as it is (pointing at production).**

This is safe because this codebase confirms payments **two** ways, and only one
needs a webhook:

| Path | Direction | Needs webhook? | Used locally |
|------|-----------|----------------|--------------|
| Webhook | Lenco → backend (push) | yes | ❌ NO (leave production's alone) |
| **Verify** | backend → Lenco API (pull) | **no** | ✅ yes (manual, instant) |
| **Poll task** | backend → Lenco API (pull) | **no** | ✅ yes (beat, every 10 min) |

`PUBLIC_WEBHOOK_BASE_URL` is intentionally left **empty** in
`backend/.env.local.real` so nothing tries to register a local webhook. Your K1
payments confirm via verify/poll instead — same final result, zero risk to
production.

## R1 — Fill the LIVE keys

In `backend/.env.local.real`:
```
LENCO_API_BASE_URL=https://api.lenco.co/access/v2/   # already set
LENCO_API_SECRET_KEY=<your LIVE secret key>
LENCO_PUBLIC_KEY=<your LIVE public key>
```
In `apps/admissions/.env.local`:
```
VITE_LENCO_PUBLIC_KEY=<your LIVE public key>          # same as backend
VITE_LENCO_WIDGET_URL=https://pay.lenco.co/js/v1/inline.js   # already set
```
Email: fill the Mailtrap SMTP block (or switch to the console backend). The
crypto keys and DB stay local — do **not** change `DATABASE_URL`.

## R2 — Start + seed (same as before, with the realistic compose)

```bash
cd backend
docker compose -p mihas-localreal -f docker-compose.local-real.yml \
  --env-file .env.local.real up -d --build

docker compose -p mihas-localreal -f docker-compose.local-real.yml exec -T postgres \
  psql -U postgres -d mihas_localtest < scripts/00_full_schema.sql
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec -T postgres \
  psql -U postgres -d mihas_localtest < scripts/2026_05_22_migration_history_extend.sql
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec web \
  python3 manage.py apply_sql_migrations
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec web \
  python3 manage.py seed_subjects
```

Confirm it's pointed at REAL Lenco but the LOCAL DB:
```bash
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec web \
  python3 -c "import django; django.setup(); from django.conf import settings as s; \
print('LENCO', s.LENCO_API_BASE_URL); print('DB', s.DATABASES['default']['NAME'])"
# expect: LENCO https://api.lenco.co/...   DB mihas_localtest
```

## R3 — Set every fee to K1 (so real payments cost ~K1)

The fee resolver checks `program_fees` (per program + residency), then falls
back to `programs.application_fee`. Set **both** to 1.00 so everything is K1:

```bash
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec -T postgres \
  psql -U postgres -d mihas_localtest <<'SQL'
-- Make the program-level fallback K1 for every program.
UPDATE programs SET application_fee = 1.00;

-- Make every explicit program_fee row K1 (both local + international).
UPDATE program_fees SET amount = 1.00, currency = 'ZMW' WHERE fee_type = 'application';

-- If a program has no application fee row yet, add K1 rows for both residencies.
INSERT INTO program_fees (id, program_id, fee_type, residency_category, amount, currency, is_active, created_at, updated_at)
SELECT gen_random_uuid(), p.id, 'application', r.cat, 1.00, 'ZMW', true, now(), now()
FROM programs p
CROSS JOIN (VALUES ('local'), ('international')) AS r(cat)
WHERE NOT EXISTS (
  SELECT 1 FROM program_fees f
  WHERE f.program_id = p.id AND f.fee_type = 'application' AND f.residency_category = r.cat
);

SELECT p.code, f.residency_category, f.amount, f.currency
FROM program_fees f JOIN programs p ON p.id = f.program_id
WHERE f.fee_type = 'application' ORDER BY p.code LIMIT 20;
SQL
```
The final `SELECT` should show `1.00 ZMW` for each program. (This only edits
your **local throwaway DB** — production fees are untouched.)

## R4 — Make a real K1 payment and confirm it

1. Frontend (2nd terminal): `cd apps/admissions && bun run dev` → open
   `http://localhost:5173`.
2. Go through the wizard to payment. The fee should read **K1**. Pay with a
   **real** card / mobile-money number — real K1 leaves and arrives in your
   Lenco account.
3. **Confirm without a webhook** — two options:
   - **Instant:** call verify on the payment (it pulls status from Lenco):
     ```bash
     # find the latest pending payment id
     docker compose -p mihas-localreal -f docker-compose.local-real.yml exec -T postgres \
       psql -U postgres -d mihas_localtest -c \
       "SELECT id, status, amount FROM payments ORDER BY created_at DESC LIMIT 3;"
     # the frontend's 'check status' button hits POST /api/v1/payments/{id}/verify/,
     # or the poll task will pick it up automatically (next step).
     ```
   - **Automatic:** the `beat` service runs `poll_pending_payments_task` every
     10 minutes and verifies pending payments against Lenco. Just wait, or watch:
     ```bash
     docker compose -p mihas-localreal -f docker-compose.local-real.yml logs -f celery beat
     ```
4. Verify it landed as a confirmed payment with tenant settlement metadata:
   ```bash
   docker compose -p mihas-localreal -f docker-compose.local-real.yml exec -T postgres \
     psql -U postgres -d mihas_localtest -c \
     "SELECT id, status, amount, currency, metadata->>'collector' AS collector FROM payments ORDER BY created_at DESC LIMIT 5;"
   ```
   Expect `status = successful` (after verify/poll) and `collector = beanola`.
5. Cross-check the money actually moved in your **Lenco dashboard** (Collections).

## R5 — Reset / stop

```bash
cd backend
docker compose -p mihas-localreal -f docker-compose.local-real.yml down -v   # wipe local DB
```
You do **not** need to undo anything in Lenco because you never changed the
webhook. Live keys stay only in your local gitignored env file.

## R6 — Real-money safety checklist (tick before paying)

- [ ] `DATABASE_URL` in `.env.local.real` is `...@postgres:5432/mihas_localtest`
      (local), NOT Neon. Verified by the R2 check command.
- [ ] You did **NOT** change the Lenco webhook URL (production still owns it).
- [ ] `PUBLIC_WEBHOOK_BASE_URL` is empty.
- [ ] Fees are K1 (R3 `SELECT` shows `1.00`).
- [ ] You're paying **yourself** (your own Lenco account receives it).
- [ ] `.env.local.real` and `apps/admissions/.env.local` are gitignored (never
      committed — your live keys must not enter git).

## R7 — What this proves

Identical to production in every way that matters: prod settings + hardening,
real Lenco API + widget + money movement, real status transitions confirmed via
the same verify/poll code production uses, Celery worker + beat, real email. The
only differences are the database (local throwaway) and that payment
confirmation comes via verify/poll instead of the production webhook — which is
exactly the safeguard that keeps live students unaffected.

---

## R8 — Known bootstrap gotcha (already worked around)

On a fresh local DB, `apply_sql_migrations` fails on
`2026_05_22_fk_index_backfill.sql` with:

> `CREATE INDEX CONCURRENTLY cannot run inside a transaction block`

The file has 15 `CREATE INDEX CONCURRENTLY` statements; the runner sends them
as one batch, which Postgres rejects. (Production was migrated via the EC2
restore path, so it never hit this.) Work around it once, per fresh DB:

```bash
cd backend
# 1. apply the indexes via psql (runs statements individually, autocommit)
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec -T postgres \
  psql -U postgres -d mihas_localtest -v ON_ERROR_STOP=1 < scripts/2026_05_22_fk_index_backfill.sql
# 2. mark it applied so the runner skips it
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec -T postgres \
  psql -U postgres -d mihas_localtest -c \
  "INSERT INTO migration_history (migration_name, applied_at) VALUES ('2026_05_22_fk_index_backfill.sql', now()) ON CONFLICT (migration_name) DO NOTHING;"
# 3. apply all top-level migrations (the tenant migration is now at the top
#    level — backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql —
#    so the runner applies it automatically; no separate manual step needed)
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec web \
  python3 manage.py apply_sql_migrations
# 4. seed + verify
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec web python3 manage.py seed_subjects
docker compose -p mihas-localreal -f docker-compose.local-real.yml exec web python3 manage.py check_schema_drift
```

> NOTE: this is a real `apply_sql_migrations` bug worth fixing later (run
> CONCURRENTLY files statement-by-statement in autocommit). Out of scope for
> "no commits" testing — documented here so the local bring-up is unblocked.
