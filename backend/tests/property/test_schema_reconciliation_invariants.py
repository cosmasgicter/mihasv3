"""Property-based invariants for the production-schema-reconciliation spec.

# Feature: production-schema-reconciliation
# Scope:   Component 9 — Property-based invariant tests

Each property test in this file maps to one of the four invariants
declared in the requirements glossary:

    * ``Snapshot_Invariant``   — every ``payments`` row carries
      ``metadata.snapshot``.
    * ``FK_Index_Invariant``   — every foreign-key column has a
      btree index covering its leading attribute.
    * ``Coverage_Invariant``   — every concrete field on every
      Django ``managed = False`` model maps to an existing column.
    * Migration history coverage — every ``backend/scripts/*.sql``
      file older than the commit window appears in
      ``migration_history``.

Wave 3 (Task 3.4) authors only the snapshot invariant test below.
The remaining three tests will be added by Wave 4 (Task 4.4) per the
dependency graph in ``.kiro/specs/production-schema-reconciliation/tasks.md``.

All four tests are designed to share the same hypothesis configuration
(``max_examples=25``, ``deadline=2000``) per Requirement 8.1, and all
four require a PostgreSQL backend because every invariant exercises
Postgres-specific features (jsonb operators, ``pg_index``,
``information_schema.referential_constraints`` joined with ``pg_index``).

Spec: ``.kiro/specs/production-schema-reconciliation/`` — Task 3.4.
"""
from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402
from django.db import connection, transaction  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# The drift-guard helpers are the canonical implementations of every
# Postgres-specific introspection query the property tests below need.
# Reusing them keeps the property surface and the production CLI in
# lockstep: any future regression in the helpers is observed by the
# property tests on the next CI run.
from apps.common.management.commands.check_schema_drift import (  # noqa: E402
    _declared_columns,
    _enumerate_foreign_keys,
    _enumerate_migration_scripts,
    _existing_columns,
    _filesystem_mtime,
    _git_commit_timestamp,
    _has_first_attribute_btree_index,
    _iter_unmanaged_models,
    _migration_history_table_exists,
    _recorded_migration_names,
    _table_exists,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _require_postgres_or_skip() -> None:
    """Skip the test when the Postgres-only ``jsonb ?`` operator is unavailable.

    The simulated backfill query ``WHERE NOT (metadata ? 'snapshot')``
    relies on the Postgres ``jsonb`` ``?`` (has_key) operator. SQLite
    has no equivalent, so on non-Postgres backends the test would
    either error out or silently no-op. Skipping with an explicit
    reason keeps the property-test suite clean across both backends.
    """
    vendor = connection.vendor
    if vendor != "postgresql":
        pytest.skip(
            "Snapshot_Invariant relies on Postgres-only jsonb operators; "
            f"active backend is {vendor!r}."
        )


# ---------------------------------------------------------------------------
# Snapshot_Invariant
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@given(batch_size=st.integers(min_value=1, max_value=100))
@settings(max_examples=25, deadline=2000)
def test_snapshot_invariant_holds_after_simulated_backfill(batch_size: int) -> None:
    """After the simulated backfill runs, every inserted row has ``metadata.snapshot``.

    For any batch of synthetic ``payments`` rows inserted with
    ``metadata = '{}'::jsonb`` (an empty jsonb object that lacks the
    ``snapshot`` key), running the simulated backfill statement

        UPDATE payments
           SET metadata = jsonb_set(metadata, '{snapshot}', '{}'::jsonb)
         WHERE NOT (metadata ? 'snapshot');

    SHALL leave every inserted row with a populated ``metadata.snapshot``
    key. The post-condition predicate ``NOT (metadata ? 'snapshot')``
    SHALL evaluate to ``false`` for every inserted row.

    This is the production-equivalent of the
    ``backend/scripts/payment_snapshot_backfill.py`` apply path —
    expressed as a single SQL statement so the property exercises the
    raw database-level invariant without depending on the script's
    ORM-level helpers.

    Test isolation
    --------------
    The whole body runs inside a ``transaction.atomic()`` block whose
    savepoint is explicitly rolled back via ``transaction.set_rollback``.
    No inserted row survives between hypothesis examples — each example
    sees a clean ``payments`` table modulo whatever rows the outer
    pytest-django fixture has already prepared.

    The synthetic rows use ``gen_random_uuid()`` for ``application_id``
    and ``user_id`` even though those columns carry FKs to
    ``applications`` and ``profiles``. This is safe because the FK
    constraints are declared ``DEFERRABLE INITIALLY DEFERRED`` (see
    ``backend/scripts/00_full_schema.sql``), so the constraints are
    checked at commit time only — and we always roll back, so they
    are never checked.

    **Validates: Requirements 3.3, 8.5**
    """
    _require_postgres_or_skip()

    # Track the IDs we insert so the post-condition check is scoped to
    # exactly this example's rows. Existing ``payments`` rows in the
    # test database (left over from sibling tests, fixtures, or seed
    # data) MUST NOT influence the property — they could legitimately
    # be missing ``metadata.snapshot`` for unrelated reasons.
    inserted_ids: list[str] = []

    with transaction.atomic():
        try:
            with connection.cursor() as cur:
                # Insert ``batch_size`` synthetic rows. NOT NULL columns
                # are populated with deterministic placeholders; the
                # nullable ``metadata`` is set to an empty jsonb object
                # so the simulated UPDATE's WHERE clause matches.
                for _ in range(batch_size):
                    cur.execute(
                        """
                        INSERT INTO payments (
                            id,
                            application_id,
                            user_id,
                            amount,
                            currency,
                            status,
                            metadata,
                            created_at
                        ) VALUES (
                            gen_random_uuid(),
                            gen_random_uuid(),
                            gen_random_uuid(),
                            0,
                            'ZMW',
                            'pending',
                            '{}'::jsonb,
                            now()
                        )
                        RETURNING id;
                        """
                    )
                    inserted_ids.append(str(cur.fetchone()[0]))

                # Pre-condition: every inserted row currently lacks the
                # snapshot key. This is a sanity check on the seed —
                # if the predicate is wrong, the property's post-
                # condition assertion below would silently pass.
                cur.execute(
                    """
                    SELECT count(*)
                      FROM payments
                     WHERE id = ANY(%s::uuid[])
                       AND NOT (metadata ? 'snapshot');
                    """,
                    [inserted_ids],
                )
                pre_missing = int(cur.fetchone()[0])
                assert pre_missing == batch_size, (
                    f"seed mismatch: expected {batch_size} rows missing "
                    f"snapshot, observed {pre_missing}"
                )

                # Simulated backfill — verbatim from Task 3.4 spec.
                cur.execute(
                    """
                    UPDATE payments
                       SET metadata = jsonb_set(metadata, '{snapshot}', '{}'::jsonb)
                     WHERE NOT (metadata ? 'snapshot');
                    """
                )

                # Post-condition: no inserted row remains without
                # ``metadata.snapshot``. This is the Snapshot_Invariant
                # restated for the example's batch.
                cur.execute(
                    """
                    SELECT count(*)
                      FROM payments
                     WHERE id = ANY(%s::uuid[])
                       AND NOT (metadata ? 'snapshot');
                    """,
                    [inserted_ids],
                )
                post_missing = int(cur.fetchone()[0])
                assert post_missing == 0, (
                    f"Snapshot_Invariant violated for batch_size={batch_size}: "
                    f"{post_missing} inserted row(s) still lack metadata.snapshot "
                    f"after the simulated backfill."
                )

                # Defensive: confirm every inserted row's snapshot key
                # is present and structurally valid (an object, even if
                # empty). ``jsonb_set`` writing ``'{}'::jsonb`` should
                # always produce a jsonb object value at that key.
                cur.execute(
                    """
                    SELECT count(*)
                      FROM payments
                     WHERE id = ANY(%s::uuid[])
                       AND jsonb_typeof(metadata -> 'snapshot') = 'object';
                    """,
                    [inserted_ids],
                )
                with_object_snapshot = int(cur.fetchone()[0])
                assert with_object_snapshot == batch_size, (
                    f"snapshot key shape mismatch: expected {batch_size} "
                    f"rows with object-typed metadata.snapshot, observed "
                    f"{with_object_snapshot}."
                )
        finally:
            # Roll back the entire example so the next hypothesis draw
            # sees a pristine ``payments`` table. ``set_rollback(True)``
            # tells Django's transaction manager to discard work on
            # block exit even though no exception is raised.
            transaction.set_rollback(True)


# ---------------------------------------------------------------------------
# Future tests (Task 4.4 — Wave 4)
# ---------------------------------------------------------------------------
#
# Wave 4 (Task 4.4) appends three additional property tests to this
# file:
#
#   * ``test_fk_index_invariant_holds``           — Requirement 8.2
#   * ``test_coverage_invariant_holds``           — Requirement 8.3
#   * ``test_migration_history_coverage``         — Requirement 8.4
#
# Each will use ``@given(st.data())`` and the same
# ``@settings(max_examples=25, deadline=2000)`` configuration so the
# four invariants share one execution profile. See design.md
# §"Component 9 — Property-based invariant tests" for the implementations.


# ---------------------------------------------------------------------------
# FK_Index_Invariant
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@given(data=st.data())
@settings(max_examples=25, deadline=2000)
def test_fk_index_invariant_holds(data) -> None:
    """Every drawn foreign-key column on the configured DB has a covering btree index.

    The drift-guard ``--check-fk-indexes`` helper enumerates every row
    in ``information_schema.referential_constraints`` joined to
    ``key_column_usage`` and ``constraint_column_usage`` to produce
    ``(table, column, ref_table, ref_column)`` tuples. For each tuple
    the FK_Index_Invariant requires a valid btree index whose first
    indexed attribute (``pg_index.indkey[0]``) matches the FK source
    column.

    This property test draws an arbitrary, unique subset of those FKs
    via ``hypothesis.strategies.data().draw(st.lists(st.sampled_from,
    ...))`` and asserts the invariant for every drawn member. The
    property is structural — when the invariant holds globally on the
    configured DB, every random subset trivially satisfies it. The
    shrinking output identifies which specific FK is uncovered if a
    regression slips in.

    Skip semantics
    --------------
    * Non-Postgres backends — ``information_schema.referential_constraints``
      and ``pg_index`` are Postgres-specific. Skip cleanly.
    * Empty FK source set — the SQLite test database (Django auto-built
      schema for ``managed=False`` models) does not always materialise
      every FK constraint declared in production. When no FK rows exist
      to draw from, ``st.sampled_from`` would raise ``InvalidArgument``;
      skip with a clear message instead.

    **Validates: Requirements 8.1, 8.2, 8.6**
    """
    if connection.vendor != "postgresql":
        pytest.skip(
            "FK_Index_Invariant relies on Postgres-only "
            "information_schema.referential_constraints + pg_index joins; "
            f"active backend is {connection.vendor!r}."
        )

    fks = _enumerate_foreign_keys()
    if not fks:
        pytest.skip(
            "No foreign-key constraints visible on the configured "
            "Postgres database — nothing to sample from."
        )

    # Draw an arbitrary unique subset of FKs. ``min_size=1`` ensures
    # every example exercises at least one assertion. ``max_size`` is
    # bounded by the FK list so hypothesis cannot ask for more rows
    # than exist.
    subset = data.draw(
        st.lists(
            st.sampled_from(fks),
            min_size=1,
            max_size=len(fks),
            unique=True,
        )
    )

    for table, column, ref_table, ref_column in subset:
        assert _has_first_attribute_btree_index(table, column), (
            f"FK_Index_Invariant violated: "
            f"{table}.{column} -> {ref_table}.{ref_column} has no covering "
            f"btree index whose first attribute is {column!r}."
        )


# ---------------------------------------------------------------------------
# Coverage_Invariant
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@given(data=st.data())
@settings(max_examples=25, deadline=2000)
def test_coverage_invariant_holds(data) -> None:
    """Every drawn ``managed=False`` model maps to a real table whose columns include every declared field.

    The drift-guard's default check enumerates every Django model with
    ``Meta.managed = False`` and asserts each concrete field's
    ``column`` attribute exists in ``information_schema.columns`` for
    the model's ``db_table``. This property restates that check over
    arbitrary subsets of those models so any regression — a new field
    added without the matching ``ALTER TABLE``, a renamed column —
    surfaces with a hypothesis-shrunk minimal counterexample.

    Skip semantics
    --------------
    * Empty source set — when none of the configured DB has tables for
      the unmanaged models (e.g., a fresh test DB without the
      ``unmanaged_schema`` fixture), there is nothing to sample from.
      Skip rather than fail. In practice the session-scoped
      ``unmanaged_schema`` fixture in ``backend/tests/conftest.py``
      creates the tables, so the property exercises a real surface.
    * Per-model table-existence guard — even when most tables exist,
      individual models can be missing on bootstrapping connections.
      Those rows skip with a per-model continue rather than failing
      the whole property; the drift-guard CLI also tolerates this on
      non-strict invocations.

    **Validates: Requirements 8.1, 8.3, 8.6**
    """
    # Filter to models whose underlying table actually exists on the
    # configured connection. The ``unmanaged_schema`` session fixture
    # creates them on SQLite test DBs; on Postgres production all 35
    # tables are present. Filtering up-front keeps the
    # ``st.sampled_from`` source set non-empty and aligns the property
    # with the drift-guard CLI's tolerant default behaviour.
    available = [
        model
        for model in _iter_unmanaged_models()
        if _table_exists(model._meta.db_table)
    ]
    if not available:
        pytest.skip(
            "No managed=False models have backing tables on the "
            "configured database — Coverage_Invariant has no surface "
            "to sample."
        )

    subset = data.draw(
        st.lists(
            st.sampled_from(available),
            min_size=1,
            max_size=len(available),
            unique=True,
        )
    )

    for model in subset:
        table = model._meta.db_table
        declared = set(_declared_columns(model))
        existing = _existing_columns(table)
        missing = declared - existing
        assert not missing, (
            f"Coverage_Invariant violated for {model.__module__}."
            f"{model.__name__} (table={table!r}): "
            f"declared column(s) absent from information_schema: "
            f"{sorted(missing)}"
        )


# ---------------------------------------------------------------------------
# Migration_History coverage
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@given(data=st.data())
@settings(max_examples=25, deadline=2000)
def test_migration_history_coverage(data) -> None:
    """Every drawn forward Migration_Script committed > 7 days ago is recorded in migration_history.

    Per Requirement 8.4, the coverage property enumerates every
    ``backend/scripts/*.sql`` file (excluding ``applied/``,
    ``archive/``, ``migrations/`` subdirectories and any
    ``*_rollback.sql`` sibling), draws an arbitrary subset, and for
    each member asserts that **if** the file's git commit timestamp
    (or filesystem mtime fallback) is strictly older than 7 days,
    **then** its basename appears in ``migration_history``. Files
    committed within the last 7 days — including exactly 7 days ago —
    are tolerated because they are in-flight and may not yet have
    been applied to the configured database.

    Skip semantics
    --------------
    * No script files on disk — ``backend/scripts/`` directory is
      empty or missing. There is nothing to sample.
    * No ``migration_history`` table on the configured database — the
      bootstrap step ``2026_05_22_migration_history_extend.sql`` has
      not run. The drift-guard CLI emits a warning and short-circuits
      in this case; the property test mirrors that by skipping cleanly.
      The SQLite test DB used by ``config.settings.test`` is the
      canonical example: Django's auto-built schema does not include
      ``migration_history``.

    **Validates: Requirements 8.1, 8.4, 8.6**
    """
    if not _migration_history_table_exists():
        pytest.skip(
            "migration_history table not present on the configured "
            "database — coverage property has no recorded set to "
            "compare against."
        )

    scripts = _enumerate_migration_scripts()
    if not scripts:
        pytest.skip(
            "No forward Migration_Scripts under backend/scripts/ — "
            "coverage property has nothing to sample."
        )

    subset = data.draw(
        st.lists(
            st.sampled_from(scripts),
            min_size=1,
            max_size=len(scripts),
            unique=True,
        )
    )

    # Compute the cutoff once per example. ``timezone.utc``-aware so
    # the comparison against ``_git_commit_timestamp`` (also tz-aware
    # via ``%cI``) and ``_filesystem_mtime`` (tz-aware UTC) works
    # without naive/aware mismatches.
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    recorded = _recorded_migration_names()

    for path in subset:
        commit_ts = _git_commit_timestamp(path)
        if commit_ts is not None:
            timestamp = commit_ts
        else:
            timestamp = _filesystem_mtime(path)

        # Boundary case per R8.4: filenames committed exactly 7 days
        # ago are tolerated. Strict less-than enforces "strictly older
        # than 7 days" — equality with the cutoff is treated as
        # in-flight.
        if timestamp >= cutoff:
            continue

        assert path.name in recorded, (
            f"Migration_History coverage violated: {path.name!r} "
            f"committed at {timestamp.isoformat()} (older than the "
            f"7-day window) but its basename is absent from "
            f"migration_history."
        )
