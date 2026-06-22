"""Unit tests for the performance-hardening baseline harness (task 2.1).

Exercises the reusable divergence comparator and the golden-snapshot store in
isolation (no Django/DB), proving the harness reliably detects every kind of
output divergence the post-feature tests depend on (R13.6) and that the
golden capture-or-compare contract behaves correctly.

# Feature: system-performance-hardening
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest

from tests.perf_baseline import (
    CHANGED_ENDPOINTS,
    GoldenStore,
    assert_envelope,
    assert_equivalent,
    diff_snapshots,
    normalize_snapshot,
    snapshot_envelope,
    structural_signature,
)
from tests.perf_baseline.divergence import VOLATILE


# ---------------------------------------------------------------------------
# normalize_snapshot
# ---------------------------------------------------------------------------


def test_normalize_collapses_volatile_keys_and_coerces_types():
    raw = {
        "id": str(uuid4()),
        "created_at": datetime(2025, 1, 2, 3, 4, 5, tzinfo=timezone.utc),
        "amount": Decimal("750.00"),
        "currency": "ZMW",
        "nested": {"updated_at": "anything", "count": 3},
        "items": ({"id": 1, "grade": 2},),
    }
    out = normalize_snapshot(raw)

    assert out["id"] == VOLATILE
    assert out["created_at"] == VOLATILE
    assert out["nested"]["updated_at"] == VOLATILE
    assert out["nested"]["count"] == 3
    # Decimal -> canonical string; non-volatile value preserved.
    assert out["amount"] == "750"
    assert out["currency"] == "ZMW"
    # tuple -> list, nested volatile id collapsed, real value kept.
    assert out["items"] == [{"id": VOLATILE, "grade": 2}]


def test_normalize_decimal_scale_is_irrelevant():
    assert normalize_snapshot(Decimal("750")) == normalize_snapshot(Decimal("750.0000"))
    assert normalize_snapshot({"x": Decimal("0.50")})["x"] == "0.5"


def test_normalize_sets_become_sorted_lists():
    assert normalize_snapshot({"caps": {"b", "a", "c"}})["caps"] == ["a", "b", "c"]


# ---------------------------------------------------------------------------
# diff_snapshots / assert_equivalent
# ---------------------------------------------------------------------------


def test_identical_payloads_have_no_divergence():
    payload = {"success": True, "data": {"total": 4, "by_status": {"submitted": 2}}}
    assert diff_snapshots(payload, payload) == []
    # And the volatile id genuinely does not register as a difference.
    a = {"id": str(uuid4()), "points": 11}
    b = {"id": str(uuid4()), "points": 11}
    assert diff_snapshots(a, b) == []


def test_value_mismatch_is_detected():
    base = {"data": {"points": 11}}
    cand = {"data": {"points": 12}}
    divs = diff_snapshots(base, cand)
    assert len(divs) == 1
    assert divs[0].kind == "value_mismatch"
    assert divs[0].path == "data.points"
    assert divs[0].baseline == 11 and divs[0].candidate == 12


def test_missing_and_extra_keys_detected():
    base = {"data": {"a": 1, "b": 2}}
    cand = {"data": {"a": 1, "c": 3}}
    kinds = {(d.kind, d.path) for d in diff_snapshots(base, cand)}
    assert ("missing_key", "data.b") in kinds
    assert ("extra_key", "data.c") in kinds


def test_type_mismatch_detected_but_int_float_compatible():
    assert diff_snapshots({"n": 3}, {"n": "3"})[0].kind == "type_mismatch"
    # int vs float of equal value is treated as compatible (JSON round-trips).
    assert diff_snapshots({"n": 3}, {"n": 3.0}) == []


def test_list_length_mismatch_detected():
    divs = diff_snapshots({"results": [1, 2]}, {"results": [1, 2, 3]})
    assert any(d.kind == "length_mismatch" and d.path == "results" for d in divs)


def test_assert_equivalent_raises_with_report():
    with pytest.raises(AssertionError) as exc:
        assert_equivalent({"x": 1}, {"x": 2}, label="grade summary")
    message = str(exc.value)
    assert "grade summary" in message
    assert "value_mismatch" in message


def test_assert_equivalent_passes_for_equivalent_outputs():
    base = {"success": True, "data": {"id": str(uuid4()), "total": 7}}
    cand = {"success": True, "data": {"id": str(uuid4()), "total": 7}}
    assert_equivalent(base, cand)  # volatile id ignored, total matches


# ---------------------------------------------------------------------------
# assert_envelope
# ---------------------------------------------------------------------------


def test_assert_envelope_returns_data_on_success():
    data = assert_envelope({"success": True, "data": {"k": 1}})
    assert data == {"k": 1}


def test_assert_envelope_rejects_non_envelope():
    with pytest.raises(AssertionError):
        assert_envelope([1, 2, 3])
    with pytest.raises(AssertionError):
        assert_envelope({"success": True})  # no data key


def test_assert_envelope_error_mode():
    payload = {"success": False, "error": "nope", "code": "X"}
    assert assert_envelope(payload, expect_success=False) is payload


# ---------------------------------------------------------------------------
# structural_signature
# ---------------------------------------------------------------------------


def test_structural_signature_ignores_values_but_captures_shape():
    a = {"success": True, "data": {"total": 1, "label": "x"}}
    b = {"success": False, "data": {"total": 999, "label": "y"}}
    assert structural_signature(a) == structural_signature(b)


def test_structural_signature_detects_shape_change():
    a = {"data": {"total": 1}}
    b = {"data": {"total": "1"}}  # int -> str is a shape change
    assert structural_signature(a) != structural_signature(b)


def test_structural_signature_is_list_length_independent():
    one = {"results": [{"id": 1, "status": "x"}]}
    many = {"results": [{"id": 1, "status": "x"}, {"id": 2, "status": "y"}]}
    assert structural_signature(one) == structural_signature(many)


# ---------------------------------------------------------------------------
# GoldenStore (capture-or-compare)
# ---------------------------------------------------------------------------


def test_golden_store_captures_then_compares(tmp_path):
    store = GoldenStore(tmp_path)
    payload = {"success": True, "data": {"id": str(uuid4()), "points": 11}}

    # First call seeds the baseline (file did not exist) and passes.
    assert store.assert_matches("sample", payload) == []
    assert store.exists("sample")

    # A re-capture with a different volatile id still matches the baseline.
    again = {"success": True, "data": {"id": str(uuid4()), "points": 11}}
    assert store.assert_matches("sample", again) == []


def test_golden_store_detects_regression(tmp_path):
    store = GoldenStore(tmp_path)
    store.assert_matches("sample", {"success": True, "data": {"points": 11}})
    with pytest.raises(AssertionError) as exc:
        store.assert_matches("sample", {"success": True, "data": {"points": 99}})
    assert "divergence" in str(exc.value)


def test_golden_store_rejects_unsafe_names(tmp_path):
    store = GoldenStore(tmp_path)
    for bad in ("../escape", "a/b", "", "x\\y"):
        with pytest.raises(ValueError):
            store.path_for(bad)


# ---------------------------------------------------------------------------
# Endpoint registry / snapshot_envelope
# ---------------------------------------------------------------------------


def test_changed_endpoints_cover_the_feature_surface():
    keys = {spec.key for spec in CHANGED_ENDPOINTS}
    assert keys == {
        "admin_dashboard",
        "application_list",
        "canonical_program_list",
        "admin_scope",
        "notifications",
    }
    # Every endpoint declares at least one requirement and a fixture key.
    for spec in CHANGED_ENDPOINTS:
        assert spec.requirements
        assert spec.volatile_keys() >= spec.extra_volatile


def test_snapshot_envelope_validates_and_normalizes():
    payload = {"success": True, "data": {"id": str(uuid4()), "total": 3}}
    snap = snapshot_envelope(payload)
    assert snap["success"] is True
    assert snap["data"]["id"] == VOLATILE
    assert snap["data"]["total"] == 3
