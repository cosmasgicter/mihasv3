# Task 13.6 remediation — M11: review of the out-of-batch session

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec `.kiro/specs/admissions-v2-canonical-rebuild/` · reviews the edits made outside
the planned batches on **2026-08-15 22:04 → 2026-08-16 00:49** (129 paths by mtime,
including caches and reports; self-reported as `remediation/M9/`) and on **2026-08-25** (16 source/spec files;
reports only, under `remediation/M10/raw/`, no README). Measured **2026-10-05** against
`main` @ `bae29a28d` plus the dirty tree. **Read-only**: nothing outside this directory
was written, nothing staged or committed, production and Neon were not contacted, the
harness was not started.

| # | Question | Verdict | One-line reason | Citation |
|---|---|---|---|---|
| 1 | Offering/application `AccessGrant`s | **REGRESSION** | They now confer capabilities keyed per offering/application (never institution-wide), and all five aggregate surfaces still 404 a narrow grantee — but **export** is authorized if *any* grain holds it and then applied to the whole scoped set: one application-scoped export grant plus a read-only membership exports the whole school (2 rows; control 403) | `catalog/services.py:1199-1215`, `admin_query_views.py:107-114`, `admin_export_views.py:165`; [raw/30](raw/30-probe-run.txt) |
| 2 | Authorization caching | **REGRESSION** (flag-gated) | `get_capabilities` now serves **every** authorization decision from a 60 s cache when `PERF_CACHE_CAPABILITIES` is on. ORM saves invalidate; wall-clock grant expiry, the canonical tenant-deactivation command and staff-invitation revoke do **not** — an expired grant still created a staff invitation (**201**) until the cache was cleared (**403**) | `services.py:1032-1062`, `canonical_config_commands.py:151-155`, `staff_invitation_service.py:463-467`, `accounts/signals.py:150-174`; [raw/30](raw/30-probe-run.txt) |
| 3 | The two rollback scripts | **NEEDS-RATIFICATION** | Both now only delete their own `migration_history` row — no data is restored, and the next boot sweep re-applies the forward script — and the 7.1/7.3 rollback tests were inverted to match. R9.2 and the lint test are unchanged. No Neon rehearsal (incl. `v2_snap_13_6`) ever ran either version | both `*_rollback.sql`; M3 [raw/50](../M3/raw/50-cluster-I-rollback-lint.txt); `7.1/README.md:192-205`; `7.3/README.md:185` |
| 4 | `PRIVILEGE_ESCALATION` vs `INSUFFICIENT_PRIVILEGES` | **NEEDS-RATIFICATION** | `PRIVILEGE_ESCALATION` now emits for the role ceiling on create, PATCH and bulk, consistently; 9.3's pins at `:523` and `:1127` were rewritten; `:538` pins a *different* refusal and correctly keeps `INSUFFICIENT_PRIVILEGES`. Settles the two-spec contract M8 §4.3 left open | `user_directory_views.py:479-487, 699-706`, `user_bulk_service.py:192-198`, `test_user_directory_9_3.py:523/538/1127` |
| 5 | Tenant directory | **SOUND** | Tenant_Admin now gets 403, as 2.1's approved matrix requires; the console reads its schools from `/admin/capabilities/`+`/admin/scope/` and the profile from `/admin/institutions/{id}/`, which scopes before lookup (other tenant's 404 has the same body as an unknown id's). 39 of 2.2's 40 listed non-conformances remain; 137 today vs 135 | `admin_tenant_views.py:39-60, 99-110`, `TenantAdminSchoolConsole.tsx:57-83`; [raw/30](raw/30-probe-run.txt), [raw/41](raw/41-authority-conformance-vs-2.2.txt) |
| 6 | `scripts/authority_matrix_registry.py` | **SOUND** | 2.2's conformance suite measures the **frozen** 2.1 case matrix, not this registry, so a registry edit cannot hide behaviour from it; the one identifiable session edit documents the canonical draft contract; the regenerated matrix passes the zero-unclassified gate | `test_authority_matrix_generated.py:64-79`, registry `:594`; [raw/40](raw/40-authority-matrix-diff-vs-2.1.txt) |
| 7 | `.github/workflows/ci.yml` | **SOUND** | The session's only edit removed `continue-on-error` from Bundle_Guard, making it **blocking**, as its own comment prescribed once the budgets passed; no gate removed, relaxed or made conditional | `ci.yml:367-372`; `0.2/summary.md:126` |
| 8 | OpenAPI cleanup | **NEEDS-RATIFICATION** | 116 / 3 / 23 → 0 is **real annotation** (field-bearing serializers, `/api/v2/` tag prefixes; no `exclude=True`, hook or silencing; the spectacular tests only gained a test). But `api_quality.sh` was redefined: today's schema **fails the old raw-count gate (1159 > 883)** and passes the new density gate only with the relaxed 3xx linter rule (0.4353; HEAD's linter gives 0.4392 > 0.4388) | `api_quality.sh:86-168`, `api_linter.py:472-492`, `REMEDIATION_TARGETS.md:15`; [raw/50](raw/50-api-quality-metrics.txt) |
| 9 | View classification | **SOUND** | All 38 buckets match M9 raw/07's live authentication strategy (34 inherited-JWT → protected, 1 declared-`[]` token handoff → exempt, 3 unmounted bases → a new exclusion with a not-mounted guard); the 3 new `AllowAny` entries are justified. `AdminTenantListCreateView` was never among the 38 | `test_view_auth_classification.py:206, 576-580, 634`; `public_endpoint_policy.py:40, 64, 67`; M8 [raw/20](../M8/raw/20-after-backend-whole-tree.txt) |
| 10 | Canonical draft write | **SOUND** | The wizard's only answer writer sends `Idempotency-Key` + an `expected_version` read at execution time; the generic PUT survives only on an admin feedback path (still allowed) and an unused hook; harness writers send both; scripts never PUT/PATCH; offline saves are local-only and reconnect issues a fresh command with the current version | `services/applications.ts:416-451`, `useWizardDraftPersistence.ts:662-770`, `student_draft_views.py:247-273`; [raw/30](raw/30-probe-run.txt) |
| 11 | Spec edits | **NEEDS-RATIFICATION** | Each `[x]`→`[-]` is supported by that task's own README, but recording state is the closure pass's job; five GATE rows went open → fixed, and GATE-13.2-03's "fixed" rests on chromium-only F3 runs that M10's mobile run and the strengthened spec do not reproduce | `tasks.md:353, 638, 657`; `findings.md:229-230, 254-255, 303`; 13.6 README §15.2 |
| 12 | Aug 25 changes | **REGRESSION** | M7 was settled without the owning specs: 30 register entries got owners (one of the two names exists nowhere in the repo) and a 2027-02-07 date, three guards will fail on that date regardless of code, and the audit's gap report went silent. The wizard edits leave the 12.5 register audit **red** (2 unregistered). Unit autosave tests pass; **no browser run of the final build passed** (M10: full run 332 pass / 8 fail / 0 skip on two projects, then six F3 re-runs, all red) | `legacy-brand-allowlist.json`, `test_brand_drift_guard.py:110-116`, `test_canonical_tenant_drift_guard.py:118-136`; [raw/51](raw/51-register-audit-v1_surface_telemetry.txt), [raw/60](raw/60-m10-playwright-summary.txt) |

**Verdict: NEEDS_CHANGES** — three regressions (Q1, Q2, Q12), four decisions to ratify
(Q3, Q4, Q8, Q11) plus the model choices behind Q1, Q2 and Q12, five areas sound
(Q5, Q6, Q7, Q9, Q10).

---

## Needs the user's ratification

Written to be shown to the user as-is.

1. **Two "undo" scripts no longer undo anything (Q3).** The rollback scripts for the
   subject-catalogue clean-up (task 7.1) and the document "current version" fix (task
   7.3) used to put the old data back. They now only erase the note that the fix ran,
   so the next server start simply runs the fix again; going back now means restoring
   the database from a backup. The original authors kept the faithful undo on purpose
   and asked you whether the rollback rule (R9.2) should allow it. Neither version has
   ever been tried on a Neon copy. *Who must agree:* you, with the 7.1 and 7.3 owners
   and the owner of R9.2 (`_archived/production-schema-reconciliation`).
2. **One error code for "you can't give someone a higher role than yours" (Q4).** All
   three places now answer `PRIVILEGE_ESCALATION`, whose catalogue message is exactly
   that sentence; two of task 9.3's tests were edited to expect it. It is the sensible
   choice, but it picks between two specs. *Who must agree:* the error-catalogue owner
   (R14.1), `enterprise-tenant-authority` (Property 7), and task 9.3's owner.
3. **What the API-quality check in CI measures (Q8).** It used to fail when the API
   linter found more problems than the saved baseline. It now compares problems *per
   endpoint*, ignores naming notices, and the linter now counts redirects as a success.
   Today's API fails the old check (1159 vs 883) and passes the new one by a hair —
   and would fail it too without the linter change. The written "< 230 issues" target
   was deleted. *Who must agree:* the API-schema lane.
4. **Task checkboxes and finding states (Q11).** Tasks 6.3, 12.3 and 12.5 were moved
   back to "in progress" — each task's own report supports that — and five findings
   were marked fixed. Recording these is the closure pass's job, so it needs your
   sign-off. One deserves a hold: GATE-13.2-03 (a stale tab overwriting another
   device's newer answer) is marked fixed on desktop-browser evidence only; the mobile
   run failed. *Who must agree:* you, as the 13.6 closure pass.
5. **Owners and end dates on two other teams' exception lists (Q12, item M7).** 30
   exemptions now carry an owner and a removal date of 7 February 2027. Task 12.5
   refused to do this because those teams never agreed to a date; one of the two owner
   names ("platform-tenancy") is not a spec or lane anywhere in the repo; 10 of the 19
   brand entries say "cannot be removed" yet now expire; and on that date three CI
   checks will start failing. *Who must agree:* the owners of `beanola-launch-verification`,
   `multi-tenant-beanola` and `system-alignment-audit`.
6. **Narrow access grants now work (behind regression 1).** Staff given access to one
   programme or one application now really get it, for exactly that programme or
   application. Earlier batches said this permission-model change needs the authority
   owners' approval, and the approved case matrix (task 2.1) has no such person in it.
   *Who must agree:* you, with the authority lane and `enterprise-tenant-authority`;
   the 2.1 matrix needs these actor types added. Fix regression 1 first.
7. **Whether permission checks may be cached at all (behind regression 2).** With a
   performance switch on (off by default, planned to be turned on), the platform
   remembers each person's permissions for up to 60 seconds. The performance
   requirement only asked for that on the two "what can I do" screens; what was built
   applies it to every permission check. *Who must agree:* you, with the
   `system-performance-hardening` (R5) and authority owners.

## Regressions to fix

1. **Q1 — the export permission crosses grains.** `_may_export` and
   `ApplicationExportView` accept `tenant.application.export` held at *any* grain
   (`has_any_application_capability`, `services.py:1199-1215`) and then export the whole
   scoped queryset. **Fix:** authorize export per row grain — restrict the exported
   rows to those whose institution, offering or application grain holds the export
   capability (or refuse when the scoped set contains rows outside it) — in
   `admin_query_views.py:107-114` and through the same helper for
   `admin_export_views.py:165`; add mixed-actor tests (read-only membership + narrow
   export grant) beside `raw/probes/test_m11_probes.py::TestQ1ExportGrain`.
2. **Q2 — cached authority goes stale.** **Fix**, with the owners in ratification item
   7: either return caching to the two endpoints' payloads (R5.1's actual scope) and
   leave `get_capabilities` uncached — the four `test_perf_capability_invalidation`
   "zero queries" assertions then need the perf lane to re-scope them — or keep it and
   (a) cap each entry's TTL at the earliest `expires_at` among the actor's active grants,
   (b) invalidate explicitly on the three `.update()` paths
   (`staff_invitation_service.py:352-354` and `:463-467`, `canonical_config_commands.py:153-155`
   — resolve the affected users *before* deactivating their memberships), and
   (c) add tests for expiry, revoke and the canonical deactivation command.
3. **Q12 — calendar time-bombs and a silenced gap report.** **Fix:** remove the
   date assertions (`test_brand_drift_guard.py:110-116`,
   `test_canonical_tenant_drift_guard.py:368`, `brandDriftGuard.test.ts:120-132`) and the
   invented owner/date values until the owning specs supply real ones; keep the
   staleness checks, which are the part that bites. `v1_surface_telemetry.py` then
   reports GATE-13.6-01's two-register gap again, matching `findings.md`.
4. **Q12 — the 12.5 register audit is red again.** Two `typeof draft.payment_status
   === "string"` lines (`useWizardDraftPersistence.ts:287, 399`) match the
   stale-status-alias pattern and no rule claims them: UNREGISTERED **0 → 2**, HALF 5
   **PASS → FAIL** — task 12.5's own Required_Evidence and 13.6 clause (iv) no longer
   reproduce. **Fix:** read the value through a named binding or `normalizePaymentStatus`,
   or add a classifier rule for `typeof` guards; re-run the audit.
5. **Q12 — verification debt, not a proven regression.** The final wizard build has
   no passing browser run: both runs against it failed before the wizard action bar
   rendered, and two earlier runs showed merely opening the wizard advancing the draft
   version 1 → 3. F1/F2 never ran on it. **Fix:** on a fresh harness, run F1, F2 and F3
   on both required projects before anyone says auto-save is intact.

## What is NOT claimed

1. **The session's full diff.** The V2 tree is uncommitted and most changed files are
   untracked, so there is no pre-session copy. Prior states are quoted only from M3
   raw/50, M8, M9 raw/07, 9.2 raw and the 13.1 junit (old test names), the 7.1/7.3
   READMEs, task 0.2's record of `ci.yml`, and `HEAD` for tracked files.
2. **The backend whole tree.** Not re-run; M9's 5425 passed / 104 skipped is not
   re-verified. This review ran 310 + 63 focused backend tests, 28 probes plus the
   conformance dump, 2.2's own suite, and 113 frontend tests, all green ([raw/31](raw/31-focused-backend-suites.txt),
   [raw/33](raw/33-capacity-and-governance.txt), [raw/32](raw/32-frontend-focused.txt)).
3. **Any browser behaviour.** The harness was not started. Every Playwright statement
   comes from M10's recorded reports.
4. **Production.** Not contacted; whether `PERF_CACHE_CAPABILITIES` is on there is
   unknown (no tracked deploy file sets it; the readiness runbook plans to).
5. **Attribution of 2.2's 135 → 137.** 2.2 never wrote its full list, so the +2 cannot
   be split between this session and other tasks; only the tenant-directory case is
   attributable (closed).
6. **Why "wizard-action-bar not found"** happened in M10's last runs — code or harness
   state — and **which window** added the two unregistered audit hits (the file was
   edited in both).
7. **The frontend brand guard's 2027 failure** is shown by reading
   `brandDriftGuard.test.ts:130-132`; the two backend guards were proven by probe.
8. **The schema SHA.** Today's regenerated schema (`93442a6b…`) differs from the
   committed candidate (`2c6a7ddd…`); 13.1 records the generator as environment-dependent
   and this was not investigated.
9. **Two corrections to earlier batches**, both factual: M8 §5 says
   `AdminTenantListCreateView` was one of the 38 unclassified views — M8's own raw/20
   lists the 38 and it is not among them; M8 §4.3 counts `test_user_directory_9_3.py:538`
   as the same refusal — it pins *"modify a user with a higher role"*.

---

<details>
<summary>Details, question by question</summary>

### Q1 — narrow grants: per-grain maps hold, the export check does not

`CapabilitySet` now carries `offering_capabilities` and `application_capabilities`
beside `institution_capabilities` (`services.py:909-929`), filled by
`_derive_scoped_capabilities` (`:1229`): each target gets the read-default bundle plus
mutations from the row that addresses *that* target, and "a narrow grant is
deliberately never copied into the institution map". `filters_for_user` now honours
`scope_type` (`:820-844`), where `HEAD` widened any grant with a populated
`institution_id` (`HEAD:services.py:768`); the `chk_access_grants_scope_target` CHECK
(`2026_07_17_01_integrity_constraints_expand.sql:107-111`) means no valid row loses
access.

`authorize_tenant_surface` counts the narrow maps only when a view opts in with
`allow_target_scope` (`tenant_authorization.py:270-279`). Four views opt in, and all
row-filter through `AccessScopeService` first: the admin query and its two saved-filter
views (`admin_query_views.py:174, 394, 561`) and `ApplicationExportView`
(`admin_export_views.py:165`); `ApplicationListCreateView` and the interview list do
the same via `has_any_application_capability` (`admin_review_views.py:150`,
`interview_views.py:89`). **M8 §4.1's predicted leak does not occur**: dashboard,
settlement, fees, audit-log feed and staff directory all 404 an offering-only and an
application-only actor, as does the institution audit feed; the admin query returns only
the granted offering's row; the granted application's own detail now opens (M8's 403 is
gone) — 15 probes, [raw/30](raw/30-probe-run.txt).

**The regression is the export capability.** `_may_export` (`admin_query_views.py:107-114`)
asks whether *any* grain holds `tenant.application.export`; the export then writes the
whole scoped set. A read-only membership plus an application-scoped `export` grant
exported **both** of the school's applications; the same actor without the grant got
403 (`TestQ1ExportGrain`, three probes). Before the session, narrow grants produced no
capabilities, so this actor was refused. The settlement and fee reports' own
`_may_export` still check institution grain only (`payment_query_views.py:264-276`,
`fee_admin_views.py:419-431`).

Residual, not a widening: `resolve_scoped_payment` / `resolve_scoped_document` still
require institution-grain capability (`tenant_authorization.py:355-358, 415-418`), so a
narrow grantee is likely refused its own application's payment and document reads —
confirmed by reading, not exercised.

### Q2 — every authorization decision is now cached

M3 §2.7 left the four `test_perf_capability_invalidation` failures open because "caching
an authorization decision … is a design decision for the perf + authority lanes". They
pass now ([raw/31](raw/31-focused-backend-suites.txt)) because `get_capabilities` itself
is cached (`services.py:1032-1062`, `ttl=60`, sub-key `capability-set`) — the single
derivation path behind `require_capability`, `require_institution_capability`,
`authorize_tenant_surface`, `get_application_capabilities` and `can_invite_staff`. The
perf requirement only asks for this on the Scope and Capabilities endpoints
(`_archived/system-performance-hardening/requirements.md`, R5.1). The flag is off by
default (`config/settings/base.py:770-772`) and the readiness runbook plans to turn it
on first (`docs/runbooks/end-to-end-production-readiness-finalization.md:279`).

| authority change | invalidated? | evidence |
|---|---|---|
| role (`Profile.save`) | yes | `signals.py:74-100`; perf test |
| membership / grant create, update, delete via the ORM | yes | `signals.py:106-119`; perf tests; probe control |
| institution activate/deactivate via `Institution.save()` | yes | `signals.py:136-174`; perf test |
| **tenant deactivation via the canonical command** (`apply_institution_profile_change`, the path `AdminTenantDetailView.patch` uses) | **no** | memberships are deactivated with `.update()` (`canonical_config_commands.py:153-155`) before the on-commit resolver reads *active* memberships (`signals.py:164-167`) and finds nobody; probe |
| **staff-invitation revoke** | **no** | `.update(is_active=False)`, no signal (`staff_invitation_service.py:463-467`); probe |
| staff-invitation accept | no (late grant, not a leak) | `.update(is_active=True)` (`:352-354`) |
| **wall-clock grant expiry** | **no** — bounded only by the 60 s TTL | probe |
| membership expiry | n/a — memberships have no `expires_at` (`catalog/models.py:552-566`) | |

Row filters (`filters_for_user`) stay uncached, so lists and object lookups mostly return
nothing or 404 after a revocation; **capability-only decisions stay stale**. The probe
shows the worst case: after the grant expired, `POST /api/v1/admin/staff/invitations/`
returned **201** — `can_invite_staff` reads only cached capabilities
(`staff_invitation_views.py:217`, `services.py:1469-1493`) — and **403** once the cache
was cleared.

### Q3 — the rollbacks now restore nothing

Before, per M3 raw/50: 7.1's rollback ran `UPDATE subjects SET is_active = true WHERE
code IN ('ADD_MATH','MUS','PHYS') …`; 7.3's restored task 3.5's slot rule with a CTE.
Both authors chose the faithful inverse deliberately — 7.1 raised the R9.2 question
"rather than … ship a rollback that silently does nothing" (`7.1/README.md:192-205`);
7.3 "says plainly that running it re-creates the defect" (`7.3/README.md:185`). M3 §6
listed "rewriting two other lanes' scripts to abandon the restore" as one of the two
closures needing input.

Now both files are `BEGIN; DELETE FROM migration_history WHERE migration_name = '<forward>'; COMMIT;`
with a comment explaining why the data stays corrected. The argument is reasonable —
the restore would reinstate a known defect — but the boot sweep runs
`apply_sql_migrations` on every start, so this "rollback" is erased by the next boot.
The owning tests were inverted: 7.1's `test_the_rollback_reactivates_the_retired_duplicates`
(name in `9.2/raw`, `13.1/raw/backend-full-junit.xml`) became
`test_the_rollback_preserves_the_duplicate_identity_correction`
(`test_subject_catalog_migration_7_1.py:248-254`); 7.3's
`test_the_rollback_states_that_it_restores_the_defect` became
`test_the_rollback_preserves_corrected_document_state` (`test_document_evidence_versions_7_3.py:166-171`).

R9.2 lives in `_archived/production-schema-reconciliation/requirements.md` (mtime
2026-05-24, untouched); `test_rollback_safe_operations.py`'s mtime is M3's
(2026-08-15 12:15), outside the window; both lint tests pass. No transcript shows
either version executed on any Neon database: L2-L3 raw/13 and M1-M2 raw/25 rehearse
only their own ledger-only rollbacks; 13.4's C5 exercised a different script. That C5
run is also the precedent: 13.4 converted a data-restoring rollback to a ledger-only one
because the shipped `UPDATE` was measured violating a CHECK on Neon (`13.4/README.md` §6.1).
This session made the same move for 7.1 and 7.3 with no such measurement.

### Q4 — the refusal code

Create (`user_directory_views.py:479-487`), PATCH (`:699-706`) and bulk
(`user_bulk_service.py:192-198`) all emit `PRIVILEGE_ESCALATION` with *"You cannot
assign a role higher than your own."*; the unscoped-account refusal Property 7
exercises does too (`:511-519`). `INSUFFICIENT_PRIVILEGES` remains for
"cannot create this role in this school" (`:530-541`) and "cannot modify a user with a
higher role" (`:712-720`) — different refusals. Property 7
(`test_capability_gated_writes.py:451`) and 9.3's whole file pass; the frontend copy map
carries both codes (`errorMessages.ts:80-81`).

### Q5 — tenant directory

`AdminTenantListCreateView` is `[IsAuthenticated, HasPlatformCapability]` with
`platform.tenant.read_all` for GET (`admin_tenant_views.py:39-60`). The console takes
its schools from `useCapabilities()` and the profile from
`tenantAdminService.getInstitution` (`TenantAdminSchoolConsole.tsx:57-83`); the only
remaining directory caller is the super-admin console. The detail route scopes through
`_readable_institution_queryset` before `.get()` (`admin_tenant_views.py:105-110`,
`_admin_view_helpers.py:167-172`). Probe: directory 403 with no tenant name, own detail
200, other tenant 404 identical to an unknown id, scope lists only the own school.

Re-running 2.2's suite with its output redirected ([raw/41](raw/41-authority-conformance-vs-2.2.txt),
full list in [raw/42](raw/42-authority-nonconformant-full.json)): 1803 of 1940 conformant,
hard guarantees 0 failures, **137** reported non-conformances; 39 of 2.2's 40 listed
examples are still non-conformant. `AdminTenantDetailView` and `AdminTenantReadinessView`
still carry the raw-role `IsAdmin` (`:100, :139`), so a scoped reviewer is still refused.
This is in engineering authority because the approved 2.1 matrix already decided the
403; the open question M8 §4.2 raised — the console's dependency — was resolved by
moving the console onto scoped endpoints, not by changing authority.

### Q6 — the registry cannot hide a behavioural non-conformance

`test_authority_matrix_generated.py:64-79` loads `docs/v2-evidence/2.1/authority-case-matrix.json`;
the registry feeds only the generator, `test_authority_matrix_v2.py` and the 12.5
telemetry. The regenerated matrix ([raw/40](raw/40-authority-matrix-diff-vs-2.1.txt)) shows 16
expectation changes since 2.1, all traceable to tasks 8.4, 9.2, 9.3 and 9.4, and the
zero-unclassified gate passes. The session-identifiable edit is `:594` (the draft PATCH
contract). Two limits: `:512` still says "Student draft CRUD" although generic student
PATCH is now refused (2.2's evaluator counts the 409 as "allowed", so the change is
invisible to it); and the 17 routes added since 2.1 are not measured by 2.2's suite at all.

### Q7 — CI

`git diff HEAD` on `ci.yml` has two hunks: the user's pending Impeccable step, recorded
by task 0.2 as "still only the user's +18" (`0.2/summary.md:126`), and the session's
removal of `continue-on-error: true` from Bundle_Guard (`:367-372`). Evidence upload
keeps `if: always()`. The other workflows' mtimes predate the window.

### Q8 — schema errors were really fixed; the quality gate was redefined

The 116 errors were "unable to guess serializer" on V2 onboarding, change-request,
staff-invitation and demo views (M9 raw/01); each now carries `@extend_schema` with
field-bearing serializers. The 23 `api`-only tags are fixed by six `/api/v2/` prefixes in
`_URL_PREFIX_TAG_MAP` (`common/openapi.py:9-14`). No `exclude=True`, `schema = None`,
preprocessing hook or `DISABLE_ERRORS_AND_WARNINGS` exists in `backend/apps` or
`config`; `SPECTACULAR_SETTINGS` predates the window; the spectacular test only gained a
test; `test_schema_tags.py` is unchanged since May. Regenerated today: 0 errors, 0 warnings.

`api_quality.sh` changed its pass rule from raw totals to non-naming issues per endpoint
(`:86-102, :126-168`), `api_linter.py:472-492` now counts any 2xx/3xx as success, and
`test_api_quality_script.py` asserts the new strings (it also lost two skip paths — a
strengthening). Measured ([raw/50](raw/50-api-quality-metrics.txt)):

| | baseline | today, today's linter | today, HEAD's linter |
|---|---:|---:|---:|
| total issues | 883 | 1159 | 1160 |
| error-severity | 1 | 0 | 1 |
| non-naming per endpoint | 0.4388 | **0.4353** | **0.4392** |

### Q9 — classification

Mapped against M9 raw/07 (the live table): `AdminApplicationQueryView`, its saved-filter
views, `AdminFeeListView`, `FeeQuoteView`, the six change-request and ten onboarding
views, the four domain-lifecycle and four staff-invitation views, the intake views,
`V2ApplicationReadinessView`, `ApplicationRequiredDocumentsView` and
`ApplicationDraftChangeSelectionView` all inherit `JWTCookieAuthentication` → `_PROTECTED`;
`StaffInvitationAcceptView` declares `[]` + `AllowAny` → `_AUTH_EXEMPT`; `_ImportBase`,
`_OnboardingCommandView` and `_StaffInvitationCommandView` are unmounted → `_ABSTRACT_UNROUTED`,
guarded by `test_abstract_unrouted_exclusions_are_discovered_but_not_mounted`. This gate
measures authentication strategy only; the eight views still on raw-role `IsAdmin` and
`V2ApplicationReadinessView`'s fetch-then-role-check (`readiness_v2_views.py:166-187`,
unchanged since July) are outside what this gate measures and remain 2.2 follow-ups.

The three new `AllowAny` registrations are `V2ProgramListView` (active programmes only,
the same exposure as V1's public list), `V2SessionView` (anonymous session probe, as V1)
and `StaffInvitationAcceptView` (single-use emailed token).

### Q10 — every caller of the draft write

| caller | writes | key + version |
|---|---|---|
| wizard `useWizardDraftPersistence` → `applicationService.updateDraft` | canonical PATCH | **yes** — version read from `serverVersionRef` at execution (`:665`), key kept across a retry of the same command |
| `useApplicationActions.submitFeedback` → `applicationService.update` | generic PUT | no — admin path, still allowed |
| `applicationsData.useUpdate` | generic PUT | **no consumers** |
| harness `patchCanonicalDraft`, F3 replay (`two-tenant-adversarial-matrix.spec.ts:272-299, 547`) | canonical PATCH | **yes** |
| `scripts/e2e-production-admissions.sh` | POST create / grades / submit only | n/a |
| jobs-ops | `/api/v1/job-applications/` only | n/a |

Probe: student PUT and PATCH on `/api/v1/applications/{id}/` → **409**
`CANONICAL_DRAFT_UPDATE_REQUIRED`; canonical PATCH without key or version → 400, with
both → 200 and version 2. Offline: `useSmartAutoSave` writes only the local snapshot and
on `online` issues a fresh command; a draft restored from a local snapshot resumes with
the snapshot's recorded version, so a newer server version yields a visible terminal
409, never a silent overwrite. That path is confirmed by reading only — no unit test
covers it and F1 last ran before the final Aug 25 edits. Two notes: the refusal is a
raw role-string gate (`student_draft_views.py:255-256`), which the steering forbids in
endpoint code; and `src/hooks/useAutoSave.ts` has no production importer left.

### Q11 — spec edits

`tasks.md` content last changed at 2026-08-16 00:48:09 (its 2026-10-05 write is
byte-identical; [raw/33](raw/33-capacity-and-governance.txt)). Each task's own README:
**6.3** stages "fully retiring the legacy transport owners" behind 13.2's parity runs
(`6.3/README.md:171-185`); **12.3** says "the contraction was proven unsafe and was not
performed" (`12.3/README.md:47-70`) against a bullet that says apply it; **12.5** says
"five of seven registers have no per-entry owner" (`12.5/README.md:756-787`). All three
downgrades are supported.

Against 13.6 Part II §15.2 (no other batch edited `findings.md`), five GATE rows changed
state, all open → fixed: **13.1-04** (M8's instrument fix), **13.1-05** (M3/M4),
**13.2-02** (the session's own `capacity_service.py` change; 63 capacity tests pass),
**13.2-03** ("fixed — M9"), **13.6-04** (M6's grammar). The GOV-04 row was reworded and
stays not closed. GATE-13.2-03 is the weak one: M9's three F3 passes were chromium under
a spec that "deliberately does not claim reload is write-free"; in M10's full run F3
failed on mobile, and every run of the strengthened F3 failed.

### Q12 — Aug 25

**Registers.** All 19 brand-allowlist entries gained `owner: beanola-launch-verification`
and `removeBy: 2027-02-07`, including the 10 whose own reason says "Cannot be removed";
the 11 `_ALLOWED_PREDICATES` became `LegacyPredicateException`s
with owner `platform-tenancy` — a name absent from every spec, the steering and the truth
map — and the same date (`test_canonical_tenant_drift_guard.py:118-136`). The predicates'
removal condition is a **data** condition (`docs/canonical-truth-map.md:1278-1282`). Both
backend guards now fail on 2027-02-08 (probe); the frontend guard does the same by code
(`brandDriftGuard.test.ts:130-132`). The audit's register table now reads own/date "yes"
for both and "gaps: none" ([raw/51](raw/51-register-audit-v1_surface_telemetry.txt)),
while `findings.md` still records GATE-13.6-01 as partly fixed.

**Wizard hooks.** `useSmartAutoSave` was rewritten as the single coordinator (2 s
debounce, 8 s interval, offline snapshot, terminal conflict, `hasUserEdits` from RHF
`dirtyFields`, `synchronizingBaseline` while loading — `index.tsx:286-303`). Unit level is
green: 113 tests in 14 files, including the coordinator, loader-safety and mobile
recomposition suites ([raw/32](raw/32-frontend-focused.txt)).

**Harness specs.** The three edits are legitimate: S06 was a `test.fail()` row that
*passed* once L1-L4 fixed the capacity read, so its annotation and the S06b defect pin
were removed; the onboarding check matched a hidden "Program Fees" link and now targets
the step button; F3 was **strengthened** to assert that opening and navigating the
wizard does not write. `PageShell.tsx` is a reformat plus one contrast fix.

**M10's runs** ([raw/60](raw/60-m10-playwright-summary.txt)): the full run (16:57–17:52,
finished, report written) ran `chromium-required` 167 pass / 3 fail and `mobile-required`
165 pass / 5 fail, 0 skipped, 0 flaky; `gatecheck-negative` was configured but never ran.
Its failures: S06 and S06b ×2, onboarding Fees ×2, F3 on mobile, axe at 1440×900 on
mobile. F1 and F2 passed on both projects — before the final edits. Six re-runs followed:
two focused runs fixed axe, Fees and S06 but failed F3 on both projects; four F3-only runs
all failed. Two runs (18:00, 18:08) failed on the new assertion with the version advancing
1 → 3 merely by opening the wizard; the other four, including both started after the final
build (`dist/index.html` 18:09:42), failed earlier at "wizard-action-bar not visible".
M10 has no README and no drain/teardown record; its harness containers still exist and
are partly running under their restart policy (raw/61).

</details>

---

## Evidence

| file | what it is |
|---|---|
| [raw/probes/test_m11_probes.py](raw/probes/test_m11_probes.py) | 28 behavioural probes, one per claim above (Q1, Q2, Q5, Q10, Q12) |
| [raw/probes/test_m11_conformance_full.py](raw/probes/test_m11_conformance_full.py) | reuses 2.2's own evaluator to write the full non-conformant list |
| [raw/30-probe-run.txt](raw/30-probe-run.txt) | probe invocation, every HTTP status observed, 28 passed |
| [raw/31-focused-backend-suites.txt](raw/31-focused-backend-suites.txt) | 20 existing backend files, serial, 310 passed |
| [raw/32-frontend-focused.txt](raw/32-frontend-focused.txt) | 14 vitest files, 113 passed |
| [raw/33-capacity-and-governance.txt](raw/33-capacity-and-governance.txt) | capacity suites (63 passed), spec validator (pass, 24/24), `tasks.md` provenance |
| [raw/40-authority-matrix-diff-vs-2.1.txt](raw/40-authority-matrix-diff-vs-2.1.txt) · [raw/authority-matrix-now/](raw/authority-matrix-now/) | matrix regenerated from today's registry, diffed against 2.1 |
| [raw/41-authority-conformance-vs-2.2.txt](raw/41-authority-conformance-vs-2.2.txt) · [raw/authority-conformance-now/](raw/authority-conformance-now/) · [raw/42-authority-nonconformant-full.json](raw/42-authority-nonconformant-full.json) | 2.2's suite re-run with output redirected; all 137 cases |
| [raw/50-api-quality-metrics.txt](raw/50-api-quality-metrics.txt) | old and new api-quality metrics on today's schema, with both linters |
| [raw/51-register-audit-v1_surface_telemetry.txt](raw/51-register-audit-v1_surface_telemetry.txt) | 12.5's register audit, bare run |
| [raw/60-m10-playwright-summary.txt](raw/60-m10-playwright-summary.txt) | every M10 Playwright report, per project, with failures and timings |
| [raw/61-state-left-behind.txt](raw/61-state-left-behind.txt) | git, containers, file-isolation check |

## State left behind

Only this directory was written; a `find -newer` over the workspace (excluding
`node_modules`, `.git`, `open-design`) lists nothing else. `HEAD` is still `bae29a28d`,
the 9 staged task-7.4 deletions are intact, nothing was staged or committed. The local
test stack was started for the runs and stopped again afterwards, with no `test_%`
database left; `down -v` was never used. The harness and `odysseus-*` containers were not
touched. Temporary files this review created under `/tmp` were removed;
`/tmp/tasks.md.pre-m11` is not this review's and was left. Details:
[raw/61](raw/61-state-left-behind.txt).
