"""Property-based tests for payment-fee matching.

# Feature: pre-launch-audit, Property 5: Payment amount matches program fee

For any payment record linked to an application, the payment amount should
equal the program_fees amount for that program and residency category
(local or international) with fee_type = 'application'.

This test validates the MATCHING LOGIC between payment amounts and program
fees — it does NOT require a live database connection.

**Validates: Requirements 2.3**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from dataclasses import dataclass  # noqa: E402
from decimal import Decimal  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import assume, given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Data structures representing the payment-fee relationship
# ---------------------------------------------------------------------------

VALID_RESIDENCY_CATEGORIES = ("local", "international")
VALID_FEE_TYPES = ("application", "tuition")


@dataclass(frozen=True)
class ProgramFeeRecord:
    """A program fee configuration row."""

    program_id: str
    fee_type: str  # 'application' or 'tuition'
    residency_category: str  # 'local' or 'international'
    amount: Decimal
    is_active: bool


@dataclass(frozen=True)
class PaymentRecord:
    """A payment record linked to an application."""

    payment_id: str
    application_id: str
    program_code: str
    residency_category: str
    amount: Decimal


# ---------------------------------------------------------------------------
# Payment-fee matching logic (pure, no DB)
# ---------------------------------------------------------------------------


def lookup_expected_fee(
    program_code: str,
    residency_category: str,
    fee_table: list[ProgramFeeRecord],
) -> Decimal | None:
    """Look up the expected application fee for a program + residency.

    Returns the fee amount if found, or None if no matching active fee exists.
    """
    for fee in fee_table:
        if (
            fee.program_id == program_code
            and fee.fee_type == "application"
            and fee.residency_category == residency_category
            and fee.is_active
        ):
            return fee.amount
    return None


def check_payment_fee_match(
    payment: PaymentRecord,
    fee_table: list[ProgramFeeRecord],
) -> tuple[bool, str]:
    """Check if a payment amount matches the expected program fee.

    Returns (True, "") if matched, or (False, reason) if mismatched.
    """
    expected = lookup_expected_fee(
        payment.program_code, payment.residency_category, fee_table
    )
    if expected is None:
        return False, f"No active application fee for program={payment.program_code}, residency={payment.residency_category}"
    if payment.amount != expected:
        return False, f"Payment amount {payment.amount} != expected fee {expected}"
    return True, ""


def find_mismatched_payments(
    payments: list[PaymentRecord],
    fee_table: list[ProgramFeeRecord],
) -> list[tuple[PaymentRecord, str]]:
    """Return all payments that don't match their expected program fee."""
    mismatches = []
    for payment in payments:
        matched, reason = check_payment_fee_match(payment, fee_table)
        if not matched:
            mismatches.append((payment, reason))
    return mismatches


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

decimal_amount_st = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

program_code_st = st.sampled_from(["PROG-001", "PROG-002", "PROG-003", "PROG-004", "PROG-005"])
residency_st = st.sampled_from(VALID_RESIDENCY_CATEGORIES)
uuid_st = st.uuids().map(str)


def program_fee_st() -> st.SearchStrategy[ProgramFeeRecord]:
    return st.builds(
        ProgramFeeRecord,
        program_id=program_code_st,
        fee_type=st.just("application"),
        residency_category=residency_st,
        amount=decimal_amount_st,
        is_active=st.just(True),
    )


def fee_table_st(
    min_size: int = 1, max_size: int = 10
) -> st.SearchStrategy[list[ProgramFeeRecord]]:
    return st.lists(program_fee_st(), min_size=min_size, max_size=max_size)


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestPaymentFeeMatching(SimpleTestCase):
    """Property 5: Payment amount matches program fee.

    For any payment record linked to an application, the payment amount
    should equal the program_fees amount for that program and residency.

    **Validates: Requirements 2.3**
    """

    # ------------------------------------------------------------------
    # Property: matching amount always passes
    # ------------------------------------------------------------------

    @given(
        fee=program_fee_st(),
        payment_id=uuid_st,
        app_id=uuid_st,
    )
    @settings(max_examples=200)
    def test_matching_payment_passes(
        self, fee: ProgramFeeRecord, payment_id: str, app_id: str
    ):
        """For any payment whose amount equals the program fee, the match
        check should return True."""
        payment = PaymentRecord(
            payment_id=payment_id,
            application_id=app_id,
            program_code=fee.program_id,
            residency_category=fee.residency_category,
            amount=fee.amount,
        )
        matched, reason = check_payment_fee_match(payment, [fee])
        self.assertTrue(
            matched,
            f"Payment {payment.amount} should match fee {fee.amount}: {reason}",
        )

    # ------------------------------------------------------------------
    # Property: mismatched amount always fails
    # ------------------------------------------------------------------

    @given(
        fee=program_fee_st(),
        wrong_amount=decimal_amount_st,
        payment_id=uuid_st,
        app_id=uuid_st,
    )
    @settings(max_examples=200)
    def test_mismatched_payment_fails(
        self,
        fee: ProgramFeeRecord,
        wrong_amount: Decimal,
        payment_id: str,
        app_id: str,
    ):
        """For any payment whose amount differs from the program fee, the
        match check should return False."""
        assume(wrong_amount != fee.amount)
        payment = PaymentRecord(
            payment_id=payment_id,
            application_id=app_id,
            program_code=fee.program_id,
            residency_category=fee.residency_category,
            amount=wrong_amount,
        )
        matched, reason = check_payment_fee_match(payment, [fee])
        self.assertFalse(
            matched,
            f"Payment {payment.amount} should NOT match fee {fee.amount}",
        )
        self.assertIn("!=", reason)

    # ------------------------------------------------------------------
    # Property: missing fee config always fails
    # ------------------------------------------------------------------

    @given(
        program_code=program_code_st,
        residency=residency_st,
        amount=decimal_amount_st,
        payment_id=uuid_st,
        app_id=uuid_st,
    )
    @settings(max_examples=200)
    def test_missing_fee_config_fails(
        self,
        program_code: str,
        residency: str,
        amount: Decimal,
        payment_id: str,
        app_id: str,
    ):
        """When no fee configuration exists for the program+residency, the
        match check should return False."""
        payment = PaymentRecord(
            payment_id=payment_id,
            application_id=app_id,
            program_code=program_code,
            residency_category=residency,
            amount=amount,
        )
        # Empty fee table
        matched, reason = check_payment_fee_match(payment, [])
        self.assertFalse(
            matched,
            f"Payment should fail with empty fee table",
        )
        self.assertIn("No active application fee", reason)

    # ------------------------------------------------------------------
    # Property: find_mismatched_payments returns correct results
    # ------------------------------------------------------------------

    @given(data=st.data())
    @settings(max_examples=100)
    def test_find_mismatched_payments_correctness(self, data: st.DataObject):
        """find_mismatched_payments should return exactly the payments that
        don't match their expected fee."""
        # Build a fee table with unique (program, residency) combos to avoid
        # ambiguity from duplicate entries with different amounts.
        fee_configs = [
            ("PROG-001", "local"),
            ("PROG-002", "international"),
            ("PROG-003", "local"),
        ]
        fees = []
        for prog, res in fee_configs:
            amount = data.draw(decimal_amount_st)
            fees.append(ProgramFeeRecord(prog, "application", res, amount, True))

        payments: list[PaymentRecord] = []
        expected_match_count = 0
        expected_mismatch_count = 0

        # Create matching payments (amount == fee amount)
        for fee in fees:
            pid = data.draw(uuid_st)
            aid = data.draw(uuid_st)
            payments.append(
                PaymentRecord(pid, aid, fee.program_id, fee.residency_category, fee.amount)
            )
            expected_match_count += 1

        # Create mismatched payments
        num_bad = data.draw(st.integers(min_value=0, max_value=3))
        for _ in range(num_bad):
            pid = data.draw(uuid_st)
            aid = data.draw(uuid_st)
            fee = data.draw(st.sampled_from(fees))
            bad_amount = data.draw(decimal_amount_st)
            if bad_amount != fee.amount:
                expected_mismatch_count += 1
                payments.append(
                    PaymentRecord(pid, aid, fee.program_id, fee.residency_category, bad_amount)
                )

        mismatches = find_mismatched_payments(payments, fees)
        self.assertEqual(
            len(mismatches),
            expected_mismatch_count,
            f"Expected {expected_mismatch_count} mismatches, got {len(mismatches)}",
        )

    # ------------------------------------------------------------------
    # Property: lookup respects residency category
    # ------------------------------------------------------------------

    @given(amount_local=decimal_amount_st, amount_intl=decimal_amount_st)
    @settings(max_examples=100)
    def test_lookup_respects_residency(
        self, amount_local: Decimal, amount_intl: Decimal
    ):
        """When a program has different fees for local and international,
        lookup should return the correct fee for each residency."""
        assume(amount_local != amount_intl)
        fee_table = [
            ProgramFeeRecord("PROG-001", "application", "local", amount_local, True),
            ProgramFeeRecord("PROG-001", "application", "international", amount_intl, True),
        ]
        self.assertEqual(
            lookup_expected_fee("PROG-001", "local", fee_table),
            amount_local,
        )
        self.assertEqual(
            lookup_expected_fee("PROG-001", "international", fee_table),
            amount_intl,
        )

    # ------------------------------------------------------------------
    # Structural: inactive fees are ignored
    # ------------------------------------------------------------------

    def test_inactive_fee_is_ignored(self):
        """An inactive fee record should not be returned by lookup."""
        fee = ProgramFeeRecord("PROG-001", "application", "local", Decimal("153.00"), False)
        result = lookup_expected_fee("PROG-001", "local", [fee])
        self.assertIsNone(result)

    def test_tuition_fee_is_not_matched_for_application(self):
        """A tuition fee should not match when looking for application fees."""
        fee = ProgramFeeRecord("PROG-001", "tuition", "local", Decimal("5000.00"), True)
        result = lookup_expected_fee("PROG-001", "local", [fee])
        self.assertIsNone(result)
