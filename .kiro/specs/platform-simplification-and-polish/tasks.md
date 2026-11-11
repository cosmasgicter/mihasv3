# Implementation Plan: Platform Simplification and Polish

## Overview

P1 (simplification) comes first, then P2 (visual quality), following critique §8.4. Within each phase, decision-independent tasks come before gated tasks.

- **Gated tasks.** A task whose title starts with `[Decision Dn confirmed 2026-11-08 (option …)]` follows a decision that the user confirmed on 2026-11-08; its **Status** line in `requirements.md` (Decision Register) records the option. Any further prerequisite is stated on the same marker line (a Spec A gate, a live production host, the P0_Ops_Check, an operator step) and must be met before the task starts. A task whose marker still starts `[Blocked until …]` waits for an open decision (D17). Where the confirmed option is not the lean (D5's workflow, which stays dormant), the task is written to that option.
- **Start condition.** Tasks 1.1 and 1.2 are doc-only truthfulness fixes, and task 1.3 restores a harness default that Spec A's own gates need; all three may start at once (see "Dependencies and sequencing" in `requirements.md` for why). Everything else starts after task 2, once Spec A's Journey_Gate is green.
- **Evidence.** Each task records what it ran and what it saw, in Markdown, in `docs/evidence/platform-simplification-and-polish/README.md`, one section per task id. Raw logs, traces and screenshots stay in CI artefacts and are never committed.
- **Deploy path (Spec A DEC-10).** No task deploys or edits `.github/workflows/deploy.yml`, but that workflow builds both images and rolls production after every green CI run on `main` (`:6-11`, `:24`), so a merge can reach production. Spec A pauses this in its task 2.6, before its task 3.2, and re-enables it in its task 6.2, which is blocked until a live production host exists (D14); the pause covers this spec's work (Spec A DEC-10, decided with the user on 2026-11-07/08). The environment form of the pause holds only while the repository is public on the GitHub Free, Pro and Team plans (Spec A task 2.6), so it can lapse if the D11 track changes visibility; a production-affecting merge during the pause first repeats Spec A task 2.6's confirmation that the pause still holds, and the operator who approves Spec A task 6.2 reads this spec's Deploy path entries first (task 2 records the pointer). A task whose change ships in the backend or frontend image carries a **Deploy path** line:
  - while Spec A's pause holds, its merge reaches production only in a Deploy run an operator approves. Spec A approves none before its task 6.1's checks and backup, and an approved run ships everything merged on `main` (Spec A EC-22);
  - once Spec A's task 6.2 has re-enabled automatic deploys, its merge deploys through the normal automatic path.

  Record in the evidence summary which path was in force when the task merged, its production effect and its rollback. A precondition named on the line is confirmed before an operator approves a run during the pause, and before the merge afterwards. Tasks without the line change nothing production runs: tests, CI, harness files, repository scripts, documents, task 6.1's baseline (which the boot sweep excludes, `apply_sql_migrations.py:118-120`) and task 6.6's harness-only commands (requirements, Dependencies item 7; Requirement 22.7).
- **Skills.** Apply source-code-context, agentic-engineering-workflow, code-structure-cleanup and grep-loop-review-workflow on every coding task (`engineering-skills.md`). On visual tasks, also apply Impeccable (name the sub-command and load its reference), design-for-ai in CHECKER mode, and a11y-audit (`design-skills.md`).

## Tasks

- [x] 1. Early fixes (may start before Spec A's Journey_Gate is green)
  - [x] 1.1 Correct steering and agent-instruction claims that are false under every option and that Spec A does not change
    - `.kiro/steering/tech.md`:
      - Replace "a real operator dashboard, not a placeholder shell" and the "Current Jobs Ops State" bullets with current facts: routes are off by default behind `ENABLE_JOBS_OPS_ROUTES` and serve seed data when on; decision D1 is confirmed as a freeze (2026-11-08) and not yet implemented (task 12.1).
      - Re-verify each "Known Open Issues" item at HEAD, and mark each fixed one with the file or commit that fixed it.
      - Add one known issue: the generic admin settings endpoints let any `admin` role read every setting (`IsAdmin`) and gate writes on the super-admin role string (`_settings_write_forbidden`), while the route registry and `scripts/authority_matrix_registry.py:454-457` describe them as super-admin and `platform.settings.manage` surfaces; re-gating them is a capability change that needs its own decision.
      - Replace "17 tasks … dedicated Koyeb worker" with the 21 entries of `CELERY_BEAT_SCHEDULE` and a reference to `infrastructure.md` for the production host, without naming the host.
    - `.kiro/steering/product.md`: change the flow's "Email Verification" step to "email verification is not implemented (decision D8 confirmed 2026-11-08: not part of the flow)"; replace the jobs-ops wording as above; remove the `apps/librarymanagement/` statement; and, after the "Current Admissions Flow Contract" bullet on profile and settings forms, state the current fact: the Settings page does not meet it today, because the "Sex" field never shows the saved value and "Unsaved changes" never clears after a save (finding C-15, open, no spec owns the fix). Spec A does not change that bullet.
    - `.kiro/steering/structure.md`: remove the `apps/librarymanagement/` row, and point every "spec of record" path at `.kiro/specs/_archived/…`.
    - `.kiro/steering/enterprise-tenancy.md`: replace "a real submit/review/apply workflow, not explanatory text" with "a backend workflow with six routes and no frontend caller, dormant by decision D5 (confirmed 2026-11-08)", and fix the spec-of-record path.
    - `.kiro/steering/design-skills.md:32`: change `tokens.colors.cjs` to `tokens.colors.json`.
    - `.agents/AGENTS.md:13`: describe `product.md` as "Identity: Beanola owns the platform; MIHAS and KATC are example tenants".
    - `REDESIGN.md`: replace the "MIHAS-KATC" wordmark (lines 3 and 175) with Beanola, and add a dated note that the file is a historical design direction, not current rules.
    - Leave alone:
      - `DESIGN.md`, `LOCAL-TESTING.md` and `docs/runbooks/local-parity.md`;
      - the steering rows for storage, sessions, auto-save and `seed_school_admins`;
      - every infrastructure identifier (D11).
      Spec A owns everything in that list except the infrastructure identifiers.
    - _Requirements: 6.1, 6.5, 6.6, 9.4_

  - [x] 1.2 Mark unverified production values in the perf-flags runbook
    - In `docs/runbooks/perf-flags.md`, show "Unverified" for each production value that no P0_Ops_Check has recorded. Keep the claimed value and date in a "previously claimed" note.
    - _Requirements: 5.5_

  - [x] 1.3 Restore a parseable error-reporter DSN in the harness
    - In `harness/bin/harness:76`, change the `VITE_GLITCHTIP_DSN` default to `https://harness@harness-invalid.localhost/1` (design §1). Keep the `${VITE_GLITCHTIP_DSN:-…}` form, so a caller's value still wins.
    - Add `apps/admissions/tests/unit/harnessDsnDefault.test.ts` (`// @vitest-environment node`): read the default from `harness/bin/harness`, load `@sentry/core` relative to `@sentry/react` with `createRequire`, and assert that `makeDsn` returns a DSN whose host ends in `.localhost`, with `console.error` spied.
    - If Spec A's harness work has already restored a parseable DSN, keep its value if it names a `.localhost` host and add only the test. If Spec A allowed the "Invalid Sentry Dsn" console text instead, remove that allowance in this task.
    - Record in the evidence summary which of these applied.
    - _Requirements: 1.12_

- [ ] 2. Checkpoint: start condition for the rest of this spec
  - Confirm that Spec A's Journey_Gate is green and blocking in CI on main, and record the commit id and run link in the evidence summary.
  - Record whether Spec A's pause on automatic deploys (DEC-10) is in force, and on which path (environment approval or disabled workflow), or whether Spec A's task 6.2 has already re-enabled automatic deploys. This decides how this spec's merges reach production (Overview, "Deploy path").
  - Record the pointer for the operator who will approve Spec A task 6.2: read this spec's Deploy path entries before approving, because Spec A task 6.1's checklist does not mention them. Record too whether the pause is still in the form Spec A task 2.6 chose (an environment with required reviewers holds only while the repository is public on the Free, Pro and Team plans).
  - Ask the user if questions arise.
  - _Requirements: 1.1, 22.5, 22.7_

- [x] 3. Repository checks that land with baselines
  - [x] 3.1 Build the routes-versus-callers report
    - Create `scripts/routes_report.py`, which:
      - imports `build_backend_route_catalogue()` from `scripts/inventory_admissions_v2.py` (`:464`), not `collect_backend_routes()`, whose setup forces the flag on (`:391`);
      - configures Django itself and builds the catalogue once with `ENABLE_JOBS_OPS_ROUTES` off and once on, each time inside `override_settings`, after reloading `apps.common.email_urls`, `apps.documents.urls` and then `config.urls`, and calling `clear_url_caches()` (design §2);
      - normalises paths and keys routes and callers by `(version, segments)`: an admissions literal without a version prefix is v1, and one that starts with `/api/vN/` is vN (design §2 point 3);
      - scans First_Party_Caller sources with the exclusions of `scripts/v1_surface_telemetry.py`;
      - classifies each route (design §2).
    - Create `scripts/route-consumers.json` with the Lenco webhook, the schema, docs and redoc endpoints, the email delivery webhook ("pending D1.b") and any other route with a real outside consumer.
    - Create `scripts/routes-report-baseline.json` from the first run. Every entry has a reason, and a decision id where one applies.
    - Add a unit test to `scripts/tests/test_routes_report.py` that at least one route differs between the two flag states (`/api/v1/jobs/` at HEAD).
    - Add blocking steps to the `backend` job in `.github/workflows/ci.yml`, after its dependency install: one runs the report and uploads its JSON as an artefact, and one runs `python3 -m pytest -p no:django scripts/tests/test_routes_report.py` from the repository root.
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [x] 3.2 Build the unreachable-module check
    - Export `collect` and `resolveTsSpecifier` from `scripts/module-size-report.ts`, and change its last line from `main()` (`:1024`) to `if (import.meta.main) main()`, so importing the file runs nothing; its own report must be identical before and after on HEAD.
    - Create `scripts/unreferenced-modules.ts`, with its `main()` guarded the same way. It walks reachability from `apps/admissions/src/main.tsx` over non-test imports, with `scripts/unreferenced-modules-allowlist.json` and `scripts/unreferenced-modules-baseline.json`.
    - Record in the script's header that module reachability does not find unused exports in reachable modules or modules kept alive by a barrel (design §2); such items are listed by hand (D15 item (i), task 33.2).
    - Add a blocking step to the admissions job in `ci.yml`.
    - _Requirements: 2.4, 2.5_

  - [x] 3.3 Build the doc-path and skill-path check
    - Create `scripts/check_doc_paths.py` with the candidate, normalisation and resolution rules of design §6. It scans the steering files, `.agents/AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `LOCAL-TESTING.md` and `README.md`, and, for `.kiro/skills/<name>` paths only, `.kiro/hooks/*` and live specs' `tasks.md`. Paths absent on purpose go in `scripts/doc-paths-allowlist.json` with a reason.
    - Make the same script check skill links: every mode-`120000` entry under `.kiro/skills/` and `.agents/skills/` must resolve, and every `path` in `.agents/skills.json` must name a directory relative to `.agents/` or the repository root. Put the two dangling links (`playwright`, `playwright-best-practices`) in its baseline, tied to D6.
    - Run it once at HEAD and record the result in the evidence summary. The design's dry run found 31 distinct paths in 40 file-and-path pairs: 6 stale references, 14 history-table entries and 11 names absent on purpose. Fix the stale paths that task 1.1 did not cover, and allowlist the 11 with reasons; the history entries leave with task 9.1. Do not allowlist `src/`: it resolves to `apps/admissions/src/`, so the check does not report it, and an allowlist entry for it would fail the allowlist's own rule that the path be absent.
    - Add `scripts/tests/test_check_doc_paths.py` (standard library), with fixtures for each exclusion and resolution rule, a dangling symlink and a missing `.agents/skills.json` path.
    - Run `python3 scripts/check_doc_paths.py` as a blocking step in `.github/workflows/ci.yml`'s `backend-drift-guards` job, from the repository root, beside the brand scan (`:565-566`). `ci.yml` has no `paths:` filter (`:2-6`), so the check runs on every pull request and push to main, including a change that deletes or renames a file a doc names without touching the doc (design §6). Do not put the check in `spec-governance.yml`, which runs only when its `paths:` lists match (`:16-22`, `:25-31`).
    - Add its self-test, `python3 scripts/tests/test_check_doc_paths.py`, to `spec-governance.yml` beside the existing self-tests (`:52-55`), and add `scripts/check_doc_paths.py` and `scripts/doc-paths-allowlist.json` to both of that workflow's `paths:` lists.
    - _Requirements: 6.2, 4.7_

  - [x] 3.4 Make spec status markers blocking
    - Add `--enforce-status` to `scripts/validate_spec_governance.py`. It applies one rule to every live spec in both directions (Requirement 6.3, design §6): completed with an unchecked required task fails, and at least one required task, all checked, without a completed status fails. A required task is one not marked `*`. Exceptions come from `scripts/spec-status-exceptions.json`, which lists the four D12 specs with the reason "D12 lean: record-only; awaiting confirmation".
    - Add self-tests to `scripts/tests/test_validate_spec_governance.py`, with failing fixtures for both rules, a passing fixture whose only open tasks are optional, and an exception that names a missing spec.
    - Fix the metadata of specs outside D12 (recorded in D12's register entry):
      - remove `"status": "completed"` from `full-platform-remediation-2026-07`;
      - add it to `beanola-launch-verification` and `communications-history`, after confirming every required task is checked;
      - create `.kiro/specs/student-payment-interview-pages/.config.kiro` with a fresh spec id, `workflowType` `requirements-first`, `specType` `feature` and `"status": "completed"`, after confirming its 17 required tasks are checked; its 6 open tasks are optional.
    - Run the new mode against the live tree and confirm it passes before making it a blocking step in `spec-governance.yml`. Add `scripts/spec-status-exceptions.json` to both of that workflow's `paths:` lists, so a change to the exceptions alone runs the step.
    - _Requirements: 6.3_

  - [x] 3.5 Write property tests for classification and baseline rules
    - **Property 4: Every route gets exactly one class**
    - **Validates: Requirements 2.1, 2.2**
    - **Property 5: Stale baseline entries fail**
    - **Validates: Requirements 2.5, 19.4**
    - Test in `scripts/tests/test_routes_report.py` using hypothesis; `ci.yml`'s `backend` job runs it (task 3.1). Mirror Property 5 for the TypeScript check with fast-check in `apps/admissions/tests/unit/unreferencedModules.test.ts` (`// @vitest-environment node`), which the admissions job's `bun run test` runs.

  - [x] 3.6 Ignore agent run directories
    - Add `.agents/tasks/` to `.gitignore`, and confirm with `git check-ignore -v` that a file there is ignored.
    - _Requirements: 4.4_

  - [x] 3.7 Keep harness browser runs inside the stack (the harness half of C-08)
    - This task removes nothing and is the same under every D2 option, because Spec A's Journey_Gate and the Rendered_Design_Gate run on the harness whatever D2 decides (design §1). Under options A–C it is also how the harness meets Requirements 1.3 and 1.9.
    - Add the widget stub `GET /js/v1/inline.js` to `harness/adapters/adapter_server.py`, proxy `/__lenco/*` to the adapter with the prefix stripped in `harness/Caddyfile`, and export `VITE_LENCO_WIDGET_URL=/__lenco/js/v1/inline.js` in `harness/bin/harness` beside its other `VITE_*` values.
    - Move the three preconnects out of `apps/admissions/index.html:26-28` into the `beanola-resource-hints` plugin in `vite.config.ts`, and confirm that a build with `VITE_API_BASE_URL` set to the API origin and an empty widget variable emits the same API and `pay.lenco.co` hints as today.
    - State the plugin's assumption in a comment in the plugin and next to the `VITE_API_BASE_URL` entry of the deploy runbook's variable list (`deploy/RUNBOOK.md:41`), without adding a host name (Requirement 6.6): production sets `VITE_API_BASE_URL` to the API origin, as `backend/DEPLOY.md:274` already says. A build that sets it to the production app origin, the harness's same-origin sentinel (`harness/bin/harness:67-70`), gets no API preconnect, although `getApiBaseUrl` maps that value to the API origin at runtime (`src/lib/apiConfig.ts:44-52`; design §1).
    - Add `scripts/check-local-build-hosts.ts`, run by `harness/bin/harness` after `build_spa`, with unit tests on `index.html` fixtures, including Open Graph `<meta>` tags that must not count.
    - Make a host name outside the stack unresolvable in the browser (design §1, "Name resolution"): launch Chromium with `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE *.localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]"` in `apps/admissions/playwright.harness.config.ts`, its three variants (`playwright.harness.13-2.config.ts`, `playwright.harness.13-3.config.ts`, `playwright.harness.13-6-L5-L6.config.ts`), Spec A's journey-gate configuration and, when it exists, task 22.1's rendered-gate configuration, and extend `apps/admissions/tests/unit/playwrightConfig.test.ts` to assert the argument in each. A navigation, a popup, a form post and a subresource to an outside host name then fail before any packet leaves the machine, and no route is registered, so the HTTP cache stays on. A literal IP address outside loopback is not resolved, so it is detected by the listeners below, not prevented (Requirement 1.11). That the `EXCLUDE` patterns keep every harness host reachable on a CI runner is Unverified: the first gate run proves it, and a host it cannot reach is added to the pattern and recorded.
    - Add the outside-host gate without any Playwright route, because a route turns on interception for every request and turns the HTTP cache off in every harness run (`crNetworkManager.js:150-162`; design §1):
      - narrow the harness CSP's `connect-src`, `img-src`, `font-src` and `frame-src` from `*` to `'self'` plus the stack hosts (`harness/Caddyfile:24`);
      - in `apps/admissions/tests/harness-e2e/harness-fixtures.ts`, move the request listeners from the page to the browser context, so popups are covered: record the host of every request to an outside host from `context.on('request')` and the existing `requestfailed` handling (a name-resolution failure, `net::ERR_NAME_NOT_RESOLVED`, counts; only `net::ERR_ABORTED` is a cancellation), and of every `securitypolicyviolation` event through `context.addInitScript` and `context.exposeFunction`, whatever `allowRequest` or `allowConsole` says. Harness specs open popups today (`official-document-durability.spec.ts:533,658`);
      - add gatecheck probes in `tests/harness-e2e/gatecheck/` that prove the gate fires, and names the host, for a request the CSP refuses, for a top-level navigation to a host under the reserved `.invalid` domain and for a popup to one. Unit-test the host classifier on IPv4 and IPv6 literals; give a literal IP address outside loopback no browser probe, because a probe would send a packet.
    - Run `bash harness/bin/harness smoke` with the gate on, and record in the evidence summary each outside host it finds and how it was resolved. The task is done when the run shows no outside-host violation and no failure that Spec A's recorded smoke baseline does not already list.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: only the frontend image's `index.html` hints change. Precondition: production's `VITE_API_BASE_URL` Actions variable names the API origin; if it does not, the only effect is a missing API preconnect.
    - _Requirements: 1.11_

- [x] 4. Outbound defaults
  - [x] 4.1 Move production defaults out of base settings
    - In `backend/config/settings/base.py`, default `HEALTH_CHECK_URL` and `KEEP_ALIVE_URL` to `""`, `FRONTEND_URL` to `http://localhost:5173` and `EMAIL_HOST` to `localhost`.
    - In `prod.py`, set today's production values explicitly.
    - In `staging.py`, read `FRONTEND_URL` and `HEALTH_CHECK_URL` with an empty default, and add both names to its `REQUIRED_ENV_VARS`, which Spec A's startup validation enforces only when `STARTUP_ENV_VALIDATION` is true (design §9).
    - In `local_real.py`, after its import of staging, set local defaults: `FRONTEND_URL` `http://localhost:5173` and an empty `HEALTH_CHECK_URL`. The harness keeps its own values (`harness.py:130,135`).
    - Give `backend/tests/property/test_email_dispatch.py`'s reset-email test (`:276` asserts `https://apply.beanola.com` with no override, and `dev.py` sets no `FRONTEND_URL`) `override_settings(FRONTEND_URL="https://apply.beanola.com")`, as `backend/tests/unit/test_outbox_helpers.py:118` already does. Run the backend suite, give any other test that relied on the old default the same override, and list each in the evidence summary.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: production takes `HEALTH_CHECK_URL`, `KEEP_ALIVE_URL`, `FRONTEND_URL` and `EMAIL_HOST` from `prod.py` instead of the base defaults. Precondition: task 4.3's assertion that `prod.py` keeps today's values passes.
    - _Requirements: 9.1, 9.5, 9.7_

  - [x] 4.2 Make scheduled tasks and link helpers stop falling back to production
    - In `backend/apps/common/tasks.py`, change the production fallbacks in `keep_alive_task` (`:329`) and `check_uptime_task` (`:358`) to `""`, and make both tasks return early with one INFO log naming the empty setting.
    - In `backend/apps/common/email_links.py:75`, remove the `or "https://apply.beanola.com"` fallback: with an empty `FRONTEND_URL`, `_get_platform_base_url()` logs one WARNING per process naming the setting and returns `""`. In `backend/apps/common/outbox.py:96`, change the `getattr` default to `""` (design §9).
    - Add unit tests: an empty `FRONTEND_URL` gives path-only email links and one WARNING with no value in it, and `_safe_action_url` returns no URL for an absolute action URL.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: none while production sets the values, which task 4.1's `prod.py` does.
    - _Requirements: 9.2, 9.8_

  - [x] 4.3 Write the outbound-defaults tests
    - Create `backend/tests/unit/test_settings_outbound_defaults.py`. It imports settings modules in subprocesses with `TESTING` and `PYTEST_CURRENT_TEST` removed from the child environment, and asserts:
      - under `config.settings.staging`, with every other required variable set to a placeholder and both variables unset, `django.setup()` raises `ImproperlyConfigured` naming `FRONTEND_URL` and `HEALTH_CHECK_URL`, and stderr holds no placeholder value;
      - `config.settings.local_real` and `config.settings.harness` start with both variables unset;
      - no non-production module defaults `HEALTH_CHECK_URL`, `KEEP_ALIVE_URL`, `FRONTEND_URL` or `EMAIL_HOST` to a production or live third-party host;
      - `prod.py` keeps today's values;
      - the tasks' early return makes no request, with `requests.get` patched to fail if called.
    - _Requirements: 9.1, 9.2, 9.5, 9.7_

  - [x] 4.4 Pin the steering beat table to the schedule
    - Create `backend/tests/unit/test_steering_beat_table.py`. It compares the task names in `.kiro/steering/tech.md`'s beat table with the last dotted segment of each `CELERY_BEAT_SCHEDULE` entry's `task` value. Correct the table until it passes; its `cleanup_idempotency_keys` row becomes `cleanup_idempotency_keys_task`.
    - _Requirements: 9.4_

  - [x] 4.5 Stop the CI admissions build defaulting to the production API
    - In `.github/workflows/ci.yml:333`, change the `VITE_API_BASE_URL` fallback from the production API host to `http://localhost:8000`. Leave `deploy.yml` unchanged.
    - Confirm that the admissions job's type check, tests, build, bundle guard and PDF chunk check still pass.
    - _Requirements: 9.6_

- [x] 5. Reproducible backend builds
  - [x] 5.1 Split and lock the requirements
    - Create `backend/requirements.in` for runtime packages, keeping the jobs-ops `openai` section and its comment. `cryptography` goes here, not with the test packages: it sits under the "# Testing" comment today (`requirements.txt:59`), but `apps/common/audit_network.py:8` imports it at runtime.
    - Create `backend/requirements-dev.in` with `-r requirements.in`, `-c requirements.txt` and the test packages, so shared pins match the runtime lock.
    - Compile both with the pinned pip-tools inside `python:3.12-slim`, with `--generate-hashes` (design §10), producing `requirements.txt` and `requirements-dev.txt`.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: the backend image installs the exact locked versions, which can differ from those today's version ranges resolved to in the running image (`backend/requirements.txt` uses ranges at HEAD). Precondition: the backend suite passes on the locked versions.
    - _Requirements: 10.1, 10.4, 10.6_

  - [x] 5.2 Install only runtime packages in the image
    - Change `backend/Dockerfile` to `pip install --no-cache-dir --require-hashes -r requirements.txt`.
    - Add a CI step that builds the image and fails if `pytest`, `pytest_django`, `xdist`, `pytest_timeout`, `hypothesis`, `factory` (factory-boy), `freezegun` or `fakeredis` is importable inside it. The same step fails if any package that `requirements.in` names is not installed (`importlib.metadata.version` on each line's distribution name) or if `cryptography.fernet` does not import (design §10).
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: the image no longer carries the test packages. Precondition: the image check passes on the commit that deploys.
    - _Requirements: 10.2_

  - [x] 5.3 Use the dev lock in CI and check freshness
    - Change every backend `pip install -r requirements.txt` in `.github/workflows/` to `pip install --require-hashes -r requirements-dev.txt`.
    - Add the freshness step (design §10): copy the two `.in` files and both locks into a temporary directory, run there the exact compile command recorded in `tech.md` and the `.in` headers (same image, pip-tools pin and file names), and fail on any diff with the committed locks. Do not compile to a different output file name: pip-compile writes its command line, `--output-file` included, into the lock's header (Likely; pip-tools is not installed where this was written), so that diff would never be empty. Also fail, naming the package, if a package pinned in both locks has two versions.
    - _Requirements: 10.3, 10.5_

  - [x] 5.4 Document the lock workflow
    - Update `.kiro/steering/tech.md` (Backend table and Commands) with the compile command, the hash-checked install, and the rule that host virtual environments use Python 3.12.
    - _Requirements: 10.1, 10.4_

- [ ] 6. Test database built from SQL
  - [ ] 6.1 Capture a verified baseline schema from Neon (operator-assisted)
    - With the user's go-ahead, create a Neon branch from the authoring default branch and tell the user its id.
    - Dump it with `pg_dump` 17, `--schema-only --schema=public --no-owner --no-privileges`, plus the `migration_history` and `django_migrations` rows as INSERTs (design §7), and strip the psql meta-command lines and each dump's trailing comment block (`-- PostgreSQL database dump complete` with the `--` lines around it), so the file ends with a statement (design §7 point 3).
    - In an empty `postgres:17` container, run the whole session sequence: load the result with `psql -v ON_ERROR_STOP=1`, then `python manage.py migrate --noinput`, then `python manage.py apply_sql_migrations`. Accept the capture only if all three succeed. If `migrate` fails because the branch's Django tables and its `django_migrations` rows disagree, capture again without Django's own tables (`--exclude-table='auth_*' --exclude-table='django_*'`), so `migrate` creates them, and record why in `backend/scripts/BASELINE.md` (design §7 point 1).
    - Run `python manage.py schema_manifest` against the branch. Record every difference from the repository's scripts, and its explanation, in `backend/scripts/BASELINE.md`, or stop.
    - Replace `backend/scripts/00_full_schema.sql` with the dump and a header that ends "production parity: Unverified (task 6.8)". Change `backend/scripts/generate_full_schema.py` to print model DDL to standard output.
    - In the same change keep the documented local database steps working (design §7 point 2, "Who loads the baseline"). `LOCAL-TESTING.md` Part 2 steps 2a–2c and the local-real block load the file with `psql` and then run `apply_sql_migrations`, with no `migrate`, into `postgres:16-alpine`; after this task that would load a `pg_dump` 17 file into Postgres 16. So: rewrite those two blocks to the session's order (`psql -v ON_ERROR_STOP=1`, then `python3 manage.py migrate --noinput`, then `python3 manage.py apply_sql_migrations`); move the three backend compose files to `postgres:17-alpine` (`backend/docker-compose.yml:16`, `backend/docker-compose.local-test.yml:19`, `backend/docker-compose.local-real.yml:21`) and say in the document that an existing Postgres 16 volume needs `docker compose … down -v` once (these volumes hold no applicant data); correct the truth map's "Canonical schema" row (`docs/canonical-truth-map.md:1202`) and `backend/scripts/MIGRATION_HISTORY.md:99,147`; and run the rewritten steps once on an empty stack and record the result. Spec A's ownership of `LOCAL-TESTING.md` ended with its P0a, before this task.
    - Add unit tests: no line of `00_full_schema.sql` starts with a backslash, and its last non-blank line ends with `;`.
    - Ask the user before deleting the Neon branch.
    - _Requirements: 7.1, 7.2, 22.7_

  - [ ] 6.2 Build the test database from the baseline and the scripts
    - In `backend/tests/conftest.py`, override pytest-django's `django_db_setup` (design §7, point 4), in this order:
      - stop with "backend tests require Postgres 17" if the connection is not PostgreSQL or `SHOW server_version_num` is below 170000, before anything is created, printing only the URL scheme or the major version; query through `connection.creation._nodb_cursor()` (the maintenance connection `_create_test_db` itself uses), so a missing configured database gives this message and not a connection error;
      - create each test database empty with `_create_test_db`, keeping the xdist suffix through `django_db_modify_db_settings`, and switch the connection to it;
      - load the baseline with `_split_sql_statements` from `apps/common/management/commands/apply_sql_migrations.py` (`:337`), which keeps dollar-quoted bodies, quotes and comments whole, one statement per execute, and skip any fragment that is empty once `--` and `/* */` comments and whitespace are removed (the dump's trailer would otherwise make psycopg2 raise "can't execute an empty query");
      - close the connection, because the dump's preamble runs `set_config('search_path', '', false)` on the loading session;
      - on the fresh session, before `migrate`, stop the session, naming the check, if `SHOW search_path` names no schema (with an empty `search_path` `migrate` fails first with Django's own error, so a check placed only after it would never fire);
      - run `migrate --noinput` and `apply_sql_migrations` on that session, and check `search_path` once more;
      - destroy the database at session end.
    - Make the override request Spec A's database-host guard fixture.
    - In the same change, move the four CI services that run backend tests from `postgres:16` to `postgres:17`: `.github/workflows/ci.yml:20` (`backend`), `:242` (`backend-property`), `:504` (`backend-drift-guards`) and `.github/workflows/backend-governance.yml:40` (`schema-and-outbox-checks`). Postgres 16 cannot load the `pg_dump` 17 baseline.
    - Remove `unmanaged_schema` and the hand-copied index block (`conftest.py:119-413`).
    - Add unit tests: the loader skips a comment-only fragment, on a fixture that ends in `pg_dump`'s trailer; the version check refuses 160000 and a non-Postgres connection, and answers through the maintenance connection when the configured database does not exist; the `search_path` check refuses an empty value on the fresh session before `migrate`; none of them prints a URL. (The tests that no line starts with a backslash and that the file ends with a statement belong to task 6.1.)
    - Record in the evidence summary that local backend test runs now need a Postgres 17 server, which the three backend compose files provide since task 6.1 (design §7, edge cases).
    - _Requirements: 7.1, 7.6_

  - [x] 6.3 Isolate workers and clean up after transactional tests
    - Add `JTI_REDIS_URL = os.environ.get("JTI_REDIS_URL", CELERY_BROKER_URL)` next to `CELERY_BROKER_URL` in `backend/config/settings/base.py` (`:171`), and make `apps/accounts/tokens.py:_get_redis` read it.
    - Set the test values in settings, not in `conftest.py`, because pytest-django loads the settings and calls `django.setup()` before any `conftest.py` is imported (design §7 point 5). Inside `base.py`'s existing `_is_testing` block (`:818-830`): set `CELERY_BROKER_URL` to `memory://` and `CELERY_RESULT_BACKEND` to `cache+memory://`, because today's result backend is `REDIS_URL` (`base.py:172`) and subscribes over Redis pubsub for every `apply_async` that does not ignore its result; raise `ImproperlyConfigured` naming the limit when `PYTEST_XDIST_WORKER_COUNT` is above 7; and build `JTI_REDIS_URL` from `REDIS_URL` with `urlsplit(...)._replace(path=...)`, with database 8 when `PYTEST_XDIST_WORKER` is unset and 9 + N for worker `gwN`.
    - Add a session-scoped autouse fixture to `backend/tests/conftest.py` that asserts the broker, the result backend and `JTI_REDIS_URL` are in effect, naming the setting and, for the JTI database, the expected number on failure, never the URL.
    - Add `backend/tests/unit/test_test_settings_isolation.py`, which imports the settings in subprocesses with `TESTING=1` and checks worker `gw3`, a run without xdist, and a worker count of 8, including the result backend in each case.
    - Add an autouse truncation after every transactional test, covering every `public` table except the tables of managed models (which Django's flush resets) and the two history tables.
    - Write an integration test that inserts into a `managed = False` table in one transactional test and asserts, in the next, that the table is empty and that `django_content_type` and `auth_permission` still hold rows.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: none intended; `JTI_REDIS_URL` defaults to the broker URL, so production keeps today's Redis database unless the variable is set.
    - _Requirements: 7.4, 7.5_

  - [ ] 6.4 Fail on drift between the models and the SQL schema
    - Create `backend/tests/integration/test_sql_schema_matches_models.py`, which runs `check_schema_drift` against the SQL-built database.
    - _Requirements: 7.3_

  - [ ] 6.5 Fix the tests the real schema exposes
    - Run the whole suite on the SQL-built database. Fix each failing test in the test itself, never by loosening a constraint, and record each fix and its cause in the evidence summary.
    - _Requirements: 7.1, 7.5_

  - [ ] 6.6 Build the harness database the same way
    - Switch `backend/apps/common/management/commands/harness_bootstrap.py` to the baseline-plus-scripts path, with task 6.2's loader: load the baseline, close the connection, then run `migrate` and `apply_sql_migrations` on a fresh session and check that `search_path` names a schema (design §7 points 4 and 8).
    - Create `backend/apps/common/local_database.py` with `require_local_database()` (design §1), and call it first in `harness_bootstrap` and `harness_seed_tenants`. It replaces the latter's four-string denylist and keeps Spec A's production-settings refusal.
    - Add unit tests for each allowlisted host, a remote host, and production settings over the `postgres` host.
    - Run the Journey_Gate. If it fails, revert the switch and record why.
    - _Requirements: 7.1, 1.5_

  - [ ] 6.7 Run the whole backend tree in CI on Postgres 17
    - Confirm that the four backend-test services still run `postgres:17` after task 6.2.
    - Add a job named `backend-full-tree` with a `postgres:17` service that runs `pytest -n 6 backend/tests` with a 30-minute timeout, and record two consecutive green runs.
    - Operator step (repository settings): after those runs, make `backend-full-tree` a required check on `main`, as Spec A does for its own jobs (Spec A task 4.5). A failing job that branch protection does not require still lets a pull request merge. The job runs on every pull request (`ci.yml` has no `paths:` filter), so requiring it cannot leave a check pending.
    - _Requirements: 7.5, 7.6_

  - [ ] 6.8 [Decision D14 confirmed 2026-11-08 (option B: wait for the new production host; do not restore the EC2 stack); blocked until a live production host exists] Check the baseline against production
    - Once D14 names a reachable production host, ask the operator for the read-only `schema_manifest` of production.
    - Explain every difference from the baseline in `backend/scripts/BASELINE.md`, or fix it with an additive script proven on a Neon branch first.
    - Replace the header's "production parity: Unverified" with the result and the date.
    - Deploy path, only if this task adds a script: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: the boot sweep applies the script on the first deploy that contains it (`backend/Dockerfile:65`). Precondition: a fresh `deploy/backup-db.sh` backup, as Spec A's task 6.1 takes.
    - _Requirements: 7.2, 22.7_

- [x] 7. Jobs-ops truthfulness without a decision
  - [x] 7.1 Replace the hardcoded readiness in the metadata endpoint
    - In `backend/apps/common/meta_views.py`, remove `status` and add `features: {jobs_ops: settings.ENABLE_JOBS_OPS_ROUTES}`. Keep the Cache-Control header.
    - Update `PlatformMetaSerializer`, regenerate the OpenAPI baseline and its lint baseline, and update `test_platform_meta.py`, `test_jobs_ops_endpoints.py` and `test_version_drift_guard.py`.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: the metadata response loses `status` and gains `features.jobs_ops`. Merge it together with task 7.2, so the jobs-ops build that stops reading `status` ships in the same Deploy run, which builds both images from one commit.
    - _Requirements: 3.1, 3.8_

  - [x] 7.2 Read the jobs-ops status from the backend
    - In `apps/jobs-ops/src/services/api/platform.ts` and the `PlatformMeta` contract, map `features.jobs_ops`, add `source: 'backend' | 'demo'`, request with `cache: 'no-cache'`, and change the demo fallback to drop `'production_v1_seeded'` and set `source: 'demo'`.
    - In `JobsOpsShell.tsx`, remove "Live backend" and the readiness chips. Show "Jobs-ops enabled" or "Jobs-ops not enabled" for a backend answer, and "Demo data. Backend not reached." for the demo fallback.
    - Register the `features.jobsOps` mirror in the truth map's "Platform attribution metadata" row, and add a jobs-ops unit test that fails if the OpenAPI baseline stops describing `features.jobs_ops`.
    - Run the jobs-ops type-check, lint and build.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy, together with task 7.1.
    - _Requirements: 3.2, 22.10_

  - [x] 7.3 Pin the admissions email route
    - Add a unit test that `POST /api/v1/email/send/` resolves with `ENABLE_JOBS_OPS_ROUTES` off.
    - _Requirements: 3.4_

  - [x] 7.4 Write the metadata property test
    - **Property 8: Metadata reports configuration, never a fixed readiness**
    - **Validates: Requirements 3.1**
    - Test in `backend/tests/property/test_platform_simplification_properties.py` using hypothesis.

- [x] 8. Prepare the inputs for pending decisions (analysis only; nothing is removed)
  - [x] 8.1 Inventory capabilities and propose a merge table for D3
    - Create `scripts/capability_inventory.py` (design §8). For each capability it records the enforcement sites, the frontend gates, the tests that name it, and the update set: every file `git grep -l` lists outside `.kiro/specs/`, `docs/archive/` and `docs/v2-evidence/`.
    - Attach its output and the proposed merge table to D3 in the evidence summary. Change no catalogue entry.
    - _Requirements: 8.4, 8.5_

  - [x] 8.2 Build the skill keep-list for D6
    - Grep the sources listed in design §4 for skill names and paths. Add the three design skills and the skills this spec's authoring workflow used.
    - For each kept skill, record where its one real copy lives: a `.kiro/skills/` directory, or the `.agents/skills/` target of a `.kiro/skills/` symlink. Attach the list to D6.
    - _Requirements: 4.6_

  - [x] 8.3 List the exact items for D15
    - From the output of tasks 3.1 and 3.2, and from Spec A's frozen list in `apps/admissions/tests/unit/uploadPathSingleSource.test.ts`, list the files for D15 items (a)–(i): the unreachable modules for (d), the test imports and `patch()` targets for (c), the dead upload paths for (i), and the file and line counts for each item. Attach the list to D15.
    - _Requirements: 2.8, 4.8, 9.3_

- [x] 9. Bring steering and docs to the current state after Spec A
  - [x] 9.1 Move steering history to an archive
    - Move the "Files Added During …" and "Files Removed During …" tables from `.kiro/steering/structure.md` verbatim into `docs/archive/steering-history-2026.md`, with a header naming the source commit. Link the archive from `structure.md`.
    - _Requirements: 6.4_

  - [x] 9.2 Correct `DESIGN.md`'s component and token references
    - In §4, list only the components that task 3.2's import graph shows are rendered.
    - Name `tokens.colors.json`.
    - Replace the `ProgressIndicator` / `Stepper` rule with the component the wizard renders, `EnhancedProgressIndicator`.
    - Keep Spec A's `BuildVersionBadge` entry as Spec A left it.
    - _Requirements: 6.7_

  - [x] 9.3 Verify the steering against HEAD
    - Run task 3.3's check and re-read the critique's §6 drift rows. Correct any claim that is still false and that no gated task owns.
    - Record in the evidence summary each §6 row this spec does not correct, with its owner: Spec A, the D11 operator track (row 16) or D14 (row 17). Row 21 is corrected by task 1.1, which states that finding C-15 is open; record that the defect itself has no owner (Non-goals) rather than naming Spec A.
    - Register the new checks in the canonical truth map's "Drift Guard Inventory".
    - _Requirements: 6.1, 6.5, 22.10_

- [x] 10. Checkpoint: P1 decision-independent work is green
  - The routes report, the unreachable-module check, the doc-path check and the spec status check are blocking and green.
  - The harness keeps browser runs inside the stack (task 3.7), and its error-reporter DSN parses (task 1.3), so P2's rendered gate can start.
  - The backend suite is green with `-n 6` on the SQL-built database, the lock files and the image check are green, and the outbound defaults are tested.
  - Present the inputs from task 8. D1–D10 and D12–D16 were confirmed on 2026-11-08, so ask only what is still open: D17 (how links inside running text meet the 44 px rule: pad them, move them out of the sentence, or amend the steering in four places to an inline exception that the classifier then follows; the recommendation is to keep the guardrail and fix the link), which task 24.8 applies; D1.b (what happens to `webhooks/delivery/`), which task 12.1 applies; the D3 and D5 conflict over the three `*.request_change` capabilities (task 17.2); and, from task 8.1, the merge table that task 17.3 needs. Also record that tasks 6.8, 16.1 and 16.2 wait for a live production host (D14).
  - Confirm that Requirement 22's guardrail tests still pass, including the payment ownership split, upload validation with its staged write order, and idempotent submission (22.2, 22.12, 22.13).
  - Ask the user whether to add finding C-15 (the Settings defect no spec owns, Non-goals) to Spec A or leave it open.
  - Ask the user if questions arise.
  - _Requirements: 1.11, 1.12, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.12, 22.13_

- [ ] 11. Local stack and evidence (D2)
  - [x] 11.1 [Decision D2 confirmed 2026-11-08 (option A + B); the change to Spec A's `harness journey-gate` command waits for Spec A's R9 tasks (Spec A tasks 4.1 to 4.5) to merge] Make one stack the documented local stack
    - The harness's own isolation (the widget stub, the resource hints and both outside-host checks) is task 3.7's and the DSN is task 1.3's; both are done before this task, under every option.
    - Options A, B or C:
      - Write `harness/bin/local-setup.sh` as the one bring-up path (design §1): the prerequisite check (Docker with Compose v2, Bun, Git, curl, python3 3.8 or later; exit 3 naming the missing tool), then `bun install --frozen-lockfile` at the repository root, then `bash harness/bin/harness up`, passing the caller's environment through.
      - Rewrite `LOCAL-TESTING.md` and `docs/runbooks/local-parity.md` around it, including the outside-host table with the error-reporting row as design §1 states it.
      - Add `scripts/tests/test_local_setup_doc.py` and `scripts/tests/test_local_setup_prereqs.py` as standard-library `unittest` files; the prerequisite test builds a `PATH` of stub executables that lacks one tool at a time, so it does not depend on the runner's tools. Run both as one blocking step in `.github/workflows/ci.yml`'s `backend-drift-guards` job, beside task 3.3's doc-path check, as `python3 scripts/tests/test_local_setup_doc.py` and `python3 scripts/tests/test_local_setup_prereqs.py` from the repository root. `spec-governance.yml` runs its self-tests by name (`:52-55`) and would not run them.
      - After Spec A's R9 tasks are merged, change Spec A's `harness journey-gate` command so that it exports its four gate values and then calls `local-setup.sh` in place of its own `build_spa`, `compose_up` and `wait_healthy`, continuing with `ensure_browser`, the storage check, the edge check, `run_journey_gate` and `drain_check`. Confirming D2 confirms this change to Spec A's command; record the confirmation and the merge commit of Spec A's R9 tasks in the evidence summary. Spec A's workflow is not edited.
      - Show from the gate's run log that the four values reached the stack, and that the stack was brought up once.
    - Option D: add Mailpit, the payment adapter and beat to `backend/docker-compose.local-test.yml` instead (its MinIO comes from Spec A's R1, Spec A task 3.1, and its Postgres is already `postgres:17-alpine` from task 6.1), write `local-setup.sh` for that stack with the same two tests and the same `ci.yml` step, point `VITE_LENCO_WIDGET_URL` at the adapter's published port, and run task 3.7's plugin and host checks against it. Leave Spec A's `harness journey-gate` unchanged. Add a CI run of the Journey_Gate specs against the local-test stack for Requirement 1.1, or record Requirement 1.1 as not met if that stack cannot host them.
    - Write the decided wording into `tech.md` Commands.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [ ] 11.2 [Decision D2 confirmed 2026-11-08 (option A + B); blocked until the operator has removed `local-stack-storage` from the required checks on `main`] Retire the other local stacks
    - Spec A's R1 builds on `backend/docker-compose.local-test.yml` (design §1, "Retiring the local-test stack"), so deleting it alone would fail a required check and the blocking unit suite. Do this in order:
      1. Ask the operator to remove `local-stack-storage` from the required checks on `main` (Spec A task 4.5 made it required), and wait for the answer.
      2. In one change: remove the `local-stack-storage` job from Spec A's `.github/workflows/student-journey-gate.yml` (the harness `journey-gate` already runs `storage_roundtrip_check --expect-private`, Spec A task 4.4); remove the compose assertions in `backend/tests/unit/test_storage_settings_contract.py` (Spec A task 1.1) and keep its settings assertions; remove `backend/.env.local.test.example`, its `.gitignore` exception, its `test_tracked_env_files.py` allowlist entry and its entry in the env-template test (Spec A task 3.3); then delete `backend/docker-compose.local-test.yml`, `backend/docker-compose.local-real.yml` and `backend/docker-compose.yml`, and every doc or steering sentence that presents them as supported, including the `LOCAL-TESTING.md` blocks that task 6.1 rewrote. The doc-path check must stay green.
      3. Record in the evidence summary that Spec A's clause 2.1 (a storage round-trip on the documented stack) is now met on the harness, and the merge commit of step 2. Do not edit Spec A.
    - Option D: retire nothing.
    - _Requirements: 1.7_

  - [x] 11.3 [Decision D2 confirmed 2026-11-08 (option A + B)] Untrack raw evidence artefacts (option B or C)
    - Run both spec validators first.
    - `git rm --cached` every raw artefact type of Requirement 4.1 under `docs/v2-evidence/` (design §4) and add the `.gitignore` rules.
    - Add the dated note and commit permalinks to every tracked Markdown file that references an untracked file, links and backticked paths alike: the READMEs under `docs/v2-evidence/` and every Markdown file outside it (at HEAD, `docs/runbooks/legacy-column-deprecation.md:233,291`). List, and do not edit, any reference in a D12 spec (Requirement 22.11).
    - Switch `v2-harness-smoke.yml` to artefact-only output.
    - Commit, then run both validators again in a fresh `git worktree` of that commit, where the untracked files are absent.
    - Make no history rewrite (D2 option C waits for D11).
    - _Requirements: 4.1, 4.2, 4.3, 4.9_

  - [x] 11.4 [Decision D2 confirmed 2026-11-08 (option A + B)] Cut the launch-verdict rollup (option A, B or C), or annotate it (option D)
    - Remove the Gate 12 job and its verdict step, the `collect-suite-results.py` steps, `rollup.py`, the verdict documents, and each operator-gate script that only feeds the verdict. Prove with `git grep` that no kept gate imports a removed script.
    - Keep the contract-sync, brand-scan, scope and `version_eval.py` gates blocking.
    - Rewrite `docs/runbooks/launch-verification.md` to describe only the kept gates.
    - Option D: keep the rollup, and add a dated note to `docs/launch-evidence/launch-readiness.md` that its "production-launch-ready, 11/11" verdict covers neither document upload nor the student journey (critique §6 row 12).
    - _Requirements: 4.5, 6.1_

- [ ] 12. Jobs-ops freeze (D1)
  - [ ] 12.1 [Decision D1 confirmed 2026-11-08 (option B); the `webhooks/delivery/` step waits for the D1.b answer, which is still open] Put every jobs-ops route behind the flag (option B)
    - Mount the email seed routes and the four document seed routes only when `ENABLE_JOBS_OPS_ROUTES` is on (design §3).
    - The D1.b answer is still open (recommendation: gate the webhook with the flag). Until the user answers, leave `webhooks/delivery/` mounted exactly as today, with its External_Consumer_List entry marked "pending D1.b". Then apply the answer (gate it, keep it with its secret required in production, or remove it) and record it in `scripts/route-consumers.json` (Requirement 3.5). The task is complete only when that step is done; every other step proceeds now.
    - Add the seven routes to the stub list in `check-launch-scope.py`.
    - Add tests for both flag values, and regenerate the OpenAPI baseline.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: while the flag is off, the seven seed and scaffold routes answer 404.
    - _Requirements: 3.3, 3.5, 3.7_

  - [x] 12.2 [Decision D1 confirmed 2026-11-08 (option B)] Show the decided jobs-ops UI state
    - Option B: add `FeatureGate` and `JobsOpsNotEnabled` at the router root (design §3), including the metadata error state with Retry. Assert in a test that no feature request fires while jobs-ops is disabled.
    - Option A: remove the right rail from `JobsOpsShell.tsx` instead (API base, creator, pinned references).
    - Option C: replaced by the move-out described in D1's register entry.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 3.6, 13.3_

  - [x] 12.3 [Decision D1 confirmed 2026-11-08 (option B)] Write the decided jobs-ops wording into the steering
    - Update `tech.md`, `product.md`, `structure.md` and the canonical truth map's attribution row to the decided state.
    - _Requirements: 6.1, 6.5_

- [x] 13. Demo views and change requests (D5)
  - [x] 13.1 [Decision D5 confirmed 2026-11-08 (demo views cut)] Remove the v2 demo views
    - Remove their routes from `backend/apps/common/v2/urls.py`, then `demo_views.py` and its tests.
    - Regenerate the schema baselines and `apps/admissions/src/generated/api.d.ts`, and update the truth-map rows.
    - Delete their entries from the routes-report baseline.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: the v2 demo routes answer 404.
    - _Requirements: 2.6, 2.9_

  - [x] 13.2 [Decision D5 confirmed 2026-11-08 (change-request workflow left dormant, option C)] Apply the decided change-request outcome
    - Option B:
      - Remove the six routes, the service, the state machine, the outbox emitters, their tests, the v2 onboarding views and the tenant console's request-change affordances.
      - Keep the table and `canonical_config_commands.py`.
      - Record TEN-06 as open in the truth map and in `enterprise-tenancy.md`.
    - Option C (confirmed): add the six routes to `scripts/route-consumers.json` with the reason "dormant by decision D5", and remove them from the baseline. Do not remove the workflow, the service, the state machine or the three `*.request_change` capabilities (Requirement 8.3).
    - Option A: record the follow-up work and build nothing.
    - Deploy path, under option B: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Options A and C change nothing production serves.
    - _Requirements: 2.7, 2.9, 6.5_

- [x] 14. Removals the critique did not number (D15)
  - [x] 14.1 [Decision D15 confirmed 2026-11-08 (remove)] Remove the dev-only `@react-pdf` stack (item a)
    - Delete `apps/admissions/src/lib/pdf/`, the dev preview pages that import it, its fonts, PNGs and 12 test files, the `@react-pdf/renderer` dependency, and the PDF chunk smoke step with `scripts/check-pdf-chunk-load.mjs`.
    - Rewrite `DESIGN.md` §2 "Print / PDF" to describe the backend renderers, and update `documentFlowDriftGuard.test.ts`'s file list while keeping its rule.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 2.8, 2.9_

  - [x] 14.2 [Decision D15 confirmed 2026-11-08 (remove)] Remove the draft compatibility endpoint and `saveDraft` (item b)
    - Remove `ApplicationDraftView` (`backend/apps/applications/urls.py:86`) and `applicationService.saveDraft`.
    - Update the truth map's "Compatibility draft payload" row. Keep the model and table.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: `/api/v1/applications/draft/` answers 404.
    - _Requirements: 2.8, 2.9, 2.10_

  - [x] 14.3 [Decision D15 confirmed 2026-11-08 (remove)] Remove the `applications/views.py` shim (item c)
    - Repoint the test imports and `patch()` targets listed in task 8.3 to the split modules, run the backend suite, then delete `backend/apps/applications/views.py`.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: none expected; at HEAD only tests import the shim.
    - _Requirements: 2.8, 2.9_

  - [x] 14.4 [Decision D15 confirmed 2026-11-08 (remove)] Remove modules with no product importer (item d)
    - Delete the confirmed modules from task 8.3's list, with their tests, and delete their entries from the unreachable-module baseline.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 2.8, 2.9_

  - [x] 14.5 [Decision D15 confirmed 2026-11-08 (remove)] Remove the placeholder apps (item e)
    - Delete `apps/website/` and `apps/student-portal/`, refresh `bun.lock`, and remove their rows from `structure.md` and `product.md`.
    - In the same change, remove the two lines that copy their `package.json` into the frontend image's build stage (`apps/admissions/Dockerfile:23-24`).
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: none on what is served, but without the Dockerfile change the image build of the next Deploy run fails.
    - _Requirements: 2.8, 2.9_

  - [x] 14.6 [Decision D15 confirmed 2026-11-08 (remove)] Remove the agent hub (item f)
    - Delete `scripts/agenthub/`, `.agenthub/`, their five unit-test files and the integration smoke test.
    - _Requirements: 4.8_

  - [x] 14.7 [Decision D15 confirmed 2026-11-08 (remove)] Remove the stray root entries (item g)
    - `git rm` the files `=== schema hash (sha256 of regenerated OpenAPI) ===` and `⚠️`, and `rmdir` the empty untracked directories `=== candidate commit ===/` and `echo/`.
    - _Requirements: 4.8_

  - [x] 14.8 [Decision D15 confirmed 2026-11-08 (remove)] Remove `keep_alive_task` (item h)
    - Remove the beat entry (`base.py:185-188`), the task function, `KEEP_ALIVE_URL`, their tests and the steering row. Task 4.4's drift guard must stay green.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: production's beat stops pinging its own health endpoint every 4 minutes.
    - _Requirements: 9.3_

  - [x] 14.9 [Decision D15 confirmed 2026-11-08 (remove)] Remove the unused upload paths (item i)
    - Delete the dead upload paths that task 8.3 took from Spec A's frozen list (design §2): `documentService.upload`, `useWizardFileUploads` and its barrel export, the `startUpload` callback of `useApplicationFileUploads` with `uploadApplicationFile` and `downloadFile` in `lib/storage.ts`, and `lib/applicationSlipStorage.ts` with `lib/slipService.ts`. Keep every other export that has a caller, checked with `git grep` for each name. Requirement 22.12's guard tests (`test_required_documents_contract.py`, `test_required_documents_contract_7_2.py`, `test_document_evidence_compensation_7_3.py`, `requiredDocumentsDrift.test.ts`) pass unchanged.
    - Remove the deleted entries from the frozen list in `apps/admissions/tests/unit/uploadPathSingleSource.test.ts` in the same change, and keep the guard.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 2.8, 2.9, 22.12_

- [x] 15. Vendored skills (D6)
  - [x] 15.1 [Decision D6 confirmed 2026-11-08 (option B)] Prune the skills to the confirmed keep-list
    - Option B, skill by skill (design §4):
      - keep exactly one real copy of each kept skill. If `.kiro/skills/<name>` is a symlink, its content stays in `.agents/skills/<name>`, or moves into `.kiro/skills/<name>` with the symlink removed in the same commit. Never delete a directory that a kept entry resolves to;
      - delete `ui-ux-pro-max`'s second real copy in `.agents/skills/`;
      - for a skill not on the list, delete its `.kiro/skills/` entry, and the `.agents/skills/` target of that symlink unless another kept entry links to it;
      - delete the two dangling symlinks, and their baseline entries in the skill-path check.
    - The skill-path check (task 3.3) must stay green, including every symlink and `.agents/skills.json` path.
    - Option A: delete only the two dangling symlinks and their baseline entries, if you confirm that.
    - Option C: move every skill to the confirmed location first, then update every steering path.
    - _Requirements: 4.6, 4.7_

  - [x] 15.2 [Decision D6 confirmed 2026-11-08 (option B)] Record the skill set in the steering
    - Update `design-skills.md`, `engineering-skills.md` and `.agents/AGENTS.md` §3 to the kept set and its location.
    - _Requirements: 4.6, 6.1_

- [ ] 16. Performance caches (D7)
  - [ ] 16.1 [Decision D7 confirmed 2026-11-08 (option A); blocked until a live production host exists and the P0_Ops_Check has run (D14)] Remove the capabilities and dashboard caches (option A, after the P0_Ops_Check)
    - Read the P0_Ops_Check record. If a cache is on in production, stop and re-ask D7 with that data.
    - Remove the cache branches (`services.py:1048`, `admin_user_views.py:279-292,532-533`), their signal handlers, their flags and `scoped_cache.py` once it has no importer.
    - Triage each perf test file as design §5 describes, and record each file's disposition before deleting.
    - Update `perf-flags.md` and the env examples.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: the endpoints serve uncached bodies, the same as with the flags off (Requirement 5.4).
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [ ] 16.2 [Decision D7 confirmed 2026-11-08 (option A); blocked until a live production host exists and the P0_Ops_Check has run (D14)] Decide the catalogue cache from production data
    - Keep `catalog_cache.py` only if the P0_Ops_Check shows it on in production and a recorded measurement shows its effect. Otherwise remove it, its helper branches and its tests the same way.
    - Deploy path, if the cache is removed: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 5.1, 5.3, 5.4_

- [ ] 17. Capability catalogue (D3)
  - [x] 17.1 [Decision D3 confirmed 2026-11-08 (option B); blocked until Spec A's P0 (its tasks 3 to 5) is merged] Remove `platform.user.create_global` (option B)
    - Remove it from `PLATFORM_CAPABILITIES`, and update every file in its update set from task 8.1 in the same commit: at HEAD `scripts/authority_matrix_registry.py`, `scripts/authority_matrix_v2.py`, `backend/tests/perf_baseline/fixtures/admin_scope.json`, the truth map and `docs/tenant-admin-super-admin-permissions-plan.md`, plus `enterprise-tenancy.md`'s capability list. Then run `test_capability_endpoint_shape.py`, `test_capability_self_description_m3.py` and the derivation property tests.
    - Add the regression test that a grant naming a removed capability grants nothing and raises nothing (design §8).
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 8.1, 8.2, 8.5, 8.6, 22.1_

  - [ ] 17.2 [Decision D3 confirmed 2026-11-08 (option B) and D5 confirmed 2026-11-08 (workflow dormant, option C); blocked: the two conflict, because the dormant workflow's submit authority uses these three capabilities (Requirement 8.3). It does not start until the user answers (D3, Interaction)] Remove the three `*.request_change` capabilities (only with D3 option B and D5 option B)
    - Remove `tenant.profile.request_change`, `tenant.program.request_change` and `tenant.domain.request_change`, with their frontend gates, and update every file in their update set from task 8.1 (20 at HEAD, including the OpenAPI baselines and the generated API types), as in task 17.1.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 8.1, 8.3, 8.5, 22.1_

  - [ ] 17.3 [Decision D3 confirmed 2026-11-08 (option B); blocked until Spec A's P0 is merged and the user approves task 8.1's merge table] Apply the approved merge table
    - Apply only the merges you approved from task 8.1's table, one capability pair per commit, with the cross-tenant property tests unchanged and green after each.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 8.1, 8.4, 8.5, 8.6, 22.1_

- [x] 18. OCR opt-in (D4)
  - [x] 18.1 [Decision D4 confirmed 2026-11-08 (option B)] Add the OCR policy and the backend gate (option B)
    - Create `backend/apps/documents/ocr_policy.py`.
    - Add the 409 `OCR_NOT_ENABLED` branch to `DocumentExtractView.post`, after the scoped authorization, and the run-time re-check in `extract_document_text_task`. Upload validation and its staged write order are untouched (Requirement 22.12); the extract endpoint changes nothing before the staged write.
    - Add the opt-in command (design §11): `GET` and `PUT /api/v1/admin/documents/ocr-opt-in/` in a new `ocr_opt_in_views.py`, gated by `HasPlatformCapability` with `required_capability = "platform.settings.manage"`, validating the body, and writing the row and a `TenantAuditService.record_event` in one transaction. The event uses `action="settings.change"` (a new `ACTION_SETTINGS_CHANGED` constant), `entity_type="setting"`, `entity_id` set to the setting row's UUID (never the key, which `_coerce_uuid` would store as `NULL`), `actor_id=getattr(request.user, "id", None)`, `actor_role=getattr(request.user, "role", None)`, and the key with the ids before and after in its metadata. Register the route in `scripts/authority_matrix_registry.py` with `audit_event="settings.change"` and in `scripts/route-consumers.json`, and show the call in `docs/runbooks/multi-tenant-operations.md` with a placeholder origin, `$API_ORIGIN/api/v1/admin/documents/ocr-opt-in/`, and no host name (Requirement 6.6).
    - Keep the key out of the generic settings endpoints: their reads omit it, writes to it return 403 `KEY_MANAGED_ELSEWHERE`, import reports it as an entry error, and reset keeps its row. Change nothing else in those endpoints; their `IsAdmin` reads and role-string write gate stay a known issue (task 1.1).
    - Register `OCR_NOT_ENABLED` and `KEY_MANAGED_ELSEWHERE` in `apps/common/error_codes.py`, its frontend mirror and the truth map.
    - Add tests: a caller without `platform.settings.manage` gets a non-revealing 403, an invalid body writes nothing, a tenant admin's generic settings read does not contain the key, reset leaves the row, and a successful `PUT` leaves one audit row with a non-null `actor_id`, an `entity_id` equal to the setting row's id, and `key` and `actor_role` in its `changes`.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: the extract endpoint refuses every institution that has not opted in, which at first is every institution. Merge it together with task 18.2, so the wizard that stops calling the endpoint ships in the same Deploy run.
    - _Requirements: 6.6, 11.2, 11.4, 11.5, 22.1, 22.9, 22.12_

  - [x] 18.2 [Decision D4 confirmed 2026-11-08 (option B)] Publish OCR availability and stop polling where it is off
    - Add `ocr_available` to the required-documents contract and its client type, regenerate the types, and add a drift guard.
    - Make the wizard call extract and poll only when `ocr_available` is true, and render the manual grade form first on every tenant.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy, together with task 18.1.
    - _Requirements: 11.1, 11.3, 11.5, 11.6_

  - [x] 18.3 [Decision D4 confirmed 2026-11-08 (option B)] Write the OCR property test and update the docs
    - **Property 9: OCR runs only for opted-in institutions**
    - **Validates: Requirements 11.2**
    - Test in `backend/tests/property/test_platform_simplification_properties.py` using hypothesis.
    - Update the tech steering's "Generative AI Boundary" table and `docs/ai-data-flows.md` to describe the opt-in.

- [x] 19. Email verification stance (D8)
  - [x] 19.1 [Decision D8 confirmed 2026-11-08 (option B)] Write the decided email-verification wording
    - Option B: state in `product.md`, `tech.md` and `docs/canonical-truth-map.md` that email verification is not part of the flow by decision D8, and point to `backend/apps/common/email_links.py`'s existing note.
    - Option A: record that it needs its own spec, and change nothing else.
    - _Requirements: 6.1, 6.5_

- [x] 20. Spec relationships (D12)
  - [x] 20.1 [Decision D12 confirmed 2026-11-08 (two specs; Spec B supersedes `student-ui-ux-mobile-remediation`)] Record the decided spec relationships
    - Lean: register this spec in the canonical truth map's spec section as superseding `student-ui-ux-mobile-remediation` for the student surfaces, and list the record-only overlaps. Keep `spec-status-exceptions.json` in step.
    - Edit none of the four D12 specs.
    - _Requirements: 6.3, 22.10, 22.11_

- [x] 21. Checkpoint: P1 exit
  - The Documented_Local_Stack passes the Journey_Gate (task 11.1); the routes-versus-callers and doc-path checks are green; the test database is built from SQL and `-n 6` is green.
  - List every P1 task that still waits on a prerequisite or an open decision: task 6.8 and tasks 16.1 and 16.2 until a live production host exists (D14), task 12.1's webhook step until D1.b is answered, tasks 17.1 to 17.3 until Spec A's P0 is merged (and 17.2 until the D3 and D5 conflict is answered, 17.3 until the merge table is approved), and task 11.2 until the operator has dropped `local-stack-storage` from the required checks. State that Requirement 7.2's production comparison is open until task 6.8 runs.
  - Ask the user if questions arise.
  - _Requirements: 1.1, 2.2, 6.2, 7.1, 7.2, 7.5_

- [ ] 22. Rendered design gate (built first, with a baseline of today's findings)
  - [x] 22.1 Set up the rendered-gate runner and the Audited_Page_Set
    - Start after tasks 1.3 and 3.7: the payment pages load the card widget on mount, so without task 3.7's stub and outside-host gate, and task 1.3's parseable DSN, the console gate fails pages for reasons this gate does not measure (design §12.7).
    - Create `apps/admissions/playwright.rendered-gate.config.ts` with `desktop` (1440×900) and `mobile` (390×844) projects, reusing the harness fixtures.
    - On each page: wait for the network to go idle, take the screenshot, run axe, run the measurements, and run the impeccable detector last.
    - Visit every page, public and authenticated, through the harness edge on top of Spec A's seed. Visit the wizard at `/student/application-wizard`, not at its `/apply` alias, which is not a Student_Route (Requirement 19.2).
    - Build each state of Requirement 19.2 in the gate's own setup with the helpers in `apps/admissions/tests/harness-e2e/helpers/api.ts` (design §12.7), so no state depends on seed data that may not hold it.
    - _Requirements: 19.2_

  - [x] 22.2 Run impeccable's browser detector inside the Playwright pages
    - Create `apps/admissions/tests/harness-e2e/rendered-gate/impeccable.ts` (design §12.7): read `cli/engine/detect-antipatterns-browser.js` from the global `impeccable@2.1.9` install (`npm root -g`), evaluate it in the page with `page.evaluate`, call `window.impeccableScan()`, and map each `{el, findings}` to `{rule: "impeccable/" + f.type, detail: f.detail, selector: selectorFor(el)}`. Fail, naming the path, if the engine file is missing. Do not use the CLI or any snapshot or static server for these scans.
    - Create `selectorFor` in `apps/admissions/tests/harness-e2e/rendered-gate/selector.ts` with the order `data-testid`, then an `id` that contains no `:`, then a `tag:nth-of-type` path from the nearest such ancestor or `body`; inject it into the page as source text, and key axe and measurement findings with it too. Add `apps/admissions/tests/unit/renderedGateSelector.test.ts` under jsdom for the order, including a React-style `:r1:` id and a Radix `radix-:r1:` id that must be skipped.
    - Run the detector last on each page, because it draws overlays and schedules one more scan 100 ms later.
    - _Requirements: 19.1, 19.4_

  - [x] 22.3 Run axe on the same pages and states
    - Use `AxeBuilder` with the tags in Requirement 19.3, one test per page and viewport, recording each scan's duration (the pattern of `axe-viewport-sweep.spec.ts`).
    - _Requirements: 19.3, 18.1_

  - [x] 22.4 Measure type size, hit areas, overflow and clipped text
    - Add an in-page measurement script, plus the pure classifier `scripts/rendered-gate-rules.ts` (design §12.7), with the rules of Requirement 19.7:
      - font size on student routes, by role, with the precedence caption, navigation, control, body, other, plus each text-entry `input`, `select` and `textarea` measured as a control by its own computed size;
      - hit area, the union of an element's box and its associated label's box, with skip links measured focused and links in running text measured like any control. Record an `inRunningText` flag on every anchor: its computed `display` is `inline` and its nearest block-level ancestor has a non-empty text node outside the anchor (design §12.7). Tasks 24.6 and 24.8 partition the hit-area findings by that flag;
      - overflow of text-bearing and interactive elements past the viewport's right edge, excused only inside a horizontal scroll container that ends inside the viewport, never by an `overflow-x: hidden` ancestor;
      - clipped or spilling text: a direct text child, an `overflow-x` other than `auto` or `scroll`, and `scrollWidth` more than 1 px over `clientWidth`, so text cut off by `truncate` and text spilling out of a fixed slot with `overflow-x: visible` are both reported.
    - Measure no element that is not rendered, is `visibility: hidden`, has zero area or sits in a closed `<details>` or collapsed region. Skip `aria-hidden` elements for the hit-area rule only.
    - Mark the wizard's step wrapper with `data-wizard-form-region`, and check, with the page at the top, that the first form control's whole box lies between the app bar's bottom edge and the sticky action bar's top edge (Requirement 15.2).
    - Mark the landing hero's two actions with `data-landing-action="primary"` and `"secondary"`, and check at 390 × 844, with the page at the top, that the primary action's whole box lies inside the viewport below any fixed or sticky header (`measure/first-control`) and that the two actions' widths differ by at most 1 px (`measure/action-width`) (Requirement 12.8).
    - Add a unit test for the role precedence on DOM fixtures, including an `aria-hidden` navigation label that must still be measured, a navigation count badge marked as a caption, and a label that spills out of a fixed-width slot with `overflow-x: visible`.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Production effect: none visible; the two `data-*` markers are added.
    - _Requirements: 19.7, 12.8, 15.2, 16.1, 16.10, 17.4, 17.12, 21.2_

  - [ ] 22.5 Commit the baseline and make the gate blocking
    - Create `scripts/rendered-design-baseline.json` from the first run, with a reason on every entry and each `rule` prefixed by its source (`impeccable/`, `axe/` or `measure/`).
    - Add the `rendered-design-gate` job to Spec A's `.github/workflows/student-journey-gate.yml`, blocking and without `continue-on-error`, with a 45-minute timeout like Spec A's `journey-gate` job (design §12.7). When relevant it runs `oven-sh/setup-bun@v2` (`harness up` builds the SPA with Bun, `harness/bin/harness:84-86,218`), sets up Node, runs `npm install -g impeccable@2.1.9` with `PUPPETEER_SKIP_DOWNLOAD=1`, runs `bunx playwright install --with-deps chromium` from `apps/admissions/` (`harness up` installs no browser; `ensure_browser` runs only in `smoke` and `e2e`, `:145-156,223,228`), brings the harness up, runs the rendered-gate config, dumps the harness logs on failure, and always tears the harness down.
    - Give the job the workflow's relevance step with one more prefix, `scripts/rendered-`, so it runs on every pull request that touches `apps/admissions/`, `backend/`, `harness/` or the gate's own files under `scripts/`, and treat every push to main as relevant. Leave the journey-gate job's relevance list unchanged. Keep the existing `design-audit` job.
    - Upload the screenshots as an artefact; never commit them.
    - Operator step (repository settings): after two green runs on `main`, make `rendered-design-gate` a required check, as Spec A does for its own jobs (Spec A task 4.5). A failing job that branch protection does not require still lets a pull request merge. The workflow has no `paths:` filter, so requiring the job cannot leave a check pending.
    - _Requirements: 19.4, 19.5, 19.6_

  - [x] 22.6 Fail the gate on the build badge outside diagnostics
    - Fail when the badge's own element, matched by its `aria-label` or `title` starting with "Frontend build" (`BuildVersionBadge.tsx:45,50,71,74`), is present on an audited page of the harness's production build. Do not match visible text.
    - _Requirements: 13.2_

  - [x] 22.7 Write the classifier property test
    - **Property 11: Rendered size rules classify correctly**
    - **Validates: Requirements 12.8, 15.2, 16.1, 16.10, 17.4, 17.12, 19.7, 21.2**
    - Test in `apps/admissions/tests/property/platformSimplificationPolish.property.test.ts` using fast-check, with generated roles, label boxes, hidden, zero-area and `aria-hidden` records, scroll-container and clipping ancestors, clipped and spilling text records with every `overflow-x` value, landing action boxes and widths, and inline links.

- [x] 23. Contrast (Impeccable `audit`, a11y-audit)
  - [x] 23.1 Create one status-tone map and adopt it
    - Create `apps/admissions/src/lib/statusTone.ts` from `StatusPill`'s `TONE_CLASSES` (`components/ui/StatusPill.tsx:36-43`), keeping its rule (Requirement 18.2). For each tone: the tint, the border, the text class (`text-foreground`, and `text-muted-foreground` for `muted`) and an icon class: the base colour for `info`, `warning`, `success` and `danger`; `text-muted-foreground` for `neutral` and `muted`, which have no base colour (9.41:1 on `bg-muted`, 9.77:1 on `bg-muted/60` over white); and `text-accent-foreground` for `accent`. `StatusPill` has no `accent` tone, so that row comes from the identity-document icon tile (`components/student/applicationStatus/DocumentChecklist.tsx:51-52`, `bg-accent/10`). Use the token pairs in design §12, Phase 5.
    - Adopt it in `StatusPill` with no change to its colours or icons: it takes the tint, border and text classes, and its icons keep inheriting the text colour, which Requirement 18.2 allows. Adopt the whole map, icon class included, in `Alert` (whose tone-coloured text on 5% tints it replaces, `components/ui/Alert.tsx:12-16`; its icons keep the tone colour), the admin chips and the student document rows.
    - Delete each axe and impeccable baseline entry this fixes.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 18.2, 18.1, 22.8_

  - [x] 23.2 Remove alpha modifiers from text tokens
    - Replace every `text-<token>/<NN>` use, for any `--color-*` token in `apps/admissions/src/styles/design-tokens.css` and with any variant prefix (`hover:`, `focus:`, `placeholder:` and the rest). At HEAD there are 23: 10 `text-muted-foreground/NN`, 5 `text-foreground/80` or `/60`, 6 `hover:text-primary/80`, `text-destructive/70` and `hover:text-destructive/80`. Use the replacements in design §12, Phase 5.
    - Add `apps/admissions/tests/unit/textTokenAlpha.test.ts`: a source scan of `apps/admissions/src/` that reads the token names from `design-tokens.css` (not the `-rgb` channel variables) and fails, naming file and line, on any match. Include fixtures for a variant prefix, which must match, and for `text-white/80`, which must not.
    - Leave the 25 `text-white/NN` uses: they are Tailwind palette colours, not tokens, and axe's `color-contrast` measures their composited contrast (design §12, Phase 5). Record that decision in the evidence summary.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 18.3_

  - [x] 23.3 Fix the solid-fill and dark-surface misuses
    - Give the review step's "Go to step" buttons (`SubmitStep.tsx:212,240`) `text-foreground` on the warning tint.
    - Give the landing's closing paragraph (`LandingPageSections.tsx:451`) `text-accent` on `bg-foreground`.
    - Fix any other solid-fill foreground on a tint that axe lists.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 18.4, 18.5_

  - [x] 23.4 Make meaningful icons readable
    - Give the identity-document icon (`DocumentChecklist.tsx:51-52`), or its successor in Spec A's list, `text-accent-foreground`, and check other status icons against 3:1.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 18.6_

  - [x] 23.5 Write the status-tone property test
    - **Property 6: Every status tone is readable**
    - **Validates: Requirements 18.2, 18.4, 18.6**
    - Test in `apps/admissions/tests/property/platformSimplificationPolish.property.test.ts` using fast-check, computing ratios from the token hex values over white, `--color-card` and `--color-muted`, asserting that every tone's text token is `--color-foreground`, or `--color-muted-foreground` for `muted`, and checking both icon options (the tone's icon class and the inherited text colour) against 3:1.

- [ ] 24. Typography and copy (Impeccable `typeset`, `clarify`; copy-editing)
  - [x] 24.1 Bring student mobile text to 16 px
    - Use `text-base` below `sm` for student paragraphs, labels and buttons, and on the input, select and textarea primitives.
    - Make `Button` set `data-text-role="control"` on what it renders, so a `Button asChild` link is measured as a control, and mark the helper-text paragraphs of `components/ui/input.tsx` (`:71-75`) and `textarea.tsx` with `data-text-role="caption"` (design §12.5 "Roles").
    - Before editing a file, check the open tasks of `student-ui-ux-mobile-remediation` for it if D12 kept that plan live.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 16.1, 16.8, 19.7_

  - [x] 24.2 Remove arbitrary font sizes
    - Replace the 31 `text-[Npx]` uses in 13 files outside `BuildVersionBadge.tsx`, which is Spec A's, by where each renders and what it is (the table in design §12.5):
      - on student routes, the badges and metadata become `text-sm` with `data-text-role="caption"`: `MessageDeliveryState.tsx:119,142,166`, `NotificationItem.tsx:105`, and the count badges `NotificationBell.tsx:87` and `BottomNavigation.tsx:195,232`, whose circles grow from 18 px to 20 px (`h-5 min-w-5`) so the count fits;
      - on student routes, the paragraphs `MessageDeliveryState.tsx:174,179` become `text-base`;
      - the desktop-only chrome (`Header.tsx:49`, `DesktopSidebar.tsx:129`, `EnhancedProgressIndicator.tsx:128`) and the public and admin uses (`ContactPage.tsx` six times, `ApplicationInfoGrid.tsx:26`, `shape-landing-hero.tsx:173,182`, `AdminCommunicationsPanel.tsx` five times, `FiltersPanel.tsx:135`, `pages/admin/Applications.tsx:646-648`) become `text-xs`;
      - the contact form's `text-[15px]` (`pages/ContactPage.tsx:231`) becomes `text-base`.
    - Delete the rendered-gate font-size baseline entries this fixes.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 16.1, 16.2_

  - [x] 24.3 Use one spelling and sentence case
    - Change user-facing "Program" and "Programs" to "Programme" and "Programmes", and change title-case headings, buttons, labels and navigation items to sentence case. Leave identifiers alone.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 16.3, 16.4_

  - [x] 24.4 Use one optional-field marker
    - Implement "(optional)" in the shared label or field primitive, remove the required-field asterisks, and keep `required` and `aria-required`.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 16.5_

  - [x] 24.5 Fix the copy mechanics
    - Replace em dashes in UI strings, use "…" in progress text, put `max-w-prose` on running text, and set the payment-step total in `font-mono` (`PaymentStep.tsx:148`).
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 16.6, 16.7, 16.9_

  - [x] 24.6 Give every control on the audited pages a 44 px hit area
    - Start after task 22.5's first baseline, and record its number of `measure/hit-area` entries.
    - Fix every `measure/hit-area` entry on the Audited_Page_Set (design §12.5), public, authentication, student and admin pages alike, except the admin queue's rows and checkboxes, which task 30.4 fixes, and the findings that task 22.4's measurement flags `inRunningText`, which wait for D17 (task 24.8). Partition by that flag, so the two scopes are disjoint and together complete:
      - standalone links and buttons get `min-h-touch` and `min-w-touch` with centred content. Start with `AuthShellLink` (`components/auth/AuthShell.tsx:132-154`), a link with no minimum height that every authentication page renders inside the `text-sm` `AuthShellFooter` (`:117-126`);
      - icon buttons get padding up to 44 × 44 px, for example the Show password toggle (`components/ui/PasswordInput.tsx:51-54`), whose icon size stays;
      - the wizard error summary's jump buttons (`WizardErrorSummary.tsx:71-75`) become 44 px `inline-flex` rows inside their list;
      - small inputs get a 44 px wrapping label, which the gate measures with them (Requirement 19.7).
    - Record the count again and delete the baseline entries this fixes. Every hit-area entry left must belong to task 24.8 or task 30.4, and each later task that rebuilds a surface adds none.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 16.10, 19.9, 22.8_

  - [x] 24.7 Bring student captions and badges to 14 px on mobile
    - Record the rendered gate's count of student-route `measure/font-size` findings before starting.
    - Give `StatusPill`'s `sm` size (`components/ui/StatusPill.tsx:72`) and `Badge`'s default `text-sm sm:text-xs`, so desktop is unchanged, and mark both roots with `data-text-role="caption"`. Their colours and icons do not change (task 23.1).
    - Walk the 143 `text-xs` uses in 44 files under `src/pages/student/` and `src/components/student/` (count at HEAD): a caption, badge or piece of metadata becomes `text-sm sm:text-xs` and gets `data-text-role="caption"`; a paragraph, list item, label or button label becomes `text-base sm:text-sm`; anything else stays `text-xs` and is listed in the evidence summary as "other" with a one-line reason.
    - Before editing a file, check the open tasks of `student-ui-ux-mobile-remediation` for it if D12 kept that plan live.
    - Record the count again, and delete the baseline entries this fixes.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 16.1, 19.7_

  - [ ] 24.8 [Blocked until D17 is confirmed] Bring links inside running text to the decided hit-area rule
    - Option A: pad each link inside running text that the gate lists, such as the sign-up consent sentence's "Terms" and "Privacy Policy" (`pages/auth/SignUpPage.tsx:336,338`), to a 44 × 44 px hit area.
    - Option B: move each such link out of its sentence into a standalone link or button that meets the rule, keeping what the sentence says.
    - Option C: amend the 44 px rule in all four places that state it (`.kiro/steering/design-skills.md`, `.agents/AGENTS.md` §2, `PRODUCT.md:97` and `DESIGN.md:198`; `design-skills.md` says its guardrails duplicate `PRODUCT.md`) to exempt links inside running text, then make `scripts/rendered-gate-rules.ts` and the Property 11 test skip the records flagged `inRunningText` (design §12.7). Spec A is not edited.
    - Recommendation recorded with D17 on 2026-11-08, not a confirmation: keep the guardrail and fix the link (option A or B). This task stays blocked until the user confirms D17.
    - Under every option, delete the baseline entries tied to D17.
    - Deploy path, under option A or B: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy. Option C changes nothing production serves.
    - _Requirements: 16.10, 19.7, 19.9_

- [ ] 25. Wizard chrome (Impeccable `distill`, `layout`)
  - [x] 25.1 One heading and one instruction per step
    - Remove the "Application Flow" eyebrow and the "Student Application" title card (`index.tsx:836-900`).
    - Add `instruction` beside each step's `title` in the existing step definition list, and drop each step's duplicate `SectionCard` title.
    - On mobile, remove the "Back to Dashboard" row, and on the wizard route make the app bar's back arrow go back in history only when the previous entry is inside the app, and to the dashboard otherwise (`AppLayout.tsx:158-161`, design §12.4). Add a test for both cases.
    - Keep the six steps, autosave, the draft picker and the save-status text. The Submit button keeps its `@idempotent` request and `submit-<applicationId>` key, and the wizard keeps pay-or-defer only (Requirements 22.2 and 22.13); `submitIdempotency.test.ts`, `applicationSubmitIdempotencyHeaders.test.ts` and `paymentOwnershipSplit.test.tsx` pass unchanged.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 15.1, 15.7, 22.5_

  - [x] 25.2 Merge the rails into one "Still needed" list
    - Create `WizardStillNeeded` (design §12.4) from the current step's failing Readiness items, plus the "Switch application" and "Start a new application" actions.
    - On mobile, collapse it below the form. Remove Step Checklist, Application Preview, Step notes and "Your applications".
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 15.3, 15.7, 22.2, 22.13_

  - [x] 25.3 Make accessible names contain the visible text
    - In `WizardActionBar.tsx:233,267`, use the visible text as the name, and move the destination step to `aria-describedby`.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 15.4_

  - [x] 25.4 Fix heading order and repeated file rules
    - Make the app header's account name (`components/navigation/Header.tsx:52`) a labelled non-heading element, and start step content headings at H2. `PageShell`'s dev guard must report no violation on any step.
    - Show the file rules once per upload control.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 15.5, 15.6_

  - [x] 25.5 Reach the first field in the first mobile screen
    - Reduce the mobile header to the app bar, the H1 and instruction, and one progress row (design §12.4).
    - Animate the progress bar with `transform: scaleX()` instead of `width`.
    - Confirm with task 22.4's measurement that, with the page at the top, the first form control's whole box sits between the app bar and the sticky action bar on every step.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 15.2_

  - [x] 25.6 Write the label-in-name property test
    - **Property 7: Accessible name contains visible text**
    - **Validates: Requirements 15.4**
    - Test in `apps/admissions/tests/property/platformSimplificationPolish.property.test.ts` using fast-check.

  - [x] 25.7 Give the education step's options unique keys
    - In `EducationStep.tsx:183`, add the group to each category header's value (`__cat_${group}_${cat}`), so the ECZ and A-Level headers no longer repeat in one list (C-18).
    - Add a unit test that renders both groups and asserts unique option values.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 15.8_

- [ ] 26. Truthful status (Impeccable `clarify`, `harden`)
  - [x] 26.1 Drive the stepper and the percentage from the one Readiness
    - Replace `useOverallProgress` in `index.tsx:227-233` with progress from Spec A's Readiness.
    - Pass `stepStates` to `EnhancedProgressIndicator`, removing the shortcut at `:294` and `:359`, and show "Incomplete" with its icon on visited failing steps.
    - Delete `useOverallProgress.ts` once nothing imports it.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 14.1, 14.2_

  - [x] 26.2 Show the incomplete alert only after a Continue attempt
    - Add `continueAttemptedSteps` to the wizard state, and change the alert condition at `index.tsx:1036-1039`.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 14.4_

  - [x] 26.3 Order next actions by wizard step (backend)
    - Stable-sort the actions in `build_next_actions` (`readiness_service.py:1231`) by `STEP_RANK` (design §12.3).
    - Update the readiness tests that assert the old order, and record the order in the truth map's readiness row.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 14.3_

  - [x] 26.4 Show the full fee estimate on the assigned-school step
    - Extract `fee_preview_payload` into `apps/documents/fee_quote_service.py`, quantising the base, the fee and the total with the quote mint's `_money` (design §12.3), and use it in `FeeResolveView` and `AssignmentPreviewView`.
    - Show the total, the breakdown and the estimate note in `AssignedSchoolStep.tsx`, through `formatServerAmount` only.
    - Update `AssignmentPreviewFee` (`services/catalog.ts:128`) and the generated types, and regenerate the schema.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 14.5, 22.2, 22.4, 22.13_

  - [x] 26.5 Stop rendering missing data as values
    - Remove "Started on Not available", "Last updated: Not available" and the interview section on drafts, and every other placeholder that renders missing data as a value on a student surface, found by searching student pages and components for "Not available" and "Not provided".
    - Add the `documentStatePresentation` map, with a Lucide icon per state in place of the `✓` glyph, and use it on Spec A's document list. Register it in the truth map with a drift guard that fails if a backend document state has no entry.
    - Render nothing in `WizardProgressSummary`'s `notEvaluatedYet` branch.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 14.6, 14.7, 14.8, 22.10_

  - [x] 26.6 Write the status property tests
    - **Property 1: Progress equals passing items over total**
    - **Validates: Requirements 14.2**
    - **Property 2: A step is complete exactly when its items pass**
    - **Validates: Requirements 14.1**
    - Frontend tests in `apps/admissions/tests/property/platformSimplificationPolish.property.test.ts` using fast-check.
    - **Property 3: Next actions follow the wizard's step order**
    - **Validates: Requirements 14.3**
    - **Property 10: Fee estimate agrees with the binding quote**
    - **Validates: Requirements 14.5**
    - Backend tests in `backend/tests/property/test_platform_simplification_properties.py` using hypothesis.

- [ ] 27. Honest promises (copywriting, content-humanizer, copy-editing)
  - [x] 27.1 Inventory every promise and fix the false ones in the app
    - Build the copy inventory (design §12.8) in the evidence summary, with the code that backs or does not back each statement.
    - Rewrite every in-app promise that no feature backs. Task 29.3 rewrites the landing's.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 20.1_

  - [x] 27.2 Take support contacts from the tenant resolver
    - Replace the hardcoded address (`Interview.tsx:385-386`) with the Tenant_Support_Resolver, and add a test that no student surface hardcodes an email address. `student-payment-interview-pages` has no open task on `Interview.tsx` (its six open tasks are optional navigation and payment-detection tests), so there is nothing to coordinate.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 20.2_

  - [x] 27.3 Fix the trust note, the admin subtitle, the workspace label and the reschedule prompt
    - Rewrite `AuthShell.tsx:51` to match Spec A's delivered session behaviour.
    - Remove "payment proof" from `Applications.tsx:577`, and rename `WorkspaceAside.tsx:56`'s label unless the note is about payment.
    - Render `Interview.tsx:381`'s prompt only when an interview exists.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 20.3, 20.4, 20.5_

  - [x] 27.4 [Decision D9 confirmed 2026-11-08 (option C); blocked until Spec A's `[R7.4]` is merged] Align letter copy with the decided letter option
    - Start only after Spec A's letter-copy clause `[R7.4]` is merged, and record that commit in the evidence summary.
    - Make every letter mention this spec writes agree with the chosen option and with Spec A's letter copy, and add no rejection-letter mention unless D9 adds the type.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 20.6_

  - [x] 27.5 Remove developer self-narration
    - Remove the strings the critique quotes from notification settings, settings and the admin dashboards, and any similar ones the copy inventory finds.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 20.7_

- [ ] 28. Developer artefacts
  - [x] 28.1 Remove the fixed sidebar status
    - Delete the "Workspace ready / Navigation synced" block, both variants (`DesktopSidebar.tsx:210-228`). Keep the admin dashboard's derived data-sources strip.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 13.1_

  - [x] 28.2 Map raw values to plain labels
    - Map the residency code shown next to the fee, and "Processed via Lenco", to the labels in design §12.2. Each mapping lives in the module that owns the value.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 13.4_

- [ ] 29. Landing, decision-independent part (Impeccable `distill`, `clarify`; copywriting)
  - [x] 29.1 Remove unsourced claims, logos and false links
    - Remove the stats section and constant, the "Government accredited" chip, the "Recognized by" strip, the hero metric row, the regulator and university logos on the feature tiles, and the three social links (design §12.1).
    - Remove the availability and identity claims: change the closing heading "The current intake is open. You can start tonight." (`LandingPageSections.tsx:449`) to "Start your application", drop "Takes about 30 minutes…" from its paragraph (`:452`), and remove "Because we teach the job, not just the theory." (`:81`), "We enroll students from Namibia…" (`landing.ts:289`) and "Campus security, hostel matrons … Our staff …" (`landing.ts:344`). Leave the sections they sit in for task 33.1.
    - If removing the stats section leaves the `components/smoothui` barrel or its modules unreachable, add baseline entries tied to D10 instead of deleting them.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 12.1, 12.6_

  - [x] 29.2 List programmes from the catalogue
    - Replace the hardcoded `programs` constant with catalogue data scoped by the portal context (design §12.1), with the empty, error and 429 states.
    - Give each programme row an "Apply" button that links to `/auth/signup` with no query parameter, and name the programme and school in the row's text. `SignUpPage` reads no query parameter, so nothing is promised that sign-up does not keep.
    - Point each button's `aria-describedby` at the ids of its row's programme and school text, so the "Apply" links stay distinguishable to assistive technology (WCAG 2.4.4) with the visible label unchanged, and add a unit test that every "Apply" link has a description naming its programme.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 12.2, 12.7_

  - [x] 29.3 Fix the call-to-action labels, headings, mobile widths and landing copy
    - Build every call-to-action label from data, remove counts that the page does not show, and give both hero buttons `w-full sm:w-auto`, keeping their `data-landing-action` markers from task 22.4. Confirm with the gate's `measure/first-control` and `measure/action-width` records that the primary action is in the first screen and both actions are equally wide at 390 × 844, and delete those baseline entries.
    - Rewrite the landing promises that break Requirement 20.1 (`landing.ts:233,258,332`).
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 12.7, 12.8, 20.1_

- [ ] 30. Admin review workspace (Impeccable `layout`, `distill`, `harden`)
  - [ ] 30.1 Open the queue as a table on wide screens
    - Read the view in `Applications.tsx:288` from a new in-memory Zustand store, `stores/adminQueueViewStore.ts` (design §12.6): below 640 px always `cards`; from 640 px the admin's chosen view if any; with no choice, `table` at 1024 px and wider and `cards` from 640 to 1023 px.
    - Add tests for each width band, with and without a choice, and for the choice surviving a round trip to the review route.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 17.1_

  - [ ] 30.2 Add the review route and the split pane
    - Start only after Spec A's `[R7.2]` and `[R7.3]` clauses are merged, and record that commit in the evidence summary.
    - Register `/admin/applications/:applicationId`, and extract `ApplicationReviewWorkspace` from `ApplicationDetailModal.tsx` with every control, guard and confirmation.
    - Render the pane beside the queue at 1024 px and wider, keeping the queue's scroll position, filters and selection.
    - Delete the modal once nothing imports it. `PaymentDecisionControls` and the approval actions keep their requests and guards (Requirement 22.2); the payment ownership tests pass unchanged.
    - Add the not-found and masked-404 states.
    - In the same change, move the assertions of the required harness spec `apps/admissions/tests/harness-e2e/required/admin-review-workspace.spec.ts` from tabs to sections: it clicks the documents, history, payment, interview and academic tabs with `getByRole('tab')` (`:438-446`), lists every tab to prove none is named AI and opens readiness (`:496-499`). Keep its claims (design §12.6): each section is reachable, one detail read with none of the retired calls (`:450-459`), the official-documents list as the one other per-application read (`:471-474`), and no section named AI. The spec must stay green.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 17.2, 17.7, 22.1, 22.2, 22.13_

  - [ ] 30.3 Open the review as a page on narrow screens
    - Start only after Spec A's `[R7.2]` and `[R7.3]` clauses are merged, and record that commit in the evidence summary.
    - Render the same route full page below 1024 px, with a back control that keeps the queue's query string. Hide the bottom navigation on that route.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 17.3_

  - [ ] 30.4 Fix the row targets, the badges and the filters
    - Start only after Spec A's `[R7.2]` and `[R7.3]` clauses are merged, and record that commit in the evidence summary.
    - Give rows at least 44 px of height, wrap each checkbox in a 44 × 44 px label (the gate measures the two together), show one status badge per row with payment and documents as text, and put all but four filters behind "More filters (n)".
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 17.4, 17.5, 17.6_

  - [ ] 30.5 Mark the super-admin shell, and move the metric explanations
    - Add the "Platform admin · all schools" bar using `adminColors` tokens.
    - Move the metric explanations into a disclosure: a 44 px info button with `aria-expanded` and `aria-controls` that shows the definition below the metric on tap, click, Enter or Space (design §12.6). Do not use `Tooltip`, which does not open on tap. Add a test that the definition opens by click and by keyboard.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 17.8, 17.9_

  - [ ] 30.6 Fix the tenant console's labels, buttons and clipping
    - Add visible labels to the school-profile form (`SuperAdminTenantConsole.tsx:306-318`).
    - Relabel and restyle the two create buttons (design §12.6), and collapse the grid below 768 px so nothing clips.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 17.10, 17.11, 17.12_

- [ ] 31. Navigation and empty states (Impeccable `clarify`, `layout`)
  - [ ] 31.1 Give desktop and mobile one navigation with full labels
    - Read both from `routeRegistry.ts`, give `studentStatus` `desktop: true` unless Spec A's R5.3 already did, add short `navLabel`s, and remove `truncate` from every label span, the More button's included (`BottomNavigation.tsx:205,242,362`).
    - Make `navLabel` feed both the visible span and the control's accessible name, so the name keeps containing the visible text (Requirement 15.4): today `accessibleName` is built from `item.label` (`BottomNavigation.tsx:169-171`, set at `:183,218`) while the visible span is `aria-hidden` (`:205,242`). Keep its count suffix. Give the desktop sidebar the same `navLabel` for its text and its name (`DesktopSidebar.tsx:46-52`).
    - Check the labels with the rendered gate's font-size, clipped-text and overflow rules, which measure the `aria-hidden` label spans: each shows in full in its slot at 390 px at 12 px or larger. Without `truncate` a label that does not fit spills out of its slot, which the clipped-text rule reports, or widens its `flex-1` item (`:141`) and pushes the last item past the viewport's edge, which the overflow rule reports (design §12.8). There is no character cap. Delete the navigation's clipped-text and overflow baseline entries this fixes.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 21.1, 21.2, 15.4_

  - [ ] 31.2 Make every empty state teach the next step
    - Rewrite each student empty state with one heading and a sentence saying what fills it, through `EmptyState`.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 21.4_

  - [ ] 31.3 Flatten nested cards and name each mobile page
    - Flatten card-in-card on every page of the Audited_Page_Set except the landing, the admin pages included; task 33.1 flattens the landing. Take the mobile header title from the route registry label.
    - Delete the nested-cards baseline entries this fixes.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 21.5, 21.6_

- [ ] 32. Checkpoint: P2 decision-independent work
  - The rendered gate and axe are green against the shrunken baseline, every remaining baseline entry has a reason, and the Journey_Gate is still green.
  - List the tasks still waiting for Spec A: tasks 30.2–30.4 for `[R7.2]` and `[R7.3]`, and task 27.4 for `[R7.4]`.
  - List the hard-guardrail baseline entries that remain (Requirement 19.9: `measure/hit-area`, `measure/font-size` on student routes, `measure/overflow`, `measure/clipped-text` inside a `nav` element, `impeccable/nested-cards`, `impeccable/low-contrast` and `axe/color-contrast`); each must be gone by task 36. Name the task that removes each remaining `measure/hit-area` entry: 24.8 (links inside running text, D17) or 30.4 (the admin queue's rows and checkboxes); task 24.6 leaves no other.
  - D9, D10 and D16 were confirmed on 2026-11-08; ask the user to confirm D17 if it is still open.
  - Ask the user if questions arise.
  - _Requirements: 18.1, 19.4, 19.5, 19.9, 22.8_

- [ ] 33. Landing restructure (D10)
  - [ ] 33.1 [Decision D10 confirmed 2026-11-08 (option A)] Restructure the landing for the decided audience
    - Option A: four sections (design §12.1), with no school-buyer, tenant or engineering copy.
    - Option B: keep the school-facing sections with sourced claims only, and flatten their nested cards in place.
    - Option C: the hero and the programme list only.
    - Under every option, leave no card inside a card on the landing, and delete the landing's nested-cards baseline entries.
    - Keep the `data-landing-action` markers on the hero's two actions, so the gate keeps measuring Requirement 12.8.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 12.3, 12.4, 12.8, 21.5_

  - [ ] 33.2 [Decision D10 confirmed 2026-11-08 (option A)] Move school-buyer content and retire the vendored hero
    - Option A: create `apps/admissions/src/pages/public/ForSchoolsPage.tsx`, register it, link it from the footer, and remove the `smoothui` hero, `AnimatedCounter` and the chip float from the landing.
    - Then delete their files and their exports from `components/smoothui/index.ts` once `git grep` finds no product import of each export name. The barrel keeps its modules reachable, so the unreachable-module check alone may never list them. Delete their baseline entries from task 29.1 in the same change.
    - Option C: retire the vendored hero only, the same way.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 12.4, 12.5_

- [ ] 34. Navigation size (D16)
  - [ ] 34.1 [Decision D16 confirmed 2026-11-08 (option A)] Consolidate the student navigation
    - Option A: three destinations, "My application", "Messages" and "Account" (design §12.8), with every existing URL still resolving and documents within two activations of the dashboard.
    - Option B: the five-item version.
    - Update `tenantNav.test.ts` and the route registry tests.
    - Deploy path: an approved Deploy run while Spec A's pause holds, otherwise the normal automatic deploy.
    - _Requirements: 21.3, 21.1_

- [ ] 35. Visual review sign-off by a person
  - [ ] 35.1 Review the rendered pages and record the sign-off
    - Run the rendered gate and download its screenshot artefact.
    - A named person reviews every page in the Audited_Page_Set at 1440×900 and 390×844, against `PRODUCT.md`, `DESIGN.md` and design §12.
    - Record their name, the date and their findings in the evidence summary. Each finding becomes a task in this spec, or a baseline entry with a reason.
    - _Requirements: 19.8_

- [ ] 36. Final checkpoint: P2 exit and spec completion
  - The rendered gate and axe are green on built pages, and the sign-off from task 35.1 is recorded.
  - The rendered-design baseline holds, on no audited page, an entry for `measure/hit-area`, `measure/font-size` on student routes, `measure/overflow`, `measure/clipped-text` inside a `nav` element, `impeccable/nested-cards`, `impeccable/low-contrast` or `axe/color-contrast` (Requirement 19.9).
  - List every gated task still waiting on a decision or a prerequisite, including D17 for task 24.8, a live production host (D14) for tasks 6.8, 16.1 and 16.2 and Requirement 7.2, D1.b for task 12.1, and the D3 and D5 conflict for task 17.2. The spec is complete only when none is left.
  - Record the files this spec added and removed in `docs/archive/steering-history-2026.md`.
  - When every task is done, add `"status": "completed"` to this spec's `.config.kiro`.
  - Ask the user if questions arise.
  - _Requirements: 18.1, 19.5, 19.8, 19.9, 6.3, 7.2, 22.10_

## Notes

- **Decision markers.** 36 tasks carry a decision marker, with 37 decision ids between them, because task 17.2 names both D3 and D5. On 2026-11-08 the user confirmed D1–D10 and D12–D16, so 35 markers read `[Decision Dn confirmed 2026-11-08 (option …)]`, and task 24.8 still reads `[Blocked until D17 is confirmed]`. Of the 36, 25 start when phase order allows, and 11 also wait on a further prerequisite named on their marker: 6.8, 11.1, 11.2, 12.1 (its webhook step only), 16.1, 16.2, 17.1, 17.2, 17.3, 24.8 and 27.4. By decision id:

  | Decision | Gated tasks | Count | Confirmed 2026-11-08 | Further prerequisite |
  |---|---|---|---|---|
  | D1 | 12.1–12.3 | 3 | option B (freeze) | 12.1's `webhooks/delivery/` step waits for the open D1.b |
  | D2 | 11.1–11.4 | 4 | option A + B | 11.1 waits for Spec A's R9 tasks to merge; 11.2 waits for the operator to drop `local-stack-storage` from the required checks |
  | D3 | 17.1–17.3 | 3 | option B | Spec A's P0 merged; 17.2 conflicts with D5; 17.3 needs the approved merge table |
  | D4 | 18.1–18.3 | 3 | option B | none (18.1 and 18.2 merge together) |
  | D5 | 13.1, 13.2, 17.2 | 3 | demo views cut; workflow dormant (option C) | 17.2: see D3 |
  | D6 | 15.1, 15.2 | 2 | option B | none |
  | D7 | 16.1, 16.2 | 2 | option A | a live production host and the P0_Ops_Check (D14) |
  | D8 | 19.1 | 1 | option B | none |
  | D9 | 27.4 | 1 | option C | Spec A's `[R7.4]` merged |
  | D10 | 33.1, 33.2 | 2 | option A | none |
  | D12 | 20.1 | 1 | two specs; supersede | none |
  | D14 | 6.8 | 1 | option B (wait for the new host) | a live production host |
  | D15 | 14.1–14.9 | 9 | remove each item | none |
  | D16 | 34.1 | 1 | option A | none |
  | D17 | 24.8 | 1 | not confirmed | Awaiting confirmation; recommendation: keep the guardrail and fix the link |

  D11 is the operator's security track and is outside this spec. D13 was confirmed (option A) and gates no task. D14 gates task 6.8 and is also the prerequisite of D7's tasks. Tasks 7.1 to 7.4 are jobs-ops truthfulness work with no production dependency and are not blocked by D14.
- **Waiting for Spec A, not for a decision.** Tasks 17.1–17.3 start after Spec A's P0 (its tasks 3 to 5) is merged. Tasks 30.2–30.4 start after Spec A's `[R7.2]` and `[R7.3]` are merged, and task 27.4 after `[R7.4]`. Task 11.1's change to Spec A's `harness journey-gate` command waits for Spec A's R9 tasks as well as for D2. Each records the merge commit.
- **Early start.** Tasks 1.1–1.3 may start before Spec A's Journey_Gate is green. Task 1.3 is not doc-only: it restores the harness's error-reporter DSN, which Spec A's own harness runs need (requirements, "Dependencies and sequencing" item 2).
- **Traceability.** Each task references the acceptance criteria it satisfies, using the clause numbers in `requirements.md`.
- **Checkpoints.** The checkpoints (tasks 2, 10, 21, 32 and 36) gate each phase.
- **Tests.** Property tests check the correctness properties in `design.md`, with at least 100 examples each. Unit tests check specific examples and edge cases.
- **Production and destructive actions.**
  - No task writes to the production database, runs a deploy or edits `.github/workflows/deploy.yml`. How a merge reaches production is the Overview's "Deploy path" rule, which reuses Spec A's deploy gate (DEC-10) and adds no second one. Two pairs merge together: tasks 7.1 and 7.2, and tasks 18.1 and 18.2.
  - Tasks 6.1, 6.8 and 16.1 need operator steps.
  - Creating and deleting a Neon branch (task 6.1) needs your go-ahead.
- **Steering files to load before each task:** `tech.md`, `structure.md`, `product.md`, `enterprise-tenancy.md`, `infrastructure.md`, `design-skills.md` and `engineering-skills.md`.
- **Admissions frontend commands:** `bun run test`, `bun run lint` and `bun run build`.
- **Jobs-ops commands:** `bun run type-check`, `bun run lint` and `./node_modules/.bin/vite build`.
- **Backend commands:** `python3 -m pytest -n 6 tests` and `python3 manage.py check`. Regenerate the schema after every API change.
