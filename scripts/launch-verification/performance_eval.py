"""Pure-logic evaluator for Gate 3 — Performance_Gate (Requirement 3).

This module is the deterministic, side-effect-free core of the launch
Performance_Gate. It contains **no network access and no Lighthouse / API
invocation** — it only scores already-collected measurements. The
deployed-target collectors (``run-lighthouse.mjs`` and
``sample-api-timings.py``, task 6.4) feed their raw numbers into these
functions, which makes every threshold/percentile decision independently
unit- and property-testable (tasks 6.2 / 6.3) without a live browser or API.

It depends only on the standard library (``statistics``) and never imports
Django, so it can be exercised in isolation.

Two measurement families are scored:

1. **Lighthouse mobile scores** — median of >= 3 runs per route, compared to a
   route-class threshold (Public >= 90, Authenticated/admin >= 80). A route
   with fewer than 3 runs is *not measured* and forces the gate not passed
   (R3.7).
2. **Live API timings** — p50/p95 percentiles per surface, requiring >= 100
   samples. A surface with fewer than 100 samples (or no measurement) is *not
   measured* and forces the gate not passed (R3.4, R3.7). A measured surface
   passes only when its p95 is at or under the stated target (R3.5, R3.6).

Percentile method
-----------------
``percentile`` uses the **nearest-rank** method (no interpolation), which is
fully deterministic and trivial to reproduce in a property test:

    sorted ascending; rank = ceil(p / 100 * N), clamped to [1, N];
    value = sorted[rank - 1]

so the p50/p95 a test computes by hand always matches what this module records.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Optional, Sequence

# --------------------------------------------------------------------------- #
# Named thresholds (single source of truth for Gate 3)
# --------------------------------------------------------------------------- #

PUBLIC_LH_MIN: float = 90.0
"""Minimum Lighthouse mobile performance score for a Public_Route (R3.2)."""

AUTH_LH_MIN: float = 80.0
"""Minimum Lighthouse mobile performance score for an authenticated/admin route (R3.3)."""

MIN_RUNS: int = 3
"""Minimum Lighthouse runs required before a route's median is trusted (R3.1)."""

MIN_API_SAMPLES: int = 100
"""Minimum sampled requests required per API surface (R3.4)."""

# Route classes ------------------------------------------------------------- #
ROUTE_CLASS_PUBLIC = "public"
ROUTE_CLASS_AUTHENTICATED = "authenticated"
ROUTE_CLASS_ADMIN = "admin"

# Per-check result enum ----------------------------------------------------- #
RESULT_PASS = "pass"
RESULT_FAIL = "fail"
RESULT_NOT_MEASURED = "not-measured"

# Gate status enum (closed; see design "Common Evidence_Artifact envelope") --- #
STATUS_PASSED = "passed"
STATUS_FAILED = "failed"

# --------------------------------------------------------------------------- #
# Canonical route + surface lists (from Requirement 3 / design Gate 3)
# --------------------------------------------------------------------------- #

#: The five Lighthouse routes and their route class (R3.1).
LIGHTHOUSE_ROUTES: tuple[tuple[str, str], ...] = (
    ("/", ROUTE_CLASS_PUBLIC),
    ("/auth/signup", ROUTE_CLASS_PUBLIC),
    ("/track-application", ROUTE_CLASS_PUBLIC),
    ("/student/dashboard", ROUTE_CLASS_AUTHENTICATED),
    ("/admin/dashboard", ROUTE_CLASS_ADMIN),
)

#: The twelve API surfaces, verbatim from the postmortem performance section (R3.4).
API_SURFACES: tuple[str, ...] = (
    "tenant context",
    "catalog offerings",
    "draft save",
    "application submit",
    "payment init",
    "payment status",
    "tenant admin list",
    "tenant admin detail",
    "official document queue",
    "official document status",
    "official document download",
    "settlement summary",
)


# --------------------------------------------------------------------------- #
# Threshold helpers
# --------------------------------------------------------------------------- #


def threshold_for_route_class(route_class: str) -> float:
    """Return the Lighthouse minimum score for *route_class*.

    Public routes require >= 90; authenticated and admin routes require >= 80.

    Raises:
        ValueError: if *route_class* is not a recognised class.
    """
    if route_class == ROUTE_CLASS_PUBLIC:
        return PUBLIC_LH_MIN
    if route_class in (ROUTE_CLASS_AUTHENTICATED, ROUTE_CLASS_ADMIN):
        return AUTH_LH_MIN
    raise ValueError(
        f"unknown route_class {route_class!r}; expected one of "
        f"{ROUTE_CLASS_PUBLIC!r}, {ROUTE_CLASS_AUTHENTICATED!r}, {ROUTE_CLASS_ADMIN!r}"
    )


# --------------------------------------------------------------------------- #
# Lighthouse scoring
# --------------------------------------------------------------------------- #


def lighthouse_median(run_scores: Sequence[float]) -> float:
    """Return the median of *run_scores*.

    A route's recorded Lighthouse score is the median of its runs (R3.1).
    At least ``MIN_RUNS`` runs are required: fewer runs is a *not measured*
    condition that callers (``evaluate_lighthouse_route``) translate into a
    not-measured result, so this function refuses to invent a score from an
    insufficient sample.

    Raises:
        ValueError: if fewer than ``MIN_RUNS`` scores are supplied.
    """
    if len(run_scores) < MIN_RUNS:
        raise ValueError(
            f"lighthouse_median requires at least {MIN_RUNS} runs, got {len(run_scores)}"
        )
    return float(statistics.median(run_scores))


@dataclass(frozen=True)
class LighthouseRouteResult:
    """Immutable scoring outcome for a single Lighthouse route."""

    route: str
    route_class: str
    run_scores: tuple[float, ...]
    threshold: float
    median: Optional[float]
    result: str  # RESULT_PASS | RESULT_FAIL | RESULT_NOT_MEASURED

    @property
    def measured(self) -> bool:
        return self.result != RESULT_NOT_MEASURED

    @property
    def passed(self) -> bool:
        return self.result == RESULT_PASS

    def to_check(self) -> dict:
        """Render this result as an Evidence_Artifact check row."""
        if self.median is None:
            observed = "not measured"
            detail = f"only {len(self.run_scores)} run(s); >= {MIN_RUNS} required"
        else:
            observed = f"{self.median:g}"
            detail = (
                f"median of {len(self.run_scores)} runs "
                f"({', '.join(f'{s:g}' for s in self.run_scores)})"
            )
        return {
            "id": f"lighthouse:{self.route}",
            "route": self.route,
            "route_class": self.route_class,
            "lighthouse_median": self.median,
            "run_scores": list(self.run_scores),
            "threshold": self.threshold,
            "result": self.result,
            "observed": observed,
            "detail": detail,
        }


def evaluate_lighthouse_route(
    route_class: str,
    run_scores: Sequence[float],
    route: str = "",
) -> LighthouseRouteResult:
    """Score one Lighthouse route against its route-class threshold.

    * Fewer than ``MIN_RUNS`` runs -> ``RESULT_NOT_MEASURED`` (R3.7); the
      gate cannot pass with an unmeasured route.
    * Otherwise the recorded score is ``lighthouse_median(run_scores)`` and the
      route passes iff that median is at least the class threshold (R3.2, R3.3,
      R3.6).
    """
    threshold = threshold_for_route_class(route_class)
    scores = tuple(float(s) for s in run_scores)

    if len(scores) < MIN_RUNS:
        return LighthouseRouteResult(
            route=route,
            route_class=route_class,
            run_scores=scores,
            threshold=threshold,
            median=None,
            result=RESULT_NOT_MEASURED,
        )

    median = lighthouse_median(scores)
    result = RESULT_PASS if median >= threshold else RESULT_FAIL
    return LighthouseRouteResult(
        route=route,
        route_class=route_class,
        run_scores=scores,
        threshold=threshold,
        median=median,
        result=result,
    )


# --------------------------------------------------------------------------- #
# API timing scoring
# --------------------------------------------------------------------------- #


def percentile(samples: Sequence[float], p: float) -> float:
    """Return the *p*-th percentile of *samples* using the nearest-rank method.

    The nearest-rank definition (no interpolation) is:

        sorted ascending; rank = ceil(p / 100 * N), clamped to [1, N];
        result = sorted[rank - 1]

    For ``p == 0`` the minimum is returned. This method is deterministic and
    order-independent (it sorts internally), which is exactly what the API
    timing property test relies on.

    Raises:
        ValueError: if *samples* is empty or *p* is outside ``[0, 100]``.
    """
    if not samples:
        raise ValueError("percentile requires at least one sample")
    if not (0 <= p <= 100):
        raise ValueError(f"percentile p must be in [0, 100], got {p}")

    ordered = sorted(float(s) for s in samples)
    n = len(ordered)
    if p == 0:
        return ordered[0]
    rank = math.ceil(p / 100 * n)
    rank = max(1, min(rank, n))
    return ordered[rank - 1]


@dataclass(frozen=True)
class ApiSurfaceResult:
    """Immutable scoring outcome for a single API surface."""

    surface: str
    sample_count: int
    p95_target_ms: float
    p50_ms: Optional[float]
    p95_ms: Optional[float]
    result: str  # RESULT_PASS | RESULT_FAIL | RESULT_NOT_MEASURED

    @property
    def measured(self) -> bool:
        return self.result != RESULT_NOT_MEASURED

    @property
    def passed(self) -> bool:
        return self.result == RESULT_PASS

    def to_check(self) -> dict:
        """Render this result as an Evidence_Artifact check row."""
        if self.p95_ms is None:
            observed = "not measured"
            detail = (
                f"{self.sample_count} sample(s); >= {MIN_API_SAMPLES} required"
            )
        else:
            observed = f"p50={self.p50_ms:g} ms, p95={self.p95_ms:g} ms"
            detail = f"{self.sample_count} samples"
        return {
            "id": f"api:{self.surface}",
            "api_surface": self.surface,
            "p50_ms": self.p50_ms,
            "p95_ms": self.p95_ms,
            "sample_count": self.sample_count,
            "p95_target_ms": self.p95_target_ms,
            "result": self.result,
            "observed": observed,
            "threshold": f"p95 <= {self.p95_target_ms:g} ms",
            "detail": detail,
        }


def evaluate_api_surface(
    name: str,
    samples: Sequence[float],
    p95_target_ms: float,
) -> ApiSurfaceResult:
    """Score one API surface's sampled latencies against its p95 target.

    * Fewer than ``MIN_API_SAMPLES`` samples -> ``RESULT_NOT_MEASURED`` (R3.4,
      R3.7); the gate cannot pass with an under-sampled surface.
    * Otherwise p50 and p95 are the definitional percentiles of the sample
      vector, the measured-vs-target pair is recorded, and the surface passes
      iff ``p95 <= p95_target_ms`` *and* ``sample_count >= MIN_API_SAMPLES``
      (R3.5, R3.6).
    """
    sample_count = len(samples)
    target = float(p95_target_ms)

    if sample_count < MIN_API_SAMPLES:
        return ApiSurfaceResult(
            surface=name,
            sample_count=sample_count,
            p95_target_ms=target,
            p50_ms=None,
            p95_ms=None,
            result=RESULT_NOT_MEASURED,
        )

    p50 = percentile(samples, 50)
    p95 = percentile(samples, 95)
    result = RESULT_PASS if (p95 <= target and sample_count >= MIN_API_SAMPLES) else RESULT_FAIL
    return ApiSurfaceResult(
        surface=name,
        sample_count=sample_count,
        p95_target_ms=target,
        p50_ms=p50,
        p95_ms=p95,
        result=result,
    )


# --------------------------------------------------------------------------- #
# Top-level gate evaluation
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class PerformanceEvaluation:
    """Combined Performance_Gate outcome over routes + API surfaces."""

    status: str  # STATUS_PASSED | STATUS_FAILED
    route_results: tuple[LighthouseRouteResult, ...]
    api_results: tuple[ApiSurfaceResult, ...]
    failures: tuple[str, ...] = field(default_factory=tuple)

    @property
    def passed(self) -> bool:
        return self.status == STATUS_PASSED


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def evaluate_performance(
    lighthouse_inputs: Iterable[tuple[str, str, Sequence[float]]],
    api_inputs: Iterable[tuple[str, Sequence[float], float]],
    *,
    generated_at: Optional[str] = None,
    generated_by: str = "deployed-target",
) -> dict:
    """Combine route + API results into a Performance_Gate Evidence_Artifact.

    Args:
        lighthouse_inputs: iterable of ``(route, route_class, run_scores)``.
        api_inputs: iterable of ``(surface_name, samples, p95_target_ms)``.
        generated_at: optional ISO-8601 timestamp; defaults to current UTC.
        generated_by: provenance tag for the envelope.

    Returns:
        An Evidence_Artifact dict (gate_id ``performance``, requirement ``R3``)
        following the common envelope. ``status`` is conservative: it is
        ``passed`` only when **every** route and **every** surface has a
        ``pass`` result; any shortfall (fail) or any unmeasured / under-sampled
        surface (not-measured) marks the gate ``failed`` (R3.6, R3.7).
    """
    route_results = tuple(
        evaluate_lighthouse_route(route_class, run_scores, route=route)
        for (route, route_class, run_scores) in lighthouse_inputs
    )
    api_results = tuple(
        evaluate_api_surface(name, samples, p95_target_ms)
        for (name, samples, p95_target_ms) in api_inputs
    )

    failures: list[str] = []
    for r in route_results:
        if r.result == RESULT_FAIL:
            failures.append(
                f"lighthouse:{r.route} median {r.median:g} below threshold {r.threshold:g}"
            )
        elif r.result == RESULT_NOT_MEASURED:
            failures.append(
                f"lighthouse:{r.route} not measured "
                f"({len(r.run_scores)} run(s); >= {MIN_RUNS} required)"
            )
    for a in api_results:
        if a.result == RESULT_FAIL:
            failures.append(
                f"api:{a.surface} p95 {a.p95_ms:g} ms exceeds target {a.p95_target_ms:g} ms"
            )
        elif a.result == RESULT_NOT_MEASURED:
            failures.append(
                f"api:{a.surface} not measured "
                f"({a.sample_count} sample(s); >= {MIN_API_SAMPLES} required)"
            )

    status = STATUS_PASSED if not failures else STATUS_FAILED

    checks = [r.to_check() for r in route_results] + [a.to_check() for a in api_results]

    n_routes_pass = sum(1 for r in route_results if r.passed)
    n_api_pass = sum(1 for a in api_results if a.passed)
    summary = (
        f"{n_routes_pass}/{len(route_results)} Lighthouse routes and "
        f"{n_api_pass}/{len(api_results)} API surfaces passed."
    )

    return {
        "gate_id": "performance",
        "requirement": "R3",
        "status": status,
        "generated_at": generated_at or _utc_now_iso(),
        "generated_by": generated_by,
        "summary": summary,
        "checks": checks,
        "assets": [],
        "failures": failures,
    }
