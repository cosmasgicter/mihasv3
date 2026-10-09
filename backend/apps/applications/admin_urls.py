"""Admin applications query routes (admissions-v2 tasks 9.1 and 9.4).

Mounted under ``/api/v1/admin/`` by ``config/urls.py``. These are the *scoped
read* routes only — the roster with its facets/aggregates/export, the saved
filters that name a query (task 9.1), and the one review-workspace detail query
(task 9.4). Every application **command** keeps its own canonical route under
``/api/v1/applications/`` with its own capability and its own version guard;
design §11.1 keeps them separate deliberately, "for clear authority and
idempotency".

Requirements: R8.1, R8.5, R8.6. Findings: ADM-01, AUTH-02, API-02.
"""

from django.urls import path

from apps.applications.admin_query_views import (
    AdminApplicationQueryView,
    AdminApplicationSavedFilterDetailView,
    AdminApplicationSavedFilterListView,
)
from apps.applications.admin_review_workspace_views import (
    AdminApplicationReviewWorkspaceView,
)

app_name = "admin-applications"

urlpatterns = [
    path(
        "applications/",
        AdminApplicationQueryView.as_view(),
        name="admin-application-query",
    ),
    # Declared before the ``<uuid:application_id>`` detail route so the literal
    # segment can never be read as an application id.
    path(
        "applications/saved-filters/",
        AdminApplicationSavedFilterListView.as_view(),
        name="admin-application-saved-filters",
    ),
    path(
        "applications/saved-filters/<uuid:saved_filter_id>/",
        AdminApplicationSavedFilterDetailView.as_view(),
        name="admin-application-saved-filter-detail",
    ),
    path(
        "applications/<uuid:application_id>/",
        AdminApplicationReviewWorkspaceView.as_view(),
        name="admin-application-review-workspace",
    ),
]
