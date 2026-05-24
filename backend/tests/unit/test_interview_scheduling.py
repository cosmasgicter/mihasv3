"""Unit tests for interview scheduling business rules (Requirement 2). Requirements: 2.1-2.12"""
from contextlib import nullcontext
import uuid
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.utils import timezone

from apps.applications.interview_service import (
    APPLICATION_CONFLICT_HOURS,
    INTERVIEW_ALLOWED_STATUSES,
    INTERVIEWER_CONFLICT_HOURS,
    MIN_NOTICE_HOURS,
    VALID_MODES,
    InterviewSchedulingError,
    InterviewService,
)


def _app(status="submitted", uid=None, aid=None):
    """Build a mock Application."""
    a = MagicMock()
    a.id = aid or uuid.uuid4()
    a.pk = a.id
    a.user_id = str(uid or uuid.uuid4())
    a.status = status
    a.program = "CS"
    a.intake = "Jan 2026"
    a.full_name = "Test Student"
    a.email = "student@example.com"
    return a


def _future(hours=72):
    return timezone.now() + timedelta(hours=hours)


_AI = "apps.applications.interview_service.ApplicationInterview"
_APP = "apps.applications.interview_service.Application"
_TRANSACTION = "apps.applications.interview_service.transaction.atomic"


class TestMinimumNoticeEnforcement:
    """1. Reject scheduling < 48 hours in advance (Req 2.2)."""

    def test_reject_under_48_hours(self):
        app = _app("submitted")
        too_soon = timezone.now() + timedelta(hours=24)
        with patch(f"{_AI}.objects"):
            try:
                InterviewService.validate_scheduling(app, too_soon, str(uuid.uuid4()))
                assert False, "Should have raised InterviewSchedulingError"
            except InterviewSchedulingError as exc:
                assert exc.code == "INSUFFICIENT_NOTICE"

    def test_reject_at_47_hours(self):
        app = _app("submitted")
        almost = timezone.now() + timedelta(hours=47)
        with patch(f"{_AI}.objects"):
            try:
                InterviewService.validate_scheduling(app, almost, str(uuid.uuid4()))
                assert False, "Should have raised InterviewSchedulingError"
            except InterviewSchedulingError as exc:
                assert exc.code == "INSUFFICIENT_NOTICE"

    def test_accept_at_49_hours(self):
        app = _app("submitted")
        ok_time = timezone.now() + timedelta(hours=49)
        with patch(f"{_AI}.objects") as mock_qs:
            mock_qs.filter.return_value.first.return_value = None
            result = InterviewService.validate_scheduling(app, ok_time, str(uuid.uuid4()))
        assert "warnings" in result


class TestTimeConflictDetection:
    """2. Reject if same application has interview within 2-hour window (Req 2.3)."""

    def test_conflict_within_2_hours(self):
        app = _app("submitted")
        proposed = _future(72)
        existing = MagicMock()
        existing.scheduled_at = proposed - timedelta(hours=1)

        with patch(f"{_AI}.objects") as mock_qs:
            # First filter call: application conflict check — returns existing
            # Second filter call: interviewer conflict check
            mock_qs.filter.return_value.first.side_effect = [existing, None]
            mock_qs.filter.return_value.exclude.return_value.first.return_value = None

            try:
                InterviewService.validate_scheduling(app, proposed, str(uuid.uuid4()))
                assert False, "Should have raised InterviewSchedulingError"
            except InterviewSchedulingError as exc:
                assert exc.code == "TIME_CONFLICT"

    def test_no_conflict_outside_window(self):
        app = _app("submitted")
        proposed = _future(72)

        with patch(f"{_AI}.objects") as mock_qs:
            # No conflicts found
            mock_qs.filter.return_value.first.return_value = None
            mock_qs.filter.return_value.exclude.return_value.first.return_value = None

            result = InterviewService.validate_scheduling(app, proposed, str(uuid.uuid4()))
        assert "warnings" in result
        assert result["warnings"] == []


class TestInterviewerConflictWarning:
    """3. Warn (not block) if admin has interview within 1-hour window (Req 2.4)."""

    def test_interviewer_conflict_returns_warning(self):
        app = _app("submitted")
        proposed = _future(72)
        admin_id = str(uuid.uuid4())

        conflicting = MagicMock()
        conflicting.scheduled_at = proposed - timedelta(minutes=30)
        conflicting.application_id = uuid.uuid4()
        conflicting.id = uuid.uuid4()

        with patch(f"{_AI}.objects") as mock_qs:
            # Application conflict: none
            # Interviewer conflict: found one
            mock_qs.filter.return_value.first.return_value = None
            mock_qs.filter.return_value.exclude.return_value.first.return_value = conflicting

            result = InterviewService.validate_scheduling(app, proposed, admin_id)

        assert len(result["warnings"]) == 1
        assert result["warnings"][0]["code"] == "INTERVIEWER_CONFLICT"

    def test_no_interviewer_conflict_no_warning(self):
        app = _app("submitted")
        proposed = _future(72)

        with patch(f"{_AI}.objects") as mock_qs:
            mock_qs.filter.return_value.first.return_value = None
            mock_qs.filter.return_value.exclude.return_value.first.return_value = None

            result = InterviewService.validate_scheduling(app, proposed, str(uuid.uuid4()))

        assert result["warnings"] == []


class TestAutoTransitionToUnderReview:
    """4. Auto-transition application to under_review on interview creation (Req 2.11)."""

    @patch("apps.applications.interview_service._send_interview_notification")
    @patch("apps.applications.interview_service.transition_application_status")
    @patch(f"{_AI}.objects")
    @patch(f"{_APP}.objects")
    @patch(_TRANSACTION, side_effect=lambda: nullcontext())
    def test_submitted_transitions_to_under_review(
        self, mock_atomic, mock_app_qs, mock_qs, mock_transition, mock_notify
    ):
        app = _app("submitted")
        scheduled = _future(72)
        admin_id = str(uuid.uuid4())

        mock_app_qs.select_for_update.return_value.get.return_value = app
        # validate_scheduling mocks
        mock_qs.filter.return_value.first.return_value = None
        mock_qs.filter.return_value.exclude.return_value.first.return_value = None
        mock_qs.create.return_value = MagicMock(id=uuid.uuid4())

        InterviewService.schedule_interview(
            application=app,
            scheduled_at=scheduled,
            mode="phone",
            admin_id=admin_id,
        )

        mock_transition.assert_called_once_with(
            application=app,
            new_status="under_review",
            changed_by=admin_id,
            notes="Auto-transitioned to under_review on interview scheduling.",
        )

    @patch("apps.applications.interview_service._send_interview_notification")
    @patch("apps.applications.interview_service.transition_application_status")
    @patch(f"{_AI}.objects")
    @patch(f"{_APP}.objects")
    @patch(_TRANSACTION, side_effect=lambda: nullcontext())
    def test_under_review_does_not_transition(
        self, mock_atomic, mock_app_qs, mock_qs, mock_transition, mock_notify
    ):
        app = _app("under_review")
        scheduled = _future(72)

        mock_app_qs.select_for_update.return_value.get.return_value = app
        mock_qs.filter.return_value.first.return_value = None
        mock_qs.filter.return_value.exclude.return_value.first.return_value = None
        mock_qs.create.return_value = MagicMock(id=uuid.uuid4())

        InterviewService.schedule_interview(
            application=app,
            scheduled_at=scheduled,
            mode="phone",
            admin_id=str(uuid.uuid4()),
        )

        mock_transition.assert_not_called()


class TestNotificationCreation:
    """5. Notification created on schedule, reschedule, and cancel (Req 2.5, 2.6, 2.7)."""

    @patch("apps.applications.interview_service._send_interview_notification")
    @patch("apps.applications.interview_service.transition_application_status")
    @patch(f"{_AI}.objects")
    @patch(f"{_APP}.objects")
    @patch(_TRANSACTION, side_effect=lambda: nullcontext())
    def test_schedule_sends_notification(
        self, mock_atomic, mock_app_qs, mock_qs, mock_transition, mock_notify
    ):
        app = _app("submitted")
        scheduled = _future(72)

        mock_app_qs.select_for_update.return_value.get.return_value = app
        mock_qs.filter.return_value.first.return_value = None
        mock_qs.filter.return_value.exclude.return_value.first.return_value = None
        created_interview = MagicMock(id=uuid.uuid4())
        mock_qs.create.return_value = created_interview

        InterviewService.schedule_interview(
            application=app, scheduled_at=scheduled,
            mode="phone", admin_id=str(uuid.uuid4()),
        )

        mock_notify.assert_called_once()
        call_kwargs = mock_notify.call_args
        assert call_kwargs[1]["template"] == "interview_scheduled" or call_kwargs[0][2] == "interview_scheduled"

    @patch("apps.applications.interview_service._send_interview_notification")
    @patch(f"{_AI}.objects")
    @patch(_TRANSACTION, side_effect=lambda: nullcontext())
    def test_reschedule_sends_notification(self, mock_atomic, mock_qs, mock_notify):
        interview = MagicMock()
        interview.application = _app("under_review")
        interview.mode = "phone"
        interview.location = ""
        interview.notes = ""
        interview.save = MagicMock()
        new_time = _future(96)

        # select_for_update().get() must return the same interview mock
        mock_qs.select_for_update.return_value.get.return_value = interview
        mock_qs.filter.return_value.first.return_value = None
        mock_qs.filter.return_value.exclude.return_value.first.return_value = None

        InterviewService.reschedule_interview(
            interview=interview, new_scheduled_at=new_time,
            admin_id=str(uuid.uuid4()), reason="Conflict",
        )

        mock_notify.assert_called_once()
        args = mock_notify.call_args
        # template should be interview_rescheduled
        assert "interview_rescheduled" in str(args)

    @patch("apps.applications.interview_service._send_interview_notification")
    def test_cancel_sends_notification(self, mock_notify):
        interview = MagicMock()
        interview.application = _app("under_review")
        interview.notes = ""
        interview.save = MagicMock()

        InterviewService.cancel_interview(
            interview=interview,
            cancellation_reason="No longer needed",
            admin_id=str(uuid.uuid4()),
        )

        mock_notify.assert_called_once()
        args = mock_notify.call_args
        assert "interview_cancelled" in str(args)

    def test_cancel_requires_reason(self):
        interview = MagicMock()
        interview.application = _app("under_review")

        try:
            InterviewService.cancel_interview(
                interview=interview, cancellation_reason="",
                admin_id=str(uuid.uuid4()),
            )
            assert False, "Should have raised InterviewSchedulingError"
        except InterviewSchedulingError as exc:
            assert exc.code == "CANCELLATION_REASON_REQUIRED"


class TestModeValidationAndVirtualURL:
    """6. Mode validation and virtual URL requirement (Req 2.9, 2.10)."""

    def test_invalid_mode_rejected(self):
        try:
            InterviewService._validate_mode("video_call", None, None)
            assert False, "Should have raised InterviewSchedulingError"
        except InterviewSchedulingError as exc:
            assert exc.code == "INVALID_MODE"

    def test_valid_modes_accepted(self):
        for mode in VALID_MODES:
            if mode == "virtual":
                InterviewService._validate_mode(mode, "https://meet.example.com", None)
            else:
                InterviewService._validate_mode(mode, None, None)

    def test_virtual_requires_url_in_location(self):
        # No URL anywhere
        try:
            InterviewService._validate_mode("virtual", "Room 101", "No link here")
            assert False, "Should have raised InterviewSchedulingError"
        except InterviewSchedulingError as exc:
            assert exc.code == "VIRTUAL_URL_REQUIRED"

    def test_virtual_accepts_url_in_location(self):
        InterviewService._validate_mode("virtual", "https://zoom.us/j/123", None)

    def test_virtual_accepts_url_in_notes(self):
        InterviewService._validate_mode("virtual", None, "Join at https://meet.google.com/abc")

    def test_phone_and_in_person_no_url_needed(self):
        InterviewService._validate_mode("phone", None, None)
        InterviewService._validate_mode("in_person", "Room 5", None)


class TestStatusValidation:
    """7. Only allowed statuses can schedule interviews (Req 2.1)."""

    def test_allowed_statuses(self):
        assert INTERVIEW_ALLOWED_STATUSES == {"submitted", "under_review", "waitlisted"}

    def test_rejected_status_blocked(self):
        app = _app("rejected")
        try:
            InterviewService.validate_scheduling(app, _future(72), str(uuid.uuid4()))
            assert False, "Should have raised InterviewSchedulingError"
        except InterviewSchedulingError as exc:
            assert exc.code == "INVALID_STATUS_FOR_INTERVIEW"

    def test_draft_status_blocked(self):
        app = _app("draft")
        try:
            InterviewService.validate_scheduling(app, _future(72), str(uuid.uuid4()))
            assert False, "Should have raised"
        except InterviewSchedulingError as exc:
            assert exc.code == "INVALID_STATUS_FOR_INTERVIEW"

    def test_approved_status_blocked(self):
        app = _app("approved")
        try:
            InterviewService.validate_scheduling(app, _future(72), str(uuid.uuid4()))
            assert False, "Should have raised"
        except InterviewSchedulingError as exc:
            assert exc.code == "INVALID_STATUS_FOR_INTERVIEW"


class TestServiceConstants:
    """8. Service constants match requirements."""

    def test_min_notice_hours(self):
        assert MIN_NOTICE_HOURS == 48

    def test_application_conflict_hours(self):
        assert APPLICATION_CONFLICT_HOURS == 2

    def test_interviewer_conflict_hours(self):
        assert INTERVIEWER_CONFLICT_HOURS == 1

    def test_valid_modes(self):
        assert VALID_MODES == {"virtual", "phone", "in_person"}
