# Production Launch Finalization — Closeout Plan

Goal: drive `docs/launch-evidence/launch-readiness.md` from
`not-production-launch-ready` to `production-launch-ready` with zero fabricated
evidence. Grounded in the real gate results from the last run (verified, not
assumed):

| Gate | Status | Blocker class |
|---|---|---|
| Smoke (2) | passed | — |
| Bundle/Suite/Brand/Contract/Operational/Scope (5,6,7,8,9,11) | passed | — |
| Performance (3) | **failed** (real) | Fixable by me — code defect |
| Mobile UI (4) | **failed** (real) | Fixable by me — code defect |
| Migration (1) | unknown | Needs you — no prod DB write access |
| Onboarding (10) | unknown | Needs you — no staging super-admin credential |

Two gates I can drive to `passed` myself with real fixes + real re-runs. Two
gates are structurally blocked on your credentials/access — no amount of agent
work changes that, and I will not fabricate them. The plan below is split
accordingly.

---

## Part 1 — Gates I execute myself (Performance, Mobile UI)

### 1.1 Root cause, already diagnosed (not guessed)

**Performance — root cause confirmed from the raw Lighthouse JSON**, not just
"network latency" as I said loosely last time. Landing page (`/`) is a healthy
FCP 1.0s but `/auth/signup` and `/track-application` have **LCP 6.4s, TBT
1220ms**, driven by **2.55s of unused JavaScript** (Lighthouse `unused-javascript`
audit, `run2` report). This is a bundle-splitting defect on those two routes,
not primarily a location/latency artifact — the entry-path bundle guard already
enforces 150KB gz on `/`, but `/auth/signup` and `/track-application` are
pulling in chunks they don't need.

**Mobile UI — root cause confirmed from source**, not just the screenshot:
- `PublicSiteHeader.tsx:59` — the home logo link (`aria-label="Beanola
  Admissions - Home"`) has no explicit min-height; renders at 40×40px.
- `SharedFooter.tsx:150-159` — the "Beanola Technologies" credit link is a bare
  inline `<a>` with no padding; renders at 145.5×17px.

### 1.2 Task breakdown (dispatched as parallel subagents, same discipline as before: no fabricated status, independent re-verification after)

- [ ] **1.2.1 — Fix touch targets.** Add `min-h-touch min-w-touch` (or
      equivalent explicit `min-height:44px` + vertical padding) to the
      `PublicSiteHeader.tsx` logo link and the `SharedFooter.tsx` credit link,
      preserving existing visual design (no layout-breaking padding jumps —
      use padding, not forced line-height, so text doesn't visually enlarge).
      Add/extend a test asserting both elements meet the 44×44px minimum
      (extend the existing mobile-ui-style checks or a Testing Library
      `getBoundingClientRect`-based unit test if one already exists for nav).
      Re-run `bun run test`, `bun run build`, `bun run lint`.
- [ ] **1.2.2 — Fix the unused-JS bundle defect on `/auth/signup` and
      `/track-application`.** Identify which chunks those two routes pull in
      that they don't execute (check route-level code-splitting in
      `apps/admissions/src/routes/config.tsx` and whatever these two pages
      import — likely a shared "auth" or "public" barrel importing more than
      needed, or a non-lazy import of a heavy dependency). Apply the same
      `manualChunks`/dynamic-import pattern already proven for the vendor-sentry
      split (see prior session: `vite.config` `manualChunks` + lazy Sentry
      import). Re-run `bun run build`, inspect the resulting chunk sizes for
      those two routes specifically, and re-run
      `bun scripts/launch-bundle-guard.ts` to confirm no budget regression.
- [ ] **1.2.3 — Re-run the real evidence generation for both gates** using the
      exact same scripts as before (`run-lighthouse.mjs --base-url
      https://apply.beanola.com --runs 3` after the fix is **deployed**, not
      just built locally — Lighthouse against `apply.beanola.com` only sees
      what's live; the mobile-UI headless-chrome pass similarly targets the
      live URL). This means **1.2.1/1.2.2 must ship through CI → deploy before
      1.2.3 can produce a truthful "passed" artifact.** Re-running the harness
      against a not-yet-deployed fix would silently measure the old code and
      either falsely pass or falsely still-fail — both are unacceptable.
- [ ] **1.2.4 — Independent re-verification** (me, not the subagent): re-read
      the diffs, re-run the targeted tests myself, and only then re-run
      `rollup.py`.

### 1.3 Ship cycle for Part 1 (same discipline as every prior session)

1. Local verify (lint/type-check/targeted tests/build/bundle-guard).
2. Grep for any test asserting the *old* touch-target sizes or *old* chunk
   boundaries before pushing (avoid a repeat of the CI-red cycles).
3. Commit only the intended files (touch-target CSS fix, bundle-split fix,
   their tests) — leave the other ~18 currently-uncommitted files from the
   prior session untouched/separate, per Requirement 1 (release hygiene — no
   mixing unrelated buckets in one unit).
4. Push, poll CI, watch Deploy.
5. Once live, re-run the Performance and Mobile UI evidence harnesses against
   production for real, re-run `rollup.py`, report the real result.

### 1.4 Exit criteria for Part 1

- `docs/launch-evidence/03-performance/performance-evidence.json` status
  `passed` (Lighthouse median ≥90 on all 3 public routes, API p95s within
  budget or explicitly re-baselined with justification if af-south-1 network
  physics make a stated budget unreachable — see risk note below).
- `docs/launch-evidence/04-mobile-ui/mobile-ui-evidence.json` status `passed`
  for every check that doesn't require auth; auth-gated checks remain
  `not-measured` (that's correct per Requirement 5.9 — not a blocker for those
  specific checks, but the rollup's own `is_passing()` logic must be
  confirmed to treat `not-measured` as acceptable, not failing — I will verify
  this against `evidence.py` before declaring done, not assume it).

### 1.5 Risk: API latency budget may be physically unreachable from my vantage point

Last run's API p95 measurements (400-800ms) were taken from this machine to
`api.beanola.com` (af-south-1) — cross-continent latency is a real floor I
cannot code my way out of. Before re-running, I will re-check whether
`sample-api-timings.py` is meant to run **from inside the deployment's own
region/network** (check its `--help` and any CI/staging invocation convention)
rather than from my location. If the harness is designed for a CI runner or a
box near the target, running it from here will always show inflated p95s
regardless of any code fix — that's a measurement-location bug, not a product
defect, and I will say so explicitly rather than either fabricate a pass or
wrongly fail a working system.

---

## Part 2 — Gates that need you (Migration, Onboarding)

I cannot generate truthful evidence for these without credentials/access I do
not hold. Below is the exact, complete runbook — already written to
`docs/runbooks/operator-gated-launch-actions.md` sections F and G — repeated
here as a checklist so this plan is self-contained.

### 2.1 Gate 1 — Migration_Evidence_Gate

- [ ] You run the real migration steps (Neon branch dry-run → apply →
      `check_schema_drift`; then EC2 box: `./deploy/backup-db.sh` → apply →
      re-apply to prove idempotency → dump `migration_history` rows).
- [ ] You (or I, once you hand me the captured output) assemble
      `/tmp/migration-inputs.json` per section F of the operator doc.
- [ ] Run `record-migration-evidence.py --inputs /tmp/migration-inputs.json`.
- [ ] Shred the temp inputs file (may contain internal paths).
- [ ] **If you want, hand me the captured raw command output (not
      credentials) and I will assemble the inputs JSON and run the recorder for
      you** — the recorder itself is read-only and safe for me to run once you
      supply the facts.

### 2.2 Gate 10 — Onboarding_Smoke_Gate

- [ ] You generate a staging super-admin bearer token or session cookie
      out-of-band (sign in as a real staging super-admin) and export it as an
      env var — never paste it into chat or a committed file.
- [ ] Run `run-onboarding-smoke.py --base-url https://staging.beanola.com
      --super-admin-token "$STAGING_SUPER_ADMIN_TOKEN" --school-slug
      launch-check-<date> --school-hostname launch-check-<date>.staging.beanola.com`.
- [ ] Repeat once more with a second `--school-slug` to prove repeatability
      (Requirement 4.12).
- [ ] Deactivate both test tenants; confirm no active staff scope still
      references them (Requirement 4.11).
- [ ] **If you export the token into this shell session's environment only
      (never share it with me directly), I can run the harness command for you
      and report the result** — I just cannot generate or obtain the token
      myself.

### 2.3 Why these two cannot be shortcut

- `record-migration-evidence.py` is explicitly a **recorder**, not a runner —
  by design it never touches a database, so there is no code path for me to
  "just run it" without your captured facts.
- `run-onboarding-smoke.py` performs **real writes** (creates a tenant,
  memberships, an application, a document) — running it against production
  would violate the "never treat prod DB as first-write target" rule, and
  running it against staging requires an actual staging super-admin identity,
  which is an access-provisioning decision, not something an agent can
  self-grant.

---

## Part 3 — Final rollup and go/no-go

- [ ] After Part 1 ships and both new artifacts read `passed`, and after you
      complete Part 2 (or hand me captured facts/a token to finish it), re-run
      `python3 scripts/launch-verification/rollup.py`.
- [ ] Confirm all 11 gates show `passed` with `readable: yes` — re-check each
      artifact against `evidence.py`'s schema requirements directly (as I did
      this session for mobile-ui) rather than trusting a first-pass write.
- [ ] Walk the Requirement 8.3 Go/No-Go checklist item-by-item against the
      final `launch-readiness.md`, not from memory.
- [ ] Only then report `production-launch-ready` — and only if it is actually
      true.

## What "perfect" means here, concretely

Not "all green at any cost." It means: every gate that *can* be proven by
running real code against a real target *is* proven that way, every gate that
*cannot* be proven without credentials I don't hold is labeled `unknown`
rather than faked, and the two fixable failures get real root-cause fixes
(bundle-splitting, touch-target CSS) rather than threshold-lowering or
evidence-massaging. I will not change a passing threshold to make a failing
measurement pass.
