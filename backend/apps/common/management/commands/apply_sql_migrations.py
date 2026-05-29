"""apply_sql_migrations - idempotent auto-runner for hand-written SQL migrations.

Runs every ``.sql`` file at the top level of ``backend/scripts/`` in
filename order, tracking applied migrations in ``migration_history``
(the single source of truth for what is on production) so each file
runs exactly once per database. Each file is expected to be idempotent
as a second layer of safety - so re-running the command after a
tracking-table wipe still converges.

This command is intended to be invoked at container startup, BEFORE
``uvicorn`` so that schema changes are guaranteed in place before
Django serves any request against a ``managed = False`` model.

Design notes
------------
* Tracking table: ``migration_history`` - the canonical source of truth
  for what schema is on production. The Component 1 migration script
  ``2026_05_22_migration_history_extend.sql`` adds the ``checksum`` and
  ``notes`` columns plus the unique index on ``migration_name`` that this
  command relies on for ``ON CONFLICT (migration_name) DO NOTHING``. If
  the ``checksum`` column is missing, the command refuses to run and
  prints ``MIGRATION_HISTORY_NOT_EXTENDED: run
  2026_05_22_migration_history_extend.sql first`` so the operator knows
  to apply the prerequisite first.
* Ordering: lexicographic by filename. Dated files
  (``YYYY_MM_DD_description.sql``) sort chronologically by construction;
  zero-padded prefix files (``NNNN_description.sql``) sort in declared
  order.
* Excluded subdirectories: ``applied/``, ``archive/``, and ``migrations/``
  under ``backend/scripts/`` are not recursed into. They hold,
  respectively, out-of-band scripts already physically applied to
  production, historical scripts kept for audit only, and the legacy
  directory whose contents have been moved up one level.
* Rollback siblings (``*_rollback.sql``) live next to the forward
  scripts. They are not filtered out here - that lint lands in a later
  task in the same spec - but the additive-only contract means any
  rollback file accidentally placed here would be caught by a future
  pre-execution lint.
* Atomicity: each migration runs inside its own transaction. If one
  file fails, earlier successes are kept; the command exits non-zero
  so the container crashloops visibly.
* ``CREATE INDEX CONCURRENTLY`` split-phase handling: files whose body
  references ``CREATE INDEX CONCURRENTLY`` (case-insensitive, after
  stripping ``--`` line comments) cannot run inside a transaction.
  Such files are executed in autocommit mode (Phase 1), validated
  against ``pg_index.indisvalid`` for any indexes they declared
  (any ``indisvalid = false`` index is dropped via
  ``DROP INDEX CONCURRENTLY IF EXISTS`` and the run is failed), and
  then the ``migration_history`` row is written in a follow-up
  transaction (Phase 2). On any error during Phase 1 the
  ``migration_history`` row is NOT written and the command exits
  non-zero - the operator's retry is safe because every
  ``CREATE INDEX CONCURRENTLY`` in production scripts uses
  ``IF NOT EXISTS``.
* No-op when the directory is missing or empty - useful during tests.

Usage:
    python manage.py apply_sql_migrations
    python manage.py apply_sql_migrations --dry-run
    python manage.py apply_sql_migrations --migrations-dir /path/to/dir

Spec: ``.kiro/specs/production-schema-reconciliation/`` (Component 2).
"""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path
from typing import Iterable

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

logger = logging.getLogger(__name__)


# Default migrations directory. ``parents[4]`` resolves to the ``backend/``
# package root from this file (``backend/apps/common/management/commands/
# apply_sql_migrations.py``); appending ``scripts`` lands on the canonical
# location ``backend/scripts/``. The legacy ``backend/scripts/migrations/``
# directory is intentionally excluded - see ``EXCLUDED_SUBDIRS`` below.
DEFAULT_MIGRATIONS_DIR = Path(__file__).resolve().parents[4] / "scripts"

# Subdirectories under the migrations directory whose contents are
# deliberately excluded from the lexical migration sweep. The current
# implementation iterates only the top level (no recursion), so listing
# these here is documentation rather than runtime filtering - but the
# names are exposed so future recursive variants can consume them.
EXCLUDED_SUBDIRS: frozenset[str] = frozenset({"applied", "archive", "migrations"})


# Top-level filenames that must NEVER be auto-applied even when present
# alongside the forward Migration_Scripts. Documented in design.md
# Component 3 of ``.kiro/specs/production-schema-reconciliation/``.
#
# * ``00_full_schema.sql`` is a generated full-schema documentation
#   snapshot (regenerated via ``generate_full_schema.py``) - never an
#   apply target.
# * ``legacy_columns_drop_2026_08_15.sql`` is a future, deliberately
#   deferred non-additive cleanup; it must not be picked up by the
#   container-startup sweep.
#
# Sibling ``*_rollback.sql`` files are excluded by the suffix filter in
# ``_iter_migration_files`` rather than this set, so a future operator
# adding a new rollback does not have to remember to update this list.
EXCLUDED_TOP_LEVEL_FILES: frozenset[str] = frozenset(
    {
        "00_full_schema.sql",
        "legacy_columns_drop_2026_08_15.sql",
    }
)


# Detects ``CREATE INDEX CONCURRENTLY`` (any whitespace, any case).
# ``\b`` boundaries prevent matching inside identifiers like
# ``CREATE_INDEX_CONCURRENTLY_NOTES``.
_CONCURRENTLY_RE = re.compile(
    r"\bCREATE\s+INDEX\s+CONCURRENTLY\b", re.IGNORECASE
)

# Captures the index name from ``CREATE INDEX CONCURRENTLY [IF NOT EXISTS] <name>``.
# Used to look up created indexes in ``pg_index`` for the
# ``indisvalid = false`` cleanup between phases.
_INDEX_NAME_RE = re.compile(
    r"\bCREATE\s+INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?"
    r"(?:\"([^\"]+)\"|([A-Za-z_][A-Za-z0-9_]*))",
    re.IGNORECASE,
)


# Non-additive operation patterns (Task 1.5 / Requirement 1.2).
#
# These regexes detect SQL constructs that mutate or remove existing
# data or schema. The contract from the spec is that production
# migrations may only apply additive operations (``ADD COLUMN``,
# ``CREATE INDEX CONCURRENTLY``, ``CREATE TABLE IF NOT EXISTS``,
# ``INSERT ... ON CONFLICT``, ``CREATE OR REPLACE FUNCTION``,
# ``CREATE SEQUENCE IF NOT EXISTS``, and widening
# ``ALTER COLUMN ... TYPE`` conversions). Anything matching the
# patterns below is rejected unless the operator opts in with
# ``--allow-non-additive``.
_DROP_COLUMN_RE = re.compile(r"\bDROP\s+COLUMN\b", re.IGNORECASE)
_DROP_TABLE_RE = re.compile(r"\bDROP\s+TABLE\b", re.IGNORECASE)
_TRUNCATE_RE = re.compile(r"\bTRUNCATE\b", re.IGNORECASE)
_DELETE_FROM_RE = re.compile(r"\bDELETE\s+FROM\b", re.IGNORECASE)
_WHERE_RE = re.compile(r"\bWHERE\b", re.IGNORECASE)
# ``ALTER TABLE ... ALTER COLUMN ... TYPE ... USING`` - the ``USING``
# clause is what distinguishes a narrowing conversion (e.g. text →
# integer with an explicit cast expression) from a widening
# conversion (e.g. int → bigint, which Postgres accepts without
# ``USING`` and which the spec explicitly permits).
_ALTER_NARROWING_RE = re.compile(
    r"\bALTER\s+TABLE\b.*?\bALTER\s+COLUMN\b.*?\bTYPE\b.*?\bUSING\b",
    re.IGNORECASE | re.DOTALL,
)


# Block comment matcher. Naive single-pass; does not handle nested
# ``/* /* */ */`` (Postgres allows nested block comments but they are
# vanishingly rare in migration files). Adding nested-comment handling
# would only weaken the lint - the current behaviour at worst leaves
# some commented SQL visible to the lint, which would emit a false
# positive that the operator can resolve by re-formatting the comment.
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)


def _checksum(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _iter_migration_files(directory: Path) -> Iterable[Path]:
    """Yield top-level ``*.sql`` files in lexical order.

    Subdirectories are deliberately not recursed into - files under
    ``applied/``, ``archive/``, and ``migrations/`` (and any other
    subdirectory) are excluded by virtue of this non-recursive scan.

    Top-level filenames in ``EXCLUDED_TOP_LEVEL_FILES`` are also
    skipped - that set covers the rollback-sibling convention
    (``*_rollback.sql``) per Requirement 9.5 plus two specifically
    named files documented in design.md Component 3 of
    ``.kiro/specs/production-schema-reconciliation/``:

    * ``00_full_schema.sql`` - generated documentation snapshot of the
      live schema, never applied as a migration.
    * ``legacy_columns_drop_2026_08_15.sql`` - a future, deliberately
      deferred non-additive cleanup script.
    """
    if not directory.exists():
        return []
    return sorted(
        p for p in directory.iterdir()
        if p.is_file()
        and p.suffix == ".sql"
        and not p.name.endswith("_rollback.sql")
        and p.name not in EXCLUDED_TOP_LEVEL_FILES
    )


def _strip_sql_line_comments(sql: str) -> str:
    """Strip ``--`` line comments from SQL.

    Naive but sufficient for migration-file detection: removes
    everything from ``--`` to end of line. We do not attempt to honour
    ``--`` inside string literals because ``CREATE INDEX CONCURRENTLY``
    would not legitimately appear inside a quoted string in any
    migration file we apply.
    """
    return "\n".join(line.split("--", 1)[0] for line in sql.splitlines())


def _strip_sql_comments(sql: str) -> str:
    """Strip both ``--`` line comments and ``/* ... */`` block comments.

    Used by the additive-only lint (Task 1.5) so a documentation
    comment like ``-- DROP COLUMN ...`` or ``/* TRUNCATE for cleanup */``
    does not trigger a false-positive rejection. Block comments are
    removed first so ``--`` markers inside them are not mistaken for
    line comments.
    """
    without_block = _BLOCK_COMMENT_RE.sub("", sql)
    return _strip_sql_line_comments(without_block)


def _find_non_additive_violations(sql: str) -> list[str]:
    """Return the human-readable patterns that violate the additive-only contract.

    Returns the list of violations (empty list when the file is clean)
    so callers can report each one. The patterns mirror the spec
    language (Task 1.5 / Requirement 1.2):

    * ``DROP COLUMN``
    * ``DROP TABLE``
    * ``TRUNCATE``
    * ``DELETE FROM`` without a ``WHERE`` clause in the same statement
    * ``ALTER TABLE ... ALTER COLUMN ... TYPE ... USING`` (narrowing conversions)

    The ``DELETE FROM`` rule treats each ``;``-terminated statement as
    a separate scope: a ``DELETE FROM x`` statement with no ``WHERE``
    in the same scope is rejected even if a later statement uses
    ``WHERE``. This matches the operator-intuitive reading of "did
    this file unconditionally delete rows somewhere".
    """
    cleaned = _strip_sql_comments(sql)
    violations: list[str] = []

    if _DROP_COLUMN_RE.search(cleaned):
        violations.append("DROP COLUMN")
    if _DROP_TABLE_RE.search(cleaned):
        violations.append("DROP TABLE")
    if _TRUNCATE_RE.search(cleaned):
        violations.append("TRUNCATE")
    if _ALTER_NARROWING_RE.search(cleaned):
        violations.append("ALTER COLUMN TYPE USING")

    # ``DELETE FROM`` without ``WHERE`` in the same statement scope.
    # Split the cleaned body on ``;`` so each ``DELETE`` is evaluated
    # against the WHERE clause that belongs to it, not against any
    # WHERE clause that might appear elsewhere in the file.
    for statement in cleaned.split(";"):
        if _DELETE_FROM_RE.search(statement) and not _WHERE_RE.search(statement):
            violations.append("DELETE FROM (without WHERE)")
            break

    return violations


def _has_concurrently(sql: str) -> bool:
    """Return True when ``sql`` contains an executable
    ``CREATE INDEX CONCURRENTLY`` statement.

    The detection is case-insensitive and ignores ``--`` line comments
    so a documentation comment like
    ``-- CREATE INDEX CONCURRENTLY foo ...`` does not trigger
    split-phase handling.
    """
    return bool(_CONCURRENTLY_RE.search(_strip_sql_line_comments(sql)))


def _extract_concurrently_index_names(sql: str) -> list[str]:
    """Return the index names declared by ``CREATE INDEX CONCURRENTLY``
    statements in ``sql`` (after stripping ``--`` comments).

    Quoted (``"name"``) and unquoted identifiers are both supported.
    Used for the between-phase ``pg_index.indisvalid = false`` cleanup.
    """
    stripped = _strip_sql_line_comments(sql)
    return [quoted or unquoted for quoted, unquoted in _INDEX_NAME_RE.findall(stripped)]


def _drop_invalid_indexes(index_names: list[str]) -> list[str]:
    """Drop indexes from ``index_names`` whose ``pg_index.indisvalid`` is false.

    Returns the list of names that were dropped. A no-op on
    non-Postgres backends and when ``index_names`` is empty. Each drop
    is issued as ``DROP INDEX CONCURRENTLY IF EXISTS`` so a partially
    completed run can be retried safely.
    """
    if not index_names or connection.vendor != "postgresql":
        return []
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT c.relname FROM pg_index i "
            "JOIN pg_class c ON c.oid = i.indexrelid "
            "WHERE i.indisvalid = false AND c.relname = ANY(%s)",
            [index_names],
        )
        invalid = [row[0] for row in cursor.fetchall()]
    for name in invalid:
        # Quote the identifier defensively. ``CREATE INDEX CONCURRENTLY``
        # itself cannot run inside a transaction, neither can the drop.
        # We're already in autocommit mode at this point.
        with connection.cursor() as cursor:
            cursor.execute(f'DROP INDEX CONCURRENTLY IF EXISTS "{name}"')
    return invalid


def _has_extended_migration_history() -> bool:
    """Return True when ``migration_history.checksum`` exists.

    On Postgres (production), queries ``information_schema.columns``. On
    SQLite (used only by the local test suite), falls back to
    ``PRAGMA table_info``. Returns False when either the column or the
    table itself is missing - the caller treats both as equivalent
    "extend migration not applied yet" signals.
    """
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            cursor.execute("PRAGMA table_info(migration_history)")
            cols = {row[1] for row in cursor.fetchall()}
            return "checksum" in cols
        cursor.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = %s AND column_name = %s LIMIT 1",
            ["migration_history", "checksum"],
        )
        return cursor.fetchone() is not None


def _applied_filenames() -> set[str]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT migration_name FROM migration_history")
        return {row[0] for row in cursor.fetchall()}


def _record_applied(filename: str, checksum: str) -> None:
    """Insert the tracking row for ``filename``.

    Uses ``ON CONFLICT (migration_name) DO NOTHING`` so concurrent or
    re-run invocations cannot produce duplicate rows. The unique index
    ``uq_migration_history_migration_name`` (added by
    ``2026_05_22_migration_history_extend.sql``) is the conflict target.
    """
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            # SQLite has no ``now()`` builtin; use ``CURRENT_TIMESTAMP``
            # which yields the same UTC instant semantics for tests.
            cursor.execute(
                "INSERT INTO migration_history "
                "(migration_name, checksum, applied_at, notes) "
                "VALUES (%s, %s, CURRENT_TIMESTAMP, NULL) "
                "ON CONFLICT(migration_name) DO NOTHING",
                [filename, checksum],
            )
        else:
            cursor.execute(
                "INSERT INTO migration_history "
                "(migration_name, checksum, applied_at, notes) "
                "VALUES (%s, %s, now(), NULL) "
                "ON CONFLICT (migration_name) DO NOTHING",
                [filename, checksum],
            )


class Command(BaseCommand):
    help = (
        "Apply pending hand-written SQL migrations from backend/scripts/ in "
        "filename order. Idempotent — tracked in migration_history."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--migrations-dir",
            type=str,
            default=None,
            help="Override migrations directory (defaults to backend/scripts/).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List pending migrations without applying them.",
        )
        parser.add_argument(
            "--allow-non-additive",
            action="store_true",
            default=False,
            help=(
                "Bypass the additive-only SQL lint. Without this flag, "
                "files containing DROP COLUMN, DROP TABLE, TRUNCATE, "
                "unbounded DELETE FROM, or narrowing ALTER COLUMN TYPE "
                "are rejected pre-execution."
            ),
        )

    def handle(self, *args, **options):
        migrations_dir = (
            Path(options["migrations_dir"])
            if options["migrations_dir"]
            else DEFAULT_MIGRATIONS_DIR
        )
        dry_run = options["dry_run"]
        allow_non_additive = options["allow_non_additive"]

        # Refuse to run unless the prerequisite extend migration is in place.
        # This is the signal that ``2026_05_22_migration_history_extend.sql``
        # has not been applied yet on the configured database - without it,
        # the ON CONFLICT (migration_name) DO NOTHING insert below would fail
        # because the supporting unique index does not exist.
        if not _has_extended_migration_history():
            raise CommandError(
                "MIGRATION_HISTORY_NOT_EXTENDED: run "
                "2026_05_22_migration_history_extend.sql first"
            )

        files = list(_iter_migration_files(migrations_dir))
        if not files:
            self.stdout.write(
                self.style.WARNING(
                    f"No migrations found at {migrations_dir}. Nothing to do."
                )
            )
            return

        applied = _applied_filenames()
        pending = [f for f in files if f.name not in applied]

        if not pending:
            self.stdout.write(
                self.style.SUCCESS(
                    f"All {len(files)} migrations already applied. Nothing to do."
                )
            )
            return

        self.stdout.write(
            self.style.NOTICE(f"Pending migrations: {len(pending)}/{len(files)}")
        )

        for path in pending:
            label = f"{path.name}"
            checksum = _checksum(path)
            sql = path.read_text()

            # Pre-execution additive-only lint (Task 1.5 / R1.2).
            # Runs before dry-run reporting too - the operator wants
            # to see rejections during a planning pass, not only when
            # they actually try to apply.
            if not allow_non_additive:
                violations = _find_non_additive_violations(sql)
                if violations:
                    # Emit one rejection line per detected pattern so
                    # the operator sees the full list rather than a
                    # single "first one wins" message.
                    for pattern in violations:
                        self.stderr.write(
                            self.style.ERROR(
                                f"REJECTED_NON_ADDITIVE_OPERATION: "
                                f"{pattern} in {path.name}"
                            )
                        )
                    raise CommandError(
                        f"Migration {label} contains non-additive operations "
                        f"({', '.join(violations)}). Pass --allow-non-additive "
                        f"to bypass this lint after manual review."
                    )

            if dry_run:
                self.stdout.write(
                    f"  [dry-run] would apply: {label} (sha256={checksum[:12]})"
                )
                continue

            self.stdout.write(
                f"  applying: {label} (sha256={checksum[:12]}) ... ", ending=""
            )
            try:
                if _has_concurrently(sql):
                    self._apply_concurrently(path, sql, checksum, label)
                else:
                    self._apply_transactional(path, sql, checksum, label)
            except CommandError:
                # ``_apply_*`` already wrote ``FAIL`` and logged; just
                # propagate the non-zero exit.
                raise
            except Exception as exc:
                self.stdout.write(self.style.ERROR("FAIL"))
                logger.exception("apply_sql_migrations failed on %s", label)
                raise CommandError(f"Migration {label} failed: {exc}")
            self.stdout.write(self.style.SUCCESS("OK"))

        self.stdout.write(
            self.style.SUCCESS(f"Applied {len(pending)} migration(s) successfully.")
        )

    def _apply_transactional(
        self, path: Path, sql: str, checksum: str, label: str
    ) -> None:
        """Execute ``sql`` and record ``migration_history`` atomically.

        The default path for files that contain only transaction-safe
        DDL/DML. On any error the wrapping transaction aborts, rolling
        back partial changes; the ``migration_history`` row is not
        written and the command exits non-zero.
        """
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(sql)
                _record_applied(path.name, checksum)
        except Exception as exc:
            self.stdout.write(self.style.ERROR("FAIL"))
            logger.exception("apply_sql_migrations failed on %s", label)
            raise CommandError(f"Migration {label} failed: {exc}")

    def _apply_concurrently(
        self, path: Path, sql: str, checksum: str, label: str
    ) -> None:
        """Split-phase apply for files containing ``CREATE INDEX CONCURRENTLY``.

        Phase 1: execute the file body in autocommit mode so the
        ``CREATE INDEX CONCURRENTLY`` statements can run (Postgres
        forbids them inside a transaction).

        Between phases: query ``pg_index`` for any index named in the
        file body whose ``indisvalid`` is false. If any are found, drop
        them via ``DROP INDEX CONCURRENTLY IF EXISTS`` and exit
        non-zero - the ``migration_history`` row is NOT written so the
        operator's re-run will retry the file.

        Phase 2: write the ``migration_history`` row in normal
        transaction mode. If the recording itself fails the index has
        already been built (and is valid), but ``migration_history``
        will not include the row - the next run re-attempts the
        recording, and the ``IF NOT EXISTS`` clauses make the index
        re-creation a no-op.
        """
        index_names = _extract_concurrently_index_names(sql)

        # Phase 1: execute in autocommit mode.
        previously_autocommit = connection.get_autocommit()
        try:
            connection.set_autocommit(True)
        except Exception as exc:
            # We cannot enter autocommit (e.g., still inside an
            # ``atomic`` block). Surface the failure clearly.
            self.stdout.write(self.style.ERROR("FAIL"))
            logger.exception(
                "apply_sql_migrations could not enter autocommit for %s", label
            )
            raise CommandError(
                f"Migration {label} requires autocommit mode for "
                f"CREATE INDEX CONCURRENTLY but the connection refused: {exc}"
            )

        phase_one_error: Exception | None = None
        try:
            with connection.cursor() as cursor:
                cursor.execute(sql)
        except Exception as exc:
            phase_one_error = exc
            logger.exception(
                "apply_sql_migrations CONCURRENTLY phase-1 failed on %s", label
            )

        # Cleanup any partially-built invalid indexes named by the file.
        # This runs whether Phase 1 succeeded or failed: even a
        # successful run may leave an ``indisvalid = false`` index when
        # a build hits a uniqueness conflict, and a failed run almost
        # always leaves debris.
        dropped: list[str] = []
        try:
            dropped = _drop_invalid_indexes(index_names)
        except Exception:
            logger.exception(
                "apply_sql_migrations failed to clean invalid indexes for %s", label
            )

        # Restore the connection's transaction mode to what we found.
        try:
            connection.set_autocommit(previously_autocommit)
        except Exception:
            logger.exception(
                "apply_sql_migrations failed to restore autocommit after %s", label
            )

        if phase_one_error is not None:
            self.stdout.write(self.style.ERROR("FAIL"))
            if dropped:
                self.stdout.write(
                    self.style.WARNING(
                        f"  cleaned up invalid indexes: {', '.join(dropped)}"
                    )
                )
            raise CommandError(
                f"Migration {label} failed during CREATE INDEX CONCURRENTLY phase: "
                f"{phase_one_error}"
            )

        if dropped:
            # Phase 1 returned without raising but produced invalid
            # indexes. Treat this as a hard failure so the run is
            # retried - Migration_History stays unchanged.
            self.stdout.write(self.style.ERROR("FAIL"))
            raise CommandError(
                f"Migration {label} produced invalid indexes "
                f"(dropped via DROP INDEX CONCURRENTLY): {', '.join(dropped)}"
            )

        # Phase 2: record the migration in a normal transaction.
        try:
            with transaction.atomic():
                _record_applied(path.name, checksum)
        except Exception as exc:
            self.stdout.write(self.style.ERROR("FAIL"))
            logger.exception(
                "apply_sql_migrations failed to record %s after CONCURRENTLY phase",
                label,
            )
            raise CommandError(
                f"Migration {label} succeeded but recording in migration_history "
                f"failed: {exc}"
            )
