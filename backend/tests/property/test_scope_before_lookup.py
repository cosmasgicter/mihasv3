"""Property 5 — scope-before-lookup non-revealing not-found.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 4.2.

Feature: enterprise-tenant-authority, Property 5: Scope-before-lookup non-revealing not-found

``TenantScopedCapabilityMixin.get_scoped_object()``
(``backend/apps/catalog/permissions.py``) scopes a tenant-sensitive queryset
through ``AdminCapabilityService.visible_institution_queryset(user)`` **before**
issuing the ``.get()``. The consequence the design guarantees, and this property
pins, is that an out-of-scope, unknown, or malformed identifier is
*indistinguishable* from a genuinely missing resource:

* An out-of-scope id (another tenant's institution / program) returns a
  non-revealing **404** (or, where a platform capability is missing first, a
  non-revealing **403**) that is byte-identical to the response for a random
  unknown id — so the object's existence is never confirmed.
* No tenant identifier, name, code, or attribute of the other tenant leaks in
  the body (R4.3, R4.5, R17.4).

The retrofitted detail views exercise the mixin:

* ``ProgramDetailView`` (``/api/v1/catalog/programs/{id}/`` PATCH/DELETE) scopes
  a ``Program`` through its owning institution — a tenant-admin scoped to A
  hitting B's program id gets the masked 404.
* ``InstitutionDetailView`` (``/api/v1/catalog/institutions/{id}/`` PATCH/DELETE)
  is platform-capability gated, so a tenant-admin gets a non-revealing 403 that
  is likewise id-independent; a Super_Admin reaches the mixin and a genuinely
  unknown id surfaces the masked 404.

Production scope semantics are required, so the legacy admin test-scope shim is
disabled by monkeypatching ``AccessScopeService._test_settings_active`` to
return ``False`` (mirrors the drill's Step 14 and
``test_production_scope_masking_properties.py``).

Backend property test: ``pytest`` + ``hypothesis``, ≥100 examples, one property
(Property 5) per file.

**Validates: Requirements 3.5, 4.3, 4.5, 17.4**
"""

from __future__ import annotations

import json

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_membership,
    build_profile,
    build_two_tenant_worlds,
)

# ≥100 examples (spec minimum). Deadline relaxed for the DB + HTTP round-trips;
# the function-scoped ``production_scope`` fixture is intentionally combined with
# ``@given`` (one shim flip per example is cheap), so suppress that health check.
HYPOTHESIS_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

# PATCH and DELETE are the two write methods that route through the
# scope-before-lookup mixin on the retrofitted detail views.
_METHODS = st.sampled_from(["patch", "delete"])

# Single-segment, definitely-not-a-UUID path tokens (no slashes, so they stay
# one URL segment). The ``<uuid:...>`` route converter rejects these before the
# view, which must still be a non-revealing 404.
_MALFORMED_IDS = st.sampled_from(
    ["not-a-uuid", "123", "abcdef", "null", "0", "deadbeef"]
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
    """An ``APIClient`` authenticated as ``profile`` (a Profile row)."""
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


def _capture(response):
    """Return ``(status_code, parsed_body, raw_text)`` for a DRF/Django response."""
    try:
        body = response.json()
    except Exception:  # pragma: no cover - non-JSON (e.g. resolver 404 HTML)
        body = getattr(response, "data", None)
    try:
        raw = response.content.decode("utf-8", "replace")
    except Exception:  # pragma: no cover - defensive only
        raw = str(body)
    return response.status_code, body, raw


def _request(client, method: str, url: str):
    return _capture(getattr(client, method)(url, data={}, format="json"))


def _fingerprint(status_code, body):
    """Existence-inference fingerprint: status + envelope shape, ignoring the
    per-request ``request_id`` (a random correlation id that carries no
    information about whether the target resource exists)."""
    if isinstance(body, dict):
        return (
            status_code,
            body.get("success"),
            body.get("error"),
            body.get("code"),
        )
    return (status_code, None, None, None)


def _program_url(program_id) -> str:
    return f"/api/v1/catalog/programs/{program_id}/"


def _institution_url(institution_id) -> str:
    return f"/api/v1/catalog/institutions/{institution_id}/"


def _assert_non_revealing(status_code, body, raw, world) -> None:
    """The response is a non-revealing 404/403 leaking no tenant-B data."""
    assert status_code in (403, 404), (status_code, body)
    # The whole serialized body (parsed + raw) must not echo any identifier,
    # name, code, or attribute of the out-of-scope tenant (R4.3, R4.5, R17.4).
    blob = json.dumps(body, default=str) + "||" + (raw or "")
    leaks = {
        "institution_id": world.institution_id,
        "institution_name": world.institution.name,
        "institution_code": world.institution.code,
        "offering_id": world.offering_id,
        "offering_name": world.offering.name,
        "offering_code": world.offering.code,
    }
    for label, value in leaks.items():
        assert value and value not in blob, (label, value, status_code, blob)


@pytest.fixture()
def production_scope(monkeypatch):
    """Force the production membership/grant scope model.

    Under ``config.settings.test`` ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy dev/test compatibility). Property
    5 asserts the production scope-before-lookup behaviour, so disable that
    branch exactly as the drill's Step 14 does.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# Property 5
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestProperty5ScopeBeforeLookup:
    """Property 5: Scope-before-lookup non-revealing not-found.

    Feature: enterprise-tenant-authority, Property 5: Scope-before-lookup non-revealing not-found

    **Validates: Requirements 3.5, 4.3, 4.5, 17.4**
    """

    @HYPOTHESIS_SETTINGS
    @given(method=_METHODS, unknown_id=st.uuids())
    def test_program_out_of_scope_is_indistinguishable_from_unknown(
        self, method, unknown_id, production_scope
    ):
        """A tenant-admin scoped only to tenant A, writing tenant B's program id
        (or a random unknown id) through ``ProgramDetailView``, gets a
        non-revealing masked not-found that is byte-identical between the two —
        the program's existence is never confirmed and no tenant-B data leaks."""
        world_a, world_b = build_two_tenant_worlds()
        actor = build_profile(role="admin")
        build_membership(user=actor, institution=world_a.institution, role="admin")
        client = _client_for(actor)

        foreign = _request(client, method, _program_url(world_b.offering.id))
        unknown = _request(client, method, _program_url(unknown_id))

        # Scope-before-lookup masks the out-of-scope id as a 404 (R3.5, R4.3).
        assert foreign[0] == 404, foreign
        # Existence is never confirmed: foreign-tenant == genuinely-unknown.
        assert _fingerprint(foreign[0], foreign[1]) == _fingerprint(
            unknown[0], unknown[1]
        ), {"foreign": foreign, "unknown": unknown}
        _assert_non_revealing(*foreign, world_b)

    @HYPOTHESIS_SETTINGS
    @given(method=_METHODS, unknown_id=st.uuids())
    def test_institution_out_of_scope_is_non_revealing(
        self, method, unknown_id, production_scope
    ):
        """A tenant-admin scoped only to tenant A, writing tenant B's institution
        id (or a random unknown id) through the platform-gated
        ``InstitutionDetailView``, gets a non-revealing denial that is
        id-independent — no tenant-B identifier/name/code/attribute leaks and
        existence is never confirmed."""
        world_a, world_b = build_two_tenant_worlds()
        actor = build_profile(role="admin")
        build_membership(user=actor, institution=world_a.institution, role="admin")
        client = _client_for(actor)

        foreign = _request(client, method, _institution_url(world_b.institution.id))
        unknown = _request(client, method, _institution_url(unknown_id))

        # Non-revealing 403 (missing platform capability) or 404 (masked).
        assert foreign[0] in (403, 404), foreign
        # The denial does not depend on whether the id exists.
        assert _fingerprint(foreign[0], foreign[1]) == _fingerprint(
            unknown[0], unknown[1]
        ), {"foreign": foreign, "unknown": unknown}
        _assert_non_revealing(*foreign, world_b)

    @HYPOTHESIS_SETTINGS
    @given(method=_METHODS, bad_id=_MALFORMED_IDS)
    def test_malformed_ids_never_reveal_tenant_data(
        self, method, bad_id, production_scope
    ):
        """A malformed (non-UUID) id on either detail endpoint is rejected with a
        non-revealing not-found and never discloses any tenant data."""
        world_a, world_b = build_two_tenant_worlds()
        actor = build_profile(role="admin")
        build_membership(user=actor, institution=world_a.institution, role="admin")
        client = _client_for(actor)

        for url in (_program_url(bad_id), _institution_url(bad_id)):
            status_code, body, raw = _request(client, method, url)
            assert status_code == 404, (url, status_code, body)
            blob = json.dumps(body, default=str) + "||" + (raw or "")
            assert world_b.institution.name not in blob, (url, blob)
            assert world_b.offering.code not in blob, (url, blob)

    @HYPOTHESIS_SETTINGS
    @given(method=_METHODS, unknown_id=st.uuids())
    def test_super_admin_unknown_id_is_genuine_masked_not_found(
        self, method, unknown_id, production_scope
    ):
        """A Super_Admin reaches the mixin (full visible queryset) and a genuinely
        unknown id surfaces the same non-revealing 404 ``NOT_FOUND`` envelope on
        both detail endpoints — confirming the masked-not-found path is the same
        shape an out-of-scope tenant-admin observes."""
        super_admin = build_profile(role="super_admin")
        client = _client_for(super_admin)

        prog = _request(client, method, _program_url(unknown_id))
        inst = _request(client, method, _institution_url(unknown_id))

        for status_code, body, _raw in (prog, inst):
            assert status_code == 404, (status_code, body)
            assert isinstance(body, dict) and body.get("code") == "NOT_FOUND", body
            assert body.get("success") is False, body
