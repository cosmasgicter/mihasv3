"""Backend release-metadata contract + runtime version output.

Task 1.7 of the ``admissions-v2-canonical-rebuild`` spec (Requirements R2.8,
R17.1; finding REL-02).

The backend is deliberately a **non-package Django application**: it is deployed
by installing ``requirements.txt`` and running it in place
(``uvicorn config.asgi:application``), not by building/installing a pip
distribution. See ``backend/pyproject.toml`` and ``backend/DEPLOY.md`` →
"Release model: non-package application".

These tests lock that decision in so the misleading setuptools build contract
that REL-02 flagged cannot silently come back, and so the supported *runtime*
version output keeps reporting the drift-guarded product version ``2.0.0``:

* the ``pyproject.toml`` declares no ``[build-system]`` (nothing claims the
  project is pip-installable) while still exposing ``[project].version`` as the
  drift-guarded product-version source (task 1.2);
* ``python manage.py app_version`` prints exactly ``settings.APP_VERSION`` and,
  at HEAD, that value is ``2.0.0``;
* the command faithfully tracks ``settings.APP_VERSION`` for any configured
  value (so it is a real runtime read, not a hardcoded string).
"""

from __future__ import annotations

import tomllib
from io import StringIO
from pathlib import Path

import pytest
from django.conf import settings
from django.core.management import call_command
from django.test import override_settings

# backend/tests/unit/test_backend_release_metadata.py
#   parents[0]=unit [1]=tests [2]=backend
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_PYPROJECT = _BACKEND_ROOT / "pyproject.toml"

PRODUCT_VERSION = "2.0.0"


def _load_pyproject() -> dict:
    return tomllib.loads(_PYPROJECT.read_text())


# --------------------------------------------------------------------------- #
# Packaging contract (REL-02): explicitly a non-package application.
# --------------------------------------------------------------------------- #
def test_pyproject_declares_no_build_system():
    """REL-02 — no [build-system] table: the project is not a pip distribution.

    The original defect was a declared setuptools build contract whose builds
    failed (flat-layout multi-package auto-discovery). The non-package decision
    removes that contract entirely; re-introducing one must fail this guard.
    """
    data = _load_pyproject()
    assert "build-system" not in data, (
        "backend/pyproject.toml must NOT declare a [build-system]: the backend is "
        "a non-package Django application deployed via requirements.txt (finding "
        "REL-02). If you intend to make it an installable distribution, configure "
        "explicit [tool.setuptools.packages.find] discovery for apps*/config* and "
        "update this guard + backend/DEPLOY.md deliberately."
    )
    # And no setuptools packaging config sneaking the auto-discovery back in.
    assert "setuptools" not in data.get("tool", {}), (
        "backend/pyproject.toml must not carry [tool.setuptools*] packaging config "
        "for the non-package application."
    )


def test_pyproject_keeps_drift_guarded_project_version():
    """R2.1/R2.8 — [project].version stays the drift-guarded 2.0.0 metadata."""
    project = _load_pyproject().get("project", {})
    assert project.get("name") == "beanola-django-api"
    assert project.get("version") == PRODUCT_VERSION, (
        f"[project].version must remain {PRODUCT_VERSION!r} (drift-guarded by "
        "task 1.2 — backend/tests/unit/test_version_drift_guard.py)."
    )
    # Tooling config that lives in the same file must be preserved.
    tool = _load_pyproject().get("tool", {})
    assert "pytest" in tool and "ruff" in tool


def test_pyproject_documents_non_package_decision():
    """The file explicitly documents the non-package release model for readers."""
    text = _PYPROJECT.read_text().lower()
    assert "non-package" in text
    assert "requirements.txt" in text


# --------------------------------------------------------------------------- #
# Runtime version output (R2.8, R17.1): `python manage.py app_version`.
#
# The command is named `app_version`, not `version`: Django's ManagementUtility
# special-cases the bare `version` subcommand to print the framework version,
# which would shadow a custom command of that name on the real CLI.
# --------------------------------------------------------------------------- #
def test_app_version_command_prints_bare_product_version():
    out = StringIO()
    call_command("app_version", stdout=out)
    printed = out.getvalue().strip()
    assert printed == str(settings.APP_VERSION)


def test_app_version_command_reports_two_point_zero_at_head():
    """At HEAD the running product version is the drift-guarded 2.0.0."""
    assert settings.APP_VERSION == PRODUCT_VERSION
    out = StringIO()
    call_command("app_version", stdout=out)
    assert out.getvalue().strip() == PRODUCT_VERSION


def test_app_version_command_verbose_reports_distinct_api_major():
    out = StringIO()
    call_command("app_version", "--verbose", stdout=out)
    body = out.getvalue()
    assert f"product_version: {settings.APP_VERSION}" in body
    # R2.5 — the API-major label is distinct from the product version.
    assert "api_version: v1" in body
    assert f"api_version: {settings.APP_VERSION}" not in body


@pytest.mark.parametrize("configured", ["2.0.0", "2.1.0", "9.9.9-rc1", "dev"])
def test_app_version_command_tracks_settings_app_version(configured):
    """The command is a real read of settings.APP_VERSION, not a constant."""
    with override_settings(APP_VERSION=configured):
        out = StringIO()
        call_command("app_version", stdout=out)
        assert out.getvalue().strip() == configured
