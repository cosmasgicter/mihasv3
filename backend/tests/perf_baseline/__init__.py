"""Pre-feature output-equivalence baseline harness (system-performance-hardening, task 2.1).

This package captures **golden snapshots** of the response envelopes and
computed field values produced by every endpoint that the
``system-performance-hardening`` feature touches, and provides a **reusable
divergence comparator** that the post-feature property and regression tests
(tasks 3.3, 19.1, 19.4) reuse to assert new-vs-old equality.

The feature is performance- and reliability-only: it must not change any
observable business behavior (R13.1, R13.2). To prove that, we freeze a
normalized reference snapshot of each changed endpoint's output and compare
later runs against it.

Public API
----------

Comparator (``divergence``):
    ``diff_snapshots`` / ``assert_equivalent`` / ``assert_envelope`` /
    ``structural_signature`` / ``normalize_snapshot`` / ``OutputDivergence`` /
    ``VOLATILE``.

Golden fixtures (``golden_store``):
    ``GoldenStore`` / ``default_store``.

Endpoint registry (``capture``):
    ``CHANGED_ENDPOINTS`` / ``EndpointSpec`` / ``snapshot_envelope``.

Nothing in :mod:`divergence` or :mod:`golden_store` imports Django, so the
comparator can be unit-tested in isolation; only :mod:`capture` and the
DB-backed capture tests touch the ORM.
"""

from tests.perf_baseline.capture import (
    CHANGED_ENDPOINTS,
    EndpointSpec,
    snapshot_envelope,
)
from tests.perf_baseline.divergence import (
    VOLATILE,
    OutputDivergence,
    assert_envelope,
    assert_equivalent,
    diff_snapshots,
    normalize_snapshot,
    structural_signature,
)
from tests.perf_baseline.golden_store import GoldenStore, default_store

__all__ = [
    "CHANGED_ENDPOINTS",
    "EndpointSpec",
    "GoldenStore",
    "OutputDivergence",
    "VOLATILE",
    "assert_envelope",
    "assert_equivalent",
    "default_store",
    "diff_snapshots",
    "normalize_snapshot",
    "snapshot_envelope",
    "structural_signature",
]
