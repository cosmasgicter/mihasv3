"""Regression tests for the Jobs Ops v1 API surface."""

import importlib
import os
import uuid

from django.test import Client, SimpleTestCase, override_settings
from django.urls import clear_url_caches

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"


def _reload_urlconf():
    import config.urls

    importlib.reload(config.urls)
    clear_url_caches()


def _unwrap(response):
    payload = response.json()
    if isinstance(payload, dict) and "success" in payload:
        return payload["data"]
    return payload


class JobsOpsEndpointTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._jobs_ops_routes = override_settings(ENABLE_JOBS_OPS_ROUTES=True)
        cls._jobs_ops_routes.enable()
        _reload_urlconf()

    @classmethod
    def tearDownClass(cls):
        cls._jobs_ops_routes.disable()
        _reload_urlconf()
        super().tearDownClass()

    def setUp(self):
        self.client = Client()

    def test_platform_meta_is_public_and_includes_attribution(self):
        response = self.client.get("/api/v1/meta/platform/")
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertEqual(payload["creator"]["name"], "Cosmas Kanchepa")
        self.assertEqual(payload["developer"]["name"], "Beanola Technologies")
        self.assertEqual(payload["developer"]["url"], "https://beanola.com")

    def test_jobs_list_is_public_and_returns_seeded_results(self):
        response = self.client.get("/api/v1/jobs/")
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertGreaterEqual(payload["totalCount"], 3)
        self.assertEqual(payload["results"][0]["recommendation"], "apply_now")

    def test_job_detail_is_public_and_contains_source_lineage(self):
        response = self.client.get("/api/v1/jobs/7db809ec-6655-4bf0-93b5-38b778342680/")
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertIn("application_url", payload)
        self.assertGreaterEqual(len(payload["source_names"]), 1)

    def test_job_applications_list_is_public(self):
        response = self.client.get("/api/v1/job-applications/")
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertGreaterEqual(payload["totalCount"], 3)
        self.assertIn("job_id", payload["results"][0])

    def test_job_application_submit_requires_authentication(self):
        response = self.client.post(f"/api/v1/job-applications/{uuid.uuid4()}/submit/")
        self.assertIn(response.status_code, (401, 403))

    def test_outreach_contacts_list_is_public(self):
        response = self.client.get("/api/v1/outreach/contacts/")
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertGreaterEqual(payload["totalCount"], 2)
        self.assertIn("full_name", payload["results"][0])

    def test_automation_runs_list_is_public(self):
        response = self.client.get("/api/v1/automation/runs/")
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertGreaterEqual(payload["totalCount"], 3)
        self.assertIn("run_type", payload["results"][0])

    def test_automation_run_approve_requires_authentication(self):
        response = self.client.post(f"/api/v1/automation/runs/{uuid.uuid4()}/approve/")
        self.assertIn(response.status_code, (401, 403))

    def test_email_threads_list_requires_auth(self):
        """After Bug 4 fix, email threads require authentication."""
        response = self.client.get("/api/v1/email/threads/")
        self.assertIn(response.status_code, (401, 403))

    def test_resume_assets_list_requires_auth(self):
        """After Bug 4 fix, resume assets require authentication."""
        response = self.client.get("/api/v1/documents/resumes/")
        self.assertIn(response.status_code, (401, 403))

    def test_analytics_and_digest_routes_require_auth(self):
        """After Bug 4 fix, analytics funnel and daily digest require authentication."""
        funnel_response = self.client.get("/api/v1/analytics/funnel/")
        digest_response = self.client.get("/api/v1/reports/daily-digest/")
        # FunnelAnalyticsView was already IsAuthenticated; DailyDigestReportView
        # was changed from AllowAny to IsAuthenticated in Bug 4 fix.
        self.assertIn(funnel_response.status_code, (401, 403))
        self.assertIn(digest_response.status_code, (401, 403))
