"""V2 student application routes (admissions-v2 task 6.5).

Mounted under ``/api/v2/student/applications/`` from ``apps.common.v2.urls``.

Design: design.md §8.3 names the authoritative readiness query as
``GET /api/v2/student/applications/{id}/readiness/``.
Requirements: R10.6, R11.2-R11.6, R12.3.
"""

from django.urls import path

from apps.applications.readiness_v2_views import V2ApplicationReadinessView

app_name = "student_applications_v2"

urlpatterns = [
    path(
        "<uuid:application_id>/readiness/",
        V2ApplicationReadinessView.as_view(),
        name="readiness",
    ),
]
