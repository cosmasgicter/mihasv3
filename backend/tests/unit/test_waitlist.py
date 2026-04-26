"""Unit tests for waitlist position tracking and auto-promotion (Requirement 3). Requirements: 3.1-3.10"""
import uuid
from unittest.mock import MagicMock, call, patch

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.waitlist_manager import WaitlistError, WaitlistManager
from apps.applications.views import ApplicationWaitlistPositionView

_WM_BASE = "apps.applications.waitlist_manager"
_APP_OBJECTS = f"{_WM_BASE}.Application.objects"
_TRANSITION = f"{_WM_BASE}.transition_application_status"
_HISTORY = f"{_WM_BASE}.ApplicationStatusHistory.objects"
_SEND_NOTIF = f"{_WM_BASE}._send_promotion_notification"
_VIEW_APP_OBJECTS = "apps.applications.admin_views.Application.objects"


def _user(uid=None, role="student"):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "s@e.com",
                    "role": role, "first_name": "T", "last_name": "S"})


def _app(uid=None, status="waitlisted", aid=None, program="CS", intake="Jan 2026",
         waitlist_position=None):
    a = MagicMock()
    a.id = aid or uuid.uuid4()
    a.user_id = str(uid or uuid.uuid4())
    a.status = status
    a.program = program
    a.intake = intake
    a.waitlist_position = waitlist_position
    a.application_number = "APP-20250101-ABCD1234"
    a.full_name = "Test Student"
    a.email = "s@e.com"
    return a


def _req(factory, user, aid):
    r = factory.get(f"/api/v1/applications/{aid}/waitlist-position/")
    force_authenticate(r, user=user)
    return r


# ---------------------------------------------------------------------------
# 1. Position assignment (sequential, per program+intake) — Req 3.1
# ---------------------------------------------------------------------------
class TestAssignPosition:
    """Position assignment is sequential per program+intake (Req 3.1)."""

    @patch("apps.applications.waitlist_manager.transaction")
    @patch(_APP_OBJECTS)
    def test_first_waitlisted_gets_position_1(self, mock_qs, mock_tx):
        """First waitlisted app for a program+intake gets position 1."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)
        app = _app(waitlist_position=None)
        mock_qs.select_for_update.return_value.filter.return_value.exclude.return_value.count.return_value = 0
        mock_qs.filter.return_value.update.return_value = 1

        pos = WaitlistManager.assign_position(app, "CS", "Jan 2026")

        assert pos == 1
        assert app.waitlist_position == 1

    @patch("apps.applications.waitlist_manager.transaction")
    @patch(_APP_OBJECTS)
    def test_subsequent_gets_next_position(self, mock_qs, mock_tx):
        """Second waitlisted app gets position 2."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)
        app = _app(waitlist_position=None)
        mock_qs.select_for_update.return_value.filter.return_value.exclude.return_value.count.return_value = 3
        mock_qs.filter.return_value.update.return_value = 1

        pos = WaitlistManager.assign_position(app, "CS", "Jan 2026")

        assert pos == 4
        assert app.waitlist_position == 4

    @patch("apps.applications.waitlist_manager.transaction")
    @patch(_APP_OBJECTS)
    def test_position_scoped_to_program_and_intake(self, mock_qs, mock_tx):
        """Position count filters by program AND intake."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)
        app = _app(waitlist_position=None)
        mock_qs.select_for_update.return_value.filter.return_value.exclude.return_value.count.return_value = 0
        mock_qs.filter.return_value.update.return_value = 1

        WaitlistManager.assign_position(app, "BBA", "Jul 2026")

        mock_qs.select_for_update.return_value.filter.assert_called_once_with(
            program="BBA", intake="Jul 2026", status="waitlisted",
        )
        mock_qs.select_for_update.return_value.filter.return_value.exclude.assert_called_once_with(id=app.id)


# ---------------------------------------------------------------------------
# 2. Promotion — lowest position promoted first — Req 3.3, 3.4, 3.5
# ---------------------------------------------------------------------------
class TestPromoteNext:
    """Promotion selects lowest waitlist_position and transitions to approved (Req 3.3-3.5)."""

    @patch(_SEND_NOTIF)
    @patch(f"{_WM_BASE}.WaitlistManager.reindex_positions")
    @patch(_TRANSITION)
    @patch(_APP_OBJECTS)
    @patch(f"{_WM_BASE}.transaction")
    def test_promotes_lowest_position(self, mock_tx, mock_qs, mock_trans, mock_reindex, mock_notif):
        app = _app(waitlist_position=1)
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)
        mock_qs.select_for_update.return_value.filter.return_value.order_by.return_value.first.return_value = app

        result = WaitlistManager.promote_next("CS", "Jan 2026")

        assert result is app
        mock_trans.assert_called_once_with(
            application=app,
            new_status="approved",
            changed_by="system",
            notes="Auto-promoted from waitlist — spot opened.",
        )
        assert app.waitlist_position is None
        app.save.assert_called_once_with(update_fields=["waitlist_position"])

    @patch(_SEND_NOTIF)
    @patch(f"{_WM_BASE}.WaitlistManager.reindex_positions")
    @patch(_TRANSITION)
    @patch(_APP_OBJECTS)
    @patch(f"{_WM_BASE}.transaction")
    def test_returns_none_when_no_waitlisted(self, mock_tx, mock_qs, mock_trans, mock_reindex, mock_notif):
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)
        mock_qs.select_for_update.return_value.filter.return_value.order_by.return_value.first.return_value = None

        result = WaitlistManager.promote_next("CS", "Jan 2026")

        assert result is None
        mock_trans.assert_not_called()

    @patch(_SEND_NOTIF)
    @patch(f"{_WM_BASE}.WaitlistManager.reindex_positions")
    @patch(_TRANSITION)
    @patch(_APP_OBJECTS)
    @patch(f"{_WM_BASE}.transaction")
    def test_sends_notification_on_promotion(self, mock_tx, mock_qs, mock_trans, mock_reindex, mock_notif):
        app = _app(waitlist_position=1)
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)
        mock_qs.select_for_update.return_value.filter.return_value.order_by.return_value.first.return_value = app

        WaitlistManager.promote_next("CS", "Jan 2026")

        mock_notif.assert_called_once_with(app)

    @patch(_SEND_NOTIF)
    @patch(f"{_WM_BASE}.WaitlistManager.reindex_positions")
    @patch(_TRANSITION)
    @patch(_APP_OBJECTS)
    @patch(f"{_WM_BASE}.transaction")
    def test_reindexes_after_promotion(self, mock_tx, mock_qs, mock_trans, mock_reindex, mock_notif):
        app = _app(waitlist_position=1)
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)
        mock_qs.select_for_update.return_value.filter.return_value.order_by.return_value.first.return_value = app

        WaitlistManager.promote_next("CS", "Jan 2026")

        mock_reindex.assert_called_once_with("CS", "Jan 2026")


# ---------------------------------------------------------------------------
# 3. Reindexing after promotion — Req 3.6
# ---------------------------------------------------------------------------
class TestReindexPositions:
    """Reindex assigns sequential positions ordered by created_at (Req 3.6)."""

    @patch(_APP_OBJECTS)
    def test_reindex_assigns_sequential_positions(self, mock_qs):
        a1 = MagicMock(id=uuid.uuid4(), waitlist_position=3)
        a2 = MagicMock(id=uuid.uuid4(), waitlist_position=5)
        a3 = MagicMock(id=uuid.uuid4(), waitlist_position=7)
        qs = MagicMock()
        qs.__iter__ = MagicMock(return_value=iter([a1, a2, a3]))
        qs.count.return_value = 3
        mock_qs.filter.return_value.order_by.return_value = qs

        WaitlistManager.reindex_positions("CS", "Jan 2026")

        mock_qs.filter.return_value.order_by.assert_called_once_with("created_at")
        # Each app with a mismatched position triggers an update via filter(id=...).update(...)
        # 3 apps with positions 3,5,7 all differ from expected 1,2,3 so 3 updates
        id_filter_calls = [
            c for c in mock_qs.filter.call_args_list
            if c.kwargs.get("id") in (a1.id, a2.id, a3.id)
        ]
        assert len(id_filter_calls) == 3

    @patch(_APP_OBJECTS)
    def test_reindex_no_change_when_already_sequential(self, mock_qs):
        a1 = MagicMock(id=uuid.uuid4(), waitlist_position=1)
        a2 = MagicMock(id=uuid.uuid4(), waitlist_position=2)
        qs = MagicMock()
        qs.__iter__ = MagicMock(return_value=iter([a1, a2]))
        qs.count.return_value = 2
        mock_qs.filter.return_value.order_by.return_value = qs

        WaitlistManager.reindex_positions("CS", "Jan 2026")

        # filter is called once for the initial queryset, no id-based updates needed
        mock_qs.filter.assert_called_once_with(
            program="CS", intake="Jan 2026", status="waitlisted",
        )


# ---------------------------------------------------------------------------
# 4. Override logging when admin bypasses order — Req 3.8
# ---------------------------------------------------------------------------
class TestLogOverride:
    """WAITLIST_ORDER_OVERRIDE is logged when admin bypasses position order (Req 3.8)."""

    @patch(_HISTORY)
    def test_creates_history_entry(self, mock_history):
        app = _app(waitlist_position=3)
        admin_id = str(uuid.uuid4())

        WaitlistManager.log_override(app, changed_by=admin_id)

        mock_history.create.assert_called_once()
        kwargs = mock_history.create.call_args[1]
        assert kwargs["application"] is app
        assert kwargs["status"] == "approved"
        assert kwargs["old_status"] == "waitlisted"
        assert kwargs["new_status"] == "approved"
        assert kwargs["changed_by_id"] == admin_id
        assert "WAITLIST_ORDER_OVERRIDE" in kwargs["notes"]
        assert "position 3" in kwargs["notes"]


# ---------------------------------------------------------------------------
# 5. get_position — Req 3.9
# ---------------------------------------------------------------------------
class TestGetPosition:
    """get_position returns position and total for waitlisted apps (Req 3.9)."""

    @patch(_APP_OBJECTS)
    def test_returns_position_and_total(self, mock_qs):
        aid = uuid.uuid4()
        app = _app(aid=aid, waitlist_position=2)
        mock_qs.get.return_value = app
        mock_qs.filter.return_value.count.return_value = 5

        result = WaitlistManager.get_position(str(aid))

        assert result == {"position": 2, "total": 5}

    @patch(_APP_OBJECTS)
    def test_raises_when_not_waitlisted(self, mock_qs):
        aid = uuid.uuid4()
        app = _app(aid=aid, status="submitted", waitlist_position=None)
        mock_qs.get.return_value = app

        try:
            WaitlistManager.get_position(str(aid))
            assert False, "Should have raised WaitlistError"
        except WaitlistError as exc:
            assert exc.code == "NOT_WAITLISTED"

    @patch(_APP_OBJECTS)
    def test_falls_back_to_total_when_position_is_none(self, mock_qs):
        aid = uuid.uuid4()
        app = _app(aid=aid, waitlist_position=None)
        mock_qs.get.return_value = app
        mock_qs.filter.return_value.count.return_value = 3

        result = WaitlistManager.get_position(str(aid))

        assert result == {"position": 3, "total": 3}


# ---------------------------------------------------------------------------
# 6. Waitlist position endpoint — Req 3.9
# ---------------------------------------------------------------------------
class TestWaitlistPositionEndpoint:
    """GET /api/v1/applications/{id}/waitlist-position/ (Req 3.9)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationWaitlistPositionView.as_view()

    @patch(f"{_WM_BASE}.WaitlistManager.get_position", return_value={"position": 1, "total": 4})
    @patch(_VIEW_APP_OBJECTS)
    def test_owner_can_view(self, mock_qs, mock_get_pos):
        uid = uuid.uuid4()
        app = _app(uid=uid, aid=uuid.uuid4())
        mock_qs.select_related.return_value.get.return_value = app
        user = _user(uid)

        resp = self.v(_req(self.f, user, app.id), application_id=app.id)

        assert resp.status_code == 200
        assert resp.data["success"] is True
        assert resp.data["data"] == {"position": 1, "total": 4}

    @patch(f"{_WM_BASE}.WaitlistManager.get_position", return_value={"position": 2, "total": 5})
    @patch(_VIEW_APP_OBJECTS)
    def test_admin_can_view(self, mock_qs, mock_get_pos):
        uid = uuid.uuid4()
        app = _app(uid=uid, aid=uuid.uuid4())
        mock_qs.select_related.return_value.get.return_value = app
        admin = _user(uuid.uuid4(), role="admin")

        resp = self.v(_req(self.f, admin, app.id), application_id=app.id)

        assert resp.status_code == 200
        assert resp.data["success"] is True

    @patch(_VIEW_APP_OBJECTS)
    def test_non_owner_non_admin_403(self, mock_qs):
        uid = uuid.uuid4()
        app = _app(uid=uid, aid=uuid.uuid4())
        mock_qs.select_related.return_value.get.return_value = app
        other = _user(uuid.uuid4())

        resp = self.v(_req(self.f, other, app.id), application_id=app.id)

        assert resp.status_code == 403
        assert resp.data["code"] == "INSUFFICIENT_PERMISSIONS"

    @patch(_VIEW_APP_OBJECTS)
    def test_not_found_404(self, mock_qs):
        from apps.applications.models import Application
        mock_qs.select_related.return_value.get.side_effect = Application.DoesNotExist
        user = _user()
        fid = uuid.uuid4()

        resp = self.v(_req(self.f, user, fid), application_id=fid)

        assert resp.status_code == 404
        assert resp.data["code"] == "NOT_FOUND"

    @patch(_VIEW_APP_OBJECTS)
    def test_not_waitlisted_400(self, mock_qs):
        uid = uuid.uuid4()
        app = _app(uid=uid, status="submitted", aid=uuid.uuid4())
        mock_qs.select_related.return_value.get.return_value = app
        user = _user(uid)

        with patch(f"{_WM_BASE}.WaitlistManager.get_position",
                   side_effect=WaitlistError("NOT_WAITLISTED", "Not waitlisted.")):
            resp = self.v(_req(self.f, user, app.id), application_id=app.id)

        assert resp.status_code == 400
        assert resp.data["code"] == "NOT_WAITLISTED"


# ---------------------------------------------------------------------------
# 7. Promotion triggered by withdrawal — Req 3.7(a)
# ---------------------------------------------------------------------------
class TestPromotionTriggeredByWithdrawal:
    """Withdrawal triggers waitlist promotion (Req 3.7a)."""

    def test_withdrawal_calls_promote_next(self):
        uid = uuid.uuid4()
        aid = uuid.uuid4()
        app = _app(uid=uid, status="submitted", aid=aid)

        with (
            patch("apps.applications.withdrawal_service.Application.objects") as mq,
            patch("apps.applications.withdrawal_service.transition_application_status"),
            patch("apps.applications.withdrawal_service.IntakeEnforcer"),
            patch("apps.applications.withdrawal_service._send_withdrawal_notification"),
            patch("apps.applications.withdrawal_service._trigger_waitlist_promotion") as mock_promote,
            patch("apps.applications.withdrawal_service.transaction") as mt,
        ):
            mq.get.return_value = app
            mq.select_for_update.return_value.get.return_value = app
            mt.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mt.atomic.return_value.__exit__ = MagicMock(return_value=False)

            from apps.applications.withdrawal_service import WithdrawalService
            WithdrawalService.withdraw(
                application_id=str(aid), user_id=str(uid),
                reason="I no longer wish to proceed with this application",
                ip_address="127.0.0.1", user_agent="TestAgent/1.0",
            )
            mock_promote.assert_called_once_with(app)


# ---------------------------------------------------------------------------
# 8. Promotion triggered by rejection — Req 3.7(b)
# ---------------------------------------------------------------------------
class TestPromotionTriggeredByRejection:
    """Rejection triggers waitlist promotion (Req 3.7b)."""

    def setup_method(self):
        self._tx_patcher = patch("apps.applications.admin_views.transaction")
        mock_tx = self._tx_patcher.start()
        mock_tx.atomic.return_value.__enter__ = MagicMock()
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

    def teardown_method(self):
        self._tx_patcher.stop()

    @patch("apps.catalog.models.Intake.objects")
    @patch("apps.common.models.EmailQueue.objects")
    @patch("apps.common.models.Notification.objects")
    @patch("apps.common.tasks.send_email_task")
    @patch(f"{_WM_BASE}.WaitlistManager.promote_next")
    @patch("apps.applications.intake_enforcer.IntakeEnforcer.sync_enrollment")
    @patch("apps.applications.admin_views.ApplicationSerializer")
    @patch("apps.applications.admin_views.transition_application_status", return_value="under_review")
    @patch("apps.applications.admin_views.Application.objects")
    def test_rejection_calls_promote_next(self, mock_qs, mock_trans, mock_ser,
                                          mock_sync, mock_promote,
                                          mock_email_task, mock_notif_qs,
                                          mock_email_qs, mock_intake_qs):
        from apps.applications.views import ApplicationReviewView

        uid = uuid.uuid4()
        app = _app(uid=uid, status="under_review", aid=uuid.uuid4())
        app.reviewed_by = None
        mock_qs.get.return_value = app
        mock_qs.select_for_update.return_value.get.return_value = app
        mock_ser.return_value.data = {"id": str(app.id), "status": "rejected"}
        mock_email_qs.create.return_value = MagicMock(id=uuid.uuid4())
        mock_intake_qs.filter.return_value.first.return_value = None

        factory = APIRequestFactory()
        admin = _user(uuid.uuid4(), role="admin")
        req = factory.post(
            f"/api/v1/applications/{app.id}/review/",
            {"new_status": "rejected", "admin_feedback": "Does not meet criteria"},
            format="json",
        )
        force_authenticate(req, user=admin)

        view = ApplicationReviewView.as_view()
        view(req, application_id=app.id)

        mock_promote.assert_called_once_with(app.program, app.intake)
