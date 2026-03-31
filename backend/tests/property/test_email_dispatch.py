"""Property-based tests for email dispatch.

# Feature: cto-assessment-remediation, Property 3: Email dispatch creates EmailQueue record before task dispatch

Tests that for any email dispatch (password reset or lockout), an EmailQueue
record with status='pending', a non-empty recipient_email, non-empty subject,
and non-empty body must exist in the database before send_email_task.delay()
is called with that record's ID.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_emails = st.from_regex(r"[a-z]{3,10}@[a-z]{3,8}\.[a-z]{2,4}", fullmatch=True)
_first_names = st.from_regex(r"[A-Z][a-z]{2,10}", fullmatch=True)
_last_names = st.from_regex(r"[A-Z][a-z]{2,10}", fullmatch=True)
_tokens = st.from_regex(r"[a-f0-9]{16,64}", fullmatch=True)


def _make_mock_user(email, first_name="Test", last_name="User"):
    """Build a mock Profile-like user object."""
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = email
    user.first_name = first_name
    user.last_name = last_name
    user.role = "student"
    user.is_active = True
    return user


# =========================================================================
# Property 3: Email dispatch creates EmailQueue record before task dispatch
# =========================================================================


class TestEmailDispatchCreatesQueueRecord(SimpleTestCase):
    """Property 3: Email dispatch creates EmailQueue record before task dispatch.

    For any email dispatch (password reset or lockout), an EmailQueue record
    with status='pending', a non-empty recipient_email, non-empty subject,
    and non-empty body must exist in the database before send_email_task.delay()
    is called with that record's ID.

    **Validates: Requirements 2.3**
    """

    @given(email=_emails)
    @settings(max_examples=100, deadline=None)
    def test_lockout_email_creates_queue_record_before_dispatch(self, email):
        """send_lockout_email() creates an EmailQueue record with correct
        fields before dispatching send_email_task.delay()."""
        user = _make_mock_user(email=email)

        call_order = []

        mock_record = MagicMock()
        mock_record.id = uuid.uuid4()
        mock_record.recipient_email = email
        mock_record.subject = "Account Temporarily Locked"
        mock_record.status = "pending"

        captured_create_kwargs = {}

        def mock_create(**kwargs):
            captured_create_kwargs.update(kwargs)
            call_order.append("create")
            return mock_record

        def mock_delay(*args, **kwargs):
            call_order.append("delay")

        with patch(
            "apps.common.models.EmailQueue.objects.create",
            side_effect=mock_create,
        ), patch(
            "apps.common.tasks.send_email_task.delay",
            side_effect=mock_delay,
        ):
            from apps.accounts.services import send_lockout_email

            send_lockout_email(user)

        self.assertEqual(call_order, ["create", "delay"])
        self.assertEqual(captured_create_kwargs["recipient_email"], email)
        self.assertEqual(captured_create_kwargs["status"], "pending")
        self.assertTrue(len(captured_create_kwargs["subject"]) > 0)
        self.assertTrue(len(captured_create_kwargs["body"]) > 0)

    @given(email=_emails, first_name=_first_names, last_name=_last_names)
    @settings(max_examples=100, deadline=None)
    def test_password_reset_creates_queue_record_before_dispatch(
        self, email, first_name, last_name
    ):
        """PasswordResetRequestView creates an EmailQueue record with correct
        fields before dispatching send_email_task.delay()."""
        from rest_framework.test import APIRequestFactory

        from apps.accounts.views import PasswordResetRequestView

        user = _make_mock_user(
            email=email, first_name=first_name, last_name=last_name
        )

        call_order = []

        mock_record = MagicMock()
        mock_record.id = uuid.uuid4()
        mock_record.recipient_email = email
        mock_record.status = "pending"

        captured_create_kwargs = {}

        def mock_create(**kwargs):
            captured_create_kwargs.update(kwargs)
            call_order.append("create")
            return mock_record

        def mock_delay(*args, **kwargs):
            call_order.append("delay")

        raw_token = "abc123testtoken"

        with patch(
            "apps.common.models.EmailQueue.objects.create",
            side_effect=mock_create,
        ), patch(
            "apps.common.tasks.send_email_task.delay",
            side_effect=mock_delay,
        ), patch(
            "apps.accounts.views.Profile.objects.get",
            return_value=user,
        ), patch(
            "apps.accounts.views.generate_password_reset_token",
            return_value=raw_token,
        ), patch(
            "apps.accounts.models.PasswordResetToken.objects.filter",
        ) as mock_reset_filter:
            mock_reset_filter.return_value.count.return_value = 0

            factory = APIRequestFactory()
            request = factory.post(
                "/api/v1/auth/password-reset/",
                {"email": email},
                format="json",
            )

            view = PasswordResetRequestView.as_view()
            view(request)

        self.assertEqual(call_order, ["create", "delay"])
        self.assertEqual(captured_create_kwargs["recipient_email"], email)
        self.assertEqual(captured_create_kwargs["status"], "pending")
        self.assertTrue(len(captured_create_kwargs["subject"]) > 0)
        self.assertTrue(len(captured_create_kwargs["body"]) > 0)


# =========================================================================
# Property 4: Password reset email contains token and base URL
# =========================================================================


class TestPasswordResetEmailContainsTokenAndUrl(SimpleTestCase):
    """Property 4: Password reset email contains token and base URL.

    # Feature: cto-assessment-remediation, Property 4: Password reset email contains token and base URL

    For any generated password reset token, the EmailQueue record body created
    for the reset email must contain both the raw token string and the frontend
    base URL (https://apply.mihas.edu.zm).

    **Validates: Requirements 2.5**
    """

    @given(token=_tokens, email=_emails)
    @settings(max_examples=100, deadline=None)
    def test_reset_email_body_contains_token_and_base_url(self, token, email):
        """PasswordResetRequestView creates an email body containing the raw
        token and the base URL https://apply.mihas.edu.zm."""
        from rest_framework.test import APIRequestFactory

        from apps.accounts.views import PasswordResetRequestView

        user = _make_mock_user(email=email)

        captured_create_kwargs = {}

        mock_record = MagicMock()
        mock_record.id = uuid.uuid4()

        def mock_create(**kwargs):
            captured_create_kwargs.update(kwargs)
            return mock_record

        with patch(
            "apps.common.models.EmailQueue.objects.create",
            side_effect=mock_create,
        ), patch(
            "apps.common.tasks.send_email_task.delay",
        ), patch(
            "apps.accounts.views.Profile.objects.get",
            return_value=user,
        ), patch(
            "apps.accounts.views.generate_password_reset_token",
            return_value=token,
        ), patch(
            "apps.accounts.models.PasswordResetToken.objects.filter",
        ) as mock_reset_filter:
            mock_reset_filter.return_value.count.return_value = 0

            factory = APIRequestFactory()
            request = factory.post(
                "/api/v1/auth/password-reset/",
                {"email": email},
                format="json",
            )

            view = PasswordResetRequestView.as_view()
            view(request)

        self.assertIn("body", captured_create_kwargs)
        body = captured_create_kwargs["body"]

        # Verify the raw token string is present in the body
        self.assertIn(token, body)

        # Verify the frontend base URL is present in the body
        self.assertIn("https://apply.mihas.edu.zm", body)
