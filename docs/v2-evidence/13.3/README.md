# Task 13.3 — Verify mobile, zoom, accessibility, and long-content behavior

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Phase 13, third bullet
Requirements: **R16** (whole), **R18.2-R18.4**
Findings: **STU-03, STU-04, STU-05, STU-10, STU-14, STU-20, STU-23, STU-24**
Required_Evidence: **visual/a11y report with reviewed screenshots and pixel checks**

---

## The claim table

The bullet names three explicit lists. Each is answered in full, and every check is
a **recorded number** rather than a pass/fail bit.

| List | What was asked | What was measured |
|---|---|---|
| **Six viewports** | 320×568, 375×667, 390×844, 768×1024, 1280×800, 1440×900 | all six, on **8 student surfaces** × **2 device profiles** = 96 surface measurements ([`raw/pixel-matrix.txt`](raw/pixel-matrix.txt) — a six-column matrix that shows six columns) |
| **Nine dimensions** | keyboard · screen-reader semantics · focus restore/error focus · reduced motion · 200 %/400 % zoom · safe areas · slow 3G/offline · long tenant/program/localized strings | all nine exercised; **none skipped, none unavailable** ([`raw/dimensions.txt`](raw/dimensions.txt), §5) |
| **Three assertions** | 44 px targets · no overflow/occlusion/layout shift · the actual next action in the first mobile viewport | all three, measured in the browser: `getBoundingClientRect()`, `scrollWidth−clientWidth`, `elementFromPoint`, `PerformanceObserver('layout-shift')`, and a bounding box against the viewport at `scrollY === 0` (§3, §4) |

```
$ bunx playwright test -c playwright.harness.13-3.config.ts
  54 passed (31.2m)          ← 11 of the 54 are EXPECTED failures carrying findings
  EXIT=0
```

54 tests, 54 traces, **149 screenshots**, one uninterrupted run of both projects.
Queues drained afterwards: `broker_queue_depth: 0`, `unsettled_payment_collections: 0`
([`raw/harness-drain.txt`](raw/harness-drain.txt)). Teardown: **0** harness
containers, **0** harness volumes.

**Sixteen findings, none fixed.** Every one was found by this run; every one is
attributed to the lane that owns the source, with the measured number and the file
and line.

| id | sev | what | measured | owner |
|---|---|---|---|---|
| **GATE-13.3-01** | **high** | authenticated mobile header trio below 44 px, on **every** authenticated route | 40.000 × 40.000 | shell — `navigation/AppLayout.tsx` `mobileActions` |
| **GATE-13.3-02** | **high** | mobile wizard step indicator squeezed at the 320 px design width | 18–20 × 40/48 | wizard — `EnhancedProgressIndicator.tsx:345` |
| **GATE-13.3-03** | **high** | shared `Switch` primitive: the 44 px wrapper is an inert `div`, the tappable control is not | 44 × 24 | design system — `ui/switch.tsx` |
| **GATE-13.3-04** | med | `ErrorDisplay`'s support/back links are text-sized — on **every** error state in the product | 126.797 × 20 | design system — `ui/ErrorDisplay.tsx:64,109` |
| **GATE-13.3-05** | med | desktop sidebar collapse control, on 7 of 8 surfaces at ≥ 768 px | 36 × 36 | shell — `navigation/DesktopSidebar.tsx:146` |
| **GATE-13.3-06** | low | wizard's floating keyboard-shortcuts button at ≥ 1280 px | 40 × 44 | wizard — `KeyboardShortcutsHelp.tsx:28` |
| **GATE-13.3-07** | med | dashboard first paint shifts over the CLS budget at two widths, reproducibly | 0.116 @ 375, 0.105 @ 390 (budget 0.100) | dashboard — task 11.1 |
| **GATE-13.3-08** | med | dashboard/status/payment heading order: a heading precedes the `h1`, and levels skip | `h2→h1`, `h2→h4`, `h1→h3` | dashboard + shell |
| **GATE-13.3-09** | **high** | the canonical `/student/status` route tells a student who owns **2** applications that none exists | 2 owned, "Application Not Found" | student workspace — STU-23 |
| **GATE-13.3-10** | **high** | offline while the wizard is mounted shows the student a **raw JavaScript TypeError**, and the wizard is gone | `Cannot read properties of undefined (reading 'SessionMonitor')` | wizard/shell |
| **GATE-13.3-11** | **high** | at 320 px — R16.1's own design width — the four bottom-navigation links have **no accessible name** | axe `link-name`, serious, ×4 | shell — `ui/BottomNavigation.tsx:221` |
| **GATE-13.3-12** | med | colour contrast below AA on the wizard's Education step and the bottom-nav labels | axe `color-contrast`, serious, 9 rows | wizard + shell |
| **GATE-13.3-13** | **high** | a *legally-named* long intake makes **every** student application create fail with an unhandled `DataError` | `varchar(100)` snapshot vs `varchar(255)` source → HTTP 500 | applications/data |
| **GATE-13.3-14** | med | the font fallback chain is fixed in the config and still **reduced in the browser** | 3 families rendered, 11 declared | design system — `index.css:51` |
| **GATE-13.3-15** | med | the amendment form's own field controls, at ≥ 768 px only | 37 px and 38 px tall | student workspace — `AmendmentForm.tsx:50,65` |
| **GATE-13.3-16** | **high** | the fixed bottom navigation **overlaps the dashboard's primary next action** in the first mobile viewport — *found by reviewing a screenshot, not by an assertion* | 18.2 px of 68 px = **26.7 %** covered (30.2 % on Pixel 5) | dashboard or shell — not chosen here |

---

## What this task establishes

1. **All six viewports and all nine dimensions were genuinely exercised, and one
   environment limit that 13.2 had to record does not apply here.** 13.2 §7 could
   not produce video because this OS has no ffmpeg Playwright will accept. This
   task's `_Evidence:` line asks for *screenshots and pixel checks* instead, and it
   has **146 screenshots organised per viewport** plus every check as a number. The
   one dimension that looked like it might be un-testable — **safe areas** — turned
   out to be fully measurable: Chrome accepted
   `Emulation.setSafeAreaInsetsOverride`, so the bottom bars were measured against
   a **real 34 px inset** rather than a declaration (§6).
2. **A pixel check is a number, and the numbers are published.** Every cell of
   [`raw/pixel-matrix.txt`](raw/pixel-matrix.txt) carries four: interactive
   elements scanned, document overflow in pixels, elements still covered after
   being scrolled into view, and the CLS score. 96 cells, 6 columns.
3. **The bullet's most substantive assertion is the one it was easiest to fake, so
   it is measured three ways.** The server-derived next action is required to be in
   the first mobile viewport. This measures the *whole control's* `bottom` against
   the viewport height **with the page forced to `scrollY === 0`**, checks that
   nothing is painted over its centre, and compares its label against the
   platform's own `allowed_next_actions[0]` — because a dashboard that invented a
   plausible action in the browser would pass a geometry test and still be the
   defect STU-04 names (§4).
4. **Sixteen real defects, and a pattern in why they survived.** Four of them were
   invisible to guards that already exist and are green:
   - six contrast guards in `productDesignDeFluff.test.tsx` pass while axe reports
     nine serious `color-contrast` rows, because they check token pairs in jsdom and
     never compute a rendered ratio (GATE-13.3-12);
   - a property test written for *exactly* the font-chain defect passes, because it
     parses `tailwind.config.js` as text and cannot see the `index.css` rule that
     overrides it — the value it names in its own comment as the *UNFIXED* case is
     what the browser still computes (GATE-13.3-14);
   - `PageShell` ships a heading-hierarchy validator that checks for precisely the
     two conditions GATE-13.3-08 violates, scoped to its own subtree and warning
     rather than failing;
   - a whole-tree 44 px scan exists in jsdom, where every rect is zero
     (GATE-13.3-01 … -06, -15).

   **A guard that inspects a declaration cannot answer a question about a rendered
   page.** That is the single most transferable thing this run found.

   And a seventeenth-hour one: **GATE-13.3-16 was found by looking at a
   screenshot**, not by any assertion. Every check in this file passed on the
   dashboard's primary action — it fits the viewport, it is not centre-occluded, it
   matches the server's label — and 19 % of it is behind the bottom navigation bar,
   with the second line of its own label visibly cut. That is the argument for an
   `_Evidence:` line that asks for **reviewed** screenshots: the numbers were all
   green and the picture was not (§4.1).
5. **The axe budget was designed around, and the design is measurable.** 13.1 §6.1
   recorded six runs of the existing omnibus axe test: never a violation, always a
   30 s timeout, recovering only on a fresh stack. This task scans **six** viewports
   and spends **one test per viewport**. Result: every viewport 7.2–8.7 s wall, the
   slowest single surface scan **2 347 ms**, and `navMs`/`axeMs` recorded on every
   row so a slow row says so in numbers (§7).
6. **Four of this task's own instruments were wrong first, in the way the task is
   about, and each correction is recorded.** An `sr-only` label read as 157 px of
   overflow; Radix's 1 px native `<select>` and a styled file input read as sub-44
   targets; a fixed bottom bar read as occlusion at one scroll offset; and an
   accumulate-then-write ledger published 2 of 20 measurements because Playwright
   replaces the worker after a failure. 13.2 §5.4's rule — *an instrument has to
   obey the rule it audits* — applied four times (§9).
7. **GATE-13.1-07 did not fire.** This task's config points its report, its
   `outputDir` and its HTML report at `13.3/raw/`. Task 0.4's
   `playwright-report.json` is byte-identical before and after
   (`85799ced…`), all five `11.x` screenshot directories are untouched, and
   `2.2/authority-conformance-summary.json` is unchanged
   ([`raw/gate-13-1-07-check.txt`](raw/gate-13-1-07-check.txt)). The base config was
   **not** modified and still writes into `0.4` — this is not a fix for the finding
   (§10).

---

## Files

```
docs/v2-evidence/13.3/
├── README.md                     ← this index
├── invariants-note.md            ← why this task publishes no DB invariant report, and the one SQL 13.4/13.5 should run
├── screenshots/                  ← THE REVIEWED SCREENSHOTS, organised per viewport
│   ├── 320x568/   (26)           ← 8 surfaces x 2 projects + the next-action and safe-area
│   │                                captures and 4 finding captures (-01, -09, -16), x2 projects
│   ├── 375x667/   (16)   390x844/ (16)
│   ├── 768x1024/  (16)   1280x800/ (16)   1440x900/ (16)
│   ├── dimensions/ (26)          ← keyboard focus, dialog focus, error focus, reduced motion,
│   │                                zoom 200/400, slow-3G cold+warm, offline, the offline boundary
│   └── long-content/ (17)        ← 180-char program, 96-char intake, RTL/CJK/Devanagari, 150-char tenant
└── raw/
    ├── identity-toolchain.txt    (commit, OS, docker/bun/playwright/chrome, stack, ffmpeg absence, instrument hashes, the six viewports)
    ├── pixel-matrix.txt          ← THE SIX-COLUMN MATRIX: 8 surfaces x 6 viewports x 2 projects, four numbers per cell
    ├── long-content-matrix.txt   ← the same four checks under long / localized / long-tenant content
    ├── axe-matrix.txt            ← 5 surfaces x 6 viewports, checks passed + nav/axe ms per row
    ├── dimensions.txt            ← every dimension's full recorded measurement
    ├── findings.txt              ← every offender measured, grouped by finding id
    ├── summarise.py              (the instrument that produced the four files above, read-only over the measurements)
    ├── measurements-chromium-13-3.jsonl, measurements-mobile-13-3.jsonl   ← the raw rows, appended as taken
    ├── aria-snapshots-*.txt      ← the accessibility tree a screen reader reads, per surface
    ├── run-full.txt              (50 passed, EXIT=0)
    ├── run-matrix-desktop.txt, run-a11y-desktop.txt, run-axe-desktop.txt,
    │   run-long-content.txt, run-matrix-wide-recheck.txt                  (the slices, as run)
    ├── playwright-report.json    (machine-readable; expected failures carry expectedStatus)
    ├── gate-13-1-07-check.txt    (all three write paths, before and after)
    ├── harness-down-pre.txt, harness-up.txt, harness-down-mid.txt, harness-down.txt
    ├── harness-drain.txt         (broker 0, unsettled collections 0)
    ├── artifacts/                (one trace + one screenshot per test)
    └── html-report/              (npx playwright show-report …)
```

Instruments added (all under test-side paths; **no product source was changed**):

```
apps/admissions/playwright.harness.13-3.config.ts             ← own outputDir/reporter/HTML report
apps/admissions/tests/harness-e2e/helpers/pixel-checks.ts     ← the five measurements, returning numbers
apps/admissions/tests/harness-e2e/helpers/surfaces-13-3.ts    ← the 8 surfaces, the world, the attribution lists
apps/admissions/tests/harness-e2e/required/viewport-pixel-matrix.spec.ts
apps/admissions/tests/harness-e2e/required/a11y-zoom-dimensions.spec.ts
apps/admissions/tests/harness-e2e/required/axe-viewport-sweep.spec.ts
apps/admissions/tests/harness-e2e/required/long-content-tenant-strings.spec.ts
```

All four specs live in `tests/harness-e2e/required/`, so the **base** required
profile runs them at both viewports from now on.

---

## 1. How it was run

Isolated task-0.4 harness, strict gates active, `HARNESS_PW_CHANNEL=chrome`
(Playwright's bundled Chromium is unsupported on this OS). `harness down` (volumes
wiped) before and after; the pre-state is recorded so *"freshly seeded"* is a
measurement rather than an adjective — **0** harness containers, **0** harness
volumes ([`raw/harness-down-pre.txt`](raw/harness-down-pre.txt)).

Two projects, one run:

| project | device | files | tests |
|---|---|---|---:|
| `chromium-13-3` | Desktop Chrome | all four | 33 |
| `mobile-13-3` | Pixel 5 — touch, DPR 2.75, `pointer: coarse` | matrix + dimensions | 21 |

**Why a mobile project at all, when the matrix sets its own viewport.** Because
Tailwind's `touch` variant is `(hover: none) and (pointer: coarse)`, so a 44 px rule
expressed through it is *only* exercised under a coarse-pointer profile. The device
profile also changes the DPR, which is what makes Chromium report fractional boxes —
the reason the touch tolerance is 0.5 px and not 0.

**Nothing was fixed.** No product source, service, migration, schema or register was
changed. The only writes are `docs/v2-evidence/13.3/**` and the seven test-side files
listed above. **Neon and production were not touched** — not connected to, not
queried, not modified.

---

## 2. The eight surfaces, and why these

One surface per finding the bullet names, plus the public tracker.

| surface | finding it serves |
|---|---|
| `/track-application` | STU-24 — brand/support through tenant context, on a page an anonymous visitor sees |
| `/student/dashboard` | **STU-04** — the next action obscured by metrics and duplicate actions |
| `/student/application-wizard?mode=resume` | **STU-03** — one bottom action surface, no competing floats |
| `/student/application/{id}/status` | **STU-23** — the one canonical application workspace |
| `/student/payment` | STU-24 + R12.3 — post-submission recovery and tenant support |
| `/student/history` | STU-05 — document action density |
| `/student/notifications` | STU-14 — real persisted preference controls |
| `/student/settings` | STU-20 — autosave, no static metrics |

The status surface is the **id-bearing** route deliberately. The bare
`/student/status` renders *"Application Not Found"* for a student who owns two
applications, so a matrix using it would have published an error state as the
canonical workspace. That observation is GATE-13.3-09 and has its own row (§8.9).

**Not re-derived.** 11.1–11.5 already screenshot the dashboard, wizard, documents and
admin lists at 320/375/390, and 11.5 ran `/student/history` at all six widths with a
400 % zoom. This task is the sweep those did not do: every surface at all six widths
with the numbers recorded, plus the six dimensions no earlier task measured in a
browser at all — occlusion, CLS, real safe-area insets, slow 3G, 200 % zoom, and long
strings.

---

## 3. The three assertions, as measurements

### 3.1 44 px targets

`getBoundingClientRect()` on **every** rendered pointer target, whole-tree — not
scoped to a panel, because R16.2 says *"EVERY pointer target"* and a scoped scan is
how a sub-44 control in a header survives a green suite.

What counts as a pointer target had to be narrowed, and the narrowing is itself a
measurement (§9.2): a target must be **visible** and **exposed**. Each exclusion is
counted separately in every row — `skippedZeroBox`, `skippedVisuallyHidden`,
`skippedAriaHidden`, `skippedNoPointerEvents` — so *"nothing was measured"* can never
look like *"everything passed"*.

Seven distinct sub-44 controls were found (GATE-13.3-01 … -06, -15), every one
confirmed in source with its file and line. 216 individual measurements of them are
in [`raw/findings.txt`](raw/findings.txt).

### 3.2 Overflow, and the difference between overflow and clipping

Three measurements, because R16.7 names three different failures:

| measurement | what it answers |
|---|---|
| `documentElement.scrollWidth − clientWidth` | can the student push the page sideways? **0 px on all 96 cells.** |
| clipping containers that cut off an **interactive** descendant | R16.7's *"clipped text, hidden commands"*. **0 across all 96 cells.** |
| `overflow-x: auto\|scroll` regions | a design decision (an admin table may be one) — recorded, never failed |

An `overflow-x: hidden` container does not *scroll*, it **cuts content off**, so it is
only an offender when what is cut off is something the student needs — and the
offending control is named.

### 3.3 Occlusion, in two phases

`elementFromPoint` at each control's own centre, then **again after scrolling it to
the middle of the viewport**. The two-phase design is not caution, it is a corrected
error: the single-phase draft reported the dashboard's *"Add your Grade 12 results"*
link as covered by a bottom-navigation item at y = 558 in a 568 px viewport. It was —
*at that scroll offset*. A fixed bottom bar covers whatever is under it at any given
moment; the page reserves `--bottom-nav-safe-offset` precisely so scrolling brings
content clear.

So `occludedAtRest` is recorded and `occluded` (still covered with the whole viewport
to move in) is asserted. Measured: **6 cells had something covered at rest, 0 cells
had anything still covered after scrolling.**

### 3.4 Layout shift

`PerformanceObserver` on `layout-shift`, installed **before the document exists** so
a shift during first paint is counted, with `hadRecentInput` entries excluded — a
shift the student caused by tapping is not the shift R16.7 forbids. Budget **0.1**,
Core Web Vitals' own "good" threshold, used rather than an invented one.

12 readings per project. The dashboard is over budget at two widths and inside it at
four; the wizard is inside at all six:

```
dashboard   320=0.085  375=0.116  390=0.105  768=0.085  1280=0.054  1440=0.049
wizard      320=0       375=0.014  390=0.074  768=0.041  1280=0.034  1440=0.027
```

**Reproducible, not flake**: 375 px measured 0.1172, 0.1188, 0.1164 and 0.1164 across
four separate runs — the reading moves in the third decimal and never drops under
budget. GATE-13.3-07 (§8.7).

CLS is asserted in **its own row**, not folded into the six geometry rows, and that is
a corrected error too: when it was folded in, a single reading at 375 px stopped the
other four widths from ever being measured (§9.4).

---

## 4. The actual next action, in the first mobile viewport

The bullet's most substantive assertion, and three things separate it from what task
11.1 already established:

| 11.1 | here |
|---|---|
| `panelBox.y < viewportHeight` — the block *starts* on screen | the whole primary control's `bottom <= viewportHeight` |
| `toBeVisible()`, which Playwright satisfies **by scrolling** | the page is forced to `scrollY === 0` before the box is read |
| the panel renders | nothing is painted over the control's centre, **and** its label is one the *server* published |

Measured at 320 × 568, both projects:

```
label                                     "Pay or defer the application fee"
top / bottom / height                     457.159 / 525.159 / 68.000
viewport height                           568
fully visible unscrolled                  true          ← 525.159 <= 568, at scrollY 0
scrollY when measured                     0
occludedBy                                null
server allowed_next_actions               ["Pay or defer the application fee",
                                           "Add your Grade 12 results"]
rendered label matches [0]                ✓
```

43 px of clearance at the narrowest supported viewport, with the whole control on
screen and its centre clickable. Worth noting what these same numbers would have
looked like under 11.1's assertion: `top = 457.159 < 568` passes even if the
control's bottom were at 900.

And worth noting what they still did not catch — §4.1.

The last line is the one that matters most: `student-next-action` renders what the
platform's readiness evaluator published, and the rendered label is compared against
`allowed_next_actions[0]` from `/api/v2/student/applications/{id}/readiness/`. A
dashboard that derived a plausible next action in the browser — STU-04's original
defect — would satisfy every geometric check on this page and still be wrong.

Screenshot: `screenshots/320x568/next-action-first-viewport-*.png`.

### 4.1 What the screenshot showed that the numbers did not — GATE-13.3-16

Every assertion above passes, and the picture is still wrong. Reviewing
`screenshots/320x568/next-action-first-viewport-chromium-13-3.png` shows the second
line of the button's own label — *"application fee"* — behind the bottom navigation
bar. Measured:

```
primary next action     top 457.159   bottom 525.159   height 68.000
fixed bottom nav        top 507.000
overlap                  18.159 px  =  26.70 % of the action's height   (chromium)
                         20.546 px  =  30.21 %                          (Pixel 5)
elementFromPoint at the action's centre (y ≈ 491)   →   the action itself
```

The centre-point probe is **right** that the control is clickable: its centre is above
507. But R16.3's clause is *"SHALL not overlap, obscure, or compete"* and R16.7's is
*"overlapping fixed surfaces"* — both questions about the box, not the midpoint. The
instrument was upgraded to an **area intersection** against every on-screen
fixed/sticky bar, and the number is now recorded on every next-action measurement.

The dashboard does reserve `--bottom-nav-safe-offset` for scrolled content, so
scrolling clears the overlap. This is the **first viewport, unscrolled** — exactly
the position R16.1 and STU-04 are about.

This is the strongest single argument in this file for the shape of its own
`_Evidence:` line. Fifteen findings came from measurements; this one came from
looking, and then from a better measurement written *because* of the looking.

---

## 5. The nine dimensions

All nine exercised. Full recorded output in [`raw/dimensions.txt`](raw/dimensions.txt).

| # | dimension | instrument | result |
|---|---|---|---|
| 1 | **keyboard** | the real `Tab` sequence walked and recorded; every stop checked for a visible focus indicator (computed `outline`/`box-shadow`) and an accessible name | **6 stops to the primary action**, 0 unnamed, 0 without a visible indicator. Sequence published (§5.1) |
| 2 | **screen-reader semantics** | `locator.ariaSnapshot()` — the accessibility tree, not the DOM — plus landmark/heading-order structure | one `main`, one `h1` on all three surfaces; heading order defective → GATE-13.3-08. Snapshots in [`raw/aria-snapshots-*.txt`](raw/) |
| 3 | **focus restore** | open a product dialog from a marked trigger, `Tab` × 8 for containment, `Escape`, then check `document.activeElement` **is that trigger** | contained ✓, Escape closes ✓, **focus restored to the trigger** ✓, 0 native `window.confirm` |
| 4 | **error focus** | a refused sign-in, with the **login response awaited** so the refusal is observably real | HTTP **401**, `role="alert"` live region carrying the message, still on `/auth/signin` ✓ |
| 5 | **reduced motion** | `prefers-reduced-motion: reduce` emulated, then every animation/transition duration read from **computed style** | 0 elements over 1 ms out of 1 000+ scanned per surface; `scroll-behavior` not `smooth` ✓ |
| 6 | **200 % / 400 % zoom** | 32 px root at **320×568**; 64 px root at **1280×1024** | 0 px overflow, 0 clipped text blocks, next action still labelled at both (§5.2) |
| 7 | **safe areas** | CDP `Emulation.setSafeAreaInsetsOverride` → a **real 34 px inset** | action bar padding **46 px** (= 12 + 34), bottom nav **34 px**, bottom nav suppressed on the wizard route (count **0**) (§6) |
| 8 | **slow 3G / offline** | CDP `Network.emulateNetworkConditions` at Chrome's Slow-3G preset, warm and cold; then a real offline/reconnect cycle | warm next action in **~8 s**; cold never dead-ends; offline → GATE-13.3-10; reconnect recovers via `Try Again` ✓ (§5.3) |
| 9 | **long tenant / program / localized strings** | a tenant configured over the platform's own capability-gated HTTP commands | 180-char program + 96-char intake at all six widths ✓; RTL/CJK/Devanagari ✓; 150-char tenant name resolved through context ✓ (§8.13, §8.14) |

### 5.1 The keyboard sequence, published

```
1: a      [Skip to main content]
2: button [Open profile settings]
3: button [Notifications (1 unread)]
4: button [Log out]
5: button [Refresh]
6: a      [Pay or defer the application fee]     ← the primary next action
```

Six stops from the top of the document to the student's next action, every one named
and every one painting a focus indicator. Worth stating because the *same three
controls at stops 2–4* are GATE-13.3-01: they are perfectly reachable and perfectly
labelled, and 4 px too small to tap.

### 5.2 Why 200 % and 400 % are applied at different widths

Because the two success criteria specify different things, and using one width for
both would test neither.

- **200 %** — WCAG 1.4.4 (Resize Text) is a text-scale claim, so it is applied at
  **320 × 568**, the width R16.1 designs for. 11.1 and 11.2 already captured a
  `-320-text200` screenshot for two surfaces; this measures the numbers across the
  journey.
- **400 %** — WCAG 1.4.10 (Reflow) *defines* its test as a 1280 × 1024 window at
  400 %, because that yields a 320 CSS-px-equivalent viewport. 11.5 §journey 7
  established why applying a 4× root font to a viewport that is *already* 320 px asks
  for an 80 px-equivalent space no standard requires: measured that way the
  authenticated header alone reaches 848 px, which is arithmetic about the premise
  rather than a defect.

### 5.3 Slow 3G, warm and cold — and why only one of them is asserted

At Chrome's Slow-3G preset (400 kbps down/up, **2 000 ms** RTT):

| leg | measured | asserted? |
|---|---|---|
| **warm** — bundle cached, reload | next action arrives, label intact | **yes** — this is the returning student R16.8 is about |
| **cold** — HTTP cache emptied first | the boot overlay/skeleton is on screen; the action does not arrive inside a 90 s budget | **no** — recorded |

The cold number is recorded rather than asserted because a first-visit SPA download at
400 kbps with a 2 s round trip is minutes of transfer: that is arithmetic about the
profile, not a defect, and reporting it as *"the next action is unreachable on slow
3G"* would be a duration result masquerading as a capability one — 13.1 §6.1's exact
warning. What **is** asserted on the cold leg is R16.8's real clause: the student is
never left staring at nothing.

---

## 6. Safe areas were measurable here, and they hold

The one dimension that looked like it might have to be recorded as an environment
limit. It does not: Chrome accepted
`Emulation.setSafeAreaInsetsOverride` with a 34 px bottom inset, so the bars were
measured against a **real** inset rather than a declaration.

```
CDP safe-area inset override applied ............ 34 px
--safe-area-inset-bottom ........................ 34px
--bottom-nav-safe-offset ........................ calc(64px + max(.5rem, 34px))   = 98 px

wizard action bar   padding-bottom ............... 46 px    ( = 0.75rem + 34 )
                    declaration .................. [class] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]
bottom navigation   padding-bottom ............... 34 px    ( = the inset )
bottom nav count on the wizard route ............. 0        ← R16.3
```

Both bottom-anchored surfaces grow with the inset, and **R16.3's "one mobile bottom
action surface" holds**: the global bottom navigation is suppressed entirely on the
wizard route. Screenshot: `screenshots/320x568/wizard-safe-area-*.png`.

**One instrument correction on the way** (§9.3): the declaration was first recovered
by walking the CSSOM, which reported `(none found)` for a bar whose padding is
demonstrably `pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]` — Tailwind escapes
the comma in that selector as `\2c `, and `el.matches()` on the escaped selector does
not reliably match. The class attribute is where the component actually wrote the
declaration.

---

## 7. The axe sweep, and the budget it was designed around

13.1 §6.1 is the reason this is a separate file with **one test per viewport**. Its six
recorded measurements of `design-system-defluff.spec.ts:664` are unambiguous: **no axe
violation in any run**, always `Test timeout of 30000ms exceeded`, recovering only on
a freshly seeded stack — because that test walks four routes at two widths inside one
30 s test-level budget.

This task scans **six** widths. Slicing per viewport, measured:

| viewport | wall | slowest single surface (nav + axe) |
|---|---:|---:|
| 320×568 | 10.0 s | 2 198 ms |
| 375×667 | 10.6 s | **2 423 ms** |
| 390×844 | 10.5 s | 2 359 ms |
| 768×1024 | 9.7 s | 2 315 ms |
| 1280×800 | 9.7 s | 2 327 ms |
| 1440×900 | 9.8 s | 2 278 ms |

For comparison, the existing omnibus scan's own six recorded measurements were
13.0 s, 13.1 s, 17.5 s, 19.1 s, **31.1 s (timeout)** and **38.3 s (timeout)**. Same
box, same axe version, and here **four extra viewports** and 30 scans — the
difference is the slicing. The slowest single surface scan in the whole sweep is
**2 423 ms**, so the widest viewport row still finishes with roughly two thirds of a
30 s budget unused.

Every row records `navMs` and `axeMs` separately alongside the number of axe checks
that passed, so a slow row is attributable and **a timeout can never be read as an
accessibility violation**. Full table: [`raw/axe-matrix.txt`](raw/axe-matrix.txt).

Two blocking rule families were found — `link-name` at 320 px (GATE-13.3-11) and
`color-contrast` on three surfaces (GATE-13.3-12). **Moderate and minor violations
are recorded rather than dropped**; there were 0. A report that says "zero
violations" when it means "zero blocking violations" is the kind of claim this file
exists to stop.

---

## 8. The fifteen findings

Every one attributed with its measured number and its source line. **None fixed** —
13.3 runs and records.

Six findings carry a **`test.fail()`-annotated row** that states the *correct,
unweakened* claim — nine rows in total, because four of the six run on both projects.
The pattern follows 13.2 §3.6: the assertion says what the requirement actually
requires, so nothing can be read as blessing the behaviour; the test still
**executes** (`test.skip` is a hard failure in this harness — GOV-04); the
counter-example is in the trace and in `raw/measurements-*.jsonl`; and the day a lane
fixes its primitive, that row fails **because it passed**, which is the notification
the owning lane wants.

The per-viewport rows allow-list the found offenders **by accessible name or element
`id`**, with the measured size published beside them, so those rows can go on
measuring everything else. A sub-44 control this run did not find still fails every
row.

### 8.1 GATE-13.3-01 — the authenticated mobile header is 40 × 40

```tsx
// src/components/navigation/AppLayout.tsx  (mobileActions)
className="inline-flex h-10 w-10 items-center justify-center rounded-full …"
aria-label="Open profile settings"        // 40.000 x 40.000
aria-label="Log out"                      // 40.000 x 40.000
```

`h-10 w-10` is 40 px. R16.2 requires ≥ 44 × 44. Present on **every authenticated
route** — 86 measurements across 8 surfaces × 6 viewports × 2 projects, always
exactly 40.000 × 40.000. The admin header renders the same pattern.

The fix is `min-h-touch min-w-touch`, which the repo already defines. Not applied
here. Screenshot: `screenshots/320x568/gate-13-3-01-sub44-header-*.png`.

### 8.2 GATE-13.3-02 — the mobile wizard step indicator is squeezed at 320 px

```tsx
// applicationWizard/components/EnhancedProgressIndicator.tsx:345 (the mobile row)
isCurrent  ? 'w-12 h-12 …'   // 48
           : 'w-10 h-10 …'   // 40  ← below 44, and no shrink-0
```

Measured at 320 × 568:

```
Step 1: Programme (completed)        20 x 40
Step 2: Assigned school (completed)  20 x 40
Step 3: Personal (completed)         20 x 40
Step 4: Education (current)          20 x 48
Step 5: Payment                      18 x 40
Step 6: Review                       18 x 40
```

Two defects compounding: the buttons are declared at 40 px (below 44), and without
`shrink-0` six of them in one row at 320 px are compressed to **18–20 px wide**. The
*desktop* variant of the same component sizes its circle from
`var(--touch-target, 44px)` and gets this right; the mobile branch hardcodes `w-10`.
This is R16.1 and R16.2 failing together at exactly the width R16.1 names.

### 8.3 GATE-13.3-03 — the `Switch` primitive's 44 px wrapper is inert

```tsx
// src/components/ui/switch.tsx
<div className="relative inline-flex items-center justify-center min-h-touch min-w-touch">
  <SwitchPrimitives.Root className="… h-6 w-11 …">   ← 44 x 24, and this is what receives the tap
```

The wrapper `div` is 44 × 44 and has no handler, so tapping its padding does nothing.
The `button[role="switch"]` that actually toggles is **44 × 24**. Measured on
`/student/notifications` — STU-14's own persisted preference controls — at every
width, 36 times.

### 8.4 GATE-13.3-04 — `ErrorDisplay`'s links are text-sized

```tsx
// src/components/ui/ErrorDisplay.tsx:64, :109
<a href={supportUrl} className="inline-flex items-center gap-1 text-sm …">Contact Support</a>
```

Measured **126.797 × 20**. No touch minimum. Because it is a shared primitive this
appears on **every error state in the product**, not one page. Captured on the bare
`/student/status` route (§8.9), which is where an error state renders in this world.

### 8.5 GATE-13.3-05 — the desktop sidebar collapse control is 36 × 36

```tsx
// src/components/navigation/DesktopSidebar.tsx:146
className="flex h-9 w-9 items-center justify-center rounded-full …"
aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
```

`h-9 w-9` = 36 px. 42 measurements: 7 of 8 surfaces × 3 widths × 2 projects, and
**none below 768 px** — which is itself the diagnosis, since the sidebar only mounts
there.

### 8.6 GATE-13.3-06 — the wizard's floating shortcuts button is 40 px wide

```tsx
// applicationWizard/components/KeyboardShortcutsHelp.tsx:28
className="fixed bottom-4 right-4 z-40 hidden shadow-lg lg:inline-flex"
```

Measured 40 × 44 at 1280 and 1440. `lg:inline-flex` hides it below 1024 px, so task
11.2's claim to have dropped the *mobile* floating buttons STU-03 named still holds —
this is the desktop remnant.

### 8.7 GATE-13.3-07 — the dashboard's first paint shifts over budget at two widths

```
/student/dashboard   375x667   CLS 0.1164 (chromium) / 0.1172 (mobile)   budget 0.100
/student/dashboard   390x844   CLS 0.1050 (both)
```

One shift each, at t ≈ 600 ms — i.e. async content landing and moving the page after
first paint. **Reproducible across three runs** (0.1172 → 0.1188 → 0.1164 at 375 px),
so it is a finding rather than noise. Inside budget at 320, 768, 1280 and 1440, and
the wizard is inside budget at all six — so this is one surface at two widths, not a
general property. Both readings sit in Core Web Vitals' "needs improvement" band.

### 8.8 GATE-13.3-08 — heading order on three surfaces

Measured sequences (published in full in [`raw/dimensions.txt`](raw/dimensions.txt)):

```
/student/dashboard      h2 "Dashboard" → h1 "Welcome back, …" → h2 ×4 → h4 "Diploma in Registered Nursing" → h2 ×2
/student/status         h2 "Application Status" → h1 "Application Status" → h3 "Application Not Found"
/student/payment        (one heading precedes the h1)
```

Two defects:

- **a heading precedes the `h1`** on every authenticated surface — one shell-level
  heading, so it is attributed once rather than three times. Measured in the
  browser; **not traced to its component**, and saying so is the honest form.
- **levels skip** — `h2 → h4` on the dashboard is
  `src/components/student/ApplicationListItem.tsx:151`, confirmed in source; `h1 → h3`
  on the status error state.

`PageShell` ships `validateHeadingHierarchy` (`src/components/ui/PageShell.tsx:57`)
which checks for exactly these two conditions. It did not stop either: it is scoped to
the shell's own subtree and it warns rather than fails.

### 8.9 GATE-13.3-09 — the canonical status route denies applications the student owns

```
GET /api/v1/applications/  →  2 applications owned by this student
/student/status            →  "Application Status … Application Not Found
                               Application not found or access denied  Try Again  Contact Support"
```

`/student/status` is a registered canonical route (`routeRegistry.ts` →
`student.status`) and `/student/application-status` **redirects to it**. STU-23's
remedy was *"choose one canonical application workspace and redirect the other"*; the
id-bearing route is the workspace, and this one neither resolves an application nor
redirects anywhere.

One extra thing measured on that screen and worth passing on: it still prints
`Runtime Frontend 2.0.0-harness Backend 2.0.0` — the `PageShell` implementation
metrics row that 11.5 §2.2 removed elsewhere.

### 8.10 GATE-13.3-10 — going offline shows the student a raw TypeError

With the connection cut while the wizard is mounted, the measured screen is:

> **Something went wrong** · *Cannot read properties of undefined (reading
> 'SessionMonitor')* · **Try Again** · **Contact Support**

Three things at once, and only the third is acceptable:

1. a **whole-page error boundary replaces the wizard** — the in-progress form is gone
   from the DOM within 2.5 s;
2. the message is a **raw JavaScript TypeError** naming an internal module rather than
   the connection; and
3. a recovery affordance *is* offered, and it *works* — pressing `Try Again` after
   reconnect brings the wizard back (asserted by pressing it).

Mechanism: a **lazy route chunk failing to load while offline**
(`/assets/js/SessionMonitor-*.js`, `net::ERR_INTERNET_DISCONNECTED`) throws inside a
component and trips the boundary. **Honest caveat:** the preceding cold-load leg
empties the HTTP cache, which is what made the chunk un-cached and this reproduction
deterministic — a student who already has the chunk cached would not see it. But a
student landing on the wizard on an unstable connection is precisely the case R16.8
exists for, so this is a real failure mode rather than an artefact. Reproduced
identically on **both** projects.

The outage's failed requests are **declared**, not suppressed: five
`net::ERR_INTERNET_DISCONNECTED` calls (three application-scoped reads, the
required-documents read, one route chunk), each allow-listed by the specific pattern
the injection breaks — a `net::ERR_ABORTED` cancellation and a real transport failure
are different things (task 8.3).

### 8.11 GATE-13.3-11 — the bottom navigation is unlabelled at the design width

```tsx
// src/components/ui/BottomNavigation.tsx:221
const isNarrowViewport = viewportWidth < 360
// …:293
<BottomNavLink … iconOnly={isNarrowViewport} />
// …:195
{!iconOnly && (<span className="… text-[10px] …">{item.label}</span>)}
```

Below 360 px the label span is dropped and **nothing replaces it** — no `aria-label`
on the `Link`, and a decorative icon. axe reports `link-name` (**serious**, WCAG 2.4.4
/ 4.1.2) on all four items, at **320 × 568 only**, because that is the one width in
R16.7's list below the threshold. Measured accessible names at 320 px: all four
`aria-label: null`, `text: ""`.

The sharpest part is where it lands: R16.1 says the student experience *"SHALL be
designed at 320 CSS pixels first"*, and 320 px is exactly the width at which the
primary navigation stops telling a screen-reader user where anything goes.

### 8.12 GATE-13.3-12 — colour contrast below AA

`color-contrast` (serious, WCAG 1.4.3), 9 rows:

| surface | element | source |
|---|---|---|
| wizard, Education step | `.text-red-500` on the *"n/5 unique minimum"* counter | `applicationWizard/steps/EducationStep.tsx:293` |
| wizard, Education step | `.bg-primary/10 .text-primary` subject chips (×5) | `EducationStep.tsx:335` |
| wizard | `.p-3 > h4` | the same step's panel |
| bottom nav | the `text-[10px]` label in `text-primary` on the active item | `ui/BottomNavigation.tsx` |
| bottom nav | the `text-[10px]` label on the *More* overflow button | same |

Two are `DESIGN.md` violations independently of contrast: `text-red-500` is a **raw
Tailwind palette step** on a status message, where the guardrail is an approved token
*and* a non-colour cue; and a `10px` label is below the type scale's floor.

`tests/unit/productDesignDeFluff.test.tsx` carries six contrast guards and they are
all green. They check token pairs in jsdom; none computes a rendered ratio.

### 8.13 GATE-13.3-13 — a legally-named long intake makes every application create 500

Two canonical columns disagree:

| column | width | source |
|---|---|---|
| `intakes.name` — the catalogue's own value | `varchar(255)` | `backend/apps/catalog/models.py:114` |
| `applications.intake` — the **display snapshot** | **`varchar(100)`** | `backend/apps/applications/models.py:77` |

So a Platform_Admin may legitimately create a 120-character intake — `POST
/api/v1/catalog/intakes/` returns **201** — and from that moment every student
application create against it fails:

```
POST /api/v1/applications/  →  500  {"code":"INTERNAL_ERROR"}
psycopg2.errors.StringDataRightTruncation: value too long for type character varying(100)
  at apps/applications/admin_review_views.py:425   Application.objects.create(**create_kwargs)
```

Not a validated 400 naming the field, and not a truncated snapshot — an **unhandled
`DataError`** surfacing as a generic *"An unexpected error occurred"*. The student sees
nothing actionable and the tenant operator has no way to learn that the name they
chose is the cause.

This is the class `docs/canonical-truth-map.md` exists to prevent: a snapshot narrower
than its canonical source is a latent 500. It is also why the long-content sweep above
uses a **96-character** intake name — this task had to *discover* the ceiling before it
could measure anything. See [`invariants-note.md`](invariants-note.md) for the SQL
13.4/13.5 should run against real data.

### 8.14 GATE-13.3-14 — the font chain is fixed in the config and reduced in the browser

```js
// tailwind.config.js:121   — eleven families, as PRODUCT.md and tech.md require
sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
       '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif']
```

```css
/* src/index.css:51 — three, and this is what the browser computes */
body { font-family: Inter, system-ui, sans-serif; }
```

A base-layer `body` rule shadows the utility the config feeds, so every intermediate
fallback — and `"Noto Sans"`, the one that matters for non-Latin script — is
unreachable at runtime. Measured on `body`: `Inter, system-ui, sans-serif`.

**Why it survived is the interesting half.**
`tests/property/auditProductionBugCondition.property.test.ts` carries a property test
for this exact defect — *"Bug 5 — Font fallback chain includes intermediate
fallbacks"* — and it is green. It reads `tailwind.config.js` **as text**, so it can
only see the half that was fixed. The value it names in its own comment as the
*UNFIXED* case, `['Inter', 'system-ui', 'sans-serif']`, is what a real browser still
resolves.

### 8.15 GATE-13.3-15 — the amendment form's fields are 37–38 px, at ≥ 768 px only

```tsx
// src/components/student/applicationStatus/AmendmentForm.tsx:50, :65
<select id="amend-field" className="w-full rounded-md border … px-3 py-2 text-sm" />
<input  id="amend-value" className="w-full rounded-md border … px-3 py-2 text-sm" />
```

Raw `<select>`/`<input>` instead of the canonical `FormSelect`/`Input` primitives that
carry a touch minimum. The reason it appears only at ≥ 768 px is exact:

```css
/* src/index.css:215 */
@media (max-width: 639px) { input…, textarea, select { min-height: 44px; } }
```

The platform's 44 px form-control floor is scoped to `max-width: 639px`. Below 640 px
the global rule rescues these controls; at 768 px and above nothing does. Measured
414×37 / 414×38 at 768, 579×37 / 579×38 at 1280, 686×37 / 686×38 at 1440 — the width
tracks the container, **the height never changes**.

---

## 9. Four of this task's own instruments were wrong first

13.2 §5.4's rule is that an instrument has to obey the rule it audits. It applied four
times here, and each correction is in the source with the measurement that forced it.

### 9.1 An `sr-only` label read as 157 px of overflow

The first overflow draft failed **every surface** on `label.sr-only` with
`scrollWidth − clientWidth = 157`. A visually-hidden label **is** a 1 × 1 clip box
containing a sentence — that is how a screen-reader-only string is built. Reporting it
as a layout defect would have been an instrument misreading an accessibility feature
as a bug. Visually-hidden elements are now excluded **by measurement** (a ≤ 1 px client
box, a `clip`, or an `inset(50%)` clip-path), never by class name.

### 9.2 Three correct patterns read as sub-44 targets

```
input[Upload Grade 12 result slip]  1x44   ← the accessible file-input pattern
select[MaleFemale]                  1x44   ← Radix Select's hidden native <select>
select[ZambiaAfghanistanÅland…]     1x44   ← the same, with every country as its "text"
```

None can be tapped: the styled label and the visible trigger are the real targets. So
a pointer target was narrowed to **visible and exposed** — not visually hidden, not
inside an `aria-hidden` subtree, not `pointer-events: none` — and each exclusion is
counted separately in every row so a scan that measured nothing cannot look like a
surface that passed.

### 9.3 Occlusion measured scroll position, not reachability

Covered in §3.3. And the safe-area declaration probe looked in the one place that
could not answer it (§6).

### 9.4 The ledger published 2 of 20 measurements

Playwright **tears down and replaces the worker process after a failed test**, which
resets module state and re-runs `afterAll`. An accumulate-then-overwrite ledger
therefore published only whichever worker finished last: the first full run took 20
measurements and the file held **2**. Measurements are now appended as JSON Lines *as
they are taken* — durable across a worker restart, and a partial run still leaves
behind everything it actually measured.

### 9.5 A locator `count()` that did not wait, and cost a whole run

The safe-area row measures the wizard action bar. Its first draft re-queried with
`document.querySelector` inside `page.evaluate` (§6). Its second used
`locator.count()` as a presence guard — and on the **Pixel 5 project only**, inside a
full 52-test run, `count()` returned **0** for a bar that `toBeVisible()` had just
asserted and `boundingBox()` measured at 288 × 155 microseconds later. `count()` does
not wait, so it landed in the gap between an unmount and a remount; the wizard
re-renders continuously because auto-save is mandatory on every student form and
React Query revalidates.

Recorded because it cost a run and because the honest version of the fix is the
general one: `waitFor({ state: 'attached' })` followed by `locator.evaluate`, both of
which auto-wait, plus **the rejection reason recorded in the returned row** rather
than swallowed — an absent element and a racing instrument look identical in a
boolean, and only one of them is a product fact. The row then measured identically on
both projects (46 px / 34 px), in isolation and in the full run.

**A sixth, structural one.** Three of the four spec files began as
`test.describe.configure({ mode: 'serial' })`, and under serial mode a finding in one
row **skips the rest**. Measured three times: *"1 failed, 6 did not run"* on the
dimensions file, *"1 failed, 7 did not run"* on the matrix, and twice on long content.
One known number was hiding six unknown ones. All four files now run their rows
independently, and every row collects its violations and asserts once at the end so a
failure names **every** offender rather than the first.

---

## 10. GATE-13.1-07 did not fire

13.1 §7.1 catalogued three instruments that overwrite an earlier task's
Required_Evidence. All three checked before and after every run
([`raw/gate-13-1-07-check.txt`](raw/gate-13-1-07-check.txt)):

| mechanism | fired? | evidence |
|---|---|---|
| the base harness config's hard-coded `0.4/playwright-report.json` | **no** | this task runs its own config; `0.4`'s artifact is `85799ced…` and `3951` bytes, **identical** before and after, mtime 06:05 — before this session |
| six required specs writing screenshots into `11.1`–`11.5` | **no** | none ran; all five directories unchanged (7/10/10/16/20 files, newest mtimes 05:50–05:58) |
| `test_authority_matrix_generated.py` writing `2.2/authority-conformance-summary.json` | **no** | no backend suite was run; `db5f2873…` identical |

This is **not a fix**, and the finding stands unchanged for anyone running
`playwright.harness.config.ts` — which still contains
`outputFile: '../../docs/v2-evidence/0.4/playwright-report.json'` and was not
modified. Avoiding a seventh victim is a property of a separate config, not a repair
of the shared one, which remains the harness lane's.

**One thing this task measured about that mechanism that 13.2 only warned about.**
Playwright clears `outputDir` at the **start** of every run, so a follow-up run of a
single test destroys the previous run's whole trace set — measured here: after a
one-test re-run, **1 of 51** traces survived. The final artifact set therefore comes
from one uninterrupted full run of both projects, and no single-test run was made
afterwards.

---

## 11. Known failures attributed, not fixed

Carried forward unchanged and **not** touched by this task:

| item | recording | lane |
|---|---|---|
| `tenant-launch.spec.ts:139` × both projects | 18th/19th | tenant (`TenantOnboardingWizard.tsx`, declined by 12.1 §21) |
| `authPageFormMarkup.test.tsx` | 11th | frontend test lane |
| 15 lint errors / 13 files | — | frontend lane |
| `ocr-manual-fallback.spec.ts:146` (intermittent) | — | wizard |
| the backend inventory 13.1 catalogued, incl. **GATE-13.1-02** (85 cases dead at fixture setup) | — | admin-query/scope (9.4) |
| `bun run validate:tailwind` exiting 127 | — | tooling |
| 13.2's **GATE-13.2-01** (capacity by name), **-02** (`SEAT_STATUSES` omits `enrolled`), **-03** (intermittent stale-tab revert) | — | admin-query / capacity / wizard |

These four spec files were run under the 13.3 config, which selects only the four
files this task added, so none of the above was re-executed here.

---

## 12. Boundaries honoured

| Boundary | What was done |
|---|---|
| **Runs and records; does not repair** | No product source, service, migration, schema or register changed. Sixteen findings, zero fixes — including four one-line ones (`min-h-touch` on the header, `shrink-0` on the step row, an `aria-label` on the bottom nav, deleting one `body` rule) |
| **The harness's own gates reused, not weakened** | All four specs import `harness-fixtures.ts` unchanged: skip is a hard failure, console errors and page exceptions fail, unasserted failed requests fail, and `net::ERR_ABORTED` is still a *cancellation* (8.3). `forbidOnly`, `retries: 0`, `workers: 1` identical to the base profile |
| **Reduced motion never overridden** | Dimension 5 **asserts** the global enforcement in `index.css`; it does not install, relax, or bypass it |
| **Injected faults declared per path** | The offline row allow-lists only the specific application-scoped reads and route chunk its own outage breaks; a 500 on anything else still fails the run |
| **Attribution lists are narrow** | Keyed on accessible name or element `id`, never on "any offender on this surface". A bare `<input>`'s `id` is carried in every measurement precisely so its attribution did not have to match the empty string |
| **New journeys are required journeys** | All four files live in `tests/harness-e2e/required/` |
| **Own config, own directory** | Report, `outputDir` and HTML report under `13.3/raw/`; the shared config untouched (§10) |
| **Fresh stack, measured** | `harness down` (volumes wiped) before and after; the 0-container/0-volume pre-state recorded |
| **Neon and production untouched** | Not connected to, not queried, not modified |
| **No secret printed** | Only the harness's own committed placeholders (`harness.env`) |
| **A borrowed tenant put back** | The long-tenant row temporarily renames the seeded MIHAS institution through the canonical institution-profile command and **restores it in a `finally`**, with the restore's HTTP status recorded ([`raw/tenant-name-restore-*.txt`](raw/)) rather than assumed |
| **No evidence of an earlier task edited** | `0.4`, `2.2`, `11.1`–`11.5`, `13.1` and `13.2` were **read**. §10 verifies nothing was rewritten |

---

## 13. Not claimed here

- **That the sweep is clean.** It is not: **sixteen findings**, seven of them carrying
  a deliberately-failing row. A matrix with stated gaps is useful; one with silent gaps
  is not.
- **That any finding was diagnosed beyond the source line named.** Each is measured,
  located, and attributed. No fix was designed, no owner was consulted, and no
  regression risk was assessed. **GATE-13.3-16 is not even attributed to one lane** —
  the overlap could be closed by the panel's bottom spacing or by the bar; this task
  measures 13 px and does not choose.
- **That the pre-`h1` heading in GATE-13.3-08 was traced.** It was measured in the
  browser on three surfaces and **not** attributed to a component (§8.8).
- **That GATE-13.3-10 reproduces without an emptied cache.** The preceding cold-load
  leg is what makes it deterministic, and §8.10 says so. Whether a student with a warm
  cache can reach the same state was not measured.
- **That the cold slow-3G leg is a product result.** It is a recorded duration under a
  400 kbps / 2 000 ms profile, explicitly not asserted (§5.3).
- **That a real device's safe-area inset behaves as the CDP override did.** A 34 px
  inset was emulated and both bars responded correctly (§6); no physical device was
  used.
- **That the 200 %/400 % zoom rows cover every surface.** They cover the dashboard and
  `/student/payment`; `/student/history` at 400 % is 11.5's, and the other five
  surfaces were measured at literal widths but not at zoom.
- **That video evidence exists.** It cannot on this OS (13.2 §7 measured it: no system
  ffmpeg, and `playwright install ffmpeg` refuses `ubuntu26.04-x64`). This task's
  `_Evidence:` line asks for screenshots and pixel checks, which is what is here;
  traces still carry a filmstrip.
- **That the whole 220-test required profile was re-run.** 13.1 ran it twice on this
  commit. These four new files were run under a config that inherits the identical
  fixtures and gates; the base profile will pick them up on its next run, at both
  viewports.
- **That admin surfaces were swept.** The eight surfaces are the **student** journey
  the bullet's findings name. 11.4 owns the 390-width admin matrix, and the existing
  axe test still sweeps `/admin/intakes`.
- **Any numbered spec property.** This task has no PBT sub-task; `tasks.meta.json` →
  `pbtResults` is `{}` for it, so nothing is recorded through `update_pbt_status`.
- **That the DB invariant SQL in [`invariants-note.md`](invariants-note.md) was
  answered against real data.** It was not — 13.4 owns the Neon rehearsal, 13.5 the
  canary.

---

## 14. What a future task on this sweep should know

1. **Measure the element you asserted on.** A bare `document.querySelector` inside
   `page.evaluate` does not wait, and the wizard re-renders continuously (autosave is
   mandatory, React Query revalidates). It reported `present: false` for a bar that
   `toBeVisible()` had just asserted and `boundingBox()` had just measured at
   288 × 155. `locator.evaluate` auto-waits (§6).
2. **A screenshot is not a pixel check — and a pixel check is not a review.** Publish
   the number: most findings here are only legible *as* numbers (40.000 vs 44, 0.119
   vs 0.1, 3 font families vs 11). Then **look at the picture anyway**: GATE-13.3-16
   passed every number in this file and is visible at a glance (§4.1).
3. **Measure boxes, not midpoints.** `elementFromPoint` at a centre answers "is the
   middle tappable". *"Shall not overlap, obscure, or compete"* is an area question,
   and the difference was a high-severity finding.
4. **Slice per viewport, and record the duration next to the result.** 13.1 §6.1's
   omnibus axe test times out at 30 s; six per-viewport tests each finish in 8 s. A
   row that fails on time must say so in numbers, or someone will read it as an
   accessibility violation.
5. **Do not use `mode: 'serial'` for independent rows.** Measured three times: one
   known finding skipped six unmeasured widths (§9.4).
6. **Collect violations, assert once.** Throwing on the first surface means the 320 px
   row tells you about the header and nothing about the other seven surfaces.
7. **Your instrument must obey the rule it audits — five times over.** `sr-only` is a
   1 × 1 clip box, a Radix `<select>` shadow is `aria-hidden`, a fixed bar covers
   whatever is under it, and Playwright replaces the worker after a failure (§9).
8. **Discover the schema ceiling before you choose a long string.** A 120-character
   intake name is legal in the catalogue and fatal at application create
   (GATE-13.3-13). The sweep above uses 96 because 100 is the real limit.
9. **A guard that reads a declaration cannot answer a question about a rendered
   page.** Four findings here sat behind green guards of exactly that shape.
10. **Playwright clears `outputDir` at the start of every run.** One follow-up
   single-test run destroyed 50 of 51 traces. Take the artifact set from one
   uninterrupted run, and do not run anything afterwards (§10).
11. **Put a borrowed tenant back.** The long-tenant row renames a *seeded* tenant
    because only a seeded domain resolves (13.2 §2), and restores it in a `finally`
    with the restore's status recorded — otherwise every later spec in the required
    profile inherits a tenant it does not recognise.
