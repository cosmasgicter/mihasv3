# Task 0.4 — Required Evidence

**Task:** Replace gated descriptive E2E setup with an isolated local harness.
**Spec:** `admissions-v2-canonical-rebuild` · **Requirements:** R1.4, R18.1–R18.4
· **Findings:** GOV-04, TEN-07.
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).

## What was built

A fully local, disposable release harness (design §16) that replaces the old
env-gated, substantially-skipped, "descriptive" staging E2E specs (finding
GOV-04) with a strict, un-gated V2 profile.

| Deliverable | Location |
|---|---|
| Composed harness (Postgres, Redis, MinIO object storage, Mailpit console email, worker/beat, deterministic payment + domain adapters, Django backend, Caddy SPA preview) | `harness/docker-compose.harness.yml`, `harness/Caddyfile`, `harness/harness.env`, `harness/adapters/` |
| One-command entrypoint (clean-machine smoke) | `harness/bin/harness` (`harness/bin/harness smoke`) |
| Fresh-schema + platform-bootstrap seeding (only a super-admin + subjects) | `backend/apps/common/management/commands/harness_bootstrap.py` |
| Two same-shaped example tenants + active `*.localhost` domains, one shared canonical program (TEN-07) | `backend/apps/catalog/management/commands/harness_seed_tenants.py` |
| Isolated harness Django settings (external deps repointed to local substitutes; prod-parity security posture) | `backend/config/settings/harness.py` |
| API helpers: fresh users + two tenants over HTTP, no storageState, no prod credentials | `apps/admissions/tests/harness-e2e/helpers/api.ts` |
| Operational (drain) helpers | `apps/admissions/tests/harness-e2e/helpers/ops.ts` |
| Strict gate fixtures (fail on skip / console error / unasserted failed request; drain gate) | `apps/admissions/tests/harness-e2e/harness-fixtures.ts` |
| Strict Playwright profile (`chromium-required` + `mobile-required` + `gatecheck-negative` projects, no env gate, no storageState) | `apps/admissions/playwright.harness.config.ts` |
| Required smoke journeys (zero skips; run at both desktop and Pixel-5 mobile breakpoints) | `apps/admissions/tests/harness-e2e/required/harness-smoke.spec.ts` |
| Gatecheck negatives (prove each gate fires) | `apps/admissions/tests/harness-e2e/gatecheck/*.spec.ts` |
| Backend command test | `backend/tests/unit/test_harness_seed_tenants_command.py` |
| CI artifact workflow | `.github/workflows/v2-harness-smoke.yml` |

## How the four required gates are enforced (R18.4)

- **No `test.skip`** — the strict `test` overrides `test.skip`/`test.fixme` to throw (GOV-04).
- **No unexpected console errors / page exceptions** — collected per page, asserted on teardown.
- **No unasserted failed requests** — any `requestfailed` or HTTP ≥ 400 that was
  not explicitly declared via `gate.allowRequest(...)` fails the test.
- **No undrained required jobs** — the adapter observer reports Celery broker
  depth + unsettled payment collections; the required drain test fails if either is non-zero.

The `gatecheck-negative` project deliberately trips each gate and MUST fail; the
smoke asserts that, so a green suite can never be hiding a broken gate.

## Run evidence

- [`smoke-run.md`](./smoke-run.md) — full run: compose services, both project
  results, drain gate, candidate commit, and the clean-machine/CI note.
- [`playwright-required-report.json`](./playwright-required-report.json) —
  required projects (desktop + mobile): `expected: 14, skipped: 0, unexpected: 0`.
- [`playwright-gatecheck-report.json`](./playwright-gatecheck-report.json) —
  gatecheck project: `unexpected: 4, skipped: 0` (all four gates fire).
- [`playwright-report.json`](./playwright-report.json) — Playwright's live
  single-file report; the harness copies it to the two named reports above
  after each project, so it holds whichever project ran last (the gatecheck
  project in a full `smoke`/`e2e` run).

## Reproduce

```bash
# clean-machine one command (bundled Chromium; CI = GitHub ubuntu-latest):
harness/bin/harness smoke

# on an OS where Playwright's bundled Chromium is unavailable, select a
# system browser channel (does not change topology, data, or gates):
HARNESS_PW_CHANNEL=chrome harness/bin/harness smoke
```

## CI artifact

`.github/workflows/v2-harness-smoke.yml` runs `bash harness/bin/harness smoke`
on a clean `ubuntu-latest` runner and uploads this directory as the
`v2-harness-0.4-evidence` artifact (R18.5). It is intentionally separate from
`ci.yml` and path/dispatch-scoped so it does not disturb unrelated in-flight
workflow changes.
