# Task 13.5 — Deploy canary and run production read-only/post-deploy proof

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Phase 13, fifth bullet
Requirements: **R17, R18.5–R18.7**
Findings: **GOV-05 and all production-risk findings**
Required_Evidence: **canary dashboard/export, post-deploy smoke, operator sign-off**

---

## THE CANARY IS PREPARED. IT WAS NOT EXECUTED.

Read this before anything else in this directory.

- **Production was never contacted.** No SSH, no query, no write, no deploy. The
  `.pem` key was not used. `ec2-13-244-37-190.af-south-1.compute.amazonaws.com`
  appears in this directory only as text.
- **Nothing was deployed and no schema was applied anywhere.** No image was
  built or pulled, no `compose up` was run, no migration was applied on any
  database.
- **Nothing is signed off.** [`sign-off.md`](sign-off.md) is an **unsigned
  template**. Its fields are blank on purpose. An agent asserting its own
  operator sign-off would be the single most dishonest artifact this spec could
  produce, so it is the one artifact here that is deliberately incomplete.
- The checkbox in `tasks.md` is therefore **`[-]`**, not `[x]`.

**What a human must do to complete this bullet** — the whole list, in order:

1. Resolve **GATE-13.5-05**: confirm whether production is `*.beanola.com` or
   `*.mihas.edu.zm`. The shipped bundle's CSP hardcodes `api.beanola.com`;
   `deploy/RUNBOOK.md` cuts DNS over to `api.mihas.edu.zm` 15 times and never
   mentions beanola. Until this is settled, no smoke result means anything (§7.5).
2. Close, or explicitly accept, the four blocking findings in the go/no-go table
   (§4). Two of them are **new and measured here**, and one — GATE-13.5-02 — is
   a live cross-tenant read on production-lineage data.
3. Take a backup (`deploy/backup-db.sh`), confirm it is non-empty, and record it
   in [`sign-off.md`](sign-off.md) Part 0 together with the two rollback anchors.
4. Run the pre-flight (§6 block A) against the production database. It is
   read-only and takes about a minute.
5. Deploy, by the repo's own path (`.github/workflows/deploy.yml`), and record
   the image SHAs.
6. Run the post-deploy proof: `./post-deploy-smoke.sh http` and
   `./post-deploy-smoke.sh on-box` (§6), then the four manual checks the script
   prints — **M1, the two-tab autosave probe, three times**, is the one no query
   can replace.
7. Sample [`canary-dashboard.sql`](canary-dashboard.sql) at cutover, +15 min,
   +1 h, +24 h into [`sign-off.md`](sign-off.md) Part 3.
8. Decide: hold, broaden, or roll back (§5). Then, and only then, sign Part 4.

Everything else in this directory exists so that none of those eight steps
requires rediscovering anything.

---

## The three named artifacts

| `_Evidence:` artifact | Where it is | State |
|---|---|---|
| **canary dashboard/export** | [`canary-dashboard.sql`](canary-dashboard.sql) — 3 new signals + a 19-column one-row export, mapped to the bullet's nine signals; thresholds in §3 | **complete as an instrument**, validated on two databases |
| **post-deploy smoke** | [`post-deploy-smoke.sh`](post-deploy-smoke.sh) — 16 automated checks in two modes, plus 4 manual | **complete and executable**, `bash -n` clean, `plan` mode exercised |
| **operator sign-off** | [`sign-off.md`](sign-off.md) | **deliberately unsigned** |
| *(added)* canary go/no-go | [`preflight.sql`](preflight.sql) — gates 20–25 | **run on two databases** (§4) |
| *(added)* the width-drift probe | [`raw/width-drift-probe.py`](raw/width-drift-probe.py) | **run on two databases** (§7.1) |

**Where the measurements ran.** Every measurement in this document ran either
against the repository source or against the two Neon databases task 13.4
deliberately left behind on branch `br-jolly-pine-ahybtg2e`
(`v2-task-3.2-rehearsal`, endpoint `ep-proud-cherry-ah8n4q0f`, project
`mihasApplication` / `wild-bar-37055823`):

| database | what it is | why it is the right proxy |
|---|---|---|
| `v2_snap_13_4` | 13.4 C7's **restored production-lineage snapshot** — 77 tables, 50 ledger rows, the 33-application cohort | the only reproduction of production's *inherited* schema that exists |
| `v2_fresh_13_4` | 13.4's **expanded release schema** — 89 tables, 44 migrations, fingerprint `19c5216bb175de41…` | what the canary's database is supposed to look like afterwards |

The branch was **reused, not created** (the project is at its branch cap), the
three scratch databases were **not dropped**, the Neon **default** branch was
not written, and every session was pinned
`default_transaction_read_only = on` — with the refusal recorded
([`raw/preflight-two-databases.txt`](raw/preflight-two-databases.txt) §C:
`ERROR: cannot execute CREATE TABLE in a read-only transaction`).

---

## 1. Five new findings

| id | sev | what | owner |
|---|---|---|---|
| **GATE-13.5-01** | **high** | three production-lineage columns are **narrower than the model declares** — `applications.institution/intake/program` are all `varchar(50)` against a `varchar(255)` source — and `check_schema_drift` documents this entire class as out of scope, so the boot gate passes. `institutions.name` is already **46 of 50** characters (§7.1) | data-migration lane + applications lane |
| **GATE-13.5-02** | **high** | **GATE-13.2-01 is LIVE on the production lineage**, not dormant: 3 intake names are shared across the 2 active institutions, which is the exact condition under which the staff application read publishes the other tenant's capacity. 13.2 had to *build* that collision in the harness; production already has it (§7.2) | admin-query lane (`student_draft_views.py:185` + 4 siblings) |
| **GATE-13.5-03** | **high** | **a host-scoped canary tenant is not servable by this stack.** Caddy has three fixed site blocks, no wildcard and no on-demand TLS, and the Caddyfile is baked into the frontend image; the production lineage has **zero** `institution_domains` rows. The platform's tenanting is domain-resolved and the edge cannot resolve a tenant domain (§2, §7.3) | deploy/edge lane + tenancy lane |
| **GATE-13.5-04** | med | **two tenants are simultaneously exposed** on the production lineage — MIHAS and KATC each have 2 offerings with 2 open intakes — so "one canary tenant" requires a catalogue write to close the other's intakes (§7.4) | operations (a decision, not a code defect) |
| **GATE-13.5-05** | med | the shipped bundle's CSP pins `connect-src https://api.beanola.com` **literally**, while `API_HOST` is a deploy variable and `deploy/RUNBOOK.md` cuts DNS to `api.mihas.edu.zm` (15 refs, 0 to beanola) and `scripts/smoke-production.sh` defaults to it. One of those documents is wrong about production's identity (§7.5) | deploy/runbook lane |

**Two things were fixed here, both because the post-deploy proof itself depends
on them.** Nothing else was repaired — §8 lists what was left alone and why.

| fixed | why it is this bullet's |
|---|---|
| `deploy/RUNBOOK.md` §3a: `postgres:16-alpine` → `postgres:17-alpine` (GATE-13.4-03) | 13.4 §8.1 measured the 16 client exiting 1 with 0 bytes against a PG17 server. It is the **first command** of the restore an operator reaches for during a canary incident. One character, with the measured reason recorded in a comment beside it |
| `apply_sql_migrations --dry-run` no longer ends on `Applied N migration(s) successfully.` | 13.4 §8.3 flagged it. **The 13.5 post-deploy proof runs this exact command** (§6 step 3), so a summary line that reads like success after applying nothing is a defect *in the proof instrument*. It now prints `[dry-run] NOTHING WAS APPLIED. 23 migration(s) would be applied.` — verified against `v2_snap_13_4` ([`raw/verification.txt`](raw/verification.txt)) |

---

## 2. What a "canary" can actually be here — and what it cannot

This is the substance of the bullet's first line, and it needs to be said before
any procedure, because the honest answer is narrower than the word suggests.
Three facts, each traced to a file and a line in
[`raw/canary-shape-analysis.txt`](raw/canary-shape-analysis.txt):

**2.1 There is one Compose project, so there is no traffic split.**
`deploy/docker-compose.prod.yml` defines six services on one host: one `caddy`,
one `web`, one `celery`, one `beat`, one `redis`, one `postgres`. The deploy
workflow pins **one** `BACKEND_IMAGE` and **one** `FRONTEND_IMAGE` and runs
`compose up -d`. There is no second upstream, no weight, no percentage.
**V2 code and the expanded schema reach every tenant at the same instant.** No
canary design can change that without adding infrastructure this repo does not
have. Saying otherwise would be describing a stack that does not exist.

**2.2 The edge serves exactly three fixed hostnames.** `apps/admissions/Caddyfile`
has `{$APP_HOST}`, `{$API_HOST}`, `{$JOBS_HOST}` and nothing else — no wildcard
site, no `on_demand_tls`. A tenant hostname pointed at the Elastic IP is not
served, and would not get a certificate. Because the Caddyfile is baked into the
frontend image, adding one is an **image rebuild**, not a config edit.

**2.3 Today every request resolves to the neutral Beanola context.**
`_request_host()` reads `X-Forwarded-Host` or `Host`;
`SHARED_PORTAL_HOSTS` already registers `apply.beanola.com` and
`api.beanola.com` as **neutral shared-portal hosts**; and the production lineage
has **zero** `institution_domains` rows (gate 23). So a tenant is selected per
application through the offering the student picks, not by hostname.

### So the canary is tenant *activation*, and that is the honest name for it

The only blast-radius lever the platform really has is **which institution has
an open intake that will accept a new application**. Measured on the production
lineage (gate 24):

```
 institution_code | institution_active | offerings | open_intakes | drafts | submitted+
 KATC             | t                  |         2 |            2 |      0 |          0
 MIHAS            | t                  |         2 |            2 |      0 |          0
```

| | definition |
|---|---|
| **canary** | exactly **one** institution with `open_intakes > 0`; the other's intakes closed |
| **broaden** | re-open the second institution's intakes, after §5's reconciliation and a signed §4c |
| **contain** | close them again — a catalogue write, reversible, no data loss |
| **what it does NOT contain** | the code and the schema. Both are live for every tenant from the moment the image rolls. Reads, drafts and admin surfaces for the *closed* tenant are served by V2 too |

**Which tenant.** The canary tenant should be the one whose exposure is smallest
and whose findings are dormant. On the production lineage that decision is
constrained by two things this task measured, and both point the same way:

- GATE-13.5-02 is live **because two tenants share intake names**. Closing one
  tenant's intakes does not remove the shared *names* — a staff read on the open
  tenant can still resolve the closed tenant's intake row. So tenant activation
  does **not** contain GATE-13.5-02, and it must be closed or accepted (§4).
- GATE-13.4-01 means a tenant that is **not** MIHAS receives MIHAS-branded email
  from the platform-wide fallback. So a **MIHAS canary is the only choice that
  does not expose GATE-13.4-01 to a student**, purely by coincidence of the
  seeded branding. That is a reason to start with MIHAS and a reason not to
  mistake a clean MIHAS canary for evidence the fallback is fixed.

---

## 3. The nine signals: query, healthy value, rollback threshold

The bullet names nine. Five already have an instrument in this release and are
**reused, not rewritten**; three needed new SQL; one is a command, not a query.
[`canary-dashboard.sql`](canary-dashboard.sql) carries the new three plus a
one-row export of all nine.

| # | signal | instrument | healthy | **rollback threshold** |
|---|---|---|---|---|
| **1** | authority denials | **new** — `canary-dashboard.sql` S1 over `audit_logs` `auth.denied` / `scope.denied` | `admin_or_reviewer_denials = 0` | non-zero on **two consecutive samples**, or `> 5` in one sample. A scoped operator denied their own tenant twice is a capability regression |
| **2** | schema drift | `check_schema_drift` (boot gate) · `schema_manifest --verify` · fingerprint vs `19c5216bb175de41…` · **new** `raw/width-drift-probe.py` · preflight gate 20 | boot gate exit 0; `--verify` ok; fingerprint equal; `narrower_columns = 0` | **any** of: boot gate non-zero, fingerprint differs, `not_valid_fks > 0`, or a narrower column. 13.4 C3 proved a converged sweep reproduces the fingerprint exactly, so a difference is real, never noise |
| **3** | assignment mismatches | **reuse** 13.2 gates 1–2 · 13.4 gate 14 | `mis_bound_institution = 0`, `canonical_program_crossed = 0`, `unquarantined_violators = 0` | any non-zero. A mis-bound row is a routing leak already written to disk |
| **4** | autosave | **new** — S4 over `applications` draft `updated_at`; plus manual probe **M1** | `never_saved_after_create = 0` among drafts older than 5 min; `drafts_touched_in_window > 0` while students are active | `never_saved_after_create > 0`, or **M1 reverts once in three attempts** |
| **5** | payment | **reuse** 13.2 gates 3, 8 · 13.4 gate 15 | `orphan_payments = 0`, `payer_is_not_the_applicant = 0`, `payments_pending_over_24h = 0`, `applications_with_multiple_open = 0` | any non-zero. `multiple_open > 0` is double-charge exposure and is immediate |
| **6** | jobs | **new** — S6 over `outbox_events` + beat proxies; **plus one command**: `redis-cli llen celery` | `outbox_failed = 0`, `outbox_pending_over_15m = 0`, `LLEN celery ≤ 25` | `outbox_failed > 0` (a committed promise that terminally failed), or a backlog rising across two samples, or Redis unreachable |
| **7** | tenant cache/domain | **reuse** 13.2 gate 7 · 13.4 gate 17 · plus `GET /api/v1/catalog/context/` | `hostnames_with_multiple_active_rows = 0`, `never_checked_over_1h = 0`, neutral host returns **no** MIHAS/KATC brand | a hostname collision (resolution becomes order-dependent), or a legacy brand on a neutral host — that is the fail-closed rule inverted |
| **8** | documents | **reuse** 13.2 gate 6 · 13.4 gate 16 | `orphan_documents = 0`, `stale_staged = 0` | `stale_staged > 0` after a sweep interval — an object nobody owns. `orphaned` is the operator queue, **not** a rollback |
| **9** | communications | **reuse** 13.4 gates 18, 19 | `wedged_processing = 0`, `failed = 0` | wedged `processing` for an hour (no sweep running), or any email actually sent under another tenant's brand (**M2**, GATE-13.4-01) |

Three things about this table are worth stating rather than leaving implicit.

**`broker_queue_depth` is `LLEN celery`.** The harness value every prior task
quotes is literally that (`harness/adapters/adapter_server.py::_redis_total_llen`,
raw RESP `LLEN` over the queue list). The production equivalent is one command,
and it is in the smoke script step 7. `-1` in the harness means *Redis
unreachable* — on production the equivalent is an empty result, which must be
read as "cannot tell", never as zero.

**Signal 1 cannot be scoped to the canary tenant.** `_emit_auth_denied` in
`apps/catalog/permissions.py` passes no `institution_id`, so an `auth.denied` row
carries `actor_role`, `required_capability`, `resource_type` and `request_id` but
no target tenant. The signal is a platform-wide rate and the discriminator is the
**actor role**, which is why the threshold is written on
`admin_or_reviewer_denials` rather than on the total.

**Signal 4 cannot see the finding that matters most.** GATE-13.2-03 — a stale
tab's reload reverting another device's newer write — leaves a row of correct
shape with a plausible timestamp and the wrong content. No SQL detects that after
the fact. S4 therefore measures only whether autosave writes are *landing*, and
the real control is the 60-second two-tab probe (**M1**), run three times because
13.2 saw the revert in 2 of 3 recordings.

---

## 4. The go/no-go list

This is the judgement the bullet asks for. Each finding is classified **block**
(must be closed or explicitly accepted before a canary), **monitor** (can run
through the canary because a named signal will catch it), or **accept** (real,
but not a canary risk).

| finding | sev | verdict | why |
|---|---|---|---|
| **GATE-13.5-05** CSP pins `api.beanola.com`, runbook cuts DNS to `api.mihas.edu.zm` | med | **BLOCK — first** | Not the biggest defect, but the one that must be settled first: until the operator knows which hostname is live, *every* HTTP check in the post-deploy proof is aimed at a possibly-wrong target, and a green smoke run would be meaningless. Cheap to resolve, and it invalidates the proof if left |
| **GATE-13.5-02** GATE-13.2-01 is live (3 shared intake names, 2 tenants) | **high** | **BLOCK** | This is a **cross-tenant read on real data**, not a latent one. Tenant activation does not contain it (§2): closing a tenant's intakes leaves the shared names, so a staff read on the open tenant still resolves the closed tenant's row. 13.2 measured the fix as one line (resolve by canonical id, not display name) in `student_draft_views.py:185` plus 4 siblings |
| **GATE-13.5-01** three narrower columns, invisible to the boot gate | **high** | **BLOCK** | `applications.institution` has **4 characters of headroom** (46 of 50). One tenant rename, or one new tenant with a full legal name, and **every application create 500s** for that tenant — and the boot gate will have said the schema is fine. The fix is additive and cheap (widen three columns to match the model); the check is preflight gate 20 plus the width probe |
| **GATE-13.4-02** a restored snapshot cannot be brought forward | **high** | **BLOCK** | 13.4 named verifying this the highest-value single check in this bullet, and it is: the canary's own rollback plan includes "restore from backup", and today restore works, the app will not start, and the documented remedy fails. Gate 22 is the one-command test. **Ownership: the data-migration lane writes the fix; 13.5 verifies it.** §4.1 sharpens the root cause |
| **GATE-13.5-03** no host-scoped canary is servable | **high** | **ACCEPT, with the canary redefined** | This cannot be "closed" before a canary — closing it means an edge code change and an image rebuild. The correct response is to stop describing the canary as host-scoped and use tenant activation instead (§2), which is what this document does. It stays a finding because R17's wording implies a capability the stack does not have |
| **GATE-13.5-04** two tenants exposed simultaneously | med | **BLOCK (cheap)** | One catalogue write closes the second tenant's intakes; gate 24 confirms it. Without it there is no canary at all, only a deploy |
| **GATE-13.4-01** 19 MIHAS-branded platform-wide fallback templates | **high** | **MONITOR — conditionally** | Monitorable **only if the canary tenant is MIHAS** (§2), where the branding coincidentally matches. For any other tenant this is user-visible on the first email and becomes a **BLOCK**. Signal: gate 19 counts the rows; **M2** is the only check that sees what a recipient saw |
| **GATE-13.3-13** long intake name → HTTP 500 | **high** | **MONITOR** | Subsumed by GATE-13.5-01 and measured tighter: on the production lineage the ceiling is **50**, not the 100 that 13.3 found in the model. Preflight gate 20 reports the live longest value against the live ceiling, so an operator sees the actual headroom instead of a class of risk |
| **GATE-13.1-02** 86 backend tests have not run since 9.4 | **high** | **ACCEPT for the canary — BLOCK for 13.6** | This is a **measurement** hole, not a production behaviour. None of the nine canary signals depends on it, and the canary produces live evidence over the same surfaces. But 13.6 must assert "no required skips", and it cannot while 86 tests error at fixture setup. **Not fixed here**: it is 8 test modules in the admin-query lane, the guard already exists in the ninth, and it is not a canary prerequisite by any honest reading |
| **GATE-13.2-02** `SEAT_STATUSES` omits `enrolled` | med | **MONITOR** | 13.2 gate 5 reports the drift *and* whether `enrolled` explains it, which is exactly the discriminator needed. Capacity drift does not corrupt applications; it releases a seat. Watch it, do not block on it |
| **GATE-13.1-04** two 12-char ledger checksums | med | **ACCEPT** | Present on every snapshot-derived database and unfixable by re-running anything. 13.4 gate 10 names the two rows. It makes gate 10 permanently non-clean on production, so the sign-off marks it a known exception rather than a failure |
| **GATE-13.4-03** RUNBOOK `postgres:16-alpine` | med | **FIXED HERE** | §1 |

### 4.1 GATE-13.4-02: the root cause, sharpened, and who owns the fix

13.4 traced the sweep's failure on the snapshot to `canonical_programs.id` having
no default. Read-only measurement here adds the half that decides the shape of
the fix:

| on `v2_snap_13_4` | value |
|---|---|
| `canonical_programs.id` has a default | **no** |
| `canonical_programs` rows | **0** |
| `2026_06_08_01…` recorded in `migration_history` | **no** |
| `applications.institution_id / program_id / program_offering_id / intake_id` present | **yes, all four** |

So **the June script's `ALTER TABLE`s have already been applied and its ledger
row was never written.** `apply_sql_migrations` therefore re-runs the *whole*
script — the `ALTER`s are `IF NOT EXISTS` and no-op, and it dies on the `INSERT`
that supplies no id. That distinguishes two candidate fixes:

- give `canonical_programs.id` a default (`gen_random_uuid()`), as the
  fresh-from-empty build already has — additive, idempotent, one statement; or
- make the June script's `INSERT` supply ids explicitly.

The first is preferable precisely because it also repairs any *other* database of
this lineage, and because it converges the snapshot lineage onto the shape the
from-empty build already has.

**Ownership.** The fix belongs to the **data-migration lane**, and 13.5 keeps
verification. Two reasons, stated so the handover is not a dodge: 13.4 explicitly
assigned it that way ("this lane's to write and 13.5's to verify"), and a
migration script written here would ship **unrehearsed** — the honest rehearsal
target is the snapshot lineage, and rehearsing it means creating a scratch
database, which is the data lane's own C2/C7 procedure and not a read-only act.
What 13.5 owes, and delivers, is the exact root cause above and a one-command
go/no-go gate (gate 22) that answers it on any database in under a second.

---

## 5. Rollback: criteria, and the procedure

### 5.1 Criteria

Roll back when **any** of these is true. They are the union of the existing
runbook triggers and the thresholds in §3.

| trigger | source |
|---|---|
| auth/session broken · payment initiate or verify broken · application create/submit broken · 5xx spike · admin access broken | `docs/runbooks/release-and-rollback.md` "Rollback Triggers" |
| `check_schema_drift` non-zero after boot, or the manifest fingerprint differs from `19c5216bb175de41…` | §3 signal 2 |
| `admin_or_reviewer_denials` non-zero on two consecutive samples, or `> 5` in one | §3 signal 1 |
| any `mis_bound_institution`, `canonical_program_crossed`, or `unquarantined_violators` | §3 signal 3 |
| `never_saved_after_create > 0`, or M1 reverts | §3 signal 4 |
| `applications_with_multiple_open > 0` | §3 signal 5 — double charge, immediate |
| `outbox_failed > 0` | §3 signal 6 |
| a legacy tenant brand resolved on a neutral host, or an active-hostname collision | §3 signal 7 |
| an email actually delivered under the wrong tenant's brand | §3 signal 9 / M2 |

### 5.2 The procedure — code first, schema never

The posture is already documented and is **forward-only for schema**
(`release-and-rollback.md`, R14.7): a routine rollback rolls back **code only**
and leaves the additive columns in place. The decision order is code rollback →
feature flag → graceful degradation → restore, and only the first is routine.

The repo already automates the rollback for a **failed** deploy:
`.github/workflows/deploy.yml` captures `PREV_BACKEND` / `PREV_FRONTEND` before
the pull and its `rollback()` trap re-pins and restarts them, explicitly with
*"No `down`, no `-v`: the postgres volume and DB are left completely
untouched."* A canary rollback after a **successful** deploy is the manual form
of the same thing (RUNBOOK §7):

```bash
cd ~/mihas
sed -i 's|^BACKEND_IMAGE=.*|BACKEND_IMAGE=ghcr.io/<owner>/<repo>-backend:<good-sha>|'  .env
sed -i 's|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=ghcr.io/<owner>/<repo>-frontend:<good-sha>|' .env
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Image tags are immutable per-SHA, so the previous pair is always pullable —
which is why [`sign-off.md`](sign-off.md) Part 0 makes copying the two anchors a
required field rather than a nicety.

### 5.3 The one thing that breaks, and the measured mitigation — carry verbatim

13.4 C5 §6.2 measured this on Neon; it is reproduced here in full because an
operator must not have to derive it mid-incident.

**Rolling the app back while the expanded schema remains blocks new
submissions.** Old code sets no canonical ids, and
`chk_applications_canonical_assignment` requires a non-draft row to carry all
four unless quarantined:

```
IntegrityError: new row for relation "applications" violates check
constraint "chk_applications_canonical_assignment"
```

Reads, drafts and payments are unaffected — 18 of 19 probes passed. Only
submission stops. The mitigation, each step measured:

| step | measured result |
|---|---|
| drop **only** `chk_applications_canonical_assignment` | CHECK dropped, **6 of 6 expanded columns still present** |
| old code submits with no canonical ids | **succeeds** |
| re-add the CHECK as `NOT VALID` when rolling forward | re-added, `convalidated = false` |
| V2 quarantines what the old app wrote | quarantined; **unquarantined violators = 0** |

**One CHECK, not a column. No data is lost. Reversible in one statement. V2
re-absorbs the affected rows through the quarantine mechanism when rolling
forward** — which is why re-adding it `NOT VALID` is correct and re-validating
immediately is not. [`sign-off.md`](sign-off.md) §4c requires recording the drop
time, the re-add time, and 13.4 gate 14's post-roll-forward violator count.

### 5.4 What rollback does NOT cover today

If the incident is **data-level** rather than code-level, the documented path is
restore-from-backup — and **GATE-13.4-02 says that path does not currently
complete** on a production-lineage snapshot. Until gate 22 reads PASS on
production, the canary's data-level rollback is **unproven**, and that fact
belongs in the sign-off rather than in a footnote. It is also the reason
GATE-13.4-02 is classified BLOCK in §4 rather than MONITOR.

---

## 6. The production read-only proof — one copy-pasteable block

`.kiro/steering/infrastructure.md` documents these as **safe to run anytime**.
They need SSH, so **none of them was run here**. Expected output is beside each.

### Block A — pre-flight, before the deploy (read-only, ~1 minute)

```bash
# 0. connect (the key is never committed; it lives in /home/cosmas/Downloads/)
chmod 600 /home/cosmas/Downloads/mihasapplication2026.pem
ssh -i /home/cosmas/Downloads/mihasapplication2026.pem \
  ubuntu@ec2-13-244-37-190.af-south-1.compute.amazonaws.com
cd ~/mihas

# 1. copy the five read-only gate files up ONCE (from your laptop, not the box).
#    All three lanes name their file invariants.sql, so prefix on copy.
#      scp docs/v2-evidence/13.2/invariants.sql   <box>:~/mihas/v2-gates/13.2-invariants.sql
#      scp docs/v2-evidence/13.4/invariants.sql   <box>:~/mihas/v2-gates/13.4-invariants.sql
#      scp docs/v2-evidence/12.3/invariants.sql   <box>:~/mihas/v2-gates/12.3-invariants.sql
#      scp docs/v2-evidence/13.5/preflight.sql        <box>:~/mihas/v2-gates/
#      scp docs/v2-evidence/13.5/canary-dashboard.sql <box>:~/mihas/v2-gates/
#      scp docs/v2-evidence/13.5/raw/width-drift-probe.py <box>:~/mihas/v2-gates/

# 2. container health — expect six services, none "Restarting"
docker compose -f docker-compose.prod.yml ps

# 3. which migrations are recorded  — expect the 2026_06_08 tenant scripts present
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
   "SELECT migration_name FROM migration_history ORDER BY 1;"'

# 4. tenant sanity — expect all three counts NON-ZERO
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -x -c \
   "SELECT (SELECT count(*) FROM canonical_programs) canonical_programs,
           (SELECT count(*) FROM institutions WHERE is_active) institutions_active,
           (SELECT count(*) FROM user_institution_memberships WHERE is_active) memberships;"'

# 5. the canary go/no-go — gates 20-25.  Expect:
#      gate20  rows_exceeding_ceiling = 0 on all three lines   <- BLOCKING
#      gate21  colliding_intake_names = 0                      <- BLOCKING
#      gate22  verdict PASS                                    <- BLOCKING
#      gate23  context: which hostnames resolve a tenant
#      gate24  exactly ONE institution with open_intakes > 0    <- BLOCKING
for f in v2-gates/preflight.sql v2-gates/13.2-invariants.sql \
         v2-gates/13.4-invariants.sql v2-gates/12.3-invariants.sql; do
  echo "=== $f ==="
  docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X \
       -c "SET default_transaction_read_only = on" -f -' < "$f"
done
#      13.4 gate10  expect FAIL naming exactly two rows (GATE-13.1-04, known)
#      13.4 gate11  expect not_valid_fks = 0                   <- BLOCKING
#      13.4 gate13  expect missing_expanded_columns = 0        <- BLOCKING
#      13.4 gate19  expect FAIL until GATE-13.4-01 is fixed (see section 4)

# 6. nothing unexpectedly pending. --dry-run APPLIES NOTHING.
docker compose -f docker-compose.prod.yml exec web \
  python manage.py apply_sql_migrations --dry-run

# 7. the boot gate, by hand — expect exit 0 and no missing column
docker compose -f docker-compose.prod.yml exec web python manage.py check_schema_drift

# 8. the release fingerprint — expect 19c5216bb175de41... / 89 tables / 44 migrations
docker compose -f docker-compose.prod.yml exec web \
  python manage.py schema_manifest --emit /tmp/pre.json --label pre-canary
docker compose -f docker-compose.prod.yml exec web \
  python manage.py schema_manifest --verify /tmp/pre.json

# 9. the width class the boot gate skips — expect narrower_columns = 0
docker cp v2-gates/width-drift-probe.py \
  "$(docker compose -f docker-compose.prod.yml ps -q web)":/tmp/
docker compose -f docker-compose.prod.yml exec web python /tmp/width-drift-probe.py

# 10. THE BACKUP. Not optional. Record the R2 key in sign-off.md Part 0.
./deploy/backup-db.sh
```

### Block B — post-deploy proof

```bash
# off the box (set these to whatever GATE-13.5-05 resolves to):
APP_URL=https://apply.beanola.com API_URL=https://api.beanola.com \
  ./docs/v2-evidence/13.5/post-deploy-smoke.sh http
APP_URL=... API_URL=... ./scripts/smoke-production.sh
python3 scripts/launch-verification/run-smoke-gate.py \
  --frontend-url "$APP_URL" --backend-url "$API_URL"

# on the box, from ~/mihas:
SQL_DIR=~/mihas/v2-gates ./post-deploy-smoke.sh on-box

# then one dashboard sample per interval, appended as CSV:
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X \
     -c "SET default_transaction_read_only = on" -f -' \
  < v2-gates/canary-dashboard.sql
```

Then the four manual checks the script prints — **M1 three times** — and
[`sign-off.md`](sign-off.md).

### Window budget, from 13.4 §B

~4 min for a from-empty build · ~4 min for a killed-and-restarted sweep · 41 s
for the FK validation, of which **374 ms** is the lock (and it is
`ShareUpdateExclusiveLock`, so it blocks neither reads nor writes) · restore
time is **dominated by data volume** and 13.4's 0.9 s figure is honest for 716 KB
and says nothing about production's real dump.

---

## 7. The five findings in detail

### 7.1 GATE-13.5-01 — three columns the boot gate is documented not to see

`check_schema_drift` is the boot gate, and its own docstring says, under *"What
it does NOT check (intentionally)"*:

```
* Type compatibility (``VARCHAR`` vs ``TEXT`` etc.): not a 500 risk
  in practice - Postgres auto-coerces most compatible types.
```

That holds for a column **wider** than the model. It is false for a column
**narrower** than the model: Django sends the whole value and Postgres raises
`DataError: value too long for type character varying(N)`, which surfaces as an
unhandled 500 — while the column *exists*, so the gate passes.

[`raw/width-drift-probe.py`](raw/width-drift-probe.py) answers the question the
gate does not, over every `managed = False` field with a bounded `max_length`:

| database | models compared | fields compared | **narrower** | verdict |
|---|---:|---:|---:|---|
| `v2_snap_13_4` — production lineage | 76 | 330 | **3** | FAIL |
| `v2_fresh_13_4` — release schema | 78 | 339 | **0** | PASS |

```
NARROWER applications.institution: model declares 255, column is varchar(50) -> DataError at 51 chars
NARROWER applications.intake:      model declares 100, column is varchar(50) -> DataError at 51 chars
NARROWER applications.program:     model declares 255, column is varchar(50) -> DataError at 51 chars
```

Three things make this worse than GATE-13.3-13 as 13.3 stated it:

1. **The ceiling is 50, not 100.** 13.3 read the model (`varchar(100)`) and the
   from-empty schema. The production lineage carries `varchar(50)` for all three.
2. **It is not one column, it is three** — and `program` and `institution` were
   not previously named at all.
3. **The headroom is four characters.** Preflight gate 20 on the production
   lineage: the longest `institutions.name` is **46**, against a ceiling of 50.
   One tenant onboarding with a full legal name, or one rename, and every
   application create for that tenant returns 500.

**No migration script widens them** (`grep` recorded in
[`raw/width-drift-two-databases.txt`](raw/width-drift-two-databases.txt) §C), and
the from-empty build is clean — so this is inherited history, exactly the shape
of GATE-13.1-04's truncated checksums. Not fixed here: widening a production
column is a migration, and it is the data lane's to write and rehearse. The gate
and the probe are the handover.

### 7.2 GATE-13.5-02 — the cross-tenant capacity read is live, not latent

13.2 §3.6 found that the staff application read resolves the intake by **display
name**, so it publishes the other tenant's capacity when two tenants share an
intake name. 13.2 also recorded that it had to **build** that collision:
`harness_seed_tenants` deliberately gives its two tenants distinguishable names.

On the production lineage the collision already exists. Preflight gate 21:

```
gate21 name-collision exposure | colliding_intake_names 3 | colliding_offering_names 0
                               | active_institutions 2
      FAIL - GATE-13.2-01 is LIVE: a staff read can publish the other tenant's capacity
```

Three intake names are shared across the two active institutions. So the
condition 13.2 had to manufacture is the production default, and the finding is
not a hypothetical about a future tenant — it is a live cross-tenant read on the
data that exists. The comparison column makes the point sharply: on
`v2_fresh_13_4` the same gate is **PASS**, because a fresh build has no tenants
at all. A gate that only ever runs on fresh databases would have reported this
finding as absent.

This is why GATE-13.5-02 is BLOCK and why tenant activation does not contain it
(§2): closing one tenant's intakes does not un-share the names.

### 7.3 GATE-13.5-03 — the tenanting model and the edge disagree

§2 is the full argument. The finding, stated once: the platform resolves tenants
by **hostname** (`InstitutionContextService.resolve`, fail-closed, one active
`InstitutionDomain` on an active institution), and the production edge can serve
**exactly three hostnames**, none of which is a tenant domain — with the
Caddyfile baked into the frontend image, so adding one is an image rebuild.
Meanwhile the production lineage has **zero** `institution_domains` rows
(gate 23), and `apply.beanola.com` / `api.beanola.com` are pre-registered as
**neutral shared-portal** hosts in `SHARED_PORTAL_HOSTS`.

The whole domain lifecycle — `pending_dns → pending_review → verified → active`,
the verification sweep, the collision fail-safe, the retry/reject edges — is
implemented, tested, and has **nothing to resolve** on this deployment. That is
worth recording plainly rather than discovering during a tenant onboarding.

### 7.4 GATE-13.5-04 — two tenants are exposed at once

Gate 24, §2. Both MIHAS and KATC have 2 offerings and 2 open intakes on the
production lineage, so the current state is not a canary — it is full exposure.
Making it a canary costs one catalogue write (close the second tenant's intakes)
and gate 24 confirms it in one line. Cheap, but not optional: without it the
bullet's first sentence is not satisfied in any sense.

### 7.5 GATE-13.5-05 — two documents disagree about production's hostname

| source | hostname |
|---|---|
| `apps/admissions/Caddyfile` CSP `connect-src` | **`https://api.beanola.com`, hardcoded** (both the admissions and the jobs-ops block) |
| `deploy/docker-compose.prod.yml` `APP_HOST` / `API_HOST` / `JOBS_HOST` examples | `*.beanola.com` |
| `scripts/launch-verification/run-smoke-gate.py` defaults | `*.beanola.com` |
| `deploy/RUNBOOK.md` — including the **DNS cutover** in §5 | `*.mihas.edu.zm` — **15 references, 0 to beanola** |
| `scripts/smoke-production.sh` defaults | `https://apply.mihas.edu.zm` / `https://api.mihas.edu.zm` |

The CSP is the one a browser **enforces**, and it is a literal string while
`API_HOST` is a deploy-time variable — so the edge config and the runbook can
drift silently, and the Caddyfile itself flags the hazard (*"Keep in sync with
vercel.json until Vercel is fully retired"*). Two operational consequences:

- Following the RUNBOOK's DNS cutover verbatim yields a frontend whose CSP
  forbids calls to the API it was just pointed at.
- Running the documented `./scripts/smoke-production.sh` with no overrides probes
  `*.mihas.edu.zm`, so a "PASS" may describe a host the shipped bundle cannot
  call, and a "FAIL" may just be a stale default.

**Not fixed here, deliberately.** Both candidate corrections require knowing
which hostname is actually live, and that is a production fact this task may not
observe. Changing `smoke-production.sh`'s default on a guess would convert a
visible disagreement into an invisible one. [`post-deploy-smoke.sh`](post-deploy-smoke.sh)
defaults to `beanola.com` — matching the CSP, the only enforced source — and
takes `APP_URL` / `API_URL` overrides, and §4 makes resolving this the **first**
go/no-go item.

---

## 8. What is NOT claimed here

1. **The canary was not run.** Production was not contacted in any way: no SSH,
   no query, no write, no deploy, no restart, no migration. The `.pem` was not
   read.
2. **Nothing is signed off.** [`sign-off.md`](sign-off.md) is blank by design,
   and every field in it is for a human.
3. **No signal in §3 was measured on production.** The healthy values and
   thresholds come from the code that produces them, from 13.2/13.4's measured
   runs, and from this task's reads of the two Neon databases. They are
   *predicted* production values, and §6 is how a human confirms them.
4. **"Production-lineage" is not production.** `v2_snap_13_4` is 13.4's restored
   snapshot: the same schema lineage, the same 33-application cohort, the same
   ledger defects — and **not** production's row volume, current catalogue, or
   current tenant configuration. Every count in §7 is a statement about that
   snapshot. Gate 20's four-character headroom in particular could be better or
   worse on production **today**, which is precisely why it is a gate and not a
   conclusion.
5. **Three of the five new findings are measured and not repaired**
   (GATE-13.5-01, -02, -05), and two are structural statements rather than
   defects to patch (-03, -04). The two things fixed are named in §1 and both
   are inside this bullet's own instruments.
6. **GATE-13.1-02 was deliberately not fixed**, and §4 argues why it is not a
   canary prerequisite while conceding it blocks 13.6. That is a judgement, not
   an oversight — and 13.6 should read it as an open item, not a closed one.
7. **GATE-13.4-02's fix was deliberately not written here.** §4.1 gives the
   sharpened root cause and the ownership decision, with the reason: a migration
   written without a rehearsal is worse than a precise handover.
8. **Other lanes' failures were left alone**: 13.1's seven findings, 13.2's four,
   13.3's sixteen, 13.4's remaining two, the two whole-corpus rollback-lint
   assertions (still failing on 26 statements in 9 other lanes' files — confirmed
   unchanged by this task's own run, §9), and every frontend/lint item.
9. **The post-deploy smoke script has never run against a live target.** Its
   `plan` mode was exercised and `bash -n` is clean; `http` and `on-box` mode
   have not been executed anywhere, because both require production. A check
   that "runs" is also not a check that "passes" — the script says so itself
   after every SQL gate file.

---

## 9. Verification of the two changes, and state left behind

Both changes were verified, and the verification is recorded in
[`raw/verification.txt`](raw/verification.txt).

| check | result |
|---|---|
| `manage.py check` (real `backend/.env`, no substituted `REDIS_URL`, no exported `TESTING`) | **no issues (1 silenced), exit 0** |
| every test file that touches `apply_sql_migrations` (16 files) | **259 passed, 7 skipped** |
| `test_migration_drift_guard.py` + `test_migration_history_forward_only.py` + `test_perf_index_migration.py` | **18 passed** |
| `test_rollback_pairing.py`, `test_check_schema_drift*.py` (4 files) | **25 passed, 2 skipped** |
| `test_rollback_safe_operations.py` (2 assertions) | **2 failed — pre-existing.** 13.4 §6.1 classified these: 26 statements in 9 other lanes' files, 24 of them an over-narrow instrument and 2 a genuine R9.2 tension in the subject-catalog and document lanes. Neither changed file appears in the output |
| `apply_sql_migrations --dry-run` against `v2_snap_13_4` | 23 pending listed, then `[dry-run] NOTHING WAS APPLIED. 23 migration(s) would be applied.` — exit 0, **nothing applied** |
| no test asserts on the old summary string | `grep` clean |

| item | state |
|---|---|
| **production Postgres** | **never contacted** — no SSH, no query, no write, no deploy |
| Neon **default** branch | **not touched at all**, not even read |
| Neon rehearsal branch `br-jolly-pine-ahybtg2e` | **read only.** Every session pinned `default_transaction_read_only = on`; the refusal is recorded |
| 13.4's three scratch databases | **left in place** as instructed — `v2_snap_13_4` is the only reproduction of GATE-13.4-02 that exists |
| throwaway local `postgres:17-alpine` on `127.0.0.1:5434` | started for the test runs, **removed** |
| files changed outside this directory | **two**: `deploy/RUNBOOK.md` (§3a image tag + a comment) and `backend/apps/common/management/commands/apply_sql_migrations.py` (the dry-run summary). Both justified in §1 |
| `docs/v2-evidence/**` for other tasks | **read, never written** |
| secrets | no DSN, password, token or key appears in this directory. The connection string used for the Neon reads was assembled in-process from `backend/.env` and never printed; only the public branch/endpoint/project ids appear |

---

## 10. What 13.6 should read here

| # | item | why it matters to closure |
|---|---|---|
| 1 | **This task is `[-]`, and that is the correct outcome.** | The canary is prepared; it was not executed. 13.6 must not read the artifacts in this directory as evidence of a deploy |
| 2 | **Four BLOCK findings** (§4): GATE-13.5-05, GATE-13.5-02, GATE-13.5-01, GATE-13.4-02 | None can be closed by 13.6 either. Each is a code, schema or configuration change in a named lane |
| 3 | **GATE-13.5-02 is a live cross-tenant read on production-lineage data** | 13.2 filed GATE-13.2-01 with a harness-built collision. Production already has the collision. That upgrades the finding's urgency, and 13.6's P0/P1 closure requirement has to see it |
| 4 | **GATE-13.1-02 is still open and is 13.6's blocker, not the canary's** (§4) | 86 tests error at fixture setup, so "no required skips" cannot be asserted. 13.5 explicitly declined to fix it and said why |
| 5 | **The nine-signal export** ([`canary-dashboard.sql`](canary-dashboard.sql)) | The "no hanging required job/outbox" clause of 13.6 is `s6_outbox_failed` + `s6_outbox_stale` + `LLEN celery`, and this is the query that answers it |
| 6 | **`preflight.sql` gates 20–25 compose with 13.2's 1–9, 13.4's 10–19, 12.3's 0–4** | Twenty-eight read-only gates across four files, no overlap, one command each. That is the whole database half of the final gate |
| 7 | **Two fixes shipped** (§1), and the pre-existing rollback-lint failures are unchanged (§9) | So a diff of the test results between 13.4 and 13.5 shows no regression and no silent repair |

---

## 11. Deferral — 2026-10-09: GATE-13.5-05 resolved, canary blocked on infrastructure

Appended **2026-10-09 (UTC)**. §1–§10 are left exactly as captured; this section
records a decision and one resolved fact, not a canary run. **Production was not
contacted here either** — no SSH, no deploy, no query. The server is offline.

### 11.1 The operator resolved GATE-13.5-05

The owner confirmed, directly: **production is `*.beanola.com`.** That settles the
§4 first go/no-go item and §7.5:

- The shipped bundle's CSP (`connect-src https://api.beanola.com`, the only
  browser-**enforced** source) is **correct** for production.
- `deploy/RUNBOOK.md`'s `*.mihas.edu.zm` DNS cutover and
  `scripts/smoke-production.sh`'s `*.mihas.edu.zm` default are the **stale** side
  of the disagreement — they describe the pre-migration host, not production.
- `post-deploy-smoke.sh` already defaults to `beanola.com` (§7.5), so it needs no
  override for the real run; `APP_URL=https://apply.beanola.com` and
  `API_URL=https://api.beanola.com` are the values for Block B.

GATE-13.5-05 is therefore **resolved as a fact** (the hostname is known) and
**carried as a doc-fix** (the runbook and smoke-script defaults still name the old
host). The doc-fix is a deploy/runbook-lane edit, not a canary prerequisite now
that the enforced CSP is confirmed authoritative.

### 11.2 Why the canary cannot run now, and what that means for closure

**The production server is offline, and the owner is switching hosting
providers.** Every remaining step of this bullet needs a reachable production
target:

- deploy the image (§6 step 5) — nothing to deploy to;
- the HTTP post-deploy proof, `post-deploy-smoke.sh http` + `on-box` (§6 Block B)
  — no live endpoint, no box;
- the 24-hour signal sampling into `sign-off.md` Part 3 — no running canary;
- the two human attestations in `sign-off.md` Part 4a/4b — gated on all of the
  above, and human-only regardless.

So this bullet is recorded as **deferred — blocked on infrastructure**, not as
done. The checkbox stays **`[~]`** (deferred), never `[x]`. An agent cannot
produce a canary that did not happen, and `sign-off.md` stays blank by design.

### 11.3 What IS proven, read-only, against production-lineage data

The database half of the canary is already rehearsed. The preflight gates 20–25
ran read-only on **both** `v2_snap_13_4` (the restored production-lineage
snapshot) and `v2_fresh_13_4` (the expanded release schema), with the write
refusal proven — [`raw/preflight-two-databases.txt`](raw/preflight-two-databases.txt).
On the production-lineage snapshot they read exactly as §4 predicts: gate 20 three
WARN (headroom 46/19/39 of 50 — GATE-13.5-01), gate 21 FAIL (3 shared intake
names — GATE-13.5-02 live), gate 22 FAIL (GATE-13.4-02), gate 24 two tenants open
(GATE-13.5-04). The width-drift probe (§7.1) and the nine-signal dashboard SQL
(§3) were likewise validated on both databases. **What this proves:** the
instruments run, refuse writes, and reproduce every predicted blocker on
production-lineage data — the canary is *ready to execute* the moment a host is
live. **What it does not prove:** anything about production's own current rows, or
any HTTP/signal behaviour, which only the live run can show (§8 items 1–4, 9).

### 11.4 The single open item carried to 13.6, and its trigger

| what remains | why it cannot be done now | owner | trigger |
|---|---|---|---|
| deploy the release to the new host; run `post-deploy-smoke.sh http` + `on-box`; sample `canary-dashboard.sql` at cutover/+15m/+1h/+24h; run M1 three times, M2–M4 once | needs a reachable production target; the server is offline and hosting is being switched | **operator (human)** | **the new hosting provider is live** |
| sign `sign-off.md` Part 4a (deploy operator) and Part 4b (independent reviewer) | human attestation; an agent must not sign | **operator + a second reviewer** | after the run above |
| close or accept the four BLOCK findings before cutover (GATE-13.5-02, -01, GATE-13.4-02; GATE-13.5-05 doc-fix) | each is a code/schema/doc change in a named lane (§4) | named lanes | before cutover |

When the new host is live, the operator path is §6 Block A → deploy → Block B →
`sign-off.md`, with `APP_URL`/`API_URL` set to `*.beanola.com`. Nothing in that
path needs rediscovering: it is this directory.
