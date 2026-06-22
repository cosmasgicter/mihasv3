"""Pure-logic core for Gate 11 — Scope_Gate (Requirement 11).

This module is the **pure, deterministic** decision layer behind the launch
scope gate. It performs *no* live route probing, imports *no* Django, and does
*no* I/O — it only evaluates predicates over already-collected facts (the
evaluated value of the ``ENABLE_JOBS_OPS_ROUTES`` flag and a set of
jobs/automation/integrations stub-route observations: path, reachability, and
whether a ship decision was recorded). That keeps it trivially importable from
the ``check-launch-scope.py`` wrapper (task 12.3), from CI, and from the
hypothesis property test (task 12.2), and lets the gate's logic be
property-tested independent of any live Django route table.

The wrapper (task 12.3) is responsible for the *impure* work: reading
``settings.ENABLE_JOBS_OPS_ROUTES`` and probing the stub routes mounted under
``/api/v1/`` in ``backend/config/urls.py`` (``jobs``, ``job-applications``,
``outreach``, ``automation``, ``integrations``, ``analytics``, ``reports``) to
observe whether each path is *served* or *rejected as not found*. This module
encodes the acceptance rules that turn those raw facts into a pass/fail verdict:

* **R11.1 / R11.2 — flag must be ``False``.** :func:`flag_passes` is true
  **iff** the evaluated flag value is the boolean ``False``. The check is
  strict: any truthy value *and* any non-``False`` value (including ``0``,
  ``""``, ``None``, or the string ``"false"``) fails, and the wrapper records
  the evaluated value (R11.2).

* **R11.3 / R11.4 — un-shipped stub routes must be unreachable.** A route is
  *reachable* when a request to its path is **served by the application instead
  of being rejected as not found** (R11.3). :func:`route_is_in_scope` is true
  **iff** the module has a recorded ship decision **or** the route is
  unreachable — i.e. an un-shipped (no recorded ship decision) stub route passes
  scope **only if** it is unreachable. A route *with* a recorded ship decision
  is in scope regardless of reachability.

* **Conservative rollup.** :func:`evaluate_scope` combines the flag check and
  the per-route checks into a single verdict and the Gate 11 evidence fields
  (``enable_jobs_ops_routes``, ``reachable_unshipped_routes[]``). The gate passes
  **iff** the flag passes **and every** stub route is in scope; any non-``False``
  flag value or any reachable un-shipped stub route forces *not passed* and is
  recorded (R11.2 / R11.4). When reachability is unknown for a record it is
  treated conservatively as *reachable* (served), matching the harness-wide
  conservative default.

Check rows produced here use the same closed ``result`` vocabulary as the shared
``Evidence_Artifact`` envelope (``"pass" | "fail"``) so the
``check-launch-scope.py`` wrapper can drop them straight into a gate artifact.

**Validates: Requirements 11.1, 11.2, 11.3, 11.4**
"""

from __future__ import annotations

from typing import Any, List, Mapping, Optional, Sequence

__all__ = [
    "PASS",
    "FAIL",
    "FLAG_CHECK_ID",
    "flag_passes",
    "route_is_in_scope",
    "route_check",
    "evaluate_scope",
]

# --- Constants -------------------------------------------------------------

#: Per-check result vocabulary (mirrors the shared Evidence_Artifact envelope).
PASS: str = "pass"
FAIL: str = "fail"

#: Stable id for the single flag-assertion check row (R11.1/R11.2).
FLAG_CHECK_ID: str = "scope:enable_jobs_ops_routes"


# --- Flag assertion (R11.1 / R11.2) ----------------------------------------


def flag_passes(enable_jobs_ops_routes: Any) -> bool:
    """Return ``True`` iff ``ENABLE_JOBS_OPS_ROUTES`` is the boolean ``False`` (R11.1/R11.2).

    The check is intentionally **strict**: only the boolean ``False`` singleton
    passes. Any value other than ``False`` fails — that includes every truthy
    value (``True``, ``1``, ``"true"``, a non-empty list, ...) and every
    non-``False`` falsy value (``0``, ``0.0``, ``""``, ``None``). This matters
    because the launch configuration must *positively* set the flag to ``False``
    rather than merely leave it falsy/unset.

    ``False is 0`` is ``False`` in Python and ``False`` is the only ``bool`` that
    satisfies ``x is False``, so the identity check rejects integer ``0`` as a
    non-``False`` value while still accepting the genuine boolean ``False``.
    """
    return enable_jobs_ops_routes is False


# --- Per-route scope predicate (R11.3 / R11.4) -----------------------------


def route_is_in_scope(reachable: bool, has_ship_decision: bool) -> bool:
    """Return ``True`` iff a stub route is within launch scope (R11.3/R11.4).

    A route is *reachable* when a request to its path is **served** by the
    application rather than rejected as not found (R11.3). The rule:

    * A route **with** a recorded ship decision is in scope regardless of
      reachability — it has been explicitly approved for the launch.
    * A route **without** a recorded ship decision (an un-shipped stub) is in
      scope **only if** it is unreachable — i.e. requests to it are rejected as
      not found rather than served.

    Equivalently, this passes **iff** ``has_ship_decision`` **or**
    ``not reachable``. A reachable un-shipped stub route is the single failing
    case (R11.4).
    """
    return bool(has_ship_decision) or not bool(reachable)


# --- Check builder ---------------------------------------------------------


def _route_path(route: Any) -> Optional[str]:
    """Extract the route's full ``/api/v1/`` path from a record, or ``None``."""
    if isinstance(route, Mapping):
        path = route.get("path") or route.get("route") or route.get("full_path")
        return path if isinstance(path, str) and path.strip() else None
    if isinstance(route, str):
        return route if route.strip() else None
    return None


def _route_reachable(route: Mapping[str, Any]) -> bool:
    """Interpret a record's reachability conservatively.

    A record explicitly marks ``reachable``. When the field is absent or not a
    clean boolean, the route is treated as **reachable** (served) — the unsafe
    assumption — so an unknown observation can never silently pass an un-shipped
    route. Only an explicit falsy ``reachable`` marks the route unreachable.
    """
    if "reachable" not in route:
        return True
    return bool(route.get("reachable"))


def _route_has_ship_decision(route: Mapping[str, Any]) -> bool:
    """Interpret a record's ship-decision flag conservatively.

    When ``has_ship_decision`` is absent it defaults to ``False`` (no recorded
    ship decision), which is the conservative reading for the launch scope gate.
    """
    return bool(route.get("has_ship_decision"))


def route_check(route: Any) -> dict:
    """Build a single scope check row for one stub-route record.

    ``route`` is a mapping carrying at least ``path`` and the observed
    ``reachable`` / ``has_ship_decision`` facts. The row records those facts and
    resolves a closed-enum ``result`` of :data:`PASS` or :data:`FAIL` via
    :func:`route_is_in_scope`. The shape is drop-in for the shared
    Evidence_Artifact ``checks[]`` list.
    """
    path = _route_path(route)
    reachable = _route_reachable(route) if isinstance(route, Mapping) else True
    has_ship_decision = (
        _route_has_ship_decision(route) if isinstance(route, Mapping) else False
    )
    passed = route_is_in_scope(reachable, has_ship_decision)
    return {
        "id": f"scope-route:{path}" if path else "scope-route:<unknown>",
        "path": path,
        "reachable": reachable,
        "has_ship_decision": has_ship_decision,
        "result": PASS if passed else FAIL,
    }


# --- Conservative rollup (R11.2 / R11.4) -----------------------------------


def evaluate_scope(
    enable_jobs_ops_routes: Any,
    stub_routes: Sequence[Any],
) -> dict:
    """Roll the flag assertion and the per-route checks up to a single verdict.

    Args:
        enable_jobs_ops_routes: the evaluated value of the launch
            ``ENABLE_JOBS_OPS_ROUTES`` flag.
        stub_routes: the jobs/automation/integrations stub-route records under
            ``/api/v1/``, each a mapping ``{"path", "reachable",
            "has_ship_decision"}``.

    Returns:
        A result object combining the Gate 11 evidence fields and a conservative
        verdict::

            {
                "passed": bool,                     # flag passes AND all routes in scope
                "enable_jobs_ops_routes": <value>,  # the evaluated flag value (R11.2)
                "flag_passes": bool,
                "reachable_unshipped_routes": [<path>...],  # R11.4
                "checks": [<flag check>, <route check>...],
                "failed": [<check id>...],
            }

        The gate ``passed`` is ``True`` **iff** :func:`flag_passes` is true **and
        every** stub route is in scope per :func:`route_is_in_scope`. Any
        non-``False`` flag value or any reachable un-shipped stub route forces
        ``passed = False``. ``reachable_unshipped_routes`` records the full path
        of every reachable route lacking a ship decision (R11.4), and
        ``enable_jobs_ops_routes`` records the evaluated flag value (R11.2).
    """
    flag_ok = flag_passes(enable_jobs_ops_routes)

    checks: List[dict] = [
        {
            "id": FLAG_CHECK_ID,
            "enable_jobs_ops_routes": enable_jobs_ops_routes,
            "expected": False,
            "result": PASS if flag_ok else FAIL,
        }
    ]
    failed: List[str] = []
    if not flag_ok:
        failed.append(FLAG_CHECK_ID)

    reachable_unshipped: List[str] = []
    for route in stub_routes or []:
        check = route_check(route)
        checks.append(check)
        if check["result"] != PASS:
            failed.append(str(check["id"]))
            if check["path"] is not None:
                reachable_unshipped.append(check["path"])

    return {
        "passed": flag_ok and not reachable_unshipped,
        "enable_jobs_ops_routes": enable_jobs_ops_routes,
        "flag_passes": flag_ok,
        "reachable_unshipped_routes": reachable_unshipped,
        "checks": checks,
        "failed": failed,
    }
