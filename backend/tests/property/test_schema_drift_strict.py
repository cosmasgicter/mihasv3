"""
Strict schema-drift test for managed=False models.

Reads information_schema.columns and asserts model fields match DB columns
exactly, excluding entries in LEGACY_DEPRECATED_COLUMNS.

Skipped when no database connection is available (pre-DB CI).
"""

import pytest
from django.apps import apps
from django.db import connection, OperationalError

from apps.common.legacy_columns import (
    LEGACY_DEPRECATED_COLUMNS,
    get_deprecated_column_names,
    is_entire_table_deprecated,
)


def _has_db_connection() -> bool:
    try:
        connection.ensure_connection()
        return True
    except (OperationalError, Exception):
        return False


def _get_db_columns(table_name: str) -> set[str]:
    if connection.vendor != "postgresql":
        if table_name not in connection.introspection.table_names():
            return set()
        with connection.cursor() as cursor:
            return {
                column.name
                for column in connection.introspection.get_table_description(cursor, table_name)
            }

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
            [table_name],
        )
        return {row[0] for row in cursor.fetchall()}


def _get_unmanaged_models():
    """Yield (model, db_table) for all managed=False models."""
    for model in apps.get_models():
        if model._meta.managed is False:
            yield model


@pytest.mark.django_db(transaction=True)
class TestSchemaDriftStrict:
    @pytest.fixture(autouse=True)
    def _skip_no_db(self):
        if not _has_db_connection():
            pytest.skip("No database connection available")

    def test_unmanaged_models_match_db(self):
        """Every managed=False model's fields must match DB columns (minus deprecated)."""
        mismatches = []

        for model in _get_unmanaged_models():
            table = model._meta.db_table

            if is_entire_table_deprecated(table):
                continue

            db_cols = _get_db_columns(table)
            if not db_cols:
                # Table doesn't exist in this DB — skip (may be test DB)
                continue

            deprecated = get_deprecated_column_names(table)
            db_cols_active = db_cols - deprecated

            model_cols = {f.column for f in model._meta.get_fields() if hasattr(f, "column")}

            # Model fields not in DB
            missing_in_db = model_cols - db_cols_active - deprecated
            # DB columns not in model (excluding deprecated)
            extra_in_db = db_cols_active - model_cols

            if missing_in_db or extra_in_db:
                mismatches.append(
                    f"{table}: missing_in_db={missing_in_db}, extra_in_db={extra_in_db}"
                )

        assert not mismatches, f"Schema drift detected:\n" + "\n".join(mismatches)
