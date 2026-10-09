"""V2 tenant change-request routes (task 4.5).

Mounted under ``/api/v2/admin/change-requests/`` from ``apps.common.v2.urls``.
Each route is a single durable change-request workflow command that closes
TEN-06 (the tenant console's dead "request change" text becomes a real
submit/review/apply workflow).

Design: design.md §6.4; Requirements: R5.4-R5.5.
"""

from django.urls import path

from apps.catalog.change_request_v2_views import (
    V2TenantChangeRequestApproveView,
    V2TenantChangeRequestCancelView,
    V2TenantChangeRequestDetailView,
    V2TenantChangeRequestListCreateView,
    V2TenantChangeRequestRejectView,
    V2TenantChangeRequestSubmitView,
)

app_name = "change_requests_v2"

urlpatterns = [
    path("", V2TenantChangeRequestListCreateView.as_view(), name="list-create"),
    path("<uuid:change_request_id>/", V2TenantChangeRequestDetailView.as_view(), name="detail"),
    path("<uuid:change_request_id>/submit/", V2TenantChangeRequestSubmitView.as_view(), name="submit"),
    path("<uuid:change_request_id>/cancel/", V2TenantChangeRequestCancelView.as_view(), name="cancel"),
    path("<uuid:change_request_id>/approve/", V2TenantChangeRequestApproveView.as_view(), name="approve"),
    path("<uuid:change_request_id>/reject/", V2TenantChangeRequestRejectView.as_view(), name="reject"),
]
