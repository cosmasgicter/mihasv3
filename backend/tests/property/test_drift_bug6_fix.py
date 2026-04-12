"""
Bug 6 (MEDIUM) — DB migration ownership drifting: Fix Checking Test

Parametrized test verifying that all Django models with managed=False in the
admissions-related apps have their db_table listed in EXPECTED_TABLES in
verify_schema_static.py. Specifically checks that the 4 newly added tables
(program_fees, webhook_event_logs, error_logs, sse_events) are present.

**Validates: Requirements 2.15**
"""

import os
import sys
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402
from django.apps import apps  # noqa: E402

# Import EXPECTED_TABLES from the verification script
from scripts.verify_schema_static import EXPECTED_TABLES  # noqa: E402

# The admissions-related app labels that verify_schema_static.py covers
ADMISSIONS_APP_LABELS = {
    "accounts", "applications", "catalog", "documents", "common",
}


def _get_admissions_unmanaged_models():
    """Collect unmanaged models from admissions-related apps."""
    models = []
    for model in apps.get_models():
        if not model._meta.managed and model._meta.app_label in ADMISSIONS_APP_LABELS:
            models.append(
                (model._meta.db_table, f"{model._meta.app_label}.{model.__name__}")
            )
    return models


ADMISSIONS_UNMANAGED_MODELS = _get_admissions_unmanaged_models()


@pytest.mark.parametrize(
    "db_table,model_label",
    ADMISSIONS_UNMANAGED_MODELS,
    ids=[f"{table}" for table, _ in ADMISSIONS_UNMANAGED_MODELS],
)
def test_admissions_unmanaged_model_table_in_expected_tables(db_table, model_label):
    """Each admissions-related managed=False model's db_table must be in EXPECTED_TABLES.

    **Validates: Requirements 2.15**
    """
    assert db_table in EXPECTED_TABLES, (
        f"Model {model_label} has db_table='{db_table}' with managed=False, "
        f"but '{db_table}' is NOT in EXPECTED_TABLES in verify_schema_static.py. "
        f"Add it to keep schema verification complete."
    )


def test_newly_added_tables_present():
    """The 4 tables added by Bug 6 fix are in EXPECTED_TABLES.

    **Validates: Requirements 2.15**
    """
    required_new_tables = ["program_fees", "webhook_event_logs", "error_logs", "sse_events"]
    for table in required_new_tables:
        assert table in EXPECTED_TABLES, (
            f"'{table}' must be in EXPECTED_TABLES after Bug 6 fix"
        )
