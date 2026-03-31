"""Jobs URL routes."""

from django.urls import path

from apps.jobs.views import (
    DiscoveryRunCreateView,
    DiscoveryRunDetailView,
    JobDetailView,
    JobDismissView,
    JobListView,
    JobScoreView,
    JobTailorDocumentsView,
    JobWatchView,
)

app_name = "jobs"

urlpatterns = [
    path("", JobListView.as_view(), name="job-list"),
    path("discovery-runs/", DiscoveryRunCreateView.as_view(), name="discovery-run-create"),
    path("discovery-runs/<uuid:run_id>/", DiscoveryRunDetailView.as_view(), name="discovery-run-detail"),
    path("<uuid:job_id>/", JobDetailView.as_view(), name="job-detail"),
    path("<uuid:job_id>/score/", JobScoreView.as_view(), name="job-score"),
    path("<uuid:job_id>/tailor-documents/", JobTailorDocumentsView.as_view(), name="job-tailor-documents"),
    path("<uuid:job_id>/dismiss/", JobDismissView.as_view(), name="job-dismiss"),
    path("<uuid:job_id>/watch/", JobWatchView.as_view(), name="job-watch"),
]

