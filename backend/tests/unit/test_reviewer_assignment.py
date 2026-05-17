"""Unit tests for reviewer assignment (Requirement 11). Requirements: 11.1-11.10"""
import uuid
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.views import ApplicationAssignView, ApplicationAutoAssignView


_AO = "apps.applications.views.Application.objects"


def _admin(uid=None, role="super_admin"):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "a@e.com",
                    "role": role, "first_name": "A", "last_name": "D"})


def _student(uid=None):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "s@e.com",
                    "role": "student", "first_name": "S", "last_name": "T"})


def _app(uid=None, status="submitted", aid=None, reviewer_id=None):
    a = MagicMock()
    a.id = aid or uuid.uuid4()
    a.user_id = str(uid or uuid.uuid4())
    a.status = status
    a.program = "CS"
    a.intake = "Jan 2026"
    a.application_number = "APP-20250101-ABCD1234"
    a.assigned_reviewer_id_id = reviewer_id
    a.assigned_reviewer_id = None
    return a


def _reviewer(rid=None, role="admin"):
    r = MagicMock()
    r.id = rid or uuid.uuid4()
    r.email = "reviewer@e.com"
    r.role = role
    return r


class TestManualAssignment:
    """1. Manual assignment with valid/invalid reviewer (Req 11.1–11.4)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationAssignView.as_view()
        self.admin = _admin()

    def test_assign_valid_reviewer(self):
        a = _app()
        reviewer = _reviewer(role="admin")

        with (
            patch(_AO) as mq,
            patch("apps.accounts.models.Profile.objects") as mp,
            patch("apps.applications.models.ApplicationStatusHistory.objects") as msh,
            patch("apps.common.models.Notification.objects") as mn,
        ):
            mq.get.return_value = a
            mp.get.return_value = reviewer
            msh.create.return_value = MagicMock()
            mn.create.return_value = MagicMock()

            req = self.f.post(f"/api/v1/applications/{a.id}/assign/",
                              {"reviewer_id": str(reviewer.id)}, format="json")
            force_authenticate(req, user=self.admin)
            resp = self.v(req, application_id=a.id)

        assert resp.status_code == 200
        assert resp.data["success"] is True
        assert resp.data["data"]["assigned_reviewer_id"] == str(reviewer.id)

    def test_assign_invalid_role_rejected(self):
        a = _app()
        student_reviewer = _reviewer(role="student")

        with (
            patch(_AO) as mq,
            patch("apps.accounts.models.Profile.objects") as mp,
        ):
            mq.get.return_value = a
            mp.get.return_value = student_reviewer

            req = self.f.post(f"/api/v1/applications/{a.id}/assign/",
                              {"reviewer_id": str(student_reviewer.id)}, format="json")
            force_authenticate(req, user=self.admin)
            resp = self.v(req, application_id=a.id)

        assert resp.status_code == 400
        assert resp.data["code"] == "INVALID_REVIEWER_ROLE"

    def test_missing_reviewer_id(self):
        a = _app()
        with patch(_AO) as mq:
            mq.get.return_value = a
            req = self.f.post(f"/api/v1/applications/{a.id}/assign/",
                              {}, format="json")
            force_authenticate(req, user=self.admin)
            resp = self.v(req, application_id=a.id)
        assert resp.status_code == 400
        assert resp.data["code"] == "VALIDATION_ERROR"

    def test_reviewer_not_found(self):
        from apps.accounts.models import Profile
        a = _app()

        with (
            patch(_AO) as mq,
            patch("apps.accounts.models.Profile.objects") as mp,
        ):
            mq.get.return_value = a
            mp.get.side_effect = Profile.DoesNotExist

            req = self.f.post(f"/api/v1/applications/{a.id}/assign/",
                              {"reviewer_id": str(uuid.uuid4())}, format="json")
            force_authenticate(req, user=self.admin)
            resp = self.v(req, application_id=a.id)

        assert resp.status_code == 404
        assert resp.data["code"] == "REVIEWER_NOT_FOUND"


class TestAutoAssign:
    """2. Auto-assign round-robin distribution (Req 11.5–11.7)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationAutoAssignView.as_view()
        self.admin = _admin()

    def test_no_reviewers_returns_error(self):
        with (
            patch("apps.accounts.models.Profile.objects") as mp,
            patch("apps.common.models.Setting.objects") as ms,
        ):
            mp.filter.return_value.order_by.return_value = []
            ms.filter.return_value.first.return_value = None

            req = self.f.post("/api/v1/applications/auto-assign/", {}, format="json")
            force_authenticate(req, user=self.admin)
            resp = self.v(req)

        assert resp.status_code == 400
        assert resp.data["code"] == "NO_REVIEWERS"


class TestAssignmentPermissions:
    """3. Only super_admin can assign (Req 11.2)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationAssignView.as_view()

    def test_student_cannot_assign(self):
        student = _student()
        req = self.f.post("/api/v1/applications/{}/assign/".format(uuid.uuid4()),
                          {"reviewer_id": str(uuid.uuid4())}, format="json")
        force_authenticate(req, user=student)
        resp = self.v(req, application_id=uuid.uuid4())
        assert resp.status_code == 403

    def test_regular_admin_cannot_assign(self):
        admin = _admin(role="admin")
        req = self.f.post("/api/v1/applications/{}/assign/".format(uuid.uuid4()),
                          {"reviewer_id": str(uuid.uuid4())}, format="json")
        force_authenticate(req, user=admin)
        resp = self.v(req, application_id=uuid.uuid4())
        assert resp.status_code == 403


class TestReviewQueueScorerAssignmentBonus:
    """4. Priority score bonus for assigned apps (Req 11.9)."""

    def test_assigned_app_gets_bonus(self):
        from apps.applications.review_queue import ReviewQueueScorer

        app_assigned = MagicMock()
        app_assigned.payment_status = "paid"
        app_assigned.assigned_reviewer_id_id = uuid.uuid4()
        app_assigned.status = "submitted"
        app_assigned.review_started_at = None
        app_assigned.submitted_at = None

        app_unassigned = MagicMock()
        app_unassigned.payment_status = "paid"
        app_unassigned.assigned_reviewer_id_id = None
        app_unassigned.status = "submitted"
        app_unassigned.review_started_at = None
        app_unassigned.submitted_at = None

        scorer = ReviewQueueScorer()

        with patch.object(scorer, "_deadline_urgency", return_value=50):
            score_assigned = scorer.score(app_assigned, 80, False)
            score_unassigned = scorer.score(app_unassigned, 80, False)

        assert score_assigned.score > score_unassigned.score


class TestAssignedReviewerFilter:
    """5. ApplicationFilter supports assigned_reviewer_id (Req 11.8)."""

    def test_filter_has_assigned_reviewer_id(self):
        from apps.applications.filters import ApplicationFilter
        assert "assigned_reviewer_id" in ApplicationFilter.declared_filters

    def test_filter_has_reviewer_assignment_alias(self):
        from apps.applications.filters import ApplicationFilter
        assert "reviewer_assignment" in ApplicationFilter.declared_filters
