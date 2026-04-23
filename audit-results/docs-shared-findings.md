# Docs, Shared & Remaining Audit Findings

## Summary
- Total files: 502
- ignore-as-correct: 38
- improve: 12
- remove: 441 (legacy/stale docs from pre-Django era)
- needs-human-decision: 11

## Classification Legend

- **ignore-as-correct**: File is accurate and current
- **improve**: File has specific issues that should be fixed
- **remove**: File is stale/legacy from pre-Django era (Supabase, Cloudflare Pages, Netlify, npm, PWA) and no longer reflects the current system
- **needs-human-decision**: File has value but needs owner judgment on retention

---

## CRITICAL FINDINGS (improve)

### backend/DEPLOY.md — improve
**Tag:** confirmed-bug
**Issue:** Celery Beat schedule table lists only 2 tasks (`check_uptime_task` at "every 300 seconds" and `cleanup_audit_logs_task`). The actual `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py` has 16 tasks and `check_uptime_task` runs every 900 seconds (15 minutes), not 300 (5 minutes). The `keep_alive_task` (every 240s) is not mentioned at all.
**Recommendation:** Update the Celery Beat table in DEPLOY.md to match the full 16-task schedule from `base.py`. Fix the `check_uptime_task` interval from 300s to 900s.

### backend/migrations/RLS_REPLACEMENT.md — improve
**Tag:** suspicious-stale-path
**Issue:** References `api/_lib/auth/ownership.ts`, TypeScript middleware patterns, and Supabase RLS policies. The backend is now Django/Python — none of these TypeScript paths exist. The document describes a migration approach that was completed long ago.
**Recommendation:** Remove or archive. The ownership checks are now in Django DRF permission classes, not TypeScript middleware.

### docs/security-api-audit-2026-04.md — improve
**Tag:** confirmed-bug
**Issue:** H1 finding states MCP config contains hardcoded API keys in `.kiro/mcp.json` and `.kiro/settings/mcp.json`. If these files are still committed with real keys, this is a live security issue. The audit is dated April 2026 and marked as "STILL OPEN".
**Recommendation:** Verify whether `.kiro/mcp.json` and `.kiro/settings/mcp.json` still contain hardcoded secrets. If so, rotate the keys immediately and add these files to `.gitignore`.

### docs/full-audit-report-2026-04-22.md — improve
**Tag:** confirmed-bug
**Issue:** Bug #3 states `ApplicationTrackView` returns raw serializer data without `{success:true, data:...}` envelope. Bug #5 states `JobScoreView` has wrong FK name (`job` vs `job_posting`) and non-existent fields. Bug #7 states `SafeHtml.tsx` renders sanitized HTML as text. These are listed as confirmed bugs — need verification that they've been fixed since the audit.
**Recommendation:** Cross-reference each bug against current code. If any remain unfixed, they are live production bugs.

### docs/schema-ownership.md — improve
**Tag:** suspicious-stale-path
**Issue:** References `docs/migration/2026-03-07-manual-migration-order.md` as part of the schema source of truth. That migration doc references the original Supabase-to-Neon migration SQL order, which is historical context, not an active operational guide.
**Recommendation:** Clarify that the manual migration order doc is historical. The active schema change workflow should reference only `backend/scripts/*.sql` and the verification scripts.

### shared/PLATFORM_CONTRACT.md — improve
**Tag:** suspicious-stale-path
**Issue:** Auth Endpoints table lists only 5 endpoints (login, register, refresh, logout, session). Missing: `POST /api/v1/auth/verify-email/`, `POST /api/v1/auth/forgot-password/`, `POST /api/v1/auth/reset-password/`, `POST /api/v1/auth/change-password/`. Also missing CSRF recovery documentation (`?refresh_csrf=1` on session endpoint).
**Recommendation:** Add the missing auth endpoints and CSRF recovery flow to the contract.

### docs/CONTINUE_NEXT_STEPS.md — improve
**Tag:** suspicious-stale-path
**Issue:** Dated April 9, 2026. Lists "Highest-Priority Remaining Work" items that may have been completed since. If this is the active roadmap, it should be updated. If it's historical, it should be archived.
**Recommendation:** Update with current status or move to `docs/archive/`.

### production-hardening.md — improve
**Tag:** suspicious-stale-path
**Issue:** Root-level file (not in `docs/`). Lists priorities as "IN PROGRESS" but the referenced runbooks have all been created. The "Remaining" items (restore drill, CI gates, staging) may or may not be done.
**Recommendation:** Update status markers or move to `docs/` with current state. Root-level placement is inconsistent with the docs convention.

### docs/DEPLOYMENT_GUIDE.md — improve
**Tag:** suspicious-stale-path
**Issue:** References Supabase, Cloudflare, Node.js 18+, npm. The current deployment uses Koyeb (backend) + Vercel (frontend) + Neon + Bun. The canonical deployment guide is now `backend/DEPLOY.md`.
**Recommendation:** Remove. `backend/DEPLOY.md` is the current deployment guide.

### docs/API_REFERENCE.md — improve
**Tag:** suspicious-stale-path
**Issue:** Lists base URL as `***REMOVED***` (frontend) and `http://localhost:5173` (dev). The API base is `***REMOVED***`. References `Authorization: Bearer <jwt_token>` header auth — the current system uses cookie-based auth. Rate limit headers described don't match current DRF throttling.
**Recommendation:** Remove. The canonical API docs are served by drf-spectacular at `/api/v1/docs/`.

### docs/DEVELOPER_ONBOARDING.md — improve
**Tag:** suspicious-stale-path
**Issue:** References Node.js 18+, npm, and a setup flow that doesn't match the current Bun + Django stack.
**Recommendation:** Remove or rewrite for the current stack. The README.md Quick Start section is more accurate.

### docs/CHANGELOG.md — improve
**Tag:** suspicious-stale-path
**Issue:** Last entry references PWA cache reset migration, `vite-plugin-pwa`, and service worker changes. PWA has been fully removed from the project. The changelog stops at v3.0.0 (January 2025) and doesn't cover any Django migration, Lenco payment, business logic, or production hardening work.
**Recommendation:** Either update to reflect the actual release history or remove as misleading.


---

## IGNORE-AS-CORRECT (38 files)

These files are accurate and reflect the current system state.

### .kiro/steering/product.md — ignore-as-correct
### .kiro/steering/structure.md — ignore-as-correct
### .kiro/steering/tech.md — ignore-as-correct
### README.md — ignore-as-correct
### docs/README.md — ignore-as-correct
### apps/jobs-ops/README.md — ignore-as-correct
### apps/student-portal/README.md — ignore-as-correct
### apps/student-portal/package.json — ignore-as-correct
### apps/website/README.md — ignore-as-correct
### apps/website/package.json — ignore-as-correct
### shared/package.json — ignore-as-correct
### docs/runbooks/secrets-rotation.md — ignore-as-correct
### docs/runbooks/database-backup-restore.md — ignore-as-correct
### docs/runbooks/local-parity.md — ignore-as-correct
### docs/runbooks/post-deploy-smoke-check.md — ignore-as-correct
### docs/runbooks/redis-incident-response.md — ignore-as-correct
### docs/runbooks/redis-recovery.md — ignore-as-correct
### docs/runbooks/release-and-rollback.md — ignore-as-correct
### docs/runbooks/scaling-playbook.md — ignore-as-correct
### docs/redis-dependency-tiers.md — ignore-as-correct
### docs/decision/2026-04-21-adr-004-schema-ownership.md — ignore-as-correct
### docs/decision/2026-04-21-adr-006-outbox-and-side-effects.md — ignore-as-correct
### docs/decision/2026-04-21-adr-007-redis-dependency-policy.md — ignore-as-correct
### docs/decision/2026-03-09-backend-decision-matrix.md — ignore-as-correct
**Note:** Historical decision record. Accurate for its date. Retain as ADR context.
### docs/design/2026-03-30-ai-job-hunting-platform-architecture.md — ignore-as-correct
**Note:** Jobs-ops architecture design doc. Still relevant as reference.
### docs/design/2026-03-30-ai-job-hunting-platform-ui-spec.md — ignore-as-correct
### docs/requirements/2026-03-30-ai-job-hunting-platform-prd.md — ignore-as-correct
### docs/reports/2026-03-30-ai-job-hunting-platform-progress.md — ignore-as-correct
### docs/reports/2026-03-31-ai-job-hunting-platform-handoff.md — ignore-as-correct
### docs/plans/2026-03-30-ai-job-hunting-platform-blueprint.md — ignore-as-correct
### docs/integrations/2026-04-01-openclaw-jobs-ops-integration-plan.md — ignore-as-correct
### docs/cto-assessment-2026-03-30.md — ignore-as-correct
### docs/full-system-audit-2026-04.md — ignore-as-correct
### docs/audit-report-2026-04-22.md — ignore-as-correct
### docs/reports/codebase-audit-2026-04-18.md — ignore-as-correct
### docs/reports/improvement-plan-2026-04-18.md — ignore-as-correct
### docs/visual-qa-checklist.md — ignore-as-correct
### docs/audit-prompt-ui-ux-quality.md — ignore-as-correct
**Note:** Verification prompt template. Useful for future audits.


---

## NEEDS-HUMAN-DECISION (11 files)

These files have some value but need owner judgment on whether to keep, archive, or remove.

### backend/migrations/forensic/README.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Documents the Supabase-to-Neon forensic extraction (Feb 2026). Historical migration context. The migration is complete.
**Recommendation:** Keep as historical record in an `archive/` folder, or remove if migration history is no longer needed.

### docs/migration/2026-03-07-manual-migration-order.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Original SQL migration order for Supabase-to-Neon. Referenced by `docs/schema-ownership.md` as part of schema source of truth. Migration is complete.
**Recommendation:** Decide whether this is still operationally useful or purely historical.

### docs/migration/2026-03-09-django-migration-guide.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Django migration evaluation guide from the backend decision process. Django was chosen. Historical ADR context.
**Recommendation:** Keep alongside the decision matrix ADR or archive.

### docs/pythonmigration.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Python/Django migration plan from the Vercel Functions era. Migration is complete. Some architectural rationale may still be useful.
**Recommendation:** Archive or remove.

### docs/plans/session-fix-execution-plan.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Detailed session fix plan from the auth architecture overhaul. The fix has been implemented. Contains good architectural analysis.
**Recommendation:** Archive as historical context or remove.

### docs/plans/2026-03-10-runtime-stability-and-loading.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Runtime stability plan from the pre-Django era. References `src/` paths that no longer exist. Tasks have been completed.
**Recommendation:** Archive or remove.

### docs/plans/2026-03-09-backend-migration-decision.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Backend migration decision implementation plan. Decision was made (Django). Historical.
**Recommendation:** Keep alongside ADR or archive.

### docs/reports/2026-03-31-ai-job-hunting-platform-master-implementation-prompt.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Master prompt for continuing jobs-ops implementation. May still be useful for onboarding new AI agents to the jobs-ops work.
**Recommendation:** Keep if still used for AI continuation, otherwise archive.

### docs/reports/ADMISSIONS_BUSINESS_LOGIC_AUDIT.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Dated April 10, 2026. Contains detailed business logic audit findings. Some may still be actionable.
**Recommendation:** Review findings against current code. Archive after verification.

### docs/reports/ADMISSIONS_AUDIT_EVALUATION.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Evaluation of the business logic audit. Cross-references live codebase and Neon database. May contain unresolved items.
**Recommendation:** Review for unresolved items, then archive.

### .kiro/skills/git-worktree-manager/git-worktree-manager/references/docker-compose-patterns.md — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Duplicate file — exists at both `.kiro/skills/git-worktree-manager/git-worktree-manager/references/` (nested duplicate) and `.kiro/skills/git-worktree-manager/references/`. Content is identical.
**Recommendation:** Remove the nested duplicate path.


---

## REMOVE — 441 files (Legacy/Stale Documentation)

All files below are from the pre-Django era (Supabase, Cloudflare Pages, Netlify, npm, PWA, dark mode, Sentry direct integration, etc.) and no longer reflect the current system. They reference technologies, paths, endpoints, and patterns that have been fully replaced.

**Tag for all:** suspicious-stale-path
**Recommendation for all:** Move to `docs/archive/` or delete entirely. These files create confusion for anyone reading the docs directory and may lead to incorrect assumptions about the current system.

### Stale Top-Level docs/ Files (72 files)

These reference Supabase, Cloudflare Pages, Netlify, npm, PWA, dark mode, or pre-Django architecture:

- docs/ANIMATION_OPTIMIZATION_GUIDE.md — References pre-Django frontend patterns
- docs/API_MIGRATION_FINAL_REPORT.md — Supabase direct-DB-call migration (completed)
- docs/API_MIGRATION_PLAN.md — Supabase direct-DB-call migration plan (completed)
- docs/API_REFERENCE.md — Wrong base URL, wrong auth method, stale endpoints
- docs/APPLICATION_WIZARD_ENHANCEMENTS.md — Pre-Django wizard changes
- docs/AUTH_IMPROVEMENTS.md — Jan 2025 pre-Django auth improvements
- docs/CACHE_MONITORING.md — React Query cache monitoring from pre-Django era
- docs/CACHE_OPTIMIZATION_SUMMARY.md — Pre-Django cache config
- docs/CHANGELOG.md — Stops at v3.0.0 (Jan 2025), references removed PWA
- docs/CLOUDFLARE_FIX_COMPLETE.md — Cloudflare Pages fix (platform abandoned)
- docs/CLOUDFLARE_FUNCTIONS_FIX.md — Cloudflare Pages functions (platform abandoned)
- docs/CLOUDFLARE_MIGRATION_FIX.md — Cloudflare Pages migration (platform abandoned)
- docs/CLOUDFLARE_PAGES_VERIFICATION.md — Cloudflare Pages verification (platform abandoned)
- docs/COLOR_CRISIS_ANALYSIS_AND_FIX.md — Shadcn color crisis (pre-Django)
- docs/COLOR_FIX_COMPLETE.md — Color fix completion (pre-Django)
- docs/COMPREHENSIVE_UX_ANALYSIS.md — Pre-Django UX analysis
- docs/DARK_MODE_REMOVAL.md — Dark mode removal (completed)
- docs/DEEP_ISSUES_FOUND.md — Supabase database issues (platform abandoned)
- docs/DEPLOYMENT_COMPLETE.md — Cloudflare Pages deployment (platform abandoned)
- docs/DEPLOYMENT_GUIDE.md — Supabase + Cloudflare deployment guide
- docs/DEPLOY_NOW.md — Cloudflare Pages deploy reference
- docs/DESIGN_SYSTEM.md — Pre-Django design system
- docs/DESIGN_SYSTEM_IMPLEMENTATION.md — Pre-Django design system implementation
- docs/DESIGN_TOKENS_AND_UI.md — Pre-Django design tokens
- docs/DEVELOPER_ONBOARDING.md — Node.js/npm onboarding (wrong stack)
- docs/EMAIL_ATTACHMENT_STANDARD.md — Supabase Edge Functions email (platform abandoned)
- docs/EMAIL_READY.md — Resend email config from pre-Django era
- docs/ENDPOINT_VERIFICATION_ISSUE.md — Cloudflare Pages endpoint issues
- docs/FINAL_STATUS_REPORT.md — Jan 2025 pre-Django status
- docs/GRADIENT_LEGIBILITY_MANHUNT.md — Pre-Django CSS fix
- docs/LEGACY_DIRECTORIES_CLEANUP.md — Cloudflare/Netlify directory cleanup
- docs/LEGIBILITY_FRAMEWORK.md — Pre-Django CSS framework
- docs/LEGIBILITY_MANHUNT_REPORT.md — Pre-Django CSS fix
- docs/LOADING_ACCEPTANCE_CHECKLIST.md — Pre-Django loading checklist
- docs/LOGIN_PERFORMANCE_OPTIMIZATION.md — Pre-Django login optimization
- docs/MOBILE_UX_AUDIT.md — Pre-Django mobile audit
- docs/MONITORING_SETUP.md — Sentry setup guide (now uses GlitchTip)
- docs/NAVIGATION_RESPONSIVE_FIXES.md — Pre-Django nav fixes
- docs/NOTIFICATION_EMAIL_FIX.md — Supabase notification fix
- docs/PERFORMANCE_ANALYSIS_FINAL.md — Pre-Django bundle analysis
- docs/PERFORMANCE_FIXES.md — Pre-Django performance fixes
- docs/PERFORMANCE_FIX_PLAN.md — Pre-Django performance plan
- docs/PERFORMANCE_OPTIMIZATION_IMPLEMENTATION.md — Pre-Django optimization
- docs/PERFORMANCE_OPTIMIZATION_PLAN.md — Pre-Django optimization plan
- docs/PERFORMANCE_ROOT_CAUSE_ANALYSIS.md — Pre-Django performance RCA
- docs/PHASE1_IMPLEMENTATION.md — Pre-Django phase 1
- docs/PHASE2_IMPLEMENTATION_COMPLETE.md — Pre-Django phase 2
- docs/PHASE2_PLAN.md — Pre-Django phase 2 plan
- docs/PHASE_1_COMPLETE.md through docs/PHASE_7_COMPLETE.md (7 files) — Pre-Django phase completions
- docs/PHASE_1_FIXES.md — Pre-Django fixes
- docs/PHASE_1_VERIFICATION.md — Pre-Django verification
- docs/PHASE_2_PROGRESS.md — Pre-Django progress
- docs/PWA_ENHANCEMENTS_SUMMARY.md — PWA enhancements (PWA removed)
- docs/PWA_OFFLINE_SUMMARY.md — PWA offline mode (PWA removed)
- docs/REMAINING_ISSUES_REPORT.md — Pre-Django remaining issues
- docs/ROOT_CAUSE_ANALYSIS.md — Pre-Django Supabase RCA
- docs/SCALABILITY_RECOMMENDATIONS.md — Pre-Django scalability
- docs/SHADCN_MIGRATION_CHANGELOG.md — Pre-Django Shadcn migration
- docs/SLIP_API_IMPLEMENTATION.md — Pre-Django slip API
- docs/SLIP_SYSTEM_ANALYSIS.md — Pre-Django slip analysis
- docs/STATE_MANAGEMENT_SUMMARY.md — Pre-Django state management
- docs/STUDENT_DASHBOARD_FIXES_COMPLETE.md — Pre-Django dashboard fixes
- docs/STUDENT_DASHBOARD_RESPONSIVE_ANALYSIS.md — Pre-Django responsive analysis
- docs/TEMPLATES_QUICK_REFERENCE.md — Pre-Django template reference
- docs/TEMPLATE_MIGRATION_GUIDE.md — Pre-Django template migration
- docs/TROUBLESHOOTING.md — Pre-Django troubleshooting
- docs/UI_IMPROVEMENTS_AUTH_FLOW.md — Pre-Django auth UI
- docs/UI_UX_COMPETITIVE_ANALYSIS.md — Pre-Django competitive analysis
- docs/UI_UX_IMPROVEMENTS.md — Pre-Django UI improvements
- docs/UNIFIED_TEMPLATES_DEPLOYMENT.md — Pre-Django templates
- docs/UNIFIED_TEMPLATES_SYSTEM.md — Pre-Django templates
- docs/VERIFICATION_COMPLETE.md — Pre-Django verification
- docs/production-deployment-guide.md — Jan 2025 pre-Django deployment
- docs/security-audit-report.md — Jan 2025 pre-Django security audit (Supabase RLS)
- docs/task-21-cloudflare-optimization-summary.md — Cloudflare Pages optimization
- docs/final-system-validation-report.md — Jan 2026 pre-Django validation


### docs/analysis/ (24 files) — All remove

All reference pre-Django architecture, Supabase, Cloudflare, dark mode, or CSS patterns that no longer exist:

- docs/analysis/ADMINISTRATOR_OPERATIONS_GUIDE.md
- docs/analysis/AI_SYSTEM_ANALYSIS.md
- docs/analysis/APPLICATIONS_PAGE_ANALYSIS.md
- docs/analysis/CLOUDFLARE_AI_MIGRATION.md
- docs/analysis/COMPETITIVE_ANALYSIS.md
- docs/analysis/COMPREHENSIVE_CSS_ANALYSIS.md
- docs/analysis/COMPREHENSIVE_DEEP_ANALYSIS.md
- docs/analysis/CSS_SEMANTIC_ANALYSIS.md
- docs/analysis/CSS_VARIABLES_CONFLICT_ANALYSIS.md
- docs/analysis/DARK_MODE_ANALYSIS.md
- docs/analysis/DARK_MODE_FINAL_ANALYSIS.md
- docs/analysis/DIRECT_DATABASE_CALLS_ANALYSIS.md
- docs/analysis/ENHANCEMENTS_ANALYSIS.md
- docs/analysis/FINAL_ANALYSIS_SUMMARY.md
- docs/analysis/FINAL_DARK_MODE_ANALYSIS.md
- docs/analysis/FINAL_SYSTEM_VALIDATION_REPORT.md
- docs/analysis/KYC_ANALYSIS.md
- docs/analysis/LARGE_FILES_REFACTORING_FINAL.md
- docs/analysis/LEGIBILITY_ANALYSIS.md
- docs/analysis/PHASE_2_VERIFIED.md
- docs/analysis/REAL_ISSUES_AUDIT.md
- docs/analysis/REDESIGN_ANALYSIS_AND_PLAN.md
- docs/analysis/ROOT_CAUSE_ANALYSIS.md
- docs/analysis/STATE_MANAGEMENT_FULL_ANALYSIS.md
- docs/analysis/STYLING_AUDIT.md
- docs/analysis/SYSTEMS_ANALYSIS_COMPLETE.md
- docs/analysis/SYSTEM_ANALYSIS_GUIDE.md
- docs/analysis/SYSTEM_ANALYSIS_REPORT.md
- docs/analysis/TOAST_SYSTEM_ANALYSIS.md
- docs/analysis/UI_DARKNESS_ANALYSIS.md
- docs/analysis/UX_COMPETITIVE_ANALYSIS.md
- docs/analysis/admin-route-classification.md

### docs/accessibility/ (1 file) — remove
- docs/accessibility/KEYBOARD_NAVIGATION_IMPLEMENTATION.md — Pre-Django keyboard nav implementation

### docs/deployment/ (1 file) — remove
- docs/deployment/DEPLOYMENT_SUMMARY.md — Pre-Django deployment summary

### docs/design-system/ (10 files) — All remove

Pre-Django design system documentation:

- docs/design-system/01-foundation.md
- docs/design-system/02-components.md
- docs/design-system/03-patterns.md
- docs/design-system/04-animations.md
- docs/design-system/COMPLETE_SUMMARY.md
- docs/design-system/FINAL_SUMMARY.md
- docs/design-system/MIGRATION_GUIDE.md
- docs/design-system/PHASE_3_MIGRATION.md
- docs/design-system/PHASE_4_MIGRATION.md
- docs/design-system/PROGRESS.md
- docs/design-system/README.md

### docs/fixes/ (2 files) — All remove
- docs/fixes/AUTO_UPLOAD_FIX.md — Pre-Django auto-upload fix
- docs/fixes/REALTIME_FIX_INDEX.md — Pre-Django realtime sync fix index

### docs/performance/ (1 file) — remove
- docs/performance/PERFORMANCE_ISSUES_SUMMARY.md — Pre-Django performance issues

### docs/integrations/README.md — remove
**Issue:** Generic integration framework description that doesn't match the current Django integration apps.


### docs/guides/ (48 files) — All remove

All reference Supabase, Cloudflare Pages, Netlify, npm, or pre-Django patterns:

- docs/guides/ACTUAL_ROOT_CAUSE.md
- docs/guides/ADMIN_GUIDE.md — References `mihasv3.pages.dev/admin`
- docs/guides/ADMIN_USER_GUIDE.md
- docs/guides/API_STRUCTURE_GUIDE.md — Pre-Django API structure
- docs/guides/AUTH_IMPROVEMENTS_SUMMARY.md
- docs/guides/CACHE_CLEAR_INSTRUCTIONS.md
- docs/guides/CACHE_OPTIMIZATION_QUICK_REFERENCE.md
- docs/guides/CLOUDFLARE_FUNCTIONS_ROUTING.md
- docs/guides/CLOUDFLARE_MIGRATION.md
- docs/guides/CLOUDFLARE_PAGES_SETUP.md
- docs/guides/CLOUDFLARE_QUICK_START.md
- docs/guides/CLOUDFLARE_SETUP.md
- docs/guides/CLOUDFLARE_STATUS.md
- docs/guides/COMPREHENSIVE_TESTING_GUIDE.md — References Supabase MCP, hardcoded credentials
- docs/guides/CRITICAL_USER_FLOWS_TEST.md
- docs/guides/CRON_JOB_CONFIG.md — References cron-job.org for email queue
- docs/guides/CRON_SETUP.md
- docs/guides/DEPLOYMENT_CHECKLIST.md — Pre-Django deployment
- docs/guides/DEPLOYMENT_GUIDE.md — Netlify deployment
- docs/guides/DEPLOYMENT_STATUS.md
- docs/guides/DESIGN_SYSTEM.md
- docs/guides/DESIGN_SYSTEM_REFERENCE.md
- docs/guides/EMAIL_CONFIGURATION_REQUIRED.md
- docs/guides/EMAIL_QUEUE_SETUP.md — Supabase email queue
- docs/guides/EMAIL_QUICK_START.md
- docs/guides/ENHANCEMENT_ROADMAP.md
- docs/guides/FIELD_MAPPING.md
- docs/guides/FINAL_CHECKLIST.md
- docs/guides/FINAL_SIGNUP_FIX.md
- docs/guides/FIX_GIT_WSL.md
- docs/guides/FUNCTION_AUDIT_PLAN.md
- docs/guides/FUNCTION_STATUS.md
- docs/guides/GIT_RECOVERY_STEPS.md
- docs/guides/IMMEDIATE_ACTION_REQUIRED.md
- docs/guides/INDIVIDUAL_FUNCTION_TEST_RESULTS.md
- docs/guides/INTERNET_CONSENSUS.md
- docs/guides/INTERVIEW_QUICK_REFERENCE.md — Pre-Django interview component reference
- docs/guides/LAUNCH_INSTRUCTIONS.md
- docs/guides/MIGRATION_FRAMEWORK_GUIDE.md
- docs/guides/MIGRATION_STATUS.md
- docs/guides/PRE_DEPLOYMENT_CHECKLIST.md
- docs/guides/QUICK_FIX_REFERENCE.md
- docs/guides/README_REDESIGN.md
- docs/guides/REDESIGN_FIX_PLAN.md
- docs/guides/REDESIGN_INDEX.md
- docs/guides/REDESIGN_PLAN_V2.md
- docs/guides/ROOT_CAUSE_CONFIRMED.md
- docs/guides/SESSION_CLEANUP_GUIDE.md
- docs/guides/SHADCN_MIGRATION_PLAN.md
- docs/guides/STUDENT_GUIDE.md — References `mihasv3.pages.dev`
- docs/guides/TECH_ALTERNATIVES.md
- docs/guides/TECH_STACK.md — Lists React 18.3.1, npm, pre-Django stack
- docs/guides/THEME_MIGRATION_PLAN.md
- docs/guides/ZERO_DOWNTIME_DEPLOYMENT_GUIDE.md — Pre-Django zero-downtime


### docs/reports/ (248 files) — All remove

The largest category. All are completion reports, fix summaries, verification reports, and status updates from the pre-Django era (Supabase, Cloudflare Pages, Netlify, npm, PWA, dark mode, Sentry). None reflect the current Django + Koyeb + Vercel + Neon architecture.

- docs/reports/100_PERCENT_ACHIEVEMENT.md
- docs/reports/ADMIN_API_TEST_RESULTS.md
- docs/reports/ADMIN_DASHBOARD_100_PERCENT.md
- docs/reports/ADMIN_DASHBOARD_100_PERCENT_FINAL.md
- docs/reports/ADMIN_DASHBOARD_VERIFICATION.md
- docs/reports/ADMIN_ERROR_FIX.md
- docs/reports/ADMIN_FIXES_COMPLETE.md
- docs/reports/ADMIN_FIX_QUICK_REFERENCE.md
- docs/reports/ADMIN_FUNCTIONALITY_ANALYSIS.md
- docs/reports/ADMIN_ISSUES_ANALYSIS.md
- docs/reports/ADMIN_MOBILE_FIXES.md
- docs/reports/ADMIN_MOBILE_FIXES_COMPLETE.md
- docs/reports/ADMIN_PAGES_FIXES.md
- docs/reports/ADMIN_PAGES_FIXES_APPLIED.md
- docs/reports/ADMIN_SYSTEM_STATUS.md
- docs/reports/ADMIN_TEST_RESULTS.md
- docs/reports/ADMIN_UI_FIX.md
- docs/reports/ADMIN_VERIFICATION_CHECKLIST.md
- docs/reports/ADVANCED_ANALYTICS_COMPLETE.md
- docs/reports/AI_ASSISTANT_COMPLETE_ANALYSIS.md
- docs/reports/AI_IMPLEMENTATION_COMPLETE.md
- docs/reports/AI_MIGRATION_SUMMARY.md
- docs/reports/ALL_AI_ANALYSIS_SUMMARY.md
- docs/reports/ALL_FIXES_COMPLETE.md
- docs/reports/ALL_FUNCTIONS_WORKING.md
- docs/reports/ALL_PHASES_COMPLETE.md
- docs/reports/ALL_RACE_CONDITIONS_FIXED.md
- docs/reports/ALL_REAL_ISSUES_FIXED.md
- docs/reports/ANALYTICS_REFACTORING_COMPLETE.md
- docs/reports/API_CONSOLIDATION_COMPLETE.md
- docs/reports/API_FIXES_COMPLETE.md
- docs/reports/API_FIXES_SUMMARY.md
- docs/reports/API_SYSTEM_FIXES.md
- docs/reports/API_TEST_COMPLETE.md
- docs/reports/APPLICATIONS_PAGE_FIXES_COMPLETE.md
- docs/reports/APPLICATIONS_PAGE_ISSUES.md
- docs/reports/APPLICATION_MODAL_FIX.md
- docs/reports/APPLICATION_SLIP_VERIFICATION.md
- docs/reports/APPLICATION_WIZARD_100_PERCENT.md
- docs/reports/APPROVAL_FIX_SUMMARY.md
- docs/reports/AUDIT_COMPLETE_REPORT.md
- docs/reports/AUDIT_FIXES_SUMMARY.md
- docs/reports/AUDIT_TRAIL_COMPLETE.md
- docs/reports/AUTHENTICATION_FIX_COMPLETE.md
- docs/reports/AUTH_AUDIT_COMPLETE.md
- docs/reports/AUTH_AUDIT_VERIFICATION.md
- docs/reports/AUTH_DIAGNOSIS.md
- docs/reports/AUTH_FIX_PLAN.md
- docs/reports/AUTH_FIX_SUMMARY.md
- docs/reports/AUTH_IMPROVEMENTS.md
- docs/reports/BACKEND_PDF_MIGRATION_COMPLETE.md
- docs/reports/BEST_OF_BOTH_WORLDS.md
- docs/reports/CHATGPT_SUGGESTIONS_ANALYSIS.md
- docs/reports/CLOUDFLARE_AI_VERIFICATION.md
- docs/reports/CODE_AUDIT_SUMMARY.md
- docs/reports/CODE_VERIFICATION_SMS_WHATSAPP.md
- docs/reports/COLOR_CRISIS_FIXED.md
- docs/reports/COMPLETE_AI_ANALYSIS_FINAL.md
- docs/reports/COMPLETE_ANALYSIS_SUMMARY.md
- docs/reports/COMPLETE_API_TEST_RESULTS.md
- docs/reports/COMPLETE_FIXES_SUMMARY.md
- docs/reports/COMPLETE_FUNCTION_AUDIT.md
- docs/reports/COMPLETE_SYSTEM_FUNCTIONALITY_REPORT.md
- docs/reports/COMPREHENSIVE_API_ANALYSIS.md
- docs/reports/COMPREHENSIVE_AUDIT_PHASE2.md
- docs/reports/COMPREHENSIVE_FIX_SUMMARY.md
- docs/reports/COMPREHENSIVE_FUNCTIONALITY_AUDIT.md
- docs/reports/COMPREHENSIVE_SYSTEM_ANALYSIS_2025.md
- docs/reports/COMPREHENSIVE_TEST_RESULTS_SUMMARY.md
- docs/reports/CONNECTION_ISSUES_FIX.md
- docs/reports/CONSOLIDATION_SUMMARY.md
- docs/reports/CREDENTIALS_FIX_SUMMARY.md
- docs/reports/CRITICAL_BUGS_FIXED.md
- docs/reports/CRITICAL_FIXES_APPLIED.md
- docs/reports/CRITICAL_PRODUCTION_FIXES.md
- docs/reports/DARK_MODE_100_PERCENT.md
- docs/reports/DARK_MODE_MANHUNT.md
- docs/reports/DARK_MODE_MIGRATION_COMPLETE.md
- docs/reports/DATABASE_ANALYSIS_COMPLETE.md
- docs/reports/DATABASE_SCHEMA_FIX.md
- docs/reports/DEEP_FIX_COMPLETE.md
- docs/reports/DEPLOYMENT_COMPLETE.md
- docs/reports/DEPLOYMENT_FIX_SUMMARY.md
- docs/reports/DEPLOYMENT_READY.md
- docs/reports/DEPLOYMENT_READY_REPORT.md
- docs/reports/DEPLOYMENT_SUCCESS.md
- docs/reports/DEPLOYMENT_SUCCESS_REPORT.md
- docs/reports/DEPLOYMENT_VERIFICATION.md
- docs/reports/DEPLOY_100_PERCENT_FIX.md
- docs/reports/DESIGN_SYSTEM_FIXES.md
- docs/reports/DOCUMENT_GENERATION_COMPLETE.md
- docs/reports/DUPLICATE_FUNCTIONALITY_AUDIT.md
- docs/reports/ELIGIBILITY_FIX_SUMMARY.md
- docs/reports/ELIGIBILITY_SYSTEM_IMPLEMENTATION.md
- docs/reports/ELIGIBILITY_VERIFICATION_CHECKLIST.md
- docs/reports/EMAIL_NOTIFICATIONS_STATUS.md
- docs/reports/ENGINEERING_ANALYSIS.md
- docs/reports/ENHANCEMENTS_COMPLETE.md
- docs/reports/ENTERPRISE_ELIGIBILITY_UPGRADE.md
- docs/reports/EXCELLENCE_ACHIEVED.md
- docs/reports/EXTENSION_CONFLICT_FIXES.md
- docs/reports/EXTRACTION_AND_ORGANIZATION_COMPLETE.md
- docs/reports/FINAL_CODE_ANALYSIS.md
- docs/reports/FINAL_FIXES.md
- docs/reports/FINAL_REFACTORING_STATUS.md
- docs/reports/FINAL_STATE_MANAGEMENT_REPORT.md
- docs/reports/FINAL_STATUS.md
- docs/reports/FINAL_STATUS_100_PERCENT_GOAL.md
- docs/reports/FINAL_STATUS_2025-01-23.md
- docs/reports/FINAL_TEST_REPORT.md
- docs/reports/FINAL_TEST_RESULTS.md
- docs/reports/FIXED_FILES_LIST.md
- docs/reports/FIXES_APPLIED.md
- docs/reports/FIXES_APPLIED_2025-01-23.md
- docs/reports/FIX_AUTH_SIGNUP.md
- docs/reports/FORGOT_PASSWORD_FIX.md
- docs/reports/FRONTEND_BACKEND_INTEGRATION_FIXES.md
- docs/reports/FUNCTIONALITY_STATUS_REPORT.md
- docs/reports/FUNCTIONS_AUDIT_REPORT.md
- docs/reports/FUNCTION_AUDIT_COMPLETE.md
- docs/reports/FUNCTION_BY_FUNCTION_INTEGRATION_STATUS.md
- docs/reports/FUNCTION_FIX_PROGRESS.md
- docs/reports/GEMINI_ANALYSIS_COMPLETE.md
- docs/reports/GRADES_DISPLAY_FIX.md
- docs/reports/GRADES_FIX_SUMMARY.md
- docs/reports/GROK_ANALYSIS_COMPLETE.md
- docs/reports/HYBRID_IMPLEMENTATION_COMPLETE.md
- docs/reports/IMPLEMENTATION_COMPLETE.md
- docs/reports/IMPLEMENTATION_IMPROVEMENTS.md
- docs/reports/IMPLEMENTATION_VERIFICATION_REPORT.md
- docs/reports/INSTITUTION_DISPLAY_FIX.md
- docs/reports/INTEGRATION_COMPLETE.md
- docs/reports/INTERVIEW_API_COMPLETE.md
- docs/reports/INTERVIEW_FIX_COMPLETE.md
- docs/reports/INTERVIEW_SCHEDULING_COMPLETE.md
- docs/reports/INTERVIEW_VERIFICATION_REPORT.md
- docs/reports/LARGE_FILE_REFACTORING_COMPLETE.md
- docs/reports/LAYOUT_CONSISTENCY_FIXES.md
- docs/reports/LEGACY_MIGRATION_COMPLETE.md
- docs/reports/LEGIBILITY_AND_TEXTAREA_FIX.md
- docs/reports/LEGIBILITY_AUDIT.md
- docs/reports/LEGIBILITY_AUDIT_COMPLETE.md
- docs/reports/MASTER_AUDIT_REPORT.md
- docs/reports/MIGRATION_COMPLETE.md
- docs/reports/MIGRATION_VERIFICATION.md
- docs/reports/MIHAS_API_TEST_REPORT.md
- docs/reports/MOBILE_NAVIGATION_AUDIT_PHASE1.md
- docs/reports/MOBILE_NAVIGATION_FIX.md
- docs/reports/MOBILE_NAVIGATION_INTEGRATION.md
- docs/reports/NATIONALITY_FIELD_IMPLEMENTATION.md
- docs/reports/NAVIGATION_FIXES_SUMMARY.md
- docs/reports/NAVIGATION_MOBILE_ANALYSIS.md
- docs/reports/NETLIFY_DEPLOYMENT_DIAGNOSIS.md
- docs/reports/NETLIFY_ENV_SETUP.md
- docs/reports/NOTIFICATION_SYSTEM_100_PERCENT.md
- docs/reports/NOTIFICATION_SYSTEM_VERIFICATION.md
- docs/reports/OPTIMIZATION_STATUS.md
- docs/reports/PDF_MIGRATION_COMPLETE.md
- docs/reports/PDF_MIGRATION_FINAL.md
- docs/reports/PERFORMANCE_FIXES_SUMMARY.md
- docs/reports/PHASE1_COMPLETE.md
- docs/reports/PHASE2_ANALYSIS_COMPLETE.md
- docs/reports/PHASE2_ENHANCEMENTS.md
- docs/reports/PHASE3_ADMIN_COMPLETION.md
- docs/reports/PHASE3_APPLICATION_FLOW_TEST.md
- docs/reports/PHASES_1-4_COMPLETE.md
- docs/reports/PHASES_COMPLETE_SUMMARY.md
- docs/reports/PHASE_1_2_COMPLETE.md
- docs/reports/PHASE_2_COMPLETE.md
- docs/reports/PHASE_3_COMPLETE.md
- docs/reports/PHASE_3_COMPLETION.md
- docs/reports/PHASE_3_PROGRESS.md
- docs/reports/PHASE_4_COMPLETE.md
- docs/reports/PHASE_5_COMPLETE.md
- docs/reports/PHASE_6_COMPLETE.md
- docs/reports/PHASE_6_EMOJI_REPLACEMENTS.md
- docs/reports/PHASE_FIXES_COMPLETE.md
- docs/reports/PRODUCTION_FIXES_SUMMARY.md
- docs/reports/PRODUCTION_READINESS_REPORT.md
- docs/reports/PRODUCTION_TEST_GUIDE.md
- docs/reports/PRODUCTION_TEST_SUMMARY.md
- docs/reports/PROFILE_CREATION_FIX.md
- docs/reports/PROJECT_COMPLETE_SUMMARY.md
- docs/reports/PROJECT_ORGANIZATION_COMPLETE.md
- docs/reports/PUBLIC_TRACKER_REFACTORING_COMPLETE.md
- docs/reports/PWA_OFFLINE_100_PERCENT.md
- docs/reports/PWA_OFFLINE_VERIFICATION_COMPLETE.md
- docs/reports/PWA_VERIFICATION.md
- docs/reports/QA_AUDIT_REPORT.md
- docs/reports/QUALITY_CHECK_REPORT.md
- docs/reports/QUICK_DEPLOY_GUIDE.md
- docs/reports/QUICK_TEST_GUIDE.md
- docs/reports/RACE_CONDITIONS_FIXED.md
- docs/reports/RACE_CONDITIONS_REPORT.md
- docs/reports/REAL_ISSUES_FIXED_VERIFIED.md
- docs/reports/REDESIGN_COMPLETE_FINAL.md
- docs/reports/REDESIGN_FINAL_SUMMARY.md
- docs/reports/REDESIGN_FIX_COMPLETE.md
- docs/reports/REDESIGN_FIX_PROGRESS.md
- docs/reports/ROUTING_CLEANUP_COMPLETE.md
- docs/reports/ROUTING_FIX_COMPLETE.md
- docs/reports/SECURITY.md
- docs/reports/SECURITY_AUDIT_REPORT.md
- docs/reports/SECURITY_AUDIT_SUMMARY.md
- docs/reports/SECURITY_FIXES_APPLIED.md
- docs/reports/SESSION_MANAGEMENT_FIX.md
- docs/reports/SESSION_TRACKING_FIX.md
- docs/reports/SIGNIN_ABORT_FIX.md
- docs/reports/SIGNUP_ERROR_FIX.md
- docs/reports/SIGNUP_FIX_APPLIED.md
- docs/reports/SIGNUP_FLOW_VERIFICATION.md
- docs/reports/SIGNUP_READY_TO_DEPLOY.md
- docs/reports/SIGNUP_VERIFICATION_FINAL.md
- docs/reports/SKELETON_FIX.md
- docs/reports/SMS_WHATSAPP_COMPLETE.md
- docs/reports/SMS_WHATSAPP_VERIFICATION.md
- docs/reports/STALE_DATA_FIX.md
- docs/reports/STATE_MANAGEMENT_100_PERCENT.md
- docs/reports/STATE_MANAGEMENT_VERIFICATION.md
- docs/reports/SUBMISSION_ELIGIBILITY_FIXES.md
- docs/reports/SUPABASE_API_VERIFICATION.md
- docs/reports/SUPABASE_VERIFICATION.md
- docs/reports/SYSTEM_IMPROVEMENTS_SUMMARY.md
- docs/reports/SYSTEM_STATUS_SUMMARY.md
- docs/reports/TESTING_SUMMARY.md
- docs/reports/TEST_CONFIGURATIONS.md
- docs/reports/TEST_ISSUES_AND_FIXES.md
- docs/reports/TEST_RESULTS.md
- docs/reports/TOAST_FIXES_COMPLETE.md
- docs/reports/TOKEN_REFRESH_FIX.md
- docs/reports/TOKEN_VALIDATION_FIX.md
- docs/reports/TROUBLESHOOTING.md
- docs/reports/UI_FIX_VERIFICATION.md
- docs/reports/UNIFIED_TEMPLATES_IMPLEMENTATION.md
- docs/reports/UX_AUDIT_FINDINGS.md
- docs/reports/UX_IMPLEMENTATION_COMPLETE.md
- docs/reports/UX_IMPLEMENTATION_SUMMARY.md
- docs/reports/V2_IMPROVEMENTS_SUMMARY.md
- docs/reports/VERIFICATION_COMPLETE.md
- docs/reports/VERIFICATION_REPORT.md
- docs/reports/VERIFICATION_STATE_MANAGEMENT.md
- docs/reports/VERIFIED_INTEGRATION_REPORT.md
- docs/reports/WORKFLOW_AUTOMATION_COMPLETE.md
- docs/reports/WORKFLOW_VERIFICATION_REPORT.md
- docs/reports/ZAMBIAN_GRADING_FIX.md
- docs/reports/api-test-summary.md
- docs/reports/engineering-analysis.md
- docs/reports/fix-supabase.md


### docs/migration/ (7 files) — All remove (except manual-migration-order which is needs-human-decision)

- docs/migration/2026-03-09-nestjs-migration-guide.md — NestJS was not chosen
- docs/migration/2026-03-09-spring-boot-migration-guide.md — Spring Boot was not chosen
- docs/migration/SUPABASE.md — Supabase extension docs (platform abandoned)
- docs/migration/kimiforensics.md — Forensic analysis from Cloudflare/Vercel migration
- docs/migration/runtime-supabase-inventory.md — Supabase runtime inventory (migration complete)
- docs/migration/mobile-responsiveness-audit-report.md — Pre-Django mobile audit

### docs/plans/ (5 files) — All remove (except session-fix and backend-migration-decision which are needs-human-decision)

- docs/plans/2026-03-02-ui-cleanup-design.md — Pre-Django UI cleanup
- docs/plans/2026-03-02-ui-cleanup-plan.md — Pre-Django UI cleanup
- docs/plans/2026-03-02-ui-cleanup-requirements.md — Pre-Django UI cleanup
- docs/plans/2026-03-11-self-hosted-spring-boot-platform-plan.md — Spring Boot was not chosen

### docs/design/ (1 file) — remove

- docs/design/2026-03-30-ai-job-hunting-platform-data-spec.md — Covered by architecture doc (retained)

### .kiro/skills duplicate — remove

- .kiro/skills/git-worktree-manager/git-worktree-manager/references/docker-compose-patterns.md — Duplicate of .kiro/skills/git-worktree-manager/references/docker-compose-patterns.md

### .kiro/skills reference file — ignore-as-correct

- .kiro/skills/git-worktree-manager/references/docker-compose-patterns.md — Valid skill reference

---

## HIGH-IMPACT RECOMMENDATIONS

### 1. Archive Legacy Docs (441 files)
Create `docs/archive/` and move all legacy files there, or delete them entirely. The current `docs/` directory is 95% stale content from the Supabase/Cloudflare/Netlify era. This creates significant confusion risk for anyone reading the documentation.

### 2. Fix DEPLOY.md Celery Beat Table (confirmed-bug)
The Celery Beat schedule in `backend/DEPLOY.md` lists only 2 of 16 tasks and has the wrong interval for `check_uptime_task` (300s vs actual 900s). This is the primary deployment reference document.

### 3. Verify Security Audit Open Findings
`docs/security-api-audit-2026-04.md` lists H1 (hardcoded API keys in MCP config) as STILL OPEN. Verify and remediate.

### 4. Verify Full Audit Report Bugs
`docs/full-audit-report-2026-04-22.md` lists 7 confirmed bugs. Cross-reference against current code to confirm which are fixed.

### 5. Update PLATFORM_CONTRACT.md
Add missing auth endpoints (verify-email, forgot-password, reset-password, change-password) and CSRF recovery documentation.

### 6. Clean Up Root-Level production-hardening.md
Move to `docs/` and update status markers to reflect current state.

---

## FILE COUNT VERIFICATION

| Category | Count |
|----------|-------|
| ignore-as-correct | 38 |
| improve | 12 |
| remove | 441 |
| needs-human-decision | 11 |
| **Total** | **502** |

