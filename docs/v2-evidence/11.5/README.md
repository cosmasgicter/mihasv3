# Task 11.5 — Apply the product design system and remove operational fluff

Evidence index for task **11.5** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [x] 11.5 Apply the product design system and remove operational fluff
  - Remove first-viewport marketing blocks, PageShell implementation metrics,
    AI language, fake real-time widgets, duplicate cards, "coming soon", and
    feature-description prose.
  - Resolve visible brand/support through trusted tenant context.
  - Replace `window.confirm`, stray dark utilities, sub-44 controls, and overlap.
  - Run Impeccable detect/audit/harden/polish and design audit gate.
  - _Requirements: R2.2-R2.4, R16.2-R16.8_
  - _Findings: STU-10, STU-14, STU-20, STU-24, MAINT-02, TEN-09_
  - _Evidence: design diff, audit reports, visual matrix, accessibility scan_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-10 (UTC).
- **Schema: no.** No SQL script, no migration, no model change, **no backend
  change at all**. This task removes copy and re-spells colour; every number a
  surface still shows was already published by tasks 8.4, 9.1, 9.2, 9.3 and 9.5.
  The OpenAPI contract is unchanged and was not regenerated; §5.4 records the
  `manage.py check` that proves the backend is untouched rather than claiming it.
- PBT: task 11.5 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`), so nothing is recorded through
  `update_pbt_status` and no numbered spec property is claimed. Stated rather
  than silently skipped.
- **This task was dispatched twice.** A first pass landed the copy and de-fluff
  removals, the two new test files, and journeys 1–5's screenshots, and stopped
  before the design-system audit and the evidence. This run completed it: §3
  lists what the second pass added, and §6 is the part that only exists because
  the audit was actually run.
- **Four earlier tasks pointed work here by name, and all four are answered.**
  11.1 §11 (first-viewport marketing blocks elsewhere, `/student/history`'s
  `PageShell` metrics, the remaining `window.confirm` calls, AI language) → §2.1,
  §2.2, §2.4, §2.5. 11.3 §11 (the dashboard row's inherited card-in-card) → §2.6.
  11.4 §11 (inherited card nesting on the roster card, the settlement panel and
  the audit entry; `PageShell` metrics above the admin record lists; non-token
  colour on the roster draft banner and the decision block's status badges) →
  §2.2, §2.6, §2.7.

## The Required_Evidence claim

The `_Evidence:` line is one claim with four parts. Each is produced by a
measurement in [`raw/`](raw/), not by inspection.

| Claim | Where it is settled |
|---|---|
| **design diff** | [`raw/design-diff.txt`](raw/design-diff.txt) — 11 de-fluff classes counted over `src/**` on **both** sides. The "before" is the same tree at the base commit, extracted with `git archive`, so the number is reproducible rather than remembered. **Comments are stripped on both sides**: several files now document the copy they removed, quoting it, and a scan that counted prose would report a de-fluff pass as a regression |
| **audit reports** | [`raw/impeccable-detect.txt`](raw/impeccable-detect.txt) (the deterministic gate, 29 rules over 587 files) + [`raw/impeccable-detect-base.txt`](raw/impeccable-detect-base.txt) (the same gate at the base commit) + [`raw/impeccable-audit.md`](raw/impeccable-audit.md) (the 5-dimension audit per the skill's own format, every score backed by one of these measurements) |
| **visual matrix** | 20 screenshots in [`screenshots/`](screenshots/). The student timeline at **every** width R16.7 names — 320 / 375 / 390 / 768 / 1280 / 1440 — × desktop and mobile projects, plus the flattened dashboard row at 320, the resolved tracker at 390, the admin record list at 390, and the 400 % zoom frame. The matrix is the whole list, not a sample |
| **accessibility scan** | axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) against a real accessibility tree on four surfaces × two widths, asserting **zero critical and zero serious** violations. §6.1 is the regression it caught in this task's own work; §6.2–§6.5 are five latent contrast defects it found in canonical primitives and on the intakes page, two of them invisible text |

### The browser journeys

`tests/harness-e2e/required/design-system-defluff.spec.ts` — 7 journeys ×
desktop + mobile = **14**.

| Journey | The claim it settles |
|---|---|
| **1. the student surfaces across six widths** | `/student/history` opens on the student's own timeline instead of four tiles restating the page's request state; the heading is inside the first viewport at each width, measured from its layout box; nothing scrolls sideways (`scrollWidth - clientWidth <= 1`) and no text clips, at all six of R16.7's widths |
| **2. the dashboard row is one card, not two** | the row inside `My applications` paints **no** border, background or shadow of its own — read from **computed style**, not from a class string — so the section card is the only container; and the row still carries its status, its next action and its commands |
| **3. the tracker resolves brand and support** | the page prints **no** platform or example-tenant address; its support affordance resolves through tenant context to the in-app `/contact` route on the neutral host; the document title carries the brand the platform resolved; one help heading, not two; every target ≥ 44 px measured from its own box |
| **4. an admin record list owns its first viewport** | `/admin/intakes` shows an intake **record** above the fold rather than four passive tiles, and does not overflow at 390 |
| **5. leaving tenant onboarding is a product dialog** | the confirmation is a real dialog with a **browser** focus trap (jsdom moves no focus on `Tab`), an Escape route, a consequence that is not styled as destructive, and both outcomes named |
| **6. an accessibility scan** | axe reports zero critical/serious WCAG A+AA violations on `/track-application`, `/student/history`, `/student/dashboard` and `/admin/intakes`, at 390 px and 1280 px. Moderate/minor findings are logged rather than suppressed |
| **7. 400 % text zoom** | the student timeline and the tracker still read, and still do not scroll sideways, with a 64 px root font on the 1280 × 1024 viewport WCAG 1.4.10 uses to construct its 400 % test — the 320 CSS-px-equivalent width, with every glyph 4× larger (R16.8, §6.7) |

## What this task establishes

1. **A page's first viewport belongs to its work, not to its own request state**
   (§2.2). 17 `metrics` rows existed across 17 files. **14** are gone, and the
   three that survive are the ones whose numbers a *server* defines. The removed
   tiles reported `State: Loading`, `Page 1 of 3`, and `Next action: Continue` —
   the page's fetch state, the pagination control six inches below, and a button
   already in the header, rendered as headline numbers above the content.
2. **Removing a feature and removing its advertising are two commits** (§2.4).
   Task 7.4 deleted admissions generative AI; **16** references to it were still
   in the source — a live call to a deleted endpoint, a `Sparkles` icon, a nav
   label, and prose. The wizard's review step now runs a deterministic readiness
   checklist, and the test that existed only to pin the AI fallback is deleted
   with it.
3. **The visible brand is resolved, never written** (§2.3). Eight student and
   public surfaces take their title, their `og:site_name` and their support
   affordance from `usePortalBrand` / `resolveTenantSupportContact`; a hardcoded
   `mailto:` is gone from the tracker; and `brandedPageTitle` returns the page
   alone rather than a dangling separator when nothing resolved.
4. **`PRODUCT.md` itself was casting a tenant as the platform** (§2.8). The file
   every design skill loads on every command opened with *"**MIHAS** … and
   **KATC** …"* as the identity and `apply.mihas.edu.zm` as the live surface.
   That is TEN-09 at the root of the design context: every subsequent design
   decision inherited it. Beanola owns the Platform; MIHAS and KATC are example
   tenants.
5. **No native dialog owns a workflow** (§2.5). **5** `window.confirm` /
   `alert` call sites → **0**, replaced by focus-trapped product dialogs whose
   tone matches the consequence (leaving onboarding is a `warning`, not a
   destruction — every saved step survives).
6. **56 `dark:` utilities were styling a mode the app disables** (§2.7).
   `index.css` sets `color-scheme: light only !important`. They were unreachable
   CSS, and they were the reason a second raw-palette status map existed at all.
7. **The audit found six contrast defects, and two of them were invisible text**
   (§6). One was this task's own regression, caught by its own scan before it
   shipped. Two were canonical primitives — `StatusPill` and `StatusBadge`,
   between them the status vocabulary of the entire product — rendering a
   tone-coloured label on a wash of its own tone at 4.2–4.5 : 1. Two were
   `text-*-foreground` (**white**) on a 10 % wash over white, at roughly
   **1.1 : 1**: a full intake's seat count and the roster's `submitted` /
   `rejected` badges printed white on near-white. And one was a **deadline printed
   in the colour reserved for failure**, on every intake, at 4.44 : 1 — colour
   alone, on data.
8. **A green suite is not the same as a green claim** (§6.6, §6.7). Journey 7 was
   recorded as *"did not run"* three times before anyone saw that its own
   instrumentation threw, and when it finally ran its premise turned out to be four
   times stricter than the standard it cites. Both are recorded rather than
   silently corrected.

## Files

```
docs/v2-evidence/11.5/
├── README.md                                       ← this index
├── screenshots/
│   ├── student-history-{320x568,375x667,390x844,768x1024,1280x800,1440x900}-{chromium,mobile}-required.png
│   │                                                 (journey 1 — the visual matrix, every R16.7 width)
│   ├── student-history-zoom400-{chromium,mobile}-required.png       (journey 7 — 64 px root at WCAG's 1280×1024)
│   ├── dashboard-row-flat-320-{chromium,mobile}-required.png        (journey 2 — the row with no card of its own)
│   ├── tracker-support-390-{chromium,mobile}-required.png           (journey 3 — resolved brand + support)
│   └── admin-intakes-390-{chromium,mobile}-required.png             (journey 4 — a record, not four tiles)
└── raw/
    ├── design-diff.txt              (11 de-fluff classes, base → now, comments stripped)
    ├── impeccable-detect.txt        (candidate: 2 findings, 0 P0)
    ├── impeccable-detect-base.txt   (base commit: the same 2 findings)
    ├── impeccable-audit.md          (the 5-dimension audit report — 18/20)
    ├── frontend-test.txt            (candidate suite)
    ├── frontend-lint.txt            (16 errors)
    ├── frontend-lint-files.txt      (14 files — identical set to 11.4's and 11.3's)
    ├── frontend-build.txt           (exit 0, incl. tsc and the CSP gate)
    ├── django-check.txt             (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── harness-up.txt               (fresh stack: volumes wiped, rebuilt, reseeded)
    ├── harness-required-suite.txt   (the required profile on that fresh stack)
    ├── harness-gatecheck.txt        (must fail — the gates fire)
    ├── harness-drain.txt            (broker 0, unsettled payment collections 0)
    └── harness-down.txt             (teardown: 0 containers, 0 volumes)
```

Source of the change. The **first pass** is marked ①, the **second** ②.

| Path | What changed |
|---|---|
| `PRODUCT.md` | ② the Identity section. Beanola owns the Platform; MIHAS/KATC are example tenants, with the fail-closed neutral context and the no-legacy-hardcoding rule stated where every design command will read them (§2.8) |
| `apps/admissions/src/lib/tenantBrandCopy.ts` | ① `brandedPageTitle` — the resolved brand appended once, or the page alone when nothing resolved. No literal, no double-branding |
| `apps/admissions/src/components/seo/Seo.tsx` | ① an optional `siteName`, so a tenant surface can pass the resolved brand to `og:site_name` while the platform's own pages keep `DEFAULT_SITE_NAME` |
| `…/pages/student/{History,Interview,Dashboard,Settings,ApplicationStatus,Communications,NotificationSettings}.tsx`, `…/pages/public/tracker/index.tsx` | ① title + `og:site_name` resolved through `usePortalBrand`; metrics rows removed from the three that had them |
| `…/pages/public/tracker/components/HelpSection.tsx` | ① support resolves through `resolveTenantSupportContact`; the hardcoded `mailto:` is gone; the contact block is one container deep |
| `…/pages/public/tracker/components/{ApplicationActions,TrackerSearchSection,ApplicationInfoGrid}.tsx` | ① the second "Need help?" heading removed; `Button asChild` instead of a button inside an anchor; "Instant Results — real-time status updates" replaced by what the tracker actually does |
| `…/pages/admin/{Intakes,Programs,Settings,ProgramFees,AuditTrail}.tsx` | ① metrics rows removed (the surviving server aggregates moved into the body); ② `Intakes`' capacity pill no longer paints white on near-white (§6.4) |
| `…/pages/admin/AuditTrail.tsx` | ① the expanded entry's two `bg-card` cards flattened into sections of the panel (11.4 §11) |
| `…/pages/admin/tenants/SettlementPanel.tsx` | ② the mobile record cards inside the panel's own `SectionCard` became rows of one divided list (11.4 §11) |
| `…/pages/admin/tenants/TenantOnboardingWizard.tsx` | ① the exit `window.confirm` → a focus-trapped `ConfirmDialog`, `warning` tone |
| `…/pages/student/applicationWizard/steps/SubmitStep.tsx` | ① the AI preview-summary call, its state, its `Sparkles` icon and its copy deleted; the deterministic readiness checklist kept |
| `…/components/student/ApplicationListItem.tsx` | ① the dashboard row paints no card of its own — `ApplicationsGrid`'s `SectionCard` is the container and its `divide-y` the separator (11.3 §11) |
| `…/components/admin/applications/ApplicationCard.tsx` | ① the draft banner moved onto `warning` tokens; ② the bordered programme block became a ruled section (11.4 §11) |
| `…/components/admin/applications/ApplicationApprovalActions.tsx` | ② 11 hand-rolled palette badges → the canonical `StatusBadge`; four tone-carrying outline commands and two callouts onto semantic tokens, with the hover wash measured (11.4 §11) |
| `…/components/ui/StatusPill.tsx`, `…/components/ui/StatusBadge.tsx` | ② the tone moved to the fill and the border so the label can be `text-foreground` — the AA correction in §6.2/§6.3 |
| `…/lib/statusColors.ts` | ② the timeline palette onto semantic tokens, `dark:` variants gone, and the contrast the substitution had to preserve recorded in the file (§6.1) |
| `…/lib/applicationStatusUi.ts` | ② two `text-*-foreground` (white) labels on 10 % washes — invisible — corrected (§6.4) |
| `…/components/ui/Alert.tsx` | ① `dark:` variants removed |
| `…/components/admin/applications/FiltersPanel.tsx`, `…/applicationWizard/components/ResidenceLocationFields.tsx`, `…/components/ui/select.tsx` | ② three sub-44 px controls raised to the touch token (§2.9) |
| `…/components/layout/PublicLayout.tsx` | ① the duplicate skip link removed — `PublicSiteHeader` renders the one that belongs to the thing being skipped |
| `…/components/admin/CommunicationModal.tsx`, `…/pages/student/NotificationSettings.tsx` | ① the disabled "Coming soon" SMS channel and the "Always on"/"Coming soon" preference rows removed |
| **deleted**: `…/components/admin/RealtimeMetricsDisplay.tsx`, `…/components/admin/QuickActionsPanel.tsx`, `…/components/admin/applications/AISummaryPanel.tsx` | ① the animated fake-real-time widget, the panel whose export was permanently badged "Coming soon", and the AI summary panel |
| **deleted**: `apps/admissions/tests/unit/submitStepAiFallback.test.tsx` | ① existed only to pin the AI preview-summary fallback the copy removal retires |
| `…/lib/applicationStatusUi.ts`, `…/pages/admin/Intakes.tsx` | ② the six contrast defects §6.2–§6.5: two invisible white-on-wash labels, the capacity and utilization pills, the deadline rendered as an alarm, and the three dialog error messages |
| `apps/admissions/tests/unit/productDesignDeFluff.test.tsx` | ① **new**, 64 cases — the DOM- and source-answerable half. ② extended to **70** with the raw-palette, `StatusBadge`-label, card-nesting and whole-tree 44 px claims, plus §10's six contrast guards |
| `apps/admissions/tests/unit/intakeUtilization.test.ts` | ② the four token pairs repointed; every ratio-to-tone assertion unchanged |
| `apps/admissions/tests/harness-e2e/required/design-system-defluff.spec.ts` | ① **new** — the 7 required journeys, desktop and mobile. ② journey 7's init script fixed (§6.6) and its viewport corrected to WCAG 1.4.10's construction (§6.7) |
| `…/tests/unit/accessibilityInteractionGuard.test.ts`, `…/tests/unit/page-verification/public-tracker.test.tsx` | ② one pin each, repointed at the surface this task changed (§7) |

---

## 1. What was wrong

R16.5, verbatim: *"THE product SHALL NOT ship promotional copy, AI framing,
redundant metrics, duplicate quick actions, or feature narration on operational
surfaces."* R16.4 requires approved tokens, one page shell, no nested cards and
no fake real-time animation. R2.2 makes Beanola the platform identity and a
school *resolved tenant data*.

Every one of those was violated, and the violations were not decorative
accidents — they were the product describing itself instead of doing its work:

- A student opening `/student/history` met four tiles. One said `State: Loading`.
- An operator opening `/admin/intakes` met four tiles before the first intake.
- The wizard's review step called `POST …/preview-summary`, an endpoint task 7.4
  had deleted, and advertised the result under a `Sparkles` icon.
- An admin dashboard rendered an animated widget claiming to measure who was
  online.
- A student who asked the tracker for help got an address hardcoded into the
  component.
- Leaving the tenant onboarding wizard asked for confirmation through
  `window.confirm`.
- 56 `dark:` utilities styled a mode `index.css` disables outright.

## 2. What changed, and what settles each claim

### 2.1 First-viewport marketing blocks

11.1 §11 recorded that it had removed the dashboard's decorative metrics and
deferred *"first-viewport marketing blocks elsewhere"*. Those were the tracker's
three "help cards" above the search field (one of them "Instant Results —
real-time status updates"), the tracker result strip's second help heading, and
the notification-settings preface. All are gone. Journey 1 measures the
replacement claim geometrically: the page's own heading is inside the first
viewport at 320, 375, 390, 768, 1280 and 1440.

### 2.2 `PageShell` implementation metrics

**17 rows → 3**, over 17 files → 3 ([`design-diff.txt`](raw/design-diff.txt)).

The three that survive are the ones a server defines: the applications roster's
(9.1), the admin dashboard's (9.2) and the user directory's (9.3). The 14 removed
were the page's own request state (`State: Loading` / `Needs attention` / `Ready`
/ `Healthy` / `Quiet`), its own pagination control (`Page 1 of 3`), or a control
already in its header (`Next action: Continue`) — printed as headline numbers
above the content, beside the `ErrorDisplay` and the skeleton that already said
it. Two pages (`ProgramFees`, `AuditTrail`) had **real** aggregates in that row;
those moved into the body rather than being deleted, and the test asserts both
still render.

Guarded by 3 jsdom cases: no `metrics={` on the eight pages, no surviving tile
labelled `State` / `Page` / `Next action` anywhere, **and** the three server
aggregate rows still present — because "remove the narration" must not become
"remove the operator's numbers".

### 2.3 Brand and support resolve through trusted tenant context

R2.2 / R2.3, findings STU-24 and TEN-09.

- `brandedPageTitle(page, brand)` appends the brand `usePortalBrand` resolved,
  returns the page **alone** for `undefined` / `null` / `''` / `'   '` rather
  than a dangling ` | `, and does not brand a title twice.
- Eight surfaces pass `siteName={brandName}` to `Seo`, so `og:site_name` is the
  resolved brand and not the platform default. `Seo` keeps `DEFAULT_SITE_NAME`
  optional for the surfaces Beanola really owns — admin, and the platform's own
  public pages.
- A jsdom case reads every `<Seo …>` element in those eight files and asserts
  **no** `Beanola` / `MIHAS` / `KATC` literal inside it. The literal is still
  permitted elsewhere in a file (a fallback institution label, for instance);
  what is forbidden is writing a brand into the copy the browser shows.
- The tracker's help panel calls `resolveTenantSupportContact` (task 8.3) and
  prints no address of its own. Both outcomes are tested: a resolved tenant gets
  that school's inbox, the neutral host gets the in-app `/contact` route — never
  a platform address, never MIHAS or KATC.
- Journey 3 makes the same claim in the browser, on the neutral harness host: the
  rendered page contains no `@beanola.com` / `@mihas.edu.zm` / `@katc.edu.zm`,
  its support control resolves to `/contact`, and its title carries the brand the
  platform resolved.

### 2.4 AI language over a capability that no longer exists

The dispatch's caution was the right one: **verify you are deleting prose, not a
live dependency.** Checked first — task 7.4 removed admissions generative AI, and
what was left was worse than prose. `SubmitStep` still **called**
`applications/{id}/preview-summary/`, an endpoint that no longer exists, through a
raw `apiClient` import that also cost a lint error. So this was a dead call plus
its advertising.

**16 references → 4**, over 6 files → 2. The four that remain are in
`jobs-ops`-adjacent copy and comments recording the removal; no admissions source
calls a retired generative endpoint, and `Breadcrumbs` names no AI page. The
review step keeps its **deterministic** `readinessChecks`, which is what a
student needed there: what is missing, not a paragraph about their application.

`tests/unit/submitStepAiFallback.test.tsx` is deleted with it — it existed only to
pin the fallback behaviour of the summary that no longer renders. That is the −10
in §5.1's arithmetic.

### 2.5 `window.confirm`

**5 call sites → 0**, over 4 files → 0. The tenant onboarding exit is now
`useConfirmDialog` + `<ConfirmDialog>` with `variant: 'warning'` — deliberately
not `destructive`, because leaving does not destroy anything: every saved step
survives. Journey 5 proves the three things jsdom cannot: the dialog contains
focus under real `Tab`, Escape leaves it, and both outcomes are named.

### 2.6 Duplicate cards

The rule, from `PRODUCT.md`: *"Cardocalypse. No cards nested inside cards inside
cards. One container deep."* The line this task draws, and states, is that the
nesting which matters is **a card surface inside a card surface** — border, fill
and shadow drawn again inside something that already has all three. A labelled
`bg-muted` section inside a card is a section, which is the same line task 11.4
§9 drew for its own disclosure panel.

Four surfaces, all inherited and all named by an earlier task:

| Surface | Was | Is |
|---|---|---|
| the student dashboard's application row (11.3 §11) | its own border + `bg-card` + shadow inside `ApplicationsGrid`'s `SectionCard` | flat; the section's `divide-y` is the separator. Asserted from **computed style** in journey 2, not from a class string |
| the audit entry's expanded panel (11.4 §11) | two `border … bg-card p-4` cards inside an entry that is itself a `bg-card` card | two sections of the panel |
| the settlement panel's mobile records (11.4 §11) | `rounded-lg border border-border/60 bg-muted/20 p-3` cards inside the panel's `SectionCard` | rows of one `divide-y` list |
| the roster card's programme block (11.4 §11) | `rounded-lg border border-border bg-muted/40 p-3` inside a bordered, filled, shadowed card | a ruled section between the contact details above and the payment grid below |

The tracker's contact block went the same way (a `bg-card` card holding two
`bg-muted/50` cards, inside a `SectionCard`).

### 2.7 Stray dark utilities, and the tokens

- **`dark:` utilities: 56 → 0**, over 7 files → 0. `index.css` sets
  `html { color-scheme: light only !important }`, so every one was styling a mode
  the app does not have. They were also the reason a second raw-palette status
  map existed.
- **Raw palette utilities: 477 → 298**, over 41 files → 30. The two surfaces
  11.4 §11 named are **token-only**: the roster card's draft banner
  (`bg-yellow-50` / `text-yellow-800` → `warning`) and the decision block's
  status badges, all 11 of which are now the canonical `StatusBadge`. §8 records
  the 298 that remain, where they are, and why they are not this bullet.
- The decision block's four tone-carrying outline commands moved onto
  `border-<tone>/50 text-<tone> hover:bg-<tone>/5`, and the wash is `/5` for a
  measured reason (§6).

### 2.8 The design context was itself asserting the drift

`PRODUCT.md` is read by every Impeccable command and by `ui-ux-pro-max`
(`load-context.mjs`). Its Identity section read:

> **MIHAS** — Mukuba Institute of Health and Applied Sciences and **KATC** —
> Kalulushi Training Centre. … Student admissions + admin review |
> `apps/admissions/` | apply.mihas.edu.zm

That is TEN-09 at the root: the file that tells every future design decision who
this product belongs to named a tenant as the platform and a tenant's hostname as
the live surface. Corrected to Beanola-owns-the-Platform, with MIHAS and KATC
named as example `Institution` records, the fail-closed neutral context stated,
and the no-legacy-hardcoding rule quoted where a design command will read it.

Not a code change, and the most load-bearing line in this task.

### 2.9 Sub-44 px controls and overlap

**8 declarations → 1**, over 5 files → 1.

Raised to the touch token: the roster filter panel's `Clear all` (36 px), the
wizard's residence suggestion chips (36 px), and the select popover's two scroll
affordances (32 px).

The one that remains is **named, not overlooked**: `min-h-[24px]` on
`AutoSaveIndicator` inside the wizard's action bar. It reserves a text row so the
bar does not shift when the save state changes; the element it sizes is a
`role="status"` `aria-live="polite"` region, and the indicator's only interactive
child — its retry control — sizes itself at the token. Both facts are asserted.
The 44 px claim is a **whole-tree scan** of `src/**` with that one exemption,
rather than a file list that would only prove it for the files someone remembered.

Overlap and clipping are journey 1's business: `scrollWidth - clientWidth <= 1`
on every scanned surface at every one of R16.7's six widths, with the widest
offending element named when it fails.

## 3. What the second pass added

Stated plainly, because the first pass's work is the bulk of §2 and this section
is the rest:

1. The decision block's 11 status badges and four outline commands onto tokens
   (11.4 §11's last named deferral).
2. The roster card's programme block and the settlement panel's mobile records
   flattened (11.4 §11's remaining nesting).
3. The timeline status palette off raw palette steps.
4. Three sub-44 px controls raised, and the 44 px claim turned into a whole-tree
   scan with one named exemption.
5. `PRODUCT.md`'s identity drift corrected (§2.8).
6. **The design-system audit actually run** — which is where §6's six contrast
   defects come from, including one regression in the second pass's own work that
   its own scan caught, and two pieces of broken test instrumentation that three
   "did not run" results had been hiding.
7. The two test pins the first pass broke, repointed (§7).
8. Every gate re-measured, across six harness runs (§6.8), and this evidence
   written.

## 4. Impeccable: detect, audit, harden, polish

Context loaded first — `load-context.mjs` reports `hasProduct: true`,
`hasDesign: true`, so the output is anchored to this product's register and not to
a generic one.

### 4.1 `detect` — the deterministic gate

```
impeccable detect apps/admissions/src/     # 587 files, 29 rules
```

**2 anti-patterns, 0 P0** — [`impeccable-detect.txt`](raw/impeccable-detect.txt).

Both are `overused-font` on `font-family: Inter` (`index.css` lines 16 and 52).
Running the identical scan against the identical directory **at the base commit**
returns **the same 2** ([`impeccable-detect-base.txt`](raw/impeccable-detect-base.txt)),
which is the honest reading: this gate was already clean of P0 before Phase 11,
so it certifies that nothing here introduced a finding — it is not where this
task's improvement shows. The improvement is in
[`design-diff.txt`](raw/design-diff.txt), which measures the classes the task's
bullet actually names.

The Inter finding is a **documented, deliberate divergence**, not an oversight:
`.kiro/steering/tech.md` and `DESIGN.md` §2 both require the full Inter fallback
chain, a drift-guard test asserts it, Inter is loaded `local()`-first with no CDN,
and the register split answers the rule's real concern — institutional documents
and the brand surface use Playfair Display + Source Sans 3.

### 4.2 `audit` — the 5-dimension report

[`impeccable-audit.md`](raw/impeccable-audit.md), written to the format in
`.kiro/skills/impeccable/reference/audit.md`. **18/20 — Excellent (minor
polish)**: accessibility 4, performance 3, responsive 4, theming 3,
anti-patterns 4. **P0: 0. P1: 0. P2: 3. P3: 2.** Every score cites a measurement
in this directory; none is scored from an impression. The three P2s are residuals
with a named owner (§8), not defects this task introduced.

### 4.3 `harden` — where it was applied

Per `reference/harden.md`, hardening is the pass that makes a surface survive
real input and real assistive technology rather than the happy path:

- **Every geometry claim measured, not asserted from a class name.** Overflow
  from `scrollWidth - clientWidth`; flatness from `getComputedStyle`; target size
  from each control's own layout box; focus containment from real `Tab`.
- **Six widths, not one.** R16.7 names six; the matrix is all six, ×2 projects.
- **400 % text zoom** as its own journey, at the narrowest viewport.
- **The absence claims strip comments before scanning**, so a file can record the
  copy it removed without satisfying its own test — and cannot pass by accident.
- **The 44 px claim is a whole-tree scan**, with its single exemption named and
  justified by two further assertions.
- **`StatusBadge` makes the rule unbreakable rather than repeated**: `label` and
  `tone` are both required and the tone resolves a default icon, so replacing 11
  hand-rolled `<span>` badges with it removed 11 chances to violate "never colour
  alone".

### 4.4 `polish` — and the one thing polish is not for

Per `reference/polish.md`, applied: consistent spacing rhythm on the flattened
rows (`py-3 first:pt-0 last:pb-0` rather than per-card padding), the chevron's
`motion-reduce:transition-none` preserved, no new font size outside the 12–32 px
scale, no new shadow tier, no animation over 400 ms.

What polish did **not** do is paper over §6. A contrast failure is a defect, not a
finish: the four in §6 were fixed at the token level and the ratios written into
the source beside them, so the next person to reach for `text-warning` on
`bg-warning/10` finds the measurement instead of repeating it.

## 5. Verification (verbatim)

### 5.1 Frontend suites, against a measured baseline

```
cd apps/admissions && bun run test -- --run
```

| Run | Result |
|---|---|
| baseline (task 11.4's recorded candidate, at this base commit) | 1 failed, 4478 passed, 1 skipped (491 files) |
| **candidate** | **1 failed, 4538 passed, 1 skipped (491 files)** — [`frontend-test.txt`](raw/frontend-test.txt) |

- **New failures: 0.** The one failure is the same one 11.1, 11.2, 11.3 and 11.4
  each recorded: `authPageFormMarkup.test.tsx > uses honest helper copy instead of
  fake email availability states` — the **sign-up page's** helper copy, which this
  task does not touch. Not fixed here; this task claims no repair of another
  lane's failure.
- **The arithmetic closes exactly.** 4478 − **10** + **70** = 4538, and the file
  count stays at 491 because one file left and one arrived. The −10 is
  `submitStepAiFallback.test.tsx`, deleted with the AI copy it existed to pin
  (§2.4); the +70 is `productDesignDeFluff.test.tsx` — 64 cases from the first
  pass and §10's six contrast guards from the second (§6.8). Both are confirmed by
  diffing the two runs' own file lists, not asserted.
- Two failures **this task caused** are recorded in §7 rather than folded into
  the diff, and both are repointed pins, not behaviour.
- Checked explicitly because this task changed a component four other suites read:
  `approvalFlowPreservation`, `approvalFlowBugCondition`,
  `admissionsFlowPreservation`, `admissionsFlowBugCondition`,
  `adminMobileCompleteness` and `adminRouteActionParity` all pass unchanged.

### 5.2 Lint

```
cd apps/admissions && bun run lint    # 16 errors, 14 files
```

**16, down from 11.4's 17**, and the file set is **identical** to 11.4's and
11.3's (`diff` of the two sorted, path-normalised lists is empty) —
[`frontend-lint.txt`](raw/frontend-lint.txt),
[`frontend-lint-files.txt`](raw/frontend-lint-files.txt).

The one that disappeared is **this task's**: `SubmitStep.tsx` no longer imports
`@/services/client`, because §2.4 deleted the call to the retired generative
endpoint that needed it. That is the architecture rule (R14.3) being satisfied by
removing a violation rather than by an `eslint-disable`. None of the 14 remaining
files is one this task created; the new module changes, the two new test files and
the browser spec contribute **zero** findings.

### 5.3 Build and type-check

```
cd apps/admissions && bun run build   # exit 0
```

Including `tsc -p tsconfig.build.json --noEmit` and the CSP gate —
[`frontend-build.txt`](raw/frontend-build.txt).

One honest correction to an earlier claim. 11.4 §4.3 reported that the **full**
`tsconfig.json` (which includes `tests/`) had zero errors. Measured here it
reports **604**, and **zero of them are in `src/`** — they are pre-existing
strictness errors in test files (`toast.test.ts`, `useMultiDraft.test.tsx`,
`wizardDraftResume.test.ts`, `vite.config.ts`'s `critters` typings, and
`ApplicationCard.test.tsx`'s stale `payment_verified_at` against task 9.1's
contract), none of them this task's and none of them in the shipped gate. Recorded
rather than repeated, because the number in 11.4's README will not reproduce.

### 5.4 Django check

```
cd backend && env -u TESTING -u REDIS_URL .venv/bin/python3 manage.py check
# System check identified no issues (1 silenced).
```

No `TESTING=1`, no substitute `REDIS_URL` —
[`django-check.txt`](raw/django-check.txt). Run for the same reason 11.2, 11.3 and
11.4 ran it: this task consumes the aggregates, brand context and support contact
five backend contracts publish and changes none of them.

### 5.5 The browser gate

Isolated local harness (task 0.4), strict gates active,
`HARNESS_PW_CHANNEL=chrome`, SPA rebuilt **after** every source change, measured
on a **freshly seeded** stack (torn down, volumes wiped, brought up again), and
**torn down afterwards** (verified: 0 harness containers, 0 harness volumes —
[`harness-down.txt`](raw/harness-down.txt)).

| Run | Result |
|---|---|
| this task's journeys | **14 passed** — 7 journeys × desktop + mobile, zero skips |
| the whole required profile, **fresh stack** | **218 passed**, 2 failed, **0 did not run** ([`harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | `{"broker_queue_depth": 0, "unsettled_payment_collections": 0, "unsettled_references": []}` ([`harness-drain.txt`](raw/harness-drain.txt)) |
| teardown | 0 harness containers, 0 harness volumes ([`harness-down.txt`](raw/harness-down.txt)) |

Against 11.4's 204 passed / 2 failed / 0 did not run: **+14 passing**, and it
closes exactly — 14 = this task's 7 journeys × two projects. Nothing else moved.
`admin-dashboard-metrics.spec.ts:356`, which 11.3 catalogued as a flake and which
failed on runs 4 and 5 (once on one project, once on both), passed here — the same
conditional behaviour 11.3 recorded, on the same fresh-stack condition.

### 5.6 The two remaining failures, attributed

| Failure | Reading |
|---|---|
| `tenant-launch.spec.ts:139` × **both** projects | **stable pre-existing.** The same pair tasks 10.5, 10.6, 11.1, 11.2 (both passes), 11.3 and 11.4 each recorded at this base commit. Its assertion is `getByText('Fees')` against a `Program Fees` step label the onboarding wizard renders `hidden` on mobile — the tenant lane's, not this one's |

Nothing else failed, and none of the flakes 11.3 catalogued
(`ocr-manual-fallback:146`, `student-wizard-mobile:279`,
`admin-dashboard-metrics:356`, `admin-applications-roster:325`) appeared on the
fresh stack.

## 6. Six contrast defects the audit found — one of them this task's own

This is the section that only exists because the scan was actually run, and the
first entry is the reason a design task should not be graded on its own diff.

### 6.1 The regression this task caused, caught before it shipped

Tokenizing the history timeline's palette looked like a pure improvement:
`bg-blue-100 text-blue-700` → `bg-info/15 text-info`. The first full harness run
failed:

```
/student/history @ 390: expected zero critical/serious WCAG A/AA violations
+   "[serious] color-contrast @ .bg-info\/15",
```

`--color-info` #2563eb on a 15 % wash of itself over white is **4.18 : 1**. The
raw palette it replaced was **5.54 : 1**. So the thing wrong with the old map was
its **vocabulary**, never its contrast, and a substitution that only fixes the
vocabulary is a regression. The tone now lives in the fill and the label is
`text-foreground` (≈ 16 : 1); the ratios are written into `statusColors.ts` beside
the map so the next substitution starts from the measurement.

### 6.2 `StatusPill` — the product's application-status vocabulary

Measured while chasing §6.1, because it is the same pattern:

| Pair | Ratio | AA |
|---|---|---|
| `text-warning` #b45309 on `bg-warning/10` | **4.37 : 1** | ✗ |
| `text-destructive` #dc2626 on `bg-destructive/10` | **4.20 : 1** | ✗ |
| `text-info` #2563eb on `bg-info/10` | **4.48 : 1** | ✗ |
| `text-success` #047857 on `bg-success/10` | 4.83 : 1 | ✓ |

This is the pill that states an application's status on the student dashboard and
on every admin roster — `under_review`, `waitlisted`, `rejected`, `expired`,
`enrollment_expired` and `submitted` all landed on a failing pair. Corrected the
same way: tone in the fill and the border (`/40`, up from `/25`, so the tone still
reads), label in `text-foreground`. Nothing is lost — a fill is a large flat area,
not text, so it is not held to 4.5 : 1, and the icon this component always renders
still carries the colour's meaning.

### 6.3 `StatusBadge` — the same defect, and this task had just added 11 more

Identical measurement, identical correction. Worth stating plainly: §2.7 replaced
11 hand-rolled palette badges in the decision block with this primitive, so the
de-fluff pass had **increased** the number of instances of a failing pair while
removing the raw palette. Fixing the vocabulary and fixing the contrast are two
different jobs, and only one of them is visible in a class-name diff.

The decision block's outline commands were measured too: a tone label on a `/10`
hover wash of its own tone is 4.37 : 1 (`warning`) and 4.48 : 1 (`info`). The
wash is `/5` — 4.67 : 1 and 4.78 : 1 — and the resting state on card white is
4.99 : 1 / 4.52 : 1. A hover state is still text on a background.

### 6.4 Two labels that were simply invisible

`text-destructive-foreground` and `text-primary-foreground` are both **white**,
and both were being painted on a 10 % wash over white — roughly **1.1 : 1**:

- `/admin/intakes`, the seat-count pill: a **full** intake printed `0/40` in white
  on near-white. The branch only renders at capacity, which is why nobody had
  seen it.
- the admin roster's status badge (`applicationStatusUi.ts`): `submitted` and
  `rejected` printed their own labels the same way.

Both corrected. The remaining 58 raw palette steps in `applicationStatusUi.ts` are
§10's business, not this task's, but leaving invisible text discovered by this
task's own audit would not have been honest.

### 6.5 A deadline printed as an alarm

The last violation the scan surfaced, at 1280 rather than 390 — the desktop table
rather than the record cards, which is why two earlier runs did not reach it:

```
/admin/intakes @ 1280: expected zero critical/serious WCAG A/AA violations
+   "[serious] color-contrast @ … > td:nth-child(5) > .text-destructive.font-medium
```

`/admin/intakes` printed **every** intake's application deadline in
`text-destructive`, on `PageShell`'s `bg-muted` surface, where #dc2626 measures
**4.44 : 1**. Two defects in one line: the contrast, and the fact that a deadline
with months to run was rendered in the colour the product reserves for a problem —
**colour alone**, saying "alarm" unconditionally, on data. A deadline is data. It
is `text-foreground` now (≈ 19 : 1), the column header already says `Deadline`, and
the utilization badge beside it is where a tone belongs.

The page's error message went the same way: `text-destructive font-medium text-lg`
on the same muted surface is 4.44 : 1, and it already has a red `AlertTriangle`
above it — a non-text graphic held to 3 : 1, which the tone clears. The tone is
the icon; the message is `text-foreground`.

### 6.6 A bug in this task's own instrumentation

Journey 7 (400 % text zoom) had never actually run: runs 1–3 recorded it as *"did
not run"*, because the `describe` is serial and the axe journey ahead of it failed.
The moment §6.5 unblocked it, it failed for a reason of its own:

```
Harness gate failed (2 violation(s)):
  - pageerror: TypeError: Cannot read properties of null (reading 'style')
```

`page.addInitScript` runs **before the document exists**, so
`document.documentElement` is `null` at that moment and
`document.documentElement.style.fontSize = '64px'` threw — once per navigation.
The harness gate caught it as a page error, which is exactly its job: an
uncaught exception in the page fails a run whether the product or the test threw
it. The size still has to be in place before first paint, so the script now
guards the access and re-applies on `DOMContentLoaded`.

Worth recording rather than quietly fixing: a green suite that skips a journey is
not the same as a journey that passes, and "did not run" three times in a row is
how a broken test hides.

### 6.7 An assertion that was four times stricter than the standard

With §6.6 fixed, journey 7 ran for the first time and failed on `/student/history`.
The offender it named was the authenticated header's action cluster, at **848 px**
on a 320 px viewport.

That is arithmetic about the premise, not a defect. The journey applied a 4× root
font to a viewport that was **already** 320 px, which asks the product to lay out
in an **80 CSS-px-equivalent** space. Three `h-10 w-10` header controls at a 64 px
root are 160 px each; they cannot fit in 320, and nothing would.

WCAG 2.1 SC 1.4.10 (Reflow) constructs the 400 % test as a **1280 × 1024** window
zoomed to 400 % — *because* that yields the 320 CSS-px-equivalent viewport R16.7
already names. So the assertion now uses the standard's own construction, and it is
**harder** than journey 1's, not softer: the same effective width, with every glyph
four times larger. Journey 1 owns reflow at all six literal widths; journey 7 owns
text scale. The reasoning is written into the spec above the test, so the next
person does not have to re-derive it from a failure.

Stated plainly because it is the kind of change that can be mistaken for moving a
goalpost: the claim got **stronger** on type size and **correct** on width.

### 6.8 What kept this honest

The findings cost **six** harness runs, and that is the point worth recording.
Run 1 failed at `/student/history` @ 390 (§6.1) and aborted before reaching
anything else. Run 2 got past it and failed at `/admin/intakes` @ 390 (the capacity
pills). Run 3 got past those and failed at `/admin/intakes` @ **1280** — the desktop
table, a different layout of the same page (§6.5). Run 4 cleared the axe scan and
exposed §6.6, a bug in this task's own instrumentation that three "did not run"
results had been hiding. Run 5 exposed §6.7. Run 6 is the one in §5.5.

Each run revealed exactly one surface, because the assertion aborts on the first
failing one and every failure was in a different place than the last. A class-name
diff would have shown a clean, consistent token migration after run 1.

Two of the defects (§6.4, §6.5) are also guarded in jsdom now, by a scan that
encodes the measurement rather than the class name
(`productDesignDeFluff.test.tsx` §10): no tone label on a wash of its own tone, no
`*-foreground` white on a translucent wash, and both canonical primitives keeping
the tone in the fill **and** the border. A regression is one class away, and only a
full 22-minute browser run would otherwise catch it.

Two of the defects (§6.4, §6.5) are also guarded in jsdom now, by a scan that
encodes the measurement rather than the class name
(`productDesignDeFluff.test.tsx` §10): no tone label on a wash of its own tone, no
`*-foreground` white on a translucent wash, and both canonical primitives keeping
the tone in the fill **and** the border. A regression is one class away, and only a
full 20-minute browser run would otherwise catch it.



## 7. Two pins repointed, stated rather than folded into a diff

Both are the same category as 11.4 §8 and 11.2 §7.7 — a source-location or copy
pin following a surface it names. Every behavioural claim in both files is
unchanged.

1. **`accessibilityInteractionGuard.test.ts:17`** asserted that *both*
   `PublicLayout` and `AppLayout` contain `SkipLink`. This task removed the
   duplicate: `PublicSiteHeader` already rendered one, so every public page
   shipped two identical "Skip to main content" links pointing at the same target
   and a keyboard user tabbed past the same affordance twice. The assertion now
   states the real claim — each layout owns a focusable `<main>` at the canonical
   id, and the skip link is rendered **once**, by the thing being skipped.
2. **`page-verification/public-tracker.test.tsx:200`** asserted the tracker
   renders `Instant Results`. It does not, deliberately: the tracker reads the
   recorded status of a submitted application on request, with no push, no stream
   and no poll behind it, so "real-time status updates" was a claim about a
   capability that does not exist (STU-14 / R16.5). The assertion now pins the
   honest replacement and additionally forbids `/instant/i` and `/real[- ]time/i`
   anywhere in the page's text.

## 8. Design (PRODUCT.md / DESIGN.md)

- **No new token, colour, font, size, shadow tier or motion.** Existing tokens
  only: `success` / `warning` / `info` / `destructive` and their alpha washes,
  `bg-muted` for sections, `border-border/45` for rules, `text-foreground` for
  labels, `min-h-touch` / `min-w-touch` for targets.
- **WCAG AA on every pair this task touched, measured** — §6, with the ratios in
  the source beside the classes.
- **Never colour alone**, and now unbreakable: `StatusBadge` requires `label` and
  `tone` and resolves a default icon from the tone, so a caller cannot ship colour
  by itself. The timeline pills carry the status word; the transition arrow
  carries the direction.
- **One container deep** — §2.6, four inherited nestings flattened, the dashboard
  row's asserted from computed style.
- **No purple gradient, no gradient text, no glassmorphism, no emoji.** Checked
  by the deterministic scan and by hand: the 10 surviving `bg-gradient-to` /
  `backdrop-blur` matches are a `from-primary` skeleton shimmer, a `from-white/10`
  header sheen, a `to-primary/5` section wash and modal/overlay scrims — the one
  use `PRODUCT.md` permits.
- **Reduced motion respected.** The global rule in `index.css` is untouched and
  every transition this task left in place carries its `motion-reduce` pair.
- **Register kept.** Product mode on operational surfaces; the brand register is
  untouched on the landing page and the PDFs.
- **`PRODUCT.md` corrected at the identity line** — §2.8.

## 9. Hard constraints

- **Auto-save untouched.** The one wizard file in this change is
  `ResidenceLocationFields.tsx`, and the only edit is a control's minimum height.
  No `useAutoSave` consumer, no draft code, no `SaveStatusIndicator` behaviour.
- **Mobile-first usability preserved and extended.** Six widths measured, not
  one; 400 % zoom its own journey; every target measured from its own box.
- **Backend permissions remain the only boundary.** Nothing here decides whether
  a command is authorized. The decision block's `canVerifyPayment` still comes
  from the server's published command matrix, and every command still goes through
  the endpoint that re-enforces it.
- **Tenant isolation unchanged, and strengthened in copy.** The brand and support
  a surface shows come from resolved context; the neutral Beanola context is the
  only fallback; no MIHAS/KATC literal reaches a student or operator surface.
- **No PII.** This task handles status strings, labels and class names.
- **Backward compatibility.** No schema, no contract, no route, no capability. The
  catalogue stays at 17 `platform.*` + 17 `tenant.*`. Nothing to rehearse on Neon,
  nothing to regenerate.
- **Truthful copy.** The three removals that matter most are all the same rule:
  the tracker no longer claims to be instant, the dashboard no longer claims to
  measure who is online, and the wizard no longer advertises a summary the
  platform cannot produce.

## 10. Not claimed here, and what remains

- **298 raw palette utilities remain across 30 files.** The distribution is in
  [`design-diff.txt`](raw/design-diff.txt): `src/lib/applicationStatusUi.ts` (60,
  minus the two §6.4 fixed), `ApplicationDetailDocuments.tsx` (33),
  `ApplicationDetailPayment.tsx` (28), `AuthErrorBoundary.tsx` (24), then a long
  tail. This task's bullet is *stray dark utilities* (**0** left) and 11.4 §11's
  two named surfaces (**both done**); the rest is a `/impeccable colorize` sweep
  and the audit report recommends it as P2.
- **~60 sites still pair a tone label with a `/10` wash of its own tone**, the
  4.2–4.5 : 1 pattern §6.2 measured. The two canonical primitives are fixed, which
  covers most status rendering, and the four surfaces this task's scan visits are
  clean. The rest is the same colorize sweep, and it is a **real AA residual**, not
  a stylistic one — recorded as such rather than rounded off.
- **60 MIHAS/KATC literals remain in `src/`, and the number did not move.** All
  60 are in the legacy PDF/dev-preview renderers:
  `lib/pdf/documents/acceptanceLetterProfiles.ts` (28),
  `pages/dev/DocumentPreview.tsx` (18), `lib/pdf/theme/index.ts` (8),
  `pages/dev/AcceptanceLetterPreview.tsx` (6). Both routes are wrapped in
  `import.meta.env.DEV ? … : null` in `App.tsx`, so **no student or operator can
  reach them in a production build** and neither chunk is ever fetched; `tech.md`
  records `@/lib/pdf` as legacy/dev-preview only, with official documents rendered
  by the backend from tenant configuration. The strings are still **emitted** into
  `dist/assets/js/`. Task **12.4** owns deleting the renderers that describe
  retired behaviour.
- **The platform-wide audit export still exports the loaded page.** 11.4 §11
  recorded it; this task edited that file and did not fix it, so it is restated
  rather than quietly dropped. R6.5 is still unsatisfied at `/admin/audit`.
- **The roster's table view still paginates and searches in the browser** —
  11.4 §11's finding, unchanged.
- **`ApplicationApprovalActions` is not decomposed.** 736 lines. This task
  re-spelled its colours and changed no branch, label or handler, deliberately,
  because two other lanes' preservation tests read its source. Task **12.1** owns
  the split.
- **`bun run validate:tailwind` is a broken npm script** — it points at
  `apps/admissions/scripts/validate-tailwind-classes.sh`, which has never existed
  in this repository (`git log` on the path is empty) and exits 127. Pre-existing
  and unrelated to design; recorded so the next lane does not read it as a gate
  that regressed.
- **`tenant-launch.spec.ts:139` is not fixed** (§5.6), and neither is the sign-up
  helper-copy test nor any of the 16 lint errors. Each is measured against a real
  run and attributed elsewhere.
- **The `overused-font` finding is not fixed** (§4.1) — it is a project-wide
  decision guarded by steering, `DESIGN.md` and a drift-guard test, not a
  task-11.5 edit.
- **No new capability, route, endpoint, schema or contract.**
