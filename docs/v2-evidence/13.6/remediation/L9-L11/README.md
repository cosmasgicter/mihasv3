# Task 13.6 remediation — L9, L10 and L11

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · remediation items **L9**, **L10**
and **L11** of [`docs/v2-evidence/13.6/README.md`](../../README.md) §8.1
Requirements: **R1 (R1.3)** — the finding/requirement/task/evidence gate;
**R2.6–R2.7** — announced compatibility windows and immutable evidence;
**R14.5, R14.7** — legacy allowances shrink and expose their exit criteria;
**R15.6** — registered exceptions carry an owner and a removal date;
**R18.5** — an evidence artifact is a run record, not a claim
Findings: **GATE-13.6-01** (registers with no owner/date), **GATE-13.6-02** (Phase 13's
findings absent from the register), **GATE-13.6-04** (**filed here**); register findings
**GOV-02**, **GOV-04**; blocking items **B10** and **B11**

---

## THE VERDICT: L9 CLOSED · L10 CLOSED (3 dated · 1 exempt by design · 2 other specs') · L11 CLOSED

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  L9  — register Phase 13's GATE findings           **CLOSED — 39 filed**  │
  │  L10 — give the legacy registers owner + date      **CLOSED — 3 dated**    │
  │  L11 — record 4.1's and 7.4's own runs             **CLOSED**             │
  │                                                                          │
  │  B10 **CLOSED**   — 4.1 and 7.4 now have evidence directories             │
  │  B11 **PARTLY**   — GATE-13.6-01 residual: 2 other specs' registers,      │
  │                     plus DECLINED_REMOVALS' deliberate exemption          │
  │                                                                          │
  │  validate_spec_governance.py     exit 2, 2 errors  →  **exit 0, 0 / 0**   │
  │  its own self-tests              2 of 20 failing   →  **Ran 20 — OK**     │
  │  validate_spec_metadata.py       9/9 PASS          →  **9/9 PASS** (held) │
  │                                                                          │
  │  Phase 13 GATE findings in findings.md    0 of 39  →  **39 of 39**        │
  │  0.2's finding-count pin                    70     →  **71**  (not 110)   │
  │  registers with a per-entry owner          3 of 7  →  **5 of 7**          │
  │  registers with a removal date             1 of 7  →  **4 of 7**          │
  │  audit's `gaps` list                            4  →  **2**              │
  │  UNREGISTERED hits                     0 of 847    →  **0 of 874**        │
  │  evidence directories present            71 of 73  →  **73 of 73**        │
  │  dangling docs/ai-data-flows.md refs            2  →  **0**              │
  │                                                                          │
  │  frontend 1 failed / 4618 passed / 1 skipped over 495 files (was 4616)    │
  │  backend  94 failed / 5239 passed / 103 skipped / 1 error   (was 5237)    │
  │  lint     15 errors / 13 files — the pre-existing L12 baseline, unmoved   │
  │  type-check exit 0                                                       │
  │                                                                          │
  │  NOT closed:  **GATE-13.6-04** (filed here, open by design — §3.3)        │
  │               B1 B2 B3 — operator.  L7 L8 L12 — other batches'.           │
  └──────────────────────────────────────────────────────────────────────────┘
```

| | before (13.6 §2, §4, §7) | after (this batch) |
|---|---|---|
| `python3 scripts/validate_spec_governance.py` | **exit 2, 2 errors** — tasks 4.1 and 7.4 checked with no evidence directory | **exit 0, 0 errors, 0 warnings** — [`raw/02`](raw/02-spec-validator-after-L11.txt), re-confirmed after L10 in [`raw/11`](raw/11-validators-after-L10.txt) |
| its own 20 self-tests | **2 failing** — the 2 evidence errors, and `71 != 70` | **Ran 20 tests — OK** — [`raw/03`](raw/03-spec-validator-selftests-after.txt), [`raw/11`](raw/11-validators-after-L10.txt) |
| `validate_spec_metadata.py` (task 0.1) | 9/9 self-tests, `RESULT: PASS`, exit 0 | **still green** — 9/9 and `RESULT: PASS` in [`raw/04`](raw/04-metadata-validator.txt); the repo scan re-run after L10 in [`raw/11`](raw/11-validators-after-L10.txt) |
| Phase 13 GATE findings in `findings.md` | **0** of 34 known (13.6 §4) | **39** registered with severity, statement, owner requirement, owning lane, state |
| task 0.2's finding-count pin | **70**, against a register holding 71 | **71** — [`raw/12`](raw/12-finding-count-pin.txt). *Not* 110; §2 explains why |
| register audit, half 5b | `LEGACY_EXCEPTIONS 9 NO NO` · `PREVIEW_ALLOWLIST 5 NO NO` · `SHIMS 6 yes NO` | **`9 yes yes` · `5 yes yes` · `6 yes yes`** — [`raw/06`](raw/06-register-audit-after-L10.txt) |
| register audit, half 5 | 847 hits, **0 unregistered**, 13 categories | 874 hits, **0 unregistered**, 13 categories — the +27 is L10's own four files, attributed in §4.5 |
| `docs/ai-data-flows.md` lines 14 / 178 | point at `docs/v2-evidence/7.4/`, which did not exist | **resolve** — [`raw/07`](raw/07-stale-reference-check.txt) |

```
docs/v2-evidence/13.6/remediation/L9-L11/
├── README.md                                   <- this document
└── raw/
    ├── 01-spec-validator-before.txt            <- exit 2 reproduced in THIS batch's environment
    ├── 02-spec-validator-after-L11.txt         <- exit 0
    ├── 03-spec-validator-selftests-after.txt   <- 20/20
    ├── 04-metadata-validator.txt               <- task 0.1, still green
    ├── 05-register-audit-before-L10.txt        <- 12.5's audit, pre-L10
    ├── 05b-register-audit-recheck-before-L10.txt  <- the same, re-measured at the start of the
    │                                              write-up pass. §4.0 says why it exists
    ├── 06-register-audit-after-L10.txt         <- 12.5's audit, post-L10  (the measurement L10 needs)
    ├── 07-stale-reference-check.txt            <- the two dangling refs + 7.2's own flag
    ├── 08-frontend-register-guards.txt         <- the two dated frontend registers' guards
    ├── 09-shims-register-guard.txt             <- the dated SHIMS register's guard
    ├── 10-date-guard-discriminates.txt         <- the new date guard fails on drift, then restored
    ├── 11-validators-after-L10.txt             <- both validators re-run after L10's edits
    ├── 12-finding-count-pin.txt                <- 71 parsed / 39 documental / 110 held
    ├── 13-frontend-type-check.txt              <- exit 0
    ├── 14-frontend-lint.txt                    <- 15 errors / 13 files, identical baseline
    ├── 15-compile-checks.txt                   <- py_compile + every register's entry count
    ├── 16-git-state.txt                        <- nothing committed, nothing staged by this batch
    ├── 17-frontend-whole-suite-after.txt       <- 495 files, this batch's own run
    ├── 18-backend-whole-tree-after.txt         <- serial whole tree, this batch's own run
    └── 19-l11-instruments-recheck.txt          <- 4.1's 46 and 7.4's 18, re-run here
```

---

## 1. L9 — the 39 Phase 13 findings are in the register

`.kiro/specs/admissions-v2-canonical-rebuild/findings.md:169` — *"Phase 13 Verification
Findings (Task 13.6 Remediation, Item L9)"*, six tables plus three notes and a
mechanical caveat, closing **GATE-13.6-02**.

### 1.1 How the 39 were enumerated

The population is **every finding Phase 13 filed against its own lanes**, read out of the
filing tasks' evidence rather than re-derived from the product:

| source | ids |
|---|---|
| `docs/v2-evidence/13.1/README.md` findings table + §5 | GATE-13.1-01 … -07 |
| `docs/v2-evidence/13.2/README.md` | GATE-13.2-01 … -03 |
| `docs/v2-evidence/13.3/README.md` | GATE-13.3-01 … -16 |
| `docs/v2-evidence/13.4/README.md` | GATE-13.4-01 … -03 |
| `docs/v2-evidence/13.5/README.md` | GATE-13.5-01 … -05 |
| **13.6 §4.1's own table** | the 34 above, counted and cross-checked |
| 13.6 §7.1 | GATE-13.6-01, GATE-13.6-02 — filed by 13.6 in prose, absent from its own 34-row table |
| `../L2-L3/README.md` §1 | GATE-13.6-03 — the L2-L3 batch's filing |
| 13.1 §5, unnumbered | GATE-13.1-08 — see §1.4 |
| this item | GATE-13.6-04 — see §3.3 |

The arithmetic is checkable: **34 + 5 = 39**. 13.6 §4.1 lists exactly 34 distinct ids
(13.1×7, 13.2×3, 13.3×16, 13.4×3, 13.5×5). The five additions are GATE-13.1-08,
GATE-13.6-01, -02, -03 and -04. Nothing was invented and nothing was dropped: the two
findings 13.6 filed about itself were in its §7 but never in its own count, and the
remediation batches added one apiece.

### 1.2 Severity is the filing task's own word, deliberately

Each row carries `high` / `med` / `low` **verbatim** from the task that filed it. It is
**not** translated into the register's `P0` / `P1` / `P2` scale. Two scales, two
definitions; re-adjudicating another task's classification is outside this item's
standing, and 13.6 §10 item 7 took the same position about its own §4 table.

**The consequence, stated because it is easy to get wrong.** The release gate's clause
(i) is written over **P0/P1**. A `high` in this section is therefore **not automatically
a P0** for that clause, and nobody should read the 16 `high` rows as 16 new P0s. Clause
(i) is argued through the **register** findings these contradict — GOV-04, STU-01,
STU-03/04/05/10/13/23/24, DATA-01/07/10/11, TEN-09 — which already carry P0/P1 and are
listed in 13.6 §3.2. The GATE rows are the *evidence* that those register findings are
open, not a second severity ledger.

### 1.3 The 39 by state and by severity

Counted from the register itself (`findings.md:214`–`296`):

| state | n | which |
|---|---:|---|
| **fixed** | **25** | 13.1-01, -02, -06 · 13.2-01 · 13.3-01 … -12, -14, -15, -16 · 13.4-02, -03 · 13.5-01, -02 · 13.6-02, -03 |
| **open** | **10** | 13.1-03, -04, -05, -07 · 13.2-02, -03 · 13.4-01 · 13.5-04, -05 · 13.6-04 |
| **open — one half fixed** | **1** | 13.3-13 (the production-lineage half closed by L2-L3; the 113-character input still 500s) |
| **open — accepted with reasoning** | **2** | 13.1-08 (truncated ledger checksums) · 13.5-03 (a host-scoped canary this stack cannot serve) |
| **partly fixed** | **1** | 13.6-01 (this batch's §4) |
| | **39** | |

| severity | n |
|---|---:|
| high | **16** |
| med | **20** |
| low | **3** |

Two things this table is not. It is **not** a claim that this batch fixed 25 findings —
the states are carried from the batches that measured them (13.4 §5/§6.1, 13.5 §1,
`../L1-L4` §2–§3, `../L2-L3` §1–§3, `../L5-L6` §1–§6, 13.6 §5), and **nothing was
re-measured here**. And it is **not** a closure argument: `fixed` in a register row means
a named document measured the fix, which is exactly why the State column links to that
document rather than to the filing task.

### 1.4 The GATE-13.1-04 id collision, resolved and recorded

One id carried **two different defects** across Phase 13's evidence:

| where | what `GATE-13.1-04` meant there |
|---|---|
| 13.1's own findings table | concurrent reviewer auto-assign allocated **8** reviewers against a workload cap of **3** |
| 13.4 §9.2, 13.5 §4, 13.6 §4.1 | the **two truncated `migration_history` checksums** — which 13.1 §5 recorded with the words *"Recorded; the data lane's"* and **no id at all** |

Registering both under one id would leave the register unable to state either state, so
the checksum item is registered as **GATE-13.1-08** (`findings.md:225`): it is 13.1's
finding, filed in 13.1's own §5, which simply never numbered it, and the next free number
in 13.1's namespace is the truthful home for it.

**The downstream references were not edited.** 13.4, 13.5 and 13.6 are other tasks'
evidence directories and immutable under R2.7, so a reader following `GATE-13.1-04` from
any of those three lands on the concurrency row. The collision paragraph in `findings.md`
is what tells them why.

### 1.5 Three items judged notes, not findings — with the basis recorded

| item | filed in | basis for *not* registering |
|---|---|---|
| the **stuck-skeleton** failure mode — a silent boundary over a lazily-loaded global leaves a route a permanent skeleton with no recovery control | `../L5-L6/README.md` §6.1 | **it does not exist in the shipped tree.** It was produced by an experiment that was then rolled back *because* the measurement showed it was worse. A register row describing code that does not exist would sit permanently open with nothing to close. Hazard note for the shell lane |
| the **`evidenceRoot()` instrument slip** — the first re-run wrote a 20 MB `apps/docs/v2-evidence/…` tree in the wrong place | `../L5-L6/README.md` §8.4 | an instrument defect **found and corrected inside its own batch**, no residual in the tree. Same handling 13.3 §9 and 13.6 `raw/residual-items.txt` gave their own instrument corrections. Its *class* is already registered as **GATE-13.1-07** |
| **two undiagnosed `test_production_readiness_metrics.py` failures** | `../L1-L4/README.md` §4 | **no cause was determined.** They sit inside a whole-tree failure count other lanes already own (`../L2-L3/README.md` §7 item 5). Registering each whole-tree failure individually turns the register into a test report |

The contrast is the point: **L2-L3's own filing *was* registered**, as GATE-13.6-03,
because it has a named mechanism, a fix, and a regression test proven to fail without the
fix — every property the three notes above lack.

---

## 2. Task 0.2's finding-count pin — 70 → 71, and why not 110

13.6 §2.1 recorded `test_v2_spec_shape_is_parsed` asserting **70** against a register
holding **71** (AUTH-07 arrived from task 2.1's disclosure-policy analysis after 0.2
froze the number), and deliberately left it, naming the right moment as *"when the
register is next edited"*. This is that edit.

`scripts/tests/test_validate_spec_governance.py:499` now asserts **71**, with the number's
whole history in the comment above it. Measured with the validator's **own** parser rather
than a second grep ([`raw/12`](raw/12-finding-count-pin.txt)):

```
validator's parsed finding_count           : 71
dotted GATE-13.x-nn rows in findings.md    : 39   <- L9's registrations
of which parsed as findings by the grammar : 0    <- GATE-13.6-04
documented register total                  : 71 parsed + 39 documental = 110
the pin asserts finding_count == 71 ;  parser agrees: True ;  is the pin 110? False
```

**The pin was not set to 110, and that is not an oversight.** `_FINDING_ROW_RE` at
`scripts/validate_spec_governance.py:91` is `^\|\s*([A-Z]{2,6}-\d+)\s*\|`, which a dotted
`GATE-13.1-01` does not match, so the 39 rows are invisible to the parser. 71 is what the
parser sees; 110 is what the register holds; setting the pin to 110 would make the
self-test fail and would assert a number the validator cannot produce. The gap between
those two sentences is **GATE-13.6-04** (§3.3).

---

## 3. What registration does, and does not do, mechanically

### 3.1 What is now true

Every Phase 13 GATE finding is in the register with an **owner requirement of record**, a
severity, an owning lane, and a state. A reader — or an auditor — asking *"is this finding
known, owned, and open?"* now gets an answer from `findings.md` itself. That is what
GATE-13.6-02 asked for, and it is why the register's own audit trail (13.6 §4's
`GATE findings present in findings.md: 0`) is no longer true of the tree.

### 3.2 What is still not true

R1.3 **rule 3** — *"a finding has no owner requirement"* — still neither confirms nor
denies ownership of these 39. `finding_count` remains **71**, rule 3 reports 0 unowned
over those 71, and the 39 are registered **documentally, not mechanically**. Anyone
reading §3.1 as *"rule 3 now covers these"* is reading it wrong, which is why the register
section says so in its own words and why this document repeats it.

### 3.3 Why GATE-13.6-04 was left open

The gap has a fix. It was not applied here, and the reason is authorisation, not effort.

Closing it means **two coordinated edits**:

1. widen the validator's id grammar (`_FINDING_ROW_RE` / `_FINDING_ID_RE`,
   `scripts/validate_spec_governance.py:89`, `:91`) to admit a dotted id; **and**
2. add these 39 ids to the matching `_Findings:` lines in `requirements.md`
   (`requirements.md:66`, `:97`, `:127`, …) so rule 3 has an owner to find.

Each alternative — doing one, or doing neither differently — is worse:

| alternative | what it costs |
|---|---|
| **rename the 39** into the existing grammar (`GATE13101`-style) | breaks **every reference to them** across Phase 13's evidence — 13.1 through 13.6 and four remediation READMEs — which is immutable under **R2.7**. A register that can only be read by editing history is not a register |
| **widen the grammar alone**, without the `requirements.md` edit | rule 3 fires **39 times** and the blocking CI gate (`.github/workflows/spec-governance.yml`) turns red. Trading one documented gap for a red gate on a spec that is already not closed makes the next reader's job harder, not easier |
| **do both** | correct — and it is a **requirements-ownership decision**. Assigning 39 findings to owner requirements inside `requirements.md` decides what each requirement is accountable for. Item L9's authorisation covers this register and task 0.2's count pin; it does not cover `requirements.md` |

So the gap is **named, owned (admissions-v2 governance), and open**, with the fix written
down for whoever holds `requirements.md`. That is the same discipline 13.6 applied to
GATE-13.6-01 and -02: file it rather than half-do it, and never make a gate green by
editing the thing that measures it.

---

## 4. L10 — the legacy registers now carry an owner and a removal date

Task 12.5's clause allows a remaining match only as *"canonical, test fixture, immutable
evidence, or a registered Legacy_Exception **with owner/removal date**"*. 13.6 §7 measured
4 of 7 registers with no per-entry owner and 6 of 7 with no removal date, filed
**GATE-13.6-01**, and refused to invent dates. 13.6 §7.1 part 2 item 3 then named the
cheapest real closure: *"`LEGACY_EXCEPTIONS` (9) and `PREVIEW_ALLOWLIST` (5) are
admissions-v2's own and can take `platform-admissions` + `2027-02-07` without inventing
anything"*. This is that item.

### 4.0 A sequencing correction, recorded rather than smoothed over

This matters for reading the register, so it is stated first rather than buried.

`findings.md`'s **GATE-13.6-01** row (`findings.md:292`) was written by this batch's
earlier pass and describes L10's outcome in the past tense. **The register edits it
describes were not in the tree.** The write-up pass re-ran 12.5's audit before writing
anything and measured the *pre-L10* shape still in place — `LEGACY_EXCEPTIONS 9 NO NO`,
`PREVIEW_ALLOWLIST 5 NO NO`, `SHIMS 6 yes NO`, four registers in `gaps`
([`raw/05b`](raw/05b-register-audit-recheck-before-L10.txt), the same reading as
[`raw/05`](raw/05-register-audit-before-L10.txt)), and `grep -rn "2027-02-07|platform-admissions"`
found nothing in any of the three files.

Two ways to reconcile a register row with a tree that does not match it: soften the row,
or make it true. The row was left alone and **the edits below were made**, so the register
now describes the tree. The alternative — an evidence README quietly presenting a claim it
could not measure — is the exact failure this spec's whole verification phase exists to
catch, and `raw/05b` is here so the sequence is on the record instead of implied.

### 4.1 What was dated, with what owner and date

| register | n | owner | removal date | where |
|---|---:|---|---|---|
| `architectureEnforcement.LEGACY_EXCEPTIONS` | **9** | `platform-admissions` | **2027-02-07** | `apps/admissions/tests/unit/architectureEnforcement.test.ts:65` (the `LegacyException` shape), `:82` (owner), `:94` (date), `:96` (the register) |
| `documentFlowDriftGuard.PREVIEW_ALLOWLIST` | **5** | `platform-admissions` | **2027-02-07** | `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts:105` (owner), `:115` (date), `:117` (the register) |
| `test_compatibility_surfaces_12_2.SHIMS` | **6** | *already per-entry* — each shim module's own `COMPATIBILITY_OWNER` marker, asserted by the guard | **2027-02-07** | `backend/tests/unit/test_compatibility_surfaces_12_2.py:230` (`SHIM_REMOVAL_DATE_SOURCE`), `:233` (`_announced_window_end`), `:331` (the per-shim assertion) |

**The date is not a new commitment.** `2027-02-07` is task 12.2's *existing* announced
window: `backend/apps/common/compatibility_register.py:118` (`ANNOUNCED_ON = "2026-08-11"`)
plus `:115` (`COMPATIBILITY_WINDOW_DAYS = 180`) — the same `_END_DATE_12_2` (`:121`) every
`COMPATIBILITY_SURFACES` entry already carries. 13.6 §7.1's whole objection to inventing a
date (*"a date invented by this task is a commitment nobody made"*) is respected by
reusing a window that was announced, published as an RFC 8594 `Sunset`, and owned.

- **`SHIMS` reads the date, it does not restate it**: `_announced_window_end()` returns
  `COMPATIBILITY_SURFACES["catalog.legacy_institution_write"].end_date`, so the backend has
  exactly one date.
- **TypeScript cannot import a Python module**, so both frontend registers spell the date
  as a literal — and a new guard pins those literals to the register
  (§4.4). Three spellings, one source of truth.

The audit's own metadata table was updated in the same edit
(`scripts/v1_surface_telemetry.py:2081`, `:2103`, `:2128`), because half 5b reports what
each register *declares*; leaving it stale would have produced a `NO` next to a register
that now has a date, which is a different lie in the same place.

### 4.2 What was deliberately **not** dated

| register | n | why not |
|---|---:|---|
| `module-size-report.DECLINED_REMOVALS` | 3 | **A *declined removal* is a decision not to delete.** A removal date would assert the opposite of the entry's own content: "we decided to keep this" plus "it goes away on 2027-02-07" cannot both be the register's meaning. It keeps its owner and its stale-decline check (`scripts/module-size-report.ts:497`, `:876`), which is the property that matters here — a decline that stops being true fails the scan |
| `canonical_tenant_drift_guard._ALLOWED_PREDICATES` | 11 | **not this spec's register.** 13.6 §7.1 part 2 item 4 places it with `beanola-production-readiness` / `multi-tenant-beanola` / system-alignment-audit and rules that it *"need[s] those specs' agreement"*. Writing `platform-admissions` next to 11 predicates this spec does not own would invent exactly the commitment §4.1 avoided. Its shrink + staleness check (`test_canonical_tenant_drift_guard.py::test_allowed_predicates_has_no_stale_entries_and_can_only_shrink`, added by 12.5) is untouched and still green in `raw/06` |
| `legacy-brand-allowlist.allowlist` | 19 | **not this spec's register** either — same three specs, same ruling. Staleness-checked by `test_brand_drift_guard.py` (Property 28, `beanola-production-readiness`); each entry already carries a classification and a stated reason. Untouched |

So **GATE-13.6-01 is `partly fixed`, not fixed**, and the register row says so. The
residual is 2 registers belonging to 2 other specs, plus one deliberate exemption with its
reasoning attached — which is a materially different residual from "4 registers nobody has
looked at".

### 4.3 Shrink-only and staleness-checked still hold

[`raw/06`](raw/06-register-audit-after-L10.txt), half 5b — the measurement item L10 needs,
run with the same invocation as `raw/05`:

```
   register                                           n  own  date  shrink  stale-chk
   compatibility_register.COMPATIBILITY_SURFACES      7  yes   yes     yes        yes
   module-size-report.DECLINED_REMOVALS               3  yes    NO     yes        yes
   architectureEnforcement.LEGACY_EXCEPTIONS          9  yes   yes     yes        yes
   canonical_tenant_drift_guard._ALLOWED_PREDICATES  11   NO    NO     yes        yes
   documentFlowDriftGuard.PREVIEW_ALLOWLIST           5  yes   yes     yes        yes
   legacy-brand-allowlist.allowlist                  19   NO    NO     yes        yes
   test_compatibility_surfaces_12_2.SHIMS             6  yes   yes     yes        yes
   broken (fails half 5)      : none
   gaps (reported, not failed): ['canonical_tenant_drift_guard._ALLOWED_PREDICATES',
                                 'legacy-brand-allowlist.allowlist']
   HALF 5b PASS=True
```

Three properties, each measured rather than asserted:

1. **Every entry count is unchanged** — 7 / 3 / **9** / 11 / **5** / 19 / **6**, identical
   to `raw/05`. Dating a register is not a licence to grow it, and the audit reads the
   counts from each register's own declaration
   ([`raw/15`](raw/15-compile-checks.txt) prints them via the audit's own
   `_count_register_entries`, where a `-1` or `-2` would mean a missing file or a broken
   anchor).
2. **`shrink` and `stale-chk` are `yes` for all seven.** `LEGACY_EXCEPTIONS` changed
   declaration (`string[]` → `readonly LegacyException[]`), so the audit's shape anchor
   moved with it (`scripts/v1_surface_telemetry.py:2159`) — and the count still reads 9,
   which is how you know the anchor is right rather than silently matching nothing.
3. **`broken: none`, `HALF 5b PASS=True`**, and the `gaps` list shrank from four registers
   to two.

Halves 1–3 still report `OVERALL PASS = True`; half 4 still reports `PASS=False`, which is
task **12.3's** source-only legacy-column measurement (`sunset date declared: 2026-08-15`,
1 day remaining) and is **unchanged by this batch** — it was already `False` in `raw/05`
and in 13.6's own run.

### 4.4 The date has a mechanism, and the mechanism discriminates

A date nothing evaluates is decoration. Half 5b's own definition is the standard —
*"an entry with no owner, no date, no named measurement, or no mechanism that fails when
it STOPS being a violation is an exemption, not an exception"* — so each dated register
got the missing half:

| guard | fails when |
|---|---|
| `architectureEnforcement.test.ts:277` — *"every allowlist entry carries an owner and an unexpired removal date"* | an entry has no owner, a non-ISO date, or a window that has closed |
| `documentFlowDriftGuard.test.ts:315` — same, for the 5 preview modules | as above |
| `test_compatibility_surfaces_12_2.py:331`, inside the existing per-shim parametrised test | the announced window has closed, per shim |
| `test_compatibility_surfaces_12_2.py:381` — `test_frontend_register_windows_match_the_canonical_register` | either frontend literal drifts from `COMPATIBILITY_SURFACES`' `end_date` |

Both suites are green ([`raw/08`](raw/08-frontend-register-guards.txt): 2 files, **9 tests
passed** — up from 7, one new case each; [`raw/09`](raw/09-shims-register-guard.txt): **16
passed** — up from 14, the two parity cases).

And the last guard was **proven to discriminate** rather than assumed to
([`raw/10`](raw/10-date-guard-discriminates.txt)): flipping
`LEGACY_EXCEPTION_REMOVE_BY` to `2027-08-07` fails it with

```
apps/admissions/tests/unit/architectureEnforcement.test.ts: LEGACY_EXCEPTION_REMOVE_BY
announces 2027-08-07, but compatibility_register.COMPATIBILITY_SURFACES
['catalog.legacy_institution_write'].end_date announces 2027-02-07.
```

then the file was restored and verified byte-identical by sha256
(`17649b53689bdd6d…` before and after).

**One consequence, stated plainly because it is a deliberate future failure.** These
guards fail **after 2027-02-07**. That is what an announced end date means: when the window
closes, keeping the exemption becomes a decision someone makes, not a default. The failure
message names both options — remove the entry, or announce a new window in
`compatibility_register.py` on purpose.

### 4.5 The hit count moved 847 → 874, and it is entirely L10's own files

Category 13 (`surfaced_by_the_twelve`) moved 109 → 136; every other category is byte-identical.
The audit greps for the register symbols themselves, so adding owner/date lines to registers
necessarily adds hits to the category that watches registers. Attribution, by file:

| file | hits before | after | Δ |
|---|---:|---:|---:|
| `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts` | 10 | 26 | +16 |
| `backend/tests/unit/test_compatibility_surfaces_12_2.py` | 9 | 14 | +5 |
| `apps/admissions/tests/unit/architectureEnforcement.test.ts` | 7 | 11 | +4 |
| `scripts/v1_surface_telemetry.py` | 31 | 33 | +2 |
| **every other file in all 13 categories** | — | — | **0** |

The new hits bucket as `test-fixture` (+21) and `comment` (+6). **`UNREGISTERED` is 0
before and after**, `canonical` and `registered-exception` are unchanged, and no test pins
the total (`grep -rn '\b847\b'` over `backend/tests`, `apps/admissions/tests`, `scripts`
returns nothing), so the delta breaks no gate. It is reported rather than glossed because
13.6 §10 item 11 set that precedent for the 838 → 847 move.

---

## 5. L11 — tasks 4.1 and 7.4 have evidence directories

### 5.1 What the two packs contain

| | `docs/v2-evidence/4.1/` | `docs/v2-evidence/7.4/` |
|---|---|---|
| `README.md` | 152 lines | 117 lines |
| `raw/` | `01-named-instruments.txt` | `01-named-instrument.txt`, `02-grep-import-probe.txt` |
| `_Evidence:` descriptor | *service/integration tests for every state, retry, and compensation* | *grep/import/runtime network guard proving zero admissions AI calls* |
| instruments run | `tests/unit/test_tenant_onboarding_service.py` (23), `tests/integration/test_tenant_onboarding_workflow.py` (22), `tests/unit/test_scenario_super_admin_onboarding.py` (1) | `tests/unit/test_no_admissions_generative_ai_guard.py` |
| result | **46 passed**, 0 failed, 0 skipped, 0 errors | **18 passed**, 0 failed, 0 skipped, 0 errors |
| re-run by the write-up pass | **46 passed** in 6.15 s | **18 passed** in 1.58 s |

Both packs read the descriptor word by word and show which cases answer it — 4.1's
`state` / `retry` / `compensation` against the onboarding state machine, the
idempotent-replay cases, and `test_begin_compensates_leaving_no_orphan_on_duplicate_code`
(finding TEN-01's core claim); 7.4's `grep` / `import` / `runtime` against the settings
object and the live URLconf, **plus** the row that makes it a boundary rather than a
deletion: the guard also fails if the jobs-ops service or the server-side OCR dependencies
disappear, because isolation proven by deleting the other product is not isolation.

The figures agree three ways: 13.6 §6.1 measured 46 and 18 during its audit, L11's own
runs measured 46 and 18 at 05:03Z / 05:04Z, and this pass re-ran both
([`raw/19`](raw/19-l11-instruments-recheck.txt)) and measured 46 and 18 again. All three
used the isolated local test stack (`backend/.env.local.test` via
`.localtest-host-env.sh`), never `backend/.env`, so no Neon DSN was in the process.

### 5.2 Both are labelled **retrospective records**, and that label is the point

Each README opens with a banner: *"THIS IS A RETROSPECTIVE EVIDENCE PACK — created
2026-08-14, during task 13.6's remediation batch L9-L11 … It records one run, made on
2026-08-14 … It is not a contemporaneous record of Phase 4 [Phase 7] and does not claim to
be one."*

That distinction is not decoration, and it is why 13.6 refused to create these directories
itself:

> *"the 46 and 18 passes above are 13.6's audit record, in 13.6's own directory, not a
> retroactive evidence pack authored on another task's behalf. Fabricating one would be the
> precise failure **GOV-02** describes."* — 13.6 §6.1

**A directory written by the closure audit on another task's behalf is the shape of
GOV-02** — evidence that exists because a gate needed it, describing work the author did
not watch. 13.6 §12 item 2 named the correct route instead: *"have those two lanes record
their own runs"*, and scheduled it as L11. So these packs record **their own run, on their
own date, labelled as such**, and each says explicitly what it cannot prove: not that the
instruments were green in Phase 4 or Phase 7, and not that findings TEN-01/TEN-02 or
STU-06/MAINT-02 are closed.

What the packs *do* buy is the thing B10 asked for: R1.3 rule 1 is a statement about a
**linked run record**, and there now is one. The claims always held; the evidence links
did not.

### 5.3 Two stale references now resolve, and one pre-existing flag is answered

[`raw/07`](raw/07-stale-reference-check.txt):

| reference | before | after |
|---|---|---|
| `docs/ai-data-flows.md:14` — *"`docs/audits/ai-and-ocr-final.md` and in `docs/v2-evidence/7.4/` – `7.5/`"* | dangling | **resolves** (3 non-empty files) |
| `docs/ai-data-flows.md:178` — *"`docs/v2-evidence/7.4/`, `docs/v2-evidence/7.5/`, `docs/v2-evidence/9.4/`"* | dangling | **resolves** |
| `docs/v2-evidence/7.2/README.md:244` — *"1 error — **pre-existing and unrelated**: task **4.1** is checked with no `docs/v2-evidence/4.1`"* | a task flagging another task's gap, unfixed since | **answered** — 4.1 now exists with 2 non-empty files |

**Neither `ai-data-flows.md` line was edited.** They were already correct about where the
evidence *should* live; the fix was to make that true rather than to soften the claim. The
non-empty check in `raw/07` applies the exact rule the validator applies
(`scripts/validate_spec_governance.py::_dir_has_content`), so "resolves" means what the
gate means by it.

---

## 6. Verification

### 6.1 The gates this batch exists to move

| instrument | result | raw |
|---|---|---|
| `python3 scripts/validate_spec_governance.py` | `Errors: 0  Warnings: 0` · `[admissions-v2-canonical-rebuild] status=planned reqs=18 findings=71 tasks=73 (checked=71)` · `RESULT: PASS` · **EXIT=0** | [`02`](raw/02-spec-validator-after-L11.txt), [`11`](raw/11-validators-after-L10.txt) |
| `python3 -m unittest scripts.tests.test_validate_spec_governance -v` | **Ran 20 tests — OK** | [`03`](raw/03-spec-validator-selftests-after.txt), [`11`](raw/11-validators-after-L10.txt) |
| `python3 scripts/validate_spec_metadata.py` | `Errors: 0  Warnings: 2` (both on *other* specs: one missing `.config.kiro`, one missing id field) · `RESULT: PASS` · **EXIT=0** — measured twice, before and after L10 | [`04`](raw/04-metadata-validator.txt), [`11`](raw/11-validators-after-L10.txt) |
| its 9 self-tests (task 0.1) | **Ran 9 tests — OK**, including `test_admissions_v2_spec_is_registered_and_unique` and the GOV-03 closure guard. Run in `raw/04` only; `raw/11` re-ran the repo scan, not the self-tests | [`04`](raw/04-metadata-validator.txt) |
| `backend/.venv/bin/python3 scripts/v1_surface_telemetry.py` | 13 categories · 874 hits · **UNREGISTERED 0** · `guards named but missing: none` · HALF 5 PASS · **HALF 5b PASS** · halves 1–3 `OVERALL PASS=True` · half 4 `PASS=False` (12.3's, pre-existing) | [`06`](raw/06-register-audit-after-L10.txt) |
| the three dated registers' guards | frontend **9 passed** (2 files) · backend **16 passed** · the date-parity guard **fails on drift** and the probe file was restored byte-identically | [`08`](raw/08-frontend-register-guards.txt), [`09`](raw/09-shims-register-guard.txt), [`10`](raw/10-date-guard-discriminates.txt) |
| L11's named instruments | **46 passed** · **18 passed** | [`19`](raw/19-l11-instruments-recheck.txt) |
| the count pin | pin `71` = parser `71`; 39 dotted rows documental; register holds 110 | [`12`](raw/12-finding-count-pin.txt) |

`raw/02`–`raw/04` were taken before L10's four edits. Rather than argue that a test-file
and telemetry-script edit cannot move a spec validator, both validators were **re-run
after L10** ([`raw/11`](raw/11-validators-after-L10.txt)): exit 0, 20/20, `RESULT: PASS`.

### 6.2 Whole tree — this batch's own runs

| suite | this batch | prior | delta |
|---|---|---|---|
| **frontend** `bun run test` | **1 failed / 4618 passed / 1 skipped** over **495 files** ([`17`](raw/17-frontend-whole-suite-after.txt)) | 1 failed / 4616 passed / 1 skipped over 495 files (`../L5-L6/raw/01-frontend-test-after.txt`) | **+2 passed** — L10's two new register cases. The 1 failure is the same pre-existing `authPageFormMarkup.test.tsx` (13.6 §9.2, another lane's) |
| **backend** `pytest tests/ -q`, serial | **94 failed / 5239 passed / 103 skipped / 2 xfailed / 1 xpassed / 1 error** in 607.95 s ([`18`](raw/18-backend-whole-tree-after.txt)) | 94 failed / 5237 passed / 103 skipped / 2 xfailed / 1 xpassed / 1 error (`../L2-L3/raw/16-backend-whole-tree-after.txt`) | **+2 passed** — L10's two parity cases. **Failures unchanged at 94, error unchanged at 1** |
| **lint** `bun run lint` | **15 errors / 13 files** ([`14`](raw/14-frontend-lint.txt)) | 15 errors / 13 files (`../L5-L6/raw/12-frontend-lint.txt`) | **identical** — same 15 errors in the same 13 files, verified file by file. That baseline is **L12's**, untouched |
| **type-check** `bun run type-check` | **EXIT=0** ([`13`](raw/13-frontend-type-check.txt)) | exit 0 (`../L5-L6/raw/13-type-check.txt`) | unchanged |
| **compile** | `py_compile` clean on both edited Python files ([`15`](raw/15-compile-checks.txt)) | — | — |

The **94 backend failures and the 1 error are other lanes'** — the population `../L2-L3`
§7 and 13.6 §9.2 attribute — and none was fixed, added, or re-diagnosed here. The `-q -rs`
invocation (deliberately the same as L1-L4 and L2-L3, so the numbers are comparable) does
not print per-test failure identities, so what is claimed is the **aggregate**: the count
did not move, and the two extra passes are this batch's two new cases.

The harness (Playwright) was **not run**: nothing in this batch touches a rendered surface.

---

## 7. What is NOT claimed

1. **The spec is not closed, and this document does not close it.** No `"status":
   "completed"` was written; `tasks.md:742` still reads `- [-] 13.6` and `:732` still reads
   `- [~] 13.5`, exactly as this batch found them; the gate 13.6 measured is still 2 PASS /
   3 FAIL, and B1, B2, B3 remain open.
2. **`tasks.md` was not touched.** No checkbox moved — not 13.6's, not 4.1's, not 7.4's,
   not 12.5's. Task 12.5 is still `[x]` on a clause it self-reported as unmet for two
   registers; that is §4.2's residual, not a tick this batch removed.
3. **`.config.kiro` was not touched** — spec status is still `planned`.
4. **`docs/canonical-truth-map.md` was not touched.** L9–L11 introduce no domain concept,
   no route, no capability, no enum.
5. **Production was never contacted** — no SSH, no `.pem` read, no query, no write, no
   deploy, no restart, no migration.
6. **Neon was not touched at all** — no branch created, read, or reset; no session on
   `v2_snap_13_4`, `v2_fresh_13_4`, `v2_batch_13_4` or `v2_snap_13_6`. Every test run used
   the isolated local stack (`127.0.0.1:5433` / `:6380`).
7. **No register belonging to another spec was dated.** `_ALLOWED_PREDICATES` (11) and
   `legacy-brand-allowlist.allowlist` (19) are untouched, and `DECLINED_REMOVALS` is
   deliberately undated (§4.2).
8. **GATE-13.6-04 is open**, filed here, with the fix written down and *not* applied
   (§3.3). Rule 3 does not mechanically cover the 39.
9. **The 39 registered findings' states are carried from their filing tasks**, and the
   fixes were measured by 13.4, 13.5 and the four remediation batches — **not re-measured
   here**. This batch measured no touch target, no CLS, no migration, no tenant read.
10. **No severity was re-adjudicated.** `high`/`med`/`low` are the filing tasks' own words,
    and no `high` was promoted to a P0 (§1.2).
11. **No other lane's failure was fixed**: not the 94 backend failures, not the 1 setup
    error, not `authPageFormMarkup.test.tsx`, not the 15 lint errors (L12), not L7 or L8.
12. **4.1's and 7.4's packs do not close their findings** (TEN-01, TEN-02, STU-06,
    MAINT-02) and are not contemporaneous. §5.2.
13. **"Zero admissions AI calls" remains a static + settings + URLconf claim**, as 7.4's
    pack says — not a packet capture.
14. **The 2027-02-07 window is 12.2's, not a new promise**, and nothing in the platform
    removes anything on that date; the guards make the date *evaluable*, not automatic.
15. **Nothing was committed or staged.**

---

## 8. State left behind

### 8.1 Changed files — 11 (6 edited, 5 new), plus this evidence directory

**L9 — the register and its count pin (2):**

| file | change |
|---|---|
| `.kiro/specs/admissions-v2-canonical-rebuild/findings.md` | **new final section** at `:169` — 39 findings in 6 tables, the id-collision paragraph, the 3 notes-not-findings, and the mechanical caveat. No existing row was edited |
| `scripts/tests/test_validate_spec_governance.py` | the finding-count pin `70` → **71** at `:499`, with the number's full history in the comment above it |

**L10 — the registers and the audit's own metadata (4):**

| file | change |
|---|---|
| `apps/admissions/tests/unit/architectureEnforcement.test.ts` | `LEGACY_EXCEPTIONS`: `string[]` → `readonly LegacyException[]` with a per-entry `owner` + `removeBy`; both existing consumers read `.path`; **one new test** (owner + unexpired ISO date). 9 entries, unchanged |
| `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts` | `AllowlistEntry` gains `owner` + `removeBy`; all 5 entries carry both; **one new test**. 5 entries, unchanged |
| `backend/tests/unit/test_compatibility_surfaces_12_2.py` | `SHIM_REMOVAL_DATE_SOURCE` + `_announced_window_end()` reading the canonical `end_date`; a window assertion inside the existing per-shim test; **one new parametrised test** pinning both frontend literals to the register. 6 entries, unchanged |
| `scripts/v1_surface_telemetry.py` | `_REGISTERS`: `owner_field`/`date_field` for the three dated registers; `_REGISTER_SHAPES`: `LEGACY_EXCEPTIONS`' anchor and per-entry pattern follow its new declaration |

**L11 — two evidence packs (5 files, all new):**

`docs/v2-evidence/4.1/README.md`, `4.1/raw/01-named-instruments.txt`,
`docs/v2-evidence/7.4/README.md`, `7.4/raw/01-named-instrument.txt`,
`7.4/raw/02-grep-import-probe.txt`.

**This batch's own evidence:** `docs/v2-evidence/13.6/remediation/L9-L11/README.md` +
20 raw artifacts.

No production code. No schema, no migration, no SQL script, no settings module, no CI
workflow, no dependency, no design token, no frontend or backend source file outside
`tests/`.

### 8.2 Untouched

| item | state |
|---|---|
| `tasks.md`, `.config.kiro`, `docs/canonical-truth-map.md` | **unchanged** |
| `docs/v2-evidence/13.6/README.md` and its §8.1 rows | **unchanged** — L9/L10/L11 are not ticked off there; that is the next pass's call |
| every other task's `docs/v2-evidence/**` | **read, never written**. 4.1/ and 7.4/ are new directories for tasks that had none, created as L11 scheduled and labelled retrospective (§5.2) |
| `docs/ai-data-flows.md`, `docs/v2-evidence/7.2/README.md` | **read, not edited** — their references were made true instead (§5.3) |
| `requirements.md` | **unchanged** — the `_Findings:` edit GATE-13.6-04 needs is not this item's to make (§3.3) |
| `scripts/validate_spec_governance.py` | **unchanged** — only its self-test's pin moved. The gate itself was not edited to make itself pass |
| `backend/apps/common/compatibility_register.py`, `scripts/module-size-report.ts`, `backend/tests/unit/test_canonical_tenant_drift_guard.py`, `docs/legacy-brand-allowlist.json` | **unchanged** — §4.2 |
| production Postgres / EC2 · Neon (any branch) · the four scratch databases | **never contacted** |
| local `mihas-localtest` Postgres (5433) + Redis (6380) | used for the backend runs, already up from the earlier batches; left running, no volume touched |
| secrets | no DSN, password, token or key appears in this directory |

### 8.3 Git

**Nothing committed. Nothing staged by this batch.** Branch `main` at `bae29a28d` with the
V2 tree dirty, as 13.6 §11 left it ([`raw/16`](raw/16-git-state.txt)). The index still
carries the **9 pre-existing staged deletions** from the de-AI work (tasks 7.4 / 12.4),
staged before this batch and untouched. `findings.md`, both dated frontend registers'
files, the backend test, `scripts/v1_surface_telemetry.py`,
`scripts/tests/test_validate_spec_governance.py`, `docs/v2-evidence/4.1/`, `7.4/` and this
directory are **untracked or unstaged**; `git add` was not run.

---

## 9. For 13.6's next pass

**Closed outright:**

| item | why |
|---|---|
| **B10** — tasks 4.1 and 7.4 `[x]` with no evidence directory | §5. Both directories exist with a run record; **the blocking validator is green** — exit 0, 0 errors, 0 warnings, and its 20 self-tests pass (`raw/02`, `raw/03`, `raw/11`). This was the item 13.6 §12 called *"the single cheapest thing that turns the blocking validator green"* and also *"the one most tempting to fake"*; §5.2 is how it was not faked |
| **GATE-13.6-02** — Phase 13's findings absent from the register | §1. 39 registered with severity, statement, owner requirement, owning lane and state. The *mechanical* half is now its own named finding |

**Partly closed:**

| item | residual |
|---|---|
| **B11** / **GATE-13.6-01** | §4. The 3 registers admissions-v2 owns now carry an owner **and** a removal date, with guards that evaluate both. Residual: `_ALLOWED_PREDICATES` (11) and `legacy-brand-allowlist.allowlist` (19) need **their owning specs'** agreement — `beanola-production-readiness` / `multi-tenant-beanola` / system-alignment-audit — and `DECLINED_REMOVALS` (3) is **deliberately exempt** from a date, with the reason recorded. The register row says `partly fixed`, not `fixed` |

**Handed forward as a named follow-up:**

1. **GATE-13.6-04** (`findings.md:295`) — widen the validator's finding-id grammar **and**
   add the 39 ids to `requirements.md`'s `_Findings:` lines, **in one edit**. Widening
   alone turns the blocking CI gate red with 39 unowned findings; renaming the 39 breaks
   Phase 13's immutable evidence. Owner: whoever holds `requirements.md`. §3.3 has the
   argument and the two file:line targets.
2. **The 2027-02-07 window is now evaluated**, so it will eventually fail on purpose. When
   it does, the four guards in §4.4 name both legitimate answers: remove the entries, or
   announce a new window in `compatibility_register.py`.

**Not touched, and not claimed:** **B1** (13.5 never executed — operator), **B2**
(`sign-off.md` unsigned — operator + a second reviewer), **B3** (GATE-13.5-05, the
hostname question — and 13.6 §12 item 3 is right that it is first, because it costs one
answer and every HTTP check depends on it). **B4**/**B9** were closed by L1-L4,
**B5**/**B6** by L2-L3, **B7**/**B8** by L5-L6. **L7** (the 19 brand-neutral fallback
templates), **L8** (the three instruments writing into `docs/v2-evidence/**`, GATE-13.1-07)
and **L12** (the 15 lint errors) belong to other batches and were left alone.

One generalisation, earned here rather than borrowed. **A register row is a claim, and a
claim needs the same treatment as a checkbox.** `findings.md` already said L10 had given
three registers an owner and a date; the tree said otherwise (§4.0). The register was
right about what *should* be true and was written before it was — which is precisely the
failure mode this whole spec has been chasing under a different name: *a checkbox is a
statement about a task, and a finding is closed when the behaviour is fixed* (13.6 §3.2).
The fix was to make the tree match and to leave the sequence on the record, so the next
reader can check the claim instead of trusting it. `raw/05b` and `raw/06` are that check.
