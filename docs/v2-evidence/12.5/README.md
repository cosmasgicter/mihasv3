# Task 12.5 — Run the final grep-loop canonical-path review

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Phase 12, final bullet
Requirements: **R1, R2, R3, R7, R11, R14-R16**
Findings: all relevant cleanup findings
Required_Evidence: **a reviewed search manifest with zero unregistered matches**

---

## The Required_Evidence claim

```
$ backend/.venv/bin/python3 scripts/v1_surface_telemetry.py     # all five halves
```

```
   categories declared : 13
   total hits          : 838
   UNREGISTERED        : 0
   guards named but missing : none
   HALF 5 PASS=True
   HALF 5b PASS=True
```

[`raw/review-manifest.txt`](raw/review-manifest.txt) (2,920 lines — every hit, its
bucket and its reason) · [`raw/review-manifest.json`](raw/review-manifest.json).
`--review` runs half 5 alone; the artifact above is the **bare** run, so it also
reproduces task 12.2's own recorded verdict on the same file —
`OVERALL PASS = True`, 230 live routes, no stale registry entries — and 12.3's
`HALF 4 PASS=False`, unchanged. Half 5 carries its own verdict for exactly that
reason: adding it must not change what a re-run of an earlier task's command
means. (Run it with the backend venv's interpreter: half 2 imports Django and
otherwise degrades to `not_measured` rather than guessing.)

**The unregistered bucket is empty**, and it is empty because four things were
removed, four registers were repaired, and one over-lenient rule of my own was
deleted — not because a pattern was narrowed. The first run of the finished
instrument reported **83** unregistered matches across 8 of the 13 categories; §2
is the walk from 83 to 0, hit by hit. Two patterns were **widened** on the way
(category 5 gained `Mukuba` / `Kalulushi` / the legacy hostnames and the
`backend/config` root, 120 → 173 hits) and the bucket is still empty, which is a
stronger claim than the first one.

### The instrument has teeth, checked rather than assumed

Nine violations were planted — one in every category where a plant is possible —
and the review named all nine and failed
([`raw/guard-teeth-check.txt`](raw/guard-teeth-check.txt)):

```
planted-violation run: UNREGISTERED=9  PASS=False
  [1] legacy_catalog_writes    PlantedViolation12_5.tsx:3  `/catalog/intakes/${id}/`, { method: 'DELETE' }
  [2] raw_role_authorization   planted_violation_12_5.py:3  if role == "admin":
  [3] invented_permissions     planted_violation_12_5.py:7  PLANTED_PERM = "users:read"
  [4] raw_uuid_form_labels     PlantedViolation12_5.tsx:5  'Optional UUID'
  [5] hardcoded_fees…brands    planted_violation_12_5.py:6  PLANTED_BRAND = "MIHAS"
  [7] direct_client_calls      PlantedViolation12_5.tsx:1  import … from '@/services/client'
  [8] window_confirm           PlantedViolation12_5.tsx:6  window.confirm('really?')
  [9] v1_document_callers      PlantedViolation12_5.tsx:8  generateApplicationSlip({})
 [12] stale_status_aliases     PlantedViolation12_5.tsx:7  s === 'paid'
```

Category 2's plant is the one worth noting: `role == "admin"` with **no** scope
call anywhere near it is caught, while the 13 real role reads that *do* resolve a
scope within their window are not. That is the discriminating property working,
not a lenient window.

Both planted files were deleted afterwards, their absence verified, the tree
grepped for residue, and `tsc` re-run clean; the clean re-run reproduces
`UNREGISTERED: 0`.

---

## What this task establishes

1. **A reviewed manifest of 838 classified hits over 13 declared categories**
   (§1, §2). Per category: the recorded pattern, the roots, the hit count, the
   owning executable guard, and **every hit** with its bucket and a written
   reason. Nothing is filtered — a comment and a dev-preview hit are *classified*
   and printed, because filtering them would satisfy "zero unregistered" by making
   hits invisible (12.2 §18 #9).
2. **Task 12.2's zero report for the three frozen catalog write routes rested on
   a line-oriented pattern against a multi-line call shape** (§3). Eight exported
   client writers in `services/catalog.ts` issued `POST/PATCH/DELETE
   /catalog/{institutions,intakes}/` and `PATCH/DELETE /catalog/programs/{id}/`
   the whole time. They had **zero** production callers, so 12.2's *conclusion*
   holds; its *measurement* could not have seen them. All eight removed, and the
   production bundle is **byte-identical** — they shipped 0 bytes.
3. **Four of six re-export shims had a documented removal condition that nothing
   evaluated** (§4). 12.2 §10.3 built the shrink-only budget mechanism and
   registered the two shims 12.1's own diff created; the category-13 sweep found
   `COMPATIBILITY_OWNER` / `REMOVAL_CONDITION` on **six** modules. The four are
   now registered at their measured blocker counts, so all six shrink or fail.
   Verified by lowering one budget by 1 and watching it fail.
4. **The `_ALLOWED_PREDICATES` register had no staleness check, and adding one
   found two stale exemptions on its first run** (§5). `waitlist_manager.py`'s
   `program=application.program` / `intake=application.intake` predicates are
   gone; the exemptions outlived the code they covered. De-registered from the
   guard **and** from `docs/canonical-truth-map.md`.
5. **A global browser-storage wipe with no caller was removed** (§6).
   `DraftManager.forceCleanBrowserStorage()` swept every draft key in
   `localStorage` with no user and no application in its signature — the shape
   R10.7-R10.10 forbids. Its only mention outside the class was a test asserting
   the cleanup module does *not* reference it. `clearAllDrafts` is **kept**, with
   the reason measured and stated (§6.2).
6. **A red brand register, and the over-lenient rule of my own that hid it**
   (§2.5). `test_brand_drift_guard.py` was failing on **13 hits in 3 files** plus
   **1 stale entry**, and my first draft of category 5 had a blanket
   *"`*/management/` is canonical tenant data"* rule that claimed them — a second,
   more permissive register competing with the one that owns the category. The
   rule is gone, the three files are registered with classifications and reasons,
   the stale entry is de-registered, and the guard is green: **2 failed → 3
   passed**.
7. **The register audit is the second half of the deliverable, and there are
   seven registers, not three** (§7). The dispatch named three; the 13-category
   sweep surfaced four more, two of which are other specs'. All 60 entries now
   have a staleness mechanism. Five of seven still have no per-entry **owner** and
   six of seven no per-entry **removal date** — reported as a gap, not silently
   fixed, because naming an owner on another spec's register would invent a
   commitment this task has no standing to make (12.3 §10.1's reasoning).
8. **Three classification bugs this task hit and fixed in the instrument** (§8): a
   Python **docstring** was being read as production code; a line-oriented grep
   cannot pair a fact on one line with its qualifier on the next; and a register
   parser anchored on a symbol name instead of its declaration reported **0
   entries** for a register with five. The first two are the same class of bug as
   12.2 §1.2's, in the other language and the other axis.

---

## Files

```
docs/v2-evidence/12.5/
├── README.md                       ← this index
└── raw/
    ├── review-manifest.txt         (2,920 lines: all 5 halves; 13 categories, 838 hits, every bucket + reason)
    ├── review-manifest.json        (the same, machine-readable)
    ├── guard-teeth-check.txt       (9 planted violations → 9 named, PASS=False)
    ├── frontend-test-baseline.txt  (BEFORE any 12.5 change: 1 failed / 4607 passed / 1 skipped, 494 files)
    ├── frontend-test.txt           (candidate: byte-identical counts)
    ├── frontend-lint.txt           (15 errors)
    ├── frontend-lint-files.txt     (13 files — identical set to 12.4's)
    ├── frontend-build.txt          (exit 0, incl. tsc + the CSP gate)
    ├── dist-files.txt              (229 files — identical to 12.4's after-rebuild, hashes included)
    ├── dead-code-scan.txt          (module-size-report --dead-code: OVERALL PASS = true)
    ├── size-dependency-after.txt   (587 / 55 over 400 · 339 / 74 over 400 · 7 cycles)
    ├── backend-selection.txt       (the same 52 files 12.4 ran)
    ├── backend-baseline.txt        (33 failed / 805 passed / 0 errors, SERIAL)
    ├── backend-candidate.txt       (33 failed / 809 passed / 0 errors, SERIAL)
    ├── backend-failure-diff.txt    (EMPTY — 0 introduced, 0 fixed)
    ├── drift-guards.txt            (the 4 repaired/extended guards, run directly)
    ├── django-check.txt            (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── openapi-schema.txt          (SHA-256 35fe05d4… — byte-identical)
    ├── jobs-ops-gates.txt          (type-check / lint / vite build, all exit 0)
    ├── harness-build.txt, harness-up.txt, harness-down-pre.txt, harness-down.txt
    ├── harness-required-suite.txt  (FRESH stack: 211 passed / 3 failed / 6 did not run)
    ├── harness-flake-isolation.txt (the one unfamiliar failure, alone: PASSES in 1.7 s)
    ├── harness-gatecheck.txt       (4 failed, as required — the gates fire)
    ├── harness-drain.txt           (broker 0, unsettled payment collections 0)
    │
    │   ── pass 2 (2026-10-09, §13 — GATE-13.6-01 closure, re-measured post-6.3-M14) ──
    ├── pass2-01-review-bare-before.txt      (aborted attempt's baseline: 864 hits / 0 unreg, pre-M14)
    ├── pass2-01-review-bare-after.txt       (current tree, bare: 889 hits / 0 unreg / all halves PASS)
    ├── pass2-02-review-gate-after.txt       (current tree, --review: 889 / 0 unreg)
    ├── pass2-02-review-gate-before.txt      (aborted attempt's --review baseline)
    ├── pass2-03-validators-before.txt       (governance + metadata + self-tests, pre-pass-2)
    ├── pass2-03-validators-after.txt        (governance PASS 0/0 findings=110 · 33 self-tests · metadata PASS)
    ├── pass2-04-backend-register-guards-before.txt  (28 passed, --noconftest)
    ├── pass2-04-backend-register-guards-after.txt   (30 passed, --noconftest)
    ├── pass2-04a-backend-guards-with-conftest-no-db.txt  (the conftest/DB-setup error, recorded)
    ├── pass2-05-frontend-register-guards-before.txt (13 passed, vitest)
    └── pass2-05-frontend-register-guards-after.txt  (14 passed, vitest)
```

---

## 1. The instrument: a review mode on 12.2's telemetry tool

**Extended `scripts/v1_surface_telemetry.py` with `--review` (halves 5 and 5b).**
Stated plainly because the dispatch asked which and why.

Three instruments existed and the split between them is real:

| Tool | Owns | Built by |
|---|---|---|
| `scripts/module-size-report.ts` | the **graph** — which module imports which, whether a specifier resolves, whether a binding is referenced | 12.1 + 12.4 |
| `scripts/inventory_admissions_v2.py` | the **route/authority catalogue** — walks the live URLConf, classifies each view's authority | 0.3 |
| `scripts/v1_surface_telemetry.py` | **declared-surface pattern telemetry** — N declared surfaces, one recorded pattern each, every hit printed with a class | 12.2 |

12.5 is a pattern question over 13 declared categories spanning TypeScript and
Python, whose answer must be *a manifest of classified hits*. That is the third
tool's existing shape, so half 5 lives there and reuses its `_grep` and its
block-comment tracker unchanged. 12.4 §1.1 made the mirror-image choice for the
same reason: a dependency audit is a graph question, so it extended the graph tool.

### 1.1 What the mode deliberately does not do

**It does not re-implement the guards.** Each category names the executable
guard(s) that own it, and the mode asserts the guard **file exists** — 12.4 §16
#3's lesson ("a guard named in a comment is not a guard") turned into a check.
It earned its keep immediately: two guard paths in the first draft of the category
table were wrong (`canonicalSubjectId.test.ts` and
`test_legacy_column_exception_12_3.py` do not exist; the real files are
`subjectMatcher.test.ts` / `educationCatalog.test.ts` /
`wizard/subjectGradeContract.test.ts` and
`test_legacy_column_contraction_12_3.py`). The guards themselves are run as
pytest/vitest and recorded in `raw/`.

**It does not hand-roll a TSX parser.** 12.4 §1.2 wrote one, measured it accusing
~270 live imports because an apostrophe in JSX text is indistinguishable from a
string delimiter, and threw it away. Half 5 asks only *"does this line match this
recorded regex, and what file is it in"* — a question line-oriented grep answers
correctly — and delegates every "is this referenced / is this reachable" question
to the guards and to `module-size-report.ts`.

### 1.2 The buckets

The bullet names four legitimate buckets and implies a fifth that must be empty.
Two more are **additions, stated as additions**:

| Bucket | Meaning |
|---|---|
| `canonical` | the hit **is** the canonical implementation, the guard, or a detector for a retired thing |
| `test-fixture` | a test, fixture or spec pin |
| `immutable-evidence` | `docs/v2-evidence/**`, `docs/audits/**`, archived specs (R2.7) |
| `registered-exception` | named in a register, audited by half 5b |
| `comment` | **added** — prose, including a comment recording the retirement |
| `dev-preview` | **added** — a surface steering explicitly permits as dev/preview-only |
| `unregistered` | **must be empty** — the verdict |

`comment` and `dev-preview` are buckets rather than filters because filtering them
would satisfy "zero unregistered" by making hits invisible. Both carry reasons and
both are printed. Classification order is fixed and is the argument of the half:
immutable evidence first (R2.7 — nothing later can reclassify it into a
violation), **comment second** (a comment is not a caller — 12.2's first run
failed on JSDoc prose recording a retirement, and 11.4 §6 records the same rule
for the UUID scan), test fixture third, then the category's own ordered rules,
then unregistered.

---

## 2. The 13 categories, and the walk from 83 unregistered to 0

Each row's pattern, roots, guards and every individual hit are in
[`raw/review-manifest.txt`](raw/review-manifest.txt).

| # | category | hits | buckets | unreg |
|---|---|---:|---|---:|
| 1 | `legacy_catalog_writes` | 231 | canonical 51, test-fixture 86, registered-exception 7, comment 87 | **0** |
| 2 | `raw_role_authorization` | 57 | canonical 53, comment 4 | **0** |
| 3 | `invented_permissions` | 27 | test-fixture 20, comment 7 | **0** |
| 4 | `raw_uuid_form_labels` | 2 | test-fixture 1, comment 1 | **0** |
| 5 | `hardcoded_fees_support_brands` | 173 | registered-exception 45, comment 62, dev-preview 66 | **0** |
| 6 | `ai_copy_imports` | 41 | canonical 27, comment 14 | **0** |
| 7 | `direct_client_calls` | 45 | canonical 36, registered-exception 9 | **0** |
| 8 | `window_confirm` | 5 | comment 5 | **0** |
| 9 | `v1_document_callers` | 29 | canonical 11, registered-exception 14, comment 4 | **0** |
| 10 | `fallback_subject_ids` | 62 | canonical 62 | **0** |
| 11 | `global_draft_clearing` | 9 | canonical 1, test-fixture 1, comment 7 | **0** |
| 12 | `stale_status_aliases` | 51 | canonical 50, comment 1 | **0** |
| 13 | `surfaced_by_the_twelve` | 106 | canonical 33, test-fixture 35, registered-exception 18, comment 20 | **0** |

**838 hits, 0 unregistered.** Category 5 has **zero** `canonical` hits, and that is
the point of §2.5: after the over-lenient rule was deleted, every brand hit in the
repo resolves to the brand allowlist, to a dev-preview surface, or to a comment.
There is no third opinion.

The route from 83 to 0:

| Was unregistered | n | Resolution |
|---|---:|---|
| `services/catalog.ts` frozen-route writers | 8 (+3 log labels) | **removed** — §3 |
| `services/catalog.ts` catalog **reads** and `logApiError` labels | 21 | classified `canonical`: no write method within 3 lines of the endpoint literal, and steering preserves public/student `GET` |
| `src/generated/api.d.ts` | 7 | classified `canonical`: the generated contract still declares a route that is still served |
| role reads that select a scope check | 13 | classified `canonical`: `AccessScopeService` / `AdminCapabilityService` / `_staff_can_access_application` within 20 lines either side (§8.2) |
| `role == "super_admin"` | 7 | classified `canonical`: the steering's own model says platform authority *comes only from* the role string (§2.2) |
| role recorded as an **attribute** | 1 | classified `canonical`: `provenance` / `actor_role` is writing down *who acted*, not deciding whether they may |
| `ApplicationDetailView`'s two behaviour selectors | 2 | classified `canonical`, per site, with the authority path named (§2.2) |
| `_LEGACY_INSTITUTION_CODE = 'MIHAS'` | 1 | classified `registered-exception`: `docs/legacy-brand-allowlist.json` (§7.3) |
| brand strings in the harness seed, harness settings, and one docstring | 13 | **registered** in `docs/legacy-brand-allowlist.json` — §2.5 |
| payment/document/domain status comparisons | 19 | classified `canonical` under five stated rules (§2.3) |
| `COMPATIBILITY_OWNER` on four unregistered shims | 14 | **registered** — §4 |
| jobs-ops AI, the launch-verification key check, a route catalogue's own note | 3 | classified `canonical` (§2.4) |
| `AuthContext.tsx` transport wiring | 1 | classified `canonical`: `src/contexts/` is outside the pages/components boundary |
| `forceCleanBrowserStorage()` | 1 | **removed** — §6 |
| `clearAllDrafts` | 1 | **kept**, classified `test-fixture` with the reading stated (§6.2) |

### 2.1 The four categories with nothing to argue about

- **3 `invented_permissions`** — 27 hits, and **every one** is either
  `test_no_invented_permissions_guard.py`'s own pattern definition (a detector is
  not a violation) or a comment. Zero in product source, which is 2.4's claim
  reproduced by a second instrument.
- **4 `raw_uuid_form_labels`** — 2 hits: one test, one comment. 11.4 §6 records
  that two panels now *document* the field they replaced by quoting its old
  `placeholder`, and that its own jsdom scan strips comments for exactly that
  reason. The comment rule reproduces that without being told to.
- **8 `window_confirm`** — 5 hits, **all five comments**, each recording where a
  `window.confirm` used to be. `TenantOnboardingWizard.tsx:600` says *"This was
  the **last** `window.confirm` owning a production workflow"*; the manifest is
  the independent confirmation of that sentence.
- **10 `fallback_subject_ids`** — 62 hits, all in the repair-only alias table
  task 7.1 kept on purpose (`LEGACY_SUBJECT_SLUG_TO_CODE`) plus the two modules
  that read it. It maps a retired slug from a pre-7.1 draft onto a real server
  subject code, which is strictly better for the student than discarding an
  answer, and nothing in the UI can produce a new one — the selector's options
  come from the server catalogue.

### 2.2 Category 2's discriminating property: the scope call, not the role string

57 hits. The steering rule is *"every authority decision resolves through
`AdminCapabilityService`; never a raw role-string comparison in endpoint code"* —
but a bare count of `role ==` cannot answer it, because four different things
wear that shape. The rules, in order:

1. **`AdminCapabilityService` / `permissions.py` / the role-hierarchy model** —
   where a role string is *defined* and resolved into capabilities. That is the
   canonical path, not a bypass of it.
2. **`role == "super_admin"` / `is_super_admin(...)`** — the steering's own role
   model says *"Super_Admin authority comes **only** from `role ==
   "super_admin"`. It is never derived from any membership or grant."* So this
   comparison **is** the canonical way to establish platform authority. The rule
   it must not replace is deriving *tenant* authority from the bare `admin`
   string, and no hit does that.
3. **the role recorded as an attribute** — `actor_role` on an audit row,
   `PROVENANCE_ADMIN` on a document version, a bounded metric tag. Writing down
   who acted is not deciding whether they may.
4. **a role read that selects which scope check to apply**, with the authority
   resolved by `AccessScopeService` / `AdminCapabilityService` /
   `_staff_can_access_application` within 20 lines either side.

A role read with **no** capability or scope resolution anywhere in its window
stays unregistered. Two sites needed a per-site decision rather than a rule, and
they are recorded as such:

`student_draft_views.py:171` and `:182` (`ApplicationDetailView`) read
`role in ('admin', 'super_admin')` to decide **behaviour**, not **access**: may an
actor mutate a non-draft, and are the two intake-capacity fields included. Access
is already resolved by the view's own `_get_application`, which applies
`IsOwnerOrAdmin` and then `AccessScopeService.filter_applications` before
returning, masking an out-of-scope id as a 404 and emitting `scope.denied`. The
endpoint's authority is registered at `scripts/authority_matrix_registry.py:512`
as `owner(composed=['tenant.application.read'])`. Classified per site, with that
path written into the rule, rather than by widening a window until it swallowed
them.

### 2.3 Category 12: `successful` is not a legacy alias

51 hits, and the useful finding is what the aliases actually are.
`paymentStatus.ts` normalizes **`paid`, `verified`, `force_approved`, `pending`**
away; **`successful` / `failed` / `deferred` / `expired`** are the *current*
`CanonicalPaymentServiceStatus` vocabulary. A branch on `successful` is a branch
on today's contract, not on a stale alias — so it is classified `canonical` with
that reason attached, and the reader still sees the count. Five rules cover the
51:

| Rule | Example |
|---|---|
| the normalizer itself | `lib/paymentStatus.ts` |
| a `typeof … === 'string'` **type guard** the pattern legitimately caught | `speculativePrefetch.ts:155` |
| normalized within 3 lines | `draftResume.ts:135-136`, `usePaymentStatus.ts:142-143` |
| the canonical service vocabulary | `wizardChecklist.ts:52`, `SubmitStep.tsx:117` |
| another domain's `verified`, or a provider/write payload | `verification_status`, `domain.status`, `pendingPaymentStatus`, `PaymentCallback.tsx` |

One naming observation, reported and not changed: `usePaymentStatus.ts:143` calls
a local holding a **payment** status `applicationStatus`. The read *is* normalized
(`normalizePaymentStatusValue` on line 142), so it is not a defect — the name is
just misleading. Renaming a local inside the payment lane's hook is not this
bullet.

### 2.4 Category 6: the boundary, measured from the admissions side

41 hits, 0 unregistered, and 12.4's 18-case guard
(`test_no_admissions_generative_ai_guard.py`) is reused rather than re-derived —
this half asserts the guard exists and the guard is run in the backend selection.
The three hits that needed a decision:

- `apps/outreach/views.py:115` imports `apps.jobs.ai_service`. **Inside** the
  boundary, not across it: `apps/outreach` is a jobs-ops domain app, and 12.4's
  guard pins `openai`'s importer set to `apps/jobs/ai_service.py` alone.
- `scripts/launch-verification/check-operational-readiness.py:184` checks
  `AI_GATEWAY_API_KEY` is configured. Another spec's gate on the **one live AI
  key**; 7.4 renamed the Django settings, not the deployment keys, so this env var
  name is deliberately unchanged.
- `scripts/authority_matrix_registry.py:630`'s note records that
  `/admin-summary/` was deleted. A route catalogue's own historical record — the
  same call 12.4 §8.4 made for `inventory_admissions_v2.py`'s `ai_cache`
  detectors. (It is a Python **string**, not a comment, so the prose classifier
  correctly did not claim it; it needed a rule.)

### 2.5 Category 5: a red register, and my own rule that hid it

This is the item the review found by *not trusting itself*, and it is the one most
worth reading.

Category 5 reported **0 unregistered** on 120 hits. Then the guards were run, and
`test_brand_drift_guard.py` — the executable guard category 5 names as its
authority — was **red**:

```
FAILED test_no_non_allowlisted_brand_strings_in_backend_apps   13 hits, 3 files
FAILED test_allowlist_entries_still_contain_a_brand_string      1 stale entry
```

Two instruments, same category, opposite verdicts. The guard was right.

**Why my manifest disagreed.** The first draft of category 5 carried a rule
reading *"seed / management-command data that CREATES the two example tenants is
`canonical` — tenant data, which is what MIHAS and KATC are."* That sentence is
true of the two seed commands the brand allowlist already lists. As a **path rule
over `*/management/`** it was a second, more permissive register competing with the
one that owns the category, and it silently absorbed three files the register had
never seen. A manifest whose rules are more generous than the register it defers to
is not auditing that register; it is overriding it.

**The rule was deleted**, with the reasoning left in the source so it is not
rebuilt, and the pattern was **widened** rather than narrowed to match the
register's own surface: `Mukuba` / `Kalulushi` / `mihas.localhost` /
`mihas.edu.zm` / `mihas.beanola.com` added to the pattern, and **`backend/config`
added to the roots** — the brand guard scans it and this category must not have a
smaller surface than the register it defers to. 120 → **173** hits, still 0
unregistered, and now **zero** of them `canonical`: every brand hit in the repo
resolves to the allowlist, a dev-preview surface, or a comment.

**The three files, registered.** All are admissions-v2's own — task 0.4's harness —
which is why registering them is closing this spec's debt in the register that
exists for it, not editing another lane's judgement:

| File | Class | Why |
|---|---|---|
| `catalog/management/commands/harness_seed_tenants.py` (10 hits) | seeded tenant data | Seeds the two same-shaped example tenants the two-tenant isolation journeys need — MIHAS on `mihas.localhost`, KATC on `katc.localhost`, sharing one canonical program, which is the *"same program name across two schools"* case TEN-07 and R18 exercise. Its own docstring already said it: *"Both are example `Institution` tenants of the Beanola platform — never the platform identity itself."* Local/CI only |
| `config/settings/harness.py` (2 hits) | seeded tenant data | `ALLOWED_HOSTS` + `CSRF_TRUSTED_ORIGINS` must list those two hosts or `InstitutionContextService.resolve` cannot reach a resolved tenant context locally. Loaded only by the harness stack, never by `prod.py` / `staging.py` |
| `common/email_links.py` (1 hit) | historical archived document | One line of **module prose** illustrating a resolved tenant domain as `apply.mihas.edu.zm`. The code resolves the base URL from the tenant's own active `InstitutionDomain` and falls back to the neutral `FRONTEND_URL`, with no hardcoded host anywhere |

**The stale entry, de-registered.** `backend/apps/applications/public_views.py` was
allowlisted for *"a comment documenting the historical MIHAS/KATC
application-number pair"*. That comment is gone — `grep -niE 'mihas|katc|mukuba|kalulushi'`
returns nothing — so the exemption had outlived the thing it covered. Removed.
This is the same failure mode as §5's two stale predicates, in a register that
already **had** a staleness check: the check was firing and nobody had acted on it.

Result: `test_brand_drift_guard.py` **2 failed / 1 passed → 3 passed**, and the
frontend half (`brandDriftGuard.test.ts`, which reads the same JSON) 3 passed.
17 → 19 entries.

---

## 3. Task 12.2's zero report, and the eight writers it could not see

This is the substantive find, and it is a **measurement** defect rather than a
wrong conclusion.

### 3.1 What 12.2 declared

```python
Surface(
    id="route.catalog.legacy_intake_write",
    pattern=r"catalog/intakes/[^']*'\s*,\s*\{\s*method:\s*'(POST|PATCH|PUT|DELETE)",
    …
)
```

and reported **0 production callers** for all three catalog write surfaces.

### 3.2 What the code looked like

```ts
update: async (data: IntakeFormData): Promise<IntakeMutationResponse> => {
  …
  await apiClient.request<RawIntake>(`/catalog/intakes/${encodeURIComponent(data.id)}/`, {
    method: 'PATCH',
    body: JSON.stringify(buildIntakePayload(data)),
  })
```

The endpoint literal is on one line and `method:` is on the **next**. The tool's
`_grep` shells out to `grep -rEn`, which is line-oriented, so no amount of `\s*`
in the pattern can span the newline — the pattern presumed a single-line call
shape the code never used. `services/catalog.ts` held **eight** exported writers
to the frozen routes for the whole window and the zero report could not see one
of them.

### 3.3 What was true anyway, and what was not

Measured from the other direction — *who calls these functions*:

```
programService.update/delete, intakeService.create/update/delete,
institutionService.create/update/delete   →  0 production callers
```

Every mention of `programService` / `intakeService` / `institutionService` outside
`services/catalog.ts` is a **comment recording the retirement**
(`data/catalog.ts:31`, `services/admin/catalog.ts:29-30`, `admin/Intakes.tsx:215`)
or a test. So 12.2's *conclusion* — nothing first-party needs the frozen routes —
is correct. What was not correct is that the client had no dead writers left.

### 3.4 The decision: delete, not register

Task 12.2 §6.4 states the rule this task follows: *"A surface with zero
first-party callers and **no published contract** is not a compatibility surface —
it is dead code, and this task deleted it rather than registering it."* The
**route** carries the window (`catalog.legacy_{institution,intake,program}_write`,
owner `platform-admissions`, end date `2027-02-07`) because an external caller may
still use it. The **client function** owed no window.

Removed: 8 exported writers, and the 6 private helpers whose only callers they
were — `getCurrentProgram`, `getCurrentInstitution`, `buildInstitutionPayload`,
`normalizeIntakeMutationResponse`, `normalizeInstitutionMutationResponse`, plus
the `IntakeMutationResponse` / `InstitutionMutationResponse` / `InstitutionFormData`
types. **127 lines.**

Kept, deliberately:

- **`POST /catalog/programs/`** — the *canonical* offering-create path (R7.1). The
  compatibility register's own exit criteria say so in capitals: *"NOTE: POST
  /api/v1/catalog/programs/ is NOT in this window."*
- **`buildIntakePayload`** — exported, and another spec's numbered property
  (`systemAlignmentBuildIntakePayload.property.test.ts`, system-alignment-audit
  Property 4) is over it. 12.2 §18 #6's rule.
- **every catalog read** — steering preserves public/student `GET`.

### 3.5 The removal shipped zero bytes, and that is measured

```
$ diff <12.4's dist listing> raw/dist-files.txt
BYTE-IDENTICAL BUNDLE (same 229 files, same content hashes)
```

Same 229 files, same content hashes, same 5,920,205 total bytes as 12.4's
candidate. Rollup had already tree-shaken the eight unused exports, so no student
was downloading them — the cost was in the source, not the wire. Recorded because
the opposite result would have meant the writers were reachable.

`bun run build` exit 0; `tsc --noEmit -p tsconfig.build.json` exit 0; the ten test
suites that touch these files (`serviceNormalization`, `architectureEnforcement`,
`documentFlowDriftGuard`, `studentDashboardTaskFirst`, `draftManagerStorage`,
`consolidation-draft-dedup`, `consolidation-canonical-source`,
`systemAlignmentBuildIntakePayload`, `page-verification/admin-programs`,
`page-verification/admin-intakes`) — **105 tests, all pass.**

---

## 4. Four shims with a removal condition nothing evaluated

Category 13's pattern (`COMPATIBILITY_OWNER|REMOVAL_CONDITION|…`) over
`backend/apps` returns **six** modules. 12.2 §10.3's `SHIMS` register held **two**.

```
$ grep -rln "COMPATIBILITY_OWNER" backend/apps
backend/apps/catalog/views.py          ← registered by 12.2
backend/apps/catalog/admin_views.py    ← registered by 12.2
backend/apps/accounts/admin_views.py
backend/apps/accounts/batch_views.py
backend/apps/applications/views.py
backend/apps/documents/views.py
```

12.2 registered the pair task 12.1's own diff created, which is a defensible scope
line. The consequence was not: four shims carried an owner and a written removal
condition that **no test ever evaluated** — precisely the debt
`test_shim_removal_condition_is_evaluated_and_can_only_shrink` was built to stop,
applied to a third of the surface.

Measured with the guard's own `_production_importers` / `_test_dependents` and
registered at those counts:

| shim | production importers | test dependents |
|---|---:|---:|
| `apps.catalog.views` | 1 | 11 |
| `apps.catalog.admin_views` | 2 | 3 |
| **`apps.accounts.admin_views`** | **1** | **11** |
| **`apps.accounts.batch_views`** | **0** | **2** |
| **`apps.applications.views`** | **0** | **19** |
| **`apps.documents.views`** | **0** | **10** |

Three of the four have **zero** production importers — their URL confs were
already repointed at the split modules, so the only thing holding them is test
files that import or `@patch` through the old path. That is a smaller, purely
mechanical removal than the catalog pair's, and it is now a number a future task
can watch fall rather than a sentence in a docstring.
`apps.applications.views` has 19 test dependents, the largest of the six, which is
exactly why nobody had converted it.

`test_compatibility_surfaces_12_2.py`: **10 → 14 cases**, all passing.

**Teeth, checked** — one budget lowered by 1:

```
E   AssertionError: apps.applications.views: test dependents GREW to 19 (budget 18):
E   ['tests/property/test_admin_endpoint_auth.py', … 19 files …].
E   New tests should import or patch the canonical split module.
1 failed, 13 passed
```

Budget restored; 14 passed.

---

## 5. The register with no staleness check, and the two stale entries it hid

`_ALLOWED_PREDICATES` in `test_canonical_tenant_drift_guard.py` (13 entries) is
the register that permits a named legacy-fallback branch to key on the
`applications.program/intake/institution` display strings. It had the one property
an exemption register must not have: **nothing failed when an entry stopped
matching.** A branch rewritten onto canonical IDs would leave its exemption
behind silently, and the register would grow monotonically while looking clean.

Added `test_allowed_predicates_has_no_stale_entries_and_can_only_shrink`, reusing
12.4 §4.3's mechanism (*"an entry that stops being dead **also** fails it"*) and
12.2 §10.3's, rather than inventing a fourth. It adds no allowlist of its own.

**First run:**

```
E   AssertionError: Stale _ALLOWED_PREDICATES entries: the legacy-string predicate
E   each one exempts is no longer present, so the exemption outlived the code it
E   covered (R1.5). Delete these entries — the allowlist may only shrink:
E       apps/applications/waitlist_manager.py  [intake=application.intake]
E       apps/applications/waitlist_manager.py  [program=application.program]
```

Verified by hand: `waitlist_manager.py`'s only remaining ORM predicate on the
legacy strings is line 56's `filter(program=program, intake=intake)`, which the
other two entries cover and which is live. `application.program` /
`application.intake` still appear in the module — at lines 190-191 and 255-256 as
**positional arguments** to a helper, and in notification copy — but neither is a
query kwarg, so neither is a predicate and neither needs an exemption.

Both entries de-registered from the guard **and** from the legacy-string fallback
allowlist table in `docs/canonical-truth-map.md`, with the reason written into
both. `13 → 11`. Guard: 2 passed.

What the new test deliberately does **not** claim: the register's real removal
condition is a **data** condition — `docs/canonical-truth-map.md` says each branch
is retained only while `applications` rows with null canonical IDs still exist —
and that cannot be evaluated from source. The test says so, and evaluates the
weaker but still useful source condition: the branch it exempts is still there.

---

## 6. Global draft clearing

Nine hits. Seven are comments recording the retirement, in four different files —
`studentDraftCleanup.ts`, `DraftManagementCard.tsx`, `dashboardReducer.ts` and
`draftManager.ts` itself all narrate the dashboard "Delete" button that used to
call a global wipe. One is the canonical scoped command. Two were the wipe
primitives themselves, and they got different answers.

### 6.1 `forceCleanBrowserStorage()` — removed

It swept every draft key in `localStorage` plus every namespaced draft-storage
entry, with **no user and no application in its signature** — the shape
R10.7-R10.10 forbids. Measured: **zero** callers anywhere; its only mention
outside the class was `studentDashboardTaskFirst.test.tsx:324` asserting the
cleanup module does *not* reference it. No numbered property was over it. An
unreachable wipe primitive is still a loaded gun, so it is gone, and its now-dead
`removeDraftStorageEntries` import with it (`tsc --noUnusedLocals` back to 12.4's
recorded 13 unused locals, 0 unused imports).

### 6.2 `clearAllDrafts()` — kept, and the reading is stated

Also zero production callers. But its remaining consumer is
`consolidation-draft-dedup.test.ts` — **another spec's numbered Property 16**
(N concurrent calls return the same promise) — and task 6.3 §"Bulk-wipe removal"
recorded keeping it for exactly that reason while deleting `clearAllDraftData()`.
Property 16's claim rests entirely on this symbol; there is no canonical sibling
to repoint it to, so deleting it would delete another spec's property, which 12.4
§7.3 warns against and 12.2 §18 #6 makes the rule for.

It is classified **`test-fixture`**, on the reading that its only remaining
consumer is a test. Calling a source symbol a test fixture is a stretch and is
labelled as one in the manifest's own reason text. The alternative readings were
`canonical` (it is not — a per-user wipe is not the one-application scope
R10.10 asks for) and inventing an eighth register for "dead frontend code kept by
another spec's property", which the dispatch explicitly rules out. The
requirement itself is satisfied either way: with zero callers, no unscoped
deletion happens.

---

## 7. The register audit — seven registers, not three

The dispatch named three. The 13-category sweep surfaced four more.

```
   register                                           n  own  date  shrink  stale-chk
   compatibility_register.COMPATIBILITY_SURFACES      7  yes   yes     yes        yes
   module-size-report.DECLINED_REMOVALS               3  yes    NO     yes        yes
   architectureEnforcement.LEGACY_EXCEPTIONS          9   NO    NO     yes        yes
   canonical_tenant_drift_guard._ALLOWED_PREDICATES  11   NO    NO     yes        yes   ← §5
   documentFlowDriftGuard.PREVIEW_ALLOWLIST           5   NO    NO     yes        yes
   legacy-brand-allowlist.allowlist                  17   NO    NO     yes        yes
   test_compatibility_surfaces_12_2.SHIMS             6  yes    NO     yes        yes   ← §4
   HALF 5b PASS=True
```

**60 entries, all with a staleness mechanism**, and the mechanism's file is
checked to exist rather than taken from a comment. Two of the seven mechanisms
were added or extended by this task (§4, §5) and one register's contents were
corrected (§2.5).

### 7.1 Each dispatch-named register, verified

- **`COMPATIBILITY_SURFACES` (7)** — the only register with both an owner *and* a
  removal date on every entry. 4 route/alias surfaces + 3 `kind="column"`,
  owner `platform-admissions`, end date `2027-02-07`, RFC 8594 `Sunset` on the
  wire, and the named measurement reproducible: half 3 of this same tool reports
  `Deprecation=True Sunset=True Link=True` for both header-bearing surfaces.
  `applications.prelenco_payment_columns`' exit criterion — *Gate 1b of
  `docs/v2-evidence/12.3/invariants.sql` reports `unbacked_money_rows = 0`* — is
  one query anyone can run, which is the property that stops it aging into an
  exemption. Not re-run here: it is a database gate against Neon, and §9 states
  why this task did not touch a database.
- **`DECLINED_REMOVALS` (3)** — owner named per entry, exact keys, and a stale
  decline fails the scan. Re-verified: `raw/dead-code-scan.txt` reports
  `declined (owner named): 3 … DEAD: 0` and `OVERALL PASS = true`. No removal
  date; the entries are a *product decision about jobs-ops*, whose lane the
  register names as the decider, which is a defensible substitute for a date and
  is recorded as such rather than as a pass.
- **`LEGACY_EXCEPTIONS` — 9, not 13.** The dispatch says 13; the list has **9**.
  The 13 is the *lint* file count, a different number that happens to collide.
  The allowlist may only shrink, so 9 < 13 is the expected direction, and all
  nine are live: the staleness test asserts each entry still imports the raw
  client and it passes.

### 7.2 The two registers the sweep added

- **`documentFlowDriftGuard.PREVIEW_ALLOWLIST` (5)** — category 9's register.
  Each entry has a written reason, and three tests keep it tight: no
  non-allowlisted module may reference `@/lib/pdf`, every entry must still
  reference it (the staleness half), and every entry must have a reason. The five
  are the two dev preview pages, their two dev hooks, and `slipService.ts` —
  12.4 §7.1's kept module.
- **`legacy-brand-allowlist.allowlist` (17 → 19)** — category 5's register, owned
  by *beanola-production-readiness* Property 28. Single-file entries, each
  classified into one of four allowed classes with a stated reason, staleness
  checked by `test_allowlist_entries_still_contain_a_brand_string`. It was the
  one register that was **red** when audited, and §2.5 is what was wrong and why
  my own manifest had hidden it.

### 7.3 The one hit that resolved into the brand allowlist

`backend/apps/applications/_view_helpers.py:157`:

```python
_LEGACY_INSTITUTION_CODE = 'MIHAS'
```

Read in full before classifying. The **default** resolver
(`_resolve_institution_code`) returns the brand-neutral `PLATFORM_INSTITUTION_CODE
= 'BNL'`; only the explicitly named `_resolve_institution_code_legacy` falls back
to `MIHAS`, and the file is entry 3 of the brand allowlist, classified *"named
legacy-compatibility code with a guard"*, reason *"legacy application numbers must
stay resolvable for existing records"*. That is a real, non-stale register entry
— the file does contain a brand string — so the hit is `registered-exception`.

**One observation on the entry's strength, reported and not acted on.**
`_resolve_institution_code_legacy` has **zero production callers**: its only
consumers are two cases in `test_institution_code_resolution.py`. The stated
reason is about *matching* existing `MIHAS…` application numbers, and that is done
by `public_views.py`'s validator (allowlist entry 5), which accepts any
institution code with no hardcoded prefix. So the entry is warranted as a
brand-allowlist entry, but the *resolver* it protects looks removable. It belongs
to `beanola-production-readiness`' register and to the multi-tenant lane, and
`test_assignment_properties.py` holds three numbered assertions against the
`MIHAS` sentinel. Reaching into another spec's register to delete a function is
not this bullet.

### 7.4 The gap, reported rather than closed

**Five of seven registers have no per-entry owner; six of seven have no per-entry
removal date.** Task 12.5's clause asks for *"a registered Legacy_Exception with
owner/removal date"*, so this is the honest shortfall of an otherwise-empty
unregistered bucket, and it is stated rather than papered over.

The reason it is a **gap** and not a hole is what §2.5 and §5 demonstrate: a
staleness mechanism catches the failure mode a date is supposed to catch, and
catches it sooner. A date says *"this should be gone by 2027-02-07"*; a staleness
check says *"the thing you exempted is already gone — delete the exemption"*, and
it said it about three entries in this task alone (two in `_ALLOWED_PREDICATES`,
one in the brand allowlist). Both are worth having. Only one of them was missing
everywhere, and that one is now present everywhere.

It is **not** closed here, for the reason task 12.3 §10.1 gave when it declined to
name an individual: *"Naming an individual here would be inventing a commitment
this task has no standing to make."* Four of the five gap-bearing registers belong
to other specs (`beanola-production-readiness`, `multi-tenant-beanola`,
system-alignment-audit) or to other product lanes (jobs-ops). Adding an `owner`
and a date to 17 brand-allowlist entries would assert that named teams have
committed to removal dates they have never seen. What is within this task's
standing — and was done — is to give every register a **staleness mechanism**, so
that an entry cannot outlive the violation it covers regardless of whether anyone
ever writes a date on it. That is the property that actually prevents an exception
becoming an exemption, and §5 is the proof it bites.

The ordered work, for whoever takes it: (1) `COMPATIBILITY_SURFACES` is the shape
to copy; (2) `SHIMS` needs a date, and its six entries all have one owner
(*Beanola platform engineering*, from the shims' own markers) so it is the
cheapest to close; (3) `LEGACY_EXCEPTIONS` and `PREVIEW_ALLOWLIST` are
admissions-v2's own and could take `platform-admissions` + `2027-02-07` without
inventing anything; (4) `_ALLOWED_PREDICATES` and the brand allowlist need their
owning specs' agreement.

---

## 8. Two classification bugs in the instrument, found and fixed

12.2 §1.2 recorded two classification bugs and said *"do not repeat them."* These
are two different ones, in the same family.

### 8.1 A Python docstring was being read as production code

`_comment_line_numbers` tracked `//`, `/* … */` and `#` — everything a
TypeScript-only scan needs, which is all 12.2 ever scanned. Half 5 scans
`backend/apps` and `backend/tests`, where the retirement notes live in **module
and method docstrings**. `official_document_views.py:181` is the example:

```python
"""…Scope for School_Staff comes only from ``AccessScopeService`` — never from
``role == "admin"`` alone (R5.6)."""
```

A docstring cannot be a caller — nothing in it executes — so counting one as
production code is 12.2's JSDoc bug in the other language. Added
`_python_prose_lines`, a whole-file character scan (not per-line: a docstring's
opening and closing delimiters are usually on different lines, which a
`startswith` test cannot see). It also marks triple-quoted spans that are real
string *values*, deliberately and in the safe direction: this classifier decides
*"is this prose"*, and a string literal is not a call site either.

### 8.2 A line-oriented grep cannot pair a fact with its qualifier

The same shape appeared on both sides of the repo: an endpoint literal on one line
and its `method:` on the next (§3.2), and a role read on one line with the
`AccessScopeService` call that supplies its authority three lines below. `grep -E`
is line-oriented, so `\s*` in the pattern buys nothing.

Added a **symmetric** `window` to the classification rule, with the size in the
rule and the direction argued: a normalizer runs *before* the comparison that uses
its result, a scope check runs *after* the role read that selects it. Sizes used:
3 lines (a request-options block, a normalizer call), 20 lines (a method body's
worth, for the scope check). Also `text_absent`, so "a catalog **read**" can be
expressed as its discriminating property — *no write method within 3 lines of the
endpoint literal* — rather than as an allowlist of read function names.

**The residual risk is stated, not hidden**: a window can in principle pair a hit
with an unrelated marker inside the same span. The mitigations are that every hit
is printed with its `file:line` and reason so a reader can check the pairing, that
two sites were classified individually rather than by widening a window until it
swallowed them (§2.2), and that the planted-violation run shows a role read with
no scope call anywhere near it is still caught.

### 8.3 One bug in the register audit, worth naming

`_count_register_entries` first anchored on the bare symbol name.
`PREVIEW_ALLOWLIST`'s first mention is a JSDoc line 72 lines above the array, so
the block then terminated on an unrelated `] as const` and the count came out
**0**. A register audit that silently reports zero entries is the worst available
failure mode here, because *"no entries"* reads as *"nothing exempted"*. Anchored
on the **declaration** instead, and `-1` (file missing) / `-2` (anchor not found)
are now distinguishable from a real zero and both fail the half.

---

## 9. Gate results

| Gate | 12.4 candidate | This candidate | Verdict |
|---|---|---|---|
| `cd apps/admissions && bun run test` | 1 failed / 4607 passed / 1 skipped, 494 files | **identical** | ✓ 0 introduced |
| `bun run lint` | 15 errors, 13 files | **15 errors, the same 13 files** | ✓ unchanged |
| `cd apps/admissions && bun run build` | exit 0 | exit 0, **byte-identical dist** | ✓ |
| `tsc --noEmit -p tsconfig.build.json` | exit 0 | exit 0 | ✓ |
| `tsc --noUnusedLocals` unused | 13 locals / 0 imports | 13 / 0 | ✓ |
| `module-size-report --dead-code` | `OVERALL PASS = true` | `OVERALL PASS = true` | ✓ |
| backend, 52-file selection, **serial** | 33 failed / 805 passed / 0 errors | **33 failed / 809 passed / 0 errors** | ✓ 0 introduced, 0 fixed, +4 |
| cycles / largest SCC | 7 / 116 | 7 / 116 | ✓ |
| `apps/admissions/src` files / over 400 | 587 / 55 | 587 / 55 (110,367 → **110,240** lines) | ✓ |
| `backend/apps` files over 400 | 74 | 74 | ✓ |
| `manage.py check` | no issues | no issues | ✓ |
| OpenAPI SHA-256 | `35fe05d4…` | `35fe05d4…`, 22,135 lines | ✓ byte-identical |
| jobs-ops type-check / lint / vite build | exit 0 | exit 0 / exit 0 / exit 0 | ✓ |
| the 5 drift guards, run directly | 2 failed / 37 passed | **39 passed** | ✓ §2.5 |
| harness required profile, fresh stack | 218 / 2 / 0 (12.4 run 1: 216/3/1) | **211 / 3 / 6** | §9.2 |

The frontend failure is the same `authPageFormMarkup.test.tsx > uses honest helper
copy instead of fake email availability states` that has now failed in **ten**
consecutive task recordings. The backend failure **set** is byte-identical to the
baseline ([`raw/backend-failure-diff.txt`](raw/backend-failure-diff.txt) is
empty); the +4 passing are the four new shim cases in §4. The two guards this task
repaired sit outside the 52-file selection and are recorded separately in
[`raw/drift-guards.txt`](raw/drift-guards.txt).

Backend runs are **serial**, against the throwaway `mihas_localtest` Postgres
(`127.0.0.1:5433`) and local Redis (`127.0.0.1:6380`), with the `test_%` database
list verified empty before each run and no other pytest process. Both runs report
**0 errors**, so the before/after comparison is sound — 12.1 §15.1 is why a
concurrent run makes it unmeasurable. `manage.py check` ran with **no**
`TESTING=1` and **no** substitute `REDIS_URL`. **Neon and production untouched:
not connected to, not queried, not migrated.**

### 9.1 The five guards, run directly

The two guards this task repaired and the three it reuses sit partly outside the
52-file selection, so they are recorded on their own
([`raw/drift-guards.txt`](raw/drift-guards.txt)):

```
tests/unit/test_compatibility_surfaces_12_2.py        SHIMS 2 → 6 (§4)
tests/unit/test_canonical_tenant_drift_guard.py       + staleness check, 13 → 11 (§5)
tests/unit/test_brand_drift_guard.py                  allowlist 17 → 19, 1 stale removed (§2.5)
tests/unit/test_no_invented_permissions_guard.py      reused (category 3)
tests/unit/test_no_admissions_generative_ai_guard.py  reused (category 6)

39 passed
```

Before this task the same five ran **2 failed / 37 passed** — the two brand-drift
failures §2.5 fixed.

### 9.2 The browser gate, on a freshly seeded stack

`harness down` (volumes wiped) → `harness build` → `harness up` → the whole
required profile, `HARNESS_PW_CHANNEL=chrome`:

```
211 passed, 3 failed, 6 did not run   (22.2m)
```

[`raw/harness-required-suite.txt`](raw/harness-required-suite.txt). Gatecheck:
**4 failed, as required** — the skip, console-error, failed-request and
undrained-job gates all fire ([`raw/harness-gatecheck.txt`](raw/harness-gatecheck.txt)).
Drain: `broker_queue_depth: 0`, `unsettled_payment_collections: 0`
([`raw/harness-drain.txt`](raw/harness-drain.txt)). `harness down` afterwards.

**The three failures, attributed — and the unfamiliar one investigated rather
than assumed**, per 12.4 §12.2:

| Failure | Attribution |
|---|---|
| `tenant-launch.spec.ts:139` × `chromium-required` **and** `mobile-required` | the stable pair, now the **fifteenth** consecutive recording. Tenant lane; declined by 12.1 §21. Not this task's |
| `admin-user-directory.spec.ts:227` — *"the role select offers whole-set counts, not the loaded rows"* | **unfamiliar, so isolated.** Passes **alone in 1.7 s** ([`raw/harness-flake-isolation.txt`](raw/harness-flake-isolation.txt)). The failure message is a race, not a wrong value: `expected counted role options, got All roles \| Student \| Reviewer \| Administrator \| Super Admin` — the select had rendered its labels before the whole-set counts arrived. Nothing in this diff can reach it: the user directory reads `services/admin/userDirectory`, and this task's only frontend edits are `services/catalog.ts` and `lib/draftManager.ts`. Reported as this machine's load, which 12.4 §12.2 established, rather than claimed as a fix |

Consistent with 12.4 §12.2: a single full-profile number on this machine is weak
evidence, so the claim made here is the narrow one — one stable pair attributable
to the tenant lane, and one timing failure that passes in isolation and cannot be
reached by this diff.

---

## 10. Boundaries honoured

| Boundary | What was done |
|---|---|
| **No route, endpoint, serializer or view removed** | Every removal is a frontend client function, a private helper, a type alias, or a method. The OpenAPI schema is byte-identical, which is the proof |
| **No pattern narrowed to reach zero** | The 13 patterns are recorded verbatim in the manifest and were written *before* the counts were known. Category 1's pattern deliberately matches reads as well as writes; category 12's deliberately matches `successful`, which turned out not to be a violation. Both are classified, with reasons, rather than excluded |
| **No fourth register** | Three existing registers were repaired (`SHIMS` extended 2 → 6; `_ALLOWED_PREDICATES` given the staleness check it lacked, 13 → 11; the brand allowlist corrected, 17 → 19) and two more were discovered and audited. **Zero new registers** — and the one place a parallel register had crept in was in my own first-draft rules, which is why it was deleted (§2.5) |
| **`docs/v2-evidence/**` untouched** (R2.7) | Not read for correction, not rewritten. It is the `immutable-evidence` bucket in the manifest |
| **Another spec's numbered properties preserved** | `buildIntakePayload` kept for system-alignment-audit Property 4; `clearAllDrafts` kept for consolidation Property 16; the `MIHAS` sentinel kept for `test_assignment_properties.py`'s three |
| **Neon and production untouched** | No connection, no query, no migration. §7.1 states which register exit criterion was therefore not re-run |
| **Other lanes' failures not touched** | Listed in §11 |

---

## 11. Not claimed here

- **That the owner/removal-date gap is closed.** It is not. Five of seven
  registers have no per-entry owner and six of seven no removal date (§7.4). What
  is closed is that all seven now have a staleness mechanism.
- **That `_resolve_institution_code_legacy` was removed.** It was measured at zero
  production callers and reported (§7.3), and left: it belongs to another spec's
  register and three of another suite's numbered assertions.
- **That `clearAllDrafts` is a good thing to keep.** The decision is recorded with
  its trade in §6.2, and the `test-fixture` reading is labelled as a stretch.
- **That the two shim removals §4 makes visible were performed.** Four shims got a
  budget, not a deletion. Three have zero production importers and are cheap to
  remove; that is the next task's, with the numbers now in the register.
- **That `applications.prelenco_payment_columns`' exit criterion was re-verified.**
  It is a database gate and no database was touched (§7.1, §9).
- **That the 33 backend failures or the 1 frontend failure were investigated.**
  Attributed and left.
- **Not fixed, each measured against a real run and attributed elsewhere:**
  `authPageFormMarkup.test.tsx` (ten lanes now), the 15 lint errors,
  `tenant-launch.spec.ts:139` ×2 (the tenant lane's, declined by 12.1 §21), the 14
  task-9.2 perf-golden divergences, `test_view_auth_classification.py`'s 38
  unclassified views, the 3 unclassified public endpoints (12.2 §9.3), the 13
  unused non-import locals (12.4 §6.3), `puppeteer-core`'s undeclared import
  (12.4 §4.4), and `bun run validate:tailwind` exiting 127.
- **That `admin-user-directory.spec.ts:227` was fixed.** It passes alone in 1.7 s,
  its failure message is a render race, and nothing in this diff can reach it. It
  is reported as this machine's load, not as a repair (§9.2).
- **That this harness run matches the baseline.** It does not: 211 / 3 / 6 against
  12.4's 218 / 2 / 0. The one-test difference beyond the stable pair is measured,
  isolated and attributed rather than described as identical.
- **That jobs-ops was affected.** Nothing `apps/jobs-ops` can see was touched. Its
  three gates were run anyway and all pass; the claim is *unchanged*, not *fixed*.
- **Any numbered spec property.** This task has no PBT sub-task; the gate is the
  manifest plus the five guards it repaired, extended or reuses.
- **That the manifest proves the absence of every possible violation.** It proves
  that the 13 declared patterns have no unregistered match, that the classifier
  catches a planted violation in 7 of the 13 categories, and that each category's
  owning guard exists and runs. A pattern is not a proof of absence; §12 #1 says
  what would strengthen it.

---

## 12. What a future task on these surfaces should know

The checkbox is `[x]`, so this is not a continuation plan.

1. **A grep pattern is a claim about a code *shape*, and shapes change.** 12.2's
   catalog-write patterns were correct when written and wrong within one task,
   because a multi-line call is indistinguishable from an absent one to
   `grep -E`. When a zero report matters, measure the *other* direction too —
   "who calls this function" — because the two questions fail differently (§3).
2. **`_grep` is line-oriented; say so in the pattern.** Anything needing two facts
   on different lines needs a window, and the window size belongs in the rule
   where a reader can dispute it (§8.2).
3. **Extend the comment tracker before scanning a new language.** A Python
   docstring is prose and cannot be a caller; a scan that reads one as production
   code makes zero unreachable for a reason that is not real (§8.1).
4. **A register without a staleness check is an exemption list.** Three of the
   seven registers here had shrink-only tests; the one that did not was hiding two
   stale entries. The check costs ~20 lines and it found them on the first run
   (§5).
5. **Anchor a register parser on the declaration, never the symbol name.** A
   JSDoc mention 72 lines above the array made one register report **0 entries**,
   which reads as *"nothing exempted"* — the most dangerous possible wrong answer
   for an audit (§8.3).
6. **Count the registers before trusting a list of them.** The dispatch named
   three; there are seven. Two belong to other specs and one was created by 12.2
   itself and then only partly populated (§4, §7).
7. **`successful` is not a legacy payment alias.** The aliases
   `paymentStatus.ts` normalizes away are `paid`, `verified`, `force_approved`,
   `pending`. A future sweep that treats the whole `payments.status` vocabulary as
   legacy will produce 30 false positives (§2.3).
8. **Distinguish a role read that decides *access* from one that decides
   *behaviour*, records an *attribute*, or establishes *Super_Admin*.** All four
   look like `role == "…"`. Only the first is what the steering rule forbids, and
   the steering itself makes the second-to-last canonical (§2.2).
9. **When a dead symbol is pinned by another spec's numbered property, check
   whether the property rests on it or on a sibling.** `clearAllDrafts` had no
   sibling, so it stayed; `forceCleanBrowserStorage` had no property, so it went.
   Same category, opposite answers, both measured (§6).
10. **Run the category's own guard before believing your own zero.** The single
    most useful thing this task did was distrust its own clean report: category 5
    said 0 unregistered while `test_brand_drift_guard.py` was red on the same
    files, because a path rule in the manifest was more generous than the register
    it was supposed to be auditing. **A classification rule that is broader than
    the register it defers to is a second register.** One category, one authority —
    and the way to notice you have two is to run both (§2.5).

---

## 13. Pass 2 (2026-10-09) — GATE-13.6-01 closed, and re-measured against task 6.3's draft rework

The checkbox stayed `[x]` through §1–§12. **GATE-13.6-01** then reopened the
bullet: its clause requires every registered Legacy_Exception to carry an owner
**and** a removal date, and §7.4 of this very README had reported that five of
seven registers had no per-entry owner and six of seven no removal date. L9-L11
(`docs/v2-evidence/13.6/remediation/L9-L11/README.md` §4) dated the three
registers admissions-v2 owns — `architectureEnforcement.LEGACY_EXCEPTIONS`,
`documentFlowDriftGuard.PREVIEW_ALLOWLIST`, `test_compatibility_surfaces_12_2.SHIMS`
— on task 12.2's existing `2027-02-07` window, and deliberately left
`_ALLOWED_PREDICATES` (11) and the brand allowlist (19) to their owning specs,
*"need[ing] those specs' agreement"*.

**The user gave that agreement.** This pass closes those two registers on behalf
of their owning specs, under that authorization, and re-measures the whole
13-category review on the current tree — because task 6.3's M14 pass reworked the
wizard draft code (`useWizardDraftPersistence.ts`, `useWizardDraftLoader.ts`,
`wizardDraftController.ts`, `wizardDraftProjection.ts`, `draftLocalCache.ts`, the
new `draftOutbox.ts`) **after** the aborted first attempt captured its baseline,
and categories 11 (global draft clearing) and 12 (stale status aliases) run over
exactly that code.

### 13.1 The verdict

```
$ backend/.venv/bin/python3 scripts/v1_surface_telemetry.py            # bare, all five halves
$ backend/.venv/bin/python3 scripts/v1_surface_telemetry.py --review   # half 5 alone
   categories declared : 13
   total hits          : 889
   UNREGISTERED        : 0
   HALF 5 PASS=True
   HALF 5b PASS=True        gaps: none        broken: none
   OVERALL PASS = True   (halves 1-3)
```

[`raw/pass2-01-review-bare-after.txt`](raw/pass2-01-review-bare-after.txt) (bare)
· [`raw/pass2-02-review-gate-after.txt`](raw/pass2-02-review-gate-after.txt)
(`--review`). The "before" is the aborted attempt's own baseline,
[`raw/pass2-01-review-bare-before.txt`](raw/pass2-01-review-bare-before.txt)
(2026-10-09T00:38Z, 864 hits / 0 unregistered), captured before any pass-2 edit
and before M14 touched the draft code.

**12.5's clause is met: every remaining match is canonical, a test fixture,
immutable evidence, a comment, a dev-preview surface, or a registered
Legacy_Exception — and every register now carries an owner, with a removal date
on every register except the one that is undated by design.**

### 13.2 Category counts, before → after

| # | category | before | after | Δ |
|---|---|---:|---:|---:|
| 1 | `legacy_catalog_writes` | 236 | 236 | 0 |
| 2 | `raw_role_authorization` | 56 | 56 | 0 |
| 3 | `invented_permissions` | 27 | 27 | 0 |
| 4 | `raw_uuid_form_labels` | 2 | 2 | 0 |
| 5 | `hardcoded_fees_support_brands` | 173 | 173 | 0 |
| 6 | `ai_copy_imports` | 41 | 41 | 0 |
| 7 | `direct_client_calls` | 36 | 36 | 0 |
| 8 | `window_confirm` | 5 | 5 | 0 |
| 9 | `v1_document_callers` | 29 | 29 | 0 |
| 10 | `fallback_subject_ids` | 62 | 62 | 0 |
| 11 | `global_draft_clearing` | **9** | **9** | **0** |
| 12 | `stale_status_aliases` | **49** | **49** | **0** |
| 13 | `surfaced_by_the_twelve` | 139 | 164 | +25 |
| | **total** | **864** | **889** | **+25** |

**UNREGISTERED is 0 in every category, before and after.** Only two categories
moved, and both are explained:

- **Category 5 held at 173 hits but its buckets reshuffled**:
  `registered-exception` 45 → 67, `test-fixture` 10 (new), `canonical` 34 (new),
  `dev-preview` 66 → 0, `comment` 62 (held). The nine PDF-preview files that were
  `dev-preview` are now dated Legacy_Exceptions in the brand allowlist, so they
  classify as `registered-exception`; the harness-seed and comment entries moved
  to `test-fixture` / `canonical` as the allowlist's own classifications say.
  Same 173 hits, same zero unregistered — a classification shift, not a code one.
- **Category 13 (`surfaced_by_the_twelve`) rose 139 → 164** (+25), and the +25 is
  **entirely the register edits' own lines**: dating `_ALLOWED_PREDICATES` and
  growing the brand allowlist to 19 adds owner/date/provenance lines to the files
  category 13 greps for, so the category that *watches registers* necessarily
  gains hits when a register is dated. All +25 bucket as `test-fixture` /
  `comment`; `canonical` and `registered-exception` carry over. This is the same
  839 → 847 → 874 bookkeeping §7.4 and L9-L11 §4.5 recorded, continued.

### 13.3 Categories 11 and 12 are byte-identical across the M14 rework

The dispatch's specific worry was that task 6.3's M14 edits to the draft code
could have introduced an unregistered stale-status-alias or an unscoped global
clear. They did not. Diffing the two categories' hit lists line by line
(`raw/pass2-01-review-bare-before.txt` vs `-after.txt`):

- **Category 11 (`global_draft_clearing`), 9 hits, identical set**: one canonical
  scoped command, one `test-fixture` (`draftManager.ts:46`), and seven comments
  recording the retired global wipe — now including `draftLocalCache.ts:14`. The
  new `draftOutbox.ts` produces **no** hit: it carries no global-clear primitive.
  `forceCleanBrowserStorage()` stayed removed (§6.1); M14 did not reintroduce it.
- **Category 12 (`stale_status_aliases`), 49 hits, identical set**: same files,
  same line numbers, same buckets (48 canonical, 1 comment).

**The M11 Q12 item 4 regression did not reproduce on the current tree.** M11
flagged two `typeof draft.payment_status === "string"` lines at
`useWizardDraftPersistence.ts:287, 399` that classified as UNREGISTERED. M14's
rework replaced those reads with named bindings — `restorePaymentStatus(stringOrNull(draft.payment_status))`
and `app.payment_status ?? prev?.paymentStatus ?? null` — which the category-12
pattern (`payment_status\s*(===?|!==?)\s*['"]`) does not match at all, so they
produce zero hits rather than unregistered ones. No classifier change was needed:
the two surviving `typeof … payment_status === 'string'` hits elsewhere
(`speculativePrefetch.ts:155`, `services/admin/dashboard.ts:447`) are genuine
type guards already covered by the category's `typeof … === 'string'` rule
(`scripts/v1_surface_telemetry.py:1885`), and a planted real stale alias
(`s === 'paid'`) is still caught by the guard-teeth check (§"The instrument has
teeth"). The smaller truthful change was no change: M14 had already removed the
pattern, and the classifier already discriminates.

### 13.4 The two registers, closed per entry

Both closures reuse L9-L11 §4.4's mechanism exactly — the date is **read from**
`compatibility_register.COMPATIBILITY_SURFACES['catalog.legacy_institution_write'].end_date`
(one window, one source of truth, spelled in Python here), the owner names a lane
with a **record in the repo**, and the window is **evaluated**: the guard fails on
drift and fails on purpose once the window closes, naming the two legitimate
answers. No invented owner, no hardcoded calendar date — which is what M11 Q12
item 3 told us to remove and verify, not assume.

**`canonical_tenant_drift_guard._ALLOWED_PREDICATES` (11) — dated.** All eleven
are genuinely transitional: `docs/canonical-truth-map.md`'s shared removal
condition retires each legacy-string predicate once no `applications` row has a
null canonical ID, so none is permanent by design and all eleven take an owner
and a date.

- **owner `multi-tenant-beanola`** — not coined here. `docs/canonical-truth-map.md`
  documents this register under "## Multi-Tenant (Beanola)", whose spec of record
  is `.kiro/specs/_archived/multi-tenant-beanola-admissions/`; that spec's R1.3 is
  the exception class the register implements and its R1.6 requires this drift
  guard; and GATE-13.6-01 names `multi-tenant-beanola` as an owning lane. A new
  `_OWNER_PROVENANCE` map makes "the owner names a record" a mechanical check, and
  replaces `platform-tenancy`, the name M11 measured as belonging to no spec,
  steering file, or truth map.
- **date read from the register**, via `_announced_window_end()`, replacing the
  literal `date(2027, 2, 7)` M11 flagged.
- **guard**: `test_allowed_predicates_carry_owner_and_the_announced_window`
  (replacing the aborted pass's `test_allowed_predicates_have_owner_and_live_removal_date`,
  whose invented values M11 flagged) checks owner-has-a-record, date-equals-the-register,
  and window-not-closed. The pre-existing `…has_no_stale_entries_and_can_only_shrink`
  (§5) is untouched.

**`legacy-brand-allowlist.allowlist` (19) — split per entry into two populations.**
Not every brand entry is transitional, so not every one gets a date. The
`legacyExceptionPolicy` field records the decision per entry:

- **Legacy_Exception (owner + `removeBy`), 11 entries** — the two
  application-number resolver files and the nine client PDF-preview files. These
  are genuinely transitional (the resolver is zero-caller legacy; the preview
  surface is itself dated by `PREVIEW_ALLOWLIST`), so each carries `owner` and a
  `removeBy` read from the same window.
- **permanent by design (owner + `reviewBucket` + `permanentBecause`), 8 entries**
  — the two tenant-seed commands and the harness seed/settings (seeding the two
  example tenants is what tenant/test-fixture data **is**), and the four docstring
  examples (`comment`). A removal date on any of these would assert a removal
  nobody intends, so — exactly as `DECLINED_REMOVALS` is treated — they are
  **reclassified under 12.5's vocabulary** (`canonical` / `test-fixture` /
  `comment`) and kept out of the dated population, with the reason recorded in
  `permanentBecause`.
- **owners are records**: `beanola-production-readiness` (its Property 28 is on
  both brand guards, its task 3.2 wrote each pre-12.5 entry's reason, and
  GATE-13.6-01 names it an owning lane) and `platform-admissions` (admissions-v2's
  own owner string in `compatibility_register.py`, for the three entries §2.5
  registered). An `OWNER_PROVENANCE` map in `test_brand_drift_guard.py` checks it.
- **guards**: `test_every_entry_is_a_dated_legacy_exception_or_permanent_by_design`
  (exactly one population per entry; owner has a record; a permanent entry's bucket
  is one of the four and its `permanentBecause` is non-empty) and
  `test_legacy_exceptions_carry_the_announced_window` (every dated entry on the
  register's window, evaluated). The frontend half `brandDriftGuard.test.ts`
  mirrors both and evaluates the window there too, since TypeScript cannot import
  the Python register. These **replace** the blanket `removeBy > date.today()` /
  `removeBy > Date.now()` check M11 flagged, which had put a time bomb on the ten
  entries whose own reason says "Cannot be removed".

`module-size-report.DECLINED_REMOVALS` (3) stays **undated by design**, unchanged
— a *declined removal* is a decision not to delete, so a removal date would assert
the opposite. `architectureEnforcement.LEGACY_EXCEPTIONS` now reads **0 entries**
(task 13.6 L12 migrated all nine onto domain services); its shape is still
owner=yes/date=yes and its shrink + staleness checks still hold, so an empty
register is a valid register, not a broken anchor.

### 13.5 The register audit, after

[`raw/pass2-01-review-bare-after.txt`](raw/pass2-01-review-bare-after.txt), half 5b:

```
   register                                           n  own  date  shrink  stale-chk
   compatibility_register.COMPATIBILITY_SURFACES      7  yes   yes     yes        yes
   module-size-report.DECLINED_REMOVALS               3  yes    NO     yes        yes   ← undated by design
   architectureEnforcement.LEGACY_EXCEPTIONS          0  yes   yes     yes        yes   ← emptied by 13.6 L12
   canonical_tenant_drift_guard._ALLOWED_PREDICATES  11  yes   yes     yes        yes   ← dated this pass
   documentFlowDriftGuard.PREVIEW_ALLOWLIST           5  yes   yes     yes        yes
   legacy-brand-allowlist.allowlist                  19  yes   yes     yes        yes   ← per-entry this pass
   test_compatibility_surfaces_12_2.SHIMS             6  yes   yes     yes        yes
   gaps (reported, not failed): none
   HALF 5b PASS=True
```

**`gaps: none`** — the audit's own list of registers missing an owner or date is
empty for the first time. The §7.4 gap ("five of seven have no per-entry owner;
six of seven no removal date") is closed; the only `date=NO` is the one that is
undated on purpose, and the audit does not list it as a gap because its policy
exempts a declined removal from needing a date.

### 13.6 Guards and validators

| gate | before | after | file |
|---|---|---|---|
| backend register guards (`--noconftest`) | 28 passed | **30 passed** | [`raw/pass2-04-backend-register-guards-after.txt`](raw/pass2-04-backend-register-guards-after.txt) |
| frontend register guards (vitest) | 13 passed | **14 passed** | [`raw/pass2-05-frontend-register-guards-after.txt`](raw/pass2-05-frontend-register-guards-after.txt) |
| `validate_spec_governance.py` | PASS, 0/0 | **PASS, 0/0, findings=110** | [`raw/pass2-03-validators-after.txt`](raw/pass2-03-validators-after.txt) |
| its 33 self-tests | 33 passed | **33 passed** | same |
| `validate_spec_metadata.py` | PASS | **PASS** (2 pre-existing informational warnings) | same |
| `manage.py check` | no issues | **no issues** | — |

The backend guards are the four pure-file-I/O register tests
(`test_brand_drift_guard.py`, `test_canonical_tenant_drift_guard.py`,
`test_compatibility_surfaces_12_2.py`, `test_launch_verification_brand.py`), run
with `--noconftest` to drop the session-autouse DB fixture exactly as the aborted
pass's `raw/pass2-04-…-before.txt` recorded. The +2 are the brand guard's new
two-population and window-parity cases; the predicate guard's renamed owner/window
case is one of them. The frontend +1 is `brandDriftGuard.test.ts`'s new
two-population/evaluated-window case.

### 13.7 Boundaries honoured, and what this pass did not do

- **No source file changed.** The register edits that close GATE-13.6-01 were
  already in the working tree from the aborted first attempt; this pass measured
  them on the current tree, ran every guard, and confirmed they are correct. The
  only files this pass wrote are this evidence pack, the GATE-13.6-01 row in
  `findings.md` (State only — the finding count held at 110), and the 12.5 note in
  `tasks.md`. No checkbox moved.
- **No pattern narrowed, no classifier rule added.** Category 12's `typeof` rule
  already existed; the M14 code already avoided the stale-alias shape. The smaller
  truthful change was none.
- **No database, no Neon, no production, no browser harness.** 12.3's concurrent
  pass has finished, so a DB-backed guard run was available — but all four backend
  register guards are pure file I/O and need no DB, so none was used. The one
  register exit criterion that is a database gate
  (`applications.prelenco_payment_columns`, §7.1) was **not** re-run, for the same
  reason §9 gave. No runtime behaviour changed, so no browser proof is owed.
- **Half 4 still `PASS=False`** — task 12.3's source-only legacy-column
  measurement, unchanged by this pass and outside its scope.
- **The owner/date gap this pass closes is the register-metadata gap, not the
  underlying data condition.** `_ALLOWED_PREDICATES`' real removal condition is a
  data condition (zero legacy-null `applications` rows) that cannot be evaluated
  from source; the window makes it get reconsidered on a date instead of never,
  and the staleness check makes a predicate that is rewritten onto canonical IDs
  drop its exemption. Both still hold.
