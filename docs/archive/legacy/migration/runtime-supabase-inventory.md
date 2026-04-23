# Runtime Supabase/Stub Inventory (Focused Migration Sweep)

Last updated: 2026-02-19

This inventory tracks **runtime-critical** files that still reference Supabase clients or in-file stub clients, with migration classification and sequencing.

## Priority 1 — High-traffic flows

| Flow | File | Evidence | Classification | Migration action |
| --- | --- | --- | --- | --- |
| Application wizard (duplicate prevention) | `src/lib/duplicateApplicationCheck.ts` | Direct `supabase.from('applications')` query in runtime function used by wizard controller dynamic import. | **Replace with API call** | Replace with `/api/applications?action=check-duplicate` via `apiClient.request`, preserving response shape expected by wizard hook. |
| Application wizard (eligibility) | `src/lib/eligibilityEngine.ts` | Multiple `supabase.from(...)` and `supabase.rpc(...)` runtime calls in eligibility checks used by wizard and eligibility components. | **Replace with API call** | Move read/write operations to `api-src/applications.ts`/`api-src/catalog.ts` actions and consume through `applicationService`/`catalogService`. |
| Notifications (signup + admin test flows) | `src/lib/notificationService.ts` | Runtime dedupe and insert paths use `supabase.rpc(...)` and `supabase.from(...)`. | **Replace with API call** | Route all notification preference + enqueue operations through `/api/notifications` endpoints. |
| Admin dashboards (analytics pages/charts/reports) | `src/lib/analytics.ts` | Runtime analytics writes/reads still issue `supabase` table queries. | **Isolate behind feature flag** | Keep disabled by default using `VITE_ENABLE_LEGACY_ANALYTICS=false`; progressively replace with `/api/admin` analytics actions before re-enable. |
| Admin dashboards (automation) | `src/lib/workflowAutomation.ts` | Contains local Supabase stub object and runtime `supabase` access in workflow methods. | **Isolate behind feature flag** | Gate workflow automation routes/components behind `VITE_ENABLE_LEGACY_AUTOMATION=false` until API-backed implementation lands. |

## Priority 2 — Profile/session flow risk

| Flow | File | Evidence | Classification | Migration action |
| --- | --- | --- | --- | --- |
| Profile/session hardening | `src/lib/multiDeviceSession.ts` | Deprecated module still performs direct `supabase` session writes/queries. | **Remove** | Remove module after replacing references in `enhancedSession.ts` with API/session-cookie checks. |
| Profile/session hardening | `src/lib/authSecurity.ts` | Runtime profile/role/audit operations rely on direct `supabase` queries. | **Remove** | Remove in favor of server-validated role/session checks (`/api/auth`, `/api/admin`) and centralized audit logger. |

## Notes

- The modules above are retained for compatibility, but represent the remaining direct runtime Supabase/stub surface in user-facing paths.
- This file is intended to stay updated as each item is migrated or removed.
