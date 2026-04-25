# Admin Applications UX Audit

**Date:** 2026-04-25
**Auditor:** Kiro UX Audit Agent
**Scope:** All admin application management files in `apps/admissions/`
**Files reviewed:** 15 files (13 requested + FiltersPanel.tsx + BulkActionsBar.tsx)

---

## Executive Summary

The admin applications surface is **functional but bloated**. It ships a working triage flow with filters, bulk actions, detail modal, and export — but suffers from dead code, duplicated components, missing keyboard navigation, accessibility gaps in the modal, and a detail view that buries critical decision controls below the fold. The biggest UX risk is that admins performing high-volume triage will fight the interface rather than flow through it.

---

## P0 — Broken or Severely Degraded

### P0-1: Two completely different filter components exist — only one is used

**Files:**
- `ApplicationsFilters.tsx` (lines 1–196) — **dead code, never imported by Applications.tsx**
- `FiltersPanel.tsx` (lines 1–168) — the actual component used

**Problem:** `ApplicationsFilters.tsx` has a completely different prop interface (`onSearchChange`, `onStatusFilterChange`, `sortBy`, `sortOrder`, `dateRange`, etc.) that doesn't match the `useApplicationFilters` hook. It is never imported. It also hardcodes program options (`Clinical Medicine`, `Environmental Health`, `Registered Nursing`) and institution options — duplicating the same hardcoded lists in `FiltersPanel.tsx`.

**Impact:** Any developer touching filters will waste time on the wrong file. The dead component also has features (date range, sort controls) that the live `FiltersPanel` lacks — suggesting an incomplete migration.

**Fix:** Delete `ApplicationsFilters.tsx`. If date range and sort controls are needed, add them to `FiltersPanel.tsx` using the same `onFilterChange` pattern.

---

### P0-2: `ApplicationsCards.tsx` is dead code with a stale interface

**File:** `ApplicationsCards.tsx` (lines 1–195)

**Problem:** This component defines its own local `ApplicationWithDetails` interface (missing `payment_status`, `fee_waiver`, `pending_amendments`, etc.) and is never imported by `Applications.tsx`. The main page uses `ApplicationsTable` → `ApplicationCard` and `VirtualizedApplicationsGrid` → `ApplicationCard`. The `ApplicationsCards` component also calls `onUpdateStatus` without any confirmation dialog — approve/reject happen on a single click with no guard.

**Impact:** Dead code that will confuse contributors. The unguarded approve/reject is a safety hazard if anyone accidentally wires this up.

**Fix:** Delete `ApplicationsCards.tsx`. The `ApplicationCard` component is the canonical card renderer.

---

### P0-3: `BulkOperations.tsx` is dead code — `BulkActionsBar.tsx` is the live component

**File:** `BulkOperations.tsx` (lines 1–250)

**Problem:** `Applications.tsx` imports `BulkActionsBar` from `./BulkActionsBar`, not `BulkOperations`. The `BulkOperations` component has a different API (`onStatusUpdate`, `onPaymentUpdate`, `onSendEmail`) and includes disabled "Export Selected" and "Generate Report" buttons that promise features that don't exist.

**Impact:** Dead code. The `QuickFilters` sub-component exported from this file is also unused.

**Fix:** Delete `BulkOperations.tsx` and its `QuickFilters` export. If bulk payment update or bulk email are needed, add them to `BulkActionsBar`.

---

### P0-4: Detail modal approval actions are below the fold — admins must scroll past everything to act

**File:** `ApplicationDetailModal.tsx` (footer section, ~line 380+)

**Problem:** The `ApplicationApprovalActions` component (approve/reject/payment controls) is rendered inside the modal **footer**, after the close button. On a typical laptop screen, the admin must scroll through personal info, program info, payment info, admin feedback, and amendment requests before reaching the decision controls. The footer is `flex-shrink-0` so it's always visible, but it's crammed into a small space alongside "Send Notification", "Acceptance Letter", and "Finance Receipt" buttons.

**Impact:** The single most important admin action (approve/reject) is the hardest to reach. This is backwards for a triage workflow.

**Fix:** Move `ApplicationApprovalActions` to a sticky sidebar or to the top of the overview tab, directly below the quick stats cards. The footer should only contain "Close" and secondary document-generation actions.

---

### P0-5: Modal has no keyboard navigation between tabs

**File:** `ApplicationDetailModal.tsx` (tabs section, ~line 260–285)

**Problem:** The tab buttons use `onClick` handlers but have no `role="tablist"` / `role="tab"` / `role="tabpanel"` ARIA pattern. There is no arrow-key navigation between tabs. `aria-selected` is set but `tabIndex` is not managed (all tabs are in the tab order instead of only the active one). Screen readers cannot identify this as a tab interface.

**Impact:** Keyboard-only users and screen reader users cannot efficiently navigate the detail modal. WCAG 2.1 Level A failure (4.1.2 Name, Role, Value).

**Fix:** Implement the WAI-ARIA tabs pattern: `role="tablist"` on the container, `role="tab"` on each button, `role="tabpanel"` on each content area, `aria-controls`/`aria-labelledby` linkage, and arrow-key navigation with roving `tabIndex`.


---

## P1 — Significant Friction

### P1-1: Hardcoded program and institution options in filters

**Files:**
- `FiltersPanel.tsx` (lines 113–120, 133–138)
- `ApplicationsFilters.tsx` (lines 148–153, 160–165) — dead code, same problem

**Problem:** Program options (`Clinical Medicine`, `Environmental Health`, `Registered Nursing`) and institution options (`Kalulushi Training Centre`, `Mukuba Institute of Health and Allied Sciences`) are hardcoded strings. If a new program or institution is added to the catalog, the filter dropdowns won't show it.

**Fix:** Fetch distinct program/institution values from the API (or derive them from the loaded applications) and populate the dropdowns dynamically.

---

### P1-2: No keyboard shortcuts for power users

**Files:** `Applications.tsx`, `ApplicationDetailModal.tsx`

**Problem:** There are zero keyboard shortcuts anywhere in the admin applications flow. No `Ctrl+K` for search focus, no `J/K` for navigating between applications, no `E` to open details, no `A/R` for approve/reject. The `VirtualizedApplicationsGrid` has arrow-key navigation for rows, but the non-virtualized `ApplicationsTable` (used for ≤100 apps) does not.

**Impact:** Admins processing 50+ applications per session are forced to mouse-click every interaction.

**Fix:** Add at minimum: `/` or `Ctrl+K` to focus search, `Escape` to close modal (already works via `useEscapeKey`), and `J/K` navigation in the application list. Consider `A` for approve, `R` for reject when the detail modal is open.

---

### P1-3: `window.confirm()` used for payment warning force-override

**File:** `Applications.tsx` (lines 240–247, inside `handlePaymentStatusUpdate`)

**Problem:** When a payment status update returns a warning (no payment proof uploaded), the code uses `window.confirm()` — a blocking browser dialog that cannot be styled, has no accessibility metadata, and looks broken on mobile. Every other confirmation in the codebase uses `ConfirmAlertDialog` or a custom dialog.

**Fix:** Replace `window.confirm()` with the same `ConfirmAlertDialog` pattern used in `ApplicationApprovalActions.tsx`.

---

### P1-4: Double toast on status/payment updates — parent and child both fire

**Files:**
- `Applications.tsx` (`handleStatusUpdate` ~line 218, `handlePaymentStatusUpdate` ~line 243)
- `ApplicationsTable.tsx` (`handleStatusUpdate` ~line 58, `handlePaymentUpdate` ~line 68)

**Problem:** `Applications.tsx` wraps `updateStatus` with a toast notification. Then `ApplicationsTable.tsx` wraps the same call with its own toast. When a status update succeeds from the table view, the user sees two success toasts stacked.

**Fix:** Remove the toast from `ApplicationsTable.tsx` — let the parent `Applications.tsx` be the single source of user feedback.

---

### P1-5: FeeWaiverDialog renders inline, not as a proper modal overlay

**File:** `ApplicationDetailPayment.tsx` (`FeeWaiverDialog`, lines 130–170)

**Problem:** The `FeeWaiverDialog` renders as a plain `<div>` inside the overview tab content. It has no overlay, no focus trap, no escape-to-close, and no `role="dialog"`. It appears inline between the fee waiver badge and the personal information section, which is visually confusing. The buttons use raw `<button>` elements instead of the `Button` component.

**Fix:** Convert to a proper dialog overlay (or use the existing `Dialog` component from `@/components/ui`). Add focus trap and escape handling. Use `Button` for consistency.

---

### P1-6: Admin feedback textarea has no character limit or validation feedback

**File:** `ApplicationDetailModal.tsx` (~line 340–370, admin feedback section)

**Problem:** The admin feedback `<textarea>` has no `maxLength`, no character counter, and no `aria-describedby` for validation. The "Save Feedback" button is disabled when the textarea is empty but there's no visual indication of why. If the save fails, the error is silently logged via `logApiError` with no user-facing feedback.

**Fix:** Add `maxLength` (e.g., 2000), a character counter, and a toast or inline error on save failure.

---

### P1-7: Export buttons don't indicate total record count being exported

**File:** `Applications.tsx` (export section, ~lines 310–345)

**Problem:** The export buttons say "CSV", "Excel", "PDF" with no indication of how many records will be exported. The export streams all pages matching current filters, which could be thousands of records. The only feedback is a generic "Preparing export" toast.

**Fix:** Show the `pagination.totalCount` near the export buttons (e.g., "Export 1,247 applications") so admins know what they're downloading. Add a progress indicator for large exports.

---

### P1-8: Mobile admin experience is degraded — view toggle hidden, filters require extra tap

**File:** `Applications.tsx` (lines 290–310)

**Problem:** The cards/table view toggle is `hidden sm:flex` — mobile users are locked into whatever the default view is (cards). The filter panel requires tapping a filter icon to reveal, but there's no visual indicator of active filters on the toggle button. The `AdminMetrics` component renders above the filters, pushing the actual application list far down the viewport.

**Fix:** Show the view toggle on mobile (perhaps as a dropdown). Add a badge count to the filter toggle button showing active filter count. Consider collapsing `AdminMetrics` on mobile or moving it to a slide-out panel.

---

### P1-9: `handleViewDocuments` opens multiple browser tabs simultaneously

**File:** `Applications.tsx` (lines 195–210, `handleViewDocuments`)

**Problem:** When an admin clicks "View Documents" in the modal, the code calls `window.open()` in a loop for each document. Most browsers will block the second+ popup. The function also filters out URLs containing `supabase` (a legacy check) which could silently hide valid documents if the URL format changes.

**Fix:** Open documents in a single new tab with a document viewer, or show them inline in the Documents tab (which already exists and works). Remove the `supabase` URL filter — it's a stale migration artifact.

---

### P1-10: Metrics section is duplicated — `PageShell.metrics` AND `AdminMetrics` AND quick stats cards

**File:** `Applications.tsx` (lines 280–340)

**Problem:** The page renders three separate metrics sections:
1. `PageShell` `metrics` prop (Portfolio, Decision queue, Payment proof review, Approved)
2. `AdminMetrics` component (unknown content — imported but not audited)
3. Quick Stats Cards grid (Today, Decision Queue, Proof Review, Payment Follow-up)

This is 12+ metric cards before the admin even sees the first application. On mobile, this pushes the application list below the fold entirely.

**Fix:** Consolidate into a single metrics row. The `PageShell` metrics prop is the cleanest approach — remove the other two or collapse them behind a "Show details" toggle.

---

### P1-11: `QuickActionsPanel.tsx` has permanently disabled buttons

**File:** `QuickActionsPanel.tsx` (lines 95–105)

**Problem:** The "Export Data" button is permanently `disabled` with `title="Coming soon"`. This is a production admin panel, not a demo. Disabled buttons with "coming soon" tooltips erode trust.

**Fix:** Either implement the export (the main Applications page already has export) or remove the button entirely. Link to the Applications page export if that's the intent.


---

## P2 — Polish

### P2-1: Grade color logic has identical branches

**File:** `ApplicationDetailModal.tsx` (`GradesDisplay`, ~line 75–80)

**Problem:** The grade badge color logic has two identical branches:
```
normalized <= 3 ? 'bg-green-100 text-green-900' :
normalized <= 6 ? 'bg-green-100 text-green-900' :
'bg-red-100 text-red-900'
```
Grades 1–3 and 4–6 both render green. This is likely a bug — grades 4–6 should probably be yellow/amber to distinguish "good" from "average" in the Zambian ECZ grading system.

**Fix:** Use three tiers: green (1–2), amber (3–4), red (5–9).

---

### P2-2: Document verification status badge uses green for "pending"

**File:** `ApplicationDetailDocuments.tsx` (lines 40–50, 60–70)

**Problem:** The document icon background and status badge both use `bg-green-100` for `pending` verification status — the same color as `verified`. An admin scanning documents cannot visually distinguish verified from pending at a glance.

**Fix:** Use `bg-amber-100` / `text-amber-800` for pending status, reserving green exclusively for verified.

---

### P2-3: Timeline status icons don't cover all application statuses

**File:** `ApplicationDetailTimeline.tsx` (lines 50–60)

**Problem:** The timeline only has icons for `approved`, `rejected`, `under_review`, and a generic fallback. The extended state machine includes `waitlisted`, `conditionally_approved`, `enrolled`, `withdrawn`, `expired`, `enrollment_expired` — all of which render as a generic blue clock icon.

**Fix:** Add distinct icons and colors for at least `waitlisted`, `conditionally_approved`, `enrolled`, and `withdrawn`.

---

### P2-4: `isClient` SSR guard is unnecessary in a Vite SPA

**File:** `ApplicationDetailModal.tsx` (lines 130–135, 170–195)

**Problem:** The modal has an `isClient` state guard with a comment about "hydration mismatch". This is a Vite SPA — there is no server-side rendering and no hydration. The guard adds an unnecessary render cycle (flash of skeleton) on every modal open.

**Fix:** Remove the `isClient` guard and the SSR skeleton entirely.

---

### P2-5: `console.error` used instead of `logApiError` in several places

**Files:**
- `ApplicationDetailModal.tsx` (`handleGenerateAcceptance`, `handleGenerateFinanceReceipt`)
- `BulkOperations.tsx` (`handleStatusUpdate`, `handlePaymentUpdate`, `handleSendEmail`)
- `BulkActionsBar.tsx` (`handleAction`)
- `ApplicationsTable.tsx` (`handleStatusUpdate`, `handlePaymentUpdate`)

**Problem:** These catch blocks use `console.error` instead of the project's `logApiError` utility, which forwards errors to GlitchTip. Errors in these paths will be invisible in production monitoring.

**Fix:** Replace `console.error` with `logApiError` in all catch blocks.

---

### P2-6: Stale Supabase URL filter in document viewing

**File:** `Applications.tsx` (line 197–198)

**Problem:** `handleViewDocuments` filters out URLs containing `supabase` — a reference to a storage provider that was replaced by Cloudflare R2. This is dead logic that could silently hide documents if any URL happens to contain the string "supabase".

**Fix:** Remove the Supabase URL filter entirely.

---

### P2-7: `ApplicationDetailHeader` close button uses `XCircle` icon instead of `X`

**File:** `ApplicationDetailHeader.tsx` (lines 35–42)

**Problem:** The close button uses `XCircle` (a filled circle with X) which looks like an error/delete icon. Standard modal close buttons use `X` (plain cross). This is a minor visual inconsistency but could confuse admins who associate the red circle-X with "reject".

**Fix:** Use `X` from lucide-react for the close button.

---

### P2-8: Payment warning dialog in modal lacks focus trap

**File:** `ApplicationDetailModal.tsx` (payment warning dialog, ~line 410–440)

**Problem:** The payment warning confirmation dialog (`paymentWarning` state) renders as a raw `<div>` overlay with no focus trap, no `useEscapeKey`, and no `aria-labelledby`. It sits at `z-[70]` above the modal at `z-[60]`, which is correct for stacking, but keyboard users can tab behind it.

**Fix:** Add `useFocusTrap` and `useEscapeKey` (same pattern used by the main modal). Add `aria-labelledby` pointing to the dialog title.

---

### P2-9: `handleViewHistory` shows a toast instead of navigating to the History tab

**File:** `Applications.tsx` (lines 212–225, `handleViewHistory`)

**Problem:** When called from the modal footer, `handleViewHistory` fetches the application's status history and shows a toast saying "Application has N status changes. Check the application timeline for details." — but doesn't actually switch to the History tab. The admin has to manually click the History tab.

**Fix:** Either auto-switch to the History tab (`setActiveTab('history')`) or remove this function entirely since the History tab already loads the same data.

---

### P2-10: Bulk actions bar has no "Select All" across pages

**File:** `BulkActionsBar.tsx`

**Problem:** The bulk actions bar shows the count of selected items and offers approve/reject/review, but there's no way to "Select all N matching applications" across pages. The select-all in `ApplicationsTable` only selects the currently loaded page.

**Fix:** Add a "Select all {totalCount} matching" link that appears when all loaded items are selected, similar to Gmail's pattern.

---

### P2-11: Marketing copy in an admin tool

**File:** `Applications.tsx` (lines 285–300, glass-panel section)

**Problem:** The page includes a marketing-style panel with feature chips ("High-confidence approvals", "Payment-first decisioning", "Queue visibility") and copy like "Built for fast triage without sacrificing judgment". This is an internal admin tool — admins don't need to be sold on the product they're already using. It wastes vertical space.

**Fix:** Remove the glass-panel marketing section entirely. The `PageShell` subtitle already describes the page purpose.

---

### P2-12: `QuickActionsPanel` uses emoji for section header

**File:** `QuickActionsPanel.tsx` (line 80)

**Problem:** The "System Tools" section header uses `🛠️` emoji while every other header uses Lucide icons. Inconsistent visual language.

**Fix:** Replace with a Lucide icon (e.g., `Wrench` or `Settings`).

---

## Summary Table

| Priority | Count | Theme |
|----------|-------|-------|
| P0 | 5 | Dead code (3), buried decision controls (1), missing ARIA tabs (1) |
| P1 | 11 | Hardcoded data (1), no keyboard shortcuts (1), window.confirm (1), double toasts (1), inline dialog (1), no validation feedback (1), export UX (1), mobile degradation (1), popup blocking (1), metric overload (1), disabled buttons (1) |
| P2 | 12 | Color logic bugs (2), missing status icons (1), unnecessary SSR guard (1), console.error (1), stale filters (1), icon inconsistency (1), missing focus trap (1), toast-instead-of-nav (1), no cross-page select (1), marketing copy (1), emoji (1) |

## Recommended Action Order

1. **Delete dead code** (P0-1, P0-2, P0-3) — immediate, zero risk
2. **Move approval actions above the fold** (P0-4) — highest triage impact
3. **Fix ARIA tabs** (P0-5) — accessibility compliance
4. **Replace window.confirm** (P1-3) — quick win
5. **Fix double toasts** (P1-4) — quick win
6. **Consolidate metrics** (P1-10) — reclaim vertical space
7. **Dynamic filter options** (P1-1) — prevents data drift
8. **Add keyboard shortcuts** (P1-2) — power user productivity
9. **Fix document/payment colors** (P2-1, P2-2) — visual accuracy
10. **Everything else** — in priority order
