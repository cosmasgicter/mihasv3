"""Property tests for the pure version-drift decision core.

Task 1.2 of the ``admissions-v2-canonical-rebuild`` spec (Requirement R2).

These properties target the **pure decision core**,
``scripts/launch-verification/version_eval.py``. That module performs no I/O
(no Django, no filesystem, no network), so it is loaded by file path and driven
with hypothesis without any database. This sidesteps the backend
``conftest.py`` Postgres fixtures — run with ``backend/.venv/bin/python``.

**Validates: Requirements 2.1, 2.5, 2.7**
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from hypothesis import given
from hypothesis import strategies as st

# test file = backend/tests/property/test_version_drift_properties.py
#   parents[0]=property [1]=tests [2]=backend [3]=<repo root>
_REPO_ROOT = Path(__file__).resolve().parents[3]
_VERSION_EVAL_PATH = _REPO_ROOT / "scripts" / "launch-verification" / "version_eval.py"

_spec = importlib.util.spec_from_file_location("version_eval", _VERSION_EVAL_PATH)
assert _spec is not None and _spec.loader is not None
version_eval = importlib.util.module_from_spec(_spec)
sys.modules.setdefault("version_eval", version_eval)
_spec.loader.exec_module(version_eval)

PRODUCT = version_eval.PRODUCT_VERSION
ME = version_eval.MAINTAINED_PRODUCT
HIST = version_eval.IMMUTABLE_HISTORICAL

# A pool of version-ish strings; some equal the product version, some don't.
_versions = st.sampled_from(["2.0.0", "2.0.1", "1.0.0", "0.1.0", "3.0.0", "v1", ""])


@given(values=st.lists(_versions, min_size=1, max_size=8))
def test_passes_iff_every_maintained_source_equals_product(values):
    """R2.1/R2.7 — the guard passes exactly when no maintained source drifts."""
    sources = [
        {"name": f"src[{i}]", "classification": ME, "value": v}
        for i, v in enumerate(values)
    ]
    result = version_eval.evaluate_version_consistency(sources)
    all_match = all(v == PRODUCT for v in values)
    assert result["passed"] is all_match
    if not all_match:
        assert any(d["kind"] == "product_drift" for d in result["drift"])


@given(
    value=_versions,
    note=st.sampled_from(["frozen V1 baseline @ commit abc123", "release 1.0.0", ""]),
)
def test_immutable_historical_never_reports_product_drift(value, note):
    """R2.7 — a labelled immutable source is never a product_drift, any value."""
    sources = [{"name": "baseline.yaml", "classification": HIST, "value": value, "note": note}]
    result = version_eval.evaluate_version_consistency(sources)
    # Never a product_drift regardless of value …
    assert not any(d["kind"] == "product_drift" for d in result["drift"])
    # … but an EMPTY note is the one thing that fails it (unlabeled_immutable).
    if note.strip():
        assert result["passed"]
    else:
        assert not result["passed"]
        assert any(d["kind"] == "unlabeled_immutable" for d in result["drift"])


@given(
    product=st.sampled_from(["2.0.0", "3.0.0"]),
    api_major=st.sampled_from(["v1", "v2", "2.0.0"]),
    target=st.sampled_from(["v2", "v3", "2.0.0"]),
)
def test_label_conflation_is_detected(product, api_major, target):
    """R2.5 — the verdict flags conflation exactly when two labels collide."""
    result = version_eval.evaluate_version_consistency(
        [], expected_product=product, api_major_label=api_major, target_schema_label=target
    )
    distinct = len({product, api_major, target}) == 3
    conflated = any(d["kind"] == "label_conflation" for d in result["drift"])
    assert conflated is (not distinct)
    # With no sources and distinct labels the guard passes.
    if distinct:
        assert result["passed"]
