"""Property-based tests for type mismatch severity classification.

# Feature: pre-launch-audit, Property 3: Type mismatch severity is deterministic

For any pair of (Django field type, Postgres column type), the severity
classification function should return a consistent result: ``breaking`` if the
types are incompatible at runtime, ``cosmetic`` if they are compatible but
imprecise, or ``match`` if they are equivalent.

**Validates: Requirements 1.7**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Type mismatch severity classification
# ---------------------------------------------------------------------------

# Canonical mappings: Django field type → set of exact-match Postgres types
MATCH_MAP: dict[str, set[str]] = {
    "UUIDField": {"uuid"},
    "AutoField": {"integer", "serial", "int4"},
    "BigAutoField": {"bigint", "bigserial", "int8"},
    "CharField": {"character varying", "varchar"},
    "EmailField": {"character varying", "varchar"},
    "TextField": {"text"},
    "BooleanField": {"boolean", "bool"},
    "IntegerField": {"integer", "int4"},
    "SmallIntegerField": {"smallint", "int2"},
    "BigIntegerField": {"bigint", "int8"},
    "DecimalField": {"numeric", "decimal"},
    "FloatField": {"double precision", "float8", "real", "float4"},
    "DateField": {"date"},
    "DateTimeField": {
        "timestamp with time zone",
        "timestamptz",
        "timestamp without time zone",
        "timestamp",
    },
    "TimeField": {
        "time with time zone",
        "timetz",
        "time without time zone",
        "time",
    },
    "JSONField": {"jsonb", "json"},
    "ForeignKey": {"uuid", "integer", "int4", "bigint", "int8"},
    "OneToOneField": {"uuid", "integer", "int4", "bigint", "int8"},
}

# Cosmetic mappings: Django field type → Postgres types that are compatible
# but imprecise (data won't be lost, but the mapping is not exact)
COSMETIC_MAP: dict[str, set[str]] = {
    "CharField": {"text"},
    "EmailField": {"text"},
    "IntegerField": {"bigint", "int8", "smallint", "int2"},
    "SmallIntegerField": {"integer", "int4", "bigint", "int8"},
    "BigIntegerField": {"integer", "int4"},
    "JSONField": {"text"},
    "ForeignKey": {"text", "character varying"},
    "OneToOneField": {"text", "character varying"},
    "BooleanField": {"smallint", "int2", "integer", "int4"},
    "TextField": {"character varying", "varchar"},
}

ALL_DJANGO_FIELD_TYPES = sorted(MATCH_MAP.keys())

# All Postgres types referenced in either map (plus some breaking ones)
ALL_PG_TYPES = sorted(
    {
        "uuid",
        "integer",
        "int4",
        "serial",
        "bigint",
        "int8",
        "bigserial",
        "smallint",
        "int2",
        "character varying",
        "varchar",
        "text",
        "boolean",
        "bool",
        "numeric",
        "decimal",
        "double precision",
        "float8",
        "real",
        "float4",
        "date",
        "timestamp with time zone",
        "timestamptz",
        "timestamp without time zone",
        "timestamp",
        "time with time zone",
        "timetz",
        "time without time zone",
        "time",
        "jsonb",
        "json",
        "text[]",
        "integer[]",
        "bytea",
        "xml",
        "point",
        "inet",
        "cidr",
        "macaddr",
    }
)


def classify_type_mismatch(django_field_type: str, pg_column_type: str) -> str:
    """Classify the severity of a type mismatch between a Django field and a
    Postgres column.

    Returns:
        ``"match"`` — the types are equivalent
        ``"cosmetic"`` — compatible but imprecise
        ``"breaking"`` — incompatible at runtime
    """
    match_types = MATCH_MAP.get(django_field_type, set())
    if pg_column_type in match_types:
        return "match"

    cosmetic_types = COSMETIC_MAP.get(django_field_type, set())
    if pg_column_type in cosmetic_types:
        return "cosmetic"

    return "breaking"


# ---------------------------------------------------------------------------
# Known test pairs for deterministic validation
# ---------------------------------------------------------------------------

KNOWN_MATCH_PAIRS = [
    ("UUIDField", "uuid"),
    ("CharField", "character varying"),
    ("CharField", "varchar"),
    ("TextField", "text"),
    ("BooleanField", "boolean"),
    ("IntegerField", "integer"),
    ("BigIntegerField", "bigint"),
    ("DateField", "date"),
    ("DateTimeField", "timestamp with time zone"),
    ("JSONField", "jsonb"),
    ("DecimalField", "numeric"),
    ("ForeignKey", "uuid"),
    ("ForeignKey", "integer"),
    ("SmallIntegerField", "smallint"),
    ("FloatField", "double precision"),
    ("AutoField", "integer"),
    ("BigAutoField", "bigint"),
    ("EmailField", "character varying"),
    ("OneToOneField", "uuid"),
]

KNOWN_COSMETIC_PAIRS = [
    ("CharField", "text"),
    ("IntegerField", "bigint"),
    ("IntegerField", "smallint"),
    ("SmallIntegerField", "integer"),
    ("JSONField", "text"),
    ("EmailField", "text"),
    ("BigIntegerField", "integer"),
    ("TextField", "character varying"),
]

KNOWN_BREAKING_PAIRS = [
    ("UUIDField", "integer"),
    ("UUIDField", "text"),
    ("JSONField", "text[]"),
    ("BooleanField", "text"),
    ("DateField", "text"),
    ("IntegerField", "uuid"),
    ("DateTimeField", "integer"),
    ("DecimalField", "boolean"),
    ("FloatField", "uuid"),
    ("UUIDField", "bytea"),
]

VALID_SEVERITIES = {"match", "cosmetic", "breaking"}


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

django_field_type_st = st.sampled_from(ALL_DJANGO_FIELD_TYPES)
pg_column_type_st = st.sampled_from(ALL_PG_TYPES)


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestTypeMismatchSeverity(SimpleTestCase):
    """Property 3: Type mismatch severity is deterministic.

    For any pair of (Django field type, Postgres column type), the severity
    classification function should return a consistent result.

    **Validates: Requirements 1.7**
    """

    # ------------------------------------------------------------------
    # Property: determinism — same inputs always produce same output
    # ------------------------------------------------------------------

    @given(
        django_type=django_field_type_st,
        pg_type=pg_column_type_st,
    )
    @settings(max_examples=200)
    def test_classification_is_deterministic(
        self, django_type: str, pg_type: str
    ):
        """For any (django_type, pg_type) pair, calling classify twice must
        return the same result."""
        result1 = classify_type_mismatch(django_type, pg_type)
        result2 = classify_type_mismatch(django_type, pg_type)
        self.assertEqual(
            result1,
            result2,
            f"Non-deterministic: classify({django_type!r}, {pg_type!r}) "
            f"returned {result1!r} then {result2!r}",
        )

    # ------------------------------------------------------------------
    # Property: valid return values
    # ------------------------------------------------------------------

    @given(
        django_type=django_field_type_st,
        pg_type=pg_column_type_st,
    )
    @settings(max_examples=200)
    def test_classification_returns_valid_severity(
        self, django_type: str, pg_type: str
    ):
        """For any (django_type, pg_type) pair, the result must be one of
        'match', 'cosmetic', or 'breaking'."""
        result = classify_type_mismatch(django_type, pg_type)
        self.assertIn(
            result,
            VALID_SEVERITIES,
            f"classify({django_type!r}, {pg_type!r}) returned {result!r}, "
            f"expected one of {VALID_SEVERITIES}",
        )

    # ------------------------------------------------------------------
    # Property: known match pairs always return "match"
    # ------------------------------------------------------------------

    @given(idx=st.integers(min_value=0, max_value=len(KNOWN_MATCH_PAIRS) - 1))
    @settings(max_examples=100)
    def test_known_match_pairs_return_match(self, idx: int):
        """For any known match pair, the classification must be 'match'."""
        django_type, pg_type = KNOWN_MATCH_PAIRS[idx]
        result = classify_type_mismatch(django_type, pg_type)
        self.assertEqual(
            result,
            "match",
            f"Expected 'match' for ({django_type!r}, {pg_type!r}), "
            f"got {result!r}",
        )

    # ------------------------------------------------------------------
    # Property: known breaking pairs always return "breaking"
    # ------------------------------------------------------------------

    @given(
        idx=st.integers(min_value=0, max_value=len(KNOWN_BREAKING_PAIRS) - 1)
    )
    @settings(max_examples=100)
    def test_known_breaking_pairs_return_breaking(self, idx: int):
        """For any known breaking pair, the classification must be
        'breaking'."""
        django_type, pg_type = KNOWN_BREAKING_PAIRS[idx]
        result = classify_type_mismatch(django_type, pg_type)
        self.assertEqual(
            result,
            "breaking",
            f"Expected 'breaking' for ({django_type!r}, {pg_type!r}), "
            f"got {result!r}",
        )

    # ------------------------------------------------------------------
    # Property: known cosmetic pairs always return "cosmetic"
    # ------------------------------------------------------------------

    @given(
        idx=st.integers(
            min_value=0, max_value=len(KNOWN_COSMETIC_PAIRS) - 1
        )
    )
    @settings(max_examples=100)
    def test_known_cosmetic_pairs_return_cosmetic(self, idx: int):
        """For any known cosmetic pair, the classification must be
        'cosmetic'."""
        django_type, pg_type = KNOWN_COSMETIC_PAIRS[idx]
        result = classify_type_mismatch(django_type, pg_type)
        self.assertEqual(
            result,
            "cosmetic",
            f"Expected 'cosmetic' for ({django_type!r}, {pg_type!r}), "
            f"got {result!r}",
        )

    # ------------------------------------------------------------------
    # Structural: match and cosmetic sets are disjoint per field type
    # ------------------------------------------------------------------

    def test_match_and_cosmetic_sets_are_disjoint(self):
        """For every Django field type, the match and cosmetic Postgres type
        sets must not overlap — a type cannot be both an exact match and a
        cosmetic match."""
        for django_type in ALL_DJANGO_FIELD_TYPES:
            match_set = MATCH_MAP.get(django_type, set())
            cosmetic_set = COSMETIC_MAP.get(django_type, set())
            overlap = match_set & cosmetic_set
            self.assertEqual(
                overlap,
                set(),
                f"{django_type}: overlap between match and cosmetic sets: "
                f"{overlap}",
            )

    # ------------------------------------------------------------------
    # Structural: every match pair is covered in MATCH_MAP
    # ------------------------------------------------------------------

    def test_all_known_match_pairs_in_match_map(self):
        """Every known match pair must be present in MATCH_MAP."""
        for django_type, pg_type in KNOWN_MATCH_PAIRS:
            self.assertIn(
                pg_type,
                MATCH_MAP.get(django_type, set()),
                f"({django_type!r}, {pg_type!r}) not in MATCH_MAP",
            )

    # ------------------------------------------------------------------
    # Structural: every known breaking pair is NOT in match or cosmetic
    # ------------------------------------------------------------------

    def test_all_known_breaking_pairs_not_in_maps(self):
        """Every known breaking pair must not appear in MATCH_MAP or
        COSMETIC_MAP."""
        for django_type, pg_type in KNOWN_BREAKING_PAIRS:
            match_set = MATCH_MAP.get(django_type, set())
            cosmetic_set = COSMETIC_MAP.get(django_type, set())
            self.assertNotIn(
                pg_type,
                match_set,
                f"({django_type!r}, {pg_type!r}) found in MATCH_MAP",
            )
            self.assertNotIn(
                pg_type,
                cosmetic_set,
                f"({django_type!r}, {pg_type!r}) found in COSMETIC_MAP",
            )
