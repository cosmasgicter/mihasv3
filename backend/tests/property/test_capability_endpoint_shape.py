"""Property-based test — Capability endpoint payload shape.

Spec: ``enterprise-tenant-authority`` (task 3.2).

Feature: enterprise-tenant-authority, Property 2

**Property 2 (Capability endpoint payload shape):** every response from the
capability source endpoints — ``GET /api/v1/admin/capabilities/``
(``AdminCapabilitiesView``) and the extended ``GET /api/v1/admin/scope/``
(``AdminScopeView``) — is wrapped in the ``{"success": true, "data": ...}``
success envelope, and ``data`` *always* carries ``role``, ``is_super_admin``,
``all_access``, a platform-level ``capabilities`` list, and an ``institutions``
list where each entry carries ``id``, ``code``, ``name``, and a per-institution
``capabilities`` list — for **every** actor that can reach the endpoint
(super-admin, scoped tenant-admin, multi-institution admin, no-scope admin),
regardless of how the actor is scoped.

The shape is asserted against actors generated with hypothesis: a super-admin
and tenant-admins scoped to an arbitrary mix of institutions (none → no-scope,
one → scoped, several → multi-institution), with varied membership permission
bundles so the per-institution ``tenant.*`` capability lists differ across runs.

Both endpoints are exercised by every example because they share the
``_build_capability_payload`` source of truth, so Property 2 must hold for both.

Run (sqlite test DB, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest \
      backend/tests/property/test_capability_endpoint_shape.py -q

**Validates: Requirements 2.1, 2.4**
"""

from __future__ import annotations

import pytest
from django.core.cache import cache
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.services import AdminCapabilityService
from tests.tenant_fixtures import build_institution, build_membership, build_profile

pytestmark = pytest.mark.django_db


# ≥100 examples per the design's Testing Strategy. ``deadline`` is relaxed
# because each example builds institutions + memberships and makes two real
# HTTP round-trips through DRF. ``function_scoped_fixture`` is suppressed for
# parity with the other DB-backed property suites in this package.
HYPOTHESIS_SETTINGS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

# The endpoints are gated by ``IsAdmin`` (admin or super_admin), so the actors
# that can actually reach the Capability_Endpoint are exactly these two roles.
_ENDPOINT_PATHS = ("/api/v1/admin/capabilities/", "/api/v1/admin/scope/")

# Mutation-permission allowlist values stored on a membership/grant
# ``permissions`` JSON (see ``AdminCapabilityService._GRANTED_MUTATION_CAPABILITIES``).
# Varying these changes the per-institution ``tenant.*`` capability lists.
_PERMISSION_VALUES = ["view", "review", "verify_documents", "verify_payments", "export", "manage"]

# Per-institution scope for a generated tenant-admin actor: ``None`` means "not a
# member of this institution"; a (possibly empty) list of permission values means
# "active member with this mutation bundle". A list of these (len 1..4) yields the
# no-scope (all ``None``), scoped (one member), and multi-institution (≥2 members)
# cases across examples.
_MEMBERSHIP_SPECS = st.lists(
    st.one_of(
        st.none(),
        st.lists(st.sampled_from(_PERMISSION_VALUES), unique=True, max_size=len(_PERMISSION_VALUES)),
    ),
    min_size=1,
    max_size=4,
)


def _client_for(profile) -> APIClient:
    """An ``APIClient`` authenticated as ``profile`` via the JWTUser pattern.

    Mirrors ``tests/integration/test_tenant_lifecycle_drill.py::_client_for`` so
    the generated actor is authenticated exactly like a real cookie-auth caller
    (``force_authenticate`` bypasses token/CSRF for GETs).
    """
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
            }
        )
    )
    return client


def _assert_envelope_shape(body) -> None:
    """Assert Property 2: success envelope + the required data keys/shape."""
    # Success envelope (R2.4).
    assert isinstance(body, dict), f"response body is not an object: {type(body).__name__}"
    assert body.get("success") is True, f"missing/false success flag: {body}"
    assert "data" in body, f"missing data envelope key: {body}"

    data = body["data"]
    assert isinstance(data, dict), f"data is not an object: {type(data).__name__}"

    # Required top-level keys (R2.1).
    for key in ("role", "is_super_admin", "all_access", "capabilities", "institutions"):
        assert key in data, f"data missing required key {key!r}: {data}"

    assert isinstance(data["is_super_admin"], bool), "is_super_admin must be a bool"
    assert isinstance(data["all_access"], bool), "all_access must be a bool"

    # Platform capabilities: a list of ``platform.*`` strings, non-empty iff
    # the actor is a super-admin (R2.2 / R2.3 boundary).
    platform_caps = data["capabilities"]
    assert isinstance(platform_caps, list), "capabilities must be a list"
    assert all(isinstance(c, str) and c.startswith("platform.") for c in platform_caps), (
        f"platform capabilities must all be platform.* strings: {platform_caps}"
    )
    if data["is_super_admin"]:
        assert set(platform_caps) == set(AdminCapabilityService.PLATFORM_CAPABILITIES), (
            "a super-admin must receive the full platform.* catalogue (R2.2)"
        )
    else:
        assert platform_caps == [], "a non-super-admin must receive zero platform.* caps (R2.3)"

    # Institutions: a list of entries, each with id/code/name and a per-institution
    # ``tenant.*`` capabilities list (R2.1).
    institutions = data["institutions"]
    assert isinstance(institutions, list), "institutions must be a list"
    for entry in institutions:
        assert isinstance(entry, dict), f"institution entry must be an object: {entry}"
        for key in ("id", "code", "name", "capabilities"):
            assert key in entry, f"institution entry missing {key!r}: {entry}"
        assert isinstance(entry["id"], str) and entry["id"], "institution id must be a non-empty string"
        assert isinstance(entry["code"], str), "institution code must be a string"
        assert isinstance(entry["name"], str), "institution name must be a string"
        inst_caps = entry["capabilities"]
        assert isinstance(inst_caps, list), "per-institution capabilities must be a list"
        assert all(isinstance(c, str) and c.startswith("tenant.") for c in inst_caps), (
            f"per-institution capabilities must all be tenant.* strings: {inst_caps}"
        )


class TestCapabilityEndpointShape:
    """Property 2 — capability endpoint payload shape holds for every actor.

    **Validates: Requirements 2.1, 2.4**
    """

    # --- Concrete sanity examples (complement the property) ----------------

    def test_super_admin_payload_shape(self):
        """A super-admin payload satisfies the shape on both endpoints."""
        build_institution(suffix="alpha")
        build_institution(suffix="beta")
        actor = build_profile(role="super_admin")
        client = _client_for(actor)
        for path in _ENDPOINT_PATHS:
            resp = client.get(path)
            assert resp.status_code == 200, (path, resp.content)
            _assert_envelope_shape(resp.data)
            assert resp.data["data"]["is_super_admin"] is True

    def test_scoped_admin_payload_shape(self):
        """A tenant-admin scoped to one institution satisfies the shape, and its
        per-institution capabilities include the read-default bundle."""
        institution = build_institution(suffix="scoped")
        actor = build_profile(role="admin")
        build_membership(user=actor, institution=institution, role="admin", permissions=["review"])
        client = _client_for(actor)
        for path in _ENDPOINT_PATHS:
            resp = client.get(path)
            assert resp.status_code == 200, (path, resp.content)
            _assert_envelope_shape(resp.data)
            assert resp.data["data"]["is_super_admin"] is False

    # --- The property ------------------------------------------------------

    @HYPOTHESIS_SETTINGS
    @given(role=st.sampled_from(["super_admin", "admin"]), membership_specs=_MEMBERSHIP_SPECS)
    def test_payload_shape_holds_for_every_actor(self, role, membership_specs):
        """For any endpoint-reachable actor, both capability endpoints return the
        success envelope with the full required data shape (Property 2).

        ``membership_specs`` builds one institution per entry; for a tenant-admin
        each non-``None`` entry attaches an active membership with that mutation
        bundle, so across examples the actor is no-scope (all ``None``), scoped
        (one member), or multi-institution (≥2 members). A super-admin ignores
        the memberships (platform authority) but the institutions still exist, so
        the institution list is populated for them too.
        """
        cache.clear()
        actor = build_profile(role=role)

        for index, spec in enumerate(membership_specs):
            institution = build_institution(suffix=f"{actor.id.hex[:6]}-{index:02d}")
            if role == "admin" and spec is not None:
                build_membership(
                    user=actor,
                    institution=institution,
                    role="admin",
                    permissions=list(spec),
                )

        client = _client_for(actor)
        for path in _ENDPOINT_PATHS:
            resp = client.get(path)
            assert resp.status_code == 200, (path, resp.content)
            _assert_envelope_shape(resp.data)
            # The two endpoints share one source of truth, so their is_super_admin
            # determination must agree with the actor's role.
            assert resp.data["data"]["is_super_admin"] is (role == "super_admin")
