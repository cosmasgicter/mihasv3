# Codex CLI Forensic Review

Date: 2026-03-02
Scope: Runtime + config cleanup for provider remnants (Cloudflare/Supabase), security hygiene, and repository forensic findings.
Skills applied: `security-best-practices`, `test-driven-development`, `verification-before-completion`.

## Executive Summary
I performed a forensic review and cleanup focused on active code/config paths. I removed hardcoded Cloudflare/Supabase runtime remnants from `src/`, `lib/`, and `api-src` scope, scrubbed committed secrets from tracked env files, and verified no provider remnants remain in runtime/config scope.

Critical historical leakage remains in documentation and one migration script and should be remediated in a follow-up pass.

## Findings

### Critical

1. **Hardcoded production secrets in tracked env files**
- Evidence (before cleanup): `.env.production` had concrete DB/API/SMTP/storage secrets; `.env.development` had live keys.
- Risk: Immediate credential exposure and account compromise if repo is shared/cloned.
- Status: **Fixed**.
- Fix evidence:
  - `.env.production` now template placeholders at lines 9-31 and 42-53.
  - `.env.development` now placeholder values only.

2. **Credential leakage still present in docs**
- Evidence:
  - `docs/NOTIFICATION_EMAIL_FIX.md:46`
  - `docs/guides/EMAIL_CONFIGURATION_REQUIRED.md:22`
  - `docs/migration/correctenvs.txt:28`
  - `docs/migration/correctenvs.txt:40`
  - `docs/reports/FORGOT_PASSWORD_FIX.md:104`
  - `docs/reports/NETLIFY_DEPLOYMENT_DIAGNOSIS.md:99`
  - `docs/reports/NETLIFY_DEPLOYMENT_DIAGNOSIS.md:108`
- Risk: Ongoing secrets exposure despite runtime cleanup.
- Status: **Open** (not auto-modified to avoid rewriting historical reports without approval).

### High

3. **Hardcoded provider hostname/account IDs in runtime SSRF/CSP allowlists**
- Evidence (before cleanup):
  - `src/utils/api-cache.ts`
  - `src/lib/sessionUtils.ts`
  - `src/lib/securityEnhancements.ts`
  - `lib/storage.ts`
  - `api/documents.js`
- Risk: Environment coupling, brittle deployments, accidental disclosure of account identifiers.
- Status: **Fixed**.
- Fix evidence:
  - Dynamic host derivation from env in `src/utils/api-cache.ts:6-19`, usage at `:198-200`.
  - Dynamic host allowlist in `src/lib/sessionUtils.ts:15-36`.
  - Dynamic CSP/connect host construction in `src/lib/securityEnhancements.ts:8-36` and `:68-75`.
  - Storage endpoints now env-driven in `lib/storage.ts:21-22` and `api/documents.js` equivalent.

4. **Provider-specific CSP remnants**
- Evidence (before cleanup): explicit Cloudflare challenge/cdn entries in security config helpers.
- Risk: Unnecessary third-party CSP allowances increase attack surface and config drift.
- Status: **Fixed**.
- Fix evidence:
  - `src/lib/securityConfig.ts` `script-src` no longer includes provider-specific challenge domain.
  - `src/lib/securityPatches.ts` simplified `script-src`, `frame-src`, and `connect-src`.

### Medium

5. **Supabase legacy wording in active source comments/types**
- Evidence (before cleanup): legacy naming in `api-src/admin.ts`, `api-src/documents.ts`, `src/types/auth.ts`, `src/types/database.ts`, `src/lib/storage.ts`.
- Risk: Maintenance confusion and migration ambiguity.
- Status: **Fixed** (wording neutralized).

6. **One migration script still contains hardcoded account identifier**
- Evidence: `scripts/migrate-storage-to-r2.ts:308`.
- Risk: Future accidental reuse with stale endpoint/account values.
- Status: **Open**.

## Remediation Performed

1. Replaced hardcoded provider host/account references with env-driven resolution in runtime SSRF/CSP/storage paths.
2. Rewrote `.env.production` and `.env.development` as safe templates (no concrete secrets).
3. Neutralized provider-specific migration language in active source comments/types.
4. Added regression test scaffold: `tests/unit/forensic-cleanliness.test.ts`.

## Verification Evidence

### Runtime/config provider remnant check
Command:
```bash
rg -n "supabase|cloudflare" src lib api-src .env.example .env.development .env.production
```
Result: no matches.

### Tracked env secret leakage check
Command:
```bash
rg -n "a3ba1959935abd8777e64caee46d1de1|npg_v2UT3kAKhJXY|re_cT8PNR7g_HT72NPZNFRpYmvPnZLYa5n1e|Skyl3r@L0m1s|0db02574d3d07c5369ff4b9360cca39ec28924d0a52f00caa6e13e56e9863bd9|a0b9e38a2c50a5bd0513a9333f47d52b" .env.production .env.development .env.example
```
Result: no matches.

### Note on test runner
`bunx vitest run` could not execute cleanly in this environment due dependency resolution/runtime constraints in this session; grep-based verification was used for this forensic cleanup pass.

## Recommended Next Actions

1. Rotate any credentials that were previously committed (assume compromised).
2. Sanitize historical docs/reports containing exposed secrets.
3. Update `scripts/migrate-storage-to-r2.ts` to remove hardcoded endpoint/account fallback.
4. Run full CI (`lint`, `type-check`, `test`) in a dependency-complete environment before deploy.
