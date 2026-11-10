# Task 1.4 Evidence — Unify `ApiClient` request, refresh, CSRF, retry, abort, and error handling

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

_Requirements: R9.1-R9.2, R14.4, R17.1 · Findings: API-01, API-03_
_Required_Evidence: client unit/property test outputs and (where the task-0.4 harness supports it) an expired-session browser journey._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`)
- Candidate: working-tree changes on top of the base commit (frontend-only; no schema change, so no schema fingerprint applies to this slice).
- Captured: 2026-07-15 (UTC).

## What already existed (in-flight partial work)

Task 1.4 had already landed a substantially complete unified `ApiClient`. `apps/admissions/src/services/client.ts` was rewritten into a single request/response pipeline shared by every method, delegating to focused modules:

- `services/httpClient.ts` — `API_BASE`, `parseJsonSafely`, `normalizeHeaders`, `getBaseHeaders`, `unwrapApiResponse` (the strict V2 `{success,data}` envelope contract from task 1.3), `ApiRequestOptions`.
- `services/authInterceptor.ts` — `AuthenticationError`, `isAuthExcludedEndpoint`, and the deduplicated `attemptRefresh()`/`refreshAuthSession()` (module-level `refreshPromise` lock so N concurrent 401s serialize to one refresh; `dispatchAuthRecovered()` on success).
- `services/csrf.ts` — `recoverCsrfAndRetry()` using `?refresh_csrf=1` (query param, not a custom header, to avoid cross-origin preflight) per tech.md.
- `services/retry.ts` — `isRetryableFailure`, `MAX_RETRIES`, `RETRY_DELAYS`, `createTimeoutController` (timeout + external-signal linking), `getTimeoutForEndpoint`.

The unified `executeRequest()` already implemented, correctly:
- one fetch path for GET/POST/PUT/PATCH/DELETE (no separate GET path);
- CSRF capture from the `X-CSRF-Token` response header on every method;
- 401 → single deduplicated refresh → replay;
- the **R9.2 replay guard**: safe methods (GET/HEAD/OPTIONS) or requests carrying an `Idempotency-Key` are replayed after refresh; unsafe methods without an idempotency key are **not** blindly replayed — they throw a stable `REFRESH_NO_REPLAY` error (`status:401`, `refreshed:true`);
- 403 CSRF recovery (CSRF-coded, state-changing only) via `?refresh_csrf=1`;
- stable backend codes preserved (`NO_REFRESH_TOKEN`/`TOKEN_EXPIRED` differentiation is on the backend refresh view; the client differentiates 401 refresh from 403 permission/ CSRF);
- cancellation/timeouts preserved (external `AbortSignal` linked to the timeout controller; timeout surfaces a retryable `TimeoutError`).

The in-flight tests that codify the corrected behavior were already present and passing:
`tests/unit/apiClientUnified.test.ts` (16), `tests/unit/apiClient401Retry.test.ts` (7), `tests/property/apiClient.property.test.ts` (24).

## The 3 failing tests and the disposition of each

Baseline finding **BL-0.5-03** (`docs/v2-evidence/0.5/baseline-findings.md`) recorded these three as the in-flight task-1.4 failures. Each was diagnosed against the corrected V2 design:

### 1. `tests/property/refreshDeduplication.property.test.ts` — Property 7 → STALE ASSERTION (test updated)
- **Symptom:** `refreshCalls.length === 1` passed (dedup works), but `fulfilled.length === n` failed (0 fulfilled). Counterexample `[2]`.
- **Root cause:** the test fired N concurrent **POST** requests and expected all to be replayed after refresh. Under R9.2 the client correctly refuses to blindly replay unsafe methods without an idempotency key (`REFRESH_NO_REPLAY`), so the POSTs rejected. This is a pre-R9.2 (spec `single-source-of-truth-consolidation`) expectation that contradicts task 1.4's explicit "prevent blind unsafe-method replay".
- **Fix (test):** the concurrent requests now use **GET** — the canonical safe/replayable dedup scenario (expired cookie → several in-flight reads → one refresh → all replay). The core property ("N concurrent 401s produce exactly 1 refresh call") is unchanged and still asserted. Unsafe-method non-replay is covered by `apiClientUnified.test.ts`.
- **Not a client regression:** dedup + safe replay were already correct.

### 2. `tests/property/test_bug4_preservation.test.ts` — Property 2b → STALE ASSERTION (test updated)
- **Symptom:** POST/PUT/PATCH/DELETE returned `REFRESH_NO_REPLAY` instead of being replayed. Counterexample `["POST","/applications/"]`.
- **Root cause:** the property asserted that a state-changing request is replayed exactly once after refresh — again the pre-R9.2 blind-replay expectation.
- **Fix (test):** each request now supplies an `Idempotency-Key`, which is the idempotency guarantee R9.2 requires for an unsafe method to be safely replayed. The property's identity ("retries exactly once") is preserved; it now correctly demonstrates single-retry **with** an idempotency guarantee. Property 2a (CSRF 403 does not trigger refresh) was already passing and is unchanged.
- **Not a client regression:** the no-key path (`REFRESH_NO_REPLAY`) is the intended R9.2 behavior.

### 3. `tests/unit/sessionHardening.test.ts` — source-string assertion → REAL HARDENING (client updated)
- **Symptom:** `expect(client.ts source).toContain('isPermissionDenial')` failed — the rewrite dropped the helper's use, even though `isPermissionDenial` remains the codebase-wide 403 classifier (`hooks/auth/authQueries.ts`, `applicationWizard/hooks/useApplicationFileUploads.ts`).
- **Disposition:** rather than weaken the test, the client's 403 branch was made explicit. A genuine permission denial (`INSUFFICIENT_PERMISSIONS` or any non-CSRF 403) is now classified via `isPermissionDenial(status, code)` and logged as an authorization error that must never trigger refresh, CSRF recovery, or logout; only a CSRF-coded 403 on a state-changing method takes the recovery branch. This is behavior-preserving (403s never logged out before) and re-aligns `client.ts` with the rest of the codebase's 403 handling.

## Client change (only production change in this slice)

`apps/admissions/src/services/client.ts`:
1. Import extended to `import { shouldDispatchAuthFailure, isPermissionDenial } from '@/lib/sessionHardening'`.
2. The 403 block now leads with an explicit permission-denial guard (`if (403 && isPermissionDenial(...)) { debug-log; }`) and the existing CSRF-recovery block became the `else if`. No behavior change for CSRF 403 (isPermissionDenial returns `false` for CSRF codes) or generic 403 (still surfaced as an enhanced authorization error, no logout).

No change to the envelope contract, refresh dedup, replay guard, retry/timeout/abort, or CSRF recovery mechanics. No second frontend compatibility union introduced.

## Verification (exact commands, from `apps/admissions/`)

| Command | Result | Raw |
|---|---|---|
| `bun x vitest run tests/property/refreshDeduplication.property.test.ts tests/property/test_bug4_preservation.test.ts tests/unit/sessionHardening.test.ts tests/unit/apiClientUnified.test.ts tests/unit/apiClient401Retry.test.ts tests/property/apiClient.property.test.ts` | **6 files / 76 tests passed** | `raw/client-core-tests.txt` |
| `bun x vitest run` (14 client/auth/csrf/refresh suites + `architectureEnforcement`) | **15 files / 94 tests passed** | `raw/client-auth-csrf-suite.txt` |
| `bun run type-check` (`tsc -p tsconfig.build.json --noEmit`) | **PASS** (exit 0) | `raw/type-check.txt` |
| `bun run lint` | **24 errors (exit 1) — unchanged from baseline BL-0.5-04**; 0 new; my 3 changed files lint clean | `raw/lint.txt` |

Lint note (R14.3): the 24 errors are the pre-existing baseline (18 `no-restricted-imports` from the task-1.5 architecture rule flagging wizard files awaiting migration + 6 `unused-eslint-disable` in wizard/task-0.4 harness files). `client.ts` is the allowed importer; adding `isPermissionDenial` from `@/lib/sessionHardening` introduces no violation. `git diff --quiet HEAD` confirms `sessionHardening.test.ts` is byte-identical to HEAD; the other restored/edited files show only the expected coherent deltas.

## Deferred / operator-gated (honest status per R1.5)

- **Expired-session browser journey:** the task-0.4 harness (`tests/harness-e2e/`) currently contains only the smoke spec and the four gate-check specs; it has **no** expired-session journey spec yet, and the full harness stack (Postgres/Redis/object-storage/backend/preview) is not provisioned in this execution environment. The authoritative student expired-refresh browser journey lands with the Phase 6/13 journey matrix (design §16.1). This required-evidence item is therefore **deferred**, not claimed. The client-level expired-cookie GET/mutation, concurrent-refresh, and network behaviors are fully covered by the unit/property suites above.
