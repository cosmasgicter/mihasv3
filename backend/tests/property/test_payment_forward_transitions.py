"""Property-based tests for payment forward-only transitions.

Feature: pre-launch-audit, Property 15: Payment status transitions are forward-only

``PaymentService.verify()`` only moves a payment forward: ``pending`` →
``successful`` / ``failed``. A payment that already reached a terminal status is
returned as-is, without a provider call, so a stale provider answer cannot walk
it backwards.

admissions-v2 task 8.2 retargeted this module from the retired
``verify_payment`` / ``_update_payment_status`` / ``_ALLOWED_TRANSITIONS`` trio
onto the surviving path (``verify`` / ``_transition`` / ``ALLOWED_TRANSITIONS``).
The property is unchanged; only the subject that has to satisfy it survives.

**Validates: Requirements 4.4, 6.2**
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

from apps.documents.payment_service import (  # noqa: E402
    ALLOWED_TRANSITIONS,
    PaymentService,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

uuids = st.uuids(version=4)

amounts = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

terminal_statuses = st.sampled_from(["successful", "expired", "force_approved"])
all_statuses = st.sampled_from(["pending", "successful", "failed"])
target_statuses = st.sampled_from(["successful", "failed", "pending"])

# Sources that carry provider truth. ``super_admin_correction`` is deliberately
# excluded: it is the audited human override that may bypass the matrix.
_PROVIDER_SOURCES = frozenset({"verify", "webhook", "reconciliation", "initiate", "admin_override"})


# ---------------------------------------------------------------------------
# Tests — Property 15: Payment forward-only transitions
# ---------------------------------------------------------------------------


class TestPaymentForwardOnlyTransitions(SimpleTestCase):
    """Property 15: ``PaymentService.verify()`` only allows forward transitions.

    **Validates: Requirements 4.4, 6.2**
    """

    @given(
        payment_id=uuids,
        amount=amounts,
    )
    @settings(max_examples=5)
    def test_already_successful_payment_returns_current_state(
        self, payment_id, amount
    ):
        """When a payment is already 'successful', verify() returns
        the current state without calling Lenco — no backward transition."""
        mock_payment = MagicMock()
        mock_payment.id = payment_id
        mock_payment.status = "successful"
        mock_payment.amount = amount
        mock_payment.currency = "ZMW"
        mock_payment.lenco_reference = "REF-123"
        mock_payment.payment_method = "card"

        with patch("apps.documents.payment_service_mixins._verification.Payment.objects") as mock_qs:
            mock_qs.get.return_value = mock_payment

            service = PaymentService()
            result = service.verify(payment_id)

        self.assertEqual(result.status, "successful")
        self.assertIsNone(result.error)

    @given(
        payment_id=uuids,
        amount=amounts,
    )
    @settings(max_examples=5)
    def test_already_failed_payment_returns_current_state(
        self, payment_id, amount
    ):
        """When a payment is already 'failed', verify() returns
        the current state without calling Lenco — no backward transition."""
        mock_payment = MagicMock()
        mock_payment.id = payment_id
        mock_payment.status = "failed"
        mock_payment.amount = amount
        mock_payment.currency = "ZMW"
        mock_payment.lenco_reference = "REF-456"
        mock_payment.payment_method = "card"

        with patch("apps.documents.payment_service_mixins._verification.Payment.objects") as mock_qs:
            mock_qs.get.return_value = mock_payment

            service = PaymentService()
            result = service.verify(payment_id)

        self.assertEqual(result.status, "failed")
        self.assertIsNone(result.error)

    def test_allowed_transitions_matrix_is_forward_only(self):
        """The canonical matrix never walks a collected payment backwards.

        ``pending`` may still move (that is the whole point of a pending row).
        ``successful`` / ``force_approved`` / ``expired`` may not — no provider
        source can move money that already landed, or un-expire a dead attempt.
        The one apparent exception, ``failed → successful``, is out-of-order
        provider truth (R9.1) and is forward, not backward: it recognises money
        that did arrive after a provisional decline.
        """
        pending_targets = {
            target
            for (source_status, target), sources in ALLOWED_TRANSITIONS.items()
            if source_status == "pending" and sources & _PROVIDER_SOURCES
        }
        self.assertEqual(
            pending_targets,
            {"successful", "failed", "expired", "deferred", "force_approved"},
        )

        for terminal in ("successful", "force_approved", "expired"):
            outbound = {
                target
                for (source_status, target), sources in ALLOWED_TRANSITIONS.items()
                if source_status == terminal and sources & _PROVIDER_SOURCES
            }
            self.assertEqual(
                outbound,
                set(),
                f"{terminal} must have no provider-driven outbound transition; got {outbound}.",
            )

    @given(
        terminal_status=terminal_statuses,
        target=target_statuses,
    )
    @settings(max_examples=5)
    def test_terminal_status_has_no_allowed_transitions(
        self, terminal_status, target
    ):
        """A terminal status has no provider-driven transition to any target."""
        sources = ALLOWED_TRANSITIONS.get((terminal_status, target), set())
        self.assertEqual(sources & _PROVIDER_SOURCES, set())

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        lenco_status=st.sampled_from(["successful", "failed"]),
    )
    @settings(max_examples=5)
    def test_pending_payment_transitions_to_lenco_status(
        self, payment_id, application_id, amount, lenco_status
    ):
        """A pending payment with a valid provider answer moves forward.

        The move is made by ``_transition`` — the sole writer (ADR-007) — with
        the provider's own payload attached, so the integrity gate and the audit
        trail see exactly what the provider said.
        """
        mock_payment = MagicMock()
        mock_payment.id = payment_id
        mock_payment.status = "pending"
        mock_payment.amount = amount
        mock_payment.currency = "ZMW"
        mock_payment.transaction_reference = "TXN-REF-001"
        mock_payment.lenco_reference = None
        mock_payment.payment_method = None
        mock_payment.application_id = application_id

        provider_payload = {
            "status": lenco_status,
            "amount": str(amount),
            "lencoReference": "LENCO-REF",
            "type": "card",
        }

        with (
            patch("apps.documents.payment_service_mixins._verification.Payment.objects") as mock_qs,
            patch("apps.documents.payment_service_mixins._verification._call_lenco_collection_status") as mock_lenco,
            patch("apps.documents.payment_service_mixins._verification.settings") as mock_settings,
            patch.object(PaymentService, "_transition") as mock_transition,
        ):
            mock_settings.LENCO_API_SECRET_KEY = "test-secret"
            mock_settings.LENCO_API_BASE_URL = "https://api.lenco.co"
            mock_qs.get.return_value = mock_payment
            mock_lenco.return_value = (provider_payload, None)
            mock_transition.return_value = MagicMock(risk_flag=None)
            mock_payment.refresh_from_db = MagicMock()

            service = PaymentService()
            service.verify(payment_id)

            mock_transition.assert_called_once()
            args, kwargs = mock_transition.call_args
            self.assertEqual(args[1], lenco_status)
            self.assertEqual(kwargs["source"], "verify")
            self.assertEqual(kwargs["provider_data"], provider_payload)
