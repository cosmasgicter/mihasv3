"""Preservation property tests for post-migration production QA.

# Feature: post-migration-production-qa

Property 2: Preservation — Backend Behavior Unchanged for Non-Bug Inputs

IMPORTANT: These tests follow observation-first methodology.
They MUST PASS on unfixed code — passing confirms baseline behavior to preserve.
After fixes are applied, these tests must STILL pass (no regressions).

**Validates: Requirements 3.1, 3.5, 3.6, 3.8, 3.9**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import hashlib  # noqa: E402
import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402
from django.utils import timezone  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.accounts.authentication import JWTUser  # noqa: E402
from apps.common.middleware import CSRFEnforcementMiddleware  # noqa: E402
from apps.common.sse import SSEPollView  # noqa: E402
from apps.applications.views import (  # noqa: E402
    ApplicationDetailView,
    ApplicationReviewView,
)

_default_settings = settings(max_examples=50, deadline=None)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(user_id=None, role="student"):
    uid = user_id or uuid.uuid4()
    return JWTUser({
        "user_id": str(uid),
        "email": "test@example.com",
        "role": role,
        "first_name": "Test",
        "last_name": "User",
    })


def _admin_user(user_id=None):
    return _make_user(user_id=user_id, role="admin")


def _make_application(app_id=None, user_id=None, status="submitted"):
    app = MagicMock()
    app.id = app_id or uuid.uuid4()
    app.pk = app.id
    app.user_id = str(user_id or uuid.uuid4())
    app.status = status
    app.application_number = f"APP-{uuid.uuid4().hex[:8].upper()}"
    app.public_tracking_code = f"TRK-{uuid.uuid4().hex[:12].upper()}"
    app.full_name = "Test Applicant"
    app.nrc_number = "123456/78/9"
    app.passport_number = ""
    app.date_of_birth = "2000-01-01"
    app.sex = "Male"
    app.phone = "+260971234567"
    app.email = "applicant@example.com"
    app.residence_town = "Lusaka"
    app.nationality = "Zambian"
    app.program = "Computer Science"
    app.intake = "January 2025"
    app.institution = "Test University"
    app.version = 1
    app.payment_status = "pending"
    app.review_started_at = None
    app.reviewed_by_id = None
    app.admin_feedback = ""
    app.admin_feedback_date = None
    app.admin_feedback_by_id = None
    app.decision_date = None
    app.created_at = timezone.now()
    app.updated_at = timezone.now()
    return app


def _auth_request(factory, method, path, user, **kwargs):
    handler = getattr(factory, method.lower())
    request = handler(path, **kwargs)
    force_authenticate(request, user=user)
    return request


# =========================================================================
# Preservation Req 3.6: CSRF enforcement remains active on non-exempt endpoints
# =========================================================================


class TestCSRFEnforcementPreservation:
    """Preservation: CSRF enforcement still requires valid token on non-exempt paths.

    For all non-exempt POST/PUT/PATCH/DELETE paths, the CSRFEnforcementMiddleware
    must continue to require a valid X-CSRF-Token header. This ensures that
    any fixes to exempt specific paths (like logout) do not accidentally
    weaken CSRF protection on other endpoints.

    **Validates: Requirements 3.6**
    """

    # Non-exempt paths that MUST remain CSRF-protected
    PROTECTED_PATHS = [
        "/api/v1/applications/",
        "/api/v1/applications/{id}/",
        "/api/v1/applications/{id}/review/",
        "/api/v1/applications/{id}/grades/",
        "/api/v1/applications/{id}/verify-document/",
        "/api/v1/notifications/preferences/",
        "/api/v1/notifications/",
        "/api/v1/sessions/",
        "/api/v1/documents/",
        "/api/v1/admin/dashboard/",
    ]

    @given(
        path_index=st.integers(min_value=0, max_value=len(PROTECTED_PATHS) - 1),
        method=st.sampled_from(["POST", "PUT", "PATCH", "DELETE"]),
    )
    @_default_settings
    def test_non_exempt_paths_require_csrf_token(self, path_index, method):
        """Non-exempt state-changing endpoints must NOT be CSRF-exempt.

        This confirms that CSRF enforcement is active on all paths that
        are not explicitly exempted (login, register, password-reset, error report).
        """
        path = self.PROTECTED_PATHS[path_index].replace("{id}", str(uuid.uuid4()))

        middleware = CSRFEnforcementMiddleware(lambda r: None)
        is_exempt = middleware._is_exempt(path)

        assert not is_exempt, (
            f"Path '{path}' is unexpectedly CSRF-exempt! "
            f"This path should require CSRF validation for {method} requests. "
            f"Current exempt patterns: {[p.pattern for p in CSRFEnforcementMiddleware.EXEMPT_PATTERNS]}"
        )

    @given(
        method=st.sampled_from(["POST", "PUT", "PATCH", "DELETE"]),
    )
    @_default_settings
    def test_csrf_middleware_blocks_requests_without_token(self, method):
        """State-changing requests without X-CSRF-Token header get 403.

        This verifies the middleware's core enforcement behavior: any
        non-exempt state-changing request without a valid CSRF token
        is rejected with 403 CSRF_VALIDATION_FAILED.
        """
        factory = APIRequestFactory()
        handler = getattr(factory, method.lower())
        request = handler("/api/v1/applications/")

        # Track whether the inner handler was called
        inner_called = {"value": False}

        def mock_get_response(req):
            inner_called["value"] = True
            return MagicMock(status_code=200)

        middleware = CSRFEnforcementMiddleware(mock_get_response)
        response = middleware(request)

        assert response.status_code == 403, (
            f"Expected 403 for {method} without CSRF token, got {response.status_code}"
        )
        assert not inner_called["value"], (
            "Inner handler should NOT be called when CSRF token is missing"
        )

    def test_csrf_middleware_allows_get_requests(self):
        """GET requests bypass CSRF enforcement entirely.

        This confirms that read-only requests are never blocked by CSRF,
        preserving the ability to fetch data without a CSRF token.
        """
        factory = APIRequestFactory()
        request = factory.get("/api/v1/applications/")

        inner_called = {"value": False}

        def mock_get_response(req):
            inner_called["value"] = True
            response = MagicMock(status_code=200)
            return response

        middleware = CSRFEnforcementMiddleware(mock_get_response)
        middleware(request)

        assert inner_called["value"], (
            "GET requests should pass through CSRF middleware without blocking"
        )

    @given(
        path=st.sampled_from([
            "/api/v1/auth/login/",
            "/api/v1/auth/login",
            "/api/v1/auth/register/",
            "/api/v1/auth/register",
            "/api/v1/auth/password-reset/",
            "/api/v1/auth/password-reset",
            "/api/v1/errors/report/",
            "/api/v1/errors/report",
        ]),
    )
    @_default_settings
    def test_existing_exempt_paths_remain_exempt(self, path):
        """Existing CSRF-exempt paths must remain exempt after fixes.

        Login, register, password-reset, and error report are currently
        exempt and must stay exempt to avoid breaking unauthenticated flows.
        """
        middleware = CSRFEnforcementMiddleware(lambda r: None)
        is_exempt = middleware._is_exempt(path)

        assert is_exempt, (
            f"Path '{path}' should be CSRF-exempt but is not! "
            f"This would break unauthenticated flows."
        )


# =========================================================================
# Preservation Req 3.1: SSE polling fallback continues working
# =========================================================================


class TestSSEPollingFallbackPreservation:
    """Preservation: GET /api/v1/events/poll/ returns valid JSON with notifications.

    The SSE polling fallback endpoint must continue returning a JSON response
    with a notifications array for authenticated users. This endpoint is the
    fallback when SSE streaming is unavailable.

    **Validates: Requirements 3.1**
    """

    @given(
        notification_count=st.integers(min_value=0, max_value=5),
    )
    @_default_settings
    def test_poll_endpoint_returns_json_with_notifications(self, notification_count):
        """GET /api/v1/events/poll/ returns JSON with notifications array.

        The polling fallback must return a response with success=True and
        a data array containing notification objects.
        """
        factory = APIRequestFactory()
        view = SSEPollView.as_view()
        user = _make_user()

        # Create mock notifications
        mock_notifications = []
        for i in range(notification_count):
            n = MagicMock()
            n.id = uuid.uuid4()
            n.title = f"Notification {i}"
            n.message = f"Message {i}"
            n.type = "info"
            n.is_read = False
            n.created_at = timezone.now()
            mock_notifications.append(n)

        with patch("apps.common.sse.Notification.objects") as mock_qs:
            mock_qs.filter.return_value.order_by.return_value.__getitem__ = (
                lambda self, key: mock_notifications[:20]
            )
            # Make the slicing work
            mock_filter = MagicMock()
            mock_filter.order_by.return_value = mock_filter
            mock_filter.__getitem__ = lambda self, key: mock_notifications[:20]
            mock_qs.filter.return_value = mock_filter

            request = _auth_request(factory, "get", "/api/v1/events/poll/", user)
            response = view(request)

        assert response.status_code == 200, (
            f"Expected 200 from poll endpoint, got {response.status_code}"
        )
        assert response.data["success"] is True, (
            "Poll endpoint should return success=True"
        )
        assert "data" in response.data, (
            "Poll endpoint should return a 'data' field"
        )
        assert isinstance(response.data["data"], list), (
            f"Poll endpoint 'data' should be a list, got {type(response.data['data'])}"
        )
        assert len(response.data["data"]) == notification_count, (
            f"Expected {notification_count} notifications, got {len(response.data['data'])}"
        )

    def test_poll_endpoint_notification_shape(self):
        """Each notification in the poll response has the expected fields."""
        factory = APIRequestFactory()
        view = SSEPollView.as_view()
        user = _make_user()

        mock_notif = MagicMock()
        mock_notif.id = uuid.uuid4()
        mock_notif.title = "Test Title"
        mock_notif.message = "Test Message"
        mock_notif.type = "info"
        mock_notif.is_read = False
        mock_notif.created_at = timezone.now()

        with patch("apps.common.sse.Notification.objects") as mock_qs:
            mock_filter = MagicMock()
            mock_filter.order_by.return_value = mock_filter
            mock_filter.__getitem__ = lambda self, key: [mock_notif]
            mock_qs.filter.return_value = mock_filter

            request = _auth_request(factory, "get", "/api/v1/events/poll/", user)
            response = view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert len(data) == 1

        notif = data[0]
        assert "id" in notif, "Notification should have 'id' field"
        assert "title" in notif, "Notification should have 'title' field"
        assert "message" in notif, "Notification should have 'message' field"
        assert "type" in notif, "Notification should have 'type' field"
        assert "created_at" in notif, "Notification should have 'created_at' field"


# =========================================================================
# Preservation Req 3.9: Existing PATCH/PUT/POST API contracts continue working
# =========================================================================


class TestApplicationAPIContractsPreservation:
    """Preservation: Application PATCH/PUT/POST endpoints continue working.

    Existing API contracts for application updates (PATCH, PUT) and
    reviews (POST with new_status, POST with legacy status) must
    continue functioning correctly after fixes.

    **Validates: Requirements 3.9**
    """

    @given(
        method=st.sampled_from(["patch", "put"]),
    )
    @_default_settings
    def test_application_detail_patch_and_put_return_200(self, method):
        """PATCH and PUT on ApplicationDetailView return 200 with application data.

        Both PATCH and PUT are supported on the application detail endpoint.
        This must remain true after any fixes.
        """
        factory = APIRequestFactory()
        view = ApplicationDetailView.as_view()
        user = _make_user()

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, user_id=user.id)

        # Mock the serializer save to avoid DB writes
        with patch("apps.applications.views.Application.objects") as mock_qs, \
             patch("apps.applications.views.ApplicationSerializer") as mock_ser_cls:
            mock_qs.get.return_value = application

            mock_serializer = MagicMock()
            mock_serializer.is_valid.return_value = True
            mock_serializer.data = {
                "id": str(app_id),
                "full_name": "Updated Name",
                "status": "submitted",
            }
            mock_ser_cls.return_value = mock_serializer

            handler = getattr(factory, method)
            request = handler(
                f"/api/v1/applications/{app_id}/",
                data={"full_name": "Updated Name"},
                format="json",
            )
            force_authenticate(request, user=user)
            response = view(request, application_id=app_id)

        assert response.status_code == 200, (
            f"Expected 200 from {method.upper()} on application detail, "
            f"got {response.status_code}"
        )

    def test_application_detail_view_has_put_handler(self):
        """ApplicationDetailView must have a put() method handler.

        This is a structural check that PUT support exists on the view.
        """
        assert hasattr(ApplicationDetailView, "put"), (
            "ApplicationDetailView must have a put() method"
        )
        assert callable(getattr(ApplicationDetailView, "put")), (
            "ApplicationDetailView.put must be callable"
        )

    def test_application_detail_view_has_patch_handler(self):
        """ApplicationDetailView must have a patch() method handler."""
        assert hasattr(ApplicationDetailView, "patch"), (
            "ApplicationDetailView must have a patch() method"
        )
        assert callable(getattr(ApplicationDetailView, "patch")), (
            "ApplicationDetailView.patch must be callable"
        )

    def test_review_view_has_post_and_patch_handlers(self):
        """ApplicationReviewView must have both post() and patch() handlers.

        The review endpoint supports both POST (primary) and PATCH (alias).
        """
        assert hasattr(ApplicationReviewView, "post"), (
            "ApplicationReviewView must have a post() method"
        )
        assert hasattr(ApplicationReviewView, "patch"), (
            "ApplicationReviewView must have a patch() method"
        )

    def test_review_post_with_new_status_processes_correctly(self):
        """POST to review with new_status field processes the status transition.

        **Validates: Requirements 3.9**
        """
        factory = APIRequestFactory()
        view = ApplicationReviewView.as_view()
        admin = _admin_user()

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="submitted")

        with patch("apps.applications.views.Application.objects") as mock_qs, \
             patch("apps.applications.services.transition_application_status") as mock_transition:
            mock_qs.get.return_value = application
            mock_transition.return_value = "submitted"  # old_status

            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/review/",
                admin,
                data={"new_status": "under_review", "notes": "Starting review"},
                format="json",
            )
            response = view(request, application_id=app_id)

        assert response.status_code == 200, (
            f"Expected 200 from review POST with new_status, got {response.status_code}"
        )
        assert "new_status" in response.data, (
            "Review response should contain new_status field"
        )
        assert response.data["new_status"] == "under_review"
        mock_transition.assert_called_once()

    def test_review_post_with_legacy_status_normalizes_to_new_status(self):
        """POST to review with legacy 'status' field normalizes to 'new_status'.

        The _normalize_legacy_review_payload method converts {status: X}
        to {new_status: X} for backward compatibility with Node-era frontend code.

        **Validates: Requirements 3.9**
        """
        factory = APIRequestFactory()
        view = ApplicationReviewView.as_view()
        admin = _admin_user()

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="submitted")

        with patch("apps.applications.views.Application.objects") as mock_qs, \
             patch("apps.applications.services.transition_application_status") as mock_transition:
            mock_qs.get.return_value = application
            mock_transition.return_value = "submitted"

            # Send legacy payload with 'status' instead of 'new_status'
            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/review/",
                admin,
                data={"status": "under_review", "notes": "Legacy review"},
                format="json",
            )
            response = view(request, application_id=app_id)

        assert response.status_code == 200, (
            f"Expected 200 from review POST with legacy status field, "
            f"got {response.status_code}. "
            f"The _normalize_legacy_review_payload should convert 'status' to 'new_status'."
        )
        mock_transition.assert_called_once()

    def test_normalize_legacy_review_payload_preserves_new_status(self):
        """_normalize_legacy_review_payload does not overwrite existing new_status.

        When both 'status' and 'new_status' are present, new_status takes precedence.
        """
        result = ApplicationReviewView._normalize_legacy_review_payload({
            "new_status": "approved",
            "status": "rejected",
            "notes": "test",
        })
        assert result["new_status"] == "approved", (
            "new_status should take precedence over legacy status field"
        )

    @given(
        legacy_status=st.sampled_from([
            "submitted", "under_review", "approved", "rejected",
        ]),
    )
    @_default_settings
    def test_normalize_legacy_review_payload_converts_status(self, legacy_status):
        """_normalize_legacy_review_payload converts 'status' to 'new_status'.

        For any legacy status value, when new_status is absent, the normalizer
        should copy status into new_status.
        """
        result = ApplicationReviewView._normalize_legacy_review_payload({
            "status": legacy_status,
        })
        assert result.get("new_status") == legacy_status, (
            f"Expected new_status='{legacy_status}' after normalization, "
            f"got new_status='{result.get('new_status')}'"
        )

    def test_normalize_legacy_review_payload_handles_non_dict(self):
        """_normalize_legacy_review_payload returns non-dict input unchanged."""
        assert ApplicationReviewView._normalize_legacy_review_payload("string") == "string"
        assert ApplicationReviewView._normalize_legacy_review_payload(None) is None
        assert ApplicationReviewView._normalize_legacy_review_payload([1, 2]) == [1, 2]


# =========================================================================
# Preservation Req 3.5: Payment display continues working
# =========================================================================


class TestPaymentPreservation:
    """Preservation: Payment receipt and verify endpoints continue working.

    The existing PaymentReceiptView and PaymentVerifyView must continue
    functioning correctly after the PaymentListView is added.

    **Validates: Requirements 3.5**
    """

    def test_payment_receipt_view_exists(self):
        """PaymentReceiptView must still exist and be accessible."""
        from apps.documents.views import PaymentReceiptView

        assert hasattr(PaymentReceiptView, "get"), (
            "PaymentReceiptView must have a get() method"
        )

    def test_payment_verify_view_exists(self):
        """PaymentVerifyView must still exist and be accessible."""
        from apps.documents.views import PaymentVerifyView

        assert hasattr(PaymentVerifyView, "post"), (
            "PaymentVerifyView must have a post() method"
        )

    def test_payment_receipt_url_still_resolves(self):
        """GET /api/v1/payments/{id}/receipt/ must still resolve."""
        from django.urls import resolve

        match = resolve(f"/api/v1/payments/{uuid.uuid4()}/receipt/")
        assert match is not None
        assert match.url_name == "payment-receipt"

    def test_payment_verify_url_still_resolves(self):
        """POST /api/v1/payments/{id}/verify/ must still resolve."""
        from django.urls import resolve

        match = resolve(f"/api/v1/payments/{uuid.uuid4()}/verify/")
        assert match is not None
        assert match.url_name == "payment-verify"

    def test_payment_receipt_returns_data_for_owner(self):
        """PaymentReceiptView returns receipt data for the payment owner.

        **Validates: Requirements 3.5**
        """
        from apps.documents.views import PaymentReceiptView

        factory = APIRequestFactory()
        view = PaymentReceiptView.as_view()
        user = _make_user()
        payment_id = uuid.uuid4()

        mock_payment = MagicMock()
        mock_payment.id = payment_id
        mock_payment.user_id = str(user.id)
        mock_payment.amount = 153
        mock_payment.currency = "ZMW"
        mock_payment.status = "verified"
        mock_payment.created_at = timezone.now()
        mock_payment.application_id = uuid.uuid4()

        mock_application = MagicMock()
        mock_application.application_number = "APP-12345"
        mock_application.program = "Computer Science"
        mock_application.full_name = "Test Student"

        with patch("apps.documents.views.Payment.objects") as mock_payment_qs, \
             patch("apps.applications.models.Application.objects") as mock_app_qs:
            mock_payment_qs.get.return_value = mock_payment
            mock_app_qs.get.return_value = mock_application

            request = _auth_request(factory, "get", f"/api/v1/payments/{payment_id}/receipt/", user)
            response = view(request, payment_id=payment_id)

        assert response.status_code == 200, (
            f"Expected 200 from payment receipt, got {response.status_code}"
        )
        assert "payment_id" in response.data
        assert "amount" in response.data
        assert "currency" in response.data

    @given(
        role=st.sampled_from(["student", "admin", "super_admin"]),
    )
    @_default_settings
    def test_application_list_still_includes_payment_fields(self, role):
        """ApplicationListSerializer must still include payment fields.

        The Payment page reads payment data from the Application model.
        This must continue working after the PaymentListView is added.

        **Validates: Requirements 3.5**
        """
        from apps.applications.serializers import ApplicationListSerializer

        fields = ApplicationListSerializer.Meta.fields
        payment_fields = [
            "payment_status", "payment_method", "payer_name",
            "payer_phone", "amount", "paid_at", "momo_ref", "pop_url",
        ]
        for field in payment_fields:
            assert field in fields, (
                f"ApplicationListSerializer must include '{field}' for the Payment page"
            )
