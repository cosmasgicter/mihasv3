"""Event/SSE URL patterns.

Mounted at /api/v1/events/ in config/urls.py.
"""

from django.urls import path

from apps.common.sse import SSEPollView, sse_stream_view

urlpatterns = [
    path("stream/", sse_stream_view, name="sse-stream"),
    path("poll/", SSEPollView.as_view(), name="sse-poll"),
]
