# Task 6.3 Evidence — Consolidate draft persistence into one state machine

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

_Requirements: R10.1-R10.4, R10.7-R10.10_
_Findings: STU-02, STU-03, STU-12 (4th clause), MAINT-01_
_Design: design.md §8.2 (Frontend Draft Machine — one machine owns hydration/edit/
autosave/outbox/retry/conflict/delete/pay/submit; states `uninitialized → loading
→ ready.clean ↔ ready.dirty → saving → ready.clean`, `offline.queued → saving`,
`conflict → reload | merge`, `deleting → deleted`, `submitting → submitted |
ready.with_errors`; events `START_NEW/RESUME/EDIT/SAVE_DUE/SAVE_NOW/NETWORK_LOST/
NETWORK_RESTORED/SERVER_CONFLICT/DELETE/PAY/SUBMIT`; local records addressed by
`(user_id, application_id, assignment_id)`, never authentication secrets;
"Cleanup is application-scoped"); §8.1 (application lifecycle); §14.2 (versioned
conflict + reload/merge recovery, never a silent latest-timestamp pick)._
_Steering: `enterprise-tenancy.md` → Student Draft Lifecycle (local snapshots are
recovery caches keyed by user id + application id, never authoritative over the
selected online `Application(status='draft')`; payment-linked drafts cannot be
deleted by cleanup / bulk local-clear); `product.md` Hard Constraints (auto-save
mandatory and resilient — never removed without a replacement; drafts survive
refresh/reconnect/interruption)._

_Required_Evidence (tasks.md): **"model/property tests plus refresh/offline/
two-tab/device-switch E2E"**. The **model/property** half is realized here as
vitest unit + fast-check property tests over the pure state machine and the
single-application-addressed cache adapter. The **browser** (Playwright)
refresh/offline/two-tab/device-switch E2E journeys are owned by task **13.2** per
the spec's E2E/evidence architecture (design §16); the full frontend build/lint
gate over the whole in-flight tree is owned by task **13.1**._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of the base commit (the whole
  admissions-v2 spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-24 (UTC).
- PBT: task 6.3 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults: {}`). Nothing to record via
  `update_pbt_status`. Property coverage is still provided
  (`wizardDraftMachine.property.test.ts`, `draftLocalCache.property.test.ts`) as
  standard fast-check tests.
- Schema: **no schema change** (frontend-only task). No `backend/scripts/*.sql`
  added, **no schema hash**. No backend route added, so
  `scripts/authority_matrix_registry.py` is unchanged and its gate is unaffected
  by 6.3. (The `M backend/**` entries in `git status` belong to other
  admissions-v2 tasks, not 6.3 — the 6.3 change set is 100% under
  `apps/admissions/`.)

## The findings closed / advanced

- **STU-12 (4th clause, = R10.10)** — *"…several single-draft events call
  `clearAllDraftData`, erasing every draft/payment recovery cache."* Explicitly
  deferred here from task **6.2**. **Closed.** `clearAllDraftData()` (which
  removed every draft key for every application **and** deleted the entire
  `beanola-payment-recovery` store in one shot) is **removed**. Cleanup is now
  single-application-addressed and never touches any payment-recovery record.
- **STU-02** — *"Draft state is coordinated by several overlapping autosave and
  persistence owners with local/server timestamp arbitration."* **Advanced.**
  One canonical, tested state machine (`wizardDraftMachine.ts`) now owns the
  draft lifecycle vocabulary; the local-vs-server **timestamp arbitration** in
  the draft loader is **removed** (R10.3). The full decommission of the legacy
  transport owners (`useAutoSave`/`useSmartAutoSave`) is staged — see
  "Verified vs. deferred".
- **MAINT-01** — *"Core files … mix orchestration, validation, persistence, and
  rendering. Add characterization tests, then split by bounded workflow without
  changing behavior."* **Advanced.** The duplicated local-snapshot persistence
  (`persistWizardDraftSnapshot`, previously inlined in **both**
  `useWizardDraftLoader` and `useWizardDraftPersistence`) is extracted to a
  single adapter function; behavior preserved and pinned by tests.
- **STU-03** (wizard coupling) — **advanced** only insofar as the persistence
  layer is now a thin adapter around the machine; the broader wizard UI
  decomposition remains out of this task's persistence scope.

## What 6.3 delivers

| Layer | File | Role |
|---|---|---|
| **The one state machine** | `apps/admissions/src/lib/wizardDraftMachine.ts` (new) | Pure, framework-neutral transition function for the exact design §8.2 graph + events, plus predicates (`isTerminalWizardDraftState`, `isUnsyncedWizardDraftState`, `hasQueuedWizardDraftWork`) and the save-label projection (`wizardDraftSaveLabel`). Total over `(state, event)` — an inapplicable event is a no-op, so adapters cannot corrupt the lifecycle. Terminal states (`submitted`/`deleted`) are absorbing. Defines the local record address `(user_id, application_id, assignment_id)`. |
| **Single-app cache adapter (R10.10)** | `apps/admissions/src/lib/draftLocalCache.ts` (new) | The one adapter the machine uses to read/write/clear the local recovery snapshot. `clearWizardDraftCache({userId, applicationId})` removes **only** that one `applicationWizardDraft:<user>:<app>` key; `clearNewWizardDraftCache(userId)` removes only the unattached "new" snapshot + the shared legacy key. **Neither ever touches the payment-recovery store** (payment-linked protection). `writeWizardDraftSnapshot` is the single source of the snapshot-persist mechanic (de-dups the two former copies). |
| Bulk-wipe removal | `apps/admissions/src/lib/draftManager.ts` | `clearAllDraftData()` deleted; its dead imports (`BROWSER_KEYS`/`LEGACY_BROWSER_KEYS`/`useDraftStore`/`KNOWN_DRAFT_STORAGE_KEYS`) removed. `DraftManager`, `draftManager`, `hasDraftData`, `isDraftDeleted`, `clearDraftDeletedFlag` preserved (canonical-source Property 1 + `draftManagerStorage` tests stay green). |
| Caller 1 (submit) | `…/applicationWizard/hooks/useWizardController.ts` | `handleSubmitApplication` now `clearWizardDraftCache({ userId, applicationId })` for the just-submitted app only (R10.10: submitting one application never erases another draft or any payment-recovery record). |
| Caller 2 (stale local) | `…/pages/student/Dashboard.tsx` | When a local snapshot's app is no longer a draft, clears only that `(user, application)` cache. |
| Caller 3 (new intent) | `…/applicationWizard/hooks/wizard/useWizardDraftLoader.ts` | `mode=new` now `clearNewWizardDraftCache(user.id)` (unattached snapshot only). **Removed** the local-vs-server **timestamp arbitration** (`localTimestamp >= serverTimestamp`) — the online `Application(status='draft')` is authoritative; the local snapshot is a recovery cache used only when there is no server draft (R10.3). De-duped snapshot persist. |
| De-dup persist | `…/applicationWizard/hooks/wizard/useWizardDraftPersistence.ts` | Now imports the shared `writeWizardDraftSnapshot` (its 4 call sites) instead of a private copy. |
| Machine projection | `…/applicationWizard/hooks/useSmartAutoSave.ts` | Additively feeds the transport's autosave signals into the machine (`useReducer(wizardDraftTransition)`) and returns the canonical `draftState` + `draftSaveLabel`. **The transport (`useAutoSave`) is unchanged** — this only projects one state vocabulary; no autosave behavior was removed. |

## Steering / hard-constraint compliance

- **Auto-save mandatory and resilient — never removed without a replacement.**
  No autosave transport was removed. `useAutoSave`/`useSmartAutoSave` still drive
  the 8-second save (`consolidation-autosave` Property 8 stays green). The machine
  models `offline.queued → (NETWORK_RESTORED) → saving`, so slow/offline recovery
  is represented, not weakened.
- **Local caches never hold auth secrets** — the machine's local record is
  defined as `(user_id, application_id, assignment_id)` + pending deltas only;
  the adapter writes the existing snapshot shape and touches no credential keys.
- **Payment-linked drafts protected from deletion** — cleanup never removes any
  payment-recovery record (proved by grep + property test); the server delete gate
  (`DRAFT_HAS_PAYMENT_ACTIVITY`) is unchanged and the machine models
  `deleting → (DELETE_BLOCKED) → ready.clean`.
- **Canonical IDs / local snapshot never authoritative** — the loader treats the
  online draft as the source of truth; no timestamp arbitration remains.
- **`{"success": true, "data": …}` envelope, cookie auth + CSRF** — untouched
  (frontend-only; no backend calls added).
- **Canonical truth map** — no new backend/domain concept or route introduced
  (the draft machine is a frontend model of the already-registered draft
  lifecycle), so no new canonical-truth-map registration is required.

## Required_Evidence

### 1. Model + property tests — `raw/model-property-tests.txt`
- `tests/unit/wizardDraftMachine.test.ts` (18) — the exact §8.2 graph: new/resume
  intent, edit→save→saved, failed-save keeps work, offline queue + reconnect,
  explicit conflict → reload/merge, delete→deleted, payment-linked delete blocked,
  submit→submitted/errors, terminal absorbing, inapplicable-event no-op, predicates.
- `tests/property/wizardDraftMachine.property.test.ts` (8, fast-check) — totality;
  terminal absorption; `submitted` only via `submitting+SUBMIT_OK`; `deleted` only
  via `deleting+DELETE_OK`; NETWORK_LOST never drops dirty work to clean/terminal;
  queued work always resumes saving on reconnect; EDIT idempotence; no undefined leaks.
- `tests/unit/draftLocalCache.test.ts` (8) — single-app scoping; legacy key not
  wiped on specific-app clear; **payment-recovery never erased**; scoped
  `draftCleared` event; null-app routes to new-cleanup; new-cleanup preserves other
  attached drafts + recovery; `writeWizardDraftSnapshot` single authoritative key.
- `tests/property/draftLocalCache.property.test.ts` (1, fast-check) — for any set
  of drafts across any users + any payment-recovery records, clearing one target
  removes only it and **never** touches any payment-recovery record.

Result: **35 passed** (4 files).

### 2. Regression suites — `raw/regression-suites.txt`
`consolidation-canonical-source` (Property 1: `draftManager` canonical exports),
`consolidation-draft-dedup` (Property 16: `clearAllDrafts` concurrent dedup),
`consolidation-autosave` (Property 8: 8-second autosave interval), `draftManagerStorage`,
`useAutoSaveSafety`, `applicationSessionDrafts`, `student-dashboard` page
verification, `useWizardController.contract`, `wizardDraftIntent`, `autoSavePause`,
`draftRoundTrip`, `submissionPayload`: **48 passed** (12 files).

### 3. Type-check — `raw/type-check.txt`
`bun run type-check` (`tsc -p tsconfig.build.json --noEmit`): **clean (exit 0)**.

### 4. Lint on changed files — `raw/lint-changed-files.txt`
`eslint --max-warnings 0` on the two new modules, the four cleanly-edited files, and
the new/updated test files: **clean (exit 0)**.

> Two pre-existing baseline lint errors surface only when linting `useSmartAutoSave.ts`
> and `useWizardController.ts` in isolation: `no-restricted-imports` on their
> `@/services/client` imports (line 4 / line 19) and one "unused eslint-disable"
> for `eligibilityEngine`. These lines exist **unchanged at the base commit**
> (verified via `git show HEAD:…` + `git diff` — they appear only as diff context,
> never as `+` lines) and belong to the repo's known 883-issue lint baseline owned
> by task **13.1**. This task introduces **zero** new lint findings.

### 5. Grep-loop review — `raw/grep-loop-review.txt`
- Zero **live** `clearAllDraftData` usages (only two doc-comment mentions remain).
- Zero whole-store payment-recovery `removeItem` in `src` (payment-recovery is
  never bulk-wiped).
- Zero local-vs-server timestamp arbitration in the loader (R10.3).
- The three rewired owners all call the single-application-addressed clears.

### 6. Change set — `raw/change-set.txt`
Base commit, the frontend-only 6.3 file list, and the diffstat (7 modified + 6 new).

## Verified vs. deferred

- **Verified (this task):** the one pure draft state machine (design §8.2 graph +
  predicates + save labels) with unit + property coverage; single-application-
  addressed cache adapter with the R10.10 guarantee (single-target clear, no
  sibling-draft collateral, **no payment-recovery record ever erased**) proven by
  unit + property tests; removal of `clearAllDraftData` bulk wipe and rewiring of
  all three callers; removal of local-vs-server timestamp arbitration (R10.3);
  de-duplication of the snapshot-persist mechanic into one adapter; additive
  machine-state projection through `useSmartAutoSave` (transport unchanged);
  type-check clean; changed-files lint clean; consolidation/autosave/dashboard/
  draft regressions green.
- **Deferred to task 13.2 (E2E):** the Playwright refresh / offline-edit-reconnect
  / two-tab-conflict / device-switch browser journeys (design §16). The model +
  property substrate they build on is fully covered here.
- **Owned by task 13.1:** the full admissions build/lint/type gate over the whole
  in-flight working tree (incl. the pre-existing `@/services/client` baseline
  lint findings on `useSmartAutoSave`/`useWizardController`).
- **Staged (the "…after parity tests pass" clause of the task):** fully retiring
  the legacy transport owners — folding `useAutoSave`/`useSmartAutoSave`'s I/O and
  the `applicationSession` autosave interval into the machine so the machine owns
  **all** hydration/edit/save/submit I/O (R10.2 in full). This dispatch makes the
  machine the canonical **model + cache/cleanup authority** and the state
  vocabulary; ripping out the live transport owners is gated on the 13.2 E2E
  parity runs (refresh/offline/two-tab/device-switch) so autosave resilience is
  proven before the redundant owners are deleted — exactly as the task bullet
  ("Remove … redundant owners after parity tests pass") and the product hard
  constraint ("never remove auto-save without a replacement") require.

## Canonical truth map

No new domain concept or backend route was introduced. The wizard draft machine
is a frontend model of the already-documented student draft lifecycle
(`enterprise-tenancy.md` → Student Draft Lifecycle; canonical `/applications/drafts/`
registered by task 6.2). No canonical-truth-map registration required.

---

# Completion passes M12 (2026-10-06/07) and M13 (2026-10-08)

The sections above are the first pass (2026-07-24) and are kept as history. M12
retired the cooperating owners but never updated this README or closed the task;
M13 root-caused M12's one browser failure, found and fixed two more defects, and
re-ran everything on one final bundle. Statements above that are now false are
corrected in §M.6.

- Base commit `bae29a28d9657f288b3339062adb31285959c966`; candidate = working tree
  (the whole spec is uncommitted; nothing was staged or committed by these passes).
- Final bundle: `index-ZQdEO1-x.js`, built only through `harness/bin/harness build`;
  the one external API host in it is the `https://api.beanola.com` constant used
  only when the page origin is `apply.beanola.com`; `api.mihas.edu.zm` 0
  (`raw/m13-14`). Production, the EC2 box and Neon were never contacted.
- Every M13 browser run held a `systemd-inhibit --what=sleep:idle --mode=block`
  lock (the reason is §M.3.1). No inhibitor was left behind (`raw/m13-23`).
- No schema change, no backend change, no new route. PBT: 6.3 has no numbered
  property sub-task (`pbtResults: {}`), so nothing is recorded via
  `update_pbt_status`; property tests exist and are run as ordinary suites.

## M.1 What M12 changed

M12 moved every draft write and every draft-lifecycle decision into one machine
and reduced the old owners to adapters and views (`raw/m12-12`):

- **Removed** `src/hooks/useAutoSave.ts` (no importers). Its transport — 2 s
  debounce, the 8 s sweep, retry with exponential backoff reusing one
  `Idempotency-Key` per exact command, the offline queue — now lives in the machine.
- **New** `src/lib/wizardDraftController.ts`, the machine's runtime. It runs the
  pure graph in `wizardDraftMachine.ts` and does all I/O through injected adapters
  and timers. One serialized command chain, and one write rule: write only when the
  answer projection's fingerprint differs from what the server last acknowledged.
- **New** `src/lib/wizardDraftProjection.ts`: the pure rules (fingerprint, explicit
  three-way merge, version-based outbox classification `none | replay | stale`).
- **New** `hooks/useWizardDraftMachine.ts`: the React binding, browser events and
  the only `beforeunload` guard.
- `hooks/useSmartAutoSave.ts` cut to a 63-line view (the autosave gate plus the
  save-state projection).
- `hooks/wizard/useWizardDraftPersistence.ts` reduced to adapters (start / update /
  read endpoints, the one outbox writer, reload, restore-stale-outbox).
- `hooks/wizard/useWizardDraftLoader.ts` plus **new** `lib/draftHydration.ts`: one
  hydration path for the mount loader and the draft picker. Pending outbox edits
  made on exactly the loaded version are replayed; edits on an older version open
  an explicit conflict.
- `lib/applicationSession.ts` cut to the read side. Its 8 s legacy interval,
  `saveDraft` and `loadDraft` are gone, and its cleanup is scoped to one record.
- `index.tsx`: step navigation calls `draftMachine.flush()`, and the last native
  `window.confirm` is gone. `components/WizardActionBar.tsx` renders the machine's
  states (saving, saved, saved on this device, offline, retrying, conflict), each
  with an icon and words, plus the two conflict resolutions (Reload latest draft /
  Keep my changes).
- **New** `hooks/wizard/useWizardSubmission.ts`: submission runs inside
  `draftMachine.submit(...)`.
- Two defects found by M12's browser runs and fixed. `ResidenceLocationFields.tsx`
  now closes its suggestion row on pointer release, not press; Continue had been
  moving 52 px under the pointer mid-click. And once a `mode=new` application
  attaches, the address bar is rewritten to `mode=resume&draftId=…`, so a refresh
  reopens it instead of a blank wizard.
- New required journey `tests/harness-e2e/required/wizard-draft-two-tab.spec.ts`.
- Characterisation: P1-P7 (behaviour to keep) and D1-D5 (defects to flip) pass on
  both sides (`raw/m12-01` → `raw/m12-02`). D1-D3 are the same-value writes (Save
  now, step navigation, Continue). D4 is a programme/intake-only change. D5 is a
  pending outbox record never being sent.

M12 browser results: F1-F9 18/18 twice (`raw/m12-07`); wizard journeys 29/30, then
30/30 after the ResidenceLocationFields fix (`raw/m12-08`); two-tab run 2 6/6 and
run 3 **11/12** (`raw/m12-13`). Run 2 of the adversarial matrix was against a
mis-built bundle and does not count (`raw/m12-09`, `raw/m12-10`).

## M.2 Owner map

| Responsibility (R10.2) | Before 6.3 | After M12/M13 |
|---|---|---|
| hydration | loader (with local-vs-server timestamp arbitration) and a second copy in the picker | machine `beginHydration/completeHydration/failHydration`; one adapter `draftHydration.ts` for both paths |
| edit detection | `useSmartAutoSave` | machine `observe()` (fingerprint vs. acknowledged baseline) |
| debounced autosave, 8 s sweep | `useAutoSave`, plus `applicationSession`'s own 8 s interval | machine (injected timers; one interval) |
| manual save, step navigation, Continue | `useWizardDraftPersistence` (unconditional PATCH) and `index.tsx` | machine `saveNow` / `flush` / `commit` (unchanged draft: no write; Continue confirms with a read) |
| retry, offline queue | `useAutoSave` | machine (same key for the exact command; `offline.queued → saving`) |
| conflict | `useSmartAutoSave` | machine (`409 VERSION_CONFLICT` terminal → `resolveReload` / explicit `resolveMerge`) |
| local outbox | loader + persistence (two copies), `applicationSession`, bulk wipes | one encrypted `(user, application)` record via `draftLocalCache.ts`, written only by the machine's adapter |
| delete / payment gate / submit | dashboard + controller + session manager | machine (`detach` on 404, `notePaymentActivity`, `setPaused`, `submit`) |
| save-state view, unload guard | `useSmartAutoSave`, controller | views: `useSmartAutoSave`, `WizardActionBar`, `useWizardDraftMachine` |

## M.3 What M13 found and fixed

### M.3.1 Why M12's two-tab run 3 failed: a host suspend, and an auth defect it exposed (recorded, not fixed)

- **Instrument condition.** The laptop was on battery with GNOME's 15-minute idle
  suspend. It suspended at **01:27:33Z, the second tab B clicked "Reload latest
  draft"**, and slept 5 h 42 min (journal `PM: suspend entry 01:27:35Z`, resumes
  06:05:06Z and 07:09:55Z). The failure screenshot is stamped 60 s after the last
  resume, which is the assertion's timeout (`raw/m13-02`).
- **What it exposed.** The reload itself worked: the navigation resolved, and the
  draft machine's conflict → reload path did its job. During the sleep the
  30-minute access cookie lapsed while the 7-day refresh cookie stayed valid. The
  reloaded page's only auth call, `GET /api/v1/auth/session/?refresh_csrf=1`,
  answered `200 {authenticated:false}` (AllowAny + `OptionalJWTCookieAuthentication`).
  `fetchSessionData()` never tries the refresh cookie on that answer, and its
  comment assumes a 401 the endpoint does not send. So `StudentRoute` sent tab B
  to `/auth/signin`.
- **Reproduced without any suspend** by dropping only `access_token`
  (`raw/m13-03`). D1 control: the reload reopens the wizard. D2: a plain reload
  lands on the sign-in page, although `POST /auth/refresh/` → 200. D3: the real
  conflict → "Reload latest draft" lands on the sign-in page.
- **Decision (user, this pass):** auth is out of 6.3's scope, so it is recorded
  here for the session-pipeline lane (task 1.4 deferred its expired-session browser
  journey) and not changed. Practical effect: any guarded page load more than
  30 minutes after the last token refresh signs the student out. Their encrypted
  outbox record now survives that (§M.3.2) and is recovered after they sign back in.
- The failure artifacts are preserved, because Playwright wipes `outputDir` on
  every run (`raw/m13-01-*`).

### M.3.2 Offline edits were lost on every page load (fixed)

- **Found by probing what "Offline — saved on this device" promises.** The edit
  was written to the encrypted outbox. Then the tab was closed and the draft
  reopened online. Result, 5/5: nothing sent, the old value shown, the edit
  silently gone (`raw/m13-04`).
- **Cause 1 (pre-existing at HEAD, `d042665dc`).** `AuthContext`'s storage effect
  ran `clearSession()` whenever `auth.user` was null. That includes every page load
  before the session resolves, about 52 ms in, which deleted the salt and every
  `beanola_secure_*` draft record.
- **Cause 2 (timing).** The loader read the outbox before PBKDF2 key derivation
  and `preloadSecureStorage()` finished, so it read nothing. A draft write in that
  window fell back to a PII-stripped plaintext copy that overwrote the encrypted
  record.
- **Fix** (user-approved, since part of it is in `AuthContext`; no token, cookie,
  refresh or CSRF code was touched):
  - `AuthContext.tsx`: encrypted storage is cleared only when a signed-in owner goes
    away (sign-out, cross-tab logout, the auth-failure cascade) or another user
    signs in in the same tab, never on page load.
  - `localStorageCache.ts`: a draft-key write is held until the key exists; the
    preload never clobbers this page's own newer writes or removals; and
    `whenSecureStorageReady(timeoutMs)` reports readiness, never rejects, and is
    reset with the owner.
  - `useWizardDraftLoader.ts`: hydration waits for that, at most
    `WIZARD_OUTBOX_READY_TIMEOUT_MS` = 5 s, then proceeds without the outbox.
- **Tests:**
  - `tests/unit/localStorageCacheEncryptedOutbox.test.ts` (7) runs the module's
    production path. Two mutants (no write hold; preload clobbers local writes)
    each fail it.
  - `tests/unit/authContextSecureStorageLifecycle.test.tsx` (5) fails 4/5 against
    HEAD's `AuthContext`; the sign-out case passes on both, as it should.
  - `tests/unit/wizardDraftLoaderSafety.test.tsx` gains 2 cases.
  - New required journey `tests/harness-e2e/required/wizard-draft-offline-outbox.spec.ts`:
    offline edit, tab closed, reopened online, then shown, sent once on the version
    it was made on, and held at exactly `version + 1`. It runs at normal speed and
    with key derivation slowed by 1.5 s.
- **Before/after on the same journey:** a bundle built without the fix (entry hash
  `index-Cvyivuna.js`, M12's own final bundle) fails it **4/4** (`raw/m13-08`). The
  fixed bundle passes **12/12** (`raw/m13-07`), and **12/12 + 4/4** on the final
  bundle (`raw/m13-17`).

### M.3.3 Resume hydrated the intake by display name and could pick another tenant's (fixed)

- **Found by the strict gate.** On the first M13 adversarial run, F1 failed on both
  projects with `409 NO_ELIGIBLE_OFFERING` from the assignment preview
  (`raw/m13-13`).
- **The server record was right.** F1's draft holds MIHAS's intake `07ed1c07…`.
  The wizard had put KATC's same-named intake `1bac1d0d…` in the form.
- **Mechanism.**
  - `draftRecordToFormValues` hydrated `intake` from the display snapshot
    `record.intake`.
  - The controller's reconcilers resolve a name to the first intake with that name
    in `GET /catalog/intakes/`, ordered by `(-year, name)` with no tiebreaker, so
    the pick among tied rows is arbitrary.
  - The same wrong id would have been the target of a Continue's reroute command.
  - Intermittent by construction: M12 drew the right row, M13's fresh stack did
    not, and the same list re-read 30 minutes later ordered the tied rows
    differently.
- **Pre-existing at HEAD** (`setValue('intake', app.intake)`); 6.3's hydration
  adapter inherited it.
- **Fix:** hydrate the canonical `record.intake_id`; the name is used only for a
  legacy draft with no id (`draftHydration.ts`). It goes through both resume paths
  (mount loader and picker), and the answer projection is unchanged, so resume
  stays write-free.
- **Tests:** `tests/unit/draftHydrationCanonicalIntake.test.ts` (3) fails 1/3
  against the name-only mapping.
- **Browser:** F1-F9 18/18 on the final bundle (`raw/m13-16`), and F1 ×5 per
  project on 10 fresh colliding worlds 10/10. Every one of the 15 preview requests
  named the draft's own intake and answered 200 (`raw/m13-18`).

### M.3.4 The slow "Reload latest draft" click was the instrument (no change)

In the two-tab journey the click step took 6-10 s on some repeats. A single-tab
diagnostic navigates 58-71 ms after the click. From a background tab (a second page
open in front), Playwright's `click()` takes 4.0-7.8 s to return, but the page's
own clock shows click → `beforeunload` in 4-5 ms (`raw/m13-11`). The delay is the
driver delivering input to a non-front page, not app work, and is well inside the
journey's 60 s bounds.

### M.3.5 The M9 note's "same-value projection write" is resolved

The machine writes only when the answer fingerprint differs from the
server-acknowledged baseline, and assignment fields are not in the projection.
Hydration, resume, step navigation, Save now on an unchanged draft and Continue
therefore send no PATCH; Continue confirms with a read. Evidence:
- unit D1-D4 (`raw/m12-02`, re-run in `raw/m13-19`);
- the two-tab journey's "hydration and step navigation in two tabs are reads, never
  writes" and "reloads and refreshes write nothing" assertions (`raw/m13-15`);
- F3's version check (`raw/m13-16`);
- the offline-outbox journey's single recovery write at `version + 1` (`raw/m13-17`).

## M.4 How the task and R10 are met

| Item | Status | Evidence |
|---|---|---|
| Characterize the six owners | met | `raw/m12-01` (P1-P7 parity, D1-D5 defects), `raw/m12-02` |
| One state machine, thin adapters | met | §M.1, §M.2; grep review `raw/m13-22` (one interval, the transport called only by the machine's adapters) |
| Preserve slow/offline recovery | met (M13 made it real across page loads) | §M.3.2; `raw/m13-17` (outbox, including the slow-device case); F1 + mobile offline journey |
| Scope all cache/outbox deletion to one user/application | met | `raw/m13-22` #1-#3; `draftLocalCache` unit + property; the session-cleanup characterisation. Sign-out still clears every record, which R10.4 requires; page load no longer does (§M.3.2) |
| Remove timestamp arbitration and redundant owners after parity | met | `raw/m13-22` #4-#6; parity P1-P7 green before and after |
| R10.1 explicit intent, `Application.id` identity | met | `wizardDraftIntent` unit tests; the two-tab test 2 (new → refresh → resume); §M.3.3 (assignment hydrated by canonical id) |
| R10.2 one owner | met | §M.2 |
| R10.3 version + idempotency key; conflict, never a timestamp pick | met | `updateDraft` carries `expected_version` + `Idempotency-Key`; P4/P5; two-tab and F3 conflict → reload; no arbitration (`raw/m13-22` #4) |
| R10.4 keyed, encrypted or minimized, cleared on logout/sync/delete/submit | **met** (row updated by M14, §N) | An attached draft's AES-GCM record is addressed by `(user, application, assignment)`: the slot is keyed by user + application, and the assignment (`program_offering_id\|intake_id`, as the server reports it) is in the record and matched on every read, so a record for another assignment is never replayed (it opens the explicit conflict; M4). It exists only while the server lacks an edit and holds only the pending answers, their base and version (record format 3, `draftOutbox.ts`). Cleared on successful sync (M3; in the browser no draft record remains after any refresh or synced save, `raw/m14-08`), server-confirmed delete or `404` (M5), submit and sign-out. An unattached new application keeps its whole form, which is all pending (C3). One caveat remains: key derivation (§M.7), now mitigated by minimisation (§N.1.3). `raw/m14-01`, `m14-06`, `m14-08`, `m14-17` |
| R10.7 visible states, typing never blocked, no duplicate requests | met | `WizardActionBar` (icon + words for each state); P2/P6/D1-D5; mobile offline journey (badge in words, typing works, no dialog) |
| R10.8 test coverage | **met** (row updated by M14, §N) | Browser: **refresh at each of the six steps** on a resumed draft, and on Personal, Assigned school and Programme of a `mode=new` application once autosave attaches it (`wizard-draft-refresh-each-step.spec.ts`, 12/12 `raw/m14-08`); **slow network for draft writes**, including an answer held past the API client's 30 s timeout (`wizard-draft-slow-network.spec.ts`, 6/6 `raw/m14-08`); offline/reconnect (F1, mobile, outbox 12/12 `raw/m14-10`); two tabs + conflict (two-tab 20/20 `raw/m14-09` and `m14-14`, F3 20/20 `raw/m14-15`); upload retry (F4); double submit (F5); new vs. resume (two-tab test 2, refresh test 2); refresh (F2, golden journey). Unit/property: delete (`delete404Resilience`, session-cleanup, machine `DELETE_*`, M5), reroute (`selectionChange`, `changeSelectionService` — task 6.4; outbox re-addressed on a reroute, `wizardDraftController`), payment activity (machine `PAY` / `DELETE_BLOCKED`), slow network (controller retry/backoff with fake timers, D6) |
| R10.9 minimum canonical start; rename | met by 6.2; 6.3's start adapter sends canonical `program_id` + `intake_id` | task 6.2 evidence; `projectStart` → `buildServerDraftPayload` |
| R10.10 one-identity cleanup; never another draft or payment-recovery record | met | as R10.4/cleanup above; the payment-recovery store (`beanola-payment-recovery`) sits outside the `beanola_secure_` prefix that sign-out clears |
| Evidence: model/property + refresh/offline/two-tab/device-switch E2E | met | §M.5 |

## M.5 Results on the final bundle (`index-ZQdEO1-x.js`)

| Run | Result | Raw |
|---|---|---|
| two-tab spec, both tests, `--repeat-each=5`, chromium + mobile | **20/20**, 0 skipped, 0 flaky | `m13-15` |
| adversarial F1-F9, chromium + mobile | **18/18** | `m13-16` |
| F1 ×5 per project on fresh colliding worlds | **10/10**; 15/15 previews named the draft's own intake | `m13-18` |
| characterisation, mobile, golden journey, OCR fallback, offline-outbox (both projects) | **34/34** | `m13-17` |
| offline-outbox alone, `--repeat-each=3` | **12/12** | `m13-17` |
| 6.3 model/property + controller + every suite touching M13's files | **35 files / 222 tests** passed | `m13-19` |
| full admissions Vitest | **505 files passed, 1 skipped; 4,717 tests passed, 1 skipped** (the skip is the pre-existing retired `describe.skip` in `documentTemplatesPremium.test.ts`) | `m13-20` |
| `bun run type-check` / `bun run lint` | exit 0 / exit 0 | `m13-21` |
| `harness drain` / `harness down` | broker 0, unsettled collections 0 / down, volumes wiped | `m13-23` |

Runs on intermediate bundles, kept for the record and superseded by the rows above:
`m13-07` (outbox 12/12), `m13-10` (two-tab 20/20), `m13-12` (journeys 34/34),
`m13-13` (F1-F9 16/18, which is what found §M.3.3).

## M.6 Corrections to the earlier sections

- "The transport (`useAutoSave`) is unchanged" and "Staged: fully retiring the
  legacy transport owners" are no longer true. M12 deleted `useAutoSave` and the
  machine owns the transport (§M.1).
- "Deferred to task 13.2 (E2E)": the refresh, offline, two-tab and device-switch
  journeys now run as 6.3's own evidence (§M.5). Task 13.2 still owns the complete
  required-project gate.
- The two "pre-existing baseline lint errors" on `useSmartAutoSave` /
  `useWizardController`: obsolete. The full `bun run lint` is clean and
  `useSmartAutoSave` no longer imports the transport.
- "Caller 1 (submit) … `useWizardController.handleSubmitApplication`": submission
  now lives in `useWizardSubmission`, inside `draftMachine.submit`, which clears the
  one record through the cache adapter.
- "Local records are addressed by `(user_id, application_id, assignment_id)`": the
  storage key is `applicationWizardDraft:<user>:<application>`. The assignment is a
  property of the application, not part of the key (see R10.4 in §M.4).
- "The local snapshot … only ever holds pending deltas + retry metadata": it holds
  the full form values, grades, upload flags and step, plus `pending` and
  `pendingBase`, AES-GCM encrypted. Design §8.2's "only pending deltas" is not
  literally met; R10.4's "encrypted or minimized" is met through encryption, with
  the caveat in §M.7.
- "No canonical-truth-map registration required": no new concept was introduced,
  but the "Online student drafts" row named the deleted `DraftManager` and not the
  one frontend owner R10.2 requires. M13 updated that row (machine, encrypted
  outbox, hydration by canonical intake id, and its drift guards).

## M.7 Not verified, and open items

- **The auth defect in §M.3.1 is open.** A guarded page load more than 30 minutes
  after the last token refresh signs the student out.
- **The encryption key derives from the user id.** `secureStorage.init(user.id)`
  feeds PBKDF2 a non-secret input, and the salt sits beside the ciphertext in
  localStorage, so anyone who can read localStorage can derive the key. This is
  pre-existing and unchanged. R10.4's "encrypted" is therefore nominal against a
  local attacker.
- **Observed, not changed (not 6.3):**
  - `GET /catalog/intakes/` has no tiebreaker after `(-year, name)` and, on a tenant
    host, lists other tenants' intakes.
  - In production the draft records live under the `beanola_secure_` prefix, so
    `listWizardDraftStorageKeys`' plain-key enumeration (`getLocalWizardDraft`
    without an application id) can find only the unattached `:new` record. The
    resume-by-id path reads by address and is the one the browser journeys prove.
- **R10.8 gaps:** see §M.4.
- **MAINT-01 is advanced, not closed.** `wizardDraftController.ts` is 1,548 lines,
  much of it documentation, and the wizard's `index.tsx` (1,256) and
  `useWizardController.ts` (1,031) remain large. Those splits belong to other tasks.
- `tests/harness-e2e/required/_diag-hydration.spec.ts` is task 11.2's leftover
  diagnostic; its own header says to delete it before 11.2 finishes. It was left in
  place and is not part of any 6.3 run.
- Production, Neon, the full required Playwright projects (task 13.x) and
  `gatecheck-negative` were not run in this pass.

## M.8 Raw files added by M13

| File | Content |
|---|---|
| `m13-01-m12-run3-failure-{tabB-signin.png,tabA-wizard.png,error-context.md,playwright-report.json}` | M12 run-3 failure artifacts, preserved |
| `m13-02-m12-run3-failure-timeline.txt` | report timings, server access log, suspend/resume journal |
| `m13-03-diag-access-cookie-lapse.txt` | D1-D3 reproduction of the auth defect (diagnostic spec source included, spec deleted) |
| `m13-04-diag-outbox-lost-on-page-load-BEFORE.txt` | 5/5 outbox loss + the clearSession-at-52 ms probe |
| `m13-05`, `m13-09` | intermediate bundle builds (`index-Pvgbv8pY.js`), superseded |
| `m13-06-harness-restart.txt` | clean down/up (volumes wiped) before the evidence runs |
| `m13-07`, `m13-08` | offline-outbox journey on the fixed bundle (12/12) and on the pre-fix control bundle (0/4) |
| `m13-10`, `m13-12`, `m13-13` | two-tab, journeys, F1-F9 on the intermediate bundle; `m13-13` carries the §M.3.3 root cause |
| `m13-11-diag-reload-latency.txt` | §M.3.4 diagnostic |
| `m13-14-harness-rebuild-final-bundle-2.txt` | the FINAL bundle build + host check |
| `m13-15` … `m13-18` | final-bundle browser runs (§M.5) |
| `m13-19` … `m13-21` | suites, full Vitest, lint + type-check |
| `m13-22-change-set-and-grep-review.txt` | M13 change set + grep-loop review, every hit classified |
| `m13-23-harness-drain-teardown.txt` | drain, down, no containers/volumes/inhibitors left |

---

# Completion pass M14 (2026-10-08/09)

M14 closes the gaps M13 left open in §M.4 and §M.7: browser refresh at every step,
browser slow-network coverage for draft writes (both R10.8), and design §8.2's address
and contents for the local outbox (R10.4). Two more defects turned up along the way
and were fixed: a replay in flight was not shown as retrying (R10.7), and resuming
one draft erased another application's unsent local work (R10.10). The §M.4 rows for
R10.4 and R10.8 were updated in place. Everything else from §M stands, except the
statements corrected in §N.5.

- Base commit `bae29a28d9657f288b3339062adb31285959c966`; candidate = working tree.
  M14 staged and committed nothing. The index holds 9 staged deletions of the retired
  backend AI modules, which belong to another task (`raw/m14-20`).
- Final bundle **`index-DFYqzK57.js`**, built only through the harness: `harness up`
  on a fresh stack and then `harness build`, both producing the same hash. It contains
  one external API host, the `https://api.beanola.com` constant (used only when the page
  origin is `apply.beanola.com`), and 0 occurrences of `api.mihas.edu.zm`
  (`raw/m14-07`). Production, the EC2 box and Neon were never contacted.
- Every browser run held a `systemd-inhibit --what=sleep:idle --mode=block` lock. No
  inhibitor, container or volume was left behind (`raw/m14-21`).
- No backend, schema or route change. PBT: 6.3 still has no numbered property
  sub-task, so property files run as ordinary suites.

## N.1 What changed, per gap

### N.1.1 R10.8: a refresh during each step

New required journey `tests/harness-e2e/required/wizard-draft-refresh-each-step.spec.ts`
(helpers in the new `tests/harness-e2e/helpers/wizard-draft.ts`):

1. **Resumed draft** (`mode=resume&draftId=…`). The draft has five grades, the
   documents the platform requires and a deferred fee, so every step is one the
   student has legitimately reached. It opens on its derived resume step, Review,
   because the fee is deferred. It is then walked back one step at a time, with a
   refresh on each of the six steps.
2. **New application** (`mode=new`). It is refreshed on Personal once autosave
   has attached it (the student presses nothing; `POST /applications/drafts/` → 201),
   then on Assigned school, then on Programme.

After **every** refresh the journey asserts:
- the address bar says `mode=resume` with the same `draftId`;
- the step's saved answers are on screen (programme + intake; assigned school;
  name + town; `5/5 unique minimum`; "Payment deferred"; the review summary);
- the student is on the step they refreshed on;
- the reload sent **no** non-GET request to `/api/v1/applications/*` or
  `/api/v2/student/applications/*`, and the server version did not move;
- the draft list holds exactly that one application;
- there is no conflict and no draft-choice screen;
- the browser holds **no** draft record (an attached draft with nothing pending
  keeps nothing on the device, §N.1.3).

The write filter covers the application resource only. A non-application write such
as the payment step's fee-quote mint is not counted.

**Which step a refresh lands on, and why: the same step.** The wizard writes the step
into the address bar (`?step=<key>`) on every move. On a first load it honours that
step when the step is reachable (task 11.2, `resolveWizardDeepLinkStep`). The resume
machine first places the student on the authoritative derived step
(`resolveDraftResumeStepId`). The address-bar step then overrides it: at once for
Programme and Assigned school, and for the later steps once the assignment and fee
resolve (the R10.3 gate). Measured on a refresh at Personal (`raw/m14-12`):
- in 8 of 10 reloads the derived Education step is painted for **25-45 ms** before
  Personal;
- in 2 of 10 the wizard goes straight to Personal.

The journey waits for the page to settle and re-reads the step, so that transient is
never mistaken for the landing.

### N.1.2 R10.8: slow network for draft writes

New required journey `tests/harness-e2e/required/wizard-draft-slow-network.spec.ts`.
Every draft PATCH reaches the server (`route.fetch`); only its **answer** is delayed:
- the first answer is held 35 s, past the API client's own 30 s timeout for this
  endpoint (`DEFAULT_TIMEOUT`, `services/retry.ts`). Draft commands send
  `retries: 0`, so the draft machine owns the retry;
- every later answer arrives 4 s late.

Concurrency is measured around the page's own `fetch` (an init-script probe, measuring
only).

The ledger was identical in all six runs (`raw/m14-08`):

| # | key | `expected_version` | server answered | what the page saw |
|---|---|---|---|---|
| 1 | K1 | v | 200, **v+1** (committed) | abandoned 30.0 s after it was sent (`net::ERR_ABORTED`, recorded by the strict gate as a cancellation) |
| 2 | **K1** (same body, byte for byte) | v | 200, **v+1**: the idempotency record answered, not a second commit | response 200, sent 6-11 ms after K1 was abandoned |
| 3 | K2 | v+1 | 200, v+2 | response 200 |

The rest of what the journey asserts:
- **Typing never blocked.** While K1 was in flight the student typed a new town and a
  next-of-kin name, character by character. Every keystroke landed, the fields stayed
  editable, and no dialog appeared.
- **No duplicate command.** Nothing more was sent while K1 was in flight. The probe's
  maximum was 1 command in flight.
- **Keystrokes coalesced.** All the keystrokes typed during the wait went out as
  **one** command, K2.
- **States in words.** The action bar said "Saving..." for K1 and "Retrying save…"
  during the replay.
- **Final state.** The server ended holding the last values typed, at exactly
  `v + 2`: one version step per distinct command.
- **Outbox.** The pending edit was in the encrypted outbox during the wait and gone
  once synced.

**Defect found, D6 (R10.7).** `deriveWizardDraftSaveView` checked `state === 'saving'`
before `retrying`, so a replay in flight showed as a plain "Saving...". After a timeout
the queued sweep replays at once, so "Retrying save…" was never visible at all.
- Pinned first by the unit case D6, which fails on M13's view (`raw/m14-02`).
- Fixed by checking `retrying` first (`wizardDraftController.ts`).
- Browser control: a bundle with only that hunk reverted (`index-BSH2B8eK.js`) fails
  the journey on both projects at "the replay is shown in words". The element is never
  found within 45 s (`raw/m14-05`). The final bundle passes 6/6.

Instrument notes (`raw/m14-04`, shakedowns before the evidence runs). For an abandoned
request Playwright's `route.fulfill()` is a silent no-op, so it cannot show "the
browser never heard K1"; the page's `requestfailed` does. Playwright also reports the
abandoned K1 and its replay in the same instant and in either order. One shakedown
therefore counted them as overlapping, which is why concurrency is measured inside the
page.

### N.1.3 R10.4 + design §8.2: the outbox address and its contents

**Characterised first** (`tests/unit/wizardDraftOutboxMinimisation.test.tsx`, run on
the unchanged M13 tree in `raw/m14-01`). Each case below passes before **and** after:
- **C1.** A resume takes the step, grades, upload flags and payment state from the
  server, never from the record. Only a pending answer is replayed. The full-form copy's
  programme/intake never reaches the form.
- **C2.** In production storage the key-less local reader (dashboard,
  `?localDraft=true`) cannot see an attached record at all (it is under
  `beanola_secure_`). That reader only ever sees the unattached `:new` slot and the
  legacy key.
- **C3.** An unattached new application keeps its whole form.
- **C4.** A record written before M14 is still replayed once when it was made on the
  loaded version.

Nothing a student sees depended on the full snapshot, so dropping it changes nothing
visible: no cached step is painted from it, and offline recovery is unchanged
(outbox 12/12). The minimised cases M1-M5 fail on the M13 tree, and each failure shows
the record M13 kept. For example, after a plain hydration:
`formData` (NRC, phone, date of birth, next of kin…), `selectedGrades`,
`uploadedFiles`, `currentStep`, `paymentStatus`, `pending: false`.

**Address.** The record carries `assignment`, the server's
`program_offering_id|intake_id` (`draftAssignmentKey`). The machine takes it from
every server answer it adopts: hydration (mount loader and picker), start, update, the
Continue read, an explicit merge and a reroute (`acknowledgeServerRecord`, which also
re-addresses a still-pending record to the new version and assignment). A pending record
whose assignment differs from the server draft's is classified `reassigned`:
- it is **never replayed**, even on the same version;
- it opens the explicit conflict with words that name the change ("The programme or
  intake of this application changed…");
- **Reload latest draft** removes it for that one application (M4, `wizardDraftProjection`
  cases, property 3); **Keep my changes** takes the same path as a stale-version
  outbox. That path is tested by the controller's stale-outbox merge case; the
  `reassigned` variant of it is not separately tested.

A record without an assignment (written before M14), or a row that reports none, is
judged by version alone. That is sound because `change_selection_service` bumps
`version` together with `assignment_version`.

**Why the assignment is in the record and not in the key.** The slot stays
`applicationWizardDraft:<user>:<application>`. One record per application means a
reroute replaces the record instead of orphaning a second one under the old
assignment's key. It also keeps every cleanup to one key, and every existing reader
and test addresses records that way. The assignment is still part of the address the
record is matched against on every read, so design §8.2's triple decides recovery.

**Contents.** For an attached draft the record, format 3 (`applicationWizard/lib/draftOutbox.ts`),
is `{version, userId, applicationId, assignment, serverVersion, pending: true, answers,
pendingBase, savedAt}`, where `answers` holds only the pending answers (M2, property 1).
It exists only while the server lacks an edit, and is otherwise removed:

| Event | Effect | Evidence |
|---|---|---|
| hydration with nothing pending | no record | M1 |
| successful sync | the record is removed (`settleWizardDraftOutbox`) | M3 |
| server-confirmed delete or `404` | the record is removed (`detach`) | M5 |
| submit | the record is removed (unchanged) | — |
| sign-out / owner change | the record is removed (`AuthContext`, unchanged) | — |

Two smaller changes go with it:
- An outbox that could not be read in time (slow key derivation) is reported as
  `localUnread`, so hydration leaves it untouched rather than settling over it.
- The draft store's `markSaved` and the `applicationDraftSaved` event now carry a
  save point instead of a copy of the answers.

The encryption scheme, auth, token, cookie, refresh and CSRF code are unchanged.

**Defect found, R10.10.** `writeWizardDraftSnapshot` removed the user's unattached
`:new` record on **every** attached write ("Unconditional on purpose", since M12). Merely
resuming one draft therefore erased another application typed on this device but not
yet started on the server.
- M6 fails on the pre-fix tree (`raw/m14-06`).
- That record is now removed only when **its own** application attaches (the start
  command's `onStarted`) and by explicit `mode=new` (M7 passes before and after).
- The guard the old removal provided cannot be needed: an attached record holds no
  form copy for the key-less reader to restore, and in production that reader never
  sees attached records at all (C2).

### N.1.4 F3's helper raced the address-bar step (test instrument, fixed)

The first F1-F9 run on the final bundle was **17/18** (`raw/m14-11`, artifacts
`m14-11-f3-*`).
- **What failed.** F3's `openPersonalStep`, after **Reload latest draft**, read the
  transient derived step "Step 4 of 6" and saw "Step 3: Personal" enabled. It clicked
  just as the address bar's `?step=personal` moved the wizard to Personal. The control
  became the current, disabled step, and Playwright waited the full 30 s action timeout.
- **What the screenshot shows.** The wizard on Personal with the winner's town, which is
  the state F3 wanted.
- **Root cause.** Measured in `raw/m14-12`. The resume and deep-link behaviour is
  pre-existing and M14 did not touch it.
- **Fix.** Instrument only: the click is bounded (5 s) and the helper's own checks
  decide. Applied to F3's helper (task 13.2's spec) and to the same helper in the
  two-tab spec. The offline-outbox copy cannot race, because its loads carry no
  `?step=`, and it is unchanged. The specs' claims are unchanged.
- **After the fix.** F1-F9 18/18 (`raw/m14-13`), F3 alone 20/20 (`raw/m14-15`),
  two-tab 20/20 (`raw/m14-14`).

## N.2 Characterisation, before and after

| Case | On the M13 tree | Final tree |
|---|---|---|
| C1-C4 (what reads an attached record) | pass (`m14-01`) | pass (`m14-17`) |
| M1-M5 (minimised record, address, clearing) | **fail**, each showing M13's record (`m14-01`) | pass |
| D6 (replay shown as retrying) | **fail**: `'saving'` (`m14-02`) | pass |
| M6 (resume keeps another application's unattached work) | **fail**: record erased (`m14-06`) | pass |
| M7 (attach removes its own unattached record) | pass (`m14-06`) | pass |
| slow-network journey | **fails** on a D6-reverted bundle, both projects (`m14-05`) | 6/6 (`m14-08`) |
| characterisation P1-P7 + D1-D5 (`wizardDraftPersistenceCharacterisation`) | pass (M13) | pass (`m14-17`) |

## N.3 Results on the final bundle (`index-DFYqzK57.js`)

| Run | Result | Raw |
|---|---|---|
| per-step refresh + slow network (new), `--repeat-each=3`, chromium + mobile | **18/18**, 0 flaky, 0 skipped | `m14-08` |
| two-tab, both tests, `--repeat-each=5`, both projects: spec unchanged since M12 | **20/20** | `m14-09` |
| two-tab again with the bounded-click helper | **20/20** | `m14-14` |
| offline-outbox, both variants, `--repeat-each=3`, both projects | **12/12** | `m14-10` |
| adversarial F1-F9, both projects: first run | 17/18 (F3, §N.1.4) | `m14-11` |
| adversarial F1-F9 after the instrument fix | **18/18** | `m14-13` |
| F3 alone, `--repeat-each=10`, both projects | **20/20** | `m14-15` |
| characterisation, mobile, golden journey, OCR fallback, both projects | **30/30** | `m14-16` |
| 6.3 model/property/controller suites (M13's 35 files, M14's 2 new ones, 6 more that touch the outbox, the save view or deletion) | **43 files / 316 tests** | `m14-17` |
| full admissions Vitest | **507 files passed, 1 skipped; 4,740 tests passed, 1 skipped**. The skip is the pre-existing retired `describe.skip` in `documentTemplatesPremium.test.ts` (in HEAD; not 6.3's) | `m14-18` |
| `bun run type-check` / `bun run lint` | exit 0 / exit 0 | `m14-19` |
| `harness drain` / `harness down` | broker 0, unsettled collections 0 / down, no containers, volumes or inhibitors left | `m14-21` |

## N.4 Code changed (admissions only)

- **Draft machine** (`src/lib/`):
  - `wizardDraftController.ts`: assignment context; `assignmentConflict`;
    `localUnread`; detach clears the detached record; a reroute re-addresses pending
    work; the D6 view order; the snapshot `overrides` plumbing removed.
  - `wizardDraftProjection.ts`: `draftAssignmentKey`, `reassigned`.
  - `draftLocalCache.ts`: `settleWizardDraftOutbox`; no `:new` removal on attached
    writes.
  - `wizardDraftMachine.ts`: comment only.
- **Wizard** (`src/pages/student/applicationWizard/`):
  - new `lib/draftOutbox.ts`;
  - `hooks/wizard/useWizardDraftPersistence.ts`: the minimal writer, settle,
    `onStarted` clearing, assignment-aware recovery;
  - `hooks/wizard/useWizardDraftLoader.ts`: assignment and readability.
- **Tests:**
  - new: `wizardDraftOutboxMinimisation.test.tsx` (11), `draftOutboxMinimisation.property.test.ts`
    (3), the two new journeys and their helper;
  - extended: `wizardDraftController.test.ts` (+5), `wizardDraftLoaderSafety.test.tsx`
    (+1, 2 updated), `wizardDraftProjection.test.ts` (+3);
  - updated to the R10.10 semantics: `draftLocalCache.test.ts` (1);
  - bounded click: the F3 and two-tab helpers.
- **Not touched:** `index.tsx` and `useWizardController.ts` (MAINT-01).
- **Growth:** the controller grew from 1,548 to 1,606 lines (+58, mostly the
  assignment plumbing and its comments), the persistence hook from 644 to 699, and the
  loader from 648 to 664. The change set and grep review are in `raw/m14-20`.

## N.5 Corrections to earlier sections

- §M.4 R10.4 "the record stays as a clean recovery copy" and "the key names user +
  application, not the offering": no longer true. An attached draft keeps a record only
  while something is pending. The record carries the assignment and is matched on
  it, and the slot stays per application for the reason in §N.1.3.
- §M.6 "it holds the full form values, grades, upload flags and step, plus `pending`
  and `pendingBase`": now true only for an unattached new application. For an attached
  draft see §N.1.3. Design §8.2's "only pending deltas and retry metadata" is now
  literally met for attached drafts.
- §M.2 owner map, "local outbox": the record is now `(user, application,
  assignment)`-addressed and pending-only.
- First pass, "What 6.3 delivers": "When the draft has attached …, the unattached
  'new' snapshot is dropped" now happens only when that snapshot's own application
  attaches.
- §M.4 "Scope all cache/outbox deletion to one user/application" and R10.10 "met"
  were incomplete: an attached write also removed the unattached `:new` record. Fixed
  in §N.1.3.
- §M.7 "R10.8 gaps: see §M.4": closed (§N.1.1, §N.1.2).
- §M.7 key derivation: unchanged and still nominal against a local attacker. What
  such an attacker can now derive is limited to answers not yet sent, and only while
  they are unsent.

## N.6 Not verified, and open items

- **Unchanged and out of scope (user decisions):**
  - the auth-bootstrap defect of §M.3.1;
  - the MAINT-01 splits;
  - task 11.2's `_diag-hydration.spec.ts`, which was not touched.
- **Observed, not changed:**
  - **The refresh transient.** On a refresh past the checkpoint the derived resume
    step is painted before the address-bar step (25-45 ms on the harness). Its length
    is bounded by the assignment preview's latency, so on a slow network a student
    could see the derived step for longer before being moved. This is the deep-link
    lane (task 11.2).
  - **One `:new` slot per user.** Two tabs that each hold an unattached new
    application share it.
  - **The legacy key.** Every draft write still removes the shared legacy
    `applicationWizardDraft` key (pre-6.3 migration), which `clearWizardDraftCache`
    deliberately does not.
  - **`GET /catalog/intakes/`.** It still has no tiebreaker (§M.7).
- **Not run in this pass:**
  - production and Neon;
  - `gatecheck-negative`;
  - the full required Playwright projects (task 13.x).

## N.7 Raw files added by M14

| File | Content |
|---|---|
| `m14-01-outbox-characterisation-BEFORE-m13-tree.txt` | C1-C4 pass, M1-M5 fail on the unchanged M13 tree |
| `m14-02-retrying-visibility-BEFORE.txt` | D6 fails on M13's save view |
| `m14-03-harness-up-and-bundle-check.txt` | first M14 stack + bundle `index-Cst38HcG.js` (shakedown and control stack) |
| `m14-04-new-journeys-shakedown.txt` | the new journeys' shakedown runs and what each one taught the instrument |
| `m14-05-d6-control-bundle-and-run.txt` | D6-reverted control bundle `index-BSH2B8eK.js`, the slow-network journey failing on it (both projects), the exact restore |
| `m14-06-r10-10-unattached-record-BEFORE.txt` | M6 fails before the R10.10 fix; M7 passes |
| `m14-07-harness-restart-and-final-bundle.txt` | clean down/up + the FINAL bundle `index-DFYqzK57.js`, host check, source checksums |
| `m14-08-new-journeys-repeat3-final.txt` | 18/18 + per-refresh and per-command annotations |
| `m14-09` / `m14-14` | two-tab ×5: unchanged spec / bounded-click helper |
| `m14-10-offline-outbox-repeat3-final.txt` | 12/12 |
| `m14-11-adversarial-f1-f9-final.txt` + `m14-11-f3-failure-*` | the 17/18 run, its error context, screenshots and report |
| `m14-12-diag-refresh-landing-timeline.txt` | the step-line timeline of a refresh at Personal (diagnostic spec source included; spec deleted) |
| `m14-13`, `m14-15` | F1-F9 18/18 after the fix; F3 ×10 20/20 |
| `m14-16-wizard-journeys-final.txt` | characterisation, mobile, golden, OCR: 30/30 |
| `m14-17` … `m14-19` | 6.3 suites, full Vitest, lint + type-check |
| `m14-20-change-set-and-grep-review.txt` | change set, checksums, grep-loop review |
| `m14-21-harness-drain-teardown.txt` | drain, down, nothing left behind |
