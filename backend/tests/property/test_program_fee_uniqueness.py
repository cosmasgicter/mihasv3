"""Property-based tests for ProgramFee uniqueness constraint.

# Feature: lenco-payment-integration, Property 8: ProgramFee uniqueness constraint

For any program, fee_type, and residency_category combination, attempting to create
a second active ProgramFee with the same combination should be rejected. Inactive
(soft-deleted) records should not block creation of new active records.

Tests the `perform_create` method of ProgramFeeViewSet which checks for duplicates.

**Validates: Requirements 5.5, 13.6**
"""

import os
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.exceptions import ValidationError  # noqa: E402

from apps.documents.views import ProgramFeeViewSet  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

fee_types = st.sampled_from(["application", "tuition"])
residency_categories = st.sampled_from(["local", "international"])
amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)
currencies = st.sampled_from(["ZMW", "USD"])


# ---------------------------------------------------------------------------
# Helper: invoke perform_create with mocked queryset
# ---------------------------------------------------------------------------


def _invoke_perform_create(program_id, fee_type, residency_category, amount, currency, duplicate_exists):
    """Call ProgramFeeViewSet.perform_create with a mocked serializer and queryset.

    Args:
        duplicate_exists: If True, the queryset filter returns an existing active record.
    """
    viewset = ProgramFeeViewSet()
    viewset.kwargs = {"program_id": program_id}

    # Build a mock serializer whose validated_data returns the given fields
    mock_serializer = MagicMock()
    mock_serializer.validated_data = {
        "fee_type": fee_type,
        "residency_category": residency_category,
        "amount": amount,
        "currency": currency,
    }

    with patch("apps.documents.models.ProgramFee.objects") as mock_qs:
        mock_qs.filter.return_value.exists.return_value = duplicate_exists
        if duplicate_exists:
            # Should raise ValidationError
            try:
                viewset.perform_create(mock_serializer)
                return False  # Should not reach here
            except ValidationError:
                return True  # Correctly rejected
        else:
            viewset.perform_create(mock_serializer)
            # Verify save was called with the program_id and is_active=True
            mock_serializer.save.assert_called_once()
            call_kwargs = mock_serializer.save.call_args[1]
            assert call_kwargs["program_id"] == program_id
            assert call_kwargs["is_active"] is True
            return True


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestProgramFeeUniquenessRejectsDuplicate(SimpleTestCase):
    """When an active ProgramFee already exists for the same (program, fee_type,
    residency_category), perform_create should raise ValidationError.

    **Validates: Requirements 5.5, 13.6**
    """

    @given(
        fee_type=fee_types,
        residency_category=residency_categories,
        amount=amounts,
        currency=currencies,
    )
    @settings(max_examples=100)
    def test_duplicate_active_fee_rejected(self, fee_type, residency_category, amount, currency):
        """For any (program, fee_type, residency_category) where an active record
        already exists, creating a second active record should be rejected."""
        program_id = uuid.uuid4()
        rejected = _invoke_perform_create(
            program_id, fee_type, residency_category, amount, currency,
            duplicate_exists=True,
        )
        self.assertTrue(rejected, "Expected ValidationError for duplicate active fee")


class TestProgramFeeUniquenessAllowsNew(SimpleTestCase):
    """When no active ProgramFee exists for the (program, fee_type,
    residency_category) combination, perform_create should succeed.

    **Validates: Requirements 5.5, 13.6**
    """

    @given(
        fee_type=fee_types,
        residency_category=residency_categories,
        amount=amounts,
        currency=currencies,
    )
    @settings(max_examples=100)
    def test_new_fee_allowed_when_no_duplicate(self, fee_type, residency_category, amount, currency):
        """For any (program, fee_type, residency_category) where no active record
        exists, creating a new active record should succeed."""
        program_id = uuid.uuid4()
        success = _invoke_perform_create(
            program_id, fee_type, residency_category, amount, currency,
            duplicate_exists=False,
        )
        self.assertTrue(success, "Expected perform_create to succeed when no duplicate exists")


class TestInactiveRecordDoesNotBlockCreation(SimpleTestCase):
    """Inactive (soft-deleted) records should not block creation of new active records.

    **Validates: Requirements 5.5, 13.6**
    """

    @given(
        fee_type=fee_types,
        residency_category=residency_categories,
        amount=amounts,
        currency=currencies,
    )
    @settings(max_examples=100)
    def test_inactive_record_does_not_block(self, fee_type, residency_category, amount, currency):
        """When only inactive records exist for the combination, the filter for
        is_active=True returns no results, so creation should succeed."""
        program_id = uuid.uuid4()

        viewset = ProgramFeeViewSet()
        viewset.kwargs = {"program_id": program_id}

        mock_serializer = MagicMock()
        mock_serializer.validated_data = {
            "fee_type": fee_type,
            "residency_category": residency_category,
            "amount": amount,
            "currency": currency,
        }

        with patch("apps.documents.models.ProgramFee.objects") as mock_qs:
            # The filter for is_active=True returns False (inactive records don't count)
            mock_qs.filter.return_value.exists.return_value = False

            viewset.perform_create(mock_serializer)

            # Verify the filter checked is_active=True
            mock_qs.filter.assert_called_once_with(
                program_id=program_id,
                fee_type=fee_type,
                residency_category=residency_category,
                is_active=True,
            )
            # Verify save was called
            mock_serializer.save.assert_called_once()
