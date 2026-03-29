"""Shared pytest fixtures for the MIHAS Django API test suite."""

import os

import django
import pytest

# Configure Django settings before anything else
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ.setdefault("TESTING", "1")

django.setup()

from rest_framework.test import APIClient, APIRequestFactory  # noqa: E402


@pytest.fixture()
def api_client():
    """Return a DRF APIClient instance for making test requests."""
    return APIClient()


@pytest.fixture()
def api_request_factory():
    """Return a DRF APIRequestFactory for building request objects."""
    return APIRequestFactory()
