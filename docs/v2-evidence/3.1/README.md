# Task 3.1 Evidence — Live schema manifest / diff tool

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/`
**Task:** 3.1 Replace static hand lists with a live schema manifest/diff tool
**Requirements:** R15.1–R15.4, R15.7–R15.8
**Findings:** DATA-07, DATA-08, DATA-09
**Candidate base commit:** `bae29a28d9657f288b3339062adb31285959c966` (task-3.1 tool
files are working-tree additions, not yet committed — this task does not commit).
**Status:** tool + tests delivered and green; three of four manifests captured;
production manifest is operator-gated (see below). Task is **NOT** marked complete.

---

## 1. What was built

A live-introspection schema manifest engine that replaces the hand-maintained
`EXPECTED_TABLES` / `EXPECTED_FK_RELATIONSHIPS` / `EXPECTED_INDEXES` lists in
`backend/scripts/verify_schema_static.py` and `backend/scripts/verify_migration.py`
(the exact anti-pattern finding **DATA-08** flags).

| Artifact | Path | Purpose |
|---|---|---|
| Reusable module | `backend/apps/common/schema_manifest.py` | Postgres introspection → machine-readable manifest; pure `diff_manifests` / `verify_manifest` / `compute_fingerprint`. |
| Management command | `backend/apps/common/management/commands/schema_manifest.py` | `--emit` / `--diff` / `--matrix` / `--verify` / guarded `--regenerate-full-schema`. |
| Diff regression tests | `backend/tests/unit/test_schema_manifest_diff.py` | 22 intentional-drift fixtures (no DB, no skips). |
| Introspection tests | `backend/tests/unit/test_schema_manifest_introspection.py` | live introspection (Postgres-gated + vendor-agnostic smoke). |
| Property tests | `backend/tests/property/test_schema_manifest_properties.py` | 5 PBTs over the pure diff engine (no DB, no skips). |

The manifest introspects (design.md §15.1): tables, columns, types, nullability,
defaults, PK/FK targets **and validation state**, unique/check/exclusion
constraints, indexes **and predicates**, triggers, extensions, and migration
ids/checksums/applied_at.

Severity policy (R15.3/R15.4): missing table/column, changed column, missing/
changed/**unvalidated** FK, missing unique/check, **missing index**, missing
extension, missing migration and migration-checksum drift are **failures**. Extra
indexes/triggers/extensions, extension-version drift and extra migrations are
**warnings**. `applied_at` and extension patch versions are excluded from the
schema fingerprint.

---

## 2. Manifests captured

| Manifest | Source | Captured? | Fingerprint | Tables | Unvalidated FKs |
|---|---|---|---|---|---|
| `manifest.fresh-from-empty.json` | empty local Postgres 18.4 + `00_full_schema.sql` + `apply_sql_migrations` (21 scripts) | **yes** | `sha256:5f5512e1…c325e1a` | 80 | **28** |
| `manifest.migrated-snapshot.json` | local `mihas` Postgres 18.4 (previously migrated DB), read-only DSN | **yes** | `sha256:fbc4dcc5…1633a990` | 71 | 0 |
| `manifest.neon-branch.json` | Neon authoring default branch (project `mihasApplication`/`wild-bar-37055823`), Postgres 17.10, **read-only** | **yes** | `sha256:084d296d…0d31ce67` | 71 | 0 |
| production read-only | self-hosted EC2 Docker `mihas-postgres-1` | **deferred — operator-gated** | — | — | — |

### Neon capture note (MCP unavailable)
The Neon MCP server (`kiroPowers → neon`) was **not connected** in this
environment (`MCP server 'power-neon-Neon' is not connected`). The Neon branch
manifest was therefore captured via the authoring `DATABASE_URL` from
`backend/.env` using the tool's `--dsn-env` path, which forces a
`readonly=True` session and issues **only** `SELECT`/`SHOW` introspection
statements. No writes, no destructive SQL, no branch mutation. The DSN was loaded
into an env var and never printed or committed. When MCP is available, the same
manifest can be produced with `execute_sql` read-only queries.

### Production manifest — deferred (operator-gated)
Per `infrastructure.md`, production is the self-hosted EC2 Docker Postgres,
reachable only via SSH + `docker compose exec`, and is not reachable from this
environment. It was **not** captured and is **not** fabricated. Operator step to
capture it from the box (read-only), then diff it locally:

```bash
# On the EC2 host (read-only pg_dump-free introspection via the running container)
ssh -i /home/cosmas/Downloads/mihasapplication2026.pem ubuntu@<ec2-host>
cd ~/mihas
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema-only > /tmp/prod-schema.sql
# — or — copy backend/ into the container and run, read-only:
#   python manage.py schema_manifest --emit prod.json --label production \
#     --dsn-env PROD_DSN     (PROD_DSN pointed at the in-container postgres)
```

---

## 3. Diff + verify results (honest drift — confirms DATA-07/08/09)

`diff-report.json` (matrix, baseline = fresh-from-empty):

| Comparison | Failures | Warnings |
|---|---|---|
| fresh-from-empty vs migrated-snapshot | 434 | 180 |
| fresh-from-empty vs neon-branch | 492 | 183 |

`verify.*.json` (intrinsic, per manifest):

* **fresh-from-empty → 28 `unvalidated_foreign_key` failures** across
  `access_grants`, `applications`, `communication_templates`, `institution_assets`,
  `institution_document_profiles`, `institution_document_templates`,
  `institution_domains`, `institution_required_documents`, `programs`,
  `user_institution_memberships`. **This is DATA-07 / R15.4 reproduced**: the June
  2026 tenant SQL scripts add these FKs `NOT VALID` and no `VALIDATE CONSTRAINT`
  migration exists. The gate fails (exit 1) — as required.
* migrated-snapshot → 0, neon-branch → 0 (their tenant FKs are validated
  Django-style `DEFERRABLE` constraints — i.e. the live DBs were built by a
  **different** path than the committed scripts, which is itself the
  reconciliation gap R15/DATA-08 targets).

Representative drift categories the tool surfaced (all in `diff-report.json`):

* **DATA-08 (`00_full_schema.sql` is stale):** the fresh-from-empty DB (built from
  `00_full_schema.sql`, generated from Django models) is **missing column
  defaults** present in the live DBs (e.g. `subjects.id` default `gen_random_uuid()`,
  `*.created_at` default `now()`, `user_notification_preferences.timezone`
  `'Africa/Lusaka'`) and uses different FK naming/validation. `00_full_schema.sql`
  cannot be trusted as canonical.
* **DATA-09 (migration history):** migration-history rows differ across
  environments — migrated-snapshot lacks several June tenant migration rows, and
  Neon stored **truncated 12-char checksums** vs the full 64-char sha256 the
  current `apply_sql_migrations` records, so `migration_checksum_changed` fires.
* **Canonical columns (feeds DATA-01/02, STU-01, task 3.2):** none of the three
  environments have `applications.canonical_program_id` or
  `applications.intake_offering_id` columns (confirms baseline finding `BL-0.5-08`).

The three fingerprints are all **different**, which is the honest headline: repo
models, the committed SQL migration path, and each live database do **not** agree
yet. Reconciling them is the work of tasks 3.2–3.6; task 3.1 delivers the
instrument that measures it.

---

## 4. `00_full_schema.sql` was NOT regenerated (by design)

Task 3.1 says "regenerate `00_full_schema.sql` only from a verified canonical
database." No environment reachable here is canonical:

* fresh-from-empty (its own source) has 28 unvalidated FKs and missing defaults;
* Neon is missing canonical assignment columns (`BL-0.5-08`) and has empty
  canonical program data;
* production is unreachable.

The tool's `--regenerate-full-schema` guard **refuses** unless the source manifest
verifies clean **and** the operator passes `--i-verified-canonical`; even then it
stops at a documented operator step rather than overwriting automatically.
Demonstrated refusal (exit 1) is recorded — `00_full_schema.sql` is **unchanged**.

---

## 5. Reproduction

```bash
cd backend
VENV=./.venv/bin/python

# fresh-from-empty (throwaway local DB)
createdb v2_fresh_from_empty
psql -d v2_fresh_from_empty -f scripts/00_full_schema.sql
psql -d v2_fresh_from_empty -f scripts/2026_05_22_migration_history_extend.sql
DATABASE_URL="postgres:///v2_fresh_from_empty" DJANGO_SETTINGS_MODULE=config.settings.dev \
  $VENV manage.py apply_sql_migrations --allow-non-additive
DATABASE_URL="postgres:///v2_fresh_from_empty" DJANGO_SETTINGS_MODULE=config.settings.dev \
  $VENV manage.py schema_manifest --emit ../docs/v2-evidence/3.1/manifest.fresh-from-empty.json --label fresh-from-empty

# migrated snapshot / neon branch (read-only DSN in an env var; never printed)
export MIGRATED_DSN="postgres:///mihas"
DJANGO_SETTINGS_MODULE=config.settings.test $VENV manage.py schema_manifest \
  --emit ../docs/v2-evidence/3.1/manifest.migrated-snapshot.json --label migrated-snapshot --dsn-env MIGRATED_DSN
export NEON_DSN=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
DJANGO_SETTINGS_MODULE=config.settings.test $VENV manage.py schema_manifest \
  --emit ../docs/v2-evidence/3.1/manifest.neon-branch.json --label neon-branch --dsn-env NEON_DSN

# diff matrix + intrinsic verify
DJANGO_SETTINGS_MODULE=config.settings.test $VENV manage.py schema_manifest \
  --matrix ../docs/v2-evidence/3.1/manifest.fresh-from-empty.json \
           ../docs/v2-evidence/3.1/manifest.migrated-snapshot.json \
           ../docs/v2-evidence/3.1/manifest.neon-branch.json \
  --report ../docs/v2-evidence/3.1/diff-report.json
DJANGO_SETTINGS_MODULE=config.settings.test $VENV manage.py schema_manifest \
  --verify ../docs/v2-evidence/3.1/manifest.fresh-from-empty.json --report ../docs/v2-evidence/3.1/verify.fresh-from-empty.json
```

---

## 6. Verifier regression tests

Run without env gating/skips in the V2 CI profile (SQLite fast suite); the
Postgres-only *introspection* assertions use `skipif(vendor != 'postgresql')`
matching the repo convention, so they execute on Postgres and skip cleanly on
SQLite.

| Run | Result |
|---|---|
| SQLite fast suite (`config.settings.test`) | **29 passed, 3 skipped** (the 3 Postgres-only introspection tests) |
| Real Postgres (`config.settings.dev` + local PG) | **32 passed, 0 skipped** |

Intentional-drift fixtures proving the named failure modes:
`test_missing_index_is_a_failure`, `test_unvalidated_fk_is_a_failure_in_verify`,
`test_unexpected_column_is_a_failure` (plus missing table/column, column change,
FK change, migration checksum drift, missing extension, fingerprint stability).
