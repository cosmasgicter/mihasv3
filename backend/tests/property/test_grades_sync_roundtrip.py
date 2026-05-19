"""Property-based test: Grades sync POST round-trip.

# Feature: ui-overhaul-and-critical-fixes, Property 8: Grades sync POST round-trip

For any valid set of grades (list of {subject_id: UUID, grade: integer} pairs
with unique subject IDs), POSTing the grades then GETting returns matching entries.
Double POST does not create duplicates.

**Validates: Requirements 10.2, 10.5**

Uses Hypothesis for property-based testing with mock patterns consistent with
the existing backend test suite.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.accounts.authentication import JWTUser  # noqa: E402
from apps.applications.views import ApplicationGradesView  # noqa: E402

_default_settings = settings(max_examples=5, deadline=None)

# Patch targets
_APP_OBJECTS = "apps.applications.student_submission_views.Application.objects"
_GRADE_OBJECTS = "apps.applications.student_submission_views.ApplicationGrade.objects"
_SUBJECT_EXISTS = "apps.catalog.models.Subject.objects"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(user_id=None):
    uid = user_id or uuid.uuid4()
    return JWTUser({
        "user_id": str(uid),
        "email": "student@example.com",
        "role": "student",
        "first_name": "Test",
        "last_name": "Student",
    })


def _make_application(app_id, user_id):
    app = MagicMock()
    app.id = app_id
    app.pk = app_id
    app.user_id = str(user_id)
    app.status = "draft"
    return app


def _make_grade_obj(grade_id, subject_id, grade_value):
    g = MagicMock()
    g.id = grade_id
    g.subject_id = subject_id
    g.grade = grade_value
    g.created_at = MagicMock()
    g.created_at.isoformat.return_value = "2025-01-01T00:00:00+00:00"
    return g


# Strategy: list of (subject_id, grade) pairs with unique subject IDs
_grade_entry = st.tuples(st.uuids(), st.integers(min_value=1, max_value=9))
_grade_list = st.lists(
    _grade_entry,
    min_size=5,
    max_size=10,
    unique_by=lambda x: x[0],  # unique subject IDs
)


# =========================================================================
# Property 8: Grades sync POST round-trip
# =========================================================================


_factory = APIRequestFactory()
_view = ApplicationGradesView.as_view()


# =========================================================================
# Property 8: Grades sync POST round-trip
# =========================================================================


class TestGradesSyncPostRoundTrip:
    """POST then GET returns matching entries; double POST creates no duplicates."""

    @_default_settings
    @given(grade_pairs=_grade_list)
    def test_post_then_get_returns_matching_grades(self, grade_pairs):
        """For any valid grade set, POST then GET returns matching entries.

        **Validates: Requirements 10.2**
        """
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        user = _make_user(user_id)
        app = _make_application(app_id, user_id)

        # Build the batch payload
        payload = {
            "grades": [
                {"subject_id": str(sid), "grade": gval}
                for sid, gval in grade_pairs
            ]
        }

        # Track what update_or_create stores
        stored_grades = {}

        def mock_update_or_create(application_id, subject_id, defaults):
            is_new = subject_id not in stored_grades
            grade_id = stored_grades.get(subject_id, {}).get("id", uuid.uuid4())
            stored_grades[subject_id] = {
                "id": grade_id,
                "subject_id": subject_id,
                "grade": defaults["grade"],
            }
            grade_obj = _make_grade_obj(grade_id, subject_id, defaults["grade"])
            return grade_obj, is_new

        # Build mock grade objects for GET
        def get_filter_result(**kwargs):
            qs = MagicMock()
            result = [
                _make_grade_obj(
                    info["id"], info["subject_id"], info["grade"]
                )
                for info in stored_grades.values()
            ]
            qs.__iter__ = MagicMock(return_value=iter(result))
            return qs

        with (
            patch(_APP_OBJECTS) as mock_app_qs,
            patch(_GRADE_OBJECTS) as mock_grade_qs,
            patch(_SUBJECT_EXISTS) as mock_subject_qs,
        ):
            mock_app_qs.get.return_value = app
            mock_subject_qs.filter.return_value.exists.return_value = True
            mock_grade_qs.update_or_create.side_effect = mock_update_or_create
            mock_grade_qs.filter.side_effect = get_filter_result

            # --- POST ---
            post_request = _factory.post(
                f"/api/v1/applications/{app_id}/grades/",
                data=payload,
                format="json",
            )
            force_authenticate(post_request, user=user)
            post_response = _view(post_request, application_id=app_id)

            assert post_response.status_code == 200, (
                f"Batch POST should return 200, got {post_response.status_code}"
            )
            assert "grades" in post_response.data.get("data", post_response.data)
            post_data = post_response.data.get("data", post_response.data)
            assert len(post_data["grades"]) == len(grade_pairs)

            # Verify each posted grade appears in the POST response
            response_pairs = {
                (str(g["subject_id"]), g["grade"])
                for g in post_data["grades"]
            }
            input_pairs = {(str(sid), gval) for sid, gval in grade_pairs}
            assert response_pairs == input_pairs, (
                f"POST response grades should match input. "
                f"Expected {input_pairs}, got {response_pairs}"
            )

            # --- GET ---
            get_request = _factory.get(
                f"/api/v1/applications/{app_id}/grades/",
            )
            force_authenticate(get_request, user=user)
            get_response = _view(get_request, application_id=app_id)

            assert get_response.status_code == 200
            get_data = get_response.data.get("data", get_response.data)
            get_grades = get_data.get("grades", get_data) if isinstance(get_data, dict) else get_data
            get_pairs = {
                (str(g["subject_id"]), g["grade"])
                for g in (get_grades if isinstance(get_grades, list) else [])
            }
            assert get_pairs == input_pairs, (
                f"GET response should match POSTed grades. "
                f"Expected {input_pairs}, got {get_pairs}"
            )

    @_default_settings
    @given(grade_pairs=_grade_list)
    def test_double_post_no_duplicates(self, grade_pairs):
        """Double POST does not create duplicates — update_or_create semantics.

        **Validates: Requirements 10.5**
        """
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        user = _make_user(user_id)
        app = _make_application(app_id, user_id)

        payload = {
            "grades": [
                {"subject_id": str(sid), "grade": gval}
                for sid, gval in grade_pairs
            ]
        }

        # Track stored grades with update_or_create semantics
        stored_grades = {}

        def mock_update_or_create(application_id, subject_id, defaults):
            is_new = subject_id not in stored_grades
            grade_id = stored_grades.get(subject_id, {}).get("id", uuid.uuid4())
            stored_grades[subject_id] = {
                "id": grade_id,
                "subject_id": subject_id,
                "grade": defaults["grade"],
            }
            grade_obj = _make_grade_obj(grade_id, subject_id, defaults["grade"])
            return grade_obj, is_new

        def get_filter_result(**kwargs):
            qs = MagicMock()
            result = [
                _make_grade_obj(
                    info["id"], info["subject_id"], info["grade"]
                )
                for info in stored_grades.values()
            ]
            qs.__iter__ = MagicMock(return_value=iter(result))
            return qs

        with (
            patch(_APP_OBJECTS) as mock_app_qs,
            patch(_GRADE_OBJECTS) as mock_grade_qs,
            patch(_SUBJECT_EXISTS) as mock_subject_qs,
        ):
            mock_app_qs.get.return_value = app
            mock_subject_qs.filter.return_value.exists.return_value = True
            mock_grade_qs.update_or_create.side_effect = mock_update_or_create
            mock_grade_qs.filter.side_effect = get_filter_result

            # --- First POST ---
            req1 = _factory.post(
                f"/api/v1/applications/{app_id}/grades/",
                data=payload,
                format="json",
            )
            force_authenticate(req1, user=user)
            resp1 = _view(req1, application_id=app_id)
            assert resp1.status_code == 200

            # --- Second POST (identical payload) ---
            req2 = _factory.post(
                f"/api/v1/applications/{app_id}/grades/",
                data=payload,
                format="json",
            )
            force_authenticate(req2, user=user)
            resp2 = _view(req2, application_id=app_id)
            assert resp2.status_code == 200

            # --- GET: should have exactly len(grade_pairs) entries, no duplicates ---
            get_request = _factory.get(
                f"/api/v1/applications/{app_id}/grades/",
            )
            force_authenticate(get_request, user=user)
            get_response = _view(get_request, application_id=app_id)

            assert get_response.status_code == 200
            get_data2 = get_response.data.get("data", get_response.data)
            get_grades2 = get_data2.get("grades", get_data2) if isinstance(get_data2, dict) else get_data2
            assert len(get_grades2 if isinstance(get_grades2, list) else []) == len(grade_pairs), (
                f"Double POST should not create duplicates. "
                f"Expected {len(grade_pairs)} grades, got {len(get_response.data)}"
            )

            # Verify the grade values match the input
            get_data = get_response.data.get("data", get_response.data)
            get_grades = get_data.get("grades", get_data) if isinstance(get_data, dict) else get_data
            get_pairs = {
                (str(g["subject_id"]), g["grade"])
                for g in (get_grades if isinstance(get_grades, list) else [])
            }
            input_pairs = {(str(sid), gval) for sid, gval in grade_pairs}
            assert get_pairs == input_pairs
