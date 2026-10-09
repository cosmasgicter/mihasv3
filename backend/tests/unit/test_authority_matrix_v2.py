"""Admissions V2 task 2.1 — approved endpoint authority-matrix gate + tests.

Runs the APPROVED authority matrix (``scripts/authority_matrix_v2.py`` +
``scripts/authority_matrix_registry.py``) against the LIVE Django URLConf via
backend pytest, with the production-gated jobs-ops routes enabled so the gate
covers the full 185-route surface (mirrors the task-0.3 inventory). No test here
is skipped or environment-gated.

It proves, executably:

* the zero-unclassified gate PASSES — every live route resolves to a design
  §5.2 authority class or an approved boundary (infra / jobs_ops), with ZERO
  routes left in the task-0.3 weak ``authenticated`` bucket (R3, R3.2);
* the gate HAS TEETH — a synthetic unregistered / weak route FAILS it;
* registry ↔ live-route reconciliation — no unregistered live route, no stale
  registry entry (drift guard);
* the approved capability bundles + every capability the registry references are
  canonical against ``AdminCapabilityService`` (no invented capabilities);
* the generated allow/deny case matrix exercises every protected endpoint for
  the five actor contexts across two institutions incl. cross-tenant ids, and
  its disclosure outcomes are non-leaking (R3.6, R3.2).

Requirements: R3, R3.2, R3.6. Findings: AUTH-01, AUTH-02, AUTH-05, ADM-05,
ADM-06, TEN-08.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest
from django.urls import clear_url_caches

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import authority_matrix_registry as reg  # noqa: E402
import authority_matrix_v2 as amx  # noqa: E402
import inventory_admissions_v2 as inv  # noqa: E402


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

@pytest.fixture()
def full_surface_catalogue(settings):
    """Walk the FULL live URLConf (jobs-ops routes enabled) into the 0.3 catalogue.

    Mirrors ``backend/tests/unit/test_analytics_scope.py``: flip
    ``ENABLE_JOBS_OPS_ROUTES`` on, reload ``config.urls`` and clear the URL
    caches so the production-gated jobs-ops routes are mounted, then walk. This
    makes the gate deterministically cover every backend route regardless of the
    default (production) flag value.
    """
    import config.urls

    previous = getattr(settings, "ENABLE_JOBS_OPS_ROUTES", False)
    settings.ENABLE_JOBS_OPS_ROUTES = True
    importlib.reload(config.urls)
    clear_url_caches()
    try:
        catalogue = inv.build_backend_route_catalogue(_REPO_ROOT)
    finally:
        settings.ENABLE_JOBS_OPS_ROUTES = previous
        importlib.reload(config.urls)
        clear_url_caches()

    assert catalogue.get("available") is True, catalogue.get("error")
    return catalogue


@pytest.fixture()
def matrix(full_surface_catalogue):
    return amx.build_matrix(full_surface_catalogue, reg.get_registry())


# --------------------------------------------------------------------------- #
# The executable zero-unclassified gate
# --------------------------------------------------------------------------- #

def test_zero_unclassified_gate_passes_on_live_surface(matrix):
    """Every live route resolves to an approved §5.2 / boundary class (R3)."""
    report = amx.build_zero_unclassified_report(matrix, reg.get_registry())

    assert report["passed"] is True, (
        f"Authority matrix gate FAILED: "
        f"{report['unresolved_count']} unresolved, "
        f"{report['weak_bucket_remaining_count']} weak-bucket, "
        f"{len(report['stale_registry_entries'])} stale. "
        f"Unresolved={report['unresolved'][:5]} "
        f"Stale={report['stale_registry_entries'][:5]}"
    )
    assert report["unresolved_count"] == 0
    assert report["weak_bucket_remaining_count"] == 0
    assert report["stale_registry_entries"] == []
    # The surface must be non-trivial (the full 185-route surface, not a subset).
    assert report["total_routes"] >= 180
    assert report["resolved"] == report["total_routes"]


def test_every_route_in_target_seven_or_approved_boundary(matrix):
    """No route sits in the task-0.3 weak ``authenticated`` bucket (R3.2)."""
    for rec in matrix:
        assert rec["approved_class"] in reg.APPROVED_CLASSES, (
            f"{rec['path']} -> unapproved class {rec['approved_class']}"
        )
        assert rec["approved_class"] != "authenticated", (
            f"{rec['path']} still in the weak authenticated bucket"
        )


def test_weak_bucket_and_heuristic_errors_were_resolved(matrix):
    """Task 2.1 actually resolved the 0.3 weak bucket + fixed heuristic misses."""
    report = amx.build_zero_unclassified_report(matrix, reg.get_registry())
    # The 0.3 inventory left 60 routes in the weak bucket; all are resolved now.
    assert report["weak_bucket_resolved_count"] >= 55
    # Approved review corrected heuristic mistakes (e.g. login/refresh tagged
    # internal_callback; institution/program CRUD tagged tenant not platform).
    assert report["class_overridden_count"] >= 20

    by_path = {rec["path"]: rec for rec in matrix}
    # Login/refresh are public, not internal_callback (heuristic false 'hmac').
    assert by_path["/api/v1/auth/login/"]["approved_class"] == "public"
    assert by_path["/api/v1/auth/refresh/"]["approved_class"] == "public"
    # Institution management is platform authority, not the heuristic 'tenant'.
    assert (
        by_path["/api/v1/catalog/institutions/<uuid:institution_id>/"]["approved_class"]
        == "platform_capability"
    )
    # CommunicationTemplateUpdateView (get_permissions->IsAdmin) resolved.
    assert (
        by_path["/api/v1/admin/templates/<str:key>/"]["approved_class"]
        == "tenant_capability"
    )


# --------------------------------------------------------------------------- #
# The gate has teeth
# --------------------------------------------------------------------------- #

def test_gate_fails_on_synthetic_unclassified_route():
    """An unregistered admissions route (no boundary rule) FAILS the gate."""
    synthetic = {
        "available": True,
        "routes": [
            {
                "path": "/api/v1/totally-made-up/secret/",
                "methods": ["POST"],
                "view": "MadeUpView",
                "module": "apps.applications.made_up",
                "classification": "authenticated",
                "permission_classes": ["IsAuthenticated"],
            }
        ],
    }
    matrix = amx.build_matrix(synthetic, reg.get_registry())
    report = amx.build_zero_unclassified_report(matrix, reg.get_registry())
    assert report["passed"] is False
    assert report["unresolved_count"] == 1
    assert report["unresolved"][0]["path"] == "/api/v1/totally-made-up/secret/"


def test_gate_fails_on_stale_registry_entry():
    """A registry entry with no live route (drift) FAILS the gate."""
    registry = dict(reg.get_registry())
    registry["/api/v1/removed-endpoint/that-no-longer-exists/"] = reg.owner()
    # A live surface that does NOT contain that path.
    live = {
        "available": True,
        "routes": [
            {
                "path": "/api/v1/auth/login/",
                "methods": ["POST"],
                "view": "LoginView",
                "module": "apps.accounts.auth_views",
                "classification": "public",
                "permission_classes": ["AllowAny"],
            }
        ],
    }
    matrix = amx.build_matrix(live, registry)
    report = amx.build_zero_unclassified_report(matrix, registry)
    assert report["passed"] is False
    assert "/api/v1/removed-endpoint/that-no-longer-exists/" in report["stale_registry_entries"]


# --------------------------------------------------------------------------- #
# Reconciliation / drift
# --------------------------------------------------------------------------- #

def test_no_unregistered_admissions_route(matrix):
    """Admissions-relevant routes are EXPLICIT approved registry decisions.

    The reviewed boundary rule may only classify infra, the jobs-ops product
    surface, or a jobs-ops provider webhook (internal_callback). Every route in
    a protected admissions class (owner / reviewer_assignment / tenant_capability
    / platform_capability) or ``public`` must be an explicit, approved registry
    entry — never inferred by a rule.
    """
    admissions_relevant = set(amx.PROTECTED_CLASSES) | {"public"}
    for rec in matrix:
        assert rec["resolution_source"] in ("registry", "boundary"), rec["path"]
        if rec["resolution_source"] == "boundary":
            assert rec["approved_class"] in ("infra", "jobs_ops", "internal_callback"), (
                f"{rec['path']} boundary-resolved to {rec['approved_class']}, "
                "but the boundary rule may only emit infra/jobs_ops/internal_callback"
            )
        if rec["approved_class"] in admissions_relevant:
            assert rec["resolution_source"] == "registry", (
                f"{rec['path']} ({rec['approved_class']}) resolved via "
                f"{rec['resolution_source']}, but admissions-relevant routes must "
                "be explicitly registered/approved"
            )


def test_no_stale_registry_entries(matrix):
    """Every approved registry path corresponds to a live route (drift guard)."""
    report = amx.build_zero_unclassified_report(matrix, reg.get_registry())
    assert report["stale_registry_entries"] == []


# --------------------------------------------------------------------------- #
# Capability canonicality (no invented capabilities)
# --------------------------------------------------------------------------- #

def test_capability_bundles_match_service():
    """The matrix capability bundles mirror the canonical AdminCapabilityService."""
    from apps.catalog.services import AdminCapabilityService as Svc

    assert amx.PLATFORM_CAPABILITIES == Svc.PLATFORM_CAPABILITIES
    assert amx.TENANT_CAPABILITIES == Svc.TENANT_CAPABILITIES
    assert amx.TENANT_READ_BUNDLE == Svc._DEFAULT_TENANT_READ_CAPABILITIES


def test_registry_capabilities_are_canonical():
    """Every capability the registry references exists in the canonical catalogue."""
    valid = amx.PLATFORM_CAPABILITIES | amx.TENANT_CAPABILITIES

    def _check(entry):
        caps = []
        cap = entry.get("capability")
        if cap:
            caps.append(cap)
        caps.extend(entry.get("composed_authorities") or [])
        for m in (entry.get("by_method") or {}).values():
            mc = m.get("capability")
            if mc:
                caps.append(mc)
            caps.extend(m.get("composed_authorities") or [])
        for c in caps:
            assert c in valid, f"invented capability {c!r} in registry entry"

    for entry in reg.get_registry().values():
        _check(entry)


def test_disclosure_policy_complete():
    """Every approved authority class has an object-disclosure policy (R3.2)."""
    for cls in reg.APPROVED_CLASSES:
        assert cls in reg.DISCLOSURE_BY_CLASS
        assert reg.DISCLOSURE_BY_CLASS[cls]["policy"]
        assert reg.DISCLOSURE_BY_CLASS[cls]["rule"]


# --------------------------------------------------------------------------- #
# Generated allow/deny case matrix (R3.6)
# --------------------------------------------------------------------------- #

def test_case_matrix_covers_five_actors_and_two_tenants(matrix):
    case_matrix = amx.build_case_matrix(matrix)
    assert case_matrix["protected_endpoint_method_count"] > 100
    assert {a["id"] for a in case_matrix["actors"]} == {
        "anonymous", "student_A", "reviewer_A", "tenant_admin_A", "platform_admin",
    }
    assert set(case_matrix["tenants"]) == {"A", "B"}

    for ep in case_matrix["endpoints"]:
        actors_seen = {c["actor"] for c in ep["cases"]}
        assert actors_seen == {
            "anonymous", "student_A", "reviewer_A", "tenant_admin_A", "platform_admin",
        }, f"{ep['endpoint']} missing an actor context"
        # Object-scoped endpoints must exercise a cross-tenant (tenant B) id.
        if ep["tenant_object_path"]:
            assert any(c["object_tenant"] == "B" for c in ep["cases"]), (
                f"{ep['endpoint']} never probed with a cross-tenant id"
            )


def test_case_matrix_anonymous_always_denied(matrix):
    case_matrix = amx.build_case_matrix(matrix)
    for ep in case_matrix["endpoints"]:
        for c in ep["cases"]:
            if c["actor"] == "anonymous":
                assert c["expect"] == "deny" and c["status"] == 401, ep["endpoint"]


def test_case_matrix_cross_tenant_admin_masked_not_leaked(matrix):
    """A Tenant_Admin scoped to A never observes a tenant B object (R3.2)."""
    case_matrix = amx.build_case_matrix(matrix)
    checked = 0
    for ep in case_matrix["endpoints"]:
        if ep["authority_class"] not in ("owner", "tenant_capability", "reviewer_assignment"):
            continue
        if not ep["tenant_object_path"]:
            continue
        for c in ep["cases"]:
            if c["actor"] == "tenant_admin_A" and c["object_tenant"] == "B":
                assert c["expect"] == "deny", ep["endpoint"]
                # Cross-tenant denial must be a non-revealing 404 mask.
                assert c["status"] == 404, f"{ep['endpoint']} leaks via {c['status']}"
                checked += 1
    assert checked > 0


def test_case_matrix_platform_endpoints_deny_non_platform(matrix):
    case_matrix = amx.build_case_matrix(matrix)
    checked = 0
    for ep in case_matrix["endpoints"]:
        if ep["authority_class"] != "platform_capability":
            continue
        for c in ep["cases"]:
            if c["actor"] == "platform_admin":
                assert c["expect"] == "allow" and c["status"] == 200, ep["endpoint"]
            elif c["actor"] in ("student_A", "reviewer_A", "tenant_admin_A"):
                assert c["expect"] == "deny" and c["status"] == 403, ep["endpoint"]
                checked += 1
    assert checked > 0


def test_case_matrix_owner_endpoints_allow_owner_mask_non_owner(matrix):
    case_matrix = amx.build_case_matrix(matrix)
    checked = 0
    for ep in case_matrix["endpoints"]:
        if ep["authority_class"] != "owner" or not ep["tenant_object_path"]:
            continue
        for c in ep["cases"]:
            if c["actor"] == "student_A" and c["object"] == "own_A":
                assert c["expect"] == "allow" and c["status"] == 200, ep["endpoint"]
            if c["actor"] == "student_A" and c["object"] == "other_owner_A":
                assert c["expect"] == "deny" and c["status"] == 404, ep["endpoint"]
                checked += 1
    assert checked > 0


# --------------------------------------------------------------------------- #
# Committed evidence integrity
# --------------------------------------------------------------------------- #

def test_committed_evidence_artifacts_are_passing():
    """The committed docs/v2-evidence/2.1 gate artifact records a PASS."""
    import json

    report_path = _REPO_ROOT / "docs" / "v2-evidence" / "2.1" / "zero-unclassified-endpoint-report.json"
    assert report_path.exists(), "task 2.1 gate evidence artifact missing"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["passed"] is True
    assert report["unresolved_count"] == 0
    assert report["weak_bucket_remaining_count"] == 0
