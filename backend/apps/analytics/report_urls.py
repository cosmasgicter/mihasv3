"""Analytics report routes."""

from django.urls import path

from apps.analytics.views import DailyDigestReportView

app_name = "reports"

urlpatterns = [
    path("daily-digest/", DailyDigestReportView.as_view(), name="daily-digest"),
]

