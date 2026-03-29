"""Property-based tests for data migration and schema compatibility.

# Feature: python-backend-migration, Property 36: Schema compatibility
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.apps import apps  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Expected table mapping: app_label → set of expected db_table names
# ---------------------------------------------------------------------------

EXPECTED_TABLE_MAPPING: dict[str, set[str]] = {
    "accounts": {
        "profiles",
        "device_sessions",
        "login_attempts",
        "password_reset_tokens",
        "csrf_tokens",
        "user_permission_overrides",
    },
    "applications": {
        "applications",
        "application_status_history",
        "application_drafts",
        "application_interviews",
    },
    "documents": {
        "application_documents",
        "application_grades",
        "payments",
    },
    "catalog": {
        "institutions",
        "programs",
        "intakes",
        "program_intakes",
        "subjects",
        "course_requirements",
    },
    "common": {
        "audit_logs",
        "idempotency_keys",
        "settings",
        "notifications",
        "user_notification_preferences",
        "email_queue",
        "migration_history",
    },
}

# Flatten to a list of (app_label, model, expected_table) tuples for easy iteration
ALL_MODELS: list[tuple[str, type, str]] = []
for app_label, table_names in EXPECTED_TABLE_MAPPING.items():
    app_config = apps.get_app_config(app_label)
    for model in app_config.get_models():
        db_table = model._meta.db_table
        ALL_MODELS.append((app_label, model, db_table))


class TestSchemaCompatibility(SimpleTestCase):
    """Property 36: Schema compatibility — managed=False and column mapping.

    For any Django model mapping to one of the 26 existing Neon tables, the
    model should have ``managed = False`` in its Meta class and its db_table
    should match the expected table name.

    **Validates: Requirements 13.1, 13.2**
    """

    # ------------------------------------------------------------------
    # Structural assertions (no randomness needed — exhaustive over models)
    # ------------------------------------------------------------------

    def test_all_26_tables_are_covered(self):
        """Every expected table has a corresponding Django model."""
        expected_tables = set()
        for tables in EXPECTED_TABLE_MAPPING.values():
            expected_tables.update(tables)

        actual_tables = {db_table for _, _, db_table in ALL_MODELS}

        missing = expected_tables - actual_tables
        self.assertEqual(
            missing,
            set(),
            f"Expected tables without a Django model: {sorted(missing)}",
        )

    def test_total_model_count_is_26(self):
        """There should be exactly 26 models across the 5 apps."""
        expected_count = sum(len(t) for t in EXPECTED_TABLE_MAPPING.values())
        self.assertEqual(
            len(ALL_MODELS),
            expected_count,
            f"Expected {expected_count} models, found {len(ALL_MODELS)}: "
            f"{[m.__name__ for _, m, _ in ALL_MODELS]}",
        )

    def test_every_model_has_managed_false(self):
        """Each model must have managed = False in its Meta class."""
        violations = []
        for app_label, model, db_table in ALL_MODELS:
            if model._meta.managed is not False:
                violations.append(
                    f"{app_label}.{model.__name__} (db_table={db_table})"
                )
        self.assertEqual(
            violations,
            [],
            f"Models with managed != False: {violations}",
        )

    def test_every_model_has_db_table_set(self):
        """Each model must have an explicit db_table in Meta."""
        violations = []
        for app_label, model, db_table in ALL_MODELS:
            # Django auto-generates db_table as "app_model" if not set.
            # Our models should NOT use the auto-generated name.
            auto_name = f"{app_label}_{model.__name__.lower()}"
            if db_table == auto_name:
                violations.append(
                    f"{app_label}.{model.__name__} uses auto-generated "
                    f"db_table '{auto_name}' instead of an explicit one"
                )
        self.assertEqual(
            violations,
            [],
            f"Models without explicit db_table: {violations}",
        )

    def test_db_table_values_match_expected(self):
        """Each model's db_table must match one of the expected table names
        for its app."""
        violations = []
        for app_label, model, db_table in ALL_MODELS:
            expected = EXPECTED_TABLE_MAPPING.get(app_label, set())
            if db_table not in expected:
                violations.append(
                    f"{app_label}.{model.__name__}: db_table='{db_table}' "
                    f"not in expected {sorted(expected)}"
                )
        self.assertEqual(
            violations,
            [],
            f"Models with unexpected db_table: {violations}",
        )

    def test_no_extra_models_outside_expected_tables(self):
        """No model should map to a table not in the expected mapping."""
        all_expected = set()
        for tables in EXPECTED_TABLE_MAPPING.values():
            all_expected.update(tables)

        extras = []
        for app_label, model, db_table in ALL_MODELS:
            if db_table not in all_expected:
                extras.append(
                    f"{app_label}.{model.__name__} → '{db_table}'"
                )
        self.assertEqual(
            extras,
            [],
            f"Unexpected models found: {extras}",
        )

    # ------------------------------------------------------------------
    # Property-based: pick any model at random and verify invariants
    # ------------------------------------------------------------------

    @given(idx=st.integers(min_value=0, max_value=max(len(ALL_MODELS) - 1, 0)))
    @settings(max_examples=100)
    def test_random_model_has_managed_false_and_valid_table(self, idx):
        """For any randomly selected model, managed=False and db_table is in
        the expected set for its app."""
        app_label, model, db_table = ALL_MODELS[idx]

        self.assertFalse(
            model._meta.managed,
            f"{app_label}.{model.__name__} should have managed=False",
        )

        expected = EXPECTED_TABLE_MAPPING[app_label]
        self.assertIn(
            db_table,
            expected,
            f"{app_label}.{model.__name__}: db_table='{db_table}' "
            f"not in {sorted(expected)}",
        )
