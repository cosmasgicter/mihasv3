# Task 10.1 — Consolidate notifications and communications (slice 2: frontend)

Evidence index for the **frontend half** of task **10.1** of
`.kiro/specs/admissions-v2-canonical-rebuild/`, closing the four items
[slice 1 §11](slice-1-backend.md) left owed.

```
- [x] 10.1 Consolidate notifications and communications
  - Define the supported preference schema and implement real GET/PUT controls.
  - Reject unknown whatsapp/in-app fields unless actually implemented.
  - Merge duplicate inbox/history concepts and add Communications to mobile More.
  - _Requirements: R13.3-R13.4, R13.8_
  - _Findings: STU-14, STU-24_
  - _Evidence: preference persistence, mandatory-message, delivery/retry, mobile-nav E2E_
```

- **The checkbox is flipped here.** Slice 1 settled the backend and explicitly
  declined to claim the frontend; with this file all four `_Evidence:` items are
  produced, so 10.1 is complete.
- PBT: task 10.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- **Schema: no migration**, and no backend change of any kind in this slice. The
  backend was not touched, so slice 1's Django check and OpenAPI counts stand
  unchanged and are not re-run here.
- Reuses, rather than re-implements: 8.3's `resolveTenantSupportContact` (STU-24),
  the platform's canonical UI primitives (`PageShell`, `SectionCard`,
  `EmptyState`, `ErrorDisplay`, `Button asChild`), the task-0.4 harness and its
  strict `harness-fixtures.ts` gates, and 8.3's precedent for reaching a state no
  provider lever can produce (§3.2).

---

## 1. What slice 1 owed, and where each item landed

| Owed (slice 1 §11) | Status | Section |
|---|---|---|
| 1. the `mobile-nav` browser journey — the one Required_Evidence item no endpoint can produce | **done** — `required/communications-preferences.spec.ts`, 5 journeys × desktop and mobile, 10/10 | §3, §6.4 |
| 2. the frontend gates, recorded, measured against 9.5's baseline | **done** — test / lint / build | §6.1–6.3 |
| 3. consume `audience` and `not_applicable` in the inbox | **already implemented; verified and recorded here** | §2 |
| 4. `slice-2-frontend.md`, and only then the checkbox | **this file** | — |

Two things slice 1 could not have known about turned up while producing them, and
both were repairs rather than additions:

- the frontend suite was **red**, because the hook took a path an earlier spec had
  retired and pinned absent (§4);
- the desktop sidebar still offered only the preferences screen, so "one inbox,
  reachable" held on mobile and not on desktop (§5).

## 2. Item 3: the inbox consumes `audience` and `not_applicable`

Slice 1 recorded that `MessageDeliveryState.tsx` "mentions neither today". It now
mentions both, and the reason the distinction matters is the one slice 1 §5.2
states: before 10.1 a staff work item's email channel read `unknown`, whose
published definition is *"This message predates delivery tracking"* — a false
statement about a message that predated nothing.

The rendering rule is keyed **strictly on each channel's own state**, so the two
easily-confused states can never be handed each other's words:

| State | What the surface does |
|---|---|
| `not_applicable` | renders the server's definition as **visible** text, per channel (`delivery-{id}-{channel}-fact`) |
| `unknown` | the same treatment, with **its own** definition — never `not_applicable`'s |
| every other state | the badge says it; `statedChannelFact` returns `''` |
| a state this build has no tone for | renders as `unknown`, never as healthy — the ADM-02 rule applied to a delivery label |

`audience` is carried onto the rendered element (`data-audience`) rather than
turned into copy. That is deliberate and worth stating, because the tempting move
is to write a sentence: the platform publishes the audience **token** without
publishing its explanation, and which channels an audience may use is *already*
resolved by the server into the per-channel state being rendered. Inventing copy
for it here would be exactly the drift STU-14 is about.

Covered by `tests/unit/messageDeliveryState.test.tsx` (11) and
`tests/unit/notificationPreferenceSchema.test.ts` (23), including the case that
the two states' sentences are not equal to each other.

## 3. The browser journey (`required/communications-preferences.spec.ts`)

Five journeys, run by **both** the desktop and mobile required projects.

Why the browser at all, when slice 1 has 92 endpoint cases: **STU-14 was
invisible to the backend.** The endpoint accepted and persisted nine fields; the
page rendered three read-only tiles ("Always on", "Always on", "Coming soon") and
declared two fields the backend never had. Nothing about that is observable from a
request. A drift finding between a server and a screen is closed by looking at the
screen — and the fourth Required_Evidence item, navigation, has no server surface
at all.

| # | Journey | Claim |
|---|---|---|
| 1 | `turning the email channel off persists across a reload` | the switch is a **control**: exactly one PUT, carrying the *server's* writable field name; "Saved" appears because the screen re-rendered from the PUT's own response; after a full reload it is still off, and the server agrees with no browser in the way (`is_default` flips `true → false`) |
| 2 | `a mandatory channel and category are stated, not offered as switches` | the inbox channel and application updates render the server's own **definition** with **no switch at all** — asserted as `toHaveCount(0)`, not as a disabled control — and the endpoint refuses `application_updates` and `in_app_enabled` with their own distinct codes |
| 3 | `every unsupported field is named with the server reason and rendered as no control` | the published refusal table is complete (8 fields), `whatsapp_enabled` and `in_app_enabled` do **not** collapse into one code, every reason appears on screen in the server's wording, no refused field has a switch, the retired badges are counted at zero, and a write mixing one valid field with one refused field is refused **whole** and stores nothing |
| 4 | `a failed email states its channel, offers one retry, and the retry shows in the history` | per-channel state (`in_app: delivered`, `email: failed`), no address and no provider text in the payload, one retry offered from the server's `can_retry`, the notice says **"Queued again"** rather than claiming delivery, and afterwards `attempts: 2, can_retry: false` |
| 5 | `the inbox is a navigation destination and the retired second inbox is gone` | a visible link to the one inbox without opening anything (on both viewports), every visible link to `/student/notifications` names itself as *settings*, that page has no mark-all-read and no delivery rows, and the support affordance is resolved from tenant context (STU-24) |

Nothing is mocked. The harness runs the real Django delivery gate, so the states
on screen are the ones `resolve_delivery` actually recorded, and the retry is the
real owner-scoped, state-guarded, bounded, audited command.

### 3.1 What each journey refuses to assert

- **journey 3 does not demand that a mandatory field is absent from the screen.**
  The refusal table holds two kinds of entry, and they render differently: a field
  refused because *the platform cannot do it* has nothing but its named absence; a
  field refused because *it is not the student's to switch* describes a real,
  mandatory message class and is also rendered as a stated fact. The journey reads
  the refusal **code** to tell them apart rather than keeping a second list.
  Collapsing them would mean either hiding that a decision is always sent, or
  offering a control for a channel with no provider behind it.
- **the retired copy is matched `exact`.** STU-14's tiles were badges reading
  exactly `Always on` / `Coming soon`. The server's *reason* for the inbox channel
  is a sentence ending "in-app delivery is always on" — an explanation, not a
  badge. A substring assertion would have demanded the platform stop explaining
  itself, which is how the first run of this journey failed.
- **journey 5 asserts the claim, not the breakpoint.** The bottom bar is
  `md:hidden` and the sidebar drawer is closed until opened, so *which* element
  carries the link depends on the viewport. Asserting the mobile bar in the
  desktop project would test Tailwind; asserting per project would leave one
  viewport unchecked — which is exactly how the desktop sidebar was left pointing
  at settings (§5). So both projects assert the same thing: a link to the one
  inbox is visible **without opening anything**.
- **the page heading is matched as the `h1`.** The mobile shell also renders the
  page name in its header, which is correct for the shell and ambiguous for a
  locator; `getByRole('heading', …)` resolved to two elements on mobile.

### 3.2 Reaching a terminal `failed` email honestly

Journey 4 needs a message the platform has **given up** on, because the retry is
deliberately offered only on a terminal failure — a queued or retrying message
must not be re-sent, or the student gets two of them.

The failure itself needs no simulation. `config.settings.harness` sets
`EMAIL_HOST_USER = ""` and `RESEND_API_KEY = ""` on purpose, so `_send_via_smtp`
and `_send_via_resend` both decline and every attempt fails exactly as it would
against a dead provider. What the harness cannot supply is **time**:
`send_email_task` classifies `retrying` until `retry_count` reaches 3 and
re-queues itself with a 60 s → 120 s → 240 s backoff, so waiting for the
platform's own terminal verdict costs seven minutes.

`exhaustEmailDeliveryAttempts` (`helpers/ops.ts`) therefore runs the platform's
own `send_email_task` back to back until it stops classifying the row as
retryable. **No status is written by hand** — the task's own classifier decides
`retrying` versus `failed`. The only thing compressed is the backoff, in the same
spirit as 8.3's `runReconciliationExpirySweep` compressing a 24 h cutoff to zero,
and for the same stated reason: a required test may take a shortcut through
*waiting*, never through *behaviour*.

The run shows the platform doing it, twice per journey:

```
{"level": "INFO", "logger": "apps.common.metrics", "metric": "email.send_failed",
 "error": "both_smtp_and_resend_failed"}
```

`readEmailQueueIdForNotification` reads the queue id from the platform's stored
record through the same seam, because the id is deliberately **not** published:
the history exposes a classified state, an attempt count and a timestamp, and
never an internal identifier, a provider payload or the recipient's address
(R13.4). A journey that needed it on the wire would be asking the platform to
expose what this task removed.

Both helpers share a new `runHarnessDjangoShell` extracted from
`runReconciliationExpirySweep` — the compose-file walk and the `docker compose
exec` were already there and would otherwise have been copied. It joins statements
with a newline rather than `;`, because a caller needs a real block (a loop that
reads the platform's own verdict between attempts).

## 4. The frontend suite was red, and why the fix is a rename

The first frontend run was **3 failed / 4121 passed / 1 skipped**. Two of the
three were real, and both were 10.1's:

```
FAIL tests/property/consolidation-dead-files.test.ts
  Counterexample: ["src/hooks/useNotificationPreferences.ts"]
  File src/hooks/useNotificationPreferences.ts should have been deleted but still exists

FAIL tests/property/consolidation-imports.test.ts
  Counterexample: [[".../src/pages/student/NotificationSettings.tsx", …]]
  imports from deprecated path: @/hooks/useNotificationPreferences
```

`src/hooks/useNotificationPreferences.ts` is a **retired** path. The archived
`duplicate-deprecated-consolidation` spec deleted a hook of that name as one of
two competing answers to *"read and write notification preferences"* (its design
§Phase 2 names `useNotificationQueries` as the survivor and this as the loser),
pinned its absence, pinned the absence of any import of it, and left an ESLint
restriction redirecting to `@/hooks/queries/useNotificationQueries` — which that
same spec **also** deleted.

10.1's hook is a genuinely different thing: it reads the **server's published
schema** rather than holding a field list, which is the whole of STU-14. But it
took the retired name, so it resurrected a path the platform had declared dead and
pointed the surviving lint rule at a module that no longer exists.

**The fix is `src/hooks/useNotificationPreferenceSchema.ts`**, exporting
`useNotificationPreferenceSchema`. The alternative — retiring the two pins so the
path could be reused — was rejected on the same grounds
[9.5 §11.1](../9.5/README.md) rejected retiring another lane's stale registry
entry: weakening a live drift guard to make room hides that it was there. The new
name also says what the hook does, which the old one did not.

Measured, by putting the retired path back and taking it away again:

| | Result | Artifact |
|---|---|---|
| retired path present (`useNotificationPreferences.ts` restored, one import repointed) | **2 failed** — the two counterexamples above | [`consolidation-guard-before.txt`](raw/consolidation-guard-before.txt) |
| the rename (`useNotificationPreferenceSchema.ts`) | **3 passed** — dead-files, imports **and** the eslint-restriction guard | [`consolidation-guard-after.txt`](raw/consolidation-guard-after.txt) |

So the guard is live, and the rename is what satisfies it — not a weakened list.

> The ESLint rule itself was **not** touched. It never fired on the two consumer
> pages anyway: flat config replaces `no-restricted-imports` wholesale for
> `src/pages/**` with the R14.3 transport-client rule, so the consolidation
> patterns do not reach a page. Fixing that scoping, and the rule's redirect to a
> module that no longer exists, belongs to the spec that owns those restrictions
> and is named here rather than done here.

## 5. The desktop sidebar still pointed at settings

The mobile bottom bar was corrected — its primary tab is `student.communications`
labelled "Inbox", and notification settings moved one level down into More. But
`AppLayout.studentNavItems`, which renders the **desktop sidebar and the mobile
drawer**, still listed only `student.notifications` under the label
"Notifications". `routeRegistry` declares `studentCommunications` with
`nav: { desktop: true, order: 25 }`, so the registry said the inbox was a desktop
nav item and the desktop nav did not render it.

That is the same STU-14/R13.8 confusion the mobile nav fixed, left standing on the
other viewport, and it contradicts the steering rule that navigation is driven by
*identical rules on desktop and mobile*. A desktop student had no route to the one
communications history from the shell, and the item that looked like the inbox was
settings.

Two lines, both in `AppLayout.tsx`:

- `student.communications` added to `studentNavItems` in registry order (25), so
  it sits between the wizard and payment;
- the mobile header title for `/student/notifications` changed from
  `'Notifications'` to `'Notification settings'`, and `/student/communications`
  given `'Communications'` — so the two surfaces are named apart in the one place
  a student reads the page name.

Journey 5 is what found it, and is what keeps it fixed on both viewports.

## 6. Verification (verbatim)

### 6.1 Frontend suite, against 9.5's measured baseline

`cd apps/admissions && bun run test`

```
Test Files  1 failed | 472 passed | 1 skipped (474)
     Tests  1 failed | 4123 passed | 1 skipped (4125)
```

[`frontend-test.txt`](raw/frontend-test.txt). The pre-10.1 frontend baseline is
[9.5 §11.2](../9.5/README.md): **1 failed / 4065 passed / 1 skipped** across 471
files.

- **New failures: 0.** The single failure is
  [`authPageFormMarkup.test.tsx`](../../../apps/admissions/tests/unit/authPageFormMarkup.test.tsx),
  the SignUp helper-copy conflict catalogued in
  [8.1 §4.1](../8.1/slice-2-frontend.md), [8.3 §7.1](../8.3/README.md),
  [8.4 §7.3](../8.4/README.md), [9.1 §8.4](../9.1/README.md),
  [9.2 §11.3](../9.2/README.md), [9.3 §15.2](../9.3/README.md),
  [9.4 §14.2](../9.4/README.md) and [9.5 §11.2](../9.5/README.md). Unrelated to
  notifications.
- **+3 files / +58 passing**, and the arithmetic closes exactly:

| Source | Tests |
|---|---|
| `notificationPreferenceSchema.test.ts` (**new**) | 23 |
| `notificationSettingsControls.test.tsx` (**new**) | 16 |
| `messageDeliveryState.test.tsx` (**new**) | 11 |
| `notificationSettingsPreferences.test.ts` (rewritten: `HEAD` 2 → 6) | +4 |
| `notificationServiceUpdatePreferences.test.ts` (rewritten: `HEAD` 1 → 5) | +4 |
| **total** | **58** |

The task's own frontend suite on its own: **65 passed / 6 files**
([`task-suite-frontend.txt`](raw/task-suite-frontend.txt) — the 50 new plus the
two rewritten suites and one unchanged service suite).

### 6.2 Lint

`cd apps/admissions && bun run lint`

```
✖ 18 problems (18 errors, 0 warnings)
LINT_EXIT=1
```

[`frontend-lint.txt`](raw/frontend-lint.txt),
[`frontend-lint-files.txt`](raw/frontend-lint-files.txt). **18 errors across 15
files — the same count as 9.4 and 9.5, and none of the 18 is in a file this task
touched.** They are the pre-existing R14.3 transport-client imports in the wizard
and dev/tracker hooks, plus unused `eslint-disable` directives. Two of the 15
files are `tests/harness-e2e/harness-fixtures.ts` and
`tests/harness-e2e/helpers/ops.ts`, both already in 9.5's list; `ops.ts`'s single
error is the same unused `no-constant-condition` directive, moved from line 155 to
line 282 by this slice's added helpers. Lint is not a CI gate and none of these
are this task's.

### 6.3 Build

`cd apps/admissions && bun run build`

```
✓ check-html-csp: HTML is compatible with the production CSP.
BUILD_EXIT=0
```

[`frontend-build.txt`](raw/frontend-build.txt). Includes
`tsc -p tsconfig.build.json --noEmit`, `vite build` and the CSP gate.

### 6.4 Browser journeys

`cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required tests/harness-e2e/required/communications-preferences.spec.ts`

```
Running 10 tests using 1 worker
  … 10 passed (26.0s)
PW_EXIT=0
```

[`harness-communications-journeys.txt`](raw/harness-communications-journeys.txt).
Run against the task-0.4 isolated harness brought up **fresh**
(`harness/bin/harness up`, which wipes volumes, rebuilds the backend image and
runs `bun run build` for the SPA), with the strict `harness-fixtures.ts` gates
active: zero skips, no console errors, no unhandled exceptions, no unasserted
failed requests.

`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch — Playwright's
bundled Chromium has no build for this machine, so the required projects run
against the system Chrome. It changes the browser binary, not the assertions.

**The harness serves the built SPA**, so every source change in this slice needed
`bun run build` before it was under test. Both mid-run fixes (§3.1, §5) were
invisible to the harness until the SPA was rebuilt, for exactly that reason.

### 6.5 The whole required suite, and the two failures that are not ours

`… bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required`

```
2 failed
  [chromium-required] › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
  [mobile-required]   › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
110 passed (7.5m)
```

[`harness-required-suite.txt`](raw/harness-required-suite.txt). The whole required
profile was run because this slice changes shell navigation, which every journey
renders.

The two failures are `tenant-launch.spec.ts`'s own locator ambiguity:
`getByText('Fees', { exact: false }).first()` resolves to the **admin sidebar's**
"Program Fees" item — hidden, because the drawer is closed — instead of the
onboarding wizard's "Fees" step. Not this task's surface, and not this task's
change: `studentNavItems` renders only for students, and that journey runs as a
platform admin.

Asserted? No — **measured**, by reversing this slice's two `AppLayout` hunks,
rebuilding the SPA, and running that spec alone:

| Run | Result |
|---|---|
| this slice's `AppLayout` reverted | **2 failed / 4 passed** — the same two |
| candidate | **2 failed / 4 passed** — the same two |

[`tenant-launch-preexisting-baseline.txt`](raw/tenant-launch-preexisting-baseline.txt).
The reverted file was then restored from a byte copy and diffed (empty), and the
SPA rebuilt before the final run.

### 6.6 Backend gates

**Not re-run, because this slice changes no backend file.** Slice 1 §10.3–10.5
recorded `manage.py check` (no issues, exit 0), `spectacular` (3 warnings / 116
errors — unchanged from 9.5) and the 37-file backend suite against a measured
baseline. Nothing in this slice can move them.

### 6.7 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Frontend suite | 9.5 baseline 1 failed / 4065 passed → 1 / **4123**; the same single pre-existing failure, and the two red consolidation guards **repaired** (§4) |
| Lint | 18 errors / 15 files, identical to 9.4 and 9.5, none in this task's files (§6.2) |
| Build | exit 0 including type-check and the CSP gate (§6.3) |
| Browser (this task) | 10/10 on a freshly wiped harness, both viewports, zero skips (§6.4) |
| Browser (whole required profile) | 110 passed; the 2 failures reproduce with this slice's nav change reverted (§6.5) |

## 7. Canonical registration

`docs/canonical-truth-map.md` → the existing 10.1 section gains four rows:

- **The one schema read** — `useNotificationPreferenceSchema.ts`, one query key
  shared by both surfaces, and the explicit note that
  `useNotificationPreferences.ts` is a retired path still pinned absent by three
  guards (§4);
- **Student surfaces** — which page owns preferences, which owns the
  inbox/history, and what each renders;
- **Inbox navigation** — both nav sources, and that they are identical on desktop
  and mobile (§5);
- the **Drift guards** row extended with the three frontend suites and the browser
  spec.

No new capability, route, status, error code or vocabulary was added by this
slice, so there is nothing else to register.

## 8. Files

```
docs/v2-evidence/10.1/
├── slice-1-backend.md                        (the backend half)
├── slice-2-frontend.md                       ← this index
└── raw/
    ├── frontend-test.txt                         (1 failed / 4123 passed / 1 skipped, 474 files)
    ├── task-suite-frontend.txt                   (65 passed / 6 files)
    ├── frontend-lint.txt                         (18 errors / 15 files — 9.5's count)
    ├── frontend-lint-files.txt                   (the 15 files, none this task's)
    ├── frontend-build.txt                        (exit 0, incl. tsc + CSP gate)
    ├── harness-communications-journeys.txt       (10/10, desktop + mobile)
    ├── harness-required-suite.txt                (110 passed / 2 pre-existing failed)
    ├── consolidation-guard-before.txt            (retired path restored: 2 failed)
    ├── consolidation-guard-after.txt             (the rename: 3 passed)
    ├── tenant-launch-preexisting-baseline.txt    (the 2 failures with this slice's nav change reverted)
    └── … slice 1's backend artifacts
```

Source of the change in this slice:

| Path | What it is |
|---|---|
| `apps/admissions/tests/harness-e2e/required/communications-preferences.spec.ts` | **new** — the task's five required journeys (§3), desktop and mobile |
| `apps/admissions/tests/harness-e2e/helpers/ops.ts` | **new** `runHarnessDjangoShell` (extracted from `runReconciliationExpirySweep`, newline-joined so a caller can use a real block), **new** `exhaustEmailDeliveryAttempts` (spend the platform's own send attempts; its classifier decides the verdict) and `readEmailQueueIdForNotification` (read an id the platform deliberately does not publish) — §3.2 |
| `apps/admissions/src/hooks/useNotificationPreferenceSchema.ts` | **renamed** from `useNotificationPreferences.ts` (§4), hook renamed to match, with the retired-path history recorded in the module docstring |
| `apps/admissions/src/pages/student/NotificationSettings.tsx` | the renamed import |
| `apps/admissions/src/pages/student/Communications.tsx` | the renamed import |
| `apps/admissions/src/components/navigation/AppLayout.tsx` | `student.communications` added to `studentNavItems`; the two page titles named apart (§5) |
| `docs/canonical-truth-map.md` | four rows on the existing 10.1 section (§7) |

Everything else the frontend needed already existed and is verified rather than
authored here: `src/lib/notificationPreferences.ts`,
`hooks/useCommunications.ts`, `services/notifications.ts`,
`pages/student/Communications.tsx`, `pages/student/NotificationSettings.tsx`,
`components/student/communications/MessageDeliveryState.tsx`,
`components/navigation/MobileBottomNav.tsx`, and the six unit suites in §6.1.

## 9. Not claimed here

Named rather than implied, and none of it is 10.1's:

- **The consolidation ESLint restriction is still wrong, and was left alone.**
  `@/hooks/useNotificationPreferences` redirects to
  `@/hooks/queries/useNotificationQueries`, which the same archived spec deleted,
  and flat config replaces `no-restricted-imports` wholesale for `src/pages/**`
  so the consolidation patterns never reach a page. Both belong to the spec that
  owns those restrictions (§4). Renaming around the rule was this task's job;
  repairing the rule is not.
- **`tenant-launch.spec.ts`'s ambiguous `Fees` locator** is measured pre-existing
  (§6.5) and left for its own lane. Tightening another task's locator here would
  hide that it was loose.
- **No staff notification preference screen**, **no SMS, no WhatsApp, no
  quiet-hours scheduler** — slice 1 §11 explains why each is a decision rather
  than an omission, and nothing in this slice changes that.
- **No change to `/api/v1/notifications/user/{id}/`** (the admin history view) and
  no change to the notification cursor/polling contract.
- **The `authPageFormMarkup` copy conflict** is eight tasks old and still another
  lane's (§6.1).
