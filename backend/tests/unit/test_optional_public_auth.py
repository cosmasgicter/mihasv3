"""Optional public authentication behavior."""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from rest_framework.test import APIRequestFactory  # noqa: E402

from apps.accounts.authentication import OptionalJWTCookieAuthentication  # noqa: E402
from apps.catalog.views import ProgramListCreateView  # noqa: E402


class TestOptionalPublicAuth(SimpleTestCase):
    """Public catalog GETs should not fail when stale auth cookies are present."""

    def test_invalid_cookie_is_treated_as_anonymous(self):
        request = APIRequestFactory().get(
            "/api/v1/catalog/programs/",
            HTTP_COOKIE="access_token=not-a-jwt",
        )

        auth_result = OptionalJWTCookieAuthentication().authenticate(request)

        self.assertIsNone(auth_result)

    def test_program_get_uses_optional_authenticator(self):
        view = ProgramListCreateView()
        view.request = APIRequestFactory().get("/api/v1/catalog/programs/")

        authenticators = view.get_authenticators()

        self.assertEqual(len(authenticators), 1)
        self.assertIsInstance(authenticators[0], OptionalJWTCookieAuthentication)
