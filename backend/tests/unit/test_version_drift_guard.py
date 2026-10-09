"""Executable version + API-major drift guard.

Task 1.2 of the ``admissions-v2-canonical-rebuild`` spec (Requirement R2 —
Platform Identity, Release Version, And Compatibility).

This is the CI-enforced guard that Task 1.1 deferred ("consistency guard remains
1.2"). It runs in the ordinary backend pytest suite with **no environment
gating** (R1.4) and asserts, against the *live* sources:

* **R2.1** — every maintained product-version source (frontend package, backend
  package, runtime ``APP_VERSION`` metadata, generated-OpenAPI product version,
  both example env files, and the ``bun.lock`` workspace entry) reports
  ``2.0.0``.
* **R2.5** — the API major label (``v1``: the ``/api/v1/`` URL prefix and the
  runtime meta endpoint ``api_version``) and the target schema label (``v2``)
  stay **distinct** from the product version.
* **R2.7** — the guard **fails** when any maintained source drifts (proven with
  synthetic facts against the pure core so no real file is perturbed), while the
  frozen ``1.0.0`` V1 OpenAPI baseline is **allowed** as labelled immutable
  historical evidence rather than flagged as drift.

The collection I/O lives in ``backend/scripts/generate_version_manifest.py`` and
the pure decision logic in ``scripts/launch-verification/version_eval.py``; this
test drives both.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

# backend/tests/unit/test_version_drift_guard.py
#   parents[0]=unit [1]=tests [2]=backend [3]=<repo root>
_REPO_ROOT = Path(__file__).resolve().parents[3]
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _load(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None and spec.loader is not None, f"cannot load {path}"
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(module_name, module)
    spec.loader.exec_module(module)
    return module


version_eval = _load(
    "version_eval",
    _REPO_ROOT / "scripts" / "launch-verification" / "version_eval.py",
)
manifest_gen = _load(
    "generate_version_manifest",
    _BACKEND_ROOT / "scripts" / "generate_version_manifest.py",
)

PRODUCT_VERSION = version_eval.PRODUCT_VERSION  # "2.0.0"
API_MAJOR_LABEL = version_eval.API_MAJOR_LABEL  # "v1"
TARGET_SCHEMA_LABEL = version_eval.TARGET_SCHEMA_LABEL  # "v2"


# --------------------------------------------------------------------------- #
# Positive: the live sources agree at HEAD.
# --------------------------------------------------------------------------- #
def test_live_sources_pass_the_drift_guard():
    """Every live source evaluates clean — this is the CI drift guard itself."""
    sources = manifest_gen.collect_sources()
    result = version_eval.evaluate_version_consistency(sources)
    assert result["passed"], f"version drift detected: {result['drift']}"
    assert result["drift"] == []
    assert result["status"] == version_eval.STATUS_PASSED


def test_every_maintained_source_reports_product_version():
    """R2.1 — each maintained product-version source equals 2.0.0."""
    sources = manifest_gen.collect_sources()
    maintained = [
        s for s in sources if s["classification"] == version_eval.MAINTAINED_PRODUCT
    ]
    # All seven maintained sources must be present and equal to the product version.
    assert len(maintained) == 7, [s["name"] for s in maintained]
    for source in maintained:
        assert source["value"] == PRODUCT_VERSION, (
            f"{source['name']} = {source['value']!r}, expected {PRODUCT_VERSION!r}"
        )


def test_api_major_and_target_labels_are_distinct_from_product():
    """R2.5 — product, API major, and target schema are three separate labels."""
    assert version_eval.labels_distinct(
        PRODUCT_VERSION, API_MAJOR_LABEL, TARGET_SCHEMA_LABEL
    )
    assert API_MAJOR_LABEL != PRODUCT_VERSION
    assert TARGET_SCHEMA_LABEL != PRODUCT_VERSION
    assert API_MAJOR_LABEL != TARGET_SCHEMA_LABEL

    sources = manifest_gen.collect_sources()
    api_sources = [s for s in sources if s["classification"] == version_eval.API_MAJOR]
    assert api_sources, "no api_major source collected"
    for source in api_sources:
        assert source["value"] == API_MAJOR_LABEL


def test_frozen_v1_baseline_is_allowed_not_flagged_as_drift():
    """R2.7 — the immutable 1.0.0 V1 baseline is labelled evidence, not drift."""
    sources = manifest_gen.collect_sources()
    historical = [
        s for s in sources if s["classification"] == version_eval.IMMUTABLE_HISTORICAL
    ]
    assert historical, "frozen V1 baseline source not collected"
    baseline = historical[0]
    # It is deliberately NOT 2.0.0 …
    assert baseline["value"] == "1.0.0"
    # … and must carry a release/commit label.
    assert baseline.get("note", "").strip(), "immutable baseline missing its label note"

    # And the evaluator must not treat that 1.0.0 value as a violation.
    result = version_eval.evaluate_version_consistency(sources)
    baseline_drift = [d for d in result["drift"] if d["source"] == baseline["name"]]
    assert baseline_drift == []


def test_runtime_meta_endpoint_reports_distinct_api_version():
    """R2.5 — the runtime meta endpoint exposes api_version 'v1', not the product."""
    from django.test import RequestFactory

    from apps.common.meta_views import PlatformMetaView

    request = RequestFactory().get("/api/v1/meta/platform/")
    response = PlatformMetaView.as_view()(request)
    payload = response.data
    assert payload["api_version"] == API_MAJOR_LABEL
    assert payload["api_version"] != PRODUCT_VERSION


# --------------------------------------------------------------------------- #
# Negative proof: the guard FAILS when a source drifts. Driven with synthetic
# facts against the pure core so no real file is perturbed in CI (R2.7).
# --------------------------------------------------------------------------- #
def test_guard_fails_when_a_maintained_source_drifts():
    drifted = [
        {"name": "apps/admissions/package.json", "classification": version_eval.MAINTAINED_PRODUCT, "value": "2.0.0"},
        # A single perturbed source — e.g. a stray bump — must fail the guard.
        {"name": "backend/pyproject.toml", "classification": version_eval.MAINTAINED_PRODUCT, "value": "2.0.1"},
    ]
    result = version_eval.evaluate_version_consistency(drifted)
    assert not result["passed"]
    kinds = {d["kind"] for d in result["drift"]}
    assert "product_drift" in kinds
    offenders = {d["source"] for d in result["drift"]}
    assert "backend/pyproject.toml" in offenders
    assert "apps/admissions/package.json" not in offenders


def test_guard_fails_when_api_major_relabelled_to_product():
    """A collapsed api_major label (v1 -> 2.0.0) is caught two ways."""
    sources = [
        {"name": "meta api_version", "classification": version_eval.API_MAJOR, "value": "2.0.0"},
    ]
    result = version_eval.evaluate_version_consistency(sources)
    assert not result["passed"]
    kinds = {d["kind"] for d in result["drift"]}
    # api_major source no longer equals "v1"
    assert "api_major_drift" in kinds


def test_guard_fails_when_labels_are_conflated():
    """R2.5 — conflating any two of the three release labels fails the guard."""
    result = version_eval.evaluate_version_consistency(
        [],
        expected_product="2.0.0",
        api_major_label="2.0.0",  # collapsed onto the product version
        target_schema_label="v2",
    )
    assert not result["passed"]
    assert any(d["kind"] == "label_conflation" for d in result["drift"])


def test_guard_fails_on_unlabeled_immutable_evidence():
    """R2.7 — a frozen artifact with no release/commit note is rejected."""
    sources = [
        {"name": "mystery-frozen.yaml", "classification": version_eval.IMMUTABLE_HISTORICAL, "value": "0.9.0"},
    ]
    result = version_eval.evaluate_version_consistency(sources)
    assert not result["passed"]
    assert any(d["kind"] == "unlabeled_immutable" for d in result["drift"])


def test_guard_fails_on_unknown_classification():
    sources = [
        {"name": "rogue-source", "classification": "something-else", "value": "9.9.9"},
    ]
    result = version_eval.evaluate_version_consistency(sources)
    assert not result["passed"]
    assert any(d["kind"] == "unknown_classification" for d in result["drift"])


# --------------------------------------------------------------------------- #
# The generated manifest evidence stays in sync with the live sources.
# --------------------------------------------------------------------------- #
def test_generated_manifest_matches_live_sources():
    manifest_path = _REPO_ROOT / "docs" / "v2-evidence" / "1.2" / "version-manifest.json"
    assert manifest_path.is_file(), "run scripts/generate_version_manifest.py first"

    import json

    committed = json.loads(manifest_path.read_text())
    live = manifest_gen.build_manifest()

    # Compare the stable parts (values/classifications), ignoring timestamp.
    def _stable(sources):
        return sorted(
            (s["name"], s["classification"], s["value"]) for s in sources
        )

    assert _stable(committed["sources"]) == _stable(live["sources"])
    assert committed["labels"] == live["labels"]
    assert committed["evaluation"]["passed"] is True
    assert live["evaluation"]["passed"] is True
