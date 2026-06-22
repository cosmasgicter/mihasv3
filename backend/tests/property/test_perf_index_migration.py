"""Property + integration test — index migration idempotence & index-scan plan.

Feature: system-performance-hardening, Property 5

Spec: ``.kiro/specs/system-performance-hardening`` (task 8.2). Pins the
"Index migration is idempotent" property from the design's Testing Strategy
and Requirement 7 (Database Index Additions):

    Property 5 — Index migration is idempotent
    Running ``backend/scripts/perf_idx_applications_status_submitted_at.sql``
    any number of times converges to exactly one valid composite index
    ``idx_applications_status_submitted_at`` on ``applications(status,
    submitted_at)`` and never fails on re-run, because the statement is
    ``CREATE INDEX CONCURRENTLY IF NOT EXISTS`` executed outside a transaction
    block (R7.2, R7.4). The resulting index serves status+submitted_at query
    plans with an index/index-only scan rather than a sequential scan (R7.3).

What runs where
---------------
* **DB-independent hypothesis property (≥100 examples, runs everywhere incl.
  SQLite).** The idempotence *guard* is a structural property of the script
  text and the ``apply_sql_migrations`` split-phase classifier: any
  semantically-equivalent rendering of the statement is detected as a
  ``CREATE INDEX CONCURRENTLY`` build of exactly one index, always carries the
  ``IF NOT EXISTS`` guard, and — modelling Postgres' ``IF NOT EXISTS``
  semantics — converges to exactly one valid index for any number of runs.
  This is the part of Property 5 that does not depend on a live Postgres, so
  it is exercised at ≥100 examples on the default SQLite test database.

* **Postgres-only integration assertions (SKIPPED on SQLite).**
  ``CREATE INDEX CONCURRENTLY`` and ``EXPLAIN`` index-scan plans are
  Postgres-specific and cannot be represented on SQLite, so they are gated
  behind ``connection.vendor == "postgresql"`` (mirroring the existing
  ``test_payment_migration_indexes`` / ``test_apply_sql_migrations``
  Postgres-only style). Under CI Postgres / a Neon test branch they:
    (a) run the real script twice against the DB and assert exactly one valid
        index exists with no failure (idempotent, R7.2/R7.4); and
    (b) assert ``EXPLAIN`` shows an index/index-only scan (not a sequential
        scan) for the status+submitted_at query plan (R7.3).

Run (≥100 examples; Postgres-only assertions reported as SKIPPED on SQLite)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_perf_index_migration.py -q

To exercise the Postgres-only assertions for real, run the same file under a
Postgres settings module pointed at a Neon test branch / CI Postgres service —
NEVER against production.

**Validates: Requirements 7.2, 7.4**
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.db import connection
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.common.management.commands.apply_sql_migrations import (
    _extract_concurrently_index_names,
    _has_concurrently,
    _strip_sql_comments,
)

# The forward index script under test and the index it declares.
SCRIPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "perf_idx_applications_status_submitted_at.sql"
)
ROLLBACK_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "perf_idx_applications_status_submitted_at_rollback.sql"
)
INDEX_NAME = "idx_applications_status_submitted_at"

# ≥100 examples. No DB access in the property body (pure text + model), so the
# deadline is relaxed only to absorb hypothesis bookkeeping jitter.
HYPOTHESIS_SETTINGS = settings(max_examples=200, deadline=None)

_IF_NOT_EXISTS_RE = re.compile(r"\bIF\s+NOT\s+EXISTS\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Pure model of Postgres' ``CREATE INDEX ... IF NOT EXISTS`` semantics.
# ---------------------------------------------------------------------------


class _FakeIndexCatalog:
    """Minimal stand-in for ``pg_index`` honouring the IF-NOT-EXISTS guard.

    ``create_if_not_exists`` mirrors ``CREATE INDEX CONCURRENTLY IF NOT
    EXISTS``: the first call for a name builds a valid index, and every
    subsequent call is a no-op (returns ``False``) — never a duplicate, never
    an error. This is the exact behaviour that makes the migration safe to
    re-run (R7.2, R7.4).
    """

    def __init__(self) -> None:
        self.indexes: dict[str, bool] = {}

    def create_if_not_exists(self, name: str) -> bool:
        if name in self.indexes:
            return False  # IF NOT EXISTS → no-op on re-run
        self.indexes[name] = True  # indisvalid = true
        return True


# ---------------------------------------------------------------------------
# Hypothesis strategy: semantically-equivalent renderings of the statement.
# ---------------------------------------------------------------------------

# Whitespace runs that are interchangeable between SQL tokens.
_WS = st.sampled_from([" ", "  ", "\t", "\n", " \n  ", "\t ", "   "])


def _mixed_case(token: str, flags: list[bool]) -> str:
    """Render ``token`` with per-character upper/lower casing from ``flags``."""
    out = []
    for i, ch in enumerate(token):
        out.append(ch.upper() if (flags[i % len(flags)] if flags else True) else ch.lower())
    return "".join(out)


@st.composite
def equivalent_statements(draw):
    """Generate a CREATE INDEX CONCURRENTLY IF NOT EXISTS statement variant.

    Keyword casing and inter-token whitespace are perturbed, but the semantics
    (concurrent build of ``INDEX_NAME`` on ``applications(status,
    submitted_at)`` guarded by IF NOT EXISTS) are preserved. The identifier
    name and column list are kept verbatim (identifiers are case-sensitive
    enough that we leave them fixed).
    """
    keywords = ["CREATE", "INDEX", "CONCURRENTLY", "IF", "NOT", "EXISTS"]
    rendered_keywords = []
    for kw in keywords:
        flags = draw(st.lists(st.booleans(), min_size=1, max_size=len(kw)))
        rendered_keywords.append(_mixed_case(kw, flags))

    ws = [draw(_WS) for _ in range(8)]
    on_kw = _mixed_case("ON", draw(st.lists(st.booleans(), min_size=1, max_size=2)))

    return (
        f"{rendered_keywords[0]}{ws[0]}{rendered_keywords[1]}{ws[1]}"
        f"{rendered_keywords[2]}{ws[2]}{rendered_keywords[3]}{ws[3]}"
        f"{rendered_keywords[4]}{ws[4]}{rendered_keywords[5]}{ws[5]}"
        f"{INDEX_NAME}{ws[6]}{on_kw}{ws[7]}applications (status, submitted_at);"
    )


# ---------------------------------------------------------------------------
# Property 5 (DB-independent half): structural idempotence guard.
# ---------------------------------------------------------------------------


class TestIndexMigrationIdempotenceGuard:
    """Property 5 — the migration is structurally idempotent.

    **Validates: Requirements 7.2, 7.4**
    """

    @HYPOTHESIS_SETTINGS
    @given(statement=equivalent_statements(), runs=st.integers(min_value=1, max_value=12))
    def test_concurrent_if_not_exists_converges_to_one_valid_index(
        self, statement: str, runs: int
    ):
        """Any rendering is a single-index CONCURRENTLY build that re-runs safely.

        For a semantically-equivalent rendering of the statement:
        * ``apply_sql_migrations`` classifies it as a ``CREATE INDEX
          CONCURRENTLY`` build (so it runs in autocommit / split-phase, never
          inside a transaction — R7.2);
        * exactly one index name is extracted (no duplicate index declared);
        * the ``IF NOT EXISTS`` guard is present; and
        * modelling Postgres IF-NOT-EXISTS semantics, executing the statement
          ``runs`` times converges to exactly one valid index, with the build
          happening on the first run and every later run a no-op (R7.4).
        """
        # Runner classification: concurrent build of exactly one index.
        assert _has_concurrently(statement) is True
        assert _extract_concurrently_index_names(statement) == [INDEX_NAME]
        # Idempotence guard present.
        assert _IF_NOT_EXISTS_RE.search(statement) is not None

        # Model N executions of the guarded DDL.
        catalog = _FakeIndexCatalog()
        created_count = sum(catalog.create_if_not_exists(INDEX_NAME) for _ in range(runs))

        assert created_count == 1, "index built exactly once across all runs"
        assert list(catalog.indexes) == [INDEX_NAME], "no duplicate index"
        assert catalog.indexes[INDEX_NAME] is True, "resulting index is valid"

    @HYPOTHESIS_SETTINGS
    @given(runs=st.integers(min_value=1, max_value=20))
    def test_real_script_text_is_idempotent_for_any_run_count(self, runs: int):
        """The REAL script file re-runs to one valid index for any run count.

        Grounds the idempotence model in the actual committed script text
        rather than a synthesised rendering: the real file is a concurrent,
        IF-NOT-EXISTS-guarded build of exactly ``INDEX_NAME``, so applying it
        ``runs`` times yields exactly one valid index (R7.2, R7.4).
        """
        sql = SCRIPT_PATH.read_text()
        assert _has_concurrently(sql) is True
        assert _extract_concurrently_index_names(sql) == [INDEX_NAME]
        assert _IF_NOT_EXISTS_RE.search(sql) is not None

        catalog = _FakeIndexCatalog()
        created = sum(catalog.create_if_not_exists(INDEX_NAME) for _ in range(runs))
        assert created == 1
        assert catalog.indexes == {INDEX_NAME: True}


class TestIndexScriptStructure:
    """Concrete structural pins on the real script (complements Property 5).

    **Validates: Requirements 7.2, 7.4**
    """

    def test_script_file_exists(self):
        assert SCRIPT_PATH.is_file(), f"missing index script at {SCRIPT_PATH}"

    def test_script_declares_exactly_one_create_index(self):
        sql = SCRIPT_PATH.read_text()
        # One executable CREATE INDEX statement (comments are ignored by the
        # runner's comment-aware extractor).
        assert _extract_concurrently_index_names(sql) == [INDEX_NAME]

    def test_script_is_concurrent_and_guarded(self):
        sql = SCRIPT_PATH.read_text()
        assert _has_concurrently(sql) is True
        assert _IF_NOT_EXISTS_RE.search(sql) is not None

    def test_script_key_order_is_status_then_submitted_at(self):
        """R7.1: composite key order is ``status`` first, ``submitted_at`` second."""
        sql = SCRIPT_PATH.read_text()
        match = re.search(
            r"on\s+applications\s*\(\s*([^)]+?)\s*\)", sql, re.IGNORECASE
        )
        assert match is not None, "could not find the indexed column list"
        columns = [c.strip().lower() for c in match.group(1).split(",")]
        assert columns == ["status", "submitted_at"]

    def test_script_does_not_index_institution_ref(self):
        """R7.5: must NOT add an index on ``institution_ref_id``.

        Checks executable SQL only (comments stripped), since the script's
        documentation comment legitimately *mentions* ``institution_ref_id``
        to explain why it is deliberately not indexed.
        """
        executable = _strip_sql_comments(SCRIPT_PATH.read_text()).lower()
        assert "institution_ref_id" not in executable

    def test_rollback_sibling_drops_the_index(self):
        assert ROLLBACK_PATH.is_file(), f"missing rollback at {ROLLBACK_PATH}"
        rollback = ROLLBACK_PATH.read_text()
        assert re.search(
            r"\bDROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\b", rollback, re.IGNORECASE
        ), "rollback must DROP INDEX CONCURRENTLY IF EXISTS"
        assert INDEX_NAME in rollback


# ---------------------------------------------------------------------------
# Property 5 (Postgres-only half): real apply + EXPLAIN index-scan plan.
# ---------------------------------------------------------------------------


def _require_postgres() -> None:
    """Skip when the live backend is not Postgres.

    ``CREATE INDEX CONCURRENTLY`` and ``EXPLAIN`` index-scan plans are
    Postgres-specific; SQLite cannot represent them. The default test settings
    use SQLite, so these assertions are reported as SKIPPED there and RUN for
    real under CI Postgres / a Neon test branch.
    """
    if connection.vendor != "postgresql":
        pytest.skip(
            f"CREATE INDEX CONCURRENTLY / EXPLAIN index-scan plans are "
            f"Postgres-only; current backend is {connection.vendor!r}. "
            f"Run under a Postgres settings module (Neon test branch / CI) to "
            f"exercise the real migration apply and query plan."
        )


def _run_in_autocommit(sql: str) -> None:
    """Execute ``sql`` in autocommit mode (required by ``CONCURRENTLY``).

    Mirrors ``apply_sql_migrations._apply_concurrently`` Phase 1: flip the
    connection to autocommit, run the statement, then restore the prior mode.
    """
    previously_autocommit = connection.get_autocommit()
    connection.set_autocommit(True)
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
    finally:
        connection.set_autocommit(previously_autocommit)


def _valid_index_rows() -> list[bool]:
    """Return ``indisvalid`` for every index named ``INDEX_NAME``."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT i.indisvalid FROM pg_index i "
            "JOIN pg_class c ON c.oid = i.indexrelid "
            "WHERE c.relname = %s",
            [INDEX_NAME],
        )
        return [row[0] for row in cursor.fetchall()]


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="CREATE INDEX CONCURRENTLY is Postgres-only (skipped on SQLite)",
)
def test_index_migration_runs_twice_yields_one_valid_index():
    """Running the real script twice converges to exactly one valid index.

    Property 5 / R7.2, R7.4: the ``CREATE INDEX CONCURRENTLY IF NOT EXISTS``
    statement is idempotent — the second run is a no-op that does not fail and
    does not create a duplicate index.

    **Validates: Requirements 7.2, 7.4**
    """
    _require_postgres()
    sql = SCRIPT_PATH.read_text()

    try:
        # First apply builds the index.
        _run_in_autocommit(sql)
        first = _valid_index_rows()
        assert first == [True], f"expected one valid index after first run, got {first}"

        # Second apply must NOT fail and must NOT duplicate (IF NOT EXISTS).
        _run_in_autocommit(sql)
        second = _valid_index_rows()
        assert second == [True], (
            f"re-running the migration must leave exactly one valid index, "
            f"got {second}"
        )
    finally:
        _run_in_autocommit(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX_NAME};")


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="EXPLAIN index-scan plans are Postgres-only (skipped on SQLite)",
)
def test_status_submitted_at_query_uses_index_scan_not_seq_scan():
    """A status+submitted_at query plans an index scan on the new index (R7.3).

    With sequential scans disabled, the planner must be *able* to satisfy the
    ``status = ? AND submitted_at >= ?`` predicate via the composite index
    rather than falling back to a sequential scan — confirming the index is
    usable for the review-SLA / dashboard / admin-filter query shape.

    **Validates: Requirements 7.2, 7.4** (and R7.3 index-scan plan)
    """
    _require_postgres()
    sql = SCRIPT_PATH.read_text()

    try:
        _run_in_autocommit(sql)

        previously_autocommit = connection.get_autocommit()
        connection.set_autocommit(True)
        try:
            with connection.cursor() as cursor:
                cursor.execute("ANALYZE applications")
                cursor.execute("SET enable_seqscan = off")
                try:
                    cursor.execute(
                        "EXPLAIN SELECT id FROM applications "
                        "WHERE status = 'submitted' "
                        "AND submitted_at >= TIMESTAMP '2020-01-01'"
                    )
                    plan = "\n".join(row[0] for row in cursor.fetchall())
                finally:
                    cursor.execute("SET enable_seqscan = on")
        finally:
            connection.set_autocommit(previously_autocommit)

        assert INDEX_NAME in plan, (
            f"expected the query plan to use {INDEX_NAME}; plan was:\n{plan}"
        )
        assert "Seq Scan" not in plan, (
            f"expected an index/index-only scan, not a sequential scan; "
            f"plan was:\n{plan}"
        )
    finally:
        _run_in_autocommit(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX_NAME};")
