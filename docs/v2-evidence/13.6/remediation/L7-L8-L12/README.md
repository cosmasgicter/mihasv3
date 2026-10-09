# Task 13.6 remediation — L7 and L8

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · remediation items **L7** and **L8**
of [`docs/v2-evidence/13.6/README.md`](../../README.md) §8.1

Requirements: **R14.1–R14.5** — tenant-aware template resolution (institution row →
Beanola platform row → safe Beanola default); **R14.7–R14.8** — a value the tenant does
not supply falls back to a Beanola platform default, never to a school identity;
**R15.3–R15.4** — additive, no rewrite; **R9.2** — every forward script has a
rollback-safe pair; **R18.7** — rehearsed before it reaches production; **R2.7** — an
evidence artifact is immutable; **R18.5** — an evidence artifact is a run record, not a
claim

Findings: **GATE-13.4-01** (high) and register finding **TEN-09** (P1) for L7;
**GATE-13.1-07** (med) and register finding **GOV-04** (P0) for L8

Closes: 13.6 clause **(ii)**'s immutability limb, and the Phase 13 contradiction against
TEN-09

> **L12 is not in this document.** It was published separately at
> [`../L12/README.md`](../L12/README.md), which also repointed three in-code comments
> there. Nothing in this README claims L12's work.

---

## THE VERDICT: L7 CLOSED · L8 CLOSED — and L8 was bigger than 13.1 recorded

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  L7 — the platform-wide communication fallback is a tenant's brand        │
  │       13.4 gate 19 on v2_snap_13_6      FAIL  →  **PASS**                 │
  │       templates 33 | platform fallbacks 33 | legacy-branded  31 → **0**   │
  │       THE FINDING WAS LARGER THAN 13.4'S HEADLINE: **31 branded rows,      │
  │       not 19.** 19 come from the seed script; 12 more exist only on the   │
  │       production lineage and are produced by no script in this repo.       │
  │                                                                          │
  │       end-to-end, real code, no mocks:                                    │
  │         after  L7 : 33 template keys + 8 render_message types → **0**      │
  │                     messages carrying MIHAS/KATC                          │
  │         before L7 : the SAME probe → **81** offending renders across       │
  │                     **31** keys, in a rolled-back transaction             │
  │         13.4's own quoted subject flips                                   │
  │           'MIHAS Admissions — Payment Expired'                            │
  │        →  'Beanola Admissions — Payment Expired'                          │
  │                                                                          │
  │  L8 — three instruments write into other tasks' evidence directories      │
  │       mechanisms found by 13.1                          3                 │
  │       mechanisms actually present                    **4**  (§5.2)        │
  │       narrowed by L5-L6                                 1 (13.3's specs)  │
  │       **closed here**                                **4 of 4**          │
  │                                                                          │
  │       three DEFAULTED harness runs + a DEFAULTED whole-tree pytest:       │
  │         0.4/playwright-report.json  85799ced60e970fe…  **UNCHANGED**      │
  │         2.2/authority-conformance-summary.json  db5f2873c2049152…  **=**  │
  │         11.1–11.5 screenshots  7 / 10 / 10 / 16 / 20   **UNCHANGED**      │
  │         13.3/  296 files, newest 2026-08-12            **UNCHANGED**      │
  │         53 artifacts of the harness run landed run-scoped instead          │
  │                                                                          │
  │  backend  94 failed / **5278** passed / 103 skipped / 2 xfailed /          │
  │           1 xpassed / 1 error   (was 5239)  → +39, exactly L8's guard      │
  │  frontend 1 failed / 4619 passed / 1 skipped over 495 files — held         │
  │  lint     **0 errors, EXIT=0** — L12's baseline, not regressed            │
  │  type-check EXIT=0 · manage.py check exit 0, no E003                      │
  │                                                                          │
  │  TWO OF THIS BATCH'S OWN INSTRUMENTS WERE WRONG AND ARE RECORDED:         │
  │    §5.6 a defaulted run wiped the PREVIOUS run's scratch evidence         │
  │    §5.7 a probe wrote a tree OUTSIDE the repository                       │
  │  Both fixed; the second bought a resolver hardening.                      │
  │                                                                          │
  │  NOT closed:  B1 B2 B3 — operator-only. L12 — its own directory.          │
  └──────────────────────────────────────────────────────────────────────────┘
```

| | before | after (this batch) |
|---|---|---|
| 13.4 `invariants.sql` **gate 19** on `v2_snap_13_6` | **FAIL** — 33 templates / 33 platform fallbacks / **31** legacy-branded ([`raw/02`](raw/02-l7-before.txt)); 13.4 also read it FAIL 19/19/19 from-empty | **PASS** — 33 / 33 / **0** ([`raw/06`](raw/06-l7-gate19.txt)) |
| a fallback-rendered email carrying MIHAS/KATC | **81** offending renders across **31** template keys | **0**, over 33 template keys and 8 `render_message` types ([`raw/09`](raw/09-l7-render-fallback.txt)) |
| 13.4's quoted subject | `'MIHAS Admissions — Payment Expired'` | `'Beanola Admissions — Payment Expired'` |
| write paths into `docs/v2-evidence/**` | **4** (13.1 catalogued 3; the fourth is `harness/bin/harness` itself, §5.2) | **0** by default; **4** reachable on purpose ([`raw/18a`](raw/18a-l8-defaulted-run-probe.txt)) |
| a defaulted `bunx playwright test -c playwright.harness.config.ts` | rewrote `0.4/playwright-report.json` **and** `11.1`–`11.5/screenshots/` **and** `13.3/` | writes `apps/admissions/test-results/harness-evidence/<run>/` — 53 artifacts, 0 in anyone's evidence ([`raw/19`](raw/19-l8-harness-defaulted-run.txt)) |
| a defaulted `pytest tests/` | rewrote `2.2/authority-conformance-summary.json` | writes `backend/test-results/v2-evidence/<run>/2.2/` ([`raw/28`](raw/28-backend-whole-tree-after.txt)) |
| regenerating a task's evidence on purpose | the only mode there was | one env var: `V2_EVIDENCE_TASK_DIRS=1` ([`raw/22`](raw/22-l8-explicit-regeneration.txt)) |
| backend whole tree, serial | 94 failed / 5239 passed / 1 error ([`../L9-L11/raw/18`](../L9-L11/raw/18-backend-whole-tree-after.txt)) | **94 failed / 5278 passed / 1 error** ([`raw/28`](raw/28-backend-whole-tree-after.txt)) |
| `bun run lint` | 0 errors ([`../L12/raw/01`](../L12/raw/01-frontend-lint-after.txt)) | **0 errors, EXIT=0** ([`raw/25`](raw/25-frontend-lint.txt)) |

```
docs/v2-evidence/13.6/remediation/L7-L8-L12/
├── README.md                              <- this document (L7 + L8; L12 is in ../L12/)
└── raw/
    ├── 01-l8-before.txt                   <- L8 baseline: the hashes and counts a defaulted run used to clobber
    ├── 02-l7-before.txt                    <- L7 baseline: 33 / 33 / 31, the three forms, uncovered_rows 0
    ├── 03-l7-sweep-run1.txt                <- apply_sql_migrations dry-run then real, 1/45 pending
    ├── 04-l7-after.txt                     <- the SAME probe after L7: 33 / 33 / 0, all 33 subjects in full
    ├── 05 … 09, 11 … 15                    <- idempotence, gate 19, boot gate, rollback pair, render probe,
    │                                          comms suites, migration suites, R9.2 lint, report freshness, check
    ├── 10-l7-local-db-before.txt           <- local test-DB state before L7's test runs (test_% empty)
    ├── l7-templates-probe.sql             <- L7's read-only measuring instrument
    ├── l7-render-probe.py                 <- L7's end-to-end render probe, before AND after in one run
    ├── l7-rollback-lint-count.py          <- why the R9.2 lint count is 26 and not 27
    ├── 16-l8-test-db-before.txt           <- local test-DB state before L8's runs (test_% empty)
    ├── 17-l8-guard-discriminates.txt      <- the drift guard FAILS on the restored literal, file restored by sha256
    ├── 18-l8-drift-guard.txt              <- the guard: 39 cases, + py_compile / bash -n / YAML parse
    ├── 18a-l8-defaulted-run-probe.txt     <- re-runnable before/after over all five guarded paths
    ├── 19-l8-harness-defaulted-run.txt    <- THE proof: a defaulted harness run, and where its 53 artifacts went
    ├── 20-l8-base-config-timeout.txt      <- the 7 failures in raw/19 are the base config's 30 s default, not L8's
    ├── 21-l8-two-runs-both-survive.txt    <- §5.6: run 2 used to erase run 1. Fixed, then measured
    ├── 22-l8-explicit-regeneration.txt    <- a deliberate regeneration still works, without writing 2.2
    ├── 23-l8-own-instrument-slip.txt      <- §5.7: this batch wrote a tree outside the repo. Recorded, removed, hardened
    ├── 24-l8-harness-down.txt             <- harness down (volumes wiped)
    ├── 25-frontend-lint.txt               <- 0 errors, EXIT=0 (L12's baseline held)
    ├── 26-frontend-type-check.txt         <- EXIT=0
    ├── 27-django-check.txt                <- exit 0, and L7 raw/15's 'YES-PROBLEM' diagnosed (§4.6)
    ├── 28-backend-whole-tree-after.txt    <- serial whole tree, final: 94 / 5278 / 1
    ├── 28a-backend-whole-tree-first-run.txt  <- the first run, 5277, kept. §7 item 4 says why
    ├── 29-frontend-whole-suite-after.txt  <- 1 failed / 4619 passed / 1 skipped, 495 files
    ├── 30-git-state.txt                   <- nothing committed, nothing staged by this batch
    ├── l8-guard-discriminates.sh          <- re-runnable, raw/17's instrument
    ├── l8-defaulted-run-probe.sh          <- re-runnable, raw/18a's instrument
    ├── l8-resolve-paths.ts                <- imports the REAL modules and prints what they resolve to
    └── l8-regen-proof/                    <- the artifact the explicit-override branch produced (raw/22)
```

---

# L7 — the platform-wide communication fallback was a tenant's brand

## 1. What the finding actually was, and why the number is 31

A `communication_templates` row with `institution_id IS NULL` is not "the MIHAS
template". It is the fallback **every** tenant gets for that template key when it has no
row of its own — the middle rung of the ladder `CommunicationService._resolve_template`
walks (R14.1 / R14.4 / R14.5):

```
active institution row (highest version)
   -> active platform row, institution_id IS NULL (highest version)
      -> the safe Beanola default in code
```

Every one of those platform rows carried "MIHAS Admissions". So a student of **any**
tenant — including a brand-new school on its first day — was emailed under one legacy
school's identity. 13.4 §7.4 did not infer that: it watched the payment-expiry sweep queue
`'MIHAS Admissions — Payment Expired'` to a real recipient address through the ordinary
reconciliation path.

### 1.1 The finding was larger than 13.4's headline number

13.4 filed GATE-13.4-01 as *"19 MIHAS-branded platform-wide fallback rows"*. Measured
read-only on the restored production-lineage snapshot `v2_snap_13_6`
([`raw/02`](raw/02-l7-before.txt), instrument
[`raw/l7-templates-probe.sql`](raw/l7-templates-probe.sql)):

```
 total | platform_wide | tenant_scoped | legacy_branded_fallbacks
-------+---------------+---------------+--------------------------
    33 |            33 |             0 |                       31
```

**31, not 19.** Both readings are correct and the difference is the point: 19 rows come
from `2026_05_19_seed_communication_templates.sql`, which is why a from-empty build reads
19/19/19. A further **12 branded rows exist only on the production lineage** and are
produced by **no script in this repository** — they were authored directly against the
production database at some point, and they inherit the same defect. 13.4 measured the
from-empty build's number and the snapshot's number and reported both (33 / 33 / 31 is in
13.4's own gate-19 output); the *headline* carried forward as 19. Anyone remediating from
the headline alone would have fixed 19 rows, watched gate 19 still read FAIL, and had no
idea why.

Say it plainly: **the platform-wide communication fallback carried a tenant's brand on 31
rows, and 12 of them are invisible to this repository.**

### 1.2 The set of legacy-brand forms is closed, and that was measured

Three distinct forms occur across all 31 rows, and the preflight proves nothing falls
outside them — `uncovered_rows = 0` means: strip these three and no MIHAS/KATC substring
remains anywhere ([`raw/02`](raw/02-l7-before.txt) §2):

| form | occurrences | where |
|---|---:|---|
| subject prefix `'MIHAS Admissions — '` | **19** | `subject_template` |
| body sign-off `'Best regards,<br>MIHAS Admissions</p>'` | **31** | `body_template` |
| body sentence `'Welcome to MIHAS!'` | **1** | `enrollment_confirmed` |
| `KATC` anywhere | **0** | — |

The 12 production-lineage-only rows carry **only** the sign-off form, which is why form 2
counts 31 while form 1 counts 19 — and why they are corrected without having to be
enumerated.

**How it was applied, and what the same probe read afterwards.**
`apply_sql_migrations` was run dry first — `Pending migrations: 1/45`, the only pending
script being L7's, on a database L2-L3 had already brought to 44/44 — then for real
([`raw/03`](raw/03-l7-sweep-run1.txt), exit 0 both). Re-running the identical read-only
probe afterwards ([`raw/04`](raw/04-l7-after.txt)) reads `33 | 33 | 0` with all three form
counters at **0**, `uncovered_rows 0`, every one of the 33 subjects listed in full, and the
ledger showing both the 2026_05_19 seed row and L7's new row (`sha256 3f6823fea9ef`,
76 rows). The three corrected forms are printed in full on the rows that carried them, so
the replacement text can be read rather than trusted.

## 2. The neutral source, and which layer changed

**Neutral brand source.** `InstitutionContextService.BEANOLA_BRAND['name']` =
**`'Beanola Admissions'`** (`backend/apps/catalog/services.py:581`), which is
byte-identical to `communication_service._DEFAULT_BRAND_NAME`
([`raw/09`](raw/09-l7-render-fallback.txt) prints both from the running process, not from
the source). Nothing was invented: every replacement is quoted from a neutral source the
platform already had.

| form | replaced with | quoted from |
|---|---|---|
| 1 | `'Beanola Admissions — '` | `BEANOLA_BRAND['name']`; same shape as `_DEFAULT_SUBJECT` = `"Beanola Admissions — Notification"` |
| 2 | `'Best regards,<br>Beanola Admissions</p>'` | byte-identical to the sign-off in `_DEFAULT_BODY` **and** in `_FALLBACK_TEMPLATES['payment_expired']` — the platform's own already-written neutral version of one of these very rows |
| 3 | `'We look forward to seeing you on campus.'` | verbatim from `apps/common/email/messages/acceptance.py` |

Form 3 is the one a mechanical swap gets wrong. The brand there is the **object** of a
sentence addressed to a student about *their school*, and a student enrols at a school,
not at the platform vendor — `"Welcome to Beanola Admissions!"` would be false as well as
odd. The component system's own neutral voice for that exact moment refers to the
institution without naming a brand, so its sentence is reused rather than a new one
written.

**Which layer L7 changed: only the DB text layer.** The component system
(`backend/apps/common/email/`) owns structure and visual identity and was **already
neutral** — `shell.py` renders a "Beanola Admissions" pill, the "Beanola Technologies
Admissions Platform" headline and a Beanola footer around every message, and every
`messages/*.py` subject is brand-free. `communication_templates` supplies the per-key
subject/body text that `CommunicationService` renders *inside* that shell. So before L7 a
student received a **Beanola-branded envelope with MIHAS-branded contents**. L7 corrects
the contents and touches no template code, no shell, no model, no column, no migration DDL.

**A tenant still gets its own brand**, through the layer that owns it: an
`institution_id`-scoped row, which `_resolve_template` prefers over the platform row, or
the `{{brand_name}}` context token, which `_build_context` derives from the application's
resolved institution. `{{brand_name}}` was considered for forms 1 and 2 and deliberately
**not** used: `_substitute` renders a missing key as the empty string, so a caller that
reached `render_template` without a full context would produce a subject beginning `" — "`
and a sign-off reading `"Best regards,"` followed by nothing. A blank brand is not
neutral, it is broken, and the one row every tenant lands on is the wrong place for a
correctness argument that depends on every caller staying well-behaved.

## 3. The end-to-end claim is proven, and the probe discriminates

GATE-13.4-01 was not filed from a catalogue fact — it was filed from a *rendered email*.
So a row count is not the claim that needed proving.
[`raw/l7-render-probe.py`](raw/l7-render-probe.py) renders one, with the real code, no
mocks and no fixtures: `CommunicationService.render_template` for every template key with
an application whose institution does **not** resolve (the fallback path), the body wrapped
by `get_base_email_html` exactly as `send` queues it, and `render_message` for all 8
component-system types.

Then it does the part a one-sided measurement cannot. Inside a `transaction.atomic()` that
is **unconditionally rolled back**, it restores the pre-L7 text, renders everything again,
and reports both states from the same instrument, on the same database, in the same run
([`raw/09`](raw/09-l7-render-fallback.txt)):

| | after L7 | pre-L7 text, reproduced and rolled back |
|---|---:|---:|
| template keys rendered | 33 | 33 |
| `render_message` types rendered | 8 | 8 |
| **messages carrying MIHAS/KATC** | **0** | **81** |
| distinct template keys affected | — | **31** |
| 13.4's quoted subject | `'Beanola Admissions — Payment Expired'` | `'MIHAS Admissions — Payment Expired'` |
| rows reverted (form 1 / 2 / 3) | — | 19 / 31 / 1 — matching `raw/02` exactly |

**81 offending renders, not 31**, because each affected row can carry the brand in the
subject, in the body, and again inside the wrapped email, and the probe reports each
occurrence rather than each row.

**The rollback really rolled back, and that is measured rather than asserted.** §4 of the
probe re-reads the **committed** state after the transaction and prints it: 33 rows, **0**
legacy-branded platform fallbacks. A before/after probe that leaves the "before" behind is
worse than no probe.

**The component system was neutral all along** — 0 offending renders across all 8 message
types in **both** states, which is the measurement that lets §2's "only the DB text layer"
claim be a finding about the shell rather than an assumption about it.

## 4. Idempotence, the boot gate, the rollback pair, and the suites

### 4.1 Idempotence — three ways ([`raw/05`](raw/05-l7-idempotence.txt))

| part | what it shows |
|---|---|
| **A** | `apply_sql_migrations` dry-run and real run: *"All 45 migrations already applied. Nothing to do."*, exit 0 both |
| **B** | the script's three `UPDATE`s re-run at statement level on the corrected database: `subject_prefix=0 signoff=0 welcome=0` — a **clean no-op**, not a rewrite to the same value, and `still_branded 0` |
| **C** | the pre-L7 state reproduced inside a rolled-back transaction, then the **real script file** run against it: its own `NOTICE` reports `subject_prefix=19 signoff=31 welcome=1`, matching `raw/02` exactly, then 0 branded |

Part C is why the first-run counts in this document are **measured** rather than inferred
from a script that had already been applied. The committed state is re-read after the
rollback and is still 0 / 33.

Each `UPDATE` is scoped by the exact literal it replaces, and `institution_id IS NULL` is
load-bearing in every `WHERE` clause: a tenant-scoped MIHAS row is MIHAS's own template
and legitimately carries the MIHAS brand. There are **0** such rows today, which is
exactly why the scope had to be written down now rather than remembered later.

The script also **fails closed**: after the three known forms, if any platform-wide row
still carries a legacy brand, it `RAISE EXCEPTION`s with the offending `template_key`s, the
whole file rolls back, and `migration_history` is left unwritten so the next sweep retries.
A migration that claims to fix gate 19 and leaves it FAIL is worse than one that aborts.

### 4.2 The boot gate is unmoved ([`raw/07`](raw/07-l7-boot-gate.txt))

L7 adds no column, table, index or constraint, so `check_schema_drift` must be unchanged —
and it is: *"No schema drift. Verified 78 managed=False model(s)"*, exit 0 both plain and
`--strict`, matching the state L2-L3 left `v2_snap_13_6` in.

### 4.3 The rollback pair, and how it satisfies R9.2

`2026_08_14_01_neutral_platform_communication_templates_rollback.sql` is
**ledger-only by design**: one `DELETE FROM migration_history` and nothing else. That is a
deliberate choice with two reasons, and the second is the one that matters.

1. **There is no safe mechanical inverse.** The forward edit is a text substitution over
   rows an operator or `PUT /api/v1/admin/templates/{key}/` may since have re-authored.
   Replacing `'Beanola Admissions'` back with `'MIHAS Admissions'` is not a function of the
   forward change: it cannot tell a row this script corrected from a row an operator
   deliberately rewrote afterwards. Form 3 is worse —
   `'We look forward to seeing you on campus.'` is a sentence quoted from
   `messages/acceptance.py`, so an inverse substitution would rewrite that sentence
   wherever it legitimately appears. **R9.2 exists to forbid exactly this kind of blind
   row-rewriting trade.**
2. **The old state is the defect.** The forward change did not add a capability that could
   be withdrawn; it removed a tenant's brand from the fallback every tenant resolves to.
   Putting it back re-opens GATE-13.4-01 (high) / TEN-09 (P1) on purpose and returns gate
   19 to FAIL. A rollback whose outcome is a re-opened P1 tenancy finding is not a
   rollback; it is a regression with paperwork. This is the same reasoning
   `2026_06_08_00_canonical_programs_id_default_rollback.sql` already applies.

**Rolling back the code does not need the old text.** Nothing reads these strings for
behaviour — every `template_key`, `channel`, `is_active`, `version` and placeholder token
is untouched — so any release before or after renders these rows equally well. *"The text
stays neutral while the code goes back"* is a fully supported state.

**What it does undo is the one artefact that outlives the migration and can be undone
without touching a row: its `migration_history` row.** That is not bookkeeping for its own
sake. If an operator ever rolls back and re-applies the 2026_05_19 seed script, its
`ON CONFLICT … DO UPDATE` re-brands the 19 rows while L7's tracking row still says
"applied", so the sweep would skip it and the database would sit MIHAS-branded with
nothing pending to explain it. Removing the tracking row lets the next sweep re-assert the
correction — and on an already-neutral database that re-run matches 0 rows in all three
`UPDATE`s, so the pair **converges rather than oscillating**.

**Measured, not argued** ([`raw/08`](raw/08-l7-rollback-pair.txt)) — apply the rollback,
then re-converge:

| step | ledger rows | L7 row | legacy-branded | gate 19 |
|---|---:|---:|---:|---|
| after L7 | 76 | 1 | 0 | PASS |
| after the rollback | **75** | **0** | **0** | — |
| after the next sweep re-applies | 76 | 1 | 0 | **PASS** |

The text is unchanged across the whole cycle (`beanola_subject_rows = 19` after the
rollback), and `check_schema_drift --strict` is clean after it.

**Does the R9.2 lint accept it?** Yes ([`raw/13`](raw/13-l7-rollback-lint.txt)).
`test_rollback_safe_operations.py` accepts `DELETE FROM migration_history` in any form,
and this file is one such statement and nothing else. It deliberately contains no
`UPDATE`, which that lint's closed set does not admit at all — and which would be wrong
here even if it did.

The lint still reports its **26** pre-existing violations across **9 other lanes' files**,
the same 26 13.4 §6.1 and L2-L3 §4 both measured, and **L7's two filenames appear 0 times
anywhere in the output**. Counting them needed its own instrument
([`raw/l7-rollback-lint-count.py`](raw/l7-rollback-lint-count.py)): the file has **two**
failing tests that each print their own list, so a naive `grep -c` reports 27. The
deterministic every-file audit is the 26; the hypothesis-driven property **shrinks** to the
smallest offending draw and lists 1. Summing them double-counts, which is why they are
reported separately.

### 4.4 The suites whose inputs L7 changed

**Communication / email — 10 files, serial** ([`raw/11`](raw/11-l7-comms-suites.txt)):
`2 failed, 183 passed, 1 skipped`. Both failures are **pre-existing and in the 94**, and
both are verifiable as such in [`../L9-L11/raw/18`](../L9-L11/raw/18-backend-whole-tree-after.txt),
which predates L7:

| failure | cause | why not L7's |
|---|---|---|
| `test_communication_template_properties.py::test_resolution_priority` | `UniqueViolation` on `uq_comm_templates_one_active` from a hypothesis-generated fixture collision | a test-isolation defect in the fixture, on template rows the test creates itself |
| `test_communication_template_coverage.py::test_all_keys_seeded` | `ON CONFLICT (template_key)` has no matching unique constraint | the test executes the **2026_05_19 seed script**, whose `ON CONFLICT (template_key)` predates the constraint switch to `(template_key, institution_id)`. L7 left the seed script byte-identical |

The second is worth a sentence more, because it is adjacent to L7's subject and could be
mistaken for it: L7 deliberately did **not** edit the seed script. Its sha256 is recorded in
the `migration_history` of every database that applied it, so editing it would break the
ledger contract on all of them (the same reasoning L2-L3 §1.3 spells out for
`2026_06_08_01`). Ordering makes the pair converge instead: the seed runs first
(2026_05_19), L7 runs later (2026_08_14) and has the last word.

**Migration / schema-drift / rollback — 21 files, serial**
([`raw/12`](raw/12-l7-migration-suites.txt)): `8 failed, 159 passed, 19 skipped` —
**byte-for-byte the population L2-L3 measured on the same 21-file corpus**, all 8
pre-existing.

### 4.5 The migration-report freshness count moved 5 → 6 ([`raw/14`](raw/14-l7-migration-report-freshness.txt))

L2-L3 §6.2 left this at **5** omitted scripts. It now reads **6**:

```
release report omits June 2026+ scripts:
  2026_06_08_00_canonical_programs_id_default.sql          <- L3's
  2026_08_06_01_admin_saved_filters.sql                    <- another lane's
  2026_08_09_01_application_tracking_secret.sql            <- task 10.5's, never promoted
  2026_08_12_01_tenant_new_table_fk_validate.sql           <- another lane's
  2026_08_13_01_widen_application_snapshot_columns.sql     <- L2's
  2026_08_14_01_neutral_platform_communication_templates.sql   <- L7's, NEW
```

**The sixth is L7's own, and it is reported rather than cleared.** Clearing it means
regenerating the committed release report, which lives in `docs/v2-evidence/3.6/` —
another task's evidence directory, and one this batch is forbidden to write. That is not a
technicality: L8, in the same batch, exists precisely to stop instruments writing into
other tasks' evidence directories, so writing one to make a count go down would be the
batch contradicting itself in the space of one README. The omission is a **known,
attributed, growing** list with a named owner (whoever regenerates 3.6's report), and it is
already on 13.6's residual list.

### 4.6 `manage.py check` — and L7's own instrument corrected

`manage.py check` with the real `backend/.env`, `TESTING` unset and `REDIS_URL`
un-substituted: **System check identified no issues (1 silenced), exit 0** — in L7's run
([`raw/15`](raw/15-l7-django-check.txt)) and again here
([`raw/27`](raw/27-django-check.txt)).

L7's artifact printed something that should not be left standing next to an exit 0:
`REDIS_URL substituted? : YES-PROBLEM`. That contradiction is resolved, and it was L7's
**instrument**, not the environment. Measured four ways on `backend/.env` line 39, the
single `REDIS_URL` line, by sha256 (no value printed):

```
value, no trailing newline (what the process sees) = ea35bc1c259b6771
value + a trailing newline                         = 12b6ca8071ff38a5   <- L7's .env side
value with quotes stripped                         = ea35bc1c259b6771
the whole line including the REDIS_URL= key         = f84e7c9e4e861577
```

L7's `.env`-side hash was `12b6ca8071ff38a5` and its in-process hash `ea35bc1c259b6771`:
**the same value, hashed once with a trailing newline and once without.** Nothing was
substituted in either run. [`raw/27`](raw/27-django-check.txt) uses `printf '%s'` on both
sides and the hashes agree. Recorded because a `YES-PROBLEM` sitting beside an exit 0 is
the pairing a reader trusts least, and leaving it unexplained would invite someone to
conclude the check was run wrong.

## 5. L8 — four instruments, not three

13.1 §7.1 found that a single run rewrote **65 files across seven earlier task
directories** — 11.5 (20), 11.4 (16), 11.3 (10), 11.2 (10), 11.1 (7), 2.2 (1), 0.4 (1) —
*without 13.1 writing a line into any of them*. That is why **five earlier tasks'
Required_Evidence artifacts are not immutable**, which weakens every evidence claim in the
spec and is why 13.6 clause (ii) flagged it. It is also half of register finding
**GOV-04 (P0)**.

### 5.1 Where L5-L6 left it

L5-L6 §8.4 **narrowed** it. 13.3's four specs computed their screenshot and
`measurements-*.jsonl` paths *inside the spec*, and a Playwright config cannot redirect
that, so `evidenceRoot()` in `helpers/surfaces-13-3.ts` began resolving them from
`V2_EVIDENCE_DIR`. L5-L6 was explicit that this was a narrowing and not a fix, and that
the base config was the harness lane's. [`raw/01`](raw/01-l8-before.txt) is the state it
left: the exact hashes and counts a defaulted run would clobber.

### 5.2 What was actually still there — and the one 13.1 missed

| # | mechanism | fires on | 13.1 catalogued it? |
|---|---|---|---|
| 1 | `apps/admissions/playwright.harness.config.ts` hard-codes `../../docs/v2-evidence/0.4/playwright-report.json` | **any** run through the base config | yes |
| 2 | five required specs hard-code `'../../../../../docs/v2-evidence/11.{1..5}/screenshots'` | any run of the required profile | yes |
| 3 | `backend/tests/property/test_authority_matrix_generated.py:59` hard-codes `docs/v2-evidence/2.2` | **any** backend run, including every whole-tree run | yes |
| **4** | **`harness/bin/harness:23`** hard-codes `EVIDENCE_DIR="${REPO_ROOT}/docs/v2-evidence/0.4"` and writes **three more** of 0.4's files | `harness smoke` / `harness e2e` | **no** |

**Mechanism 4 matters and it is new.** 13.1 catalogued the *config's* reporter; the
*runner script* separately copies `playwright-required-report.json` and
`playwright-gatecheck-report.json` and writes `smoke-run.md`, all through its own
`EVIDENCE_DIR`. Fixing only the config would have left three of 0.4's five artifacts still
replaced by the next `harness smoke`. It is **latent rather than dormant**: those three
still carry their 2026-07-15 mtimes because nobody has run `harness smoke` since task 0.4,
while `playwright-report.json` carries 2026-08-12 — 13.3's run, mechanism 1 in action. One
mechanism had fired and its sibling simply had not been invoked yet.

**Are the 11.x screenshots a third independent mechanism, or a consequence of the first?**
Independent — and the check is one line. Mechanism 1 is a **reporter** entry in a config;
mechanism 2 is `join(dirname(fileURLToPath(import.meta.url)), '../../../../../docs/…')`
evaluated **inside each spec**. A config's `reporter`/`outputDir` cannot redirect a path a
spec computes for itself — which is exactly why L5-L6 had to parameterise 13.3's specs
rather than point a config at them, and why 13.2's and 13.3's own configs protected their
reports but not the 11.x screenshots. So they were fixed the same way L5-L6 fixed 13.3's:
at the spec, through the shared resolver.

One correction to 13.1's own record, for whoever reads both: 13.1 §7.1 says *"**Six**
required specs write screenshots into 11.1-11.5"* and then names **five**, and its own
instrument output (`13.1/raw/r2-7-side-effect.txt`) lists **five**. A repo-wide search for
a string literal containing `docs/v2-evidence` under `tests/harness-e2e/` finds those five
and nothing else. The mechanism is five specs; the headline said six.

**A sixth would-be victim that no one had recorded yet:** 13.3's four specs live under
`required/`, so after 13.3 landed, a defaulted base-config run also rewrote
`docs/v2-evidence/13.3/`. L5-L6's default of `13.3` preserved that hazard by design ("so
re-running 13.3 *as* 13.3 is unchanged"). L8 flips it, which makes 13.3 protected too.

### 5.3 The fix: one convention, three cases

`apps/admissions/tests/harness-e2e/helpers/evidence-dir.ts` and
`backend/tests/v2_evidence.py` — the two halves of one rule, because a Playwright config
cannot import a Python module and a pytest run cannot import a TypeScript one.

| env | resolves to | when you want it |
|---|---|---|
| `V2_EVIDENCE_DIR=<repo-relative path>` | `<repo>/<path>` | a task writing this run into **its own** directory — **L5-L6's case, semantics unchanged** |
| `V2_EVIDENCE_TASK_DIRS=1` | `<repo>/docs/v2-evidence/<task>` | regenerating the artifacts in their **canonical homes**, on purpose |
| *(neither)* | `<repo>/{apps/admissions,backend}/test-results/…/<run>/<task>` | **the default** — an ordinary run, writing nobody's evidence |

**`V2_EVIDENCE_DIR` is L5-L6's variable with L5-L6's meaning and was not redefined.** Its
branch is byte-for-byte the behaviour L5-L6's config relies on, so
`playwright.harness.13-6-L5-L6.config.ts` and L5-L6's recorded run are unaffected, and
`evidenceRoot()` now simply delegates to `evidenceDir('13.3')` rather than restating a
three-branch rule twice.

**Why a second variable rather than one.** A single path override cannot express the
canonical-home case: five specs have five different homes (`11.1` … `11.5`), the report has
a sixth (`0.4`) and the backend summary a seventh (`2.2`), so
`V2_EVIDENCE_DIR=docs/v2-evidence/11.1` would send all of them to one of them. The
alternatives were worse — five path variables is five conventions; overloading
`V2_EVIDENCE_DIR` with per-spec magic is one convention that means two things. A boolean
"yes, write the canonical homes" says exactly what it means and is `false` unless someone
types it. The run-scoped default appends the task id as a **subdirectory**, so five specs
in one run do not share a directory.

**Why the run-scoped root is under `test-results/`.** It is already gitignored
(`.gitignore:54`) and already the repo's scratch convention. It is deliberately **not**
under `docs/v2-evidence/`: a throwaway run directory sitting in the evidence tree would
eventually be read as evidence, which is the same confusion pointing the other way.

**`V2_EVIDENCE_RUN_ID`** is stamped once — by the base config in the main process, and by
`harness/bin/harness` before it invokes Playwright twice — so every writer in one run
resolves the same directory. Worker processes inherit `process.env`, and the `||` keeps the
parent's value if the config is re-loaded there. Absent it, the fallback is a stable
`current/` rather than a per-process timestamp, because a timestamp computed independently
per worker would scatter one run's artifacts across several directories, and a scattered
scratch run is harder to read than an overwritten one.

**CI keeps working, deliberately.** `.github/workflows/v2-harness-smoke.yml` uploads
`docs/v2-evidence/0.4/` as its artifact, and `docs/v2-evidence/` is untracked — so with the
default flipped, that upload would have published an **empty** artifact on a fresh
checkout: a green gate publishing nothing. A CI smoke run is not incidental; task 0.4's
Required_Evidence *is* the CI smoke run record. So the workflow sets
`V2_EVIDENCE_TASK_DIRS: "1"` on the step that runs the harness, in the one place where
writing 0.4 is the intent rather than a side effect. A guard case fails if that env
disappears while the upload stays.

### 5.4 It discriminates — the proof, not the argument

**Three defaulted harness runs and two defaulted whole-tree pytest runs**, with
`V2_EVIDENCE_DIR`, `V2_EVIDENCE_TASK_DIRS` and `V2_EVIDENCE_RUN_ID` explicitly `unset`
(unset rather than assumed unset — inheriting one is exactly the mistake that would make a
defaulted run look clean while writing a task directory).

The first is the one that matters most: the **base config**, the invocation that used to
clobber, over the five 11.x specs plus one of 13.3's
([`raw/19`](raw/19-l8-harness-defaulted-run.txt)):

| previously-clobbered artifact | after a defaulted run | known-good ([`../L5-L6/raw/07`](../L5-L6/raw/07-gate-13-1-07-check.txt)) |
|---|---|---|
| `0.4/playwright-report.json` | `85799ced60e970fe5a0ada2870950c1747af7136dc74442eec6e2690d35a7c68`, **3951 bytes**, mtime `2026-08-12 06:05` | identical |
| `2.2/authority-conformance-summary.json` | `db5f2873c20491527b2f4ce6b10c25ebb94c83806d5a54ddcccbb7b79ecf4de2`, **13367 bytes**, mtime `2026-08-14 08:59:26.001535080` | identical |
| `11.1` / `11.2` / `11.3` / `11.4` / `11.5` screenshots | **7 / 10 / 10 / 16 / 20**, all newest `2026-08-12` | identical |
| `13.3/` (the sixth would-be victim) | 296 files, newest `2026-08-12 16:49` | unchanged |
| anything else under `docs/v2-evidence/` | `find -newermt` returns **nothing** outside this batch's own directory | — |

**And the run wrote somewhere** — which is the other half of the claim, because "nothing
was written" and "nothing was written where it should not be" are different statements and
only the second is the fix. **53 artifacts**, in per-task subdirectories:

```
apps/admissions/test-results/harness-evidence/2026-08-14T16-29-30-816Z/
  0.4/playwright-report.json
  11.1/screenshots/… 11.2/… 11.3/… 11.4/… 11.5/…
  13.3/raw/measurements-chromium-required.jsonl
  13.3/screenshots/{320x568,375x667,390x844,768x1024,1280x800,1440x900}/…
```

Then the strongest single check: the **whole-tree serial pytest run**, the run that used to
replace 2.2's Required_Evidence, left `2.2` and `0.4` byte-identical and wrote its own
summary to `backend/test-results/v2-evidence/current/2.2/`
([`raw/28`](raw/28-backend-whole-tree-after.txt)).

For `2.2` the claim is stronger than a matching hash. Its mtime is
`2026-08-14 08:59:26.001535080` — **identical to the nanosecond** with the value
[`raw/01`](raw/01-l8-before.txt) recorded at 08:50Z, before any of L8's changes existed. So
the file was not rewritten with the same content; it was **not written at all**. That
08:59 write is itself GATE-13.1-07 firing one last time, by a backend run made earlier the
same day under the pre-L8 code, which is a useful reminder of how ordinary the mechanism
was: nobody chose to overwrite 2.2, and nobody noticed.

**A deliberate regeneration is still one command** ([`raw/22`](raw/22-l8-explicit-regeneration.txt)).
`V2_EVIDENCE_DIR` pointed at this batch's own directory produced a real 13,367-byte
artifact — 204 protected endpoint/methods, 1,940 cases, 93.0 % conformant, **0 hard
guarantee failures** — and left 2.2 untouched. The `V2_EVIDENCE_TASK_DIRS` branch is proven
by **resolution** (`docs/v2-evidence/2.2`, from the real module) and by the guard, and was
deliberately **not executed**: 2.2 is another task's directory and this batch is forbidden
to write it. Proving a fix by doing the thing the fix exists to prevent would be the wrong
kind of thorough.

One fact fell out of that run and is worth stating carefully: the regenerated summary is
**byte-identical** to 2.2's recorded artifact. So the overwrites GATE-13.1-07 describes
happened to be content-neutral for this file today. That is a fact about today's code, not
a defence of the mechanism — R2.7 asks that an artifact be immutable, not that it be
coincidentally stable.

**The guard discriminates too, and was watched failing**
([`raw/17`](raw/17-l8-guard-discriminates.txt)). Restoring the exact literal L8 removed, at
a real write site, fails it with the task named:

```
student-dashboard-task-first.spec.ts carries a hard-coded evidence path again — an ordinary
required profile run would rewrite task 11.1's screenshots (GATE-13.1-07):
["'../../../../../docs/v2-evidence/11.1/screenshots',"]
```

then the file was restored and verified byte-identical by sha256 (`01eeef4a8dd944dd` before
and after). The guard also has to **not** fire on prose: every file L8 touched documents
the literal it replaced, because a reader needs to know the old shape. The first version of
the guard failed on exactly those docblocks, on all five specs; it now strips comments
before scanning, and the probe asserts the docblock references are still there.

### 5.5 The 7 failures in the defaulted harness run are the base config's timeout, not L8's

The defaulted run read **36 passed / 7 failed**. All 7 are in `viewport-pixel-matrix.spec.ts`
— 13.3's — and all 7 are `Test timeout of 30000ms exceeded`.

Same specs, same defaulted env, same harness stack, **one** difference —
`--timeout=180000`, the value L5-L6's own config sets
(`playwright.harness.13-6-L5-L6.config.ts:83`) — and the result is **12 passed**, 12.2
minutes ([`raw/20`](raw/20-l8-base-config-timeout.txt)).

The base config sets **no** `timeout` at all, so Playwright's 30 s default applies, while
`measureSurface()` alone waits 1200 ms per surface across several surfaces at six widths.
So **13.3's four specs have never been able to pass under the base required profile since
13.3 added them** — a pre-existing harness-lane fact this run surfaced. It is **not** fixed
here: raising the base profile's timeout is a decision about every required spec, including
the strict no-skip gates, and that is the harness lane's call, not L8's. Recorded with the
measurement that proves the diagnosis so the lane does not have to re-derive it.

### 5.6 This batch's first own defect: run 2 erased run 1

Found by running the probe twice and looking for the first run's files — not by any check.

The run-scoped root began life at `apps/admissions/test-results/harness-evidence/…`, and
**Playwright deletes `outputDir` at the start of every run**; the base config's default
`outputDir` is `apps/admissions/test-results`. So the second defaulted run silently erased
the first's report and 53 screenshots. That is GATE-13.1-07's own failure mode — *whoever
ran it last* — relocated into the scratch tree, produced by the fix for it.

The base config now names `outputDir: './test-results/artifacts'`, which confines the
cleanup to Playwright's own trace/failure artifacts. Measured
([`raw/21`](raw/21-l8-two-runs-both-survive.txt)): after two more runs, **three** run
directories survive, including the 12.2-minute one, each with its own report and
screenshots.

### 5.7 This batch's second own defect: a probe wrote outside the repository

[`raw/23`](raw/23-l8-own-instrument-slip.txt), recorded rather than quietly corrected.

The first attempt at the regeneration artifact passed
`V2_EVIDENCE_DIR="../docs/v2-evidence/…"` because the command ran from `backend/` and the
author reasoned about the shell's cwd. The variable is **repo-relative**, so the resolver
did exactly what the convention says — `repoRoot / "../docs/…"` — and produced a
plausible-looking evidence tree at `/home/cosmas/Downloads/docs/v2-evidence/…`, **outside
the repository**. Nothing complained. L5-L6 hit the same class of slip from the other side
(§8.4, a 20 MB `apps/docs/v2-evidence/` tree), inside the batch whose whole subject is
instruments writing where nobody looks. 13.2 §5.4's rule applies: **an instrument has to
obey the rule it audits.**

The tree was removed. The helper was not at fault, but a resolver that can silently place
an evidence tree outside the repository is one keystroke from GATE-13.1-07 pointing
outward, so **both halves now refuse it**, with a message that says what the value is
relative to:

```
V2_EVIDENCE_DIR resolves outside the repository: /home/cosmas/Downloads/docs/v2-evidence/13.6.
It is a path relative to the REPOSITORY ROOT (/home/cosmas/Downloads/mihasv3), not to the
current working directory.
```

Three guard cases cover it, on both sides, and both public resolvers are asserted to apply
it — one resolver checking and its sibling not would be worse than neither.

### 5.8 The convention is one rule in three languages, and a guard says so

`backend/tests/unit/test_evidence_dir_convention_l8.py` — **39 cases**
([`raw/18`](raw/18-l8-drift-guard.txt)). Bash cannot import either module, so
`harness/bin/harness` is a third spelling; the guard reads **all four sources** — the TS
helper, the Python module, the bash runner and the CI workflow — and pins:

1. the three variable names, on every side, and that there is no **fourth**;
2. the resolution order, and the accepted flag spellings (`1|true|yes|on`), read from the
   TypeScript source rather than restated;
3. that neither run-scoped default is inside `docs/v2-evidence/`, and that the runner's
   default is the *frontend* helper's root, read from that helper;
4. that no write site carries a hard-coded `docs/v2-evidence/<task>` literal — per spec,
   **and** across **every** `*.spec.ts` under `required/`, because the next one to acquire
   the old literal by copy-paste will not be on 13.1's list of five;
5. that the CI workflow still opts in while it still uploads 0.4.

This is the same discipline L10 used for a date spelled in three places: a rule spelled
more than once needs something that fails when the spellings disagree.

---

## 6. Verification

| gate | result | raw |
|---|---|---|
| **13.4 `invariants.sql` gate 19** on `v2_snap_13_6` | `33 \| 33 \| 0` → **PASS** (was FAIL) | [`06`](raw/06-l7-gate19.txt) |
| end-to-end render, after / before | **0** / **81** offending renders; 13.4's subject flips | [`09`](raw/09-l7-render-fallback.txt) |
| L7 idempotence (A / B / C) | nothing pending · 0/0/0 re-run · 19/31/1 measured on a reproduced pre-L7 state | [`05`](raw/05-l7-idempotence.txt) |
| boot gate, plain and `--strict` | *No schema drift. Verified 78 managed=False model(s)*, exit 0 | [`07`](raw/07-l7-boot-gate.txt) |
| rollback pair: apply → re-converge | ledger 76 → **75** → 76; text neutral throughout; gate 19 PASS after | [`08`](raw/08-l7-rollback-pair.txt) |
| R9.2 rollback lint | **26** pre-existing violations in **9 other lanes' files**; L7's filenames appear **0** times | [`13`](raw/13-l7-rollback-lint.txt) |
| comms / email suites, 10 files, serial | `2 failed, 183 passed, 1 skipped` — both failures pre-existing and in the 94 | [`11`](raw/11-l7-comms-suites.txt) |
| migration suites, 21 files, serial | `8 failed, 159 passed, 19 skipped` — byte-for-byte L2-L3's population | [`12`](raw/12-l7-migration-suites.txt) |
| migration-report freshness | **6** omitted scripts (was 5); the sixth is L7's own, reported not cleared | [`14`](raw/14-l7-migration-report-freshness.txt) |
| `manage.py check`, real `.env` | *no issues (1 silenced)*, exit 0, no `E003`; L7's `YES-PROBLEM` diagnosed | [`15`](raw/15-l7-django-check.txt), [`27`](raw/27-django-check.txt) |
| **L8 defaulted harness run**, base config | 0.4 / 2.2 / 11.1–11.5 / 13.3 **all unchanged**; 53 artifacts run-scoped | [`19`](raw/19-l8-harness-defaulted-run.txt), [`18a`](raw/18a-l8-defaulted-run-probe.txt) |
| **L8 defaulted whole-tree pytest** | 2.2 unchanged; summary written to `backend/test-results/v2-evidence/current/2.2/` | [`28`](raw/28-backend-whole-tree-after.txt) |
| L8 explicit regeneration | a real 13,367-byte artifact, 0 hard-guarantee failures, 2.2 untouched | [`22`](raw/22-l8-explicit-regeneration.txt) |
| L8 drift guard | **39 passed**; fails on a restored literal; probe file restored by sha256 | [`18`](raw/18-l8-drift-guard.txt), [`17`](raw/17-l8-guard-discriminates.txt) |
| two runs, both survive | 3 run directories, each with its own report + screenshots | [`21`](raw/21-l8-two-runs-both-survive.txt) |
| **backend whole tree, SERIAL** | **94 failed / 5278 passed / 103 skipped / 2 xfailed / 1 xpassed / 1 error** in 571.67 s | [`28`](raw/28-backend-whole-tree-after.txt) |
| **frontend** `bun run test` | **1 failed / 4619 passed / 1 skipped** over **495 files** in 196.03 s | [`29`](raw/29-frontend-whole-suite-after.txt) |
| **`bun run lint`** | **0 errors, EXIT=0** | [`25`](raw/25-frontend-lint.txt) |
| **`bun run type-check`** | **EXIT=0** | [`26`](raw/26-frontend-type-check.txt) |
| `py_compile` / `bash -n` / YAML parse | clean on 3 Python files, `harness/bin/harness`, and the workflow | [`18`](raw/18-l8-drift-guard.txt) |

### 6.1 The deltas, attributed

| suite | baseline | now | delta |
|---|---|---|---|
| backend, serial | 94 failed / **5239** passed / 103 skipped / 2 xfailed / 1 xpassed / 1 error ([`../L9-L11/raw/18`](../L9-L11/raw/18-backend-whole-tree-after.txt)) | 94 failed / **5278** passed / 103 skipped / 2 xfailed / 1 xpassed / 1 error | **+39 passed**, exactly `test_evidence_dir_convention_l8.py`. Failures unchanged at **94**, error unchanged at **1**, skips unchanged at **103** — no skip added, none hidden |
| frontend | 1 failed / 4619 passed / 1 skipped, 495 files ([`../L12/raw/05`](../L12/raw/05-frontend-whole-suite-after.txt)) | **identical** | 0. The 1 failure is `authPageFormMarkup.test.tsx`, pre-existing, another lane's, not opened |
| lint | 0 errors ([`../L12/raw/01`](../L12/raw/01-frontend-lint-after.txt)) | **0 errors** | 0 — L12's closure held through 12 edited/created frontend files |
| type-check | exit 0 | **exit 0** | 0 |

**L7 added no backend test.** It is a SQL data correction plus its rollback, and its gate
is 13.4's `invariants.sql` gate 19 on the Neon rehearsal database, which no pytest run
touches. All +39 are L8's guard.

The **94 failures and the 1 error are other lanes'** — the population 13.6 §9.2 and
`../L2-L3` §7 attribute — and none was fixed, added, or re-diagnosed. The `-q -rs`
invocation (deliberately identical to L1-L4, L2-L3 and L9-L11 so the numbers are
comparable) does not print per-test failure identities, so what is claimed is the
**aggregate**: the count did not move.

### 6.2 Environment discipline

- **Neon**: only `v2_snap_13_6` on the reused rehearsal branch `br-jolly-pine-ahybtg2e`.
  Every measuring session opens with `SET default_transaction_read_only = on`; the only
  writes are L7's own migration, its rollback, and probe transactions that are
  unconditionally rolled back with the committed state re-read afterwards as proof. The DSN
  was assembled in-process from `backend/.env` and never printed.
- **Local test stack**: Postgres `mihas_localtest` `127.0.0.1:5433`, Redis
  `127.0.0.1:6380`, via the isolated `backend/.env.local.test` so a Neon DSN cannot enter a
  test run. `test_%` verified **empty before** L7's runs
  ([`raw/10`](raw/10-l7-local-db-before.txt)) and before L8's
  ([`raw/16`](raw/16-l8-test-db-before.txt))
  and **restored to empty after** — `pytest-django` left `test_mihas_localtest` behind after
  each failing whole-tree run and it was dropped both times, recorded in
  [`raw/28`](raw/28-backend-whole-tree-after.txt). Both containers were already up from the
  earlier batches and were left running; no volume touched, `stop`/`down -v` never used on
  them.
- **Harness**: `HARNESS_PW_CHANNEL=chrome` (bundled Chromium unsupported on
  `ubuntu26.04-x64`), brought up with `harness up` after the source changes, and
  `harness down` afterwards ([`raw/24`](raw/24-l8-harness-down.txt)). Video is unobtainable
  on this OS, as 13.2 §7 and L5-L6 both measured.
- All backend runs **serial**. 12.1 §15.1 is why: a concurrent run yields a spurious
  `psycopg2.errors.DuplicateDatabase` and silently un-runs tests.

---

## 7. What is NOT claimed

1. **The spec is not closed, and this document does not close it.** No `"status":
   "completed"` was written; `tasks.md` was not touched; the gate 13.6 measured is still
   **2 PASS / 3 FAIL**; **B1**, **B2** and **B3** remain open and are operator-only.
2. **L12 is not claimed here.** It is closed in [`../L12/README.md`](../L12/README.md),
   which also repointed three in-code comments to itself. This batch did not run L12's
   work, and the lint figure quoted in §6 is a check that L12's closure **held**, not a
   claim to it.
3. **L7 was not re-executed by this write-up.** Its 14 artifacts were taken on 2026-08-14
   between 09:39Z and 10:52Z and are read here, not re-derived. What this pass **did**
   re-measure is the whole tree, the frontend suite, lint, type-check and
   `manage.py check` — because L8's changes could have moved them — and the one L7 number
   this pass corrected is its own instrument's `REDIS_URL` self-check (§4.6), not a
   measurement of the platform.
4. **The backend whole tree was measured twice and both runs are kept.**
   [`raw/28a`](raw/28a-backend-whole-tree-first-run.txt) read **5277** because the guard's
   39th case did not exist yet — it was added when the CI dependency on
   `docs/v2-evidence/0.4/` was found. The tree was re-measured
   ([`raw/28`](raw/28-backend-whole-tree-after.txt), **5278**) rather than the mismatch
   footnoted, and the first run is retained so the sequence is checkable.
5. **L7 was rehearsed on a snapshot, not applied to production.** `v2_snap_13_6` is 13.4's
   restored production-lineage snapshot brought forward by L2-L3. **Production was never
   contacted** — no SSH, no `.pem` read, no query, no write, no deploy, no migration. R18.7
   is satisfied as *rehearsed*; the production apply is an operator step.
6. **`v2_snap_13_4`, `v2_fresh_13_4`, `v2_batch_13_4` and the Neon default branch were not
   touched** — not read, not written. Only `v2_snap_13_6` was used.
7. **The 12 production-lineage-only branded rows are corrected on the snapshot, not
   explained.** No script in this repository produces them; where they came from is
   unknown, and this batch did not investigate. Form 2 corrects them without enumerating
   them, and gate 19 will catch any that reappear.
8. **The migration-report omission count went UP, to 6, and was not cleared** (§4.5).
   Clearing it means regenerating a report in `docs/v2-evidence/3.6/` — another task's
   evidence directory, which this batch is forbidden to write and which L8 exists to
   protect.
9. **L8's `V2_EVIDENCE_TASK_DIRS` branch was never executed against a task directory.** It
   is proven by resolution from the real modules and by the guard. Nothing in this batch
   wrote into `0.4/`, `2.2/`, `11.1`–`11.5/`, `13.3/`, `13.4/`, `3.6/` or `L12/` — verified
   by `find -newermt` after every run, and reported in
   [`raw/19`](raw/19-l8-harness-defaulted-run.txt), [`raw/21`](raw/21-l8-two-runs-both-survive.txt),
   [`raw/22`](raw/22-l8-explicit-regeneration.txt) and [`raw/28`](raw/28-backend-whole-tree-after.txt).
10. **The 7 harness failures in [`raw/19`](raw/19-l8-harness-defaulted-run.txt) were not
    fixed.** They are the base config's 30 s default timeout (§5.5), proven by a single
    changed flag, and raising that timeout is a decision about every required spec — the
    harness lane's, not L8's.
11. **The gatecheck-negative project was not run**, so no claim is made that the strict
    gates still fire. L8 changed no fixture and no gate; it changed where artifacts are
    written.
12. **`harness smoke` was not run end-to-end**, so mechanism 4's fix is verified by
    resolution (`bash -n`, the three-branch expansion, and the guard) rather than by a
    completed smoke run. A `harness smoke` would have written `docs/v2-evidence/0.4/`'s
    three copied files under the pre-L8 code and is exactly the run this batch must not
    make casually.
13. **No test, assertion or guardrail was weakened.** Nothing was skipped, deleted or
    relaxed; skips held at 103 and the total case count rose only by L8's own 39. The one
    thing edited in an existing test file is `_EVIDENCE_DIR`'s destination in
    `test_authority_matrix_generated.py` — its assertions, its case matrix and its
    `hard_failures` gate are untouched, and [`raw/22`](raw/22-l8-explicit-regeneration.txt)
    shows it still produces the same 1,940-case summary with 0 hard-guarantee failures.
14. **Two of this batch's own instruments were wrong** (§5.6, §5.7) and one of L7's was
    (§4.6). All three are recorded with the correction rather than silently fixed.
15. **13.1's "six required specs" was corrected to five** (§5.2) from 13.1's own instrument
    output. 13.1's README was **not** edited — it is another task's evidence and immutable
    under R2.7.
16. **`findings.md` was not edited.** GATE-13.4-01's and GATE-13.1-07's state changes are
    reported in §9 for the next pass to apply; the same for TEN-09 and GOV-04.
17. **Nothing was committed. Nothing was staged.**

---

## 8. State left behind

### 8.1 Changed files — 16 (5 created, 11 edited), plus this evidence directory

**L7 — the data correction and its pair (2 files, both created):**

| file | change |
|---|---|
| `backend/scripts/2026_08_14_01_neutral_platform_communication_templates.sql` | **created** — three scoped `UPDATE`s inside one `DO` block, each keyed on the exact literal it replaces and on `institution_id IS NULL`; a `RAISE NOTICE` with the per-form counts; a fail-closed `RAISE EXCEPTION` if any platform row is still branded afterwards; and a `COMMENT ON COLUMN communication_templates.institution_id` recording the invariant and naming gate 19 as its drift guard. No DDL, no `version` bump |
| `backend/scripts/2026_08_14_01_neutral_platform_communication_templates_rollback.sql` | **created** — one `DELETE FROM migration_history`, with the two-reason argument for why it is ledger-only in its own header (§4.3) |

`2026_05_19_seed_communication_templates.sql` is **byte-identical** — deliberately (§4.4).

**L8 — the convention (2 files created, 1 delegating):**

| file | change |
|---|---|
| `apps/admissions/tests/harness-e2e/helpers/evidence-dir.ts` | **created** — `evidenceDir()`, `evidenceDirRelative()`, `evidenceRunId()`, `isTruthyFlag()`, the three env-var name constants, `RUN_SCOPED_EVIDENCE_ROOT`, and `insideRepo()`'s escape check |
| `backend/tests/v2_evidence.py` | **created** — the Python half: same three variables, same order, same flag spellings, same escape check |
| `apps/admissions/tests/harness-e2e/helpers/surfaces-13-3.ts` | `evidenceRoot()` now **delegates** to `evidenceDir('13.3')`; the default flips from `13.3` to run-scoped, the override branch is unchanged. `dirname`/`fileURLToPath` imports dropped |

**L8 — the four write paths (8 files edited):**

| file | change |
|---|---|
| `apps/admissions/playwright.harness.config.ts` | reporter path resolves through `evidenceDirRelative('0.4')`; stamps `V2_EVIDENCE_RUN_ID` once in the main process; `outputDir: './test-results/artifacts'` so Playwright's cleanup stops erasing the run-scoped tree (§5.6) |
| `harness/bin/harness` | `EVIDENCE_DIR` resolves through the same three-branch rule; `V2_EVIDENCE_RUN_ID` exported **once** so `smoke`'s two Playwright invocations share a directory; `write_evidence` logs which mode it is in |
| `backend/tests/property/test_authority_matrix_generated.py` | `_EVIDENCE_DIR = evidence_dir("2.2")`; two docstrings updated. The 2.1 case matrix is **read**, so its path is unchanged, and no assertion moved |
| `…/required/student-dashboard-task-first.spec.ts` · `student-wizard-mobile.spec.ts` · `student-document-density.spec.ts` · `admin-mobile-journeys.spec.ts` · `design-system-defluff.spec.ts` | `SHOT_DIR = join(evidenceDir('11.N'), 'screenshots')`; each docblock quotes the literal it replaced and says what it used to do |

**L8 — the guard and the CI wiring (2 files, 1 created):**

| file | change |
|---|---|
| `backend/tests/unit/test_evidence_dir_convention_l8.py` | **created** — 39 cases across the TS helper, the Python module, the bash runner, the CI workflow, and every `*.spec.ts` under `required/` |
| `.github/workflows/v2-harness-smoke.yml` | `V2_EVIDENCE_TASK_DIRS: "1"` on the step that runs `harness/bin/harness smoke`, with the reason in a comment (§5.3) |

**This batch's own evidence:** this README + 25 numbered artifacts + 5 re-runnable
instruments + `raw/l8-regen-proof/`.

**Not changed:** no production code, no settings module, no model, no serializer, no view,
no schema, no DDL, no dependency, no design token, no Tailwind class, no `eslint.config.js`,
no `package.json`. `docs/v2-evidence/3.6/`'s report was **not** regenerated (§4.5).

### 8.2 Untouched

| item | state |
|---|---|
| `tasks.md`, `.config.kiro`, `docs/canonical-truth-map.md`, `findings.md` | **unchanged by this batch.** `canonical-truth-map.md` shows `M` in `git status` — another lane's pre-existing worktree change, present before this batch and also recorded by L12 ([`raw/30`](raw/30-git-state.txt)) |
| `docs/v2-evidence/13.6/README.md` and its §8.1 rows | **unchanged** — L7 and L8 are not ticked there; that is the next pass's call |
| every other task's `docs/v2-evidence/**` | **read, never written.** `0.4/`, `2.2/`, `11.1`–`11.5/`, `13.3/`, `13.4/`, `3.6/` and `L12/` verified unchanged after **every** run of this batch |
| `13.1/README.md` | **read, not edited** — its "six required specs" is corrected in §5.2 of this document, not in its own file (R2.7) |
| `2026_05_19_seed_communication_templates.sql` | **byte-identical** — its sha256 is in the ledger of every database that applied it |
| `apps/admissions/playwright.harness.13-2.config.ts`, `…13-3.config.ts`, `…13-6-L5-L6.config.ts` | **unchanged.** Each names its own task's directory, which is the "explicitly told to" case and already correct |
| the four allow-lists in `helpers/surfaces-13-3.ts` | **unchanged and still empty** — L5-L6 emptied them; L8 touched only `evidenceRoot()` |
| `v2_snap_13_4`, `v2_fresh_13_4`, `v2_batch_13_4`, the Neon default branch | **never contacted** |
| production Postgres / EC2 | **never contacted** — no SSH, no `.pem` read, no query, no deploy |
| secrets | no DSN, password, token or key appears in this directory. Env values are compared by sha256 |

### 8.3 Git

**Nothing committed. Nothing staged by this batch.** Branch `main` at
`bae29a28d9657f288b3339062adb31285959c966` with the V2 tree dirty, as the earlier batches
left it ([`raw/30`](raw/30-git-state.txt)). All 16 of this batch's files read `??`
(untracked) — the whole V2 tree is uncommitted, so `git status` cannot separate this batch
from the other lanes, and the list in §8.1 is established per file by the change itself and
by the `13.6 remediation L7` / `L8` marker each touched file carries. The index still holds
the **9 pre-existing staged deletions** from the de-AI work (tasks 7.4 / 12.4), staged
before this batch and untouched here; unstaging another lane's index is not this batch's
call. `git add` was not run.

---

## 9. For 13.6's next pass

### 9.1 Closed outright

| item | why |
|---|---|
| **L7** — the 19 (in fact **31**) brand-neutral fallback templates | §1–§4. 13.4 `invariants.sql` **gate 19 PASSES** on `v2_snap_13_6` (`33 \| 33 \| 0`); a fallback-rendered email carries a legacy brand **0** times where the reproduced pre-L7 text carries it **81** times across 31 keys; idempotent, boot-gate-clean, R9.2-paired and lint-accepted |
| **L8** — the instruments writing into `docs/v2-evidence/**` | §5. **4 of 4** mechanisms closed (13.1 catalogued 3). Three defaulted harness runs and two defaulted whole-tree pytest runs left `0.4`, `2.2`, `11.1`–`11.5` and `13.3` byte-identical, while the runs' own 53 + 1 artifacts landed run-scoped. Deliberate regeneration is one env var. A 39-case cross-language guard fails on a restored literal |

### 9.2 Registered findings whose state changed — for the register, not edited here

| finding | sev | was | now | evidence |
|---|---|---|---|---|
| **GATE-13.4-01** | high | open — *"19 MIHAS-branded platform-wide fallback rows"* | **FIXED** on the rehearsal lineage. Also **restate the count: 31, not 19** (§1.1) | this README §1–§4, [`raw/06`](raw/06-l7-gate19.txt), [`raw/09`](raw/09-l7-render-fallback.txt) |
| **TEN-09** | **P1** | `[x]` owners (2.3, 11.5) but **contradicted** by GATE-13.4-01 — 13.6 §3.2 lists it as one of the 5 P1s that keep clause (i) failing | **the contradiction is cleared.** The behaviour is fixed and measured end to end. Whether TEN-09 *closes* also depends on the production apply, which is an operator step | as above |
| **GATE-13.1-07** | med | open — *"five earlier tasks' Required_Evidence artifacts are not immutable"* | **FIXED**, and **four** mechanisms not three; the fifth and sixth victims are `13.3/` and 0.4's three extra files (§5.2) | §5, [`raw/19`](raw/19-l8-harness-defaulted-run.txt), [`raw/28`](raw/28-backend-whole-tree-after.txt) |
| **GOV-04** | **P0** | contradicted by GATE-13.1-02 **and** GATE-13.1-07 | **its immutability limb is closed.** The other limb — 13.6's 36→94 failures — is untouched and is B9's successor lanes' | §5; the failure population is unchanged at 94 |

Two of these are **larger than the register says** (GATE-13.4-01's count, GATE-13.1-07's
mechanism count), and both restatements are corrections upward. Neither `findings.md` nor
any Phase 13 README was edited.

### 9.3 The batch board

| item | state |
|---|---|
| **B4** / **B9** | **closed** by L1-L4 |
| **B5** / **B6** | **closed** by L2-L3 |
| **B7** / **B8** | **closed** by L5-L6 |
| **B10** | **closed** by L9-L11 |
| **B11** | **partly closed** by L9-L11 — residual: `_ALLOWED_PREDICATES` (11) and `legacy-brand-allowlist.allowlist` (19) need their owning specs' agreement, and `DECLINED_REMOVALS` (3) is deliberately undated |
| **L12** | **closed in its own directory**, [`../L12/README.md`](../L12/README.md) |
| **L7**, **L8** | **closed here** |
| **B1**, **B2**, **B3** | **operator-only.** 13.5 was never executed; `sign-off.md` is wholly unsigned and needs an operator **and** a second reviewer; GATE-13.5-05 (is production `*.beanola.com` or `*.mihas.edu.zm`?) costs one answer and every HTTP check in the post-deploy proof depends on it |

**All twelve lane items L1–L12 are now closed or partly closed.** What remains before the
gate can pass is §8.2 of 13.6's README — the operator sequence O1–O10 — and the residuals
below.

### 9.4 Handed forward as named follow-ups

1. **13.3's four specs cannot pass under the base required profile** (§5.5). The base
   `playwright.harness.config.ts` sets no `timeout`, so Playwright's 30 s default applies
   and `viewport-pixel-matrix.spec.ts` needs ~1.9 min per width. `--timeout=180000` turns
   7 failures into 12 passes. Two legitimate answers: raise the base profile's timeout, or
   exclude those four from it and keep them on their own config. **Owner: the harness
   lane.** This was not a visible problem before, because every task that ran those specs
   used its own config.
2. **L7 must still reach production**, backup-first, by the operator path
   (`apply_sql_migrations`). It is rehearsed, idempotent, additive and paired; a from-empty
   build converges by filename order; and a database that never had the seed script is a
   complete no-op. **Owner: the deploy operator**, alongside O9's promotion of
   `2026_08_09_01_application_tracking_secret.sql`.
3. **The migration-report omission list is now 6** and only grows (§4.5). Regenerating
   `docs/v2-evidence/3.6/`'s committed report clears all six at once. **Owner: whoever owns
   3.6.**
4. **The 12 production-lineage-only branded rows have no known origin** (§1.1, item 7).
   Gate 19 catches recurrences; nobody has explained the source. **Owner: the data lane.**
5. **`V2_EVIDENCE_TASK_DIRS` is now the only way to write a task's evidence directory from
   an instrument.** Any *new* instrument that must publish into `docs/v2-evidence/<task>/`
   should resolve through `evidenceDir()` / `evidence_dir()` and let the caller opt in —
   the guard's last two cases fail on a hard-coded literal anywhere under
   `required/`, and the third-spelling check fails if `harness/bin/harness` drifts.

---

One generalisation, earned here rather than borrowed. **A finding's headline is a summary,
and a summary loses the number you need.** GATE-13.4-01 said *19 rows*; the defect was
**31**, and 12 of those exist in no script in this repository, so a remediation driven by
the headline would have fixed 19, watched the gate still read FAIL, and had nothing to
explain it. GATE-13.1-07 said *three instruments*; there were **four**, and the fourth was
the runner script that the catalogued config lived inside — latent only because nobody had
typed `harness smoke` since the task that wrote it. In both cases the true number was
already inside the filing task's own raw output, one level below the sentence everyone
quotes. The lesson is not "13.1 and 13.4 were careless" — they measured correctly and
recorded it. It is that **a remediation lane must re-measure from the artifact, not from
the finding**, and that the cheapest way to make that possible is what both of those tasks
actually did: keep the raw output next to the claim. This batch's own two instrument
defects (§5.6, §5.7) were found the same way — by looking at what was on disk instead of at
what the run said it had done.
