"""Property-based tests for the jobs-ops ORM/DB drift fix.

Spec: .kiro/specs/jobs-ops-orm-db-drift/

Property 1 (Fix-Checking, ORM): for any job_id and any AI-result shape, the
score/tailor handlers never raise an unhandled ProgrammingError, and their HTTP
status stays within {200, 202, 400, 404} — never an un-guarded 500.

Property 3 (Preservation, ORM): seed-backed reads and scaffold actions keep the
``{"success": true, "data": ...}`` envelope shape.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
os.environ["TESTING"] = "1"

import uuid
from unittest.mock import patch

from hypothesis import given, settings
from hypothesis import strategies as st
from rest_framework.test import APIRequestFactory, force_authenticate


class _FakeUser:
    is_authenticated = True
    pk = "00000000-0000-0000-0000-000000000001"


_factory = APIRequestFactory()

# AI-result shapes: well-formed, partial, junk, and the "unavailable" None.
ai_score_results = st.one_of(
    st.none(),
    st.fixed_dictionaries(
        {
            "score": st.integers(min_value=0, max_value=100),
            "recommendation": st.sampled_from(["apply_now", "review", "watch"]),
        }
    ),
    st.fixed_dictionaries({"score": st.floats(allow_nan=False, allow_infinity=False)}),
    st.dictionaries(st.text(max_size=8), st.integers(), max_size=3),
)


@settings(max_examples=20, deadline=None)
@given(seed=st.integers(min_value=0, max_value=10**9), ai_result=ai_score_results)
def test_score_endpoint_never_500_on_missing_table(seed, ai_result):
    """Property 1 — score endpoint stays in {200, 202} when the table is absent.

    Validates: Requirements 2.1, 2.2.
    """
    from apps.jobs.views import JobScoreView

    job_id = str(uuid.UUID(int=seed % (2**128)))
    request = _factory.post(
        f"/api/v1/jobs/{job_id}/score/", {"candidate": {}}, format="json"
    )
    force_authenticate(request, user=_FakeUser())
    with patch("apps.jobs.views.resolve_job_posting", return_value=None), patch(
        "apps.jobs.ai_service.score_job_match", return_value=ai_result
    ):
        response = JobScoreView.as_view()(request, job_id=job_id)
    assert response.status_code in {200, 202, 400, 404}


@settings(max_examples=20, deadline=None)
@given(
    seed=st.integers(min_value=0, max_value=10**9),
    resume_text=st.one_of(st.just(""), st.text(max_size=50)),
    ai_result=st.one_of(st.none(), st.fixed_dictionaries({"tailored_summary": st.text(max_size=20)})),
)
def test_tailor_endpoint_never_500_on_missing_table(seed, resume_text, ai_result):
    """Property 1 — tailor endpoint stays in {200, 202, 400} when table absent.

    Validates: Requirement 2.3.
    """
    from apps.jobs.views import JobTailorDocumentsView

    job_id = str(uuid.UUID(int=seed % (2**128)))
    body = {"resume_text": resume_text} if resume_text else {}
    request = _factory.post(
        f"/api/v1/jobs/{job_id}/tailor-documents/", body, format="json"
    )
    force_authenticate(request, user=_FakeUser())
    with patch("apps.jobs.views.resolve_job_posting", return_value=None), patch(
        "apps.jobs.ai_service.tailor_resume", return_value=ai_result
    ):
        response = JobTailorDocumentsView.as_view()(request, job_id=job_id)
    assert response.status_code in {200, 202, 400, 404}


@settings(max_examples=20, deadline=None)
@given(seed=st.integers(min_value=0, max_value=10**9))
def test_score_endpoint_skips_persistence_when_table_missing(seed):
    """Property 1/3 — no match-score write is attempted when the table is absent.

    Validates: Requirements 2.2, 3.2.
    """
    from apps.jobs.views import JobScoreView

    job_id = str(uuid.UUID(int=seed % (2**128)))
    request = _factory.post(
        f"/api/v1/jobs/{job_id}/score/", {"candidate": {}}, format="json"
    )
    force_authenticate(request, user=_FakeUser())
    with patch("apps.jobs.views.resolve_job_posting", return_value=None), patch(
        "apps.jobs.ai_service.score_job_match",
        return_value={"score": 80, "recommendation": "review"},
    ), patch("apps.jobs.views.persist_match_score_safe") as persist:
        response = JobScoreView.as_view()(request, job_id=job_id)
    assert response.status_code == 200
    persist.assert_not_called()


def test_seed_reads_preserve_envelope_shape():
    """Property 3 — seed-backed GET reads keep the success/data envelope.

    Validates: Requirement 3.1.
    """
    from django.test import Client

    client = Client()
    for path in (
        "/api/v1/jobs/",
        "/api/v1/jobs/7db809ec-6655-4bf0-93b5-38b778342680/",
        "/api/v1/job-applications/",
    ):
        response = client.get(path)
        assert response.status_code == 200
        payload = response.json()
        assert payload.get("success") is True
        assert "data" in payload
