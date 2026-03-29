"""Celery app configuration for MIHAS Django API."""
import os

from celery import Celery

# Celery also runs in production on Koyeb. Default to prod so the worker does
# not fall back to development settings if the env var is omitted.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

app = Celery("mihas")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
