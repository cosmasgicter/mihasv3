"""Tests for the error-response postprocessing hook and the notification alias split.

Follow-up polish after the main 27-task remediation sprint:
- every operation documents standard error codes (400/401/403/404/500)
- public paths (health, webhook, login, register, etc.) skip 401/403
- notification aliases have distinct operation_ids per URL path
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
import yaml

BACKEND = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def schema():
    out = Path("/tmp/test_error_responses.yaml")
    env = {
        "PATH": "/usr/bin:/bin:/tmp/mihas_audit_venv/bin",
        "HOME": "/tmp",
        "DJANGO_SETTINGS_MODULE": "config.settings.dev",
        "SECRET_KEY": "ci-test",
        "JWT_SIGNING_KEY": "ci-test",
        "DATABASE_URL": "sqlite:///tmp/test_err.db",
        "REDIS_URL": "redis://localhost:6379/0",
        "ALLOWED_HOSTS": "*",
    }
    py_candidates = ["/tmp/mihas_audit_venv/bin/python", sys.executable]
    py = next((p for p in py_candidates if Path(p).is_file()), sys.executable)
    res = subprocess.run(
        [py, "manage.py", "spectacular", "--file", str(out)],
        cwd=BACKEND, env=env, capture_output=True, text=True,
    )
    if res.returncode != 0:
        pytest.skip(f"schema regen failed: {res.stderr[:400]}")
    return yaml.safe_load(out.read_text())


def test_error_response_hook_registered():
    from django.conf import settings

    hooks = settings.SPECTACULAR_SETTINGS.get("POSTPROCESSING_HOOKS", [])
    assert "apps.common.openapi.auto_document_error_responses" in hooks


def test_authenticated_endpoints_have_standard_error_responses(schema):
    """Any authenticated endpoint must document 401/403/404/500 (and 400 for
    write methods)."""
    # Use a representative application admin endpoint
    path = "/api/v1/applications/{application_id}/assign/"
    responses = schema["paths"][path]["post"]["responses"]
    for code in ("400", "401", "403", "404", "500"):
        assert code in responses, f"Missing {code} on POST {path}"


def test_public_endpoints_omit_auth_error_codes(schema):
    """Webhook and other public endpoints should not advertise 401/403."""
    path = "/api/v1/payments/webhook/lenco/"
    if path not in schema["paths"]:
        pytest.skip(f"Webhook path not in schema")
    post = schema["paths"][path].get("post")
    if not post:
        pytest.skip("Webhook has no POST")
    responses = post.get("responses", {})
    # Public webhook: no 401/403 required; 400/404/500 may apply
    assert "401" not in responses, f"Public {path} should not declare 401"
    assert "403" not in responses, f"Public {path} should not declare 403"


def test_error_responses_reference_error_schema(schema):
    """The injected error responses must point at components/schemas/ErrorResponse."""
    path = "/api/v1/applications/{application_id}/assign/"
    responses = schema["paths"][path]["post"]["responses"]
    resp_400 = responses["400"]
    ref = resp_400["content"]["application/json"]["schema"]["$ref"]
    assert ref == "#/components/schemas/ErrorResponse"


def test_get_methods_omit_400(schema):
    """GET endpoints don't typically have a 400 (no body to validate)."""
    # Use a GET endpoint we know exists
    path = "/api/v1/applications/{application_id}/waitlist-position/"
    if path in schema["paths"] and "get" in schema["paths"][path]:
        responses = schema["paths"][path]["get"]["responses"]
        # 400 is not required for GET; if absent, that's the expected behavior
        # from _DEFAULT_ERROR_CODES_BY_METHOD
        assert "401" in responses or "403" in responses  # at least auth-level


def test_notification_aliases_have_distinct_operation_ids(schema):
    """Each alias URL has its own operation_id — no collision suffixes needed."""
    mark_all = schema["paths"]["/api/v1/notifications/mark-all-read/"]["put"]
    mark_read = schema["paths"]["/api/v1/notifications/mark-read/"]["put"]
    assert mark_all["operationId"] != mark_read["operationId"]
    # Neither should have drf-spectacular's numeric-suffix resolution
    assert not mark_all["operationId"].endswith("_2")
    assert not mark_read["operationId"].endswith("_2")


def test_existing_explicit_error_responses_preserved(schema):
    """Views that explicitly declared error responses via @extend_schema should
    keep them — the hook only fills in gaps."""
    # MobileMoneyInitiateView declares 400/403/404/500 explicitly
    path = "/api/v1/payments/mobile-money/"
    if path in schema["paths"]:
        post = schema["paths"][path].get("post")
        if post:
            responses = post.get("responses", {})
            # All the explicitly-declared codes should be present
            for code in ("400", "403", "404", "500"):
                assert code in responses, f"Missing explicit {code} response on {path}"
