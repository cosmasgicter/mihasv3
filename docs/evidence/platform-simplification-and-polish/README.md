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
## G5: tasks 14 to 21 (unnumbered removals, skills, capabilities, OCR, D8, D12, P1 exit)
Removal safety for every task below: `git grep` of each removed name across apps, backend, scripts, workflows, harness, docs, steering and `.kiro/hooks` after the removal; the remaining hits are history (`docs/audits`, `audit-results`, `docs/v2-evidence`, `all-files.txt`), comments that say the path is gone, or guard tests that pin the absence. The routes report (0 offenders), the unreachable-module check (0 offenders), the doc-path check and both spec validators were green at the group head.
### 14.1 Dev-only @react-pdf stack (R2.8, 2.9): c2fda88cf, da7bd7ddf
- Removed `src/lib/pdf`, the `/dev` preview pages, fonts, PNGs, 13 tests, `@react-pdf/renderer`, the CI PDF chunk smoke step and `check-pdf-chunk-load.mjs`. The two fonts the crest script needs moved to `backend/scripts/assets/fonts`. `DESIGN.md` Print/PDF now describes the backend renderers. `documentFlowDriftGuard` keeps its rule with an empty allowlist. Remaining `lib/pdf` hits are comments stating official documents never use it. The nine brand-allowlist entries for deleted files were dropped (the guard fails on stale entries). Deploy path: approved Deploy run while Spec A's pause holds, else the normal automatic deploy.
### 14.2 Draft compatibility endpoint (R2.8, 2.9, 2.10): 9303fcfee
- Removed `ApplicationDraftView`, its route, `applicationService.saveDraft` and their tests; `/api/v1/applications/draft/` now answers 404; model and table kept. Multi-draft and auto-save use `/applications/drafts/{id}/` and the wizard's own `saveDraft` (a different function, same name). `test_student_journey_e2e.py` step 7 moved to the canonical routes. Schema candidate and `api.d.ts` regenerated; truth map updated.
### 14.3 `applications/views.py` shim (R2.8, 2.9): 4f88b2988
- 17 test files repointed to the defining modules first, backend suite run, then the shim deleted. Tests changed by name: `test_production_readiness_views`, `test_compatibility_surfaces_12_2` (shim register 6 to 5), `test_canonical_import_boundaries`, `test_live_500_fixes`.
### 14.4 Modules with no product importer (R2.8, 2.9): 341665785
- Removed 48 modules and 6 tests that only exercised them; 5 tests repointed to the live owner or to the file's absence. The unreachable baseline keeps only the drift-guard fixtures (check now reports 524 modules, 3 unreachable, 0 offenders).
### 14.5 Placeholder apps (R2.8, 2.9): cd79f580d
- Removed `apps/website`, `apps/student-portal`, their two Dockerfile COPY lines, their `bun.lock` workspace entries and the steering rows. `bun install --frozen-lockfile` passes and `bun run build` passes.
### 14.6 Agent hub (R4.8): 19598c710
- Removed `scripts/agenthub`, `.agenthub`, their unit tests and the smoke test. No workflow, hook, steering or `.agents` file referenced them. Only an untracked `__pycache__` directory remains locally.
### 14.7 Stray root files (R4.8): 7ab28a64a
- Two files removed with exact quoting; the two empty untracked directories are absent from a clean worktree.
### 14.8 `keep_alive_task` (R9.3): 54db40dc7
- Removed task, beat entry, `KEEP_ALIVE_URL`, test assertions and steering rows. The beat-table guard stays green. Remaining hits: a historical regression-table entry in `test_go_live_polish_regression.py` and a note in `deploy/RUNBOOK.md`. Production effect: beat stops pinging its own health endpoint every 4 minutes.
### 14.9 Dead upload paths (R2.8, 2.9, 22.12): 71b0111e5
- Removed `documentService.upload`, `useWizardFileUploads`, the `startUpload` stack, `lib/storage.ts`, `applicationSlipStorage.ts`, `slipService.ts` and their tests. `uploadPathSingleSource` keeps its guard with an empty frozen list. The four R22.12 guard tests are unchanged and pass.
### 15.1, 15.2 Skills (R4.6, 4.7, 6.1): f4965c762, b617de9a2
- Pruned to the D6 keep-list (option B): 310 `.kiro/skills` entries and 12 `.agents/skills` targets, the second `ui-ux-pro-max` copy and the two dangling symlinks with their baseline entries. `api-design-reviewer` is kept because CI's `api_quality.sh` runs its linter (recorded in contradictions.md). Impeccable, ui-ux-pro-max, design-for-ai, a11y-audit and the four engineering skills are kept. Steering and `.agents/AGENTS.md` section 3 name the kept set. Skill-path check green.
### 16.1, 16.2 Performance caches: BLOCKED
- Need a live production host and the P0_Ops_Check (D14). Nothing changed.
### 17.1 Remove `platform.user.create_global` (R8.1, 8.2, 8.5, 8.6, 22.1): 0858df457
- Spec A's P0 was present in the base. Catalogue is now 16 platform and 17 tenant. Updated the 8.1 update set (authority matrix registry and v2, perf fixture, truth map, permissions plan, enterprise-tenancy and tech steering). Regression test `test_removed_capability_grant_17_1.py`: a grant naming it grants only the read bundle and raises nothing. Two count assertions 17 to 16 are named in the commit. Cross-tenant property tests unchanged and green.
### 17.2 BLOCKED, 17.3 DRAFT ONLY (R8.3, 8.4): 98a93a39e
- 17.2 waits for the D3/D5 answer. 17.3: the merge table is drafted for the user's approval; it proposes no merge and nothing was applied.
### 18.1 to 18.3 OCR opt-in (R6.6, 11.1 to 11.5, 22.1, 22.9, 22.12): 9db23844b, f216e6096, 8cabf864e
- `ocr_policy.py`; 409 `OCR_NOT_ENABLED` after scoped authorization with nothing queued; run-time re-check in the task; `GET/PUT /api/v1/admin/documents/ocr-opt-in/` gated by `platform.settings.manage` with one `settings.change` audit event per write; the key is omitted from generic settings reads, writes return 403 `KEY_MANAGED_ELSEWHERE`, import reports it, reset keeps it. Codes registered in backend, frontend mirror and truth map. 18.2: `ocr_available` on the required-documents contract with a drift guard; the wizard extracts and polls only when true, manual grade form first. 18.3: Property 9 (hypothesis) and docs. Upload validation and staged write order untouched. Existing extraction tests opt their institution in (setup only). Production effect: the extract endpoint refuses every institution until one opts in; 18.1 and 18.2 ship in the same Deploy run.
### 19.1 Email verification stance (R6.1, 6.5): 5784f04b0
- `product.md`, `tech.md` and the truth map state D8 option B and point to the `email_links.py` note.
### 20.1 Spec relationships (R6.3, 22.10, 22.11): e05fc9275
- The truth map registers Spec B as superseding `student-ui-ux-mobile-remediation` for student surfaces and lists the three record-only overlaps. `scripts/spec-status-exceptions.json` already lists the four D12 specs and is in step. None of the four specs was edited; no `status` added to this spec.
### 21 Checkpoint: P1 exit
- Documented_Local_Stack passes the Journey_Gate (see g5-evidence.md for the run); routes and doc-path checks green; backend `-n 6` on the SQL-built test database shows only the 3 known baseline failures.
- Still waiting: 6.8, 16.1, 16.2 (live host, D14); 12.1 webhook step (D1.b); 17.2 (D3/D5 answer); 17.3 (merge table approval); 11.2 hand-over (operator drops `local-stack-storage` from required checks). Requirement 7.2's production comparison stays open until 6.8 runs. Open questions: D17, D1.b, D3/D5, merge table, C-15.

## G6 (P2): rendered design gate, contrast, typography and copy

Run with a fresh harness stack per comparison (the admin queue's row positions depend on how many applications exist, so a reused stack gives different selectors). Screenshots are viewport-only at device scale factor 1 and are not committed; they are in the run directory.

### 22.1 to 22.4, 22.6, 22.7 Rendered gate (R19.1 to 19.7, 12.8, 15.2, 13.2): 18d10ad3c, 5dd632151, c9427d181, 6a864f233
- `playwright.rendered-gate.config.ts` (desktop 1440x900, mobile 390x844, no retries, one worker) over 19 audited pages x 2 viewports = 38 visits, each state built by `buildGateWorld` through the harness API helpers. Per page: network idle, screenshot, axe (wcag2a/aa/21/22), measurements (390 only), impeccable's browser detector last. The build-badge check fails a visit by itself (0 hits in 38).
- `scripts/rendered-gate-rules.ts` is the pure classifier; units: `renderedGateSelector.test.ts`, `renderedGateRoles.test.ts` (role precedence on DOM fixtures, spill and truncate cases); Property 11 in `platformSimplificationPolish.property.test.ts` (6 tests).
- Diagnostics: font-size and hit-area findings carry the element text or accessible name in `detail` (not part of the key).
### 22.5 Baseline and blocking job (R19.4 to 19.6): 824e4c6f1
- First run: 946 entries, each with a reason and an `impeccable/`, `axe/` or `measure/` prefix. `rendered-design-gate` added to `student-journey-gate.yml` (45 min, no `continue-on-error`, `impeccable@2.1.9` with `PUPPETEER_SKIP_DOWNLOAD=1`, Chromium via `bunx playwright install`, relevance prefix `scripts/rendered-`, artefact upload). No new third-party action.
- Test changed: `test_journey_gate_configuration_sjr.py` asserted exactly one job; it now expects both and covers the new prefix. Assertion of the first job is unchanged.
- OPERATOR STEP PENDING: after two green runs on `main`, make `rendered-design-gate` a required check. Task left open for that reason.
### 23.1 Status-tone map (R18.2, 18.1): 73ae7a356 (see 0e08bfdca, e13ee0b8b)
- `lib/statusTone.ts`; `StatusPill`, `StatusBadge` and `Alert` adopt it (StatusPill colours and icons unchanged; Alert's tone text on 5% tints becomes `text-foreground` on 10% tints, icon keeps the base colour). The "admin chips and student document rows" use `StatusBadge`.
- Tests changed: `productDesignDeFluff` (primitives now read the tone classes from the map; same fill/border/label rule), the Alert colour-consistency property test (reads the tone map).
### 23.2 Alpha text tokens (R18.3): after 0e08bfdca
- 20 uses at this HEAD (the 23 in the spec predates the task 14 deletions) replaced per design section 12 Phase 5. `textTokenAlpha.test.ts` scans `src/`. `text-white/NN` (25 in the spec's count) left as decided.
### 23.3 Solid fills on tints (R18.4, 18.5)
- SubmitStep "Go to step" and "Fix" buttons, and the landing closing paragraph (`text-accent`) as specified. Also fixed, same defect class: the landing closing heading was `#0f172a` on `#0f172a` (1.0:1, found by the detector), and `text-warning-foreground` / `text-destructive-foreground` / `text-success-foreground` / `text-primary-foreground` (all white) on 5-10% tints in six more places (profile badge, eligibility chips, advanced keys, conditions list, next-action card, sessions notice). All now `text-foreground`.
### 23.4 Meaningful icons (R18.6)
- `text-accent` (1.2:1) icons and text on light surfaces became `text-accent-foreground` in 11 files. The identity-document tile named in the spec no longer exists at HEAD; no other tile uses `text-accent` for a status icon.
### 23.5 Property 6 (R18.2, 18.4, 18.6)
- Computes ratios from the hex values in `design-tokens.css` over white, card and muted for all 7 tones: labels >= 4.5:1, both icon options >= 3:1.
- Baseline: the 8 `axe/color-contrast` and `impeccable/low-contrast` entries these tasks fixed were deleted (payment method sub-labels, landing closing section).
### 24.1 Student mobile text 16 px (R16.1, 16.8, 19.7)
- `text-base sm:text-sm` on paragraphs, labels, buttons and the form primitives; `Button` sets `data-text-role="control"`; the helper-text paragraphs are captions. Measured on 390 px: student `measure/font-size` findings 369 to 19 after 24.1 and the 24.7 walk, to 0.
### 24.2 Arbitrary sizes (R16.1, 16.2)
- 31 `text-[Npx]` uses removed per the design table; count circles 18 to 20 px.
### 24.3 Spelling and case (R16.3, 16.4)
- User-facing "Program(s)" to "Programme(s)" (identifiers, routes, `{{program}}` tokens, CSV headers and backend-sourced strings untouched) and title case to sentence case on headings, buttons, labels, navigation, status labels (`formatApplicationStatus` fallback too). Data values (subject names, nationalities, eligibility enums) left. `DocumentButtons` says "Prepare acceptance letter" (noun after the verb).
- Existing tests whose old assertion encoded the old copy were updated (about 30 assertions across 20 files: admin pages, tracker, contact, nav, error display, document UI states); journey-gate and harness specs updated: `/^Submit Application/` to `/^Submit application/`, `/Download Slip/` to `/Download slip/`, "Programme information", "Programme offering(s)".
- Left for the user: CSV export headers (`exportUtils.ts`, "Program", "Application Number") and email template subjects are user-visible but are data/integration surfaces; not changed.
### 24.4 Optional marker (R16.5)
- `OptionalMarker` in the shared label of Input, Textarea, PasswordInput, CanonicalSelect/FormSelect and AnimatedInput via an `optional` prop; asterisks removed everywhere (including admin dialogs and the contact page); `required` and `aria-required` kept. `optionalFieldMarker.test.ts` includes a source scan for asterisk markers.
### 24.5 Copy mechanics (R16.6, 16.7, 16.9)
- 92 em dashes in UI prose replaced (full stop or colon); lone "-" placeholders for empty values left for 26.5; 64 `...` to the ellipsis character (the wizard-draft-slow-network spec updated); `max-w-prose` on SectionCard, PageHeader, tracker hint and the review summary; payment total in `font-mono`.
### 24.6 Hit areas (R16.10, 19.9, 22.8): 61d996bd4
- Hit-area findings 57 (incl. 4 inRunningText) to 14: password toggle, auth back link and footer links, profile badge, school contact links, review tabs, review close button, filter and refresh icon buttons. Remaining 14 are the 4 running-text links (D17, task 24.8) and 10 admin queue checkboxes (task 30.4).
### 24.7 Captions and badges (R16.1, 19.7)
- `StatusPill`, `StatusBadge`, `Badge` captions `text-sm sm:text-xs` with `data-text-role="caption"`; walk of `text-xs` in student pages and components (139 edits by element: paragraph, list item, label or button to `text-base sm:text-sm`; other intrinsic elements to caption). No "other" exceptions were needed. Also a 390 px overflow regression from 24.1 on the super-admin school list fixed (`grid-cols-[minmax(0,1fr)]`, wrapping header row); the one remaining clipped long school name is a baseline entry for 30.6.
### 24.8 BLOCKED (D17)
- Not touched. The 44 px guardrail is unchanged; the four D17 entries stay with their reason.

## G7 (tasks 25 to 29): wizard chrome, truthful status, honest promises, developer artefacts, landing
Verified at 4fa821a41 on a fresh harness stack: rendered gate 38/38 visits, compare PASS (baseline 534 to 476: 60 fixed entries deleted, 8 re-keyed, 2 added with the documented Inter reason); journey gate PASS. Screenshots are viewport-only at DSF 1 and stay in the run directory.
### 25.1 One heading and one instruction per step (R15.1, 15.7, 22.5): b168ac0b3
- The step title is the page H1, with its instruction beside it from the one step config. Removed: the Application Flow eyebrow, the Student Application card, each step's duplicate title and intro, the mobile Back to Dashboard row. The back arrow uses history only for an in-app previous entry (`wizardBackNavigation.test.ts`).
### 25.2 One "Still needed" list (R15.3, 15.7, 22.2, 22.13): 531375c30
- `WizardStillNeeded` lists the current step's failing readiness items with Go to field, keeps the platform check (task 6.5 blockers) as its own section, and carries Switch application and Start a new application. It is a disclosure below the form on mobile and one rail card on desktop. Removed: Step Checklist, Application Preview, Step notes, Your applications, and their unused builder and copy constants.
### 25.3 Accessible names contain visible text (R15.4): 7eb940da1
- Previous and Next step are named by their visible text, and the destination moved to `aria-describedby`. The journey-gate and required harness specs reach the control as "Next step" (selector-only edits).
### 25.4 Heading order and one statement of the file rules (R15.5, 15.6): 07143607f
- The header account name is no longer an H2, step headings start at H2, and requirement headings are H3 (`wizardHeadingOrder.test.ts`). The upload control states "PDF, JPG or PNG, up to 10 MB" once.
### 25.5 First field in the first mobile screen (R15.2): 0a581fe68
- On a phone the header is just the app bar, the H1 and instruction, and one progress row; the bar animates with `scaleX`. The rendered gate's wizard first-control measurement reports no finding on any wizard step at 390x844, and there are no baseline entries for it.
### 25.6 Property 7 (R15.4): 196f5bed1
### 25.7 Unique education option keys (R15.8, C-18): 5df21279c
- `__cat_<group>_<category>` values. The builder is now a pure module with a unit test covering both groups.
### 26.1 Stepper and percentage from one Readiness (R14.1, 14.2): e8805aae5
- The percentage is floor(passing/total) of `wizardReadiness`, and `stepStates` come from the same object. A visited step with failing items shows the warning icon plus the word Incomplete. `useOverallProgress` and the index-before-current shortcut are removed.
### 26.2 Incomplete alert only after a Continue attempt (R14.4): 22fb52fad
### 26.3 Next actions in wizard step order (R14.3): 39b4d9384
- `build_next_actions` stable-sorts by `STEP_RANK`, with submit leading when the application can be submitted. Property 3 is in the backend property file. OpenAPI regenerated with no diff.
### 26.4 Full fee estimate on the assigned-school step (R14.5, 22.2, 22.4, 22.13): e10c4785b, follow-up 0513bdf92
- `fee_preview_payload` (fee_quote_service) serves both resolve-fee and the assignment preview, using the quote mint's `_money`, so the estimate total equals the minted quote. The single payment path and the ownership split are unchanged: the wizard estimates before submission and the payment step confirms. The follow-up sets the total line in Inter instead of monospace.
### 26.5 Missing data is not shown as a value (R14.6, 14.7, 14.8, 22.10): 310e933ac
- Missing values are left out, not printed as "Not provided" or "Not available". `documentStatePresentation` is the one document-state map, with a drift guard against the backend `DOCUMENT_STATES`, registered in the truth map.
### 26.6 Status properties (R14.1 to 14.3, 14.5): 056dacfdf
- Properties 1 and 2 are frontend; Properties 3 and 10 are in `backend/tests/property/test_platform_simplification_properties.py`.
### 27.1 Promise inventory (R20.1): 6d849f293 (landing rows: 29.3, ac44151fb)
| Statement (before) | Backing code | Result |
|---|---|---|
| Interest list: "We will contact you if a place opens" | Stored in this browser only; no backend call | False. Now "Reminder saved on this device. It does not tell admissions…" |
| Settings: phone "Reused for SMS notification delivery", "SMS delivery uses the phone number" | No SMS sender (only email and the in-app inbox) | False. Removed; the notice card names the inbox and the account email |
| Landing: "Takes 2 minutes", "30 minutes" | No measurement | Unsourced. Removed (29.3) |
| Landing: "You also get an email and an SMS", "We review within a few working days" | Email only; no review SLA promised to students | False. Now "you get an email when something changes" |
| Landing: "we will convert" Cambridge results | Eligibility engine accepts both; there is no conversion service | Overstated. Now "the eligibility check accepts both" |
| Landing: room booking, visa letters, USD tuition invoices | No housing, visa or tuition feature | False. Rewritten as "contact the school" |
| "Your progress is saved automatically" | Wizard auto-save (draft outbox) | True, kept |
| "Your exact application fee is shown before you pay" | Fee quote mint + payment step | True, kept |
| "You see every update in the portal" | Status page + notification polling | True, kept |
- Test changed: `AssignmentRecoveryPanel.test.tsx` pinned the old interest-list wording; it now pins the new sentence (2 assertions before and after).
### 27.2 Support contact from the tenant resolver (R20.2): d131672a1
- `Interview.tsx` uses `resolveTenantSupportContact`. New test `noHardcodedStudentEmail.test.ts` fails if a student surface hardcodes an email address.
### 27.3 Trust note, admin subtitle, workspace label, reschedule prompt (R20.3 to 20.5): landed in d131672a1
- Deviation: these edits went into the 27.2 commit instead of their own; history is not rewritten. `git log -S` traces each one to d131672a1:
  - `AuthShell.tsx`: "Your session lasts 7 days. We never share your information." became "You stay signed in on this device until your session ends. Sign out on a shared device." (Spec A's sessions: 30-minute access token with refresh, so the fixed 7-day claim was wrong).
  - `Applications.tsx` subtitle: "payment proof" became "payment status".
  - `WorkspaceAside.tsx`: "Latest payment review note" became "Latest note from admissions", because the note is the admin's review note, not only about payment.
  - `Interview.tsx`: the reschedule prompt renders only when `interviews.length > 0` (covered in `page-verification/student-interview.test.tsx`).
- Observation, not changed: `Applications.tsx:449` still has a fallback string "No payment proof uploaded. Proceed anyway?", used only when the review API returns no message. It is admin-facing and outside 27.3's named lines; it is recorded for 31.x/30.x.
### 27.4 Letter copy (R20.6, D9 option C): 4fa821a41
- Spec A `[R7.4]` is in base: e7589a18f (5.4 student surface for a letter the school has not set up) is an ancestor of HEAD. This spec writes no new letter copy. The one existing letter promise (`landing.ts:123`, school profile and template) does not promise neutral fallback branding, and it moves with the school-buyer content in 33.2. New test `letterCopyAlignment.test.ts` fails on any rejection-letter mention, any "letter is ready" or fallback-branding claim, or a letter type beyond `acceptance_letter`/`conditional_offer`.
### 27.5 Developer self-narration removed (R20.7): f63445266
- New test `noDeveloperNarration.test.ts` checks the quoted phrases.
### 28.1 Fixed sidebar status removed (R13.1): 6b8f0263f
- Removal safety: "Workspace ready / Navigation synced" existed only in `DesktopSidebar.tsx` (both variants); `git grep` finds no other use. The build badge still renders only in development and on the footer diagnostics path; the gate's 22.6 build-badge check had 0 hits in 38 visits. The admin data-sources strip is untouched. New test `desktopSidebarNoStatusBlock.test.ts`.
### 28.2 Plain labels (R13.4): f7705b127, follow-ups 8ba237a0a, 0513bdf92
- `residencyRateLabel` (serverAmount.ts) gives "Zambian applicant rate" / "International applicant rate"; `PAYMENT_CHANNEL_LABEL` (paymentStatus.ts) gives "Mobile money or card". The follow-ups fix what the longer label caused at 390 px: the chip's 4 px padding (rendered gate cramped-padding, NEW) and the chip squeezing the fee breakdown (seen in the screenshot). The fee header now wraps.
### 29.1 Unsourced claims, logos and false links removed (R12.1, 12.6): 008736e2c
- Removed the stats section and constant, the "Government accredited" chip, the "Recognized by" strip, the hero metric row (and `institutionFacts`), the regulator and university logos, and the social links. The smoothui barrel, animated-counter and OptimizedImage are now unreachable and are recorded in `scripts/unreferenced-modules-baseline.json` with D10 reasons; 33.2 deletes them. Tests changed: `page-verification/student-interview.test.tsx` and `scoutqaAccessibilityFixes.test.ts` pinned the removed badges and the hardcoded interview address; they now assert their absence.
### 29.2 Programmes from the catalogue (R12.2, 12.7): 907e1e4d1
- Rows come from `catalogService.getCanonicalPrograms` per open intake, scoped by the portal context, with loading, error, 429 and closed states (`landingProgrammes.test.tsx`).
### 29.3 Calls to action, mobile widths, landing copy (R12.7, 12.8, 20.1): ac44151fb
- Both hero actions are full width on a phone and keep their `data-landing-action` markers. New test `landingHonestCopy.test.ts`.
### G7 rendered-gate re-baseline: f939eec4d, 0513bdf92
- 60 fixed entries deleted (nested-cards 37, layout-transition 12, icon-tile-stack 4, line-length 4, all-caps-body 2, action-width 1). 8 assigned-school nested-cards entries re-keyed: their selector moved from `div:nth-of-type(2)` to `div:nth-of-type(1)` when 25.1 removed the step header; it is the same finding and 31.3 still owns it. 2 `single-font` entries added with the reason every other Inter-only page carries. No new hard-guardrail entry.
### G7 existing tests changed (assertion encoded copy or markup this group intentionally changed)
EducationStep, SubmitStep, applicationWizardCharacterisation, educationStepRequiredDocuments, paymentStep, wizardMobileRecomposition, applicationWizardUxGuard, requiredDocumentsPanel, requiredDocumentsContract, requiredDocumentsUploadFlow (integration), wizardProperties (Property 13 now supplies stepStates), wizardProgressStates, applicationWorkspaceDecomposition, AssignmentRecoveryPanel, page-verification/student-interview, scoutqaAccessibilityFixes, assignedSchoolFeeEstimate; harness: journey-steps, student-journey-gate, wizard-draft helper, ocr-manual-fallback, student-wizard-characterisation, student-wizard-mobile, two-tenant-adversarial-matrix, wizard-draft-offline-outbox, wizard-draft-refresh-each-step, wizard-draft-two-tab (selector "Next step"). Counted per file: no file has fewer assertions than before.

## G8 (tasks 30 to 32): admin review workspace, navigation and empty states, P2 checkpoint
Prerequisite for 30.2-30.4: Spec A `[R7.2]` is 77434b8c3 (5.2 Approve gate from the resolved payment set) and `[R7.3]` is 44e494b77 with 77434b8c3 (5.3 backend conditions requirement and ConditionsDialog). Both are ancestors of HEAD (`git merge-base --is-ancestor`).
### 30.1 Queue opens as a table on wide screens (R17.1): 6dee35b08
- `stores/adminQueueViewStore.ts` (in-memory Zustand, `chosenView` starts `null`) and `hooks/admin/useQueueWidthBand.ts`. Below 640 px always cards; from 640 px the admin's choice; with no choice, table from 1024 px and cards from 640 to 1023 px. Resizing never writes the choice. Tests: `adminQueueView.test.ts` (each band, with and without a choice, the choice surviving a round trip).
### 30.2 Review route and split pane (R17.2, 17.7, 22.1, 22.2, 22.13): 9c1909c1f, follow-up 6933a0295
- `/admin/applications/:applicationId` is `admin.applicationReview` in `routeRegistry.ts` and `routes/config.tsx`, behind the same admin guard, no nav entry. It renders the queue's own page, so the filters (query string), selection and scroll survive; the scroll-restoration hook and the shell's focus move treat the queue and its review as one page (`scrollKeyForPath`), and the workspace moves focus itself.
- `ApplicationDetailModal.tsx` became `ApplicationReviewWorkspace.tsx` (git rename): the same `useReviewWorkspaceSession` read and every command, guard and confirmation (approval actions, payment decision controls, conditions, amendments, fee waiver, reviewer assignment, interview, document verify, the payment-not-verified confirmation, notification modal). The seven tabs are sections with a section list (`nav` "Review sections"), and the decision bar sticks to the pane's bottom (capped at 40 dvh, 32 dvh on a phone). Beside the queue at 1024 px and wider (`minmax(420px,2fr)` / `3fr`). Nothing imports the modal; it is gone.
- Not-found (non-UUID id) and masked 404 ("This application is not available", nothing about another tenant). Backend authority is unchanged: the workspace still reads `GET /api/v1/admin/applications/{id}/` and the backend's 404 masking is what the page renders.
- Required harness spec `admin-review-workspace.spec.ts`: the tab clicks (`:438-446`) and the tab listing (`:496-499`) now use the section list and section headings; the one-read, retired-calls, official-documents and no-AI claims are unchanged. Desktop and mobile: 7/7 each.
- Existing tests changed (they pinned the modal): `reviewWorkspaceServerOwned.test.tsx` (props, tabs to sections; "one read" counts the detail query, and the official-documents list is now requested on open because every section renders, which the spec already allows as the one other per-application read), `adminRouteActionParity.test.ts`, `productDesignDeFluff.test.tsx`, `architectureEnforcement.test.ts` (file path only). New: `adminReviewRoute.test.tsx`.
- Removal safety: `git grep ApplicationDetailModal` finds only historical docs and frozen `docs/v2-evidence` artefacts; the truth map and the multi-tenant runbook name the new file.
### 30.3 Review as a page on narrow screens (R17.3): 6a0113fc2
- Below 1024 px the route renders the workspace alone, with "Back to applications" keeping the queue's query string; the applicant name is the page `h1`. `AppLayout` drops the bottom navigation on this route. Tests in `adminReviewRoute.test.tsx` (390 and 800 px, back keeps the query).
### 30.4 Row targets, badges and filters (R17.4, 17.5, 17.6): e856298c7, follow-up 6933a0295
- Table cells are `h-11` (44 px); every checkbox (rows, select-all, cards) sits in a 44 x 44 label that also names it. Columns: applicant (a link to the review route), application number (mono), programme, status (`StatusPill`, the one badge), payment (text), documents (text). Rows open on Enter. The table shows the server page whole: its own client search and 10-row pager are off, so the filters are the one search and `RosterPagination` the one pager.
- Documents text needs data the roster did not carry: `ApplicationQueryService.rows_for` adds `current_document_count` and `verified_document_count` from one grouped query over the already-scoped window, with the review workspace's own definition (current versions; of those, verified). Not in `ROW_COLUMNS`, so the CSV export is unchanged. Not in the OpenAPI document (the roster row is not schema-typed). Tests: `test_roster_document_counts_30_4.py` (counts, zero, another tenant's evidence never counts, export columns unchanged).
- Search, Status, Programme and Payment are on show; "More filters (n)" (`aria-expanded`/`aria-controls`) holds the other ten and counts the active ones. Beside an open review the filters stack in one column.
- Tests: `adminQueueRows.test.tsx`. Rendered gate: the 10 admin-queue `measure/hit-area` entries and the 4 `axe/label` entries are gone.
### 30.5 Super-admin shell and metric definitions (R17.8, 17.9): de6b2933b, follow-ups 6e45c9a3d, 68e78ade3
- From the backend's `is_super_admin` (`useCapabilities`), the desktop header and the mobile header use `adminColors.text` (#111827) with white text "Platform admin · all schools"; the tenant-admin shell keeps the light bar. The user menu keeps a light surface on the dark bar.
- `PageShell` metric definitions are behind a 44 px info button ("About <metric>", `aria-expanded`, `aria-controls`), shown below the metric; no Tooltip. Tests: `adminShellAndMetrics.test.tsx` (click) and the required harness spec test 7 (Enter opens, Space closes, desktop and mobile).
### 30.6 Tenant console (R17.10, 17.11, 17.12): 76ef9a491
- Visible `Label` on all 12 school-profile fields; "Set up a new school" (primary, the wizard) and "Quick create (profile only)" (secondary, the blank form whose submit reads "Create school"); school names wrap; `min-w-0` on the console's columns.
- Found while testing: "Quick create" (then "New institution") never showed the blank form when any school existed, because an effect re-selected the first school as soon as the selection cleared. An `isCreating` flag fixes it, so the new label is true. Recorded in contradictions.md.
- Existing test changed: `tenantConsoleSplit.test.tsx` names the relabelled control (the capability gate it asserts is unchanged); three R17.10-R17.12 cases added.
### 31.1 One navigation with full labels (R21.1, 21.2, 15.4): f405859d1, follow-up 6e45c9a3d
- `RouteNavMetadata.navLabel` and `navLabelFor`: Home, Apply, Inbox, Payment, Interview, Alerts, Profile, Status, History; admin Home, Apps, Users, Courses (Programmes), Intakes, Fees, Audit, Settings. It is the visible text and the accessible name on the bottom bar and the desktop sidebar (count suffix kept). No `truncate` on any label; labels never break inside a word, so one that does not fit spills and the gate reports it. `studentStatus` was already `desktop: true` (Spec A). The navigation clipped-text entries are gone.
- Wording to confirm: "Courses" for Programmes on the navigation (the page title stays "Programmes"); "Programmes" broke mid-word at 390 px.
- Existing test changed: `tests/ui/bottom-navigation.mobile.test.tsx` snapshots (classes and labels only). New: `navLabels.test.tsx`.
### 31.2 Empty states (R21.4): 37d4eac8b
- Payment (two states), interview, communications and history: one heading and one sentence saying what fills the page, through `EmptyState`. The interview state no longer promises an invitation (not every programme interviews). The payment draft state had broken punctuation ("The fee. And the option to pay later. Is on...") and is rewritten. Tests changed (they pinned the old copy): `communicationsHistory.test.ts`, `page-verification/payment-page.test.tsx`, `page-verification/student-interview.test.tsx`.
### 31.3 Nested cards and mobile page names (R21.5, 21.6): 1f30eb69e
- Shared primitives first: `SectionCard` header bands are transparent (tinted ones lose the rule), `Alert` gets an `inset` form, `PageHeader` gets `plain`. Inner rows and callouts keep their tint and drop the border (tenant panels, wizard steps, status page, settings, tracker, review). The sidebar brand and the header identity are rows. `ActiveSessions` is no longer its own card. The mobile header title reads the registry label first.
- Related fixes the gate found on the same pages: a tone-coloured label on the documents panel (R18.2), the status page's email row overflowing at 390 px, a 42 px document verify/reject button, an arbitrary 0.7 rem size, and the raw "not paid" in the review summary.
- Nested-cards findings outside the landing: 240 to 0 on the audited set. The landing's 28 stay for 33.1.
### Rendered gate re-baseline: 01ccdbe6c
- 476 to 221 entries, 255 deleted, none added, every remaining entry has a reason. Compare passes on a fresh stack (38/38 visits).
### 32 Checkpoint: P2 decision-independent work
- Rendered gate and axe green against the shrunken baseline; Journey_Gate PASS; required admin-review and payment-ownership specs pass on desktop and mobile.
- Waiting for Spec A: none. 30.2-30.4 had `[R7.2]`/`[R7.3]` (above), 27.4 had `[R7.4]` (e7589a18f, G7).
- Hard-guardrail baseline entries left (R19.9): `measure/hit-area` 4 (sign-in 1, sign-up 3), links inside running text, removed by 24.8 (waits for D17); `impeccable/nested-cards` 28 on the landing, removed by 33.1. No `measure/hit-area` remains for 30.4; no `measure/font-size` on student routes, `measure/overflow`, `measure/clipped-text` in a `nav`, `impeccable/low-contrast` or `axe/color-contrast` entry remains.
- D17 is still open: confirm it to unblock 24.8 (the 44 px guardrail is unchanged).
