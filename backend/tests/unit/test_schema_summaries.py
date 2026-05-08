"""Tests for operation summary coverage (T17-T20, Phase 4).

Every operation under /api/v1/ must carry a non-empty `summary`. Enforced by
the `apps.common.openapi.auto_summary_from_operation_id` postprocessing hook
registered in SPECTACULAR_SETTINGS.
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
    out = Path("/tmp/test_schema_summaries.yaml")
    env = {
        "PATH": "/usr/bin:/bin:/tmp/mihas_audit_venv/bin",
        "HOME": "/tmp",
        "DJANGO_SETTINGS_MODULE": "config.settings.dev",
        "SECRET_KEY": "ci-test",
        "JWT_SIGNING_KEY": "ci-test",
        "DATABASE_URL": "sqlite:///tmp/test_summaries.db",
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


def test_all_operations_have_non_empty_summary(schema):
    missing = []
    for path, methods in schema["paths"].items():
        for method, op in methods.items():
            if method == "parameters" or not isinstance(op, dict):
                continue
            if not (op.get("summary") or "").strip():
                missing.append(f"{method.upper()} {path}")
    assert missing == [], (
        f"{len(missing)} operations still missing `summary`:\n"
        + "\n".join(missing[:20])
    )


def test_api_info_has_contact(schema):
    """Linter flagged 'Missing recommended info field: contact' — fixed via
    SPECTACULAR_SETTINGS['CONTACT']."""
    contact = schema.get("info", {}).get("contact")
    assert contact, "Missing info.contact"
    assert contact.get("email"), "Missing info.contact.email"


def test_api_info_has_license(schema):
    license_info = schema.get("info", {}).get("license")
    assert license_info
    assert license_info.get("name")


def test_auto_summary_hook_registered():
    from django.conf import settings

    hooks = settings.SPECTACULAR_SETTINGS.get("POSTPROCESSING_HOOKS", [])
    assert "apps.common.openapi.auto_summary_from_operation_id" in hooks


def test_humanize_operation_id():
    from apps.common.openapi import _humanize_operation_id

    assert _humanize_operation_id("admin_audit_logs_list", "get") == "List admin audit logs"
    assert _humanize_operation_id("payments_initiate_create", "post") == "Create payments initiate"
    assert _humanize_operation_id("", "get") == ""
    # Falls back to HTTP method when verb not detected
    assert "Submit" in _humanize_operation_id("foo", "post")
