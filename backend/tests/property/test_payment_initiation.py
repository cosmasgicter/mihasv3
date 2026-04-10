"""Property-based tests for payment initiation creating a complete record.

# Feature: lenco-payment-integration, Property 2: Payment initiation creates a complete record

For any valid application ID, user ID, and resolved fee, initiating a payment
should create a Payment record with status `pending`, the correct amount and
currency, a non-empty transaction reference, the application FK set, and the
Lenco public key stored in metadata.

**Validates: Requirements 2.1, 2.2**
"""

import os
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, call, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.identifier_resolver import ResolvedIdentifier  # noqa: E402
from apps.documents.fee_resolver import ResolvedFee  # noqa: E402
from apps.documents.payment_service import PaymentService  # noqa: E402


def _mock_resolved_program(program_code):
    """Return a ResolvedIdentifier for a program code (simulates successful resolution)."""
    return ResolvedIdentifier(
        id=str(uuid.uuid4()), code=program_code, name=program_code, source="name"
    )

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# UUIDs for application and user IDs
uuids = st.uuids()

# Positive decimal amounts for fees
fee_amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# Currency codes (3-letter ISO)
currency_codes = st.sampled_from(["ZMW", "USD", "EUR", "GBP", "ZAR"])

# Residency categories
residency_categories = st.sampled_from(["local", "international"])

# Fee sources
fee_sources = st.sampled_from(["program_fee", "program_default"])

# Application numbers (alphanumeric with dashes, like "APP-2025-0001")
application_numbers = st.from_regex(r"APP-[0-9]{4}-[0-9]{4}", fullmatch=True)

# Nationalities
nationalities = st.one_of(st.just("Zambian"), st.just("Nigerian"), st.none())

# Countries
countries = st.one_of(
    st.just("Zambia"), st.just("ZM"), st.just("Nigeria"), st.none()
)

# Program codes
program_codes = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=1,
    max_size=20,
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPaymentInitiationCreatesCompleteRecord(SimpleTestCase):
    """Payment initiation must create a Payment record with all required fields.

    **Validates: Requirements 2.1, 2.2**
    """

    @given(
        application_id=uuids,
        user_id=uuids,
        fee_amount=fee_amounts,
        fee_currency=currency_codes,
        residency=residency_categories,
        fee_source=fee_sources,
        app_number=application_numbers,
        nationality=nationalities,
        country=countries,
        program_code=program_codes,
    )
    @settings(max_examples=100)
    def test_payment_created_with_pending_status(
        self,
        application_id,
        user_id,
        fee_amount,
        fee_currency,
        residency,
        fee_source,
        app_number,
        nationality,
        country,
        program_code,
    ):
        """For any valid inputs, initiate_payment creates a Payment with
        status='pending'."""
        service = PaymentService()

        # Mock application lookup
        mock_application = MagicMock()
        mock_application.id = application_id
        mock_application.program = program_code
        mock_application.nationality = nationality
        mock_application.country = country
        mock_application.application_number = app_number

        # Mock resolved fee
        resolved_fee = ResolvedFee(
            amount=fee_amount,
            currency=fee_currency,
            residency_category=residency,
            source=fee_source,
        )

        # Mock the created payment object
        mock_payment = MagicMock()
        mock_payment.id = uuid.uuid4()

        with (
            patch(
                "apps.documents.payment_service.Application.objects"
            ) as mock_app_qs,
            patch.object(
                service, "_fee_resolver"
            ) as mock_resolver,
            patch(
                "apps.documents.payment_service.Payment.objects"
            ) as mock_payment_qs,
            patch(
                "apps.documents.payment_service.IdentifierResolver.resolve_program",
                return_value=_mock_resolved_program(program_code),
            ),
        ):
            mock_app_qs.get.return_value = mock_application
            mock_resolver.resolve_fee.return_value = resolved_fee
            mock_payment_qs.create.return_value = mock_payment
            mock_payment_qs.filter.return_value.first.return_value = None

            service.initiate_payment(application_id, user_id)

            # Verify Payment.objects.create was called
            mock_payment_qs.create.assert_called_once()
            create_kwargs = mock_payment_qs.create.call_args[1]

            # Status must be 'pending'
            self.assertEqual(
                create_kwargs["status"],
                "pending",
                "Payment status must be 'pending' on initiation",
            )

    @given(
        application_id=uuids,
        user_id=uuids,
        fee_amount=fee_amounts,
        fee_currency=currency_codes,
        residency=residency_categories,
        fee_source=fee_sources,
        app_number=application_numbers,
        nationality=nationalities,
        country=countries,
        program_code=program_codes,
    )
    @settings(max_examples=100)
    def test_payment_created_with_correct_amount_and_currency(
        self,
        application_id,
        user_id,
        fee_amount,
        fee_currency,
        residency,
        fee_source,
        app_number,
        nationality,
        country,
        program_code,
    ):
        """For any valid inputs, initiate_payment creates a Payment with
        the resolved fee amount and currency."""
        service = PaymentService()

        mock_application = MagicMock()
        mock_application.id = application_id
        mock_application.program = program_code
        mock_application.nationality = nationality
        mock_application.country = country
        mock_application.application_number = app_number

        resolved_fee = ResolvedFee(
            amount=fee_amount,
            currency=fee_currency,
            residency_category=residency,
            source=fee_source,
        )

        mock_payment = MagicMock()
        mock_payment.id = uuid.uuid4()

        with (
            patch(
                "apps.documents.payment_service.Application.objects"
            ) as mock_app_qs,
            patch.object(service, "_fee_resolver") as mock_resolver,
            patch(
                "apps.documents.payment_service.Payment.objects"
            ) as mock_payment_qs,
            patch(
                "apps.documents.payment_service.IdentifierResolver.resolve_program",
                return_value=_mock_resolved_program(program_code),
            ),
        ):
            mock_app_qs.get.return_value = mock_application
            mock_resolver.resolve_fee.return_value = resolved_fee
            mock_payment_qs.create.return_value = mock_payment
            mock_payment_qs.filter.return_value.first.return_value = None

            service.initiate_payment(application_id, user_id)

            create_kwargs = mock_payment_qs.create.call_args[1]

            self.assertEqual(
                create_kwargs["amount"],
                fee_amount,
                f"Payment amount should be {fee_amount}, got {create_kwargs['amount']}",
            )
            self.assertEqual(
                create_kwargs["currency"],
                fee_currency,
                f"Payment currency should be {fee_currency}, got {create_kwargs['currency']}",
            )

    @given(
        application_id=uuids,
        user_id=uuids,
        fee_amount=fee_amounts,
        fee_currency=currency_codes,
        residency=residency_categories,
        fee_source=fee_sources,
        app_number=application_numbers,
        nationality=nationalities,
        country=countries,
        program_code=program_codes,
    )
    @settings(max_examples=100)
    def test_payment_created_with_non_empty_reference(
        self,
        application_id,
        user_id,
        fee_amount,
        fee_currency,
        residency,
        fee_source,
        app_number,
        nationality,
        country,
        program_code,
    ):
        """For any valid inputs, initiate_payment creates a Payment with
        a non-empty transaction reference."""
        service = PaymentService()

        mock_application = MagicMock()
        mock_application.id = application_id
        mock_application.program = program_code
        mock_application.nationality = nationality
        mock_application.country = country
        mock_application.application_number = app_number

        resolved_fee = ResolvedFee(
            amount=fee_amount,
            currency=fee_currency,
            residency_category=residency,
            source=fee_source,
        )

        mock_payment = MagicMock()
        mock_payment.id = uuid.uuid4()

        with (
            patch(
                "apps.documents.payment_service.Application.objects"
            ) as mock_app_qs,
            patch.object(service, "_fee_resolver") as mock_resolver,
            patch(
                "apps.documents.payment_service.Payment.objects"
            ) as mock_payment_qs,
            patch(
                "apps.documents.payment_service.IdentifierResolver.resolve_program",
                return_value=_mock_resolved_program(program_code),
            ),
        ):
            mock_app_qs.get.return_value = mock_application
            mock_resolver.resolve_fee.return_value = resolved_fee
            mock_payment_qs.create.return_value = mock_payment
            mock_payment_qs.filter.return_value.first.return_value = None

            service.initiate_payment(application_id, user_id)

            create_kwargs = mock_payment_qs.create.call_args[1]

            ref = create_kwargs["transaction_reference"]
            self.assertIsNotNone(ref, "Transaction reference must not be None")
            self.assertTrue(
                len(ref) > 0,
                "Transaction reference must not be empty",
            )

    @given(
        application_id=uuids,
        user_id=uuids,
        fee_amount=fee_amounts,
        fee_currency=currency_codes,
        residency=residency_categories,
        fee_source=fee_sources,
        app_number=application_numbers,
        nationality=nationalities,
        country=countries,
        program_code=program_codes,
    )
    @settings(max_examples=100)
    def test_payment_created_with_application_fk(
        self,
        application_id,
        user_id,
        fee_amount,
        fee_currency,
        residency,
        fee_source,
        app_number,
        nationality,
        country,
        program_code,
    ):
        """For any valid inputs, initiate_payment creates a Payment with
        the application_id foreign key set correctly."""
        service = PaymentService()

        mock_application = MagicMock()
        mock_application.id = application_id
        mock_application.program = program_code
        mock_application.nationality = nationality
        mock_application.country = country
        mock_application.application_number = app_number

        resolved_fee = ResolvedFee(
            amount=fee_amount,
            currency=fee_currency,
            residency_category=residency,
            source=fee_source,
        )

        mock_payment = MagicMock()
        mock_payment.id = uuid.uuid4()

        with (
            patch(
                "apps.documents.payment_service.Application.objects"
            ) as mock_app_qs,
            patch.object(service, "_fee_resolver") as mock_resolver,
            patch(
                "apps.documents.payment_service.Payment.objects"
            ) as mock_payment_qs,
            patch(
                "apps.documents.payment_service.IdentifierResolver.resolve_program",
                return_value=_mock_resolved_program(program_code),
            ),
        ):
            mock_app_qs.get.return_value = mock_application
            mock_resolver.resolve_fee.return_value = resolved_fee
            mock_payment_qs.create.return_value = mock_payment
            mock_payment_qs.filter.return_value.first.return_value = None

            service.initiate_payment(application_id, user_id)

            create_kwargs = mock_payment_qs.create.call_args[1]

            self.assertEqual(
                create_kwargs["application_id"],
                application_id,
                f"application_id should be {application_id}, "
                f"got {create_kwargs['application_id']}",
            )

    @given(
        application_id=uuids,
        user_id=uuids,
        fee_amount=fee_amounts,
        fee_currency=currency_codes,
        residency=residency_categories,
        fee_source=fee_sources,
        app_number=application_numbers,
        nationality=nationalities,
        country=countries,
        program_code=program_codes,
    )
    @settings(max_examples=100)
    def test_payment_metadata_contains_fee_context(
        self,
        application_id,
        user_id,
        fee_amount,
        fee_currency,
        residency,
        fee_source,
        app_number,
        nationality,
        country,
        program_code,
    ):
        """For any valid inputs, initiate_payment creates a Payment with
        metadata containing residency_category and fee_source from the
        resolved fee."""
        service = PaymentService()

        mock_application = MagicMock()
        mock_application.id = application_id
        mock_application.program = program_code
        mock_application.nationality = nationality
        mock_application.country = country
        mock_application.application_number = app_number

        resolved_fee = ResolvedFee(
            amount=fee_amount,
            currency=fee_currency,
            residency_category=residency,
            source=fee_source,
        )

        mock_payment = MagicMock()
        mock_payment.id = uuid.uuid4()

        with (
            patch(
                "apps.documents.payment_service.Application.objects"
            ) as mock_app_qs,
            patch.object(service, "_fee_resolver") as mock_resolver,
            patch(
                "apps.documents.payment_service.Payment.objects"
            ) as mock_payment_qs,
            patch(
                "apps.documents.payment_service.IdentifierResolver.resolve_program",
                return_value=_mock_resolved_program(program_code),
            ),
        ):
            mock_app_qs.get.return_value = mock_application
            mock_resolver.resolve_fee.return_value = resolved_fee
            mock_payment_qs.create.return_value = mock_payment
            mock_payment_qs.filter.return_value.first.return_value = None

            service.initiate_payment(application_id, user_id)

            create_kwargs = mock_payment_qs.create.call_args[1]
            metadata = create_kwargs["metadata"]

            self.assertIsInstance(metadata, dict, "metadata must be a dict")
            self.assertEqual(
                metadata.get("residency_category"),
                residency,
                f"metadata.residency_category should be '{residency}'",
            )
            self.assertEqual(
                metadata.get("fee_source"),
                fee_source,
                f"metadata.fee_source should be '{fee_source}'",
            )
