"""Unit tests — Phase 1 payment-hardening migration indexes exist.

These tests assert that the seven Phase 1 indexes defined in the payment-hardening
design's "Migration Strategy" section have been applied to the live database.

The design requires the following indexes on `payments`:
    - uq_payments_one_active_per_application        (partial unique)
    - uq_payments_transaction_reference_present     (partial unique)
    - uq_payments_receipt_number                    (partial unique)
    - idx_payments_application_status
    - idx_payments_user_status
    - idx_payments_status_created_at

And on `webhook_event_logs`:
    - uq_webhook_processed_reference_event          (partial unique)
    - idx_webhook_provider_event_id

These indexes are created by the SQL scripts under backend/scripts/ (the
`payment_hardening_*.sql` files) and are enforced as a hard invariant by the
design — so the assertions are strict when the tests run against Postgres.

When the suite is run against a non-Postgres backend (e.g. a developer running
a single file against the SQLite contract-test fallback), the `pg_indexes`
catalog view does not exist, so the test is skipped with a clear reason.

Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
"""

import pytest
from django.db import connection


# Mapping of {table_name: {index_name, ...}} for every Phase 1 index.
EXPECTED_INDEXES: dict[str, set[str]] = {
    "payments": {
        "uq_payments_one_active_per_application",
        "uq_payments_transaction_reference_present",
        "uq_payments_receipt_number",
        "idx_payments_application_status",
        "idx_payments_user_status",
        "idx_payments_status_created_at",
    },
    "webhook_event_logs": {
        "uq_webhook_processed_reference_event",
        "idx_webhook_provider_event_id",
    },
}

# Indexes that must additionally carry the unique flag on pg_index.indisunique.
EXPECTED_UNIQUE_INDEXES: set[str] = {
    "uq_payments_one_active_per_application",
    "uq_payments_transaction_reference_present",
    "uq_payments_receipt_number",
    "uq_webhook_processed_reference_event",
}


# Flatten EXPECTED_INDEXES into (table, index) tuples for pytest parametrization.
_INDEX_CASES: list[tuple[str, str]] = sorted(
    (table, index)
    for table, indexes in EXPECTED_INDEXES.items()
    for index in indexes
)


def _require_postgres() -> None:
    """Skip the test when running against a non-Postgres backend.

    `pg_indexes` and `pg_index` are Postgres-only catalog views. The real
    production database is Neon Postgres, but local runs against a SQLite
    fallback must not error — they have no migration to inspect.
    """
    if connection.vendor != "postgresql":
        pytest.skip(
            f"pg_indexes is Postgres-only; current backend is "
            f"{connection.vendor!r}. Skipping index presence checks."
        )


@pytest.mark.django_db
@pytest.mark.parametrize(("table", "index"), _INDEX_CASES, ids=[f"{t}:{i}" for t, i in _INDEX_CASES])
def test_phase1_index_exists_on_expected_table(table: str, index: str) -> None:
    """Each Phase 1 index must exist on its expected table.

    Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
    """
    _require_postgres()

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT indexname FROM pg_indexes "
            "WHERE schemaname = 'public' AND tablename = %s AND indexname = %s",
            [table, index],
        )
        row = cursor.fetchone()

    assert row is not None, (
        f"Expected index {index!r} on table {table!r} is missing. "
        f"Apply the payment-hardening Phase 1 SQL scripts under backend/scripts/ "
        f"(e.g. payment_hardening_indexes.sql, payment_hardening_receipt_indexes.sql) "
        f"against the test database."
    )
    assert row[0] == index


@pytest.mark.django_db
@pytest.mark.parametrize("index", sorted(EXPECTED_UNIQUE_INDEXES))
def test_phase1_unique_index_is_marked_unique(index: str) -> None:
    """Every `uq_*` Phase 1 index must be flagged unique in pg_index.indisunique.

    A non-unique index of the same name would silently fail to enforce the
    ledger invariant, so we check the flag directly against the catalog.

    Validates: Requirements 12.1, 12.2, 12.3, 12.4
    """
    _require_postgres()

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT i.indisunique "
            "FROM pg_index i "
            "JOIN pg_class c ON c.oid = i.indexrelid "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relname = %s",
            [index],
        )
        row = cursor.fetchone()

    assert row is not None, (
        f"Unique index {index!r} is missing from pg_index. "
        f"Apply the payment-hardening Phase 1 SQL scripts under backend/scripts/."
    )
    assert row[0] is True, (
        f"Index {index!r} exists but is not marked unique "
        f"(pg_index.indisunique = {row[0]!r}). This violates the ledger invariant."
    )
