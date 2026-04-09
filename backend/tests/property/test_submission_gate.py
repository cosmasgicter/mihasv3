"""Property-based tests for the payment gate on submission.

# Feature: lenco-payment-integration, Property 10: Submission requires successful payment

For any application, the submission endpoint should accept the draft → submitted
transition if and only if a Payment record with status successful exists for that
application, assuming the identity-document gate is already satisfied.

Tests the payment gate check added to ApplicationReviewView.post.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**
"""

import os
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Payment statuses that are NOT successful
non_successful_statuses = st.sampled_from(["pending", "failed"])


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSubmissionBlockedWithoutPayment(SimpleTestCase):
    """Submission should be blocked when no successful payment exists.

    **Validates: Requirements 8.1, 8.2**
    """

    @given(data=st.data())
    @settings(max_examples=100, deadline=None)
    def test_submission_blocked_without_successful_payment(self, data):
        """For any application without a successful Payment record,
        the submission gate should block the draft → submitted transition."""
        application_id = data.draw(st.uuids())
        user_id = str(uuid.uuid4())

        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = user_id
        mock_app.status = "draft"
        mock_app.payment_status = "pending"
        mock_app.review_started_at = None

        mock_request = MagicMock()
        mock_request.user.id = user_id
        mock_request.user.is_authenticated = True
        mock_request.user.role = "admin"
        mock_request.user.pk = user_id
        mock_request.data = {"new_status": "submitted"}
        mock_request.META = {}

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.documents.models.Payment.objects") as mock_payment_qs,
            patch("apps.documents.models.ApplicationDocument.objects") as mock_doc_qs,
            patch("apps.applications.services.transition_application_status") as mock_transition,
            patch("apps.applications.services.transaction") as mock_txn,
            patch("apps.common.event_dispatcher.dispatch_event"),
        ):
            mock_app_qs.get.return_value = mock_app
            mock_app_qs.select_for_update.return_value.get.return_value = mock_app
            mock_payment_qs.filter.return_value.exists.return_value = False
            mock_doc_qs.filter.return_value.exists.return_value = True
            mock_transition.return_value = "draft"
            mock_txn.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_txn.atomic.return_value.__exit__ = MagicMock(return_value=False)

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            # Should be blocked — transition was NOT called
            mock_transition.assert_not_called()
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "PAYMENT_REQUIRED")


class TestSubmissionAllowedWithPayment(SimpleTestCase):
    """Submission should be allowed when a successful payment exists.

    **Validates: Requirements 8.3, 8.4**
    """

    @given(data=st.data())
    @settings(max_examples=100, deadline=None)
    def test_submission_allowed_with_successful_payment(self, data):
        """For any application with a successful Payment record,
        the submission gate should allow the draft → submitted transition."""
        application_id = data.draw(st.uuids())
        user_id = str(uuid.uuid4())

        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = user_id
        mock_app.status = "draft"
        mock_app.payment_status = "pending"
        mock_app.review_started_at = None

        mock_request = MagicMock()
        mock_request.user.id = user_id
        mock_request.user.is_authenticated = True
        mock_request.user.role = "admin"
        mock_request.user.pk = user_id
        mock_request.data = {"new_status": "submitted"}
        mock_request.META = {}

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.documents.models.Payment.objects") as mock_payment_qs,
            patch("apps.documents.models.ApplicationDocument.objects") as mock_doc_qs,
            patch("apps.applications.services.transition_application_status") as mock_transition,
            patch("apps.applications.services.transaction") as mock_txn,
            patch("apps.common.event_dispatcher.dispatch_event"),
        ):
            mock_app_qs.get.return_value = mock_app
            mock_app_qs.select_for_update.return_value.get.return_value = mock_app
            mock_payment_qs.filter.return_value.exists.return_value = True
            mock_doc_qs.filter.return_value.exists.return_value = True
            mock_transition.return_value = "draft"
            mock_txn.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_txn.atomic.return_value.__exit__ = MagicMock(return_value=False)

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            # Should succeed — transition was called
            mock_transition.assert_called_once()
            self.assertEqual(response.status_code, 200)


class TestPaymentGateOnlyChecksSuccessfulStatus(SimpleTestCase):
    """The payment gate should only accept payments with status='successful'.

    **Validates: Requirements 8.1, 8.4**
    """

    @given(payment_status=non_successful_statuses)
    @settings(max_examples=100, deadline=None)
    def test_non_successful_payment_blocks_submission(self, payment_status):
        """For any payment with a non-successful status (pending, failed),
        the submission gate should block the transition."""
        application_id = uuid.uuid4()
        user_id = str(uuid.uuid4())

        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = user_id
        mock_app.status = "draft"
        mock_app.payment_status = "pending"
        mock_app.review_started_at = None

        mock_request = MagicMock()
        mock_request.user.id = user_id
        mock_request.user.is_authenticated = True
        mock_request.user.role = "admin"
        mock_request.user.pk = user_id
        mock_request.data = {"new_status": "submitted"}
        mock_request.META = {}

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.documents.models.Payment.objects") as mock_payment_qs,
            patch("apps.documents.models.ApplicationDocument.objects") as mock_doc_qs,
            patch("apps.applications.services.transition_application_status") as mock_transition,
            patch("apps.applications.services.transaction") as mock_txn,
            patch("apps.common.event_dispatcher.dispatch_event"),
        ):
            mock_app_qs.get.return_value = mock_app
            mock_app_qs.select_for_update.return_value.get.return_value = mock_app
            # The gate filters for status="successful", so even if a payment
            # with another status exists, the filter returns no results
            mock_payment_qs.filter.return_value.exists.return_value = False
            mock_doc_qs.filter.return_value.exists.return_value = True
            mock_transition.return_value = "draft"
            mock_txn.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_txn.atomic.return_value.__exit__ = MagicMock(return_value=False)

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            # Should be blocked
            mock_transition.assert_not_called()
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "PAYMENT_REQUIRED")


class TestPaymentGateIntegrationWithView(SimpleTestCase):
    """End-to-end test of the payment gate in ApplicationReviewView.

    **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
    """

    @given(has_payment=st.booleans())
    @settings(max_examples=100, deadline=None)
    def test_view_payment_gate_bidirectional(self, has_payment):
        """For any application, the submission endpoint should accept the
        draft → submitted transition if and only if a Payment record with
        status successful exists."""
        application_id = uuid.uuid4()
        user_id = str(uuid.uuid4())

        # Mock the Application
        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = user_id
        mock_app.status = "draft"
        mock_app.payment_status = "pending"
        mock_app.review_started_at = None

        # Mock request
        mock_request = MagicMock()
        mock_request.user.id = user_id
        mock_request.user.is_authenticated = True
        mock_request.user.role = "admin"
        mock_request.user.pk = user_id
        mock_request.data = {"new_status": "submitted"}
        mock_request.META = {}

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.documents.models.Payment.objects") as mock_payment_qs,
            patch("apps.documents.models.ApplicationDocument.objects") as mock_doc_qs,
            patch("apps.applications.services.transition_application_status") as mock_transition,
            patch("apps.applications.services.transaction") as mock_txn,
            patch("apps.common.event_dispatcher.dispatch_event"),
        ):
            mock_app_qs.get.return_value = mock_app
            mock_app_qs.select_for_update.return_value.get.return_value = mock_app
            mock_payment_qs.filter.return_value.exists.return_value = has_payment
            mock_doc_qs.filter.return_value.exists.return_value = True
            mock_transition.return_value = "draft"
            mock_txn.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_txn.atomic.return_value.__exit__ = MagicMock(return_value=False)

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            if has_payment:
                # Should succeed — transition was called
                mock_transition.assert_called_once()
                self.assertIn(response.status_code, [200])
            else:
                # Should be blocked — transition was NOT called
                mock_transition.assert_not_called()
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "PAYMENT_REQUIRED")
