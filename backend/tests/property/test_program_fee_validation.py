"""Property-based tests for ProgramFee model validation.

# Feature: lenco-payment-integration, Property 7: ProgramFee model validation

For any ProgramFee record, the fee_type must be one of {'application', 'tuition'},
the residency_category must be one of {'local', 'international'}, the currency must
be a 3-letter string, and the amount must be a positive decimal.

Since the model is managed=False, the CHECK constraints live in the SQL migration.
These tests verify the validation rules at the application level by defining a
validate_program_fee() function that mirrors the DB constraints and testing it
against random inputs.

**Validates: Requirements 5.2, 5.3, 5.4**
"""

import os
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.core.exceptions import ValidationError  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Valid value sets (from SQL CHECK constraints)
# ---------------------------------------------------------------------------

VALID_FEE_TYPES = {"application", "tuition"}
VALID_RESIDENCY_CATEGORIES = {"local", "international"}

# ---------------------------------------------------------------------------
# Application-level validation (mirrors DB CHECK constraints)
# ---------------------------------------------------------------------------


def validate_program_fee(
    fee_type: str,
    residency_category: str,
    currency: str,
    amount: Decimal,
) -> list[str]:
    """Validate ProgramFee fields at the application level.

    Returns a list of error messages. Empty list means valid.
    Mirrors the CHECK constraints from the SQL migration:
      - fee_type IN ('application', 'tuition')
      - residency_category IN ('local', 'international')
      - currency is exactly 3 characters
      - amount is positive
    """
    errors = []

    if fee_type not in VALID_FEE_TYPES:
        errors.append(
            f"fee_type must be one of {VALID_FEE_TYPES}, got '{fee_type}'"
        )

    if residency_category not in VALID_RESIDENCY_CATEGORIES:
        errors.append(
            f"residency_category must be one of {VALID_RESIDENCY_CATEGORIES}, "
            f"got '{residency_category}'"
        )

    if not isinstance(currency, str) or len(currency) != 3:
        errors.append(
            f"currency must be a 3-letter string, got '{currency}' "
            f"(length {len(currency) if isinstance(currency, str) else 'N/A'})"
        )

    if amount <= Decimal("0"):
        errors.append(f"amount must be positive, got {amount}")

    return errors


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Valid strategies
valid_fee_types = st.sampled_from(sorted(VALID_FEE_TYPES))
valid_residency_categories = st.sampled_from(sorted(VALID_RESIDENCY_CATEGORIES))
valid_currencies = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    min_size=3,
    max_size=3,
)
valid_amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# Invalid strategies
invalid_fee_types = st.text(min_size=0, max_size=30).filter(
    lambda t: t not in VALID_FEE_TYPES
)
invalid_residency_categories = st.text(min_size=0, max_size=30).filter(
    lambda r: r not in VALID_RESIDENCY_CATEGORIES
)
invalid_currencies = st.text(min_size=0, max_size=10).filter(lambda c: len(c) != 3)
non_positive_amounts = st.one_of(
    st.just(Decimal("0")),
    st.decimals(
        min_value=Decimal("-99999.99"),
        max_value=Decimal("0"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    ),
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestProgramFeeValidValues(SimpleTestCase):
    """Valid ProgramFee field combinations should pass validation.

    **Validates: Requirements 5.2, 5.3, 5.4**
    """

    @given(
        fee_type=valid_fee_types,
        residency_category=valid_residency_categories,
        currency=valid_currencies,
        amount=valid_amounts,
    )
    @settings(max_examples=100)
    def test_valid_fields_produce_no_errors(
        self, fee_type, residency_category, currency, amount
    ):
        """For any valid fee_type, residency_category, currency (3-letter),
        and positive amount, validation should pass with no errors."""
        errors = validate_program_fee(fee_type, residency_category, currency, amount)
        self.assertEqual(
            errors,
            [],
            f"Expected no errors for valid input, got: {errors}",
        )


class TestProgramFeeInvalidFeeType(SimpleTestCase):
    """Invalid fee_type values should be rejected.

    **Validates: Requirements 5.2**
    """

    @given(
        fee_type=invalid_fee_types,
        residency_category=valid_residency_categories,
        currency=valid_currencies,
        amount=valid_amounts,
    )
    @settings(max_examples=100)
    def test_invalid_fee_type_rejected(
        self, fee_type, residency_category, currency, amount
    ):
        """For any fee_type not in {'application', 'tuition'}, validation
        should return an error mentioning fee_type."""
        errors = validate_program_fee(fee_type, residency_category, currency, amount)
        self.assertTrue(
            len(errors) > 0,
            f"Expected validation error for fee_type='{fee_type}'",
        )
        self.assertTrue(
            any("fee_type" in e for e in errors),
            f"Expected fee_type error, got: {errors}",
        )


class TestProgramFeeInvalidResidencyCategory(SimpleTestCase):
    """Invalid residency_category values should be rejected.

    **Validates: Requirements 5.3**
    """

    @given(
        fee_type=valid_fee_types,
        residency_category=invalid_residency_categories,
        currency=valid_currencies,
        amount=valid_amounts,
    )
    @settings(max_examples=100)
    def test_invalid_residency_category_rejected(
        self, fee_type, residency_category, currency, amount
    ):
        """For any residency_category not in {'local', 'international'},
        validation should return an error mentioning residency_category."""
        errors = validate_program_fee(fee_type, residency_category, currency, amount)
        self.assertTrue(
            len(errors) > 0,
            f"Expected validation error for residency_category='{residency_category}'",
        )
        self.assertTrue(
            any("residency_category" in e for e in errors),
            f"Expected residency_category error, got: {errors}",
        )


class TestProgramFeeInvalidCurrency(SimpleTestCase):
    """Invalid currency values should be rejected.

    **Validates: Requirements 5.4**
    """

    @given(
        fee_type=valid_fee_types,
        residency_category=valid_residency_categories,
        currency=invalid_currencies,
        amount=valid_amounts,
    )
    @settings(max_examples=100)
    def test_invalid_currency_rejected(
        self, fee_type, residency_category, currency, amount
    ):
        """For any currency that is not exactly 3 characters,
        validation should return an error mentioning currency."""
        errors = validate_program_fee(fee_type, residency_category, currency, amount)
        self.assertTrue(
            len(errors) > 0,
            f"Expected validation error for currency='{currency}' (len={len(currency)})",
        )
        self.assertTrue(
            any("currency" in e for e in errors),
            f"Expected currency error, got: {errors}",
        )


class TestProgramFeeInvalidAmount(SimpleTestCase):
    """Non-positive amount values should be rejected.

    **Validates: Requirements 5.4**
    """

    @given(
        fee_type=valid_fee_types,
        residency_category=valid_residency_categories,
        currency=valid_currencies,
        amount=non_positive_amounts,
    )
    @settings(max_examples=100)
    def test_non_positive_amount_rejected(
        self, fee_type, residency_category, currency, amount
    ):
        """For any amount that is zero or negative, validation should
        return an error mentioning amount."""
        errors = validate_program_fee(fee_type, residency_category, currency, amount)
        self.assertTrue(
            len(errors) > 0,
            f"Expected validation error for amount={amount}",
        )
        self.assertTrue(
            any("amount" in e for e in errors),
            f"Expected amount error, got: {errors}",
        )
