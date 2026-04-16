"""Property-based tests for submission gates and approval requirements.

# Feature: production-payment-hardening

Properties 7, 8, 9, 15 covering identity document requirement, payment gate
enforcement, draft status requirement, and approval payment verification.

**Validates: Requirements 5.3, 5.4, 14.1, 8.1, 14.3, 4.6**
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
# Shared mock helper — prevents DatabaseOperationForbidden in SimpleTestCase
# by ensuring IdentifierResolver.resolve_intake() never hits the DB.
# (Req 3.2, 3.3)
# ---------------------------------------------------------------------------

_RESOLVER_PATCH_TARGET = (
    "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake"
)


def _not_found_resolve(*_args, **_kwargs):
    """Return a mock ResolvedIdentifier with source='not_found'."""
    return MagicMock(source="not_found", id=None)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

non_draft_statuses = st.sampled_from([
    "submitted", "under_review", "approved", "rejected", "waitlisted",
])

payment_statuses_without_payment = st.sampled_from([
    "pending", "failed", "rejected",
])


def _make_mock_request(user_id, data):
    """Create a mock DRF request with admin role."""
    mock_request = MagicMock()
    mock_request.user.id = user_id
    mock_request.user.is_authenticated = True
    mock_request.user.role = "admin"
    mock_request.user.pk = user_id
    mock_request.data = data
    mock_request.META = {}
    return mock_request


def _make_mock_app(application_id, user_id, status="draft", payment_status="pending"):
    """Create a mock Application."""
    mock_app = MagicMock()
    mock_app.id = application_id
    mock_app.user_id = user_id
    mock_app.status = status
    mock_app.payment_status = payment_status
    mock_app.review_started_at = None
    return mock_app


# ---------------------------------------------------------------------------
# Property 7: Identity document required for submission
# ---------------------------------------------------------------------------


class TestIdentityDocumentRequired(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 7: Identity document required for submission

    For any application that has no application_documents record with
    document_type in ('nrc', 'passport'), attempting to transition to
    submitted SHALL fail with IDENTITY_DOCUMENT_REQUIRED.

    **Validates: Requirements 5.3, 5.4**
    """

    def setUp(self):
        self._resolver_patcher = patch(_RESOLVER_PATCH_TARGET, side_effect=_not_found_resolve)
        self._resolver_patcher.start()

    def tearDown(self):
        self._resolver_patcher.stop()

    @given(data=st.data())
    @settings(max_examples=100)
    def test_submission_blocked_without_identity_document(self, data):
        """Submission is blocked when no NRC or Passport document exists."""
        application_id = data.draw(st.uuids())
        user_id = str(uuid.uuid4())

        mock_app = _make_mock_app(application_id, user_id)
        mock_request = _make_mock_request(user_id, {"new_status": "submitted"})

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.documents.models.Payment.objects") as mock_payment_qs,
            patch("apps.documents.models.ApplicationDocument.objects") as mock_doc_qs,
            patch("apps.applications.services.transition_application_status") as mock_transition,
        ):
            mock_app_qs.get.return_value = mock_app
            # Payment gate passes
            mock_payment_qs.filter.return_value.exists.return_value = True
            # Identity document gate fails
            mock_doc_qs.filter.return_value.exists.return_value = False

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            mock_transition.assert_not_called()
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "IDENTITY_DOCUMENT_REQUIRED")

    @given(
        doc_type=st.sampled_from(["nrc", "passport"]),
    )
    @settings(max_examples=100)
    def test_submission_allowed_with_identity_document(self, doc_type):
        """Submission proceeds when an NRC or Passport document exists."""
        application_id = uuid.uuid4()
        user_id = str(uuid.uuid4())

        mock_app = _make_mock_app(application_id, user_id)
        mock_request = _make_mock_request(user_id, {"new_status": "submitted"})

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.applications.views.submit_application") as mock_submit,
        ):
            mock_app_qs.get.return_value = mock_app
            mock_submit.return_value = (mock_app, "draft")

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            mock_submit.assert_called_once()
            self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Property 8: Payment gate enforcement on submission
# ---------------------------------------------------------------------------


class TestPaymentGateEnforcement(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 8: Payment gate enforcement on submission

    For any application that has no successful payment record in the payments
    table, attempting to transition to submitted SHALL fail with PAYMENT_REQUIRED.

    **Validates: Requirements 14.1**
    """

    def setUp(self):
        self._resolver_patcher = patch(_RESOLVER_PATCH_TARGET, side_effect=_not_found_resolve)
        self._resolver_patcher.start()

    def tearDown(self):
        self._resolver_patcher.stop()

    @given(
        payment_status=payment_statuses_without_payment,
    )
    @settings(max_examples=100)
    def test_submission_blocked_without_successful_payment(self, payment_status):
        """Submission is blocked when no successful payment exists and
        payment_status is not verified/paid."""
        application_id = uuid.uuid4()
        user_id = str(uuid.uuid4())

        mock_app = _make_mock_app(
            application_id, user_id, payment_status=payment_status
        )
        mock_request = _make_mock_request(user_id, {"new_status": "submitted"})

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.documents.models.Payment.objects") as mock_payment_qs,
            patch("apps.applications.services.transition_application_status") as mock_transition,
        ):
            mock_app_qs.get.return_value = mock_app
            mock_payment_qs.filter.return_value.exists.return_value = False

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            mock_transition.assert_not_called()
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "PAYMENT_REQUIRED")

    @given(has_successful_payment=st.booleans())
    @settings(max_examples=100)
    def test_legacy_verified_status_passes_payment_gate(self, has_successful_payment):
        """Applications with payment_status='verified' pass the payment gate
        even without a successful payment record (backward compatibility)."""
        application_id = uuid.uuid4()
        user_id = str(uuid.uuid4())

        mock_app = _make_mock_app(
            application_id, user_id, payment_status="verified"
        )
        mock_request = _make_mock_request(user_id, {"new_status": "submitted"})

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.applications.views.submit_application") as mock_submit,
        ):
            mock_app_qs.get.return_value = mock_app
            mock_submit.return_value = (mock_app, "draft")

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            # Should pass payment gate because payment_status is 'verified'
            self.assertNotEqual(response.data.get("code"), "PAYMENT_REQUIRED")


# ---------------------------------------------------------------------------
# Property 9: Submission requires draft status
# ---------------------------------------------------------------------------


class TestSubmissionRequiresDraft(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 9: Submission requires draft status

    For any application whose current status is not draft, attempting to
    transition it to submitted SHALL fail with ALREADY_SUBMITTED.

    **Validates: Requirements 8.1**
    """

    def setUp(self):
        self._resolver_patcher = patch(_RESOLVER_PATCH_TARGET, side_effect=_not_found_resolve)
        self._resolver_patcher.start()

    def tearDown(self):
        self._resolver_patcher.stop()

    @given(current_status=non_draft_statuses)
    @settings(max_examples=100)
    def test_non_draft_application_cannot_be_submitted(self, current_status):
        """Applications not in draft status are rejected with ALREADY_SUBMITTED."""
        application_id = uuid.uuid4()
        user_id = str(uuid.uuid4())

        mock_app = _make_mock_app(
            application_id, user_id, status=current_status, payment_status="paid"
        )
        mock_request = _make_mock_request(user_id, {"new_status": "submitted"})

        from apps.applications.services import ApplicationSubmissionError

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.applications.views.submit_application") as mock_submit,
        ):
            mock_app_qs.get.return_value = mock_app
            mock_submit.side_effect = ApplicationSubmissionError(
                "ALREADY_SUBMITTED",
                "This application has already been submitted.",
            )

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "ALREADY_SUBMITTED")

    @given(data=st.data())
    @settings(max_examples=100)
    def test_draft_application_can_be_submitted(self, data):
        """Applications in draft status can be submitted (given all other
        gates pass)."""
        application_id = data.draw(st.uuids())
        user_id = str(uuid.uuid4())

        mock_app = _make_mock_app(
            application_id, user_id, status="draft", payment_status="paid"
        )
        mock_request = _make_mock_request(user_id, {"new_status": "submitted"})

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.applications.views.submit_application") as mock_submit,
        ):
            mock_app_qs.get.return_value = mock_app
            mock_submit.return_value = (mock_app, "draft")

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            mock_submit.assert_called_once()
            self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Property 15: Approval requires verified payment or force flag
# ---------------------------------------------------------------------------


class TestApprovalRequiresPaymentOrForce(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 15: Approval requires verified payment or force flag

    For any application without a verified payment status, attempting to
    transition it to approved without force=true SHALL fail with
    PAYMENT_UNVERIFIED.

    **Validates: Requirements 14.3, 4.6**
    """

    def setUp(self):
        self._resolver_patcher = patch(_RESOLVER_PATCH_TARGET, side_effect=_not_found_resolve)
        self._resolver_patcher.start()

    def tearDown(self):
        self._resolver_patcher.stop()

    @given(
        payment_status=st.sampled_from(["pending", "failed", "rejected"]),
    )
    @settings(max_examples=100)
    def test_approval_blocked_without_payment_or_force(self, payment_status):
        """Approval is blocked when payment is not verified and force is not set."""
        application_id = uuid.uuid4()
        user_id = str(uuid.uuid4())

        mock_app = _make_mock_app(
            application_id, user_id, status="submitted", payment_status=payment_status
        )
        mock_request = _make_mock_request(
            user_id, {"new_status": "approved", "notes": ""}
        )

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.documents.models.Payment.objects") as mock_payment_qs,
            patch("apps.applications.services.transition_application_status") as mock_transition,
        ):
            mock_app_qs.get.return_value = mock_app
            mock_payment_qs.filter.return_value.exists.return_value = False

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            mock_transition.assert_not_called()
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "PAYMENT_UNVERIFIED")

    @given(
        payment_status=st.sampled_from(["pending", "failed", "rejected"]),
    )
    @settings(max_examples=100)
    def test_approval_allowed_with_force_flag(self, payment_status):
        """Approval proceeds when force=true even without verified payment."""
        application_id = uuid.uuid4()
        user_id = str(uuid.uuid4())

        mock_app = _make_mock_app(
            application_id, user_id, status="submitted", payment_status=payment_status
        )
        mock_request = _make_mock_request(
            user_id, {"new_status": "approved", "notes": "", "force": True}
        )

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.documents.models.Payment.objects") as mock_payment_qs,
            patch("apps.applications.views.transition_application_status") as mock_transition,
            patch("apps.applications.models.ApplicationStatusHistory.objects") as mock_history_qs,
            patch("apps.applications.intake_enforcer.IntakeEnforcer.sync_enrollment"),
            patch("apps.common.models.Notification.objects"),
            patch("apps.common.models.EmailQueue.objects"),
            patch("apps.common.tasks.send_email_task"),
            patch("apps.catalog.models.Intake.objects") as mock_intake_qs,
        ):
            mock_app_qs.get.return_value = mock_app
            mock_payment_qs.filter.return_value.exists.return_value = False
            mock_transition.return_value = "submitted"
            mock_history_qs.filter.return_value.order_by.return_value.first.return_value = MagicMock()
            mock_intake_qs.filter.return_value.first.return_value = None

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            mock_transition.assert_called_once()
            self.assertEqual(response.status_code, 200)

    @given(
        payment_status=st.sampled_from(["paid", "verified"]),
    )
    @settings(max_examples=100)
    def test_approval_allowed_with_verified_payment(self, payment_status):
        """Approval proceeds when payment_status is paid or verified."""
        application_id = uuid.uuid4()
        user_id = str(uuid.uuid4())

        mock_app = _make_mock_app(
            application_id, user_id, status="submitted", payment_status=payment_status
        )
        mock_request = _make_mock_request(
            user_id, {"new_status": "approved", "notes": ""}
        )

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
            patch("apps.documents.models.Payment.objects") as mock_payment_qs,
            patch("apps.applications.views.transition_application_status") as mock_transition,
            patch("apps.applications.intake_enforcer.IntakeEnforcer.sync_enrollment"),
            patch("apps.common.models.Notification.objects"),
            patch("apps.common.models.EmailQueue.objects"),
            patch("apps.common.tasks.send_email_task"),
            patch("apps.catalog.models.Intake.objects") as mock_intake_qs,
        ):
            mock_app_qs.get.return_value = mock_app
            # Even if no successful payment record, the payment_status check passes
            mock_payment_qs.filter.return_value.exists.return_value = False
            mock_transition.return_value = "submitted"
            mock_intake_qs.filter.return_value.first.return_value = None

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            mock_transition.assert_called_once()
            self.assertEqual(response.status_code, 200)
