"""Property-based tests for fee resolution correctness.

# Feature: lenco-payment-integration, Property 9: Fee resolution correctness

For any program code and nationality/country combination, the FeeResolver should:
  (a) classify residency as `local` when nationality is `'Zambian'` or country is
      `'Zambia'` or `'ZM'`, and `international` otherwise
  (b) return the matching active ProgramFee amount and currency
  (c) fall back to the program's `application_fee` with currency `ZMW` when no
      ProgramFee exists

**Validates: Requirements 6.1, 6.2, 5.7, 6.5**
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

# Nationalities that should classify as local
LOCAL_NATIONALITIES = st.just("Zambian")

# Countries that should classify as local
LOCAL_COUNTRIES = st.sampled_from(["Zambia", "ZM"])

# Non-local nationalities (anything except 'Zambian')
NON_LOCAL_NATIONALITIES = st.text(min_size=0, max_size=50).filter(
    lambda n: n != "Zambian"
)

# Non-local countries (anything except 'Zambia' and 'ZM')
NON_LOCAL_COUNTRIES = st.text(min_size=0, max_size=50).filter(
    lambda c: c not in ("Zambia", "ZM")
)

# Nullable text for nationality/country fields
nullable_text = st.one_of(st.none(), st.text(min_size=0, max_size=50))

# Positive decimal amounts for fees
fee_amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# Currency codes (3-letter)
currency_codes = st.sampled_from(["ZMW", "USD", "EUR", "GBP", "ZAR"])

# Program codes
program_codes = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=1,
    max_size=20,
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestResidencyClassification(SimpleTestCase):
    """Property 9(a): Residency classification correctness.

    **Validates: Requirements 6.2**
    """

    @given(country=nullable_text)
    @settings(max_examples=5)
    def test_zambian_nationality_always_local(self, country):
        """When nationality is 'Zambian', residency is always 'local'
        regardless of country."""
        result = FeeResolver._classify_residency("Zambian", country)
        self.assertEqual(result, "local")

    @given(nationality=NON_LOCAL_NATIONALITIES)
    @settings(max_examples=5)
    def test_zambia_country_is_local(self, nationality):
        """When country is 'Zambia', residency is 'local' even if nationality
        is not 'Zambian'."""
        result = FeeResolver._classify_residency(nationality, "Zambia")
        self.assertEqual(result, "local")

    @given(nationality=NON_LOCAL_NATIONALITIES)
    @settings(max_examples=5)
    def test_zm_country_code_is_local(self, nationality):
        """When country is 'ZM', residency is 'local' even if nationality
        is not 'Zambian'."""
        result = FeeResolver._classify_residency(nationality, "ZM")
        self.assertEqual(result, "local")

    @given(nationality=NON_LOCAL_NATIONALITIES, country=NON_LOCAL_COUNTRIES)
    @settings(max_examples=5)
    def test_non_zambian_non_zambia_is_international(self, nationality, country):
        """When nationality is not 'Zambian' and country is not 'Zambia'/'ZM',
        residency is 'international'."""
        result = FeeResolver._classify_residency(nationality, country)
        self.assertEqual(result, "international")

    @given(country=NON_LOCAL_COUNTRIES)
    @settings(max_examples=5)
    def test_none_nationality_non_zambia_is_international(self, country):
        """When nationality is None and country is not 'Zambia'/'ZM',
        residency is 'international'."""
        result = FeeResolver._classify_residency(None, country)
        self.assertEqual(result, "international")

    def test_both_none_is_international(self):
        """When both nationality and country are None, residency is
        'international'."""
        result = FeeResolver._classify_residency(None, None)
        self.assertEqual(result, "international")


class TestFeeResolution(SimpleTestCase):
    """Property 9(b,c): Fee resolution returns correct fee source.

    **Validates: Requirements 6.1, 5.7, 6.5**
    """

    @given(
        program_code=program_codes,
        nationality=nullable_text,
        country=nullable_text,
        fee_amount=fee_amounts,
        fee_currency=currency_codes,
    )
    @settings(max_examples=5)
    def test_returns_program_fee_when_exists(
        self, program_code, nationality, country, fee_amount, fee_currency
    ):
        """When an active ProgramFee exists for the resolved residency,
        the resolver returns it with source='program_fee'."""
        resolver = FeeResolver()
        residency = FeeResolver._classify_residency(nationality, country)

        # Mock program lookup
        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.application_fee = Decimal("153.00")

        # Mock ProgramFee record
        mock_program_fee = MagicMock()
        mock_program_fee.amount = fee_amount
        mock_program_fee.currency = fee_currency

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_program_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_program_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = mock_program_fee

            result = resolver.resolve_fee(program_code, nationality, country)

            self.assertIsInstance(result, ResolvedFee)
            self.assertEqual(result.amount, fee_amount)
            self.assertEqual(result.currency, fee_currency)
            self.assertEqual(result.residency_category, residency)
            self.assertEqual(result.source, "program_fee")

            # Verify the filter was called with correct residency
            mock_fee_qs.filter.assert_called_once_with(
                program=mock_program,
                fee_type="application",
                residency_category=residency,
                is_active=True,
            )

    @given(
        program_code=program_codes,
        nationality=nullable_text,
        country=nullable_text,
        fallback_fee=fee_amounts,
    )
    @settings(max_examples=5)
    def test_falls_back_to_program_application_fee(
        self, program_code, nationality, country, fallback_fee
    ):
        """When no active ProgramFee exists, the resolver falls back to
        program.application_fee with currency ZMW and source='program_default'."""
        resolver = FeeResolver()
        residency = FeeResolver._classify_residency(nationality, country)

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.application_fee = fallback_fee

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_program_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_program_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = None

            result = resolver.resolve_fee(program_code, nationality, country)

            self.assertIsInstance(result, ResolvedFee)
            self.assertEqual(result.amount, fallback_fee)
            self.assertEqual(result.currency, _DEFAULT_CURRENCY)
            self.assertEqual(result.residency_category, residency)
            self.assertEqual(result.source, "program_default")

    @given(
        program_code=program_codes,
        nationality=nullable_text,
        country=nullable_text,
    )
    @settings(max_examples=5)
    def test_falls_back_to_default_when_no_application_fee(
        self, program_code, nationality, country
    ):
        """When no ProgramFee exists and program.application_fee is None,
        the resolver falls back to the default fee (153.00 ZMW)."""
        resolver = FeeResolver()
        residency = FeeResolver._classify_residency(nationality, country)

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.application_fee = None

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_program_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_program_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = None

            result = resolver.resolve_fee(program_code, nationality, country)

            self.assertIsInstance(result, ResolvedFee)
            self.assertEqual(result.amount, _DEFAULT_APPLICATION_FEE)
            self.assertEqual(result.currency, _DEFAULT_CURRENCY)
            self.assertEqual(result.residency_category, residency)
            self.assertEqual(result.source, "program_default")
