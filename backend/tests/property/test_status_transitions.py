"""Property-based tests for forward-only payment status transitions.

# Feature: lenco-payment-integration, Property 12: Forward-only payment status transitions

For any Payment record, status transitions should only move forward:
pending → successful or pending → failed. Attempting to transition from
successful to any other status, or from failed to any other status, should
be a no-op.

**Validates: Requirements 10.5**
"""

import os
from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.documents.payment_service import (  # noqa: E402
    PaymentService,
    _ALLOWED_TRANSITIONS,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

uuids = st.uuids()

amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# All possible statuses in the system
all_statuses = st.sampled_from(["pending", "successful", "failed"])

# Terminal statuses (no transitions allowed out of these)
terminal_statuses = st.sampled_from(["successful", "failed"])

# Statuses that could be attempted as a target
target_statuses = st.sampled_from(["pending", "successful", "failed"])

# Random sequences of attempted transitions (1 to 10 steps)
transition_sequences = st.lists(
    target_statuses,
    min_size=1,
    max_size=10,
)

# Lenco data dicts
lenco_data_st = st.fixed_dictionaries(
    {},
    optional={
        "lencoReference": st.text(
            alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
            min_size=1,
            max_size=20,
        ),
        "type": st.sampled_from(["card", "bank_transfer", "mobile_money"]),
    },
)


def _make_payment(payment_id, application_id, amount, status):
    """Create a mock Payment object with the given status."""
    payment = MagicMock()
    payment.id = payment_id
    payment.application_id = application_id
    payment.status = status
    payment.amount = amount
    payment.currency = "ZMW"
    payment.lenco_reference = None
    payment.payment_method = None
    payment.fee = None
    payment.bearer = None
    payment.metadata = {}
    payment.save = MagicMock()
    return payment


@contextmanager
def _noop_atomic():
    """A no-op context manager that replaces transaction.atomic()."""
    yield


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestForwardOnlyStatusTransitions(SimpleTestCase):
    """Payment status transitions must only move forward.

    **Validates: Requirements 10.5**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        target=target_statuses,
        lenco_data=lenco_data_st,
    )
    @settings(max_examples=5)
    def test_pending_allows_only_successful_or_failed(
        self,
        payment_id,
        application_id,
        amount,
        target,
        lenco_data,
    ):
        """From pending, only transitions to successful or failed are
        allowed. Attempting pending → pending is a no-op."""
        service = PaymentService()
        payment = _make_payment(payment_id, application_id, amount, "pending")
        locked_payment = _make_payment(payment_id, application_id, amount, "pending")

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_payment_qs,
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_payment_qs.select_for_update.return_value.get.return_value = locked_payment
            mock_app_qs.filter.return_value.update.return_value = 1
            service._update_payment_status(payment, target, lenco_data)

        if target in ("successful", "failed"):
            self.assertEqual(
                locked_payment.status,
                target,
                f"pending → {target} should be allowed",
            )
            locked_payment.save.assert_called_once()
        else:
            # pending → pending is not in _ALLOWED_TRANSITIONS targets
            self.assertEqual(
                locked_payment.status,
                "pending",
                f"pending → {target} should be a no-op",
            )
            locked_payment.save.assert_not_called()

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        target=target_statuses,
        lenco_data=lenco_data_st,
    )
    @settings(max_examples=5)
    def test_successful_to_anything_is_noop(
        self,
        payment_id,
        application_id,
        amount,
        target,
        lenco_data,
    ):
        """From successful, any attempted transition is a no-op.
        The status must remain successful and save must not be called."""
        service = PaymentService()
        payment = _make_payment(
            payment_id, application_id, amount, "successful"
        )
        locked_payment = _make_payment(
            payment_id, application_id, amount, "successful"
        )

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_payment_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_payment_qs.select_for_update.return_value.get.return_value = locked_payment
            service._update_payment_status(payment, target, lenco_data)

        self.assertEqual(
            locked_payment.status,
            "successful",
            f"successful → {target} should be a no-op, status must stay 'successful'",
        )
        locked_payment.save.assert_not_called()

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        target=target_statuses,
        lenco_data=lenco_data_st,
    )
    @settings(max_examples=5)
    def test_failed_to_anything_is_noop(
        self,
        payment_id,
        application_id,
        amount,
        target,
        lenco_data,
    ):
        """From failed, any attempted transition is a no-op.
        The status must remain failed and save must not be called."""
        service = PaymentService()
        payment = _make_payment(payment_id, application_id, amount, "failed")
        locked_payment = _make_payment(payment_id, application_id, amount, "failed")

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_payment_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_payment_qs.select_for_update.return_value.get.return_value = locked_payment
            service._update_payment_status(payment, target, lenco_data)

        self.assertEqual(
            locked_payment.status,
            "failed",
            f"failed → {target} should be a no-op, status must stay 'failed'",
        )
        locked_payment.save.assert_not_called()


class TestTransitionSequenceInvariant(SimpleTestCase):
    """After reaching a terminal state, no further transitions should occur.

    **Validates: Requirements 10.5**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        transitions=transition_sequences,
    )
    @settings(max_examples=5)
    def test_random_transition_sequence_respects_forward_only(
        self,
        payment_id,
        application_id,
        amount,
        transitions,
    ):
        """For any random sequence of attempted status transitions starting
        from pending, the payment should transition at most once (to
        successful or failed) and then remain locked in that terminal state
        regardless of further attempts."""
        service = PaymentService()
        payment = _make_payment(payment_id, application_id, amount, "pending")
        locked_payment = _make_payment(payment_id, application_id, amount, "pending")

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_payment_qs,
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_payment_qs.select_for_update.return_value.get.return_value = locked_payment
            mock_app_qs.filter.return_value.update.return_value = 1

            first_terminal = None
            for target in transitions:
                service._update_payment_status(payment, target, {})

                if first_terminal is None and locked_payment.status in (
                    "successful",
                    "failed",
                ):
                    first_terminal = locked_payment.status

            # After all transitions, the payment should be either:
            # - still pending (if no valid transition was attempted)
            # - locked in the first terminal state reached
            if first_terminal is not None:
                self.assertEqual(
                    locked_payment.status,
                    first_terminal,
                    f"After reaching '{first_terminal}', status should not change. "
                    f"Got '{locked_payment.status}' after transitions: {transitions}",
                )
            else:
                self.assertEqual(
                    locked_payment.status,
                    "pending",
                    "If no valid forward transition was attempted, "
                    "status should remain 'pending'",
                )
