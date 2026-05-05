"""Regression tests for the API documentation surface.

After Bug 5 fix (audit-security-remediation), OpenAPI docs require
authentication when DEBUG=False. The IsAuthenticatedOrDebug permission
class has been removed and replaced with IsAuthenticated.
"""

import os

from django.test import Client, SimpleTestCase, override_settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"


class ApiDocsTests(SimpleTestCase):
    def setUp(self):
        self.client = Client()

    @override_settings(DEBUG=True)
    def test_schema_endpoint_renders_successfully(self):
        """Schema requires authentication even in DEBUG mode."""
        response = self.client.get("/api/v1/schema/")
        self.assertIn(response.status_code, (401, 403))

    @override_settings(DEBUG=True)
    def test_swagger_ui_renders_successfully(self):
        """Swagger UI requires authentication even in DEBUG mode."""
        response = self.client.get("/api/v1/docs/")
        self.assertIn(response.status_code, (401, 403))

    @override_settings(DEBUG=False)
    def test_schema_endpoint_requires_auth_in_production(self):
        """Schema requires authentication when DEBUG=False."""
        response = self.client.get("/api/v1/schema/")
        self.assertIn(response.status_code, (401, 403))

    @override_settings(DEBUG=False)
    def test_swagger_ui_requires_auth_in_production(self):
        """Swagger UI requires authentication when DEBUG=False."""
        response = self.client.get("/api/v1/docs/")
        self.assertIn(response.status_code, (401, 403))

    def test_api_root_landing_page_is_available(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        html = response.content.decode("utf-8")
        self.assertIn("MIHAS Admissions API", html)
        self.assertIn("/api/v1/docs/", html)
        self.assertIn("Django ASGI on Uvicorn", html)
