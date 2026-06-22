# Operator-Gated Actions — Production Readiness (Phases 0, 5, 7)

> These steps were intentionally **NOT executed automatically**. Each is destructive,
> touches live third-party systems, rewrites shared git history, or modifies the
> production database. Run them yourself, in order. Nothing here was run for you.
>
> Status of the rest of the plan: the safe code remediation (Phases 2 & 3 subset)
> is done and verified locally (lint/type-check/tests/build green) but **not committed**
> — it sits in the working tree for your review.

---

## A. Phase 0.2 — Rotate every production secret (DO FIRST)

Rotate at each provider's dashboard, then update the box's `~/mihas/.env` (chmod 600)
and Vercel project env vars. Rotate **before** purging git history — purging first
leaves a window where old values are still valid and findable in mirrors/backups.

| Secret | Where to rotate |
|---|---|
| `SECRET_KEY` | Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `JWT_SIGNING_KEY` | Generate a new key; update box env |
| `LENCO_API_SECRET_KEY`, `LENCO_PUBLIC_KEY` | Lenco merchant dashboard → regenerate |
| `RESEND_API_KEY` | Resend dashboard → rotate |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Cloudflare R2 → rotate token |
| `ZOHO_SMTP_PASSWORD` | Zoho Mail → regenerate app password |
| `GLITCHTIP_DSN` | GlitchTip project → regenerate DSN |
| `DATABASE_URL` creds | Postgres/Neon → rotate password, update connection string |
| `REDIS_URL` creds | Redis → rotate AUTH password (if set) |

After each rotation, smoke-test that integration in staging before the next.

---

## B. Phase 0.1/0.3 — Find then purge committed secrets from git history

**This rewrites history for everyone. Coordinate with all clones first. Irreversible.**

```bash
# 1. Identify which env files ever appeared in history
git -C /home/cosmas/Downloads/mihasv3 log --all --oneline -- '*.env' '*.env.*' \
  | grep -v '\.example'

# 2. Make a full mirror backup BEFORE touching anything
cd /tmp && git clone --mirror /home/cosmas/Downloads/mihasv3 mihas-mirror-backup

# 3. Purge (install git-filter-repo first). Replace ROTATED-VALUE patterns with the
#    ACTUAL old secret values you just rotated (one --replace-text per secret).
cd /home/cosmas/Downloads/mihasv3
git filter-repo --invert-paths \
  --path backend/.env --path backend/.env.local --path backend/.env.production \
  --path backend/.env.local.real --path backend/.env.local.test --force

# 4. Verify nothing remains (should print nothing)
git log --all --oneline -S'<one old secret value>'

# 5. Force-push to all remotes (only after team coordination)
git push --force --all
git push --force --tags
```

---

## C. Phase 5 / 7 — Neon schema cutover + production migrations + go-live

Per `.kiro/steering/infrastructure.md`: author on a **Neon branch first**, prove it,
then apply to the production Postgres container on EC2. Back up first.

```bash
# --- On a Neon BRANCH (authoring) ---
cd backend
DJANGO_SETTINGS_MODULE=config.settings.dev python3 manage.py apply_sql_migrations --dry-run   # additive only?
DJANGO_SETTINGS_MODULE=config.settings.dev python3 manage.py apply_sql_migrations
DJANGO_SETTINGS_MODULE=config.settings.dev python3 manage.py check_schema_drift               # must pass

# --- On the EC2 box (production) — backup FIRST ---
ssh -i /home/cosmas/Downloads/mihasapplication2026.pem ubuntu@ec2-13-244-37-190.af-south-1.compute.amazonaws.com
cd ~/mihas
./deploy/backup-db.sh                                  # confirm a non-empty dump lands in R2
docker compose -f docker-compose.prod.yml exec web python manage.py apply_sql_migrations --dry-run
docker compose -f docker-compose.prod.yml exec web python manage.py apply_sql_migrations
docker compose -f docker-compose.prod.yml exec web python manage.py check_schema_drift
```

Then post-deploy smoke per `docs/runbooks/post-deploy-smoke-check.md`; go/no-go per the
plan's Phase 7.10; rollback per `docs/runbooks/release-and-rollback.md`.

---

## D. Phase 6 — Launch evidence (generate from REAL runs only)

Do **not** hand-write `"status":"passed"` JSON. Generate each artifact from an actual run
against staging (Playwright journeys, Lighthouse CI, mobile Playwright project, k6/Artillery).
Anything not actually run stays `"status":"pending"`. Fabricated launch evidence is worse than
missing evidence.

---

## E. Already-covered guards (no new work needed)

- **Destructive-SQL CI check** the plan asks for already exists:
  `backend/tests/property/test_rollback_safe_operations.py`,
  `test_migration_history_forward_only.py`, plus `check_schema_drift`. The
  `apply_sql_migrations` additive-only lint enforces it at apply time.
- CI already blocks committed `.env.vercel.*` (`.github/workflows/ci.yml`).

### Optional: broaden the committed-`.env` CI guard (review before merging)

Add to the `admissions`/early job in `.github/workflows/ci.yml`:

```yaml
- name: Block committed .env files
  run: |
    if git ls-files | grep -E '\.env($|\.[^.]+$)' | grep -v '\.example$'; then
      echo "::error::committed .env file detected"; exit 1
    fi
```
