# LOCAL TESTING: one stack, isolated, never touches production

This runs the whole student journey on your own machine against a **throwaway**
stack: real object storage, captured email, a stand-in for the payment provider
and the scheduled background jobs. Nothing here reads `backend/.env` (which points
at the Neon authoring database) and nothing reaches the live site.

> Golden rule: while testing locally you only run the commands in this file. You
> never run anything against the EC2 server or Neon.

The stack lives under `harness/` and is driven by one command, `harness/bin/harness`.
`harness/bin/local-setup.sh` is the one way to bring it up.

---

## Prerequisites (one time)

| Tool | Why |
|------|-----|
| Docker with Compose v2 | runs the stack (`docker compose`) |
| Bun | installs and builds the admissions app |
| Git | the repository |
| curl | the script's health waits |
| python3 3.8 or later | the drain check (standard library only) |

The setup script checks each one before it starts anything. If one is missing it
exits with code 3 and names it.

## Start the stack

From the repository root:

```bash
bash harness/bin/local-setup.sh
```

The script is shown here in full. A test (`scripts/tests/test_local_setup_doc.py`)
fails if this block and the file differ, so the document cannot drift from what runs.

<!-- local-setup -->
```bash
#!/usr/bin/env bash
# The one local bring-up path (platform-simplification task 11.1, requirements 1.1 and 1.10).
#
#   bash harness/bin/local-setup.sh
#
# Checks the five prerequisites before it starts anything, installs the JavaScript
# dependencies from the lockfile, then brings the isolated harness stack up from an empty
# database. It sets no variable of its own: whatever the caller exported reaches
# `harness/bin/harness`, which reads every value as ${VAR:-default}.
# A missing tool exits 3 and names the tool.
set -euo pipefail
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
need() {
  command -v "$1" >/dev/null 2>&1 || { echo "local-setup: missing prerequisite: $1 ($2)" >&2; exit 3; }
}
need docker "Docker with Compose v2"
docker compose version >/dev/null 2>&1 || { echo "local-setup: missing prerequisite: docker compose (Compose v2)" >&2; exit 3; }
need bun "Bun, https://bun.sh"
need git "Git"
need curl "curl"
need python3 "python3 3.8 or later"
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' \
  || { echo "local-setup: missing prerequisite: python3 3.8 or later" >&2; exit 3; }
cd "${REPO_ROOT}"
bun install --frozen-lockfile
exec bash harness/bin/harness up
```

It builds the admissions app, starts a fresh stack on an **empty database** and
seeds the demo data with `harness_seed_tenants`. No manual database step is needed.
Every start begins empty, because `down` wipes the volumes.

| What | Where |
|------|-------|
| The app (edge) | http://localhost:8090 |
| Backend API | http://localhost:8000 |
| Captured email (Mailpit) | http://localhost:58025 |
| Object storage console (MinIO) | http://localhost:59001 |
| Postgres | 127.0.0.1:55432 |
| Redis | 127.0.0.1:56379 |

If one of those ports is taken, Docker reports the conflict and the script exits
non-zero. Stop the other stack, or remap the port with a second compose file
named in `HARNESS_COMPOSE_OVERRIDE`.

If your shell already exports `VITE_LENCO_WIDGET_URL`, `VITE_API_BASE_URL` or
`VITE_GLITCHTIP_DSN`, unset them first. The harness uses your value over its own,
and its host check then fails the build and names the host.

## Sign in as the seeded people

- **Tenant admins:** `admin@mihas.localhost` and `admin@katc.localhost` (the two
  example tenants), with `HARNESS_TENANT_ADMIN_PASSWORD` from `harness/harness.env`.
  That value is for this local stack only.
- **Platform admin:** `HARNESS_SUPERADMIN_EMAIL` and `HARNESS_SUPERADMIN_PASSWORD`
  from the same file.
- **A student:** register in the app at http://localhost:8090. The verification
  email arrives in Mailpit.

The seeded MIHAS and KATC records are example tenants. Each has an open intake
and a local application fee, so a student has something to apply to and pay for.

## Where each concern goes (what leaves your machine)

Nothing on this stack contacts an outside host.

| Concern | Destination on the stack |
|---------|--------------------------|
| Storage | MinIO (private bucket, no anonymous policy, fictional credentials) |
| Email | Mailpit |
| Payment API | the Lenco-shaped adapter (`LENCO_API_BASE_URL`, `harness/harness.env`) |
| Card widget | a stub script the adapter serves; it opens and reports closed, charging nothing |
| Error reporting | nowhere. The backend has no DSN, and the frontend's DSN names `harness-invalid.localhost`, a loopback host where nothing listens |

Browser runs launch Chromium so that a host name outside the stack does not
resolve, and the harness fails a run that tries to reach one. A literal IP
address outside loopback cannot be stopped that way; the gate detects it and
fails the run.

## Run the checks

Check the stack with the student journey gate (builds, starts, runs, drains):

```bash
bash harness/bin/harness journey-gate
```

Other commands:

```bash
bash harness/bin/harness smoke      # build, start, strict browser projects, evidence
bash harness/bin/harness ps         # service status
bash harness/bin/harness logs web   # tail a service's log
bash harness/bin/harness drain      # assert background jobs drained
```

Backend and frontend tests run on your machine against a throwaway Postgres, not
against this stack and never against Neon (see `docs/runbooks/local-parity.md`):

```bash
cd apps/admissions
bun run lint
bun run test
bun run build
```

## Tear down

```bash
bash harness/bin/harness down     # stops the stack and wipes its volumes
```

## When testing is done

Only after you are satisfied locally:

1. Review your changes: `git status` then `git diff`.
2. Commit and push to a branch, and open a pull request.
3. Follow `deploy/RUNBOOK.md` for a production release and the post-deploy
   smoke check.

Until then, nothing you do locally can affect the students applying on the live site.

## Troubleshooting

- **Port already in use (55432, 56379, 8000, 8090, 58025, 59000):** another
  stack holds it. Stop that stack, or remap with `HARNESS_COMPOSE_OVERRIDE`.
- **The backend does not become healthy:** `bash harness/bin/harness logs web`.
- **The MinIO setup job fails:** `bash harness/bin/harness logs minio-setup`.
- **An ARM machine:** not verified here. The adapter image builds locally either way.
