"""Task 4.2: an empty ``FRONTEND_URL`` gives path-only links, never a production host."""
import logging

from django.test import SimpleTestCase, override_settings

from apps.common import email_links
from apps.common.outbox import _safe_action_url


class EmptyFrontendUrlLinks(SimpleTestCase):
    def setUp(self):
        email_links._warned_empty_frontend_url = False

    @override_settings(FRONTEND_URL="")
    def test_links_are_path_only(self):
        self.assertEqual(email_links.platform_base_url(), "")
        self.assertEqual(email_links.signin_url(), "/auth/signin")
        self.assertEqual(
            email_links.password_reset_url("tok"), "/auth/reset-password?token=tok"
        )

    @override_settings(FRONTEND_URL="")
    def test_one_warning_per_process_names_setting_not_value(self):
        with self.assertLogs("apps.common.email_links", level=logging.WARNING) as logs:
            email_links.signin_url()
            email_links.signup_url()
            email_links.student_dashboard_url()
        self.assertEqual(len(logs.records), 1)
        message = logs.records[0].getMessage()
        self.assertIn("FRONTEND_URL", message)
        self.assertNotIn("beanola", message)

    @override_settings(FRONTEND_URL="")
    def test_safe_action_url_rejects_absolute_url(self):
        self.assertIsNone(_safe_action_url("https://apply.beanola.com/student/dashboard"))
        self.assertIsNone(_safe_action_url("https://evil.example/x"))
        self.assertEqual(_safe_action_url("/student/dashboard"), "/student/dashboard")

    @override_settings(FRONTEND_URL="https://school.example")
    def test_configured_value_still_builds_absolute_links(self):
        self.assertEqual(email_links.signin_url(), "https://school.example/auth/signin")
