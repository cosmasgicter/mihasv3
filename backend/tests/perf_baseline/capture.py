"""Changed-endpoint registry and capture helpers for the baseline harness (task 2.1).

This module names every endpoint the ``system-performance-hardening`` feature
changes and records, per endpoint, the extra *volatile* keys (beyond
:data:`tests.perf_baseline.divergence.DEFAULT_VOLATILE_KEYS`) that must be
collapsed before comparison. The DB-backed capture test
(``backend/tests/integration/test_perf_golden_snapshots.py``) iterates
:data:`CHANGED_ENDPOINTS` to build a golden snapshot per endpoint, and task
19.4's divergence regression reuses the same registry.

It deliberately holds no Django imports at module load; the capture test builds
model state and passes the resulting response/serializer payloads to
:func:`snapshot_envelope`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from tests.perf_baseline.divergence import (
    DEFAULT_VOLATILE_KEYS,
    assert_envelope,
    normalize_snapshot,
)


@dataclass(frozen=True)
class EndpointSpec:
    """One endpoint changed by the feature, plus its snapshot config.

    ``key`` is the golden-fixture name; ``requirements`` lists the requirement
    clauses the endpoint's optimization touches (for traceability);
    ``extra_volatile`` are keys collapsed to the volatile sentinel in addition
    to the defaults.
    """

    key: str
    label: str
    path: str
    methods: tuple[str, ...]
    requirements: tuple[str, ...]
    extra_volatile: frozenset[str] = field(default_factory=frozenset)

    def volatile_keys(self) -> frozenset[str]:
        return DEFAULT_VOLATILE_KEYS | self.extra_volatile


#: Every endpoint changed by ``system-performance-hardening`` that returns an
#: observable response whose envelope + computed values must be preserved
#: (R13.1, R13.2, R13.6). Used to drive golden capture and the divergence
#: regression across the feature surface.
CHANGED_ENDPOINTS: tuple[EndpointSpec, ...] = (
    EndpointSpec(
        key="admin_dashboard",
        label="Admin dashboard aggregates",
        path="/api/v1/admin/dashboard/",
        methods=("GET",),
        requirements=("2.1", "2.5", "2.6", "13.1", "13.2"),
        # recent_activity rows embed application numbers and per-row messages;
        # actor_name is derived from variable profile data.
        extra_volatile=frozenset({"application_number", "actor_name", "message", "old_status", "new_status"}),
    ),
    EndpointSpec(
        key="application_list",
        label="Application list payment + grade summary fields",
        path="/api/v1/applications/",
        methods=("GET",),
        requirements=("3.1", "3.3", "3.6", "8.1", "8.4", "13.1", "13.2"),
        # full_name / institution snapshot strings are scenario incidentals.
        extra_volatile=frozenset({"full_name", "program", "intake", "institution"}),
    ),
    EndpointSpec(
        key="canonical_program_list",
        label="Canonical-program list with available offerings",
        path="/api/v1/catalog/canonical-programs/",
        methods=("GET",),
        requirements=("4.4", "13.1", "13.2"),
        # name/code/description + full_name are scenario incidentals; the
        # embedded offering rows also carry foreign-key identifiers
        # (institution_id, canonical_program_id) that vary run-to-run and are
        # not behavioural — collapse them so the comparison is stable.
        extra_volatile=frozenset(
            {"name", "code", "description", "full_name", "institution_id", "canonical_program_id"}
        ),
    ),
    EndpointSpec(
        key="admin_scope",
        label="Admin scope / capabilities payload",
        path="/api/v1/admin/scope/",
        methods=("GET",),
        requirements=("5.1", "5.2", "5.3", "13.1", "13.2"),
        # institution name/code are scenario incidentals; the behavioural payload
        # is role/is_super_admin/all_access + capability lists.
        extra_volatile=frozenset({"name", "code"}),
    ),
    EndpointSpec(
        key="notifications",
        label="Notification list (page-number + cursor modes)",
        path="/api/v1/notifications/",
        methods=("GET",),
        requirements=("9.1", "9.2", "13.1", "13.2"),
        extra_volatile=frozenset({"title", "message"}),
    ),
)

#: Lookup by fixture key.
ENDPOINTS_BY_KEY: dict[str, EndpointSpec] = {spec.key: spec for spec in CHANGED_ENDPOINTS}


def snapshot_envelope(
    payload: Any,
    *,
    expect_success: bool = True,
    extra_volatile: frozenset[str] | set[str] | None = None,
) -> Any:
    """Validate the envelope and return a normalized snapshot of it.

    The full envelope (``{"success": ..., "data": ...}``) is kept so the
    success flag and pagination structure are part of the comparison. Volatile
    keys are collapsed using the defaults plus ``extra_volatile``.
    """
    # Validate the envelope shape up front (raises on a contract break).
    assert_envelope(payload, expect_success=expect_success)
    volatile = DEFAULT_VOLATILE_KEYS | frozenset(extra_volatile or ())
    return normalize_snapshot(payload, volatile_keys=volatile)
