# Impeccable audit — `apps/admissions/src/` (admissions-v2 task 11.5)

Run per `.kiro/skills/impeccable/reference/audit.md`, with `PRODUCT.md` and
`DESIGN.md` loaded first (`node .kiro/skills/impeccable/scripts/load-context.mjs`
→ `hasProduct: true`, `hasDesign: true`). This is the **code-level** audit, not a
critique: every score below is backed by a measurement in this directory, and
nothing here is scored from an impression.

Measurements this report reads:

| Source | What it measured |
|---|---|
| [`impeccable-detect.txt`](impeccable-detect.txt) | the 29 deterministic anti-pattern rules over 587 files |
| [`impeccable-detect-base.txt`](impeccable-detect-base.txt) | the same rules over the same directory at the base commit |
| [`design-diff.txt`](design-diff.txt) | 11 de-fluff classes counted on both sides, comments stripped |
| [`harness-required-suite.txt`](harness-required-suite.txt) | axe WCAG 2.0/2.1 A+AA, six-width overflow, computed-style flatness, focus containment, 400 % zoom — in a real browser |
| [`frontend-test.txt`](frontend-test.txt) | 64 jsdom/source cases for the absence claims |
| `DESIGN.md` §1 + `design-tokens.css` | the documented contrast ratio of every token this task introduced to a surface |

## Anti-Patterns Verdict

**Pass.** Does this look AI-generated? No, and the deterministic scan agrees:
**2 findings over 587 files**, both the same rule (`overused-font`) on the same
declaration (`font-family: Inter` in `index.css`, lines 16 and 52).

That finding is a **documented, deliberate divergence**, not an oversight.
`.kiro/steering/tech.md` and `DESIGN.md` §2 both require the full Inter fallback
chain (*"Don't reduce the Inter font fallback chain below the Tailwind default +
Inter"*), a drift-guard test asserts it, and Inter is loaded `local()`-first with
no external CDN. The register split is the answer to the rule's real concern:
institutional documents and the brand surface use **Playfair Display + Source
Sans 3**, not Inter. Changing it is a project-wide decision, not a task-11.5 edit.

Checked explicitly and **absent**: purple/AI gradients (the 10 surviving
`bg-gradient-to` / `backdrop-blur` matches are a `from-primary` skeleton shimmer,
a `from-white/10` header sheen, a `to-primary/5` section wash, and modal/overlay
scrims — the one use `PRODUCT.md` permits); gradient-text headings (zero
`text-transparent` on a heading); glassmorphism on a product surface; emoji as
structural icons; 3-layer shadow stacks; hero metrics; nested cards on the four
surfaces Phase 11 named; decorative animation without a `motion-reduce` pair.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | **4** | axe reports **zero critical and zero serious** violations on every surface this task changed, at 390 px and 1280 px, in a real browser — after it caught **six** contrast defects, two of them invisible white-on-white text and one a deadline printed in the failure colour on every row (evidence §6). One skip link per page instead of two. Every status statement carries an icon **and** a label by construction |
| 2 | Performance | **3** | build clean at exit 0 with the CSP gate passing; `react-pdf` still ships a 1.43 MB vendor chunk, and the legacy PDF/dev-preview chunks are still emitted although their routes are `import.meta.env.DEV`-gated. Task **12.4** owns both |
| 3 | Responsive design | **4** | six widths (320/375/390/768/1280/1440) measured for `scrollWidth - clientWidth <= 1`; **1** sub-44 px `min-h` declaration left in `src/**` and it is a `role="status"` text row, not a target — named, with an assertion that its only interactive child sizes at the token |
| 4 | Theming | **3** | `dark:` utilities **56 → 0**; raw palette utilities **477 → 298**; the four surfaces Phase 11 named are now token-only, and the two canonical status primitives now put the tone in the fill and border so the label can be AA. 298 raw steps remain across 30 files (biggest: `applicationStatusUi.ts`, 60), and ~60 sites still pair a tone label with a `/10` wash of its own tone — both real residuals, both recorded as not-claimed rather than rounded away |
| 5 | Anti-patterns | **4** | 2 deterministic findings, both the mandated font, both documented |
| **Total** | | **18/20** | **Excellent (minor polish)** |

## Executive Summary

- Audit health score: **18/20** (Excellent — minor polish).
- Issues found: **P0 0**, **P1 0**, **P2 3**, **P3 2** — after fixing the six
  WCAG AA contrast defects the scan surfaced, which were **P1** while they stood
  (two of them, at ≈ 1.1 : 1, arguably P0: the label could not be read at all).
- The three P2s are all *residuals with an owner*, not defects this task
  introduced: the raw-palette tail outside the named surfaces, the emitted-but-
  unreachable legacy PDF/dev-preview chunks that still carry example-tenant
  literals, and the platform-wide audit export that still exports the loaded page
  (11.4 §11's finding, restated because it is still true).
- Recommended next step: nothing before release. The two P3s are the font
  divergence (a project decision, not a fix) and a missing repo npm script.

## Detailed findings

### [P2] Raw palette utilities remain outside the surfaces Phase 11 named

- **Location**: 30 files, 298 matches. Largest: `src/lib/applicationStatusUi.ts`
  (60), `src/components/admin/applications/ApplicationDetailDocuments.tsx` (33),
  `ApplicationDetailPayment.tsx` (28), `src/components/auth/AuthErrorBoundary.tsx` (24).
- **Category**: Theming.
- **Impact**: a second colour vocabulary for statuses the token palette already
  names. Contrast is not the immediate risk (most are the `-100/-700` pairs that
  do pass AA); drift is — a token change will not reach them.
- **Standard**: `DESIGN.md` §5 *"Don't add per-screen hardcoded hex values. Use
  the tokens."*
- **Recommendation**: route them through `getApplicationStatusColor` /
  `StatusBadge`, which is what this task did for the four surfaces 11.4 §11
  named. `applicationStatusUi.ts` is one map and would move most of the count.
- **Suggested command**: `/impeccable colorize`.
- **Not claimed by task 11.5**: its bullet is *stray dark utilities* (**0** left)
  and 11.4 §11's two named surfaces (**both done**).

### [P2] Example-tenant literals survive in emitted-but-unreachable chunks

- **Location**: `src/lib/pdf/documents/acceptanceLetterProfiles.ts` (28),
  `src/pages/dev/DocumentPreview.tsx` (18), `src/lib/pdf/theme/index.ts` (8),
  `src/pages/dev/AcceptanceLetterPreview.tsx` (6). **60 total, and it did not
  move** in this task.
- **Category**: Anti-pattern (authority drift), R2.2 / TEN-09.
- **Impact**: **none at runtime.** Both routes are wrapped in
  `import.meta.env.DEV ? … : null` in `App.tsx`, so neither renders in a
  production build and neither chunk is ever fetched; `tech.md` records
  `@/lib/pdf` as legacy/dev-preview only, with official documents rendered by the
  backend from tenant configuration. But the strings are still emitted into
  `dist/assets/js/`, and a legacy renderer that hardcodes an example tenant is
  exactly what the no-legacy-hardcoding rule exists to delete.
- **Recommendation**: delete the renderers with the retired behaviour they
  describe.
- **Owner**: task **12.4** (*"Remove … assets, flags, services, components,
  tests, and docs that describe retired behavior"*).

### [P2] The platform-wide audit export still exports the loaded page

- **Location**: `src/pages/admin/AuditTrail.tsx` → `@/lib/auditExports`.
- **Category**: Anti-pattern (a client-derived answer to a server question).
- **Impact**: an operator exporting from `/admin/audit` gets the page they are
  looking at, not the filtered set. R6.5 forbids it.
- **Owner**: unchanged from 11.4 §11, which recorded it and attributed it
  elsewhere. Restated here because it is still true after this task, and this
  task edited that file.

### [P3] `overused-font: Inter`

The verdict above. A project-wide decision guarded by steering, `DESIGN.md`, and
a drift-guard test. **No action.**

### [P3] `bun run validate:tailwind` is a broken npm script

`apps/admissions/package.json` points at `./scripts/validate-tailwind-classes.sh`,
which has never existed in this repository (`git log` on the path is empty). It
exits 127. Pre-existing, unrelated to design; recorded so the next lane does not
mistake it for a gate that regressed.

## Patterns & systemic issues

1. **Narration is a habit, not a screen.** 17 `metrics` rows existed across 17
   files, and 14 of them restated the page's own request state (`State: Loading`),
   its own pagination control (`Page 1 of 3`), or a button already in its header.
   The three that survive are the ones whose numbers a *server* defines (9.1's
   roster, 9.2's dashboard, 9.3's directory). The pattern was "a page should open
   with tiles"; the fix is "a page should open with its work".
2. **A retired capability leaves copy behind.** Task 7.4 deleted admissions
   generative AI; **16** references to it were still in the source — an endpoint
   call, a `Sparkles` icon, a nav label, and prose. Removing a feature and
   removing its advertising are two commits, and the second one is easy to skip.
3. **A second palette follows a missing mode.** All 56 `dark:` utilities were
   variants for a mode `index.css` disables with `color-scheme: light only`. They
   were unreachable styling, and they were the reason a second raw-palette status
   map existed at all.
4. **Duplicate affordances cluster at layout seams.** Two skip links (header +
   layout), two help headings on the tracker (strip + panel), a status pair
   rendered three times on one card. Each is one component doing its job while
   another component does the same job — visible only when both render together.

## Positive findings

- **`StatusBadge` makes a rule unbreakable rather than repeated.** `label` and
  `tone` are both required and the tone resolves a default icon, so "never colour
  alone" cannot be violated by a caller that forgets. Replacing 11 hand-rolled
  `<span>` badges with it removed 11 chances to get it wrong.
- **The token set is documented with its contrast ratios**, inline in
  `design-tokens.css` and again in `DESIGN.md` §1. Every tone this task moved a
  surface onto (`success` #047857, `warning` #b45309, `info` #2563eb,
  `destructive` #dc2626) is AA as text on card white — where `text-amber-700` on
  `bg-amber-100` was not.
- **Reduced motion is enforced globally and nothing here overrides it.**
- **The absence claims are tested, and the tests strip comments first**, so a file
  can document the copy it removed without satisfying its own scan.
- **Geometry claims are measured, not asserted from class names**: overflow from
  `scrollWidth - clientWidth`, flatness from computed style, targets from layout
  boxes, focus containment from real `Tab` behaviour.

## Recommended actions

1. **[P2] `/impeccable colorize`** — route `applicationStatusUi.ts` and the three
   application-detail panels through the semantic tokens; that is ~120 of the 298
   remaining raw steps.
2. **[P2] `/impeccable distill`** — with task 12.4, delete the legacy PDF/dev
   preview renderers rather than re-theming them.
3. **[P3] `/impeccable polish`** — after either of the above.

No P0 and no P1. Nothing above blocks release.
