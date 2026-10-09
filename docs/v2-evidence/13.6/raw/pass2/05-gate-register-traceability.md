# Task 13.6 second pass (O10) — the second finding population: Phase 13's GATE findings

DATE: 2026-08-14T19:24:02Z
CMD : python3 docs/v2-evidence/13.6/raw/pass2/gate-register-traceability.py

Run **after** this pass's own `findings.md` state updates (GATE-13.4-01, GATE-13.1-07,
the contradiction table and the two upward restatements).

## D. The 39 Phase 13 GATE findings, as the register now holds them

Source: `.kiro/specs/admissions-v2-canonical-rebuild/findings.md`, section
*Phase 13 Verification Findings (Task 13.6 Remediation, Item L9)*.

| GATE finding | sev | state (bucketed) | owner requirement(s) | state cell, verbatim |
|---|---|---|---|---|
| GATE-13.1-01 | med | fixed | R15 (R15.4) | **fixed** — `docs/v2-evidence/13.4/README.md` §5 |
| GATE-13.1-02 | high | fixed | R1 (GOV-04), R18 (R18.3) | **fixed** — `docs/v2-evidence/13.6/README.md` §5. Closed as a *measurement hole*: it uncovered 36 genuine failures, which `docs/v2-evidence/13.6/remediation/L1-L4/README.md` §3 then fixed (91 passed / 0 failed) |
| GATE-13.1-03 | med | open | R14, R1 (GOV-05) | **open** |
| GATE-13.1-04 | med | open | R8, R17 (R17.1) | **open**. See the id-collision note below — 13.4/13.5/13.6 used this id for a different defect, now registered as GATE-13.1-08 |
| GATE-13.1-05 | low | open | R15 (R15.2, R15.8), R14 | **open**, and the migration-report half **grew** from 3 to 5 omitted scripts (`.../L2-L3/README.md` §6.2) |
| GATE-13.1-06 | low | fixed | R15 (R15.1) | **fixed** — `docs/v2-evidence/13.4/README.md` §6.1. The script was wrong, not the requirement |
| GATE-13.1-07 | med | fixed | R1 (GOV-04), R18 (R18.5) | **fixed** — `.../L7-L8-L12/README.md` §5. **4 of 4** mechanisms closed. Three defaulted harness runs and two defaulted whole-tree pytest runs left `0.4/playwright-report.json` (`85799ced60e970fe…`), `2.2/authority-conformance-summary.json` (`db5f2873c2049152…`), `11.1`–`11.5/screenshots/` (7/10/10/16/20) and `13.3/` (296 files) **byte-identical**, while the runs' own 53 + 1 artifacts landed run-scoped. Deliberate regeneration is one env var (`V2_EVIDENCE_TASK_DIRS=1`); a 39-case cross-language guard fails on a restored hard-coded literal. Narrowed first by `.../L5-L6/README.md` §8.4 |
| GATE-13.1-08 | med | open — accepted with reasoning | R15 (R15.1, R15.8) | **open — accepted with reasoning**: `docs/v2-evidence/13.5/README.md` §4 accepts it as unfixable by re-running anything and permanently non-clean on 13.4 gate 10, to be carried as a named exception on the sign-off rather than as a failure |
| GATE-13.2-01 | high | fixed | R7 (DATA-01), R15, R10 (STU-01) | **fixed** — `.../L1-L4/README.md` §2. Five sites resolve by canonical id and fail closed when it is absent; a 7-test two-tenant reproduction is green |
| GATE-13.2-02 | med | open | R7 (R7.x capacity) | **open** |
| GATE-13.2-03 | med | open | R10 (STU-02) | **open** |
| GATE-13.3-01 | high | fixed | R16 (R16.2) | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-02 | high | fixed | R16 (R16.1, R16.2) | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-03 | high | fixed | R16 (R16.2) | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-04 | med | fixed | R16 (R16.2) | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-05 | med | fixed | R16 (R16.2) | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-06 | low | fixed | R16 (R16.2) | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-07 | med | fixed | R16 (R16.7), R17 (R17.6) | **fixed** — `.../L5-L6/README.md` §3 (0.0406 / 0.0357) |
| GATE-13.3-08 | med | fixed | R16 (R16.2) | **fixed** — `.../L5-L6/README.md` §4.1 |
| GATE-13.3-09 | high | fixed | R13 (R13.1, R13.13), R16 | **fixed** — `.../L5-L6/README.md` §1. Register finding **STU-23** is no longer contradicted |
| GATE-13.3-10 | high | fixed | R16 (R16.8) | **fixed** — `.../L5-L6/README.md` §6.1, with a named residual: a route whose lazy chunk cannot be fetched cannot be kept mounted without a service worker the platform deliberately does not ship |
| GATE-13.3-11 | high | fixed | R16 (R16.1, R16.2) | **fixed** — `.../L5-L6/README.md` §2, §8.3 (axe `link-name` 16 nodes → 0) |
| GATE-13.3-12 | med | fixed | R16 (R16.2, R16.4) | **fixed** — `.../L5-L6/README.md` §4.2 (24 nodes → 0) |
| GATE-13.3-13 | high | open — one half fixed | R15 (R15.2, R15.3), R10 | **open — one half fixed.** The production-lineage half (`varchar(50)` → the model's widths) is closed by `.../L2-L3/README.md` §3. This row's own 113-character input still 500s against `Application.intake`'s `max_length=100`, re-measured in `.../L5-L6/README.md` §7. Closing it needs a model change **plus** a matching widen |
| GATE-13.3-14 | med | fixed | R16 (R16.4) | **fixed** — `.../L5-L6/README.md` §4.3 (11 of 11 in the browser) |
| GATE-13.3-15 | med | fixed | R16 (R16.2) | **fixed** — `.../L5-L6/README.md` §4.4 |
| GATE-13.3-16 | high | fixed | R16 (R16.3, R16.5, R16.7) | **fixed** — `.../L5-L6/README.md` §5 (0 %, 44–47 px clear, both profiles) |
| GATE-13.4-01 | high | fixed on the rehearsal lineage (NOT applied to production) | R2 (TEN-09), R5 (templates) | **fixed on the rehearsal lineage** — `.../L7-L8-L12/README.md` §1–§4. 13.4 `invariants.sql` **gate 19 PASSES** on `v2_snap_13_6` (33 templates / 33 platform fallbacks / **0** legacy-branded, was 33/33/**31**); an end-to-end render probe over 33 template keys and 8 `render_message` types carries a legacy brand **0** times where the reproduced pre-L7 text carries it **81** times across 31 keys; idempotent, boot-gate-clean, R9.2-paired. **Not applied to production** — that is operator step O9's sibling, backup-first. The 12 rows of unknown origin have no explained source; gate 19 catches recurrences |
| GATE-13.4-02 | high | fixed | R15 (R15.1, R15.7) | **fixed** — `.../L2-L3/README.md` §1–2. Preflight gate 22 reads PASS, the sweep completes 24/24, the second run is a clean no-op, the boot gate exits 0 under `--strict`. It was **two** defects; the second is GATE-13.6-03 |
| GATE-13.4-03 | med | fixed | R18 (R18.5, R18.7) | **fixed** — `docs/v2-evidence/13.5/README.md` §1 |
| GATE-13.5-01 | high | fixed | R15 (R15.2, R15.3) | **fixed** — `.../L2-L3/README.md` §3. Width probe 3 narrower → 0; the long-value reproduction 4 failing writes → 0, including the ORM's own `create` |
| GATE-13.5-02 | high | fixed | R7 (DATA-01), R15, R10 (STU-01) | **fixed** — `.../L1-L4/README.md` §2. Preflight gate 21's *data* half (3 shared names) is untouched and is the tenancy lane's |
| GATE-13.5-03 | high | open — accepted with reasoning | R5 (domains), R18 (R18.7) | **open — accepted with reasoning**: `docs/v2-evidence/13.5/README.md` §4 redefines the canary as **tenant activation** rather than a host, and keeps the finding because R17's wording implies a capability the stack does not have |
| GATE-13.5-04 | med | open | R18 (R18.7) | **open — operator step O2** (13.6 §8.2) |
| GATE-13.5-05 | med | open | R2 (R2.x identity), R18 (R18.7) | **open — operator step O1, first to resolve.** Until it is settled every HTTP check in the post-deploy proof aims at a possibly-wrong host |
| GATE-13.6-01 | med | partly fixed | R1 (R1.3), R15 (R15.6) | **partly fixed** — `.../L9-L11/README.md` §4 gave `architectureEnforcement.LEGACY_EXCEPTIONS` (9) and `documentFlowDriftGuard.PREVIEW_ALLOWLIST` (5) a per-entry owner **and** removal date and `test_compatibility_surfaces_12_2.SHIMS` (6) a removal date, on the register's existing `2027-02-07` window. **`module-size-report.DECLINED_REMOVALS` is deliberately left undated** (a *declined removal* is a decision not to delete; a removal date would assert the opposite), and **`_ALLOWED_PREDICATES` (11) and `legacy-brand-allowlist` (19) are left to their owning specs** |
| GATE-13.6-02 | med | fixed | R1 (R1.3) | **fixed for registration** — this section registers **39**, each with a severity, a one-line statement, an owner requirement, an owning lane and a state. The *mechanical* half of rule 3 remains open as **GATE-13.6-04** |
| GATE-13.6-03 | high | fixed | R15 (R15.1) | **fixed** — `.../L2-L3/README.md` §1.4, in the runner (`_set_constraints_immediate`), not in the SQL, with a 3-case regression test proven to discriminate |
| GATE-13.6-04 | med | open | R1 (R1.3) | **open.** The fix is two coordinated edits: widen the validator's id grammar to admit a dotted id, **and** add these ids to the matching `_Findings:` lines in `requirements.md` so rule 3 has an owner to find. Doing only the first turns the CI gate red with 39 unowned findings. Item L9 did neither, because widening a validator's grammar and reassigning requirement ownership are both decisions for the requirements author, not side effects of a register edit. See `.../L9-L11/README.md` §3.3 |

Registered Phase 13 GATE findings: **39**

| state | n | which |
|---|---:|---|
| fixed | 26 | GATE-13.1-01, GATE-13.1-02, GATE-13.1-06, GATE-13.1-07, GATE-13.2-01, GATE-13.3-01, GATE-13.3-02, GATE-13.3-03, GATE-13.3-04, GATE-13.3-05, GATE-13.3-06, GATE-13.3-07, GATE-13.3-08, GATE-13.3-09, GATE-13.3-10, GATE-13.3-11, GATE-13.3-12, GATE-13.3-14, GATE-13.3-15, GATE-13.3-16, GATE-13.4-02, GATE-13.4-03, GATE-13.5-01, GATE-13.5-02, GATE-13.6-02, GATE-13.6-03 |
| open | 8 | GATE-13.1-03, GATE-13.1-04, GATE-13.1-05, GATE-13.2-02, GATE-13.2-03, GATE-13.5-04, GATE-13.5-05, GATE-13.6-04 |
| open — accepted with reasoning | 2 | GATE-13.1-08, GATE-13.5-03 |
| fixed on the rehearsal lineage (NOT applied to production) | 1 | GATE-13.4-01 |
| open — one half fixed | 1 | GATE-13.3-13 |
| partly fixed | 1 | GATE-13.6-01 |

| severity | n |
|---|---:|
| high | 16 |
| med | 20 |
| low | 3 |

Rows with no owner requirement of record: **0** -> none
Rows NOT in a plain `fixed` state: **12**
`high` rows not in a plain `fixed` state: **3** -> GATE-13.3-13, GATE-13.4-01, GATE-13.5-03
State cells this script could not bucket: **0** -> none

## D2. Cross-check: mentioned in evidence vs registered

READMEs scanned: **12** -> 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.6/remediation/L1-L4, 13.6/remediation/L12, 13.6/remediation/L2-L3, 13.6/remediation/L5-L6, 13.6/remediation/L7-L8-L12, 13.6/remediation/L9-L11
Distinct GATE ids mentioned in Phase 13 + remediation evidence: **39**
Distinct GATE ids registered in findings.md: **39**
Mentioned but NOT registered: **0** -> none
Registered but not mentioned in any README scanned: **0** -> none

## D3. GATE-13.6-04, demonstrated rather than asserted

```
validator module              : scripts/validate_spec_governance.py
_FINDING_ROW_RE              : ^\|\s*([A-Z]{2,6}-\d+)\s*\|
_FINDING_ID_RE               : (?<![A-Za-z0-9])([A-Z]{2,6}-\d+)(?![0-9A-Za-z])
vsg.parse_findings() count   : 71      <- 'finding_count' the gate prints
dotted rows the grammar parses: 0 of 39
dotted ids owned by a requirement `_Findings:` line: 0 of 39
register total, documented   : 71 parsed + 39 documental = 110
```

So the 39 rows are registered **documentally**: a reader gets an answer from
`findings.md`, and R1.3 rule 3 still cannot fire over any of them. That gap is
GATE-13.6-04, open by design (`.../L9-L11/README.md` §3.3) — closing it needs the
grammar widened **and** `requirements.md`'s `_Findings:` lines extended in one edit,
which is the requirements author's call, not a closure audit's.
