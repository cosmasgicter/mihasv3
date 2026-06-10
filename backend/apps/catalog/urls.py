"""Catalog URL routing.

Implements task 14.3.
Requirements: 10.1
"""

from django.urls import path

from apps.catalog.views import (
    AssignmentPreviewView,
    CanonicalProgramListView,
    CatalogContextView,
    InstitutionDetailView,
    InstitutionListCreateView,
    IntakeDetailView,
    IntakeListCreateView,
    ProgramDetailView,
    ProgramListCreateView,
    SubjectListView,
)

app_name = "catalog"

urlpatterns = [
    path("context/", CatalogContextView.as_view(), name="catalog-context"),
    path("canonical-programs/", CanonicalProgramListView.as_view(), name="canonical-program-list"),
    path("assignment-preview/", AssignmentPreviewView.as_view(), name="assignment-preview"),
    path("programs/", ProgramListCreateView.as_view(), name="program-list-create"),
    path("programs/<uuid:program_id>/", ProgramDetailView.as_view(), name="program-detail"),
    path("intakes/", IntakeListCreateView.as_view(), name="intake-list-create"),
    path("intakes/<uuid:intake_id>/", IntakeDetailView.as_view(), name="intake-detail"),
    path("subjects/", SubjectListView.as_view(), name="subject-list"),
    path("institutions/", InstitutionListCreateView.as_view(), name="institution-list-create"),
    path("institutions/<uuid:institution_id>/", InstitutionDetailView.as_view(), name="institution-detail"),
]
