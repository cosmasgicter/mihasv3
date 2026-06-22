# Launch Verification — Operator & Deployed-Target Gates

## Purpose

The Beanola launch-verification harness (spec
`.kiro/specs/beanola-launch-verification/`) decides whether the platform is
`production-launch-ready`. CI runs the **automated** gates (5 Bundle, 6 Suite,
7 Brand, 8 Contract, 11 Scope) and the final rollup. This runbook covers the
**five gates that CI cannot run** because they need a live database, a deployed
target, a real browser, or production configuration:

| Gate | Name | World | Evidence path |
|------|------|-------|---------------|
| 1 | Migration_Evidence_Gate | OPERATOR-RUN (read-only capture) | `docs/launch-evidence/01-migration/migration-evidence.json` |
| 3 | Performance_Gate | DEPLOYED-TARGET (operator/scheduled) | `docs/launch-evidence/03-performance/` |
| 4 | Mobile_UI_Gate | DEPLOYED-TARGET (operator/preview) | `docs/launch-evidence/04-mobile-ui/` |
| 9 | Operational_Readiness_Gate | OPERATOR-RUN (read-only inspect) | `docs/launch-evidence/09-operational/operational-evidence.json` |
| 10 | Onboarding_Smoke_Gate | DEPLOYED-TARGET (operator/scheduled) | `docs/launch-evidence/10-onboarding/onboarding-evidence.json` |

> **None of the steps in this runbook are auto-run in CI.** They are run by an
> operator (or a preview-deploy job) against a staging/production-like target,
> and each writes an `Evidence_Artifact` into the evidence store. Gate 2
> (Smoke_Test_Gate) has its own operator procedure in
> `docs/runbooks/post-deploy-smoke-check.md`.

## Safety rules (apply to every step below)

These are non-negotiable and come straight from the infrastructure steering:

- **Backup-first.** Before any production database apply, take a backup with
  `./deploy/backup-db.sh`. The migration gate records that the backup completed
  **before** the apply, within a ≤ 60-minute window.
- **Neon-first.** Author and prove every schema/data change on Neon (a Neon
  branch for anything risky) before it touches production. Production is never
  the first place a change lands.
- **No public Postgres port.** Reach the production DB only via
  `docker compose exec postgres ...` on the EC2 box, never over a published
  port.
- **No PII or secrets in artifacts.** Every gate writes through the shared
  redaction helper (`backend/apps/common/launch_verification/redaction.py`).
  Connection strings, DB passwords, API keys, raw phone numbers, NRC/passport
  values, and document bodies are stripped. Property 16 enforces this. Do not
  hand-edit an artifact to add a value.
- **Operator-gated writes.** The risky steps (SQL apply, backup, driving a live
  journey) are operator actions. The recorder/checker scripts themselves perform
  **no** production writes — they only capture or inspect.

## How these artifacts feed the rollup (Gate 12)

Each gate writes a single `Evidence_Artifact` JSON with a closed
`status` of `passed | failed | unknown`. The rollup aggregator
`scripts/launch-verification/rollup.py` reads all eleven gate artifacts plus a
filesystem readability probe and declares the verdict. It is **conservative by
construction**: the verdict is `production-launch-ready` *only if* all eleven
gates are explicitly `passed` **and** every artifact is present, readable, and
parseable. A missing, `unknown`, `failed`, or unreadable artifact forces
`not-production-launch-ready`. The rollup never re-runs a gate.

So an un-run deployed-target gate (no artifact, or the default `unknown`
artifact) correctly blocks launch until an operator captures it. Run the rollup
once all five artifacts below are present:

```bash
python3 scripts/launch-verification/rollup.py
# writes docs/launch-evidence/rollup.json + launch-readiness.md
```

---

## Gate 1 — Migration_Evidence_Gate (OPERATOR-RUN)

**Requirements R1.6, R1.7.** Read-only capture. The recorder
`scripts/launch-verification/record-migration-evidence.py` performs **no**
production writes, opens **no** database connection, and never runs
`apply_sql_migrations`. The operator runs the real migration steps (Neon-first,
backup-first) per `docs/runbooks/multi-tenant-beanola-rollout.md` and
`deploy/RUNBOOK.md` §3, captures the command output, and feeds it to the
recorder via an `--inputs` JSON file.

### Operator procedure

1. **(Neon-first) Dry-run on Neon.** Prove the migration on a Neon branch using
   the Neon MCP `prepare_database_migration` flow (or a dry-run apply). Capture
   the target branch, the applied script id(s), the planned schema changes, and
   the error count (must be zero — R1.10 withholds production evidence on a
   dirty dry-run).
2. **Staging apply.** Apply on a staging/Neon-default target and capture the
   resulting `migration_history` rows (one row per applied script — R1.2).
3. **Idempotency apply.** Apply a **second** time and capture the
   `migration_history` delta and schema delta (both must be zero — R1.3).
4. **Validation SQL.** Run the tenant-invariant validation SQL and capture the
   counts: `canonical_programs ≥ 1`, active `institutions ≥ 1`, zero duplicate
   hostnames, zero duplicate slugs, active memberships ≥ 1 (R1.4/R1.5).
5. **(Backup-first) Production apply proof.** When a production apply is
   recorded, take the backup **first**:

   ```bash
   # On the EC2 box, in ~/mihas
   ./deploy/backup-db.sh
   ```

   Capture the backup completion timestamp and the apply start timestamp. The
   recorder checks the backup precedes the apply by ≤ 60 minutes **(R1.6)** and
   records the rollback/disable posture **(R1.7)**.
6. **Assemble the inputs JSON** (shape mirrors `synthetic_inputs()` in the
   recorder: `neon`, `staging`, `idempotency`, `validation`, `production_apply`,
   `migration_scripts`) and run the recorder:

   ```bash
   python3 scripts/launch-verification/record-migration-evidence.py \
     --inputs captured-migration-evidence.json
   ```

   Offline self-check (proves redaction strips an embedded secret, writes a
   valid envelope, no file or target needed):

   ```bash
   python3 scripts/launch-verification/record-migration-evidence.py --synthetic
   ```

**Evidence:** `docs/launch-evidence/01-migration/migration-evidence.json`. Exit
is non-zero (fails closed) when the evaluated evidence is not passing.

---

## Gate 3 — Performance_Gate (DEPLOYED-TARGET)

**Requirement R3.1.** Runs against a deployed **staging/production-like** target.
Two collectors feed one pure evaluator (`performance_eval.py`) which makes the
pass/fail decision; the collectors compute nothing themselves.

### Operator procedure

1. **Lighthouse runner** (`run-lighthouse.mjs`) — mobile form factor, the five
   launch routes (`/`, `/auth/signup`, `/track-application`,
   `/student/dashboard`, `/admin/dashboard`), at least 3 runs each (median is
   used). Requires a local `lighthouse` binary and a reachable target.

   ```bash
   node scripts/launch-verification/run-lighthouse.mjs \
     --base-url https://staging.beanola.com --runs 3 \
     --student-cookie "$LV_STUDENT_COOKIE" \
     --admin-cookie "$LV_ADMIN_COOKIE"
   ```

   Thresholds: Public routes ≥ 90, Authenticated/admin routes ≥ 80. Auth cookies
   are supplied via flag/env so no secret is hard-coded; an absent cookie marks
   that route `not-measured` (never a false pass).

2. **API timing sampler + combiner** (`sample-api-timings.py`) — samples ≥ 100
   request latencies per surface across the twelve API surfaces, writes the
   timings CSV, then combines the Lighthouse run-scores with the API samples,
   calls the evaluator, and writes the evidence artifact.

   ```bash
   python3 scripts/launch-verification/sample-api-timings.py \
     --base-url https://staging.beanola.com
   ```

   Offline envelope check (no live target): add `--synthetic`.

**Evidence:** `docs/launch-evidence/03-performance/` —
`performance-evidence.json` (the artifact), raw Lighthouse HTML/JSON under
`lighthouse/`, and `timings.csv`. A route with too few Lighthouse runs or a
surface with < 100 samples is `not-measured`, forcing the gate not-passed
(R3.7).

---

## Gate 4 — Mobile_UI_Gate (DEPLOYED-TARGET)

**Requirement R4.1.** A Playwright harness
(`apps/admissions/tests/playwright/launch-mobile-ui.spec.ts`) drives the six pure
DOM defect detectors across five viewports (360×800, 390×844, 768×1024,
1024×768, 1440×900) over the public/auth/student/admin route sets. The decision
logic lives in the pure `detectors.ts` core; this spec only navigates, extracts
DOM shape, runs the detectors, and records results + screenshots.

It is **not** under the default Playwright `testDir` and is gated behind
`LAUNCH_MOBILE_UI_E2E=1`, so `playwright test` does not pick it up on PRs. When
disabled it still enumerates every cell under `--list` and emits an `unknown`
artifact (which the rollup treats as not-passed) — it never fabricates a pass.

### Operator procedure

```bash
# 1. one-time: install the browser binary
bun x playwright install chromium

# 2a. public + auth routes only (no session required)
LAUNCH_MOBILE_UI_E2E=1 \
LAUNCH_MOBILE_UI_BASE_URL=https://apply.beanola.com \
  bun x playwright test tests/playwright/launch-mobile-ui.spec.ts

# 2b. include student/admin routes — supply logged-in storage state(s)
#     (capture once with: bun x playwright codegen --save-storage=state.json)
LAUNCH_MOBILE_UI_E2E=1 \
LAUNCH_MOBILE_UI_BASE_URL=https://apply.beanola.com \
PLAYWRIGHT_STUDENT_STORAGE_STATE=./student-state.json \
PLAYWRIGHT_ADMIN_STORAGE_STATE=./admin-state.json \
  bun x playwright test tests/playwright/launch-mobile-ui.spec.ts
```

Run from `apps/admissions/`. The gate passes (R4.10) only if every route ×
viewport cell is defect-free. Labeled full-page screenshots are captured for
`/admin/tenants` and `/admin/applications` at each viewport (R4.11).

**Evidence:** `docs/launch-evidence/04-mobile-ui/mobile-ui-evidence.json` plus
`docs/launch-evidence/04-mobile-ui/screenshots/<route-slug>--<viewport>.png`.

---

## Gate 9 — Operational_Readiness_Gate (OPERATOR-RUN)

**Requirements R9.5, R9.8.** Inspects the **production configuration** read-only
and records, for every security-relevant setting and credential, **only its name
plus a present/absent indicator — never its value**. It leaves production
configuration unchanged. The pure core (`operational_eval.py`) is structurally
incapable of recording a value; the wrapper derives booleans/lengths/counts and
discards every raw value, then routes the whole envelope through the redaction
helper as defense-in-depth.

It confirms, among others: `DEBUG` off; `SECRET_KEY` ≥ 50 chars and not a tracked
example; secure cookies, trusted origins, CORS/CSRF hosts, HTTPS redirect, HSTS
≥ 31536000 s, CSP present; per-user rate limit > 0 on every payment/auth/AI
scope; audit retention 90/365; backup/restore drill RTO ≤ 60 min and 0-row RPO
variance **(R9.5)**; and that a super-admin break-glass / recovery doc exists
**(R9.8)**.

### Operator procedure

```bash
# On the production box, with the production settings env loaded:
DJANGO_SETTINGS_MODULE=config.settings.prod \
  python3 scripts/launch-verification/check-operational-readiness.py

# Or derive facts on the box and hand a derived-facts JSON to the checker
# (the file must carry only indicators — lengths/booleans/counts, no values):
python3 scripts/launch-verification/check-operational-readiness.py \
  --inputs derived-facts.json

# Offline envelope check (no configuration read):
python3 scripts/launch-verification/check-operational-readiness.py --synthetic
```

The backup/restore drill RTO/RPO facts (R9.5) are not in code — the operator
supplies the measured values via `--inputs`; absent ⇒ conservative fail.

**Evidence:**
`docs/launch-evidence/09-operational/operational-evidence.json`. Failing
settings/credentials are recorded **by name without their value** (R9.9). Exit
is non-zero when the gate does not pass.

---

## Gate 10 — Onboarding_Smoke_Gate (DEPLOYED-TARGET)

**Requirement R10.1.** Drives the end-to-end tenant onboarding journey against
the **deployed tenant-admin API** in the canonical 11-step order, asserting each
step's result is retrievable and scoped to the created school. The
halt-at-first-failure decision logic lives in the pure `onboarding_eval.py`; the
wrapper (`run-onboarding-smoke.py`) only performs the live API calls and times
each step.

Journey: create school → assets → document profile/template → program/offering →
membership/grant → routing simulator → student application → scoped-staff read →
super-admin read → payment verified → official document. It halts at the first
failed/errored/> 60 s step and marks no later step passed (R10.12).

> Requires a disposable test-school definition and credentials (super-admin +
> scoped-staff). Use a throwaway school slug/hostname so the journey is safe to
> repeat.

### Operator procedure

```bash
# live (operator, post-deploy, against the deployed tenant-admin API):
python3 scripts/launch-verification/run-onboarding-smoke.py \
  --base-url https://api.beanola.com \
  --super-admin-token "$LV_SUPER_ADMIN_TOKEN" \
  --staff-token "$LV_STAFF_TOKEN" \
  --school-slug lv-smoke-2026-06 \
  --school-hostname lv-smoke.beanola.com

# offline envelope check (no network), all steps pass:
python3 scripts/launch-verification/run-onboarding-smoke.py --synthetic

# offline halt-at-step demo (failure injected mid-sequence):
python3 scripts/launch-verification/run-onboarding-smoke.py \
  --synthetic --fail-at membership_grant
```

Auth is token (`Bearer`) or cookie based; every value is overridable via env
(`LV_BASE_URL`, `LV_SUPER_ADMIN_TOKEN`, `LV_STAFF_TOKEN`, ...) or CLI. Endpoint
paths can be overridden with `--endpoints <json>` without editing the script.

**Evidence:**
`docs/launch-evidence/10-onboarding/onboarding-evidence.json`. The overall
status is `passed` only when every step passed; a transport error fails closed.

---

## After capturing all five gates

1. Confirm each artifact exists and is readable (the rollup probes this).
2. Run the rollup to produce the verdict:

   ```bash
   python3 scripts/launch-verification/rollup.py
   ```

3. Read `docs/launch-evidence/launch-readiness.md`. **Launch is approved only
   when the verdict is `production-launch-ready`** — i.e. all eleven gates
   passed and every artifact is readable.

## Related docs

- `docs/runbooks/post-deploy-smoke-check.md` — Gate 2 (Smoke_Test_Gate) operator
  procedure.
- `docs/runbooks/multi-tenant-beanola-rollout.md` — Neon-branch-first migration
  proof (feeds Gate 1).
- `docs/runbooks/database-backup-restore.md` — backup/restore procedures
  (`deploy/backup-db.sh`, feeds Gates 1 and 9).
- `.kiro/steering/infrastructure.md` — two-database topology, Neon-first,
  backup-first, no public Postgres port.
- `.kiro/specs/beanola-launch-verification/` — full spec (requirements, design,
  tasks).
