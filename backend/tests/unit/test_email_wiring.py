"""Unit tests for email wiring — password reset and lockout email dispatch.

Tests:
- Password reset request dispatches email task (Requirement 2.1)
- Lockout triggers email task (Requirement 2.2)
- EmailQueue creation failure does not raise to caller (Requirement 2.4)
- Lockout email body contains lockout message (Requirement 2.6)
"""

import os
from contextlib import nullcontext

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid
from unittest.mock import MagicMock, patch

import django

django.setup()

from django.test import SimpleTestCase


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(email="student@example.com", user_id=None):
    """Build a minimal mock user (Profile-like) object."""
    user = MagicMock()
    user.id = user_id or uuid.uuid4()
    user.email = email
    user.first_name = "Test"
    user.last_name = "User"
    user.role = "student"
    user.is_active = True
    user.password_hash = "$2b$12$somebcrypthashvaluehere1234567890abcdef"
    return user


# =========================================================================
# Test: Password reset request dispatches email task
# Requirement 2.1
# =========================================================================


class TestPasswordResetDispatchesEmailTask(SimpleTestCase):
    """PasswordResetRequestView.post() should create an EmailQueue record
    and call send_email_task.delay() with its ID."""

    @patch("apps.common.outbox.transaction.on_commit", side_effect=lambda fn: fn())
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.tasks.send_email_task.delay")
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.EmailQueue.objects.create")
    @patch("apps.accounts.views.generate_password_reset_token")
    @patch("apps.accounts.models.PasswordResetToken.objects")
    @patch("apps.accounts.models.Profile.objects")
    def test_dispatches_email_task_on_valid_reset(
        self,
        mock_profile_objects,
        mock_reset_token_objects,
        mock_gen_token,
        mock_eq_create,
        mock_outbox_create,
        mock_delay,
        _mock_atomic,
        _mock_on_commit,
    ):
        user = _make_user()
        mock_profile_objects.get.return_value = user
        mock_reset_token_objects.filter.return_value.count.return_value = 0
        mock_gen_token.return_value = "abc123rawtoken"

        email_record = MagicMock()
        email_record.id = uuid.uuid4()
        mock_eq_create.return_value = email_record

        from rest_framework.test import APIRequestFactory

        from apps.accounts.views import PasswordResetRequestView

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/auth/password-reset/",
            {"email": "student@example.com"},
            format="json",
        )

        view = PasswordResetRequestView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)

        # EmailQueue.objects.create was called with the right fields
        mock_eq_create.assert_called_once()
        mock_outbox_create.assert_called_once()
        create_kwargs = mock_eq_create.call_args
        self.assertEqual(create_kwargs.kwargs["recipient_email"], "student@example.com")
        self.assertEqual(create_kwargs.kwargs["status"], "pending")
        self.assertIn("abc123rawtoken", create_kwargs.kwargs["body"])

        # send_email_task.delay was called with the email record ID
        mock_delay.assert_called_once_with(str(email_record.id))


# =========================================================================
# Test: Lockout triggers email task
# Requirement 2.2
# =========================================================================


class TestLockoutTriggersEmailTask(SimpleTestCase):
    """send_lockout_email() should create an EmailQueue record and
    call send_email_task.delay() with its ID."""

    @patch("apps.common.outbox.transaction.on_commit", side_effect=lambda fn: fn())
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.tasks.send_email_task.delay")
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.EmailQueue.objects.create")
    def test_lockout_dispatches_email_task(self, mock_eq_create, mock_outbox_create, mock_delay, _mock_atomic, _mock_on_commit):
        user = _make_user()

        email_record = MagicMock()
        email_record.id = uuid.uuid4()
        mock_eq_create.return_value = email_record

        from apps.accounts.services import send_lockout_email

        send_lockout_email(user)

        # EmailQueue.objects.create was called
        mock_eq_create.assert_called_once()
        mock_outbox_create.assert_called_once()
        create_kwargs = mock_eq_create.call_args
        self.assertEqual(create_kwargs.kwargs["recipient_email"], "student@example.com")
        self.assertEqual(create_kwargs.kwargs["status"], "pending")

        # send_email_task.delay was called
        mock_delay.assert_called_once_with(str(email_record.id))


# =========================================================================
# Test: EmailQueue creation failure does not raise to caller
# Requirement 2.4
# =========================================================================


class TestEmailQueueFailureDoesNotRaise(SimpleTestCase):
    """If EmailQueue.objects.create() raises, the caller should not see
    the exception — it should be swallowed and logged."""

    @patch("apps.common.outbox.transaction.on_commit", side_effect=lambda fn: fn())
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.tasks.send_email_task.delay")
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.EmailQueue.objects.create")
    def test_lockout_email_swallows_create_failure(self, mock_eq_create, mock_outbox_create, mock_delay, _mock_atomic, _mock_on_commit):
        mock_eq_create.side_effect = Exception("DB connection lost")

        user = _make_user()

        from apps.accounts.services import send_lockout_email

        # Should NOT raise
        send_lockout_email(user)

        # send_email_task.delay should NOT have been called
        mock_delay.assert_not_called()
        mock_outbox_create.assert_not_called()

    @patch("apps.common.outbox.transaction.on_commit", side_effect=lambda fn: fn())
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.tasks.send_email_task.delay")
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.EmailQueue.objects.create")
    @patch("apps.accounts.views.generate_password_reset_token")
    @patch("apps.accounts.models.PasswordResetToken.objects")
    @patch("apps.accounts.models.Profile.objects")
    def test_password_reset_swallows_create_failure(
        self,
        mock_profile_objects,
        mock_reset_token_objects,
        mock_gen_token,
        mock_eq_create,
        mock_outbox_create,
        mock_delay,
        _mock_atomic,
        _mock_on_commit,
    ):
        user = _make_user()
        mock_profile_objects.get.return_value = user
        mock_reset_token_objects.filter.return_value.count.return_value = 0
        mock_gen_token.return_value = "abc123rawtoken"
        mock_eq_create.side_effect = Exception("DB down")

        from rest_framework.test import APIRequestFactory

        from apps.accounts.views import PasswordResetRequestView

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/auth/password-reset/",
            {"email": "student@example.com"},
            format="json",
        )

        view = PasswordResetRequestView.as_view()
        # Should NOT raise — returns success regardless
        response = view(request)

        self.assertEqual(response.status_code, 200)
        mock_delay.assert_not_called()
        mock_outbox_create.assert_not_called()


# =========================================================================
# Test: Lockout email body contains lockout message
# Requirement 2.6
# =========================================================================


class TestLockoutEmailBodyContainsLockoutMessage(SimpleTestCase):
    """The lockout email body should inform the user their account has been
    temporarily locked due to repeated failed login attempts."""

    @patch("apps.common.outbox.transaction.on_commit", side_effect=lambda fn: fn())
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.tasks.send_email_task.delay")
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.EmailQueue.objects.create")
    def test_lockout_body_mentions_lockout(self, mock_eq_create, mock_outbox_create, mock_delay, _mock_atomic, _mock_on_commit):
        email_record = MagicMock()
        email_record.id = uuid.uuid4()
        mock_eq_create.return_value = email_record

        user = _make_user()

        from apps.accounts.services import send_lockout_email

        send_lockout_email(user)

        create_kwargs = mock_eq_create.call_args
        body = create_kwargs.kwargs["body"]

        # Body should mention lockout-related content
        self.assertIn("locked", body.lower())
        self.assertIn("failed login attempts", body.lower())
