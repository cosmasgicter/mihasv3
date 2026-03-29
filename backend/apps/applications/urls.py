"""Application URL routing.

Implements task 13.4.
Requirements: 10.1
"""

from django.urls import path

from apps.applications.views import (
    ApplicationBulkStatusView,
    ApplicationDetailView,
    ApplicationDocumentsView,
    ApplicationDraftView,
    ApplicationExportView,
    ApplicationGradesView,
    ApplicationInterviewView,
    ApplicationListCreateView,
    ApplicationReviewView,
    ApplicationSummaryView,
    ApplicationTrackView,
)

app_name = "applications"

urlpatterns = [
    path("", ApplicationListCreateView.as_view(), name="application-list-create"),
    path("export/", ApplicationExportView.as_view(), name="application-export"),
    path("track/", ApplicationTrackView.as_view(), name="application-track"),
    path("bulk-status/", ApplicationBulkStatusView.as_view(), name="application-bulk-status"),
    path("draft/", ApplicationDraftView.as_view(), name="application-draft"),
    path("<uuid:application_id>/", ApplicationDetailView.as_view(), name="application-detail"),
    path("<uuid:application_id>/documents/", ApplicationDocumentsView.as_view(), name="application-documents"),
    path("<uuid:application_id>/grades/", ApplicationGradesView.as_view(), name="application-grades"),
    path("<uuid:application_id>/summary/", ApplicationSummaryView.as_view(), name="application-summary"),
    path("<uuid:application_id>/review/", ApplicationReviewView.as_view(), name="application-review"),
    path("<uuid:application_id>/interviews/", ApplicationInterviewView.as_view(), name="application-interviews"),
]
