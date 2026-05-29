"""Unit tests for jobs-ops ORM graceful degradation.

Spec: .kiro/specs/jobs-ops-orm-db-drift/ — Requirements 2.1, 2.2, 2.3.

The jobs-ops models are managed=False and their tables are absent in the live
DB. These tests verify the persistence guards return None / False (never raise)
and that the score/tailor endpoints respond with a non-500 status when the
backing tables are missing.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import patch

from django.db import ProgrammingError
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate


class _FakeUser:
    is_authenticated = True
    pk = "00000000-0000-0000-0000-000000000001"


class ResolveJobPostingTests(SimpleTestCase):
    """Requirement 2.1 — resolve_job_posting degrades to None, never raises."""

    def test_returns_none_on_programming_error(self):
        from apps.jobs import _persistence

        with patch.object(_persistence.JobPosting, "objects") as mgr:
            mgr.select_related.return_value.get.side_effect = ProgrammingError(
                'relation "jobs_postings" does not exist'
            )
            self.assertIsNone(_persistence.resolve_job_posting("any-id"))

    def test_returns_none_on_does_not_exist(self):
        from apps.jobs import _persistence

        with patch.object(_persistence.JobPosting, "objects") as mgr:
            mgr.select_related.return_value.get.side_effect = (
                _persistence.JobPosting.DoesNotExist()
            )
            self.assertIsNone(_persistence.resolve_job_posting("any-id"))


class PersistMatchScoreSafeTests(SimpleTestCase):
    """Requirement 2.2 — persist_match_score_safe returns bool, never raises."""

    def test_returns_false_on_missing_table(self):
        from apps.jobs import _persistence

        with patch.object(_persistence.JobMatchScore, "objects") as mgr:
            mgr.update_or_create.side_effect = ProgrammingError(
                'relation "jobs_match_scores" does not exist'
            )
            result = _persistence.persist_match_score_safe(
                job_posting=object(), candidate=_FakeUser(), defaults={}
            )
            self.assertFalse(result)

    def test_returns_true_on_success(self):
        from apps.jobs import _persistence

        with patch.object(_persistence.JobMatchScore, "objects") as mgr:
            mgr.update_or_create.return_value = (object(), True)
            result = _persistence.persist_match_score_safe(
                job_posting=object(), candidate=_FakeUser(), defaults={}
            )
            self.assertTrue(result)


class JobScoreEndpointDegradationTests(SimpleTestCase):
    """Requirement 2.1, 2.2 — score endpoint returns non-500 with missing table."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def _call(self, ai_result):
        from apps.jobs.views import JobScoreView

        job_id = "7db809ec-6655-4bf0-93b5-38b778342680"
        request = self.factory.post(
            f"/api/v1/jobs/{job_id}/score/", {"candidate": {}}, format="json"
        )
        force_authenticate(request, user=_FakeUser())
        with patch("apps.jobs.views.resolve_job_posting", return_value=None), patch(
            "apps.jobs.ai_service.score_job_match", return_value=ai_result
        ):
            return JobScoreView.as_view()(request, job_id=job_id)

    def test_returns_200_when_ai_succeeds_and_table_missing(self):
        response = self._call({"score": 88, "recommendation": "apply_now"})
        self.assertEqual(response.status_code, 200)

    def test_returns_202_pending_when_ai_unavailable(self):
        response = self._call(None)
        self.assertEqual(response.status_code, 202)

    def test_no_persistence_attempted_when_table_missing(self):
        """When resolve_job_posting returns None, the match-score write is skipped."""
        from apps.jobs.views import JobScoreView

        job_id = "7db809ec-6655-4bf0-93b5-38b778342680"
        request = self.factory.post(
            f"/api/v1/jobs/{job_id}/score/", {"candidate": {}}, format="json"
        )
        force_authenticate(request, user=_FakeUser())
        with patch("apps.jobs.views.resolve_job_posting", return_value=None), patch(
            "apps.jobs.ai_service.score_job_match",
            return_value={"score": 70, "recommendation": "review"},
        ), patch("apps.jobs.views.persist_match_score_safe") as persist:
            response = JobScoreView.as_view()(request, job_id=job_id)
        self.assertEqual(response.status_code, 200)
        persist.assert_not_called()


class JobTailorEndpointDegradationTests(SimpleTestCase):
    """Requirement 2.3 — tailor endpoint returns non-500 with missing table."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def _call(self, body, ai_result):
        from apps.jobs.views import JobTailorDocumentsView

        job_id = "7db809ec-6655-4bf0-93b5-38b778342680"
        request = self.factory.post(
            f"/api/v1/jobs/{job_id}/tailor-documents/", body, format="json"
        )
        force_authenticate(request, user=_FakeUser())
        with patch("apps.jobs.views.resolve_job_posting", return_value=None), patch(
            "apps.jobs.ai_service.tailor_resume", return_value=ai_result
        ):
            return JobTailorDocumentsView.as_view()(request, job_id=job_id)

    def test_returns_400_when_resume_text_missing(self):
        response = self._call({}, {"tailored_summary": "x"})
        self.assertEqual(response.status_code, 400)

    def test_returns_200_when_ai_succeeds_and_table_missing(self):
        response = self._call({"resume_text": "experienced analyst"}, {"tailored_summary": "x"})
        self.assertEqual(response.status_code, 200)

    def test_returns_202_pending_when_ai_unavailable(self):
        response = self._call({"resume_text": "experienced analyst"}, None)
        self.assertEqual(response.status_code, 202)
