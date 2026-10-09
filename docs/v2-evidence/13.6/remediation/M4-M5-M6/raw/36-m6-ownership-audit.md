# M6 — the ownership audit: all 39, checked against requirements.md's own text

The brief's instruction was to *use* `findings.md`'s `Owner requirement(s)` column
but **verify each against `requirements.md`'s actual requirement text rather than
trusting the column**. This is that check, one row per finding, quoting the
acceptance criterion that makes the named requirement accountable.

**Result: 0 of 39 assignments are wrong.** One is *incomplete* (GATE-13.1-07,
§Note below) and is recorded rather than edited, because `findings.md` is on this
lane's DO-NOT-touch list and an incomplete-but-correct column is not a wrong one.

Multi-ownership is the register's existing convention, not something M6 invented:
`TEN-08` is already owned by R4, R5 and R15; `STU-10` by R5, R9, R13 and R16. Each
GATE id was therefore added to the `_Findings:` line of **every** top-level
requirement its column names — 55 (requirement, finding) pairs over 39 findings.

---

## 13.1 — eight findings

| finding | owner(s) | the criterion that makes it accountable | verdict |
|---|---|---|---|
| `GATE-13.1-01` | R15 | **R15.4**: "ALL tenant foreign keys SHALL be validated after an orphan remediation preflight; a remaining `NOT VALID` tenant constraint SHALL block V2." The finding *is* nine permanently-`NOT VALID` tenant FKs. | **correct** |
| `GATE-13.1-02` | R1, R18 | **R1.4**: "WHEN a test is required for release, THE test SHALL run without environment gating or `skip`" — a test that raises at fixture setup does not run, which is the same defect class in a different mechanism. **R18.3**: "THE gate SHALL run backend unit/integration/property/concurrency tests…". | **correct** |
| `GATE-13.1-03` | R14, R1 | **R14.2**: "THE OpenAPI schema SHALL … be generated from the candidate backend" — a generator that defaults `DATABASE_URL` to SQLite is not generating from the candidate. **R1.5** (GOV-05): the release report must not describe unverified behaviour as complete. | **correct** |
| `GATE-13.1-04` | R8, R17 | **R8.4**: "EACH command SHALL be idempotent where retry is possible, **lock the affected workflow rows**…" — 8 reviewers allocated against a cap of 3 is an unlocked row. **R17.1**: "EVERY multi-step command SHALL define transaction boundaries, idempotency…". | **correct** |
| `GATE-13.1-05` | R15, R14 | **R15.8**: "THE migration history report SHALL be generated from the database, include every June 2026 and later migration…" — this is M4's half. **R15.2**: the schema verifier introspects tables (the `EXPECTED_TABLES` half). **R14.1**: "stable code" (the `ERROR_CODES` half). All three registries land inside the two named requirements. | **correct** |
| `GATE-13.1-06` | R15 | **R15.1**: "SQL migrations SHALL follow expand, backfill, verify, switch, and contract" — a rollback script that is not inverse-additive breaks the contract half. | **correct** |
| `GATE-13.1-07` | R1, R18 | **R1.2**: a finding's "closure evidence" is meaningless if a later run overwrites it. **R18.5**: "RELEASE evidence SHALL record commit SHA, build/version … known exceptions, and rollback decision." | **correct, but incomplete — see Note** |
| `GATE-13.1-08` | R15 | **R15.1**: "each change SHALL be **checksum-tracked**" — a 12-character truncated checksum is not. **R15.8**: the report links the fingerprint. | **correct** |

### Note — GATE-13.1-07's column is incomplete, not wrong

The criterion that says an evidence artifact is **immutable** in so many words is
**R2.7**: *"…immutable historical launch evidence SHALL remain labeled with the
release and commit that produced it."* The repository's own instrument agrees —
`apps/admissions/tests/harness-e2e/helpers/evidence-dir.ts` opens with
`Requirements: **R2.7** (an evidence artifact is immutable), **R18.5**`.

So the honest owner set for GATE-13.1-07 is R1 + R18 + **R2**. The column names
R1 and R18, both of which *are* genuinely accountable, so the column is not
**wrong** — it is one requirement short. `findings.md` is on this lane's
DO-NOT-touch list, and the brief's correction clause is conditioned on an
assignment being *wrong*; an incomplete-but-correct column does not meet it. So it
is recorded here for whoever next edits the register, and R2's `_Findings:` line
was **not** given GATE-13.1-07 — because requirements.md and findings.md agreeing
is the property `raw/owner-map.py --check` asserts, and unilaterally adding an
owner requirements.md claims and findings.md does not would break exactly that.

## 13.2 — three findings

| finding | owner(s) | the criterion | verdict |
|---|---|---|---|
| `GATE-13.2-01` | R7, R10, R15 | **R7.1**: "…SHALL NOT accept institution/program/intake **display strings as identifiers**" — the finding is `student_draft_views.py:185` resolving an intake by display name. **R7.7**: the two-tenant same-name test. **R15.3**: inconsistent assignment snapshots fail the gate. **R10.5**: canonical IDs and snapshots. | **correct** |
| `GATE-13.2-02` | R7 | **R7.6**: "CAPACITY and waitlist operations SHALL … maintain constrained non-negative counters" — a `SEAT_STATUSES` that omits `enrolled` hands a held seat back. | **correct** |
| `GATE-13.2-03` | R10 | **R10.3**: "stale versions SHALL return a merge/reload conflict **without silently choosing the latest timestamp**." The finding is a stale tab's reload reverting a newer write. Verbatim. | **correct** |

## 13.3 — sixteen findings

Fifteen are R16; two carry a second owner; one is not R16 at all.

| finding | owner(s) | the criterion | verdict |
|---|---|---|---|
| `GATE-13.3-01` `-03` `-04` `-05` `-06` `-15` | R16 | **R16.2**: "EVERY pointer target SHALL be at least 44 by 44 CSS pixels." Six sub-44 controls. | **correct** |
| `GATE-13.3-02` `-11` | R16 | **R16.1** ("designed at 320 CSS pixels first") + **R16.2** (names/descriptions meet WCAG 2.1 AA). Both defects are *at* 320 px. | **correct** |
| `GATE-13.3-07` | R16, R17 | **R16.7**: "…or **layout shifts** at 320x568, 375x667, 390x844…". **R17.6**: "PERFORMANCE gates SHALL measure mobile interaction … using representative data and published budgets." CLS over budget is both. | **correct** |
| `GATE-13.3-08` `-12` | R16 | **R16.2**: focus order, names, descriptions, errors "SHALL meet WCAG 2.1 AA" — heading order and contrast are AA criteria. **R16.4** for the token half of contrast. | **correct** |
| `GATE-13.3-09` | R13, R16 | **R13.13**: "ONE canonical student application workspace SHALL own status, next action, …; duplicate routes SHALL redirect to it." **R13.2**: the tracker shows canonical status history. **R16.8**: current status "SHALL remain understandable". A workspace that reports zero applications to an owner of two fails all three. | **correct** |
| `GATE-13.3-10` | R16 | **R16.8**: "…under 400 percent text zoom, reduced motion, slow network, and **offline/reconnect** scenarios." A raw `TypeError` is not understandable. | **correct** |
| `GATE-13.3-13` | R15, R10 | **R15.2** (introspect column *types*) + **R15.3** (drift fails the gate) — the defect is a column narrower than its input. **R10.9**: "THE start-draft command SHALL accept the minimum canonical selection needed to **create a valid server draft**" — a legally-named intake makes create 500. Note it is **not** filed against R16, correctly: nothing about it is visual. | **correct** |
| `GATE-13.3-14` | R16 | **R16.4**: "CONTENT SHALL use the approved light-only Beanola design tokens" — 3 of 11 declared families rendering is the token stack not being used. | **correct** |
| `GATE-13.3-16` | R16 | **R16.3**: "The global bottom navigation SHALL not **overlap, obscure, or compete with** wizard controls." **R16.7**: "overlapping fixed surfaces". **R16.5**: primary-workflow content. | **correct** |

## 13.4 — three findings

| finding | owner(s) | the criterion | verdict |
|---|---|---|---|
| `GATE-13.4-01` | R2, R5 | **R2.2**: "MIHAS, KATC, and other institutions SHALL appear **only** as resolved tenant data, explicit fixtures, or Legacy_Exceptions" — a `institution_id IS NULL` platform fallback row carrying a legacy brand is none of the three. **R5.3 / R5.6**: templates are tenant-scoped and versioned. | **correct** |
| `GATE-13.4-02` | R15 | **R15.7**: "READ-ONLY evidence SHALL compare local/test Postgres, a fresh schema, a Neon branch, **and production**" — a restored production lineage that cannot be brought forward defeats that comparison. **R15.1**: runner-contract idempotence. | **correct** |
| `GATE-13.4-03` | R18 | **R18.7**: the rollout uses "monitored migration … **automated rollback criteria**" — a runbook whose first command cannot succeed has no rollback path. **R18.5**: release evidence records the rollback decision. | **correct** |

## 13.5 — five findings

| finding | owner(s) | the criterion | verdict |
|---|---|---|---|
| `GATE-13.5-01` | R15 | **R15.2** (introspect "columns, **types**") + **R15.3** ("UNEXPECTED drift … SHALL fail the release gate"). The finding is precisely a verifier that documents the drift class as out of scope so the gate passes. | **correct** |
| `GATE-13.5-02` | R7, R10, R15 | Same criteria as GATE-13.2-01, which it *is* — measured live on the production lineage. | **correct** |
| `GATE-13.5-03` | R5, R18 | **R5.1 / R5.2**: the domain state machine and the fail-closed resolver — a stack with three fixed site blocks and zero `institution_domains` rows cannot serve a host-scoped tenant. **R18.7**: "SHALL use a canary tenant". | **correct** |
| `GATE-13.5-04` | R18 | **R18.7**: "**a** canary tenant" — two tenants simultaneously exposed is not one. | **correct** |
| `GATE-13.5-05` | R2, R18 | **R2.1**: version/identity metadata comes "from drift-guarded sources"; **R2.2**: the public platform identity is Beanola. Two documents disagreeing about production's host is an identity defect. **R18.7**: the post-deploy window's HTTP checks aim at a host. | **correct** |

## 13.6 — four findings

| finding | owner(s) | the criterion | verdict |
|---|---|---|---|
| `GATE-13.6-01` | R1, R15 | **R15.6**: "LEGACY fields SHALL be output-only snapshots or **named Legacy_Exceptions**" — a register entry with no owner is not named. **R1.2**: a finding carries an owner. | **correct** |
| `GATE-13.6-02` | R1 | **R1.3** rule 3 verbatim: "a finding has no owner requirement". | **correct** |
| `GATE-13.6-03` | R15 | **R15.1**: "idempotent according to the **migration runner contract**" — the defect is in the runner's transaction handling, which is what that clause governs. | **correct** |
| `GATE-13.6-04` | R1 | **R1.3** verbatim. This item. | **correct** |

---

## Derivation, not transcription

The 55 pairs written into `requirements.md` were generated from `findings.md`'s own
column by [`owner-map.py`](owner-map.py) and then re-verified against the file by
`owner-map.py --check` (0 missing pairs), so the register and the requirements
cannot disagree by a typo. That instrument had its own bug on first run — it spelled
a second copy of the id grammar with the alternatives in the wrong order and reported
6 present ids as missing, having matched `GATE-13.3-16` as `GATE-13`. It now imports
`validate_spec_governance._FINDING_ID_RE` instead of re-spelling it. Left recorded in
the file's comment rather than quietly fixed: it is the strongest available evidence
that the alternation order in `_FINDING_ID_BODY` is load-bearing, since it was
reproduced by accident within the hour of the comment being written that warns about it.
