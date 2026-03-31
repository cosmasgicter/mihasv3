"""Job application routes."""

from django.urls import path

from apps.jobs.views import (
    JobApplicationApproveView,
    JobApplicationDetailView,
    JobApplicationListCreateView,
    JobApplicationPauseView,
    JobApplicationRejectView,
    JobApplicationResumeView,
    JobApplicationSubmitView,
)

app_name = "job_applications"

urlpatterns = [
    path("", JobApplicationListCreateView.as_view(), name="job-application-list-create"),
    path("<uuid:application_id>/", JobApplicationDetailView.as_view(), name="job-application-detail"),
    path("<uuid:application_id>/submit/", JobApplicationSubmitView.as_view(), name="job-application-submit"),
    path("<uuid:application_id>/pause/", JobApplicationPauseView.as_view(), name="job-application-pause"),
    path("<uuid:application_id>/resume/", JobApplicationResumeView.as_view(), name="job-application-resume"),
    path("<uuid:application_id>/approve/", JobApplicationApproveView.as_view(), name="job-application-approve"),
    path("<uuid:application_id>/reject/", JobApplicationRejectView.as_view(), name="job-application-reject"),
]

