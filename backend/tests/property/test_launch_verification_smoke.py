"""Property test for Gate 2 — Smoke_Test_Gate reachability (Requirement 2).

Feature: beanola-launch-verification, Property 7: A reachability surface passes
iff it responds non-error within the timeout.

This test exercises the pure-logic core in
``scripts/launch-verification/smoke_eval.py``. That module is
standard-library-only (it imports only ``typing`` and never touches Django, the
ORM, or the network), so the test loads it directly via ``importlib`` from the
hyphenated ``scripts/launch-verification/`` directory and drives it with
hypothesis without any database or network. This sidesteps the backend
``conftest.py`` Postgres fixtures — the module is run with
``backend/.venv/bin/python`` against this file directly.

Property 7 (design.md): *For any* observed ``(http_status, latency_ms)`` pair for
a smoke surface, the surface check passes **iff** the status is a non-error
(successful) response and the latency is at most 10 000 ms; this holds
identically for the ``/admin/tenants`` and ``/beanola-admin-panel/`` surfaces,
which are always recorded as two distinct results.

**Validates: Requirements 2.2, 2.3, 2.4**
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

# --------------------------------------------------------------------------- #
# Load the pure evaluator from the hyphenated scripts/launch-verification dir.
#
# ``scripts/launch-verification`` is not an importable package name (the hyphen
# is illegal in a dotted module path), so we resolve the file directly and load
# it with importlib. The module is registered in ``sys.modules`` under a legal
# alias *before* ``exec_module`` runs so any internal name resolution stays
# consistent and a second import reuses the already-loaded object.
# --------------------------------------------------------------------------- #

_MODULE_NAME = "launch_verification_smoke_eval"
_MODULE_PATH = (
    Path(__file__).resolve().parents[3]
    / "scripts"
    / "launch-verification"
    / "smoke_eval.py"
)

if _MODULE_NAME in sys.modules:  # pragma: no cover - import cache reuse
    smoke_eval = sys.modules[_MODULE_NAME]
else:
    _spec = importlib.util.spec_from_file_location(_MODULE_NAME, _MODULE_PATH)
    assert _spec is not None and _spec.loader is not None
    smoke_eval = importlib.util.module_from_spec(_spec)
    sys.modules[_MODULE_NAME] = smoke_eval
    _spec.loader.exec_module(smoke_eval)

TIMEOUT_MS = smoke_eval.TIMEOUT_MS
TENANT_ADMIN_SURFACE = smoke_eval.TENANT_ADMIN_SURFACE
DJANGO_ADMIN_SURFACE = smoke_eval.DJANGO_ADMIN_SURFACE
TENANT_ADMIN_PATH = smoke_eval.TENANT_ADMIN_PATH
DJANGO_ADMIN_PATH = smoke_eval.DJANGO_ADMIN_PATH
PASS = smoke_eval.PASS
FAIL = smoke_eval.FAIL
is_non_error_status = smoke_eval.is_non_error_status
reachability_passes = smoke_eval.reachability_passes
evaluate_admin_surfaces = smoke_eval.evaluate_admin_surfaces

# Run a meaningful campaign: well over the >= 100 examples per property minimum.
PBT_SETTINGS = hypothesis_settings(max_examples=200, deadline=None)

# HTTP statuses spanning the 0 sentinel (no response), 2xx, 3xx, 4xx, and 5xx.
# Sampling the class boundaries (100, 399, 400) plus a wide integer range lands
# the campaign on the ``< 400`` / ``>= 400`` edge often enough to exercise it.
_HTTP_STATUS = st.one_of(
    st.just(0),
    st.sampled_from([100, 199, 200, 204, 299, 300, 301, 399, 400, 401, 404, 500, 503]),
    st.integers(min_value=-10, max_value=600),
)

# Latency samples in milliseconds, including values above the 10 000 ms timeout
# and negative sentinels, so the ``0 <= latency <= timeout`` window is fully
# exercised including both boundaries.
_LATENCY = st.one_of(
    st.just(TIMEOUT_MS),
    st.just(0),
    st.integers(min_value=-1000, max_value=25000).map(float),
    st.floats(
        min_value=-1000.0, max_value=25000.0, allow_nan=False, allow_infinity=False
    ),
)


def _expected_pass(http_status, latency_ms) -> bool:
    """Independent oracle for Property 7: non-error status AND latency in window."""
    status_ok = isinstance(http_status, int) and (100 <= http_status < 400)
    latency_ok = (
        isinstance(latency_ms, (int, float)) and 0 <= latency_ms <= TIMEOUT_MS
    )
    return status_ok and latency_ok


@given(http_status=_HTTP_STATUS, latency_ms=_LATENCY)
@PBT_SETTINGS
def test_reachability_passes_iff_non_error_within_timeout(http_status, latency_ms):
    """Property 7: reachability passes iff status in [100,400) AND 0<=latency<=10000."""
    actual = reachability_passes(http_status, latency_ms)
    expected = _expected_pass(http_status, latency_ms)
    assert actual is expected, (
        f"reachability_passes({http_status!r}, {latency_ms!r}) == {actual}; "
        f"expected {expected} (status in [100,400) and 0 <= latency <= {TIMEOUT_MS})"
    )


@given(http_status=_HTTP_STATUS)
@PBT_SETTINGS
def test_is_non_error_status_matches_below_400_band(http_status):
    """``is_non_error_status`` is True iff the status is a real response < 400."""
    expected = isinstance(http_status, int) and (100 <= http_status < 400)
    assert is_non_error_status(http_status) is expected


@given(
    tenant_status=_HTTP_STATUS,
    tenant_latency=_LATENCY,
    django_status=_HTTP_STATUS,
    django_latency=_LATENCY,
)
@PBT_SETTINGS
def test_evaluate_admin_surfaces_always_two_distinct_rows(
    tenant_status, tenant_latency, django_status, django_latency
):
    """R2.4: always exactly two distinct admin-surface rows keyed separately.

    The two canonical admin surfaces (``/admin/tenants`` and
    ``/beanola-admin-panel/``) are never collapsed — even when both carry
    identical observations — and each row's result independently obeys
    Property 7.
    """
    rows = evaluate_admin_surfaces(
        {"http_status": tenant_status, "latency_ms": tenant_latency},
        {"http_status": django_status, "latency_ms": django_latency},
    )

    # Exactly two rows.
    assert len(rows) == 2

    tenant_row, django_row = rows

    # Distinct surface slugs and paths — never merged (R2.4).
    assert tenant_row["surface"] == TENANT_ADMIN_SURFACE
    assert django_row["surface"] == DJANGO_ADMIN_SURFACE
    assert tenant_row["surface"] != django_row["surface"]
    assert tenant_row["path"] == TENANT_ADMIN_PATH
    assert django_row["path"] == DJANGO_ADMIN_PATH
    assert tenant_row["path"] != django_row["path"]
    assert tenant_row["id"] != django_row["id"]

    # Each row's pass/fail independently honours Property 7.
    assert tenant_row["result"] == (
        PASS if _expected_pass(tenant_status, tenant_latency) else FAIL
    )
    assert django_row["result"] == (
        PASS if _expected_pass(django_status, django_latency) else FAIL
    )
