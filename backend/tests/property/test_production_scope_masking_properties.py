"""Property 26 — tenant isolation holds across every audited endpoint.

Spec: ``.kiro/specs/beanola-production-readiness/`` — Task 11.4, Component 5.

Feature: beanola-production-readiness, Property 26: Tenant isolation holds across every audited endpoint

This is the **cross-surface aggregation** the R5 security audit adds over the
whole admissions platform. Where the remediation Property 13
(``test_remediation_isolation_properties.py``) proved the masking invariant on
the *document* surfaces, Property 26 drives **every staff-scoped admissions
endpoint** in the R5 endpoint inventory
(``docs/audits/scope-endpoint-inventory.md``) through the five access outcomes,
for an arbitrary non-super-admin actor and scope mix:

- **R5.3** in-scope staff read  → ``API_Envelope`` (not masked as not-found).
- **R5.4** out-of-scope staff read → ``Not_Found_Envelope`` byte-identical
  (HTTP status, ``code``, message, whole body) to a genuine missing resource,
  leaking no PII of the other school (R8.3, R8.4, R16.4).
- **R5.5** an **expired** ``Access_Grant`` → ``Not_Found_Envelope`` for the
  previously granted resource.
- **R5.6** an **offering**- or **application**-scoped grant permits only its
  target — a sibling in the *same* school still masks as not-found.
- **R5.7** a ``Super_Admin`` is permitted every read.

Every permitted read funnels through ``AccessScopeService`` using canonical IDs
(``institution_ref_id`` / ``program_offering_id`` / ``pk`` /
``AccessGrant.program_id`` / ``UserInstitutionMembership.institution_id``),
never ``Legacy_String_Fields`` (R5.2, R5.8) — an invariant the companion
``test_scope_drift_guard.py`` / ``test_unscoped_endpoint_guard.py`` guards pin
statically.

The audited endpoint surface mirrors the Task 11.2 matrix
(``tests/unit/test_scoped_access_matrix.py``): the application-id staff GET
endpoints surfaced as GAP-4..GAP-8 by the inventory, plus the document auth
seam ``document_storage_views.py:_get_authorized_document`` (info / signed-url /
download / extract).

Backend property test: ``pytest`` + ``hypothesis``, ≥100 examples,
``--hypothesis-seed=0``, one property (Property 26) per file.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 8.3, 8.4, 16.4**
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_access_grant,
    build_application,
    build_document,
    build_offering_with_application,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
)

# A UUID that never matches a real row — the genuine "missing resource"
# baseline every out-of-scope / expired / sibling read must be indistinguishable
# from.
_RANDOM_ID = "00000000-0000-4000-8000-000000000000"


# ≥100 examples, deadline relaxed for DB + HTTP round-trips; the seed is pinned
# via the CLI flag ``--hypothesis-seed=0`` per the spec's testing conventions.
# Each example builds fresh tenant rows (unique uuid suffixes) inside the single
# ``@pytest.mark.django_db`` transaction, exactly as the Phase-0 access-scope
# property suite (``tests/property/test_access_scope_properties.py``) does.
HYPOTHESIS_SETTINGS = settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


# ---------------------------------------------------------------------------
# Audited endpoint surface (R5 inventory)
# ---------------------------------------------------------------------------

# Application-id staff GET endpoints that must 404-mask an out-of-scope read.
# These are the GAP-4..GAP-8 surfaces the Task 11.2 narrowing fixed; ``{aid}``
# is substituted with an application id.
_APP_GET_ENDPOINTS: dict[str, str] = {
    "admin-summary (GAP-5)": "/api/v1/applications/{aid}/admin-summary/",
    "grades (GAP-4)": "/api/v1/applications/{aid}/grades/",
    "summary (GAP-4)": "/api/v1/applications/{aid}/summary/",
    "interviews-crud (GAP-6)": "/api/v1/applications/{aid}/interviews/",
    "waitlist-position (GAP-7)": "/api/v1/applications/{aid}/waitlist-position/",
    "conditions (GAP-7)": "/api/v1/applications/{aid}/conditions/",
}

# Document auth-seam endpoints (``_get_authorized_document``); ``{did}`` is a
# document id. ``extract`` is a POST; the rest are GET.
_DOC_ENDPOINTS: dict[str, str] = {
    "document-info": "/api/v1/documents/{did}/info/",
    "document-signed-url": "/api/v1/documents/{did}/signed-url/",
    "document-download": "/api/v1/documents/{did}/download/",
    "document-extract": "/api/v1/documents/{did}/extract/",
}

_APP_ENDPOINT_KEYS = st.sampled_from(sorted(_APP_GET_ENDPOINTS))
_DOC_ENDPOINT_KEYS = st.sampled_from(sorted(_DOC_ENDPOINTS))

# Every scope kind that legitimately places ``world_a``'s application (and the
# documents hanging off it) in a non-super-admin actor's scope. The property
# holds for all four: membership, institution grant, offering grant (the app is
# on that offering), and an application grant to the app itself.
_IN_SCOPE_KIND = st.sampled_from(
    ["membership", "institution_grant", "offering_grant", "application_grant"]
)

# Expiry-bearing grant scope kinds for the R5.5 case.
_GRANT_SCOPE_KIND = st.sampled_from(["institution", "offering", "application"])


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
    """Return ``(status_code, parsed_body)`` for a DRF response."""
    try:
        body = response.json()
    except Exception:  # pragma: no cover - non-JSON body
        body = getattr(response, "data", None)
    return response.status_code, body


def _is_not_found_mask(status_code, body) -> bool:
    """True when the scope layer masked the resource as a 404 ``NOT_FOUND``."""
    return (
        status_code == 404
        and isinstance(body, dict)
        and body.get("code") == "NOT_FOUND"
    )


def _assert_permitted(label, status_code, body):
    """The scope layer did **not** 404-mask the resource (R5.3 / R5.7).

    Most permitted reads return 200 + the API_Envelope, but a few endpoints
    legitimately return a downstream business response for an in-scope target
    (e.g. ``waitlist-position`` → 400 ``NOT_WAITLISTED`` for a draft). The R5
    invariant for a permitted caller is only that the scope gate did not mask
    the resource as a not-found.
    """
    assert not _is_not_found_mask(status_code, body), (label, status_code, body)
    if status_code == 200 and isinstance(body, dict):
        assert body.get("success") is True, (label, body)


def _attach(actor, world, kind):
    """Attach one in-scope ``kind`` to ``actor`` targeting ``world``."""
    if kind == "membership":
        from tests.tenant_fixtures import build_membership

        build_membership(user=actor, institution=world.institution, role="admin")
    elif kind == "institution_grant":
        build_access_grant(user=actor, scope_type="institution", institution=world.institution)
    elif kind == "offering_grant":
        build_access_grant(user=actor, scope_type="offering", program=world.offering)
    elif kind == "application_grant":
        build_access_grant(
            user=actor, scope_type="application", application_id=world.application.id
        )
    else:  # pragma: no cover - guarded by the strategy
        raise ValueError(kind)


def _read(client, family, template, resource_id):
    """Issue the read for an endpoint ``family`` and return ``_capture(...)``."""
    if family == "app":
        return _capture(client.get(template.format(aid=resource_id)))
    # Document family: ``extract`` is a POST, the rest are GET.
    url = template.format(did=resource_id)
    method = client.post if url.endswith("/extract/") else client.get
    return _capture(method(url))


@pytest.fixture()
def production_scope(monkeypatch):
    """Force the **production** membership/grant scope model.

    Under ``config.settings.test`` ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy dev/test compat). Property 26
    asserts the production model, so we disable that branch exactly as the Task
    11.2 HTTP matrix and the ``test_cross_tenant_isolation`` suite do.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# Property 26
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProperty26TenantIsolation:
    """Property 26: Tenant isolation holds across every audited endpoint.

    Feature: beanola-production-readiness, Property 26: Tenant isolation holds across every audited endpoint

    **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 8.3, 8.4, 16.4**
    """

    # -- R5.3 + R5.4: in-scope permitted, out-of-scope masked (app endpoints) --

    @HYPOTHESIS_SETTINGS
    @given(endpoint_key=_APP_ENDPOINT_KEYS, scope_kind=_IN_SCOPE_KIND)
    def test_app_endpoint_in_scope_permitted_out_of_scope_masked(
        self, endpoint_key, scope_kind, production_scope
    ):
        """For any audited application GET endpoint and any in-scope grant kind,
        the staff actor reads its own school's application (permitted) but the
        other school's application masks byte-identically to a genuine miss
        (R5.3, R5.4, R8.3, R8.4, R16.4). The actor is a role-``admin`` School
        Staff so the read clears the role-permission gate (``IsAdmin``) and the
        outcome is decided purely by the ``AccessScopeService`` scope layer."""
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        actor = build_profile(role="admin")
        _attach(actor, world_a, scope_kind)
        client = _client_for(actor)
        template = _APP_GET_ENDPOINTS[endpoint_key]

        in_scope = _read(client, "app", template, world_a.application_id)
        _assert_permitted(endpoint_key, *in_scope)

        missing = _read(client, "app", template, _RANDOM_ID)
        out_of_scope = _read(client, "app", template, world_b.application_id)

        assert missing[0] == 404, (endpoint_key, missing)
        assert out_of_scope[0] == 404, (endpoint_key, out_of_scope)
        if isinstance(out_of_scope[1], dict):
            assert out_of_scope[1].get("success") is not True, (endpoint_key, out_of_scope)
            assert out_of_scope[1].get("code") == "NOT_FOUND", (endpoint_key, out_of_scope)
        # Indistinguishability: identical status, shape, and message — no
        # existence-inference channel and no PII of the other school leaks.
        assert out_of_scope == missing, {
            "endpoint": endpoint_key,
            "out_of_scope": out_of_scope,
            "missing": missing,
        }
        assert world_b.institution.name not in str(out_of_scope[1]), endpoint_key
        assert world_b.application.full_name not in str(out_of_scope[1]), endpoint_key

    # -- R5.3 + R5.4: in-scope permitted, out-of-scope masked (document seam) --

    @HYPOTHESIS_SETTINGS
    @given(endpoint_key=_DOC_ENDPOINT_KEYS, scope_kind=_IN_SCOPE_KIND)
    def test_document_seam_in_scope_permitted_out_of_scope_masked(
        self, endpoint_key, scope_kind, production_scope
    ):
        """The ``_get_authorized_document`` seam permits an in-scope document and
        masks an out-of-scope document as a byte-identical not-found across
        info / signed-url / download / extract (R5.3, R5.4). The actor is a
        role-``admin`` School Staff so the outcome is decided by the scope
        layer, not the role gate."""
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        doc_a = build_document(application=world_a.application)
        doc_b = build_document(application=world_b.application)
        actor = build_profile(role="admin")
        _attach(actor, world_a, scope_kind)
        client = _client_for(actor)
        template = _DOC_ENDPOINTS[endpoint_key]

        # The document-extract endpoint carries a per-user AI throttle (5/hour).
        # Hypothesis drives many examples through this one function with the same
        # actor, so without resetting the shared rate-limit cache per example the
        # throttle eventually returns 429 instead of the scope layer's 404 mask.
        # The autouse conftest reset only fires once per test function, not per
        # Hypothesis example — clear here so each example starts unthrottled.
        from django.core.cache import cache

        cache.clear()

        in_scope = _read(client, "doc", template, str(doc_a.id))
        _assert_permitted(endpoint_key, *in_scope)

        missing = _read(client, "doc", template, _RANDOM_ID)
        out_of_scope = _read(client, "doc", template, str(doc_b.id))

        assert out_of_scope[0] == missing[0], {
            "endpoint": endpoint_key,
            "out_of_scope": out_of_scope,
            "missing": missing,
        }
        if isinstance(out_of_scope[1], dict):
            assert out_of_scope[1].get("success") is not True, (endpoint_key, out_of_scope)
        assert world_b.application.full_name not in str(out_of_scope[1]), endpoint_key

    # -- R5.5: an expired grant confers nothing --

    @HYPOTHESIS_SETTINGS
    @given(endpoint_key=_APP_ENDPOINT_KEYS, grant_scope=_GRANT_SCOPE_KIND)
    def test_expired_grant_masks_previously_granted_resource(
        self, endpoint_key, grant_scope, production_scope
    ):
        """An actor whose only scope is an **expired** grant (institution /
        offering / application) reads the previously granted application as a
        byte-identical not-found (R5.5)."""
        world = build_tenant_world(application_status="submitted")
        actor = build_profile(role="admin")
        expires_at = timezone.now() - timedelta(days=1)
        if grant_scope == "institution":
            build_access_grant(
                user=actor, scope_type="institution", institution=world.institution, expires_at=expires_at
            )
        elif grant_scope == "offering":
            build_access_grant(
                user=actor, scope_type="offering", program=world.offering, expires_at=expires_at
            )
        else:
            build_access_grant(
                user=actor, scope_type="application", application_id=world.application.id, expires_at=expires_at
            )
        client = _client_for(actor)
        template = _APP_GET_ENDPOINTS[endpoint_key]

        missing = _read(client, "app", template, _RANDOM_ID)
        expired = _read(client, "app", template, world.application_id)

        assert expired[0] == 404, (endpoint_key, expired)
        assert expired == missing, {
            "endpoint": endpoint_key,
            "expired": expired,
            "missing": missing,
        }

    # -- R5.6: a scoped grant permits only its target, never a sibling --

    @HYPOTHESIS_SETTINGS
    @given(endpoint_key=_APP_ENDPOINT_KEYS, grant_scope=st.sampled_from(["offering", "application"]))
    def test_scoped_grant_does_not_widen_to_sibling(
        self, endpoint_key, grant_scope, production_scope
    ):
        """An offering- or application-scoped grant permits its granted target
        but a *sibling* application in the **same school** (covered by neither
        the offering nor the application grant) still masks as not-found
        (R5.6)."""
        world = build_tenant_world(application_status="submitted")
        actor = build_profile(role="admin")

        if grant_scope == "application":
            # Sibling on the same offering, NOT covered by the application grant.
            sibling = build_application(
                student=build_profile(role="student"),
                institution=world.institution,
                canonical_program=world.canonical_program,
                offering=world.offering,
                intake=world.intake,
                status="submitted",
            )
            build_access_grant(
                user=actor, scope_type="application", application_id=world.application.id
            )
        else:  # offering grant — sibling lives on a *different* offering.
            _sibling_offering, sibling = build_offering_with_application(
                institution=world.institution,
                canonical_program=world.canonical_program,
                intake=world.intake,
                student=build_profile(role="student"),
                application_status="submitted",
            )
            build_access_grant(user=actor, scope_type="offering", program=world.offering)

        client = _client_for(actor)
        template = _APP_GET_ENDPOINTS[endpoint_key]

        granted = _read(client, "app", template, world.application_id)
        _assert_permitted(endpoint_key, *granted)

        missing = _read(client, "app", template, _RANDOM_ID)
        sibling_resp = _read(client, "app", template, str(sibling.id))

        assert sibling_resp[0] == 404, (endpoint_key, sibling_resp)
        assert sibling_resp == missing, {
            "endpoint": endpoint_key,
            "grant_scope": grant_scope,
            "sibling": sibling_resp,
            "missing": missing,
        }

    # -- R5.7: a Super_Admin is permitted every read --

    @HYPOTHESIS_SETTINGS
    @given(endpoint_key=_APP_ENDPOINT_KEYS)
    def test_super_admin_permitted_on_every_school(self, endpoint_key, production_scope):
        """A Super_Admin reads any school's application on every audited endpoint
        without a 404 mask (R5.7)."""
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        client = _client_for(build_profile(role="super_admin"))
        template = _APP_GET_ENDPOINTS[endpoint_key]

        for world in (world_a, world_b):
            status_code, body = _read(client, "app", template, world.application_id)
            _assert_permitted(f"{endpoint_key}@{world.institution_id}", status_code, body)

    @HYPOTHESIS_SETTINGS
    @given(endpoint_key=_DOC_ENDPOINT_KEYS)
    def test_super_admin_permitted_on_every_document(self, endpoint_key, production_scope):
        """A Super_Admin reads any school's document across the auth seam
        (R5.7)."""
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        client = _client_for(build_profile(role="super_admin"))
        template = _DOC_ENDPOINTS[endpoint_key]

        for world in (world_a, world_b):
            doc = build_document(application=world.application)
            status_code, body = _read(client, "doc", template, str(doc.id))
            _assert_permitted(f"{endpoint_key}@{world.institution_id}", status_code, body)
