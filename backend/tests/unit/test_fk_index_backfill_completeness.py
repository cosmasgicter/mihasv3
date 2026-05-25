"""Unit tests — FK index backfill script lists exactly the 15 unindexed FK columns.

The reconciliation Migration_Script `2026_05_22_fk_index_backfill.sql` exists
to close the gap the live audit found against the production-readiness
report's "all FKs indexed" claim. The list of 15 (table, column) pairs is
fixed by Component 5 in the spec design and pinned again in tasks.md task
2.2 — any drift between the script body and that list is a spec violation
and a production risk, so this test pins both halves of the contract:

1. Static parser assertion (always runs): every
   `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<column>
   ON <table>(<column>);` statement in the script body parses cleanly and
   the resulting set of (table, column) pairs equals the 15 pairs in the
   design — no extras, no missing, no name drift.

2. Postgres apply assertion (Postgres-only, skipped on SQLite): the 15
   indexes are absent before the script runs and present afterwards. The
   `CONCURRENTLY` keyword is stripped before execution because pytest
   wraps the test in a transaction; the production runner uses
   `apply_sql_migrations`'s split-phase autocommit handling instead.

Validates: Requirements 2.1, 2.6
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.db import connection


# Resolve the script path relative to this test file so the test does not
# depend on the pytest invocation directory.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
SCRIPT_PATH = _BACKEND_DIR / "scripts" / "2026_05_22_fk_index_backfill.sql"


# The 15 (table, column) pairs that must be indexed by this script. This
# list mirrors design.md Component 5 and tasks.md task 2.2 verbatim.
EXPECTED_FK_PAIRS: frozenset[tuple[str, str]] = frozenset({
    ("applications", "admin_feedback_by"),
    ("applications", "assigned_reviewer_id"),
    ("applications", "payment_verified_by"),
    ("applications", "reviewed_by"),
    ("application_amendments", "reviewed_by"),
    ("application_conditions", "verified_by"),
    ("application_documents", "verified_by"),
    ("application_drafts", "application_id"),
    ("application_interviews", "created_by"),
    ("application_interviews", "updated_by"),
    ("application_status_history", "changed_by"),
    ("fee_waivers", "approved_by"),
    ("payments", "verified_by"),
    ("programs", "institution_id"),
    ("settings", "updated_by"),
})

# Derived index name set, using the canonical idx_<table>_<column> naming
# convention enforced by the script body.
EXPECTED_INDEX_NAMES: frozenset[str] = frozenset(
    f"idx_{table}_{column}" for table, column in EXPECTED_FK_PAIRS
)


# Match a single CREATE INDEX CONCURRENTLY IF NOT EXISTS statement of the
# form expected by the script. The script formats each statement across two
# lines (index name on one line, ON <table>(<column>) on the next), so the
# regex must allow whitespace including newlines between the index name and
# the ON clause. Statement ends at the trailing semicolon.
_CREATE_INDEX_RE = re.compile(
    r"""
    CREATE \s+ INDEX \s+ CONCURRENTLY \s+ IF \s+ NOT \s+ EXISTS \s+
    (?P<index_name>idx_[a-z0-9_]+) \s+
    ON \s+ (?P<table>[a-z0-9_]+) \s* \( \s* (?P<column>[a-z0-9_]+) \s* \) \s* ;
    """,
    re.IGNORECASE | re.VERBOSE | re.DOTALL,
)


def _strip_sql_line_comments(sql: str) -> str:
    """Strip ``--`` line comments without touching SQL string literals.

    The FK backfill script does not use string literals, so a simple
    line-by-line strip is sufficient and avoids pulling in a SQL parser.
    """
    out_lines: list[str] = []
    for line in sql.splitlines():
        if "--" in line:
            line = line.split("--", 1)[0]
        out_lines.append(line)
    return "\n".join(out_lines)


def _parse_create_index_statements(sql: str) -> list[tuple[str, str, str]]:
    """Return ``(index_name, table, column)`` tuples for every CREATE INDEX
    CONCURRENTLY IF NOT EXISTS statement in the script body.
    """
    body = _strip_sql_line_comments(sql)
    return [
        (match.group("index_name"), match.group("table"), match.group("column"))
        for match in _CREATE_INDEX_RE.finditer(body)
    ]


def test_script_file_exists() -> None:
    """The FK backfill script must exist at the expected path.

    Validates: Requirements 2.1
    """
    assert SCRIPT_PATH.exists(), (
        f"FK backfill script missing at {SCRIPT_PATH}. Task 2.2 must have "
        f"authored it before this completeness test can run."
    )


def test_script_lists_exactly_the_fifteen_unindexed_fk_columns() -> None:
    """The set of CREATE INDEX statements must equal the 15 expected pairs.

    Static parser-based assertion: the script body must contain exactly one
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<column>
    ON <table>(<column>);` statement per expected (table, column) pair, with
    no extras, no missing pairs, and no name drift between the index name
    and the table/column it references.

    Validates: Requirements 2.1, 2.6
    """
    sql = SCRIPT_PATH.read_text()
    parsed = _parse_create_index_statements(sql)

    # Total count: exactly 15 statements, no more, no less.
    assert len(parsed) == 15, (
        f"Expected exactly 15 CREATE INDEX CONCURRENTLY statements in "
        f"{SCRIPT_PATH.name}, found {len(parsed)}. "
        f"Parsed statements: {parsed!r}"
    )

    # Every statement must follow the idx_<table>_<column> naming convention.
    name_drift = [
        (index_name, table, column)
        for index_name, table, column in parsed
        if index_name != f"idx_{table}_{column}"
    ]
    assert not name_drift, (
        f"Index name does not match idx_<table>_<column> convention for: "
        f"{name_drift!r}"
    )

    # The set of (table, column) pairs equals the expected 15 exactly.
    parsed_pairs = frozenset((table, column) for _, table, column in parsed)
    missing = EXPECTED_FK_PAIRS - parsed_pairs
    extra = parsed_pairs - EXPECTED_FK_PAIRS
    assert not missing and not extra, (
        f"FK backfill script does not match design.md Component 5.\n"
        f"  Missing pairs (in design, not in script): {sorted(missing)!r}\n"
        f"  Extra pairs   (in script, not in design): {sorted(extra)!r}"
    )

    # Each pair appears at most once — no accidental duplicates.
    duplicates = [
        pair
        for pair in parsed_pairs
        if sum(1 for _, t, c in parsed if (t, c) == pair) > 1
    ]
    assert not duplicates, (
        f"FK backfill script contains duplicate (table, column) statements: "
        f"{duplicates!r}"
    )


@pytest.mark.django_db(transaction=True)
def test_indexes_absent_before_and_present_after_script_run() -> None:
    """On Postgres, the 15 indexes do not exist beforehand and exist after.

    Skipped cleanly when the configured database is not Postgres (e.g.
    `DJANGO_SETTINGS_MODULE=config.settings.test`, which uses SQLite). The
    `pg_indexes` catalog view does not exist on SQLite, so there is nothing
    to assert there — the static parser test above carries the spec
    invariant in that environment.

    The `CONCURRENTLY` keyword is stripped before execution because pytest
    wraps the test in a transaction and `CREATE INDEX CONCURRENTLY` cannot
    run inside one. The production runner uses
    `apply_sql_migrations`'s split-phase autocommit handling per
    Requirement 1.5 instead — that path is exercised by the
    test_apply_sql_migrations.py suite, not here.

    Validates: Requirements 2.1, 2.6
    """
    if connection.vendor != "postgresql":
        pytest.skip(
            f"FK index apply check is Postgres-only; current backend is "
            f"{connection.vendor!r}. Run with "
            f"DJANGO_SETTINGS_MODULE=config.settings.dev (or any Postgres "
            f"settings module) to exercise this path."
        )

    expected_names = sorted(EXPECTED_INDEX_NAMES)
    sql = SCRIPT_PATH.read_text()
    # Strip CONCURRENTLY so the statements can run inside the test
    # transaction. The whitespace placeholder keeps the rest of the
    # statement well-formed.
    sql_for_test = re.sub(
        r"\bCREATE\s+INDEX\s+CONCURRENTLY\b",
        "CREATE INDEX",
        sql,
        flags=re.IGNORECASE,
    )

    with connection.cursor() as cursor:
        # Pre-condition: drop any pre-existing indexes with these names so
        # the assertion that they do not yet exist is meaningful. Use a
        # plain DROP INDEX (not CONCURRENTLY) because we are inside a
        # transaction.
        for name in expected_names:
            cursor.execute(f"DROP INDEX IF EXISTS {name}")

        cursor.execute(
            "SELECT indexname FROM pg_indexes "
            "WHERE schemaname = current_schema() "
            "AND indexname = ANY(%s) "
            "ORDER BY indexname",
            [expected_names],
        )
        before = [row[0] for row in cursor.fetchall()]
        assert before == [], (
            f"Pre-condition failed: one or more FK backfill indexes already "
            f"exist before the script runs: {before!r}"
        )

        # Run the script body (CONCURRENTLY-stripped) in one shot. psycopg
        # accepts multiple statements separated by semicolons.
        cursor.execute(sql_for_test)

        cursor.execute(
            "SELECT indexname FROM pg_indexes "
            "WHERE schemaname = current_schema() "
            "AND indexname = ANY(%s) "
            "ORDER BY indexname",
            [expected_names],
        )
        after = [row[0] for row in cursor.fetchall()]

        # Clean up before raising the assertion so subsequent tests in the
        # same session do not see stray indexes.
        for name in expected_names:
            cursor.execute(f"DROP INDEX IF EXISTS {name}")

    assert after == expected_names, (
        f"Post-condition failed: after running the FK backfill script, "
        f"the following indexes were not created on the configured "
        f"database. Expected {expected_names!r}, got {after!r}."
    )
