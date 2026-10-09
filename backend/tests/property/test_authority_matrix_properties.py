"""Admissions V2 task 2.1 — property tests for the authority-matrix outcome model.

Universal (input-independent) properties of the pure ``expected_outcome`` model
that the generated allow/deny case matrix (R3.6) is built from. These hold for
EVERY protected endpoint, actor, capability, and object variant — so if task 2.2
derives enforcement tests from this model, tenant isolation and non-leaking
disclosure are guaranteed by construction (R3, R3.2).

Not a numbered design PBT; run as ordinary hypothesis-backed property tests
alongside the deterministic unit matrix in
``backend/tests/unit/test_authority_matrix_v2.py``.
"""

from __future__ import annotations

import sys
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import authority_matrix_v2 as amx  # noqa: E402

PROTECTED = ("owner", "reviewer_assignment", "tenant_capability", "platform_capability")
SCOPED_ACTORS = ("student_A", "reviewer_A", "tenant_admin_A")
ALL_ACTORS = ("anonymous",) + SCOPED_ACTORS + ("platform_admin",)

_TENANT_CAPS = sorted(amx.TENANT_CAPABILITIES)
_PLATFORM_CAPS = sorted(amx.PLATFORM_CAPABILITIES)
_ALL_VARIANTS = ("self", "own_A", "other_owner_A", "in_scope_A", "cross_tenant_B", "tenant_A", "tenant_B", "global", "scoped_aggregate", "n/a")

_VALID_STATUS = {None, 200, 401, 403, 404}
_VALID_EXPECT = {"allow", "deny", "n/a"}


def _entry(authority_class, capability=None, composed=None, object_scoped=True):
    return {
        "authority_class": authority_class,
        "capability": capability,
        "composed_authorities": composed or [],
        "tenant_object_path": "obj.institution_id" if object_scoped else None,
    }


@given(
    authority_class=st.sampled_from(amx.PROTECTED_CLASSES),
    cap=st.one_of(st.none(), st.sampled_from(_TENANT_CAPS), st.sampled_from(_PLATFORM_CAPS)),
    composed=st.lists(st.sampled_from(_TENANT_CAPS), max_size=3, unique=True),
    object_scoped=st.booleans(),
    actor=st.sampled_from(ALL_ACTORS),
    variant=st.sampled_from(_ALL_VARIANTS),
)
@settings(max_examples=400, deadline=None)
def test_expected_outcome_is_total_and_well_formed(authority_class, cap, composed, object_scoped, actor, variant):
    """expected_outcome is total: always a well-formed allow/deny + valid status."""
    entry = _entry(authority_class, cap, composed, object_scoped)
    out = amx.expected_outcome(entry, actor, variant)
    assert out["expect"] in _VALID_EXPECT
    assert out["status"] in _VALID_STATUS
    assert isinstance(out["reason"], str) and out["reason"]
    # A protected class never returns the n/a sentinel.
    assert out["expect"] in ("allow", "deny")


@given(
    authority_class=st.sampled_from(amx.PROTECTED_CLASSES),
    cap=st.one_of(st.none(), st.sampled_from(_TENANT_CAPS), st.sampled_from(_PLATFORM_CAPS)),
    composed=st.lists(st.sampled_from(_TENANT_CAPS), max_size=3, unique=True),
    object_scoped=st.booleans(),
    variant=st.sampled_from(_ALL_VARIANTS),
)
@settings(max_examples=200, deadline=None)
def test_anonymous_is_always_denied_401(authority_class, cap, composed, object_scoped, variant):
    """Every protected endpoint denies an unauthenticated caller with 401 (R3)."""
    entry = _entry(authority_class, cap, composed, object_scoped)
    out = amx.expected_outcome(entry, "anonymous", variant)
    assert out["expect"] == "deny"
    assert out["status"] == 401


@given(
    authority_class=st.sampled_from(["owner", "tenant_capability", "reviewer_assignment"]),
    cap=st.one_of(st.none(), st.sampled_from(_TENANT_CAPS)),
    composed=st.lists(st.sampled_from(_TENANT_CAPS), max_size=3, unique=True),
    actor=st.sampled_from(SCOPED_ACTORS),
)
@settings(max_examples=300, deadline=None)
def test_cross_tenant_object_is_masked_not_leaked(authority_class, cap, composed, actor):
    """A tenant-A-scoped actor probing a tenant-B object is denied with a 404 mask.

    This is the core tenant-isolation invariant (R3.2): cross-tenant object
    substitution NEVER succeeds and NEVER leaks via a distinguishable status —
    it is always an indistinguishable 404.
    """
    entry = _entry(authority_class, cap, composed, object_scoped=True)
    out = amx.expected_outcome(entry, actor, "cross_tenant_B")
    assert out["expect"] == "deny"
    assert out["status"] == 404, f"{authority_class}/{actor} cross-tenant leaked via {out['status']}"


@given(
    cap=st.sampled_from(_PLATFORM_CAPS),
    object_scoped=st.booleans(),
    variant=st.sampled_from(["tenant_A", "tenant_B", "global"]),
)
@settings(max_examples=150, deadline=None)
def test_platform_endpoints_allow_only_platform_admin(cap, object_scoped, variant):
    """platform_capability endpoints: platform_admin allowed, everyone else 403."""
    entry = _entry("platform_capability", cap, None, object_scoped)
    assert amx.expected_outcome(entry, "platform_admin", variant)["expect"] == "allow"
    for actor in SCOPED_ACTORS:
        out = amx.expected_outcome(entry, actor, variant)
        assert out["expect"] == "deny"
        assert out["status"] == 403


@given(
    cap=st.one_of(st.none(), st.sampled_from(_TENANT_CAPS)),
    variant=st.sampled_from(["in_scope_A", "cross_tenant_B", "tenant_A", "tenant_B"]),
)
@settings(max_examples=150, deadline=None)
def test_platform_admin_never_denied_on_tenant_scoped_endpoints(cap, variant):
    """Platform all-access is never blocked on a tenant_capability endpoint."""
    entry = _entry("tenant_capability", cap, None, object_scoped=True)
    out = amx.expected_outcome(entry, "platform_admin", variant)
    assert out["expect"] == "allow"
    assert out["status"] == 200
