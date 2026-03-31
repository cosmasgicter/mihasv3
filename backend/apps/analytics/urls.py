"""Analytics URL routes."""

from django.urls import path

from apps.analytics.views import FunnelAnalyticsView, OutreachAnalyticsView, SourceAnalyticsView

app_name = "analytics"

urlpatterns = [
    path("funnel/", FunnelAnalyticsView.as_view(), name="analytics-funnel"),
    path("sources/", SourceAnalyticsView.as_view(), name="analytics-sources"),
    path("outreach/", OutreachAnalyticsView.as_view(), name="analytics-outreach"),
]

