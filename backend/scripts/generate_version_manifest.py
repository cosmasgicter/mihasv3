#!/usr/bin/env python3
"""Collect every release version source and emit the V2 version manifest.

Task 1.2 of the ``admissions-v2-canonical-rebuild`` spec (Requirement R2).

This is the **I/O layer** for the version + API-major drift guard. It reads the
real sources — frontend/backend package metadata, runtime settings, the runtime
meta endpoint label, example env files, the generated-OpenAPI product-version
setting, the lockfile, and the frozen historical baseline — classifies each
one, and feeds them to the **pure** decision core
``scripts/launch-verification/version_eval.py``. The pure core decides
pass/fail; this module never re-implements that logic.

Two entry points:

* :func:`collect_sources` / :func:`build_manifest` — importable by the drift
  guard unit test (``backend/tests/unit/test_version_drift_guard.py``), which
  runs under Django in the normal pytest suite (no env gating, per R1.4).
* ``main()`` — a standalone CLI that runs ``django.setup()``, writes the
  manifest JSON, prints a summary, and **exits non-zero on drift** so it can be
  wired into CI as a hard check.

Sources checked (see design.md §2 skill-sequence trace, task 1.1 evidence, and
the task 0.5 baseline manifest):

============================================  ====================  ==========
Source                                        Classification        Expected
============================================  ====================  ==========
apps/admissions/package.json                  maintained_product    2.0.0
bun.lock (apps/admissions workspace)          maintained_product    2.0.0
backend/pyproject.toml [project].version      maintained_product    2.0.0
settings.APP_VERSION (runtime metadata)       maintained_product    2.0.0
SPECTACULAR_SETTINGS.VERSION (OpenAPI)        maintained_product    2.0.0
.env.example VITE_APP_VERSION                 maintained_product    2.0.0
apps/admissions/.env.example VITE_APP_VERSION maintained_product    2.0.0
/api/v1/ URL prefix (config/urls.py)          api_major             v1
meta endpoint api_version (meta_views.py)     api_major             v1
target /api/v2/ strict contract (design §4)   target_schema         v2
backend/schema/openapi.v1.baseline.yaml       immutable_historical  1.0.0
============================================  ====================  ==========
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# backend/scripts/generate_version_manifest.py
#   parents[0] = scripts/  [1] = backend/  [2] = <repo root>
REPO_ROOT: Path = Path(__file__).resolve().parents[2]
BACKEND_ROOT: Path = Path(__file__).resolve().parents[1]

SPEC = "admissions-v2-canonical-rebuild"
TASK = "1.2"


# --------------------------------------------------------------------------- #
# Import the pure decision core from scripts/launch-verification/version_eval.py
# (a hyphenated dir that is not an importable package name), by file path.
# --------------------------------------------------------------------------- #
def _load_version_eval():
    path = REPO_ROOT / "scripts" / "launch-verification" / "version_eval.py"
    spec = importlib.util.spec_from_file_location("version_eval", path)
    if spec is None or spec.loader is None:  # pragma: no cover - defensive
        raise ImportError(f"cannot load version_eval from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("version_eval", module)
    spec.loader.exec_module(module)
    return module


version_eval = _load_version_eval()


# --------------------------------------------------------------------------- #
# Small pure readers (no Django needed).
# --------------------------------------------------------------------------- #
def _sha256(path: Path) -> Optional[str]:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def _read_package_json_version(path: Path) -> Optional[str]:
    try:
        return json.loads(path.read_text()).get("version")
    except (OSError, ValueError):
        return None


def _read_pyproject_version(path: Path) -> Optional[str]:
    try:
        import tomllib  # Python 3.11+
    except ModuleNotFoundError:  # pragma: no cover - backend targets 3.12+
        tomllib = None
    if tomllib is not None:
        try:
            data = tomllib.loads(path.read_text())
            return data.get("project", {}).get("version")
        except (OSError, ValueError):
            return None
    # Fallback regex for the [project] version line.
    try:
        text = path.read_text()
    except OSError:
        return None
    match = re.search(r'(?m)^\s*version\s*=\s*"([^"]+)"', text)
    return match.group(1) if match else None


def _read_bun_lock_admissions_version(path: Path) -> Optional[str]:
    try:
        text = path.read_text()
    except OSError:
        return None
    match = re.search(
        r'"apps/admissions"\s*:\s*\{\s*"name"\s*:\s*"beanola-admissions"\s*,\s*'
        r'"version"\s*:\s*"([^"]+)"',
        text,
    )
    return match.group(1) if match else None


def _read_env_vite_app_version(path: Path) -> Optional[str]:
    try:
        text = path.read_text()
    except OSError:
        return None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("VITE_APP_VERSION="):
            return stripped.split("=", 1)[1].strip()
    return None


def _read_openapi_info_version(path: Path) -> Optional[str]:
    try:
        import yaml
    except ModuleNotFoundError:  # pragma: no cover - yaml is a backend dep
        yaml = None
    try:
        text = path.read_text()
    except OSError:
        return None
    if yaml is not None:
        try:
            data = yaml.safe_load(text)
            return (data or {}).get("info", {}).get("version")
        except Exception:  # noqa: BLE001 - fall through to regex
            pass
    match = re.search(r"(?m)^\s{2}version:\s*(\S+)\s*$", text)
    return match.group(1) if match else None


def _read_meta_endpoint_api_version(path: Path) -> Optional[str]:
    try:
        text = path.read_text()
    except OSError:
        return None
    match = re.search(r'"api_version"\s*:\s*"([^"]+)"', text)
    return match.group(1) if match else None


def _api_v1_prefix_present(urls_path: Path) -> bool:
    try:
        return 'api/v1/' in urls_path.read_text()
    except OSError:
        return False


def _django_versions() -> Dict[str, Optional[str]]:
    """Read APP_VERSION and the OpenAPI product version from Django settings.

    Requires Django to be configured. When called from the pytest suite the
    apps are already loaded; ``main()`` calls ``django.setup()`` first.
    """
    try:
        from django.conf import settings

        app_version = getattr(settings, "APP_VERSION", None)
        spectacular = getattr(settings, "SPECTACULAR_SETTINGS", {}) or {}
        return {
            "app_version": app_version,
            "spectacular_version": spectacular.get("VERSION"),
        }
    except Exception:  # noqa: BLE001 - Django not configured / import error
        return {"app_version": None, "spectacular_version": None}


def _commit_sha() -> Optional[str]:
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return out.stdout.strip() or None
    except Exception:  # noqa: BLE001
        return None


# --------------------------------------------------------------------------- #
# Collection.
# --------------------------------------------------------------------------- #
def collect_sources() -> List[Dict[str, Any]]:
    """Read every real release source and return classified source records.

    The returned records are exactly the shape the pure evaluator expects
    (``name`` / ``classification`` / ``value``; plus ``path``/``sha256`` for
    file sources and a ``note`` for the immutable historical baseline).
    """
    dj = _django_versions()

    admissions_pkg = REPO_ROOT / "apps" / "admissions" / "package.json"
    bun_lock = REPO_ROOT / "bun.lock"
    pyproject = BACKEND_ROOT / "pyproject.toml"
    root_env = REPO_ROOT / ".env.example"
    admissions_env = REPO_ROOT / "apps" / "admissions" / ".env.example"
    urls_py = BACKEND_ROOT / "config" / "urls.py"
    meta_views = BACKEND_ROOT / "apps" / "common" / "meta_views.py"
    baseline_yaml = BACKEND_ROOT / "schema" / "openapi.v1.baseline.yaml"

    ME = version_eval.MAINTAINED_PRODUCT
    API = version_eval.API_MAJOR
    TGT = version_eval.TARGET_SCHEMA
    HIST = version_eval.IMMUTABLE_HISTORICAL

    sources: List[Dict[str, Any]] = [
        {
            "name": "apps/admissions/package.json",
            "classification": ME,
            "value": _read_package_json_version(admissions_pkg),
            "path": "apps/admissions/package.json",
            "sha256": _sha256(admissions_pkg),
        },
        {
            "name": "bun.lock (apps/admissions workspace)",
            "classification": ME,
            "value": _read_bun_lock_admissions_version(bun_lock),
            "path": "bun.lock",
            "sha256": _sha256(bun_lock),
        },
        {
            "name": "backend/pyproject.toml [project].version",
            "classification": ME,
            "value": _read_pyproject_version(pyproject),
            "path": "backend/pyproject.toml",
            "sha256": _sha256(pyproject),
        },
        {
            "name": "backend APP_VERSION (settings runtime metadata)",
            "classification": ME,
            "value": dj["app_version"],
            "path": "backend/config/settings/base.py",
        },
        {
            "name": "generated OpenAPI product version (SPECTACULAR_SETTINGS.VERSION)",
            "classification": ME,
            "value": dj["spectacular_version"],
            "path": "backend/config/settings/base.py",
        },
        {
            "name": ".env.example VITE_APP_VERSION",
            "classification": ME,
            "value": _read_env_vite_app_version(root_env),
            "path": ".env.example",
            "sha256": _sha256(root_env),
        },
        {
            "name": "apps/admissions/.env.example VITE_APP_VERSION",
            "classification": ME,
            "value": _read_env_vite_app_version(admissions_env),
            "path": "apps/admissions/.env.example",
            "sha256": _sha256(admissions_env),
        },
        {
            "name": "/api/v1/ URL prefix (config/urls.py)",
            "classification": API,
            "value": (version_eval.API_MAJOR_LABEL if _api_v1_prefix_present(urls_py) else None),
            "path": "backend/config/urls.py",
        },
        {
            "name": "meta endpoint api_version (/api/v1/meta/platform/)",
            "classification": API,
            "value": _read_meta_endpoint_api_version(meta_views),
            "path": "backend/apps/common/meta_views.py",
        },
        {
            "name": "target /api/v2/ strict contract (design.md §4)",
            "classification": TGT,
            "value": version_eval.TARGET_SCHEMA_LABEL,
            "path": ".kiro/specs/admissions-v2-canonical-rebuild/design.md",
        },
        {
            "name": "backend/schema/openapi.v1.baseline.yaml (frozen V1 launch baseline)",
            "classification": HIST,
            "value": _read_openapi_info_version(baseline_yaml),
            "path": "backend/schema/openapi.v1.baseline.yaml",
            "sha256": _sha256(baseline_yaml),
            "note": (
                "Immutable historical launch evidence: frozen V1 OpenAPI baseline "
                "labelled info.version=1.0.0 (generated 2026-05-08 per "
                "backend/schema/README.md; kept at 1.0.0 by task 1.1). Product "
                "version 2.0.0 does not rewrite this artifact (R2.7)."
            ),
        },
    ]
    return sources


def build_manifest() -> Dict[str, Any]:
    """Collect sources, evaluate them with the pure core, and build the manifest."""
    sources = collect_sources()
    evaluation = version_eval.evaluate_version_consistency(sources)
    return {
        "spec": SPEC,
        "task": TASK,
        "task_title": "Add an executable version and API-major drift guard",
        "requirements": ["R2", "R2.1", "R2.5", "R2.7"],
        "findings": ["REL-01", "GOV-05"],
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "nature": (
            "Generated version manifest for the executable drift guard. The "
            "guard (backend/tests/unit/test_version_drift_guard.py) asserts "
            "every maintained product-version source equals 2.0.0, the API "
            "major label 'v1' and target schema label 'v2' stay distinct from "
            "the product version, and the frozen 1.0.0 V1 baseline is allowed "
            "as labelled immutable historical evidence rather than flagged as "
            "drift."
        ),
        "release_identity": {"commit_sha": _commit_sha()},
        "labels": evaluation["labels"],
        "sources": sources,
        "evaluation": evaluation,
    }


# --------------------------------------------------------------------------- #
# CLI.
# --------------------------------------------------------------------------- #
def _django_setup() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
    os.environ.setdefault("TESTING", "1")
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))
    import django

    django.setup()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the V2 version manifest / drift check.")
    parser.add_argument(
        "--out",
        default=str(REPO_ROOT / "docs" / "v2-evidence" / "1.2" / "version-manifest.json"),
        help="Path to write the manifest JSON.",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Do not write the manifest; only evaluate and exit non-zero on drift.",
    )
    args = parser.parse_args(argv)

    _django_setup()
    manifest = build_manifest()
    evaluation = manifest["evaluation"]

    if not args.check_only:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"wrote {out_path}")

    print(f"version-drift status: {evaluation['status']}")
    print(f"labels: {evaluation['labels']}")
    if evaluation["drift"]:
        print("DRIFT DETECTED:")
        for item in evaluation["drift"]:
            print(f"  - {item}")
        return 1
    print("OK — all maintained product-version sources equal "
          f"{evaluation['labels']['product']}; api-major and target-schema labels distinct.")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    raise SystemExit(main())
