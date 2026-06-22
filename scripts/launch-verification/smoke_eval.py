"""Pure-logic core for Gate 2 — Smoke_Test_Gate (Requirement 2).

This module is the **pure, deterministic** decision layer behind the production
smoke gate. It contains *no* network access, *no* Django, and *no* I/O — only
predicates and evaluators over already-observed reachability facts (an HTTP
status, a measured latency, a rejection flag). That keeps it trivially
importable from the ``run-smoke-gate.py`` wrapper (task 8.3), from CI, and from
the hypothesis property test (task 8.2), and lets the gate's behavior be
property-tested independent of any live deployment.

The rules it encodes come straight from Requirement 2:

* **R2.2 / R2.3 — reachability.** A surface passes only if it returns a
  *successful (non-error) reachability response* within a 10-second timeout. We
  fix the **exact rule** here: a "successful (non-error) reachability response"
  means the HTTP status is a real response status **below 400** (i.e. ``2xx`` or
  ``3xx`` — a redirect still proves the surface is reachable). Any ``4xx``/``5xx``
  is an error, and a non-response sentinel (``0``/negative, used when a request
  times out or the connection fails) is *not* a successful response. The latency
  must also be within :data:`TIMEOUT_MS` (10000 ms) and non-negative.

* **R2.4 — two distinct admin surfaces.** ``/admin/tenants`` (the product
  ``Tenant_Admin_UI``) and ``/beanola-admin-panel/`` (the operational
  ``Django_Admin``) are **never collapsed**. :func:`evaluate_admin_surfaces`
  *always* returns exactly two separate check entries, keyed by distinct surface
  slugs, even when both observations are identical.

* **R2.5 — unauthenticated state-change probe.** A state-changing request that
  omits valid cookie auth + CSRF passes **only if it was rejected** (not
  processed). :func:`unauth_state_change_passes` returns the rejection flag
  verbatim.

* **R2.6 — conservative rollup.** :func:`evaluate_smoke` rolls a set of checks up
  to a single pass/fail: the gate passes **iff** there is at least one check and
  **every** check passed. A missing, unknown, ``not-measured``, or failed check
  forces *not passed*, matching the conservative default used across the harness.

Check rows produced here use the same closed ``result`` vocabulary as the shared
``Evidence_Artifact`` envelope (``"pass" | "fail" | "not-measured"``) so the
``run-smoke-gate.py`` wrapper can drop them straight into a gate artifact.

**Validates: Requirements 2.2, 2.3, 2.4, 2.5**
"""

from __future__ import annotations

from typing import Any, List, Mapping, Sequence

__all__ = [
    "TIMEOUT_MS",
    "TENANT_ADMIN_SURFACE",
    "DJANGO_ADMIN_SURFACE",
    "TENANT_ADMIN_PATH",
    "DJANGO_ADMIN_PATH",
    "PASS",
    "FAIL",
    "NOT_MEASURED",
    "is_non_error_status",
    "reachability_passes",
    "surface_check",
    "evaluate_admin_surfaces",
    "unauth_state_change_passes",
    "evaluate_smoke",
]

# --- Constants -------------------------------------------------------------

#: The reachability timeout from R2.2/R2.3, in milliseconds (10 seconds).
TIMEOUT_MS: int = 10000

#: HTTP statuses at or above this value are errors (``4xx`` client, ``5xx``
#: server). Anything below it (and at/above :data:`_MIN_HTTP_STATUS`) is a
#: successful, non-error reachability response.
_ERROR_STATUS_FLOOR: int = 400

#: The lowest value that counts as a real HTTP response status. A status below
#: this (notably ``0`` or a negative sentinel) means "no response" — a timeout
#: or a connection failure — and is never a success.
_MIN_HTTP_STATUS: int = 100

#: Stable surface slugs — the two canonical admin surfaces are distinct (R2.4).
TENANT_ADMIN_SURFACE: str = "tenant-admin"
DJANGO_ADMIN_SURFACE: str = "django-admin"

#: The canonical admin surface paths. These are two different surfaces and are
#: never merged into one check (R2.4).
TENANT_ADMIN_PATH: str = "/admin/tenants"
DJANGO_ADMIN_PATH: str = "/beanola-admin-panel/"

#: Per-check result vocabulary (mirrors the shared Evidence_Artifact envelope).
PASS: str = "pass"
FAIL: str = "fail"
NOT_MEASURED: str = "not-measured"


# --- Reachability predicate (R2.2 / R2.3) ----------------------------------


def is_non_error_status(http_status: Any) -> bool:
    """Return ``True`` iff ``http_status`` is a successful (non-error) response.

    The exact rule (R2.2/R2.3): a successful, non-error reachability response is a
    real HTTP response status **below 400** — i.e. a ``2xx`` or ``3xx``. A ``3xx``
    redirect still proves the surface is reachable, so it counts as success.

    A ``4xx``/``5xx`` is an error. A value below :data:`_MIN_HTTP_STATUS`
    (e.g. ``0`` or a negative number, used by callers to signal a timeout or a
    connection failure where no response arrived) is **not** a successful
    response. Non-integer inputs are treated as "no response" and fail.
    """
    if isinstance(http_status, bool) or not isinstance(http_status, int):
        # ``bool`` is an ``int`` subclass but is never a valid status code.
        return False
    return _MIN_HTTP_STATUS <= http_status < _ERROR_STATUS_FLOOR


def reachability_passes(
    http_status: int,
    latency_ms: float,
    timeout_ms: float = TIMEOUT_MS,
) -> bool:
    """Return ``True`` iff a surface is reachable within the timeout (R2.2/R2.3).

    A surface passes **iff** its response status is non-error
    (:func:`is_non_error_status` — status ``< 400``) **and** the measured latency
    is non-negative and **at most** ``timeout_ms`` (default :data:`TIMEOUT_MS` =
    10000 ms). A non-positive ``timeout_ms`` admits no latency and so always fails.
    """
    if not is_non_error_status(http_status):
        return False
    if isinstance(latency_ms, bool) or not isinstance(latency_ms, (int, float)):
        return False
    if isinstance(timeout_ms, bool) or not isinstance(timeout_ms, (int, float)):
        return False
    return 0 <= latency_ms <= timeout_ms


# --- Check builder ---------------------------------------------------------


def surface_check(
    surface: str,
    path: str,
    http_status: int,
    latency_ms: float,
    timeout_ms: float = TIMEOUT_MS,
) -> dict:
    """Build a single reachability check row for ``surface`` at ``path``.

    The row records the observed ``http_status``/``latency_ms`` against the
    ``timeout_ms`` threshold and resolves a closed-enum ``result`` of
    :data:`PASS` or :data:`FAIL` via :func:`reachability_passes`. The shape is
    drop-in for the shared Evidence_Artifact ``checks[]`` list.
    """
    passed = reachability_passes(http_status, latency_ms, timeout_ms)
    return {
        "id": f"reachability:{surface}",
        "surface": surface,
        "path": path,
        "http_status": http_status,
        "latency_ms": latency_ms,
        "threshold": f"status < {_ERROR_STATUS_FLOOR}, latency <= {int(timeout_ms)} ms",
        "result": PASS if passed else FAIL,
    }


# --- Two distinct admin surfaces (R2.4) ------------------------------------


def evaluate_admin_surfaces(
    tenant_admin: Mapping[str, Any],
    django_admin: Mapping[str, Any],
    timeout_ms: float = TIMEOUT_MS,
) -> List[dict]:
    """Return two **distinct** check rows — one per canonical admin surface (R2.4).

    ``/admin/tenants`` (the product :data:`TENANT_ADMIN_SURFACE`) and
    ``/beanola-admin-panel/`` (the operational :data:`DJANGO_ADMIN_SURFACE`) are
    different surfaces and are **never collapsed into one result**. This helper
    therefore *always* returns a list of exactly two entries, keyed by distinct
    surface slugs, even when ``tenant_admin`` and ``django_admin`` carry identical
    observations.

    Each argument is a mapping carrying at least ``http_status`` and
    ``latency_ms`` (the observed reachability facts for that surface).
    """
    return [
        surface_check(
            TENANT_ADMIN_SURFACE,
            TENANT_ADMIN_PATH,
            tenant_admin.get("http_status"),
            tenant_admin.get("latency_ms"),
            timeout_ms,
        ),
        surface_check(
            DJANGO_ADMIN_SURFACE,
            DJANGO_ADMIN_PATH,
            django_admin.get("http_status"),
            django_admin.get("latency_ms"),
            timeout_ms,
        ),
    ]


# --- Unauthenticated state-change probe (R2.5) -----------------------------


def unauth_state_change_passes(rejected: bool) -> bool:
    """Return ``True`` iff an unauth/no-CSRF state-change request was rejected (R2.5).

    A state-changing request that omits valid cookie auth + CSRF protection must
    be **rejected**, not processed. The check therefore passes **only if** the
    request was rejected — i.e. this returns the rejection flag verbatim.
    """
    return bool(rejected)


# --- Conservative rollup (R2.6) --------------------------------------------


def _check_passed(check: Any) -> bool:
    """Interpret a single check as passed (conservatively).

    Accepts either a bool (``True`` => passed) or a mapping carrying a closed-enum
    ``result`` (only :data:`PASS` counts) or a boolean ``passed`` flag. Anything
    else — an unknown shape, a missing/``not-measured`` result — is treated as
    *not passed*, matching the harness-wide conservative default.
    """
    if isinstance(check, bool):
        return check
    if isinstance(check, Mapping):
        if "result" in check:
            return check.get("result") == PASS
        if "passed" in check:
            return bool(check.get("passed"))
    return False


def evaluate_smoke(checks: Sequence[Any]) -> dict:
    """Roll a set of smoke checks up to a single conservative verdict (R2.6).

    Returns a result object ``{"passed": bool, "total": int, "passed_count": int,
    "failed": [<check id>...]}``. The gate ``passed`` is ``True`` **iff** there is
    at least one check **and every** check passed; any failed, unknown,
    ``not-measured``, or malformed check — and an empty check set — forces
    ``passed = False``. ``failed`` names every blocking check (by its ``id`` when
    present, else its index) so the wrapper can record the offending surface.
    """
    if checks is None:
        checks = []
    checks = list(checks)

    failed: List[str] = []
    passed_count = 0
    for index, check in enumerate(checks):
        if _check_passed(check):
            passed_count += 1
        else:
            if isinstance(check, Mapping) and check.get("id"):
                failed.append(str(check["id"]))
            else:
                failed.append(f"check[{index}]")

    overall = len(checks) > 0 and not failed
    return {
        "passed": overall,
        "total": len(checks),
        "passed_count": passed_count,
        "failed": failed,
    }
