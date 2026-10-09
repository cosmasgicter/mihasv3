# Task 13.2 — Run the two-tenant golden and adversarial matrix

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Phase 13, second bullet
Requirements: **R18** (whole; R18.2 and R18.4 in particular)
Findings: **all P0/P1 workflow findings**
Required_Evidence: **Playwright traces/videos/screenshots, DB invariant report, drained queues**

---

## The claim table

Three matrices, three measurements. Every row of every matrix is a separate test,
so the run reports the rows rather than a total.

| Matrix | What was run | Result |
|---|---|---|
| **1. Isolation** — 16 named surfaces, tenant A and tenant B on the **same program name and the same intake name** | [`two-tenant-isolation-matrix.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/two-tenant-isolation-matrix.spec.ts), 17 tests | **15 of 16 surfaces hold. The 16th is the finding**: S06 capacity reads the *other tenant's* intake capacity (GATE-13.2-01) |
| **2. Golden journey** — the complete lifecycle, 18 named steps in order | [`two-tenant-golden-journey.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/two-tenant-golden-journey.spec.ts), 1 test × 2 viewports | **17 of 18 steps performed; step 2 (verify) does not exist to perform** and is measured as removed-by-design |
| **3. Adversarial** — 8 named injections | [`two-tenant-adversarial-matrix.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/two-tenant-adversarial-matrix.spec.ts), 9 tests | **8 of 8 injected and survived.** One carries an intermittent finding that did **not** reproduce on the recorded run (GATE-13.2-03) |
| **DB invariant report** | [`invariants.sql`](invariants.sql) → [`raw/invariants-harness.txt`](raw/invariants-harness.txt), 9 gates | **7 gates clean, 1 context-only, 1 drift attributed** (GATE-13.2-02) |
| **Drained queues** | `harness/bin/harness drain` **after** the adversarial half | `broker_queue_depth: 0`, `unsettled_payment_collections: 0` ([`raw/harness-drain.txt`](raw/harness-drain.txt)) |
| Traces / screenshots | 28 traces, 28 screenshots, 2 HTML reports ([`raw/artifacts-index.txt`](raw/artifacts-index.txt)) | **video could not be produced on this OS** — §7 |

```
$ bunx playwright test -c playwright.harness.13-2.config.ts --project=chromium-13-2
  27 passed (2.1m)                          ← 1 of the 27 is an EXPECTED failure (S06)
$ bunx playwright test -c playwright.harness.13-2.config.ts --project=mobile-13-2
  1 passed
TOTAL  passed=27  expected-failure=1  unexpected=0
```

**Four findings, none fixed.** Three are new; one is 13.1's, re-measured.

| id | sev | what | owner |
|---|---|---|---|
| **GATE-13.2-01** | **high** | the staff application read publishes the **other tenant's** intake capacity, because it resolves the intake by display **name** (§3.6) | admin-query lane (`student_draft_views.py:185`, and 4 siblings) |
| **GATE-13.2-02** | med | `CapacityService.SEAT_STATUSES` omits `enrolled`, so its own `reconcile()` would hand an enrolled student's seat back (§5.5) | capacity lane (5.3 / 9.x) |
| **GATE-13.2-03** | med | a stale tab's reload **reverted** another device's newer write to the same draft — **intermittent, 2 of 3 recordings** (§6.3) | wizard lane (`useAutoSave`) |
| GATE-13.1-02 | high | 7 of the 16 isolation surfaces have backend coverage that has not executed since task 9.4, so these browser rows are their only live coverage (§8) | admin-query/scope lane (9.4) |

---

## What this task establishes

1. **The collision had to be built, because the harness does not ship it.**
   `harness_seed_tenants` deliberately gives its two tenants *distinguishable*
   names. A name-keyed lookup cannot cross tenants while the names differ, so a
   matrix run against the seed as-shipped would have reported isolation it never
   tested. This task gives both seeded tenants an offering with the **identical
   `name`** and several intakes with the **identical `name`** and deliberately
   **different capacities and fees**, so a wrong row is *observable* rather than
   merely possible (§2).
2. **Fifteen of the sixteen surfaces hold under that collision, and the
   sixteenth does not.** Every cross-tenant probe on drafts, grades, custom
   documents, waitlist, promotion, payment, amendments, notifications, review,
   official documents, audit, settlement and public tracking is a masked 404 or a
   refused command with no mutation — each paired with **the same call succeeding
   on the actor's own tenant**, so a refusal means *scope* and not *capability*.
   Capacity does not hold: it is read by name (§3.6, GATE-13.2-01).
3. **Two of the eighteen golden steps are not executable in the bullet's order,
   and the platform is right both times.** An amendment may only be requested
   before a decision, and an official document may not be *issued* by an enrolled
   applicant though it stays readable. Both constraints are named and the journey
   follows the platform's order rather than quietly reordering (§4.2).
4. **One golden step cannot be performed at all**, and saying so is the
   measurement: email verification was removed by task 1.6 (R9.7, STU-21). The
   journey asserts the removal instead — no verify route (404), registration mints
   no session, login is not gated (§4.3).
5. **Two of the eight injections produced a stronger result than the row asked
   for.** A lost submit response was answered `409 IDEMPOTENCY_PENDING` — the
   platform refusing to start a second execution, which is better than replaying a
   cached one — and a signed `collection.successful` webhook carrying **no provider
   reference** was declined by the payment integrity gate with a
   `missing_provider_reference` risk flag rather than settling money on the
   callback's word (§6.5, §6.7).
6. **The DB invariant report is where the capacity finding gets its second
   witness, and where one of this task's own instruments was caught being wrong.**
   Gate 5's first draft grouped waitlist positions by intake **name** and duly
   reported two separate queues as one duplicated position. The instrument has to
   obey the rule it audits (§5.4).
7. **GATE-13.1-07 did not fire.** 13.1 §7.1 catalogued three instruments that
   rewrite earlier tasks' evidence; this task's config points its report, its
   artifacts and its HTML report at `13.2/raw/`, and it runs no spec that writes
   into `11.1`–`11.5`. Task 0.4's `playwright-report.json` is byte-identical and
   older than this session, and all five screenshot directories are untouched
   (§9). The finding is unchanged for anyone running the base config.

---

## Files

```
docs/v2-evidence/13.2/
├── README.md                       ← this index
├── invariants.sql                  ← THE DB INVARIANT REPORT: 9 read-only gates
└── raw/
    ├── identity-toolchain.txt      (commit, OS, docker/bun/playwright/chrome, stack, instrument hashes)
    ├── matrix-rows.txt             ← every row of every matrix, with its annotations: 16 surfaces, 18 steps, 8 injections
    ├── extract_rows.py             (the instrument that produced it, from the Playwright JSON)
    ├── run-desktop.txt             (chromium-13-2: 27 passed, 1 expected failure, 0 unexpected)
    ├── run-mobile.txt              (mobile-13-2: the golden journey at Pixel 5)
    ├── playwright-desktop.json     (machine-readable, incl. expectedStatus so S06 is not read as a regression)
    ├── playwright-mobile.json
    ├── invariants-harness.txt      (the 9 gates, answered against the harness database)
    ├── harness-drain.txt           (broker 0, unsettled collections 0 — AFTER the adversarial half)
    ├── harness-down-pre.txt        ("freshly seeded" as a measurement: 0 containers, 0 volumes)
    ├── harness-up.txt, harness-down-mid.txt, harness-down.txt
    ├── capacity-leak.txt           (GATE-13.2-01 in full: the code, its 8 siblings, both counter-examples, the DB view)
    ├── f3-recordings.txt           (GATE-13.2-03: all three recordings, including the one that did NOT reproduce)
    ├── backend-coverage-gap.txt    (GATE-13.1-02 mapped onto the 16 surfaces, measured not inferred)
    ├── gate-13-1-07-check.txt      (all three write paths checked, before and after)
    ├── artifacts-index.txt         (28 traces, 28 screenshots, why video is absent, why two slices)
    ├── artifacts-desktop/          (27 traces + 27 screenshots, one per test)
    ├── artifacts-mobile/           (1 trace + 1 screenshot)
    └── html-report-desktop/, html-report-mobile/   (npx playwright show-report …)
```

---

## 1. How it was run, and why in slices

Isolated task-0.4 harness, strict gates active, `HARNESS_PW_CHANNEL=chrome`
(Playwright's bundled Chromium is unsupported on this OS). `harness down`
(volumes wiped) before and after; the pre-state is recorded so *"freshly seeded"*
is a measurement rather than an adjective — **0** harness containers, **0** harness
volumes ([`raw/harness-down-pre.txt`](raw/harness-down-pre.txt)).

**Two slices on one freshly seeded stack, and the slicing is recorded** because
12.4 §12.2 and 13.1 §6.1 both measured this box as load-limited:

| slice | project | tests | wall |
|---|---|---:|---|
| 1 | `chromium-13-2` — all three matrices | 27 | 2.1 min |
| 2 | `mobile-13-2` — the golden journey only | 1 | 17 s |

The mobile project is narrower **for this task's own run** and the reason is
stated rather than assumed: the isolation and adversarial matrices make almost no
viewport-dependent claim (they assert authority, ledger and queue state over HTTP
plus a handful of rendered surfaces), and R18.2's "desktop and mobile" clause is
carried by the journey that is actually a journey. All three files live in
`tests/harness-e2e/required/`, so the **base** required profile now runs all three
at both viewports.

Between slices the artifact directory is snapshotted, because Playwright clears
its `outputDir` at the start of every run — measured: after the mobile slice, **1
of 28** traces had survived. Hence `artifacts-desktop/` and `artifacts-mobile/`.

**Nothing was fixed.** No product source, service, migration or register was
changed. The only writes are `docs/v2-evidence/13.2/**` and the four new test-side
files listed in [`raw/identity-toolchain.txt`](raw/identity-toolchain.txt).
**Neon and production were not touched** — not connected to, not queried, not
modified. The invariant SQL is written to run on either and was run only against
the disposable harness database.

---

## 2. The condition: same program name, same intake name

The bullet's first clause is not a scenario, it is a **precondition**, and the
whole matrix depends on it holding.

```
tenant A = MIHAS  (mihas.localhost, seeded ACTIVE domain)
tenant B = KATC   (katc.localhost,  seeded ACTIVE domain)

offering name  "Shared Offering Name <stamp>"   ← identical in BOTH tenants
                (Program.name has no unique constraint; Program.code does,
                 so only the codes differ, and both point at ONE CanonicalProgram)
intake name    "Shared Intake Name <stamp>"     ← identical, on 4+ intake rows
                (Intake.name has no unique constraint either)

capacity       A: 41   B: 97      ← deliberately different
fee            A: 153.00  B: 207.00
```

Measured, so a reader can tell whether the rest of the file was answered under the
collision (Gate 0):

```
 colliding_offering_names | colliding_intake_names | active_institutions
--------------------------+------------------------+---------------------
                        4 |                      4 |                   2
```

**Why the seeded tenants rather than two fresh ones.** Because the host has to
resolve. A domain created through `POST /admin/institutions/{id}/domains/` is born
`pending_dns` — correctly; that is task 4.4's lifecycle — and
`InstitutionContextService.resolve` binds a tenant only for a domain with
`status='active'`. A pair of freshly created tenants therefore resolves to the
**Neutral_Beanola_Context**, where a posted `institution_id` is still honoured as a
white-label restriction. A first draft of the fixture did exactly that and the
host-override probe returned **201, bound to the posted tenant** — the documented
neutral-context behaviour, and a vacuous test. `mihas.localhost` and
`katc.localhost` are seeded active, which is what makes "host override" and
"routing" answerable at all.

**Why the tenant admins are built rather than reused.** The seeded
`admin@{slug}.localhost` accounts carry `permissions: []`, i.e. the read-only
tenant bundle. A cross-tenant *review* probe against a read-only actor proves
nothing — it would be refused on its own tenant too. Each tenant here gets an
admin holding the **full** granted mutation set (`review`, `verify_documents`,
`verify_payments`, `export`, `manage`) scoped to that tenant alone, so every denial
in the matrix is a scope denial and nothing else. Verified per actor:

```
A caps: tenant.application.export, tenant.application.read, tenant.application.review,
        tenant.audit.read, tenant.document.read, tenant.document.verify,
        tenant.domain.read, tenant.domain.request_change, tenant.payment.read,
        tenant.payment.verify, tenant.profile.read, tenant.profile.request_change,
        tenant.program.read, tenant.program.request_change, tenant.staff.disable,
        tenant.staff.invite, tenant.staff.read
```

---

## 3. Matrix 1 — the isolation matrix, 16 rows

The bullet lists fifteen comma-separated items; `waitlist/promotion` is two
distinct behaviours (a position is *assigned*; a freed seat *promotes*), so it is
split, giving sixteen. Full per-row output with every assertion:
[`raw/matrix-rows.txt`](raw/matrix-rows.txt).

| # | surface | claim | result |
|---|---|---|---|
| **S01** | host override | a posted foreign `institution_id` on a resolved host is refused, and creates nothing | **PASS** — `403 INSTITUTION_OVERRIDE_NOT_PERMITTED`; draft count unchanged; both hosts verified `white_label`; the neutral host resolves `institution_id: null` with Beanola branding |
| **S02** | routing | identical names notwithstanding, the **host** decides the offering | **PASS** — A's draft binds A's offering, B's binds B's, while `program`/`intake` snapshots are byte-identical; A's host + B's intake id → `400 NO_ELIGIBLE_OFFERING` |
| **S03** | drafts | a draft is a masked 404 to the other tenant's admin, and absent from its roster | **PASS** — own 200, cross 404, roster contains A and not B |
| **S04** | grades | ditto for persisted Grade 12 results | **PASS** — own 200 with 5 rows, cross 404 |
| **S05** | custom docs | a tenant's own document requirement gates only its own applicants | **PASS** — A's offering-scoped requirement appears for A's applicant, is absent for B's, and is unreadable in B's config list |
| **S06** | capacity | the capacity reported for an application is its own tenant's | **FAIL (expected)** — **GATE-13.2-01**, §3.6 |
| **S06b** | capacity | the canonical binding is right even where the published number is not | **PASS** — `program_offering_id` correct on both; the two tenants report the *same* capacity |
| **S07** | waitlist | a waitlist position is scoped to the tenant that issued it | **PASS** — the owner reads position > 0, B's admin gets 404, B's own applicant is `NOT_WAITLISTED` |
| **S08** | promotion | freeing a seat in one tenant changes nothing in the other | **PASS** — B's status and empty queue unchanged across A's rejection; A's own promotion outcome recorded, not asserted (§3.7) |
| **S09** | payment | a payment is invisible and unverifiable outside its tenant | **PASS** — settled at A's fee (153.00); present in A's list, absent from B's; B's verify → 404 |
| **S10** | amendments | an amendment is unlistable and unreviewable outside its tenant | **PASS** — with a precision, §3.8 |
| **S11** | notifications | a student's inbox is theirs; no admin reads across the boundary | **PASS** — no message id shared between the two students; `GET /notifications/user/{id}/` refused cross-tenant |
| **S12** | review | a cross-tenant review command is refused **and mutates nothing** | **PASS** — 404; status and `version` unchanged; the same command from A's admin succeeds |
| **S13** | official documents | an official artifact is unreachable outside its tenant | **PASS** — B's admin refused on list, read and issue; B's *student* refused identically |
| **S14** | audit | audit rows are readable only inside their own institution scope | **PASS** — A's trail non-empty and scoped to A, no row referencing B; B's trail 404; the platform trail refused to a tenant admin |
| **S15** | settlement | money reports carry one tenant's rows and one tenant's amounts | **PASS** — every settlement row is the reading tenant's; `?institution_id=<other>` → masked 404 on both the settlement and the fee report; A's fee report carries 153.00 and not 207.00 |
| **S16** | public tracking | a tracking secret resolves to exactly one tenant, with no PII | **PASS** — each code resolves anonymously to its own tenant, never names the other, publishes no `nrc`/`phone`/`email`/`date_of_birth`; an unknown code discloses neither tenant |

### 3.6 GATE-13.2-01 — capacity is read by display name, and it crosses tenants

```python
# backend/apps/applications/student_draft_views.py:185  (staff read of an application)
intake = Intake.objects.filter(name=app.intake, is_active=True).first()
if intake:
    data["intake_capacity"]   = intake.max_capacity
    data["intake_enrollment"] = intake.current_enrollment
```

`app.intake` is the **display snapshot**. `.first()` over a name is not a
tenant-scoped lookup and carries no ordering, so under the collision both tenants'
applications report whichever row Postgres yields first:

```
S06  Expected: 41      ← tenant A's configured capacity
     Received: 97      ← tenant B's
```

and the direction is not stable — an earlier recording in the same session showed
the converse (tenant B's application reporting 41, tenant A's value). Eight
sibling name-keyed lookups exist on the same pattern and are listed in
[`raw/capacity-leak.txt`](raw/capacity-leak.txt); five of them are on admissions
read/decision paths.

**What it is not.** `applications.intake_id` is correct in every row (Gate 2, zero
mismatches), and the capacity a *decision* uses comes from `ProgramIntake` under a
row lock. What leaks is a number on a staff screen — which is still a cross-tenant
read, and still what `docs/canonical-truth-map.md` forbids.

**Why the row is annotated `test.fail()` rather than left red or weakened.** The
assertion states the **correct** claim, so it cannot be read as blessing the
behaviour; the test still executes (it is not a skip, which the harness gate
forbids outright); the counter-example is captured in the trace; and the day the
lookup is repointed at `intake_ref_id`, the test fails *because it passed*, which
is the notification the owning lane wants. S06b then asserts, in the direction
that is true today, that the two tenants report the same number — so the
measurement is on the record either way.

### 3.7 What S08 asserts, and what it only records

Which applicant the platform promotes when a seat is freed, and when, is the
waitlist lane's contract (`WaitlistManager`), not this bullet's. S08 therefore
**asserts** the isolation claim — tenant B's applicant and tenant B's empty queue
are untouched by A's rejection — and **records** tenant A's own outcome as an
annotation. Overstating it would have made this file fail for another lane's
reason.

### 3.8 One precision on S10: the amendment list is an *ownership* boundary

`ApplicationAmendmentView` resolves through
`authorize_owned_application(..., allow_scoped_staff=False)`, so **every**
non-owner — including the owning tenant's own admin — receives one
indistinguishable 404 (AUTH-07). Measured here first, because a cross-tenant list
probe would otherwise have been reported as a *tenancy* result when it is an
ownership one. S10 therefore makes the ownership claim on the list (owner 200, the
other tenant's student 404) and the **tenant** claim on the review command, which
is the staff-scoped one: B's admin 404 with the amendment still `pending`
afterwards, A's admin 200.

---

## 4. Matrix 2 — the golden journey, 18 steps

One applicant, one browser context, one sequence, at both viewports. Every step
records its own result; the full list is in
[`raw/matrix-rows.txt`](raw/matrix-rows.txt).

| # | step | recorded result |
|---|---|---|
| 1 | register | `201` on `mihas.localhost` for a brand-new account |
| 2 | verify | **NOT PERFORMED — removed by design** (§4.3) |
| 3 | login | signed in **through the page**; landed on `/student/dashboard` |
| 4 | profile autosave | value persisted with no save action and survived a page reload |
| 5 | two drafts | 2 drafts for the **same** program+intake, both listed, one resumed by explicit `?mode=resume&draftId=` |
| 6 | assignment | canonical offering bound by the host; reviewer assigned through `POST …/assign/` |
| 7 | five grades | 5 unique ECZ subjects persisted (the `readiness_service` floor) |
| 8 | documents | every published requirement satisfied; nothing required left `missing` |
| 9 | pay/defer | deferred first, then **153.00 ZMW settled** — the tenant's own configured fee |
| 10 | submit | the student's own `POST …/submit/` with `confirm_submission`; reached `submitted` |
| 11 | interview/comms | 1 interview visible to the student via `?mine=true`; 3 platform messages in the one inbox |
| 12 | amendment | requested by the student, approved by an admin — **before** the condition (§4.2) |
| 13 | condition | assigned with the conditional offer, then verified `met` |
| 14 | approval | `conditionally_approved → approved` |
| 15 | official docs | `application_slip` issued at `approved` and reached `ready` — **before** enrollment (§4.2) |
| 16 | enrollment | server-authored deadline, then confirmed to `enrolled`; the issued slip stays readable (200) while a **re-issue** is a masked 404 |
| 17 | tracking | a fresh secret issued from the workspace, resolved **with no session** to the right application and status |
| 18 | withdrawal / new application where legal | refused from `enrolled` (`INVALID_STATUS_FOR_WITHDRAWAL`); allowed from `submitted`; a replacement draft for the same program+intake then accepted |

### 4.2 Two steps the platform's own rules reorder

The bullet's order is *condition → amendment* and *enrollment → official docs*.
Neither is executable, and in both cases the platform is right:

- **`AmendmentService`** admits a request only from `submitted` / `under_review` /
  `waitlisted`. Assigning a condition moves the application to
  `conditionally_approved`, from which an amendment is refused
  (`INVALID_STATUS_FOR_AMENDMENT`). So the amendment precedes the condition.
- **`_student_gate_open`** admits an `application_slip` only from
  `_NON_DRAFT_SUBMITTED_STATUSES`, which **excludes `enrolled`**: a terminal
  application may not mint a new artifact, though the owner may still read one
  already issued (task 10.4, design §11.3). So the artifact is issued at
  `approved` and *read back* at `enrolled` — which exercises **both** halves of
  that policy rather than one, and step 16 pins the refusal of a re-issue.

Naming the constraint is the point. Silently reordering would have hidden two real
product rules.

### 4.3 Step 2 cannot be performed, and that is the measurement

Task 1.6 removed email verification (R9.7, finding STU-21); `email_verified`
defaults `True` and is a registered Legacy_Exception
([`docs/v2-evidence/1.6/legacy-exception-email_verified.md`](../1.6/legacy-exception-email_verified.md)).
The journey asserts the removal instead of skipping the step:

- `POST /api/v1/auth/verify-email/` → **404** (the route does not exist);
- `GET /api/v1/auth/session/` immediately after registering → `authenticated: false`
  (registration mints no session); and
- login succeeds with no gate in between.

Reporting step 2 as "done" would have been false; omitting it would have hidden a
deliberate product decision. This is the one *stated gap* in the golden matrix.

---

## 5. The DB invariant report

[`invariants.sql`](invariants.sql) — nine read-only gates, following
[`12.3/invariants.sql`](../12.3/invariants.sql)'s shape: SELECT only, each gate
stating its own pass condition inline, safe to run on Neon or production at any
time. Answered against the harness database **after** all three matrices:
[`raw/invariants-harness.txt`](raw/invariants-harness.txt). Run twice, on two
independently seeded stacks, and **every figure below reproduced exactly** — 34
applications, 18 payments, 63 documents, 517 audit rows, 30 tenant-scoped rows, 2
drifting counters. On a box 13.1 §6.1 measured as load-limited that is worth
stating: the matrices are deterministic in what they leave behind, so a change in
any of these numbers is a signal rather than noise.

| Gate | What it proves | Result |
|---|---|---|
| **0** | the collision is real (context for 2 and 7) | 4 colliding offering names, 4 colliding intake names, 2 active tenants |
| **1** | no application is bound to the wrong institution | 34 applications, **0** mis-bound, **0** dangling, **0** offering-without-institution |
| **2** | no canonical id crosses a tenant, and no snapshot lies | **0** canonical-program crossings, **0** intakes not linked to their offering, **0** snapshots naming another tenant |
| **3** | no payment is attached to another tenant's application | 18 payments, **0** orphans, **0** payer≠applicant; money grouped per tenant |
| **4** | every tenant-scoped audit row names exactly one institution | 30 `tenant.*` rows, **0** without an institution, **0** naming a non-institution |
| **5** | capacity and waitlist counters reconcile against canonical rows | **2 rows drift by exactly 1, and the drift is 100% explained by enrolled applications** — GATE-13.2-02 (§5.5). **0** over capacity. Waitlist positions unique within every canonical queue |
| **6** | no document or official artifact crosses a tenant | 63 documents, **0** orphans, **0** uploader≠applicant, 4 platform-issued artifacts |
| **7** | exactly one active domain resolves each host | 2 resolvable rows, **0** hostnames with multiple active rows, **0** active domains on inactive institutions |
| **8** | nothing is left hanging (the DB half of the drain) | outbox **0** pending / **0** failed; **0** payments pending > 24 h; 2 webhook events logged, **1** duplicate rejected, **0** bad signatures |

### 5.4 One of this task's own instruments was wrong first, in exactly the way the matrix is about

Gate 5's waitlist query first grouped by `intakes.name`:

```
 institution | offering        | intake_name                 | waitlisted | distinct_positions
 MIHAS       | S13-2A15103361  | Shared Intake Name 15103361 |          2 |                  1
```

which reads as *two applications sharing position 1* — a real defect, if it were
true. It was not: those were **two different intakes with the same name**, one
applicant at position 1 in each. Grouping by `a.intake_id` shows it:

```
 canonical_intake_id                  | waitlisted | distinct_positions
 28c5c3bf-5cc5-4e5d-9254-66c3ed28a70b |          1 |                  1
 c96e1013-9d37-48af-915c-460702e9cba4 |          1 |                  1
```

An instrument that audits name-keyed lookups has to obey the rule it audits. The
false finding was caught before publication; both queries and the reason are in
the file.

### 5.5 GATE-13.2-02 — the seat-status set omits the terminal success state

```
 drifting_rows | drift_exactly_explained_by_enrolled | drift_not_explained
             2 |                                   2 |                   0
```

`CapacityService.SEAT_STATUSES = ("submitted", "under_review", "approved",
"waitlisted")` — **`enrolled` is not in it**, and `IntakeEnforcer.sync_enrollment`
uses the same four. A submission takes a seat (counter +1); confirming enrollment
moves the row to `enrolled`, which the *live count* no longer counts while the
counter still holds the seat. The two golden journeys enrolled one applicant each,
and the report shows exactly two rows drifting by exactly one, entirely explained
by the enrolled count.

The counter is right — an enrolled student does occupy a seat. The hazard is that
`CapacityService.reconcile(offering, intake)`, which any later approve/reject on
that offering triggers, **recomputes the counter from that live count** and would
therefore hand an enrolled student's seat back to the waitlist. Not fixed; the
capacity lane's.

One thing this gate also confirms working: task 5.3's fix. `admin_review_views`
calls the **id-keyed** `CapacityService.reconcile` for canonical applications and
falls back to the name-keyed `IntakeEnforcer.sync_enrollment` only for legacy
rows, precisely so "a same-name other tenant is never swept in" — and under a
four-way name collision the report shows no cross-tenant contamination of any
counter.

---

## 6. Matrix 3 — the adversarial matrix, 8 injections

Each injection is aimed at the seam the production failure actually occurs at, not
at a mock. Each row ends by draining, and the file ends with a whole-matrix drain.

| # | injection | how it was injected | result |
|---|---|---|---|
| **F1** | offline | `context.setOffline(true)` around a reload of a live wizard | **PASS** — work saved before the outage survives it; writes resume on reconnect; the offline navigation failure is a *declared* error path |
| **F2** | refresh | `page.reload()` mid-wizard | **PASS** — draft intact; the in-memory CSRF token is re-minted by the `?refresh_csrf=1` bootstrap and the fresh token authorises a write |
| **F3** | tab/device switch | a second **browser context** signs in as the same student and writes | **PASS on the claim** (the server is the record; one draft stays one draft on both devices) **plus an intermittent finding** — §6.3 |
| **F4** | interrupted upload | `route.abort('aborted')` on the upload in flight | **PASS** — no document row left behind; the retry succeeds; 1 cancellation recorded, **0** unasserted failed requests |
| **F5** | lost submit response | `route.fetch()` **then** `route.abort()` — the server executed, the client never learned | **PASS** — §6.5 |
| **F6** | provider delay | MSISDN `…9999…`: the adapter answers `pending` for two polls | **PASS** — stays `pending`, never `failed`; a real `phase` with a positive budget; a second attempt creates **no second ledger row**; settles by itself |
| **F7** | duplicate callback | the same signed webhook delivered twice | **PASS** — §6.7 |
| **F8** | broker outage | `request_generation(..., dispatch=False)` — the platform's own call, with the view's own flag | **PASS** — committed `pending` with no task id; published `queued`; the platform's own sweep re-dispatched 1 job; artifact reached `ready`; **queues drained afterwards** |

**A cancellation is not a failure.** Task 8.3 established that `net::ERR_ABORTED`
is recorded as `gate.cancelledRequests` rather than a failed request — the browser
withdrew the call, so the platform never answered it. F1, F4 and F5 produce
cancellations by construction. Every *other* transport failure and every HTTP ≥ 400
still fails a run, and each row declares the specific error path it expects.

### 6.3 GATE-13.2-03 — a stale tab's reload reverted the other device's write, intermittently

Read from device 1's own session *before* the reload, the server held device 2's
value in every recording — the claim F3 asserts, and it is not in question. What
is **recorded** is what happens next, when device 1 reloads while its wizard still
holds pre-write form state:

| recording | device 2 wrote | server held after device 1's reload | |
|---|---|---|---|
| 1 (authoring) | `Device two 15047749` | `Lusaka` | **reverted** |
| 2 (authoring) | `Device two 16146525` | `Lusaka` | **reverted** |
| **3 (the recorded run)** | `Device two 16885941` | `Device two 16885941` | survived |

**So it did not reproduce on the run whose artifact is preserved**, and saying so
is the point — 2 reverts in 3 recordings, on byte-identical code, on a box 12.4
§12.2 and 13.1 §6.1 both measured as timing-sensitive. Only recording 3 has a JSON
report and a trace; the first two were overwritten by the runs that followed and
survive only as the values transcribed in
[`raw/f3-recordings.txt`](raw/f3-recordings.txt). Publishing run 3 alone would have
been the tidy choice and the false one, which is 13.1 §6.1's own rule applied where
it costs the flattering figure.

Auto-save is mandatory on every student form (`PRODUCT.md`) and `useAutoSave`
flushes a dirty form on `beforeunload`, so a recovery cache landing on top of a
newer server value is the plausible mechanism — which
`.kiro/steering/enterprise-tenancy.md` forbids: *"Local wizard snapshots are
recovery caches … never authoritative over the selected online draft."* **The
mechanism is not confirmed**: no code was read to prove it, no timing was
instrumented, and nothing was changed. When it happens it is silent data loss
across two devices for a student's own draft, which is why it is filed as a
finding rather than a curiosity.

Recorded rather than asserted, because asserting the revert would pin a defect as
correct and asserting the survival would fail a required test 2 runs in 3 for a
reason the wizard lane owns.

### 6.5 F5's answer was better than the row asked for

The retry of a lost submit was answered **`409 IDEMPOTENCY_PENDING`** — "Request
already in progress" — rather than replaying a cached 200. That is the *stronger*
behaviour: the platform refuses to begin a second execution of a command whose
first execution is still in flight. The row accepts either answer, records which
occurred, and asserts what actually matters in both cases: one application, one
`submitted_at`, at most one `submitted` transition in the recorded history, and no
forked draft. Insisting on 200 alone would have turned the better behaviour into a
failure.

### 6.7 F7 measured a security property, not just dedup

The redelivery was rejected — `webhook_event_logs.processing_error = 'Duplicate
event already processed'`, and Gate 8 counts it — and the ledger did not move.
Neither did the **first** delivery, and that turned out to be the interesting
half. `audit_logs` shows why:

```
payment.risk_flag  {"details": {"source": "integrity_gate"},
                    "risk_flag_type": "missing_provider_reference"}
```

A signed, known, non-duplicate `collection.successful` for a real reference was
**declined** because it carried no provider reference; the row later reached
`successful` through `poll_pending_payments_task`, which confirmed the outcome with
the provider and wrote a real `lenco_reference`. So a signed callback asserting
success is not sufficient authority to settle money. The row now asserts that
directly. The positive replay-convergence path stays where it is already covered
(`backend/tests/unit/test_payment_idempotence_8_2.py`).

### 6.9 The drain, after the adversarial half

```
$ harness/bin/harness drain
  queue-depth: {"broker_queue_depth": 0, "celery_queues": ["celery"],
                "unsettled_payment_collections": 0, "unsettled_references": []}
  ✓ no undrained required jobs
```

**One thing the drain gate caught, and it was the test's fault.** F6's
double-press leaves the *simulator* with a second collection for a reference the
platform will never poll again once its ledger row is terminal, and the simulator
counts a collection unsettled until a poll returns something final. Measured, it
held the gate red at `unsettled_payment_collections: 1` for the rest of the file
while the ledger held exactly one `successful` row. The residue is declared with
`closeAbandonedAdapterCollection(reference)` — the per-reference primitive task 8.3
added for the `expired` journey — so the abandonment is *stated*, not hidden, and
every other collection still settles the ordinary way.

The observer is **not** reset at file start, deliberately: resetting it would make
a genuinely stranded collection from an earlier spec disappear too. The pre-flight
state is recorded instead (`unsettled collections present before this file ran:
none`), so a non-empty baseline fails the drain rows loudly with the reference
named.

---

## 7. Video could not be produced, and traces carry the requirement instead

`video: 'on'` was set first and every test failed identically before it started:

```
Error: browserContext.newPage: Executable doesn't exist at
  /home/cosmas/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux

$ bunx playwright install ffmpeg
Error: ERROR: Playwright does not support ffmpeg on ubuntu26.04-x64
```

There is no system `ffmpeg` on this box and no non-interactive way to add one, so
**video is not obtainable here** — the same class of limit as
`HARNESS_PW_CHANNEL` (Playwright's bundled Chromium is unsupported on this OS
too). What carries the requirement: a Playwright **trace** embeds a screencast
filmstrip — one screenshot per action, plus the DOM snapshot, the console and every
network call at each step — so `npx playwright show-trace <trace.zip>` lets a
reviewer step through any journey frame by frame, including one that passed. 28
traces and 28 screenshots, one per test, are in `raw/artifacts-desktop/` and
`raw/artifacts-mobile/`; the two HTML reports embed them.

`video: 'on'` should be restored wherever ffmpeg exists — CI's `ubuntu-latest`,
per `.github/workflows/v2-harness-smoke.yml` — and the config marks the single
line to change.

---

## 8. GATE-13.1-02: for seven of the sixteen surfaces, these rows are the only live coverage

13.1 §2.2 found that test modules patch
`apps.applications.document_views.AccessScopeService`, a symbol task 9.4 removed,
so `mock.patch` raises `AttributeError` **at fixture setup** and every case in
those files errors instead of running. Re-measured here directly rather than
inferred from a suite run:

```
document_views.AccessScopeService present: False
interview_views._staff_can_access_application present: False
```

11 modules reference it; **1** carries 9.4's own `hasattr` guard and runs; **10**
are dead at setup, **85 cases**. Mapped onto this matrix
([`raw/backend-coverage-gap.txt`](raw/backend-coverage-gap.txt)):

| module | cases | 13.2 surface |
|---|---:|---|
| `tests/unit/test_waitlist.py` | 20 | **S07 waitlist, S08 promotion** |
| `tests/unit/test_application_endpoints.py` | 22 | **S03 drafts, S04 grades** |
| `tests/property/test_application_endpoints.py` | 13 | **S03 drafts, S04 grades** |
| `tests/unit/test_review_notifications.py` | 6 | **S11 notifications, S12 review** |
| `tests/unit/test_payment_review_reopen.py` | 3 | **S09 payment, S12 review** |
| `tests/unit/test_application_review_payment_gate.py` | 3 | **S09 payment, S12 review** |
| `tests/unit/test_application_review_force_approved.py` | 2 | **S09 payment** |
| `tests/unit/test_student_number_generation.py` | 8 | — |
| `tests/unit/test_application_number_generator.py` | 3 | — |
| `tests/unit/test_live_500_fixes.py` | 5 | — |
| `tests/unit/test_admin_export_hardening.py` | 5 | S15's export half — **guarded, runs** |

So **7 of the 16 surfaces** — S03, S04, S07, S08, S09, S11, S12 — have backend
coverage that has not executed since task 9.4, and on this checkout the browser
rows above are their live coverage. S15 is the one that escaped, because 9.4 wrote
its guard into that module.

**Not claimed:** that the browser rows are equivalent to those modules. They
assert the tenant boundary end to end over HTTP; the dead modules assert
unit-level scope behaviour against a patched service. Neither replaces the other,
and the fix — 9.4's own guard, already written in one of the eleven — remains the
admin-query/scope lane's.

---

## 9. GATE-13.1-07 did not fire

13.1 §7.1 catalogued three instruments that rewrite earlier tasks' Required_Evidence.
All three were checked before and after every slice
([`raw/gate-13-1-07-check.txt`](raw/gate-13-1-07-check.txt)):

| mechanism | fired? | why |
|---|---|---|
| the base harness config's hard-coded `0.4/playwright-report.json` | **no** | this task runs its own config, whose reporter, `outputDir` and HTML report all point at `13.2/raw/`. 0.4's artifact is `85799ced…`, mtime **06:05**, before this session began at **06:57** |
| six required specs writing screenshots into `11.1`–`11.5` | **no** | none of them ran; the five directories are unchanged (Aug 9–10) |
| `test_authority_matrix_generated.py` writing `2.2/authority-conformance-summary.json` | **no** | no backend suite was run; the file predates this session |

This is not a fix, and the finding stands unchanged for anyone running
`playwright.harness.config.ts`. The base config was not touched. Avoiding a sixth
victim is a property of a separate config, not a repair of the shared one — which
remains the harness lane's.

---

## 10. Boundaries honoured

| Boundary | What was done |
|---|---|
| **Runs and records; does not repair** | No product source, service, migration, schema or register was changed. GATE-13.2-01's one-line fix was **not** applied |
| **The harness's own gates reused, not weakened** | The specs import `harness-fixtures.ts` unchanged: skip is still a hard failure, console errors and page exceptions still fail, unasserted failed requests still fail, and `net::ERR_ABORTED` is still a *cancellation* (8.3). `forbidOnly`, `retries: 0`, `workers: 1` are identical to the base profile |
| **Injected faults declared per path, never blanket** | Each adversarial row allows only the URLs its own injection breaks, so a 500 on a call it is *not* probing still fails the run |
| **New journeys are required journeys** | All three files live in `tests/harness-e2e/required/`, so the base profile runs them at both viewports from now on. 13.1's count of 220 is superseded |
| **Fresh stack, measured** | `harness down` (volumes wiped) before and after; the 0-container/0-volume pre-state is recorded; the two slices are named with their wall times |
| **Neon and production untouched** | Not connected to, not queried, not modified. The invariant SQL is written to run on both and was run only against the disposable harness database |
| **No secret printed** | The only credential values in play are the harness's own committed placeholders (`harness.env`), which hold nothing real. The webhook signature is computed from `harness-lenco-secret`, named because it is a published test value |
| **No evidence of an earlier task edited** | `docs/v2-evidence/0.4`, `1.6`, `2.2`, `11.x`, `12.3` and `13.1` were **read**. 12.3's `invariants.sql` was used as a shape, not copied. §9 verifies nothing was rewritten |

---

## 11. Not claimed here

- **That the matrix is clean.** One isolation row fails by design and **four**
  findings are open — three new, one carried from 13.1. A matrix with a stated gap
  is useful; one with a silent gap is not.
- **That step 2 of the golden journey was performed.** It cannot be — the platform
  removed it. §4.3 asserts the removal instead.
- **That video evidence exists.** It does not, and §7 says why. Traces carry the
  filmstrip.
- **That the isolation and adversarial matrices were run at a mobile viewport.**
  Only the golden journey was, and §1 gives the reason. The base required profile
  will run all three at both viewports on its next run.
- **That the promotion algorithm is correct.** S08 asserts isolation and records
  tenant A's own outcome. `WaitlistManager` is the waitlist lane's.
- **That GATE-13.2-03 is deterministic, or that it was diagnosed.** It reproduced
  in 2 of 3 recordings and **not** in the one whose artifact is preserved. The
  plausible mechanism is named; no code was read to confirm which write wins, no
  timing was instrumented, and nothing was changed (§6.3).
- **That the browser rows replace the 85 backend cases GATE-13.1-02 disabled.**
  §8 states the opposite.
- **That the whole 220-test required profile was re-run.** 13.1 ran it twice, on
  this commit, and this task added no reason to re-run it; the three new files were
  run under a config that inherits the identical fixtures and gates.
- **That the invariant report was run against Neon or production.** It is written
  to be, and was not. 13.4 owns the rehearsal, 13.5 the canary.
- **Any numbered spec property.** This task has no PBT sub-task; the deliverables
  are the three matrices, the invariant report and the drain check.

---

## 12. What a future task on this matrix should know

1. **Build the collision, or the matrix measures nothing.** The seed's names are
   distinguishable on purpose. Under distinguishable names a name-keyed lookup
   cannot cross tenants, so every row passes and none of them is a test (§2).
2. **A fresh tenant's domain does not resolve.** It is born `pending_dns`, so the
   host-override and routing rows have to run on a tenant whose domain is already
   `active` — otherwise the neutral context answers and the probe is vacuous (§2).
3. **Give the actor the capability before you conclude anything from a denial.**
   A read-only tenant admin is refused on its own tenant too. Every row here pairs
   the cross-tenant probe with the same call succeeding in-scope (§2).
4. **A seat is consumed at submission, and a full offering disappears from
   routing.** A 1-seat intake sized for a waitlist row starves every later row's
   *draft creation* with `NO_ELIGIBLE_OFFERING` — a capacity fact arriving dressed
   as an isolation fact. Rows that need a small capacity should ask for their own
   intake (`addSameNamedIntake`).
5. **Check whether the endpoint you are probing is owner-only before calling its
   404 a tenant boundary.** The amendment list refuses the owning tenant's admin
   too (§3.8).
6. **Your instrument must obey the rule it audits.** Gate 5's first draft grouped
   a waitlist by intake *name* and produced a false duplicate-position finding
   (§5.4).
7. **Accept the stronger answer.** F5's retry was refused `409
   IDEMPOTENCY_PENDING` rather than replayed, and F7's first webhook was declined
   by the integrity gate. A row that demanded the convenient status code would have
   reported both as failures (§6.5, §6.7).
8. **Playwright clears `outputDir` every run.** Two slices means the second erases
   the first's traces unless each is snapshotted — measured: 1 of 28 survived
   (§1).
9. **Point a new profile's reporter at its own directory.** The base harness
   config writes over task 0.4's Required_Evidence; a new config costs one line to
   not do that, and it is not a fix for GATE-13.1-07 (§9).
