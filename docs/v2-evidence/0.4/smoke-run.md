# Task 0.4 — Isolated local harness smoke run

_Admissions V2 canonical rebuild · task 0.4 · R1.4, R18.1–R18.5 · findings GOV-04, TEN-07._

The isolated local E2E harness (design §16) replaces the old gated, descriptive
staging E2E setup with a fully local, disposable stack. This file records a
real run of the strict V2 profile — every number below is copied from the
Playwright JSON reports and the live adapter observer in this directory, not
described.

- timestamp (UTC): 2026-07-15T06:52Z
- candidate_commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`)
- one-command entrypoint: `harness/bin/harness smoke`
  (this run drove the equivalent staged commands `up` → `e2e` against one
  freshly-seeded stack at the same commit)
- edge (Caddy): http://localhost:8090
- backend (Django ASGI): http://localhost:8000
- console email (Mailpit): http://localhost:58025 (livez → 200)
- deterministic adapters: http://localhost:59099 (`/__/health` → ok)
- browser: Playwright driving system Google Chrome via the `HARNESS_PW_CHANNEL=chrome`
  escape hatch (see "Environment note" below)

## Compose services (all local, disposable, seeded fresh)

```
SERVICE    IMAGE                       STATUS
adapters   mihas-v2-harness-adapters   Up (healthy)   # deterministic payment + domain + drain observer
beat       mihas-v2-harness-beat       Up             # Celery beat
caddy      caddy:2-alpine              Up             # edge: SPA + same-origin /api proxy (Host preserved)
mailpit    axllent/mailpit:latest      Up (healthy)   # console/test email inbox
minio      minio/minio:latest          Up (healthy)   # S3-compatible local object storage
postgres   postgres:17-alpine          Up (healthy)   # tmpfs — wiped + re-seeded every `up` (prod-parity major)
redis      redis:7-alpine              Up (healthy)   # broker + cache
web        mihas-v2-harness-web        Up (healthy)   # Django API (harness_bootstrap + harness_seed_tenants on boot)
worker     mihas-v2-harness-worker     Up             # Celery worker
```

No service points at Neon, Cloudflare R2, Zoho, Resend, or the real Lenco
gateway. Every external dependency is a local, deterministic substitute. The DB
is seeded with only platform bootstrap data (one super-admin + canonical
subjects) plus the two example tenants created by `harness_seed_tenants`.

Tenant resolution proof (by request Host, over the same-origin edge):

```
mihas.localhost  -> {"portal_type":"white_label","institution_code":"MIHAS", ...}
katc.localhost   -> {"portal_type":"white_label","institution_code":"KATC", ...}
localhost        -> {"portal_type":"shared","institution_id":null,"brand":{"owner":"Beanola Technologies"}}
```

The neutral host fails closed to neutral Beanola branding (no MIHAS/KATC leak),
and the two tenant institution IDs are distinct (TEN-07 / TEN-10).

## Strict Playwright projects (R1.4 / R18.4)

### `chromium-required` + `mobile-required` — MUST pass with zero skips

Desktop (Desktop Chrome) and mobile (Pixel 5) run the same required specs at
their respective breakpoints, satisfying the desktop + mobile requirement in
the §16.1 journey matrix and R18.2.

```
stats: { expected: 14, skipped: 0, unexpected: 0, flaky: 0 }   # 7 specs × 2 projects

✓ [chromium-required] edge serves the admissions SPA cleanly (no console errors, no unasserted failed requests)
✓ [chromium-required] provisions a fresh user through the public API with no stored state
✓ [chromium-required] resolves two isolated tenants and a neutral context by host (TEN-07 / TEN-10)
✓ [chromium-required] super-admin can create a tenant institution + domain via the admin API
✓ [chromium-required] deterministic payment adapter honours the Lenco collection contract
✓ [chromium-required] deterministic domain adapter publishes and returns DNS records
✓ [chromium-required] zz required background jobs are drained (R18.4)
✓ [mobile-required]    (same 7 specs at the Pixel 5 viewport)
```

Report: [`playwright-required-report.json`](./playwright-required-report.json)
(`expected: 14, skipped: 0, unexpected: 0`).

### `gatecheck-negative` — MUST fail (proves the strict gates actually fire)

```
stats: { expected: 0, skipped: 0, unexpected: 4, flaky: 0 }

✗ gatecheck: an unexpected console error fails the run
✗ gatecheck: an unasserted failed request fails the run          (net::ERR_NAME_NOT_RESOLVED, not allow-listed)
✗ gatecheck: calling test.skip converts to a failure             (no-skip gate, GOV-04)
✗ gatecheck: an undrained background job fails the run           (unsettled_payment_collections=1, R18.4)
```

All four negative specs fail, so each gate — `test.skip`/`test.fixme`,
unexpected console errors, unasserted failed requests, and undrained required
jobs — is proven to fire. The harness script asserts this project fails, so a
green suite can never be hiding a broken gate. Report:
[`playwright-gatecheck-report.json`](./playwright-gatecheck-report.json)
(`unexpected: 4, skipped: 0`).

## Drain gate (R18.4)

After the required project (and after the gatecheck project reset its
deliberately-unsettled collection), the adapter observer reports:

```json
{"broker_queue_depth": 0, "celery_queues": ["celery"], "unsettled_payment_collections": 0, "unsettled_references": []}
```

Broker queue empty and no payment collection left unsettled: required
background work drained.

## Environment note (clean-machine reproducibility)

`harness/bin/harness smoke` installs Playwright's bundled Chromium on a clean
CI machine (GitHub `ubuntu-latest`) and runs there without any extra flags —
that is the CI artifact path (see `.github/workflows/v2-harness-smoke.yml`).

On this local workstation (Ubuntu 26.04) Playwright's *bundled* Chromium build
is not published (`Playwright does not support chromium on ubuntu26.04-x64`),
so this run used the system Google Chrome via the built-in escape hatch:

```bash
HARNESS_PW_CHANNEL=chrome harness/bin/harness smoke   # or: up + e2e
```

`HARNESS_PW_CHANNEL` only selects an already-installed system browser channel;
it changes neither the harness topology, the seeded data, nor the strict gates.
The default (unset) path remains the bundled-Chromium clean-machine/CI run.
