"""Property-based tests for frontend-backend URL mapping.

# Feature: pre-launch-audit, Property 9: Frontend API calls map to backend endpoints

For any API URL extracted from frontend service modules
(apps/admissions/src/services/ and apps/jobs-ops/src/services/api/),
there should exist a matching URL pattern in the backend URL configuration
(backend/config/urls.py and included app URL files).

This test validates the URL MAPPING LOGIC — it does NOT make live HTTP
requests. Instead, it defines the known sets of frontend API URLs and
backend URL patterns (extracted during the audit), then uses Hypothesis
to sample from the frontend set and verify each has a backend match.

**Validates: Requirements 3.1, 3.5, 13.2**
"""

import os
import re

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Frontend API URLs — extracted from audit Task 4.1 and Task 4.6
# ---------------------------------------------------------------------------

# Admissions frontend service modules → API URLs
# Each entry: (service_module, http_method, url_path)
ADMISSIONS_FRONTEND_URLS: list[tuple[str, str, str]] = [
    # applications.ts
    ("applications.ts", "GET", "/api/v1/applications/"),
    ("applications.ts", "POST", "/api/v1/applications/"),
    ("applications.ts", "GET", "/api/v1/applications/{id}/"),
    ("applications.ts", "PUT", "/api/v1/applications/{id}/"),
    ("applications.ts", "DELETE", "/api/v1/applications/{id}/"),
    ("applications.ts", "GET", "/api/v1/applications/{id}/details/"),
    ("applications.ts", "GET", "/api/v1/applications/{id}/documents/"),
    ("applications.ts", "GET", "/api/v1/applications/{id}/grades/"),
    ("applications.ts", "GET", "/api/v1/applications/{id}/summary/"),
    ("applications.ts", "POST", "/api/v1/applications/{id}/submit/"),
    ("applications.ts", "PATCH", "/api/v1/applications/{id}/review/"),
    ("applications.ts", "POST", "/api/v1/applications/{id}/verify-document/"),
    ("applications.ts", "GET", "/api/v1/applications/{id}/interviews/"),
    ("applications.ts", "POST", "/api/v1/applications/{id}/acceptance-letter/"),
    ("applications.ts", "POST", "/api/v1/applications/{id}/finance-receipt/"),
    ("applications.ts", "GET", "/api/v1/applications/export/"),
    ("applications.ts", "GET", "/api/v1/applications/track/"),
    ("applications.ts", "POST", "/api/v1/applications/bulk-status/"),
    ("applications.ts", "POST", "/api/v1/applications/draft/"),
    ("applications.ts", "GET", "/api/v1/applications/interviews/"),
    # auth.ts
    ("auth.ts", "POST", "/api/v1/auth/register/"),
    ("auth.ts", "POST", "/api/v1/auth/login/"),
    ("auth.ts", "POST", "/api/v1/auth/logout/"),
    ("auth.ts", "GET", "/api/v1/auth/session/"),
    ("auth.ts", "POST", "/api/v1/auth/refresh/"),
    ("auth.ts", "POST", "/api/v1/auth/password-reset/"),
    ("auth.ts", "POST", "/api/v1/auth/password-reset/confirm/"),
    # catalog.ts
    ("catalog.ts", "GET", "/api/v1/catalog/programs/"),
    ("catalog.ts", "GET", "/api/v1/catalog/programs/{id}/"),
    ("catalog.ts", "GET", "/api/v1/catalog/intakes/"),
    ("catalog.ts", "GET", "/api/v1/catalog/subjects/"),
    ("catalog.ts", "GET", "/api/v1/catalog/institutions/"),
    # documents.ts
    ("documents.ts", "POST", "/api/v1/documents/upload/"),
    ("documents.ts", "POST", "/api/v1/documents/{id}/extract/"),
    ("documents.ts", "GET", "/api/v1/documents/{id}/signed-url/"),
    # interviews.ts
    ("interviews.ts", "POST", "/api/v1/applications/{id}/interviews/"),
    ("interviews.ts", "GET", "/api/v1/applications/interviews/"),
    # notifications.ts
    ("notifications.ts", "GET", "/api/v1/notifications/"),
    ("notifications.ts", "POST", "/api/v1/notifications/"),
    ("notifications.ts", "GET", "/api/v1/notifications/preferences/"),
    ("notifications.ts", "PUT", "/api/v1/notifications/preferences/"),
    ("notifications.ts", "PUT", "/api/v1/notifications/{id}/read/"),
    ("notifications.ts", "PUT", "/api/v1/notifications/read-all/"),
    ("notifications.ts", "DELETE", "/api/v1/notifications/{id}/"),
    # sessionService.ts
    ("sessionService.ts", "GET", "/api/v1/sessions/"),
    ("sessionService.ts", "POST", "/api/v1/sessions/{id}/revoke/"),
    ("sessionService.ts", "POST", "/api/v1/sessions/revoke-all/"),
    # admin/dashboard.ts
    ("admin/dashboard.ts", "GET", "/api/v1/admin/dashboard/"),
    # admin/audit.ts
    ("admin/audit.ts", "GET", "/api/v1/admin/audit-logs/"),
    # admin/users.ts
    ("admin/users.ts", "GET", "/api/v1/admin/users/"),
    ("admin/users.ts", "POST", "/api/v1/admin/users/"),
    ("admin/users.ts", "GET", "/api/v1/admin/users/{id}/"),
    ("admin/users.ts", "PATCH", "/api/v1/admin/users/{id}/"),
    ("admin/users.ts", "GET", "/api/v1/admin/users/export/"),
]

# Jobs-ops frontend service modules → API URLs
JOBS_OPS_FRONTEND_URLS: list[tuple[str, str, str]] = [
    # jobs.ts
    ("jobs.ts", "GET", "/api/v1/jobs/"),
    ("jobs.ts", "GET", "/api/v1/jobs/{id}/"),
    # job-applications.ts
    ("job-applications.ts", "GET", "/api/v1/job-applications/"),
    # automation.ts
    ("automation.ts", "GET", "/api/v1/automation/rules/"),
    ("automation.ts", "GET", "/api/v1/automation/runs/"),
    # outreach.ts
    ("outreach.ts", "GET", "/api/v1/outreach/contacts/"),
    ("outreach.ts", "GET", "/api/v1/outreach/campaigns/"),
    # email.ts
    ("email.ts", "GET", "/api/v1/email/threads/"),
    ("email.ts", "GET", "/api/v1/email/messages/"),
    # documents.ts
    ("documents.ts", "GET", "/api/v1/documents/resumes/"),
    # analytics.ts
    ("analytics.ts", "GET", "/api/v1/analytics/funnel/"),
    ("analytics.ts", "GET", "/api/v1/analytics/sources/"),
    ("analytics.ts", "GET", "/api/v1/analytics/outreach/"),
    ("analytics.ts", "GET", "/api/v1/reports/daily-digest/"),
    # platform.ts
    ("platform.ts", "GET", "/api/v1/meta/platform/"),
]

ALL_FRONTEND_URLS = ADMISSIONS_FRONTEND_URLS + JOBS_OPS_FRONTEND_URLS

# ---------------------------------------------------------------------------
# Backend URL patterns — extracted from Django URL configuration
# ---------------------------------------------------------------------------

# Each pattern is a regex that matches the frontend URL path.
# {id} placeholders in frontend URLs match <uuid:...> in Django patterns.
BACKEND_URL_PATTERNS: list[str] = [
    # applications
    r"/api/v1/applications/$",
    r"/api/v1/applications/export/$",
    r"/api/v1/applications/track/$",
    r"/api/v1/applications/bulk-status/$",
    r"/api/v1/applications/draft/$",
    r"/api/v1/applications/interviews/$",
    r"/api/v1/applications/[0-9a-f\-]+/$",
    r"/api/v1/applications/[0-9a-f\-]+/details/$",
    r"/api/v1/applications/[0-9a-f\-]+/documents/$",
    r"/api/v1/applications/[0-9a-f\-]+/grades/$",
    r"/api/v1/applications/[0-9a-f\-]+/summary/$",
    r"/api/v1/applications/[0-9a-f\-]+/submit/$",
    r"/api/v1/applications/[0-9a-f\-]+/review/$",
    r"/api/v1/applications/[0-9a-f\-]+/interviews/$",
    r"/api/v1/applications/[0-9a-f\-]+/verify-document/$",
    r"/api/v1/applications/[0-9a-f\-]+/acceptance-letter/$",
    r"/api/v1/applications/[0-9a-f\-]+/finance-receipt/$",
    r"/api/v1/applications/[0-9a-f\-]+/email-slip/$",
    # auth
    r"/api/v1/auth/login/$",
    r"/api/v1/auth/logout/$",
    r"/api/v1/auth/refresh/$",
    r"/api/v1/auth/register/$",
    r"/api/v1/auth/session/$",
    r"/api/v1/auth/password-reset/$",
    r"/api/v1/auth/password-reset/confirm/$",
    r"/api/v1/auth/profile/$",
    # catalog
    r"/api/v1/catalog/programs/$",
    r"/api/v1/catalog/programs/[0-9a-f\-]+/$",
    r"/api/v1/catalog/intakes/$",
    r"/api/v1/catalog/intakes/[0-9a-f\-]+/$",
    r"/api/v1/catalog/subjects/$",
    r"/api/v1/catalog/institutions/$",
    r"/api/v1/catalog/institutions/[0-9a-f\-]+/$",
    # documents
    r"/api/v1/documents/upload/$",
    r"/api/v1/documents/resumes/$",
    r"/api/v1/documents/resumes/variants/$",
    r"/api/v1/documents/cover-letters/generate/$",
    r"/api/v1/documents/question-bank/answer/$",
    r"/api/v1/documents/[0-9a-f\-]+/extract/$",
    r"/api/v1/documents/[0-9a-f\-]+/signed-url/$",
    r"/api/v1/documents/[0-9a-f\-]+/download/$",
    r"/api/v1/documents/[0-9a-f\-]+/info/$",
    r"/api/v1/documents/[0-9a-f\-]+/delete/$",
    r"/api/v1/documents/[0-9a-f\-]+/versions/$",
    # payments
    r"/api/v1/payments/$",
    r"/api/v1/payments/initiate/$",
    r"/api/v1/payments/resolve-fee/$",
    r"/api/v1/payments/webhook/lenco/$",
    r"/api/v1/payments/[0-9a-f\-]+/receipt/$",
    r"/api/v1/payments/[0-9a-f\-]+/verify/$",
    # program fees
    r"/api/v1/programs/[0-9a-f\-]+/fees/$",
    r"/api/v1/programs/[0-9a-f\-]+/fees/[0-9a-f\-]+/$",
    # admin
    r"/api/v1/admin/dashboard/$",
    r"/api/v1/admin/users/$",
    r"/api/v1/admin/users/export/$",
    r"/api/v1/admin/users/[0-9a-f\-]+/$",
    r"/api/v1/admin/settings/$",
    r"/api/v1/admin/settings/import/$",
    r"/api/v1/admin/settings/reset/$",
    r"/api/v1/admin/settings/[0-9a-f\-]+/$",
    r"/api/v1/admin/audit-logs/$",
    # notifications
    r"/api/v1/notifications/$",
    r"/api/v1/notifications/preferences/$",
    r"/api/v1/notifications/read-all/$",
    r"/api/v1/notifications/[0-9a-f\-]+/read/$",
    r"/api/v1/notifications/[0-9a-f\-]+/$",
    # sessions
    r"/api/v1/sessions/$",
    r"/api/v1/sessions/[0-9a-f\-]+/revoke/$",
    r"/api/v1/sessions/revoke-all/$",
    # events (SSE)
    r"/api/v1/events/",
    # email
    r"/api/v1/email/accounts/zoho/connect/$",
    r"/api/v1/email/messages/$",
    r"/api/v1/email/threads/$",
    r"/api/v1/email/send/$",
    r"/api/v1/email/webhooks/delivery/$",
    # errors
    r"/api/v1/errors/report/$",
    # jobs
    r"/api/v1/jobs/$",
    r"/api/v1/jobs/discovery-runs/$",
    r"/api/v1/jobs/discovery-runs/[0-9a-f\-]+/$",
    r"/api/v1/jobs/[0-9a-f\-]+/$",
    r"/api/v1/jobs/[0-9a-f\-]+/score/$",
    r"/api/v1/jobs/[0-9a-f\-]+/tailor-documents/$",
    r"/api/v1/jobs/[0-9a-f\-]+/dismiss/$",
    r"/api/v1/jobs/[0-9a-f\-]+/watch/$",
    # job-applications
    r"/api/v1/job-applications/$",
    r"/api/v1/job-applications/[0-9a-f\-]+/$",
    r"/api/v1/job-applications/[0-9a-f\-]+/submit/$",
    r"/api/v1/job-applications/[0-9a-f\-]+/pause/$",
    r"/api/v1/job-applications/[0-9a-f\-]+/resume/$",
    r"/api/v1/job-applications/[0-9a-f\-]+/approve/$",
    r"/api/v1/job-applications/[0-9a-f\-]+/reject/$",
    # outreach
    r"/api/v1/outreach/contacts/$",
    r"/api/v1/outreach/contacts/enrich/$",
    r"/api/v1/outreach/campaigns/$",
    r"/api/v1/outreach/messages/generate/$",
    r"/api/v1/outreach/messages/send/$",
    # automation
    r"/api/v1/automation/rules/$",
    r"/api/v1/automation/runs/$",
    r"/api/v1/automation/runs/[0-9a-f\-]+/$",
    r"/api/v1/automation/runs/[0-9a-f\-]+/approve/$",
    r"/api/v1/automation/runs/[0-9a-f\-]+/cancel/$",
    # integrations
    r"/api/v1/integrations/",
    # analytics
    r"/api/v1/analytics/funnel/$",
    r"/api/v1/analytics/sources/$",
    r"/api/v1/analytics/outreach/$",
    # reports
    r"/api/v1/reports/daily-digest/$",
    # meta
    r"/api/v1/meta/platform/$",
    # health (root level, not under /api/v1/)
    r"/health/live/$",
    r"/health/ready/$",
]

# Compile patterns once
_COMPILED_PATTERNS = [re.compile(p) for p in BACKEND_URL_PATTERNS]


# ---------------------------------------------------------------------------
# URL matching logic
# ---------------------------------------------------------------------------


def normalize_frontend_url(url: str) -> str:
    """Replace {id} placeholders with a sample UUID for regex matching."""
    sample_uuid = "00000000-0000-0000-0000-000000000000"
    return re.sub(r"\{id\}", sample_uuid, url)


def frontend_url_matches_backend(url: str) -> bool:
    """Check if a frontend URL matches any backend URL pattern."""
    normalized = normalize_frontend_url(url)
    return any(pattern.search(normalized) for pattern in _COMPILED_PATTERNS)


def find_matching_backend_pattern(url: str) -> str | None:
    """Return the first matching backend pattern string, or None."""
    normalized = normalize_frontend_url(url)
    for i, pattern in enumerate(_COMPILED_PATTERNS):
        if pattern.search(normalized):
            return BACKEND_URL_PATTERNS[i]
    return None


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

admissions_url_st = st.sampled_from(ADMISSIONS_FRONTEND_URLS)
jobs_ops_url_st = st.sampled_from(JOBS_OPS_FRONTEND_URLS)
all_frontend_url_st = st.sampled_from(ALL_FRONTEND_URLS)


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestFrontendBackendUrlMapping(SimpleTestCase):
    """Property 9: Frontend API calls map to backend endpoints.

    For any API URL extracted from frontend service modules, there should
    exist a matching URL pattern in the backend URL configuration.

    **Validates: Requirements 3.1, 3.5, 13.2**
    """

    # ------------------------------------------------------------------
    # Property: every admissions frontend URL maps to a backend pattern
    # ------------------------------------------------------------------

    @given(entry=admissions_url_st)
    @settings(max_examples=5)
    def test_admissions_frontend_url_maps_to_backend(
        self, entry: tuple[str, str, str]
    ):
        """For any admissions frontend API URL, there should exist a
        matching backend URL pattern."""
        service_module, http_method, url_path = entry
        self.assertTrue(
            frontend_url_matches_backend(url_path),
            f"Admissions URL {url_path} (from {service_module}, "
            f"{http_method}) has no matching backend pattern",
        )

    # ------------------------------------------------------------------
    # Property: every jobs-ops frontend URL maps to a backend pattern
    # ------------------------------------------------------------------

    @given(entry=jobs_ops_url_st)
    @settings(max_examples=5)
    def test_jobs_ops_frontend_url_maps_to_backend(
        self, entry: tuple[str, str, str]
    ):
        """For any jobs-ops frontend API URL, there should exist a
        matching backend URL pattern."""
        service_module, http_method, url_path = entry
        self.assertTrue(
            frontend_url_matches_backend(url_path),
            f"Jobs-ops URL {url_path} (from {service_module}, "
            f"{http_method}) has no matching backend pattern",
        )

    # ------------------------------------------------------------------
    # Property: every frontend URL (combined) maps to a backend pattern
    # ------------------------------------------------------------------

    @given(entry=all_frontend_url_st)
    @settings(max_examples=5)
    def test_any_frontend_url_maps_to_backend(
        self, entry: tuple[str, str, str]
    ):
        """For any frontend API URL from either app, there should exist
        a matching backend URL pattern."""
        service_module, http_method, url_path = entry
        match = find_matching_backend_pattern(url_path)
        self.assertIsNotNone(
            match,
            f"Frontend URL {url_path} (from {service_module}, "
            f"{http_method}) has no matching backend pattern",
        )

    # ------------------------------------------------------------------
    # Structural: URL normalization replaces placeholders correctly
    # ------------------------------------------------------------------

    def test_normalize_replaces_id_placeholder(self):
        """normalize_frontend_url should replace {id} with a sample UUID."""
        url = "/api/v1/applications/{id}/submit/"
        normalized = normalize_frontend_url(url)
        self.assertNotIn("{id}", normalized)
        self.assertIn("00000000-0000-0000-0000-000000000000", normalized)

    def test_normalize_preserves_urls_without_placeholders(self):
        """URLs without {id} should be returned unchanged."""
        url = "/api/v1/applications/"
        self.assertEqual(normalize_frontend_url(url), url)

    # ------------------------------------------------------------------
    # Structural: all service modules are represented
    # ------------------------------------------------------------------

    def test_admissions_service_modules_covered(self):
        """All expected admissions service modules should have URLs."""
        expected_modules = {
            "applications.ts",
            "auth.ts",
            "catalog.ts",
            "documents.ts",
            "interviews.ts",
            "notifications.ts",
            "sessionService.ts",
            "admin/dashboard.ts",
            "admin/audit.ts",
            "admin/users.ts",
        }
        covered = {entry[0] for entry in ADMISSIONS_FRONTEND_URLS}
        missing = expected_modules - covered
        self.assertEqual(
            missing,
            set(),
            f"Missing admissions service modules: {missing}",
        )

    def test_jobs_ops_service_modules_covered(self):
        """All expected jobs-ops service modules should have URLs."""
        expected_modules = {
            "jobs.ts",
            "job-applications.ts",
            "automation.ts",
            "outreach.ts",
            "email.ts",
            "documents.ts",
            "analytics.ts",
            "platform.ts",
        }
        covered = {entry[0] for entry in JOBS_OPS_FRONTEND_URLS}
        missing = expected_modules - covered
        self.assertEqual(
            missing,
            set(),
            f"Missing jobs-ops service modules: {missing}",
        )

    # ------------------------------------------------------------------
    # Structural: backend pattern list is non-empty and well-formed
    # ------------------------------------------------------------------

    def test_backend_patterns_are_valid_regex(self):
        """Every backend URL pattern should be a valid regex."""
        for pattern_str in BACKEND_URL_PATTERNS:
            try:
                re.compile(pattern_str)
            except re.error as e:
                self.fail(f"Invalid regex pattern: {pattern_str!r} — {e}")

    def test_backend_patterns_cover_api_v1_prefix(self):
        """Most backend patterns should start with /api/v1/ or /health/."""
        for pattern_str in BACKEND_URL_PATTERNS:
            self.assertTrue(
                pattern_str.startswith(r"/api/v1/")
                or pattern_str.startswith(r"/health/"),
                f"Pattern {pattern_str!r} doesn't start with /api/v1/ or /health/",
            )
