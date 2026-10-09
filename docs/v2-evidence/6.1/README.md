# Task 6.1 Evidence — Make profile/settings autosave canonical

_Requirements: R9.3-R9.5, R9.8, R16.5-R16.8_
_Findings: STU-20, STU-10, MAINT-02_
_Design: design.md §8.2 (Frontend Draft Machine — states dirty/saving/saved/offline/conflict; events EDIT/SAVE_DUE/SAVE_NOW/NETWORK_LOST/RESTORED/SERVER_CONFLICT; local records addressed by (user_id, application_id, assignment_id), never authentication secrets); §14.1/§14.2 (envelopes; mutable aggregates expose a version, conflicts surface the current version + safe recovery); §13.1/§13.3 (student IA, light-only visual rules, 44px targets, status colour always paired with icon/label)._
_Required_Evidence (tasks.md): "offline/conflict/profile browser tests at mobile widths" — the logic-level offline/conflict/profile-save coverage is realized here as vitest unit + property tests (debounced autosave, in-memory offline outbox + reconnect flush, bounded retry, version-token conflict + resolution, null-safe reset merge, schema alignment). The **browser** (Playwright) mobile-width runs (320/375/390) are owned by task 13.2 per the spec's E2E/evidence architecture (design §16); this task provides the unit/property substrate they build on._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of the base commit (the whole
  admissions-v2 spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-24 (UTC).
- PBT: task 6.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → empty `pbtResults`; no `6.1` entry). Nothing to record via
  `update_pbt_status`. Property coverage is still provided
  (`profileAutosaveMerge.property.test.ts`) as a standard test.
- Schema: **no schema change**. Frontend-only task. The profile aggregate already
  exposes `updated_at` (backend `ProfileReadSerializer`) which is reused as the
  optimistic version token — no `backend/scripts/*.sql` added, **no schema hash**.
- Backend routes: **untouched**. Profile writes keep flowing through the existing
  app-local `authService.updateProfile` → `PATCH /api/v1/auth/profile/`. No route
  added/changed, so the authority-matrix registry
  (`scripts/authority_matrix_registry.py`) is unchanged and its gate is unaffected
  by 6.1. (Unrelated in-flight `backend/apps/**` edits in the working tree belong
  to other admissions-v2 tasks, not 6.1.)

## The three findings closed

- **STU-20** (P1) — Profile settings used **manual submit** and a
  Settings-owned **`beforeunload` confirm** despite mandatory autosave, plus
  static metrics and duplicate notification tiles. **Fix:** canonical per-section
  autosave (`useProfileSectionAutosave`) with debounce, in-memory offline outbox,
  bounded retry, version-token conflict UI, and explicit per-section save state.
  Manual submit is retired; the fake `PageShell` metrics array and the duplicate
  static "notification delivery" tile grid are removed.
- **STU-10** (P2) — Native `window.confirm` owned the unsaved-changes navigation
  guard. **Fix:** removed. Autosave is the canonical persistence mechanism; the
  single `beforeunload` guard (for genuinely unsynced/queued work) now lives in
  the autosave hook, not the page. Nav actions flush (`saveNow`) then navigate —
  no blocking native dialog.
- **MAINT-02** (P2) — Decorative/fake settings metrics and duplicate notification
  tiles added noise. **Fix:** removed the `metrics={…}` tiles and collapsed the
  three static notification tiles to a single factual delivery-phone line + the
  existing "Open notification preferences" link.

## What 6.1 delivers

| Layer | File | Role |
|---|---|---|
| Pure autosave logic | `apps/admissions/src/lib/profileAutosave.ts` | Framework-neutral helpers: `PROFILE_SECTIONS` (field ownership per section), `sectionForField`, `extractSectionDelta` (dirty-only, holds back invalid fields), `computeBackoffDelay`, `isVersionConflict`, `isUnsyncedStatus`, `isAlignedZambianPhone` (mirrors backend `validate_zambian_phone`), and `buildProfileResetValues` — the **single source of truth** for the audit-production null-safe reset merge (isDirty must not persist after save). |
| Autosave state machine | `apps/admissions/src/hooks/student/useProfileSectionAutosave.ts` | Per-section machine: debounced autosave, **in-memory** offline outbox (never localStorage — R9.5, profile is PII), online/offline flush, bounded retry with exponential backoff, auth-expiry hold, version-token conflict detection + `resolveConflict('reload'|'keep')`, and the single `beforeunload` guard gated on `hasPendingWork`. |
| Page | `apps/admissions/src/pages/student/Settings.tsx` | Rewritten to consume the hook. Watches RHF edits → validates the section → schedules a save of only the valid, dirty section delta. On save success it `resetField`s just the saved fields (null-safe merge) so `isDirty` clears without wiping other sections' in-flight edits. Per-section `SaveIndicator` (icon + label, `aria-live`), offline banner, and a conflict banner with **Reload latest** / **Keep my changes**. Fake metrics + duplicate tiles + `window.confirm` + page-owned `beforeunload` removed. Zod schema aligned to the backend serializer (max-lengths + Zambian phone). |

## Steering constraints honoured

- **Auto-save mandatory / resilient / silent** — autosave is now the canonical
  save path (replacement fully in place before removing manual submit); it
  survives offline via the in-memory outbox and reconnect flush, and retries with
  backoff. No auto-save behaviour was removed without its replacement.
- **Protect unsaved edits before navigation and on `beforeunload`** — retained,
  but ownership moved from the page to the autosave hook (finding STU-20 asked to
  remove the page's ownership). In-app nav flushes queued work first.
- **Accessible inline save feedback in addition to toasts** — `SaveIndicator`
  renders per-section state with a paired icon + label and `role`/`aria-live`
  (assertive for error/conflict, polite otherwise). Status colour is never used
  alone.
- **Audit-production Settings fix preserved** — the null-safe field-by-field
  reset merge is preserved as `buildProfileResetValues`; the
  `settingsDirtyState` / `auditProduction*` suites pass (see below).
- **Canonical UI primitives** — `PageShell`, `SectionCard`, `Button` (no gradient
  variant), Lucide icons, `min-h-touch` targets, light-only, no nested cards.
- **Canonical backend consumption** — app-local `authService.updateProfile` →
  `PATCH /auth/profile/` via the unified `apiClient`; no raw
  `@/services/client` import from the page (R14.3 ESLint rule stays green); no
  forbidden Phase-4 payment-primitive imports (Settings Phase-4 isolation test).

## Required_Evidence

### 1. Task 6.1 autosave tests — `raw/task-6.1-tests.txt`
- `tests/unit/profileAutosave.test.ts` (14) — section ownership, dirty-delta
  extraction with invalid-field hold-back, backoff, version conflict, aligned
  Zambian phone, unsynced-status, and the null-safe merge.
- `tests/unit/useProfileSectionAutosave.test.tsx` (6) — **debounced** autosave,
  edit **coalescing**, **offline** queue + **reconnect flush** (in-memory
  outbox), **retry with backoff** then success, **saveNow** manual flush, and
  **conflict** flag + reload resolution.
- `tests/unit/settingsAutosaveCanonical.test.ts` (6) — page consumes the hook,
  no page-owned `beforeunload`, no `window.confirm`, no fake `metrics={`, fields
  retained, conflict affordances present.
- `tests/property/profileAutosaveMerge.property.test.ts` (4, fast-check) —
  merge always includes every field, never null, string fields stay strings,
  `date_of_birth` is `''` or `YYYY-MM-DD`.

Result: **30 passed** (4 files).

### 2. Audit-production regression — `raw/audit-production-regression.txt`
`auditProductionFixValidation` + `auditProductionPreservation` +
`auditProductionBugCondition` property suites + `settingsDirtyStatePhase4` +
`settingsProfileUpdateFields`: **30 passed** (5 files).

`tests/unit/page-verification/student-settings.test.tsx` was also updated (the
retired manual "Save changes" button assertion is replaced by an assertion that
the page states changes "save automatically", plus an existing control) and
passes.

The three Settings source-grep assertions in `auditProductionPreservation` and
the Bug-1 assertion in `auditProductionBugCondition` were **updated** to the
canonical post-6.1 design: they previously pinned the retired manual-submit +
page-owned-`beforeunload` implementation that task 6.1 supersedes (design §1
precedence). The **underlying invariants are preserved and still asserted** —
the null-safe reset merge now lives in `buildProfileResetValues` (Bug-1 test
retargeted there), server field errors still flow through `setError`, the
unload guard is asserted on the autosave hook, and error/conflict save state
still renders `role="alert"`. The ErrorDisplay, OptimizedImage, and font-chain
assertions in those suites were left untouched and pass unchanged.

### 3. Type-check + lint — `raw/type-check-and-lint.txt`
- `bun run type-check` (`tsc -p tsconfig.build.json --noEmit`): **clean (exit 0)**.
- `eslint` on all changed source + test files: **clean (exit 0)** — includes the
  R14.3 no-raw-client rule and the Phase-4 import-isolation constraint.

A single combined run of all task + regression + adjacent profile suites is
captured in `raw/final-combined-run.txt`: **77 passed** across 12 files.

### 4. Grep-loop review — `raw/grep-loop-review.txt`
Zero `beforeunload` / `window.confirm` / `metrics={` / `variant="gradient"` /
duplicate "In-app inbox" tile / forbidden payment imports in `Settings.tsx`;
the `beforeunload` guard and an in-memory-only outbox (no `localStorage` API) in
the hook; the unchanged `PATCH /auth/profile/` write path; and the schema
alignment markers.

## Verified vs. deferred

- **Verified (this task):** per-section debounced autosave; in-memory offline
  outbox + reconnect flush; bounded retry/backoff; version-token conflict +
  reload/keep resolution; explicit accessible per-section save state; null-safe
  reset merge (no isDirty-after-save); backend schema alignment (max-lengths +
  Zambian phone); removal of page-owned `beforeunload`, `window.confirm`, fake
  metrics, and duplicate notification tiles; type-check + lint + audit-production
  regressions green.
- **Deferred to task 13.2 (E2E):** the actual Playwright browser journeys at
  320/375/390 widths (edit → offline → reconnect sync; two-tab conflict →
  reload/keep; profile-save at mobile widths). The logic is fully covered here at
  the unit/property level; 13.2 owns the browser artifacts (design §16).
- **Owned by task 13.1:** the full admissions build/lint gate over the whole
  in-flight working tree. This task verified `type-check` + `eslint` on its own
  changed files (all clean).

## Canonical truth map

No new domain concept was introduced. Profile fields, statuses, and the
`PATCH /auth/profile/` contract are unchanged; the optimistic version reuses the
existing `updated_at`. No canonical-truth-map registration required.
