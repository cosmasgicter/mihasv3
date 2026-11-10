"""R3.4: the admissions email route must not depend on the jobs-ops flag."""
import importlib

import pytest
from django.test import override_settings
from django.urls import clear_url_caches, resolve, Resolver404
from tests.jobs_ops_urls import reload_jobs_ops_urlconf


def _reload_urlconf():
    import config.urls

    reload_jobs_ops_urlconf()
    clear_url_caches()


@pytest.fixture
def jobs_ops_off():
    with override_settings(ENABLE_JOBS_OPS_ROUTES=False):
        _reload_urlconf()
        yield
    _reload_urlconf()


def test_email_send_resolves_with_jobs_ops_routes_off(jobs_ops_off):
    match = resolve("/api/v1/email/send/")
    assert match.func is not None


def test_jobs_ops_routes_are_absent_when_flag_is_off(jobs_ops_off):
    # Guards the test above: the flag really was off while it resolved.
    with pytest.raises(Resolver404):
        resolve("/api/v1/jobs/")
