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
