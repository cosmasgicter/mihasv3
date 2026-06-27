"""Regression test — no route/filename/envelope drift on the NEW tenant surfaces.

The Beanola multi-tenant conversion (spec ``multi-tenant-beanola-admissions``)
adds tenant/catalog routes under ``/api/v1/catalog/`` and ``/api/v1/admin/``,
backend official-document generation, and tenant-scoped settlement + audit
endpoints. R12 requires the conversion to be *additive and backward
compatible*: every new authenticated list endpoint must keep the
``{"success": true, "data": ...}`` envelope (never a raw list), cookie auth +
CSRF must stay intact on state-changing tenant endpoints, and the canonical
routes must keep resolving to their canonical view classes.

This file is the contract-preservation guard for those NEW routes, mirroring
``test_payment_api_contract_preservation.py`` for the payment surface. It locks
in three things:

* **URL resolution** — each canonical tenant/catalog/official-document/
  settlement/audit path still resolves to its canonical view class.
* **Envelope shape** — authenticated list endpoints return a
  ``{"success": bool, "data": ...}`` dict envelope, and paginated lists nest
  ``{page, pageSize, totalCount, results}`` inside ``data`` — never a raw list.
* **CSRF enforcement** — cookie-authenticated state-changing tenant endpoints
  reject a request with no CSRF token (R12.2), while a cookie-authenticated
  GET (non-state-changing) is not blocked by CSRF.

Validates: Requirements R12.1, R12.2, R12.6
"""

from __future__ import annotations

import uuid

import pytest
from django.conf import settings
from django.test import override_settings
from django.urls import resolve
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.accounts.tokens import generate_access_token

# New tenant/catalog view classes
from apps.catalog.views import (
    AssignmentPreviewView,
    CanonicalProgramListView,
    CatalogContextView,
    InstitutionDetailView,
    InstitutionListCreateView,
    IntakeDetailView,
    IntakeListCreateView,
    ProgramDetailView,
    ProgramListCreateView,
    SubjectListView,
)
from apps.catalog.admin_views import (
    AdminAccessGrantDetailView,
    AdminAccessGrantListCreateView,
    AdminInstitutionAuditView,
    AdminMembershipDetailView,
    AdminMembershipListCreateView,
    AdminRoutingSimulateView,
    AdminTenantAssetDetailView,
    AdminTenantAssetListCreateView,
    AdminTenantAssetUploadView,
    AdminTenantAuditView,
    AdminTenantDetailView,
    AdminTenantDomainDetailView,
    AdminTenantDomainListCreateView,
    AdminTenantListCreateView,
    AdminTenantProgramDetailView,
    AdminTenantProgramListView,
    AdminTenantReadinessView,
    AdminTenantRequiredDocumentDetailView,
    AdminTenantRequiredDocumentListCreateView,
    AdminTenantTemplateDetailView,
    AdminTenantTemplateListCreateView,
)

# Official-document generation view classes
from apps.applications.views import (
    AcceptanceLetterView,
    ApplicationSlipView,
    ConditionalOfferView,
    FinanceReceiptView,
)

# Tenant-scoped settlement summary
from apps.documents.payment_query_views import PaymentSettlementSummaryView


# ---------------------------------------------------------------------------
# Test 1 — URL resolution: new paths must resolve to the expected view classes
# ---------------------------------------------------------------------------
#
# A rename or accidental re-route of any of these surfaces (catalog,
# tenant-admin, official document, settlement, audit) is route drift and must
# trip this guard. Locks in the CURRENT class names; an intentional rename
# should update views, urls, and this assertion together.


@pytest.mark.parametrize(
    "path,expected_view_class",
    [
        # Catalog (program-first) surfaces
        ("/api/v1/catalog/context/", CatalogContextView),
        ("/api/v1/catalog/canonical-programs/", CanonicalProgramListView),
        ("/api/v1/catalog/assignment-preview/", AssignmentPreviewView),
        ("/api/v1/catalog/programs/", ProgramListCreateView),
        (f"/api/v1/catalog/programs/{uuid.uuid4()}/", ProgramDetailView),
        ("/api/v1/catalog/intakes/", IntakeListCreateView),
        (f"/api/v1/catalog/intakes/{uuid.uuid4()}/", IntakeDetailView),
        ("/api/v1/catalog/subjects/", SubjectListView),
        ("/api/v1/catalog/institutions/", InstitutionListCreateView),
        (f"/api/v1/catalog/institutions/{uuid.uuid4()}/", InstitutionDetailView),
        # Tenant onboarding / configuration surfaces
        ("/api/v1/admin/institutions/", AdminTenantListCreateView),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/",
            AdminTenantDetailView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/readiness/",
            AdminTenantReadinessView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/domains/",
            AdminTenantDomainListCreateView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/domains/{uuid.uuid4()}/",
            AdminTenantDomainDetailView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/programs/",
            AdminTenantProgramListView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/programs/{uuid.uuid4()}/",
            AdminTenantProgramDetailView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/assets/",
            AdminTenantAssetListCreateView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/assets/upload/",
            AdminTenantAssetUploadView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/assets/{uuid.uuid4()}/",
            AdminTenantAssetDetailView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/templates/",
            AdminTenantTemplateListCreateView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/templates/{uuid.uuid4()}/",
            AdminTenantTemplateDetailView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/required-documents/",
            AdminTenantRequiredDocumentListCreateView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/required-documents/{uuid.uuid4()}/",
            AdminTenantRequiredDocumentDetailView,
        ),
        (
            f"/api/v1/admin/institutions/{uuid.uuid4()}/audit/",
            AdminInstitutionAuditView,
        ),
        ("/api/v1/admin/memberships/", AdminMembershipListCreateView),
        (
            f"/api/v1/admin/memberships/{uuid.uuid4()}/",
            AdminMembershipDetailView,
        ),
        ("/api/v1/admin/access-grants/", AdminAccessGrantListCreateView),
        (
            f"/api/v1/admin/access-grants/{uuid.uuid4()}/",
            AdminAccessGrantDetailView,
        ),
        ("/api/v1/admin/routing/simulate/", AdminRoutingSimulateView),
        ("/api/v1/admin/tenant-audit/", AdminTenantAuditView),
        # Backend official-document generation surfaces
        (
            f"/api/v1/applications/{uuid.uuid4()}/application-slip/",
            ApplicationSlipView,
        ),
        (
            f"/api/v1/applications/{uuid.uuid4()}/acceptance-letter/",
            AcceptanceLetterView,
        ),
        (
            f"/api/v1/applications/{uuid.uuid4()}/conditional-offer/",
            ConditionalOfferView,
        ),
        (
            f"/api/v1/applications/{uuid.uuid4()}/finance-receipt/",
            FinanceReceiptView,
        ),
        # Tenant-scoped settlement summary
        ("/api/v1/payments/settlements/", PaymentSettlementSummaryView),
    ],
    ids=[
        "catalog-context",
        "catalog-canonical-programs",
        "catalog-assignment-preview",
        "catalog-programs",
        "catalog-program-detail",
        "catalog-intakes",
        "catalog-intake-detail",
        "catalog-subjects",
        "catalog-institutions",
        "catalog-institution-detail",
        "admin-institutions",
        "admin-institution-detail",
        "admin-institution-readiness",
        "admin-institution-domains",
        "admin-institution-domain-detail",
        "admin-institution-programs",
        "admin-institution-program-detail",
        "admin-institution-assets",
        "admin-institution-asset-upload",
        "admin-institution-asset-detail",
        "admin-institution-templates",
        "admin-institution-template-detail",
        "admin-institution-required-documents",
        "admin-institution-required-document-detail",
        "admin-institution-audit",
        "admin-memberships",
        "admin-membership-detail",
        "admin-access-grants",
        "admin-access-grant-detail",
        "admin-routing-simulate",
        "admin-tenant-audit",
        "official-application-slip",
        "official-acceptance-letter",
        "official-conditional-offer",
        "official-finance-receipt",
        "payments-settlements",
    ],
)
def test_tenant_urls_resolve_to_expected_view_classes(path, expected_view_class):
    """Each canonical tenant/catalog/document/settlement URL still resolves to
    its canonical view class.

    Validates: Requirements R12.1, R12.6
    """
    match = resolve(path)
    actual_view_class = getattr(match.func, "view_class", None)
    assert actual_view_class is expected_view_class, (
        f"{path} should resolve to {expected_view_class.__name__}, "
        f"got {actual_view_class.__name__ if actual_view_class else match.func!r}"
    )


# ---------------------------------------------------------------------------
# Envelope-shape helpers
# ---------------------------------------------------------------------------


def _assert_envelope_shape(body, *, path: str) -> None:
    """Assert the response body is a ``{"success", ...}`` dict envelope.

    A raw list (or any non-dict) is exactly the drift R12.1 forbids for
    authenticated list endpoints, so the first assertion is the load-bearing
    one.
    """
    assert isinstance(body, dict), (
        f"{path}: response body must be a dict envelope (never a raw list), "
        f"got {type(body).__name__}: {body!r}"
    )
    assert "success" in body, (
        f"{path}: response body missing 'success' key; got keys={list(body.keys())}"
    )
    assert isinstance(body["success"], bool), (
        f"{path}: 'success' must be a bool, got {type(body['success']).__name__}"
    )
    if body["success"] is True:
        assert "data" in body, (
            f"{path}: success response missing 'data' key; keys={list(body.keys())}"
        )
    else:
        assert "error" in body and "code" in body, (
            f"{path}: error response missing 'error'/'code'; keys={list(body.keys())}"
        )


def _assert_paginated_envelope(body, *, path: str) -> None:
    """Assert a paginated list response nests page/pageSize/totalCount/results
    inside ``data`` (R12.1)."""
    _assert_envelope_shape(body, path=path)
    assert body["success"] is True, f"{path}: expected success envelope, got {body!r}"
    data = body["data"]
    assert isinstance(data, dict), (
        f"{path}: paginated 'data' must be a dict, got {type(data).__name__}: {data!r}"
    )
    for key in ("page", "pageSize", "totalCount", "results"):
        assert key in data, (
            f"{path}: paginated 'data' missing '{key}'; got keys={list(data.keys())}"
        )
    assert isinstance(data["results"], list), (
        f"{path}: paginated 'results' must be a list, got {type(data['results']).__name__}"
    )


def _super_admin() -> JWTUser:
    return JWTUser(
        {
            "user_id": str(uuid.uuid4()),
            "email": "tenant-contract@example.test",
            "role": "super_admin",
            "first_name": "Tenant",
            "last_name": "Contract",
            "token_type": "access",
        }
    )


# ---------------------------------------------------------------------------
# Test 2 — Authenticated list endpoints keep the envelope (never a raw list)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_admin_institution_list_preserves_paginated_envelope():
    """GET /api/v1/admin/institutions/ returns the paginated envelope.

    Validates: Requirements R12.1, R12.6
    """
    factory = APIRequestFactory()
    request = factory.get("/api/v1/admin/institutions/")
    force_authenticate(request, user=_super_admin())
    response = AdminTenantListCreateView.as_view()(request)

    assert response.status_code == 200, (response.status_code, response.data)
    _assert_paginated_envelope(response.data, path="/api/v1/admin/institutions/")


@pytest.mark.django_db
def test_admin_tenant_audit_preserves_paginated_envelope():
    """GET /api/v1/admin/tenant-audit/ returns the paginated envelope.

    Validates: Requirements R12.1, R12.6
    """
    factory = APIRequestFactory()
    request = factory.get("/api/v1/admin/tenant-audit/")
    force_authenticate(request, user=_super_admin())
    response = AdminTenantAuditView.as_view()(request)

    assert response.status_code == 200, (response.status_code, response.data)
    _assert_paginated_envelope(response.data, path="/api/v1/admin/tenant-audit/")


@pytest.mark.django_db
def test_settlement_summary_preserves_envelope():
    """GET /api/v1/payments/settlements/ returns a ``{success, data}`` envelope
    with ``results`` nested inside ``data`` (never a raw list).

    Validates: Requirements R12.1, R12.6
    """
    factory = APIRequestFactory()
    request = factory.get("/api/v1/payments/settlements/")
    force_authenticate(request, user=_super_admin())
    response = PaymentSettlementSummaryView.as_view()(request)

    assert response.status_code == 200, (response.status_code, response.data)
    _assert_envelope_shape(response.data, path="/api/v1/payments/settlements/")
    assert response.data["success"] is True
    assert isinstance(response.data["data"], dict)
    assert isinstance(response.data["data"].get("results"), list), (
        "settlement summary 'data.results' must be a list, not a raw payload"
    )


@pytest.mark.django_db
def test_catalog_context_preserves_envelope():
    """GET /api/v1/catalog/context/ returns the standard envelope.

    Validates: Requirements R12.1, R12.6
    """
    factory = APIRequestFactory()
    request = factory.get("/api/v1/catalog/context/")
    response = CatalogContextView.as_view()(request)

    assert response.status_code == 200, (response.status_code, response.data)
    _assert_envelope_shape(response.data, path="/api/v1/catalog/context/")


@pytest.mark.django_db
def test_canonical_programs_list_preserves_envelope():
    """GET /api/v1/catalog/canonical-programs/ returns an envelope (never a raw
    list) — paginated for the empty/seeded list case.

    Validates: Requirements R12.1, R12.6
    """
    factory = APIRequestFactory()
    request = factory.get("/api/v1/catalog/canonical-programs/")
    response = CanonicalProgramListView.as_view()(request)

    assert response.status_code == 200, (response.status_code, response.data)
    _assert_paginated_envelope(
        response.data, path="/api/v1/catalog/canonical-programs/"
    )


# ---------------------------------------------------------------------------
# Test 3 — CSRF stays enforced on state-changing tenant endpoints (R12.2)
# ---------------------------------------------------------------------------
#
# CSRF is validated at the ``JWTCookieAuthentication`` layer for cookie-sourced
# tokens on state-changing methods. A cookie-authenticated POST/PATCH with no
# ``X-CSRF-Token`` header must be rejected (403, CSRF_* code) BEFORE the view
# body runs — so tenant configuration can never be mutated cross-site. We drive
# the full middleware + auth stack via APIClient with a real signed access
# cookie (force_authenticate would bypass the cookie CSRF path).


def _cookie_authed_client(role: str = "super_admin") -> APIClient:
    """An APIClient carrying a real signed ``access_token`` cookie.

    Going through the cookie (not ``force_authenticate``) is what exercises the
    ``JWTCookieAuthentication._enforce_csrf`` path that R12.2 protects.

    Must be called inside the ``_CSRF_SIGNING`` override so the token is signed
    with the same key the auth layer decodes with (the bare ``dev`` settings
    leave ``SIMPLE_JWT['SIGNING_KEY']`` empty).
    """
    user = JWTUser(
        {
            "user_id": str(uuid.uuid4()),
            "email": f"{role}-csrf@example.test",
            "role": role,
            "first_name": "Csrf",
            "last_name": "Guard",
            "token_type": "access",
        }
    )
    token = generate_access_token(user)
    client = APIClient()
    client.cookies["access_token"] = token
    return client


# Align the JWT signing key for encode (generate_access_token) and decode
# (JWTCookieAuthentication): the bare ``config.settings.dev`` test settings
# leave ``SIMPLE_JWT['SIGNING_KEY']`` empty, so without this override the auth
# layer reports AUTH_SERVICE_ERROR (401) before CSRF can be evaluated.
_CSRF_SIGNING = {**settings.SIMPLE_JWT, "SIGNING_KEY": "tenant-contract-csrf-signing-key"}


@pytest.mark.django_db
@override_settings(SIMPLE_JWT=_CSRF_SIGNING)
@pytest.mark.parametrize(
    "path,payload",
    [
        ("/api/v1/admin/institutions/", {"name": "X", "code": "X"}),
        ("/api/v1/admin/memberships/", {"user_id": str(uuid.uuid4())}),
        ("/api/v1/admin/access-grants/", {"user_id": str(uuid.uuid4())}),
        (
            "/api/v1/admin/routing/simulate/",
            {"program_id": str(uuid.uuid4()), "intake_id": str(uuid.uuid4())},
        ),
    ],
    ids=[
        "institutions-create",
        "memberships-create",
        "access-grants-create",
        "routing-simulate",
    ],
)
def test_state_changing_tenant_endpoints_enforce_csrf(path, payload):
    """A cookie-authenticated POST with no CSRF token is rejected (R12.2).

    The rejection must be a 403 with a CSRF stable code and must fire before
    any tenant data is written.

    Validates: Requirements R12.2
    """
    client = _cookie_authed_client()
    response = client.post(path, payload, format="json")

    assert response.status_code == 403, (
        f"{path}: cookie-authed state-changing request with no CSRF token must "
        f"be rejected with 403; got {response.status_code}: {response.content!r}"
    )
    body = response.json()
    assert isinstance(body, dict)
    code = body.get("code") or (body.get("error") or {}).get("code")
    assert code in ("CSRF_MISSING", "CSRF_INVALID"), (
        f"{path}: expected a CSRF stable code, got body={body!r}"
    )


@pytest.mark.django_db
@override_settings(SIMPLE_JWT=_CSRF_SIGNING)
def test_cookie_authed_get_is_not_blocked_by_csrf():
    """A cookie-authenticated GET (non-state-changing) is NOT CSRF-blocked.

    Confirms the CSRF guard is scoped to state-changing methods only, so the
    read path of the tenant surfaces stays usable with cookie auth.

    Validates: Requirements R12.2
    """
    client = _cookie_authed_client()
    response = client.get("/api/v1/admin/institutions/")

    assert response.status_code == 200, (
        "cookie-authed GET must not be CSRF-blocked; "
        f"got {response.status_code}: {response.content!r}"
    )
    _assert_paginated_envelope(response.json(), path="/api/v1/admin/institutions/")


# ---------------------------------------------------------------------------
# Test 4 — Catalog public list endpoints keep the envelope (never a raw list)
# ---------------------------------------------------------------------------
#
# The program-first catalog list surfaces (programs/intakes/institutions) are
# public-readable. R12.1 still requires the dict envelope (never a raw list) on
# every list endpoint, so a refactor that returns a bare ``[...]`` payload here
# is exactly the drift this guard catches.


@pytest.mark.django_db
@pytest.mark.parametrize(
    "path,view_class",
    [
        ("/api/v1/catalog/programs/", ProgramListCreateView),
        ("/api/v1/catalog/intakes/", IntakeListCreateView),
        ("/api/v1/catalog/institutions/", InstitutionListCreateView),
        ("/api/v1/catalog/subjects/", SubjectListView),
    ],
    ids=["programs", "intakes", "institutions", "subjects"],
)
def test_catalog_list_endpoints_preserve_envelope(path, view_class):
    """GET catalog list endpoints return a ``{success, data}`` dict envelope.

    The body must never be a raw list; ``data`` (or its nested ``results``) is
    where the payload lives.

    Validates: Requirements R12.1, R12.6
    """
    factory = APIRequestFactory()
    request = factory.get(path)
    response = view_class.as_view()(request)

    assert response.status_code == 200, (response.status_code, response.data)
    _assert_envelope_shape(response.data, path=path)
    assert response.data["success"] is True, (
        f"{path}: expected success envelope, got {response.data!r}"
    )
    # The payload is either a paginated dict ({page,...,results}) or a dict
    # whose values carry the list — never a bare top-level list (R12.1).
    assert isinstance(response.data["data"], (dict, list)), (
        f"{path}: 'data' must be a dict or list inside the envelope, "
        f"got {type(response.data['data']).__name__}"
    )


# ---------------------------------------------------------------------------
# Test 5 — Settlement CSV export stays a text/csv attachment (R7.4 contract)
# ---------------------------------------------------------------------------
#
# The settlement summary endpoint has a documented dual contract:
#   * default (JSON) → the ``{success, data:{results,...}}`` envelope (Test 2);
#   * ``?export=csv`` → a ``text/csv`` file *attachment* (NOT the JSON
#     envelope), reusing the exact same tenant-scoped grouping path.
# Locking the CSV variant in guards against (a) a refactor that drops the
# operational file download and (b) one that accidentally wraps the CSV bytes
# in the JSON envelope. The CSV branch is intentionally exempt from the
# envelope rule because it is a file download, not a list endpoint.


@pytest.mark.django_db
def test_settlement_summary_csv_export_stays_text_csv_attachment():
    """GET /api/v1/payments/settlements/?export=csv downloads a CSV attachment.

    The CSV variant must keep its ``text/csv`` content type and
    ``Content-Disposition: attachment`` header, and the header row must carry
    the canonical settlement columns — proving the tenant-scoped grouping is
    surfaced as a file without leaking the JSON envelope contract.

    Validates: Requirements R12.1, R7.4
    """
    factory = APIRequestFactory()
    request = factory.get("/api/v1/payments/settlements/", {"export": "csv"})
    force_authenticate(request, user=_super_admin())
    response = PaymentSettlementSummaryView.as_view()(request)

    assert response.status_code == 200, (response.status_code, response)
    content_type = response.get("Content-Type", "")
    assert content_type.startswith("text/csv"), (
        f"settlement CSV export must be text/csv, got {content_type!r}"
    )
    disposition = response.get("Content-Disposition", "")
    assert "attachment" in disposition and ".csv" in disposition, (
        "settlement CSV export must be a downloadable .csv attachment, "
        f"got Content-Disposition={disposition!r}"
    )
    # Header row carries the canonical columns shared with the JSON grouping.
    body = response.content.decode("utf-8")
    first_line = body.splitlines()[0] if body else ""
    for column in ("institution_id", "institution_name", "currency"):
        assert column in first_line, (
            f"settlement CSV header missing '{column}'; got header={first_line!r}"
        )
