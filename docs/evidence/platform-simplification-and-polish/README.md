# Evidence: platform-simplification-and-polish

One section per task id. Markdown summaries only; raw logs, traces and screenshots stay in CI artefacts.

## 1.1 Steering and agent-instruction truthfulness

- `tech.md`: the jobs-ops state is now "frontend over scaffold APIs, routes off behind `ENABLE_JOBS_OPS_ROUTES`, D1 freeze confirmed and not yet implemented"; the beat section cites the 21 entries of `CELERY_BEAT_SCHEDULE` (counted from `base.py`) and drops the host name; the spec-of-record path points at `_archived/`.
- `tech.md` Known Open Issues re-verified at HEAD, each against code: fixed (cleanup task path, `SessionView` envelope, payment throttles, `IsAuthenticatedOrDebug` gone, `entity_id` extraction, `ReadOnlyMiddleware` reads the env var once, `idempotency_redesign.sql` absent); one left "Unverified view by view" (raw-data views; the default `EnvelopeRenderer` wraps DRF responses); one new open issue added (admin settings `IsAdmin` read and role-string write gate versus the registry's `platform.settings.manage`).
- `product.md`: email verification stated as not implemented (D8); jobs-ops wording; `librarymanagement` line removed; finding C-15 stated as the current fact after the profile/settings bullet.
- `structure.md`: `librarymanagement` row removed; spec-of-record paths for `enterprise-tenant-authority` and `payment-hardening` point at `.kiro/specs/_archived/`. `student-journey-repair` is a live spec, so its path is unchanged.
- `enterprise-tenancy.md`: change-request workflow described as dormant by D5; spec path fixed.
- `design-skills.md` token file is `tokens.colors.json` (the `.cjs` file does not exist). `.agents/AGENTS.md` product.md line says Beanola owns the platform. `REDESIGN.md`: wordmark is Beanola, dated historical note added.
- Left alone as specified: `DESIGN.md`, `LOCAL-TESTING.md`, `docs/runbooks/local-parity.md`, storage/session/auto-save/`seed_school_admins` rows, infrastructure identifiers (D11).

## 1.2 Perf-flags runbook

`docs/runbooks/perf-flags.md`: both production values show "Unverified" (no P0_Ops_Check has recorded one); the earlier claims move to a "previously claimed" note.

## 1.3 Harness DSN default

- Found: the default in `harness/bin/harness` was the literal text `https://[email protected]/1`, which `@sentry/core` `makeDsn` rejects ("Invalid Sentry Dsn", confirmed by running it). Spec A had not changed it and no test allowed the console text (searched `apps/admissions/tests` and `harness`), so neither branch of the task's conditional applied: the value was restored and no allowance had to be removed.
- New default `https://harness@harness-invalid.localhost/1`, `${VAR:-default}` form kept.
- Test `apps/admissions/tests/unit/harnessDsnDefault.test.ts` passes; the old value fails the same parse.
