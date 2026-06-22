"""Property-based test for the Gate 11 launch-verification scope predicate.

# Feature: beanola-launch-verification, Property 20: An un-shipped stub route passes scope only if it is unreachable

This property targets the **pure decision core** of Gate 11 — Scope_Gate, in
``scripts/launch-verification/scope_eval.py``. That module performs no live
route probing, imports no Django, and does no I/O: it only turns
already-collected facts (the evaluated ``ENABLE_JOBS_OPS_ROUTES`` flag value and
a set of stub-route observations of ``path`` / ``reachable`` /
``has_ship_decision``) into a pass/fail verdict. So the predicate is a
deterministic function of its inputs and can be property-tested with no database
and no Django at all.

Property 20: *For any* booleans ``reachable`` and ``has_ship_decision``,
:func:`route_is_in_scope` is ``True`` **iff** ``has_ship_decision`` **or**
``not reachable`` — i.e. an un-shipped (no recorded ship decision) stub route
passes scope **only if** it is unreachable. The flag assertion
(:func:`flag_passes`) is ``True`` **iff** the evaluated value is the boolean
``False``, and the conservative rollup (:func:`evaluate_scope`) passes **iff**
the flag passes **and** no reachable un-shipped route exists, recording the right
paths in ``reachable_unshipped_routes``.
**Validates: Requirements 11.3, 11.4**

Backend property-test conventions (spec ``beanola-launch-verification``):
``pytest`` + ``hypothesis``, >= 100 examples per property, tagged with the
Feature/Property marker above. The module under test is pure standard library,
so these run without a database.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Import the scope predicate from scripts/launch-verification/scope_eval.py.
#
# scope_eval.py lives at the repo root (outside the ``backend`` import package)
# and is pure stdlib, so loading it by file path is sufficient. We register the
# module in sys.modules before exec so ``from __future__ import annotations``
# (stringized annotations) can resolve the module by name if needed.
# ---------------------------------------------------------------------------

# test file = backend/tests/property/test_...py
#   parents[0]=property [1]=tests [2]=backend [3]=<repo root>
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCOPE_PATH = _REPO_ROOT / "scripts" / "launch-verification" / "scope_eval.py"


def _load_scope_eval():
    spec = importlib.util.spec_from_file_location(
        "launch_verification_scope_eval", _SCOPE_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader, f"cannot load scope_eval module from {_SCOPE_PATH}"
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_scope = _load_scope_eval()

flag_passes = _scope.flag_passes
route_is_in_scope = _scope.route_is_in_scope
route_check = _scope.route_check
evaluate_scope = _scope.evaluate_scope
PASS = _scope.PASS
FAIL = _scope.FAIL
FLAG_CHECK_ID = _scope.FLAG_CHECK_ID

# Run a meaningful campaign: >= 100 examples per property.
PBT_SETTINGS = hypothesis_settings(max_examples=200, deadline=None)


# A representative spread of non-``False`` flag values plus the genuine ``False``
# singleton. Only the boolean ``False`` must pass; everything else must fail —
# including the falsy non-bools ``0``, ``""``, ``None`` and the truthy ``1`` /
# ``"false"`` (a string that *looks* false but is not the boolean).
_FLAG_VALUES = st.sampled_from([False, True, 0, "", None, "false", 1])


@st.composite
def stub_routes(draw, *, min_size: int = 0, max_size: int = 8):
    """Generate a list of stub-route records with distinct paths.

    Each record carries a unique ``/api/v1/`` path plus independent
    ``reachable`` / ``has_ship_decision`` booleans, covering every combination
    of reachable/unreachable x shipped/un-shipped across a variable-length set.
    """
    size = draw(st.integers(min_value=min_size, max_value=max_size))
    routes = []
    for i in range(size):
        routes.append(
            {
                "path": f"/api/v1/stub-{i}/",
                "reachable": draw(st.booleans()),
                "has_ship_decision": draw(st.booleans()),
            }
        )
    return routes


class TestProperty20UnshippedStubRouteScope:
    """Feature: beanola-launch-verification, Property 20: An un-shipped stub route passes scope only if it is unreachable."""

    @PBT_SETTINGS
    @given(reachable=st.booleans(), has_ship_decision=st.booleans())
    def test_route_is_in_scope_iff_shipped_or_unreachable(
        self, reachable, has_ship_decision
    ) -> None:
        """route_is_in_scope is True iff has_ship_decision OR (not reachable)."""
        expected = has_ship_decision or (not reachable)

        assert route_is_in_scope(reachable, has_ship_decision) is expected

        # The single failing case is a reachable, un-shipped stub route (R11.4):
        # an un-shipped route passes *only if* it is unreachable.
        if not has_ship_decision:
            assert route_is_in_scope(reachable, has_ship_decision) == (not reachable)
        # A shipped route is in scope regardless of reachability.
        if has_ship_decision:
            assert route_is_in_scope(reachable, has_ship_decision) is True

    @PBT_SETTINGS
    @given(value=_FLAG_VALUES)
    def test_flag_passes_iff_boolean_false(self, value) -> None:
        """flag_passes is True iff the evaluated value is the boolean False."""
        assert flag_passes(value) == (value is False)

    @PBT_SETTINGS
    @given(value=_FLAG_VALUES, routes=stub_routes())
    def test_evaluate_scope_rollup_is_conservative(self, value, routes) -> None:
        """Gate passes iff flag passes AND no reachable un-shipped route exists."""
        result = evaluate_scope(value, routes)

        flag_ok = value is False
        expected_unshipped = [
            r["path"]
            for r in routes
            if r["reachable"] and not r["has_ship_decision"]
        ]
        expected_passed = flag_ok and not expected_unshipped

        assert result["passed"] is expected_passed
        assert result["flag_passes"] == flag_ok
        # The evaluated flag value is recorded verbatim for the evidence (R11.2).
        assert result["enable_jobs_ops_routes"] == value
        # reachable_unshipped_routes records exactly the right paths (R11.4),
        # order-preserving over the input route list.
        assert result["reachable_unshipped_routes"] == expected_unshipped

        # Every per-route check agrees with the route_is_in_scope predicate.
        route_checks = [c for c in result["checks"] if c["id"] != FLAG_CHECK_ID]
        assert len(route_checks) == len(routes)
        for check, route in zip(route_checks, routes):
            in_scope = route_is_in_scope(route["reachable"], route["has_ship_decision"])
            assert check["result"] == (PASS if in_scope else FAIL)
