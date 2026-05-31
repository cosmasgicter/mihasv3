# MIHAS Self-Hosting Migration Runbook

Migrate from managed (Vercel + Koyeb + Neon) to a single self-hosted
Docker Compose stack on **AWS EC2 t3.small (Ubuntu 26.04, af-south-1)**.

Design: keep **both** subdomains (`apply.` + `api.`) and co-locate them on
this box behind one Caddy. No frontend/CSP/cookie changes — only where the
DNS points and where the containers run.

```
Internet ──HTTPS──> Caddy (80/443)
                     ├── apply.mihas.edu.zm → static SPA (baked into image)
                     └── api.mihas.edu.zm   → web (uvicorn:8000)
                                               ├── postgres (internal only)
                                               └── redis    (internal only)
                     celery + beat ── internal: db/redis · edge: outbound
```

Do these in order. Sections 1–4 are one-time prep. Section 5 is the cutover.

---

## 0. Prerequisites (do once, off the box)

**Elastic IP** — associate one with the instance so the public IP survives
reboots (DNS must point at a stable address):
AWS Console → EC2 → Elastic IPs → Allocate → Associate with the instance.

**Security group** — inbound rules: `22` (SSH, ideally your IP only),
`80`, `443` (anywhere). Nothing else. Postgres/Redis are never exposed.

**GitHub repo config** (Settings → Secrets and variables → Actions):

Secrets:
- `EC2_HOST` — the Elastic IP
- `EC2_USER` — `ubuntu`
- `EC2_SSH_KEY` — the **private** key (full PEM contents) for the box
- `GHCR_PAT` — a Personal Access Token with `read:packages` (the box uses it to pull private images)

Variables (public, baked into the frontend bundle at build time):
- `VITE_API_BASE_URL` = `***REMOVED***`
- `VITE_APP_BASE_URL` = `***REMOVED***`
- `VITE_SITE_URL` = `***REMOVED***`
- `VITE_GLITCHTIP_DSN` = your frontend DSN
- `VITE_LENCO_PUBLIC_KEY` = your Lenco public key
- `VITE_LENCO_WIDGET_URL` = your Lenco widget URL

---

## 1. EC2 prep (run on the box, once)

```bash
# --- swap: critical on 2GB so OCR/backup spikes don't OOM-kill containers ---
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf
free -h   # confirm Swap: 2.0Gi

# --- Docker Engine + compose plugin (official convenience script) ---
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker            # apply group now (or log out/in)
docker compose version   # confirm the plugin is present

# --- deploy dir (the workflow scp's the compose file to ~/mihas) ---
mkdir -p ~/mihas
```

---

## 2. Create the production `.env` (on the box, in `~/mihas`)

Copy the template below to `~/mihas/.env` and fill in **real** values. This
file holds the runtime secrets and never leaves the box (gitignored, not in
any image). The CI workflow appends/updates only `BACKEND_IMAGE` /
`FRONTEND_IMAGE` lines — leave those two to the pipeline.

```bash
cp ~/mihas/.env.prod.example ~/mihas/.env   # see deploy/.env.prod.example
nano ~/mihas/.env
chmod 600 ~/mihas/.env
```

Key values for the self-hosted stack (differs from Koyeb):
- `DATABASE_URL` is built by compose from `POSTGRES_*` → points at the local
  `postgres` container, **not** Neon. Just set `POSTGRES_DB`, `POSTGRES_USER`,
  `POSTGRES_PASSWORD` (use a strong password).
- `ALLOWED_HOSTS=api.mihas.edu.zm`
- `CORS_ALLOWED_ORIGINS=***REMOVED***,***REMOVED***`
- `APP_HOST=apply.mihas.edu.zm`, `API_HOST=api.mihas.edu.zm`, `ADMIN_EMAIL=<you>@mihas.edu.zm`
- Keep all the integration secrets you already use on Koyeb (Lenco, Zoho,
  GlitchTip, R2/S3, AUDIT_LOG_ENCRYPTION_KEY, JWT_SIGNING_KEY, AI gateway).

---

## 3. Migrate the database (Neon → local Postgres)

Do this during a short maintenance window (put the app in read-only or accept
a few minutes of downtime). Run from the box (it has outbound internet):

```bash
cd ~/mihas

# 3a. Dump from Neon (use your Neon connection string).
docker run --rm postgres:16-alpine \
  pg_dump --no-owner --no-privileges --format=custom \
  "postgresql://<neon-user>:<neon-pass>@<neon-host>/<neon-db>?sslmode=require" \
  > neon-dump.pgcustom

# 3b. Bring up ONLY postgres first so it can receive the restore.
docker compose -f docker-compose.prod.yml --env-file .env up -d postgres
sleep 10   # let it initialise

# 3c. Restore into the local container.
cat neon-dump.pgcustom | docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore --no-owner --no-privileges --clean --if-exists \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# 3d. Sanity check row counts.
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt" -c "SELECT count(*) FROM applications;"

shred -u neon-dump.pgcustom   # don't leave a DB dump on disk
```

> The backend image runs `apply_sql_migrations` on boot. Because this repo uses
> `managed = False` + SQL migration scripts (not Django ORM migrations), the
> restored Neon schema is already correct; `apply_sql_migrations` is idempotent
> and only fills gaps. `check_schema_drift` will fail the boot loudly if the
> restored schema disagrees with what the code expects — that is the signal to
> stop and reconcile, not to force past it.

---

## 4. First deploy (manual, before wiring DNS)

Trigger the pipeline so images exist in GHCR, then start the stack:

1. Push to `main` (or GitHub → Actions → **Deploy** → Run workflow). This
   builds + pushes images and writes `BACKEND_IMAGE`/`FRONTEND_IMAGE` into the
   box's `.env`, then runs `compose up -d`.
2. Verify on the box **before** DNS points here (use `--resolve` to bypass DNS):

```bash
cd ~/mihas
docker compose -f docker-compose.prod.yml ps          # all healthy/up
# API liveness through Caddy (cert will be self-signed until DNS+ACME; -k ok):
curl -k --resolve api.mihas.edu.zm:443:127.0.0.1 ***REMOVED***
# SPA shell:
curl -k --resolve apply.mihas.edu.zm:443:127.0.0.1 ***REMOVED***/ | head
```

`/health/ready/` returning `200` means Postgres + Redis are reachable. If it
fails, check `docker compose logs web`.

---

## 5. DNS cutover (the smooth switch)

Caddy can only issue Let's Encrypt certs once the public DNS for both names
points at this box. Lower TTL a day ahead for a fast rollback.

1. **Lower TTL** on `api.` and `apply.` records to 300s (a day before).
2. **Cut over** — point both at the Elastic IP:
   - `api.mihas.edu.zm`   A → `<Elastic IP>`
   - `apply.mihas.edu.zm` A → `<Elastic IP>`
   (Remove the old Vercel/Koyeb records. If `apply.` was a CNAME to Vercel,
   replace it with an A record.)
3. Watch Caddy obtain certs:
   ```bash
   docker compose -f docker-compose.prod.yml logs -f caddy
   # look for "certificate obtained successfully" for both hosts
   ```
4. From your laptop, confirm real HTTPS:
   ```bash
   curl ***REMOVED***
   curl -I ***REMOVED***/
   ```
5. Smoke test in a browser: sign in, open the wizard, the admin dashboard, and
   run one payment in Lenco sandbox. Cookies should work because both names are
   still under `.mihas.edu.zm` (unchanged).

Because the frontend's API mapping and the cookie domain are unchanged, the
only thing that moved is *where the DNS resolves*. Old managed deployments can
stay running until DNS fully propagates — there is no hard cutover instant.

---

## 6. R2 off-site Postgres backups (set up right after cutover)

Never trust a single box. Nightly `pg_dump` → Cloudflare R2.

```bash
# one-time: install awscli on the box
sudo apt-get update && sudo apt-get install -y awscli

# configure an R2-scoped profile (R2 is S3-compatible)
aws configure --profile r2   # access key, secret, region=auto
# then add the endpoint to ~/.aws/config under [profile r2]:
#   endpoint_url = https://<accountid>.r2.cloudflarestorage.com
```

The backup script is at `deploy/backup-db.sh`. Install the cron:

```bash
cp deploy/backup-db.sh ~/mihas/backup-db.sh && chmod +x ~/mihas/backup-db.sh
( crontab -l 2>/dev/null; echo "30 2 * * * cd ~/mihas && ./backup-db.sh >> ~/mihas/backup.log 2>&1" ) | crontab -
```

Restore from a backup = the `pg_restore` step in section 3 against a dump pulled
from R2 (`aws s3 cp --profile r2 s3://<bucket>/<file> .`).

---

## 7. Rollback

- **Bad image** (app broke after a deploy): redeploy a previous good SHA.
  On the box, set the two image tags back and roll:
  ```bash
  cd ~/mihas
  sed -i 's|^BACKEND_IMAGE=.*|BACKEND_IMAGE=ghcr.io/<owner>/<repo>-backend:<good-sha>|' .env
  sed -i 's|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=ghcr.io/<owner>/<repo>-frontend:<good-sha>|' .env
  docker compose -f docker-compose.prod.yml --env-file .env up -d
  ```
  (Image tags are immutable per-SHA, so old ones are always pullable.)
- **Bad box / infra** (during the DNS-propagation window): point DNS back at
  Vercel/Koyeb. Keep the managed services paused-but-alive for ~1 week before
  decommissioning.
- **Bad data**: restore the latest R2 dump (section 6).

---

## 8. After you're confident (1+ week stable)

- Decommission Koyeb + Vercel + Neon.
- The Celery `keep_alive_task` (every 4 min, to dodge Koyeb cold starts) is now
  pointless — it's harmless but you can drop it from the beat schedule.
- Consider a 4GB instance if you ever see swap usage climbing under load
  (`free -h`, `docker stats`).

## Day-2 operations cheat-sheet

```bash
cd ~/mihas
docker compose -f docker-compose.prod.yml ps             # status
docker compose -f docker-compose.prod.yml logs -f web     # tail backend
docker stats --no-stream                                  # live memory per container
docker compose -f docker-compose.prod.yml restart web     # restart one service
df -h && free -h                                          # disk + memory/swap
```
