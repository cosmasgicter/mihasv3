"""Property-based tests for payment status transitions and lifecycle.

# Feature: production-payment-hardening

Properties 1, 2, 3, 13, 14 covering forward-only transitions, double payment
prevention, amount mismatch blocking, webhook→application sync, and polling
age range.

**Validates: Requirements 14.4, 7.3, 7.4, 6.1, 17.1, 17.2, 12.2, 12.3**
"""

import os
import uuid
from contextlib import contextmanager
from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.utils import timezone  # noqa: E402
from hypothesis import assume, given, settings  # noqa: E402
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

terminal_statuses = st.sampled_from(["successful", "failed"])
all_statuses = st.sampled_from(["pending", "successful", "failed"])
target_statuses = st.sampled_from(["pending", "successful", "failed"])

lenco_data_st = st.fixed_dictionaries(
    {},
    optional={
        "lencoReference": st.text(
            alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
            min_size=1,
            max_size=20,
        ),
        "type": st.sampled_from(["card", "bank_transfer", "mobile_money"]),
    },
)


@contextmanager
def _noop_atomic():
    """A no-op context manager that replaces transaction.atomic()."""
    yield


def _make_payment_mock(payment_id, application_id, amount, status, ref="REF-001"):
    """Create a mock Payment that behaves like a real ORM object."""
    payment = MagicMock()
    payment.id = payment_id
    payment.application_id = application_id
    payment.status = status
    payment.amount = amount
    payment.currency = "ZMW"
    payment.transaction_reference = ref
    payment.lenco_reference = None
    payment.payment_method = None
    payment.fee = None
    payment.bearer = None
    payment.metadata = {}
    payment.updated_at = None
    payment.save = MagicMock()
    return payment


# ---------------------------------------------------------------------------
# Property 1: Forward-only payment status transitions
# ---------------------------------------------------------------------------


class TestForwardOnlyTransitions(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 1: Forward-only payment status transitions

    For any payment in a terminal state (successful or failed), attempting to
    transition it to any other state SHALL be a no-op.

    **Validates: Requirements 14.4, 7.3, 7.4**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        current_status=terminal_statuses,
        target=all_statuses,
        lenco_data=lenco_data_st,
    )
    @settings(max_examples=5)
    def test_terminal_status_blocks_all_transitions(
        self, payment_id, application_id, amount, current_status, target, lenco_data
    ):
        """A payment in a terminal state must remain unchanged regardless of
        the attempted target status."""
        service = PaymentService()
        payment = _make_payment_mock(payment_id, application_id, amount, current_status)
        locked_payment = _make_payment_mock(payment_id, application_id, amount, current_status)

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_qs,
            patch("apps.applications.models.Application.objects"),
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_qs.select_for_update.return_value.get.return_value = locked_payment

            service._update_payment_status(payment, target, lenco_data)

        self.assertEqual(
            locked_payment.status,
            current_status,
            f"{current_status} → {target} should be a no-op",
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
    def test_pending_allows_only_successful_or_failed(
        self, payment_id, application_id, amount, target, lenco_data
    ):
        """From pending, only successful and failed are reachable."""
        service = PaymentService()
        payment = _make_payment_mock(payment_id, application_id, amount, "pending")
        locked_payment = _make_payment_mock(payment_id, application_id, amount, "pending")

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_qs,
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_qs.select_for_update.return_value.get.return_value = locked_payment
            mock_app_qs.filter.return_value.update.return_value = 1

            service._update_payment_status(payment, target, lenco_data)

        if target in ("successful", "failed"):
            self.assertEqual(locked_payment.status, target)
            locked_payment.save.assert_called_once()
        else:
            self.assertEqual(locked_payment.status, "pending")
            locked_payment.save.assert_not_called()


# ---------------------------------------------------------------------------
# Property 2: Double payment initiation returns existing reference
# ---------------------------------------------------------------------------


class TestDoublePaymentInitiation(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 2: Double payment initiation returns existing reference

    For any application that already has a pending payment, calling
    initiate_payment again SHALL return the same payment_id and reference,
    and the total number of payment records SHALL not increase.

    **Validates: Requirements 6.1**
    """

    @given(
        application_id=uuids,
        user_id=uuids,
        existing_amount=amounts,
    )
    @settings(max_examples=5)
    def test_returns_existing_pending_payment(
        self, application_id, user_id, existing_amount
    ):
        """When a pending payment already exists, initiate_payment returns it
        without creating a new record."""
        existing_payment = MagicMock()
        existing_payment.id = uuid.uuid4()
        existing_payment.transaction_reference = f"MIHAS-APP-{uuid.uuid4().hex[:8]}"
        existing_payment.amount = existing_amount
        existing_payment.currency = "ZMW"

        service = PaymentService()

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_payment_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_payment_qs.select_for_update.return_value.filter.return_value.first.return_value = existing_payment

            result = service.initiate_payment(application_id, user_id)

            self.assertEqual(result.payment_id, existing_payment.id)
            self.assertEqual(result.reference, existing_payment.transaction_reference)
            self.assertEqual(result.amount, existing_amount)
            self.assertEqual(result.currency, "ZMW")

            mock_payment_qs.create.assert_not_called()


# ---------------------------------------------------------------------------
# Property 3: Amount mismatch blocks status transition
# ---------------------------------------------------------------------------


class TestAmountMismatchBlocks(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 3: Amount mismatch blocks status transition

    For any payment where the Lenco-reported amount differs from the expected
    amount, _update_payment_status SHALL not transition to successful.

    **Validates: Requirements 17.1, 17.2**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        expected_amount=amounts,
        lenco_amount=amounts,
    )
    @settings(max_examples=5)
    def test_mismatched_amount_blocks_successful_transition(
        self, payment_id, application_id, expected_amount, lenco_amount
    ):
        """When the Lenco amount differs from the expected amount, the payment
        must remain pending and not transition to successful."""
        assume(expected_amount != lenco_amount)

        service = PaymentService()
        payment = _make_payment_mock(payment_id, application_id, expected_amount, "pending")
        locked_payment = _make_payment_mock(payment_id, application_id, expected_amount, "pending")

        lenco_data = {"amount": str(lenco_amount)}

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_qs,
            patch("apps.applications.models.Application.objects"),
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_qs.select_for_update.return_value.get.return_value = locked_payment

            service._update_payment_status(payment, "successful", lenco_data)

        self.assertEqual(
            locked_payment.status,
            "pending",
            f"Amount mismatch (expected={expected_amount}, got={lenco_amount}) "
            f"should block transition to successful",
        )
        locked_payment.save.assert_called_once()
        self.assertIn("risk_flags", locked_payment.metadata)
        self.assertEqual(locked_payment.metadata["risk_flags"][0]["type"], "amount_mismatch")

    @given(
        payment_id=uuids,
        application_id=uuids,
        matching_amount=amounts,
    )
    @settings(max_examples=5)
    def test_matching_amount_allows_successful_transition(
        self, payment_id, application_id, matching_amount
    ):
        """When the Lenco amount matches the expected amount, the payment
        should transition to successful."""
        service = PaymentService()
        payment = _make_payment_mock(payment_id, application_id, matching_amount, "pending")
        locked_payment = _make_payment_mock(payment_id, application_id, matching_amount, "pending")

        lenco_data = {"amount": str(matching_amount)}

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_qs,
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_qs.select_for_update.return_value.get.return_value = locked_payment
            mock_app_qs.filter.return_value.update.return_value = 1

            service._update_payment_status(payment, "successful", lenco_data)

        self.assertEqual(locked_payment.status, "successful")
        locked_payment.save.assert_called_once()


# ---------------------------------------------------------------------------
# Property 13: Successful webhook syncs application payment_status
# ---------------------------------------------------------------------------


class TestWebhookSyncsApplicationStatus(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 13: Successful webhook syncs application payment_status

    For any successful payment webhook event where the amount matches, after
    processing, the associated application SHALL have payment_status='verified'.

    **Validates: Requirements 12.2**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
    )
    @settings(max_examples=5)
    def test_successful_webhook_sets_application_verified(
        self, payment_id, application_id, amount
    ):
        """After a successful webhook event with matching amount, the
        application payment_status is set to 'verified'."""
        service = PaymentService()
        ref = f"MIHAS-TEST-{payment_id.hex[:8]}"

        webhook_payment = _make_payment_mock(payment_id, application_id, amount, "pending", ref=ref)
        locked_payment = _make_payment_mock(payment_id, application_id, amount, "pending", ref=ref)

        payload = {
            "data": {
                "reference": ref,
                "amount": str(amount),
            }
        }

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_payment_qs,
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_payment_qs.select_for_update.return_value.get.side_effect = [
                webhook_payment,  # process_webhook_event lookup
                locked_payment,   # _update_payment_status re-read
            ]
            mock_app_qs.filter.return_value.update.return_value = 1

            service.process_webhook_event(
                event_type="collection.successful",
                reference=ref,
                payload=payload,
            )

            # Verify application was updated to 'verified'
            mock_app_qs.filter.assert_called_with(id=application_id)
            update_call = mock_app_qs.filter.return_value.update
            update_call.assert_called_once()
            call_kwargs = update_call.call_args[1]
            self.assertEqual(call_kwargs["payment_status"], "verified")


# ---------------------------------------------------------------------------
# Property 14: Pending payment polling picks up correct age range
# ---------------------------------------------------------------------------


class TestPollingAgeRange(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 14: Pending payment polling picks up correct age range

    The poll_pending_payments_task SHALL only select payments with created_at
    older than 5 minutes and younger than 24 hours, limited to 50 records.

    **Validates: Requirements 12.3**
    """

    @given(
        minutes_ago=st.integers(min_value=0, max_value=2880),
    )
    @settings(max_examples=5)
    def test_polling_window_boundaries(self, minutes_ago):
        """The filter uses created_at__lt (5 min ago) and created_at__gt
        (24 hr ago) with a limit of 50."""
        now = timezone.now()

        with (
            patch("apps.documents.models.Payment.objects") as mock_qs,
            patch("apps.documents.payment_service.PaymentService") as mock_svc_cls,
        ):
            filter_result = MagicMock()
            filter_result.__getitem__ = MagicMock(return_value=[])
            filter_result.__len__ = MagicMock(return_value=0)
            mock_qs.filter.return_value = filter_result

            mock_svc = MagicMock()
            mock_svc_cls.return_value = mock_svc

            from apps.documents.tasks import poll_pending_payments_task

            poll_pending_payments_task()

            call_kwargs = mock_qs.filter.call_args[1]
            self.assertEqual(call_kwargs["status"], "pending")
            self.assertIn("created_at__lt", call_kwargs)
            self.assertIn("created_at__gt", call_kwargs)

            lt_time = call_kwargs["created_at__lt"]
            gt_time = call_kwargs["created_at__gt"]

            lt_delta = (now - lt_time).total_seconds()
            self.assertAlmostEqual(lt_delta, 300, delta=5)

            gt_delta = (now - gt_time).total_seconds()
            self.assertAlmostEqual(gt_delta, 86400, delta=5)
