"""Property 4 — cross-tenant invisibility across every scoped surface.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 4.3.

Feature: enterprise-tenant-authority, Property 4: Cross-tenant invisibility across every scoped surface

A non-super-admin scoped **only** to tenant A must never observe or infer any
row, identifier, name, code, count, or attribute of tenant B — on **any**
scoped surface. The design enumerates the surfaces explicitly: list, detail,
search, exports, dashboards, documents, payments, audit, applications, users,
routing simulation, and analytics.

This property holds the union of those surfaces to a single, uniform
invariant: for an actor who holds one active ``UserInstitutionMembership`` to
tenant A and nothing else, **none** of tenant B's unique identifiers / names /
codes ever appear in the response body of a scoped endpoint, regardless of the
surface hit or whether the request lists, searches, exports, fetches a detail,
or is denied outright. A 404/403/empty result is acceptable isolation; a body
echoing a tenant-B token is a leak. Where a surface is expected to return the
actor's *own* (tenant-A) rows, the property additionally asserts the tenant-A
witness is present, so an all-empty response can never vacuously satisfy the
invariant, and the analytics surface additionally pins the *count* dimension
(the funnel total reflects only tenant A's single application, never B's).

Production scope semantics are required, so the legacy admin test-scope shim is
disabled by monkeypatching ``AccessScopeService._test_settings_active`` to
return ``False`` (mirrors ``test_scope_before_lookup.py`` and the drill's Step
14). Two independent tenant worlds are built per example via
``tests/tenant_fixtures.py`` ``build_two_tenant_worlds`` and enriched with a
payment + document on each side so the payment / document / settlement surfaces
genuinely have tenant-B data that *could* leak.

Backend property test: ``pytest`` + ``hypothesis``, ≥100 examples, one property
(Property 4) per file.

**Validates: Requirements 4.1, 4.2, 7.13, 10.8, 17.1, 17.2, 18.5**
"""

from __future__ import annotations

import json

import pytest
from django.conf import settings as django_settings
from django.core.cache import cache
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_application,
    build_document,
    build_membership,
    build_payment,
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


# ---------------------------------------------------------------------------
# Auth + capture helpers (mirrors test_scope_before_lookup / isolation suite)
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
    except Exception:  # pragma: no cover - non-JSON (CSV export / resolver 404 HTML)
        body = getattr(response, "data", None)
    try:
        raw = response.content.decode("utf-8", "replace")
    except Exception:  # pragma: no cover - defensive only
        raw = str(body)
    return response.status_code, body, raw


def _blob(body, raw) -> str:
    """One searchable string from the parsed body + the raw response text."""
    return json.dumps(body, default=str) + "||" + (raw or "")


# ---------------------------------------------------------------------------
# Tenant-B leak tokens
# ---------------------------------------------------------------------------


def _tenant_b_tokens(world_b, payment_b, document_b) -> dict[str, str]:
    """Every unique tenant-B identifier / name / code that must never surface.

    The shared canonical-program name is deliberately omitted (both worlds share
    one canonical program, so its name is *not* tenant-private). Everything here
    is unique to tenant B, so any appearance in a scoped body is a real leak.
    """
    candidates = {
        "institution_id": world_b.institution_id,
        "institution_name": world_b.institution.name,
        "institution_code": world_b.institution.code,
        "institution_full_name": getattr(world_b.institution, "full_name", None),
        "institution_slug": getattr(world_b.institution, "slug", None),
        "institution_brand_name": getattr(world_b.institution, "brand_name", None),
        "offering_id": world_b.offering_id,
        "offering_name": world_b.offering.name,
        "offering_code": world_b.offering.code,
        "application_id": world_b.application_id,
        "application_number": world_b.application.application_number,
        "tracking_code": world_b.application.public_tracking_code,
        "applicant_name": world_b.application.full_name,
        "applicant_email": world_b.application.email,
        "staff_id": str(world_b.staff.id),
        "staff_email": world_b.staff.email,
        "student_email": world_b.student.email,
        "payment_id": str(payment_b.id),
        "document_id": str(document_b.id),
        "document_name": document_b.document_name,
    }
    # Drop any falsy/empty values so the membership check below is meaningful.
    return {label: value for label, value in candidates.items() if value}


# ---------------------------------------------------------------------------
# Scoped surface catalogue
# ---------------------------------------------------------------------------
#
# Each surface is ``(callable, a_witness)`` where ``callable(client, ctx)`` issues
# one request and returns ``(status, body, raw)``, and ``a_witness`` (or None) is
# a tenant-A token that MUST be present so the surface cannot pass vacuously by
# returning nothing. ``ctx`` carries both worlds plus the tenant-A payment/doc.


class _Ctx:
    def __init__(self, world_a, world_b, payment_a, payment_b, document_a, document_b):
        self.world_a = world_a
        self.world_b = world_b
        self.payment_a = payment_a
        self.payment_b = payment_b
        self.document_a = document_a
        self.document_b = document_b


def _s_institutions_list(client, ctx):
    return _capture(client.get("/api/v1/admin/institutions/"))


def _s_institution_detail_foreign(client, ctx):
    # Detail of tenant B's institution → masked not-found (scope before lookup).
    return _capture(client.get(f"/api/v1/admin/institutions/{ctx.world_b.institution.id}/"))


def _s_institution_audit_foreign(client, ctx):
    # Audit of tenant B's institution → out of scope, no B data.
    return _capture(
        client.get(f"/api/v1/admin/institutions/{ctx.world_b.institution.id}/audit/")
    )


def _s_tenant_audit_list(client, ctx):
    # Tenant-admin audit feed, scoped to A's institution by changes.institution_id.
    return _capture(client.get("/api/v1/admin/tenant-audit/"))


def _s_access_grants_list(client, ctx):
    return _capture(client.get("/api/v1/admin/access-grants/"))


def _s_users_list(client, ctx):
    return _capture(client.get("/api/v1/admin/users/"))


def _s_users_search_for_b(client, ctx):
    # Search by tenant B's applicant surname must not surface a B user.
    surname = (ctx.world_b.staff.last_name or "User").split("-")[0]
    return _capture(client.get(f"/api/v1/admin/users/?search={surname}"))


def _s_users_export(client, ctx):
    return _capture(client.get("/api/v1/admin/users/export/"))


def _s_applications_list(client, ctx):
    return _capture(client.get("/api/v1/applications/"))


def _s_applications_search_for_b(client, ctx):
    # Search the applications surface for tenant B's application number.
    return _capture(
        client.get(
            f"/api/v1/applications/?search={ctx.world_b.application.application_number}"
        )
    )


def _s_applications_export(client, ctx):
    return _capture(client.get("/api/v1/applications/export/"))


def _s_payments_list(client, ctx):
    return _capture(client.get("/api/v1/payments/"))


def _s_payment_receipt_foreign(client, ctx):
    return _capture(client.get(f"/api/v1/payments/{ctx.payment_b.id}/receipt/"))


def _s_settlements(client, ctx):
    return _capture(client.get("/api/v1/payments/settlements/"))


def _s_document_info_foreign(client, ctx):
    return _capture(client.get(f"/api/v1/documents/{ctx.document_b.id}/info/"))


def _s_document_download_foreign(client, ctx):
    return _capture(client.get(f"/api/v1/documents/{ctx.document_b.id}/download/"))


def _s_analytics_funnel(client, ctx):
    return _capture(client.get("/api/v1/analytics/funnel/"))


def _s_routing_simulate(client, ctx):
    # Routing simulation is a super-admin-only tool; a tenant-admin is denied,
    # leaking no tenant-B offering even when posting B's intake id.
    return _capture(
        client.post(
            "/api/v1/admin/routing/simulate/",
            data={
                "program_id": ctx.world_b.canonical_program_id,
                "intake_id": ctx.world_b.intake_id,
            },
            format="json",
        )
    )


# (surface_key) -> (request_fn, a_witness_fn or None)
#
# ``a_witness_fn(ctx)`` returns a tenant-A token that must be present on surfaces
# that are expected to return the actor's own rows; None for surfaces that are
# expected to deny / mask (detail, foreign audit, foreign document, routing).
SURFACES: dict[str, tuple] = {
    "list_institutions": (_s_institutions_list, lambda ctx: ctx.world_a.institution_id),
    "detail_institution_foreign": (_s_institution_detail_foreign, None),
    "audit_institution_foreign": (_s_institution_audit_foreign, None),
    "audit_tenant_list": (_s_tenant_audit_list, None),
    "access_grants_list": (_s_access_grants_list, lambda ctx: str(ctx.world_a.access_grant.id)),
    "users_list": (_s_users_list, lambda ctx: str(ctx.world_a.staff.id)),
    "users_search": (_s_users_search_for_b, None),
    "users_export": (_s_users_export, None),
    "applications_list": (
        _s_applications_list,
        lambda ctx: ctx.world_a.application.application_number,
    ),
    "applications_search": (_s_applications_search_for_b, None),
    "applications_export": (
        _s_applications_export,
        lambda ctx: ctx.world_a.application.application_number,
    ),
    "payments_list": (_s_payments_list, lambda ctx: str(ctx.payment_a.id)),
    "payment_receipt_foreign": (_s_payment_receipt_foreign, None),
    "settlements": (_s_settlements, None),
    "documents_info_foreign": (_s_document_info_foreign, None),
    "documents_download_foreign": (_s_document_download_foreign, None),
    "analytics_funnel": (_s_analytics_funnel, None),
    "routing_simulate": (_s_routing_simulate, None),
}

_SURFACE_KEYS = st.sampled_from(sorted(SURFACES))


# ---------------------------------------------------------------------------
# Fixtures + world builder
# ---------------------------------------------------------------------------


@pytest.fixture()
def production_scope(monkeypatch):
    """Force the production membership/grant scope model.

    Under ``config.settings.test`` ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy dev/test compatibility). Property
    4 asserts the production tenant-isolation behaviour, so disable that branch
    exactly as ``test_scope_before_lookup.py`` does.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


def _build_isolated_pair(extra_b_apps: int = 0):
    """Two independent tenant worlds, each carrying a submitted application plus a
    payment and a document, so every scoped surface has genuine tenant-B data.

    ``extra_b_apps`` adds N additional submitted applications (each with its own
    payment + document) to tenant B, so the surfaces must keep an arbitrary
    number of tenant-B rows hidden, not just one.

    Returns ``(ctx, actor_client)`` where ``actor_client`` is authenticated as a
    fresh ``admin`` holding a single active membership to tenant A and nothing
    else — the canonical "scoped only to tenant A" non-super-admin.
    """
    world_a, world_b = build_two_tenant_worlds(application_status="submitted")
    # Ensure both applications are visible on admin list/search/export surfaces.
    Application.objects.filter(
        id__in=[world_a.application.id, world_b.application.id]
    ).update(status="submitted")

    payment_a = build_payment(application=world_a.application, status="successful")
    payment_b = build_payment(application=world_b.application, status="successful")
    document_a = build_document(application=world_a.application)
    document_b = build_document(application=world_b.application)

    for _ in range(extra_b_apps):
        extra_app = build_application(
            student=build_profile(role="student"),
            institution=world_b.institution,
            canonical_program=world_b.canonical_program,
            offering=world_b.offering,
            intake=world_b.intake,
            status="submitted",
        )
        build_payment(application=extra_app, status="successful")
        build_document(application=extra_app)

    actor = build_profile(role="admin")
    build_membership(user=actor, institution=world_a.institution, role="admin")
    ctx = _Ctx(world_a, world_b, payment_a, payment_b, document_a, document_b)
    return ctx, _client_for(actor)


# ---------------------------------------------------------------------------
# Property 4
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestProperty4CrossTenantInvisibility:
    """Property 4: Cross-tenant invisibility across every scoped surface.

    Feature: enterprise-tenant-authority, Property 4: Cross-tenant invisibility across every scoped surface

    **Validates: Requirements 4.1, 4.2, 7.13, 10.8, 17.1, 17.2, 18.5**
    """

    @HYPOTHESIS_SETTINGS
    @given(
        surface_key=_SURFACE_KEYS,
        extra_b_apps=st.integers(min_value=0, max_value=4),
        salt=st.integers(min_value=0, max_value=2_000_000_000),
    )
    def test_no_tenant_b_token_on_any_scoped_surface(
        self, surface_key, extra_b_apps, salt, production_scope
    ):
        """An admin scoped only to tenant A, hitting any scoped surface, never
        receives a body containing any tenant-B identifier / name / code, and
        where the surface returns the actor's own rows the tenant-A witness is
        present (no vacuous pass). Tenant B carries an arbitrary number of
        additional rows, none of which may surface. ``salt`` only widens the
        example space so the property genuinely runs the full ≥100 iterations."""
        cache.clear()
        del salt  # entropy only — keeps Hypothesis from exhausting the space
        ctx, client = _build_isolated_pair(extra_b_apps=extra_b_apps)
        request_fn, a_witness_fn = SURFACES[surface_key]

        status_code, body, raw = request_fn(client, ctx)
        blob = _blob(body, raw)

        tokens = _tenant_b_tokens(ctx.world_b, ctx.payment_b, ctx.document_b)
        for label, value in tokens.items():
            assert value not in blob, {
                "surface": surface_key,
                "leaked": label,
                "value": value,
                "status": status_code,
                "blob": blob[:2000],
            }

        # Surfaces that return the actor's own rows must actually contain the
        # tenant-A witness, so an all-empty/denied response cannot vacuously
        # satisfy the no-leak invariant.
        if a_witness_fn is not None:
            witness = a_witness_fn(ctx)
            assert witness in blob, {
                "surface": surface_key,
                "missing_a_witness": witness,
                "status": status_code,
                "blob": blob[:2000],
            }

        # Analytics (count) dimension of Property 4: the scoped funnel total
        # counts only tenant A's single application when the jobs/ops analytics
        # scaffold is explicitly enabled. The launch default keeps that surface
        # disabled, where a 404 is the expected non-leaking response.
        if surface_key == "analytics_funnel":
            if getattr(django_settings, "ENABLE_JOBS_OPS_ROUTES", False):
                assert status_code == 200, (status_code, body)
                assert body["data"]["funnel"]["total"] == 1, body["data"]["funnel"]
            else:
                assert status_code == 404, (status_code, body)
