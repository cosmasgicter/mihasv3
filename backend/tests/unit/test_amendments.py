"""Unit tests for application amendments (Requirement 14). Requirements: 14.1-14.10"""
from contextlib import nullcontext
import uuid
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.amendment_service import (
    AMENDABLE_FIELDS,
    AMENDABLE_STATUSES,
    MAX_PENDING_AMENDMENTS,
    AmendmentError,
    AmendmentService,
)
from apps.applications.admin_amendment_views import ApplicationAmendmentReviewView
from apps.applications.student_amendment_views import ApplicationAmendmentView


_AO = "apps.applications.views.Application.objects"


def _user(uid=None):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "s@e.com",
                    "role": "student", "first_name": "T", "last_name": "S"})


def _admin(uid=None):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "a@e.com",
                    "role": "admin", "first_name": "A", "last_name": "D"})


def _app(uid, status="submitted", aid=None):
    a = MagicMock()
    a.id = aid or uuid.uuid4()
    a.user_id = str(uid)
    a.status = status
    a.program = "CS"
    a.intake = "Jan 2026"
    a.application_number = "APP-20250101-ABCD1234"
    a.full_name = "Test Student"
    a.email = "s@e.com"
    a.phone = "0971234567"
    return a


def _mock_locked_application(manager, app):
    manager.get.return_value = app
    manager.select_for_update.return_value.get.return_value = app


class TestAmendableVsNonAmendableFields:
    """1. Amendable vs non-amendable fields (Req 14.4, 14.5)."""

    def test_amendable_fields(self):
        expected = {"phone", "email", "address_line_1", "address_line_2",
                    "residence_town", "next_of_kin_name", "next_of_kin_phone"}
        assert AMENDABLE_FIELDS == expected

    def test_non_amendable_field_rejected(self):
        app = _app(uuid.uuid4())

        with (
            patch("apps.applications.amendment_service.Application.objects") as mq,
            patch("apps.applications.amendment_service.transaction.atomic", side_effect=lambda: nullcontext()),
        ):
            _mock_locked_application(mq, app)

            try:
                AmendmentService.request_amendment(
                    application_id=str(app.id),
                    field_name="program",
                    new_value="New Program",
                    reason="Want to change program",
                    user_id=str(uuid.uuid4()),
                )
                assert False, "Should have raised AmendmentError"
            except AmendmentError as e:
                assert e.code == "FIELD_NOT_AMENDABLE"

    def test_amendable_field_accepted(self):
        app = _app(uuid.uuid4())
        mock_amendment = MagicMock()
        mock_amendment.id = uuid.uuid4()

        with (
            patch("apps.applications.amendment_service.Application.objects") as mq,
            patch("apps.applications.amendment_service.ApplicationAmendment.objects") as amq,
            patch("apps.applications.amendment_service._notify_admins_of_amendment"),
            patch("apps.applications.amendment_service.transaction.atomic", side_effect=lambda: nullcontext()),
        ):
            _mock_locked_application(mq, app)
            amq.filter.return_value.count.return_value = 0
            amq.create.return_value = mock_amendment

            result = AmendmentService.request_amendment(
                application_id=str(app.id),
                field_name="phone",
                new_value="0979999999",
                reason="Changed phone number",
                user_id=str(uuid.uuid4()),
            )
            assert result == mock_amendment


class TestPendingAmendmentLimit:
    """2. Pending amendment limit (max 3) (Req 14.9)."""

    def test_max_pending_exceeded(self):
        app = _app(uuid.uuid4())

        with (
            patch("apps.applications.amendment_service.Application.objects") as mq,
            patch("apps.applications.amendment_service.ApplicationAmendment.objects") as amq,
            patch("apps.applications.amendment_service.transaction.atomic", side_effect=lambda: nullcontext()),
        ):
            _mock_locked_application(mq, app)
            amq.filter.return_value.count.return_value = 3

            try:
                AmendmentService.request_amendment(
                    application_id=str(app.id),
                    field_name="phone",
                    new_value="0979999999",
                    reason="Changed phone number",
                    user_id=str(uuid.uuid4()),
                )
                assert False, "Should have raised AmendmentError"
            except AmendmentError as e:
                assert e.code == "MAX_PENDING_AMENDMENTS"

    def test_max_pending_constant(self):
        assert MAX_PENDING_AMENDMENTS == 3


class TestApprovalAppliesFieldChange:
    """3. Approval applies field change (Req 14.8)."""

    def test_approved_amendment_applies_change(self):
        amendment = MagicMock()
        amendment.id = uuid.uuid4()
        amendment.status = "pending"
        amendment.field_name = "phone"
        amendment.old_value = "0971234567"
        amendment.new_value = "0979999999"
        amendment.application_id = uuid.uuid4()

        app = _app(uuid.uuid4())

        with (
            patch("apps.applications.amendment_service.ApplicationAmendment.objects") as amq,
            patch("apps.applications.amendment_service.Application.objects") as mq,
            patch("apps.applications.amendment_service.ApplicationStatusHistory.objects"),
            patch("apps.applications.amendment_service.timezone"),
        ):
            amq.get.return_value = amendment
            mq.get.return_value = app

            result = AmendmentService.review_amendment(
                amendment_id=str(amendment.id),
                status="approved",
                admin_id=str(uuid.uuid4()),
            )

            assert result.status == "approved"
            app.save.assert_called_once()


class TestRejectionLeavesApplicationUnchanged:
    """4. Rejection leaves application unchanged (Req 14.7)."""

    def test_rejected_amendment_no_change(self):
        amendment = MagicMock()
        amendment.id = uuid.uuid4()
        amendment.status = "pending"
        amendment.field_name = "phone"
        amendment.application_id = uuid.uuid4()

        with (
            patch("apps.applications.amendment_service.ApplicationAmendment.objects") as amq,
            patch("apps.applications.amendment_service.Application.objects") as mq,
            patch("apps.applications.amendment_service.timezone"),
            patch("apps.common.communication_service.CommunicationService"),
        ):
            amq.get.return_value = amendment
            mq.get.return_value = MagicMock()

            result = AmendmentService.review_amendment(
                amendment_id=str(amendment.id),
                status="rejected",
                admin_id=str(uuid.uuid4()),
            )

            assert result.status == "rejected"
            # Application is fetched for notification but NOT modified
            amendment.save.assert_called()  # amendment status saved
            mq.get.return_value.save.assert_not_called()  # application not saved


class TestOnlyValidStatusesAllowAmendments:
    """5. Only valid statuses allow amendments (Req 14.3)."""

    def test_amendable_statuses(self):
        assert AMENDABLE_STATUSES == {"submitted", "under_review", "waitlisted"}

    def test_draft_not_amendable(self):
        app = _app(uuid.uuid4(), status="draft")

        with (
            patch("apps.applications.amendment_service.Application.objects") as mq,
            patch("apps.applications.amendment_service.transaction.atomic", side_effect=lambda: nullcontext()),
        ):
            _mock_locked_application(mq, app)

            try:
                AmendmentService.request_amendment(
                    application_id=str(app.id),
                    field_name="phone",
                    new_value="0979999999",
                    reason="Changed phone",
                    user_id=str(uuid.uuid4()),
                )
                assert False, "Should have raised AmendmentError"
            except AmendmentError as e:
                assert e.code == "INVALID_STATUS_FOR_AMENDMENT"

    def test_approved_not_amendable(self):
        app = _app(uuid.uuid4(), status="approved")

        with (
            patch("apps.applications.amendment_service.Application.objects") as mq,
            patch("apps.applications.amendment_service.transaction.atomic", side_effect=lambda: nullcontext()),
        ):
            _mock_locked_application(mq, app)

            try:
                AmendmentService.request_amendment(
                    application_id=str(app.id),
                    field_name="phone",
                    new_value="0979999999",
                    reason="Changed phone",
                    user_id=str(uuid.uuid4()),
                )
                assert False, "Should have raised AmendmentError"
            except AmendmentError as e:
                assert e.code == "INVALID_STATUS_FOR_AMENDMENT"


class TestAmendmentEndpointOwnerOnly:
    """6. Amendment endpoint owner-only access (Req 14.2)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationAmendmentView.as_view()

    def test_non_owner_403(self):
        a = _app(uuid.uuid4())
        other = _user(uuid.uuid4())

        with patch(_AO) as mq:
            mq.select_related.return_value.get.return_value = a
            req = self.f.post(f"/api/v1/applications/{a.id}/amendments/",
                              {"field_name": "phone", "new_value": "0979999999",
                               "reason": "Changed phone"}, format="json")
            force_authenticate(req, user=other)
            resp = self.v(req, application_id=a.id)

        assert resp.status_code == 403
        assert resp.data["code"] == "INSUFFICIENT_PERMISSIONS"

    def test_owner_create_returns_201(self):
        owner_id = uuid.uuid4()
        a = _app(owner_id)
        owner = _user(owner_id)
        amendment = MagicMock()
        amendment.id = uuid.uuid4()
        amendment.field_name = "phone"
        amendment.new_value = "+260971234567"
        amendment.status = "pending"

        with (
            patch(_AO) as mq,
            patch("apps.applications.amendment_service.AmendmentService.request_amendment") as service,
        ):
            mq.select_related.return_value.get.return_value = a
            service.return_value = amendment
            req = self.f.post(
                f"/api/v1/applications/{a.id}/amendments/",
                {"field_name": "phone", "new_value": "+260971234567", "reason": "Changed phone"},
                format="json",
            )
            force_authenticate(req, user=owner)
            resp = self.v(req, application_id=a.id)

        assert resp.status_code == 201
        assert resp.data["success"] is True


class TestAmendmentReviewEndpoint:
    """7. Amendment review endpoint (Req 14.7)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationAmendmentReviewView.as_view()
        self.admin = _admin()

    def test_invalid_status_rejected(self):
        req = self.f.post(f"/api/v1/applications/{uuid.uuid4()}/amendments/{uuid.uuid4()}/review/",
                          {"status": "invalid"}, format="json")
        force_authenticate(req, user=self.admin)
        resp = self.v(req, application_id=uuid.uuid4(), amendment_id=uuid.uuid4())
        assert resp.status_code == 400
        assert resp.data["code"] == "VALIDATION_ERROR"

    def test_approve_succeeds(self):
        mock_amendment = MagicMock()
        mock_amendment.id = uuid.uuid4()
        mock_amendment.field_name = "phone"
        mock_amendment.status = "approved"

        # The view now scope-masks an out-of-scope application as not-found
        # (R5.2/R5.9) before mutating, so patch the application load + scope
        # check alongside the service. The in-scope path then reaches the
        # mocked ``review_amendment``.
        with (
            patch("apps.applications.amendment_service.AmendmentService.review_amendment") as ms,
            patch("apps.applications.admin_amendment_views.Application.objects.get", return_value=MagicMock()),
            patch("apps.applications.admin_amendment_views._staff_can_access_application", return_value=True),
        ):
            ms.return_value = mock_amendment

            aid = uuid.uuid4()
            amid = uuid.uuid4()
            req = self.f.post(f"/api/v1/applications/{aid}/amendments/{amid}/review/",
                              {"status": "approved"}, format="json")
            force_authenticate(req, user=self.admin)
            resp = self.v(req, application_id=aid, amendment_id=amid)

        assert resp.status_code == 200
        assert resp.data["success"] is True
