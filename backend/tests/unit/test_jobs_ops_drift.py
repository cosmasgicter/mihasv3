"""Regression tests for the jobs-ops ORM/DB drift fix.

Spec: .kiro/specs/jobs-ops-orm-db-drift/

These tests assert the invariant that jobs-ops GET handlers serve seed data and
never *evaluate* the lazy ``JobApplication`` querysets (whose backing tables are
absent in the live DB). The ``get_queryset`` methods stay lazy + select_related
(verified by test_query_optimization.py); here we prove the request path is safe.
"""

import os
import importlib

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from django.test import Client, SimpleTestCase, override_settings
from django.urls import clear_url_caches


def _reload_urlconf():
    import config.urls

    importlib.reload(config.urls)
    clear_url_caches()


def _unwrap(response):
    payload = response.json()
    if isinstance(payload, dict) and "success" in payload:
        return payload["data"]
    return payload


class JobsOpsSeedReadInvariantTests(SimpleTestCase):
    """Requirement 2.4, 3.1 — GET handlers return seed envelopes without
    evaluating the JobApplication querysets against missing tables."""

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

    def test_jobs_list_returns_seed_without_raising(self):
        response = self.client.get("/api/v1/jobs/")
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertGreaterEqual(payload["totalCount"], 3)

    def test_job_detail_returns_seed_without_raising(self):
        response = self.client.get("/api/v1/jobs/7db809ec-6655-4bf0-93b5-38b778342680/")
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertIn("application_url", payload)

    def test_job_applications_list_returns_seed_without_raising(self):
        response = self.client.get("/api/v1/job-applications/")
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertGreaterEqual(payload["totalCount"], 3)

    def test_job_application_detail_returns_seed_without_raising(self):
        response = self.client.get(
            "/api/v1/job-applications/1f12ed0f-50d8-4370-bc02-04f01102483f/"
        )
        self.assertEqual(response.status_code, 200)
        payload = _unwrap(response)
        self.assertIn("job_id", payload)

    def test_get_queryset_methods_remain_lazy_and_select_related(self):
        """The querysets stay defined (lazy + select_related) but are never
        evaluated by the GET handlers above. Building them must not hit the DB."""
        from apps.jobs.views import JobApplicationDetailView, JobApplicationListCreateView

        for view_cls in (JobApplicationListCreateView, JobApplicationDetailView):
            qs = view_cls().get_queryset()
            select_related = (
                set(qs.query.select_related.keys())
                if isinstance(qs.query.select_related, dict)
                else set()
            )
            self.assertTrue({"job_posting", "candidate"}.issubset(select_related))
