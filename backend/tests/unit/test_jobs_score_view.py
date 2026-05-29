"""Regression tests for jobs score persistence."""

import uuid
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.jobs.views import JobScoreView


class JobScoreViewTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch("apps.jobs.views.persist_match_score_safe")
    @patch("apps.jobs.ai_service.score_job_match")
    @patch("apps.jobs.views.resolve_job_posting")
    def test_score_view_persists_against_candidate_and_canonical_fields(
        self,
        mock_resolve_job,
        mock_score_job_match,
        mock_persist,
    ):
        user = SimpleNamespace(id=uuid.uuid4(), is_authenticated=True)
        job = SimpleNamespace(
            id=uuid.uuid4(),
            title="Clinical Officer",
            company_id=None,
            company=None,
            location="Ndola",
            description="Clinical role",
            requirements="Registered clinician",
        )
        mock_resolve_job.return_value = job
        mock_score_job_match.return_value = {
            "score": 82,
            "recommendation": "apply_now",
            "reasons": ["Strong skills match"],
            "missing_skills": ["ICU exposure"],
        }

        request = self.factory.post(f"/api/v1/jobs/{job.id}/score/", {"candidate": {"skills": ["triage"]}}, format="json")
        force_authenticate(request, user=user)

        response = JobScoreView.as_view()(request, job_id=job.id)

        self.assertEqual(response.status_code, 200)
        mock_persist.assert_called_once_with(
            job_posting=job,
            candidate=user,
            defaults={
                "match_score": 82.0,
                "shortlist_probability": 82.0,
                "recommendation": "apply_now",
                "explanation": ["Strong skills match"],
                "missing_signals": ["ICU exposure"],
            },
        )
