# Requirements Document

## Introduction

This is Spec B of the two specs the stack critique recommended (critique run `mihasv3-stack-critique-2026-10-16`, revision 3, §8.1). Spec A, `student-journey-repair`, is the bugfix spec for phase P0: a student can register, upload, view, submit and receive the slip, on a phone. This spec covers the two phases after it:

- **P1, simplification** (critique §8.3 S1–S10). Requirements 1–10 carry those items. Requirement 11 is added by this spec for decision D4 (OCR), which the critique raised in §4 row 13 and §9 but gave no S number.
- **P2, visual quality** (critique §8.3 V1–V10). Requirements 12–21 carry those items.
- Requirement 22 holds the guardrails and preserved behaviour that every change in this spec must respect.

Sources: the critique's §4 (over-engineering inventory), §5 (design critique), §6 (docs and steering drift), §8.3–§8.5 (outline, phasing, non-goals) and §9 (decisions), its third review (`review.json`), and the research dossier for this run (`.agents/tasks/spec-authoring-2026-10-31/research.md`), which re-verified 86 citations at HEAD `4a6c4ef` and found none refuted. Claims the reviews refuted are not reused (research §3). Labels follow the critique: **Confirmed** means read in code or reproduced, **Likely** means strong evidence not observed where the claim applies, **Unverified** means open.

Most simplification work removes or freezes something. The user confirmed D1–D10 and D12–D16 on 2026-11-08 ("Proceed with best recommendations, you have full authority"), each with the option recorded in the **Decision Register** below, and kept the critique's lean text there for history. D17 is still open, and D11 is an operator track outside this spec. Every task that removes, freezes, prunes or untracks something carries a decision marker in `tasks.md`: `[Decision Dn confirmed 2026-11-08 (option …)]`, followed on the same line by any further prerequisite (a Spec A gate, a live production host, the P0_Ops_Check, an operator step). A task whose marker still starts `[Blocked until …]` must not start before what follows it is met. Work that is required under every option (for example, removing invented numbers, correcting false steering, the rendered design gate and accessibility fixes) proceeds without a decision.

Two placement changes from the critique outline, both from the research dossier:

- The runtime badge that critique §8.3 V2 placed here renders in production builds, so it is a Spec A defect (research §5). Requirement 13 keeps the other developer artefacts and only checks the badge in the rendered gate.
- The backend already behaves like D9 option C for slips and receipts (research §6). The student copy for letters is Spec A's (critique §8.2 R7.4). This spec only aligns its own copy sweep with D9.

The screenshots captured by the critique's design workstream were opened and read for this spec, at 1440×900 and 390×844. Which of that workstream's Likely claims they confirm or refute, and what looking added, is recorded in `design.md` ("Visual evidence review"). Several acceptance criteria below come from that review and are marked "(found by looking)".

## Glossary

- **Spec A**: `.kiro/specs/student-journey-repair/`, the P0 bugfix spec.
- **Journey_Gate**: Spec A's blocking browser journey in CI at 390×844 against real object storage (critique §8.2 R9). It registers a student, uploads an identity document and a result slip through the wizard, submits through the wizard, opens each upload after its first signed URL expires, and downloads the slip.
- **Decision_Register**: the section of this document that records decisions D1–D17, their options, the lean and their status.
- **Confirmed**: a decision whose status line in the Decision_Register names the option the user chose and the date.
- **Gated_Task**: a task in `tasks.md` whose title starts with a decision marker, either `[Decision Dn confirmed <date> (option …)]` (the decision is Confirmed; a further prerequisite, if any, follows on the same line) or `[Blocked until …]` (the task waits for what follows, for example D17 or a live production host).
- **Documented_Local_Stack**: the one local stack that `LOCAL-TESTING.md` tells a developer to run.
- **Local_Database**: a database whose `DATABASE_URL` host is `localhost`, `127.0.0.1`, `::1` or `postgres` (the Postgres service name in every compose file), used under settings that are not production (`DJANGO_SETTINGS_MODULE` does not end in `.prod`, and `ENVIRONMENT` is not `production`). The settings test matters because the production web container also reaches its database as `postgres`.
- **Routes_Report**: the CI report that pairs every mounted backend route with its first-party callers, its external consumer or its gating setting (Requirement 2).
- **External_Consumer_List**: the committed list of routes that have a consumer outside the two frontends (for example the Lenco webhook, health probes, the schema endpoint), each with an owner and a reason.
- **Check_Baseline**: a committed list of known offenders for a new check. The check fails on any offender not in the list and on any list entry that no longer matches an offender.
- **Readiness**: the single wizard readiness that Spec A makes the source for both the Submit button and the Submit handler (critique §8.2 R6.2).
- **Audited_Page_Set**: the pages and states the Rendered_Design_Gate scans (Requirement 19.2).
- **Student_Route**: a route whose path starts with `/student`, the test the app itself uses (`apps/admissions/src/components/navigation/AppLayout.tsx:160`). "Student route" in this spec means a Student_Route. The authentication pages (`/auth/…`) are not Student_Routes, so Requirement 16.1's type floors and the font-size rule of Requirements 19.7 and 19.9 do not cover them; the hit-area rule does (Requirements 16.10 and 19.7). The wizard also renders at the alias `/apply` (`apps/admissions/src/routes/config.tsx:114`, `apps/admissions/src/routes/routeRegistry.ts:196`), which is not a Student_Route; the Rendered_Design_Gate audits the wizard at `/student/application-wizard` only, so the type floors and their exit ban are measured on the one URL that is a Student_Route.
- **Rendered_Design_Gate**: the CI job that runs impeccable's browser detector and axe inside Playwright against built pages (Requirement 19).
- **Existing_Tokens**: the colour and typography tokens in `apps/admissions/src/styles/design-tokens.css` and `apps/admissions/src/design-system/tokens.colors.json`. The steering and this spec's brief name the second file `tokens.colors.cjs`; at HEAD it is `tokens.colors.json` (critique §6 row 9).
- **P0_Ops_Check**: the operator's read-only production checks in critique §8.4, which record counts and names, never values.
- **Tenant_Support_Resolver**: `resolveTenantSupportContact` in `apps/admissions/src/lib/tenantSupport.ts`.
- **First_Party_Caller**: a call site in `apps/admissions/src/` or `apps/jobs-ops/src/`, excluding `generated/` and test files.

## Requirements

### Requirement 1: S1. One documented local stack

**User Story:** As a developer, I want one documented local stack that runs the whole student journey with real object storage, mail capture and the scheduled sweeps, so that I can reproduce what students see without editing the database by hand.

Criteria 1–4 and 6–10 depend on decision D2 (which stack becomes the documented one). Criteria 5, 11 and 12 need no decision: the seed and bootstrap commands are the same on every candidate stack, and the isolated harness runs Spec A's Journey_Gate and this spec's Rendered_Design_Gate under every D2 option, so it is held to the same isolation rules now. This requirement also owns finding C-08, the card-payment widget that loads from the live Lenco host on local stacks, which Spec A's OS-9 leaves out of Spec A.

#### Acceptance Criteria

1. WHEN a developer follows the local setup in `LOCAL-TESTING.md` on a machine that has Docker with Compose v2, Bun, Git, curl and python3 3.8 or later installed, THE Documented_Local_Stack SHALL start from an empty database and pass the Journey_Gate with no manual database edit. These are the tools the setup script and `harness/bin/harness` call (`curl` at `:101,115,127`, `python3` at `:131`).
2. THE Documented_Local_Stack SHALL run S3-compatible object storage, an SMTP mail-capture service, a stand-in for the payment provider, and a Celery beat process.
3. WHILE the Documented_Local_Stack runs, THE stack SHALL make no request to a live payment, email, object-storage or error-reporting host.
4. THE local setup SHALL create its demo data with the seed command that Spec A delivers (critique §8.2 R1.4; Spec A extends `harness_seed_tenants`) and SHALL need no other data step.
5. IF a seed or bootstrap command of the Documented_Local_Stack is pointed at a database that is not a Local_Database, THEN THE command SHALL exit non-zero before writing anything. The check is an allowlist: today `harness_seed_tenants` refuses only URLs that contain one of four strings (`backend/apps/catalog/management/commands/harness_seed_tenants.py:78-84`), so any other remote host passes.
6. THE local setup documentation SHALL state, for storage, email, payments and error reporting, whether the stack contacts an outside host, and each statement SHALL match the stack's behaviour.
7. WHERE decision D2 is confirmed as option A, B or C, THE Documented_Local_Stack SHALL be the isolated harness under `harness/`, and THE documentation SHALL describe no other stack as a supported way to run the journey.
8. WHERE decision D2 is confirmed as option D, THE Documented_Local_Stack SHALL be the local-test stack (`backend/docker-compose.local-test.yml`) extended until criteria 1–3 hold.
9. THE Documented_Local_Stack's admissions build SHALL load the card-payment widget from the payment stand-in, and its `index.html` SHALL contain no `preconnect`, `dns-prefetch`, preload, stylesheet or script reference to a host outside the stack. Today the harness build points the widget at the live Lenco host (`apps/admissions/src/hooks/useLencoWidget.ts:49-53`; `harness/bin/harness:70-76` sets no `VITE_LENCO_WIDGET_URL`), whose script the harness CSP then blocks (`harness/Caddyfile`, `default-src 'self'`), so the card option cannot work there; on a dev server the widget loads from the Lenco sandbox host (C-08). Every page also preconnects to the production API host and to both Lenco hosts (`apps/admissions/index.html:26-28`).
10. IF a tool that criterion 1 names is missing, THEN THE local setup script SHALL exit non-zero before starting anything and SHALL name the missing tool.
11. WHILE a browser run uses the isolated harness under `harness/`, THE browser SHALL be launched so that a host name outside the stack does not resolve, so a subresource request, a navigation, a popup and a form post to such a host all fail before any packet leaves the machine; THE run SHALL fail, naming the host, on any attempt to reach a host outside the stack, a literal IP address outside loopback included. Name resolution cannot stop a literal IP address, so for that case the gate detects the attempt and fails the run, and this requirement does not claim the request is prevented. THE harness's admissions build SHALL load the card-payment widget from the payment stand-in; and its built `index.html` SHALL contain no `preconnect`, `dns-prefetch`, preload, stylesheet or script reference to a host outside the stack. This holds under every D2 option, because the Journey_Gate and the Rendered_Design_Gate run on the harness; under an option that makes the harness the Documented_Local_Stack, it also meets criteria 3 and 9.
12. THE harness's frontend error reporter SHALL be configured with a DSN that the Sentry SDK accepts and that names a host inside the stack. Today the default in `harness/bin/harness:76` is a corrupted string in which the words "email protected" in square brackets stand where a key and a host were, so the SDK rejects it and logs "Invalid Sentry Dsn" to the console when the reporter loads, on a page's first pointer, key or scroll event or after 15 s (`apps/admissions/src/main.tsx:36-62`), and the harness console gate records that as a failure (`apps/admissions/tests/harness-e2e/harness-fixtures.ts:110`).

### Requirement 2: S2. No unreachable surface

**User Story:** As a maintainer, I want every mounted route and every shipped frontend module to have a real consumer, so that code nobody can reach stops costing review, test and gate time.

Criteria 1–5 need no decision. Criteria 6–7 depend on D5, and criterion 8 on D15.

#### Acceptance Criteria

1. THE CI pipeline SHALL produce a Routes_Report that lists every URL pattern the backend mounts under `/api/v1/` and `/api/v2/`, each with its First_Party_Callers, its External_Consumer_List entry, or the setting that gates it.
2. IF a mounted route has no First_Party_Caller, no External_Consumer_List entry and no gating setting, and is not in the Check_Baseline, THEN THE CI job SHALL fail and name the route.
3. IF an External_Consumer_List entry lacks a consumer, an owner or a reason, or names a route the backend no longer mounts, THEN THE CI job SHALL fail and name the entry.
4. IF a module under `apps/admissions/src/` cannot be reached from the app's entry point (`src/main.tsx`) through non-test imports, static or dynamic, and is not an allowlisted module or a Check_Baseline entry, THEN THE CI job SHALL fail and name the module.
5. IF a Check_Baseline entry of either check no longer matches an offender, THEN THE CI job SHALL fail and name the stale entry, so that each fix removes its entry in the same change.
6. WHERE D5's lean for the demo views is confirmed (it applies under every D5 option), THE backend SHALL NOT mount the v2 demo views in `backend/apps/common/v2/demo_views.py`, and the OpenAPI baselines and `apps/admissions/src/generated/api.d.ts` SHALL NOT list them.
7. WHERE decision D5 is confirmed, THE tenant change-request workflow SHALL follow the chosen option:
   - option A: this spec SHALL NOT build the missing UI, and SHALL record the work as follow-up;
   - option B: THE backend SHALL NOT contain the workflow's six routes, service, state machine, outbox emitters or tests, or the v2 onboarding views, and `docs/canonical-truth-map.md` and `.kiro/steering/enterprise-tenancy.md` SHALL record that finding TEN-06 is open again;
   - option C: the six routes SHALL stay mounted with External_Consumer_List entries whose reason is "dormant by decision D5".
8. WHERE decision D15 is confirmed for an item, THE repository SHALL NOT contain that item:
   - (a) the dev-only `@react-pdf` stack in `apps/admissions/src/lib/pdf/`, its dev preview pages, its fonts and PNG assets, its tests, and the CI step `scripts/check-pdf-chunk-load.mjs`;
   - (b) the compatibility endpoint `/api/v1/applications/draft/` (`backend/apps/applications/urls.py:86`) and the uncalled `applicationService.saveDraft` (`apps/admissions/src/services/applications.ts:718-721`);
   - (c) the re-export shim `backend/apps/applications/views.py`, after its test imports are repointed;
   - (d) the frontend modules that the check in criterion 4 lists as unreachable;
   - (e) the placeholder apps `apps/website/` and `apps/student-portal/`;
   - (i) the unused frontend upload paths that Spec A's single-path guard freezes with the note "deletion owned by Spec B S2" (Spec A DEC-1, OS-5; `apps/admissions/tests/unit/uploadPathSingleSource.test.ts`): `documentService.upload` (`apps/admissions/src/services/documents.ts:6`, 0 callers), `useWizardFileUploads` (exported only by the barrel `…/applicationWizard/hooks/wizard/index.ts:7`), the `startUpload` callback of `useApplicationFileUploads.ts` (`:281`, its storage call at `:301-305`), which the wizard controller never destructures (`useWizardController.ts:403-416`), with `uploadApplicationFile` and `downloadFile` in `lib/storage.ts` (`:121`, `:289`, the second with 0 callers), and `lib/applicationSlipStorage.ts` with `lib/slipService.ts`, which nothing imports. The criterion-4 check cannot find most of these, because their modules stay reachable; they are listed by hand.
9. WHEN a route, module or file set is removed, THE same change SHALL remove its tests and its entries in `docs/canonical-truth-map.md`, `scripts/authority_matrix_registry.py`, the OpenAPI baselines, the generated API types, and every steering, `DESIGN.md` or runbook sentence that names it.
10. THE `ApplicationDraft` model and the `application_drafts` table SHALL NOT be dropped in this spec; the drop waits for a production row count recorded by the operator (critique §4 row 18).

### Requirement 3: S3. Jobs-ops says plainly whether it is enabled

**User Story:** As an operator, and as anyone reading the platform's own claims, I want jobs-ops to state whether it is enabled, so that nobody mistakes seed data for a working product.

Criteria 1, 2, 4 and 8 need no decision: a hardcoded readiness value is false under every D1 option. Criteria 3, 5, 6 and 7 depend on D1.

#### Acceptance Criteria

1. THE platform metadata endpoint `GET /api/v1/meta/platform/` SHALL NOT return a hardcoded readiness value (today `"status": "production_ready"`, `backend/apps/common/meta_views.py:47`); every field it returns SHALL come from configuration or code constants that describe the platform, and it SHALL report whether jobs-ops is enabled from `ENABLE_JOBS_OPS_ROUTES`.
2. THE jobs-ops UI SHALL NOT display "PRODUCTION_READY", "Live backend" or any readiness label that the backend response does not supply (`apps/jobs-ops/src/app/layout/JobsOpsShell.tsx:243`). WHEN demo mode (`VITE_JOBS_OPS_DEMO_MODE`) falls back to its built-in metadata because the backend did not answer (`apps/jobs-ops/src/services/api/platform.ts:5-11,31`), THE UI SHALL say "Demo data. Backend not reached." instead of any enabled or not-enabled state.
3. WHERE decision D1 is confirmed as option B, WHILE `ENABLE_JOBS_OPS_ROUTES` is false, THE backend SHALL return 404 for every jobs-ops route, including the seed and scaffold views mounted today whatever the flag says: `/api/v1/email/accounts/zoho/connect/`, `/api/v1/email/messages/`, `/api/v1/email/threads/`, `/api/v1/documents/resumes/`, `/api/v1/documents/resumes/variants/`, `/api/v1/documents/cover-letters/generate/` and `/api/v1/documents/question-bank/answer/` (`backend/apps/common/email_urls.py:22-28`, `backend/apps/documents/urls.py:49-52`).
4. THE backend SHALL keep `POST /api/v1/email/send/` mounted whatever the jobs-ops flag says, because the admissions admin email action calls it (`apps/admissions/src/services/notifications.ts:223-225`, `apps/admissions/src/components/admin/applications/ApplicationCard.tsx:113-114`).
5. WHERE decision D1 is confirmed, THE unauthenticated `POST /api/v1/email/webhooks/delivery/` route SHALL follow the answer to D1's sub-question D1.b, and its classification SHALL be recorded in the External_Consumer_List.
6. WHERE decision D1 is confirmed as option B, WHEN the jobs-ops frontend loads and the metadata endpoint reports jobs-ops disabled, THE jobs-ops UI SHALL render one "not enabled" state that names the setting an operator changes, and SHALL call no other jobs-ops endpoint.
7. WHERE decision D1 is confirmed as option B, THE jobs-ops code, models and seed module SHALL stay in the repository, changed only by the gating in criteria 3 and 6.
8. THE platform attribution (creator, developer and backlink) SHALL stay in the metadata response under every D1 option, as the product steering requires. Under option C the endpoint stays in this backend with the attribution and the API version only, and the steering's attribution rule moves from its jobs-ops section to the platform section.

### Requirement 4: S4. Repository holds product code and summaries

**User Story:** As a developer, and as an agent searching this repository, I want it to hold product code, tests and their written summaries, so that clones stay small and searches land on the product.

Criteria 4, 7 and 9 need no decision. Criteria 1–3 and 5 depend on D2, criterion 6 on D6, and criterion 8 on D15.

#### Acceptance Criteria

1. WHERE decision D2 is confirmed as option B or C, THE repository SHALL NOT track raw evidence artefacts under `docs/v2-evidence/` and SHALL keep every Markdown file there. Raw artefacts are every file type present at HEAD that a run produces rather than a person writes: Playwright traces `*.zip`, screenshots `*.png`, raw logs `*.txt`, `*.log`, `*.jsonl`, `*.err` and `*.exit`, test reports `*.xml`, report assets `*.html`, `*.js`, `*.css`, `*.ttf`, `*.svg` and `*.webmanifest`, and before-and-after captures `*.before` and `*.after`. The `*.json`, `*.yaml`, `*.csv`, `*.py`, `*.sh` and `*.ts` files stay tracked, because READMEs and validators cite them.
2. WHEN raw evidence artefacts are untracked, THE scripts and CI jobs that produce evidence SHALL write to a run-scoped directory or a CI artefact, never into a tracked path.
3. WHEN raw evidence artefacts are untracked, THE spec governance validators (`scripts/validate_spec_governance.py`, `scripts/validate_spec_metadata.py`) SHALL still pass when run in a fresh checkout of the change, where the untracked files are absent.
4. THE `.gitignore` SHALL ignore `.agents/tasks/`, so that run directories holding throwaway credentials cannot be committed from any clone (research R-15).
5. WHERE decision D2 is confirmed as option A, B or C, THE CI pipeline SHALL NOT run the launch-verdict rollup (`scripts/launch-verification/rollup.py`) or publish a launch verdict, and SHALL keep the contract-sync, brand-scan and scope gates blocking.
6. WHERE decision D6 is confirmed as option B, THE repository SHALL track exactly one real copy of each skill on the keep-list recorded with the decision, either as a directory under `.kiro/skills/` or as the `.agents/skills/` target of a `.kiro/skills/` symlink, and SHALL track no other skill. Thirteen `.kiro/skills/` entries are symlinks whose only content is in `.agents/skills/`, so removing an `.agents/skills/` directory can delete a kept skill.
7. IF a steering file, `.agents/AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, a Kiro hook or a live spec's `tasks.md` names a `.kiro/skills/<name>` path that does not exist, or a tracked symlink under `.kiro/skills/` or `.agents/skills/` does not resolve, or a `path` in `.agents/skills.json` names a directory that does not exist, and the item is not a Check_Baseline entry, THEN THE CI job SHALL fail and name it. At HEAD two symlinks dangle (`.kiro/skills/playwright` and `.kiro/skills/playwright-best-practices`).
8. WHERE decision D15 is confirmed for an item, THE repository SHALL NOT track it: (f) the agent hub (`scripts/agenthub/`, `.agenthub/` and their tests), (g) the stray root files `=== schema hash (sha256 of regenerated OpenAPI) ===` and `⚠️`; and the untracked empty directories `=== candidate commit ===/` and `echo/` SHALL be removed from the working tree.
9. THE work in this spec SHALL NOT rewrite git history. A history purge is D2 option C, which happens only with the D11 security track, outside this spec.

### Requirement 5: S5. Only cache layers that run somewhere

**User Story:** As a maintainer, I want only cache layers that are switched on somewhere and have a measured effect, so that settings and tests stop carrying dead code paths.

Criteria 1–3 depend on D7. Criteria 4 and 5 need no decision.

#### Acceptance Criteria

1. WHERE decision D7 is confirmed as option A, THE settings SHALL NOT define a cache flag that is off in every environment the repository configures (dev, test, staging, production and harness).
2. WHERE decision D7 is confirmed as option A, AND AFTER the P0_Ops_Check has recorded, by name and on/off state only, the production values of `PERF_CACHE_CAPABILITIES`, `PERF_CACHE_DASHBOARD` and `PERF_CACHE_CATALOG`, THE backend SHALL NOT contain the capabilities cache or the dashboard cache, or their flags, signal handlers and tests.
3. WHERE decision D7 is confirmed as option A, THE catalogue cache SHALL stay only if the P0_Ops_Check shows `PERF_CACHE_CATALOG` on in production and a recorded measurement shows its effect; otherwise it SHALL be removed like the other two.
4. WHEN a cache layer is removed, THE affected endpoints SHALL return the same bodies and status codes as with the cache off, and the cross-tenant property tests (Requirement 22.1) SHALL pass unchanged.
5. `docs/runbooks/perf-flags.md` SHALL state only production values that a P0_Ops_Check has recorded, and SHALL show any other production value as "Unverified" (today it claims the catalogue cache has been on since 2026-07-04, which nothing in the repository shows; critique §6 row 18).

### Requirement 6: S6. Steering, docs and spec metadata state only current facts

**User Story:** As an agent or developer who loads the steering on every task, I want it to state only current rules and real paths, so that I do not act on retired facts.

All criteria need no decision, except that the final wording of a decision-dependent fact waits for its decision (criterion 5).

#### Acceptance Criteria

1. THE always-loaded steering files and `.agents/AGENTS.md` SHALL describe only behaviour present at the commit they ship in. By the end of this spec, every row of the critique's drift table (§6) SHALL be corrected, removed, or recorded in the evidence summary as owned elsewhere: by Spec A, by the D11 operator track (row 16, the runbook's school hosts, which criterion 6 keeps this spec from editing) or by decision D14 (row 17, the production host). Row 21 (settings forms protect unsaved edits) is corrected by stating that finding C-15 is open; the defect itself has no owner (Non-goals).
2. IF a steering file, `.agents/AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `LOCAL-TESTING.md` or `README.md` names a repository path that does not exist, and the path is not in the doc-paths allowlist with a reason (for historical names and names absent on purpose), THEN THE CI job SHALL fail and name the file and the path. THE check SHALL run on every pull request and every push to `main`, whatever paths the change touches, so that a change that deletes or renames a file a doc names fails in that same change (the rule of Requirement 2.9), not in the next change to a doc. The same check covers Requirement 4.7.
3. IF a live spec's `.config.kiro` says `"status": "completed"` while its `tasks.md` has an unchecked required task, or every required task of a live spec is checked while its `.config.kiro` has no completed status, THEN THE CI job SHALL fail, unless the spec is listed with a reason in the committed exceptions file. A required task is a checkbox task not marked optional with `*`, the rule `scripts/validate_spec_governance.py` already applies; `[-]` and `[~]` count as unchecked.
4. THE structure steering SHALL hold current placement rules only; its history tables ("Files Added During …", "Files Removed During …", about 409 of its 618 lines; critique §4 row 21) SHALL move to an archive document under `docs/archive/` that the steering links to but does not load.
5. WHILE a decision is not Confirmed, or is Confirmed but its outcome is not yet implemented, THE steering SHALL state the current behaviour and name the decision instead of stating an outcome that is not yet true, for example "Email verification is not implemented; decision D8 confirmed 2026-11-08, not part of the flow".
6. THE steering and docs changed by this spec SHALL add no infrastructure identifier (host name, IP address or key path). Removing the existing ones belongs to the D11 operator track.
7. `DESIGN.md` §4 and §5 SHALL list only components that exist and are rendered by product code (research R-19), and SHALL name the colour token file that exists, `apps/admissions/src/design-system/tokens.colors.json`.

### Requirement 7: S7. Tests run against the schema production runs

**User Story:** As a developer, I want backend tests to run against a database built from the SQL scripts, so that SQL-only constraints are tested and parallel runs are reliable.

#### Acceptance Criteria

1. THE backend test session SHALL build its database from a verified baseline schema plus every later script in `backend/scripts/*.sql`, applied by `apply_sql_migrations`, and SHALL NOT create `managed = False` tables from model definitions (today `backend/tests/conftest.py:88-413`). THE `migrate` and `apply_sql_migrations` steps SHALL run on a fresh database session whose `search_path` names at least one schema, and the session SHALL stop if it does not, because every plain `pg_dump` preamble empties `search_path` for the session that loads it.
2. THE verified baseline SHALL be a schema-only snapshot of the `public` schema taken from a Neon branch, holding no row data except the `migration_history` and `django_migrations` rows. It SHALL load without error into an empty Postgres 17 database, and Django's `migrate --noinput` and then `apply_sql_migrations` SHALL succeed on the result, the order the test session runs them in. The schema manifest tool (`python manage.py schema_manifest`) SHALL show no unexplained difference between it and the production read-only manifest. The comparison with production needs a reachable production host, so that part depends on decision D14.
3. IF the SQL-built schema and the Django model definitions disagree on a table, column, type or nullability, THEN a test SHALL fail and name the difference.
4. WHEN a test that commits rows finishes, THE teardown SHALL leave no row that the test created in any table. Django's flush already resets the tables of managed models and re-creates their content-type and permission rows; the suite SHALL truncate every other `public` table, which includes the tables of all 78 `managed = False` models that Django's flush skips, except `migration_history` and `django_migrations`.
5. THE backend suite SHALL pass with `pytest -n 6` on two consecutive runs, with each worker using its own database and its own Redis database for the JTI blacklist, with the Celery broker set to `memory://` and with the Celery result backend set to `cache+memory://`. The test cache is in-process (`backend/config/settings/base.py:818-830`), and two Redis clients reach tests today: the JTI blacklist, which builds its client from `CELERY_BROKER_URL` (`backend/apps/accounts/tokens.py:30-41`), and Celery's result backend, which is `REDIS_URL` (`base.py:172`) and subscribes over Redis pubsub for every `apply_async` that does not ignore its result (Celery 5.6.3, `celery/app/base.py:967-968`, `celery/backends/redis.py:400-402`). With these values the blacklist is the only Redis client tests reach. The test values SHALL be set in the settings module, because pytest-django imports the settings and calls `django.setup()` before it imports any `conftest.py`, and a session check SHALL fail the run if any of them is not in effect.
6. EVERY CI job that runs backend tests SHALL use Postgres 17, the production major version, from the change that builds the test database from SQL onward, and a CI job SHALL run the whole `backend/tests` tree this way. Today four CI services use Postgres 16 (`.github/workflows/ci.yml:20,242,504`; `.github/workflows/backend-governance.yml:40`). IF the test server's `server_version_num` is below 170000, THEN THE test session SHALL stop before it creates or loads anything, with the message "backend tests require Postgres 17".

### Requirement 8: S8. Capability catalogue holds only capabilities that change behaviour

**User Story:** As a security reviewer, I want the capability catalogue to hold only capabilities that change what someone can do, so that the authorization model is small enough to reason about, without weakening tenant isolation.

Criteria 1 and 6 hold under every option. Criteria 2–5 depend on D3, and criterion 3 also on D5.

#### Acceptance Criteria

1. ANY change to the capability catalogue SHALL leave the cross-tenant property tests of Requirement 22.1 unchanged and passing, and SHALL keep scope-before-lookup and the masked-404 contract.
2. WHERE decision D3 is confirmed as option B, THE catalogue in `backend/apps/catalog/services.py` SHALL NOT contain `platform.user.create_global`. No product code enforces it at HEAD: its only backend or frontend code reference is the catalogue entry (`services.py:959`). Five other files name it: `scripts/authority_matrix_registry.py` (as a composed capability of user creation and batch import, `:446,451,452`), `scripts/authority_matrix_v2.py`, `backend/tests/perf_baseline/fixtures/admin_scope.json`, `docs/canonical-truth-map.md` and `docs/tenant-admin-super-admin-permissions-plan.md`.
3. WHERE decision D3 is confirmed as option B AND decision D5 is confirmed as option B, THE catalogue SHALL NOT contain `tenant.profile.request_change`, `tenant.program.request_change` or `tenant.domain.request_change`. IF D5 keeps the change-request workflow (option A or C), THEN these three SHALL stay, because the workflow's submit authority uses them.
4. WHERE decision D3 is confirmed as option B, ANY merge of two or more remaining capabilities SHALL follow a merge table the user has approved, which lists for each capability its backend enforcement sites, its frontend gates and the tests that cover it.
5. WHEN a capability string is removed or merged, THE same change SHALL update every file that `git grep -l '<capability>'` lists outside `.kiro/specs/`, `docs/archive/` and `docs/v2-evidence/`, as task 8.1's inventory records it. At HEAD that is 6 files for `platform.user.create_global` and 20 for the three `*.request_change` strings, among them the authority-matrix scripts, the OpenAPI baselines, `apps/admissions/src/generated/api.d.ts`, `backend/tests/property/test_capability_derivation.py` and `apps/admissions/tests/property/capabilityDerivation.property.test.ts`, not only the files that enforce a capability. The change SHALL also run `backend/tests/property/test_capability_endpoint_shape.py` and `backend/tests/unit/test_capability_self_description_m3.py`, which check the capability endpoints' payload shape and masking without naming any capability string.
6. THE capability endpoints SHALL keep failing closed on `CapabilityResolutionError`: deny, zero capabilities, no tenant data.

### Requirement 9: S9. Non-production settings never point at production

**User Story:** As a developer running a non-production stack, I want no setting to point at production by default, so that local, CI and staging runs never touch production.

Criteria 1, 2 and 4–8 need no decision. Criterion 3 depends on D15. Criterion 6 owns finding C-21, which Spec A's OS-9 leaves out of Spec A.

#### Acceptance Criteria

1. THE settings modules other than `config/settings/prod.py` SHALL NOT default any outbound URL or host to a production or live third-party host. Every settings module inherits these production defaults from `backend/config/settings/base.py` today:
   - `HEALTH_CHECK_URL` and `KEEP_ALIVE_URL`, the production API host (`:563-569`);
   - `FRONTEND_URL`, the production frontend, used in email links (`:673`);
   - `EMAIL_HOST`, the live SMTP host (`:546`; critique §6 row 1).
2. IF a scheduled task's target URL setting is empty, THEN THE task SHALL log one INFO line that names the setting and SHALL return without a network request. The task SHALL have no production URL of its own to fall back on (today both tasks do, `backend/apps/common/tasks.py:329,358`).
3. WHERE decision D15 is confirmed for item (h), THE beat schedule SHALL NOT contain `keep_alive_task` (`base.py:185-188`, "prevents Koyeb cold starts"), and its task function, setting, tests and steering row SHALL be removed.
4. THE Celery beat table in `.kiro/steering/tech.md` SHALL list exactly the task names of `CELERY_BEAT_SCHEDULE` (the last dotted segment of each entry's `task` value), and SHALL refer to `.kiro/steering/infrastructure.md` for the production host instead of naming it. Today the table says 17 tasks on a Koyeb worker, the schedule has 21 entries (critique §6 row 7), and the table's `cleanup_idempotency_keys` row names a task the schedule calls `cleanup_idempotency_keys_task`.
5. WHILE the production settings are active, `check_uptime_task` SHALL keep its current target and alerting behaviour.
6. THE CI admissions build SHALL NOT default `VITE_API_BASE_URL` to the production API host when the repository variable is unset (today `.github/workflows/ci.yml:333`), and the admissions job's build and bundle checks SHALL still pass. The deploy workflow, which sets its own value (`.github/workflows/deploy.yml:66`), is unchanged.
7. IF the staging settings start with startup validation on (Spec A's `STARTUP_ENV_VALIDATION`) and `FRONTEND_URL` or `HEALTH_CHECK_URL` is unset or empty, THEN THE process SHALL refuse to start and name the missing variables, never their values. The local-real and harness settings, which import staging (`backend/config/settings/local_real.py:20`, `harness.py:32`), SHALL start without either variable set.
8. IF `FRONTEND_URL` is empty, THEN THE link helpers SHALL NOT substitute a production host: `backend/apps/common/email_links.py` SHALL log one WARNING per process that names the setting, never a value, and SHALL build path-only links, and `backend/apps/common/outbox.py` SHALL treat no absolute action URL as same-origin. Today `email_links.py:75` falls back to `https://apply.beanola.com` when the setting is empty, and `outbox.py:96` uses that host as its `getattr` default.

### Requirement 10: S10. Reproducible backend builds

**User Story:** As an operator, I want the backend image to install the same package versions every time and no test tooling, so that builds are reproducible and the production image carries only what it runs.

#### Acceptance Criteria

1. THE backend SHALL install runtime packages from a lock file that pins every direct and transitive package to an exact version with hashes.
2. THE production Docker image SHALL install only runtime packages: `pytest`, `pytest-django`, `pytest-xdist`, `pytest-timeout`, `hypothesis`, `factory-boy`, `freezegun` and `fakeredis` SHALL NOT be importable inside it (today they are, `backend/requirements.txt:50-58`, `backend/Dockerfile:19-20`), and every package that `requirements.in` names SHALL be installed in it. `cryptography` sits under the "# Testing" comment today (`requirements.txt:59`) but is a runtime package, because `backend/apps/common/audit_network.py:8` imports it, so it stays in `requirements.in`.
3. THE CI test jobs SHALL install runtime and test packages from lock files.
4. THE lock files SHALL be resolved for Python 3.12, the version of the production base image (`backend/Dockerfile:2`).
5. IF a lock file is out of date with its input file, THEN a CI check SHALL fail.
6. THE jobs-ops-only `openai` dependency SHALL stay in its own labelled section, and `backend/tests/unit/test_no_admissions_generative_ai_guard.py` SHALL pass.

### Requirement 11: S11 (added). OCR is opt-in assistance

**User Story:** As a student on a slow connection, I want manual grade entry to be the first path and OCR to run only where my school has turned it on, so that a slow OCR worker never holds up my application.

Added by this spec for decision D4 (critique §4 row 13, §9 D4). All criteria depend on D4. Spec A already stops OCR polling from draining the document rate limit (critique §8.2 R3.3).

#### Acceptance Criteria

1. WHERE decision D4 is confirmed as option B, THE wizard SHALL present manual grade entry as the default path for every institution.
2. WHERE decision D4 is confirmed as option B, THE backend SHALL enqueue OCR extraction only for a document whose application belongs to an institution that has opted in, and SHALL answer an extract request for any other document with a stable error code and no task.
3. WHERE decision D4 is confirmed as option B, WHILE the student's institution has not opted in, THE wizard SHALL NOT call the extract endpoint and SHALL NOT poll document status for OCR.
4. WHERE decision D4 is confirmed as option B, THE opt-in SHALL be read and changed only through a dedicated command that requires `platform.settings.manage` through `HasPlatformCapability`, and each change SHALL emit an audit event through `TenantAuditService` with the opted-in institution ids before and after. THE generic admin settings endpoints SHALL NOT list, return or write the opt-in key. Their writes already require a super admin (`_settings_write_forbidden`, `backend/apps/accounts/admin_settings_views.py:60-79`, called by all five write methods), but their reads accept any `admin` role (`IsAdmin`, `:224,314`; `backend/apps/accounts/permissions.py:93-103`), so a tenant admin could otherwise read which other schools opted in.
5. THE OCR output SHALL stay assistive under every option: the student confirms each row, a manual entry wins, and an unrecognised subject label stays unresolved.
6. THIS spec SHALL NOT add PDF OCR support (`pdf2image`, poppler); decision D4 revisits it later.

### Requirement 12: V1. A landing page for applicants

**User Story:** As a prospective student on a phone, I want the landing page to show what I can apply for and how, from real data, so that I can start an application without reading claims I cannot check.

Criteria 1, 2 and 6–8 need no decision: invented claims are a truthfulness risk under every D10 option (critique §9 D10). Criteria 3–5 depend on D10.

#### Acceptance Criteria

1. THE public landing SHALL NOT display any of the following unless it is read at render time from platform data, meaning the catalogue API, the resolved institution's own record or its active `InstitutionAsset` records:
   - a numeric claim;
   - an accreditation claim;
   - a regulator, school or partner logo;
   - a capability claim;
   - an availability statement, such as "the intake is open", which SHALL instead name the open intake and its closing date from the catalogue, or be removed;
   - a statement that presents the platform as a school that teaches, enrols, houses or employs staff.

   This removes, at least: the stats in `apps/admissions/src/lib/constants/landing.ts:84-89`; the "Government accredited admissions" chip and the "Recognized by" strip in `apps/admissions/src/components/smoothui/shape-landing-hero.tsx:54,211`; the regulator and university logos on the feature tiles (`landing.ts:125-143`, found by looking); the closing section's "The current intake is open. You can start tonight." and "Takes about 30 minutes…" (`apps/admissions/src/components/landing/LandingPageSections.tsx:449,452`); "Because we teach the job, not just the theory." (`LandingPageSections.tsx:81`); "We enroll students from Namibia…" (`landing.ts:289`); and "Campus security, hostel matrons … Our staff …" (`landing.ts:344`).
2. THE landing SHALL list open programmes and intakes from the catalogue API through `apps/admissions/src/services/catalog.ts`, scoped by the resolved portal context (`usePortalBrand`), and SHALL show an empty state with a contact route when none are open.
3. WHERE decision D10 is confirmed as option A or C, THE landing SHALL contain no copy addressed to school buyers, super admins or engineers, for example "white-label", "tenant", "super admins" or "configured school".
4. WHERE decision D10 is confirmed as option A, THE school-buyer content SHALL live on a separate public page linked from the footer, and THE landing SHALL have at most four sections after the header: a hero with one primary action, open programmes and intakes, what you need, and how it works.
5. WHERE decision D10 is confirmed as option A or C, THE landing SHALL NOT use the vendored `smoothui` hero, the animated counter or the decorative chip float.
6. THE landing footer SHALL NOT show a social-media link unless it points at that network's profile for the platform; today Facebook, Twitter and LinkedIn all point at the company homepage (`landing.ts:367-369`, found by looking).
7. EVERY call-to-action label on the landing SHALL describe what the control does, and no label SHALL promise a selection that the next page does not keep. No label SHALL read "Apply to Partner" (`LandingPageSections.tsx:333`). Sign-up reads no query parameter today (`apps/admissions/src/pages/auth/SignUpPage.tsx`), so the `?program=` parameter that today's link adds (`LandingPageSections.tsx:328`) is ignored; each programme row's button SHALL therefore read "Apply" and link to `/auth/signup` with no parameter, while the row's text names the programme and school, and THE button SHALL carry `aria-describedby` pointing at that text, so a list of "Apply" links stays distinguishable to assistive technology (WCAG 2.4.4) without a longer visible label. No heading SHALL count items that the section does not show (for example "Three diplomas" over two cards).
8. WHEN the landing renders at 390×844 with the page scrolled to the top, THE primary call to action's whole border box SHALL lie inside the viewport and below any fixed or sticky header, and the primary and secondary buttons SHALL be equally wide, within 1 px (today the primary is narrower than the secondary, found by looking). THE Rendered_Design_Gate SHALL measure both.

### Requirement 13: V2. No developer artefacts on user surfaces

**User Story:** As a student or an admin, I want the screens to show only information about my work, so that internal diagnostics never read as system status.

The build and runtime badge moved to Spec A (research §5). Criteria 1, 2 and 4 need no decision. Criterion 3 depends on D1.

#### Acceptance Criteria

1. THE authenticated shell SHALL NOT display a status that is not derived from live state; the desktop sidebar's fixed "Workspace ready / Navigation synced" (`apps/admissions/src/components/navigation/DesktopSidebar.tsx:216-217`, on every authenticated desktop page) SHALL be removed (found by looking).
2. THE Rendered_Design_Gate SHALL fail if `BuildVersionBadge` renders on a student, admin or public surface outside the diagnostics context that Spec A defines; this spec SHALL NOT change the badge itself.
3. WHERE decision D1 is confirmed as option A, THE jobs-ops shell SHALL NOT show the API base URL, repository paths ("Pinned references") or the creator rail; under option B the "not enabled" state of Requirement 3.6 replaces the shell, and under option C the app leaves the repository.
4. User surfaces SHALL NOT show raw enum or internal values, for example the residency code "local" next to the fee or "Processed via Lenco"; each such value SHALL map to a plain-language label.

### Requirement 14: V3. Every status is true

**User Story:** As a student, I want every progress mark, percentage and next step to match what the system will accept, so that I trust the screen and do the right thing next.

All criteria need no decision. Criteria 1 and 2 build on Spec A's single Readiness (critique §8.2 R6.2).

#### Acceptance Criteria

1. THE wizard stepper SHALL mark a step complete only when every Readiness item that belongs to that step passes. A step the student has passed through with failing items SHALL show an incomplete state with a text label. Today any step before the current one is marked complete (`apps/admissions/src/pages/student/applicationWizard/components/EnhancedProgressIndicator.tsx:294,359`).
2. THE wizard progress percentage SHALL equal the number of passing Readiness items divided by the number of Readiness items, rounded down to a whole percent, and SHALL be computed from the same Readiness as the Submit gate. Today `useOverallProgress` calls `buildWizardReadiness` with a third set of inputs.
3. THE student next actions published by the readiness evaluator SHALL follow the wizard's step order (programme, assigned school, personal details, education and documents, payment, review), so that documents and grades come before payment. Today the evaluator adds the payment blocker before the identity, document and grade blockers (`backend/apps/applications/readiness_service.py:1122-1172`).
4. THE step-incomplete alert SHALL appear only after the student has tried to continue from that step. Today it appears as soon as one field on the step is filled (`apps/admissions/src/pages/student/applicationWizard/index.tsx:1036-1039`).
5. THE assigned-school step SHALL show the total the student will be charged, including the provider transaction fee, computed by the same server policy as the binding quote (`provider_fee_policy`), and SHALL label it an estimate until the payment step issues the quote. Today step 2 shows K500.00 and step 5 charges K505.00 (`backend/apps/catalog/program_views.py:469-474` returns no provider fee).
6. THE student surfaces SHALL NOT render missing data as a value: "Started on Not available", "Last updated: Not available" and an interview section on a draft application SHALL NOT appear; a missing value SHALL be left out or replaced by what happens next.
7. THE same document state SHALL render with one colour, one Lucide icon and one word on every student surface. Today the workspace shows "Uploaded" in blue for the result slip and in amber for the identity document, each after a `✓` text glyph rather than an icon (`apps/admissions/src/components/student/applicationStatus/DocumentChecklist.tsx:24,56`, found by looking).
8. THE wizard progress card's help line SHALL describe the current step. Today steps 2 and 3 still show step 1's line "Choose your programme and intake, and we will check what is still needed." (`apps/admissions/src/pages/student/applicationWizard/components/WizardProgressSummary.tsx:99-103`, found by looking).

### Requirement 15: V4. One heading, one instruction, then the form

**User Story:** As a student on a phone, I want each wizard step to show one heading, one instruction and then the form, so that I reach the first field without scrolling past repeated text.

All criteria need no decision.

#### Acceptance Criteria

1. EACH wizard step SHALL render exactly one page-level heading (H1) naming the step and at most one instruction sentence above the form. The "Application Flow" eyebrow, the "Student Application" title card (`index.tsx:840,883-884`), the repeated step H2 and the paraphrased instructions SHALL NOT render on wizard steps.
2. WHEN a wizard step renders at 390×844 with the page scrolled to the top, THE first form control inside the step's form region SHALL be visible in the first screen: its whole border box SHALL lie inside the part of the viewport that the app bar and the wizard's sticky action bar (`apps/admissions/src/pages/student/applicationWizard/components/WizardActionBar.tsx:117`) do not cover. On a step whose form region holds no form control, its first actionable element SHALL meet the same rule. The app bar, the stepper and the progress row are outside the form region. Today no field is visible in the first screen on steps 4–6 (found by looking).
3. THE step checklist, application preview, step notes and "Your applications" panels SHALL become one "Still needed" list per step; on mobile it SHALL sit below the form and be collapsed by default. The "Switch application" and "Start a new application" actions SHALL stay reachable from the wizard.
4. EVERY control's accessible name SHALL contain its visible text (WCAG 2.5.3). Today "Next Step" is named "Continue to …" and "Previous" is named "Go back to …" (`apps/admissions/src/pages/student/applicationWizard/components/WizardActionBar.tsx:233,267`).
5. Heading levels on every wizard step SHALL be sequential, and the page H1 SHALL come before any sidebar heading in DOM order.
6. THE file rules (types and size) SHALL appear once per upload control.
7. THE wizard SHALL keep its six steps, autosave, the draft picker and the save-status text.
8. EVERY option in the education step's subject lists SHALL have a key that is unique within its list. Today the category header options use the value `__cat_${cat}` (`apps/admissions/src/pages/student/applicationWizard/steps/EducationStep.tsx:183`), which repeats across the ECZ and A-Level groups and logs about 20,000 duplicate-key warnings (C-18, which Spec A's OS-9 assigns to this spec).

### Requirement 16: V5. Type that phones can read, copy that reads as one product

**User Story:** As a student reading on a small screen, I want body text large enough to read and copy that uses one spelling and one style, so that the site reads as one product.

All criteria need no decision.

#### Acceptance Criteria

1. WHEN a Student_Route renders at a 390 px wide viewport, THE computed font size SHALL be at least 16 px for every form control, paragraph, list item, label and button label, at least 14 px for captions, helper text, badges and metadata, and at least 12 px for navigation labels and all other text. Which of these a text node is follows the role rule of Requirement 19.7.
2. THE admissions source SHALL contain no arbitrary font-size utility (`text-[Npx]`) and SHALL use only the `DESIGN.md` scale of 12, 14, 16, 18, 20, 24, 28 and 32 px. At HEAD there are 32 occurrences in 14 files: 15 `text-[10px]`, 16 `text-[11px]` and one `text-[15px]` (the contact form's message field, `apps/admissions/src/pages/ContactPage.tsx:231`). One `text-[11px]` is in `BuildVersionBadge.tsx`, which Spec A changes, so this spec changes 31 occurrences in 13 files.
3. User-facing copy SHALL spell "Programme" and "Programmes"; code identifiers are unaffected.
4. Headings, buttons, labels and navigation items SHALL use sentence case.
5. Forms SHALL mark optional fields with "(optional)" in the label and SHALL NOT add a visual marker to required fields; required inputs SHALL keep `required` and `aria-required="true"`.
6. User-facing copy SHALL contain no em dash and SHALL use "…" rather than "..." in progress text.
7. Running text SHALL be no wider than 75 characters per line on desktop.
8. THE Inter font and its full fallback chain in `apps/admissions/tailwind.config.js` SHALL stay unchanged.
9. Money amounts SHALL use one typographic style on every student surface, the `font-mono` style that `DESIGN.md` §5 prescribes for amounts. Today the assigned-school step shows the fee in mono and the payment step shows the total in the sans face (found by looking).
10. EVERY interactive control on a student or authentication page SHALL have a hit area of at least 44 × 44 px, measured as in Requirement 19.7. Two controls that critique §5.5 measured miss it today: the password field's Show password toggle (36 × 36 px, `apps/admissions/src/components/ui/PasswordInput.tsx:51-54`) and the wizard error summary's jump buttons (about 20 px tall, `apps/admissions/src/pages/student/applicationWizard/components/WizardErrorSummary.tsx:71-75`). Others are not measured yet but miss it by construction, for example `AuthShellLink` (`apps/admissions/src/components/auth/AuthShell.tsx:132-154`), a link with no minimum height inside the `text-sm` `AuthShellFooter` (`:117-126`) on every authentication page. How a link inside running text meets this rule is decision D17.

### Requirement 17: V6. Admin review is a workspace, not a modal

**User Story:** As an admissions officer handling many applications a day, I want a dense table with the review beside it, so that I can work through the queue without opening and closing modals.

All criteria need no decision. The overlap with `admin-dashboard-overhaul` is record-only under D12's lean.

#### Acceptance Criteria

1. WHEN the admin applications page opens on a viewport 1024 px or wider and the admin has not chosen a view since the page loaded, THE page SHALL show the table view (today `useState<'cards' | 'table'>('cards')`, `apps/admissions/src/pages/admin/Applications.tsx:288`). Card view SHALL stay available. Between 640 and 1023 px the default SHALL stay the card view. A view the admin chooses SHALL apply at 640 px and wider until the page reloads, including after opening and closing a review. Below 640 px the card view SHALL stay the only layout, as today (`Applications.tsx:177-190,306`).
2. WHEN an admin opens an application on a viewport 1024 px or wider, THE review SHALL open in a pane beside the queue at its own URL, `/admin/applications/:applicationId`, and the queue SHALL keep its scroll position, filters and selection.
3. WHEN an admin opens an application on a viewport narrower than 1024 px, THE review SHALL open as its own page, not as a modal over the queue, and no navigation bar SHALL render above it. Today the mobile review is a scrim over the queue, the dialog is not visible in the first screen, and the bottom navigation stays above the scrim (found by looking).
4. EACH queue row SHALL have a clickable area at least 44 px tall, and each row checkbox SHALL have a hit area of at least 44 × 44 px (today 16 × 16), measured as in Requirement 19.7, where the checkbox and its label count together.
5. EACH queue row SHALL show one status badge, the application status, with its text label; payment and document states SHALL appear as plain text.
6. THE queue page SHALL show at most four filters by default, with the others behind a "More filters" control that shows how many are active. Today 13 selects and a search field sit above the first row (found by looking).
7. THE review pane SHALL keep every decision control, guard and confirmation the modal has, including Spec A's decision fixes (critique §8.2 R7), and SHALL use the scoped admin query contracts unchanged.
8. THE super-admin shell SHALL carry a persistent text label naming the platform scope and SHALL use the existing `adminColors` tokens, so that it is visibly distinct from the tenant-admin shell.
9. Metric cards SHALL NOT carry explanatory sentences; definitions SHALL move to a glossary link or to a disclosure that opens on tap, click and keyboard activation. A hover tooltip SHALL NOT be the only way to read a definition, because the app's `Tooltip` (Radix, `apps/admissions/src/components/ui/tooltip.tsx:2`) opens on hover and focus but not on tap, so an admin on a phone could not read it.
10. EVERY admin form field SHALL have a visible label, and placeholder text SHALL NOT be a field's only label (WCAG 3.3.2). Today the super-admin school-profile form labels its fields with placeholders and `aria-label` only (`apps/admissions/src/pages/admin/tenants/SuperAdminTenantConsole.tsx:306-318`, found by looking).
11. WHERE two controls on one admin screen start different flows for the same goal, EACH SHALL be labelled by what it does, and at most one SHALL use the primary style. Today the tenant console shows "New institution (wizard)" and "New institution" as two primary buttons with near-identical labels. The first opens the onboarding wizard. The second opens a blank inline profile form whose submit button reads "Create school" (`SuperAdminTenantConsole.tsx:241-243,262-263,322`, `TenantListPanel.tsx:59-62`, found by looking).
12. WHEN an admin page renders at 390 px, no control or text SHALL be clipped at the viewport edge or overflow it. Today the super-admin tenant console is cut off at the right edge (found by looking).

### Requirement 18: V7. Every text and background pair meets WCAG AA

**User Story:** As a reader with low vision, I want every text and background pair to meet WCAG AA, so that I can read status chips, helper text and buttons.

All criteria need no decision.

#### Acceptance Criteria

1. WHEN axe scans the Audited_Page_Set at 1440×900 and 390×844, THE scan SHALL report zero `color-contrast` violations.
2. Text on a tinted status background SHALL use `--color-foreground`, never the status base colour; the `muted` tone keeps `--color-muted-foreground`, which measures 9.77:1 on its tint over white and 9.41:1 over `--color-muted`. The status SHALL be carried by the tint, the border and a status icon. A status icon SHALL either use the status base colour, which measures at least 3:1 on its own tint (on the accent tint, whose base token is a light background colour, `--color-accent-foreground`; for the `neutral` and `muted` tones, which have no base colour, `--color-muted-foreground`), or inherit the text colour. This is the rule `StatusPill` already follows: its text is `text-foreground` on every tint except `muted`, and its icons inherit the text colour (`apps/admissions/src/components/ui/StatusPill.tsx:36-43,46-56,78`; admissions-v2 task 11.5, R16.2). So `StatusPill` keeps its colours and icons.
3. THE admissions source SHALL NOT apply an alpha modifier to a text colour token, that is `text-<token>/<NN>` for any `--color-*` token in `apps/admissions/src/styles/design-tokens.css`, with or without a variant prefix such as `hover:` or `placeholder:`, and a source-scan test SHALL fail on any such use. At HEAD there are 23, of which 10 are `text-muted-foreground/NN`. Tailwind palette colours that are not tokens, such as `text-white/80` on the dark surfaces, are outside this rule; criterion 1 measures their composited contrast.
4. A foreground token meant for a solid status fill SHALL NOT be used on a tint of that fill. Today the review step's "Go to step" buttons put `text-warning-foreground` (white) on `bg-warning/10`, about 1.23:1 (`apps/admissions/src/pages/student/applicationWizard/steps/SubmitStep.tsx:212,240`, found by looking).
5. Text on the dark `bg-foreground` surface SHALL NOT use a light-surface token such as `--color-muted-foreground`; token text there SHALL use `--color-primary-foreground` or `--color-accent`. Today the landing's closing section sets `text-muted-foreground` on `bg-foreground`, 1.73:1 (`LandingPageSections.tsx:441-452`, found by looking). The white text with an alpha modifier on the shared footer, the desktop sidebar and the public tracker header (`text-white/50` to `text-white/90`, 5.23:1 to 14.54:1 on `bg-foreground`) uses no token and stays under criterion 1.
6. Icons that carry meaning SHALL have at least 3:1 contrast with their background (WCAG 1.4.11). Today the identity-document icon is `text-accent` on `bg-accent/10` and almost invisible (`DocumentChecklist.tsx:51-52`, found by looking).

### Requirement 19: V8. The design gate measures rendered pages

**User Story:** As a maintainer, I want CI to measure the pages users see, so that design and accessibility regressions fail before they ship.

All criteria need no decision.

#### Acceptance Criteria

1. THE CI pipeline SHALL build the admissions app with `vite build`, serve it through the harness edge, and run impeccable 2.1.9's browser detector (`cli/engine/detect-antipatterns-browser.js`, the rule set the CLI's URL mode injects into a page) in each page of the Audited_Page_Set at both viewports, inside the Playwright session that holds the page's sign-in and viewport. THE gate SHALL NOT use the CLI for these scans: its URL mode always renders at 1280×800 and its JSON output names no element.
2. THE Audited_Page_Set SHALL include, each at 1440×900 and 390×844: the landing, sign-in, sign-up, track application, the student dashboard empty and with a draft, each of the six wizard steps (at `/student/application-wizard`, not at its `/apply` alias), the application workspace, the payment page, settings, the admin applications queue, the admin review, and the tenant console for a super admin and for a tenant admin. THE gate's own setup SHALL create each state through the harness API helpers rather than assume that seed data holds it.
3. THE gate SHALL run axe-core (`@axe-core/playwright` 4.11.1, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) on the same pages and states.
4. THE gate SHALL compare findings with a committed baseline of rule, page, viewport and selector with a reason for each, and SHALL fail on any finding not in the baseline, on any baseline entry without a reason, and on any baseline entry that no longer matches a finding. Every finding, whichever tool reports it, SHALL be keyed by the same element selector, built from the element's `data-testid`, else a stable `id`, else a structural path.
5. THE gate SHALL run as a blocking job, without `continue-on-error`, on every pull request that touches `apps/admissions/` and on every push to main.
6. THE existing source-scan gate (`scripts/design-audit-gate.ts`) SHALL keep running.
7. WHEN the gate scans a page at 390×844, THE gate SHALL measure the following, and SHALL fail on any result outside these rules that is not in the baseline:
   - **Font size, on Student_Routes.** Every rendered, visible text node is held to Requirement 16.1's floor for its role. The role is the first of these that applies: *caption*, inside an element marked `data-text-role="caption"` (set by `StatusPill`, `Badge`, the helper-text paragraphs of the input and textarea primitives, and each caption the type tasks mark); *navigation*, inside a `nav` element; *control*, inside an `input`, `select`, `textarea`, `button`, `[role="button"]` or an element marked `data-text-role="control"` (which `Button` sets, so a `Button asChild` link counts); *body*, inside a `p`, `li`, `label`, `dd` or `td`; *other*, anything else. Captions need 14 px, controls and body text 16 px, navigation and other text 12 px. A form control's value is not a text node, so each `input` of a text-entry type, `select` and `textarea` is also measured by its own computed font size, as a control.
   - **Hit area**, of every interactive element: at least 44 × 44 px. The hit area is the union of the element's own box and the box of its associated label (`label[for]` naming it, or a label that wraps it). A skip link is measured in its focused state. A link inside running text is measured like any other control, because the steering's 44 px rule has no inline exception. Decision D17 decides how such links meet the rule; if it amends the steering to exempt them, the classifier follows the amended steering.
   - **Overflow**: any text-bearing or interactive element (an element with a non-empty text node as a direct child, a form control, a link, a button, or an image with non-empty `alt`) whose border box ends past the viewport's right edge, unless one of its ancestors is a horizontal scroll container (`overflow-x: auto` or `scroll`) whose own box ends inside the viewport, because content there is reached by scrolling. An ancestor that clips with `overflow-x: hidden` or `clip` does not excuse it: `body` and the layout shells clip horizontally (`apps/admissions/src/index.css:77`, `apps/admissions/src/components/navigation/AppLayout.tsx:262,282`, `apps/admissions/src/components/layout/PublicLayout.tsx:30`), so content cut off at the edge is what this rule reports.
   - **Clipped or spilling text** (the clipped-text rule): any element with a non-empty text node as a direct child whose computed `overflow-x` is not `auto` or `scroll` and whose `scrollWidth` exceeds its `clientWidth` by more than 1 px. With `overflow-x: hidden` or `clip` the text is cut off, which is what `truncate` produces; with `overflow-x: visible` it spills out of its own box, which no other rule sees unless it also passes the viewport's right edge. Horizontal scroll regions show their content on scroll and are not reported.

   An element that is not rendered, has `visibility: hidden`, has zero area, or sits inside a closed `<details>` or a collapsed region is measured by no rule. An element that carries `aria-hidden="true"` is skipped by the hit-area rule only, because `aria-hidden` hides it from assistive technology, not from sight.
8. THE P2 phase SHALL NOT be marked complete until a named person has reviewed the gate's screenshots of the Audited_Page_Set at both viewports and recorded a sign-off with their name, the date and any findings.
9. WHEN the P2 phase exits, THE rendered-design baseline SHALL hold no entry, on any page of the Audited_Page_Set, for the hit-area rule, the font-size rule on Student_Routes, the overflow rule, the clipped-text rule inside a `nav` element, impeccable's `nested-cards` and `low-contrast` rules, or axe's `color-contrast` rule, because those rules are hard guardrails (Requirements 18.1, 21.2 and 22.8) and a reason does not waive them.

### Requirement 20: V9. The interface promises only what exists

**User Story:** As a student, I want the site to promise only what it does, so that I am not waiting for an SMS, a room booking or a review deadline that will never come.

Criteria 1–5 and 7 need no decision. Criterion 6 depends on D9.

#### Acceptance Criteria

1. THE UI SHALL NOT promise SMS messages, accommodation booking through the portal, a review turnaround time or automatic grade conversion unless the feature exists at the commit the copy ships in. Each remaining statement SHALL describe what the platform does (`landing.ts:233,258,332`).
2. Student-facing support contacts SHALL come from the Tenant_Support_Resolver, and no student surface SHALL hardcode an email address (today `apps/admissions/src/pages/student/Interview.tsx:385-386`).
3. THE sign-in trust note SHALL describe the session behaviour the app provides once Spec A's session fix (critique §8.2 R8.1) ships; today it says "Your session lasts 7 days" (`apps/admissions/src/components/auth/AuthShell.tsx:51`).
4. THE admin applications subtitle SHALL NOT mention "payment proof" (`Applications.tsx:577`), and the student workspace SHALL NOT label the decision note "Latest payment review note" unless the note is about payment (`apps/admissions/src/components/student/applicationStatus/WorkspaceAside.tsx:56`).
5. THE interview page SHALL NOT ask "Need to reschedule your interview?" when the student has no interview (`Interview.tsx:381`).
6. WHERE decision D9 is confirmed, THE copy this spec writes about official letters SHALL match the chosen option and Spec A's letter copy (critique §8.2 R7.4); it SHALL NOT promise a letter that the institution's configuration cannot produce, and SHALL NOT mention a rejection letter unless D9 adds one.
7. User-facing copy SHALL NOT narrate the system to its developers (for example "The column exists", "does not drift", "the platform does not measure presence", "Each number states what it counts").

### Requirement 21: V10. Short navigation and empty states that teach the next step

**User Story:** As a student with one application, I want a short navigation and empty states that say what happens next, so that I can find my application and my messages quickly.

Criteria 1, 2 and 4–6 need no decision. Criterion 3 depends on D16. Criterion 5 holds under every option; on the landing, task 33.1 meets it under whichever D10 option is chosen, so the landing is not reworked twice.

#### Acceptance Criteria

1. THE desktop and mobile student navigation SHALL list the same destinations in the same order, both read from `apps/admissions/src/routes/routeRegistry.ts`, and SHALL keep the student's documents within two activations of the dashboard (critique §8.2 R5.3).
2. WHEN the bottom navigation renders at 390 px, EACH label SHALL show in full, without truncation, at 12 px or larger, inside its own slot, which the gate's font-size, clipped-text and overflow rules measure (Requirement 19.7): the clipped-text rule reports a label that is cut off or spills out of its box, and the overflow rule a label that pushes its item past the viewport's right edge. Today labels are truncated ("Dashb…", "Com…", "Paym…", "My Sc…"; `apps/admissions/src/components/ui/BottomNavigation.tsx:205,242`, found by looking).
3. WHERE decision D16 is confirmed as option A, THE student navigation SHALL have three destinations, "My application", "Messages" and "Account", and every current student route and URL SHALL stay reachable from inside them.
4. EVERY empty state on a student route SHALL have one heading and SHALL say why it is empty and what fills it or what to do next, for example "Interviews are scheduled after review. We will email you and post a message here." Today the payment page gives one empty state two headings (found by looking).
5. No card SHALL sit inside another card on any page of the Audited_Page_Set (`DESIGN.md` §4, one container deep), including the landing and the admin pages, because nested cards are a hard guardrail on every surface.
6. THE mobile header SHALL name the current page; today the application status page shows the platform name instead (found by looking).

### Requirement 22: Guardrails and preserved behaviour

**User Story:** As the platform owner, I want simplification and polish to leave security, payments, drafts and tenant isolation exactly as strong as they are, so that this spec cannot reopen problems that earlier work closed.

These criteria apply to every task in this spec.

#### Acceptance Criteria

1. THE changes SHALL keep tenant isolation: scope-before-lookup through `visible_institution_queryset`, masked 404s for out-of-scope objects, capability resolution through `AdminCapabilityService`, fail-closed on `CapabilityResolutionError`, and no raw role-string comparison in new endpoint code. `backend/tests/property/test_scope_before_lookup.py`, `test_cross_tenant_invisibility.py`, `test_production_scope_masking_properties.py`, `test_access_scope_properties.py`, `backend/tests/unit/test_scope_drift_guard.py` and `test_unscoped_endpoint_guard.py` SHALL pass unchanged.
2. THE changes SHALL keep the single payment path, webhook deduplication, the double-charge guard, `normalizePaymentStatus` for student reads, deferral at submit, and `PAYMENT_HARDENING_RATE_LIMITS` as the only payment flag; retired payment flags SHALL stay retired. THE changes SHALL also keep the payment ownership split: the wizard owns pay-or-defer before submission and renders no history or recovery, and `/student/payment` owns deferred, failed, expired and pending recovery plus history after submission, and never shows a draft. `apps/admissions/tests/harness-e2e/required/payment-ownership-split.spec.ts`, `apps/admissions/tests/unit/paymentOwnershipSplit.test.tsx` and `apps/admissions/tests/unit/paymentRecoveryPresentation.test.ts` SHALL pass unchanged.
3. THE changes SHALL keep cookie authentication, CSRF enforcement and the `?refresh_csrf=1` recovery, and every new state-changing request SHALL go through the app's API client.
4. THE changes SHALL keep the `{"success": true, "data": ...}` envelope on every authenticated endpoint they touch, and paginated lists SHALL keep `{page, pageSize, totalCount, results}`.
5. THE changes SHALL keep silent autosave on every student form, the multi-draft intents (`mode=new`, `mode=resume&draftId`) and the rule that payment-linked drafts cannot be deleted.
6. THE changes SHALL write no PII, secret, document body or raw phone number to a log, an evidence file or a CI artefact.
7. Schema changes SHALL ship as additive SQL scripts under `backend/scripts/`, proven on a Neon branch first, and production SHALL apply such a script only after a fresh `deploy/backup-db.sh` backup. No task in this spec SHALL write to the production database, run a deploy or edit `.github/workflows/deploy.yml`. A merge of this spec's work SHALL reach production only through that workflow under Spec A's deploy gate (Spec A DEC-10): WHILE Spec A's pause on automatic deploys holds (from Spec A task 2.6, before Spec A task 3.2, until Spec A task 6.2), only in a Deploy run that an operator approves; after Spec A task 6.2 has re-enabled automatic deploys, through the normal automatic deploy that follows a green CI run on `main`. EVERY task that changes what production serves SHALL say which of these paths its merge takes, and SHALL record in the evidence summary the path in force when it merged, its production effect and its rollback.
8. THE visual changes SHALL use only Existing_Tokens and SHALL add no colour token, font family or palette. They SHALL NOT introduce purple gradients, gradient text, glassmorphism on product surfaces, nested cards or emoji icons; they SHALL keep WCAG AA contrast, 44 × 44 px touch targets, the global reduced-motion rule, status colour paired with a label or icon, and the full Inter fallback chain.
9. Admissions SHALL make no generative AI call; `backend/tests/unit/test_no_admissions_generative_ai_guard.py` SHALL pass, and any option that removes the jobs-ops AI service or the server OCR dependencies SHALL update that guard in the same change, because the guard also asserts that both exist.
10. EVERY new frontend mirror of a backend concept SHALL register in `docs/canonical-truth-map.md` with a drift-guard test, and this spec SHALL register itself in that map's spec section once D12 is confirmed.
11. THE changes SHALL NOT edit the specs named in D12 (`student-ui-ux-mobile-remediation`, `admin-dashboard-overhaul`, `profile-updates`, `admissions-v2-canonical-rebuild`).
12. THE changes SHALL keep upload validation and its staged write order: the 10 MiB ceiling (`FILE_TOO_LARGE`), `EMPTY_FILE`, `DOCUMENT_TYPE_NOT_REQUIRED` and `INVALID_FILE_TYPE` from the required-documents resolution, a retryable `CONFIGURATION_UNAVAILABLE` (503), the magic-byte check (`INVALID_FILE`) and the active-content screen (`UNSAFE_FILE_CONTENT`), then the staged write (`open_stage`, save, `verify_stored_object`, `commit_version`, compensate). `backend/tests/unit/test_required_documents_contract.py`, `backend/tests/integration/test_required_documents_contract_7_2.py`, `backend/tests/integration/test_document_evidence_compensation_7_3.py` and `apps/admissions/tests/unit/requiredDocumentsDrift.test.ts` SHALL pass unchanged.
13. THE changes SHALL keep student submission idempotent: `POST /api/v1/applications/{id}/submit/` stays behind `@idempotent` and `SubmitRateThrottle` (`backend/apps/applications/student_submission_views.py:89,112-114`), and the wizard keeps sending the `submit-<applicationId>` key (`apps/admissions/src/lib/submitIdempotency.ts`). `apps/admissions/tests/unit/submitIdempotency.test.ts` and `apps/admissions/tests/unit/applicationSubmitIdempotencyHeaders.test.ts` SHALL pass unchanged.

## Decision Register

The user confirmed D1–D10 and D12–D16 on 2026-11-08 ("Proceed with best recommendations, you have full authority"); the option chosen is in each Status line, and the critique's lean text is kept for history. D17 is open on purpose (it has no lean, and one option amends a hard guardrail), and D11 is an operator track outside this spec. D15, D16 and D17 are added by this spec: D15 and D16 cover removals the critique did not number but which still need a decision under this spec's rule, and D17 is a guardrail question that the rendered gate's hit-area rule raises. For each decision: the question, the options, the critique's lean, what depends on it, and what changes under another option.

How this register is used:

- A decision is Confirmed when its **Status** line reads `Confirmed <date> (option …)`. Until then the status reads "Awaiting confirmation". Confirmed on 2026-11-08 by the user: D1–D10, D12–D16; open: D17; outside this spec: D11.
- A Gated_Task starts only after every decision in its marker is Confirmed and every further prerequisite on the same line is met. Where the confirmed option is not the lean (D5's workflow, which stays dormant, is the one case), the tasks for that decision are rewritten to match before they start, and the change is noted in this register.
- The rule for gating: a task is gated when it removes, freezes, prunes or untracks a route, capability, file set, dependency or navigation entry, or when its outcome depends on an open decision. Three kinds of change are not removals under this rule, and their tasks are ungated:
  - replacing an implementation with one that keeps every capability, for example the admin review modal becoming a split pane (Requirement 17);
  - moving text out of always-loaded steering into an archive document that keeps it (Requirement 6.4);
  - deleting a statement that is false under every option, for example an invented number, a hardcoded readiness claim or a fixed status line (Requirements 3.1, 12.1, 13.1).
- If you want any of these gated as well, say so and the matching task gets a marker.

### D1. Jobs-ops

- **Question:** What happens to jobs-ops (C-17; critique §4 rows 4–5)?
- **Options:**
  - A: finish it with real ingestion, a sign-in UI and real data.
  - B: freeze it. Put every jobs-ops route behind the flag, including the ones mounted today whatever the flag says; show "not enabled"; drop the "production_ready" claims; keep the code.
  - C: cut it from this repository and this deployment, into its own repository or an archive branch.
- **Sub-question D1.b (no lean in the critique):** what happens to the unauthenticated `POST /api/v1/email/webhooks/delivery/`? Its handler returns a scaffold payload (`backend/apps/integrations/email_views.py:72-90`), and nothing in the repository registers it with an email provider. Options: (i) gate it with the jobs-ops flag; (ii) keep it mounted as an admissions provider webhook and require its secret in production; (iii) remove it.
- **Lean:** B now; choose A or C later. Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Status:** Confirmed 2026-11-08 (option B: freeze it now; whether to finish or cut jobs-ops is decided later, in a new decision). Sub-question D1.b was not part of that confirmation and stays open. Recommendation (not a confirmation): option (i), gate `webhooks/delivery/` with the jobs-ops flag, because its handler returns a scaffold payload and nothing registers it with a provider. Task 12.1 changes that one route only after D1.b is answered and does everything else now.
- **Depends on it:** Requirements 3.3, 3.5, 3.6, 3.7, 13.3; tasks 12.1, 12.2, 12.3.
- **Decision-independent (proceeds now):** Requirements 3.1, 3.2, 3.4, 3.8; tasks 7.1–7.4. A hardcoded readiness claim is false under every option.
- **Under another option:** A: tasks 12.1–12.3 are replaced by a new spec to finish jobs-ops, and task 12.2 instead removes the developer rail (Requirement 13.3). C: move `apps/jobs-ops/`, the five backend apps, `jobs_ops_seed.py`, the 28 jobs-ops models and the jobs-ops-only `openai` requirement out, together with every line that builds and serves jobs-ops: the frontend image's copy and build steps (`apps/admissions/Dockerfile:22,30,53-55,61`), the edge site that serves it (`apps/admissions/Caddyfile:64-69`) and production's required `JOBS_HOST` (`deploy/docker-compose.prod.yml:36`), in the same change, so the next Deploy run's image build does not break (the gap task 14.5 closes for the placeholder apps); keep `GET /api/v1/meta/platform/` in this backend with the attribution and the API version only, and move the product steering's attribution rule from its jobs-ops section to the platform section (Requirement 3.8); and rewrite `test_no_admissions_generative_ai_guard.py`, which asserts that the jobs-ops AI service exists (Requirement 22.9).

### D2. Harness and evidence infrastructure

- **Question:** Does the harness become the default local stack, and what happens to committed evidence and the launch verdict (critique §4 rows 6–8, §7.3)?
- **Options:**
  - A: promote the harness to the default local stack; cut the launch-verdict rollup; keep contract sync. Spec A adds the CI journey gate.
  - B: A, plus untrack the raw `docs/v2-evidence` artefacts; keep the READMEs and other Markdown.
  - C: B, plus a history purge (destructive; needs a force-push).
  - D: keep everything as it is.
- **Lean:** A + B; C only together with D11. Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Status:** Confirmed 2026-11-08 (option A + B: the harness becomes the default local stack and the CI journey gate; the launch-verdict rollup is cut and contract sync is kept; the raw `docs/v2-evidence` artefacts are untracked and the READMEs are kept). No history purge: option C stays tied to D11 and is an operator decision.
- **Depends on it:** Requirements 1.1–1.4, 1.6–1.10, 4.1–4.3, 4.5; tasks 11.1, 11.2, 11.3, 11.4.
- **Also confirmed with option A, B or C:** task 11.1 makes `harness/bin/local-setup.sh` the one bring-up path, and changes Spec A's `harness journey-gate` command (Spec A design R9-a) so that, after exporting its four gate values, it calls that script instead of its own build and start-up. Every gate run then follows the documented steps. Confirming A, B or C confirms that change to Spec A's command; Spec A's workflow (R9-e) still calls `bash harness/bin/harness journey-gate` and is unchanged.
- **Also confirmed with option A, B or C (retires Spec A R1 deliverables):** task 11.2 deletes `backend/docker-compose.local-test.yml`, which Spec A's R1 extends. So it also retires what depends on that file: Spec A's `local-stack-storage` CI job (Spec A task 4.4) and its required-check step (Spec A task 4.5), the compose assertions in `backend/tests/unit/test_storage_settings_contract.py` (Spec A task 1.1), and `backend/.env.local.test.example` with its `.gitignore` exception, its `test_tracked_env_files.py` allowlist entry and its entry in the env-template test (Spec A task 3.3). The harness's `journey-gate` already runs `storage_roundtrip_check --expect-private` (Spec A task 4.4), so Spec A's clause 2.1 (a storage round-trip on the documented stack) is then met on the harness, the documented stack. Task 11.2 does this in the right order (design §1, "Retiring the local-test stack"): the operator drops `local-stack-storage` from the required checks first, then one change removes the job, the assertions and the template together with the file. Spec A is not edited; it keeps meeting its own clause on the local-test stack until that change lands.
- **Decision-independent:** Requirements 1.5, 1.11, 1.12, 4.4, 4.7, 4.9; tasks 1.3, 3.3, 3.6, 3.7, 6.6. The harness's own isolation (the card-widget stub, the resource-hint plugin, both outside-host checks and the error-reporter DSN) is the same under every option, because Spec A's Journey_Gate and the Rendered_Design_Gate run on the harness whatever is chosen.
- **Under another option:** A alone: task 11.3 is dropped. C: the purge stays outside this spec (D11); tasks are as for B. D: task 11.1 adds Mailpit, the payment adapter and beat to the local-test stack instead of adopting the harness (its MinIO comes from Spec A's R1, task 3.1, which adds it to that file), and Spec A's `harness journey-gate` keeps its own bring-up; task 11.2 retires nothing; task 11.3 is dropped; task 11.4 keeps the rollup and adds a dated note to `docs/launch-evidence/launch-readiness.md` that its "production-launch-ready, 11/11" verdict covers neither document upload nor the student journey (critique §6 row 12); and Requirement 4.5 is recorded as not met.

### D3. Capability depth

- **Question:** How many capabilities should the catalogue hold (critique §4 row 1)?
- **Options:**
  - A: keep the 34-capability matrix.
  - B: collapse to what the UI distinguishes; drop `*.request_change` and `platform.user.create_global`; keep scope-before-lookup and the cross-tenant tests.
  - C: per-institution roles (admin or reviewer) on memberships.
- **Lean:** B, after P0, with the property tests unchanged. Proposed in the critique; confirmed 2026-11-08 (see Status). The merge table for any merge beyond the named removals needs its own approval (Requirement 8.4); task 8.1 prepares it.
- **Status:** Confirmed 2026-11-08 (option B, after P0: collapse to what the UI actually distinguishes; drop `*.request_change` and `platform.user.create_global`; scope-before-lookup and the cross-tenant property tests are unchanged). Prerequisites that stay: (1) the work starts only after Spec A's P0 (its tasks 3 to 5) is merged; (2) any merge beyond the two named removals needs the user-approved merge table (Requirement 8.4, task 8.1); (3) the `*.request_change` drop conflicts with the D5 outcome, see Interaction.
- **Interaction (open conflict, recorded 2026-11-08):** dropping the three `*.request_change` capabilities is consistent only if D5 removes the change-request workflow (D5 option B). D5 was confirmed as "leave the workflow dormant, do not remove it" (option C), and the dormant workflow's submit authority still uses those three capabilities (Requirement 8.3). So `platform.user.create_global` goes (task 17.1) and the three `*.request_change` capabilities stay, and task 17.2 does not start. It needs one more answer from the user: remove the workflow (then D5 changes to option B), or keep the three capabilities. Nothing in this spec guesses it.
- **Depends on it:** Requirements 8.2–8.5; tasks 17.1, 17.2, 17.3 (17.2 also needs D5).
- **Decision-independent:** Requirements 8.1, 8.6; task 8.1 (inventory and proposed merge table, no catalogue change).
- **Under another option:** A: tasks 17.1–17.3 are dropped. C: out of scope for this spec; it changes the security model and needs its own spec.

### D4. OCR

- **Question:** Does OCR grade extraction stay on for every school (A-09, A-02; critique §4 row 13)?
- **Options:**
  - A: keep it; add PDF support (poppler, pdf2image); back off the polling.
  - B: freeze it: manual entry first, OCR opt-in per tenant, no polling unless the tenant opted in.
  - C: cut the task, Tesseract and the hook.
- **Lean:** B now, per-tenant opt-in; revisit PDF later. Spec A already fixes the polling drain. Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Spec A's default until then (Spec A DEC-2):** OCR stays on for every school, with bounded polling that backs off and stops at a terminal state, and no PDF OCR. Nothing in this spec changes OCR before D4 is confirmed.
- **Status:** Confirmed 2026-11-08 (option B: manual entry first, per-tenant OCR opt-in, no OCR polling unless the tenant opted in; PDF OCR is revisited after uploads are reliable). Until tasks 18.1 and 18.2 merge, Spec A's default (DEC-2) is what runs.
- **Depends on it:** Requirements 11.1–11.4; tasks 18.1, 18.2, 18.3.
- **Decision-independent:** Requirements 11.5, 11.6.
- **What option B does not change:** the generic admin settings endpoints let any `admin` role read every setting (`IsAdmin`), and gate writes on the super-admin role string (`is_super_admin` in `_settings_write_forbidden`), not on `platform.settings.manage` through `AdminCapabilityService`. The admissions route registry opens the settings page to super admins only (`apps/admissions/src/routes/routeRegistry.ts:375-381`), and `scripts/authority_matrix_registry.py:454-457` registers all four settings routes as `platform.settings.manage`. Option B adds a dedicated command for the opt-in and keeps that one key out of the generic endpoints. Re-gating the generic reads would take access away from tenant admins, which is a capability change, so this spec records it as a known issue (task 1.1) and does not make it.
- **Under another option:** A: tasks 18.1–18.3 are dropped and PDF support becomes a separate change; this spec adds nothing. C: tasks 18.1–18.3 become removal tasks for `extract_document_text_task`, the Tesseract packages in `backend/Dockerfile`, `useOcrGradeExtraction` and their tests, and they rewrite `test_no_admissions_generative_ai_guard.py`, which asserts that the server OCR dependencies exist.

### D5. Change-request workflow, the v2 layer and onboarding

- **Question:** What happens to the tenant change-request workflow (6 routes, 0 frontend callers), the v2 demo views and the v2 onboarding views (critique §4 rows 2–3)?
- **Options:**
  - A: build the missing change-request UI.
  - B: cut the change requests and the demo views; keep the v1 onboarding the wizard uses. The steering calls change requests the closure of TEN-06, so this formally reopens it.
  - C: leave them dormant.
- **Lean:** cut the demo views under every option. For the change requests themselves the critique gives **no lean**; it is your call. Proposed in the critique for the demo views only; confirmed 2026-11-08 (see Status).
- **Status:** Confirmed 2026-11-08 (the v2 demo views: cut; the change-request workflow: option C, left dormant, not removed). Because the workflow stays, TEN-06 stays closed in the steering but is described as a backend workflow with no frontend caller, dormant by this decision (Requirements 2.7, 6.5), and Requirement 8.3 keeps the three `*.request_change` capabilities (see D3, Interaction).
- **Depends on it:** Requirements 2.6, 2.7, 6.5 (TEN-06 wording), 8.3; tasks 13.1, 13.2, 17.2.
- **Under each option:** A: task 13.2 records follow-up work; building the UI needs a spec amendment or a new spec. B: task 13.2 removes the workflow and the v2 onboarding views, and records TEN-06 as open. C: task 13.2 adds the six routes to the External_Consumer_List as dormant. The v2 readiness path stays under every option because Spec A depends on it.

### D6. Vendored agent skills

- **Question:** Which vendored skills stay in the repository (critique §4 row 9)? At HEAD:
  - `.kiro/skills/` tracks 4,072 files. Its top level holds 310 real skill directories, 15 symlinks into `.agents/skills/` (git mode `120000`) and two files, `AGENTS.md` and `README.md`. Thirteen symlinks resolve; `playwright` and `playwright-best-practices` dangle. Following the links gives the 323 directories seen on disk.
  - `.agents/skills/` tracks 15 directories (144 files). Thirteen are the symlink targets, so each is the only copy of a skill that `.kiro/skills/` reaches through a link, not a duplicate. `ui-ux-pro-max` is the only real second copy, and `open-design` exists only here.
  - `.agents/skills.json` (tracked) lists `.kiro/skills` as a skill root.
- **Options:**
  - A: keep them all.
  - B: prune to the skills the steering references, plus the design skills.
  - C: move everything to a user-level install or a separate repository.
- **Caution:** the steering and these workflows load skills from `.kiro/skills/…`. Pruning removes a skill from every agent session in this workspace. The steering names seven skills, but this spec's own authoring workflow also used spec-driven-workflow, senior-architect, tech-debt-tracker, copywriting, content-humanizer, copy-editing and a11y-audit. Task 8.2 builds the keep-list for you to confirm with the decision, and records for each kept skill the path that holds its one real copy, because a skill reached through a symlink lives only in `.agents/skills/`. Under C, agent sessions break unless the skills are installed elsewhere first.
- **Lean:** B. Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Status:** Confirmed 2026-11-08 (option B: prune to the skills the steering references plus the design skills). Two cautions are part of the decision: some `.kiro/skills/` entries are symlinks, so the pruning task never deletes a directory that a kept entry still resolves to; and the two dangling symlinks are deleted only as the two entries themselves.
- **Depends on it:** Requirement 4.6; tasks 15.1, 15.2.
- **Decision-independent:** Requirement 4.7 (a referenced skill path must exist, every tracked skill symlink must resolve, and every `.agents/skills.json` path must exist); tasks 3.3, 8.2. The two dangling symlinks sit in that check's baseline until task 15.1.
- **Under another option:** A: task 15.2 is dropped, and task 15.1 only deletes the two dangling symlinks, which point at nothing, so no skill is lost; if you refuse that too, they stay in the baseline. C: task 15.1 moves every skill out and updates every steering path, after the user confirms the new install location.

### D7. Default-off performance caches

- **Question:** What happens to the capabilities, dashboard and catalogue caches, which no repository environment turns on (critique §4 row 12)?
- **Options:**
  - A: cut the capabilities and dashboard caches; keep the catalogue cache only if production has it on and it has been measured.
  - B: turn them on and measure.
  - C: keep everything as it is.
- **Lean:** A, after the production environment check in P0_Ops_Check. Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Prerequisite:** the P0_Ops_Check needs a reachable production host, which depends on D14.
- **Status:** Confirmed 2026-11-08 (option A: cut the capabilities and dashboard caches; keep the catalogue cache only if production has it enabled and it has been measured). The prerequisite stays: the P0_Ops_Check, which needs a live production host (D14); tasks 16.1 and 16.2 stay blocked until it has run.
- **Depends on it:** Requirements 5.1–5.3; tasks 16.1, 16.2.
- **Decision-independent:** Requirements 5.4, 5.5; task 1.2.
- **Under another option:** B: tasks 16.1 and 16.2 become "enable on staging, measure with `backend/tests/perf_baseline`, then decide per cache". C: tasks 16.1 and 16.2 are dropped and Requirement 5.1 is recorded as not met.

### D8. Email verification

- **Question:** Is email verification part of the flow (C-16)? `RegisterView` sets `email_verified=True` (`backend/apps/accounts/auth_views.py:432-445`), and `backend/apps/common/email_links.py:18` records that verification is not implemented.
- **Options:**
  - A: implement it.
  - B: drop it officially and fix the docs.
- **Lean:** B now; revisit when there is data. Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Spec A's default (Spec A DEC-3):** email verification is out of scope.
- **Status:** Confirmed 2026-11-08 (option B: drop email verification officially and fix the docs).
- **Depends on it:** Requirement 6.5 (final wording); task 19.1.
- **Decision-independent:** task 1.1 states the current fact ("not implemented; decision D8 pending").
- **Under another option:** A: email verification is a new feature and a non-goal of this spec; it needs its own spec, and task 19.1 only records that.

### D9. Letters when a tenant has no document profile, and the rejection letter

- **Question:** What do students get when their school has no document profile, and is there a rejection letter (B-08, B-10, C-09)?
- **Options:**
  - A: generate letters with a neutral Beanola fallback profile.
  - B: block letters with truthful copy, and make profile setup part of tenant onboarding and the seeds.
  - C: use the fallback for the slip and the receipt; block offer and acceptance letters.
  - Separately: add a rejection-letter type, or keep rejections email-only.
- **Lean:** C; ask the schools about the rejection letter. Proposed in the critique; confirmed 2026-11-08 (see Status). The backend already behaves like C (research §6); Spec A owns the student copy (critique §8.2 R7.4).
- **Spec A's default until then (Spec A DEC-5, DEC-6):** when a tenant has no document profile, the acceptance letter and the conditional offer show a truthful "not available yet" state with no neutral-fallback branding; the slip and the receipt keep their current branding; a rejection letter is out of scope and rejections stay email-only. Spec A marks all of it as pending your sign-off under D9.
- **Status:** Confirmed 2026-11-08 (option C: slips and receipts render with neutral fallbacks; offer and acceptance letters show "not available yet" with the school's support contact and no fallback branding; rejections stay email-only). Task 27.4 still waits for Spec A's `[R7.4]` to merge.
- **Depends on it:** Requirement 20.6; task 27.4, which also waits until Spec A's letter-copy clause `[R7.4]` is merged.
- **Under another option:** A: Spec A changes `PROFILE_REQUIRED_DOCUMENT_TYPES`, and task 27.4 writes copy that promises letters for every school. B: profile setup in tenant onboarding is new work this spec does not contain; it needs an amendment. A rejection-letter type, if chosen, is new work for Spec A or a new spec.

### D10. Landing audience and claims

- **Question:** Who is the landing page for (E T1–T11, §12.1)?
- **Options:**
  - A: students only; school-buyer content moves to a separate page; numbers appear only when sourced.
  - B: keep both audiences and fix the claims.
  - C: a minimal landing page that links straight to the programme catalogue.
- **Lean:** A. Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Status:** Confirmed 2026-11-08 (option A: the landing page is for students only; school-buyer content moves to a separate page; only sourced numbers appear).
- **Depends on it:** Requirements 12.3–12.5; tasks 33.1, 33.2.
- **Decision-independent:** Requirements 12.1, 12.2, 12.6–12.8; tasks 29.1–29.3. Invented claims are a truthfulness risk under every option.
- **Under another option:** B: task 33.1 keeps the school-buyer sections on the landing with sourced claims only, and task 33.2 is dropped. C: task 33.1 reduces the landing to a hero and the catalogue list, and task 33.2 applies as written.

### D11. Security track (outside both specs)

- **Scope:** key rotation, deleting the remote branches and pull-request refs that still carry the leaked key, repository visibility, removing the signature PNG and letter templates from `apps/admissions/public/`, removing infrastructure identifiers from tracked docs, and moving `besa/` and `open-design/` out of the working tree. All of it is operator-gated and outside both specs (critique §9 D11). This spec writes **no** task for a history rewrite, branch deletion or key rotation.
- **Critique's lean:** rotate the key and remove the public signature and templates now; then delete the remote branches that carry the old commits, ask GitHub about the pull-request refs, and decide on visibility. **Proposed, awaiting user confirmation.**
- **Status:** Outside this spec; an operator track. State on 2026-11-08: the signature PNG and the three letter templates are removed in commit `8f01c30cb` on branch `specs/journey-repair-and-simplification`, pull request #207, and are NOT on `main` and NOT deployed; 7 remote branches were deleted on 2026-11-07; Resend key rotation: in progress per the user (2026-11-07/08), completion not recorded, and updating the production env value afterwards is an operator step; the GitHub Support request about pull-request refs is drafted but not confirmed sent; repository visibility, infrastructure identifiers in tracked docs, and moving `besa/` and `open-design/` out of the working tree are still open. `current application structure.pdf`, MIHAS's paper application form, is kept; removing it is a separate, unconfirmed decision. This spec does not touch any of it.
- **Dependency:** D2 option C (history purge) happens only with this track. Requirement 6.1 records critique §6 row 16 (the runbook's school hosts) as owned by this track.

### D12. Spec structure and overlapping specs

- **Question:** How do the two specs relate to the specs already in flight (critique §9 D12)?
- **Options:** two specs (recommended), one phased spec, or three specs. For the overlaps: absorb, supersede, or keep separate and coordinate.
- **Lean:** two specs. Spec B absorbs and supersedes `student-ui-ux-mobile-remediation` (0 of 65 tasks done). The overlaps with `admin-dashboard-overhaul` (30 open, mostly tests; overlaps Requirement 17), `profile-updates` (12 of 12 required tasks checked, 5 optional open) and `admissions-v2-canonical-rebuild` (2 deferred; overlaps P0_Ops_Check) are recorded only. None of those specs is edited. Proposed in the critique; confirmed 2026-11-08 (see Status).
- **`profile-updates` and finding C-15.** That spec's Settings fix did not hold: C-15 (the Settings "Sex" field never shows the saved value, and "Unsaved changes" never clears) is Confirmed at HEAD (critique §3 S05, §6 row 21). Spec A leaves C-15 to `profile-updates` (Spec A OS-9), and this spec does not fix it, so the defect has no owner (Non-goals). Task 1.1 makes the steering state that fact.
- **Status:** Confirmed 2026-11-08 (two specs; Spec B absorbs and supersedes `student-ui-ux-mobile-remediation`; the overlaps with `admin-dashboard-overhaul`, `profile-updates` and `admissions-v2-canonical-rebuild` are recorded only, and none of those specs is edited).
- **Depends on it:** Requirements 6.3 (exceptions file), 22.10, 22.11; task 20.1.
- **Under another option:** if `student-ui-ux-mobile-remediation` stays live, tasks for Requirements 14–16 and 21 still run, but each first checks that plan's open tasks for the same files, and task 20.1 records coordination instead of supersession. If `admin-dashboard-overhaul` is absorbed, its open tasks become an amendment to this spec.
- **Not in the critique's list:** `student-payment-interview-pages` (17 tasks done; its 6 open tasks are all optional tests of navigation and payment detection, `tasks.md:61-75`; no `.config.kiro`) touches the interview page that Requirement 20.2 changes, but none of its open tasks touches `Interview.tsx`. It is not a D12 spec, so task 3.4 gives it a `.config.kiro` marked completed, because every required task is checked.
- **Edits to specs outside this list:** task 3.4 changes the `.config.kiro` of four specs that are not in D12 (`full-platform-remediation-2026-07`, `beanola-launch-verification`, `communications-history` and `student-payment-interview-pages`). That is critique S6 work on metadata only, and Requirement 22.11 does not cover those four.
- **What absorbing means for that plan's phases:** dashboard information architecture and quick actions map to Requirements 14 and 21; application cards and download actions to Requirements 14 and 20 (viewing itself is Spec A's); the wizard mobile header, progress, bottom-navigation conflict, support panel and form steps to Requirements 15 and 16; visual system clean-up to Requirements 16 and 18; testing to Requirement 19; the draft manager to Requirement 22.5.

### D13. Upload transport (a note, not a task)

- **Question:** Do uploads stay server-proxied, or move to direct-to-R2 presigned uploads or resumable uploads (critique §9 D13)?
- **Options:** A: keep server-proxied uploads and fix them (Spec A R2). B: direct-to-R2 presigned PUT with server verification. C: resumable or chunked uploads.
- **Lean:** A for P0; move to B or C only if field data after P0 demands it. Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Status:** Confirmed 2026-11-08 (option A: server-proxied uploads; revisit only with field data). For P0 it was already fixed by Spec A as DEC-4 in its "Decisions already made" table.
- **Effect on this spec:** none. This spec has no task for it, and Non-goals exclude direct-to-R2 and resumable uploads.

### D14. Which production host P0 verifies against

- **Options:** A: bring the EC2 stack back for verification. B: wait for the new host.
- **Lean:** none in the critique; it is your call.
- **Status:** Confirmed 2026-11-08 (option B: wait for the new production host; do not restore the EC2 stack). P0 is gated in CI meanwhile. Spec A task 6 and Spec B task 6.8 stay blocked until a live production host exists, and so do tasks 16.1 and 16.2 (D7's P0_Ops_Check needs the same host). Nothing in either spec restores the EC2 stack.
- **Depends on it:** Requirement 7.2's comparison with the production manifest; task 6.8. Also D7's prerequisite: the P0_Ops_Check needs a reachable production host, and Requirement 5.5 keeps production values "Unverified" until it runs.
- **Effect on this spec:** Spec B starts on the Journey_Gate in CI, not on a production run. Task 6.1 lands the Neon baseline with "production parity: Unverified" in its header, and Requirement 7.2 stays open until task 6.8 runs. Critique §6 row 17 (which host production is) is recorded as owned by this decision (Requirement 6.1).
- **Spec A's default (Spec A DEC-7, task 6):** production verification is Spec A's last task, "Blocked until a live production host exists (D14)". Its task 6.2 also ends Spec A's pause on automatic deploys, so until a live production host exists and that task runs, a merge of this spec reaches production only in a Deploy run an operator approves (Requirement 22.7; Dependencies item 7).

### D15 (added by this spec). Removals the critique did not number

- **Question:** May these tracked items be removed? The critique gives each a "cut" verdict without marking it as needing a decision (§4 rows 10, 16–19, 22, 23, 25; §8.3 S2 and S9), and Spec A hands item (i) to this spec (DEC-1). This spec gates them anyway, because every removal waits for confirmation. Each item can be confirmed or refused on its own.
  - (a) the dev-only frontend `@react-pdf` stack: 24 code files, 3,641 lines, its fonts and PNGs, 12 test files, and the `check-pdf-chunk-load.mjs` CI step;
  - (b) the `/api/v1/applications/draft/` compatibility endpoint and the uncalled `applicationService.saveDraft`; the model and table stay until a production row count;
  - (c) the 54-line `backend/apps/applications/views.py` shim, after repointing about 10 test imports and 20 patch targets;
  - (d) frontend modules with no product importer (22 files and 2,853 lines by the critique's heuristic, Likely; the importer check in task 3.2 replaces the heuristic);
  - (e) the 9-line placeholder apps `apps/website/` and `apps/student-portal/`;
  - (f) the agent hub: `scripts/agenthub/` (1,207 lines), `.agenthub/` and their tests;
  - (g) the stray root files `=== schema hash (sha256 of regenerated OpenAPI) ===` and `⚠️`, and the untracked empty directories `=== candidate commit ===/` and `echo/`;
  - (h) `keep_alive_task`, which pings production every 4 minutes "to prevent Koyeb cold starts" although production is not on Koyeb;
  - (i) the unused frontend upload paths that Spec A freezes in its single-path guard and leaves to this spec (Spec A DEC-1, OS-5): `documentService.upload`, `useWizardFileUploads`, the `startUpload` branch of `useApplicationFileUploads` with `uploadApplicationFile` and `downloadFile` in `lib/storage.ts`, and `lib/applicationSlipStorage.ts` with `lib/slipService.ts` (sites in Requirement 2.8 (i)). Spec A's guard stays; its frozen list shrinks as each path goes.
- **Options per item:** remove, or keep and add it to the relevant allowlist with a reason.
- **Lean:** remove each item (critique §4 verdicts; for (i), Spec A DEC-1). Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Status:** Confirmed 2026-11-08 (remove items (a) to (i), the lean). Each item keeps its own task, and a removal that finds a live caller stops and reports it.
- **Depends on it:** Requirements 2.8, 2.9, 4.8, 9.3; tasks 14.1–14.9.
- **Under "keep":** the item gets an allowlist entry with a reason in the relevant check (task 3.1, 3.2 or 3.3), or stays in Spec A's frozen list for (i), and its task is dropped.

### D16 (added by this spec). Student navigation size

- **Question:** How many top-level destinations should student navigation have? It has nine in the route registry today, for a one-application journey (E §3d, §12 #10).
- **Options:**
  - A: three, "My application", "Messages" and "Account" (the critique's proposal).
  - B: five, "Home", "Application", "Payment", "Messages" and "Account".
  - C: keep nine; fix desktop and mobile parity and the truncated labels only.
- **Lean:** A (critique §8.3 V10). Proposed in the critique; confirmed 2026-11-08 (see Status).
- **Status:** Confirmed 2026-11-08 (option A: three destinations, "My application", "Messages" and "Account").
- **Depends on it:** Requirement 21.3; task 34.1.
- **Decision-independent:** Requirements 21.1, 21.2, 21.4–21.6; tasks 31.1–31.3.
- **Under another option:** B: task 34.1 builds the five-item version. C: task 34.1 is dropped.

### D17 (added by this spec). Links inside running text and the 44 px rule

- **Question:** How does a link inside a sentence meet the 44 × 44 px hit-area rule? The steering's rule has no inline exception (`.kiro/steering/design-skills.md`, `.agents/AGENTS.md` §2), Requirement 19.7 measures such a link like any other control, and Requirement 19.9 lets no hit-area entry stay in the baseline at P2 exit. Today the sign-up consent sentence's "Terms" and "Privacy Policy" links (`apps/admissions/src/pages/auth/SignUpPage.tsx:336,338`) sit in 12 px running text (`text-xs`, `:334`) and reach 44 px only if the sentence's layout changes. WCAG's own target-size criteria exempt inline targets (2.5.8 at AA, 2.5.5 at AAA).
- **Options:**
  - A: pad each such link to a 44 px hit area, accepting taller lines or hit areas that overlap the lines around it;
  - B: move each such link out of running text into a standalone link or button that meets the rule, for example a row of links below the sentence;
  - C: amend the steering's 44 px rule to exempt links inside running text, as WCAG does; the classifier then skips them.
- **Recommendation (added 2026-11-08; not a confirmation):** keep the guardrail and fix the link instead, that is option A or B, not C. Option C amends four places that state the 44 px rule (`.kiro/steering/design-skills.md`, `.agents/AGENTS.md` §2, `PRODUCT.md:97` and `DESIGN.md:198`; `design-skills.md` says its guardrails duplicate `PRODUCT.md`), so it is the costliest way to settle a link in a sentence.
- **Lean:** none. The critique does not raise this, and each option changes either a sentence students read (A, B) or a hard guardrail (C), so it is your call.
- **Status:** Awaiting confirmation.
- **Depends on it:** task 24.8 (Requirements 16.10, 19.7 and 19.9, for links inside running text).
- **Decision-independent:** task 24.6 fixes every other hit-area finding on the Audited_Page_Set. Until D17 is confirmed, the entries for links inside running text stay in the rendered-design baseline with decision D17.
- **Under each option:** A or B: task 24.8 changes the links and deletes their entries. C: task 24.8 first amends all four places that state the rule (`design-skills.md`, `.agents/AGENTS.md` §2, `PRODUCT.md:97`, `DESIGN.md:198`), then makes the classifier and Property 11 skip a link inside running text (design §12.7), and deletes those entries. Spec A is not edited under any option.

## Dependencies and sequencing

1. **Start condition.** P1 starts when Spec A's Journey_Gate is green and blocking in CI on main (task 2). P2 follows the phasing in critique §8.4.
2. **Early-start exception.** Tasks 1.1 and 1.2 may start before the Journey_Gate is green. Both are doc-only truthfulness fixes:
   - They change no runtime code.
   - They touch only text that Spec A does not change. Spec A owns `LOCAL-TESTING.md`, `docs/runbooks/local-parity.md`, `DESIGN.md` §4, and the steering rows for storage, sessions, auto-save and `seed_school_admins`.
   - The steering they correct is loaded into every agent task, including Spec A's, so false claims there misdirect P0 work while it runs.

   Task 1.3 may also start at once, for a different reason. It changes one default in `harness/bin/harness` and adds a unit test, and changes no product code. Without it, the harness's error reporter logs a console error on a page's first interaction, which fails every harness run that clicks, scrolls or waits 15 s, Spec A's smoke baseline and Journey_Gate included (Requirement 1.12; Likely from code, not run).
3. **Phase order.** P1's decision-independent tasks (3–9, except task 6.8) come before its gated tasks (6.8 and 11–20). Task 6.8 sits with the other test-database tasks but waits for a live production host (D14, option B). P2's decision-independent tasks (22–31, except tasks 24.8 and 27.4) start once P1's checkpoint at task 10 is green; they do not wait for P1's gated tasks, because no V requirement depends on a P1 decision except D1 (Requirement 13.3, handled in task 12.2) and D9, D10, D16 and D17 (handled in P2's own gated tasks 27.4, 33, 34 and 24.8). Gated tasks of either phase start when their decision is Confirmed and their further prerequisites are met, in phase order.
4. **Exit criteria** (critique §8.4).
   - P1 exits when the Documented_Local_Stack passes the Journey_Gate, the routes-versus-callers and steering-path checks are green, the test database is built from the SQL scripts, and `-n 6` is green (task 21). Requirement 7.2's production comparison stays open until a live production host allows task 6.8, and the P1 checkpoint lists it.
   - P2 exits when the Rendered_Design_Gate and axe are green on built pages, the baseline holds no hard-guardrail entry (Requirement 19.9), and a named person has signed off the visual review (tasks 35 and 36).
   - A gated task whose decision or further prerequisite is still open when its phase otherwise exits stays open and is listed in the phase's checkpoint.
5. **Dependencies on Spec A.** Spec A tags its clauses with the critique's numbers, for example `[R7.2]`.
   - Requirement 14.1–14.2 need Spec A's single Readiness (critique §8.2 R6.2).
   - Requirement 20.3 needs Spec A's session fix (R8.1).
   - Requirement 20.6 needs Spec A's letter copy (R7.4); task 27.4 starts only after `[R7.4]` is merged.
   - Requirement 21.1 needs Spec A's documents navigation (R5.3).
   - Requirement 17.7 needs Spec A's decision fixes (R7). Spec A's P0b, which holds R7, starts only once Spec A's journey gate is green, which is also when this spec starts, so tasks 30.2–30.4 start only after Spec A's `[R7.2]` and `[R7.3]` clauses (the Approve gate and the conditions dialog in `ApplicationApprovalActions.tsx`) are merged, and each records that commit.
   - Requirement 1.4 needs Spec A's seed (R1.4).
   - Requirement 13.2 needs Spec A's badge fix.
   - Requirement 2.8 (i) needs Spec A's single-path upload guard (R2.6).
   - Spec A runs into the corrupted DSN of Requirement 1.12 before this spec starts: its smoke baseline (Spec A task 2.5) and its Journey_Gate use the same harness fixtures and console gate, and Spec A does not mention the value. That is why task 1.3 may start at once. If Spec A's harness work restores a parseable DSN first, task 1.3 adds only the unit test.
   - Task 11.1 changes the bring-up inside Spec A's `harness journey-gate` command (Spec A design R9-a; Spec A task 4.1). It starts only after Spec A's R9 tasks are merged, and confirming D2 confirms the change (Decision Register D2).
6. **Operator dependencies.** The P0_Ops_Check (critique §8.4) comes before D7's tasks. The Neon branch and the production read-only manifest for Requirement 7.2 are operator-assisted steps. D11 stays with the operator.
7. **Deploys (Spec A DEC-10).** `.github/workflows/deploy.yml` builds the backend and frontend images and rolls production after every green CI run on `main` (`:6-11`, `:24`), and the frontend image carries both the admissions and the jobs-ops builds (`apps/admissions/Dockerfile:50-61`). So a merge is a deploy unless something stops it. Spec A's deploy gate is the only thing that does, and this spec adds no second one and does not edit the workflow (Requirement 22.7).
   - Spec A pauses automatic deploys in its task 2.6, before its task 3.2, and the pause covers all of this spec's work (Spec A DEC-10, decided with the user on 2026-11-07/08). Its preferred form is a GitHub `production` environment with required reviewers on both Deploy jobs; its fallback is the workflow disabled. The preferred form holds only while the repository is public on the GitHub Free, Pro and Team plans (Spec A task 2.6), so the pause can lapse if the D11 track changes visibility.
   - This spec starts after Spec A's Journey_Gate is green (item 1), which Spec A builds after its pause, so the pause is in force when this spec's first production-affecting change merges. While it holds, such a change reaches production only in a Deploy run an operator approves. Spec A approves no run before its task 6.1's checks and backup, and an approved run ships everything merged on `main` (Spec A task 2.6, EC-22), so this spec's merged work usually first reaches production in Spec A's approved deploy in its task 6.2.
   - Spec A's task 6, which holds 6.2, is blocked until a live production host exists (D14), so the pause lasts at least until that host exists.
   - Once Spec A's task 6.2 has re-enabled automatic deploys, a merge of this spec's work deploys through the normal automatic path, so a task with a production precondition confirms it before it merges.
   - Every task that changes what production serves carries a Deploy path line in `tasks.md`, and records in the evidence summary the path in force when it merged, its production effect and its rollback. The operator reads those entries before approving a Deploy run during the pause.
   - A production-affecting merge during the pause first repeats Spec A task 2.6's confirmation that the pause still holds, and the task's evidence summary records that it did. The operator who approves Spec A task 6.2 reads this spec's Deploy path entries first, because Spec A task 6.1's checklist does not mention them (task 2 records the pointer).
   - Tasks 1.1–1.3 may merge before Spec A's pause starts. They change nothing production serves (steering, a runbook, a harness default and a unit test), so a Deploy run that includes them serves what production serves today.

## Non-goals

- **Payments.** No new payment provider, no change to the payment state machine or webhook deduplication, no new payment flag (critique §8.5).
- **AI and OCR.** No generative AI in admissions. OCR, if kept, stays assistive. No PDF OCR in this spec.
- **Tenant isolation.** No weakening of it, no change to scope-before-lookup, and no removal of cross-tenant tests.
- **Production and git.** No production database write or deploy inside a task, except operator-gated additive scripts proven on Neon. No edit to `.github/workflows/deploy.yml` and no second deploy gate: merges reach production through Spec A's deploy gate (Dependencies item 7). No git history rewrite, branch deletion or key rotation; those belong to D11.
- **Features not being added.** No email verification, SMS provider, accommodation booking or rejection letter unless the Decision_Register decides otherwise. No change-request UI (D5 option A needs a new spec).
- **Upload protocol.** No direct-to-R2 or resumable uploads (D13).
- **Design system.** No new brand palette, colour token, font family or design system. A different student body face (E §12 #5; ui-ux-pro-max suggests Atkinson Hyperlegible) is out of scope, because it adds a token, changes the Inter chain rule in the tech steering, and the Google Fonts import it suggests breaks `DESIGN.md`'s "no external font CDN" rule.
- **Jobs-ops.** No new jobs-ops features under any D1 option.
- **Code health.** No campaign on the 3,239 code smells or the F-graded files beyond what the requirements touch. Consolidating the retired-payment-flag guards (critique §4 row 11) and merging the daily beat entries (row 19) are not included.
- **Spec A's scope.** Uploads, viewing, rate limits, submit, sessions, decisions and the runtime badge are Spec A's, and this spec does not reimplement them.
- **Settings API authority.** The generic admin settings endpoints let any `admin` role read every setting, and gate writes on the super-admin role string rather than on `platform.settings.manage` through `AdminCapabilityService`. Changing the reads removes tenant-admin access, which needs its own decision, so task 1.1 records both points as a known issue and this spec only keeps the OCR opt-in key out of those endpoints (Requirement 11.4).
- **The Settings defect C-15.** The Settings "Sex" field never shows the saved value, and "Unsaved changes" never clears after a save (critique §3 S05, Confirmed at HEAD). `profile-updates` has all its required tasks checked, Spec A's OS-9 leaves C-15 to that spec, and this spec does not fix it, because the fix changes what students see on the settings page and the critique gave it to neither spec. It is an open defect with no owner. A bugfix belongs most naturally in Spec A, and that is your call. Task 1.1 makes the steering state the current fact (critique §6 row 21).
- **The dashboard's "Residence" fact.** It shows the profile's address (`apps/admissions/src/components/student/dashboard/ApplicationsGrid.tsx:205-209`), while the wizard stores the application's `residence_town` (critique §5.4). Which value it should show is a follow-up; Requirement 14.6 still applies to its "Not provided" placeholder.
