# Task 13.6 remediation — M4, M5 and M6

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · remediation items **M4**, **M5**
and **M6** of [`docs/v2-evidence/13.6/README.md`](../../README.md) Part II §18.1
Requirements: **R15.8** (the migration-history report is generated from the database and
covers every June-2026+ migration), **R15.1** (checksum-tracked, runner-contract
idempotent), **R15.7** (read-only evidence compares a fresh schema; production is never
the first apply) for M4 · **R18.2–R18.3** (the required Playwright profile completes at
desktop and mobile with zero required skips, and the gate is the thing that runs it),
**R16** (the surfaces 13.3's specs measure), **R2.7 / R18.5** (an evidence artifact is
immutable) for M5 · **R1.3** (the spec validator's five rules, rule 3 in particular) for M6
Findings: **GATE-13.1-05**'s migration-report half for M4 · L7-L8 §9.4 item 1 for M5 ·
**GATE-13.6-04** (and therefore the mechanical half of **GATE-13.6-02**) for M6

---

## THE VERDICT: ALL THREE CLOSED · AND OPTION 2 WOULD NOT HAVE WORKED

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  M4 — the migration-history release report                  **CLOSED**   │
  │                                                                          │
  │    omitted June-2026+ scripts   3 -> 5 -> 6 -> 7  ->  **0**              │
  │    (L1-L4)   (L2-L3 §6.2)  (L7-L8 §4.5)  (M1-M2 §6.1)                    │
  │                                                                          │
  │    Generated from a REAL database by the canonical committed path:        │
  │      fresh-from-empty local Postgres `v2_mig_history_m4` (127.0.0.1:5433) │
  │      00_full_schema.sql -> migration_history_extend -> apply_sql_migrations│
  │      **46 applied, 0 failures.**  NOT Neon. NOT production. No branch.    │
  │                                                                          │
  │    june_2026_plus  25 of 39  ->  **32 of 46**   findings 7 -> **0**       │
  │    all 48 rows carry a 64-char checksum AND an applied_at   -> 0 bad      │
  │    0 forward scripts on disk have no row (stronger than freshness)        │
  │    the two freshness tests: **FAILING -> 34 passed** (31 unit + 3 PBT)    │
  │                                                                          │
  │    `00_full_schema.sql` **DEFERRED, not hand-edited.** Its guard is       │
  │    terminal in ALL THREE branches — including WITH the operator           │
  │    attestation. All three run; sha256 and mtime unchanged after.          │
  │                                                                          │
  │  M5 — the base harness profile                              **CLOSED**   │
  │                                                                          │
  │    CHOSE OPTION 1: raise the base profile's budget.                       │
  │    And the full run proves option 2 WOULD NOT HAVE WORKED —               │
  │    **5 of the 23 over-budget tests are NOT 13.3's specs.**                │
  │      admin-dashboard-metrics.spec.ts  39.4s / 40.2s   (task 9.2's)        │
  │      design-system-defluff.spec.ts    33.3s, mobile   (task 11.x's)       │
  │      tenant-launch.spec.ts            31.5s / 32.1s   (task 4.x's)        │
  │                                                                          │
  │    **332 passed / 8 failed in 1.0 h.** 340 tests, base config, NO         │
  │    `--timeout` on the command line. 13.3's four specs: **66 of 66 pass.** │
  │    18 of them exceed the old 30 s default; the slowest is **173.0 s**.    │
  │                                                                          │
  │    L7-L8's reservation MEASURED, not accepted: the gatecheck project      │
  │    still fails, in **272 ms – 3.4 s**. 1.9 % of the new budget. All four  │
  │    fail by THROW, so the per-test budget is never reached.                │
  │    A hung page still fails on the old order: navigationTimeout 60 s,      │
  │    actionTimeout 30 s, expect 30 s — all bounded, none new to the repo.   │
  │                                                                          │
  │    All 8 failures PROVEN PRE-EXISTING by re-running them under the        │
  │    pre-M5 config: 6 fail identically (`tenant-launch` in 6.7 s instead    │
  │    of 31.5 s — same failure, faster), and the other 2 are cross-project   │
  │    shared state that moves to a DIFFERENT pair of rows.                   │
  │                                                                          │
  │    Evidence isolation: `0.4/ 2.2/ 11.1–11.5/ 13.3/` **byte-identical**    │
  │    across three harness invocations. 8 of 8 tree hashes unchanged.        │
  │                                                                          │
  │  M6 — GATE-13.6-04                                          **CLOSED**   │
  │                                                                          │
  │    parsed finding_count  **71 -> 110**  (71 plain + 39 dotted)            │
  │    task 0.2's pin        **71 -> 110**  (its history: 70, 71, 71, 110)    │
  │    rule 3: **0 unowned over all 110** — the assertion the gate exists for │
  │    validator **exit 0, 0 errors** · self-tests **20/20 -> 24/24**         │
  │                                                                          │
  │    The widen ALONE was measured first: **39 errors, exit 2, CI red** —    │
  │    exactly what L9-L11 §3.3 predicted. Recorded before the second half.   │
  │    The 71 plain ids parse BYTE-IDENTICALLY, in order. 0 phantoms.         │
  │    All 39 owner assignments verified against requirement text: **0 wrong**│
  │    (1 incomplete, recorded not edited — findings.md is off limits).       │
  │                                                                          │
  │  backend whole tree, SERIAL, same invocation                              │
  │    43 failed / 5372 passed / 103 skipped / 2 xf / 1 xp / 0 errors         │
  │ -> **41** failed / **5374** passed / **103** skipped / 2 / 1 / **0**      │
  │    2 closed, **0 new**, diffed header by header. Skips 103 -> 103,        │
  │    32 reason strings identical on both sides.                            │
  │                                                                          │
  │  frontend **0 failed / 4620 passed / 1 skipped over 495 files**           │
  │  lint **0 errors** exit 0 · type-check **exit 0** · manage.py check **0** │
  │                                                                          │
  │  M7 NOT TOUCHED, by design. Nothing committed. Production not contacted.  │
  └──────────────────────────────────────────────────────────────────────────┘
```

| | before | after |
|---|---|---|
| **M4** migration-report omitted June+ scripts | **7** | **0** |
| `migration-history.release.json` rows / June+ | 39 / **25** | 48 / **32** |
| schema fingerprint | `sha256:8516eee0…` | **`sha256:771c69ea…`** |
| `test_migration_history_report_freshness.py` | **2 failed** of 31 | **31 passed** (+ 3 PBT = 34) |
| `backend/scripts/00_full_schema.sql` | `"intake" varchar(100)` | **unchanged** — guard terminal in all 3 branches (§1.7) |
| **M5** base required profile, 13.3's four specs | **7 failed**, all `Test timeout of 30000ms exceeded` (L7-L8 §5.5, 43-test subset) | **66 of 66 pass**, no CLI override |
| base required profile, whole population | never run | **332 passed / 8 failed** (1.0 h, 340 tests) |
| required tests exceeding the old 30 s default | 30 s budget → each unpassable | **23**, of which **5 are not 13.3's** |
| gatecheck project | must FAIL — it does | **still fails, 272 ms – 3.4 s** (1.9 % of 180 s) |
| `0.4/ 2.2/ 11.1–11.5/ 13.3/` tree hashes | 8 recorded | **8 identical** |
| **M6** parsed `finding_count` | **71** | **110** |
| task 0.2's finding-count pin | **71** | **110** |
| rule 3 `unowned-finding` errors | 0 over 71 (39 invisible) | **0 over 110** |
| `validate_spec_governance.py` | exit 0, 0 errors | **exit 0, 0 errors** |
| its self-tests | **20/20** | **24/24** |
| grammar widened *alone* (measured, then completed) | — | **39 errors, exit 2** |
| backend whole tree, serial | **43** / 5372 / **103** / 2 / 1 / **0 err** | **41** / **5374** / **103** / 2 / 1 / **0 err** |
| frontend `bun run test` | 0 failed / 4620 passed / 1 skipped / 495 files | **0 / 4620 / 1 / 495** |
| `bun run lint` · type-check · `manage.py check` | 0 errors · exit 0 · exit 0 | **0 errors · exit 0 · exit 0** |

Sources, in order:
[`raw/00-baseline-backend-whole-tree.txt`](raw/00-baseline-backend-whole-tree.txt) ·
[`raw/01-baseline-clusters.txt`](raw/01-baseline-clusters.txt) ·
[`raw/02-baseline-attribution.txt`](raw/02-baseline-attribution.txt) ·
[`raw/10-m4-freshness-before.txt`](raw/10-m4-freshness-before.txt) ·
[`raw/11-m4-fresh-build.txt`](raw/11-m4-fresh-build.txt) ·
[`raw/12-m4-emit.txt`](raw/12-m4-emit.txt) ·
[`raw/13-m4-freshness-after.txt`](raw/13-m4-freshness-after.txt) ·
[`raw/14-m4-freshness-tests.txt`](raw/14-m4-freshness-tests.txt) ·
[`raw/15-m4-full-schema-guard.txt`](raw/15-m4-full-schema-guard.txt) ·
[`raw/16-m4-report-delta.txt`](raw/16-m4-report-delta.txt) ·
[`raw/30-m6-validator-before.txt`](raw/30-m6-validator-before.txt) ·
[`raw/31-m6-owner-map.txt`](raw/31-m6-owner-map.txt) ·
[`raw/32-m6-grammar-probe.txt`](raw/32-m6-grammar-probe.txt) ·
[`raw/33-m6-widen-alone-is-red.txt`](raw/33-m6-widen-alone-is-red.txt) ·
[`raw/34-m6-owner-map-check.txt`](raw/34-m6-owner-map-check.txt) ·
[`raw/35-m6-validator-after.txt`](raw/35-m6-validator-after.txt) ·
[`raw/36-m6-ownership-audit.md`](raw/36-m6-ownership-audit.md) ·
[`raw/40-m5-isolation-before.txt`](raw/40-m5-isolation-before.txt) ·
[`raw/41-m5-config.txt`](raw/41-m5-config.txt) ·
[`raw/42-m5-harness-up.txt`](raw/42-m5-harness-up.txt) ·
[`raw/43-m5-base-required.txt`](raw/43-m5-base-required.txt) ·
[`raw/44-m5-gatecheck-timing.txt`](raw/44-m5-gatecheck-timing.txt) ·
[`raw/45-m5-pre-config-triage.txt`](raw/45-m5-pre-config-triage.txt) ·
[`raw/46-m5-durations.txt`](raw/46-m5-durations.txt) ·
[`raw/47-m5-isolation-after.txt`](raw/47-m5-isolation-after.txt) ·
[`raw/48-m5-harness-down.txt`](raw/48-m5-harness-down.txt) ·
[`raw/50-localdb-preflight.txt`](raw/50-localdb-preflight.txt) ·
[`raw/51-after-backend-whole-tree.txt`](raw/51-after-backend-whole-tree.txt) ·
[`raw/52-after-clusters.txt`](raw/52-after-clusters.txt) ·
[`raw/53-whole-tree-delta.txt`](raw/53-whole-tree-delta.txt) ·
[`raw/54-django-check.txt`](raw/54-django-check.txt) ·
[`raw/55-frontend-gates.txt`](raw/55-frontend-gates.txt) ·
plus three instruments — [`raw/cluster.py`](raw/cluster.py) (M3's, reused unchanged so
the two cluster tables are comparable), [`raw/owner-map.py`](raw/owner-map.py) (new) and
[`raw/isolation.sh`](raw/isolation.sh) (new) — and the run-scoped harness output under
[`raw/m5-run/`](raw/m5-run/), [`raw/m5-pre-run/`](raw/m5-pre-run/) and
[`raw/m5-gatecheck/`](raw/m5-gatecheck/).

---

## 0. The baseline is this batch's own, and it disagrees with M3's by one

M3 left the tree at **44 failed / 5372 passed / 102 skipped / 2 xfailed / 1 xpassed / 0
errors**. This batch re-ran the same invocation, serially, on the same local stack and
measured **43 failed / 5372 passed / 103 skipped**
([`raw/00`](raw/00-baseline-backend-whole-tree.txt)).

**One failure became one skip, and it is neither M3's fault nor this batch's.**
[`raw/02`](raw/02-baseline-attribution.txt) names it exactly:

```
tests/unit/test_api_quality_script.py::test_api_quality_script_passes_against_baseline

  M3's run   FAILED at tests/unit/test_api_quality_script.py:71
  this run   SKIPPED at tests/unit/test_api_quality_script.py:44
             "Python at /usr/bin/python3 lacks backend deps"
```

The test's own `_find_venv_python()` prefers `/tmp/mihas_audit_venv/bin/python`, then
`/opt/venv/bin/python`, then `PATH`. Neither of the first two exists any more — `/tmp` was
cleared between M3's run and this one — so it falls through to `/usr/bin/python3`, whose
`import django, drf_spectacular` fails, and the test's pre-existing environment guard
skips it. Under M3 that guard did not fire because the audit venv was still on disk, so the
test ran and failed.

This matters for two reasons and is stated up front rather than netted away:

1. **The skip count rose 102 → 103 before this batch touched anything.** The verification
   brief asks that skips not rise. They rose in the *baseline*, from a guard already in the
   test, and 103 → 103 across M4-M5-M6's own work (§5.1).
2. The before/after delta below is taken between **two runs of this batch's own tree**,
   which is the same discipline M3 §1.1 applied to the same one-test disagreement in the
   other direction.

---

## 1. M4 — the migration-history release report, regenerated once and attributed

### 1.1 The count, and why four batches were right not to clear it

| measured by | omitted June-2026+ scripts | its own contribution |
|---|---:|---|
| 13.1 / L1-L4 | 3 | — |
| L2-L3 §6.2 | 5 | +2, its own two scripts |
| L7-L8 §4.5 | 6 | +1, its own |
| M1-M2 §6.1 | 7 | +1, its own |
| **M4** | **0** | cleared all 7 |

Every one of those four batches declined for the **same** correct reason, stated most
plainly by L7-L8 §4.5: clearing the count means writing
`docs/v2-evidence/3.6/migration-history.release.json`, which is **task 3.6's
Required_Evidence**, and doing so would have absorbed *other lanes'* omissions into *one
lane's* evidence. L2-L3 §6.2 added the second reason: it would muddy which lane owes what.
L7-L8 put it sharpest — L8 exists in the same batch precisely to stop instruments writing
into other tasks' evidence directories, so writing one to make a count go down "would be
the batch contradicting itself in the space of one README".

13.6 §18.1 therefore made the regeneration its **own lane item**, which is the only way it
happens once, deliberately, with every one of the seven attributed. The precedent is task
7.3 §6.7, which did the same when five June+ scripts had accumulated.

### 1.2 Which database, and why that one

The command's own docstring and 3.6's README agree, and they name a **fresh-from-empty
build**, not a migrated one:

> *"Emit a report from the active Django connection (fresh/migrated local DB)"* —
> `migration_history_report.py` docstring
>
> *"fresh-from-empty local Postgres built from `00_full_schema.sql` +
> `apply_sql_migrations` (the canonical committed path)"* — `3.6/README.md` §2

The reason is in the artifact rather than in the prose: a report from a *migrated* database
records whatever that database happens to have applied, at whatever time it applied it. A
report from a fresh-from-empty build records that **every committed script applies from
nothing, in filename order**, and every row's `applied_at` is a timestamp from a database
that genuinely applied it in sweep order. That is what R15.8 asks for and what 3.6 §5's
reproduction block spells out.

So: a throwaway local Postgres, `v2_mig_history_m4` on `127.0.0.1:5433` — the same
isolated stack every batch since L1-L4 has used, matching 7.3's `v2_mig_history_7_3` and
3.6's `v2_mig_history_3_6`.

**Not Neon**, for three reasons: the Neon default branch is the *authoring* database
(`infrastructure.md`), its own report is the separately-committed
`migration-history.neon-default.json` and is **legitimately stale by design**, and Neon is
at its branch cap in any case. **No Neon branch was created**, `br-jolly-pine-ahybtg2e` was
not used, and `v2_snap_13_4` / `v2_fresh_13_4` / `v2_batch_13_4` were not touched.
**Production was not contacted** — R15.7 makes a fresh schema and a read-only comparison the
evidence, and 3.6 §2 already records the production capture as an operator step.

### 1.3 The build, the emit, and the freshness gate

[`raw/11`](raw/11-m4-fresh-build.txt) — the canonical committed path, exactly as 3.6 §5
documents it:

```
CREATE DATABASE v2_mig_history_m4
psql -f scripts/00_full_schema.sql                          exit=0
psql -f scripts/2026_05_22_migration_history_extend.sql      exit=0
manage.py apply_sql_migrations --allow-non-additive
  … applying: 2026_08_15_01_widen_application_intake_snapshot.sql (sha256=b68c5261f6f5) ... OK
  Applied 46 migration(s) successfully.                      exit=0
```

**46 applied, 0 failures.** This re-proves, on a script set that has grown by seven since
the 2026-08-05 run, that every additive committed script still applies cleanly from an
empty database in filename order. One difference from 7.3's run, recorded because it is a
difference: **nothing stayed pending**. 7.3 noted `schema_cleanup_drop_stale_columns.sql`
as permanently refused; under the same explicit `--allow-non-additive` operator review that
3.6 §5 documents, it and `schema_cleanup_device_session_default.sql` both applied. The
additive-only lint's refusal is a **default**, not a permanent exclusion — which is worth
knowing, because "the sweep can never apply it" and "the sweep will not apply it unattended"
are different claims.

[`raw/12`](raw/12-m4-emit.txt) then [`raw/13`](raw/13-m4-freshness-after.txt):

```
Wrote migration-history report 'release-canonical-committed-path' -> …/migration-history.release.json
  (migrations=48 june_2026_plus=32 fingerprint=sha256:771c69ea… identity=host=127.0.0.1 db=v2_mig_history_m4)

FRESHNESS OK: report covers every June 2026+ migration script on disk (32 June+ rows),
              links sha256:771c69ea…, no secrets.              exit=0
```

`freshness.release.json` reads `{"ok": true, "finding_count": 0, "findings": []}`.

### 1.4 What the report now contains, checked rather than assumed

[`raw/16`](raw/16-m4-report-delta.txt):

- **The 7 rows added are exactly the 7 that `raw/10` named as omitted** — the artifact's
  own list is re-read and each id looked up, rather than the two lists being compared by eye.
- Each carries a **64-character** sha256 and an `applied_at`; across all 48 rows, **0 lack
  either** (R15.8).
- **0 forward scripts on disk have no row.** That is a stronger statement than freshness
  makes: freshness only gates the June-2026+ subset, so a pre-June script silently missing
  from the report would pass the gate. It is not missing.
- **48 rows against 46 forward scripts** — the two extra are `payment_hardening_indexes.sql`
  and `payment_hardening_preflight.sql`, seeded into `migration_history` by
  `00_full_schema.sql` itself rather than applied by the sweep. Named because a reader
  comparing 48 to 46 would otherwise have to work it out.
- Secret-leak guard re-run over the committed JSON: **0 hits** for `password`, `sslmode`,
  `postgres://`, `postgresql://`, `@ep-`, `neondb_owner`, `rediss://`. The report carries
  only `host=127.0.0.1 db=v2_mig_history_m4`.

### 1.5 The two freshness tests

[`raw/14`](raw/14-m4-freshness-tests.txt): **34 passed** — the 31 unit tests of
`test_migration_history_report_freshness.py` plus the 3 Hypothesis properties of
`test_migration_history_report_properties.py`. The two that were failing, named by the
baseline cluster report ([`raw/01`](raw/01-baseline-clusters.txt), cluster `J-migreport`):

```
test_committed_release_report_covers_every_june_plus_script_on_disk
test_committed_release_report_is_fresh_and_complete
```

Both pass. They are 2 of M3's remaining 44 (43 on this batch's own baseline), and M3 §9
attributed both to this item.

### 1.6 3.6's own README was updated, and it is in scope

`docs/v2-evidence/3.6/README.md` had three stale figures — the header fingerprint, §2's
"25 of 39", and the identity `db=v2_mig_history_7_3`. All three now match the artifact, and
a third row was added to the file's **Regeneration log**, in the shape the 2026-07-22 and
2026-08-05 rows already established. The log is the reason the fingerprint moving twice is
legible rather than alarming.

### 1.7 `00_full_schema.sql` — deferred, and the refusal measured

L2-L3 §6.2 and M1-M2 §6.2 both recorded that `backend/scripts/00_full_schema.sql` still
declares `"intake" varchar(100)` after M1 widened the model and the column to 255. The
question this item was asked to answer is whether the guarded path can be run legitimately
here. **It cannot, and the guard is terminal in every branch** —
[`raw/15`](raw/15-m4-full-schema-guard.txt) runs all three:

| invocation | outcome |
|---|---|
| `--regenerate-full-schema` | `CommandError: --regenerate-full-schema requires --from-manifest` |
| `… --from-manifest <clean Postgres manifest>` | `CommandError: refusing … without --i-verified-canonical` |
| `… --i-verified-canonical` | `CommandError: guard reached: regeneration of 00_full_schema.sql is intentionally an operator step (pg_dump --schema-only from the attested canonical DB). This command verifies canonicity but does not overwrite the file automatically.` |

The third branch is the answer. There is **no** committed path that writes the file: the
command verifies canonicity and then refuses, by design, because the regeneration is
`pg_dump --schema-only` from an **attested canonical** database — and R15.7 makes production
the canonical source, which this lane may not contact. The manifest passed in was a real,
clean, non-reduced Postgres manifest emitted from the fresh build
(`vendor=postgresql reduced=False tables=89`), so the refusal is the guard's *last* branch
rather than an input problem.

`00_full_schema.sql` is unchanged afterwards: `sha256 bca4d6c4…`, mtime `2026-05-22
12:30:48`. **Not hand-edited.**

One measurement worth adding, because it bounds the risk the stale number carries: the
fresh-from-empty database built *from* that file measures **255 on all three snapshot
columns**, because the sweep applies M1's and L2's widens on top:

```
 column_name | character_maximum_length
-------------+--------------------------
 institution |                      255
 intake      |                      255
 program     |                      255
```

So the snapshot being one number out of date has **no runtime effect** — which is what
M1-M2 §6.2 said, now measured on the database the file builds — and the next operator
regeneration picks it up. Owner: task 3.1, unchanged.

---

## 2. M5 — the base harness profile, and why one of L7-L8's two options was not viable

### 2.1 The defect, restated from L7-L8's measurement

`apps/admissions/playwright.harness.config.ts` set **no** `timeout`, so Playwright's 30 s
default applied to every required test. Task 13.3 then put four measurement specs in
`tests/harness-e2e/required/`, and its own config
(`playwright.harness.13-3.config.ts:83`) sets `timeout: 180_000` with a written rationale,
because `measureSurface()` alone waits 1200 ms per surface across several surfaces at six
widths. 13.3's config header even says so out loud: *"All four spec files live in
`tests/harness-e2e/required/`, so the **base** required profile picks them up at both
viewports from now on."* It picked them up and could never pass them.

L7-L8 §5.5 measured it precisely — 7 failures, all `Test timeout of 30000ms exceeded`,
against 12 passes in 12.2 minutes with `--timeout=180000` — and left the harness lane two
answers.

### 2.2 The choice: option 1, raise the base profile's budget

Three reasons, in ascending order of how much they settle it.

**(a) Option 2 removes required specs from the required profile.** R18.2 asks the required
Playwright tests to complete at desktop and mobile "with zero required skips"; R18.3 makes
this gate the thing that runs them. A required spec the gate does not run is strictly worse
than one that is slow — and the exclusion would have been *invisible*, because
`harness/bin/harness` invokes `--project=chromium-required --project=mobile-required` by
name, so a project-level split silently drops the excluded specs from `harness smoke`. That
is exactly how GATE-13.1-07's fourth mechanism stayed latent: nobody had typed
`harness smoke` since the task that wrote it.

**(b) 180 s and 30 s are not new numbers.** They are what 13.3's config and L5-L6's
re-measurement config already set. The base profile setting *nothing* is the anomaly. Making
it agree with the two profiles these specs have actually been run under is a smaller change
than inventing a third budget.

**(c) The decisive one, and it is a measurement rather than an argument: option 2 would
not have worked.** The full 340-test run's durations
([`raw/46`](raw/46-m5-durations.txt)) show **23** required tests exceeding the old 30 s
default — and **5 of them are not 13.3's specs**:

| file | over-30 s tests | durations | whose task |
|---|---:|---|---|
| `viewport-pixel-matrix.spec.ts` | 14 | 113.3 s – 119.1 s | 13.3 |
| `long-content-tenant-strings.spec.ts` | 4 | 42.7 s – **173.0 s** | 13.3 |
| `admin-dashboard-metrics.spec.ts` | 2 | 39.4 s / 40.2 s | **9.2** |
| `tenant-launch.spec.ts` | 2 | 31.5 s / 32.1 s | **4.x** |
| `design-system-defluff.spec.ts` | 1 | 33.3 s, mobile only | **11.x** |

`admin-dashboard-metrics.spec.ts` and `design-system-defluff.spec.ts` (mobile) both **pass**
under the 180 s budget and both **exceed** the old 30 s default, so they had never been able
to pass under the base required profile either. Excluding 13.3's four would have left the
base profile still unable to pass them, and the next lane would have re-derived the same
diagnosis from a smaller symptom.

L7-L8's measurement was not wrong; it was taken over a **43-test subset**
([`../L7-L8-L12/raw/19`](../L7-L8-L12/raw/19-l8-harness-defaulted-run.txt) reads
`Running 43 tests`), which happened to include `design-system-defluff` on chromium at 13.5 s
— passing — and never ran it on mobile. This batch's run is the **first** full 340-test
measurement of the base required profile, which is why the population is only visible now.

### 2.3 L7-L8's reservation, answered rather than accepted

L7-L8's stated concern was that a longer budget means a genuinely hung test takes longer to
fail, "including the strict no-skip gates". Both halves are addressed **in the same edit**,
and the first is measured.

**The gatecheck project is unaffected.** [`raw/44`](raw/44-m5-gatecheck-timing.txt), run
under the raised budget:

```
Running 4 tests using 1 worker
  ✘  1 console.gate.spec.ts        … fails the run  (485ms)
  ✘  2 failed-request.gate.spec.ts … fails the run  (828ms)
  ✘  3 skip.gate.spec.ts           … converts to a failure  (272ms)
  ✘  4 undrained.gate.spec.ts      … fails the run  (3.4s)
  4 failed
EXIT=1 (non-zero is the REQUIRED outcome — harness/bin/harness run_gatecheck asserts it)
```

All four still fail, and the slowest takes **3.4 s** — **1.9 %** of the new budget and 11 %
of the old one. That is structural rather than lucky: every gatecheck spec fails by **throw**,
never by timeout. `skip.gate` throws on its first statement; `console.gate` after a 200 ms
tick; `failed-request.gate` after 500 ms; `undrained.gate` inside its own
`assertRequiredJobsDrained(3000)` bound. The per-test budget is never reached, so raising it
cannot slow the project whose whole job is to fail.

**A hung page still fails on the old order of magnitude,** because the per-test budget is not
the instrument that detects one. `navigationTimeout` and `actionTimeout` default to **0 — no
limit** — which means that before M5 the 30 s test budget was the *only* bound on a hung
navigation. Bounding them is what makes raising `timeout` safe:

| instrument | before M5 | after M5 | what it catches |
|---|---|---|---|
| `timeout` (per test) | 30 s (Playwright default) | **180 s** | the sum of a spec's own explicit measurement pauses |
| `expect.timeout` | 5 s (default) | **30 s** | an assertion that will never pass |
| `navigationTimeout` | **0 — unbounded** | **60 s** | a `goto` that never resolves |
| `actionTimeout` | **0 — unbounded** | **30 s** | a click/fill on an element that never appears |

60 s for navigation rather than 30 s because these run against a cold local Caddy + Django +
Postgres stack and 13.1 §6.1 already recorded a route sweep at 38.3 s on a used one; a first
paint that is merely slow must not be reported as a hang. What the 180 s buys is only the
explicit `waitForTimeout` measurement pauses — which is the one thing the 30 s default was
wrong about.

### 2.4 The proof: the base profile, no per-run override

[`raw/43`](raw/43-m5-base-required.txt). One command, the committed base config, `chrome`
channel because Playwright's bundled Chromium is unsupported on `ubuntu26.04-x64`, and
**no `--timeout` anywhere**:

```
bunx playwright test -c playwright.harness.config.ts \
  --project=chromium-required --project=mobile-required

  8 failed
  332 passed (1.0h)
```

**13.3's four specs: 66 of 66 pass, both projects** — counted from the machine-readable
report rather than from the console, [`raw/46`](raw/46-m5-durations.txt):

```
total results      : 340
13.3's four specs  : 66 rows, statuses {'passed': 66}
over 30_000 ms     : 23        over 180_000 ms : 0        slowest : 173.0s
```

The rows that used to be `Test timeout of 30000ms exceeded`:

```
✓ viewport-pixel-matrix.spec.ts:293 › every student surface holds at 320x568   (1.9m)
✓ viewport-pixel-matrix.spec.ts:293 › every student surface holds at 375x667   (1.9m)
✓ viewport-pixel-matrix.spec.ts:293 › every student surface holds at 390x844   (1.9m)
✓ viewport-pixel-matrix.spec.ts:293 › every student surface holds at 768x1024  (1.9m)
✓ viewport-pixel-matrix.spec.ts:293 › every student surface holds at 1280x800  (1.9m)
✓ viewport-pixel-matrix.spec.ts:293 › every student surface holds at 1440x900  (1.9m)
✓ long-content-tenant-strings.spec.ts:431 › a 180-character program name … at all six widths  (2.8m)
```

`0 of 340` exceeded the new budget. The slowest is **173.0 s**, which is **96 %** of it.

**The reporter says 8 failed and the JSON says 6, and both are right.** The two rows that
differ are `two-tenant-isolation-matrix.spec.ts:408` (S06) on both projects: S06 is annotated
`test.fail()`, so the JSON records its body's result (`passed`) while the reporter applies the
annotation and reads *"Expected to fail, but passed."* Recorded because a reader comparing the
two artifacts would otherwise find an unexplained two-row disagreement — and because the
direction matters: those two are not a regression, they are a stale characterisation of a
defect item L1-L4 fixed (§2.5).

### 2.5 All 8 failures are pre-existing, and that is measured, not argued

None is a timeout failure of the kind M5 could introduce, and none is in 13.3's four specs.
[`raw/45`](raw/45-m5-pre-config-triage.txt) re-runs them with the config **temporarily
reverted to its pre-M5 effective form** (`timeout` unset → 30 s, `expect` unset → 5 s,
action/navigation unset → unbounded), then restores it byte-identically.

| failure | ×2? | under M5's config | under the pre-M5 config | cause |
|---|---|---|---|---|
| `tenant-launch.spec.ts:139` "…on mobile" | both projects | ✘ **31.5 s / 32.1 s** — `expect(getByText('Fees')).toBeVisible()`, `Received: hidden`, `Timeout: 30000ms` | ✘ **6.7 s / 6.9 s**, identical error | **pre-existing.** A hidden element does not become visible by waiting longer. M5 changed how long it takes to fail (5 s → 30 s), not *whether* it fails |
| `two-tenant-isolation-matrix.spec.ts:408` S06 | both projects | ✘ **"Expected to fail, but passed"** (273 / 404 ms) | ✘ identical | **pre-existing, and it is L1-L4's success.** S06 is a `test.fail()` characterising GATE-13.2-01's capacity defect. L1-L4 closed that finding, so the characterisation is now stale |
| `two-tenant-isolation-matrix.spec.ts:450` S06b | both projects | ✘ capacity `97` vs `41` — *"the two tenants report the same capacity … the defect S06 names"* (417 / 491 ms) | ✘ identical | same cause: it asserts the two tenants report the **same** capacity, and they no longer do, because the defect is fixed |
| `two-tenant-adversarial-matrix.spec.ts:794` F8 | mobile only | ✘ "the sweep re-dispatched the stranded job", `> 0` got `0` (12.6 s) | **F3 and F5 fail instead**, F8 passes | **pre-existing, order-dependent.** Same file, same projects, 2 failures either way — a *different* pair |
| `two-tenant-golden-journey.spec.ts:155` | mobile only | ✘ harness gate: `failed request [409] /api/v1/catalog/assignment-preview/` (10.1 s) | ✓ passes in the narrower invocation | same class: it passes on `chromium-required` and 409s on `mobile-required` in the same invocation, because the first project already created the draft |

The last two are worth naming as a **class** rather than as two rows: running the same
state-mutating specs twice — once per project — against **one** shared harness stack makes
some rows order-dependent. That is a pre-existing property of the base profile's two-project
shape, it is entirely timeout-independent (a gate violation and an assertion, at 12.6 s and
10.1 s against a 180 s budget), and the pre-M5 run reproduces it while moving *which* rows
fail. Owners: the tenancy/harness lanes for S06/S06b (13.2's characterisation specs, now
describing a closed defect) and 4.x for `tenant-launch`'s Fees step. **Nothing was skipped,
allow-listed, weakened, or deleted to make the run greener** — the 8 are reported as 8.

### 2.6 The run wrote nowhere that is anyone's evidence

[`raw/40`](raw/40-m5-isolation-before.txt) and
[`raw/47`](raw/47-m5-isolation-after.txt), the same instrument before and after **three**
harness invocations (the 340-test proving run, the pre-M5 triage runs, and the gatecheck run):

```
0.4    files=5     tree_sha256=7bb9b7e9…      0.4    files=5     tree_sha256=7bb9b7e9…
2.2    files=3     tree_sha256=5f744935…      2.2    files=3     tree_sha256=5f744935…
11.1   files=23    tree_sha256=5b2cc23c…      11.1   files=23    tree_sha256=5b2cc23c…
11.2   files=38    tree_sha256=225b47e8…      11.2   files=38    tree_sha256=225b47e8…
11.3   files=26    tree_sha256=6d124699…      11.3   files=26    tree_sha256=6d124699…
11.4   files=26    tree_sha256=5d228dd5…      11.4   files=26    tree_sha256=5d228dd5…
11.5   files=35    tree_sha256=0c157753…      11.5   files=35    tree_sha256=0c157753…
13.3   files=296   tree_sha256=566ea235…      13.3   files=296   tree_sha256=566ea235…
                                    diff before/after: (no differences)
```

**8 of 8 byte-identical**, file counts and tree hashes both — not mtimes, which is how
GATE-13.1-07 was originally found and is a weaker signal. The mechanism is L8's:
`V2_EVIDENCE_DIR=docs/v2-evidence/13.6/remediation/M4-M5-M6/raw/m5-run` pointed all three
runs at this batch's own directory, where 236 files and 37 MB landed. `apps/docs/` does not
exist (L5-L6 §8.4's slip) and nothing resolved outside the repository (L8's own slip).

Harness taken down afterwards ([`raw/48`](raw/48-m5-harness-down.txt), `down exit=0`, 0
`v2-harness` containers). The `mihas-localtest` Postgres and Redis were left **running** and
were never `down -v`'d.

---

## 3. M6 — GATE-13.6-04, closed as the two coordinated edits it needed

### 3.1 The gap, and why it needed both halves

L9-L11 registered the 39 Phase 13 `GATE-13.x-nn` findings in `findings.md`, closing
GATE-13.6-02's *registration* half. `scripts/validate_spec_governance.py` recognised a
finding id only as `[A-Z]{2,6}-\d+`, so all 39 were invisible to it: `finding_count` stayed
**71** and R1.3 rule 3 ("every finding has an owner requirement") could not fire over any of
them. Registered documentally, not mechanically — filed as **GATE-13.6-04**.

L9-L11 §3.3 established that closing it takes **two edits in one change**, and deliberately
did neither because assigning 39 findings to owner requirements is a requirements-ownership
decision. This item holds that authorisation.

### 3.2 The widen alone turns the gate red — measured before completing it

[`raw/33`](raw/33-m6-widen-alone-is-red.txt), taken with the grammar widened and
`requirements.md` **not yet edited**:

```
Errors: 39  Warnings: 0
[admissions-v2-canonical-rebuild] status=planned reqs=18 findings=110 tasks=73 (checked=71)
RESULT: FAIL (governance violations present)
EXIT=2
```

Exactly the 39 errors and the red blocking gate L9-L11 predicted. Recorded rather than
asserted, because "it must be both edits" is the whole reason the item exists and a
prediction nobody checks is indistinguishable from a guess.

### 3.3 The grammar: one pattern, ordered, and provably lossless

`_FINDING_ID_BODY` is now a **single** pattern shared by `_FINDING_ID_RE` and
`_FINDING_ROW_RE`, because two spellings of one grammar is how the grammar drifts:

```python
_FINDING_ID_BODY = r"[A-Z]{2,6}-\d+\.\d+-\d+|[A-Z]{2,6}-\d+"
```

The dotted alternative is **first**, and that ordering is load-bearing: alternation is
ordered, and if the plain one were tried first, `GATE-13.1-01` would match as `GATE-13` —
the `.` satisfies "not alphanumeric" — so the register would gain a phantom id while losing a
real one. The negative lookahead was widened for the same reason in the other direction:
`(?![0-9A-Za-z]|\.[0-9A-Za-z])`, because the register also discusses the *template*
`GATE-13.x-nn` in prose (findings.md:205, :303, tasks.md:865), where the dotted alternative
cannot match (`x` is not a digit) and the plain one would then invent `GATE-13`.

[`raw/32`](raw/32-m6-grammar-probe.txt) measures all of it rather than reasoning about it:

```
parse_findings: 110 definitions  (71 plain + 39 dotted)
phantom truncated ids among definitions: []
truncated-looking matches anywhere (every live spec's requirements/tasks/findings/design): 0

pre-M6 grammar definitions : 71
post-M6 plain definitions  : 71
identical, in order        : True
owned by requirements.md: pre-M6=71  post-M6=71
plain ids lost by the widen: none
```

The 71 plain ids parse **byte-identically and in the same order**, so the widen is purely
additive to what the validator saw.

**The ordering trap is not hypothetical, and this batch fell into it.** `raw/owner-map.py`,
written to derive the ownership map, spelled its own second copy of the id grammar with the
alternatives in the wrong order and duly reported 6 ids as "missing" that were present,
having matched `GATE-13.3-16` as `GATE-13` — within the hour of the comment being written
that warns about exactly this. It now imports
`validate_spec_governance._FINDING_ID_RE` instead of re-spelling it, and the slip is left
recorded in the file's comment rather than quietly fixed: it is the strongest available
evidence that the ordering matters.

### 3.4 The ownership: 39 findings, 55 pairs, 0 wrong

Every one of the 39 was checked against `requirements.md`'s **actual acceptance-criterion
text**, not against the register's column. The full audit, one row per finding with the
criterion quoted, is [`raw/36-m6-ownership-audit.md`](raw/36-m6-ownership-audit.md).

**0 of 39 assignments are wrong.** A few examples of what the check actually confirmed:

- `GATE-13.2-01` → R7, because **R7.1** says catalog writes "SHALL NOT accept
  institution/program/intake **display strings as identifiers**" and the finding *is*
  `student_draft_views.py:185` resolving an intake by display name.
- `GATE-13.2-03` → R10, because **R10.3** says stale versions "SHALL return a merge/reload
  conflict **without silently choosing the latest timestamp**", which is the finding verbatim.
- `GATE-13.3-13` → R15 and R10 and **not** R16, correctly: a `varchar` ceiling producing an
  unhandled 500 has nothing visual about it, and the column names R15.2/R15.3 and R10.
- `GATE-13.3-16` → R16, because **R16.3** says the global bottom navigation "SHALL not
  overlap, obscure, or compete with" wizard controls.

**One is incomplete rather than wrong, and it was recorded, not edited.** GATE-13.1-07's
column names R1 and R18; the criterion that says an evidence artifact is *immutable* in so
many words is **R2.7**, and the repository's own instrument agrees —
`helpers/evidence-dir.ts` opens with `Requirements: **R2.7** (an evidence artifact is
immutable), **R18.5**`. R1 and R18 are both genuinely accountable, so the column is one
requirement short rather than incorrect. `findings.md` is on this lane's DO-NOT-touch list
and the brief's correction clause is conditioned on an assignment being *wrong*, so R2's
`_Findings:` line was **not** given GATE-13.1-07 either — unilaterally adding an owner that
`requirements.md` claims and `findings.md` does not would break the very property
`owner-map.py --check` asserts. Handed to whoever next edits the register.

Multi-ownership is the register's existing convention, not something this item invented
(`TEN-08` is already owned by R4, R5 and R15; `STU-10` by R5, R9, R13 and R16), so each id
went into the `_Findings:` line of **every** requirement its column names — **55
(requirement, finding) pairs over 39 findings**, across 12 of the 18 requirements
([`raw/31`](raw/31-m6-owner-map.txt)):

```
R1   6   R2   2   R5   2   R7   3   R8   1   R10  4
R13  1   R14  2   R15 11   R16 15   R17  2   R18  6
```

The 55 pairs were **generated** from `findings.md`'s own column by
[`raw/owner-map.py`](raw/owner-map.py) and then re-verified against the edited file by
`owner-map.py --check` → **0 missing pairs** ([`raw/34`](raw/34-m6-owner-map-check.txt)), so
the register and the requirements cannot disagree by a transcription slip.

### 3.5 The pin, moved in the same edit

Task 0.2's `test_v2_spec_shape_is_parsed` pins the parsed finding count. Its history is now
four entries rather than three, and the comment carries all four because a number moving is
not the same thing as a number being wrong:

| value | when | why |
|---:|---|---|
| 70 | task 0.2 froze it | — |
| 71 | task 2.1 filed AUTH-07 | 13.6 §2.1 measured the `71 != 70` failure and deliberately left it, naming the right moment as "when the register is next edited" |
| 71 | after L9 registered the 39 | not an oversight — the grammar of the day could not see a dotted id |
| **110** | **M6** | 71 + 39, both edits together |

**Old value 71 · new value 110.** This is the same move L9 recorded when it took the pin
from 70 to 71 — except that this time the register is next-edited *by this item*, which is
the condition 13.6 §2.1 attached to it.

### 3.6 The guard, and the assertion GATE-13.6-04 exists to make

Widening the grammar means a future `GATE-13.7-01` row is now *parsed*, which is only an
improvement if the absence of an owner is then **caught**. Four self-tests were added
(20 → **24**), and they are complementary rather than redundant:

| test | what breaks it |
|---|---|
| `test_dotted_finding_without_owner_requirement_fails` | a dotted id that parses but whose absence from every `_Findings:` line goes unreported. Synthetic, so it holds whatever the real register contains |
| `test_dotted_finding_with_owner_requirement_passes` | a dotted id that can *never* be satisfied. Also asserts it is attributed to **R1** specifically, not merely "owned somewhere" |
| `test_every_registered_finding_has_an_owner_requirement` | rule 3 over the **real** register, plus `110` and `39` so a future grammar narrowing cannot make it pass vacuously |
| `test_finding_ids_are_not_truncated_by_a_dotted_neighbour` | any string in any live spec that the grammar truncates to a bare `GATE-<n>`. Verifies the lookahead against real text instead of trusting it |

### 3.7 The result

[`raw/35`](raw/35-m6-validator-after.txt):

```
Errors: 0  Warnings: 0
[admissions-v2-canonical-rebuild] status=planned reqs=18 findings=110 tasks=73 (checked=71)
RESULT: PASS                                   EXIT=0

Ran 24 tests … OK                              24/24

## R1.3 rule 3, stated explicitly
  findings parsed as DEFINITIONS : 110   (71 plain + 39 dotted)
  ids owned by some requirement  : 110
  rule-3 'unowned-finding' errors: 0
  -> 0 unowned over all 110: True
```

**Rule 3 reports 0 unowned over all 110.** That is the assertion GATE-13.6-04 exists to make
true, and it is now mechanical rather than documental. All four steps of the blocking
`spec-governance` workflow were run in the workflow's own order and each exits 0.

---

## 4. M7 — not touched, by design

`canonical_tenant_drift_guard._ALLOWED_PREDICATES` (11 entries) and
`legacy-brand-allowlist.allowlist` (19) are left exactly as they were. L9-L11 §4.2 ruled that
dating them needs the agreement of `beanola-production-readiness`,
`multi-tenant-beanola` and system-alignment-audit, which own them; this item holds no
authorisation over those specs. It remains the rest of **GATE-13.6-01**, with the owners
L9-L11 named.

---

## 5. Verification

### 5.1 Backend whole tree, serial, same invocation

`pytest tests/ -q -p no:cacheprovider -p no:randomly -rs`, both runs serial on the isolated
local stack:

```
before  43 failed, 5372 passed, 103 skipped, 2 xfailed, 1 xpassed   (378.53s)   raw/00
after   41 failed, 5374 passed, 103 skipped, 2 xfailed, 1 xpassed   (587.62s)   raw/51
```

Diffed **header by header**, not netted ([`raw/53`](raw/53-whole-tree-delta.txt)):

```
CLOSED (2):
  - test_migration_history_report_freshness.py :: test_committed_release_report_covers_every_june_plus_script_on_disk
  - test_migration_history_report_freshness.py :: test_committed_release_report_is_fresh_and_complete
NEW (0):
unchanged: 41
```

**2 closed, 0 new. 0 setup errors on both sides.** Skips **103 → 103**, with 32 `SKIPPED`
lines and 32 distinct reason strings on both sides and the reason sets diffing **identical**
— the 102 → 103 movement happened in the baseline and is attributed in §0. The cluster
tables ([`raw/01`](raw/01-baseline-clusters.txt) →
[`raw/52`](raw/52-after-clusters.txt)) are produced by **M3's own instrument, reused
unchanged**, so the two are comparable: `J-migreport` goes **2 → 0** and every other cluster
is untouched.

Against 13.6 §18.1's carried figure the movement is 44 → 41, of which 1 is the baseline
skip-guard (§0) and 2 are M4's.

### 5.2 Frontend

[`raw/55`](raw/55-frontend-gates.txt) — none of the three regressed:

```
bun run lint         0 errors                                    exit=0
type-check           tsc -p tsconfig.build.json --noEmit          exit=0
bun run test         Test Files  494 passed | 1 skipped (495)
                          Tests  4620 passed | 1 skipped (4621)   exit=0
```

### 5.3 `manage.py check`

[`raw/54`](raw/54-django-check.txt), with the real `backend/.env`, `TESTING` **not** exported
and `REDIS_URL` **not** substituted (either produces a spurious `django_ratelimit.E003`):

```
System check identified no issues (1 silenced).                   exit=0
```

The two warnings (`SECRET_KEY not set`, `LENCO_API_SECRET_KEY is not set`) are byte-identical
to M3's, M1-M2's and L2-L3's recordings of the same command.

### 5.4 Local databases and containers

[`raw/50`](raw/50-localdb-preflight.txt). Postgres `mihas_localtest` on `127.0.0.1:5433`,
Redis on `127.0.0.1:6380`, via the isolated `backend/.env.local.test` stack
(`backend/.localtest-host-env.sh`), so the Neon DSN cannot leak into a test run.

- `test_%` verified **empty before** (11:08Z) and **empty after**.
- M4's throwaway `v2_mig_history_m4` was created for the regeneration and **dropped after**,
  returning the stack to the 0-`test_%`-0-`v2_%` state the batch found.
- Containers left **running**. `down -v` was never used on them. The *harness* stack, which
  is a different compose project, was brought up and taken down with `harness down` as the
  batch's own instruction required.

Every backend run was **serial**. No two pytest processes ran at once, so the spurious
`psycopg2.errors.DuplicateDatabase` that a concurrent second run produces — and the silently
un-run tests behind it — did not occur.

---

## 6. What is NOT claimed

1. **The gate is not closed and this document does not close it.** No `"status":
   "completed"` was written, `docs/canonical-truth-map.md` was not touched, `tasks.md` was
   not edited, and 13.5's `sign-off.md` was neither signed nor filled. 13.6 §18.2's O1–O10′
   are untouched and remain the whole remaining gate.
2. **M4 does not make the report true of production.** It is a fresh-from-empty
   *canonical-committed-path* record, which is what R15.8 and 3.6 ask for. The
   production report stays operator-gated exactly as 3.6 §2 describes, and
   `migration-history.neon-default.json` remains legitimately stale by design — it was not
   regenerated, because the Neon default branch is the authoring database and its staleness
   is the DATA-09 condition the tool exists to surface.
3. **M4 did not regenerate `00_full_schema.sql`,** and no committed path can (§1.7). It
   still declares `"intake" varchar(100)`. Owner: task 3.1.
4. **M5 did not fix the 8 failures the full run surfaced.** All 8 are proven pre-existing
   (§2.5) and every one belongs to another lane: 4 to whoever owns 13.2's characterisation
   specs now that L1-L4 closed the defect they characterise, 2 to 4.x for `tenant-launch`'s
   Fees step, and 2 to the harness lane for the base profile's two-project shared-state
   shape. Nothing was skipped, allow-listed, weakened or deleted to reduce the number.
5. **M5's 180 s budget has 7 s of headroom on its slowest row** (173.0 s), measured on a
   load-limited box during a 340-test serial run. 0 of 340 exceeded it, but that margin is
   real and is the harness lane's to weigh against CI's existing `timeout-minutes: 40` job
   bound — which this run's 1.0 h required leg would itself exceed on this box. Recorded in
   [`raw/46`](raw/46-m5-durations.txt); `.github/workflows/v2-harness-smoke.yml` was **not**
   edited, being outside this item's authorisation.
6. **M6 did not touch `findings.md`.** The one incomplete owner column it found
   (GATE-13.1-07, §3.4) is recorded for the register's next editor, not corrected here.
7. **M7 is untouched** (§4), and M3's remaining 41 failures were not worked.
8. **Nothing was committed or staged.** `HEAD` is still
   `bae29a28d9657f288b3339062adb31285959c966`. The index carries **9** staged files, all of
   them pre-existing task-7.4 AI-removal deletions (`ai_cache.py`, `ai_circuit_breaker.py`,
   `ai_prompt_redactor.py`, `ai_service.py` and their five test modules) that were staged
   before this batch began; **0** of the files this batch changed are staged, checked one by
   one. Production was not contacted: no SSH, no `.pem`, no production query, no deploy. Neon
   was not touched at all — no branch created, no DSN read, `br-jolly-pine-ahybtg2e` unused,
   and `v2_snap_13_4` / `v2_fresh_13_4` / `v2_batch_13_4` never opened.

### Files changed

| file | item | change |
|---|---|---|
| `docs/v2-evidence/3.6/migration-history.release.json` | M4 | **regenerated** from a real DB by the canonical committed path (39 → 48 rows, 25 → 32 June+) |
| `docs/v2-evidence/3.6/migration-history.release.md` | M4 | regenerated markdown mirror |
| `docs/v2-evidence/3.6/freshness.release.json` | M4 | re-emitted: `ok: true`, 0 findings |
| `docs/v2-evidence/3.6/README.md` | M4 | header fingerprint, §2's row, and a third **Regeneration log** entry |
| `apps/admissions/playwright.harness.config.ts` | M5 | `timeout: 180_000`, `expect.timeout: 30_000`, `actionTimeout: 30_000`, `navigationTimeout: 60_000`, with the decision recorded in the file |
| `scripts/validate_spec_governance.py` | M6 | `_FINDING_ID_BODY` — one ordered pattern shared by both regexes; widened lookahead |
| `scripts/tests/test_validate_spec_governance.py` | M6 | pin 71 → 110; **4 tests added** (20 → 24) |
| `.kiro/specs/admissions-v2-canonical-rebuild/requirements.md` | M6 | 55 (requirement, finding) pairs added across 12 `_Findings:` lines |
| `docs/v2-evidence/13.6/remediation/M4-M5-M6/**` | all | this README, 31 raw artifacts, 3 instruments, 3 run-scoped harness output directories |

Nothing else in the tree was modified. `tasks.md`, `.config.kiro`,
`docs/canonical-truth-map.md`, `findings.md`, `backend/scripts/00_full_schema.sql`, every
existing SQL migration script, `docs/v2-evidence/13.5/sign-off.md`, and every evidence
directory other than `3.6/` and this one are unchanged.

All five of the files above are **untracked** in git (`git status` reports `??` for
`requirements.md`, `playwright.harness.config.ts`, both validator files and `3.6/`), as is
the whole of `docs/v2-evidence/` — this spec's working tree has never been committed. So
"changed" here means changed **in the working tree**, and there is no `git diff` to read;
the before/after values in this document are measurements taken before and after each edit
rather than a VCS comparison. `raw/16` records the same limitation for M4's report delta and
how its before column was captured instead.
