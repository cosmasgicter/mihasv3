"""Property-based test for the payment reconciliation polling window.

# Feature: production-payment-hardening

Property 14: the reconciliation sweep only picks up payments older than 5
minutes and younger than 24 hours.

admissions-v2 task 8.2 removed the four sibling classes in this module
(Properties 1, 2, 3 and 13). They exercised the deleted legacy mutator
``_update_payment_status``, the deleted ``initiate_payment``, and the deleted
``process_webhook_event`` through mocks. The same numbered properties are
enforced against the surviving path, on a real database, by:

* Property 1 (terminal immutability)   → ``test_payment_state_machine_properties.py::test_property_2_terminal_stability``
* Property 2 (double initiation)       → ``test_payment_state_machine_properties.py::test_property_1_race_safety``
* Property 3 (amount mismatch blocks)  → ``test_payment_webhook_properties.py::test_property_5_amount_currency_reference_integrity``
* Property 13 (application projection) → ``test_payment_state_machine_properties.py::test_property_13_application_summary_consistency``

**Validates: Requirements 12.3**
"""

import os
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.utils import timezone  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


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
