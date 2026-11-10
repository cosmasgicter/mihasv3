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

## 2 Checkpoint: start condition

Recorded 2026-11-09. Nothing here was changed; this is what was found.

**Journey_Gate state at the base.** Base commit `84b72f853` (Spec A, PR #208 head). The `Student Journey Gate` workflow passed on that exact commit (run 42690877669, pull_request) and on the two heads before it (runs 42680271961, 42641473279). Earlier heads failed (three runs), so the gate has passed on the last three heads. Locally, the baseline run for this spec failed once (mobile project: two console 401s and one failed request on `/api/v1/auth/profile/`) and passed on a rerun with no change, so the one-401 flake rule applies.

**Not met, so task 2 stays open.** The checkpoint asks for the gate to be green *and blocking in CI on `main`*:
- The gate has not reached `main`: it lives on the Spec A branch stack (#207, #208), which is not merged.
- Required-check wiring is an operator step and has not been done. `main` has no branch protection (`GET branches/main/protection` answers 404).

**Deploy pause (Spec A DEC-10).** Not in force. The repository's environments are `Preview`, `Production` and three older `production-*` names; the `Production` environment has no protection rules (no required reviewers, no wait timer), and the repository is public. `deploy.yml` still runs on every green `CI` run on `main` and on manual dispatch. Spec A's task 2.6 (the operator step that adds required reviewers) is listed as pending in Spec A's final report. So a merge of this stack to `main` reaches production with no approval. This is the single most important fact for the person who merges.

**Pointer for the operator who approves Spec A task 6.2.** Before approving, read the `Deploy path` lines of this spec's tasks 3.7, 4.1, 4.2, 4.5, 5.1, 5.2, 7.1, 7.2, 12.2, 13.1, 14.x and 16.x in `tasks.md`; Spec A task 6.1's checklist does not mention them. Also confirm the pause is still in the form task 2.6 chose: an environment with required reviewers holds only while the repository is public on the Free, Pro and Team plans.

## 3.1 Routes-versus-callers report

- `scripts/routes_report.py` builds `build_backend_route_catalogue()` once with `ENABLE_JOBS_OPS_ROUTES` off and once on (inside `override_settings`, reloading `apps.common.email_urls`, `apps.documents.urls` and `config.urls`, then `clear_url_caches()`), keys routes and callers by `(version, segments)`, and gives every route one class.
- First run at HEAD: 225 routes, 174 `caller`, 6 `consumer`, 12 `gated`, 33 `baselined`, 0 offenders after the lists below. The 12 gated routes exist only with the flag on (`/api/v1/jobs/` among them; a test pins that).
- The first scan reported 44 offenders. Four scanner limits were found by checking offenders against the source and fixed in the scanner, not papered over in the baseline: query-string suffixes (`${buildQueryString(...)}`), a path constant used with an id (`${SAVED_FILTERS_ENDPOINT}${id}/`), nested braces in template expressions, and unprefixed literals (admissions literals count only in `services`, `hooks`, `lib`, `stores`, `contexts`).
- `scripts/route-consumers.json` (6 entries): the Lenco webhook, the schema, docs and redoc pages, the legacy error-report endpoint, and the email delivery webhook ("pending D1.b").
- `scripts/routes-report-baseline.json` (33 entries, each with a reason, 31 naming a decision): the v2 demo views and onboarding routes, the six change-request routes (D5), four jobs-ops document routes and the Zoho connect route (D1), the admin template routes, `/admin/tenant-audit/`, the condition-verify route, two catalogue detail routes, and one scan limit (`official-documents/*/email/`, built through a helper call and checked by hand at `services/officialDocuments.ts:255`).
- CI: three steps in the `backend` job after the dependency install: run the report, upload its JSON, run `scripts/tests/test_routes_report.py`.
- Tests: 24 pass, including the live check that the repository passes its own report.

## 3.2 Unreachable-module check

- `scripts/unreferenced-modules.ts` walks reachability from `apps/admissions/src/main.tsx` over non-test imports using `collect` and `resolveTsSpecifier`, now exported from `scripts/module-size-report.ts`, whose last line is `if (import.meta.main) main()`. Its report is byte-identical before and after (text and `--json`, compared with `cmp`).
- First run: 606 modules, 57 unreachable (the critique's heuristic said 22). One is allowlisted (`vite-env.d.ts`); 56 are baselined with a reason each, including 2 fixture mirrors that only drift-guard tests import and 2 dev-preview hooks. This measured list is the input for D15 item (d).
- Limits are in the script header: unused exports, uncalled callbacks and barrel-held modules are listed by hand.
- CI: a blocking `Unreachable modules` step in the `admissions` job. Run it as `bun run ./scripts/unreferenced-modules.ts` (the bare form `bun scripts/...` is not resolved by this Bun version in this directory).

## 3.3 Doc-path and skill-path check

- `scripts/check_doc_paths.py` with the candidate, normalisation and resolution rules of design §6; `scripts/doc-paths-allowlist.json`; `scripts/skill-paths-baseline.json`.
- First run at HEAD reported 31 missing paths (30 plus the two dangling symlinks, less `.pem`, an extension fragment the candidate rule now ignores). Fixed (stale): `tokens.colors.cjs` and the font directory in `DESIGN.md`, `useFeeResolver.ts` and the applications `tasks.py` in `tech.md`. Allowlisted with reasons (absent on purpose): the "do not assume" paths, five retired names, `MobileBottomNav.tsx`, and the model-field descriptor. Allowlisted as history (8 structure-steering table rows, deleted with task 9.1, which the stale-entry rule forces): the entries marked "leaves with task 9.1".
- `src/` is not reported, as the design predicted (it resolves under `apps/admissions/`).
- Dangling links `.kiro/skills/playwright` and `.kiro/skills/playwright-best-practices` are baselined, tied to D6.
- CI: `Doc and skill paths` in `backend-drift-guards` (no `paths:` filter, so it runs on every change); `scripts/tests/test_check_doc_paths.py` (23 tests) in `spec-governance.yml`, whose `paths:` lists gained the script, the allowlist and the skill baseline.

## 3.4 Spec status markers

- `validate_spec_governance.py --enforce-status` applies the two-way rule to every live spec and nothing else. `scripts/spec-status-exceptions.json` lists the four D12 specs.
- A dry run at HEAD failed exactly the five specs the design predicted: `beanola-launch-verification` (55/55 checked), `communications-history` (45/45), `student-payment-interview-pages` (17/17), `profile-updates` (12/12, a D12 exception) and `full-platform-remediation-2026-07` (completed with 26 required tasks open).
- Metadata fixes: removed `"status": "completed"` from `full-platform-remediation-2026-07`; added it to `beanola-launch-verification` and `communications-history`; created `.config.kiro` for `student-payment-interview-pages` (fresh spec id, `requirements-first`, `feature`, completed). The rule passes on the live tree.
- One existing test changed, by name: `test_all_specs_audit_detects_known_false_completed` in `scripts/tests/test_validate_spec_governance.py` pinned `full-platform-remediation-2026-07` as the falsely-completed spec, which this task intentionally fixes. It now asserts the live tree has none; detection itself is still proven by the synthetic rule-5 fixtures. Ten new tests cover the new rule (both directions, optional `*` tasks, `[-]` and `[~]`, archived specs, exceptions, a missing spec, a missing reason, the live tree).
- CI: blocking `Spec status markers` step in `spec-governance.yml`; its `paths:` lists gained the exceptions file.

## 3.6 Agent run directories

`.agents/tasks/` added to `.gitignore`; `git check-ignore -v .agents/tasks/x/y.md` reports the `.gitignore` rule (before, only a local `.git/info/exclude` rule matched).

## 1.3 addendum: one existing test changed

With the DSN parseable, the app's error reporter now really sends an error to `harness-invalid.localhost` (loopback, connection refused). `tests/harness-e2e/required/admin-dashboard-metrics.spec.ts:363` ("the dashboard says Unknown when its read fails") causes a 500 on purpose, so its report failed the gate in the broad matrix (chromium project). Changed, by name: that spec now declares `gate.allowRequest('harness-invalid.localhost')`, which 13 other specs already use, and allows the exact URL-less console echo `Failed to load resource: net::ERR_CONNECTION_REFUSED`. The assertions on the page are unchanged. The old setup encoded the behaviour this task intentionally changes (a reporter that could not parse its DSN and so never sent anything). Design §1 says an error the reporter sends "has already failed the run", which is not true for a spec that allows the error, so this is recorded as a contradiction in the run directory. Rerun after the change: the spec file passes 10/10 (desktop and mobile).

## 3.5 Property tests

- Property 4 ("every route gets exactly one class") and Property 5 ("stale baseline entries fail") are hypothesis tests in `scripts/tests/test_routes_report.py`, which the `backend` CI job runs.
- The TypeScript mirror of Property 5 is a set of fast-check properties in `apps/admissions/tests/unit/unreferencedModules.test.ts` (`// @vitest-environment node`): a removed module, a module that became reachable, and a still-unreachable one. They run in the admissions `bun run test`.
- All pass (24 Python, 12 TypeScript).

## 3.7 Harness browser runs stay inside the stack

- **Widget stub:** `GET /js/v1/inline.js` on the adapter defines `window.LencoPay.getPaid` and calls `onClose`, charging nothing. Caddy's `handle_path /__lenco/*` proxies to it with the prefix stripped. `harness/bin/harness` exports `VITE_LENCO_WIDGET_URL=/__lenco/js/v1/inline.js` (`${VAR:-…}` form).
- **Resource hints:** the three preconnects moved out of `index.html` into the `beanola-resource-hints` plugin (`vite.config.ts`, rules in `apps/admissions/scripts/resourceHints.ts`). The assumption is stated in the plugin and next to `VITE_API_BASE_URL` in `deploy/RUNBOOK.md`, with no new host name. Checked with real builds:
  - `VITE_API_BASE_URL=https://api.beanola.com` and an empty widget variable emit exactly the API preconnect (crossorigin) and the `pay.lenco.co` preconnect. The sandbox hint is gone, because that build never loads the sandbox widget.
  - The harness values emit no hint.
  - Unit tests cover the rules and pin the constants against `apiConfig.ts` and `useLencoWidget.ts`.
- **Static check:** `scripts/check-local-build-hosts.ts` runs after `build_spa` in `harness/bin/harness`. It passed on the harness build and fails on the production build, naming both hosts. Unit tests (32) cover Open Graph and Twitter meta tags, canonical links and icons (not counted), IPv4 and IPv6 literals, and protocol-relative URLs. Host rules live in `apps/admissions/scripts/stack-hosts.ts`, shared with the runtime gate.
- **Name resolution:** `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE *.localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]"`, set through `launchOptions` in all five harness configurations: the base, 13-2, 13-3, 13-6-L5-L6 and the journey gate. The rendered gate does not exist yet (task 22.1 adds it). `playwrightConfig.test.ts` asserts the argument in each config and per project. It also asserts the shared fixtures register no `route`, so the HTTP cache stays on.
- **CSP:** `connect-src`, `img-src`, `font-src` and `frame-src` were narrowed from `*` to `'self'` plus loopback, `*.localhost` and the compose service names.
- **Outside-host gate:** the listeners now live on the browser context (`request`, `requestfailed`). CSP violations are reported through `context.exposeFunction` and `addInitScript`. Hosts are recorded whatever the allowances say, and only the host is printed. Browser-internal schemes (`chrome-extension://`, `chrome://`) are not network hosts. The first gate run found Chrome's PDF viewer reported as two "outside hosts", and this exclusion fixed it.
- **Gatecheck probes:** CSP refusal, top-level navigation and popup, all under `.invalid`. Run against the live stack, all three failed as designed, each naming its host. The navigation and popup also showed `ERR_NAME_NOT_RESOLVED` from the resolver rule. The four existing probes still fail as designed, 7/7 failed in total. Drain was clean afterwards. IP literals have unit tests only, no browser probe.
- **Journey gate:**
  - Run 1 never started: an import path that Playwright's loader could not resolve, fixed by moving `stack-hosts.ts` under the app.
  - Run 2 failed only on the PDF-viewer pseudo-hosts, fixed as above.
  - Run 3 passed: 4/4, storage, edge and drain checks included.
- **Broad matrix:** `harness smoke` (local, system Chrome, port override): 347 passed and 5 failed, with **no outside-host violation** on any test.
  - 4 of the failures are Spec A's recorded baseline families: the axe viewport sweep at 375x667 (both projects; a `color-contrast` finding on the wizard) and CLS in `viewport-pixel-matrix` (both projects).
  - The 5th is the dashboard spec in the 1.3 addendum, caused by this group and fixed. Because the required projects failed, `smoke` stopped before gatecheck, so gatecheck was run separately (above).
  - The task's done-condition (no outside-host violation, no failure outside Spec A's smoke baseline) holds after the fix. A full re-run of the matrix after the fix was not done: one hour per run. The fixed spec file was rerun on its own.
- **Deploy path:** while Spec A's pause holds, through an approved Deploy run; otherwise the normal automatic deploy. Task 2 found the pause **not** in force. Production effect: only the frontend image's `index.html` hints change. Precondition (Unverified): production's `VITE_API_BASE_URL` Actions variable names the API origin. If it does not, the only effect is a missing API preconnect. Rollback: revert the commit.
## 4.1 Production defaults out of base settings
- `base.py` now defaults `HEALTH_CHECK_URL` and `KEEP_ALIVE_URL` to `""`, `FRONTEND_URL` to `http://localhost:5173` and `EMAIL_HOST` (env `ZOHO_SMTP_HOST`) to `localhost`. `prod.py` sets today's values explicitly (`https://api.beanola.com/health/ready/`, `/health/live/`, `https://apply.beanola.com`, `smtp.zoho.com`); environment variables still win in both. `staging.py` reads `FRONTEND_URL` and `HEALTH_CHECK_URL` with an empty default and adds both to `REQUIRED_ENV_VARS`; `local_real.py` sets `http://localhost:5173` and an empty health URL after its staging import. The harness keeps its own values.
- Measured with real subprocess imports (no `.env` in the worktree): staging refuses to start naming both variables; `local_real` and `harness` start with them unset; `prod` resolves the four production values.
- Tests that relied on the old defaults (full backend run, 5 failures, 3 baseline): `tests/property/test_email_dispatch.py` reset-email test (now `override_settings(FRONTEND_URL="https://apply.beanola.com")`, as the spec says), `tests/property/test_uptime_task.py` (names a `HEALTH_CHECK_URL` because the task now returns early on an empty one), and `tests/unit/test_startup_env_validation.py::test_control_with_every_variable_set_starts[staging]` (placeholders for the two new required staging variables). Setup only; no assertion changed.
- Behaviour change for developers: `dev.py` no longer defaults `EMAIL_HOST` to Zoho, so a dev run without SMTP settings sends to `localhost` instead of the real provider.
- **Deploy path:** while Spec A's pause holds, an approved Deploy run; otherwise the normal automatic deploy. Task 2 found the pause **not** in force. Production effect: `prod.py` supplies the same four values, proven by `test_prod_module_resolves_todays_values` (task 4.3). Rollback: revert the commit.

## 4.2 Scheduled tasks and link helpers stop falling back to production
- `keep_alive_task` and `check_uptime_task` return early with one INFO log naming the empty setting. `_get_platform_base_url()` returns `""` and logs one WARNING per process naming `FRONTEND_URL` (no value); `outbox._safe_action_url` reads `FRONTEND_URL` with an empty default, so an absolute action URL yields none.
- `tests/unit/test_empty_frontend_url_links.py` (4 cases): path-only links, one warning that names the setting and not a host, absolute action URL rejected, a configured value still builds absolute links.
- **Deploy path:** as 4.1. Production effect: none while production sets the values, which 4.1's `prod.py` does.

## 4.3 Outbound-defaults tests
`tests/unit/test_settings_outbound_defaults.py` (13 cases). Subprocesses run with `TESTING` and `PYTEST_CURRENT_TEST` removed and placeholder variables only: staging refusal (stderr holds no placeholder value), `local_real` and `harness` start, `prod` resolves today's values, a source scan of every non-production module for a production or Zoho host default, and both tasks make no request (`requests.get` patched to raise).

## 4.4 Steering beat table pinned to the schedule
`tests/unit/test_steering_beat_table.py` compares the table in `tech.md` with the last dotted segment of every `CELERY_BEAT_SCHEDULE` task. It found five drifts, all corrected in the table: `cleanup_idempotency_keys` became `cleanup_idempotency_keys_task`, and four scheduled tasks had no row (`condition_reminder_task`, `sweep_pending_domain_verifications_task`, `sweep_pending_official_document_jobs_task`, `reconcile_document_storage_task`). `keep_alive_task` stays until task 14.8.

## 4.5 CI admissions build stops defaulting to the production API
`ci.yml` `VITE_API_BASE_URL` falls back to `http://localhost:8000`; `deploy.yml` is untouched. With that value (and the other CI defaults) the job's `type-check`, `check:imports`, `build`, Bundle_Guard and PDF chunk check all pass locally. `bun run test` and `bun run lint` ran in the group suites.

## 5.1 Split and lock the requirements
- `backend/requirements.in` (runtime, `cryptography` moved here from the test block, jobs-ops `openai` section and comment kept) and `requirements-dev.in` (`-r requirements.in`, `-c requirements.txt`, test packages). Both compiled in `python:3.12-slim` with pip-tools 7.6.2 (released 2026-10-07, older than 14 days) and `--generate-hashes --strip-extras`. `--strip-extras` is needed because a constraint file cannot carry extras (`uvicorn[standard]`). The command is in both `.in` headers and in `tech.md`. Result: 75 runtime pins, 89 dev pins, no package at two versions.
- Install from the lock verified: `uv pip install --require-hashes -r backend/requirements-dev.txt` into a fresh Python 3.12 venv, then the whole backend suite on those versions (see the group summary).
- Existing tests changed, by name: `tests/unit/test_no_admissions_generative_ai_guard.py::test_requirements_scopes_the_generative_sdk_to_jobs_ops` and `::test_server_side_ocr_dependencies_are_retained` read `requirements.in` instead of `requirements.txt`. The declarations (and the jobs-ops-only comment section) now live in the `.in` file; the lock has no comments and lowercases names. The assertions are unchanged. `test_dead_deps.py` still reads the lock and passes.
- **Deploy path:** while Spec A's pause holds, an approved Deploy run; otherwise the normal automatic deploy. Production effect: the image installs exact locked versions, which can differ from what the old ranges resolved to in the running image. Precondition met locally: the backend suite passes on the locked versions. Rollback: revert the commit (the old range file is in history).

## 5.2 Runtime-only image
- `backend/Dockerfile` runs `pip install --no-cache-dir --require-hashes -r requirements.txt`. `scripts/check_backend_image.py` (stdlib, runs inside the image) fails naming any importable test-only module, any `requirements.in` distribution that is not installed, and a failing `cryptography.fernet` import. CI job `backend-image` builds the image and runs it.
- Measured: the image built from the lock; the check printed `backend image check ok`; with `pytest` and `hypothesis` pip-installed into a copy of the image it exited 1 naming both. 6 unit cases in `scripts/tests/test_backend_lock_scripts.py`.
- Moving `cryptography` out of the test block is proven by the runtime import above (`audit_network.py` needs `cryptography.fernet`).
- `git grep` of `requirements.txt` consumers: `Dockerfile`, `ci.yml`, `backend-governance.yml`, `pyproject.toml` comments, `backend/DEPLOY.md`, `tech.md`, README quick start (still valid: the runtime lock installs with or without `--require-hashes`). The harness and the three local compose files build the same Dockerfile.
- **Deploy path:** as 5.1. Production effect: the image no longer carries the test packages. Precondition met locally (image check). Rollback: revert the commit.

## 5.3 Dev lock in CI and freshness
- Every backend `pip install` in `ci.yml` (3) and `backend-governance.yml` (2) now uses `--require-hashes -r requirements-dev.txt`. `pip-audit -r requirements.txt` is unchanged (runtime lock).
- `scripts/check_requirements_lock.py` copies the two `.in` files and both locks to a temporary directory, runs the recorded command there (same image, pin and file names) and diffs both locks; `--versions-only` fails, naming the package, on a package pinned at two versions.
- Measured cost: hashing downloads every published wheel of every pin, about 3,100 files; the first compile of the pair took about 105 minutes and the freshness run about 30 minutes on this machine (timing varies with the network). So the CI job `backend-locks` always runs the helper self-test and the version check, and runs the full recompile only when `requirements*.in|txt` or the script changed in the push or pull request (or when the base cannot be determined). The job allows 180 minutes. This narrows the requirement's literal "recompile on every run" to the runs that can make a lock stale; recorded as a reading in `contradictions.md`.
- Freshness result on the committed locks: `python3 scripts/check_requirements_lock.py` (full run, Docker, temporary copy) printed `requirements locks ok`: both recompiled locks were byte-identical to the committed ones, which also confirms the header line carries no output-file name (design §10 had this as Likely).

## 5.4 Document the lock workflow
`tech.md` Backend table (Python 3.12 for host virtual environments, the lock files) and Commands (recompile, hash-checked install, freshness), `backend/DEPLOY.md` and the `pyproject.toml` header. The doc-path check passes.

## 6.1, 6.2, 6.4, 6.5, 6.8: not done
- **6.1 (open, operator-assisted):** needs a Neon branch created from the authoring branch with the user's go-ahead and an explicit branch id. No Neon tool is available in this session and the brief forbids touching the Neon default branch, so no baseline was captured. `backend/scripts/00_full_schema.sql` is unchanged.
- **6.2, 6.4, 6.5 (open):** they load and test against the captured baseline. The existing `00_full_schema.sql` is a DDL generated from the models with no `django_migrations` rows, so the session order the spec requires (load, then `migrate`, then `apply_sql_migrations`) cannot work on it: `migrate` would try to create tables that already exist. Switching the test database to it would be improvising, so `unmanaged_schema` and the hand-copied index block stay, and the four CI Postgres services stay on 16 (Postgres 17 is only needed to load a `pg_dump` 17 baseline).
- **6.8 (blocked, D14):** needs a live production host.

## 6.3 Isolate workers and clean up after transactional tests
- `base.py`: `JTI_REDIS_URL` next to `CELERY_BROKER_URL` (defaults to it, so production keeps its Redis database); `tokens._get_redis` reads it. In the `_is_testing` block: `CELERY_BROKER_URL=memory://`, `CELERY_RESULT_BACKEND=cache+memory://`, `ImproperlyConfigured` naming the limit above 7 xdist workers, and `JTI_REDIS_URL` built from `REDIS_URL` with `urlsplit()._replace(path=...)` (database 8 without xdist, 9+N for `gwN`).
- `tests/conftest.py`: session autouse `_assert_isolated_test_infrastructure` (names the setting and the expected database number, never a URL) and autouse `_truncate_unmanaged_tables_after_transactional_tests`, which runs after a test marked `django_db(transaction=True)`, using `transactional_db`, or a `TransactionTestCase`, and truncates every `public` table except managed-model tables and `migration_history` / `django_migrations`.
- Tests: `tests/unit/test_test_settings_isolation.py` (5: `gw3`, no xdist, 7 workers allowed, 8 refused, production default keeps the broker database; each checks the result backend) and `tests/integration/test_unmanaged_table_cleanup.py` (a row written to `analytics_snapshots` in one transactional test is gone in the next, and `django_content_type` / `auth_permission` still hold rows). The cleanup test failed before the fixture existed (`1 != 0`), then passed.
- Finding while doing it: this pytest-django version does not list `transactional_db` in `request.fixturenames` for a `django_db(transaction=True)` marker (the work is done by `_django_db_helper`), so the fixture reads the marker too.
- **Deploy path:** none; test-only plus a setting whose default is today's value.

## 6.6 Harness database (local-database half only)
`backend/apps/common/local_database.py` `require_local_database(command_name)`: allowlist `localhost`, `127.0.0.1`, `::1`, `postgres`, refuses production settings (`DJANGO_SETTINGS_MODULE` ending `.prod` or `ENVIRONMENT=production`), raises `CommandError(returncode=2)`, never prints the URL. Called first in `harness_bootstrap` and `harness_seed_tenants`, replacing both four-string denylists. `tests/unit/test_local_database_rule.py` (16 cases): each allowlisted host, six remote forms (Neon, private IP, look-alike hosts, empty), production settings over the `postgres` host, `ENVIRONMENT=Production`, and both commands call it first. The existing `test_refuses_non_local_database` still passes unchanged because the message keeps "non-local host". **The switch of `harness_bootstrap` to the baseline-plus-scripts path stays open** (it needs 6.2's loader and 6.1's baseline), so 6.6 is not ticked.

## 6.7 Whole backend tree in CI (code side only)
CI job `backend-full-tree`: `postgres:17` and `redis:7` services, `pytest -n 6 tests`, 30-minute timeout, dev lock installed. The task stays open: its first step ("confirm the four services run `postgres:17` after 6.2") depends on 6.2, the two consecutive green runs have not happened, and making it a required check on `main` is an operator step (**pending**, repository settings).
## 7.1 Replace the hardcoded readiness in the metadata endpoint
- `GET /api/v1/meta/platform/` no longer returns `status: "production_ready"`; it returns `features: {jobs_ops: settings.ENABLE_JOBS_OPS_ROUTES}`. The `Cache-Control` header is unchanged (kept as the task says). `PlatformMetaSerializer` gained `PlatformMetaFeaturesSerializer`.
- OpenAPI: `openapi.v1.baseline.yaml` and `openapi.v2.candidate.yaml` and `apps/admissions/src/generated/api.d.ts` were edited by hand for `PlatformMeta` only (`status` removed, `features` and `PlatformMetaFeatures` added). A full `manage.py spectacular` regeneration was tried first and produced about 10,000 unrelated lines in the v1 baseline (it had drifted before this spec) plus unrelated `int64` and field changes in the candidate and the types, so those were restored; regenerating them whole is not this task. `lint_baseline.json` gained one warning (`jobs_ops` should be camelCase, the same class as the existing `api_version` entry) and its summary counts moved by one.
- Tests changed, by name: `test_platform_meta.py::test_platform_meta_uses_beanola_admissions_domain` (the old assertion `status == "production_ready"` encoded the fixed claim this task removes; it now asserts `status` is absent), `test_jobs_ops_endpoints.py::test_platform_meta_is_public_and_includes_attribution` and `test_version_drift_guard.py::test_runtime_meta_endpoint_reports_distinct_api_version` (added assertions). New: `test_platform_meta_reports_jobs_ops_configuration` (both flag values, header still present).
- **Deploy path:** an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy, together with 7.2. Production effect: the metadata response loses `status` and gains `features.jobs_ops`. Only the jobs-ops build read `status`, and 7.2 stops that in the same commit range, so the two must ship in one Deploy run.
## 7.2 Read the jobs-ops status from the backend
- `services/api/platform.ts` maps `features.jobs_ops` to `features.jobsOps`, adds `source: 'backend' | 'demo'`, requests with `cache: 'no-cache'` (`apiClient.get` now takes an optional `{cache}`), and the demo fallback has no `production_v1_seeded` and `source: 'demo'`. `describePlatformStatus` gives "Jobs-ops enabled", "Jobs-ops not enabled" or "Demo data. Backend not reached.".
- `JobsOpsShell.tsx`: the sidebar "Live backend" card is removed and the header chip shows the status text, with the tone tied to the source (warning for demo). `IntegrationsPage.tsx` had the same chip and got the same text. "Readiness chips" in the task were these two; no other chip reads `status`.
- Truth map "Platform attribution metadata" row now names `features.jobs_ops` and the mirror. `apps/jobs-ops/tests/unit/platformMeta.test.ts` (5 cases) includes the one that reads the OpenAPI baseline and fails if it stops describing `features.jobs_ops` or still lists `status`.
- jobs-ops `type-check`, `lint`, `vite build` and `vitest run` (38 tests) pass.
- **Deploy path:** as 7.1; same Deploy run.
## 7.3 Pin the admissions email route
`backend/tests/unit/test_email_send_route_without_jobs_ops.py`: with `ENABLE_JOBS_OPS_ROUTES=False` and the URLconf reloaded, `/api/v1/email/send/` resolves; a second case proves the flag really was off by requiring `/api/v1/jobs/` to be unresolvable. The URLconf is reloaded back afterwards.
## 7.4 Metadata property test
Property 8 in `backend/tests/property/test_platform_simplification_properties.py` (hypothesis, both boolean values): `features.jobs_ops` equals the flag and `status` is absent. The file is new; tasks 26.6 and 18.3 add their properties to it.
## 8.1 Capability inventory and D3 merge table (draft)
- `scripts/capability_inventory.py` (standard library; 8 unit cases in `scripts/tests/test_capability_inventory.py`) reads the two catalogues and the grant tables by AST, then records per capability the backend sites, frontend gates, test files, grant signature and update set. Output: `docs/evidence/platform-simplification-and-polish/8.1-capability-inventory.md`. No catalogue entry changed.
- It reproduces the design's measured facts: `platform.user.create_global` has 0 backend and 0 frontend sites and a 6-file update set; `tenant.domain.read` has 0 backend and 3 frontend sites; `tenant.application.review` has 40 backend sites; the three `*.request_change` strings have update sets of 8, 9 and 17 files.
- **Proposed merge table for D3: no merges.** Rule used: two capabilities are candidates only if they are always granted together (same grant signature) and no gate site names exactly one of them. Result: none. Every group granted together (the eight default read capabilities; the five `manage` mutations) is told apart by at least one enforcement or frontend site. The only change D3 option B leaves is task 17.1 (`platform.user.create_global`), plus 17.2 for the three `request_change` strings, which is blocked by the D3/D5 conflict. Task 17.3 therefore has nothing to apply unless you name a merge yourself.
- Limit stated in the report: sites that build a name from a variable (`tenant.<kind>.request_change` in `change_request_service.py` and `change_request_v2_views.py`) are listed separately, so "no literal site" is not read as "no gate".
## 8.2 Skill keep-list for D6
`scripts/skill_keep_list.py` (4 unit cases) and `8.2-skill-keep-list.md`: 16 kept skills, each with its one real copy. `neon-postgres` lives only in `.agents/skills/neon-postgres` (kept through its symlink). Dangling links to delete in 15.1: `playwright`, `playwright-best-practices`. Second real copy: `.agents/skills/ui-ux-pro-max`. `.agents/skills/open-design` is referenced by no live source other than this spec, so it is not on the list; confirm when D6 is attached. `.kiro/skills/agenthub/` is not on the list. Twelve other symlink targets lose their entry and target in 15.1.
## 8.3 Exact items for D15
`8.3-d15-items.md` lists items (a) to (i) with file and line counts, the tests each removal touches, and the order constraint (`slipService.ts`, item i, imports `@/lib/pdf`, item a). Differences from the spec text, recorded: item (d) has 52 files and 4,936 lines (the critique estimated 22 and 2,853) and is split into 16 with no test naming them, 22 named by 1 to 3 tests, and 11 named by 4 or more (held for a per-file decision); item (f) has one unit-test file, not five; item (c) has 32 imports and 25 patch targets in 17 test files; item (b) touches `test_student_journey_e2e.py` step 7, which must move to the canonical `/applications/drafts/` routes.
## 9.1 Steering history to an archive
16 "Files Added During ..." and "Files Removed During ..." sections moved verbatim by script into `docs/archive/steering-history-2026.md` (header names source commit `bd855b035`), and `structure.md` went from 651 to 234 lines with a short linked section in place. Eight allowlist entries in `scripts/doc-paths-allowlist.json` named paths that only appeared in the moved text, so the check's stale-entry rule required deleting them (the diff is those 8 entries only). `check_doc_paths.py` passes and its 23 self-tests pass. The "Documentation Files" section stayed in `structure.md` (it lists current docs).
## 9.2 DESIGN.md components and tokens
§4 now lists only the components that task 3.2's import graph shows reachable from `main.tsx`: 19 names with a file but no importer (for example `LoadingSpinner`, `FormFeedback`, `SaveStatusIndicator`, `ProgressIndicator`, `Stepper`) were dropped, and so was the "78 primitives" count. The wizard rule names `EnhancedProgressIndicator`. `tokens.colors.json` was already the name in §1 and in `design-skills.md`; the file on disk is `.json`. `BuildVersionBadge` entry unchanged. §2 Print/PDF is left for task 14.1.
## 9.3 Steering verified against HEAD
Each row of the critique's §6 table, re-read at this commit:
- Corrected earlier in this spec (task 1.1/1.2/3.x, checked now): rows 4, 5, 6, 8, 9, 10, 11, 18, 21, 23, 25, 26. Row 21 states that C-15 is open and the defect has no owner.
- Corrected by Spec A (checked now): rows 13, 14, 15, 20.
- Corrected in task 9.3: row 19. `tech.md` now says which jobs-ops reads need a session and that the app has no sign-in page; it says the 401 rendering was not re-checked.
- Not corrected, owner named: rows 1, 3 (`LOCAL-TESTING.md`, task 11.1); row 2 (`.env.local.test`, task 11.2); row 7 (the beat table no longer says Koyeb or 17 tasks; the `keep_alive_task` row still says "Koyeb cold starts" and goes with task 14.8; `structure.md` still described the scaling playbook as Koyeb-only, corrected in this task); row 12 (`launch-readiness.md`, task 11.4); row 16 (the D11 operator track); row 17 (D14, a live host); row 22 (DESIGN.md's four rendered-output rules, P2 tasks 23 and 24); row 24 (UI copy, task 27.1).
- New checks registered in the truth map's "Drift Guard Inventory": routes report, unreachable-module check, doc-path check, spec status check, outbound defaults and beat table tests, image and lock checks, the metadata test and property; the two analysis scripts are listed as tools, not gates.
## 10 Checkpoint: P1 decision-independent work
- **Green at this commit:** routes report (0 offenders), unreachable-module check (0 offenders), doc-path check, spec metadata and governance validators, backend `-n 6` (3 failed = the baseline `test_legacy_column_contraction_12_3.py` trio, 5721 passed), admissions 5004 passed, jobs-ops type-check/lint/build/tests. Lock files and the image check were last run in G2 and nothing since touched `requirements*`. Task 3.7 and 1.3 (G1) hold, so P2's rendered gate can start.
- **Requirement 22 guardrail tests:** the backend suite contains them and they pass with the rest: payment ownership split (`apps/admissions` unit tests), upload validation and staged write order (`test_required_documents_contract*.py`, `test_document_evidence_compensation_7_3.py`, `requiredDocumentsDrift.test.ts`), idempotent submission. Cross-tenant property tests are untouched.
- **Still open, to ask the user (not blocking):** D17 (links inside running text versus the 44 px rule; recommendation: keep the guardrail and fix the link; task 24.8); D1.b (`webhooks/delivery/`; task 12.1); the D3/D5 conflict over the three `*.request_change` capabilities (task 17.2); the D3 merge table above, which proposes no merge (task 17.3); finding C-15 (add to Spec A or leave open).
- **Waiting for a live production host (D14):** 6.8, 16.1, 16.2. **Operator-gated:** 6.1 (Neon capture), 6.7 and 22.5 (required checks), 11.2 hand-over.
- Open from earlier groups, unchanged: 2 (operator steps), 6.1, 6.2, 6.4, 6.5, 6.6, 6.7.

## G4: tasks 11, 12, 13 (local stack, jobs-ops freeze, demo views)

### 11.1 One documented local stack (R1.1-1.4, 1.6-1.10)
- `harness/bin/local-setup.sh` checks Docker with Compose v2, Bun, Git, curl and python3 3.8+ (exit 3 naming the tool), runs `bun install --frozen-lockfile`, then `harness up`. `LOCAL-TESTING.md` and `docs/runbooks/local-parity.md` are rewritten around it, with the outside-host table. `tech.md` Commands names it.
- Tests: `scripts/tests/test_local_setup_doc.py` (document block equals script), `test_local_setup_prereqs.py` (stub PATH lacking one tool at a time, exit 3). Both run in `ci.yml` `backend-drift-guards` beside the doc-path check.
- `harness journey-gate` now exports its four values and calls `local-setup.sh` in place of `build_spa`/`compose_up`/`wait_healthy`. Spec A tasks 4.1-4.5 were present in the base (84b72f853). Run log shows the stack brought up once (one "starting the harness stack", one SPA build) and the four values inside the web container. Spec A's workflow is not edited for this. Existing-test change: `test_journey_gate_configuration_sjr.py` stage order (old assertion encoded the bring-up this task replaces).
- Not verified: a fresh machine, an ARM machine.

### 11.2 Retire other local stacks (R1.7): code side done, OPERATOR-GATED
- Removed: `local-stack-storage` job, the compose assertions in `test_storage_settings_contract.py` (settings assertions kept), `.env.local.test.example` with its `.gitignore` exception, allowlist entry and env-template entry, and `backend/docker-compose.local-test.yml`, `docker-compose.local-real.yml`, `docker-compose.yml`. Removal safety: `git grep` shows no remaining reachable consumer (CI, harness, docs, steering); doc-path check green.
- Spec A clause 2.1 (storage round trip on the documented stack) is met on the harness by `storage_roundtrip_check --expect-private` in `journey-gate`. Not ticked: the operator must first remove `local-stack-storage` from the required checks on `main`; the PR must not merge before that. Pending, not done by me.

### 11.3 Untrack raw evidence (R4.1-4.3, 4.9)
- 2,274 of 2,585 tracked files under `docs/v2-evidence/` removed from the index (`git rm --cached`, no history rewrite); `.gitignore` rules added; `docs/v2-evidence` is 17 MB tracked. `scripts/evidence_refs.py` found 88 editable Markdown files naming them; each has a dated note with the permalink to f19289a4d. Three references sit in spec files (`admissions-v2-canonical-rebuild/findings.md`, `tasks.md`, this spec's `design.md`) and were listed, not edited.
- `v2-harness-smoke.yml` uploads the run-scoped directory only. Existing-test change: `test_evidence_dir_convention_l8.py::test_ci_still_publishes_task_0_4s_evidence_deliberately` replaced by an artefact-only assertion (the old one pinned the opposite behaviour).
- Both validators pass in the working tree and in a fresh `git worktree` of the commit (raw files absent).

### 11.4 Cut the launch-verdict rollup (R4.5, 6.1)
- Removed: Gate 12 job and verdict step, the three `collect-suite-results.py` steps and uploads, `rollup.py`, `collect-suite-results.py`, `rollup.json`, `launch-readiness.md`, the migration/performance/operational/onboarding evaluators and recorders, Lighthouse, timings and mobile-UI scripts, and their eleven tests. Proof: `git grep` for each removed script name finds no import in kept code. Kept and still passing: contract-sync, brand-scan, scope, `version_eval.py`, smoke evaluator. `launch-verification.md` rewritten for the kept gates; three runbooks carry a dated note.

### 12.1 Seven routes behind the flag (R3.3, 3.5, 3.7): PARTIAL, left unticked
- `email_urls.py` and `documents/urls.py` add the seven routes only when `ENABLE_JOBS_OPS_ROUTES` is on; `send/` always mounted. The scope gate lists the seven (14 stubs probed, 0 reachable; with the flag on it correctly fails). Schemas, lint baseline untouched (api-quality OK), `api.d.ts` regenerated, routes-report baseline cleaned. `tests/jobs_ops_urls.py` reloads the modules in the right order; seven existing tests use it. Tests for both flag values: `test_jobs_ops_route_gating_12_1.py`. Existing-test change: the Zoho envelope test turns the flag on (assertion unchanged).
- Waiting on D1.b: `webhooks/delivery/` stays mounted, entry "pending D1.b". Production effect: the seven routes answer 404 while the flag is off. Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.

### 12.2 Jobs-ops UI state (R3.6, 13.3)
- `FeatureGate` and `JobsOpsNotEnabled` at the router root, error state with Retry. `featureGate.test.tsx` proves no feature request fires while disabled or on metadata failure. `router.test.ts` wraps routes in the gate (setup only). jobs-ops: type-check, lint, build, 41 tests pass.

### 12.3 Steering wording (R6.1, 6.5)
- `tech.md`, `product.md`, `structure.md` and the truth-map attribution row state the decided freeze.

### 13.1 Remove v2 demo views (R2.6, 2.9)
- Removed `demo_views.py`, five routes, public-policy and authority-matrix entries, baseline entries and the per-view contract tests (cross-cutting envelope tests kept). Proof: routes report showed no first-party caller; `git grep` finds no import. Schema candidate and `api.d.ts` regenerated. Production effect: the v2 demo routes answer 404.

### 13.2 Change requests, option C (R2.7, 2.9, 6.5)
- Six routes added to `route-consumers.json` as "dormant by decision D5" and removed from the baseline. Workflow, service, state machine and the three `*.request_change` capabilities untouched.

### G4 results
- Backend pytest -n 6: 3 failed (baseline `test_legacy_column_contraction_12_3.py`), 5620 passed. Admissions: 5004 passed/1 skipped, lint, build, type-check pass. jobs-ops pass. manage.py check pass; circular imports unchanged (3 known); routes, unreachable-module, doc-path, spec validators pass.
