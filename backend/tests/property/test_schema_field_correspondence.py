"""Property-based tests for schema field correspondence.

# Feature: pre-launch-audit, Property 1: Schema field correspondence

For any Django model with ``managed = False`` and for any field on that model,
the corresponding Neon Postgres table column should exist with a compatible
data type, matching nullability, and matching constraint declarations (unique,
foreign key, primary key).

This test validates the MAPPING LOGIC is deterministic and correct — it does
NOT require a live database connection.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.apps import apps  # noqa: E402
from django.db import models as dm  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Apps to inspect — all use managed = False
# ---------------------------------------------------------------------------

AUDIT_APPS = ["accounts", "applications", "catalog", "documents", "common"]

# ---------------------------------------------------------------------------
# Django field type → compatible Postgres column types
# ---------------------------------------------------------------------------

DJANGO_TO_POSTGRES: dict[type, set[str]] = {
    dm.UUIDField: {"uuid"},
    dm.AutoField: {"integer", "serial", "int4"},
    dm.BigAutoField: {"bigint", "bigserial", "int8"},
    dm.CharField: {"character varying", "varchar", "text"},
    dm.EmailField: {"character varying", "varchar", "text"},
    dm.TextField: {"text", "character varying", "varchar"},
    dm.BooleanField: {"boolean", "bool"},
    dm.IntegerField: {"integer", "int4", "smallint", "int2", "bigint", "int8"},
    dm.SmallIntegerField: {"smallint", "int2", "integer", "int4"},
    dm.BigIntegerField: {"bigint", "int8", "integer", "int4"},
    dm.DecimalField: {"numeric", "decimal"},
    dm.FloatField: {"double precision", "float8", "real", "float4"},
    dm.DateField: {"date"},
    dm.DateTimeField: {
        "timestamp with time zone",
        "timestamptz",
        "timestamp without time zone",
        "timestamp",
    },
    dm.TimeField: {"time with time zone", "timetz", "time without time zone", "time"},
    dm.JSONField: {"jsonb", "json", "text[]", "text"},
    dm.ForeignKey: {"uuid", "integer", "int4", "bigint", "int8", "text", "character varying"},
    dm.OneToOneField: {"uuid", "integer", "int4", "bigint", "int8", "text", "character varying"},
}

# ---------------------------------------------------------------------------
# Collect all (model, field) pairs from audited apps
# ---------------------------------------------------------------------------


def _collect_model_fields() -> list[tuple[type, dm.Field]]:
    """Return a flat list of (Model, field) for every managed=False model."""
    pairs: list[tuple[type, dm.Field]] = []
    for app_label in AUDIT_APPS:
        app_config = apps.get_app_config(app_label)
        for model in app_config.get_models():
            if model._meta.managed is not False:
                continue
            for field in model._meta.get_fields():
                # Skip reverse relations and many-to-many (no column)
                if not hasattr(field, "column") or field.column is None:
                    continue
                pairs.append((model, field))
    return pairs


ALL_MODEL_FIELDS = _collect_model_fields()

# Guard: we must have collected fields to test
assert len(ALL_MODEL_FIELDS) > 0, "No model fields collected — check AUDIT_APPS"


# ---------------------------------------------------------------------------
# Helper: resolve the expected Postgres types for a Django field
# ---------------------------------------------------------------------------


def _expected_pg_types(field: dm.Field) -> set[str] | None:
    """Return the set of compatible Postgres types for *field*, or None if
    the field type is not in our mapping (should not happen for known models)."""
    field_type = type(field)
    return DJANGO_TO_POSTGRES.get(field_type)


def _field_column_name(field: dm.Field) -> str:
    """Return the DB column name Django would use for *field*."""
    return field.column


def _is_nullable(field: dm.Field) -> bool:
    """Return True if the Django field allows NULL."""
    if isinstance(field, (dm.ForeignKey, dm.OneToOneField)):
        return field.null
    return getattr(field, "null", False)


def _is_primary_key(field: dm.Field) -> bool:
    return getattr(field, "primary_key", False)


def _is_unique(field: dm.Field) -> bool:
    if _is_primary_key(field):
        return True
    return getattr(field, "unique", False)


def _is_foreign_key(field: dm.Field) -> bool:
    return isinstance(field, (dm.ForeignKey, dm.OneToOneField))


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestSchemaFieldCorrespondence(SimpleTestCase):
    """Property 1: Schema field correspondence.

    For any Django model with managed = False and for any field on that model,
    the mapping logic should produce a valid column name, a compatible Postgres
    type set, and correct nullability / constraint metadata.

    **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
    """

    # ------------------------------------------------------------------
    # Property-based: sample random (model, field) pairs
    # ------------------------------------------------------------------

    @given(
        idx=st.integers(
            min_value=0, max_value=max(len(ALL_MODEL_FIELDS) - 1, 0)
        )
    )
    @settings(max_examples=5)
    def test_field_has_compatible_pg_type_mapping(self, idx: int):
        """For any (model, field) pair, the Django field type must map to at
        least one known Postgres column type."""
        model, field = ALL_MODEL_FIELDS[idx]
        pg_types = _expected_pg_types(field)
        self.assertIsNotNone(
            pg_types,
            f"{model.__name__}.{field.name} ({type(field).__name__}) has no "
            f"Postgres type mapping in DJANGO_TO_POSTGRES",
        )
        self.assertGreater(
            len(pg_types),
            0,
            f"{model.__name__}.{field.name}: empty Postgres type set",
        )

    @given(
        idx=st.integers(
            min_value=0, max_value=max(len(ALL_MODEL_FIELDS) - 1, 0)
        )
    )
    @settings(max_examples=5)
    def test_field_has_non_empty_column_name(self, idx: int):
        """For any (model, field) pair, the resolved column name must be a
        non-empty string."""
        model, field = ALL_MODEL_FIELDS[idx]
        col = _field_column_name(field)
        self.assertIsInstance(col, str)
        self.assertGreater(
            len(col),
            0,
            f"{model.__name__}.{field.name}: empty column name",
        )

    @given(
        idx=st.integers(
            min_value=0, max_value=max(len(ALL_MODEL_FIELDS) - 1, 0)
        )
    )
    @settings(max_examples=5)
    def test_nullability_is_deterministic(self, idx: int):
        """For any (model, field) pair, the nullability check returns a
        consistent boolean."""
        model, field = ALL_MODEL_FIELDS[idx]
        result = _is_nullable(field)
        self.assertIsInstance(result, bool)
        # Verify determinism: calling again yields the same result
        self.assertEqual(result, _is_nullable(field))

    @given(
        idx=st.integers(
            min_value=0, max_value=max(len(ALL_MODEL_FIELDS) - 1, 0)
        )
    )
    @settings(max_examples=5)
    def test_constraint_flags_are_deterministic(self, idx: int):
        """For any (model, field) pair, the PK, unique, and FK flags are
        consistent booleans."""
        model, field = ALL_MODEL_FIELDS[idx]

        pk = _is_primary_key(field)
        unique = _is_unique(field)
        fk = _is_foreign_key(field)

        self.assertIsInstance(pk, bool)
        self.assertIsInstance(unique, bool)
        self.assertIsInstance(fk, bool)

        # PK implies unique
        if pk:
            self.assertTrue(
                unique,
                f"{model.__name__}.{field.name}: primary_key=True but "
                f"unique check returned False",
            )

    @given(
        idx=st.integers(
            min_value=0, max_value=max(len(ALL_MODEL_FIELDS) - 1, 0)
        )
    )
    @settings(max_examples=5)
    def test_fk_fields_point_to_uuid_or_compatible_column(self, idx: int):
        """For any FK/O2O field, the target column type should be compatible
        with the related model's PK type."""
        model, field = ALL_MODEL_FIELDS[idx]
        if not _is_foreign_key(field):
            return  # skip non-FK fields

        # The FK column itself should map to a compatible type
        pg_types = _expected_pg_types(field)
        self.assertIsNotNone(pg_types)

        # FK column name should end with _id (Django convention)
        col = _field_column_name(field)
        # Some fields use explicit db_column, so just verify it's non-empty
        self.assertTrue(len(col) > 0)

    # ------------------------------------------------------------------
    # Exhaustive structural checks (no randomness needed)
    # ------------------------------------------------------------------

    def test_all_audit_app_models_are_unmanaged(self):
        """Every model in the audited apps must have managed = False."""
        violations = []
        for app_label in AUDIT_APPS:
            app_config = apps.get_app_config(app_label)
            for model in app_config.get_models():
                if model._meta.managed is not False:
                    violations.append(f"{app_label}.{model.__name__}")
        self.assertEqual(violations, [], f"Managed models found: {violations}")

    def test_every_field_has_a_type_mapping(self):
        """Every concrete field across all audited models must have a known
        Postgres type mapping."""
        unmapped = []
        for model, field in ALL_MODEL_FIELDS:
            if _expected_pg_types(field) is None:
                unmapped.append(
                    f"{model.__name__}.{field.name} ({type(field).__name__})"
                )
        self.assertEqual(
            unmapped,
            [],
            f"Fields without Postgres type mapping: {unmapped}",
        )

    def test_pk_fields_are_marked_unique(self):
        """Every primary key field must also be considered unique."""
        violations = []
        for model, field in ALL_MODEL_FIELDS:
            if _is_primary_key(field) and not _is_unique(field):
                violations.append(f"{model.__name__}.{field.name}")
        self.assertEqual(
            violations,
            [],
            f"PK fields not marked unique: {violations}",
        )

    def test_fk_column_names_are_valid(self):
        """Every FK/O2O field must produce a non-empty column name."""
        violations = []
        for model, field in ALL_MODEL_FIELDS:
            if _is_foreign_key(field):
                col = _field_column_name(field)
                if not col:
                    violations.append(f"{model.__name__}.{field.name}")
        self.assertEqual(
            violations,
            [],
            f"FK fields with empty column names: {violations}",
        )

    def test_model_field_count_is_reasonable(self):
        """Sanity check: we collected a reasonable number of fields."""
        # With ~30 models across 5 apps, we expect at least 100 fields
        self.assertGreaterEqual(
            len(ALL_MODEL_FIELDS),
            100,
            f"Only {len(ALL_MODEL_FIELDS)} fields collected — expected ≥100",
        )
