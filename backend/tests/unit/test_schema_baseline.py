"""Tests for backend/schema/ baseline artifacts."""
from __future__ import annotations

import json
from pathlib import Path

import yaml

SCHEMA_DIR = Path(__file__).resolve().parents[2] / "schema"


def test_baseline_schema_exists():
    path = SCHEMA_DIR / "openapi.v1.baseline.yaml"
    assert path.is_file(), f"Missing {path}"
    assert path.stat().st_size > 10_000, "Baseline schema suspiciously small"


def test_baseline_schema_parses_as_openapi_3_0():
    schema = yaml.safe_load((SCHEMA_DIR / "openapi.v1.baseline.yaml").read_text())
    assert schema is not None
    assert "openapi" in schema
    assert schema["openapi"].startswith("3.0")
    assert "paths" in schema
    assert len(schema["paths"]) > 50, "Baseline schema has too few paths"


def test_baseline_schema_has_info_block():
    schema = yaml.safe_load((SCHEMA_DIR / "openapi.v1.baseline.yaml").read_text())
    info = schema.get("info", {})
    assert info.get("title"), "Schema info.title missing"
    assert info.get("version"), "Schema info.version missing"


def test_baseline_lint_exists():
    path = SCHEMA_DIR / "lint_baseline.json"
    assert path.is_file(), f"Missing {path}"


def test_baseline_lint_parses_as_json():
    data = json.loads((SCHEMA_DIR / "lint_baseline.json").read_text())
    assert "summary" in data
    assert "issues" in data
    assert data["summary"]["total_endpoints"] > 0


def test_readme_describes_regeneration():
    readme = SCHEMA_DIR / "README.md"
    assert readme.is_file()
    content = readme.read_text()
    assert "manage.py spectacular" in content
    assert "Do not manually edit" in content
