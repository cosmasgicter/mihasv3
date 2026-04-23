# Runtime Stability And Loading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the highest-impact runtime defects affecting auth UX, loading states, duplicate work, stale closures, and admin query invalidation consistency.

**Architecture:** Keep the fixes scoped to shared primitives and hot paths so one change removes multiple symptoms. The plan targets four leverage points: auth form primitives, loader surfaces, route/app-shell runtime behavior, and shared hooks with stale closure or invalidation drift.

**Tech Stack:** React 18, React Router 6, TanStack Query 5, Vitest, Vite, TypeScript, Tailwind CSS

---

### Task 1: Restore Auth Form Semantics And Label Visibility

**Files:**
- Modify: `src/components/smoothui/animated-input.tsx`
- Modify: `src/pages/auth/SignInPage.tsx`
- Modify: `src/pages/auth/SignUpPage.tsx`
- Test: `tests/unit/authPageFormMarkup.test.tsx`

**Step 1: Use the existing auth form markup test as the failing test**

Run:

```bash
bunx vitest run tests/unit/authPageFormMarkup.test.tsx
```

Expected: FAIL because the sign-in/sign-up pages no longer render grouped fieldsets/legends and use the wrong form spacing.

**Step 2: Make the `AnimatedInput` label visible above the input**

- Sync floating-label state from controlled values.
- Give the label a stacking/background treatment so the input cannot visually cover it.

**Step 3: Restore grouped auth form structure**

- Add fieldsets and legends back to sign-in and sign-up.
- Keep the improved auth shell, but make the form markup match the intended sections.

**Step 4: Re-run the auth markup test**

Run:

```bash
bunx vitest run tests/unit/authPageFormMarkup.test.tsx
```

Expected: PASS

---

### Task 2: Normalize Loader APIs And Deduplicate Dashboard Loading UI

**Files:**
- Modify: `src/components/ui/UnifiedLoader.tsx`
- Modify: `src/components/ui/LoadingOverlay.tsx`
- Modify: `src/components/ui/LoadingFallback.tsx`
- Add: `src/components/ui/DashboardLoadingState.tsx`
- Modify: `src/pages/admin/Dashboard.tsx`
- Modify: `src/pages/student/Dashboard.tsx`
- Modify: `src/components/admin/applications/modal/DocumentsTab.tsx`
- Modify: `src/components/admin/applications/modal/GradesTab.tsx`
- Modify: `src/components/admin/applications/modal/StatusHistoryTab.tsx`
- Test: `tests/unit/unifiedLoader.test.tsx`

**Step 1: Write a failing loader compatibility test**

- Verify `UnifiedLoader` accepts a legacy `message` prop alias and exposes the same accessible label.
- Verify the shared dashboard loading surface renders the expected page label.

**Step 2: Run the loader test to confirm failure**

Run:

```bash
bunx vitest run tests/unit/unifiedLoader.test.tsx
```

Expected: FAIL before implementation.

**Step 3: Implement the shared loader cleanup**

- Add a backwards-compatible `message` alias to `UnifiedLoader`.
- Introduce a small shared dashboard loading component instead of unsupported `skeleton` props on `UnifiedLoader`.
- Replace duplicated dashboard loading branches with the shared component.

**Step 4: Re-run the loader test**

Run:

```bash
bunx vitest run tests/unit/unifiedLoader.test.tsx
```

Expected: PASS

---

### Task 3: Reduce Route Startup Work And Duplicate Auth Queries

**Files:**
- Modify: `src/App.tsx`
- Add: `src/lib/routeRuntime.ts`
- Modify: `src/components/auth/SessionMonitor.tsx`
- Modify: `src/hooks/auth/useTokenRefresh.ts`
- Test: `tests/unit/routeRuntime.test.ts`
- Test: `tests/unit/sessionMonitor.test.tsx`

**Step 1: Write failing tests for route runtime gating and session monitor behavior**

- Test lightweight route classification for auth pages.
- Test that `SessionMonitor` no longer mounts duplicate role verification work.

**Step 2: Run the new tests**

Run:

```bash
bunx vitest run tests/unit/routeRuntime.test.ts tests/unit/sessionMonitor.test.tsx
```

Expected: FAIL before implementation.

**Step 3: Implement the runtime cleanup**

- Add route classification helper for lightweight public auth routes.
- In `App.tsx`, skip heavy auxiliary UI and the expensive suspense fallback path on lightweight auth routes.
- Remove unused role verification work from `SessionMonitor`.
- Stop `useTokenRefresh` from performing an immediate refresh call on mount when a simple local expiry bootstrap is sufficient.

**Step 4: Re-run the runtime tests**

Run:

```bash
bunx vitest run tests/unit/routeRuntime.test.ts tests/unit/sessionMonitor.test.tsx
```

Expected: PASS

---

### Task 4: Fix Stale Closures In Shared Refresh And Bulk Selection Hooks

**Files:**
- Modify: `src/hooks/useManualRefresh.ts`
- Modify: `src/hooks/admin/useApplicationBulkActions.ts`
- Test: `tests/unit/useManualRefresh.test.tsx`
- Test: `tests/unit/useApplicationBulkActions.test.tsx`

**Step 1: Write failing hook tests**

- `useManualRefresh` should ignore overlapping refresh triggers without depending on a stale `isRefreshing` closure.
- `selectAll` should use current state, not captured selection state.

**Step 2: Run the hook tests**

Run:

```bash
bunx vitest run tests/unit/useManualRefresh.test.tsx tests/unit/useApplicationBulkActions.test.tsx
```

Expected: FAIL before implementation.

**Step 3: Implement minimal fixes**

- Guard refresh concurrency with a ref-backed in-flight flag.
- Convert bulk selection helpers to functional state updates.

**Step 4: Re-run the hook tests**

Run:

```bash
bunx vitest run tests/unit/useManualRefresh.test.tsx tests/unit/useApplicationBulkActions.test.tsx
```

Expected: PASS

---

### Task 5: Deduplicate Admin Application Query Invalidations

**Files:**
- Add: `src/hooks/admin/applicationQueryInvalidation.ts`
- Modify: `src/hooks/admin/useApplicationActions.ts`
- Modify: `src/hooks/admin/useApplicationStatusUpdate.ts`
- Modify: `src/hooks/admin/useApplicationsData.ts`
- Test: `tests/unit/applicationQueryInvalidation.test.ts`

**Step 1: Write a failing helper test**

- Assert the shared invalidation helper targets the expected admin application query keys.

**Step 2: Run the helper test**

Run:

```bash
bunx vitest run tests/unit/applicationQueryInvalidation.test.ts
```

Expected: FAIL before implementation.

**Step 3: Implement the shared invalidation helper**

- Centralize the duplicated invalidation key sets.
- Replace repeated `invalidateQueries` blocks in the admin hooks with the helper.

**Step 4: Re-run the helper test**

Run:

```bash
bunx vitest run tests/unit/applicationQueryInvalidation.test.ts
```

Expected: PASS

---

### Task 6: Full Verification

**Files:**
- Verify only

**Step 1: Run the targeted regression suite**

Run:

```bash
bunx vitest run tests/unit/authPageFormMarkup.test.tsx tests/unit/unifiedLoader.test.tsx tests/unit/routeRuntime.test.ts tests/unit/sessionMonitor.test.tsx tests/unit/useManualRefresh.test.tsx tests/unit/useApplicationBulkActions.test.tsx tests/unit/applicationQueryInvalidation.test.ts
```

Expected: PASS

**Step 2: Run the project type-check**

Run:

```bash
bun run type-check
```

Expected: PASS

**Step 3: Run the production build**

Run:

```bash
bunx --bun vite build
```

Expected: PASS
