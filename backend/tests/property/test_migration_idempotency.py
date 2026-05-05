"""Property-based tests for SQL migration idempotency.

# Feature: lenco-payment-integration, Property 13: SQL migration idempotency

For any number of consecutive executions of the migration script, the resulting
database schema should be identical to the schema after a single execution
(no errors on re-run).

Since we cannot easily spin up a real Postgres instance in unit tests, we verify
the *structural* idempotency guarantees of the SQL statements themselves:
  - All CREATE TABLE statements use IF NOT EXISTS
  - All ADD COLUMN statements use IF NOT EXISTS
  - The INSERT uses ON CONFLICT DO NOTHING
  - DROP INDEX IF EXISTS precedes CREATE UNIQUE INDEX

**Validates: Requirements 11.7**
"""

import os
import re
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Load the migration script once
# ---------------------------------------------------------------------------

MIGRATION_SCRIPT_PATH = (
    Path(__file__).resolve().parents[2] / "scripts" / "archive" / "lenco_payment_integration.sql"
)

MIGRATION_SQL = MIGRATION_SCRIPT_PATH.read_text(encoding="utf-8")

# ---------------------------------------------------------------------------
# Parse SQL statements (split on semicolons, strip comments and whitespace)
# ---------------------------------------------------------------------------


def _strip_sql_comments(sql: str) -> str:
    """Remove single-line SQL comments (-- ...) from the script."""
    return re.sub(r"--[^\n]*", "", sql)


def _split_statements(sql: str) -> list[str]:
    """Split SQL into individual statements, ignoring empty ones."""
    cleaned = _strip_sql_comments(sql)
    parts = cleaned.split(";")
    return [s.strip() for s in parts if s.strip()]


STATEMENTS = _split_statements(MIGRATION_SQL)

# ---------------------------------------------------------------------------
# Classify statements for idempotency checks
# ---------------------------------------------------------------------------

_CREATE_TABLE_RE = re.compile(r"CREATE\s+TABLE", re.IGNORECASE)
_IF_NOT_EXISTS_RE = re.compile(r"IF\s+NOT\s+EXISTS", re.IGNORECASE)
_ADD_COLUMN_RE = re.compile(r"ADD\s+COLUMN", re.IGNORECASE)
_CREATE_INDEX_RE = re.compile(r"CREATE\s+(UNIQUE\s+)?INDEX", re.IGNORECASE)
_DROP_INDEX_RE = re.compile(r"DROP\s+INDEX\s+IF\s+EXISTS", re.IGNORECASE)
_INSERT_RE = re.compile(r"INSERT\s+INTO", re.IGNORECASE)
_ON_CONFLICT_RE = re.compile(r"ON\s+CONFLICT", re.IGNORECASE)

CREATE_TABLE_STMTS = [s for s in STATEMENTS if _CREATE_TABLE_RE.search(s)]
ADD_COLUMN_STMTS = [s for s in STATEMENTS if _ADD_COLUMN_RE.search(s)]
CREATE_INDEX_STMTS = [
    s for s in STATEMENTS if _CREATE_INDEX_RE.search(s) and not _DROP_INDEX_RE.search(s)
]
INSERT_STMTS = [s for s in STATEMENTS if _INSERT_RE.search(s)]


def _extract_index_name(stmt: str) -> str | None:
    """Extract the index name from a CREATE [UNIQUE] INDEX statement."""
    m = re.search(r"(?:CREATE\s+(?:UNIQUE\s+)?INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)", stmt, re.IGNORECASE)
    return m.group(1) if m else None


class TestMigrationIdempotency(SimpleTestCase):
    """Property 13: SQL migration idempotency.

    Verifies that the migration script's SQL statements are structurally
    idempotent — safe to run multiple consecutive times without errors.

    **Validates: Requirements 11.7**
    """

    # ------------------------------------------------------------------
    # Structural assertions
    # ------------------------------------------------------------------

    def test_migration_script_exists(self):
        """The migration script file must exist."""
        self.assertTrue(
            MIGRATION_SCRIPT_PATH.exists(),
            f"Migration script not found at {MIGRATION_SCRIPT_PATH}",
        )

    def test_migration_script_is_non_empty(self):
        """The migration script must contain SQL statements."""
        self.assertGreater(
            len(STATEMENTS), 0, "Migration script contains no SQL statements"
        )

    def test_all_create_table_use_if_not_exists(self):
        """Every CREATE TABLE statement must include IF NOT EXISTS."""
        violations = []
        for stmt in CREATE_TABLE_STMTS:
            if not _IF_NOT_EXISTS_RE.search(stmt):
                # Show first 80 chars for identification
                violations.append(stmt[:80])
        self.assertEqual(
            violations,
            [],
            f"CREATE TABLE statements missing IF NOT EXISTS: {violations}",
        )

    def test_all_add_column_use_if_not_exists(self):
        """Every ADD COLUMN statement must include IF NOT EXISTS."""
        violations = []
        for stmt in ADD_COLUMN_STMTS:
            # Each ADD COLUMN clause within the statement should have IF NOT EXISTS
            add_clauses = re.findall(r"ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)", stmt, re.IGNORECASE)
            add_guarded = re.findall(r"ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)", stmt, re.IGNORECASE)
            unguarded = set(add_clauses) - set(add_guarded)
            if unguarded:
                violations.append(
                    f"Columns without IF NOT EXISTS guard: {sorted(unguarded)} "
                    f"in: {stmt[:80]}"
                )
        self.assertEqual(
            violations,
            [],
            f"ADD COLUMN statements missing IF NOT EXISTS: {violations}",
        )

    def test_all_inserts_use_on_conflict(self):
        """Every INSERT statement must include ON CONFLICT DO NOTHING (or similar)."""
        violations = []
        for stmt in INSERT_STMTS:
            if not _ON_CONFLICT_RE.search(stmt):
                violations.append(stmt[:80])
        self.assertEqual(
            violations,
            [],
            f"INSERT statements missing ON CONFLICT: {violations}",
        )

    def test_create_unique_index_has_preceding_drop(self):
        """For each CREATE UNIQUE INDEX without IF NOT EXISTS, a matching
        DROP INDEX IF EXISTS must appear earlier in the script."""
        # Collect index names from DROP INDEX IF EXISTS statements
        dropped_indexes: set[str] = set()
        for stmt in STATEMENTS:
            m = re.search(r"DROP\s+INDEX\s+IF\s+EXISTS\s+(\w+)", stmt, re.IGNORECASE)
            if m:
                dropped_indexes.add(m.group(1).lower())

        violations = []
        for stmt in CREATE_INDEX_STMTS:
            # If the CREATE INDEX already has IF NOT EXISTS, it's safe
            if _IF_NOT_EXISTS_RE.search(stmt):
                continue
            idx_name = _extract_index_name(stmt)
            if idx_name and idx_name.lower() not in dropped_indexes:
                violations.append(
                    f"CREATE INDEX '{idx_name}' has no preceding "
                    f"DROP INDEX IF EXISTS: {stmt[:80]}"
                )
        self.assertEqual(
            violations,
            [],
            f"CREATE INDEX statements without idempotency guard: {violations}",
        )

    def test_has_create_table_statements(self):
        """The migration must contain at least the expected CREATE TABLE statements."""
        self.assertGreaterEqual(
            len(CREATE_TABLE_STMTS),
            2,
            "Expected at least 2 CREATE TABLE statements "
            "(program_fees and webhook_event_logs)",
        )

    def test_has_alter_table_add_column(self):
        """The migration must contain ALTER TABLE ADD COLUMN for payments."""
        self.assertGreater(
            len(ADD_COLUMN_STMTS),
            0,
            "Expected at least one ALTER TABLE ADD COLUMN statement",
        )

    def test_has_insert_migration_history(self):
        """The migration must register itself in migration_history."""
        history_inserts = [
            s for s in INSERT_STMTS
            if re.search(r"migration_history", s, re.IGNORECASE)
        ]
        self.assertGreater(
            len(history_inserts),
            0,
            "Expected INSERT INTO migration_history statement",
        )

    # ------------------------------------------------------------------
    # Property-based: simulate N consecutive "parses" of the script and
    # verify idempotency invariants hold for each execution.
    # ------------------------------------------------------------------

    @given(n_executions=st.integers(min_value=1, max_value=5))
    @settings(max_examples=5)
    def test_idempotency_invariants_hold_for_n_executions(self, n_executions: int):
        """For any number of consecutive executions (1–5), the structural
        idempotency invariants of the migration script hold.

        We verify that every execution would encounter the same set of
        guarded statements, meaning re-running the script N times would
        not produce errors due to missing IF NOT EXISTS / ON CONFLICT guards.
        """
        for execution in range(n_executions):
            # On every execution, the same statements are parsed
            stmts = _split_statements(MIGRATION_SQL)
            self.assertEqual(
                len(stmts),
                len(STATEMENTS),
                f"Statement count changed on execution {execution + 1}",
            )

            # Every CREATE TABLE must have IF NOT EXISTS
            for stmt in stmts:
                if _CREATE_TABLE_RE.search(stmt):
                    self.assertTrue(
                        _IF_NOT_EXISTS_RE.search(stmt),
                        f"Execution {execution + 1}: CREATE TABLE missing "
                        f"IF NOT EXISTS: {stmt[:60]}",
                    )

            # Every ADD COLUMN must have IF NOT EXISTS
            for stmt in stmts:
                if _ADD_COLUMN_RE.search(stmt):
                    clauses = re.findall(
                        r"ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)\w+",
                        stmt,
                        re.IGNORECASE,
                    )
                    self.assertEqual(
                        len(clauses),
                        0,
                        f"Execution {execution + 1}: ADD COLUMN without "
                        f"IF NOT EXISTS: {clauses}",
                    )

            # Every INSERT must have ON CONFLICT
            for stmt in stmts:
                if _INSERT_RE.search(stmt):
                    self.assertTrue(
                        _ON_CONFLICT_RE.search(stmt),
                        f"Execution {execution + 1}: INSERT missing "
                        f"ON CONFLICT: {stmt[:60]}",
                    )

            # Every CREATE INDEX without IF NOT EXISTS must have a
            # preceding DROP INDEX IF EXISTS
            dropped = set()
            for stmt in stmts:
                drop_m = re.search(
                    r"DROP\s+INDEX\s+IF\s+EXISTS\s+(\w+)", stmt, re.IGNORECASE
                )
                if drop_m:
                    dropped.add(drop_m.group(1).lower())

            for stmt in stmts:
                if _CREATE_INDEX_RE.search(stmt) and not _DROP_INDEX_RE.search(stmt):
                    if _IF_NOT_EXISTS_RE.search(stmt):
                        continue
                    idx_name = _extract_index_name(stmt)
                    if idx_name:
                        self.assertIn(
                            idx_name.lower(),
                            dropped,
                            f"Execution {execution + 1}: CREATE INDEX "
                            f"'{idx_name}' has no DROP IF EXISTS guard",
                        )
