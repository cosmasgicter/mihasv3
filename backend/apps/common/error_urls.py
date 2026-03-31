"""Error monitoring URL patterns.

Implements task 3.3 (cto-assessment-remediation).
Mounted at /api/v1/errors/ in config/urls.py.

Routes:
  POST /api/v1/errors/report/ → accept frontend error reports
"""

from django.urls import path

from apps.common.error_views import ErrorReportView

urlpatterns = [
    path("report/", ErrorReportView.as_view(), name="error-report"),
]
