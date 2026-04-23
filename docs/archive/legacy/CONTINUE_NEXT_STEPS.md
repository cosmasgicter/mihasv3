# MIHAS v3 - Current Next Steps

**Date**: April 9, 2026  
**Current Status**: Public/auth flows, landing performance, and the core student application surfaces have been remediated and re-verified.  
**Focus**: Finish the remaining cleanup and reduce long-term maintenance risk.

---

## Recently Completed

- Public first-load path was reduced so the landing page paints immediately and defers non-critical code.
- Auth and unauthenticated pages were cleaned up for routing, accessibility, and legal/public-link integrity.
- Student dashboard and application flow contracts were hardened across frontend and backend.
- Student Payment, Interview, Application Status, Application Detail, and Settings pages were polished and re-verified.
- Student-facing payment status handling now treats legacy and current payment outcomes consistently.
- Live manual-payment wording and deprecated application payment-field exposure were removed from current runtime surfaces.

---

## Highest-Priority Remaining Work

### 1. Break Up Oversized Student Controllers

The main student flow still has large files that are harder to reason about and test:
- `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts` — 1689 lines
- `apps/admissions/src/pages/student/Dashboard.tsx` — 779 lines

Recommended follow-up:
- split wizard controller into submission, draft restoration, uploads, and navigation hooks
- split dashboard into data orchestration, section rendering, and real-time refresh modules

### 2. Clean Noisy Runtime Logging

There are still many `console.log` / debug-style statements in runtime code, especially around:
- service worker lifecycle
- realtime/SSE utilities
- PWA hooks
- performance helpers

These should be reduced to structured debug logging or removed from production-facing paths.

### 3. Clean Test Harness Warnings

The student page tests are passing, but they still emit avoidable warnings from the harness:
- React `act(...)` warnings in DOM-rendered tests
- SSR `useLayoutEffect` warnings in server-rendered test setups
- mocked component prop passthrough warnings (`helperText`, `loading`)

The assertions are green, but the harness should be cleaned so failing output remains high signal.

### 4. Run Real Browser E2E On The Current Student Flow

Static and unit verification passed, but the current student flow still needs a browser-level pass across:
- registration to dashboard
- draft restore
- Lenco payment confirmation
- submission success
- student status, payment, interview, and settings surfaces on mobile and desktop

Use the updated checklist in `docs/reports/PHASE3_APPLICATION_FLOW_TEST.md`.

### 5. Audit The Remaining Admin UX Surfaces

The student-facing slice is in much better shape now, but the admin side still needs a route-by-route UX audit with the same standard:
- applications review and detail flows
- payment override flows
- fee management
- audit/reporting pages
- any remaining pages that still rely on deprecated payment/application fields

---

## Medium-Term Cleanup

- Enable stricter TypeScript settings incrementally.
- Continue replacing stale direct data assumptions with canonical service-layer helpers.
- Add stronger browser-level regression coverage for the top student and admin journeys.

---

## Recommended Order

1. Refactor `useWizardController.ts`.
2. Refactor `Dashboard.tsx`.
3. Clean runtime logging.
4. Clean test harness warnings.
5. Run browser E2E and mobile QA.
6. Start the admin UX remediation pass.
