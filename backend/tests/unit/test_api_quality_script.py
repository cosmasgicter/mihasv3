"""Test that backend/scripts/api_quality.sh passes against its own baseline.

Smoke test — not a full regression harness. The script generates /tmp artifacts
that CI can upload as build artifacts on PR runs.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
SCRIPT = BACKEND / "scripts" / "api_quality.sh"


@pytest.mark.integration
def test_api_quality_script_passes_against_baseline(tmp_path):
    """Running the script with no code changes must exit 0 (no regression)."""
    # The test is already executing inside the backend environment. Reuse that
    # exact interpreter instead of searching PATH (which made invocation style
    # decide whether this required gate ran or silently skipped).
    py = sys.executable

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
    assert res.returncode == 0, (
        f"api_quality.sh failed (exit {res.returncode}).\n"
        f"stderr: {res.stderr}\nstdout: {res.stdout}"
    )
    assert report.is_file()
    content = report.read_text()
    assert "Actionable linter issue density within baseline" in content
    assert "Linter errors: 0" in content
    assert "drf-spectacular errors: 0" in content
    assert "drf-spectacular warnings: 0" in content
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
