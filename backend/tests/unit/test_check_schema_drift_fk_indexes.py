"""Tests for the ``--check-fk-indexes`` flag on ``check_schema_drift``.

Task 4.1 of ``.kiro/specs/production-schema-reconciliation/`` extends
``check_schema_drift`` with a ``--check-fk-indexes`` argparse flag that
joins ``information_schema.referential_constraints``,
``key_column_usage``, ``constraint_column_usage`` and ``pg_index`` to
find foreign-key columns whose first-attribute btree index is missing
or ``indisvalid = false``. Each gap surfaces as a canonical
``MISSING_FK_INDEX: <table>.<column> -> <ref_table>.<ref_column>`` line
and contributes to the non-zero exit.

The test cases here cover three observable behaviours:

1. **Flag absent** (always runs, no DB-vendor dependency): the FK-index
   helper is not invoked at all when ``--check-fk-indexes`` is omitted.
2. **Postgres + missing index** (Postgres-only): a freshly created FK
   without a covering index produces the canonical
   ``MISSING_FK_INDEX:`` line and a non-zero exit.
3. **Postgres + all FKs indexed** (Postgres-only): the same FK with an
   explicit btree index produces no ``MISSING_FK_INDEX:`` line and
   exits 0.
4. **Non-Postgres backends** (always runs): the command emits a clear
   skip message and exits 0 when ``connection.vendor`` is not
   ``postgresql`` so the SQLite-backed test suite continues to pass
   even with the flag set.

Validates: Requirements 5.1, 5.4, 5.6.
"""

from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command
from django.db import connection


# Module-level marker so pytest collects every test as one needing DB
# access (the FK-index helper queries information_schema/pg_index even
# in the negative test path, where we monkeypatch it out — but the
# argparse + management-command machinery still goes through Django's
# DB connection during ``call_command``).
pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# 1. Flag absent — the FK-index helper is not invoked at all.
# ---------------------------------------------------------------------------


def test_flag_absent_does_not_invoke_fk_index_helper(monkeypatch):
    """Without ``--check-fk-indexes``, the helper must not run.

    The check involves querying ``pg_index`` on Postgres production —
    it's not free, and the contract is that the existing default
    invocation pays no extra cost. Monkeypatching the helper to raise
    when called gives us a sharp signal: any inadvertent invocation
    fails the test loudly rather than passing silently.

    Validates: Requirement 5.1 (flag-gated activation).
    """
    from apps.common.management.commands import check_schema_drift

    def _boom(*args, **kwargs):
        raise AssertionError(
            "_find_missing_fk_indexes was called even though "
            "--check-fk-indexes was not passed"
        )

    monkeypatch.setattr(
        check_schema_drift,
        "_find_missing_fk_indexes",
        _boom,
    )

    out = StringIO()
    try:
        call_command("check_schema_drift", stdout=out)
    except SystemExit as exc:
        # If the existing schema has unrelated drift, surface it with
        # the captured output rather than masking the test's intent.
        pytest.fail(
            f"check_schema_drift exited unexpectedly (code={exc.code}). "
            f"Output:\n{out.getvalue()}"
        )

    # Sanity: the default success path was reached.
    assert "No schema drift" in out.getvalue()


# ---------------------------------------------------------------------------
# 4. Non-Postgres backends — clear skip message, exit 0.
# ---------------------------------------------------------------------------


def test_flag_present_skipped_cleanly_on_non_postgres():
    """On SQLite (or any non-Postgres backend), the FK-index check
    skips with a clear message and the command exits 0.

    The ``information_schema.referential_constraints`` and ``pg_index``
    catalogs the helper relies on are Postgres-only. Skipping here
    keeps the SQLite-backed local test suite green even when the flag
    is set, which Task 4.1 explicitly calls out as required behaviour.

    Validates: Requirement 5.1 (Postgres-only graceful handling).
    """
    if connection.vendor == "postgresql":
        pytest.skip(
            "Non-Postgres skip path is exercised on the SQLite test "
            "settings; current backend is postgresql."
        )

    out = StringIO()
    try:
        call_command("check_schema_drift", "--check-fk-indexes", stdout=out)
    except SystemExit as exc:
        pytest.fail(
            f"check_schema_drift exited unexpectedly with --check-fk-indexes "
            f"on non-Postgres backend (code={exc.code}). Output:\n{out.getvalue()}"
        )

    text = out.getvalue()
    assert "--check-fk-indexes skipped" in text, (
        f"Expected a clear skip message; got:\n{text}"
    )
    assert "Postgres-only" in text
    # Per R5.6 (Task 4.3): when ``--check-fk-indexes`` is passed the
    # success line is the structured ``OK: schema-drift=<n>
    # fk-indexes=<m> migration-history=<k>`` form, not the historical
    # "No schema drift" line. ``fk-indexes=disabled`` is the
    # short-circuit signal for the non-Postgres skip path.
    assert "OK: schema-drift=" in text
    assert "fk-indexes=disabled" in text
    assert "migration-history=disabled" in text


# ---------------------------------------------------------------------------
# 2. Postgres + intentionally missing index — non-zero exit, canonical line.
# ---------------------------------------------------------------------------


@pytest.fixture
def fk_test_tables():
    """Create a parent/child table pair with a FK on the child.

    The fixture yields the child column name (with table) so each test
    can assert against it precisely, then drops both tables on
    teardown so subsequent tests do not see stray fixtures.

    Postgres-only — caller skips before invoking the fixture.
    """
    if connection.vendor != "postgresql":
        pytest.skip("FK fixture is Postgres-only")

    parent = "_drift_fk_parent"
    child = "_drift_fk_child"
    fk_column = "parent_id"
    fk_index = "idx_drift_fk_child_parent_id"

    with connection.cursor() as cursor:
        # Belt-and-braces clean-up in case a prior test left debris.
        cursor.execute(f"DROP INDEX IF EXISTS {fk_index}")
        cursor.execute(f"DROP TABLE IF EXISTS {child}")
        cursor.execute(f"DROP TABLE IF EXISTS {parent}")

        cursor.execute(
            f"CREATE TABLE {parent} (id INTEGER PRIMARY KEY)"
        )
        cursor.execute(
            f"CREATE TABLE {child} ("
            f"  id INTEGER PRIMARY KEY,"
            f"  {fk_column} INTEGER NOT NULL "
            f"    REFERENCES {parent}(id)"
            f")"
        )

    try:
        yield {
            "parent": parent,
            "child": child,
            "fk_column": fk_column,
            "fk_index": fk_index,
        }
    finally:
        with connection.cursor() as cursor:
            cursor.execute(f"DROP INDEX IF EXISTS {fk_index}")
            cursor.execute(f"DROP TABLE IF EXISTS {child}")
            cursor.execute(f"DROP TABLE IF EXISTS {parent}")


@pytest.mark.django_db(transaction=True)
def test_postgres_missing_fk_index_emits_canonical_line_and_exits_nonzero(
    fk_test_tables,
):
    """A FK column without a covering btree index produces the
    ``MISSING_FK_INDEX: <table>.<column> -> <ref_table>.<ref_column>``
    line and the command exits with code 1.

    The fixture deliberately omits an index on the child's FK column.
    The check should pick it up via the ``information_schema`` joins
    and emit the canonical line shape that runbooks and CI log
    parsers grep for.

    Validates: Requirements 5.1, 5.4, 5.6.
    """
    if connection.vendor != "postgresql":
        pytest.skip(
            f"--check-fk-indexes happy-path is Postgres-only; current "
            f"backend is {connection.vendor!r}."
        )

    out = StringIO()
    with pytest.raises(SystemExit) as exc:
        call_command("check_schema_drift", "--check-fk-indexes", stdout=out)
    assert exc.value.code == 1, (
        f"Expected non-zero exit on missing FK index; got {exc.value.code}. "
        f"Output:\n{out.getvalue()}"
    )

    text = out.getvalue()
    expected = (
        f"MISSING_FK_INDEX: {fk_test_tables['child']}."
        f"{fk_test_tables['fk_column']} -> {fk_test_tables['parent']}.id"
    )
    assert expected in text, (
        f"Expected canonical line {expected!r} in output. Full output:\n{text}"
    )


# ---------------------------------------------------------------------------
# 3. Postgres + all FKs indexed — exit 0.
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
def test_postgres_indexed_fk_does_not_emit_missing_fk_index(fk_test_tables):
    """A FK column with a covering btree index does not produce a
    ``MISSING_FK_INDEX:`` line for that pair.

    We add the index after the fixture creates the tables and assert
    the canonical line for *this fixture's* pair is not in the output.
    Other tables in the test database (Django auth, etc.) are not
    asserted on — the existing schema may legitimately have other
    unindexed FKs; the test is scoped to the behaviour added by this
    task.

    Validates: Requirement 5.4 (covering-index recognition).
    """
    if connection.vendor != "postgresql":
        pytest.skip(
            f"--check-fk-indexes covered-index path is Postgres-only; "
            f"current backend is {connection.vendor!r}."
        )

    with connection.cursor() as cursor:
        cursor.execute(
            f"CREATE INDEX {fk_test_tables['fk_index']} "
            f"ON {fk_test_tables['child']}({fk_test_tables['fk_column']})"
        )

    out = StringIO()
    # Whether the run exits 0 or 1 depends on FK-index gaps elsewhere
    # in the test database (Django auth tables, etc.), so we assert on
    # the absence of *our* fixture's line rather than on the exit code.
    try:
        call_command("check_schema_drift", "--check-fk-indexes", stdout=out)
    except SystemExit:
        pass  # other gaps may exist; not what this test is checking.

    text = out.getvalue()
    forbidden = (
        f"MISSING_FK_INDEX: {fk_test_tables['child']}."
        f"{fk_test_tables['fk_column']} -> {fk_test_tables['parent']}.id"
    )
    assert forbidden not in text, (
        f"FK with covering btree index should not appear in MISSING_FK_INDEX "
        f"output, but did. Output:\n{text}"
    )


# ---------------------------------------------------------------------------
# Helper-level unit test: the SQL query is well-formed (Postgres-only).
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
def test_enumerate_foreign_keys_returns_tuples_on_postgres():
    """``_enumerate_foreign_keys`` returns a list of 4-tuples shape.

    The test does not assert any specific FK is present (the test DB
    schema varies with the active app set), but it does assert the
    function executes its SQL cleanly and returns the documented
    tuple shape so callers can pattern-match without surprises.

    Validates: Requirement 5.4 (query implementation correctness).
    """
    if connection.vendor != "postgresql":
        pytest.skip(
            f"_enumerate_foreign_keys is Postgres-only; current backend "
            f"is {connection.vendor!r}."
        )

    from apps.common.management.commands.check_schema_drift import (
        _enumerate_foreign_keys,
    )

    rows = _enumerate_foreign_keys()
    assert isinstance(rows, list)
    for row in rows:
        assert isinstance(row, tuple) and len(row) == 4, (
            f"Expected (table, column, ref_table, ref_column) tuples; got {row!r}"
        )
        assert all(isinstance(part, str) for part in row)
