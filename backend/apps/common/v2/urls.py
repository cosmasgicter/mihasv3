"""V2 API URL namespace.

Mounts representative V2 endpoints under ``/api/v2/``. These demonstrate the
canonical V2 response/error/pagination envelope without altering V1.

The V2 namespace is separate from V1 — no V1 routes are changed.

Design: ``design.md`` section 4 (URL namespace) and section 14 (envelope)
Task: 1.3
Requirements: R14.1-R14.2
"""

from django.urls import include, path

from apps.common.v2.demo_views import (
    V2ApplicationDetailView,
    V2DocumentListView,
    V2FeeResolveView,
    V2ProgramListView,
    V2SessionView,
)

app_name = "v2"

urlpatterns = [
    # Auth domain: session endpoint
    path("auth/session/", V2SessionView.as_view(), name="session"),
    # Catalog domain: program list
    path("catalog/programs/", V2ProgramListView.as_view(), name="program-list"),
    # Applications domain: application detail (owner read)
    path(
        "applications/<uuid:application_id>/",
        V2ApplicationDetailView.as_view(),
        name="application-detail",
    ),
    # Payment domain: fee resolution
    path("payments/resolve-fee/", V2FeeResolveView.as_view(), name="fee-resolve"),
    # Documents domain: document list
    path("documents/", V2DocumentListView.as_view(), name="document-list"),
    # Tenant onboarding workflow (task 4.1): durable server workflow commands
    # that replace the fragile client multi-call orchestration (TEN-01).
    path("admin/onboarding/", include("apps.catalog.onboarding_v2_urls")),
    # Tenant change requests (task 4.5): durable submit/review/apply workflow for
    # protected profile/program/domain edits (TEN-06). Approval applies through
    # the same canonical command a Platform_Admin uses directly (R5.5).
    path("admin/change-requests/", include("apps.catalog.change_request_v2_urls")),
    # Student application readiness (task 6.5): the authoritative deterministic
    # readiness query named by design §8.3. The same evaluator runs under the row
    # locks at submission, so the query and the decision cannot disagree
    # (R10.6, R11.2-R11.6, R12.3).
    path("student/applications/", include("apps.applications.readiness_v2_urls")),
]
