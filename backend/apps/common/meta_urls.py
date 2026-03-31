"""Meta URL routes."""

from django.urls import path

from apps.common.meta_views import PlatformMetaView

urlpatterns = [
    path("platform/", PlatformMetaView.as_view(), name="platform-meta"),
]

