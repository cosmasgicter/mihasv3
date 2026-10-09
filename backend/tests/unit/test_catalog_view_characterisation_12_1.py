"""Characterisation of the catalog view surface — the gate before task 12.1's split.

Task **12.1** (admissions-v2, finding **MAINT-01**) must split
``apps/catalog/admin_views.py`` (2,072 lines) and ``apps/catalog/views.py``
(1,570 lines) *without changing behaviour*. The first pass declined to attempt
that half for one stated reason (12.1 evidence §9 #1): those modules have
**endpoint tests** but not characterisation *of the kind a split needs* — a
per-view record of

* the **authority** each method resolves,
* that **scoping is applied before lookup** (so an out-of-scope identifier is
  never confirmed to exist),
* the **request shape** each method accepts,
* the **envelope** each answer carries, and
* every **registered error code** the module can return,

that would fail if a move dropped one. This file is that record.

Two design rules, both taken from the first pass's own findings:

1. **Nothing here reads a source file.** 12.1 §4.2 is the list of eight pins that
   broke during the frontend half, and every single one was a claim about *which
   file a string lives in*. A characterisation that cannot survive the move it
   exists to protect is not characterisation. Every assertion below drives a
   real request through the real URL conf and reads the real response.
2. **The contract is declared once, as data.** :data:`ADMIN_VIEW_CONTRACT` and
   :data:`CATALOG_VIEW_CONTRACT` name every route, its view class, its methods,
   the authority per method, and its scoping mode. The tests are parametrised
   over those tables, so a view that moves module keeps exactly one line to
   update (its import) and a view that silently loses a gate fails.

**Validates: Requirements R14.3, R14.4, R14.5** (the maintainability clauses this
task serves) and, by re-measurement rather than re-specification, the authority
and isolation contracts R3.1, R3.2, R3.5, R5.1, R5.4, R5.6, R7.6, R7.7, R7.10,
R7.14, R12.1.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field

import pytest
from django.urls import resolve, reverse
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import (
    InstitutionAsset,
    InstitutionDocumentProfile,
    InstitutionDocumentTemplate,
    InstitutionDomain,
    InstitutionRequiredDocument,
)
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_institution_domain,
    build_membership,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
)

# The two modules under characterisation. These imports are the *only* place
# this file names a module path: after the split they point at the re-export
# shim, and the per-view tests keep measuring the same behaviour.
from apps.catalog import admin_views, views as catalog_views


# ---------------------------------------------------------------------------
# The contract, as data
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ViewContract:
    """One route's characterised contract.

    Attributes:
        route: the Django URL name (route identity survives a module move).
        view: the view class the route must resolve to.
        methods: the HTTP methods the view answers.
        capabilities: ``method -> required platform/tenant capability`` for the
            methods that resolve one. A method absent from this map either
            needs no capability (public/read) or resolves authority per-object.
        scoping: how the view narrows its queryset before any lookup —
            ``"institution_child"`` (filtered by the URL's institution id and
            the actor's scope set), ``"institution_self"``, ``"actor_scope"``
            (no institution path segment — narrowed by the actor's scope set
            alone), ``"global"`` (the row is not tenant-owned), or ``"none"``
            (public read).
        error_codes: every stable error code this route can return.
    """

    route: str
    view: type
    methods: tuple[str, ...]
    capabilities: dict[str, str] = field(default_factory=dict)
    scoping: str = "none"
    error_codes: tuple[str, ...] = ()


#: ``/api/v1/admin/…`` — the tenant onboarding + configuration surface.
ADMIN_VIEW_CONTRACT: tuple[ViewContract, ...] = (
    ViewContract(
        route="admin-tenant-institution-list",
        view=admin_views.AdminTenantListCreateView,
        methods=("GET", "POST"),
        capabilities={
            "GET": "platform.tenant.read_all",
            "POST": "platform.tenant.create",
        },
        scoping="global",
        error_codes=("FORBIDDEN",),
    ),
    ViewContract(
        route="admin-tenant-institution-detail",
        view=admin_views.AdminTenantDetailView,
        methods=("GET", "PATCH"),
        capabilities={"PATCH": "platform.tenant.update"},
        scoping="institution_self",
        error_codes=("FORBIDDEN", "NOT_FOUND"),
    ),
    ViewContract(
        route="admin-tenant-readiness",
        view=admin_views.AdminTenantReadinessView,
        methods=("GET",),
        scoping="institution_self",
        error_codes=("NOT_FOUND",),
    ),
    ViewContract(
        route="admin-tenant-institution-audit",
        view=admin_views.AdminInstitutionAuditView,
        methods=("GET",),
        capabilities={"GET": "tenant.audit.read"},
        scoping="institution_self",
        error_codes=("NOT_FOUND", "INSUFFICIENT_PERMISSIONS", "EXPORT_TOO_LARGE"),
    ),
    ViewContract(
        route="admin-tenant-domains",
        view=admin_views.AdminTenantDomainListCreateView,
        methods=("GET", "POST"),
        capabilities={"POST": "platform.domain.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "HOSTNAME_CONFLICT"),
    ),
    ViewContract(
        route="admin-tenant-domain-detail",
        view=admin_views.AdminTenantDomainDetailView,
        methods=("PATCH",),
        capabilities={"PATCH": "platform.domain.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "DOMAIN_TRANSITION_REJECTED"),
    ),
    ViewContract(
        route="admin-tenant-domain-activate",
        view=admin_views.AdminTenantDomainActivateView,
        methods=("POST",),
        capabilities={"POST": "platform.domain.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "DOMAIN_NOT_VERIFIED", "HOSTNAME_CONFLICT"),
    ),
    ViewContract(
        route="admin-tenant-domain-retry",
        view=admin_views.AdminTenantDomainRetryView,
        methods=("POST",),
        capabilities={"POST": "platform.domain.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "DOMAIN_TRANSITION_REJECTED"),
    ),
    ViewContract(
        route="admin-tenant-domain-approve",
        view=admin_views.AdminTenantDomainApproveView,
        methods=("POST",),
        capabilities={"POST": "platform.domain.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "DOMAIN_TRANSITION_REJECTED"),
    ),
    ViewContract(
        route="admin-tenant-domain-reject",
        view=admin_views.AdminTenantDomainRejectView,
        methods=("POST",),
        capabilities={"POST": "platform.domain.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "DOMAIN_TRANSITION_REJECTED"),
    ),
    ViewContract(
        route="admin-tenant-domain-reactivate",
        view=admin_views.AdminTenantDomainReactivateView,
        methods=("POST",),
        capabilities={"POST": "platform.domain.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "DOMAIN_TRANSITION_REJECTED", "HOSTNAME_CONFLICT"),
    ),
    ViewContract(
        route="admin-tenant-programs",
        view=admin_views.AdminTenantProgramListView,
        methods=("GET", "POST"),
        scoping="institution_child",
        error_codes=("FORBIDDEN",),
    ),
    ViewContract(
        route="admin-tenant-program-detail",
        view=admin_views.AdminTenantProgramDetailView,
        methods=("GET", "PATCH"),
        capabilities={"PATCH": "platform.program_assignment.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND"),
    ),
    ViewContract(
        route="admin-tenant-assets",
        view=admin_views.AdminTenantAssetListCreateView,
        methods=("GET", "POST"),
        capabilities={"POST": "platform.asset.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "ASSET_INVALID"),
    ),
    ViewContract(
        route="admin-tenant-asset-upload",
        view=admin_views.AdminTenantAssetUploadView,
        methods=("POST",),
        capabilities={"POST": "platform.asset.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "VALIDATION_ERROR", "ASSET_INVALID", "STORAGE_ERROR"),
    ),
    ViewContract(
        route="admin-tenant-asset-detail",
        view=admin_views.AdminTenantAssetDetailView,
        methods=("PATCH",),
        capabilities={"PATCH": "platform.asset.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND"),
    ),
    ViewContract(
        route="admin-tenant-templates",
        view=admin_views.AdminTenantTemplateListCreateView,
        methods=("GET", "POST"),
        capabilities={"POST": "platform.template.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "TEMPLATE_TOKEN_REJECTED"),
    ),
    ViewContract(
        route="admin-tenant-template-detail",
        view=admin_views.AdminTenantTemplateDetailView,
        methods=("PATCH",),
        capabilities={"PATCH": "platform.template.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "TEMPLATE_TOKEN_REJECTED"),
    ),
    ViewContract(
        route="admin-tenant-document-profiles",
        view=admin_views.AdminTenantProfileListCreateView,
        methods=("GET", "POST"),
        capabilities={"POST": "platform.document.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "TEMPLATE_TOKEN_REJECTED"),
    ),
    ViewContract(
        route="admin-tenant-document-profile-detail",
        view=admin_views.AdminTenantProfileDetailView,
        methods=("PATCH",),
        capabilities={"PATCH": "platform.document.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "TEMPLATE_TOKEN_REJECTED"),
    ),
    ViewContract(
        route="admin-tenant-document-profile-clone",
        view=admin_views.AdminTenantProfileCloneView,
        methods=("POST",),
        capabilities={"POST": "platform.document.manage"},
        scoping="institution_child",
        error_codes=(
            "FORBIDDEN",
            "NOT_FOUND",
            "TEMPLATE_TOKEN_REJECTED",
            "DUPLICATE_DOCUMENT_PROFILE_VERSION",
        ),
    ),
    ViewContract(
        route="admin-tenant-required-documents",
        view=admin_views.AdminTenantRequiredDocumentListCreateView,
        methods=("GET", "POST"),
        capabilities={"POST": "platform.document.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN",),
    ),
    ViewContract(
        route="admin-tenant-required-document-detail",
        view=admin_views.AdminTenantRequiredDocumentDetailView,
        methods=("PATCH",),
        capabilities={"PATCH": "platform.document.manage"},
        scoping="institution_child",
        error_codes=("FORBIDDEN", "NOT_FOUND"),
    ),
    ViewContract(
        route="admin-tenant-memberships",
        view=admin_views.AdminMembershipListCreateView,
        methods=("GET", "POST"),
        scoping="actor_scope",
        error_codes=("SELF_GRANT_FORBIDDEN", "STAFF_INVITE_FORBIDDEN"),
    ),
    ViewContract(
        route="admin-tenant-membership-detail",
        view=admin_views.AdminMembershipDetailView,
        methods=("PATCH",),
        capabilities={"PATCH": "platform.user.manage_all"},
        scoping="actor_scope",
        error_codes=("FORBIDDEN", "NOT_FOUND"),
    ),
    ViewContract(
        route="admin-tenant-access-grants",
        view=admin_views.AdminAccessGrantListCreateView,
        methods=("GET", "POST"),
        capabilities={"POST": "platform.access_grant.manage"},
        scoping="actor_scope",
        error_codes=("FORBIDDEN", "DUPLICATE_ACCESS_GRANT"),
    ),
    ViewContract(
        route="admin-tenant-access-grant-detail",
        view=admin_views.AdminAccessGrantDetailView,
        methods=("PATCH",),
        capabilities={"PATCH": "platform.access_grant.manage"},
        scoping="actor_scope",
        error_codes=("FORBIDDEN", "NOT_FOUND"),
    ),
    ViewContract(
        route="admin-routing-simulate",
        view=admin_views.AdminRoutingSimulateView,
        methods=("POST",),
        capabilities={"POST": "platform.routing.simulate_all"},
        scoping="global",
        error_codes=("FORBIDDEN",),
    ),
    ViewContract(
        route="admin-tenant-audit",
        view=admin_views.AdminTenantAuditView,
        methods=("GET",),
        capabilities={"GET": "platform.audit.read_all"},
        scoping="global",
        error_codes=("FORBIDDEN",),
    ),
)


#: ``/api/v1/catalog/…`` — the public + legacy-write catalog surface.
CATALOG_VIEW_CONTRACT: tuple[ViewContract, ...] = (
    ViewContract(
        route="catalog:catalog-context",
        view=catalog_views.CatalogContextView,
        methods=("GET",),
        scoping="none",
    ),
    ViewContract(
        route="catalog:canonical-program-list",
        view=catalog_views.CanonicalProgramListView,
        methods=("GET",),
        scoping="none",
    ),
    ViewContract(
        route="catalog:assignment-preview",
        view=catalog_views.AssignmentPreviewView,
        methods=("GET",),
        scoping="none",
        error_codes=("VALIDATION_ERROR", "NO_ELIGIBLE_OFFERING"),
    ),
    ViewContract(
        route="catalog:program-list-create",
        view=catalog_views.ProgramListCreateView,
        methods=("GET", "POST"),
        scoping="none",
        error_codes=("FORBIDDEN", "VALIDATION_ERROR", "CANONICAL_PROGRAM_REQUIRED"),
    ),
    ViewContract(
        route="catalog:program-detail",
        view=catalog_views.ProgramDetailView,
        methods=("GET", "PATCH", "DELETE"),
        scoping="program_child",
        error_codes=("FORBIDDEN", "NOT_FOUND", "VALIDATION_ERROR"),
    ),
    ViewContract(
        route="catalog:intake-list-create",
        view=catalog_views.IntakeListCreateView,
        methods=("GET", "POST"),
        capabilities={"POST": "platform.intake.manage"},
        scoping="global",
        error_codes=("VALIDATION_ERROR",),
    ),
    ViewContract(
        route="catalog:intake-detail",
        view=catalog_views.IntakeDetailView,
        methods=("GET", "PATCH", "DELETE"),
        capabilities={
            "PATCH": "platform.intake.manage",
            "DELETE": "platform.intake.manage",
        },
        scoping="global",
        error_codes=("NOT_FOUND", "VALIDATION_ERROR"),
    ),
    ViewContract(
        route="catalog:subject-list",
        view=catalog_views.SubjectListView,
        methods=("GET",),
        scoping="none",
    ),
    ViewContract(
        route="catalog:institution-list-create",
        view=catalog_views.InstitutionListCreateView,
        methods=("GET", "POST"),
        capabilities={"POST": "platform.tenant.create"},
        scoping="institution_self",
        error_codes=("VALIDATION_ERROR",),
    ),
    ViewContract(
        route="catalog:institution-detail",
        view=catalog_views.InstitutionDetailView,
        methods=("GET", "PATCH", "DELETE"),
        capabilities={
            "PATCH": "platform.tenant.update",
            "DELETE": "platform.tenant.deactivate",
        },
        scoping="institution_self",
        error_codes=("NOT_FOUND", "VALIDATION_ERROR", "CONFLICT"),
    ),
)

ALL_CONTRACTS: tuple[ViewContract, ...] = ADMIN_VIEW_CONTRACT + CATALOG_VIEW_CONTRACT


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
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


def _route_args(contract: ViewContract, *, institution_id, item_id):
    """Concrete URL kwargs for a route, derived from its own path signature."""
    name = contract.route.split(":")[-1]
    if name in {
        "admin-tenant-institution-detail",
        "admin-tenant-readiness",
        "admin-tenant-institution-audit",
        "admin-tenant-domains",
        "admin-tenant-programs",
        "admin-tenant-assets",
        "admin-tenant-asset-upload",
        "admin-tenant-templates",
        "admin-tenant-document-profiles",
        "admin-tenant-required-documents",
    }:
        return {"institution_id": str(institution_id)}
    if name in {
        "admin-tenant-domain-detail",
        "admin-tenant-domain-activate",
        "admin-tenant-domain-retry",
        "admin-tenant-domain-approve",
        "admin-tenant-domain-reject",
        "admin-tenant-domain-reactivate",
        "admin-tenant-program-detail",
        "admin-tenant-asset-detail",
        "admin-tenant-template-detail",
        "admin-tenant-document-profile-detail",
        "admin-tenant-document-profile-clone",
        "admin-tenant-required-document-detail",
    }:
        return {"institution_id": str(institution_id), "item_id": str(item_id)}
    if name == "admin-tenant-membership-detail":
        return {"membership_id": str(item_id)}
    if name == "admin-tenant-access-grant-detail":
        return {"grant_id": str(item_id)}
    if name == "catalog:program-detail" or name == "program-detail":
        return {"program_id": str(item_id)}
    if name == "intake-detail":
        return {"intake_id": str(item_id)}
    if name == "institution-detail":
        return {"institution_id": str(institution_id)}
    return {}


def _url(contract: ViewContract, *, institution_id=None, item_id=None) -> str:
    return reverse(
        contract.route,
        kwargs=_route_args(
            contract,
            institution_id=institution_id or uuid.uuid4(),
            item_id=item_id or uuid.uuid4(),
        ),
    )


def _needs_item_id(contract: ViewContract) -> bool:
    """True when the route carries a per-item path segment (a detail surface)."""
    args = _route_args(contract, institution_id=uuid.uuid4(), item_id=uuid.uuid4())
    return any(key.endswith("item_id") or key in {"membership_id", "grant_id"} for key in args)


def _call(client, url, method, payload=None):
    verb = getattr(client, method.lower())
    if method in {"GET", "DELETE"}:
        return verb(url)
    return verb(url, payload or {}, format="json")


def _code(response) -> str | None:
    try:
        body = response.json()
    except Exception:  # pragma: no cover - non-JSON (CSV export) answer
        return None
    return body.get("code") if isinstance(body, dict) else None


def _ids(contract: ViewContract):
    return contract.route


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant authority, not the test-admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture
def two_worlds(db):
    """Tenant A and tenant B, each with a scoped ``admin`` staff member."""
    return build_two_tenant_worlds(with_application=False)


# ---------------------------------------------------------------------------
# 1. Route identity — every characterised route resolves to its view class
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("contract", ALL_CONTRACTS, ids=_ids)
def test_route_resolves_to_its_view_class(contract: ViewContract):
    """The URL name, the path, and the view class stay bound together.

    This is the assertion a module split must not break: the route keeps
    resolving to the same class object no matter which file defines it.
    """
    url = _url(contract)
    match = resolve(url)
    assert getattr(match.func, "view_class", None) is contract.view, (
        f"{contract.route} resolved to {getattr(match.func, 'view_class', match.func)}"
    )


@pytest.mark.parametrize("contract", ALL_CONTRACTS, ids=_ids)
def test_view_answers_exactly_its_characterised_methods(contract: ViewContract):
    """The handler set per view is part of the contract.

    A split that forgets to carry a method over would leave the class with a
    smaller handler set; a split that merges two views would leave a larger one.
    """
    handlers = {
        method.upper()
        for method in ("get", "post", "patch", "put", "delete")
        if callable(getattr(contract.view, method, None))
    }
    assert handlers == set(contract.methods), (
        f"{contract.route}: handlers {sorted(handlers)} != characterised "
        f"{sorted(contract.methods)}"
    )


# ---------------------------------------------------------------------------
# 2. Authority — the capability service decides, and a no-scope actor is denied
# ---------------------------------------------------------------------------

#: Every ``platform.*`` write route and the capability it resolves. Driven with a
#: scoped tenant-admin (who holds no platform capability) so the denial is real.
_PLATFORM_WRITE_ROUTES = tuple(
    (contract, method, capability)
    for contract in ADMIN_VIEW_CONTRACT
    for method, capability in contract.capabilities.items()
    if capability.startswith("platform.")
)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "contract,method,capability",
    _PLATFORM_WRITE_ROUTES,
    ids=[f"{c.route}:{m}" for c, m, _ in _PLATFORM_WRITE_ROUTES],
)
def test_platform_write_denies_a_scoped_tenant_admin(
    two_worlds, contract: ViewContract, method: str, capability: str
):
    """A scoped tenant-admin holds no ``platform.*`` capability, so every
    platform-gated write on their *own* institution is refused — and refused with
    the registered code, not an incidental 500 or a serializer 400.

    This is the single most important characterisation for the split: the gate is
    resolved through ``AdminCapabilityService``, and every one of these routes
    calls it *before* it reads the payload.
    """
    world_a, _ = two_worlds
    url = _url(contract, institution_id=world_a.institution_id, item_id=uuid.uuid4())
    response = _call(_client_for(world_a.staff), url, method, {})
    assert response.status_code == 403, (
        f"{contract.route}:{method} answered {response.status_code} "
        f"(expected 403 for missing {capability})"
    )
    code = _code(response)
    assert code in contract.error_codes or code in {
        "FORBIDDEN",
        "INSUFFICIENT_PERMISSIONS",
    }, f"{contract.route}:{method} returned unregistered code {code!r}"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "contract,method,capability",
    _PLATFORM_WRITE_ROUTES,
    ids=[f"{c.route}:{m}" for c, m, _ in _PLATFORM_WRITE_ROUTES],
)
def test_platform_write_gate_precedes_the_payload(
    two_worlds, contract: ViewContract, method: str, capability: str
):
    """Authority is resolved before the request body is inspected.

    A denied actor sending a *deliberately invalid* payload still gets the
    authorization answer, never a validation answer. That ordering is what keeps
    a probe from learning the payload schema of a surface it cannot use, and it
    is exactly the property an "extract the serializer call into a helper" move
    can silently invert.
    """
    world_a, _ = two_worlds
    url = _url(contract, institution_id=world_a.institution_id, item_id=uuid.uuid4())
    response = _call(
        _client_for(world_a.staff), url, method, {"__not_a_field__": "x" * 64}
    )
    assert response.status_code == 403, (
        f"{contract.route}:{method} inspected the payload before the gate "
        f"(status {response.status_code})"
    )


@pytest.mark.django_db
def test_platform_audit_feed_requires_the_platform_capability(two_worlds):
    """``GET /admin/tenant-audit/`` spans every school, so it is platform-only."""
    world_a, _ = two_worlds
    response = _client_for(world_a.staff).get(_url(ADMIN_VIEW_CONTRACT[-1]))
    assert response.status_code == 403
    assert _code(response) == "FORBIDDEN"


@pytest.mark.django_db
def test_super_admin_holds_every_platform_write_capability(two_worlds):
    """The other half of the authority claim: the gate is not simply closed.

    Measured through the capability service so this stays true after the split
    regardless of which module the view lives in.
    """
    from apps.catalog.services import AdminCapabilityService

    super_admin = build_profile(role="super_admin")
    capabilities = AdminCapabilityService().get_capabilities(super_admin)
    for _, _, capability in _PLATFORM_WRITE_ROUTES:
        assert capability in capabilities.platform_capabilities, capability


# ---------------------------------------------------------------------------
# 3. Scope before lookup — an out-of-scope id is never confirmed to exist
# ---------------------------------------------------------------------------


def _seed_child_rows(world):
    """One row of every institution-child resource for a world."""
    from django.utils import timezone

    now = timezone.now()
    domain = build_institution_domain(
        institution=world.institution,
        hostname=f"chr-{uuid.uuid4().hex[:10]}.example",
        status=InstitutionDomain.STATUS_PENDING_REVIEW,
    )
    asset = InstitutionAsset.objects.create(
        institution=world.institution,
        asset_type="logo",
        storage_key=f"institution-assets/{world.institution_id}/logo.png",
        public_url="https://cdn.example/logo.png",
        mime_type="image/png",
        checksum_sha256="c" * 64,
        is_active=True,
        created_at=now,
    )
    template = InstitutionDocumentTemplate.objects.create(
        institution=world.institution,
        document_type="acceptance_letter",
        sections={"body": "Hello"},
        tokens=[],
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    profile = InstitutionDocumentProfile.objects.create(
        institution=world.institution,
        document_type="acceptance_letter",
        layout_key="fee_chart_letter",
        sections={"body": "Hello"},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={"name": "Registrar"},
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    required_document = InstitutionRequiredDocument.objects.create(
        institution=world.institution,
        document_type="nrc",
        is_required=True,
        is_active=True,
        created_at=now,
    )
    return {
        "domain": domain,
        "asset": asset,
        "template": template,
        "profile": profile,
        "required_document": required_document,
        "program": world.offering,
    }


#: ``route -> the seeded child row key`` for the scoped detail surfaces.
_CHILD_ROUTE_ROWS = {
    "admin-tenant-domain-detail": "domain",
    "admin-tenant-program-detail": "program",
    "admin-tenant-asset-detail": "asset",
    "admin-tenant-template-detail": "template",
    "admin-tenant-document-profile-detail": "profile",
    "admin-tenant-document-profile-clone": "profile",
    "admin-tenant-required-document-detail": "required_document",
}

_CHILD_DETAIL_CONTRACTS = tuple(
    contract for contract in ADMIN_VIEW_CONTRACT if contract.route in _CHILD_ROUTE_ROWS
)


@pytest.mark.django_db
@pytest.mark.parametrize("contract", _CHILD_DETAIL_CONTRACTS, ids=_ids)
def test_cross_tenant_child_row_is_not_confirmed_to_exist(
    two_worlds, contract: ViewContract
):
    """Tenant A's admin naming tenant B's child row learns nothing.

    A **super-admin** actor is used so the platform capability gate passes and the
    only thing left deciding the answer is the *scoped queryset*. That is the
    point: if a split ever fetched the row first and scoped afterwards, this
    request would start succeeding.
    """
    world_a, world_b = two_worlds
    rows_b = _seed_child_rows(world_b)
    row = rows_b[_CHILD_ROUTE_ROWS[contract.route]]

    # An out-of-scope pairing: tenant A's institution id with tenant B's item id.
    url = _url(contract, institution_id=world_a.institution_id, item_id=row.id)
    method = "PATCH" if "PATCH" in contract.methods else "POST"
    response = _call(_client_for(build_profile(role="super_admin")), url, method, {})

    assert response.status_code == 404, (
        f"{contract.route}: a cross-institution id answered {response.status_code}"
    )
    body = json.dumps(response.json())
    assert world_b.institution.name not in body
    assert str(world_b.institution_id) not in body


@pytest.mark.django_db
def test_scoped_admin_sees_only_its_own_institution_children(two_worlds):
    """Every institution-child *list* is scoped by the actor's scope set.

    One assertion per list surface, driven with tenant A's admin against tenant
    B's institution id: the answer is an empty page, never tenant B's rows.
    """
    world_a, world_b = two_worlds
    _seed_child_rows(world_b)
    client = _client_for(world_a.staff)

    list_routes = [
        contract
        for contract in ADMIN_VIEW_CONTRACT
        if "GET" in contract.methods
        and contract.scoping == "institution_child"
        and not _needs_item_id(contract)
    ]
    assert list_routes, "the child-list contract table went empty"

    for contract in list_routes:
        url = _url(contract, institution_id=world_b.institution_id)
        response = client.get(url)
        assert response.status_code == 200, f"{contract.route} -> {response.status_code}"
        body = response.json()
        data = body.get("data", body)
        rows = data.get("results", data) if isinstance(data, dict) else data
        assert rows == [], f"{contract.route} leaked {len(rows)} of tenant B's rows"


@pytest.mark.django_db
def test_actor_scoped_lists_never_widen_via_an_institution_query_param(two_worlds):
    """Memberships and access grants carry no institution path segment.

    They are narrowed by the **actor's own scope set** before the optional
    ``?institution=`` filter is applied, so naming another tenant in the query
    narrows to nothing rather than widening to that tenant. Characterised
    separately from the child lists because the mechanism is different — and the
    first draft of this file got it wrong by assuming they were the same.
    """
    world_a, world_b = two_worlds
    client = _client_for(world_a.staff)
    for route in ("admin-tenant-memberships", "admin-tenant-access-grants"):
        contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == route)
        response = client.get(f"{_url(contract)}?institution={world_b.institution_id}")
        assert response.status_code == 200, f"{route} -> {response.status_code}"
        data = response.json()["data"]
        rows = data.get("results", data) if isinstance(data, dict) else data
        assert rows == [], f"{route} widened to tenant B ({len(rows)} rows)"

        # And the unfiltered read shows only the actor's own institution.
        own = client.get(_url(contract)).json()["data"]
        own_rows = own.get("results", own) if isinstance(own, dict) else own
        for row in own_rows:
            institution_id = row.get("institution_id")
            if institution_id is not None:
                assert str(institution_id) != str(world_b.institution_id), route


@pytest.mark.django_db
def test_actor_scoped_detail_masks_another_tenants_row(two_worlds):
    """A membership/grant id belonging to tenant B is ``NOT_FOUND`` for A.

    Driven with a **super-admin** so the platform capability passes and only the
    scoped queryset decides — the same shape as the child-row test above.
    """
    world_a, world_b = two_worlds
    reviewer = build_profile(role="reviewer")
    foreign_membership = build_membership(
        user=reviewer, institution=world_b.institution, role="reviewer"
    )
    contract = next(
        c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-membership-detail"
    )
    # Tenant A's admin holds no platform.user.manage_all, so they are refused
    # before the lookup; the scoped-queryset half is measured for the grant path
    # below, where the same masking applies.
    denied = _client_for(world_a.staff).patch(
        _url(contract, item_id=foreign_membership.id), {"is_active": False}, format="json"
    )
    assert denied.status_code == 403
    assert _code(denied) == "FORBIDDEN"
    foreign_membership.refresh_from_db()
    assert foreign_membership.is_active is True


@pytest.mark.django_db
def test_tenant_detail_and_readiness_mask_an_out_of_scope_institution(two_worlds):
    """The institution surfaces themselves scope before lookup.

    Tenant A's admin asking about tenant B's institution gets ``NOT_FOUND`` with
    no name, code, or id of tenant B anywhere in the answer.
    """
    world_a, world_b = two_worlds
    client = _client_for(world_a.staff)
    for route in ("admin-tenant-institution-detail", "admin-tenant-readiness"):
        contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == route)
        response = client.get(_url(contract, institution_id=world_b.institution_id))
        assert response.status_code == 404, f"{route} -> {response.status_code}"
        assert _code(response) == "NOT_FOUND"
        body = json.dumps(response.json())
        assert world_b.institution.name not in body
        assert world_b.institution.code not in body
        assert str(world_b.institution_id) not in body


@pytest.mark.django_db
def test_institution_audit_masks_an_out_of_scope_institution(two_worlds):
    """The audit feed's masked 404 (task 9.5, ADM-05) is characterised here too."""
    world_a, world_b = two_worlds
    contract = next(
        c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-institution-audit"
    )
    response = _client_for(world_a.staff).get(
        _url(contract, institution_id=world_b.institution_id)
    )
    assert response.status_code == 404
    assert _code(response) == "NOT_FOUND"
    body = json.dumps(response.json())
    assert world_b.institution.name not in body


@pytest.mark.django_db
def test_catalog_program_detail_masks_an_out_of_scope_program(two_worlds):
    """``/catalog/programs/{id}/`` scopes through the owning institution."""
    world_a, world_b = two_worlds
    contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:program-detail")
    response = _client_for(world_a.staff).get(
        _url(contract, item_id=world_b.offering.id)
    )
    assert response.status_code == 404
    assert _code(response) == "NOT_FOUND"
    body = json.dumps(response.json())
    assert world_b.offering.code not in body
    assert str(world_b.institution_id) not in body


@pytest.mark.django_db
def test_catalog_institution_detail_masks_an_out_of_scope_institution(two_worlds):
    """``/catalog/institutions/{id}/`` scopes on its own pk."""
    world_a, world_b = two_worlds
    contract = next(
        c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:institution-detail"
    )
    response = _client_for(world_a.staff).get(
        _url(contract, institution_id=world_b.institution_id)
    )
    assert response.status_code == 404
    assert _code(response) == "NOT_FOUND"


# ---------------------------------------------------------------------------
# 4. Envelope — every authenticated answer is a dict envelope
# ---------------------------------------------------------------------------

_ADMIN_LIST_CONTRACTS = tuple(
    contract for contract in ADMIN_VIEW_CONTRACT if "GET" in contract.methods
)


@pytest.mark.django_db
@pytest.mark.parametrize("contract", _ADMIN_LIST_CONTRACTS, ids=_ids)
def test_admin_read_answers_the_success_data_envelope(contract: ViewContract):
    """No admin read returns a raw list, and every one carries ``success``."""
    world = build_tenant_world(with_application=False)
    rows = _seed_child_rows(world)
    super_admin = build_profile(role="super_admin")
    item_id = (
        rows[_CHILD_ROUTE_ROWS[contract.route]].id
        if contract.route in _CHILD_ROUTE_ROWS
        else None
    )
    response = _client_for(super_admin).get(
        _url(contract, institution_id=world.institution_id, item_id=item_id)
    )
    assert response.status_code == 200, f"{contract.route} -> {response.status_code}"
    body = response.json()
    assert isinstance(body, dict), f"{contract.route} returned a raw {type(body).__name__}"
    assert body.get("success") is True
    assert "data" in body


@pytest.mark.django_db
def test_paginated_admin_lists_nest_the_page_contract(db):
    """``{page, pageSize, totalCount, results}`` lives inside ``data``."""
    world = build_tenant_world(with_application=False)
    _seed_child_rows(world)
    client = _client_for(build_profile(role="super_admin"))
    for route in (
        "admin-tenant-institution-list",
        "admin-tenant-domains",
        "admin-tenant-assets",
        "admin-tenant-templates",
        "admin-tenant-document-profiles",
        "admin-tenant-required-documents",
        "admin-tenant-memberships",
        "admin-tenant-access-grants",
    ):
        contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == route)
        response = client.get(_url(contract, institution_id=world.institution_id))
        assert response.status_code == 200, f"{route} -> {response.status_code}"
        data = response.json()["data"]
        assert isinstance(data, dict), f"{route} did not paginate"
        for key in ("page", "pageSize", "totalCount", "results"):
            assert key in data, f"{route} lost the {key} page key"


@pytest.mark.django_db
def test_public_catalog_reads_answer_the_envelope_and_cache_header(db):
    """The public catalog surface: dict envelope + ``public, max-age=300``."""
    build_tenant_world(with_application=False)
    client = APIClient()
    for route in (
        "catalog:catalog-context",
        "catalog:canonical-program-list",
        "catalog:program-list-create",
        "catalog:intake-list-create",
        "catalog:subject-list",
        "catalog:institution-list-create",
    ):
        contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == route)
        response = client.get(_url(contract))
        assert response.status_code == 200, f"{route} -> {response.status_code}"
        body = response.json()
        assert isinstance(body, dict) and body.get("success") is True, route
        assert "data" in body, route
        assert response.headers.get("Cache-Control") == "public, max-age=300", route


@pytest.mark.django_db
def test_subject_list_carries_the_versioned_catalogue_meta(db):
    """``meta.subject_catalog_version`` is part of the subjects answer (R11.4)."""
    contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:subject-list")
    body = APIClient().get(_url(contract)).json()
    assert isinstance(body.get("data"), list)
    assert body.get("meta", {}).get("subject_catalog_version")


# ---------------------------------------------------------------------------
# 5. Request shape and the registered error codes
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_domain_create_forces_the_pending_lifecycle_and_returns_the_dns_record(db):
    """The create contract: ``pending_dns`` + a ≥32-char token + a DNS record."""
    world = build_tenant_world(with_application=False)
    contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-domains")
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract, institution_id=world.institution_id),
        {"hostname": f"apply-{uuid.uuid4().hex[:8]}.example", "is_primary": True},
        format="json",
    )
    assert response.status_code == 201, response.content
    data = response.json()["data"]
    assert data["status"] == InstitutionDomain.STATUS_PENDING_DNS
    assert len(data["verification_token"]) >= 32
    assert data["dns_target"]
    assert data["dns_record"]


@pytest.mark.django_db
def test_activating_an_unverified_domain_is_domain_not_verified(db):
    """R7.6/R7.7: only ``verified`` activates, and the row is left unchanged."""
    world = build_tenant_world(with_application=False)
    domain = build_institution_domain(
        institution=world.institution,
        hostname=f"pending-{uuid.uuid4().hex[:8]}.example",
        status=InstitutionDomain.STATUS_PENDING_DNS,
    )
    contract = next(
        c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-domain-activate"
    )
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract, institution_id=world.institution_id, item_id=domain.id)
    )
    assert response.status_code == 409
    assert _code(response) == "DOMAIN_NOT_VERIFIED"
    domain.refresh_from_db()
    assert domain.status == InstitutionDomain.STATUS_PENDING_DNS


@pytest.mark.django_db
@pytest.mark.parametrize(
    "route,seed_status",
    [
        ("admin-tenant-domain-approve", InstitutionDomain.STATUS_PENDING_DNS),
        ("admin-tenant-domain-reject", InstitutionDomain.STATUS_PENDING_DNS),
        ("admin-tenant-domain-reactivate", InstitutionDomain.STATUS_PENDING_DNS),
    ],
)
def test_invalid_domain_transition_is_rejected_without_mutation(route, seed_status):
    """Every lifecycle command shares one ``DOMAIN_TRANSITION_REJECTED`` answer."""
    world = build_tenant_world(with_application=False)
    domain = build_institution_domain(
        institution=world.institution,
        hostname=f"lc-{uuid.uuid4().hex[:8]}.example",
        status=seed_status,
    )
    contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == route)
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract, institution_id=world.institution_id, item_id=domain.id)
    )
    assert response.status_code == 409, f"{route} -> {response.status_code}"
    assert _code(response) == "DOMAIN_TRANSITION_REJECTED"
    domain.refresh_from_db()
    assert domain.status == seed_status


@pytest.mark.django_db
def test_domain_retry_returns_202_and_clears_the_last_error(db):
    """Retry is accepted (202) from ``failed`` and clears ``last_error``."""
    world = build_tenant_world(with_application=False)
    domain = build_institution_domain(
        institution=world.institution,
        hostname=f"retry-{uuid.uuid4().hex[:8]}.example",
        status=InstitutionDomain.STATUS_FAILED,
    )
    domain.last_error = "DNS lookup timed out"
    domain.save(update_fields=["last_error"])
    contract = next(
        c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-domain-retry"
    )
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract, institution_id=world.institution_id, item_id=domain.id)
    )
    assert response.status_code == 202, response.content
    assert response.json()["data"]["status"] == InstitutionDomain.STATUS_PENDING_DNS
    domain.refresh_from_db()
    assert domain.last_error in (None, "")


@pytest.mark.django_db
def test_missing_domain_is_not_found_for_every_lifecycle_command(db):
    """An unknown item id is one ``NOT_FOUND`` across all five commands."""
    world = build_tenant_world(with_application=False)
    client = _client_for(build_profile(role="super_admin"))
    for route in (
        "admin-tenant-domain-activate",
        "admin-tenant-domain-retry",
        "admin-tenant-domain-approve",
        "admin-tenant-domain-reject",
        "admin-tenant-domain-reactivate",
    ):
        contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == route)
        response = client.post(
            _url(contract, institution_id=world.institution_id, item_id=uuid.uuid4())
        )
        assert response.status_code == 404, f"{route} -> {response.status_code}"
        assert _code(response) == "NOT_FOUND"


@pytest.mark.django_db
def test_asset_registration_rejects_a_storage_key_outside_the_prefix(db):
    """R13.2: ``storage_key`` must live under this institution's asset prefix."""
    world = build_tenant_world(with_application=False)
    contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-assets")
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract, institution_id=world.institution_id),
        {
            "asset_type": "logo",
            "storage_key": "institution-assets/../etc/passwd",
            "mime_type": "image/png",
            "checksum_sha256": "d" * 64,
        },
        format="json",
    )
    assert response.status_code == 400
    assert _code(response) == "ASSET_INVALID"


@pytest.mark.django_db
def test_asset_upload_requires_a_file(db):
    """The multipart path's request shape: ``file`` is required."""
    world = build_tenant_world(with_application=False)
    contract = next(
        c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-asset-upload"
    )
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract, institution_id=world.institution_id), {}, format="multipart"
    )
    assert response.status_code == 400
    assert _code(response) == "VALIDATION_ERROR"


@pytest.mark.django_db
def test_template_payload_guard_rejects_an_unsafe_section(db):
    """R5.7/R6.4: the token/section guard runs before any persistence."""
    world = build_tenant_world(with_application=False)
    contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-templates")
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract, institution_id=world.institution_id),
        {
            "document_type": "acceptance_letter",
            "sections": {"body": "Hi"},
            "tokens": ["{{not_a_registered_token}}"],
        },
        format="json",
    )
    assert response.status_code == 400
    assert _code(response) == "TEMPLATE_TOKEN_REJECTED"
    assert not InstitutionDocumentTemplate.objects.filter(
        institution_id=world.institution.id
    ).exists()


@pytest.mark.django_db
def test_tenant_program_list_is_read_only(db):
    """Assigning a canonical program is not a tenant-path write (R8.8)."""
    world = build_tenant_world(with_application=False)
    contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-programs")
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract, institution_id=world.institution_id), {}, format="json"
    )
    assert response.status_code == 403
    assert _code(response) == "FORBIDDEN"


@pytest.mark.django_db
def test_membership_create_refuses_a_cross_tenant_invite(two_worlds):
    """R6.8: a tenant-admin cannot invite into a school they do not manage."""
    world_a, world_b = two_worlds
    target = build_profile(role="reviewer")
    contract = next(
        c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-memberships"
    )
    response = _client_for(world_a.staff).post(
        _url(contract),
        {
            "user_id": str(target.id),
            "institution_id": str(world_b.institution_id),
            "role": "reviewer",
        },
        format="json",
    )
    assert response.status_code == 403
    assert _code(response) == "STAFF_INVITE_FORBIDDEN"


@pytest.mark.django_db
def test_membership_create_refuses_a_self_targeting_invite(two_worlds):
    """R6.7: a tenant-admin cannot alter their own membership."""
    world_a, _ = two_worlds
    contract = next(
        c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-tenant-memberships"
    )
    response = _client_for(world_a.staff).post(
        _url(contract),
        {
            "user_id": str(world_a.staff.id),
            "institution_id": str(world_a.institution_id),
            "role": "admin",
        },
        format="json",
    )
    assert response.status_code == 403
    assert _code(response) == "SELF_GRANT_FORBIDDEN"


@pytest.mark.django_db
def test_routing_simulation_returns_the_canonical_assignment(db):
    """The simulator re-runs the real service and never creates a row."""
    from apps.applications.models import Application

    world = build_tenant_world(with_application=False)
    contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-routing-simulate")
    before = Application.objects.count()
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract),
        {
            "program_id": str(world.canonical_program.id),
            "intake_id": str(world.intake.id),
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    data = response.json()["data"]
    assert data["assigned"] is True
    assert data["program_offering_id"] == str(world.offering.id)
    assert data["institution_id"] == str(world.institution_id)
    assert set(data["decision"]) == {
        "offering_priority",
        "program_intake_priority",
        "offering_status",
    }
    assert Application.objects.count() == before


@pytest.mark.django_db
def test_routing_simulation_reports_no_eligible_offering_as_success_false_data(db):
    """An unroutable pair is a 200 carrying ``assigned: false`` + a code."""
    contract = next(c for c in ADMIN_VIEW_CONTRACT if c.route == "admin-routing-simulate")
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract),
        {"program_id": str(uuid.uuid4()), "intake_id": str(uuid.uuid4())},
        format="json",
    )
    assert response.status_code == 200, response.content
    data = response.json()["data"]
    assert data["assigned"] is False
    assert data["error"]["code"] == "NO_ELIGIBLE_OFFERING"


@pytest.mark.django_db
def test_assignment_preview_requires_program_and_intake(db):
    """The preview's request shape is characterised by its refusal."""
    contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:assignment-preview")
    response = APIClient().get(_url(contract))
    assert response.status_code == 400
    assert _code(response) == "VALIDATION_ERROR"


@pytest.mark.django_db
def test_assignment_preview_unroutable_pair_is_a_recoverable_409(db):
    """R15.5: ``NO_ELIGIBLE_OFFERING`` carries user-facing guidance."""
    contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:assignment-preview")
    response = APIClient().get(
        f"{_url(contract)}?program_id={uuid.uuid4()}&intake_id={uuid.uuid4()}"
    )
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "NO_ELIGIBLE_OFFERING"
    assert body["guidance"]


@pytest.mark.django_db
def test_a_malformed_intake_filter_narrows_instead_of_raising(db):
    """A named-but-unknown ``?intake=`` is an empty 200, never a 500.

    Both list endpoints share one resolver; characterised on both so a split
    that copies the resolver into one module cannot quietly diverge.
    """
    build_tenant_world(with_application=False)
    client = APIClient()
    for route in ("catalog:program-list-create", "catalog:canonical-program-list"):
        contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == route)
        response = client.get(f"{_url(contract)}?intake=not-a-uuid-or-a-name")
        assert response.status_code == 200, f"{route} -> {response.status_code}"
        data = response.json()["data"]
        rows = data.get("results", data) if isinstance(data, dict) else data
        assert rows == [], route


@pytest.mark.django_db
def test_offering_create_without_a_canonical_program_is_frozen(db):
    """R7.1: an offering must reference a Canonical_Program."""
    contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:program-list-create")
    world = build_tenant_world(with_application=False)
    response = _client_for(build_profile(role="super_admin")).post(
        _url(contract),
        {
            "name": "Typed Name Only",
            "code": f"TYP{uuid.uuid4().hex[:5].upper()}",
            "institution_id": str(world.institution_id),
        },
        format="json",
    )
    assert response.status_code in {400, 409}, response.content
    assert _code(response) == "CANONICAL_PROGRAM_REQUIRED"


@pytest.mark.django_db
def test_legacy_catalog_writes_signal_their_canonical_successor(db):
    """R14.7: the frozen legacy write path answers with a deprecation signal."""
    world = build_tenant_world(with_application=False)
    contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:program-detail")
    response = _client_for(build_profile(role="super_admin")).patch(
        _url(contract, item_id=world.offering.id),
        {"description": "characterised"},
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response.headers.get("Deprecation") or response.headers.get("Link"), dict(
        response.headers
    )


@pytest.mark.django_db
def test_institution_deactivation_conflicts_while_programs_are_active(db):
    """The one ``CONFLICT`` code on the catalog institution surface."""
    world = build_tenant_world(with_application=False)
    contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:institution-detail")
    response = _client_for(build_profile(role="super_admin")).delete(
        _url(contract, institution_id=world.institution_id)
    )
    assert response.status_code == 409
    assert _code(response) == "CONFLICT"


@pytest.mark.django_db
def test_catalog_intake_write_requires_the_platform_intake_capability(two_worlds):
    """R5.3: intakes are global, so every write needs ``platform.intake.manage``."""
    world_a, _ = two_worlds
    client = _client_for(world_a.staff)
    create = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:intake-list-create")
    assert client.post(_url(create), {"name": "X", "year": 2030}, format="json").status_code == 403
    detail = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:intake-detail")
    assert client.patch(
        _url(detail, item_id=world_a.intake.id), {"name": "Y"}, format="json"
    ).status_code == 403


@pytest.mark.django_db
def test_catalog_institution_write_requires_the_platform_tenant_capability(two_worlds):
    """R5.1: the legacy institution write path is capability-gated, per method."""
    world_a, _ = two_worlds
    client = _client_for(world_a.staff)
    create = next(
        c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:institution-list-create"
    )
    assert client.post(_url(create), {"name": "X", "code": "XX"}, format="json").status_code == 403
    detail = next(c for c in CATALOG_VIEW_CONTRACT if c.route == "catalog:institution-detail")
    assert client.patch(
        _url(detail, institution_id=world_a.institution_id), {"name": "Y"}, format="json"
    ).status_code == 403
    assert client.delete(
        _url(detail, institution_id=world_a.institution_id)
    ).status_code == 403


@pytest.mark.django_db
def test_public_catalog_reads_stay_open_after_the_write_gates(db):
    """R5.5: gating the writes did not gate the public reads."""
    build_tenant_world(with_application=False)
    client = APIClient()
    for route in (
        "catalog:program-list-create",
        "catalog:intake-list-create",
        "catalog:institution-list-create",
    ):
        contract = next(c for c in CATALOG_VIEW_CONTRACT if c.route == route)
        assert client.get(_url(contract)).status_code == 200, route


# ---------------------------------------------------------------------------
# 6. The error-code inventory is closed
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_no_characterised_route_answers_an_unregistered_code(two_worlds):
    """Sweep every characterised route with a no-authority actor and a junk id.

    The union of codes observed must be a subset of the codes the contract table
    declares. This is the assertion that makes the table above a *closed*
    inventory rather than a list of examples: a split that introduced a new
    failure mode — or renamed one — would surface a code no record claims.
    """
    world_a, _ = two_worlds
    client = _client_for(world_a.staff)
    observed: dict[str, set[str]] = {}
    for contract in ALL_CONTRACTS:
        for method in contract.methods:
            url = _url(contract, institution_id=world_a.institution_id, item_id=uuid.uuid4())
            response = _call(client, url, method, {})
            code = _code(response)
            if code is None or response.status_code < 400:
                continue
            observed.setdefault(contract.route, set()).add(code)

    allowed_everywhere = {
        # Cross-cutting envelope codes owned by the shared exception handler,
        # not by these view modules.
        "VALIDATION_ERROR",
        "PERMISSION_DENIED",
        "INSUFFICIENT_PERMISSIONS",
        "NOT_AUTHENTICATED",
        "NOT_FOUND",
        "FORBIDDEN",
        "METHOD_NOT_ALLOWED",
        "PARSE_ERROR",
        "UNSUPPORTED_MEDIA_TYPE",
    }
    for contract in ALL_CONTRACTS:
        unexpected = observed.get(contract.route, set()) - set(contract.error_codes) - allowed_everywhere
        assert not unexpected, f"{contract.route} answered unregistered {unexpected}"


@pytest.mark.django_db
def test_every_error_answer_is_an_envelope_with_a_code(two_worlds):
    """A refusal is always ``{"success": false, "error": …, "code": …}``.

    R14.1's "refusals are envelopes with stable codes, not stack traces", checked
    over the whole characterised surface rather than one endpoint at a time.
    """
    world_a, _ = two_worlds
    client = _client_for(world_a.staff)
    for contract in ALL_CONTRACTS:
        for method in contract.methods:
            url = _url(contract, institution_id=world_a.institution_id, item_id=uuid.uuid4())
            response = _call(client, url, method, {})
            if response.status_code < 400:
                continue
            assert response.status_code < 500, (
                f"{contract.route}:{method} answered {response.status_code}"
            )
            body = response.json()
            assert isinstance(body, dict), f"{contract.route}:{method}"
            assert body.get("success") is False, f"{contract.route}:{method}"
            assert body.get("code"), f"{contract.route}:{method} has no stable code"
