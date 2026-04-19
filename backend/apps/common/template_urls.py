"""URL patterns for communication template admin endpoints.

Implements task 10.2.
Requirements: 9.6
"""

from django.urls import path

from apps.common.template_views import (
    CommunicationTemplateListView,
    CommunicationTemplateUpdateView,
)

urlpatterns = [
    path("templates/", CommunicationTemplateListView.as_view(), name="template-list"),
    path("templates/<str:key>/", CommunicationTemplateUpdateView.as_view(), name="template-update"),
]
