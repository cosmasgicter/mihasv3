"""Test that backend/scripts/api_quality.sh passes against its own baseline.

Smoke test — not a full regression harness. The script generates /tmp artifacts
that CI can upload as build artifacts on PR runs.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
SCRIPT = BACKEND / "scripts" / "api_quality.sh"


def _find_venv_python() -> str | None:
    """Locate the audit venv used during remediation, falling back to PATH python."""
    candidates = [
        Path("/tmp/mihas_audit_venv/bin/python"),
        Path("/opt/venv/bin/python"),
    ]
    for c in candidates:
        if c.is_file():
            return str(c)
    return shutil.which("python") or shutil.which("python3")


@pytest.mark.integration
def test_api_quality_script_passes_against_baseline(tmp_path):
    """Running the script with no code changes must exit 0 (no regression)."""
    py = _find_venv_python()
    if not py:
        pytest.skip("No python executable found")

    # Make sure drf-spectacular and django are importable with this python
    probe = subprocess.run(
        [py, "-c", "import django, drf_spectacular"],
        capture_output=True,
    )
    if probe.returncode != 0:
        pytest.skip(f"Python at {py} lacks backend deps; run `pip install -r backend/requirements.txt`")

    report = tmp_path / "report.md"
    # Build a clean env to avoid inheriting pytest TESTING/CACHE overrides that
    # django_ratelimit rejects at check time.
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", "/tmp"),
        "DJANGO_SETTINGS_MODULE": "config.settings.dev",
        "SECRET_KEY": "ci-test",
        "JWT_SIGNING_KEY": "ci-test",
        "DATABASE_URL": "sqlite:///tmp/api_quality_test.db",
        "REDIS_URL": "redis://localhost:6379/0",
        "ALLOWED_HOSTS": "*",
        "PY": py,
    }

    res = subprocess.run(
        ["bash", str(SCRIPT), "--report", str(report)],
        env=env,
        capture_output=True,
        text=True,
    )
    # Schema regen may fail in environments without cache/redis. Skip cleanly in that case.
    if res.returncode == 2 and "schema generation failed" in res.stderr:
        pytest.skip(f"Environment cannot run manage.py spectacular cleanly: {res.stderr.splitlines()[1:4]}")

    assert res.returncode == 0, (
        f"api_quality.sh failed (exit {res.returncode}).\n"
        f"stderr: {res.stderr}\nstdout: {res.stdout}"
    )
    assert report.is_file()
    content = report.read_text()
    assert "Linter issue count within baseline" in content
    assert "No breaking changes" in content


def test_script_file_exists_and_is_executable():
    assert SCRIPT.is_file(), f"Missing {SCRIPT}"
    assert os.access(SCRIPT, os.X_OK), f"{SCRIPT} is not executable"


def test_makefile_has_api_quality_target():
    makefile = BACKEND / "Makefile"
    assert makefile.is_file()
    content = makefile.read_text()
    assert "api-quality:" in content
    assert "schema-baseline:" in content


def test_remediation_targets_has_required_rows():
    targets = BACKEND / "schema" / "REMEDIATION_TARGETS.md"
    assert targets.is_file()
    content = targets.read_text()
    # Core rows the api-quality script relies on (or will rely on post-Phase 3)
    assert "drf-spectacular errors" in content
    assert "Untagged operations" in content
    assert "Operations without `summary`" in content
    assert "APIViews without" in content
