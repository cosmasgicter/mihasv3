"""Root URL configuration for MIHAS Django API."""
from django.contrib import admin
from django.urls import path, include

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.common.health import LivenessView, ReadinessView
from apps.documents.urls import document_urlpatterns, payment_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health checks at root level (not under /api/v1/)
    path("health/live/", LivenessView.as_view(), name="health-live"),
    path("health/ready/", ReadinessView.as_view(), name="health-ready"),
    # OpenAPI schema and documentation
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/v1/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/v1/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
    # App endpoints under /api/v1/
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/sessions/", include("apps.accounts.session_urls")),
    path("api/v1/applications/", include("apps.applications.urls")),
    path("api/v1/catalog/", include("apps.catalog.urls")),
    path("api/v1/documents/", include((document_urlpatterns, "documents"))),
    path("api/v1/payments/", include((payment_urlpatterns, "payments"))),
    # Admin endpoints
    path("api/v1/admin/", include("apps.accounts.admin_urls")),
    # Notification endpoints
    path("api/v1/notifications/", include("apps.common.notification_urls")),
    # SSE / event endpoints
    path("api/v1/events/", include("apps.common.event_urls")),
    # Email endpoints
    path("api/v1/email/", include("apps.common.email_urls")),
]
