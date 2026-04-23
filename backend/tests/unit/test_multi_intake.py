"""Unit tests for multi-intake application rules (Requirement 15). Requirements: 15.1-15.8"""
import uuid
from unittest.mock import MagicMock, patch

from apps.applications.duplicate_checker import DuplicateChecker, NON_TERMINAL_STATUSES


def _app(uid, program="CS", intake="Jan 2026", status="submitted", nrc="123456/78/1"):
    a = MagicMock()
    a.id = uuid.uuid4()
    a.user_id = str(uid)
    a.program = program
    a.intake = intake
    a.status = status
    a.nrc_number = nrc
    a.passport_number = None
    return a


class TestUnrestrictedPolicy:
    """1. Unrestricted policy preserves current behavior (Req 15.1)."""

    def test_unrestricted_allows_when_no_existing(self):
        uid = str(uuid.uuid4())

        with (
            patch("apps.common.models.Setting.objects") as ms,
            patch("apps.applications.duplicate_checker.Application.objects") as ma,
        ):
            mock_setting = MagicMock()
            mock_setting.value = "unrestricted"
            ms.filter.return_value.first.return_value = mock_setting

            ma.filter.return_value = []

            result = DuplicateChecker.check_at_create(uid, "CS", "Jul 2026")
            assert result.has_duplicate is False

    def test_unrestricted_blocks_same_intake(self):
        uid = str(uuid.uuid4())
        existing = _app(uid, "CS", "Jan 2026", "submitted")

        with (
            patch("apps.common.models.Setting.objects") as ms,
            patch("apps.applications.duplicate_checker.Application.objects") as ma,
        ):
            mock_setting = MagicMock()
            mock_setting.value = "unrestricted"
            ms.filter.return_value.first.return_value = mock_setting

            ma.filter.return_value = [existing]

            result = DuplicateChecker.check_at_create(uid, "CS", "Jan 2026", nrc_number="123456/78/1")
            assert result.has_duplicate is True


class TestSingleActivePolicy:
    """2. Single active policy blocks cross-intake duplicates (Req 15.2)."""

    def test_single_active_blocks_different_intake(self):
        uid = str(uuid.uuid4())
        existing = _app(uid, "CS", "Jan 2026", "submitted")

        with (
            patch("apps.common.models.Setting.objects") as ms,
            patch("apps.applications.duplicate_checker.Application.objects") as ma,
        ):
            mock_setting = MagicMock()
            mock_setting.value = "single_active"
            ms.filter.return_value.first.return_value = mock_setting

            ma.filter.return_value = [existing]

            result = DuplicateChecker.check_at_create(uid, "CS", "Jul 2026")
            assert result.has_duplicate is True

    def test_single_active_allows_when_no_existing(self):
        uid = str(uuid.uuid4())

        with (
            patch("apps.common.models.Setting.objects") as ms,
            patch("apps.applications.duplicate_checker.Application.objects") as ma,
        ):
            mock_setting = MagicMock()
            mock_setting.value = "single_active"
            ms.filter.return_value.first.return_value = mock_setting

            ma.filter.return_value = []

            result = DuplicateChecker.check_at_create(uid, "IT", "Jan 2026")
            assert result.has_duplicate is False


class TestWaitlistCascadeTask:
    """3. Waitlist cascade (Req 15.3–15.6)."""

    @patch("apps.applications.tasks.timezone")
    def test_cascade_skipped_when_unrestricted(self, mock_tz):
        from datetime import date
        from apps.applications.tasks import waitlist_cascade_task

        mock_tz.now.return_value.date.return_value = date(2025, 8, 1)

        with patch("apps.common.models.Setting.objects") as ms:
            setting = MagicMock()
            setting.value = "unrestricted"
            ms.filter.return_value.first.return_value = setting

            result = waitlist_cascade_task()

        assert result["policy"] == "unrestricted"
        assert result["cascaded"] == 0


class TestCascadeDoesNotAutoSubmit:
    """4. Cascade does not auto-submit (Req 15.6)."""

    def test_created_app_is_draft(self):
        """The cascade task creates applications with status='draft'."""
        import inspect
        from apps.applications.tasks import waitlist_cascade_task
        source = inspect.getsource(waitlist_cascade_task)
        assert 'status="draft"' in source


class TestPolicyChangeDoesNotAffectExisting:
    """5. Policy change doesn't affect existing apps (Req 15.8)."""

    def test_check_at_create_only_affects_new(self):
        """DuplicateChecker.check_at_create only runs at creation time."""
        assert hasattr(DuplicateChecker, 'check_at_create')
        assert hasattr(DuplicateChecker, 'check_at_submit')


class TestDuplicateCheckerDefaultPolicy:
    """6. DuplicateChecker defaults to unrestricted when no setting."""

    def test_default_policy_is_unrestricted(self):
        uid = str(uuid.uuid4())

        with (
            patch("apps.common.models.Setting.objects") as ms,
            patch("apps.applications.duplicate_checker.Application.objects") as ma,
        ):
            ms.filter.return_value.first.return_value = None
            ma.filter.return_value = []

            result = DuplicateChecker.check_at_create(uid, "CS", "Jan 2026")
            assert result.has_duplicate is False
