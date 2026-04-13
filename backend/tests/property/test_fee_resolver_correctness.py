"""Property-based tests for FeeResolver correctness.

Feature: pre-launch-audit, Property 14: FeeResolver returns correct fees

For any active program and for any residency category (local or international),
FeeResolver.resolve() should return the fee amount matching the program_fees row
for that program, residency, and fee_type='application'. If no fee row exists,
it should fall back to the program's application_fee or the default (153.00 ZMW).

**Validates: Requirements 4.3, 6.6**
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

from apps.documents.fee_resolver import (  # noqa: E402
    FeeResolver,
    ResolvedFee,
    _DEFAULT_APPLICATION_FEE,
    _DEFAULT_CURRENCY,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

fee_amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

currency_codes = st.sampled_from(["ZMW", "USD", "EUR", "GBP", "ZAR"])

program_codes = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=1,
    max_size=20,
)

residency_categories = st.sampled_from(["local", "international"])

# Nationality/country combos that produce a known residency
local_identity = st.fixed_dictionaries({
    "nationality": st.just("Zambian"),
    "country": st.just("Zambia"),
})

international_identity = st.fixed_dictionaries({
    "nationality": st.text(min_size=1, max_size=30).filter(lambda n: n != "Zambian"),
    "country": st.text(min_size=1, max_size=30).filter(lambda c: c not in ("Zambia", "ZM")),
})

identity_for_residency = st.one_of(local_identity, international_identity)


# ---------------------------------------------------------------------------
# Tests — Property 14: FeeResolver returns correct fees
# ---------------------------------------------------------------------------


class TestFeeResolverCorrectness(SimpleTestCase):
    """Property 14: For any active program and residency category,
    FeeResolver.resolve() returns the correct fee amount.

    **Validates: Requirements 4.3, 6.6**
    """

    @given(
        program_code=program_codes,
        identity=identity_for_residency,
        fee_amount=fee_amounts,
        fee_currency=currency_codes,
    )
    @settings(max_examples=100)
    def test_returns_matching_program_fee_when_exists(
        self, program_code, identity, fee_amount, fee_currency
    ):
        """When an active ProgramFee row exists for the program+residency+application,
        resolve_fee() returns that exact amount and currency."""
        resolver = FeeResolver()
        expected_residency = FeeResolver._classify_residency(
            identity["nationality"], identity["country"]
        )

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.application_fee = Decimal("999.00")

        mock_program_fee = MagicMock()
        mock_program_fee.amount = fee_amount
        mock_program_fee.currency = fee_currency

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = mock_program_fee

            result = resolver.resolve_fee(
                program_code, identity["nationality"], identity["country"]
            )

        self.assertIsInstance(result, ResolvedFee)
        self.assertEqual(result.amount, fee_amount)
        self.assertEqual(result.currency, fee_currency)
        self.assertEqual(result.residency_category, expected_residency)
        self.assertEqual(result.source, "program_fee")

    @given(
        program_code=program_codes,
        identity=identity_for_residency,
        fallback_fee=fee_amounts,
    )
    @settings(max_examples=100)
    def test_falls_back_to_program_application_fee(
        self, program_code, identity, fallback_fee
    ):
        """When no ProgramFee row exists, resolve_fee() falls back to
        program.application_fee with currency ZMW."""
        resolver = FeeResolver()
        expected_residency = FeeResolver._classify_residency(
            identity["nationality"], identity["country"]
        )

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.application_fee = fallback_fee

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = None

            result = resolver.resolve_fee(
                program_code, identity["nationality"], identity["country"]
            )

        self.assertIsInstance(result, ResolvedFee)
        self.assertEqual(result.amount, fallback_fee)
        self.assertEqual(result.currency, _DEFAULT_CURRENCY)
        self.assertEqual(result.residency_category, expected_residency)
        self.assertEqual(result.source, "program_default")

    @given(
        program_code=program_codes,
        identity=identity_for_residency,
    )
    @settings(max_examples=100)
    def test_falls_back_to_default_fee_when_no_program_fee(
        self, program_code, identity
    ):
        """When no ProgramFee exists and program.application_fee is None,
        resolve_fee() returns the default 153.00 ZMW."""
        resolver = FeeResolver()
        expected_residency = FeeResolver._classify_residency(
            identity["nationality"], identity["country"]
        )

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.application_fee = None

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = None

            result = resolver.resolve_fee(
                program_code, identity["nationality"], identity["country"]
            )

        self.assertIsInstance(result, ResolvedFee)
        self.assertEqual(result.amount, _DEFAULT_APPLICATION_FEE)
        self.assertEqual(result.currency, _DEFAULT_CURRENCY)
        self.assertEqual(result.residency_category, expected_residency)
        self.assertEqual(result.source, "program_default")

    @given(program_code=program_codes, identity=identity_for_residency)
    @settings(max_examples=100)
    def test_nonexistent_program_raises_does_not_exist(
        self, program_code, identity
    ):
        """When the program code matches no active program, resolve_fee()
        raises Program.DoesNotExist."""
        from apps.catalog.models import Program

        resolver = FeeResolver()

        with patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs:
            mock_prog_qs.get.side_effect = Program.DoesNotExist

            with self.assertRaises(Program.DoesNotExist):
                resolver.resolve_fee(
                    program_code, identity["nationality"], identity["country"]
                )
