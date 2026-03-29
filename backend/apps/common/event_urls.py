"""Event/SSE URL patterns.

Implements task 20.2.
Mounted at /api/v1/events/ in config/urls.py.
"""

from django.urls import path

from apps.common.sse import SSEPollView, SSEStreamView

urlpatterns = [
    path("stream/", SSEStreamView.as_view(), name="sse-stream"),
    path("poll/", SSEPollView.as_view(), name="sse-poll"),
]
