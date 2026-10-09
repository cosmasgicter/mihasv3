"""V2 tenant onboarding workflow routes (task 4.1).

Mounted under ``/api/v2/admin/onboarding/`` from ``apps.common.v2.urls``. Each
route is a single durable server workflow command, replacing the fragile client
multi-call orchestration (TEN-01).

Design: design.md §6.1; Requirements: R4.1-R4.6.
"""

from django.urls import path

from apps.catalog.onboarding_v2_views import (
    V2TenantOnboardingActivateView,
    V2TenantOnboardingBlockersView,
    V2TenantOnboardingCancelView,
    V2TenantOnboardingDetailView,
    V2TenantOnboardingListCreateView,
    V2TenantOnboardingRejectView,
    V2TenantOnboardingResumeView,
    V2TenantOnboardingStepView,
    V2TenantOnboardingSubmitView,
    V2TenantOnboardingSuspendView,
)

app_name = "onboarding_v2"

urlpatterns = [
    path("", V2TenantOnboardingListCreateView.as_view(), name="list-create"),
    path("<uuid:onboarding_id>/", V2TenantOnboardingDetailView.as_view(), name="detail"),
    path(
        "<uuid:onboarding_id>/blockers/",
        V2TenantOnboardingBlockersView.as_view(),
        name="blockers",
    ),
    path(
        "<uuid:onboarding_id>/steps/",
        V2TenantOnboardingStepView.as_view(),
        name="steps",
    ),
    path(
        "<uuid:onboarding_id>/submit/",
        V2TenantOnboardingSubmitView.as_view(),
        name="submit",
    ),
    path(
        "<uuid:onboarding_id>/activate/",
        V2TenantOnboardingActivateView.as_view(),
        name="activate",
    ),
    path(
        "<uuid:onboarding_id>/reject/",
        V2TenantOnboardingRejectView.as_view(),
        name="reject",
    ),
    path(
        "<uuid:onboarding_id>/cancel/",
        V2TenantOnboardingCancelView.as_view(),
        name="cancel",
    ),
    path(
        "<uuid:onboarding_id>/suspend/",
        V2TenantOnboardingSuspendView.as_view(),
        name="suspend",
    ),
    path(
        "<uuid:onboarding_id>/resume/",
        V2TenantOnboardingResumeView.as_view(),
        name="resume",
    ),
]
