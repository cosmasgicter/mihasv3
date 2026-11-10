"""V2 API URL namespace.

Mounts the V2 endpoints under ``/api/v2/``: the tenant onboarding workflow, the
tenant change-request workflow and the student application readiness query. The five
representative demo views (session, programs, application detail, fee resolution,
document list) were removed by platform-simplification task 13.1: nothing called them.
The V2 namespace is separate from V1; no V1 routes are changed.

Design: ``design.md`` section 4 (URL namespace) and section 14 (envelope)
Task: 1.3
Requirements: R14.1-R14.2
"""

from django.urls import include, path

app_name = "v2"

urlpatterns = [
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
