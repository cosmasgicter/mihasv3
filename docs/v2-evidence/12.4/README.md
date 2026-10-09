# Task 12.4 — Remove admissions AI/OCR/browser and other dead dependencies/assets

Evidence index for task **12.4** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [~] 12.4 Remove admissions AI/OCR/browser and other dead dependencies/assets
  - Use dependency/import/build-output analysis after runtime callers are gone.
  - Remove prepare scripts, assets, flags, services, components, tests, and docs
    that describe retired behavior; retain jobs-ops dependencies only in its
    boundary.
  - _Requirements: R11.1, R11.9, R16.5_
  - _Findings: STU-06, STU-07, MAINT-02_
  - _Evidence: lock/bundle diff, zero-dead-import scan, production build
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-11 / 2026-08-12 (UTC).
- **Schema: no.** §11 records the OpenAPI schema regenerated and **byte-identical**
  (SHA-256 `35fe05d4…`) to 12.1/12.2/12.3's anchor. No SQL, no migration, no
  model, no Neon branch, no production touch.
- PBT: task 12.4 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` has no `12.4` entry), so nothing is recorded
  through `update_pbt_status`. One docstring on **another** spec's numbered
  property was corrected — §7.3 states it in full, because it is the most
  reversible decision here.
- **Working tree inspected first.** No partial 12.4 work existed (no
  `docs/v2-evidence/12.4/`), and every baseline in §2 reproduces 12.3's candidate
  exactly.

## The Required_Evidence claim

Three artifacts, each a measurement.

| Claim | Where it is settled |
|---|---|
| **lock/bundle diff** | **Lock:** [`raw/lock-package-diff.txt`](raw/lock-package-diff.txt) — **38 entries removed, 0 added** from `bun.lock` for 6 direct removals, with the before/after lockfiles committed beside it ([`bun.lock.before`](raw/bun.lock.before), [`bun.lock.after`](raw/bun.lock.after)) and their hashes in [`lock-before.txt`](raw/lock-before.txt) / [`lock-after.txt`](raw/lock-after.txt). **Bundle:** [`raw/dist-name-diff.txt`](raw/dist-name-diff.txt) — two real `bun run build` outputs of the same tree, **241 → 229 files, 7,845,574 → 5,920,384 bytes (−1,925,190, −24.5 %)**, 12 files removed and **0 added** ([`dist-files-before.txt`](raw/dist-files-before.txt), [`dist-files-after.txt`](raw/dist-files-after.txt)) |
| **zero-dead-import scan** | [`scripts/module-size-report.ts --dead-code`](../../../scripts/module-size-report.ts) → [`raw/dead-code-scan-before.txt`](raw/dead-code-scan-before.txt) / [`raw/dead-code-scan-after.txt`](raw/dead-code-scan-after.txt) (+ `.json`). A **new mode on 12.1's existing tool**, not a third tool (§1). Three halves: declared-dependency-with-no-import per workspace, dead import bindings, and unresolved first-party specifiers. **Before: 5 dead deps + 105 dead imports. After: 0 + 0, `OVERALL PASS = true`, exit 0** |
| **production build** | [`raw/frontend-build.txt`](raw/frontend-build.txt) — `cd apps/admissions && bun run build`, **exit 0**, including `tsc -p tsconfig.build.json --noEmit` and the CSP gate. Plus all three jobs-ops gates, because this task touches files jobs-ops can see: [`raw/jobs-ops-gates.txt`](raw/jobs-ops-gates.txt) — type-check **0**, lint **0**, `vite build` **0** |

### The browser gate

Task 12.4 adds **no** browser journey. It removes 1.9 MB from what a student
downloads and changes no rendered output, so what it must show is that the
existing journeys still pass on a freshly seeded stack — §12, including the one
new failure, measured rather than dismissed (§12.2).

## What this task establishes

1. **The jobs-ops AI boundary had no mechanism, and `base.py` said it did.**
   `config/settings/base.py` told every reader that
   `tests/unit/test_no_admissions_generative_ai_guard.py` "fails the build" if an
   admissions module reads the gateway settings. **That file did not exist.** Task
   7.4 did the removal and wrote the claim; the guard was never committed. It
   exists now, 18 cases, and a planted `import openai` in one admissions module
   fails 2 of them ([`raw/guard-teeth-check.txt`](raw/guard-teeth-check.txt)). §5.
2. **`openai` is a jobs-ops dependency and stays — that is the answer to the
   hazard, and it is measured, not assumed.** Its single importer in the entire
   backend is `apps/jobs/ai_service.py`; jobs-ops' JS workspace declares **no** AI
   package at all. §4 is the per-dependency proof, and §4.3 is why the three
   *dead* jobs-ops JS dependencies were **not** removed.
3. **The production bundle was shipping a 1.43 MB PDF engine for two dev-only
   preview routes, and a comment said it wasn't.** `App.tsx` claimed the previews
   were "tree-shaken out of production builds because the routes are guarded by
   `import.meta.env.DEV`". The guard was on the `<Route>`, not on the
   `lazy(() => import(…))`, so the routes were dropped and the chunks were emitted
   anyway. §3.
4. **That closes 12.2 §17's `@/lib/pdf` inheritance with a stronger statement than
   either option it offered.** `@/lib/pdf` is **kept** as the documented
   dev/preview surface — and it is now *measurably absent from the production
   build* rather than dev-only by convention. §7.1.
5. **105 dead imports in `apps/admissions/src` are gone, and the instrument is the
   project's own compiler.** The 14 in `useWizardController.ts` that 11.2 §18
   recorded and 12.1 §10 handed on are among them, and `tsc --noUnusedLocals`
   confirms 11.2's count of 14 exactly. §6.
6. **A hand-rolled dead-import scanner was written, measured, and thrown away.**
   It accused ~270 live imports because a character scanner cannot tell an
   apostrophe in JSX text from a string literal. §1.2 is the write-up, because the
   temptation was to keep it and quietly filter the noise.
7. **A second, never-rendered mobile bottom navigation was standing in as evidence
   about the mobile surface.** `MobileBottomNav.tsx` had **zero** importers, yet
   three docstrings — including the enterprise-tenant-authority spec's **Property
   22** — cited it as the *mobile* witness for desktop/mobile capability parity
   (R13.4), and `docs/canonical-truth-map.md` named it as the source of truth for
   inbox navigation. §7.2–§7.3.
8. **Six documents described the retired admissions AI as live, and one of them
   was a data-protection claim.** `docs/ai-data-flows.md` stated that admissions
   sends applicant **full names, NRC/passport numbers, dates of birth and raw
   result-slip images** to the Vercel AI Gateway. §8.
9. **`.env.example` still asked operators to paste an LLM key for a browser
   automation tool that is not installed.** The STAGEHAND block, and
   `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`, which nothing in the repo reads. §9.
10. **Backend OCR and its two Python dependencies are deliberately retained**, and
    the guard fails if they disappear — because an isolation test that could be
    satisfied by deleting the other half is not measuring isolation. §4.2.

## Files

```
docs/v2-evidence/12.4/
├── README.md                        ← this index
└── raw/
    ├── dead-code-scan-before.txt    (THE zero-dead-import scan, BEFORE: 5 dead deps + 105 dead imports)
    ├── dead-code-scan-before.json   (the same, machine-readable)
    ├── dead-code-scan-after.txt     (AFTER: 0 + 0, OVERALL PASS = true, exit 0)
    ├── dead-code-scan-after.json
    ├── tsc-unused-before.txt        (the compiler's own 118 diagnostics on the untouched tree)
    ├── tsc-unused-after.txt         (13 — all non-import unused locals, out of scope by §6.3)
    ├── strip-unused-imports.py      (how the 106 edits were made: driven by the diagnostics above)
    ├── lock-before.txt / lock-after.txt        (sha256 + size of bun.lock either side)
    ├── bun.lock.before / bun.lock.after        (the lockfiles themselves)
    ├── lock-package-diff.txt        (38 entries removed, 0 added)
    ├── dist-files-before.txt        (241 files, 7,845,574 bytes)
    ├── dist-files-after.txt         (229 files, 5,920,384 bytes)
    ├── dist-files-after-rebuild.txt (a third build of the same tree: 229 / 5,920,205 — §3.2's reproducibility note)
    ├── dist-name-diff.txt           (the 12 removed, hash-independent; 0 added)
    ├── frontend-build-baseline.txt  (BEFORE build, exit 0)
    ├── frontend-build.txt           (AFTER build, exit 0, incl. tsc + CSP gate)
    ├── frontend-test.txt            (1 failed / 4607 passed / 1 skipped, 494 files)
    ├── frontend-lint.txt            (15 errors, 13 files — the same 13 as 12.3)
    ├── frontend-lint-files.txt      (the 13, diffed against 12.3's list: identical)
    ├── jobs-ops-gates.txt           (type-check 0, lint 0, vite build 0)
    ├── backend-selection.txt        (52 files: 12.2's 51 + this task's guard)
    ├── backend-baseline.txt         (BEFORE, serial: 33 failed / 787 passed / 0 errors)
    ├── backend-candidate.txt        (AFTER,  serial: 33 failed / 805 passed / 0 errors)
    ├── backend-failure-diff.txt     (the set difference: 0 fixed, 0 introduced)
    ├── guard-teeth-check.txt        (the boundary guard fails on a planted import)
    ├── django-check.txt             (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── openapi-schema.txt           (byte-identical, SHA-256 35fe05d4…, and why that is correct)
    ├── size-dependency-after.txt    (cycles 7 → 7, largest SCC 116 → 116)
    ├── harness-down-pre.txt         (teardown BEFORE the fresh up, so "fresh" is measured)
    ├── harness-build.txt            (SPA rebuilt after the source change)
    ├── harness-up.txt               (fresh stack, run 1)
    ├── harness-required-suite.txt   (run 1: 216 passed / 3 failed / 1 did not run)
    ├── harness-up-2.txt             (fresh stack, run 2)
    ├── harness-required-suite-2.txt (run 2: 209 passed / 4 failed / 7 did not run)
    ├── harness-axe-isolation.txt    (the one new failure, alone on a fresh stack: PASSES in 22.1 s)
    ├── harness-gatecheck.txt        (must fail — all four gates fire)
    ├── harness-drain.txt            (broker 0, unsettled payment collections 0)
    └── harness-down.txt             (teardown: 0 containers, 0 volumes)
```

There is no `size-dependency-before.txt`: the "before" is
[`docs/v2-evidence/12.2/raw/size-dependency-after.txt`](../12.2/raw/size-dependency-after.txt),
because §2 measures that this task's tree started where 12.3 finished and 12.3
changed no frontend file.

Source of the change.

| Path | What changed |
|---|---|
| **`scripts/module-size-report.ts`** | 12.1's report gains a **`--dead-code`** mode (+~430): three halves, per-workspace dependency attribution, an owner-named `DECLINED_REMOVALS` register that can only shrink, and half B delegating to `tsc --noUnusedLocals` (§1) |
| **`backend/tests/unit/test_no_admissions_generative_ai_guard.py`** | **new**, 18 cases — the boundary guard `base.py` already claimed existed (§5) |
| **`apps/admissions/tests/unit/deadDependencyRemoval.test.ts`** | **new**, 15 cases — the executable half of the lock/bundle diff, in 7.5's shape (§4.1, §3.3, §7.2) |
| `apps/admissions/package.json` | 6 dependencies removed: `recharts`, `date-fns`, `papaparse`, `@types/papaparse`, `@radix-ui/react-toast`, `@radix-ui/react-navigation-menu` |
| `bun.lock` | regenerated: **38 entries removed, 0 added** (§4.1) |
| `apps/admissions/src/App.tsx` | the `import.meta.env.DEV` guard moved onto the two `lazy(() => import('@/pages/dev/…'))` **expressions**, with the measurement that made it necessary in the comment (§3) |
| `apps/admissions/vite.config.ts` | the `vendor-charts` (`/recharts/`, `/d3-`) `manualChunks` branch removed, replaced by the reason, following 7.5's `vendor-ocr` precedent |
| `apps/admissions/tests/unit/test_bug1_preservation.test.ts` | the `vendor-charts` pin **inverted**, not deleted (§4.1) |
| `apps/admissions/src/**` (**61 files**) | 106 dead import bindings removed; **no other edit** in any of them (§6). The tsc before-list names 66 distinct files; the other 5 held only non-import unused locals, which §6.3 leaves alone |
| `apps/admissions/src/components/navigation/MobileBottomNav.tsx` | **deleted** — zero importers (§7.2) |
| `…/tests/unit/canonicalRouteRegistry.test.ts` | its `migratedRouteConsumerFiles` list shrinks by one entry, with the reason |
| `…/tests/property/navParity.property.test.ts` | docstring only — another spec's **Property 22**; the claim, generators, `numRuns` and every case body are untouched (§7.3) |
| `…/src/components/navigation/tenantNav.ts`, `AppLayout.tsx` | comments that named the deleted component |
| `backend/requirements.txt` | `openai` moved into an explicit **jobs-ops-only** section; the OCR pair annotated as deliberately retained (§4.2) |
| `.kiro/steering/tech.md` | "AI-Powered Features" + the `AI_HARDENING_*` table replaced by "Generative AI Boundary" (§8.1) |
| `.kiro/steering/product.md` | the two admissions AI claims corrected (§8.1) |
| `.kiro/steering/structure.md` | the `MobileBottomNav` consumer reference (§7.2) |
| `docs/ai-data-flows.md` | rewritten: it described a deleted module and four deleted call paths (§8.2) |
| `docs/canonical-truth-map.md` | the inbox-navigation row no longer names a deleted file as a source of truth (§7.2) |
| `docs/runbooks/feature-flags-2026-05-17.md` | the AI-hardening flag table (4 nonexistent flags described as "mandatory in production for PII protection") and the rollback order (§8.3) |
| `docs/runbooks/database-backup-restore.md` | the same four flags in its rollback table (§8.3) |
| `docs/runbooks/post-deploy-smoke-canonical-truth.md` | a smoke check against a deleted module, and an incident rollback row that told an operator to flip a flag that no longer exists (§8.3) |
| `.env.example` | the STAGEHAND AI-browser-automation block and its `OPENAI_API_KEY` entry (§9) |

---

## 1. The zero-dead-import scan

```
$ bun scripts/module-size-report.ts --dead-code
```

Exit 0 and `OVERALL PASS = true` on the candidate
([`raw/dead-code-scan-after.txt`](raw/dead-code-scan-after.txt)); exit 1 on the
pre-change tree ([`raw/dead-code-scan-before.txt`](raw/dead-code-scan-before.txt)).

### 1.1 Why it is a mode on 12.1's tool and not a third tool

The dispatch was explicit: reuse or extend `scripts/v1_surface_telemetry.py`
(12.2) or `scripts/module-size-report.ts` (12.1) rather than writing a third.
**`module-size-report.ts` was extended**, because the thing that had to be
measured is a *graph* question and that file already owns the graph: it resolves
the `@/` alias, follows dynamic `import()`, and walks Python packages under
`backend/apps`. 12.2's telemetry tool is a *pattern* instrument — 17 declared
surfaces greped with per-hit classification — and a dependency audit driven by
declared surfaces would have to declare the answer in advance.

What the new mode adds, per half:

| Half | Question | Instrument |
|---|---|---|
| **A** | a `package.json` entry with zero imports in its workspace | the file's own `TS_SPECIFIER` parser, keyed by **(workspace, package)** |
| **B** | an import binding never referenced in its own file | **`tsc --noUnusedLocals`**, the project's own compiler (§1.2) |
| **C** | an `@/…` or relative specifier resolving to no file | disk existence, filtered to real import statements |

Half A's scope had to be wider than the size report's. That report deliberately
measures only authored product source (`apps/admissions/src`, `backend/apps`); a
dependency scan cannot, because `fast-check` is imported only by tests and
`openapi-typescript` only by a script. So the mode walks each workspace whole —
`src`, `tests`, `scripts`, and the root-level config files — and prints the class
each hit came from (`production` / `test` / `dev-preview` / `harness` / `script` /
`config`), so a reader can dispute a classification rather than take a count on
trust. That is 12.2 §18 #9's lesson applied.

**Half A counts in the safe direction, deliberately.** It does not check whether a
matched specifier sits inside a template literal. Over-counting makes a package
look *used*, which never deletes anything; under-counting would make a live
dependency look dead. So a `DEAD` verdict means the package name appears in **no**
import specifier anywhere in its workspace.

### 1.2 The scanner that was written, measured, and thrown away

Half B was first implemented inside the script: parse each import statement, take
its bindings, and ask whether each name appears in the rest of the file with
comments and string literals stripped. It reported **389** dead bindings,
including `Button` in a component that renders `<Button>` on the next screenful.

The cause is not fixable by tuning. A character scanner cannot tell an apostrophe
in JSX text — `You don't have permission` — from the start of a string literal, so
it opened a fake string that swallowed arbitrary spans of real code, and every
binding used only inside that span looked unreferenced. Three intermediate bugs
were found and fixed on the way (specifiers blanked by the string-stripper;
`import` statements *inside* test template literals counted as this file's
imports; the import statements themselves left in the haystack because in the
blanked text `IMPORT_STATEMENT` no longer matches, which made the count **0** and
looked like a clean repo). Each fix moved the number a lot, which is itself the
signal that the instrument was wrong rather than nearly right.

The conservative repair — count a name inside a string as a use — removes the
false positives by systematically **under**-reporting instead. A dead-import scan
that can neither over- nor under-report honestly is not a measurement.

So half B **delegates to `tsc --noUnusedLocals`**: the same compiler `bun run
build` already runs, over the same `tsconfig.build.json`, so it has no false
positives by construction. The script's own contribution is the part tsc does not
do — deciding which `noUnusedLocals` diagnostics are **imports** rather than
unused locals, which it does by testing each diagnostic's line against the
import-statement ranges it computes from the raw source. That split is what makes
§6.3's "13 reported, deliberately not removed" a stated decision rather than an
omission.

The comment block above `TSC_WORKSPACES` in the script records this, so the next
person does not rebuild the discarded version.

### 1.3 The before/after readings

| Half | Before | After |
|---|---:|---:|
| A — dead deps, `apps/admissions` (81 → 75 declared) | **5** | **0** |
| A — dead deps, `apps/jobs-ops` | 3 | **3, declined with an owner named** (§4.3) |
| A — dead deps, `<root>` | 0 | 0 |
| B — dead imports (`tsc`) | **105** | **0** |
| B2 — unused non-import **locals** (reported, not a failure) | 13 | 13 (§6.3) |
| C — unresolved first-party specifiers | 0 | 0 |
| `OVERALL PASS` | `false` (exit 1) | **`true` (exit 0)** |

`jobs-ops`' own `src` had **zero** dead imports before and after — a clean data
point that the 105 were an admissions-side accumulation, not a repo-wide habit.

**How the "before" reading was produced, stated because it matters.** The whole
spec is uncommitted, so `--ref` cannot reach the pre-change tree. The three inputs
halves A–C read — `apps/admissions/src`, `apps/admissions/package.json`,
`bun.lock` (plus `vite.config.ts`) — were restored from copies taken before the
change, the **final** version of the tool was run against them, and the candidate
was then restored and verified byte-identical (the after-scan reproduces exactly,
and `bun.lock`'s SHA-256 matches [`lock-after.txt`](raw/lock-after.txt)). So both
columns come from one instrument. Two caveats, for completeness: the restored
`src` carries §3's `App.tsx` edit (which changes no import and so moves no
number), and `tests/` was left at its candidate state (the three test edits in
this task add no import).

## 2. Baselines, measured before anything changed

| Gate | Baseline (this task's own run) | 12.3 candidate | Match |
|---|---|---|---|
| `cd apps/admissions && bun run test` | 1 failed / **4592** passed / 1 skipped, 493 files | same | ✓ |
| `bun run lint` | **15** errors, **13** files, same file set | same | ✓ |
| `cd apps/admissions && bun run build` | exit 0, 241 files / 7,845,574 bytes | exit 0 | ✓ |
| backend 51-file selection, **serial** | **33** failed / **787** passed / **0** errors | same | ✓ |
| cycles / largest SCC | 7 / 116 | same | ✓ |
| `backend/apps` files over 400 lines | 74 | same | ✓ |
| OpenAPI SHA-256 | `35fe05d4…`, 22,135 lines | same | ✓ |
| harness required profile, fresh stack | 220 total | 218 / 2 / 0 | §12 |

Backend runs are **serial**, against the throwaway `mihas_localtest` Postgres
(`127.0.0.1:5433`) and local Redis (`127.0.0.1:6380`), with the `test_%` database
list verified empty first (one stale `test_mihas_localtest` was dropped) and no
other pytest process. Both runs report **0 errors**, so the before/after
comparison is sound — 12.1 §15.1 is why a concurrent run makes it unmeasurable.
Neon and production untouched.

## 3. The production bundle shipped 1.43 MB of dev-only preview

### 3.1 What the comment said, and what the build said

`src/App.tsx` carried:

> DEV-ONLY: live PDF document previews. **Tree-shaken out of production builds**
> because the routes are guarded by `import.meta.env.DEV`.

The guard was here:

```tsx
const AcceptanceLetterPreview = lazy(() => import('@/pages/dev/AcceptanceLetterPreview'))
const DocumentPreview = lazy(() => import('@/pages/dev/DocumentPreview'))
// …
{import.meta.env.DEV ? <Route path="/dev/acceptance-letter" element={<AcceptanceLetterPreview />} /> : null}
```

Vite replaces `import.meta.env.DEV` with `false` in a production build, so Rollup
does drop the two unreachable `<Route>` elements. It does **not** drop the two
module-scope `lazy()` calls, so the dynamic imports are still emitted. The
baseline build output is the proof
([`raw/frontend-build-baseline.txt`](raw/frontend-build-baseline.txt)):

```
dist/assets/js/AcceptanceLetterPreview-COwvyQCq.js            2.24 kB
dist/assets/js/DocumentPreview-Fb0XYzex.js                   14.39 kB
dist/assets/js/vendor-react-pdf-Bvss8VQU.js               1,433.87 kB
```

A student on a weak Zambian mobile connection was downloading a PDF rendering
engine so that two `/dev/*` routes they can never reach would work.

### 3.2 The fix, and the measured result

The guard moved onto the expression, so `false ? lazy(() => import(…)) : null` is
dead code and the dynamic import goes with it. The previews are **unchanged** in
`bun run dev`.

[`raw/dist-name-diff.txt`](raw/dist-name-diff.txt) — compared with the hash
segment removed, so a renamed chunk is not a phantom change:

| | Files | Bytes |
|---|---|---|
| Before | 241 | 7,845,574 |
| After | **229** | **5,920,384** |
| Delta | **−12** | **−1,925,190 (−24.5 %)** |

**One honest note on reproducibility.** A third build of the identical tree gives
**229 files / 5,920,205 bytes** ([`raw/dist-files-after-rebuild.txt`](raw/dist-files-after-rebuild.txt)) —
179 bytes, or 0.003 %, from the recorded figure, and most chunk **hashes** move.
So this project's build is not byte-reproducible: minified module ordering and
critters' inlined critical CSS (`index.html` 21,120 vs 21,124 bytes) wobble between
runs. That is why the diff above is computed with the hash segment removed, and why
the claim being made is the **file-set** difference (12 removed, 0 added) and a
~1.92 MB delta, not a byte-exact total. A 179-byte wobble cannot account for
1,925,190.

The 12, and why each one leaves:

```
dist/assets/js/vendor-react-pdf-*.js          1.43 MB  the @react-pdf/fontkit/pdfkit/yoga engine
dist/assets/js/AcceptanceLetterPreview-*.js            the dev preview route chunk
dist/assets/js/DocumentPreview-*.js                    the dev preview route chunk
dist/assets/js/AcceptanceLetter-*.js                   the document builder those previews import
dist/assets/images/director-signature.png              a PDF asset reachable only from that graph
dist/assets/playfair-display-*-600.ttf  ×2 weights     the three PDF font families, registered by
dist/assets/source-sans-3-*-regular.ttf ×2 weights     `@/lib/pdf/theme/typography.ts` as ?url assets
dist/assets/jetbrains-mono-*-500.ttf
dist/assets/pinyon-script-*-regular.ttf
dist/assets/js/paymentStatus-*.js                      NOT a removal — see below
```

**`paymentStatus-*.js` is a chunk merge, not a deletion, and calling it a removal
would be wrong.** With the react-pdf graph gone, Rollup's shared-module grouping
no longer gives that module its own chunk; its code is inlined into
`useFeeQuote-*.js` and `notifications-*.js`, which was verified by grepping the
new bundle for the `provider_processing` literal it owns. Nothing was added
(**0 added files**), and no other chunk changed name-for-name.

Two independent cross-checks that the engine is really gone: `grep -rl
"yoga-layout\|fontkit\|@react-pdf" dist/assets/js/` is empty, and the harness's
own `ocr-manual-fallback.spec.ts:256` ("the served bundle ships no browser OCR
asset") plus `harness-smoke` ("edge serves the admissions SPA cleanly") both pass
on the rebuilt bundle (§12).

### 3.3 Pinned, so the comment cannot become false again

`tests/unit/devPreviewChunkAbsence…` — implemented as the second `describe` in
[`tests/unit/deadDependencyRemoval.test.ts`](../../../apps/admissions/tests/unit/deadDependencyRemoval.test.ts) —
asserts the guard sits on the **import expression** for both previews, that the
preview pages and `@/lib/pdf` still **exist** (this is a bundling fix, not a
deletion), and that no production module outside `pages/dev/`, `lib/pdf/` and
`lib/slipService.ts` imports `@/lib/pdf` at all.

## 4. Dependencies: what went, what stayed, and which workspace needed it

### 4.1 Removed from `apps/admissions` — 6 direct, 38 lockfile entries

Each was measured at **zero imports** in `src/`, `tests/` and `scripts/`, then
re-checked by raw grep before removal:

| Package | Reading |
|---|---|
| `recharts` | 0 imports. The `BarChart3` / `PieChart` / `LineChart` names in the tree are **lucide-react icons**; the admin dashboards render figures in `SectionCard`s |
| `date-fns` | 0 imports, and `src/lib/dateFormat.ts:99` says why: *"Extended helpers (added to replace direct date-fns imports)"*. The replacement had already happened; only the declaration was left |
| `papaparse` + `@types/papaparse` | 0 imports; CSV export goes through `@/lib/exportUtils` |
| `@radix-ui/react-toast` | 0 imports; the app's toasts are `useToastStore` |
| `@radix-ui/react-navigation-menu` | 0 imports |

**A dependency that leaves `package.json` but stays in the lockfile is not
removed**, so `bun install` was re-run and the lockfile diffed
([`raw/lock-package-diff.txt`](raw/lock-package-diff.txt)):

```
bun.lock   2,362 → 2,280 lines,  271,333 → 261,621 bytes
entries    38 removed, 0 added
```

6 direct removals took **32 transitive packages** with them, and the tail is worth
naming: `recharts` was pulling **`redux`, `@reduxjs/toolkit`, `react-redux`,
`redux-thunk`, `reselect`**, eleven `d3-*` packages, nine `@types/d3-*`,
`victory-vendor`, `es-toolkit`, `decimal.js-light`, `internmap` and
`eventemitter3` into the install tree. A chart library nothing imported was
installing a whole state-management stack alongside the one this app actually uses
(Zustand + React Query).

The `vendor-charts` `manualChunks` branch went with it, and
`test_bug1_preservation.test.ts`'s `expect(viteConfig).toContain('vendor-charts')`
was **inverted rather than deleted** — 7.5's exact precedent for `vendor-ocr`, and
12.2 §18 #6's rule. The `recharts` / `vendor-charts` **markers in
`scripts/check-entry-chunk.ts` and `scripts/launchBundlePredicate.ts` are kept**:
the removal is the fix, the guard is the seatbelt, and two other specs' tests pin
those markers.

### 4.2 Retained, and the guard fails if they go

| Retained | Why, and where it is proven |
|---|---|
| `openai` (backend) | jobs-ops' only. Exactly **one** importer in the whole backend: `apps/jobs/ai_service.py`. Moved into an explicit *jobs-ops-only* section of `requirements.txt` so a reader cannot mistake it for a platform dependency, and the guard asserts it is under that marker |
| `pytesseract`, `Pillow` | server-side OCR, which **task 7.5 deliberately kept** as optional deterministic assistance. The bullet is about *dead* dependencies; this path is alive and student-facing. The guard fails if either declaration disappears |
| `@react-pdf/renderer`, `qrcode`, 3 `@fontsource/*` | the dev/preview PDF surface the steering rules explicitly permit (§7.1). Now absent from the production bundle (§3) rather than merely documented as dev-only |
| `jspdf`, `jspdf-autotable`, `pdf-lib` | admin large-table exports — a distinct, permitted category in `tech.md` |

`JOBS_OPS_AI_*` was already namespaced by task 7.4, so admissions shares no
setting with a generative model. That is now asserted rather than assumed (§5).

### 4.3 **Declined: the three dead `apps/jobs-ops` JS dependencies**

The scan measures `@hookform/resolvers`, `react-hook-form` and `zod` as **0
imports** in `apps/jobs-ops`. They are **not removed**, and this is a decision, not
an oversight:

- The bullet's own constraint is *"retain jobs-ops dependencies only in its
  boundary"*. These three **are** in its boundary. Removing them is a product
  decision about a surface this spec does not own.
- `tech.md` documents them as intentionally declared: *"Forms | React Hook Form +
  Zod | Planned/expected for write flows"*. Deleting them would put a steering file
  and the repo out of alignment in the other direction.
- The cost of keeping them is install-tree weight in a workspace whose built
  bundle is 356 kB and does not include them (`vite build` confirms: 1,674 modules,
  and the three are absent because nothing imports them). No student downloads
  them.

**What makes the decline honest rather than an exemption**: the scan now carries a
`DECLINED_REMOVALS` register with an **owner** and a reason per entry, and it is
*exact*, not a filter. A fourth dead jobs-ops dependency fails the scan, and an
entry that stops being dead **also** fails it (`STALE DECLINE … delete the
exemption`). The allowance can only shrink — 12.2 §10.3's mechanism, reused.

### 4.4 One finding reported and not acted on: an undeclared browser dependency

Half A's "imported here but declared by no manifest" reports
`scripts/launch-verification/measure-mobile-ui.mjs` importing **`puppeteer-core`**,
which **no** workspace declares. It is Gate 4 of the *`beanola-launch-verification`*
spec, it measures touch targets against the **live production site**, and it cannot
run today without a global install.

Not this task's: it is another spec's harness, it is not an *AI* or *OCR*
dependency (R11.9's clause is "browser OCR packages"), and there is nothing in a
lockfile to remove. Recorded here because the scan found it and the
launch-verification lane should know. admissions-v2's own browser gate is
Playwright via the task-0.4 harness.

## 5. The boundary guard `base.py` already claimed existed

`config/settings/base.py`, written by task 7.4:

> The admissions domain (applications / documents / catalog / accounts / common)
> must not read these, and `tests/unit/test_no_admissions_generative_ai_guard.py`
> fails the build if it does.

```
$ ls backend/tests/unit/test_no_admissions_generative_ai_guard.py
ls: cannot access …: No such file or directory
```

**A comment that names a guard nobody wrote is worse than no comment**, because
the next person to add an AI import to an admissions module reads it and believes
they are protected. 12.4 is the task whose entire subject is *"retain jobs-ops
dependencies only in its boundary"*, so it is the task that owes the boundary a
test. 18 cases, all passing:

| Group | What it asserts |
|---|---|
| the split is **total** | every app under `backend/apps/` is on one side; a **new** app fails the test until it is placed, so the guard cannot quietly stop covering the surface |
| no admissions import | no module in `accounts/applications/catalog/common/documents` imports `openai`, `anthropic`, `google.generativeai`, `litellm` or `cohere` |
| no admissions **settings read** | an import is not the only way in — `settings.AI_*` and `getattr(settings, "AI_*")` are both refused, comments excluded |
| exactly one importer | `openai`'s importer set across the whole backend is **exactly** `['apps/jobs/ai_service.py']` |
| the retained half | `apps/jobs/ai_service.py` still exists and reads only `JOBS_OPS_AI_*`; `pytesseract` + `Pillow` still declared |
| the removed half | 4 retired modules absent; 4 retired flags not on `settings`; 4 retired un-namespaced settings not on `settings`; the two retired routes not in the live URLConf |
| both manifests | `openai` is inside the jobs-ops-only section of `requirements.txt`; the admissions **frontend** declares no `tesseract` / `openai` / `anthropic` / `langchain` / `ai-sdk` package |

**Teeth, checked rather than assumed** ([`raw/guard-teeth-check.txt`](raw/guard-teeth-check.txt)):
one planted `import openai` in `apps/common/` fails 2 of the 18 and names the
offending file. The planted file was removed afterwards and its absence verified.

It also asserts the **retained** half deliberately: an isolation test that could
be satisfied by deleting the other product is not measuring isolation.

## 6. 105 dead imports, removed by the compiler's own list

### 6.1 The inheritance, and 11.2's count confirmed

Task 11.2 §18 recorded *"fourteen more were already dead before this session …
those are left alone, because dead-code cleanup is task 12.4's lane"*, and 12.1
§10 restated it. `tsc --noUnusedLocals` on `useWizardController.ts` reports 12
import diagnostics; two of them are `TS6192` ("all imports in this declaration are
unused") over two-name declarations, so the dead **names** total 7 + 2 + 2 + 3 =
**exactly 14**. 11.2's number was right, and the compiler is how that is now known
rather than believed.

The same class showed up in the file 12.1 split hardest:
`ApplicationDetailModal.tsx` had **14** import diagnostics of its own, orphaned
when the workspace query and its command hooks moved out.

### 6.2 How the edit was made

[`raw/strip-unused-imports.py`](raw/strip-unused-imports.py) — committed as
evidence, not as a repo tool. It never decides whether an import is dead: its
input is the compiler's diagnostic list, and it performs only the edit tsc already
justified. It re-runs tsc after every pass, because removing one name can make a
whole declaration unused and because a declaration removal shifts later line
numbers. It converged in **7 passes, 106 edits** (105 diagnostics; one declaration
needed a second pass after a sibling name went).

Two bugs it had first, both worth recording because both **silently under-removed**:

- **an indentation-blind declaration boundary.** A braced clause member reads
  `  type AuditLogFilters,` — it starts with the word `type`, so a check that
  looked for a top-level `type` declaration treated an ordinary multi-line type
  import as one and declined to edit it. Three real dead type imports were
  misfiled as "unused locals".
- **`type` not stripped before comparing a binding name.** `type Foo` binds `Foo`;
  comparing the raw text meant every dead `import { type Foo }` survived. Six more.

Both are the same species as 12.2 §1.2's two classification bugs: the tool was
wrong in a way that made its output *look* clean.

### 6.3 What was deliberately **not** removed: 13 unused non-import locals

`tsc --noUnusedLocals` also reports 13 unused **locals** — `bulkActionLoading` and
`modalLoading` in `pages/admin/Applications.tsx`, `searchInputRef`,
`scheduledInterviews` in the student dashboard, `debouncedValues` in
`useSmartAutoSave.ts`, `prefetchStudentApplications` and
`preloadStudentSecondaryPages` in `speculativePrefetch.ts`, and six more.

These are **left alone and reported** ([`raw/tsc-unused-after.txt`](raw/tsc-unused-after.txt)),
and the scan does not fail on them. An unused local is not the same object as a
dead import: `bulkActionLoading` reads like an unfinished loading state and
`preloadStudentSecondaryPages` like a prefetch someone stopped calling, so each is
a question for its own lane about whether a feature is incomplete — not mechanical
dead-code removal. `noUnusedLocals` is not enabled in either project's tsconfig,
so this list is new information either way, which is why the scan prints it under
its own heading (`B2`) instead of hiding it.

### 6.4 Zero behaviour change, measured three ways

| Check | Result |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `bun run test` | 1 failed / 4607 passed — the **same** single known failure, **0 new** (§10) |
| `bun run lint` | 15 errors, the **same 13 files** as 12.3, byte-identical set |

## 7. Three things the bullet nominally targets, and what happened to each

### 7.1 `@/lib/pdf` — **kept**, and 12.2 §17's question answered better than either option

12.2 §17 handed this on: zero production callers, consumers limited to
`src/pages/dev/*` which the steering rules permit, `documentFlowDriftGuard.test.ts`
already keeping it off every official path — "removing a dev-only module is task
12.4's bullet, and it needs the dependency/bundle analysis that task names."

The analysis says: **keep it, because the real problem was not that it existed but
that it shipped.** §3 removed 1.45 MB of it from the production bundle without
removing the capability. That is a strictly better outcome than either option 12.2
framed:

- *Remove it* would delete a documented dev capability (`tech.md`: "Frontend
  `@/lib/pdf` code is legacy/preview-only **unless a specific non-official preview
  use case is documented**" — `src/pages/dev/*` and
  `scripts/render-pdf-samples.tsx` are that case), plus 7 test suites, to save
  bytes that are now already saved.
- *Keep as documented dev-only* was true before this task and was **not** true of
  the build. The steering rule says `@/lib/pdf` "must not be reachable from
  student/admin official download or email flows"; it is now unreachable from the
  production bundle at all, which is a stronger form of the same rule, asserted by
  a test (§3.3) rather than by a convention.

**`src/lib/slipService.ts` is also kept, and this one is a closer call.** It has
**zero importers anywhere** — not even a dev page — so it is dead code by the
strictest reading, and it ships in no chunk. Against removal: two **numbered
properties of another spec** are structural over that file's source (Property 9,
`test_bug5_slip_service.test.ts`: the slip helper must not lie about email and must
not call the retired `email-slip` route; Property 10,
`test_bug5_preservation.test.ts`: the local PDF path exists). Those properties are
reintroduction guards — deleting the guarded file deletes the guard, and 12.2 §18
#6's "invert, don't delete" does not apply cleanly when the property's subject *is*
this file's content. Removing it would save **0 shipped bytes** and cost two
property suites. Kept, with the reasoning here rather than in a commit message.

### 7.2 `MobileBottomNav.tsx` — **removed**, and it was worse than dead

The dispatch said: *"flagged in an earlier lane as possibly dead. Measure it; if it
is live, say so rather than dropping the item."*

Measured: **zero importers.** `AppLayout` renders
`components/ui/BottomNavigation` with capability-filtered items; the deleted file
was a complete second copy of the mobile bar — its own admin "More" menu, its own
student overflow sheet, its own `useTenantNavItem()` call — that no user could
reach. The only references anywhere were three test files and three comments.

Being unreachable is not the interesting part. **Three docstrings and the canonical
truth map cited it as evidence about the mobile surface:**

- `tests/property/navParity.property.test.ts` — the enterprise-tenant-authority
  spec's **Property 22** (desktop/mobile navigation parity, R13.4) — argued
  *"because `DesktopSidebar`, `MobileBottomNav`, and `AppLayout` all inject the
  SAME helper's single result, the capability decision is identical across
  surfaces."* One of the three witnesses was not rendered.
- `docs/canonical-truth-map.md` named it as a source of truth for inbox
  navigation, leading the cell.
- `.kiro/steering/structure.md` listed it as a consumer of `tenantNav.ts`.

All three now name the two surfaces that ship. Removing a false witness makes the
parity claim **stronger**, not weaker.

The three test references cost one line each and no claim: `ui-ux-accessibility.test.ts`
filters its bottom-nav file list by `statSync` and asserts ≥ 1 exists, so it simply
checks one file now; `canonicalRouteRegistry.test.ts`'s
`migratedRouteConsumerFiles` list shrinks by one entry (a shrink, not an
exemption); `navParity.property.test.ts` changes **only** its docstring. All pass.
A new case pins the absence and re-asserts what the duplicate was supposed to
demonstrate against the surfaces that exist.

### 7.3 A docstring on another spec's numbered property — read this

`navParity.property.test.ts` carries **Property 22** of the
**`enterprise-tenant-authority`** spec, not this one. 12.2 §5.4 set the standard
for touching such a file, so the same disclosure:

1. **No case body, generator, `numRuns` or assertion changed.** Only the docstring.
2. **The property's claim never rested on the component.** Every case drives the
   real pure helpers (`resolveTenantNavItem`, `canSeeAdminNavPath`) directly and
   models the three "surfaces" as three calls to the same helper. The file does
   **not import `MobileBottomNav`** and never did.
3. **The requirement link is unchanged** (13.4).
4. The docstring now names the two rendered surfaces and records, in place, that a
   third was removed and why — so the next reader can challenge it in one place.
5. The property is arguably **more** true afterwards: it claimed parity across
   three surfaces, one of which no user could reach.

If a reviewer judges that another spec's property file may not be touched at all,
the reversal is one comment block, and nothing else in this task depends on it.

## 8. Docs that described retired behaviour

The bullet says remove *"docs that describe retired behavior"*. The line drawn
here, per the dispatch: **a dated record of what a task measured is preserved; a
document written in the present tense about behaviour that no longer exists is
corrected.** So `docs/v2-evidence/**` is untouched (R2.7),
`docs/audits/ai-and-ocr-final.md` and the other dated audit reports are untouched
and are now cited *as* the historical record, and the six live documents below are
corrected.

### 8.1 The two steering files

`.kiro/steering/tech.md`'s "AI-Powered Features" section described as current:
`GET /api/v1/applications/{id}/admin-summary/` (deleted by 7.4), the student
preview summary (deleted by 7.4), `AI_GATEWAY_API_KEY` / `AI_MODEL_*` as generic
platform settings (namespaced to jobs-ops by 7.4), a 24-hour Redis cache in
`ai_cache.py` (deleted), `AIUserScopedRateThrottle` (deleted),
`ai_circuit_breaker` (deleted), `ai_prompt_redactor` (deleted), and a four-row
`AI_HARDENING_*` flag table (all deleted). It is now **"Generative AI Boundary"**:
what admissions does instead (deterministic, per surface), where the one remaining
generative integration lives, that OCR is deterministic and never authoritative,
and an explicit *"Retired — do not reintroduce"* list naming the guard.

`.kiro/steering/product.md` claimed *"AI-powered admin review summaries are
available via `GET …/admin-summary/`"* and *"AI-powered OCR extracts grades … AI
preview summaries personalize the review step."* Both corrected to the
deterministic readiness checklist and the confirm-before-authority OCR contract.

These two matter more than their size: they are injected into every agent session
in this repo, so a stale claim here propagates into the next task's assumptions.

### 8.2 `docs/ai-data-flows.md` — a false data-protection claim

The document's own stated scope was *"the four AI-touching code paths in
`backend/apps/common/ai_service.py`"*. That module does not exist. Every row of
its call-by-call map described a deleted function, and the map said, in the present
tense, that the platform sends **applicant full name, NRC or passport number,
date of birth, contact details and raw result-slip images** to the Vercel AI
Gateway, with four `AI_HARDENING_*` flags as the protections.

That is not a stale paragraph. It is a data-protection statement about a live
system holding real applicant records, and it is false in the most alarming
direction available.

Rewritten to the measured present: admissions sends nothing; the four jobs-ops
calls are mapped from `apps/jobs/ai_service.py` **with the truncation limits from
the source**, because what leaves is a function of them; the protections section
says plainly that what remains are availability and cost protections and **not**
privacy ones; and the open items (résumé-excerpt redaction, third-party contact
names, candidate opt-out) are listed as jobs-ops', unowned by this spec, rather
than quietly dropped. The gateway-retention "still unconfirmed" note is kept,
because it is still unconfirmed and now bears only on jobs-ops.

The one payload worth naming here: `tailor_resume` sends `resume_text[:1000]` —
a person's own document — and `generate_outreach_message` sends a **third party's**
name and employer. The rewrite says so.

### 8.3 Three runbooks that would have cost incident time

| Runbook | What it told an operator |
|---|---|
| `post-deploy-smoke-canonical-truth.md` | a post-deploy check to *"query GlitchTip for `*.degraded` metrics from `apps.common.ai_circuit_breaker`"* — a deleted module, so the check can only ever return empty, and empty reads as "flags not effective". Also a rollback row: *"AI Gateway PII leak detected → immediately set `AI_HARDENING_REDACTION=true`"* — the first minutes of a real leak spent setting a variable that does nothing. Now: treat such traffic as unauthorised code, name the guard that finds the caller, and rotate the jobs-ops key if it is jobs-ops' |
| `feature-flags-2026-05-17.md` | the canonical flag inventory (which `manage.py check_production_state --strict` is documented to enforce) listed all four AI flags as *"Mandatory in production for PII protection"*. Corrected the way **task 8.2** corrected the payment-flag section in this same file — the precedent for treating this dated-filename document as a live inventory. `DOCUMENT_EXTRACT_RATE_LIMITS` is named as the one survivor, and the rollback order no longer opens with a flag that does not exist |
| `database-backup-restore.md` | the same four flags in its rollback table |

### 8.4 What was checked and left alone

- `docs/v2-evidence/**` — immutable historical evidence (R2.7). Not read for
  correction, not rewritten.
- `docs/audits/ai-and-ocr-final.md`, `ai-slop-final.md`, `rate-limit-verification.md`,
  `security-privacy-review.md`, `canonical-alignment-final.md`,
  `scope-endpoint-inventory.md`, `docs/security-api-audit-2026-04.md` — **dated
  audit records** of what someone measured on a date. Preserved, and
  `ai-data-flows.md` now cites them as the historical record.
- `.kiro/specs/_archived/**` — archived specs.
- `docs/canonical-truth-map.md:378` — *"…and the generative `/admin-summary/` that
  task 7.4 **had already deleted**"* is a historical narrative in the past tense
  and is accurate. Left alone. Its line 513, which named a deleted file as a
  present-tense source of truth, was corrected (§7.2).
- `scripts/inventory_admissions_v2.py` — its `ai_cache` / `ai_circuit_breaker`
  patterns are **detectors**, and a detector for a thing that must not come back is
  not stale documentation. Same reasoning as 7.5's retained bundle markers.

## 9. `.env.example` asked for an LLM key for a tool that is not installed

```
# STAGEHAND - AI Browser Automation (Local)
# Supported: OpenAI (OPENAI_API_KEY) or Anthropic (ANTHROPIC_API_KEY)
OPENAI_API_KEY=[your-openai-api-key]
```

Measured: `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are read **nowhere** in the
repo, and "stagehand"/"browserbase" appear only in archived specs and dated audit
reports. Browser automation here is **Playwright** — the task-0.4 harness and
`apps/admissions/tests/harness-e2e/` — which needs no model and no key.

`.env.example` is a live template an operator copies, so this is not a comment: it
is an instruction to paste a real API key into a `.env` for nothing. Removed, with
a block in its place naming the one live AI key (`AI_GATEWAY_API_KEY`, jobs-ops
only) so the deletion cannot be misread as "we lost the AI config".
`tests/unit/test_tracked_env_files.py` passes.

## 10. Frontend result

| | baseline | candidate |
|---|---|---|
| test files | 1 failed / 491 passed / 1 skipped (**493**) | 1 failed / 492 passed / 1 skipped (**494**) |
| tests | 1 failed / **4592** passed / 1 skipped | 1 failed / **4607** passed / 1 skipped |
| lint | 15 errors, 13 files | **15 errors, the same 13 files** |
| build | exit 0 | exit 0 |

**New failures: 0.** The one failure is the same `authPageFormMarkup.test.tsx >
uses honest helper copy instead of fake email availability states` — the sign-up
page's helper copy, which **nine** lanes have now each recorded (11.1–11.5, both
12.1 passes, 12.2, 12.3, and this one). Not touched here.

**+1 file, +15 tests, and the arithmetic closes exactly:** one new file
(`deadDependencyRemoval.test.ts`) with 13 + 2 = 15 cases. 4592 + 15 = 4607. No
case was deleted anywhere, which is the check that matters for a task that removed
a component, six dependencies and 106 imports.

Lint file set diffed against
[`12.3/raw/frontend-lint-files.txt`](../12.3/raw/frontend-lint-files.txt):
**identical**. None of this task's 61 edited source files is in it, and it created
no new violation. `bun run validate:tailwind` still exits 127 in this environment and
is not this task's.

**One honest note on a non-gate.** `tsc --noEmit` over the *full* project
(`type-check:full`, which includes `tests/`) reports pre-existing errors in
`tests/` — `strict`/`noUncheckedIndexedAccess` complaints in harness helpers and
four specs. None is in `src/`, none is in a file this task edited, and the gate the
repo actually runs is `tsconfig.build.json` (exit 0). Recorded because it was
observed, not claimed as this task's.

## 11. Backend result — 0 introduced, 0 fixed, +18 passing

```
$ cd backend && DATABASE_URL=<mihas_localtest 5433> REDIS_URL=<local 6380> TESTING=1 \
    .venv/bin/python3 -m pytest $(cat raw/backend-selection.txt) -q -p no:randomly   # SERIAL
33 failed, 805 passed, 891 warnings in 98.18s
```

| | baseline (51 files) | candidate (52 files) |
|---|---|---|
| failed | **33** | **33** |
| passed | **787** | **805** |
| errored | 0 | 0 |

Set difference ([`raw/backend-failure-diff.txt`](raw/backend-failure-diff.txt)):
**fixed 0, introduced 0.** The +18 are exactly this task's guard cases. The 33
failures are the population 12.2 §12 and 12.3 attributed: ~20 pre-existing plus
the 14 task-9.2 perf-golden divergences against the 2026-06-21 baseline, minus
overlap.

Two deliberately-held numbers are unchanged, and both were checked rather than
assumed: `test_view_auth_classification.py::test_all_api_views_are_classified`
still reports **exactly 38** unclassified (12.1 §19 restored it to 38 and declined
to improve it; 12.2 and 12.3 held it; so does this task), and
`test_public_endpoint_policy.py` still reports the same **3** unclassified public
endpoints 12.2 §9.3 named with their owning lanes.

Django system check, with **no** `TESTING=1` and **no** substitute `REDIS_URL`
(both produce a spurious `django_ratelimit.E003`): `System check identified no
issues (1 silenced)` ([`raw/django-check.txt`](raw/django-check.txt)) — run
because `requirements.txt` and a settings-adjacent guard changed.

**OpenAPI: byte-identical.**

```
$ diff backend/schema/openapi.v2.candidate.yaml /tmp/schema-12-4.yaml     # no output
35fe05d4cd3fa69ddfa9b0f0b3f9370c4649fa83b8258f29dc9100231cc3ef58  (both)
```

22,135 lines, unchanged ([`raw/openapi-schema.txt`](raw/openapi-schema.txt)).
That is the correct reading and not a null result: this task removed **no route,
no serializer field and no view**. Every removal is a dependency declaration, a
private frontend module, an unreferenced component, an import binding, or a
document.

**Size, cycles** ([`raw/size-dependency-after.txt`](raw/size-dependency-after.txt)):

| Measure | 12.3 candidate | 12.4 candidate |
|---|---:|---:|
| import cycles | 7 | **7** |
| largest SCC | 116 | **116** |
| `apps/admissions/src` files | 588 | **587** (MobileBottomNav) |
| `apps/admissions/src` files over 400 | 55 | **55** |
| `backend/apps` files over 400 | 74 | **74** |

Per 12.1 §11 #5 the largest SCC is watched and not only the count; both held. The
106 import removals did not break any cycle, which is expected — every removed
import was already unused, so it contributed no *runtime* edge, only a graph edge
that the SCC was not resting on.

## 12. The browser gate

Isolated local harness (task 0.4), strict gates active, `HARNESS_PW_CHANNEL=chrome`
(bundled Chromium unsupported on this OS), `harness build` after the source change,
volumes wiped and reseeded, and **torn down afterwards**. The pre-teardown is
recorded separately so *"freshly seeded"* is a measurement
([`raw/harness-down-pre.txt`](raw/harness-down-pre.txt): 0 containers, 0 volumes).

| Run | Result |
|---|---|
| fresh stack, whole required profile — **run 1** | **216 passed**, 3 failed, 1 did not run — 220 tests, 24.5 min ([`raw/harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| `harness down` → `up`, whole required profile — **run 2** | **209 passed**, 4 failed, 7 did not run ([`raw/harness-required-suite-2.txt`](raw/harness-required-suite-2.txt)) |
| the one new failure, **alone on a third fresh stack** | **PASSES in 22.1 s** against a 30 s budget ([`raw/harness-axe-isolation.txt`](raw/harness-axe-isolation.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`raw/harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | `{"broker_queue_depth": 0, "celery_queues": ["celery"], "unsettled_payment_collections": 0, "unsettled_references": []}` ([`raw/harness-drain.txt`](raw/harness-drain.txt)) |
| teardown | 0 harness containers, 0 harness volumes ([`raw/harness-down.txt`](raw/harness-down.txt)) |

Total **220** in both runs, the same as 12.1/12.2/12.3's. This task adds no
journey.

### 12.1 The stable failure, attributed

`tenant-launch.spec.ts:139` × **both** projects, in **both** runs. Its assertion is
`getByText('Fees')` against a `Program Fees` step label `TenantOnboardingWizard.tsx`
renders `hidden` on mobile; the call log shows the locator resolving 9 times to
that span and reporting `hidden`. Tasks 10.5, 10.6, 11.1–11.5, both 12.1 passes,
12.2 and 12.3 each recorded it — this is the **twelfth and thirteenth**
consecutive recording. The tenant lane's; 12.1 §21 is why `TenantOnboardingWizard.tsx`
is declined. Not touched here.

### 12.2 The new failure, and why it is a duration rather than a regression

`design-system-defluff.spec.ts:664` — *"every surface this task changed passes an
axe WCAG A/AA scan"* — failed on the **mobile** project in both runs. §9's bar
elsewhere in this report is that nothing moves, so a moved number has to be
accounted for. It is, and the account is not "flake":

- **It is a `Test timeout of 30000ms exceeded`, not an axe violation.** No
  violation is reported in either run. The same scan **passes on chromium** in
  18.5 s (run 1) and in run 2, on the same build.
- **Alone on a freshly seeded stack it passes in 22.1 s** — 8 s inside the budget.
  Under the full profile it took 31.9 s and 32.1 s, i.e. ~10 s slower after the
  suite had been driving the box for 20+ minutes.
- **Run 2 is the corroboration.** It also lost
  `admin-user-directory.spec.ts:227` — which failed on a *data race* (role options
  rendered before the server's whole-set counts arrived) in a surface this task
  does not touch — and its "did not run" count grew from 1 to 7. Failures that
  differ run to run, with growing worker aborts, are a **load-limited** run, not an
  input-limited one.
- **A load-time regression is not a plausible cause in the first place**: the
  bundle this run served is **1.9 MB smaller** than the baseline's (§3), and the
  axe scan's cost is DOM size on the scanned surfaces, which this task changes by
  zero elements — `MobileBottomNav` was never rendered, dead imports emit nothing,
  and the dev-preview guard affects only two `/dev/*` routes that are not scanned.

Recorded rather than smoothed. The tidier thing to write would have been "218/2 as
baseline", and it would have been false.

### 12.3 `ocr-manual-fallback.spec.ts` — the item the dispatch made mine

12.2 §8.2 found `:146` reproducible in isolation and flagged it as possibly
hardening into a defect; 12.3 §9.2 then saw it pass on both projects. The dispatch
noted that because this bullet touches OCR, its behaviour stops being attributable
elsewhere if I change anything OCR-adjacent.

**It passed on both projects in both runs**: chromium 17.1 s / 15.7 s, mobile
17.5 s / 18.1 s. Its sibling `:256` ("the served bundle ships no browser OCR
asset") also passed on both, on a bundle this task rebuilt — which is a useful
independent confirmation that removing 1.9 MB did not disturb the served SPA.

So this task leaves it **passing, four project-runs out of four**, and adds two
more data points to 12.3's reading that the earlier failure was the intermittent
wizard step-advance race rather than a settled defect. That said: **this task
changed nothing on the OCR path.** No backend OCR module, no `extract_document_text_task`,
no `useOcrGradeExtraction`, no `ExtractedResultsCard`, no corpus, no
`grade_extraction.py`. The two OCR-adjacent things it did are (a) annotate
`pytesseract`/`Pillow` in `requirements.txt` as deliberately retained and (b) add a
guard that fails if they disappear — both of which protect that path rather than
alter it. §4.2.

## 13. Design (PRODUCT.md / DESIGN.md)

- **No token, colour, font, size, shadow tier or motion value changed.**
- **One rendered surface was deleted, and it was rendering nowhere** (§7.2). The
  mobile bottom bar students and admins actually see is
  `components/ui/BottomNavigation` via `AppLayout`, unchanged.
- **The three PDF font families and the signature PNG left the production
  bundle** (§3.2). They are PDF-document assets registered by
  `@/lib/pdf/theme/typography.ts`, not app webfonts: the Inter fallback chain in
  `tailwind.config.js` is untouched, and no rendered text changed. `@fontsource/*`
  stays declared for the dev previews.
- 44 px targets, reduced motion, one container deep, no gradient / glassmorphism /
  emoji, "status colour never alone" — all unchanged, and `design-system-defluff`'s
  chromium axe scan plus the 400 %-zoom case pass on the rebuilt bundle.

## 14. Hard constraints

- **Auto-save untouched.** No `useAutoSave` / `useSmartAutoSave` consumer, draft
  persistence path or `SaveStatusIndicator` was edited. `useWizardController.ts`
  lost 14 import bindings it never used and nothing else — `tsc` and the wizard
  suites are the proof.
- **Backend permissions remain the only boundary.** Nothing here decides whether a
  command is authorized. The new guard is a *test*; it is read by pytest, never by
  a request path, and it cannot widen access.
- **No PII.** The scan emits repo file paths and package names. The rewritten data
  map names field *categories*, never a value.
- **Backward compatibility preserved where it is observable.** Six removals are
  private frontend dependencies with no external consumer; the deleted component
  had no importer; the removed bundle chunks were reachable only from two
  `import.meta.env.DEV` routes. No `/api/v1/` route, serializer field or envelope
  changed — §11's byte-identical schema is the check.
- **Server-side OCR preserved deliberately**, and now guarded (§4.2). The bullet is
  about *dead* dependencies; 7.5 kept this one alive on purpose.
- **jobs-ops not broken**: type-check, lint and `vite build` all exit 0, and its
  three dead JS dependencies were **declined**, not removed (§4.3).
- **No new capability, route, endpoint, schema, model or migration.** The catalogue
  stays at 17 `platform.*` + 17 `tenant.*`. Nothing to rehearse on Neon; the only
  databases used were the throwaway `mihas_localtest` Postgres and the task-0.4
  harness, both stopped afterwards. Production untouched.

## 15. Not claimed here

- **No route, endpoint, serializer or view was removed.** §11. Every removal is a
  dependency declaration, a private module, an unreferenced component, an import
  binding, or a document.
- **`@/lib/pdf` and `src/lib/slipService.ts` are kept**, with the reasoning in
  §7.1 rather than as a silent skip. `slipService.ts` is genuinely dead code that
  ships zero bytes; two other-spec numbered properties are structural over it.
- **The 13 unused non-import locals are not removed** (§6.3), and the scan
  deliberately does not fail on them.
- **`apps/jobs-ops`' three dead JS dependencies are not removed** (§4.3), with an
  owner-named register that can only shrink.
- **`puppeteer-core`'s undeclared import is reported, not fixed** (§4.4) — another
  spec's harness.
- **Dead imports in `tests/` are not addressed.** The scan's half B is scoped to
  each project's `tsconfig.build.json`, i.e. **production source**. Test-tree dead
  imports exist, they are other lanes' files, and editing hundreds of them would
  bury this diff. Stated as a scope decision, not an omission.
- **`test_view_auth_classification.py`'s 38 and the 3 unclassified public
  endpoints are unchanged** — checked, and held for the same reason 12.1 §19,
  12.2 §9.3 and 12.3 held them.
- **The committed task-2.1 / 7.5 evidence artifacts were not regenerated**, under
  R2.7. 7.5's bundle diff (245/236 files, 38.1/8.2 MB) describes the tree 7.5
  measured; §3.2's numbers are this task's and are stated as such.
- **Not fixed, each measured against a real run and attributed elsewhere:**
  `authPageFormMarkup.test.tsx` (nine lanes now), the 15 lint errors,
  `tenant-launch.spec.ts:139` ×2 (twelfth and thirteenth consecutive recordings;
  the tenant lane's), the 14 task-9.2 perf-golden divergences,
  `test_view_auth_classification.py`'s 38, the 3 unclassified public endpoints,
  `bun run validate:tailwind` exiting 127, and the pre-existing `tests/` errors
  under `type-check:full` (§10).
- **The harness numbers are load-limited on this machine and are reported that
  way** (§12.2). The strongest available statement is: one stable failure pair
  attributable to the tenant lane, one duration failure that passes in isolation
  8 s inside its budget, and a second run whose *different* extra failures and
  growing worker aborts corroborate load rather than regression.

## 16. What a future task on these surfaces should know

The checkbox is `[x]`, so this is not a continuation plan.

1. **Delegate "is this used?" to the compiler.** A regex/character scanner cannot
   parse TSX — an apostrophe in JSX text is indistinguishable from a string
   delimiter — and every repair either over- or under-reports (§1.2).
   `tsc --noUnusedLocals` filtered to import declarations is authoritative and
   costs one process.
2. **Key a dependency scan by (workspace, package), never by package.** Keying by
   package alone reported admissions' 219 `lucide-react` imports as jobs-ops' too,
   which would have made the boundary question unanswerable — and the boundary was
   the whole hazard (§1.1).
3. **A guard named in a comment is not a guard.** `grep` for test paths mentioned
   in source comments and check they exist. This repo had one that did not, on the
   security-relevant boundary (§5).
4. **`import.meta.env.DEV` on a `<Route>` does not remove the chunk.** The guard
   must sit on the `lazy(() => import(…))` **expression**. Verify by reading the
   build's chunk list, not the comment above the import (§3).
5. **Count what a dependency drags in, not just itself.** Six direct removals took
   32 transitive packages, including a whole redux stack behind an unimported chart
   library (§4.1).
6. **Distinguish a dead dependency from an unused local from a declined removal**,
   and give the third an owner and a shrink-only budget. A scan that can never
   reach PASS is a scan nobody runs (§4.3).
7. **Fix a stale doc in the direction of the danger first.** A document claiming a
   protection that no longer exists (`AI_HARDENING_REDACTION`) costs incident
   minutes; a document claiming a data flow that no longer exists
   (`ai-data-flows.md`) misstates the platform's privacy posture. Both outrank a
   stale file path (§8).
8. **A dated record and a present-tense doc are different objects.**
   `docs/audits/*` and `docs/v2-evidence/**` are what someone measured on a date
   and must not be rewritten to match today; a runbook is an instruction and must
   be (§8.4). When a dated *filename* holds a live inventory, follow the precedent
   in the file — task 8.2 corrected `feature-flags-2026-05-17.md` in place, so this
   task did too.
9. **A duplicate that nobody renders can still be doing damage.** `MobileBottomNav`
   was cited by a numbered property, the canonical truth map and a steering file as
   evidence about the mobile surface. Measure importers before trusting a
   docstring's list of witnesses (§7.2).
