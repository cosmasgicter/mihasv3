"""Unit tests for conditional admission (Requirement 5). Requirements: 5.1-5.11"""
import uuid
from datetime import date, timedelta
from unittest.mock import MagicMock, patch, call

from apps.applications.condition_manager import (
    CONDITIONALLY_APPROVABLE_STATUSES,
    TERMINAL_CONDITION_STATUSES,
    SUCCESSFUL_CONDITION_STATUSES,
    VALID_CONDITION_TYPES,
    ConditionError,
    ConditionManager,
)

# Patch paths — condition_manager uses local imports
_APP_MODEL = "apps.applications.condition_manager.Application"
_COND_MODEL = "apps.applications.condition_manager.ApplicationCondition"
_TRANSITION = "apps.applications.condition_manager.transition_application_status"
_SEND_COND_NOTIF = "apps.applications.condition_manager._send_conditions_notification"
_SEND_APPROVAL_NOTIF = "apps.applications.condition_manager._send_approval_notification"
_TRANSACTION = "apps.applications.condition_manager.transaction"

# Task patch paths
_TASK_APP_MODEL = "apps.applications.models.Application"
_TASK_COND_MODEL = "apps.applications.models.ApplicationCondition"
_TASK_NOTIFICATION = "apps.common.models.Notification"
_TASK_EMAIL_QUEUE = "apps.common.models.EmailQueue"
_TASK_SEND_EMAIL = "apps.common.tasks.send_email_task"
_TASK_COND_MANAGER = "apps.applications.condition_manager.ConditionManager"


def _mock_app(uid=None, status="under_review", aid=None):
    a = MagicMock()
    a.id = aid or uuid.uuid4()
    a.user_id = str(uid or uuid.uuid4())
    a.status = status
    a.program = "CS"
    a.intake = "Jan 2026"
    a.application_number = "APP-20250101-ABCD1234"
    a.full_name = "Test Student"
    a.email = "student@example.com"
    return a


def _mock_condition(cid=None, app_id=None, status="pending", deadline=None):
    c = MagicMock()
    c.id = cid or uuid.uuid4()
    c.application_id = app_id or uuid.uuid4()
    c.description = "Submit certified NRC copy"
    c.condition_type = "document"
    c.deadline = deadline or (date.today() + timedelta(days=14))
    c.status = status
    c.met_at = None
    c.verified_by_id = None
    c.application = _mock_app(aid=c.application_id)
    return c


class TestConditionAssignmentValidStatus:
    """1. Condition assignment from valid statuses (Req 5.1, 5.2, 5.3)."""

    @patch(_SEND_COND_NOTIF)
    @patch(_TRANSITION)
    @patch(_COND_MODEL)
    @patch(_APP_MODEL)
    @patch(_TRANSACTION)
    def test_assign_from_under_review(self, mock_tx, mock_app_cls, mock_cond_cls, mock_transition, mock_notif):
        """Conditions can be assigned when application is under_review."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        app = _mock_app(status="under_review")
        mock_app_cls.objects.select_for_update.return_value.get.return_value = app

        created_cond = _mock_condition(app_id=app.id)
        mock_cond_cls.objects.create.return_value = created_cond

        conditions = [{"description": "Submit NRC", "deadline": "2025-08-01", "condition_type": "document"}]
        result = ConditionManager.assign_conditions(str(app.id), conditions, str(uuid.uuid4()))

        assert len(result) == 1
        mock_transition.assert_called_once()
        assert mock_transition.call_args[1]["new_status"] == "conditionally_approved"

    @patch(_SEND_COND_NOTIF)
    @patch(_TRANSITION)
    @patch(_COND_MODEL)
    @patch(_APP_MODEL)
    @patch(_TRANSACTION)
    def test_assign_from_waitlisted(self, mock_tx, mock_app_cls, mock_cond_cls, mock_transition, mock_notif):
        """Conditions can be assigned when application is waitlisted."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        app = _mock_app(status="waitlisted")
        mock_app_cls.objects.select_for_update.return_value.get.return_value = app

        created_cond = _mock_condition(app_id=app.id)
        mock_cond_cls.objects.create.return_value = created_cond

        conditions = [{"description": "Submit transcript", "deadline": "2025-09-01", "condition_type": "academic"}]
        result = ConditionManager.assign_conditions(str(app.id), conditions, str(uuid.uuid4()))

        assert len(result) == 1
        mock_transition.assert_called_once()


class TestConditionAssignmentInvalidStatus:
    """2. Condition assignment rejected from invalid statuses (Req 5.1)."""

    @patch(_COND_MODEL)
    @patch(_APP_MODEL)
    @patch(_TRANSACTION)
    def test_assign_from_draft_rejected(self, mock_tx, mock_app_cls, mock_cond_cls):
        """Cannot assign conditions from draft status."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        app = _mock_app(status="draft")
        mock_app_cls.objects.select_for_update.return_value.get.return_value = app

        conditions = [{"description": "Submit NRC", "deadline": "2025-08-01"}]
        try:
            ConditionManager.assign_conditions(str(app.id), conditions, str(uuid.uuid4()))
            assert False, "Should have raised ConditionError"
        except ConditionError as e:
            assert e.code == "INVALID_STATUS_FOR_CONDITIONS"

    @patch(_COND_MODEL)
    @patch(_APP_MODEL)
    @patch(_TRANSACTION)
    def test_assign_from_approved_rejected(self, mock_tx, mock_app_cls, mock_cond_cls):
        """Cannot assign conditions from approved status."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        app = _mock_app(status="approved")
        mock_app_cls.objects.select_for_update.return_value.get.return_value = app

        conditions = [{"description": "Submit NRC", "deadline": "2025-08-01"}]
        try:
            ConditionManager.assign_conditions(str(app.id), conditions, str(uuid.uuid4()))
            assert False, "Should have raised ConditionError"
        except ConditionError as e:
            assert e.code == "INVALID_STATUS_FOR_CONDITIONS"

    def test_empty_conditions_rejected(self):
        """Cannot assign an empty conditions list."""
        try:
            ConditionManager.assign_conditions(str(uuid.uuid4()), [], str(uuid.uuid4()))
            assert False, "Should have raised ConditionError"
        except ConditionError as e:
            assert e.code == "NO_CONDITIONS_PROVIDED"

    def test_missing_description_rejected(self):
        """Condition without description is rejected."""
        conditions = [{"description": "", "deadline": "2025-08-01"}]
        try:
            ConditionManager.assign_conditions(str(uuid.uuid4()), conditions, str(uuid.uuid4()))
            assert False, "Should have raised ConditionError"
        except ConditionError as e:
            assert e.code == "MISSING_DESCRIPTION"

    def test_missing_deadline_rejected(self):
        """Condition without deadline is rejected."""
        conditions = [{"description": "Submit NRC"}]
        try:
            ConditionManager.assign_conditions(str(uuid.uuid4()), conditions, str(uuid.uuid4()))
            assert False, "Should have raised ConditionError"
        except ConditionError as e:
            assert e.code == "MISSING_DEADLINE"

    def test_invalid_condition_type_rejected(self):
        """Condition with invalid type is rejected."""
        conditions = [{"description": "Submit NRC", "deadline": "2025-08-01", "condition_type": "invalid_type"}]
        try:
            ConditionManager.assign_conditions(str(uuid.uuid4()), conditions, str(uuid.uuid4()))
            assert False, "Should have raised ConditionError"
        except ConditionError as e:
            assert e.code == "INVALID_CONDITION_TYPE"


class TestConditionVerification:
    """3. Condition verification — met and waived (Req 5.5)."""

    @patch(_COND_MODEL)
    @patch(_TRANSACTION)
    def test_verify_as_met(self, mock_tx, mock_cond_cls):
        """Pending condition can be verified as met."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        cond = _mock_condition(status="pending")
        mock_cond_cls.objects.select_for_update.return_value.get.return_value = cond

        admin_id = str(uuid.uuid4())
        with patch.object(ConditionManager, "auto_promote_if_all_met", return_value=False):
            result = ConditionManager.verify_condition(str(cond.id), "met", admin_id)

        assert result.status == "met"
        assert result.met_at is not None
        assert result.verified_by_id == admin_id
        cond.save.assert_called_once()

    @patch(_COND_MODEL)
    @patch(_TRANSACTION)
    def test_verify_as_waived(self, mock_tx, mock_cond_cls):
        """Pending condition can be verified as waived."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        cond = _mock_condition(status="pending")
        mock_cond_cls.objects.select_for_update.return_value.get.return_value = cond

        admin_id = str(uuid.uuid4())
        with patch.object(ConditionManager, "auto_promote_if_all_met", return_value=False):
            result = ConditionManager.verify_condition(str(cond.id), "waived", admin_id)

        assert result.status == "waived"
        assert result.met_at is not None

    @patch(_COND_MODEL)
    @patch(_TRANSACTION)
    def test_verify_invalid_status_rejected(self, mock_tx, mock_cond_cls):
        """Cannot verify with a status other than met or waived."""
        try:
            ConditionManager.verify_condition(str(uuid.uuid4()), "expired", str(uuid.uuid4()))
            assert False, "Should have raised ConditionError"
        except ConditionError as e:
            assert e.code == "INVALID_CONDITION_STATUS"

    @patch(_COND_MODEL)
    @patch(_TRANSACTION)
    def test_verify_already_resolved_rejected(self, mock_tx, mock_cond_cls):
        """Cannot verify a condition that is already resolved (not pending)."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        cond = _mock_condition(status="met")
        mock_cond_cls.objects.select_for_update.return_value.get.return_value = cond

        try:
            ConditionManager.verify_condition(str(cond.id), "waived", str(uuid.uuid4()))
            assert False, "Should have raised ConditionError"
        except ConditionError as e:
            assert e.code == "CONDITION_NOT_PENDING"


class TestAutoPromotionAllMet:
    """4. Auto-promotion when all conditions met/waived (Req 5.5)."""

    @patch(_SEND_APPROVAL_NOTIF)
    @patch(_TRANSITION)
    @patch(_APP_MODEL)
    @patch(_COND_MODEL)
    def test_auto_promote_when_all_met(self, mock_cond_cls, mock_app_cls, mock_transition, mock_notif):
        """Application transitions to approved when all conditions are met/waived."""
        app_id = str(uuid.uuid4())
        app = _mock_app(status="conditionally_approved", aid=app_id)

        # All conditions resolved — none unresolved
        cond_qs = MagicMock()
        cond_qs.exists.return_value = True
        cond_qs.exclude.return_value.count.return_value = 0  # no unresolved
        cond_qs.filter.return_value.exists.return_value = False  # no expired
        cond_qs.filter.return_value.values_list.return_value = []
        mock_cond_cls.objects.filter.return_value = cond_qs

        mock_app_cls.objects.get.return_value = app
        mock_app_cls.objects.select_for_update.return_value.get.return_value = app

        with patch(_TRANSACTION) as mock_tx:
            mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

            result = ConditionManager.auto_promote_if_all_met(app_id)

        assert result is True
        mock_transition.assert_called_once()
        assert mock_transition.call_args[1]["new_status"] == "approved"
        assert mock_transition.call_args[1]["changed_by"] == "system"


class TestAutoRejectionExpiredCondition:
    """5. Auto-rejection when condition expires (Req 5.8)."""

    @patch(_TRANSITION)
    @patch(_APP_MODEL)
    @patch(_COND_MODEL)
    def test_auto_reject_when_any_expired(self, mock_cond_cls, mock_app_cls, mock_transition):
        """Application transitions to rejected when all resolved but any expired."""
        app_id = str(uuid.uuid4())
        app = _mock_app(status="conditionally_approved", aid=app_id)

        # All conditions resolved, but one expired
        cond_qs = MagicMock()
        cond_qs.exists.return_value = True
        cond_qs.exclude.return_value.count.return_value = 0  # all resolved
        cond_qs.filter.return_value.exists.return_value = True  # has expired
        cond_qs.filter.return_value.values_list.return_value = ["Submit NRC copy"]
        mock_cond_cls.objects.filter.return_value = cond_qs

        mock_app_cls.objects.get.return_value = app
        mock_app_cls.objects.select_for_update.return_value.get.return_value = app

        with patch(_TRANSACTION) as mock_tx:
            mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

            result = ConditionManager.auto_promote_if_all_met(app_id)

        assert result is True
        mock_transition.assert_called_once()
        assert mock_transition.call_args[1]["new_status"] == "rejected"

    @patch(_TRANSITION)
    @patch(_APP_MODEL)
    @patch(_COND_MODEL)
    def test_no_action_when_unresolved_remain(self, mock_cond_cls, mock_app_cls, mock_transition):
        """No transition when some conditions are still pending."""
        app_id = str(uuid.uuid4())

        cond_qs = MagicMock()
        cond_qs.exists.return_value = True
        cond_qs.exclude.return_value.count.return_value = 1  # 1 unresolved
        mock_cond_cls.objects.filter.return_value = cond_qs

        result = ConditionManager.auto_promote_if_all_met(app_id)

        assert result is False
        mock_transition.assert_not_called()

    @patch(_TRANSITION)
    @patch(_APP_MODEL)
    @patch(_COND_MODEL)
    def test_no_action_when_not_conditionally_approved(self, mock_cond_cls, mock_app_cls, mock_transition):
        """No transition if application is not in conditionally_approved status."""
        app_id = str(uuid.uuid4())
        app = _mock_app(status="approved", aid=app_id)

        cond_qs = MagicMock()
        cond_qs.exists.return_value = True
        cond_qs.exclude.return_value.count.return_value = 0
        mock_cond_cls.objects.filter.return_value = cond_qs

        mock_app_cls.objects.get.return_value = app

        result = ConditionManager.auto_promote_if_all_met(app_id)

        assert result is False
        mock_transition.assert_not_called()


class TestConditionExpiryTask:
    """6. Condition expiry task — expires overdue conditions and triggers rejection (Req 5.6, 5.7, 5.8)."""

    @patch(_TASK_SEND_EMAIL)
    @patch(_TASK_EMAIL_QUEUE)
    @patch(_TASK_NOTIFICATION)
    @patch(_TASK_COND_MANAGER)
    @patch(_TASK_COND_MODEL)
    def test_expires_overdue_pending_conditions(self, mock_cond_cls, mock_cm, mock_notif, mock_email, mock_send):
        """Conditions past deadline with status pending are transitioned to expired."""
        app = _mock_app(status="conditionally_approved")
        cond = _mock_condition(
            app_id=app.id,
            status="pending",
            deadline=date.today() - timedelta(days=1),
        )
        cond.application = app

        # The task does: filter(...).select_related("application") then iterates + values_list
        expired_qs = MagicMock()
        expired_qs.__iter__ = lambda self: iter([cond])
        expired_qs.values_list.return_value = [app.id]
        mock_cond_cls.objects.filter.return_value.select_related.return_value = expired_qs

        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())
        mock_cm.auto_promote_if_all_met.return_value = True

        from apps.applications.tasks import condition_expiry_task
        result = condition_expiry_task()

        assert result["expired_conditions"] == 1
        cond.save.assert_called_once()
        assert cond.status == "expired"
        mock_notif.objects.create.assert_called_once()

    @patch(_TASK_SEND_EMAIL)
    @patch(_TASK_EMAIL_QUEUE)
    @patch(_TASK_NOTIFICATION)
    @patch(_TASK_COND_MANAGER)
    @patch(_TASK_COND_MODEL)
    def test_triggers_auto_rejection_after_expiry(self, mock_cond_cls, mock_cm, mock_notif, mock_email, mock_send):
        """After expiring conditions, auto_promote_if_all_met is called for affected apps."""
        app = _mock_app(status="conditionally_approved")
        cond = _mock_condition(
            app_id=app.id,
            status="pending",
            deadline=date.today() - timedelta(days=2),
        )
        cond.application = app

        expired_qs = MagicMock()
        expired_qs.__iter__ = lambda self: iter([cond])
        expired_qs.values_list.return_value = [app.id]
        mock_cond_cls.objects.filter.return_value.select_related.return_value = expired_qs

        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())
        mock_cm.auto_promote_if_all_met.return_value = True

        from apps.applications.tasks import condition_expiry_task
        result = condition_expiry_task()

        assert result["auto_rejected"] == 1
        mock_cm.auto_promote_if_all_met.assert_called_once_with(str(app.id))

    @patch(_TASK_SEND_EMAIL)
    @patch(_TASK_EMAIL_QUEUE)
    @patch(_TASK_NOTIFICATION)
    @patch(_TASK_COND_MANAGER)
    @patch(_TASK_COND_MODEL)
    def test_no_expiry_when_no_overdue(self, mock_cond_cls, mock_cm, mock_notif, mock_email, mock_send):
        """No conditions expired when none are past deadline."""
        expired_qs = MagicMock()
        expired_qs.__iter__ = lambda self: iter([])
        expired_qs.values_list.return_value = []
        mock_cond_cls.objects.filter.return_value.select_related.return_value = expired_qs

        from apps.applications.tasks import condition_expiry_task
        result = condition_expiry_task()

        assert result["expired_conditions"] == 0
        assert result["auto_rejected"] == 0
        mock_notif.objects.create.assert_not_called()


class TestConditionManagerConstants:
    """7. Service constants match requirements (Req 5.1, 5.2)."""

    def test_conditionally_approvable_statuses(self):
        assert CONDITIONALLY_APPROVABLE_STATUSES == {"under_review", "waitlisted"}

    def test_valid_condition_types(self):
        assert VALID_CONDITION_TYPES == {"document", "payment", "academic", "other"}

    def test_terminal_condition_statuses(self):
        assert TERMINAL_CONDITION_STATUSES == {"met", "waived", "expired"}

    def test_successful_condition_statuses(self):
        assert SUCCESSFUL_CONDITION_STATUSES == {"met", "waived"}


class TestConditionallyApprovedTransitions:
    """8. conditionally_approved has correct transitions (Req 5.11)."""

    def test_conditionally_approved_allows_withdrawal(self):
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "withdrawn" in ALLOWED_TRANSITIONS.get("conditionally_approved", set())

    def test_conditionally_approved_allows_rejection(self):
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "rejected" in ALLOWED_TRANSITIONS.get("conditionally_approved", set())

    def test_conditionally_approved_allows_approved(self):
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "approved" in ALLOWED_TRANSITIONS.get("conditionally_approved", set())

    def test_under_review_allows_conditionally_approved(self):
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "conditionally_approved" in ALLOWED_TRANSITIONS.get("under_review", set())

    def test_waitlisted_allows_conditionally_approved(self):
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "conditionally_approved" in ALLOWED_TRANSITIONS.get("waitlisted", set())
