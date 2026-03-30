"""Regression tests for the public API documentation surface."""

import os

from django.test import Client, SimpleTestCase

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"


class ApiDocsTests(SimpleTestCase):
    def setUp(self):
        self.client = Client()

    def test_schema_endpoint_renders_successfully(self):
        response = self.client.get("/api/v1/schema/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/vnd.oai.openapi", response["Content-Type"])
        self.assertIn("openapi", response.content.decode("utf-8"))

    def test_swagger_ui_renders_successfully(self):
        response = self.client.get("/api/v1/docs/")
        self.assertEqual(response.status_code, 200)
        html = response.content.decode("utf-8")
        self.assertIn("swagger", html.lower())
        self.assertIn("/api/v1/schema/", html)

    def test_api_root_landing_page_is_available(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        html = response.content.decode("utf-8")
        self.assertIn("MIHAS Admissions API", html)
        self.assertIn("/api/v1/docs/", html)
        self.assertIn("Django ASGI on Uvicorn", html)
