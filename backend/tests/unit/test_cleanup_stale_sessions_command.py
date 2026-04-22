"""Tests for stale device session cleanup command."""

import os
from io import StringIO
from unittest.mock import patch

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

django.setup()

from django.core.management import call_command
from django.test import SimpleTestCase


class TestCleanupStaleSessionsCommand(SimpleTestCase):
    @patch("apps.accounts.management.commands.cleanup_stale_sessions.deactivate_stale_sessions", return_value=4)
    def test_command_cleans_all_users_when_no_user_id(self, mock_cleanup):
        out = StringIO()

        call_command("cleanup_stale_sessions", stdout=out)

        mock_cleanup.assert_called_once_with(user_id=None)
        self.assertIn("4 session(s) deactivated", out.getvalue())

    @patch("apps.accounts.management.commands.cleanup_stale_sessions.deactivate_stale_sessions", return_value=2)
    def test_command_can_target_single_user(self, mock_cleanup):
        out = StringIO()
        user_id = "6e147ead-e34d-41e2-bc05-358a653ff633"

        call_command("cleanup_stale_sessions", "--user-id", user_id, stdout=out)

        mock_cleanup.assert_called_once_with(user_id=user_id)
        self.assertIn(user_id, out.getvalue())
