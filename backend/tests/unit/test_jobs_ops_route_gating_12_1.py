"""Task 12.1 (D1 option B): the jobs-ops seed and scaffold routes follow the flag.

Requirements 3.3, 3.4, 3.5, 3.7. With ``ENABLE_JOBS_OPS_ROUTES`` off the eight routes do
not resolve (404); with it on they do. ``POST /api/v1/email/send/`` resolves either way.
``webhooks/delivery/`` is the eighth: decision D1.b (option (i), decided 2026-11-21) gates
it with the jobs-ops flag, and ``scripts/route-consumers.json`` records that answer.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from django.test import Client, override_settings
from django.urls import Resolver404, resolve

from tests.jobs_ops_urls import reload_jobs_ops_urlconf

GATED = (
    "/api/v1/email/accounts/zoho/connect/",
    "/api/v1/email/messages/",
    "/api/v1/email/threads/",
    "/api/v1/documents/resumes/",
    "/api/v1/documents/resumes/variants/",
    "/api/v1/documents/cover-letters/generate/",
    "/api/v1/documents/question-bank/answer/",
    "/api/v1/email/webhooks/delivery/",
)
ALWAYS = (
    "/api/v1/email/send/",
    "/api/v1/documents/upload/",
)
REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def flag_off():
    with override_settings(ENABLE_JOBS_OPS_ROUTES=False):
        reload_jobs_ops_urlconf()
        yield
    reload_jobs_ops_urlconf()


@pytest.fixture
def flag_on():
    with override_settings(ENABLE_JOBS_OPS_ROUTES=True):
        reload_jobs_ops_urlconf()
        yield
    reload_jobs_ops_urlconf()


@pytest.mark.parametrize("path", GATED)
def test_gated_routes_do_not_resolve_with_the_flag_off(flag_off, path):
    with pytest.raises(Resolver404):
        resolve(path)


@pytest.mark.parametrize("path", GATED)
def test_gated_routes_answer_404_with_the_flag_off(flag_off, path):
    response = Client().get(path)
    assert response.status_code == 404


@pytest.mark.parametrize("path", GATED)
def test_gated_routes_resolve_with_the_flag_on(flag_on, path):
    assert resolve(path).func is not None


@pytest.mark.parametrize("path", ALWAYS)
@pytest.mark.parametrize("fixture_name", ["flag_off", "flag_on"])
def test_always_mounted_routes_resolve_for_both_flag_values(request, fixture_name, path):
    request.getfixturevalue(fixture_name)
    assert resolve(path).func is not None


def test_delivery_webhook_records_the_d1b_answer():
    entries = json.loads((REPO_ROOT / "scripts" / "route-consumers.json").read_text())["entries"]
    entry = next(e for e in entries if e["route"] == "/api/v1/email/webhooks/delivery/")
    assert "pending D1.b" not in entry["reason"]
    assert "D1.b" in entry["reason"] and "ENABLE_JOBS_OPS_ROUTES" in entry["reason"]


def test_scope_gate_lists_the_eight_routes():
    import importlib.util

    path = REPO_ROOT / "scripts" / "launch-verification" / "check-launch-scope.py"
    spec = importlib.util.spec_from_file_location("check_launch_scope_12_1", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    listed = {route for route, _module in module.STUB_ROUTES}
    assert set(GATED) <= listed
    assert "/api/v1/email/send/" not in listed
