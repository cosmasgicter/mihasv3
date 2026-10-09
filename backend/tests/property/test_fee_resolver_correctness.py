"""Property-based tests for FeeResolver correctness.

Updated for admissions-v2 task 5.4 (DATA-05, STU-08): the resolver now sources
fees **only** from canonical ``FeeSchedule`` rows and **fails closed** — it never
falls back to a program-level default or a hardcoded K150/K153 amount, and it
never does a display-name lookup.

Original property (pre-launch-audit Property 14) asserted the now-removed default
fallback; those cases are replaced by fail-closed assertions below.

**Validates: Requirements R7.4, R7.5, R12.2**
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
    FeeConfigurationError,
    FeeResolver,
    ResolvedFee,
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

local_identity = st.fixed_dictionaries({
    "nationality": st.just("Zambian"),
    "country": st.just("Zambia"),
})

international_identity = st.fixed_dictionaries({
    "nationality": st.text(min_size=1, max_size=30).filter(lambda n: n != "Zambian"),
    "country": st.text(min_size=1, max_size=30).filter(lambda c: c not in ("Zambia", "ZM")),
})

identity_for_residency = st.one_of(local_identity, international_identity)


class TestFeeResolverCorrectness(SimpleTestCase):
    """FeeResolver returns the canonical fee and fails closed otherwise.

    **Validates: Requirements R7.4, R7.5, R12.2**
    """

    @given(
        program_code=program_codes,
        identity=identity_for_residency,
        fee_amount=fee_amounts,
        fee_currency=currency_codes,
    )
    @settings(max_examples=5)
    def test_returns_matching_program_fee_when_exists(
        self, program_code, identity, fee_amount, fee_currency
    ):
        """A single active ProgramFee for the offering+residency+application is
        returned exactly (source='program_fee')."""
        resolver = FeeResolver()
        expected_residency = FeeResolver._classify_residency(
            identity["nationality"], identity["country"]
        )

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()

        mock_program_fee = MagicMock()
        mock_program_fee.amount = fee_amount
        mock_program_fee.currency = fee_currency

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.count.return_value = 1
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
    )
    @settings(max_examples=5)
    def test_fails_closed_when_no_active_fee(self, program_code, identity):
        """No active ProgramFee row → FeeConfigurationError (FEE_NOT_CONFIGURED).

        There is NO program-level default and NO hardcoded fallback (DATA-05,
        STU-08). The resolver must fail closed rather than invent an amount.
        """
        resolver = FeeResolver()

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        # A stale program-level application_fee must be ignored entirely.
        mock_program.application_fee = Decimal("999.00")

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.count.return_value = 0
            mock_fee_qs.filter.return_value.first.return_value = None

            with self.assertRaises(FeeConfigurationError) as ctx:
                resolver.resolve_fee(
                    program_code, identity["nationality"], identity["country"]
                )

        self.assertEqual(ctx.exception.code, "FEE_NOT_CONFIGURED")
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertFalse(ctx.exception.retryable)

    @given(
        program_code=program_codes,
        identity=identity_for_residency,
    )
    @settings(max_examples=5)
    def test_ambiguous_active_fees_raise_ambiguity(self, program_code, identity):
        """More than one active ProgramFee → FEE_AMBIGUOUS (409), never a guess."""
        from apps.documents.fee_resolver import AmbiguousFeeError

        resolver = FeeResolver()
        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.count.return_value = 2

            with self.assertRaises(AmbiguousFeeError) as ctx:
                resolver.resolve_fee(
                    program_code, identity["nationality"], identity["country"]
                )

        self.assertEqual(ctx.exception.code, "FEE_AMBIGUOUS")
        self.assertEqual(ctx.exception.status_code, 409)

    @given(program_code=program_codes, identity=identity_for_residency)
    @settings(max_examples=5)
    def test_nonexistent_program_raises_does_not_exist(
        self, program_code, identity
    ):
        """When the identifier matches no active offering by code or id,
        resolve_fee() raises Program.DoesNotExist (no display-name lookup)."""
        from apps.catalog.models import Program

        resolver = FeeResolver()

        with patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs:
            mock_prog_qs.get.side_effect = Program.DoesNotExist

            with self.assertRaises(Program.DoesNotExist):
                resolver.resolve_fee(
                    program_code, identity["nationality"], identity["country"]
                )
