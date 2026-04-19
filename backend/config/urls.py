"""Root URL configuration for MIHAS Django API."""
from django.contrib import admin
from django.urls import path, include

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.common.health import LivenessView, ReadinessView
from apps.common.permissions import IsAuthenticatedOrDebug
from apps.common.views import APIHomeView
from apps.documents.urls import document_urlpatterns, payment_urlpatterns, program_fee_urlpatterns

urlpatterns = [
    path("", APIHomeView.as_view(), name="api-root"),
    path("mihas-admin-panel/", admin.site.urls),
    # Health checks at root level (not under /api/v1/)
    path("health/live/", LivenessView.as_view(), name="health-live"),
    path("health/ready/", ReadinessView.as_view(), name="health-ready"),
    # OpenAPI schema and documentation
    path("api/v1/schema/", SpectacularAPIView.as_view(permission_classes=[IsAuthenticatedOrDebug]), name="schema"),
    path(
        "api/v1/docs/",
        SpectacularSwaggerView.as_view(url_name="schema", permission_classes=[IsAuthenticatedOrDebug]),
        name="swagger-ui",
    ),
    path(
        "api/v1/redoc/",
        SpectacularRedocView.as_view(url_name="schema", permission_classes=[IsAuthenticatedOrDebug]),
        name="redoc",
    ),
    # App endpoints under /api/v1/
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/sessions/", include("apps.accounts.session_urls")),
    path("api/v1/applications/", include("apps.applications.urls")),
    path("api/v1/catalog/", include("apps.catalog.urls")),
    path("api/v1/meta/", include("apps.common.meta_urls")),
    path("api/v1/jobs/", include("apps.jobs.urls")),
    path("api/v1/job-applications/", include("apps.jobs.application_urls")),
    path("api/v1/outreach/", include("apps.outreach.urls")),
    path("api/v1/automation/", include("apps.automation.urls")),
    path("api/v1/integrations/", include("apps.integrations.urls")),
    path("api/v1/analytics/", include("apps.analytics.urls")),
    path("api/v1/reports/", include("apps.analytics.report_urls")),
    path("api/v1/documents/", include((document_urlpatterns, "documents"))),
    path("api/v1/payments/", include((payment_urlpatterns, "payments"))),
    path("api/v1/programs/<uuid:program_id>/fees/", include((program_fee_urlpatterns, "program-fees"))),
    # Admin endpoints
    path("api/v1/admin/", include("apps.accounts.admin_urls")),
    path("api/v1/admin/", include("apps.common.template_urls")),
    # Notification endpoints
    path("api/v1/notifications/", include("apps.common.notification_urls")),
    # Email endpoints
    path("api/v1/email/", include("apps.common.email_urls")),
    # Error monitoring endpoints
    path("api/v1/errors/", include("apps.common.error_urls")),
]
