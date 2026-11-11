"""Reload the URLconf after the jobs-ops flag changes (platform-simplification task 12.1).

``config/urls.py`` reads ``settings.ENABLE_JOBS_OPS_ROUTES`` when it loads, and so do
``apps/common/email_urls.py`` and ``apps/documents/urls.py``. ``config/urls.py`` imports
``document_urlpatterns`` when it loads, so the two modules must be reloaded first.
"""
from __future__ import annotations

import importlib

from django.urls import clear_url_caches


def reload_jobs_ops_urlconf() -> None:
    importlib.reload(importlib.import_module("apps.common.email_urls"))
    importlib.reload(importlib.import_module("apps.documents.urls"))
    importlib.reload(importlib.import_module("config.urls"))
    clear_url_caches()
