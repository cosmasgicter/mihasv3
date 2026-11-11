# Task 3.6 Evidence — Migration history generated from real databases

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/`
**Task:** 3.6 Generate migration history from real databases
**Requirements:** R1.5, R15.8
**Findings:** DATA-09, GOV-05
**Candidate base commit:** `bae29a28d9657f288b3339062adb31285959c966` (task-3.6
tool/test files are working-tree additions — this task does not commit).
**Schema fingerprint (release DB):**
`sha256:a021666c5395bb8d3d7eb69ed1b3037f84221aa2188c052f3be9e9865625da6d`
(re-emitted 2026-11-08 by student-journey-repair task 3.15, which added
`2026_11_02_01_repair_document_snapshot_presence.sql`; see the regeneration log at
the foot of this file. Previously `sha256:771c69eaf448…`, the
task-3.1 manifest fingerprint of the fresh-from-empty canonical-committed-path DB;
re-emitted 2026-08-15 by 13.6 remediation item **M4** — see the regeneration log
at the foot of this file for the two earlier fingerprints and why each moved).

> **This directory is the single current evidence link for migration-history
> truth.** It supersedes the hand-maintained `backend/scripts/MIGRATION_HISTORY.md`
> mirror (which stopped at the 2026-05 scripts / "40 rows", the exact DATA-09 gap)
> and the contradictory migration-completion claims in
> `docs/multi-tenant-beanola-progress.md`. Both now point here rather than
> carrying their own drifting migration lists.

---

## 1. What was built

A migration-history report **generated from a live database** (not hand-typed),
plus a **real, runnable freshness test** that breaks the build when the report
drifts from the migration scripts on disk.

| Artifact | Path | Purpose |
|---|---|---|
| Reusable module | `backend/apps/common/migration_history_report.py` | Projects a task-3.1 schema manifest into a migration-history report (ids/checksums/applied_at + June-2026+ tag), links the schema fingerprint, records a **non-secret** `host=… db=…` identity; pure freshness/completeness/secret checks. |
| Management command | `backend/apps/common/management/commands/migration_history_report.py` | `--emit` (from the Django connection or a read-only `--dsn-env` DSN), `--from-report --markdown`, `--check-freshness [--against-db]`. |
| Freshness test (required evidence) | `backend/tests/unit/test_migration_history_report_freshness.py` | 31 pure tests: stale-report detection, completeness (R15.8 fields), secret-leak guard, and a build-breaking guard that the committed release report stays fresh vs the current on-disk scripts. |
| Property tests | `backend/tests/property/test_migration_history_report_properties.py` | 3 Hypothesis properties over the pure freshness engine (no DB, no skips). |

The report reuses task 3.1's `apps.common.schema_manifest` as the single source
of the migration rows and the schema fingerprint (design §15.1), so it is
deterministic and never re-queries the database on its own.

---

## 2. Generated reports

| Report | Source DB | June 2026+ rows | Freshness |
|---|---|---|---|
| `migration-history.release.json` / `.md` | fresh-from-empty local Postgres built from `00_full_schema.sql` + `apply_sql_migrations` (the canonical committed path), identity `host=127.0.0.1 db=v2_mig_history_m4` | **32 of 46** | **OK** — covers every June-2026+ script on disk (0 findings) |
| `migration-history.neon-default.json` / `.md` | Neon authoring default branch, read-only, identity `host=ep-dawn-unit-…-pooler.c-3.us-east-1.aws.neon.tech db=neondb` | **0 of 44** | **STALE by design** — 16 findings (`freshness.neon-default.json`) |

Every June-2026+ row in the release report carries a full 64-char sha256
checksum and an `applied_at` timestamp (R15.8). The reports carry only a
non-secret `host=… db=…` identity — never a DSN, user, or password
(`find_secret_leaks` is asserted clean in the test and re-run in the freshness
gate).

### Why the Neon-default report is legitimately stale
The Neon default branch is the **authoring** database (`infrastructure.md`). Its
`migration_history` stops at `2026_07_12 schema_cleanup_*` and records **zero**
June-2026+ tenant/canonical scripts — those were proven on a Neon *branch*
(`br-tiny-bonus-ahz81bof`) and applied to production, but applying them to the
Neon default branch is a separate operator step. The freshness checker correctly
reports the Neon-default report as stale (16 June-2026+ scripts on disk, none in
that DB). This is honest drift the tool is built to surface — not a tool bug —
and it is the same DATA-09 condition, captured from a real database instead of a
stale hand-written doc. The **release** report is the fresh, canonical-committed-
path record used as the release evidence.

### Production report — operator-gated (not fabricated)
Production is the self-hosted EC2 Docker `mihas-postgres-1`, reachable only via
SSH + `docker compose exec` and not reachable from this environment. Capture it
read-only from the box, then render/gate locally:

```bash
# On the EC2 host — read-only migration_history dump
ssh -i /home/cosmas/Downloads/mihasapplication2026.pem ubuntu@<ec2-host>
cd ~/mihas
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
   "SELECT migration_name FROM migration_history ORDER BY 1;"'
# — or, with backend/ available in the container, emit the full report read-only:
#   PROD_DSN=... python manage.py migration_history_report \
#     --emit prod.json --label production --dsn-env PROD_DSN
```

---

## 3. Freshness test + results (the required "freshness test")

The freshness test is **real and runnable in the V2 CI profile — no skip, no
staging credential gate.** Its logic is DB-free (pure functions over report
fixtures + the committed artifact + the on-disk script list), so it runs in the
SQLite fast suite and on Postgres identically.

| Run | Command | Result |
|---|---|---|
| Freshness unit test | `DJANGO_SETTINGS_MODULE=config.settings.test pytest tests/unit/test_migration_history_report_freshness.py` | **31 passed** |
| Freshness property test | `… pytest tests/property/test_migration_history_report_properties.py` | **3 passed** |
| Command, release report | `manage.py migration_history_report --check-freshness docs/v2-evidence/3.6/migration-history.release.json` | **FRESHNESS OK** (16 June+ rows, links `sha256:0d8a44ee…`, no secrets) — `raw/freshness-release.txt` |
| Command, neon-default report | `… --check-freshness docs/v2-evidence/3.6/migration-history.neon-default.json` | **FRESHNESS FAIL: 16 findings** (expected; authoring branch) — `raw/freshness-neon-default.txt` |

It proves the two things task 3.6 requires:

1. **It fails when the report is stale** — a June-2026+ script on disk that is
   absent from the report is flagged (`test_stale_report_missing_june_migration_is_flagged`,
   `test_report_omitting_all_june_migrations_flags_each`), plus incomplete-report
   and secret-leak guards.
2. **The committed release report stays fresh** — `test_committed_release_report_is_fresh_and_complete`
   / `…covers_every_june_plus_script_on_disk` re-verify the committed
   `migration-history.release.json` against the *current* on-disk scripts, so
   adding a June-2026+ migration without regenerating the report breaks the build
   with the offending filename.

---

## 4. Files in this directory

| File | Contents |
|---|---|
| `migration-history.release.json` / `.md` | Generated report from the fresh-from-empty canonical-committed-path DB (authoritative release record). |
| `migration-history.neon-default.json` / `.md` | Generated report from the Neon authoring default branch (read-only; legitimately stale). |
| `freshness.release.json` | `--check-freshness` findings for the release report: `ok: true`, 0 findings. |
| `freshness.neon-default.json` | `--check-freshness` findings for the Neon-default report: `ok: false`, 16 findings. |
| `raw/commit.txt` | Candidate commit + branch. |
| `raw/fresh-from-empty-apply.log` | `apply_sql_migrations` output that built the release DB (30 scripts applied). |
| `raw/freshness-release.txt` / `raw/freshness-neon-default.txt` | Raw command output for both freshness runs. |
| `raw/neon-default-migration_history.txt` | Read-only Neon default-branch `migration_history` dump (44 rows, 0 June+). |

---

## 5. Reproduction

```bash
cd backend
VENV=./.venv/bin/python

# release (fresh-from-empty canonical committed path)
createdb v2_mig_history_3_6
psql -d v2_mig_history_3_6 -f scripts/00_full_schema.sql
psql -d v2_mig_history_3_6 -f scripts/2026_05_22_migration_history_extend.sql
DATABASE_URL="postgres:///v2_mig_history_3_6" DJANGO_SETTINGS_MODULE=config.settings.dev \
  $VENV manage.py apply_sql_migrations --allow-non-additive        # raw/fresh-from-empty-apply.log
DATABASE_URL="postgres:///v2_mig_history_3_6" DJANGO_SETTINGS_MODULE=config.settings.dev \
  $VENV manage.py migration_history_report \
    --emit ../docs/v2-evidence/3.6/migration-history.release.json \
    --label release-canonical-committed-path \
    --markdown ../docs/v2-evidence/3.6/migration-history.release.md

# neon default branch (read-only DSN in an env var; never printed)
export NEON_DSN=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
DJANGO_SETTINGS_MODULE=config.settings.test $VENV manage.py migration_history_report \
  --emit ../docs/v2-evidence/3.6/migration-history.neon-default.json \
  --label neon-default-branch --dsn-env NEON_DSN \
  --markdown ../docs/v2-evidence/3.6/migration-history.neon-default.md

# freshness gate (pure; no DB)
DJANGO_SETTINGS_MODULE=config.settings.test $VENV manage.py migration_history_report \
  --check-freshness ../docs/v2-evidence/3.6/migration-history.release.json \
  --report ../docs/v2-evidence/3.6/freshness.release.json

# freshness test
DJANGO_SETTINGS_MODULE=config.settings.test $VENV -m pytest \
  tests/unit/test_migration_history_report_freshness.py \
  tests/property/test_migration_history_report_properties.py
```

---

## Regeneration log

The freshness gate is deliberately unforgiving: any June-2026+ script that lands on
disk without the release report being regenerated fails
`tests/unit/test_migration_history_report_freshness.py`. That is the gate working,
and it means the report is re-emitted by whichever task next touches `scripts/`.

| Date (UTC) | Regenerated by | June+ rows | Why |
|---|---|---|---|
| 2026-07-22 | task **3.6** (original) | 16 of 32 | initial release report |
| 2026-08-05 | task **7.3** | 25 of 39 | five June+ scripts had accumulated on disk unrecorded — `2026_07_24_01_application_draft_name.sql`, `2026_07_25_01_canonical_subject_catalog.sql`, `2026_07_26_01_document_evidence_lifecycle.sql`, `2026_07_30_01_payment_fee_quotes.sql` (four other in-flight lanes) plus 7.3's own `2026_07_26_02_document_current_slot_alignment.sql`. Regenerated from a fresh-from-empty Postgres via the documented canonical path, so all 39 rows carry a real checksum and `applied_at` from a database that genuinely applied them in sweep order. |

The 2026-08-05 regeneration also re-proves something the report alone does not
state: **every additive committed script still applies cleanly from an empty
database in filename order** — `00_full_schema.sql` →
`2026_05_22_migration_history_extend.sql` → sweep, zero failures. Two of the 39
on-disk scripts stay pending by design: `schema_cleanup_drop_stale_columns.sql`
carries a `DROP COLUMN` and the additive-only lint refuses it without an explicit
`--allow-non-additive` operator review (neither is June-2026+, so freshness is
unaffected). See `docs/v2-evidence/7.3/README.md` §6.7 for that run's context.
| 2026-08-15 | task **13.6** remediation item **M4** | 32 of 46 | **seven** June+ scripts had accumulated on disk unrecorded, and the count had been reported and deliberately not cleared four times running — 3 when 13.1/L1-L4 measured it, 5 after L2-L3 (§6.2), 6 after L7-L8 (§4.5), 7 after M1-M2 (§6.1). Every one of those batches declined for the *same* good reason: this file is task 3.6's Required_Evidence, and regenerating it would have absorbed other lanes' omissions into one lane's evidence. 13.6 §18.1 therefore made the regeneration its own lane item, so it happens **once, deliberately, and attributed**. Regenerated from a fresh-from-empty throwaway local Postgres (`v2_mig_history_m4`, `127.0.0.1:5433`) by the documented canonical path in §5 — `00_full_schema.sql` → `2026_05_22_migration_history_extend.sql` → `apply_sql_migrations --allow-non-additive` — so all 48 rows carry a real 64-char checksum and an `applied_at` from a database that genuinely applied them in sweep order. Raw: [`../13.6/remediation/M4-M5-M6/raw/`](../13.6/remediation/M4-M5-M6/raw/) `10`–`16`. |

The 2026-08-15 regeneration re-proves the same property the 2026-08-05 one did,
on a script set that has grown by seven: **every additive committed script still
applies cleanly from an empty database in filename order** — `00_full_schema.sql`
→ `2026_05_22_migration_history_extend.sql` → sweep, **46 applied, 0 failures**
([`raw/11`](../13.6/remediation/M4-M5-M6/raw/11-m4-fresh-build.txt)). Unlike the
2026-08-05 run, nothing stayed pending: `schema_cleanup_drop_stale_columns.sql`
and `schema_cleanup_device_session_default.sql` both applied under the same
explicit `--allow-non-additive` operator review §5 documents, so the additive-only
lint's refusal is a *default*, not a permanent exclusion.

Two of the 48 rows — `payment_hardening_indexes.sql` and
`payment_hardening_preflight.sql` — are not in `forward_scripts_on_disk` at all:
they are seeded into `migration_history` by `00_full_schema.sql` itself rather
than applied by the sweep. Recorded because a reader comparing 48 against 46
would otherwise have to work it out. In the other direction the set is exact:
**0 forward scripts on disk have no row**, which is a stronger statement than
freshness alone makes (freshness only gates the June-2026+ subset).

`backend/scripts/00_full_schema.sql` was **not** regenerated, and could not be by
any committed path. Its guard is terminal in every branch — including *with* the
operator attestation, which returns *"guard reached: regeneration of
00_full_schema.sql is intentionally an operator step (pg_dump --schema-only from
the attested canonical DB)"*. All three branches were run and the file's sha256
and mtime are unchanged afterwards
([`raw/15`](../13.6/remediation/M4-M5-M6/raw/15-m4-full-schema-guard.txt)). It
still declares `"intake" varchar(100)` where the model and the column are now
255, which is what L2-L3 §6.2 and M1-M2 §6.2 recorded; the fresh-from-empty
database built *from* it measures **255** on all three snapshot columns, because
the sweep applies the widen on top — so the snapshot being one number stale has
no runtime effect, and the next operator regeneration picks it up.

### Regeneration 2026-11-08 (student-journey-repair task 3.15)

The release report was re-emitted by the §5 reproduction, unchanged in method,
on a fresh database `v2_mig_history_sjr` in the throwaway local Postgres 17
container (the earlier runs used Postgres 16.14, so the fingerprint moves for
that reason as well as for the new script). `apply_sql_migrations
--allow-non-additive` applied 47 scripts including the new data-only, idempotent
`2026_11_02_01_repair_document_snapshot_presence.sql`; the report now has 49 rows
(33 June 2026+), `--check-freshness` reports FRESHNESS OK, and
`test_migration_history_report_freshness.py` passes (31). The neon-default report
was not regenerated (no Neon access in that run).
