"""Unit tests for enrollment confirmation (Requirement 10). Requirements: 10.1-10.10"""
import uuid
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.enrollment_service import EnrollmentError, EnrollmentService
from apps.applications.student_withdrawal_views import ApplicationConfirmEnrollmentView


_ES = "apps.applications.enrollment_service.EnrollmentService.confirm_enrollment"
_AO = "apps.applications.student_withdrawal_views.Application.objects"
_AS = "apps.applications.student_withdrawal_views.ApplicationSerializer"


def _user(uid=None):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "s@e.com",
                    "role": "student", "first_name": "T", "last_name": "S"})


def _app(uid, status="approved", aid=None):
    a = MagicMock()
    a.id = aid or uuid.uuid4()
    a.user_id = str(uid)
    a.status = status
    a.program = "CS"
    a.intake = "Jan 2026"
    a.application_number = "APP-20250101-ABCD1234"
    a.full_name = "Test Student"
    a.email = "s@e.com"
    a.decision_date = MagicMock()
    a.enrollment_confirmation_deadline = None
    a.assigned_reviewer_id_id = None
    return a


def _req(factory, user, aid, data=None):
    r = factory.post(f"/api/v1/applications/{aid}/confirm-enrollment/",
                     data=data or {}, format="json")
    force_authenticate(r, user=user)
    return r


class TestEnrollmentConfirmation:
    """1. Enrollment confirmation from approved status (Req 10.1, 10.5)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationConfirmEnrollmentView.as_view()
        self.uid = uuid.uuid4()
        self.u = _user(self.uid)

    def test_confirm_from_approved(self):
        a = _app(self.uid, status="approved")
        with patch(_AO) as mq, patch(_AS) as ms, patch(_ES, return_value=a):
            mq.select_related.return_value.get.return_value = a
            ms.return_value.data = {"id": str(a.id), "status": "enrolled"}
            resp = self.v(_req(self.f, self.u, a.id), application_id=a.id)
        assert resp.status_code == 200
        assert resp.data["success"] is True

    def test_confirm_from_invalid_status_rejected(self):
        a = _app(self.uid, status="draft")
        err = EnrollmentError("INVALID_STATUS_FOR_ENROLLMENT", "Cannot confirm from draft.")
        with patch(_AO) as mq, patch(_ES, side_effect=err):
            mq.select_related.return_value.get.return_value = a
            resp = self.v(_req(self.f, self.u, a.id), application_id=a.id)
        assert resp.status_code == 400
        assert resp.data["code"] == "INVALID_STATUS_FOR_ENROLLMENT"


class TestEnrollmentOwnerOnly:
    """2. Owner-only access (Req 10.5)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationConfirmEnrollmentView.as_view()

    def test_non_owner_403(self):
        a = _app(uuid.uuid4())
        with patch(_AO) as mq:
            mq.select_related.return_value.get.return_value = a
            other = _user(uuid.uuid4())
            resp = self.v(_req(self.f, other, a.id), application_id=a.id)
        assert resp.status_code == 403
        assert resp.data["code"] == "INSUFFICIENT_PERMISSIONS"


class TestEnrollmentDeadlineComputation:
    """3. Deadline computation (Req 10.3, 10.4)."""

    def test_deadline_from_calendar_event(self):
        app = _app(uuid.uuid4())
        app.intake = "Jan 2026"
        app.decision_date = datetime(2025, 6, 1)

        mock_intake = MagicMock()
        mock_intake.id = uuid.uuid4()

        mock_event = MagicMock()
        mock_event.event_date = date(2025, 7, 15)

        with (
            patch("apps.catalog.models.Intake.objects") as mi,
            patch("apps.catalog.models.AcademicCalendarEvent.objects") as mce,
            patch("apps.applications.enrollment_service.timezone") as mtz,
        ):
            mi.filter.return_value.first.return_value = mock_intake
            mce.filter.return_value.first.return_value = mock_event
            mtz.is_naive.return_value = True
            mtz.make_aware.return_value = datetime(2025, 7, 15, 23, 59, 59)

            deadline = EnrollmentService.compute_deadline(app)
            assert deadline == datetime(2025, 7, 15, 23, 59, 59)

    def test_deadline_fallback_14_days(self):
        app = _app(uuid.uuid4())
        app.intake = "Jan 2026"
        now = datetime(2025, 6, 1)
        app.decision_date = now

        with (
            patch("apps.catalog.models.Intake.objects") as mi,
            patch("apps.applications.enrollment_service.timezone") as mtz,
        ):
            mi.filter.return_value.first.return_value = None
            mtz.now.return_value = now

            deadline = EnrollmentService.compute_deadline(app)
            assert deadline == now + timedelta(days=14)


class TestEnrollmentNotFound:
    """4. Application not found returns 404."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationConfirmEnrollmentView.as_view()
        self.u = _user()

    def test_404(self):
        from apps.applications.models import Application
        with patch(_AO) as mq:
            mq.select_related.return_value.get.side_effect = Application.DoesNotExist
            fid = uuid.uuid4()
            resp = self.v(_req(self.f, self.u, fid), application_id=fid)
        assert resp.status_code == 404


class TestEnrollmentServiceValidation:
    """5. EnrollmentService validates conditionally_approved conditions."""

    def test_conditions_not_met_raises_error(self):
        app = _app(uuid.uuid4(), status="conditionally_approved")

        with (
            patch("apps.applications.enrollment_service.Application.objects") as mq,
            patch("apps.applications.enrollment_service.ApplicationCondition.objects") as mcq,
        ):
            mq.get.return_value = app
            # pending conditions exist
            mcq.filter.return_value.exists.side_effect = [True, False]

            try:
                EnrollmentService.confirm_enrollment(str(app.id), str(uuid.uuid4()))
                assert False, "Should have raised EnrollmentError"
            except EnrollmentError as e:
                assert e.code == "CONDITIONS_NOT_MET"


class TestEnrollmentTransitions:
    """6. ALLOWED_TRANSITIONS includes enrollment paths (Req 10.1)."""

    def test_approved_to_enrolled(self):
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "enrolled" in ALLOWED_TRANSITIONS["approved"]

    def test_approved_to_enrollment_expired(self):
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "enrollment_expired" in ALLOWED_TRANSITIONS["approved"]

    def test_conditionally_approved_to_enrolled(self):
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "enrolled" in ALLOWED_TRANSITIONS["conditionally_approved"]
