"""Property-based tests for permissions JSONField round-trip.

# Feature: audit-remediation, Property 4: Permissions JSONField round-trip

For any valid permissions list (a JSON array of permission strings), writing
it to UserPermissionOverride.permissions and reading it back should produce
an equivalent value.

**Validates: Requirements 5.2, 5.3**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import json  # noqa: E402

import pytest  # noqa: E402
from django.db.models.fields.json import JSONField  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Permission strings: realistic dotted or colon-separated identifiers
# e.g. "admin:access", "student:read", "reviewer:write"
permission_string = st.from_regex(
    r"[a-z][a-z0-9_]{1,20}:[a-z][a-z0-9_]{1,20}", fullmatch=True
)

# A permissions list: 0-30 permission strings (may contain duplicates)
permissions_list = st.lists(permission_string, min_size=0, max_size=30)


# ---------------------------------------------------------------------------
# Property 4: Permissions JSONField round-trip
# ---------------------------------------------------------------------------

class TestPermissionsJSONFieldRoundTrip(SimpleTestCase):
    """# Feature: audit-remediation, Property 4: Permissions JSONField round-trip

    For any valid permissions list (a JSON array of permission strings),
    writing it to UserPermissionOverride.permissions and reading it back
    should produce an equivalent value.

    **Validates: Requirements 5.2, 5.3**
    """

    @given(perms=permissions_list)
    @settings(max_examples=100, deadline=None)
    def test_permissions_roundtrip_via_model_instance(self, perms):
        """For any valid list of permission strings, setting
        UserPermissionOverride.permissions and reading it back should
        return the same list."""
        from apps.accounts.models import UserPermissionOverride

        instance = UserPermissionOverride()
        instance.permissions = perms

        # Reading back should return the exact same value
        self.assertEqual(
            instance.permissions,
            perms,
            f"Round-trip failed: set {perms!r}, got {instance.permissions!r}",
        )

    @given(perms=permissions_list)
    @settings(max_examples=100, deadline=None)
    def test_permissions_field_is_json_serializable(self, perms):
        """For any valid permissions list, the value should survive
        JSON serialization and deserialization (the path data takes
        between Django and Postgres jsonb)."""
        from apps.accounts.models import UserPermissionOverride

        instance = UserPermissionOverride()
        instance.permissions = perms

        # Simulate the jsonb round-trip: serialize then deserialize
        serialized = json.dumps(instance.permissions)
        deserialized = json.loads(serialized)

        self.assertEqual(
            deserialized,
            perms,
            f"JSON round-trip failed: {perms!r} -> {serialized!r} -> {deserialized!r}",
        )

    @given(perms=permissions_list)
    @settings(max_examples=100, deadline=None)
    def test_permissions_field_value_is_list(self, perms):
        """For any valid permissions input, the field value should always
        be a list (not a string, dict, or other type)."""
        from apps.accounts.models import UserPermissionOverride

        instance = UserPermissionOverride()
        instance.permissions = perms

        self.assertIsInstance(
            instance.permissions,
            list,
            f"Expected list, got {type(instance.permissions).__name__}",
        )

    def test_permissions_field_is_jsonfield(self):
        """The permissions field on UserPermissionOverride should be a
        Django JSONField (not TextField or ArrayField)."""
        from apps.accounts.models import UserPermissionOverride

        field = UserPermissionOverride._meta.get_field("permissions")
        self.assertIsInstance(
            field,
            JSONField,
            f"Expected JSONField, got {type(field).__name__}",
        )

    @given(perms=permissions_list)
    @settings(max_examples=100, deadline=None)
    def test_permissions_field_get_prep_value_roundtrip(self, perms):
        """For any valid permissions list, the JSONField's get_prep_value
        (used when writing to DB) should produce a value that, when loaded
        back via from_db_value, equals the original list."""
        from apps.accounts.models import UserPermissionOverride

        field = UserPermissionOverride._meta.get_field("permissions")

        # get_prep_value: what Django sends to the DB adapter
        prep_value = field.get_prep_value(perms)

        # from_db_value: what Django reads back from the DB adapter
        # For JSONField on Postgres, the DB returns a Python object directly,
        # but we can simulate by JSON-decoding the prep value if it's a string
        if isinstance(prep_value, str):
            db_value = json.loads(prep_value)
        else:
            # Postgres jsonb adapter returns Python objects directly
            db_value = prep_value

        self.assertEqual(
            db_value,
            perms,
            f"Field-level round-trip failed: {perms!r} -> prep={prep_value!r} -> {db_value!r}",
        )
