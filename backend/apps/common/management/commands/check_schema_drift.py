"""check_schema_drift - fail fast when Django models reference DB columns
that do not exist on a ``managed = False`` table.

Motivation
----------
Django models whose ``Meta.managed = False`` are NOT managed by
``makemigrations`` / ``migrate``. Schema changes to those tables are
hand-written SQL (see ``scripts/migrations/``). If a developer adds a
field to such a model but the corresponding ``ALTER TABLE`` has not run
on the target database, Django will issue ``SELECT ..., <missing_col>
FROM <table>`` on every query and Postgres will error with
"column does not exist", which we see as a 500 per request.

This command is designed to run at container startup BEFORE
``uvicorn``. If drift is detected the command exits non-zero, the
container crashloops, and the operator sees the mismatch in logs
immediately - instead of shipping a broken deployment to users.

What it checks
--------------
For every ``Model`` with ``Meta.managed = False``:
  * The underlying table exists.
  * Every non-m2m, non-many-to-one-related concrete field maps to a
    column present on that table. Column existence is looked up in
    ``information_schema.columns`` so schema introspection works on
    Postgres.

Optional flags (production-schema-reconciliation spec, Component 6):
  * ``--check-fk-indexes`` - assert every foreign-key column on the
    configured database is covered by a btree index whose first column
    matches the FK column. Postgres-only (skipped with a clear message
    on other backends). Emits ``MISSING_FK_INDEX: <table>.<column> ->
    <ref_table>.<ref_column>`` per gap and contributes to the non-zero
    exit when any gap is found. Implements R5.1 / R5.4.
  * ``--check-migration-history-coverage`` - assert every top-level
    ``backend/scripts/*.sql`` Migration_Script committed strictly more
    than ``--commit-window-days`` ago (default 7) has a row in
    ``migration_history``. Files inside ``applied/``, ``archive/`` and
    ``migrations/`` subdirectories and any ``*_rollback.sql`` sibling
    are excluded from the sweep. Emits ``STALE_UNRECORDED_MIGRATION:
    <filename> committed=<iso8601>`` per gap and contributes to the
    non-zero exit. Falls back to filesystem mtime when ``git log``
    fails (shallow CI clones, missing ``git`` binary) and emits
    ``UNTRACKED_MIGRATION_SCRIPT: <filename> source=mtime`` instead.
    Implements R5.2 / R5.3.
  * ``--commit-window-days`` - integer window (default ``7``) used by
    ``--check-migration-history-coverage`` to distinguish in-flight
    Migration_Scripts from stale ones. Files committed exactly at the
    boundary are tolerated per R8.4 ("strictly more than").

What it does NOT check (intentionally)
--------------------------------------
  * Type compatibility (``VARCHAR`` vs ``TEXT`` etc.): not a 500 risk
    in practice - Postgres auto-coerces most compatible types.
  * Nullability: Django's default vs DB nullability drift usually
    surfaces as a validation error, not a 500.
  * Extra DB columns not on the model: these do not break the app.
  * Django-managed tables: covered by ``migrate`` already.

Usage
-----
::

    python manage.py check_schema_drift
    python manage.py check_schema_drift --check-fk-indexes
    python manage.py check_schema_drift --check-migration-history-coverage
    python manage.py check_schema_drift --strict --check-fk-indexes \
        --check-migration-history-coverage

Exit status:
  0 - no drift
  1 - drift detected (list of missing columns / FK indexes / stale
      migrations printed)

Success line shape (Requirement 5.6):
  * Default invocation (no new flags): preserves the historical
    ``No schema drift. Verified <n> managed=False model(s).`` line for
    backwards compatibility with existing CI log parsers and runbooks.
  * With ``--check-fk-indexes`` and/or
    ``--check-migration-history-coverage`` set: prints a single
    structured line of the form
    ``OK: schema-drift=<n> fk-indexes=<m> migration-history=<k>`` where
    ``<n>`` is the number of managed=False models verified, ``<m>`` is
    the count of FK columns inspected (or ``disabled`` when the flag
    was omitted or skipped on a non-Postgres backend), and ``<k>`` is
    the count of Migration_Scripts inspected (or ``disabled`` when the
    flag was omitted or skipped because ``migration_history`` is
    absent).
"""

from __future__ import annotations

import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Optional

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import Model


def _iter_unmanaged_models() -> Iterable[type[Model]]:
    for model in apps.get_models():
        if getattr(model._meta, "managed", True) is False:
            yield model


def _declared_columns(model: type[Model]) -> list[str]:
    """Return the DB column names for every concrete field on ``model``.

    ``ForeignKey`` fields contribute the ``<name>_id`` column; m2m fields
    have their own through-table and are ignored here.
    """
    cols: list[str] = []
    for field in model._meta.get_fields():
        # Skip reverse relations and m2m.
        if getattr(field, "many_to_many", False):
            continue
        if not getattr(field, "concrete", False):
            continue
        # ``column`` exists for concrete fields (including FK's _id column).
        column = getattr(field, "column", None)
        if column:
            cols.append(column)
    return cols


def _existing_columns(table: str) -> set[str]:
    if connection.vendor != "postgresql":
        with connection.cursor() as cursor:
            return {
                column.name
                for column in connection.introspection.get_table_description(cursor, table)
            }

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = %s
              AND table_schema = current_schema()
            """,
            [table],
        )
        return {row[0] for row in cursor.fetchall()}


def _table_exists(table: str) -> bool:
    if connection.vendor != "postgresql":
        return table in connection.introspection.table_names()

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_name = %s
              AND table_schema = current_schema()
            LIMIT 1
            """,
            [table],
        )
        return cursor.fetchone() is not None


# ---------------------------------------------------------------------------
# Foreign-key index check (R5.1, R5.4).
# ---------------------------------------------------------------------------


def _enumerate_foreign_keys() -> list[tuple[str, str, str, str]]:
    """Return ``(table, column, ref_table, ref_column)`` tuples for every
    foreign-key constraint on the configured Postgres database.

    Joins ``information_schema.table_constraints`` to
    ``key_column_usage`` (FK source side) and
    ``constraint_column_usage`` (FK target side), filtered by
    ``constraint_type = 'FOREIGN KEY'`` and ``table_schema =
    current_schema()`` so only the active schema is checked.

    Postgres-only - the caller is expected to guard with a vendor
    check before invoking this helper.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
              tc.table_name AS source_table,
              kcu.column_name AS source_column,
              ccu.table_name AS ref_table,
              ccu.column_name AS ref_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
             AND tc.table_schema = ccu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = current_schema()
            ORDER BY source_table, source_column
            """
        )
        return [
            (row[0], row[1], row[2], row[3])
            for row in cursor.fetchall()
        ]


def _has_first_attribute_btree_index(table: str, column: str) -> bool:
    """Return True when ``table`` has a valid btree index whose first
    indexed attribute is ``column``.

    The check joins ``pg_index``, ``pg_class`` (table + index relation),
    ``pg_attribute`` (resolves the first indexed attribute name from
    ``i.indkey[0]``), and ``pg_am`` to filter to btree access methods.
    Only indexes with ``indisvalid = true`` count - partially built or
    invalid indexes do not satisfy the FK_Index_Invariant.

    Postgres-only.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1
            FROM pg_index i
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_attribute a
              ON a.attrelid = t.oid
             AND a.attnum = i.indkey[0]
            JOIN pg_class idx ON idx.oid = i.indexrelid
            JOIN pg_am am ON am.oid = idx.relam
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE am.amname = 'btree'
              AND i.indisvalid = true
              AND t.relname = %s
              AND a.attname = %s
              AND n.nspname = current_schema()
            LIMIT 1
            """,
            [table, column],
        )
        return cursor.fetchone() is not None


def _find_missing_fk_indexes() -> list[tuple[str, str, str, str]]:
    """Return the FK rows that lack a covering btree index on the FK column.

    Each returned tuple is ``(table, column, ref_table, ref_column)``.
    The list is empty when the FK_Index_Invariant holds. Caller guards
    with ``connection.vendor == 'postgresql'``.
    """
    gaps: list[tuple[str, str, str, str]] = []
    for table, column, ref_table, ref_column in _enumerate_foreign_keys():
        if not _has_first_attribute_btree_index(table, column):
            gaps.append((table, column, ref_table, ref_column))
    return gaps


# ---------------------------------------------------------------------------
# Migration-history coverage check (R5.2, R5.3).
# ---------------------------------------------------------------------------


# Default migrations directory - same path used by ``apply_sql_migrations``
# (``backend/scripts/``). Resolved at import time so test fixtures and
# production share a single source of truth and so the sweep cost stays
# at directory-listing speed even when called many times.
MIGRATION_SCRIPTS_DIR: Path = (
    Path(__file__).resolve().parents[4] / "scripts"
)

# Subdirectories that hold scripts we must NOT include in the coverage
# sweep - see Task 4.2: ``applied/`` (out-of-band scripts already in
# ``migration_history``), ``archive/`` (historical), ``migrations/``
# (legacy directory - its top-level peer is the canonical home).
# Listed here for documentation; runtime exclusion is automatic because
# ``_enumerate_migration_scripts`` does not recurse.
_EXCLUDED_MIGRATION_SUBDIRS: frozenset[str] = frozenset(
    {"applied", "archive", "migrations"}
)


def _enumerate_migration_scripts(
    directory: Optional[Path] = None,
) -> list[Path]:
    """Return the top-level forward-only ``*.sql`` Migration_Scripts.

    Filters applied:

    * ``directory.iterdir()`` is non-recursive - files inside
      ``applied/``, ``archive/`` and ``migrations/`` subdirectories are
      excluded by virtue of not descending into them.
    * Filenames ending in ``_rollback.sql`` are dropped - every forward
      Migration_Script ships with a rollback sibling and the coverage
      rule applies to forward scripts only.
    * Non-existent directories return ``[]`` so the helper is safe to
      call in test environments where the scripts directory is absent
      (e.g., extracted package installs).

    The returned list is sorted by filename so error output is stable
    across runs.

    ``directory`` defaults to the module-level ``MIGRATION_SCRIPTS_DIR``
    via runtime lookup (not a default argument value) so the tests can
    monkeypatch the module attribute and have the change take effect.
    """
    if directory is None:
        directory = MIGRATION_SCRIPTS_DIR
    if not directory.exists() or not directory.is_dir():
        return []

    scripts: list[Path] = []
    for entry in directory.iterdir():
        if not entry.is_file():
            continue
        if entry.suffix != ".sql":
            continue
        if entry.name.endswith("_rollback.sql"):
            continue
        scripts.append(entry)
    scripts.sort(key=lambda p: p.name)
    return scripts


def _git_commit_timestamp(path: Path) -> Optional[datetime]:
    """Return the most recent git commit timestamp for ``path``.

    Runs ``git log -1 --format=%cI -- <path>`` from ``path``'s parent
    directory so the lookup works regardless of the current process
    working directory. ``%cI`` produces a strict ISO-8601 timestamp
    (e.g., ``2026-05-22T12:39:21+02:00``) which Python's
    ``datetime.fromisoformat`` accepts directly on 3.11+.

    Returns ``None`` on any failure - the binary is missing, the file
    is outside any git tree, the repository is a shallow clone with
    insufficient history, or the timestamp string fails to parse. The
    caller treats ``None`` as the signal to fall back to filesystem
    mtime per Requirement 5.3.
    """
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", path.name],
            cwd=str(path.parent),
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None

    if result.returncode != 0:
        return None

    raw = (result.stdout or "").strip()
    if not raw:
        # File is tracked-but-uncommitted, or untracked entirely. Either
        # way ``git`` returned 0 with empty output - fall back to mtime.
        return None

    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _filesystem_mtime(path: Path) -> datetime:
    """Return the filesystem modification timestamp of ``path``.

    Used as the fallback signal when ``git log`` is unavailable or the
    file has no commit history (e.g., an untracked file added during a
    CI run). Returns a tz-aware UTC datetime so callers can compare it
    against ``datetime.now(timezone.utc)`` without surprises.
    """
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)


def _migration_history_table_exists() -> bool:
    """Return True when the configured DB has a ``migration_history`` table.

    The drift-guard runs against ephemeral SQLite test databases as well
    as Postgres production. On a fresh SQLite test DB, the table does
    not exist and the coverage check should skip cleanly rather than
    raise. On Postgres, the table is created by the
    ``2026_05_22_migration_history_extend.sql`` bootstrap step.
    """
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM information_schema.tables
                WHERE table_name = 'migration_history'
                  AND table_schema = current_schema()
                LIMIT 1
                """
            )
            return cursor.fetchone() is not None
    if connection.vendor == "sqlite":
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM sqlite_master "
                "WHERE type = 'table' AND name = 'migration_history' "
                "LIMIT 1"
            )
            return cursor.fetchone() is not None
    # Other backends: reuse Django introspection as a best-effort.
    return "migration_history" in connection.introspection.table_names()


def _recorded_migration_names() -> set[str]:
    """Return the set of ``migration_history.migration_name`` values.

    Returns an empty set when the table does not exist - the caller
    short-circuits the coverage sweep in that case so a missing
    bootstrap (e.g., on a SQLite test DB) does not produce a flood of
    false positives. Uses the configured connection so Postgres or
    SQLite both work.
    """
    if not _migration_history_table_exists():
        return set()
    with connection.cursor() as cursor:
        cursor.execute("SELECT migration_name FROM migration_history")
        return {row[0] for row in cursor.fetchall()}


def _find_stale_unrecorded_migrations(
    commit_window_days: int,
    *,
    directory: Optional[Path] = None,
    now: Optional[datetime] = None,
) -> list[tuple[str, str, str]]:
    """Return ``(filename, iso_timestamp, source)`` for stale unrecorded scripts.

    A Migration_Script is considered stale unrecorded when:

    1. Its filename basename is absent from ``migration_history``, AND
    2. Its most recent commit timestamp (preferred) or filesystem mtime
       (fallback) is strictly older than ``commit_window_days`` before
       ``now``.

    Files committed exactly at the window boundary are tolerated per
    R8.4 ("strictly older than 7 days" - boundary cases are in-flight).

    The ``source`` element of each tuple is either ``"git"`` (commit
    timestamp available) or ``"mtime"`` (git lookup failed and the
    fallback was used). The caller selects the canonical line shape
    (``STALE_UNRECORDED_MIGRATION:`` vs ``UNTRACKED_MIGRATION_SCRIPT:``)
    based on ``source``.

    The list is sorted by filename so output is reproducible.
    """
    scripts = _enumerate_migration_scripts(directory)
    if not scripts:
        return []

    recorded = _recorded_migration_names()
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=commit_window_days)

    gaps: list[tuple[str, str, str]] = []
    for path in scripts:
        if path.name in recorded:
            continue

        commit_ts = _git_commit_timestamp(path)
        if commit_ts is not None:
            source = "git"
            timestamp = commit_ts
        else:
            source = "mtime"
            timestamp = _filesystem_mtime(path)

        # ``timedelta`` arithmetic only works between aware-or-naive
        # pairs. ``commit_ts`` is timezone-aware (``%cI`` includes
        # offset); ``_filesystem_mtime`` returns a tz-aware UTC value.
        # ``cutoff`` is tz-aware UTC. Strict less-than enforces the
        # "strictly older than" window per R8.4.
        if timestamp < cutoff:
            iso = timestamp.isoformat()
            gaps.append((path.name, iso, source))

    gaps.sort(key=lambda triple: triple[0])
    return gaps


class Command(BaseCommand):
    help = (
        "Verify that every managed=False model's declared fields map to "
        "existing columns in the database. Non-zero exit on drift."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--strict",
            action="store_true",
            help="Also fail when a managed=False model refers to a missing table "
                 "(default: warn and continue; table may legitimately be absent "
                 "in some bootstrapping contexts).",
        )
        parser.add_argument(
            "--check-fk-indexes",
            action="store_true",
            default=False,
            help=(
                "Also assert every foreign-key column on the configured "
                "database has a btree index whose first column matches the "
                "FK column. Postgres-only — skipped with a clear message on "
                "other backends. Emits MISSING_FK_INDEX: <table>.<column> -> "
                "<ref_table>.<ref_column> per gap and contributes to the "
                "non-zero exit. Implements R5.1 / R5.4."
            ),
        )
        parser.add_argument(
            "--check-migration-history-coverage",
            action="store_true",
            default=False,
            help=(
                "Also assert every top-level backend/scripts/*.sql "
                "Migration_Script committed strictly more than "
                "--commit-window-days ago has a row in migration_history. "
                "Emits STALE_UNRECORDED_MIGRATION: <filename> "
                "committed=<iso8601> per gap (or "
                "UNTRACKED_MIGRATION_SCRIPT: <filename> source=mtime when "
                "git is unavailable) and contributes to the non-zero exit. "
                "Implements R5.2 / R5.3."
            ),
        )
        parser.add_argument(
            "--commit-window-days",
            type=int,
            default=7,
            help=(
                "Tolerance window (in days) for the migration-history "
                "coverage check. Files committed within the window are "
                "treated as in-flight and not reported. Defaults to 7. "
                "Boundary case: files committed exactly at the window "
                "edge are tolerated (strict less-than)."
            ),
        )

    def handle(self, *args, **options):
        strict = options["strict"]
        check_fk_indexes = options["check_fk_indexes"]
        check_migration_history = options["check_migration_history_coverage"]
        commit_window_days = options["commit_window_days"]

        models = list(_iter_unmanaged_models())
        if not models:
            self.stdout.write(self.style.WARNING(
                "No managed=False models found — nothing to check."
            ))
            # Still run the FK-index and migration-history checks if
            # requested - neither depends on managed=False models.
            fk_failed, fk_count = False, "disabled"
            if check_fk_indexes:
                fk_failed, fk_count = self._run_fk_index_check()
            mh_failed, mh_count = False, "disabled"
            if check_migration_history:
                mh_failed, mh_count = (
                    self._run_migration_history_coverage_check(commit_window_days)
                )
            if fk_failed or mh_failed:
                sys.exit(1)
            # Emit the structured OK line when at least one new flag was
            # passed so CI log parsers always see the same shape; fall
            # back to silence when neither flag is set (preserving the
            # historical no-models behaviour where the only output was
            # the warning above).
            if check_fk_indexes or check_migration_history:
                self.stdout.write(self.style.SUCCESS(
                    f"OK: schema-drift=0 fk-indexes={fk_count} "
                    f"migration-history={mh_count}"
                ))
            return

        missing_tables: list[str] = []
        missing_columns: dict[str, list[str]] = defaultdict(list)
        checked = 0

        for model in models:
            table = model._meta.db_table
            if not _table_exists(table):
                missing_tables.append(f"{model.__module__}.{model.__name__} -> {table}")
                continue

            declared = _declared_columns(model)
            existing = _existing_columns(table)
            gaps = [c for c in declared if c not in existing]
            checked += 1
            if gaps:
                for col in gaps:
                    missing_columns[table].append(
                        f"{model.__module__}.{model.__name__}.{col}"
                    )

        if missing_tables and strict:
            self.stdout.write(self.style.ERROR(
                f"Missing tables ({len(missing_tables)}):"
            ))
            for item in missing_tables:
                self.stdout.write(f"  - {item}")
        elif missing_tables:
            self.stdout.write(self.style.WARNING(
                f"Missing tables ({len(missing_tables)}) — skipping these (run with --strict to fail):"
            ))
            for item in missing_tables:
                self.stdout.write(f"  - {item}")

        # Run the optional checks before deciding final exit so the
        # operator sees every category of gap in a single run rather
        # than having to fix and re-run iteratively.
        fk_failed, fk_count = False, "disabled"
        if check_fk_indexes:
            fk_failed, fk_count = self._run_fk_index_check()

        migration_history_failed, mh_count = False, "disabled"
        if check_migration_history:
            migration_history_failed, mh_count = (
                self._run_migration_history_coverage_check(commit_window_days)
            )

        if missing_columns:
            self.stdout.write(self.style.ERROR(
                f"Schema drift detected — {sum(len(v) for v in missing_columns.values())} "
                f"missing column(s) across {len(missing_columns)} table(s):"
            ))
            for table, items in sorted(missing_columns.items()):
                self.stdout.write(f"  table {table}:")
                for item in items:
                    self.stdout.write(f"    - {item}")
            self.stdout.write("")
            self.stdout.write(
                "Apply pending SQL migrations before starting the app:"
            )
            self.stdout.write("  python manage.py apply_sql_migrations")
            sys.exit(1)

        if missing_tables and strict:
            sys.exit(1)

        if fk_failed or migration_history_failed:
            sys.exit(1)

        # Success line shape is governed by Requirement 5.6:
        #
        # * Default invocation (neither new flag passed) preserves the
        #   historical "No schema drift. Verified <n> managed=False
        #   model(s)." message so existing CI log parsers, runbooks and
        #   the previous test suite stay green.
        # * When either ``--check-fk-indexes`` or
        #   ``--check-migration-history-coverage`` is passed, emit the
        #   structured ``OK: schema-drift=<n> fk-indexes=<m>
        #   migration-history=<k>`` line. ``<n>`` is always the count of
        #   managed=False models verified above. ``<m>``/``<k>`` are the
        #   counts of items checked by each optional helper, or the
        #   literal ``disabled`` when the corresponding flag was omitted
        #   (or when the helper short-circuited - e.g., FK-index skip on
        #   non-Postgres backends, or migration-history coverage skip
        #   when the bootstrap table is absent).
        if check_fk_indexes or check_migration_history:
            self.stdout.write(self.style.SUCCESS(
                f"OK: schema-drift={checked} fk-indexes={fk_count} "
                f"migration-history={mh_count}"
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"No schema drift. Verified {checked} managed=False model(s)."
            ))

    # -----------------------------------------------------------------
    # --check-fk-indexes implementation
    # -----------------------------------------------------------------

    def _run_fk_index_check(self) -> tuple[bool, "str | int"]:
        """Execute the FK-index check.

        Returns a 2-tuple ``(failed, count_or_disabled)``:

        * ``failed`` is True when at least one FK column lacks a
          covering btree index (contributes to the non-zero exit).
        * ``count_or_disabled`` is the number of FK columns inspected
          on the configured database, or the literal string
          ``"disabled"`` when the check could not run (currently:
          non-Postgres backends, where ``information_schema`` /
          ``pg_index`` joins are not available).

        The structured ``OK: ... fk-indexes=<m> ...`` success line in
        ``handle()`` consumes ``count_or_disabled`` directly so the
        caller does not need to know which short-circuit path the
        helper followed.

        Skips with a clear message on non-Postgres backends - keeping a
        SQLite-backed test run green when the flag is set is part of
        Task 4.1's contract.
        """
        if connection.vendor != "postgresql":
            self.stdout.write(self.style.WARNING(
                f"--check-fk-indexes skipped: this check is Postgres-only "
                f"(current backend: {connection.vendor!r})."
            ))
            return False, "disabled"

        # Total inspected = enumerated FK columns. We compute it before
        # filtering so the success-line count reflects the full
        # surface, not just the gaps. This matches operator
        # expectations: "checked 47 FK columns, all indexed" is more
        # useful than "checked 0".
        all_fks = _enumerate_foreign_keys()
        gaps = _find_missing_fk_indexes()
        if not gaps:
            return False, len(all_fks)

        self.stdout.write(self.style.ERROR(
            f"FK index drift detected — {len(gaps)} foreign-key column(s) "
            f"lack a covering btree index:"
        ))
        for table, column, ref_table, ref_column in gaps:
            # Canonical line shape per R5.4 - kept stable so CI log
            # parsers and runbooks can grep for it without escaping.
            self.stdout.write(
                f"MISSING_FK_INDEX: {table}.{column} -> {ref_table}.{ref_column}"
            )
        self.stdout.write("")
        self.stdout.write(
            "Apply backend/scripts/2026_05_22_fk_index_backfill.sql before "
            "re-running this check."
        )
        return True, len(all_fks)

    # -----------------------------------------------------------------
    # --check-migration-history-coverage implementation
    # -----------------------------------------------------------------

    def _run_migration_history_coverage_check(
        self, commit_window_days: int
    ) -> tuple[bool, "str | int"]:
        """Execute the migration-history coverage check.

        Returns a 2-tuple ``(failed, count_or_disabled)``:

        * ``failed`` is True when at least one stale unrecorded
          Migration_Script was detected (contributes to the non-zero
          exit).
        * ``count_or_disabled`` is the number of Migration_Scripts
          inspected on disk, or the literal string ``"disabled"`` when
          the check short-circuited because ``migration_history`` was
          absent on the configured database (e.g., a SQLite test DB
          without the ``2026_05_22_migration_history_extend.sql``
          bootstrap step).

        The structured ``OK: ... migration-history=<k>`` success line in
        ``handle()`` consumes ``count_or_disabled`` directly so the
        caller does not need to know which short-circuit path the
        helper followed.

        Output shape:

        * Stale + git-known commit timestamp →
          ``STALE_UNRECORDED_MIGRATION: <filename> committed=<iso8601>``
        * Stale + git unavailable →
          ``UNTRACKED_MIGRATION_SCRIPT: <filename> source=mtime``

        The two distinct prefixes let CI log parsers and runbooks
        differentiate "git knows this file is old and we forgot to
        record it" from "we cannot tell when this file was committed,
        so we are flagging it conservatively from filesystem mtime".
        Both conditions fail the check.
        """
        # Skip cleanly when the bootstrap is missing - the canonical
        # use-case is a SQLite test DB without the
        # ``2026_05_22_migration_history_extend.sql`` table. Surfacing
        # this as a warning rather than a hard failure mirrors the
        # FK-index Postgres-only skip path so flag-everywhere usage in
        # tests remains green.
        if not _migration_history_table_exists():
            self.stdout.write(self.style.WARNING(
                "--check-migration-history-coverage skipped: "
                "migration_history table not present on the configured "
                "database. Run 2026_05_22_migration_history_extend.sql "
                "first."
            ))
            return False, "disabled"

        # Total inspected = enumerated forward-only Migration_Scripts.
        # Computed up-front so the success-line count reflects the
        # full sweep, not just gaps. ``_find_stale_unrecorded_migrations``
        # also enumerates internally, but the cost is a directory
        # listing - negligible compared to the per-file ``git log``
        # invocations. Keeping the two reads separate is clearer than
        # plumbing the count back through the gap helper.
        scripts = _enumerate_migration_scripts()
        gaps = _find_stale_unrecorded_migrations(commit_window_days)
        if not gaps:
            return False, len(scripts)

        self.stdout.write(self.style.ERROR(
            f"Migration history coverage drift — {len(gaps)} "
            f"Migration_Script(s) committed > {commit_window_days} day(s) "
            f"ago are missing from migration_history:"
        ))
        for filename, iso_timestamp, source in gaps:
            if source == "git":
                # Canonical R5.3 line - stable shape for CI log
                # parsers. ``committed=`` keyword anchors the iso8601.
                self.stdout.write(
                    f"STALE_UNRECORDED_MIGRATION: {filename} "
                    f"committed={iso_timestamp}"
                )
            else:
                # Canonical R5.3 fallback line - emitted when
                # ``git log`` fails (shallow clone, missing binary,
                # untracked file). The ``source=mtime`` tag is stable
                # so the CI log parser can branch on the prefix.
                self.stdout.write(
                    f"UNTRACKED_MIGRATION_SCRIPT: {filename} "
                    f"source=mtime"
                )
        self.stdout.write("")
        self.stdout.write(
            "Record the missing scripts in migration_history (e.g., via "
            "backend/scripts/2026_05_22_migration_history_reconcile.sql or "
            "by re-running apply_sql_migrations) before re-checking."
        )
        return True, len(scripts)
