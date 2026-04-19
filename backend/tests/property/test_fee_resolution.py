"""Property-based tests for fee resolution and duplicate fee rejection.

# Feature: production-payment-hardening

Properties 6 and 11 covering fee resolution correctness with fallback chain
and duplicate active program fee rejection.

**Validates: Requirements 12.4, 15.1, 15.2, 15.3, 3.6**
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

# Nationalities/countries that classify as local
local_nationalities = st.just("Zambian")
local_countries = st.sampled_from(["Zambia", "ZM"])

# Non-local values
non_local_nationalities = st.text(min_size=1, max_size=50).filter(
    lambda n: n != "Zambian"
)
non_local_countries = st.text(min_size=1, max_size=50).filter(
    lambda c: c not in ("Zambia", "ZM")
)

nullable_text = st.one_of(st.none(), st.text(min_size=0, max_size=50))

residency_categories = st.sampled_from(["local", "international"])
fee_types = st.sampled_from(["application", "tuition"])


# ---------------------------------------------------------------------------
# Property 6: Fee resolution correctness with fallback chain
# ---------------------------------------------------------------------------


class TestFeeResolutionResidencyClassification(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 6: Fee resolution correctness with fallback chain

    Part (a): Residency classification.

    **Validates: Requirements 15.3**
    """

    @given(country=nullable_text)
    @settings(max_examples=5)
    def test_zambian_nationality_always_local(self, country):
        """Nationality 'Zambian' → local regardless of country."""
        result = FeeResolver._classify_residency("Zambian", country)
        self.assertEqual(result, "local")

    @given(nationality=non_local_nationalities)
    @settings(max_examples=5)
    def test_zambia_country_is_local(self, nationality):
        """Country 'Zambia' → local even if nationality is not Zambian."""
        result = FeeResolver._classify_residency(nationality, "Zambia")
        self.assertEqual(result, "local")

    @given(nationality=non_local_nationalities)
    @settings(max_examples=5)
    def test_zm_country_code_is_local(self, nationality):
        """Country 'ZM' → local even if nationality is not Zambian."""
        result = FeeResolver._classify_residency(nationality, "ZM")
        self.assertEqual(result, "local")

    @given(nationality=non_local_nationalities, country=non_local_countries)
    @settings(max_examples=5)
    def test_non_zambian_non_zambia_is_international(self, nationality, country):
        """Non-Zambian nationality + non-Zambia country → international."""
        result = FeeResolver._classify_residency(nationality, country)
        self.assertEqual(result, "international")


class TestFeeResolutionFallbackChain(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 6: Fee resolution correctness with fallback chain

    Parts (b), (c), (d): ProgramFee → program.application_fee → K153 default.

    **Validates: Requirements 12.4, 15.1, 15.2**
    """

    @given(
        program_code=program_codes,
        nationality=nullable_text,
        country=nullable_text,
        fee_amount=fee_amounts,
        fee_currency=currency_codes,
    )
    @settings(max_examples=5)
    def test_returns_program_fee_when_active_exists(
        self, program_code, nationality, country, fee_amount, fee_currency
    ):
        """When an active ProgramFee exists, it is returned with source='program_fee'."""
        resolver = FeeResolver()
        residency = FeeResolver._classify_residency(nationality, country)

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.application_fee = Decimal("153.00")

        mock_program_fee = MagicMock()
        mock_program_fee.amount = fee_amount
        mock_program_fee.currency = fee_currency

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = mock_program_fee

            result = resolver.resolve_fee(program_code, nationality, country)

        self.assertEqual(result.amount, fee_amount)
        self.assertEqual(result.currency, fee_currency)
        self.assertEqual(result.residency_category, residency)
        self.assertEqual(result.source, "program_fee")

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
        """When no ProgramFee exists, falls back to program.application_fee
        with currency ZMW."""
        resolver = FeeResolver()
        residency = FeeResolver._classify_residency(nationality, country)

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.application_fee = fallback_fee

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = None

            result = resolver.resolve_fee(program_code, nationality, country)

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
    def test_falls_back_to_k153_default(
        self, program_code, nationality, country
    ):
        """When no ProgramFee and program.application_fee is None, falls back
        to K153.00 ZMW."""
        resolver = FeeResolver()
        residency = FeeResolver._classify_residency(nationality, country)

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.application_fee = None

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = None

            result = resolver.resolve_fee(program_code, nationality, country)

        self.assertEqual(result.amount, _DEFAULT_APPLICATION_FEE)
        self.assertEqual(result.currency, _DEFAULT_CURRENCY)
        self.assertEqual(result.residency_category, residency)
        self.assertEqual(result.source, "program_default")


# ---------------------------------------------------------------------------
# Property 11: Duplicate active program fee rejection
# ---------------------------------------------------------------------------


class TestDuplicateActiveProgramFeeRejection(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 11: Duplicate active program fee rejection

    For any program, fee_type, and residency_category combination that already
    has an active ProgramFee record, attempting to create another active fee
    with the same combination SHALL return a validation error.

    **Validates: Requirements 3.6**
    """

    @given(
        fee_type=fee_types,
        residency_category=residency_categories,
        amount=fee_amounts,
        currency=currency_codes,
    )
    @settings(max_examples=5)
    def test_duplicate_active_fee_raises_validation_error(
        self, fee_type, residency_category, amount, currency
    ):
        """ProgramFeeViewSet.perform_create raises ValidationError when a
        duplicate active fee exists."""
        from apps.documents.views import ProgramFeeViewSet

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

        with patch("apps.documents.views.ProgramFee.objects") as mock_fee_qs:
            # Simulate an existing active fee
            mock_fee_qs.filter.return_value.exists.return_value = True

            from rest_framework.exceptions import ValidationError

            with self.assertRaises(ValidationError) as ctx:
                viewset.perform_create(mock_serializer)

            # Verify the filter checked for the correct combination
            mock_fee_qs.filter.assert_called_once_with(
                program_id=program_id,
                fee_type=fee_type,
                residency_category=residency_category,
                is_active=True,
            )

    @given(
        fee_type=fee_types,
        residency_category=residency_categories,
        amount=fee_amounts,
        currency=currency_codes,
    )
    @settings(max_examples=5)
    def test_unique_fee_creation_succeeds(
        self, fee_type, residency_category, amount, currency
    ):
        """ProgramFeeViewSet.perform_create succeeds when no duplicate exists."""
        from apps.documents.views import ProgramFeeViewSet

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

        with patch("apps.documents.views.ProgramFee.objects") as mock_fee_qs:
            mock_fee_qs.filter.return_value.exists.return_value = False

            viewset.perform_create(mock_serializer)

            # Verify serializer.save was called
            mock_serializer.save.assert_called_once()
            save_kwargs = mock_serializer.save.call_args[1]
            self.assertEqual(save_kwargs["program_id"], program_id)
            self.assertTrue(save_kwargs["is_active"])
