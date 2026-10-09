# Canary Operator Sign-Off — admissions-v2 task 13.5

**This template is UNSIGNED and must stay unsigned until a human operator has
run the canary.** No agent, script, or automated process may complete any field
below. A sign-off asserted by the thing being signed off is not a sign-off.

Task 13.5's `_Evidence:` line asks for three artifacts. Two of them exist in
this directory as instruments ([`canary-dashboard.sql`](canary-dashboard.sql),
[`post-deploy-smoke.sh`](post-deploy-smoke.sh)). This is the third, and unlike
the other two it cannot be produced without a person: it is an **attestation**,
and its only value is that a named human is accountable for it.

---

## Part 0 — Release identity (fill before deploying)

| Field | Value |
|---|---|
| Release tag (`vYYYY.MM.DD-N`) | |
| Backend image (`ghcr.io/…-backend:<sha>`) | |
| Frontend image (`ghcr.io/…-frontend:<sha>`) | |
| `APP_VERSION` pinned in `~/mihas/.env` | |
| **Rollback anchor** — previous `BACKEND_IMAGE` | |
| **Rollback anchor** — previous `FRONTEND_IMAGE` | |
| Pre-deploy backup file (`deploy/backup-db.sh` → R2 key) | |
| Backup verified non-empty and restorable | ☐ yes ☐ no |
| Canary tenant (institution `code`) | |
| Tenants with `open_intakes > 0` at cutover (preflight gate 24) | |
| Deploy operator (name, not a role) | |
| Deploy window start / end (UTC) | / |

> The two rollback-anchor rows are not paperwork. `.github/workflows/deploy.yml`
> captures them automatically as `PREV_BACKEND` / `PREV_FRONTEND`, but only
> inside that one workflow run's log. Copying them here is what makes a manual
> rollback possible an hour later.

---

## Part 1 — Pre-flight go/no-go (before the deploy)

Run, in this order, against the production database (all read-only):

```
docs/v2-evidence/13.5/preflight.sql        gates 20-25
docs/v2-evidence/13.2/invariants.sql       gates 1-9
docs/v2-evidence/13.4/invariants.sql       gates 10-19
docs/v2-evidence/12.3/invariants.sql       gates 0-4
```

| Gate | Question | Result | Blocking? |
|---|---|---|---|
| 20 | no catalogue name exceeds a snapshot-column ceiling | | **yes** |
| 20 | no column is narrower than the model declares | | **yes** |
| 21 | `colliding_intake_names = 0` (GATE-13.2-01 dormant) | | **yes** |
| 22 | the sweep can complete here (GATE-13.4-02) | | **yes** |
| 23 | which hostnames resolve a tenant | | context |
| 24 | exactly one institution has `open_intakes > 0` | | **yes** |
| 10 | migration ledger checksums | | no — known (GATE-13.1-04) |
| 11 | `not_valid_fks = 0` | | **yes** |
| 13 | expanded columns present | | **yes** |
| 19 | neutral communication fallback | | see README §4 |
| 1–9 | 13.2's data-integrity gates | | **yes** except 5 |

**Go/no-go decision.** Every gate marked blocking must read PASS, or a named
exception must be recorded here with the reason and who accepted it:

```
Blocking gate failures accepted, with reason and acceptor:
  (none — or list them; an empty list means every blocking gate passed)
```

☐ I have read the README §4 go/no-go table and I am authorising this canary.

Operator: ______________________  Date (UTC): ______________

---

## Part 2 — Post-deploy proof

```bash
./docs/v2-evidence/13.5/post-deploy-smoke.sh http      # off the box
./docs/v2-evidence/13.5/post-deploy-smoke.sh on-box    # from ~/mihas
```

| Check | Result |
|---|---|
| all six containers up, none restarting | |
| `check_schema_drift` exit 0 | |
| `apply_sql_migrations --dry-run` — pending file list | |
| manifest fingerprint vs `19c5216bb175de41…` | |
| `schema_manifest --verify` ok | |
| width-drift probe — narrower columns | |
| `/health/live/`, `/health/ready/`, `/health/redis/` | |
| tenant context is neutral (no MIHAS/KATC on a neutral host) | |
| unauthenticated state change refused (4xx) | |
| `LLEN celery` | |
| beat log shows recent due-task dispatches | |
| `check_production_state --strict` exit 0 | |

### The four manual checks (M1–M4 in the smoke script)

| # | Check | Result |
|---|---|---|
| M1 | two-tab autosave probe, run **three** times (GATE-13.2-03) | ☐ pass ☐ **reverted** |
| M2 | the first real canary email — whose brand does the recipient see? | |
| M3 | student critical path on a real phone, first mobile viewport | |
| M4 | scoped tenant admin (not super admin) reaches their own tenant | |

M1 is the one that cannot be delegated to SQL. A revert is silent data loss
across two of a student's own devices; 13.2 saw it in 2 of 3 recordings, so one
clean attempt proves nothing.

---

## Part 3 — Canary window samples

One row per sample from `canary-dashboard.sql`'s export. Minimum: at cutover,
+15 min, +1 h, +24 h. Any signal crossing its threshold twice in a row is a
rollback per README §5.

| sampled_at | s1 operator denials | s2 not-valid FKs | s3 mis-bound apps | s4 drafts never saved | s5 pending >24h | s5 double-open | s6 outbox failed | s6 outbox stale | s7 host collisions | s8 stale staged | s9 email failed | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | |
| | | | | | | | | | | | | |
| | | | | | | | | | | | | |
| | | | | | | | | | | | | |

---

## Part 4 — The attestation

Sign only what you personally verified. Leave anything else blank; a blank line
is information, a guessed line is not.

### 4a. Deploy operator

> I deployed the release identified in Part 0 to production. I took the backup
> named there and confirmed it was non-empty before deploying. I ran the
> pre-flight gates in Part 1 and the post-deploy proof in Part 2, and I have
> recorded their real results — including any failure — rather than the results
> I expected. I did not skip a blocking gate without recording it as an
> accepted exception.

Name: ______________________  Role: ______________________
Signature: __________________  Date (UTC): ______________

### 4b. Canary reviewer (must NOT be the deploy operator)

> I independently read the Part 1 gate results, the Part 3 samples, and the
> four manual checks. I agree the recorded signals support the decision in 4c.
> I have specifically confirmed the two things no query can confirm: the
> two-tab autosave probe (M1) was actually performed, and a real canary email
> was actually opened (M2).

Name: ______________________  Role: ______________________
Signature: __________________  Date (UTC): ______________

### 4c. Activation decision

☐ **Hold** — the canary stays at one tenant. Reason:

☐ **Broaden** — re-open the second institution's intakes. Reconciliation
completed and recorded (13.4 §7's four sweeps each run and replayed):
payment ☐ · document ☐ · domain ☐ · communication ☐

☐ **Roll back** — criteria met, README §5 procedure followed. If the app was
rolled back while the expanded schema remained, record whether
`chk_applications_canonical_assignment` had to be dropped to keep taking
submissions (README §5.3), and whether it was re-added:

```
dropped at (UTC):            re-added at (UTC):
unquarantined violators after rolling forward (13.4 gate 14):
```

Decided by: ______________________  Date (UTC): ______________

### 4d. Known findings carried into production, knowingly

Every unfixed finding the canary runs with must be listed here by id, so nobody
can later claim it was unknown. README §4 is the source list.

| Finding | Accepted because | Accepted by |
|---|---|---|
| GATE-13.5-01 | | |
| GATE-13.5-02 | | |
| GATE-13.2-01 | | |
| GATE-13.4-01 | | |
| GATE-13.4-02 | | |
| GATE-13.3-13 | | |
| GATE-13.1-02 | | |

---

## What this document is not

It is not evidence that a canary happened. An unsigned template is evidence
that a canary was **prepared**. Task 13.5 is recorded as `[-]` for exactly that
reason, and [`README.md`](README.md) states it in its first paragraph.
