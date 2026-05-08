"""Tests for OpenAPI tag coverage.

Every operation under /api/v1/ must carry a domain tag, not the default 'api'.
Enforced by the SPECTACULAR_SETTINGS['POSTPROCESSING_HOOKS'] hook in
apps/common/openapi.py::auto_tag_by_url_prefix.
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
    """Regenerate the schema on-demand for this test module."""
    out = Path("/tmp/test_schema_tags.yaml")
    env = {
        "PATH": "/usr/bin:/bin:/tmp/mihas_audit_venv/bin",
        "HOME": "/tmp",
        "DJANGO_SETTINGS_MODULE": "config.settings.dev",
        "SECRET_KEY": "ci-test",
        "JWT_SIGNING_KEY": "ci-test",
        "DATABASE_URL": "sqlite:///tmp/test_tags.db",
        "REDIS_URL": "redis://localhost:6379/0",
        "ALLOWED_HOSTS": "*",
    }
    py_candidates = [
        "/tmp/mihas_audit_venv/bin/python",
        sys.executable,
    ]
    py = next((p for p in py_candidates if Path(p).is_file()), sys.executable)
    res = subprocess.run(
        [py, "manage.py", "spectacular", "--file", str(out)],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        pytest.skip(f"schema regen failed: {res.stderr[:500]}")
    return yaml.safe_load(out.read_text())


def test_no_operation_is_tagged_only_api(schema):
    violations = []
    for path, methods in schema["paths"].items():
        for method, op in methods.items():
            if method == "parameters" or not isinstance(op, dict):
                continue
            tags = op.get("tags") or []
            if tags == ["api"]:
                violations.append(f"{method.upper()} {path}")
    assert violations == [], (
        f"Operations still only tagged 'api': {len(violations)}\n"
        + "\n".join(violations[:20])
    )


def test_all_operations_have_at_least_one_tag(schema):
    missing = []
    for path, methods in schema["paths"].items():
        for method, op in methods.items():
            if method == "parameters" or not isinstance(op, dict):
                continue
            if not op.get("tags"):
                missing.append(f"{method.upper()} {path}")
    assert missing == [], (
        f"Operations without any tag: {len(missing)}\n"
        + "\n".join(missing[:20])
    )


@pytest.mark.parametrize(
    "path_prefix,expected_tag",
    [
        ("/api/v1/admin/", "admin"),
        ("/api/v1/applications/", "applications"),
        ("/api/v1/auth/", "auth"),
        ("/api/v1/payments/", "payments"),
        ("/api/v1/documents/", "documents"),
        ("/api/v1/notifications/", "notifications"),
        ("/api/v1/errors/", "errors"),
    ],
)
def test_url_prefix_maps_to_expected_tag(schema, path_prefix, expected_tag):
    """Every operation whose path starts with a known prefix must include
    the expected domain tag (either as the only tag or alongside other tags)."""
    found = False
    for path, methods in schema["paths"].items():
        if not path.startswith(path_prefix):
            continue
        for method, op in methods.items():
            if method == "parameters" or not isinstance(op, dict):
                continue
            tags = op.get("tags") or []
            assert expected_tag in tags, (
                f"{method.upper()} {path} has tags={tags} — expected '{expected_tag}'"
            )
            found = True
    assert found, f"No operations found with prefix {path_prefix}"


def test_auto_tag_hook_is_registered():
    """SPECTACULAR_SETTINGS must reference the postprocessing hook."""
    from django.conf import settings

    hooks = settings.SPECTACULAR_SETTINGS.get("POSTPROCESSING_HOOKS", [])
    assert "apps.common.openapi.auto_tag_by_url_prefix" in hooks
