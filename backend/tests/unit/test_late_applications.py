"""Unit tests for late application handling (Requirement 6). Requirements: 6.1-6.10"""
import uuid
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from apps.applications.intake_enforcer import IntakeCheckResult, IntakeEnforcer
from apps.applications.services import ApplicationSubmissionError, submit_application


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_intake(deadline_offset_days=-3, grace_period_days=7):
    """Return a mock Intake whose deadline is `deadline_offset_days` from today."""
    intake = MagicMock()
    intake.id = uuid.uuid4()
    intake.application_deadline = date.today() + timedelta(days=deadline_offset_days)
    intake.grace_period_days = grace_period_days
    intake.max_capacity = None
    return intake


def _mock_app(status="draft", payment_status="paid"):
    """Return a mock Application ready for submission."""
    app = MagicMock()
    app.id = uuid.uuid4()
    app.user_id = str(uuid.uuid4())
    app.status = status
    app.program = "CS"
    app.intake = "Jan 2026"
    app.payment_status = payment_status
    app.is_late_submission = False
    app.submitted_at = None
    app.application_number = "APP-20250101-ABCD1234"
    return app


def _setup_enforcer_mocks(mock_resolver, mock_intake_objects, intake):
    """Wire up IdentifierResolver + Intake.objects for check_submission()."""
    resolved = MagicMock()
    resolved.source = "db"
    resolved.id = intake.id
    mock_resolver.resolve_intake.return_value = resolved
    mock_intake_objects.filter.return_value.first.return_value = intake


# Patch targets — Intake is imported at module level in intake_enforcer.py
_ID_RESOLVER = "apps.applications.identifier_resolver.IdentifierResolver"
_INTAKE_OBJECTS = "apps.applications.intake_enforcer.Intake.objects"

# submit_application patch targets — Application and Payment are module-level
# imports in services.py; others are local imports inside the function.
_SVC_HAS_PAYMENT = "apps.applications.services._application_has_completed_payment"
_SVC_HAS_DOC = "apps.applications.services._application_has_identity_document"
_SVC_APP_OBJECTS = "apps.applications.services.Application.objects"
_SVC_PAYMENT_OBJECTS = "apps.applications.services.Payment.objects"
_SVC_TRANSACTION = "apps.applications.services.transaction"
_SVC_TRANSITION = "apps.applications.services.transition_application_status"


# ---------------------------------------------------------------------------
# 1. Submission within grace period — allowed, flagged as late (Req 6.1-6.3)
# ---------------------------------------------------------------------------

class TestSubmissionWithinGracePeriod:
    """Submissions after deadline but within grace_period_days are allowed with is_late=True."""

    @patch(_INTAKE_OBJECTS)
    @patch(_ID_RESOLVER)
    def test_within_grace_period_returns_allowed_and_late(self, mock_resolver, mock_intake_obj):
        """3 days past deadline, 7-day grace → allowed=True, is_late=True."""
        intake = _mock_intake(deadline_offset_days=-3, grace_period_days=7)
        _setup_enforcer_mocks(mock_resolver, mock_intake_obj, intake)

        result = IntakeEnforcer.check_submission("Jan 2026", "CS")

        assert result.allowed is True
        assert result.is_late is True
        assert result.code is None

    @patch(_INTAKE_OBJECTS)
    @patch(_ID_RESOLVER)
    def test_last_day_of_grace_period_allowed(self, mock_resolver, mock_intake_obj):
        """Exactly on the last day of grace period → still allowed."""
        intake = _mock_intake(deadline_offset_days=-5, grace_period_days=5)
        _setup_enforcer_mocks(mock_resolver, mock_intake_obj, intake)

        result = IntakeEnforcer.check_submission("Jan 2026", "CS")

        assert result.allowed is True
        assert result.is_late is True

    @patch(_INTAKE_OBJECTS)
    @patch(_ID_RESOLVER)
    def test_before_deadline_not_flagged_late(self, mock_resolver, mock_intake_obj):
        """Submission before deadline → allowed, is_late=False."""
        intake = _mock_intake(deadline_offset_days=5, grace_period_days=7)
        _setup_enforcer_mocks(mock_resolver, mock_intake_obj, intake)

        result = IntakeEnforcer.check_submission("Jan 2026", "CS")

        assert result.allowed is True
        assert result.is_late is False


# ---------------------------------------------------------------------------
# 2. Submission past grace period — rejected (Req 6.4)
# ---------------------------------------------------------------------------

class TestSubmissionPastGracePeriod:
    """Submissions after both deadline and grace period are rejected."""

    @patch(_INTAKE_OBJECTS)
    @patch(_ID_RESOLVER)
    def test_past_grace_period_rejected(self, mock_resolver, mock_intake_obj):
        """10 days past deadline, 5-day grace → INTAKE_DEADLINE_PASSED."""
        intake = _mock_intake(deadline_offset_days=-10, grace_period_days=5)
        _setup_enforcer_mocks(mock_resolver, mock_intake_obj, intake)

        result = IntakeEnforcer.check_submission("Jan 2026", "CS")

        assert result.allowed is False
        assert result.code == "INTAKE_DEADLINE_PASSED"

    @patch(_INTAKE_OBJECTS)
    @patch(_ID_RESOLVER)
    def test_no_grace_period_past_deadline_rejected(self, mock_resolver, mock_intake_obj):
        """No grace period configured (None) → rejected after deadline."""
        intake = _mock_intake(deadline_offset_days=-1, grace_period_days=None)
        _setup_enforcer_mocks(mock_resolver, mock_intake_obj, intake)

        result = IntakeEnforcer.check_submission("Jan 2026", "CS")

        assert result.allowed is False
        assert result.code == "INTAKE_DEADLINE_PASSED"

    @patch(_INTAKE_OBJECTS)
    @patch(_ID_RESOLVER)
    def test_zero_grace_period_past_deadline_rejected(self, mock_resolver, mock_intake_obj):
        """grace_period_days=0 → no grace, rejected after deadline."""
        intake = _mock_intake(deadline_offset_days=-1, grace_period_days=0)
        _setup_enforcer_mocks(mock_resolver, mock_intake_obj, intake)

        result = IntakeEnforcer.check_submission("Jan 2026", "CS")

        assert result.allowed is False
        assert result.code == "INTAKE_DEADLINE_PASSED"


# ---------------------------------------------------------------------------
# 3. Late fee requirement enforcement (Req 6.5, 6.6)
# ---------------------------------------------------------------------------

class TestLateFeeRequirement:
    """submit_application() enforces late fee payment when a late fee is configured."""

    @patch(_SVC_APP_OBJECTS)
    @patch(_SVC_TRANSACTION)
    @patch(_SVC_PAYMENT_OBJECTS)
    @patch("apps.documents.models.ProgramFee")
    @patch("apps.catalog.models.Program")
    @patch("apps.applications.intake_enforcer.IntakeEnforcer.check_submission")
    @patch(_SVC_HAS_DOC, return_value=True)
    @patch(_SVC_HAS_PAYMENT, return_value=True)
    def test_late_fee_required_error(
        self, _pay, _doc, mock_check, mock_prog, mock_fee, mock_payment_obj,
        mock_tx, mock_app_obj,
    ):
        """Late submission with unpaid late fee raises LATE_FEE_REQUIRED."""
        mock_check.return_value = IntakeCheckResult(allowed=True, is_late=True)

        app = _mock_app(status="draft", payment_status="paid")

        mock_prog.objects.filter.return_value.first.return_value = MagicMock()
        mock_late_fee = MagicMock()
        mock_late_fee.amount = 50
        mock_late_fee.currency = "ZMW"
        mock_fee.objects.filter.return_value.first.return_value = mock_late_fee
        mock_payment_obj.filter.return_value.exists.return_value = False  # late fee NOT paid

        try:
            submit_application(
                application=app,
                changed_by=str(app.user_id),
                ip_address="127.0.0.1",
                user_agent="TestAgent/1.0",
            )
            assert False, "Expected ApplicationSubmissionError"
        except ApplicationSubmissionError as e:
            assert e.code == "LATE_FEE_REQUIRED"
            assert "50" in e.message

    @patch("apps.applications.eligibility_engine.EligibilityEngine")
    @patch("apps.applications.models.ApplicationDraft")
    @patch("apps.applications.duplicate_checker.DuplicateChecker")
    @patch(_SVC_TRANSITION)
    @patch(_SVC_APP_OBJECTS)
    @patch(_SVC_TRANSACTION)
    @patch("apps.documents.models.ProgramFee")
    @patch("apps.catalog.models.Program")
    @patch("apps.applications.intake_enforcer.IntakeEnforcer")
    @patch(_SVC_HAS_DOC, return_value=True)
    @patch(_SVC_HAS_PAYMENT, return_value=True)
    def test_no_late_fee_configured_allows_submission(
        self, _pay, _doc, mock_enforcer, mock_prog, mock_fee,
        mock_tx, mock_app_obj, mock_transition, mock_dup, mock_draft, mock_elig,
    ):
        """Late submission with no late fee configured proceeds to transaction."""
        mock_enforcer.check_submission.return_value = IntakeCheckResult(allowed=True, is_late=True)
        mock_enforcer.increment_enrollment = MagicMock()

        app = _mock_app(status="draft", payment_status="paid")

        mock_prog.objects.filter.return_value.first.return_value = MagicMock()
        mock_fee.objects.filter.return_value.first.return_value = None  # no late fee

        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        locked = _mock_app(status="draft", payment_status="paid")
        mock_app_obj.select_for_update.return_value.get.return_value = locked
        mock_app_obj.filter.return_value.update = MagicMock()

        mock_dup.check_at_submit.return_value = MagicMock(has_duplicate=False)
        mock_transition.return_value = "draft"

        result_app, old_status = submit_application(
            application=app,
            changed_by=str(app.user_id),
            ip_address="127.0.0.1",
            user_agent="TestAgent/1.0",
        )

        assert result_app.is_late_submission is True


# ---------------------------------------------------------------------------
# 4. Admin force-bypass of late fee (Req 6.9)
# ---------------------------------------------------------------------------

class TestAdminForceBypassLateFee:
    """payment_status=force_approved bypasses late fee requirement."""

    @patch("apps.applications.eligibility_engine.EligibilityEngine")
    @patch("apps.applications.models.ApplicationDraft")
    @patch("apps.applications.duplicate_checker.DuplicateChecker")
    @patch(_SVC_TRANSITION)
    @patch(_SVC_APP_OBJECTS)
    @patch(_SVC_TRANSACTION)
    @patch(_SVC_PAYMENT_OBJECTS)
    @patch("apps.documents.models.ProgramFee")
    @patch("apps.catalog.models.Program")
    @patch("apps.applications.intake_enforcer.IntakeEnforcer")
    @patch(_SVC_HAS_DOC, return_value=True)
    @patch(_SVC_HAS_PAYMENT, return_value=True)
    def test_force_approved_bypasses_late_fee(
        self, _pay, _doc, mock_enforcer, mock_prog, mock_fee, mock_payment_obj,
        mock_tx, mock_app_obj, mock_transition, mock_dup, mock_draft, mock_elig,
    ):
        """Admin force_approved payment_status skips late fee check."""
        mock_enforcer.check_submission.return_value = IntakeCheckResult(allowed=True, is_late=True)
        mock_enforcer.increment_enrollment = MagicMock()

        app = _mock_app(status="draft", payment_status="force_approved")

        mock_prog.objects.filter.return_value.first.return_value = MagicMock()
        mock_late_fee = MagicMock()
        mock_late_fee.amount = 50
        mock_late_fee.currency = "ZMW"
        mock_fee.objects.filter.return_value.first.return_value = mock_late_fee
        mock_payment_obj.filter.return_value.exists.return_value = False  # late fee NOT paid

        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        locked = _mock_app(status="draft", payment_status="force_approved")
        mock_app_obj.select_for_update.return_value.get.return_value = locked
        mock_app_obj.filter.return_value.update = MagicMock()

        mock_dup.check_at_submit.return_value = MagicMock(has_duplicate=False)
        mock_transition.return_value = "draft"

        result_app, old_status = submit_application(
            application=app,
            changed_by=str(app.user_id),
            ip_address="127.0.0.1",
            user_agent="TestAgent/1.0",
        )

        # Should succeed — no LATE_FEE_REQUIRED error
        assert result_app.is_late_submission is True

    @patch("apps.applications.eligibility_engine.EligibilityEngine")
    @patch("apps.applications.models.ApplicationDraft")
    @patch("apps.applications.duplicate_checker.DuplicateChecker")
    @patch(_SVC_TRANSITION)
    @patch(_SVC_APP_OBJECTS)
    @patch(_SVC_TRANSACTION)
    @patch(_SVC_PAYMENT_OBJECTS)
    @patch("apps.documents.models.ProgramFee")
    @patch("apps.catalog.models.Program")
    @patch("apps.applications.intake_enforcer.IntakeEnforcer")
    @patch(_SVC_HAS_DOC, return_value=True)
    @patch(_SVC_HAS_PAYMENT, return_value=True)
    def test_paid_late_fee_allows_submission(
        self, _pay, _doc, mock_enforcer, mock_prog, mock_fee, mock_payment_obj,
        mock_tx, mock_app_obj, mock_transition, mock_dup, mock_draft, mock_elig,
    ):
        """Late fee already paid → submission proceeds normally."""
        mock_enforcer.check_submission.return_value = IntakeCheckResult(allowed=True, is_late=True)
        mock_enforcer.increment_enrollment = MagicMock()

        app = _mock_app(status="draft", payment_status="paid")

        mock_prog.objects.filter.return_value.first.return_value = MagicMock()
        mock_late_fee = MagicMock()
        mock_late_fee.amount = 50
        mock_late_fee.currency = "ZMW"
        mock_fee.objects.filter.return_value.first.return_value = mock_late_fee
        mock_payment_obj.filter.return_value.exists.return_value = True  # late fee PAID

        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        locked = _mock_app(status="draft", payment_status="paid")
        mock_app_obj.select_for_update.return_value.get.return_value = locked
        mock_app_obj.filter.return_value.update = MagicMock()

        mock_dup.check_at_submit.return_value = MagicMock(has_duplicate=False)
        mock_transition.return_value = "draft"

        result_app, old_status = submit_application(
            application=app,
            changed_by=str(app.user_id),
            ip_address="127.0.0.1",
            user_agent="TestAgent/1.0",
        )

        assert result_app.is_late_submission is True
