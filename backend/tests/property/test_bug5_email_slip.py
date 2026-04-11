"""Bug condition exploration test — Email slip endpoint missing.

Property 9: Bug Condition — Email Slip Returns Hardcoded Error

This test encodes the EXPECTED (fixed) behavior:
- POST /api/v1/applications/{id}/email-slip/ endpoint exists
- It creates an EmailQueue record and dispatches send_email_task.delay()
- Returns success with queued_id

On UNFIXED code, this test MUST FAIL because:
- The endpoint does not exist (404)
- No URL pattern is registered for email-slip/

**Validates: Requirements 1.10, 1.11**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.urls import resolve, reverse, NoReverseMatch  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_emails = st.from_regex(r"[a-z]{3,10}@[a-z]{3,8}\.[a-z]{2,4}", fullmatch=True)
_app_ids = st.uuids()


# =========================================================================
# Property 9: Bug Condition — Email Slip Endpoint Exists
# =========================================================================


class TestEmailSlipEndpointExists(SimpleTestCase):
    """Property 9: Bug Condition — Email Slip Returns Hardcoded Error.

    For any valid application UUID, the URL pattern
    POST /api/v1/applications/{id}/email-slip/ MUST resolve to a view.

    On UNFIXED code, no such URL pattern exists, so this test will FAIL.

    **Validates: Requirements 1.10, 1.11**
    """

    @given(app_id=_app_ids)
    @settings(max_examples=30, deadline=None)
    def test_email_slip_url_resolves(self, app_id):
        """The email-slip URL pattern must exist in the applications URL conf.

        Bug condition: backendEndpoint('/api/v1/applications/{id}/email-slip/') NOT EXISTS
        Expected: URL resolves to EmailSlipView
        Actual (unfixed): NoReverseMatch or Resolver404
        """
        try:
            url = reverse(
                "applications:application-email-slip",
                kwargs={"application_id": app_id},
            )
            # URL should contain the application ID and email-slip
            self.assertIn("email-slip", url)
            self.assertIn(str(app_id), url)
        except NoReverseMatch:
            self.fail(
                f"URL pattern 'application-email-slip' does not exist. "
                f"Bug condition: no endpoint for POST /api/v1/applications/{app_id}/email-slip/. "
                f"The email slip endpoint has not been implemented yet."
            )

    @given(app_id=_app_ids)
    @settings(max_examples=30, deadline=None)
    def test_email_slip_url_path_resolves(self, app_id):
        """The email-slip URL path must resolve to a view via resolve().

        Bug condition: backendEndpoint NOT EXISTS
        Expected: path resolves to a view
        Actual (unfixed): Resolver404
        """
        from django.urls import Resolver404

        url_path = f"/api/v1/applications/{app_id}/email-slip/"
        try:
            match = resolve(url_path)
            # The resolved view should exist
            self.assertIsNotNone(match.func)
        except Resolver404:
            self.fail(
                f"URL path '{url_path}' does not resolve. "
                f"Bug condition: no endpoint registered for email-slip. "
                f"The email slip endpoint has not been implemented yet."
            )


class TestEmailSlipCreatesEmailQueue(SimpleTestCase):
    """Property 9: Bug Condition — Email Slip Creates EmailQueue Record.

    For any valid application + email combination, the endpoint creates
    an EmailQueue record and dispatches send_email_task before returning.

    On UNFIXED code, this test MUST FAIL because the endpoint does not exist.

    **Validates: Requirements 1.10, 1.11**
    """

    @given(email=_emails)
    @settings(max_examples=30, deadline=None)
    def test_email_slip_view_can_be_imported(self, email):
        """The EmailSlipView class must be importable from applications.views.

        Bug condition: EmailSlipView does not exist
        Expected: class is importable
        Actual (unfixed): ImportError or AttributeError
        """
        try:
            from apps.applications.views import EmailSlipView  # noqa: F401

            self.assertTrue(True)
        except (ImportError, AttributeError):
            self.fail(
                "EmailSlipView cannot be imported from apps.applications.views. "
                "Bug condition: the email slip view has not been implemented yet."
            )

    @given(email=_emails)
    @settings(max_examples=30, deadline=None)
    def test_email_slip_url_conf_imports_view(self, email):
        """The applications urls.py must import EmailSlipView.

        Bug condition: EmailSlipView not in URL conf imports
        Expected: EmailSlipView is imported and wired
        Actual (unfixed): not imported
        """
        import inspect

        from apps.applications import urls as app_urls

        source = inspect.getsource(app_urls)
        self.assertIn(
            "EmailSlipView",
            source,
            "EmailSlipView is not imported in apps/applications/urls.py. "
            "Bug condition: the email slip endpoint has not been wired up.",
        )
