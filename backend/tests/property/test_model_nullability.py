"""Property-based tests for model field nullability alignment.

# Feature: audit-remediation, Property 3: Model fields with NOT NULL DB constraints reject None

For any Django model field that maps to a database column with a NOT NULL
constraint and a default value, the model field should not accept None and
should produce the correct default.  Specifically: Profile.role defaults to
'student' and Payment.status defaults to 'pending'.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**
"""

import os
import uuid
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Realistic email addresses for Profile instances
email_strings = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789",
    min_size=3,
    max_size=20,
).map(lambda s: f"{s}@test.local")

# Positive decimal amounts for Payment instances
payment_amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# Random UUIDs for FK references
random_uuids = st.uuids()


# ---------------------------------------------------------------------------
# Property 3: Model fields with NOT NULL DB constraints reject None
# ---------------------------------------------------------------------------

class TestModelFieldNullability(SimpleTestCase):
    """# Feature: audit-remediation, Property 3: Model fields with NOT NULL DB constraints reject None

    For any Django model field that maps to a database column with a NOT NULL
    constraint and a default value, the model field should not accept None and
    should produce the correct default.

    **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    """

    # --- Profile.role field-level checks ---

    def test_profile_role_field_null_is_false(self):
        """Profile.role field should have null=False (no NULL in DB)."""
        from apps.accounts.models import Profile

        role_field = Profile._meta.get_field("role")
        self.assertFalse(
            role_field.null,
            "Profile.role must have null=False to match DB NOT NULL constraint",
        )

    def test_profile_role_field_default_is_student(self):
        """Profile.role field should default to 'student'."""
        from apps.accounts.models import Profile

        role_field = Profile._meta.get_field("role")
        self.assertEqual(
            role_field.default,
            "student",
            "Profile.role must default to 'student'",
        )

    # --- Payment.status field-level checks ---

    def test_payment_status_field_null_is_false(self):
        """Payment.status field should have null=False (no NULL in DB)."""
        from apps.documents.models import Payment

        status_field = Payment._meta.get_field("status")
        self.assertFalse(
            status_field.null,
            "Payment.status must have null=False to match DB NOT NULL constraint",
        )

    def test_payment_status_field_default_is_pending(self):
        """Payment.status field should default to 'pending'."""
        from apps.documents.models import Payment

        status_field = Payment._meta.get_field("status")
        self.assertEqual(
            status_field.default,
            "pending",
            "Payment.status must default to 'pending'",
        )

    # --- Property tests: defaults hold across random valid inputs ---

    @given(email=email_strings)
    @settings(max_examples=5, deadline=None)
    def test_profile_without_role_defaults_to_student(self, email):
        """For any valid email, constructing a Profile without an explicit
        role should produce an instance with role='student'."""
        from apps.accounts.models import Profile

        profile = Profile(email=email)
        self.assertEqual(
            profile.role,
            "student",
            f"Profile(email={email!r}).role should be 'student', got {profile.role!r}",
        )

    @given(amount=payment_amounts, user_id=random_uuids)
    @settings(max_examples=5, deadline=None)
    def test_payment_without_status_defaults_to_pending(self, amount, user_id):
        """For any valid amount and user_id, constructing a Payment without
        an explicit status should produce an instance with status='pending'."""
        from apps.documents.models import Payment

        payment = Payment(amount=amount, user_id=user_id)
        self.assertEqual(
            payment.status,
            "pending",
            f"Payment(amount={amount}).status should be 'pending', got {payment.status!r}",
        )
