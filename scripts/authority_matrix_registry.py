#!/usr/bin/env python3
"""
Admissions V2 — APPROVED endpoint authority registry (spec task 2.1).

This module is the *approved, human-reviewed* authority decision for every
backend endpoint. It is the authored input that task 2.1 turns the raw task-0.3
route inventory (``scripts/inventory_admissions_v2.py`` ->
``docs/v2-evidence/0.3/inventory/backend_routes.json``) into: an APPROVED
authority matrix in the exact registry-entry shape of ``design.md`` §5.2.

WHY AN EXPLICIT REGISTRY (not just the 0.3 heuristic)
-----------------------------------------------------
The 0.3 classifier is a *static heuristic*. It reads ``permission_classes`` and
scans the view body, so it necessarily left 60 endpoints in a weak
``authenticated`` bucket ("authority-matrix assignment pending — task 2.1") and
mis-classified several endpoints whose real authority is decided by a
``get_permissions()`` override or an in-body ownership/role check the static
scan cannot see (e.g. ``CommunicationTemplateUpdateView`` overrides
``get_permissions`` to ``IsAdmin``; ``LoginView``/``RefreshView`` were tagged
``internal_callback`` because the word ``hmac`` appears in the module). Task 2.1
*approves* the matrix by resolving every one of those into a real design §5.2
authority class, so a human decision — not a regex — owns each endpoint's
authority.

DESIGN §5.2 REGISTRY-ENTRY SHAPE (every protected endpoint)
-----------------------------------------------------------
    method + route
    required authentication
    platform capability OR tenant capability OR assignment/ownership rule
    tenant object path
    state precondition
    idempotency policy
    audit event
    object-disclosure (404 vs non-revealing 403) policy

AUTHORITY CLASSES
-----------------
The design §5.2 "target seven": ``public``, ``owner``,
``reviewer_assignment``, ``tenant_capability``, ``platform_capability``,
``worker``, ``internal_callback``. Plus two explicitly-approved out-of-matrix
boundaries so the gate can prove *every* route is classified (never left in the
weak bucket): ``infra`` (health/schema/docs/root/django-admin) and ``jobs_ops``
(the separate AI job-hunting product, gated behind ``ENABLE_JOBS_OPS_ROUTES``,
out of the admissions authority model — classified by reviewed boundary rule,
never hand-owned here).

The generator (``scripts/authority_matrix_v2.py``) and the backend pytest gate
(``backend/tests/unit/test_authority_matrix_v2.py``) both consume this module —
it is the single approved source the zero-unclassified gate and the allow/deny
case-matrix are built from.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


# --------------------------------------------------------------------------- #
# Authority classes + per-class object-disclosure policy (design §5.2 / R3.2)
# --------------------------------------------------------------------------- #

#: The design §5.2 "target seven" authority classes.
TARGET_SEVEN = (
    "public",
    "owner",
    "reviewer_assignment",
    "tenant_capability",
    "platform_capability",
    "worker",
    "internal_callback",
)

#: Explicitly-approved out-of-admissions-matrix boundary classes. Every route
#: still lands in exactly one class; these are never the weak ``authenticated``
#: bucket — they are a reviewed decision that the route is infra or a separate
#: product.
BOUNDARY_CLASSES = ("infra", "jobs_ops")

#: All classes the gate accepts. A route in any other class (notably the 0.3
#: weak ``authenticated`` bucket, or a bare ``unclassified``) FAILS the gate.
APPROVED_CLASSES = TARGET_SEVEN + BOUNDARY_CLASSES

#: Per-class object-disclosure + 404/403 policy (design §5.2, R3.2, R3.6).
#:
#: ``not_found_mask``    cross-owner / cross-tenant object substitution returns
#:                       an INDISTINGUISHABLE 404 (existence never confirmed).
#: ``non_revealing_403`` in-scope but missing capability -> bare 403 with no
#:                       tenant id/name/count/attribute leaked.
#: ``public``            unauthenticated; response body is public data.
#: ``signature_verified``inbound callback; authenticated by signature/HMAC, not
#:                       an actor; returns 200 on every processing outcome so a
#:                       caller cannot probe internal state.
DISCLOSURE_BY_CLASS: Dict[str, Dict[str, str]] = {
    "public": {
        "policy": "public",
        "cross_object": "n/a",
        "rule": "No authentication; response body is intentionally public. No "
        "object-existence concern.",
    },
    "owner": {
        "policy": "not_found_mask",
        "cross_object": "404",
        "rule": "Object is owned by the acting Student. A request for another "
        "user's (or another tenant's) object returns an indistinguishable 404 — "
        "existence is never confirmed to a non-owner. Composed staff readers are "
        "scoped before lookup and also 404-masked out of scope.",
    },
    "reviewer_assignment": {
        "policy": "not_found_mask",
        "cross_object": "404",
        "rule": "Reviewer authority is active tenant membership PLUS an explicit "
        "application assignment. An unassigned or out-of-tenant object returns an "
        "indistinguishable 404.",
    },
    "tenant_capability": {
        "policy": "not_found_mask_then_non_revealing_403",
        "cross_object": "404",
        "rule": "Scope BEFORE lookup via visible_institution_queryset: an "
        "out-of-scope (other-tenant) object is an indistinguishable 404. An "
        "in-scope object with a missing tenant.* capability is a non-revealing "
        "403 that leaks no tenant id/name/count/attribute.",
    },
    "platform_capability": {
        "policy": "non_revealing_403",
        "cross_object": "403",
        "rule": "Platform authority sees all tenants, so there is no cross-tenant "
        "masking; a missing platform.* capability is a non-revealing 403. A "
        "genuinely absent object id is a generic 404.",
    },
    "worker": {
        "policy": "internal",
        "cross_object": "n/a",
        "rule": "Internal worker/command surface — not an actor-facing HTTP "
        "endpoint.",
    },
    "internal_callback": {
        "policy": "signature_verified",
        "cross_object": "n/a",
        "rule": "Inbound provider callback authenticated by signature/HMAC. "
        "Returns 200 on every processing outcome so internal state cannot be "
        "probed; an invalid signature is rejected without disclosure.",
    },
    "infra": {
        "policy": "n/a",
        "cross_object": "n/a",
        "rule": "Infrastructure / documentation surface (health, OpenAPI schema, "
        "docs, API root, Django operational admin). Not part of the admissions "
        "authority matrix.",
    },
    "jobs_ops": {
        "policy": "out_of_admissions_scope",
        "cross_object": "n/a",
        "rule": "Separate AI job-hunting product (gated behind "
        "ENABLE_JOBS_OPS_ROUTES). Out of the admissions authority model; excluded "
        "from the five-actor admissions case matrix. Carries its own "
        "public-read / authenticated-write / policy-gated model.",
    },
}


# --------------------------------------------------------------------------- #
# Actor contexts for the allow/deny case matrix (R3.6)
# --------------------------------------------------------------------------- #
#
# Two institutions (tenant A and tenant B). Every non-anonymous, non-platform
# actor is scoped to tenant A, and the case matrix exercises them against
# objects in BOTH tenant A (in-scope) and tenant B (cross-tenant), plus a
# non-owned object in their own tenant. This is exactly the R3.6 requirement:
# "exercise every protected endpoint for anonymous, Student, Reviewer,
# Tenant_Admin, and Platform_Admin contexts, including two institutions and
# cross-tenant IDs."

ACTORS: List[Dict[str, Any]] = [
    {
        "id": "anonymous",
        "role": None,
        "authenticated": False,
        "tenant": None,
        "description": "Unauthenticated caller (no session cookie).",
    },
    {
        "id": "student_A",
        "role": "student",
        "authenticated": True,
        "tenant": "A",
        "description": "Applicant who owns applications in tenant A.",
    },
    {
        "id": "reviewer_A",
        "role": "reviewer",
        "authenticated": True,
        "tenant": "A",
        "description": "Reviewer with active membership in tenant A; authority is "
        "assignment-scoped.",
    },
    {
        "id": "tenant_admin_A",
        "role": "admin",
        "authenticated": True,
        "tenant": "A",
        "description": "Tenant_Admin scoped to tenant A via active membership/grant.",
    },
    {
        "id": "platform_admin",
        "role": "super_admin",
        "authenticated": True,
        "tenant": "*",
        "description": "Beanola platform operator with platform.* authority across "
        "all tenants.",
    },
]

#: The two institutions the matrix exercises, plus the object variants each
#: protected endpoint is probed with.
TENANTS = ("A", "B")


# --------------------------------------------------------------------------- #
# Entry builders (keep the authored table compact + readable)
# --------------------------------------------------------------------------- #

def _entry(
    authority_class: str,
    *,
    auth: str = "required",
    cap: Optional[str] = None,
    composed: Optional[List[str]] = None,
    ownership: Optional[str] = None,
    assignment: Optional[str] = None,
    tenant_object_path: Optional[str] = None,
    state_precondition: Optional[str] = None,
    idempotency: str = "none",
    audit_event: Optional[str] = None,
    disclosure: Optional[str] = None,
    dev_only: bool = False,
    ai_touchpoint: bool = False,
    legacy: bool = False,
    finding: Optional[str] = None,
    notes: Optional[str] = None,
    by_method: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Build one approved §5.2 registry entry (a plain dict)."""
    if disclosure is None:
        disclosure = DISCLOSURE_BY_CLASS[authority_class]["policy"]
    return {
        "authority_class": authority_class,
        "authentication": auth,
        "capability": cap,
        "composed_authorities": composed or [],
        "ownership_rule": ownership,
        "assignment_rule": assignment,
        "tenant_object_path": tenant_object_path,
        "state_precondition": state_precondition,
        "idempotency": idempotency,
        "audit_event": audit_event,
        "disclosure": disclosure,
        "dev_only": dev_only,
        "ai_touchpoint": ai_touchpoint,
        "legacy": legacy,
        "finding": finding,
        "notes": notes,
        "by_method": by_method,
    }


def public(auth: str = "none", **kw: Any) -> Dict[str, Any]:
    return _entry("public", auth=auth, **kw)


def owner(**kw: Any) -> Dict[str, Any]:
    kw.setdefault("ownership", "object.user_id == actor.id")
    return _entry("owner", **kw)


def reviewer_assignment(**kw: Any) -> Dict[str, Any]:
    kw.setdefault(
        "assignment",
        "active membership in object.institution AND explicit application assignment",
    )
    return _entry("reviewer_assignment", **kw)


def tenant(cap: Optional[str] = None, **kw: Any) -> Dict[str, Any]:
    return _entry("tenant_capability", cap=cap, **kw)


def platform(cap: Optional[str] = None, **kw: Any) -> Dict[str, Any]:
    return _entry("platform_capability", cap=cap, **kw)


def callback(**kw: Any) -> Dict[str, Any]:
    return _entry("internal_callback", auth="signature", **kw)


# --------------------------------------------------------------------------- #
# Boundary rule (infra + jobs_ops) — reviewed, applied to un-authored routes
# --------------------------------------------------------------------------- #

#: /api/v1/ path prefixes owned by the separate jobs-ops product (mounted only
#: when ENABLE_JOBS_OPS_ROUTES is true). Reviewed decision: these are out of the
#: admissions authority matrix.
JOBS_OPS_PREFIXES = (
    "/api/v1/jobs/",
    "/api/v1/job-applications/",
    "/api/v1/outreach/",
    "/api/v1/automation/",
    "/api/v1/integrations/",
    "/api/v1/analytics/",
    "/api/v1/reports/",
)

#: Specific jobs-ops endpoints that live under shared app prefixes (documents/
#: email) but belong to the jobs-ops product by view module.
JOBS_OPS_EXACT_PATHS = frozenset(
    {
        "/api/v1/documents/cover-letters/generate/",
        "/api/v1/documents/question-bank/answer/",
        "/api/v1/documents/resumes/",
        "/api/v1/documents/resumes/variants/",
        "/api/v1/email/accounts/zoho/connect/",
        "/api/v1/email/messages/",
        "/api/v1/email/threads/",
    }
)

#: The 0.3 heuristic infra/meta classes map straight through to ``infra``.
INFRA_HEURISTIC_CLASSES = frozenset(
    {"health", "api_docs", "api_root", "django_admin"}
)


def classify_boundary(path: str, heuristic_class: str, module: str) -> Optional[Dict[str, Any]]:
    """Return an approved boundary entry for a route the table does not own.

    Reviewed rule (not a guess): infra/meta routes -> ``infra``; the jobs-ops
    product surface (by path prefix, exact path, or ``apps.jobs``/
    ``apps.outreach``/... module) -> ``jobs_ops``. Any other route returns
    ``None`` so it MUST be explicitly registered (the gate fails otherwise).
    """
    if heuristic_class in INFRA_HEURISTIC_CLASSES:
        return _entry("infra", auth="varies", notes=f"infra/meta ({heuristic_class})")

    if path in JOBS_OPS_EXACT_PATHS or any(path.startswith(p) for p in JOBS_OPS_PREFIXES):
        # A jobs-ops webhook is still an internal callback, but inside the
        # jobs-ops boundary; record the boundary so the admissions matrix
        # excludes it.
        if "webhook" in path.lower():
            return _entry(
                "internal_callback",
                auth="signature",
                notes="jobs-ops provider webhook (out of admissions scope)",
            )
        return _entry("jobs_ops", auth="varies", notes=f"jobs-ops product surface ({module})")

    return None


# --------------------------------------------------------------------------- #
# APPROVED per-endpoint authority table (admissions + shared + platform/tenant)
# --------------------------------------------------------------------------- #
#
# Keyed by the EXACT normalized path emitted by the route walk. Every
# non-jobs-ops, non-infra backend route is owned here by an explicit, approved
# decision. Endpoints whose live methods carry different authority (public read
# + capability write) use ``by_method``.

ENDPOINTS: Dict[str, Dict[str, Any]] = {}


def _register(path: str, entry: Dict[str, Any]) -> None:
    ENDPOINTS[path] = entry


# --- Auth (apps.accounts) — unauthenticated entry points + self actions ------
_register("/api/v1/auth/login/", public(notes="Credential login; heuristic mis-tagged internal_callback (module contains 'hmac'). Approved: public."))
_register("/api/v1/auth/register/", public(notes="Self-registration."))
_register("/api/v1/auth/refresh/", public(notes="Cookie-based token refresh; heuristic mis-tagged internal_callback. Approved: public (auth via refresh cookie)."))
_register("/api/v1/auth/password-reset/", public(notes="Password reset request."))
_register("/api/v1/auth/password-reset/confirm/", public(notes="Password reset confirm (token in body)."))
_register("/api/v1/auth/session/", public(auth="optional", notes="Session bootstrap; optional auth."))
_register("/api/v1/auth/logout/", owner(auth="required", ownership="acts on own session", disclosure="n/a", notes="Self logout."))
_register("/api/v1/auth/profile/", owner(ownership="Profile.id == actor.id", disclosure="n/a", notes="Self profile read/update (weak-bucket resolved -> owner)."))
_register("/api/v1/auth/staff-invitation/accept/", public(auth="none", audit_event="tenant.staff.invitation_accepted", finding="TEN-01", notes="Public invitee handoff (apps.accounts.urls -> staff_invitation_views.StaffInvitationAcceptView, task 4.2). AllowAny + authentication_classes=[]; the invitee is not yet signed in and sets their OWN password by consuming a single-use token from the emailed link (R4.3). Token is the sole guard; no capability."))

# --- Sessions (apps.accounts.session_views) — self-owned device sessions -----
_register("/api/v1/sessions/", owner(ownership="DeviceSession.user_id == actor.id", disclosure="n/a", notes="Own device sessions list."))
_register("/api/v1/sessions/<uuid:session_id>/revoke/", owner(ownership="DeviceSession.user_id == actor.id", tenant_object_path="session.user_id", audit_event="session.revoke", notes="Revoke own session (weak-bucket resolved -> owner)."))
_register("/api/v1/sessions/revoke-all/", owner(ownership="DeviceSession.user_id == actor.id", audit_event="session.revoke_all", disclosure="n/a", notes="Revoke all own sessions."))

# --- Admin self/aggregate reads (apps.accounts.admin_user_views) -------------
_register("/api/v1/admin/capabilities/", tenant(cap=None, tenant_object_path=None, disclosure="non_revealing_403", finding="AUTH-05", notes="Effective-capabilities self-read (R3.7); admin tier via IsAdmin raw role today. No tenant object; returns caller's own scoped authority."))
_register("/api/v1/admin/scope/", tenant(cap=None, tenant_object_path=None, disclosure="non_revealing_403", finding="AUTH-05", notes="Effective scope self-read; admin tier."))
_register("/api/v1/admin/dashboard/", tenant(cap="tenant.application.read", tenant_object_path="application.institution_ref_id (ApplicationQueryService.scoped_applications) + optional query.institution_id resolved through visible_institution_queryset BEFORE any query", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-02", notes="The truthful admin dashboard metric contract (task 9.2). Authority moved off the raw IsAdmin role string onto HasTenantCapability -> authorize_tenant_surface with the same tenant.application.read read grant the roster spends, so no tenant scope is a masked 404 and in-scope-without-capability is a non-revealing 403. Every application number is computed by ApplicationQueryService.dashboard_counters over scoped_applications; ?institution_id= is resolved against the actor's scope BEFORE the query, so an out-of-scope or unknown id is masked 404 + scope.denied (dashboard.institution) rather than a 200 whose zeros would confirm the id resolves. Metrics are registry entries carrying a definition, a scope, and a source, and are ok-with-an-integer or unknown-with-null: a failed source never renders as zero, and health is derived from the sources rather than defaulted."))
_register("/api/v1/admin/audit-logs/", tenant(cap="tenant.audit.read", tenant_object_path="scoped by AccessScopeService", disclosure="non_revealing_403", finding="ADM-05", notes="Admin audit log read; scope enforced in service."))
_register("/api/v1/admin/templates/", tenant(cap=None, tenant_object_path="query.institution_id", disclosure="non_revealing_403", finding="TEN-08", notes="Communication template list; get_permissions()->IsAdmin (heuristic missed). Tenant-scoped via AccessScopeService; platform (NULL institution) templates are platform.template.manage. No tenant.template.* capability exists yet."))
_register("/api/v1/admin/templates/<str:key>/", tenant(cap=None, tenant_object_path="query.institution_id", idempotency="none", audit_event="template.update", disclosure="non_revealing_403", finding="TEN-08", notes="Communication template update; get_permissions()->IsAdmin (weak-bucket resolved). OUT_OF_SCOPE 403 authorized before lookup; platform templates require super-admin."))

# --- Platform tenant lifecycle (apps.catalog.admin_views) --------------------
_register("/api/v1/admin/institutions/", platform(tenant_object_path=None, audit_event="tenant.create", disclosure="non_revealing_403", by_method={
    "GET": platform(cap="platform.tenant.read_all"),
    "POST": platform(cap="platform.tenant.create", audit_event="tenant.create"),
}, notes="Tenant list/create."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/", platform(tenant_object_path="institution_id", disclosure="non_revealing_403", by_method={
    "GET": platform(cap="platform.tenant.read_all"),
    "PATCH": platform(cap="platform.tenant.update", audit_event="tenant.update"),
}, notes="Tenant detail/update."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/assets/", platform(cap="platform.asset.manage", tenant_object_path="institution_id", audit_event="tenant.asset.change", notes="Tenant assets list/create."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/assets/<uuid:item_id>/", platform(cap="platform.asset.manage", tenant_object_path="institution_id", audit_event="tenant.asset.change", notes="Tenant asset update (weak/raw-role resolved -> platform.asset.manage)."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/assets/upload/", platform(cap="platform.asset.manage", tenant_object_path="institution_id", audit_event="tenant.asset.upload", notes="Tenant asset upload."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/audit/", tenant(cap="tenant.audit.read", tenant_object_path="institution_id (visible_institution_queryset before any audit query)", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-05", audit_event="audit.exported", notes="The one tenant audit feed (task 9.5, R6.6): the SELECTED institution's events, matched on the changes.institution_id every TenantAuditService write records — not on the actor's memberships, which is the different (and wrong in both directions) question /api/v1/admin/audit-logs/ answers. Server-side action/category/entity/actor/date/search filters, page, and facets over the whole filtered set. Read authority is tenant.audit.read resolved for THAT institution through AdminCapabilityService (the IsAdmin role class is gone); ?export=csv additionally requires tenant.application.export and is audited as audit.exported, so the export appears in the feed it exported."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/document-profiles/", platform(cap="platform.document.manage", tenant_object_path="institution_id", audit_event="tenant.document_profile.change", notes="Document profiles list/create."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/document-profiles/<uuid:item_id>/", platform(cap="platform.document.manage", tenant_object_path="institution_id", audit_event="tenant.document_profile.change", notes="Document profile update."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/document-profiles/<uuid:item_id>/clone/", platform(cap="platform.document.manage", tenant_object_path="institution_id", audit_event="tenant.document_profile.clone", notes="Document profile clone."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/domains/", platform(cap="platform.domain.manage", tenant_object_path="institution_id", audit_event="tenant.domain.change", notes="Domains list/create (enqueues verification)."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/domains/<uuid:item_id>/", platform(cap="platform.domain.manage", tenant_object_path="institution_id", audit_event="tenant.domain.change", notes="Domain update/transition."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/domains/<uuid:item_id>/activate/", platform(cap="platform.domain.manage", tenant_object_path="institution_id", audit_event="tenant.domain.activate", notes="Domain activation (super-admin only per policy)."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/domains/<uuid:item_id>/retry/", platform(cap="platform.domain.manage", tenant_object_path="institution_id", audit_event="tenant.domain.retried", finding="TEN-04", notes="Domain verification retry (commits a fresh verification job; task 4.4, R5.1)."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/domains/<uuid:item_id>/approve/", platform(cap="platform.domain.manage", tenant_object_path="institution_id", audit_event="tenant.domain.approved", finding="TEN-04", notes="Domain approve pending_review -> verified (task 4.4, R5.1)."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/domains/<uuid:item_id>/reject/", platform(cap="platform.domain.manage", tenant_object_path="institution_id", audit_event="tenant.domain.rejected", finding="TEN-04", notes="Domain reject pending_review -> rejected (task 4.4, R5.1)."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/domains/<uuid:item_id>/reactivate/", platform(cap="platform.domain.manage", tenant_object_path="institution_id", audit_event="tenant.domain.reactivated", finding="TEN-04", notes="Domain reactivate disabled -> active (task 4.4, R5.1)."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/programs/", platform(cap="platform.program_assignment.manage", tenant_object_path="institution_id", audit_event="tenant.program.assign", finding="TEN-03", notes="Assign canonical program to tenant; platform authority (can_manage_program)."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/programs/<uuid:item_id>/", platform(cap="platform.program_assignment.manage", tenant_object_path="institution_id", audit_event="tenant.program.assign", finding="TEN-03", notes="Program offering update; platform authority."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/readiness/", tenant(cap="tenant.profile.read", tenant_object_path="institution_id", disclosure="not_found_mask", notes="Launch-readiness read; tenant admins may read own school readiness."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/required-documents/", platform(cap="platform.document.manage", tenant_object_path="institution_id", audit_event="tenant.required_document.change", notes="Required documents list/create."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/required-documents/<uuid:item_id>/", platform(cap="platform.document.manage", tenant_object_path="institution_id", audit_event="tenant.required_document.change", notes="Required document update."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/templates/", platform(cap="platform.template.manage", tenant_object_path="institution_id", audit_event="tenant.template.change", notes="Tenant templates list/create."))
_register("/api/v1/admin/institutions/<uuid:institution_id>/templates/<uuid:item_id>/", platform(cap="platform.template.manage", tenant_object_path="institution_id", audit_event="tenant.template.change", notes="Tenant template update."))
_register("/api/v1/admin/access-grants/", platform(cap="platform.access_grant.manage", tenant_object_path="body.institution_id", audit_event="access_grant.change", notes="Access grants list/create."))
_register("/api/v1/admin/access-grants/<uuid:grant_id>/", platform(cap="platform.access_grant.manage", tenant_object_path="grant.institution_id", audit_event="access_grant.change", notes="Access grant update."))
_register("/api/v1/admin/memberships/", platform(cap="platform.user.manage_all", tenant_object_path="body.institution_id", audit_event="membership.change", notes="Memberships list/create."))
_register("/api/v1/admin/memberships/<uuid:membership_id>/", platform(cap="platform.user.manage_all", tenant_object_path="membership.institution_id", audit_event="membership.change", notes="Membership update."))
_register("/api/v1/admin/program-intakes/", platform(cap="platform.intake.manage", tenant_object_path="body.institution_id", audit_event="intake.manage", notes="Program-intake create (already HasPlatformCapability)."))
_register("/api/v1/admin/intakes/", platform(cap="platform.intake.manage", tenant_object_path=None, audit_event="intake.manage", finding="TEN-03", by_method={
    "GET": platform(cap="platform.intake.manage"),
    "POST": platform(cap="platform.intake.manage", audit_event="intake.manage"),
}, notes="Canonical global intake-period management home (task 5.1). Intakes are global (no tenant object); replaces the frozen legacy /catalog/intakes/ writes. HasPlatformCapability(platform.intake.manage)."))
_register("/api/v1/admin/intakes/<uuid:intake_id>/", platform(cap="platform.intake.manage", tenant_object_path=None, audit_event="intake.manage", finding="TEN-03", by_method={
    "GET": platform(cap="platform.intake.manage"),
    "PATCH": platform(cap="platform.intake.manage", audit_event="intake.manage"),
    "DELETE": platform(cap="platform.intake.manage", audit_event="intake.manage"),
}, notes="Canonical intake-period detail/update/deactivate (task 5.1). Global scope; HasPlatformCapability(platform.intake.manage)."))
_register("/api/v1/admin/routing/simulate/", platform(cap="platform.routing.simulate_all", tenant_object_path=None, notes="Routing simulation."))
_register("/api/v1/admin/tenant-audit/", platform(cap="platform.audit.read_all", tenant_object_path=None, finding="ADM-05", notes="Generic tenant-audit endpoint (currently platform; ADM-05 wants a tenant-scoped variant driven by selected institution)."))
_register("/api/v1/admin/users/", tenant(tenant_object_path="profile.id via UserDirectoryQueryService.scoped_users (active membership in visible_institution_queryset) + optional query.institution_id resolved BEFORE any query", disclosure="not_found_mask_then_non_revealing_403", by_method={
    "GET": tenant(cap="tenant.staff.read", composed=["platform.user.manage_all"], tenant_object_path="profile.id via scoped_users", disclosure="not_found_mask_then_non_revealing_403"),
    "POST": tenant(cap="tenant.staff.invite", tenant_object_path="body.institution_id", audit_event="user.create", disclosure="not_found_mask_then_non_revealing_403"),
}, finding="ADM-03", notes="The scoped user-directory query contract (task 9.3, R6.1/R6.2). Search, filters, sort, page, facets, and aggregates are SQL over the whole filtered set; ?export=csv is the same page-independent audited export as /users/export/ and needs tenant.application.export. An out-of-scope ?institution_id= is masked 404 + scope.denied (user.institution) rather than an empty page. POST rejects any field outside CREATE_FIELDS (UNSUPPORTED_FIELD) instead of silently dropping it, applies the ROLE_HIERARCHY ceiling, and creates account + membership in one transaction when an institution is named."))
_register("/api/v1/admin/users/<uuid:pk>/", tenant(cap="tenant.staff.read", composed=["tenant.staff.invite", "tenant.staff.disable", "platform.user.manage_all"], tenant_object_path="profile.id via UserDirectoryQueryService.resolve_user (scope BEFORE lookup)", audit_event="user.update", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-03", notes="User detail/update (task 9.3, R6.2). The scoped fetch IS the query: an out-of-scope target is masked 404 + scope.denied rather than fetched and then compared. PATCH implements every field the edit form sends (email and phone used to be accepted with a 200 and dropped) and rejects anything outside UPDATE_FIELDS. Privilege-escalation guarded: role ceiling, target-above-actor, and self-deactivation, evaluated before any write; a role change or deactivation revokes the target's sessions."))
_register("/api/v1/admin/users/<uuid:pk>/effective-capabilities/", platform(cap="platform.user.manage_all", tenant_object_path=None, disclosure="non_revealing_403", finding="AUTH-04", notes="Read-only Effective_Capabilities for the target user (R3.7, design §5.3). No mutation; out-of-scope target masked as 404."))
_register("/api/v1/admin/users/bulk/", tenant(cap="tenant.staff.invite", composed=["tenant.staff.disable", "platform.user.manage_all"], tenant_object_path="body.user_ids[] narrowed through UserDirectoryQueryService.scoped_users BEFORE any write", idempotency="idempotency_key", audit_event="user_bulk_updated", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-03", notes="One bulk role/status command (task 9.3, R6.5) replacing the browser's per-account PATCH loop. Operations set_role | deactivate | reactivate; MAX_BULK_SIZE=25; SHA-256 confirmation_token over the sorted ids + operation + role checked SERVER-side; all-or-nothing in one transaction with per-target error codes; ROLE_HIERARCHY ceiling on both the assigned role and each target; self-deactivation refused; sessions revoked for every authority change; @idempotent for replay safety."))
_register("/api/v1/admin/users/batch-import/", tenant(cap="tenant.staff.invite", tenant_object_path="body.institution_id resolved through visible_institution_queryset BEFORE any write", idempotency="idempotency_key", audit_event="user_batch_import", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-04", notes="Previewed, tenant-bound, atomic, idempotent batch import (task 9.3, R6.4). Body is {institution_id, mode, rows[]}; institution_id is REQUIRED and every created account gets an active UserInstitutionMembership in the same transaction (ADM-04 created profiles with none). mode declares atomicity: all_or_nothing (default) or per_row, with a savepoint per row in both — surviving rows in per_row, the diagnosis in all_or_nothing. Per-row errors carry a stable code and a 1-based row number matching the operator's file. Role ceiling per row through AdminCapabilityService.can_invite_staff. @idempotent for replay safety. The audit row records email FINGERPRINTS, never addresses."))
_register("/api/v1/admin/users/batch-import/preview/", tenant(cap="tenant.staff.invite", tenant_object_path="body.institution_id resolved through visible_institution_queryset BEFORE any read", audit_event="user_batch_import_previewed", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-04", notes="The validation preview (task 9.3, R6.4). Runs the SAME validator the commit runs and writes nothing, so 'what the preview said' and 'what the commit did' cannot disagree. Returns the rows that would be created, the rows that would fail with their codes, and would_commit. Audited as a bulk read because it discloses which addresses already exist."))
_register("/api/v1/admin/users/export/", tenant(cap="tenant.staff.read", composed=["tenant.application.export", "platform.user.manage_all"], tenant_object_path="profile.id via UserDirectoryQueryService.scoped_users + optional query.institution_id resolved BEFORE any query", audit_event="user.exported", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-03", notes="Page-independent, capability-gated, redacted, bounded, audited user export (task 9.3, R6.5). Accepts the SAME filters as the directory and exports the whole filtered set rather than the loaded page; requires the platform's one tenant export grant (tenant.application.export) and emits auth.denied on refusal; EXPORT_ROW_LIMIT=5000 with EXPORT_TOO_LARGE rather than a silent truncation; institution_count/institution_names are withheld from a tenant actor (not merely hidden — not computed). One implementation shared with /users/?export=csv."))
_register("/api/v1/admin/settings/", platform(cap="platform.settings.manage", tenant_object_path=None, audit_event="settings.change", notes="Platform settings list/create."))
_register("/api/v1/admin/settings/<uuid:pk>/", platform(cap="platform.settings.manage", tenant_object_path=None, audit_event="settings.change", notes="Platform setting detail/update/delete."))
_register("/api/v1/admin/settings/import/", platform(cap="platform.settings.manage", tenant_object_path=None, audit_event="settings.import", notes="Settings import."))
_register("/api/v1/admin/documents/ocr-opt-in/", platform(cap="platform.settings.manage", tenant_object_path=None, audit_event="settings.change", notes="OCR opt-in command (platform-simplification task 18.1, D4): the only reader and writer of documents.ocr_enabled_institution_ids."))
_register("/api/v1/admin/settings/reset/", platform(cap="platform.settings.manage", tenant_object_path=None, audit_event="settings.reset", notes="Settings reset."))

# --- Tenant staff invitations (apps.catalog.staff_invitation_views; task 4.2) -
# Capability-gated staff management: authority resolves through
# AdminCapabilityService.can_invite_staff / get_institution_capabilities
# (Super_Admin platform.user.manage_all OR the tenant.staff.* capability +
# role ceiling), NOT the bare IsAdmin role tier. tenant_capability class:
# out-of-scope object -> indistinguishable 404 (scope-before-lookup); in-scope
# but missing capability -> non-revealing 403 (R4.3/R4.4/R6.3, TEN-01/TEN-05).
_register("/api/v1/admin/staff/invitations/", tenant(tenant_object_path="query.institution / scoped by membership", disclosure="non_revealing_403", by_method={
    "GET": tenant(cap="tenant.staff.read", composed=["platform.user.manage_all"], tenant_object_path="query.institution / scoped by membership", disclosure="non_revealing_403"),
    "POST": tenant(cap="tenant.staff.invite", composed=["platform.user.manage_all"], tenant_object_path="body.institution_id", idempotency="none", audit_event="tenant.staff.invited", disclosure="non_revealing_403"),
}, finding="TEN-01", notes="Tenant staff invitation list(GET, tenant-scoped read)/atomic invite(POST). POST resolves can_invite_staff (super_admin platform.user.manage_all OR tenant.staff.invite + role ceiling); creates identity+invitation+membership in one durable server command and emails a single-use accept link (no plaintext password/token to the browser)."))
_register("/api/v1/admin/staff/candidates/", tenant(cap="tenant.staff.invite", composed=["platform.user.manage_all"], tenant_object_path="query.institution", disclosure="non_revealing_403", finding="TEN-05", notes="Staff candidate email/name search selector (R6.3). Non-super-admin must hold tenant.staff.invite for the queried institution; super_admin all-access. Replaces raw-UUID staff entry."))
_register("/api/v1/admin/staff/invitations/<uuid:invitation_id>/resend/", tenant(cap="tenant.staff.invite", composed=["platform.user.manage_all"], tenant_object_path="invitation.institution_id", idempotency="none", audit_event="tenant.staff.invitation_resent", disclosure="not_found_mask", finding="TEN-01", notes="Resend/rotate token + re-email; single durable command. Out-of-scope/unknown invitation -> indistinguishable 404 mask. tenant.staff.invite (super_admin all-access)."))
_register("/api/v1/admin/staff/invitations/<uuid:invitation_id>/revoke/", tenant(cap="tenant.staff.disable", composed=["platform.user.manage_all"], tenant_object_path="invitation.institution_id", idempotency="none", audit_event="tenant.staff.invitation_revoked", disclosure="not_found_mask", finding="TEN-01", notes="Revoke invitation + deactivate membership + revoke sessions. required_capability=tenant.staff.disable (tenant.staff.invite also accepted); out-of-scope/unknown -> 404 mask."))

# --- Catalog (apps.catalog.views) — public reads + capability-gated writes ---
_register("/api/v1/catalog/assignment-preview/", public(auth="optional", notes="Assignment preview (public)."))
_register("/api/v1/catalog/canonical-programs/", public(auth="optional", notes="Canonical program list (public)."))
_register("/api/v1/catalog/context/", public(auth="optional", notes="Domain/tenant context resolution (public)."))
_register("/api/v1/catalog/subjects/", public(auth="optional", notes="Subject catalogue (public)."))
_register("/api/v1/catalog/institutions/", platform(tenant_object_path=None, disclosure="non_revealing_403", legacy=True, finding="TEN-03", by_method={
    "GET": public(auth="optional"),
    "POST": platform(cap="platform.tenant.create", audit_event="tenant.create"),
}, notes="Legacy catalog institution list(public)/create(platform, capability-gated in-body)."))
_register("/api/v1/catalog/institutions/<uuid:institution_id>/", platform(tenant_object_path="institution_id", disclosure="non_revealing_403", legacy=True, finding="TEN-03", by_method={
    "GET": public(auth="optional"),
    "PATCH": platform(cap="platform.tenant.update", audit_event="tenant.update"),
    "DELETE": platform(cap="platform.tenant.deactivate", audit_event="tenant.deactivate"),
}, notes="Legacy catalog institution detail; management is platform authority (heuristic said tenant)."))
_register("/api/v1/catalog/intakes/", platform(tenant_object_path="body.institution_id", disclosure="non_revealing_403", legacy=True, finding="TEN-03", by_method={
    "GET": public(auth="optional"),
    "POST": platform(cap="platform.intake.manage", audit_event="intake.manage"),
}, notes="Legacy catalog intake list(public)/create(platform.intake.manage)."))
_register("/api/v1/catalog/intakes/<uuid:intake_id>/", platform(cap="platform.intake.manage", tenant_object_path="intake.institution_id", disclosure="non_revealing_403", legacy=True, finding="TEN-03", by_method={
    "GET": public(auth="optional"),
    "PATCH": platform(cap="platform.intake.manage", audit_event="intake.manage"),
    "DELETE": platform(cap="platform.intake.manage", audit_event="intake.manage"),
}, notes="Legacy catalog intake detail."))
_register("/api/v1/catalog/programs/", platform(tenant_object_path="body.institution_id", disclosure="non_revealing_403", legacy=True, finding="TEN-03", by_method={
    "GET": public(auth="optional"),
    "POST": platform(cap="platform.program_assignment.manage", audit_event="tenant.program.assign"),
}, notes="Legacy catalog program list(public)/create(platform)."))
_register("/api/v1/catalog/programs/<uuid:program_id>/", platform(tenant_object_path="program.institution_id", disclosure="non_revealing_403", legacy=True, finding="TEN-03", by_method={
    "GET": public(auth="optional"),
    "PATCH": platform(cap="platform.program_assignment.manage", audit_event="tenant.program.assign"),
    "DELETE": platform(cap="platform.program_assignment.manage", audit_event="tenant.program.assign"),
}, notes="Legacy catalog program detail; management is platform authority."))

# --- Applications: student-owned draft/lifecycle (owner) ---------------------
_register("/api/v1/applications/", tenant(tenant_object_path="scoped by AccessScopeService / body canonical ids", disclosure="not_found_mask", finding="DATA-01", by_method={
    "GET": tenant(cap="tenant.application.read", tenant_object_path="scoped list"),
    "POST": owner(ownership="creates own application", tenant_object_path="body canonical ids"),
}, notes="Dual list(staff, tenant-scoped read)/create(student owner). Legacy string-create path is DATA-01."))
_register("/api/v1/applications/<uuid:application_id>/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", audit_event="application.update", notes="Student draft CRUD; IsOwnerOrAdmin (owner + scoped staff)."))
_register("/api/v1/applications/<uuid:application_id>/details/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", notes="Application details; IsOwnerOrAdmin."))
_register("/api/v1/applications/<uuid:application_id>/documents/", owner(composed=["tenant.document.read"], tenant_object_path="application.institution_id", disclosure="not_found_mask", finding="STU-19", notes="Application documents list (SJR task 3.19, R5-g). Owner or staff through resolve_owner_or_scoped_application with tenant.document.read; an assignment-scoped reviewer only for assigned work. A non-owner student, an out-of-scope or unassigned staff actor and an unknown id receive one byte-identical 404 (previously a non-owner got 403 INSUFFICIENT_PERMISSIONS, which confirmed the application existed). The raw role == admin branch is gone."))
_register("/api/v1/applications/<uuid:application_id>/required-documents/", owner(composed=["tenant.document.read"], tenant_object_path="application.institution_id", disclosure="not_found_mask", finding="STU-13", notes="Versioned required-document upload contract the student wizard renders from (task 7.2, R11.6). Owner + scoped staff; out-of-scope masked as 404 so another tenant's requirement configuration cannot be inferred."))
_register("/api/v1/applications/<uuid:application_id>/grades/", owner(tenant_object_path="application.institution_id", notes="Grades read/write; owner (IsOwnerOrAdmin)."))
_register("/api/v1/applications/<uuid:application_id>/submit/", owner(tenant_object_path="application.institution_id", state_precondition="status == draft", idempotency="required", audit_event="application.submit", notes="Student submits own application; readiness re-evaluated under lock."))
_register("/api/v1/applications/<uuid:application_id>/withdraw/", owner(tenant_object_path="application.institution_id", state_precondition="status in {submitted, under_review, waitlisted}", idempotency="supported", audit_event="application.withdraw", disclosure="not_found_mask", finding="AUTH-07", notes="Owner-only; CURRENT behavior returns 403 NOT_OWNER (discloses existence). Target: 404 not-found mask (AUTH-07)."))
_register("/api/v1/applications/<uuid:application_id>/confirm-enrollment/", owner(tenant_object_path="application.institution_id", state_precondition="status in {approved, conditionally_approved+verified}", idempotency="supported", audit_event="enrollment.confirm", disclosure="not_found_mask", finding="AUTH-07", notes="Owner-only (weak-bucket resolved). CURRENT 403 NOT_OWNER; target 404 mask."))
_register("/api/v1/applications/<uuid:application_id>/amendments/", owner(tenant_object_path="application.institution_id", audit_event="amendment.requested", disclosure="not_found_mask", finding="AUTH-07", notes="Owner requests amendment (POST) and reads their own amendment history (GET, added by task 10.2 — STU-17's 'students can submit amendments but cannot list or track them'). The GET is owner-only, paginated in the registered page/pageSize/totalCount/results envelope, and publishes each status with its own definition; the reviewer's identity is deliberately NOT published (that is the school's record, and it is in the tenant audit feed). The POST additionally enforces SAME-FIELD pending uniqueness (task 10.2): a second pending request for a field that already has one is AMENDMENT_ALREADY_PENDING (409) naming the request in flight, because two pending requests for one field are two answers to the same question and whichever was approved last would silently overwrite the other. MAX_PENDING_AMENDMENTS stays 3, application-wide. The rule is enforced under the select_for_update lock on the application row that every creator of a pending row already takes, so it needs no index. Task 9.5 (AUTH-06/R13.10) corrected who the request NOTIFIES: recipients resolve through TenantStaffRecipientService — the staff holding tenant.application.review for THIS application's institution — instead of Profile.objects.filter(role__in=['admin','super_admin']), which sent an applicant's name and application number to every school on the platform. The fan-out is written through the durable communication outbox with a per-recipient idempotency key, and the amendment.requested event records the capability, the recipient count and (when zero) why."))
_register("/api/v1/applications/<uuid:application_id>/waitlist-position/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", notes="Owner + scoped staff; staff out-of-scope already 404-masked; non-owner student currently 403 (AUTH-07 family)."))
_register("/api/v1/applications/<uuid:application_id>/conditions/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", disclosure="not_found_mask", finding="STU-16", notes="Owner + scoped staff read. Task 10.2 (R13.9) made the read useful rather than a status list: every condition carries its state definition, who the state is waiting on, its current evidence version plus the superseded ones, the reviewer's reason, the append-only history and the actions THIS reader may take (allowed_actions differs for the owner and for staff). Two extra queries for the whole list, never one per condition. Every pre-10.2 key is unchanged."))
_register("/api/v1/applications/<uuid:application_id>/conditions/<uuid:condition_id>/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", disclosure="not_found_mask", finding="STU-16", notes="One condition with its evidence, comments, review reason and history (task 10.2, R13.9). Two scopes in order: the APPLICATION is resolved through the owner disclosure policy, then the condition is looked up WITHIN that application — so a condition id belonging to another application, or another tenant's, is an indistinguishable 404 rather than a confirmation that it exists."))
_register("/api/v1/applications/<uuid:application_id>/conditions/<uuid:condition_id>/evidence/", owner(tenant_object_path="application.institution_id", state_precondition="condition.status in {pending, evidence_submitted, changes_required} (ConditionStateMachine)", idempotency="supported", audit_event="condition.evidence_submitted", disclosure="not_found_mask", finding="STU-16", notes="The student attaches or REPLACES this condition's evidence, with an optional note (task 10.2, R13.9). Owner-only for the same reason withdraw and amendment-request are: it is the applicant's own evidence, and letting staff post as the student would make the version row's provenance untrue. The write is task 7.3's command unchanged — hash, replay short-circuit, COMMIT a stage row, write the object, VERIFY it, COMMIT metadata, compensate on failure — with document_type = 'condition_evidence:{condition_id}', so the platform's own one-current partial unique index means exactly one current evidence version PER CONDITION and a replacement supersedes rather than overwrites. The student's comment goes on the append-only document_verification_events row for the version it describes. Notifies the school's authorized reviewers through 9.5's recipient resolver (inbox-only staff class, 10.1)."))
_register("/api/v1/applications/<uuid:application_id>/conditions/<uuid:condition_id>/review/", tenant(cap="tenant.application.review", tenant_object_path="application.institution_ref_id (resolve_scoped_application before any lookup, then require_reviewer_assignment)", state_precondition="ConditionStateMachine.can_transition(condition.status, outcome) AND expected_version == application.version when supplied", audit_event="condition.reviewed", disclosure="not_found_mask_then_non_revealing_403", finding="STU-16", notes="THREE outcomes, which is what STU-16 was missing: met (accept), changes_required (ask for something else) and waived. changes_required and waived REQUIRE a reason of at least 10 characters — asking a student for something different without saying what is the dead end this task removes, and design 11.2 calls a waiver an 'explicit authorized reason'. The condition status, the reason on the condition row and the append-only history row against the evidence version being judged commit inside one lock, and the transition is asserted against the status as re-read UNDER that lock. Versioned command like every other decision. The older two-outcome .../verify/ route remains for its existing callers and now shares the same state machine; collapsing the two front doors belongs to task 10.6."))
_register("/api/v1/applications/<uuid:application_id>/interviews/", owner(composed=["tenant.application.review"], tenant_object_path="application.institution_id", by_method={
    "GET": owner(composed=["tenant.application.read"]),
    "POST": tenant(cap="tenant.application.review", audit_event="interview.schedule"),
    "PUT": tenant(cap="tenant.application.review", audit_event="interview.update"),
    "PATCH": tenant(cap="tenant.application.review", audit_event="interview.update"),
    "DELETE": tenant(cap="tenant.application.review", audit_event="interview.cancel"),
}, notes="Student reads own interviews; staff schedule/update via tenant.application.review (composed)."))
_register("/api/v1/applications/<uuid:application_id>/summary/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", notes="Application summary; IsOwnerOrAdmin."))
# /api/v1/applications/<uuid:application_id>/preview-summary/ — RETIRED. Task 7.4
# deleted the generative student preview summary (R11.1: the admissions runtime
# makes no generative AI call), and the route left the URLconf with it. Its
# replacement is the deterministic review step the wizard already renders from
# the application's own persisted data.
#
# /api/v1/applications/<uuid:application_id>/email-slip/ — RETIRED. Task 10.4
# reduced it to a thin proxy after measuring zero first-party callers, and task
# 10.6 (R13.5, finding API-04) removed the route, its view and its two
# serializers on a second zero reading. Its successor is
# POST /api/v1/applications/<id>/official-documents/<document_type>/email/ —
# registered above — which is the ONE canonical official-document email.
#
# Both entries are DELETED rather than left in place, for the same reason the
# ``admin-summary/`` entry below was: a registry entry for a route the URLconf
# does not serve is drift, not documentation. That is not a style preference —
# ``test_authority_matrix_v2.py::test_no_stale_registry_entries`` and
# ``::test_zero_unclassified_gate_passes_on_live_surface`` both FAIL while
# either entry is present, and both had been failing on exactly these two paths
# since 10.6 / 7.4 landed. De-registering a stale entry is a different act from
# deleting a live route: nothing about the served surface changes, so there is
# no contract to deprecate and no external caller to warn (admissions-v2 task
# 12.2, R2.5-R2.7 / R14.5).
_register("/api/v1/applications/<uuid:application_id>/official-documents/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", disclosure="not_found_mask", finding="STU-18", notes="Owner + scoped staff; canonical 404 not-found masking (the model disclosure baseline). Weak-bucket resolved -> owner."))
_register("/api/v1/applications/<uuid:application_id>/official-documents/<str:document_type>/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", state_precondition="issuance gate on POST (per-type status/payment); read-existing policy on GET (a lawful issued artifact stays readable after the application is terminal)", disclosure="not_found_mask", finding="STU-18", notes="Owner + scoped staff; gate closed and nothing issued -> 404 mask (never leaks existence). Task 10.4 split the two policies (design 11.3): the POST gate is byte-for-byte the pre-10.4 one, and the GET additionally admits an already-issued artifact. Weak-bucket resolved."))
_register("/api/v1/applications/<uuid:application_id>/official-documents/<str:document_type>/email/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", state_precondition="the read-existing gate AND status == ready (a document that is not there emails nothing: 409 DOCUMENT_NOT_READY)", audit_event="official_document.emailed", disclosure="not_found_mask", finding="API-04", notes="Task 10.4 (R13.5): the ONE canonical official-document email, for every document type. Reuses the detail view's authorize+gate with for_issue=False, so emailing an issued artifact survives a terminal application. Recipient is the application owner's own account address only -- another address is RECIPIENT_NOT_PERMITTED (400), because an official record is not redirectable. Delivery goes through task 10.1's deliver_message gate, so the send appears in the student's communications history with a classified category and per-channel state. The legacy /email-slip/ route is a deprecated proxy onto this one, not a second implementation."))

# --- Applications: staff review / decisions (tenant capability) --------------
_register("/api/v1/applications/<uuid:application_id>/review/", tenant(cap="tenant.application.review", tenant_object_path="application.institution_ref_id (resolve_scoped_application before any lookup, then require_application_capability, then require_reviewer_assignment)", state_precondition="valid ALLOWED_TRANSITIONS transition AND expected_version == application.version when supplied", idempotency="required", audit_event="application.review_decided", disclosure="not_found_mask_then_non_revealing_403", finding="AUTH-01", notes="Core review/decision + payment-review command. Authority is the derived tenant.application.review capability (task 2.2); no role string is compared. Versioned command (task 9.4): expected_version (body) or If-Match is checked before the transaction AND again on the LOCKED row, so a decision issued from a stale workspace is refused with VERSION_CONFLICT (409) rather than overwriting a newer one; every success advances application.version with an F() expression and returns the new version plus the allowed transitions (R8.4)."))
_register("/api/v1/applications/<uuid:application_id>/verify-document/", tenant(cap="tenant.document.verify", tenant_object_path="application.institution_ref_id (resolve_scoped_application before any lookup)", state_precondition="expected_version == application.version when supplied", audit_event="document.verification_decided", disclosure="not_found_mask_then_non_revealing_403", finding="AUTH-02", notes="Document verification through the 7.3 evidence command (canonical lifecycle_state + append-only verification history). Versioned command (task 9.4): verifying evidence changes what a decision rests on, so a stale command is VERSION_CONFLICT (409), and a success advances application.version and returns it."))
# /api/v1/applications/<uuid:application_id>/admin-summary/ — RETIRED. Task 7.4
# deleted the generative admin review summary (R11.1: the admissions runtime makes
# no generative AI call for reviewer summaries) and admissions-v2 task 9.4 removed
# the last caller (the workspace's "AI" tab, which had been calling a route that no
# longer existed). Its replacement is the deterministic ``readiness`` section of
# GET /api/v1/admin/applications/<uuid:application_id>/ — registered above. The
# entry is deleted rather than left in place because a registry entry for a route
# the URLconf does not serve is drift, not documentation.
_register("/api/v1/applications/<uuid:application_id>/amendments/<uuid:amendment_id>/review/", tenant(cap="tenant.application.review", tenant_object_path="application.institution_ref_id (resolve_scoped_application before any lookup, then require_reviewer_assignment)", state_precondition="amendment.status == pending AND expected_version == application.version when supplied", audit_event="amendment.review_decided", disclosure="not_found_mask_then_non_revealing_403", finding="AUTH-06", notes="Amendment review. Task 9.4 moved this off the fetch-then-check _staff_can_access_application shape onto resolve_scoped_application, so scope precedes the lookup and an assignment-scoped Reviewer is restricted to their own assigned work (previously they were not restricted at all). Versioned command; emits amendment.review_decided recording the field NAME, the outcome and a bounded reason — never the amended value, which is applicant PII."))
_register("/api/v1/applications/<uuid:application_id>/conditions/<uuid:condition_id>/verify/", tenant(cap="tenant.application.review", tenant_object_path="application.institution_ref_id (resolve_scoped_application before any lookup, then require_reviewer_assignment)", state_precondition="ConditionStateMachine.can_transition(condition.status, status) AND expected_version == application.version when supplied", audit_event="condition.verification_decided", disclosure="not_found_mask_then_non_revealing_403", finding="AUTH-02", notes="Offer-condition verification (met / waived). Task 9.4 moved this off fetch-then-check onto resolve_scoped_application and made it a versioned command: waiving a mandatory condition is the difference between a conditional and an unconditional place. ConditionManager may itself promote or reject the application, so the status is re-read before the allowed transitions are published (R8.4). Task 10.2 replaced its inline status != 'pending' guard with the one ConditionStateMachine, so this two-outcome front door and the three-outcome .../review/ command cannot disagree about which conditions may be decided — and a condition carrying submitted evidence (evidence_submitted) can now be verified instead of the evidence workflow blocking the decision it exists to support. The stable CONDITION_NOT_PENDING code and message are unchanged."))
_register("/api/v1/applications/<uuid:application_id>/amendments/<uuid:amendment_id>/", owner(tenant_object_path="application.institution_id", disclosure="not_found_mask", finding="STU-17", notes="One of the student's OWN amendment requests (task 10.2, R13.9-R13.10). Two scopes in order: the application through the owner disclosure policy, then the amendment WITHIN that application — so another student's amendment id, an amendment belonging to a different application, and an unknown id are one indistinguishable 404. Adds old_value and the request reason to the list shape; still publishes no reviewer identity."))
_register("/api/v1/applications/<uuid:application_id>/acceptance-letter/", tenant(cap="tenant.application.review", tenant_object_path="application.institution_id", audit_event="document.generate", disclosure="not_found_mask", finding="API-04", notes="Legacy admin doc-gen; official-documents consolidation (10.4)."))
_register("/api/v1/applications/<uuid:application_id>/application-slip/", tenant(cap="tenant.application.review", tenant_object_path="application.institution_id", audit_event="document.generate", disclosure="not_found_mask", finding="API-04", notes="Legacy admin doc-gen."))
_register("/api/v1/applications/<uuid:application_id>/conditional-offer/", tenant(cap="tenant.application.review", tenant_object_path="application.institution_id", audit_event="document.generate", disclosure="not_found_mask", finding="API-04", notes="Legacy admin doc-gen."))
_register("/api/v1/applications/<uuid:application_id>/payment-receipt/", tenant(cap="tenant.payment.read", tenant_object_path="application.institution_id", audit_event="document.generate", disclosure="not_found_mask", finding="API-04", notes="Legacy admin doc-gen."))
_register("/api/v1/applications/<uuid:application_id>/finance-receipt/", tenant(cap="tenant.payment.read", tenant_object_path="application.institution_id", audit_event="document.generate", disclosure="not_found_mask", finding="API-04", notes="Legacy admin doc-gen."))

# --- Applications: reviewer assignment / super-admin actions -----------------
_register("/api/v1/applications/<uuid:application_id>/assign/", tenant(cap="tenant.application.review", tenant_object_path="application.institution_ref_id (resolve_scoped_application before any lookup)", state_precondition="expected_version == application.version when supplied", audit_event="assignment.decided", disclosure="not_found_mask_then_non_revealing_403", finding="AUTH-03", notes="Manual reviewer assignment. MOVED from platform.user.manage_all (an IsSuperAdmin role class) to the TENANT matrix by admissions-v2 task 9.4: design 5.3 puts reviewer assignment behind 'active membership in the application's tenant and an eligible reviewer policy', and AUTH-02 names denying legitimate tenant operators as the defect, so a Tenant_Admin holding tenant.application.review may staff their own review queue. The reviewer must still be an eligible member of the APPLICATION'S tenant, enforced under row locks by ReviewerAssignmentService (2.5), so the widened actor set cannot select a cross-tenant reviewer. Versioned command; a Super_Admin still passes on all_access."))
_register("/api/v1/applications/<uuid:application_id>/assignment-candidates/", tenant(cap="tenant.application.review", tenant_object_path="application.institution_ref_id (resolve_scoped_application before any lookup)", disclosure="not_found_mask_then_non_revealing_403", finding="AUTH-03", notes="Tenant-scoped reviewer candidate search (2.5, R8.2). MOVED from platform.user.manage_all to the tenant matrix alongside /assign/ (task 9.4) — a Tenant_Admin who may assign must be able to see who is assignable. Lists only eligible members of the application's OWN tenant, so it cannot be used to enumerate another tenant's staff. enforce_reviewer_assignment=False deliberately: choosing who reviews is queue staffing, not acting on assigned work."))
_register("/api/v1/applications/auto-assign/", platform(cap="platform.user.manage_all", tenant_object_path="scoped batch (per-application institution resolved inside ReviewerAssignmentService)", audit_event="assignment.decided", finding="AUTH-03", notes="Auto-assign reviewers. Task 9.4 replaced the IsSuperAdmin role class with AdminCapabilityService.require_capability(platform.user.manage_all) — the same actors, but the decision now comes from the capability service (AUTH-02). Deliberately NOT widened to the tenant matrix like /assign/: this command sweeps every unassigned application the platform holds, so a tenant-scoped actor issuing it would act far outside their own scope. Selects only tenant-eligible reviewers per application and locks workload counters (2.5, design §5.3)."))
_register("/api/v1/applications/<uuid:application_id>/fee-waiver/", platform(cap="platform.settings.manage", tenant_object_path="application.institution_ref_id (resolve_scoped_application after the platform capability check, so the not-found mask matches every other application route)", state_precondition="expected_version == application.version when supplied", idempotency="supported", audit_event="fee_waiver.grant", notes="Fee waiver. Task 9.4 replaced the IsSuperAdmin role class with AdminCapabilityService.require_capability(platform.settings.manage) — same actors, capability-derived decision (AUTH-02). Stays PLATFORM rather than joining the tenant matrix: a waiver forgives money the tenant is owed, and task 8.4 put fee writes behind a platform capability for the same reason. Versioned command."))
_register("/api/v1/applications/bulk-status/", tenant(cap="tenant.application.review", tenant_object_path="per-item application.institution_ref_id (AccessScopeService.filter_applications + apply_reviewer_assignment_scope BEFORE select_for_update)", state_precondition="every id in ALLOWED_TRANSITIONS AND expected_versions[id] == application.version when supplied", audit_event="application.review_bulk_decided", disclosure="not_found_mask", finding="AUTH-02", notes="Bulk status change; max 25, all-or-nothing, SHA-256 confirmation token verified server-side. Task 9.4: the scoped queryset is now what the row lock is taken on (it used to fetch every requested id and then intersect with scope), composed with apply_reviewer_assignment_scope so an assignment-scoped Reviewer cannot bulk-decide work never assigned to them — the single-application command has enforced that since task 2.2, the bulk command did not. Per-id expected_versions are honoured; a moved row fails the batch as VERSION_CONFLICT rather than being overwritten. One application.review_bulk_decided Audit_Event records the actor, the institution scope, the target status and the affected ids — never an applicant field. updated_count reports the APPLIED set."))
_register("/api/v1/applications/export/", tenant(cap="tenant.application.export", tenant_object_path="application.institution_ref_id via ApplicationQueryService.scoped_applications; identifier filters resolved against scope BEFORE the query", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-01", audit_event="application.exported", notes="The applications export. Task 9.4 turned this route into a DELEGATION to the one export path (ApplicationQueryService + AdminApplicationQueryView._export), the same implementation GET /api/v1/admin/applications/?export=csv uses. Four things changed and none of them is the route or its authority: it no longer paginates (?page=2 used to produce a different export), redaction is the contract's one capability-driven RedactionPolicy instead of a second _redact_name/_redact_email/_redact_phone implementation keyed on all_access, the row ceiling is the declared EXPORT_ROW_LIMIT with EXPORT_TOO_LARGE instead of a silent [:10000], and the export is recorded as an application.exported Audit_Event carrying actor/scope/filters/row count — never the rows."))
_register("/api/v1/applications/history/", owner(composed=["tenant.application.read"], tenant_object_path="application.institution_id", notes="Timeline/history; owner + scoped staff."))
_register("/api/v1/applications/interviews/", owner(composed=["tenant.application.review"], tenant_object_path="scoped", notes="Canonical interview list (?mine=true student; staff scoped)."))

# --- Applications: drafts (student-owned) ------------------------------------
_register("/api/v1/applications/drafts/", owner(ownership="Application(draft).user_id == actor.id", notes="Multi-draft list/start (owner)."))
_register("/api/v1/applications/drafts/<uuid:application_id>/", owner(ownership="Application(draft).user_id == actor.id", tenant_object_path="application.institution_id", state_precondition="PATCH: status == draft AND required expected_version == application.version under select_for_update", idempotency="required for PATCH", disclosure="not_found_mask", finding="STU-02 / STU-12 / GATE-13.2-03", notes="Canonical draft detail/update/delete. Student answer PATCH is the sole versioned writer: the exact command carries Idempotency-Key + expected_version, advances the server version once, and returns VERSION_CONFLICT/current_version without mutation to a stale tab. Generic student application PATCH is refused."))
_register("/api/v1/applications/drafts/<uuid:application_id>/rename/", owner(ownership="Application(draft).user_id == actor.id", tenant_object_path="application.institution_id", disclosure="not_found_mask", finding="STU-12", notes="Draft rename (label) command — validated draft_name only, never assignment fields (task 6.2, R10.9)."))
_register("/api/v1/applications/drafts/<uuid:application_id>/change-selection/", owner(ownership="Application(draft).user_id == actor.id", tenant_object_path="resolved host institution + body canonical ids", state_precondition="status == draft AND no payment activity for a reassignment", idempotency="supported", audit_event="application.change_selection", disclosure="not_found_mask", finding="STU-01", notes="Transactional reroute command (task 6.4, R7.2/R10.5) — the ONLY writer of assignment ids/snapshots. Canonical ids only; trusted host wins (INSTITUTION_OVERRIDE_NOT_PERMITTED); payment activity locks assignment (ASSIGNMENT_LOCKED_BY_PAYMENT + recovery path)."))

# --- Applications: public tracking -------------------------------------------
_register("/api/v1/applications/track/", public(auth="optional", finding="STU-22", tenant_object_path="trusted host tenant", state_precondition="a live (non-revoked) tracking secret resolves, AND — when a trusted white-label host is present — the application belongs to that host's tenant", audit_event="application.tracking_attempted", disclosure="public", notes="Public tracking, hardened by task 10.5 (R13.12, STU-22 + TEN-10). The credential is a random split token stored as SHA-256 and compared with compare_digest; the application number and the legacy public_tracking_code authorise NOTHING and are answered from the string alone (400 TRACKING_SECRET_REQUIRED, no query, so the refusal cannot be an existence oracle). Unknown selector, revoked secret, wrong verifier and tenant-host mismatch all return the identical masked 404 NOT_FOUND. Failed attempts are charged per IP (PublicTrackingFailureThrottle, 10/10m) on top of RateLimitMiddleware's coarse 20/10m request budget; a valid holder never spends the failure budget. Every attempt is audited via TenantAuditService with the outcome only — never the token, a prefix of it, or a digest of it. The response is the minimal aligned contract (application_number, status, program_name, intake_name, institution, submitted_at, updated_at)."))

_register("/api/v1/applications/<uuid:application_id>/tracking-link/", owner(tenant_object_path="application.institution_id", state_precondition="none — the owner may issue at any lifecycle stage; issuing REVOKES the previously issued secret", idempotency="none (each call deliberately rotates)", audit_event="application.tracking_link_issued", disclosure="not_found_mask", finding="STU-22", notes="The one place a public tracking secret comes into existence (task 10.5, R13.12/R13.6). Owner-only and NOT staff-accessible: issuing rotates, so a staff call would silently revoke the applicant's own link. The plaintext is returned once — it is stored only as a hash and no read can return it, which is why acquiring a link is a command rather than a field. The absolute URL is built from the request's own origin so a student on a white-label host gets a link back to the only host that will resolve it (TEN-10). The audit records that a rotation happened, never the code."))

# --- Documents: student-owned storage (owner) --------------------------------
_register("/api/v1/documents/upload/", owner(ownership="uploaded against own application", composed=["tenant.document.read"], tenant_object_path="document.application.institution_id", audit_event="document.upload", notes="Document upload; owner (student) primary."))
_register("/api/v1/documents/<uuid:document_id>/delete/", owner(composed=["tenant.document.verify"], tenant_object_path="document.application.institution_id", audit_event="document.delete", disclosure="not_found_mask", finding="STU-19", notes="Delete document (weak-bucket resolved -> owner)."))
_register("/api/v1/documents/<uuid:document_id>/download/", owner(composed=["tenant.document.read"], tenant_object_path="document.application.institution_id", disclosure="not_found_mask", notes="Download (SJR task 3.19, R5-g): owner or scoped staff through resolve_owner_or_scoped_document with tenant.document.read; an assigned in-scope reviewer is served, an unassigned one is the masked 404."))
_register("/api/v1/documents/<uuid:document_id>/info/", owner(composed=["tenant.document.read"], tenant_object_path="document.application.institution_id", disclosure="not_found_mask", notes="Document info (SJR task 3.19, R5-g): owner or scoped staff through resolve_owner_or_scoped_document with tenant.document.read; an assigned in-scope reviewer is served, an unassigned one is the masked 404."))
_register("/api/v1/documents/<uuid:document_id>/signed-url/", owner(composed=["tenant.document.read"], tenant_object_path="document.application.institution_id", disclosure="not_found_mask", notes="Signed URL (SJR task 3.19, R5-g, R5-h): owner or scoped staff through resolve_owner_or_scoped_document with tenant.document.read; an assigned in-scope reviewer is served, an unassigned one is the masked 404. The presigned read carries ResponseContentDisposition (content_disposition_for)."))
_register("/api/v1/documents/<uuid:document_id>/versions/", owner(composed=["tenant.document.read"], tenant_object_path="document.application.institution_id", disclosure="not_found_mask", finding="STU-19", notes="Version history (weak-bucket resolved)."))
_register("/api/v1/documents/<uuid:document_id>/extract/", owner(composed=["tenant.document.verify"], tenant_object_path="document.application.institution_id", ai_touchpoint=True, disclosure="not_found_mask", finding="STU-06", notes="OCR/extract; deterministic-OCR touchpoint (7.5)."))

# --- Payments: student-owned pay/defer/recover (owner) -----------------------
_register("/api/v1/payments/", owner(composed=["tenant.payment.read"], tenant_object_path="payment.application.institution_id", disclosure="not_found_mask", finding="ADM-06", notes="Payment list; student own history + staff scoped (tenant.payment.read)."))
_register("/api/v1/payments/initiate/", owner(ownership="payment on own application", tenant_object_path="application.institution_id", idempotency="required", audit_event="payment.initiate", disclosure="not_found_mask", finding="AUTH-07", notes="Owner initiates payment (weak-bucket resolved). CURRENT 403 NOT_OWNER; target 404 mask (AUTH-07)."))
_register("/api/v1/payments/mobile-money/", owner(ownership="payment on own application", tenant_object_path="application.institution_id", idempotency="required", audit_event="payment.mobile_money", disclosure="not_found_mask", finding="AUTH-07", notes="Owner mobile-money initiate (weak-bucket resolved)."))
_register("/api/v1/payments/defer/", owner(ownership="payment on own application", tenant_object_path="application.institution_id", idempotency="required", audit_event="payment.defer", disclosure="not_found_mask", finding="AUTH-07", notes="Owner defers payment (weak-bucket resolved)."))
_register("/api/v1/payments/dev-bypass/", owner(ownership="payment on own application", tenant_object_path="application.institution_id", dev_only=True, disclosure="not_found_mask", notes="Dev-only simulate; require_not_dev_bypass_in_production -> 404 in production (Phase 5). Weak-bucket resolved -> owner."))
_register("/api/v1/payments/resolve-fee/", owner(ownership="self-service; no object", tenant_object_path=None, disclosure="n/a", finding="STU-08", notes="Fee resolution self-service (weak-bucket resolved -> owner)."))
_register("/api/v1/payments/quote/", owner(ownership="quote on own application", tenant_object_path="application.institution_id", disclosure="not_found_mask", finding="STU-08", notes="Server-authored expiring fee quote (task 8.1). GET reads the live quote, POST creates/reuses it; both load the application through authorize_owned_application(allow_scoped_staff=False), so a non-owned or malformed id returns the same APPLICATION_NOT_FOUND mask."))
_register("/api/v1/payments/<uuid:payment_id>/verify/", tenant(cap="tenant.payment.verify", tenant_object_path="payment.application.institution_id", idempotency="required", audit_event="payment.verify", disclosure="not_found_mask", finding="AUTH-02", notes="Payment verification; -> tenant.payment.verify."))
_register("/api/v1/payments/<uuid:payment_id>/receipt/", owner(composed=["tenant.payment.read"], tenant_object_path="payment.application.institution_id", disclosure="not_found_mask", notes="Payment receipt; owner + scoped staff."))
_register("/api/v1/payments/<uuid:payment_id>/correct/", platform(cap="platform.settings.manage", tenant_object_path="payment.application.institution_id", idempotency="required", audit_event="payment.correct", disclosure="non_revealing_403", notes="Super-admin payment correction (Phase 5)."))
_register("/api/v1/payments/risk-flags/", platform(cap="platform.settings.manage", tenant_object_path=None, disclosure="non_revealing_403", notes="Super-admin risk-flag review (Phase 5)."))
_register("/api/v1/payments/settlements/", tenant(cap="tenant.payment.read", tenant_object_path="payment.application.institution_id (visible_institution_queryset before any filter)", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-06", audit_event="settlement.exported", notes="Settlement report (task 8.4). Gated by HasTenantCapability -> authorize_tenant_surface: no tenant scope is a 404 mask, in-scope-without-capability a non-revealing 403. institution_id / program_offering_id filters resolve through visible_institution_queryset BEFORE the query, so an out-of-scope id is masked 404 + scope.denied. ?export=csv additionally requires tenant.application.export, is page-independent, redacted by capability, bounded by EXPORT_ROW_LIMIT, and audited as settlement.exported."))
_register("/api/v1/payments/webhook/lenco/", callback(audit_event="payment.webhook", notes="Lenco webhook; HMAC-SHA512 verified; 200 on every outcome."))
_register("/api/v1/admin/fees/", tenant(cap="tenant.program.read", tenant_object_path="program.institution_id (visible_institution_queryset before any filter)", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-06", audit_event="fee.exported", notes="Scoped fee-administration report (task 8.4): server-side filters, page, and coverage aggregates over the whole filtered set — replaces the per-offering broad fetch the admin page used to do. Read authority is tenant.program.read; ?export=csv additionally requires tenant.application.export and is audited as fee.exported. Fee WRITES stay on /api/v1/programs/<id>/fees/."))
_register("/api/v1/admin/applications/", tenant(cap="tenant.application.read", tenant_object_path="application.institution_ref_id (AccessScopeService.filter_applications + visible_institution_queryset before any filter)", disclosure="not_found_mask_then_non_revealing_403", finding="ADM-01", audit_event="application.exported", notes="The ONE scoped applications query contract (task 9.1): server-side search, filters, sort, page, facets, whole-filtered-set aggregates, and deadline state — replacing the browser's page-derived totals and harvested filter options. Gated by HasTenantCapability -> authorize_tenant_surface (no tenant scope is a 404 mask, in-scope-without-capability a non-revealing 403), then composed with apply_reviewer_assignment_scope so a Reviewer sees only assigned work. institution_id / program_offering_id / intake_id / assigned_reviewer_id filters resolve against scope BEFORE the query, so an out-of-scope id is masked 404 + scope.denied. ?export=csv additionally requires tenant.application.export, is page-independent, redacted by capability, bounded by EXPORT_ROW_LIMIT, and audited as application.exported. Application WRITES stay on their own /api/v1/applications/ command routes."))
_register("/api/v1/admin/applications/saved-filters/", tenant(cap="tenant.application.read", tenant_object_path="saved_filter.user_id (owner scope before lookup); optional saved_filter.institution_id re-resolved through visible_institution_queryset on read", disclosure="not_found_mask", finding="ADM-01", notes="Named applications queries as server records (task 9.1) instead of one sessionStorage slot. Private to their owner: the list/save paths filter by user_id before any lookup. Only REGISTERED_PARAMETERS may be persisted — an unregistered parameter is rejected with UNREGISTERED_QUERY_PARAMETER rather than saved as a filter the roster would silently ignore."))
_register("/api/v1/admin/applications/saved-filters/<uuid:saved_filter_id>/", tenant(cap="tenant.application.read", tenant_object_path="saved_filter.user_id (owner scope before lookup)", disclosure="not_found_mask", finding="ADM-01", notes="Delete one of the caller's own saved filters (task 9.1). Scoped by owner BEFORE the lookup, so another operator's saved-filter id is the same masked 404 as an id that does not exist."))
_register("/api/v1/admin/applications/<uuid:application_id>/", tenant(cap="tenant.application.read", tenant_object_path="application.institution_ref_id (resolve_scoped_application -> AccessScopeService.filter_applications BEFORE the .get(), then require_application_capability, then require_reviewer_assignment)", disclosure="not_found_mask_then_non_revealing_403", finding="AUTH-01", notes="The ONE review-workspace detail query (task 9.4, R8.5/R11.3). Replaces the six per-application reads the admin workspace used to issue (/details/, /documents/, /grades/, /summary/, /interviews/, /payments/?application_id=) plus the generative /admin-summary/ task 7.4 deleted. Returns named sections (identity, answers, assignment, evidence, payment, interview, conditions, amendments, communication, history), the DETERMINISTIC readiness checklist (readiness_service.reviewer_summary over the same evaluator submit_application re-runs under locks — no model call, and null rather than a zeroed checklist when the canonical configuration cannot be evaluated), the actor's per-command capability matrix, the allowed transitions from ALLOWED_TRANSITIONS, and the VERSION every workspace command must carry. Read-only: every command keeps its own route. A Student, an out-of-tenant id, an unknown id and an application an assignment-scoped Reviewer is not assigned to are one indistinguishable 404; in-scope-without-tenant.application.read is a non-revealing 403."))
_register("/api/v1/programs/<uuid:program_id>/fees/", tenant(cap="tenant.program.read", tenant_object_path="program.institution_id", disclosure="not_found_mask", finding="AUTH-02", by_method={
    "GET": tenant(cap="tenant.program.read"),
    "POST": platform(cap="platform.program_assignment.manage", audit_event="tenant.fee.created"),
}, notes="Canonical fee schedule admin (task 8.4 closed AUTH-02 here). Read: tenant.program.read via HasTenantCapability, scoped by resolve_scoped_program -> visible_institution_queryset BEFORE lookup, so another tenant's offering id is an indistinguishable 404. Write: platform.program_assignment.manage — a Tenant_Admin may only request a fee change — and every write emits tenant.fee.<verb>."))
_register("/api/v1/programs/<uuid:program_id>/fees/<uuid:pk>/", tenant(cap="tenant.program.read", tenant_object_path="program.institution_id", disclosure="not_found_mask", finding="AUTH-02", by_method={
    "GET": tenant(cap="tenant.program.read"),
    "PUT": platform(cap="platform.program_assignment.manage", audit_event="tenant.fee.updated"),
    "PATCH": platform(cap="platform.program_assignment.manage", audit_event="tenant.fee.updated"),
    "DELETE": platform(cap="platform.program_assignment.manage", audit_event="tenant.fee.deactivated"),
}, notes="Fee detail admin; same authority split as the list (task 8.4)."))

# --- Notifications: student-owned (owner) ------------------------------------
_register("/api/v1/notifications/", owner(ownership="Notification.user_id == actor.id", notes="Own notifications list/create."))
_register("/api/v1/notifications/<uuid:pk>/", owner(ownership="Notification.user_id == actor.id", tenant_object_path="notification.user_id", disclosure="not_found_mask", notes="Delete own notification (weak-bucket resolved)."))
_register("/api/v1/notifications/<uuid:pk>/read/", owner(ownership="Notification.user_id == actor.id", tenant_object_path="notification.user_id", disclosure="not_found_mask", notes="Mark own notification read (weak-bucket resolved)."))
_register("/api/v1/notifications/mark-all-read/", owner(ownership="Notification.user_id == actor.id", notes="Mark all own read (weak-bucket resolved)."))
_register("/api/v1/notifications/mark-read/", owner(ownership="Notification.user_id == actor.id", notes="Batch mark own read (weak-bucket resolved)."))
_register("/api/v1/notifications/preferences/", owner(ownership="NotificationPreference.user_id == actor.id", disclosure="n/a", finding="STU-14", notes="Own notification preferences. Task 10.1 (R13.3/R13.8) made this the one published preference schema: GET returns the channels and categories the platform can actually honour, each with configurable/mandatory and a definition, plus writable_fields, the refusal table and the delivery-state vocabulary the inbox renders. PUT validates against apps.common.notification_preferences.validate_write — a field naming an unimplemented channel (sms_enabled/whatsapp_enabled), a mandatory one (in_app_enabled), an unproduced category (marketing_emails), a mandatory category (application_updates) or unimplemented behaviour (quiet_hours_*/timezone) is rejected 400 UNSUPPORTED_PREFERENCE with a per-field code, never stored."))
_register("/api/v1/notifications/<uuid:pk>/retry/", owner(ownership="Notification.user_id == actor.id", tenant_object_path="notification.user_id", disclosure="not_found_mask", audit_event="communication.retried", finding="STU-14", notes="Task 10.1 (R13.4): the authorized, audited, durable redelivery command for one of the caller's own messages. The notification is fetched from the caller's own rows, so another user's id and an unknown id are the same 404. Refuses anything not in terminal failed state (RETRY_NOT_APPLICABLE), an untracked delivery (RETRY_UNTRACKED) and a spent budget (RETRY_LIMIT_REACHED, COMMUNICATION_RETRY_LIMIT=3). Writes a new EmailQueue row plus its committed OutboxEvent through apps.common.outbox.queue_email and dispatches on commit — never a direct provider call."))
_register("/api/v1/notifications/read-all/", owner(ownership="Notification.user_id == actor.id", notes="Mark all own read."))
_register("/api/v1/notifications/user/<uuid:user_id>/", platform(cap="platform.user.manage_all", tenant_object_path=None, disclosure="non_revealing_403", notes="Admin views another user's notification history."))

# --- Email (shared admissions send + internal callback) ----------------------
_register("/api/v1/email/send/", tenant(cap=None, tenant_object_path="scoped", disclosure="non_revealing_403", notes="Staff send communication (weak-bucket resolved -> tenant admin tier); precise capability firmed in 9.x."))
_register("/api/v1/email/webhooks/delivery/", callback(audit_event="email.delivery", notes="Email delivery webhook (signed)."))

# --- Errors + meta (public) --------------------------------------------------
_register("/api/v1/errors/report/", public(auth="none", notes="Frontend error report; AllowAny, CSRF-exempt, rate-limited."))
_register("/api/v1/meta/platform/", public(auth="none", notes="Platform metadata (public)."))

# --- V2 namespace (apps.common.v2) -------------------------------------------
_register("/api/v2/student/applications/<uuid:application_id>/readiness/", owner(ownership="Application.user_id == actor.id OR staff in AccessScopeService.filter_applications scope", tenant_object_path="application.institution_ref_id", disclosure="not_found_mask", finding="STU-11", notes="Authoritative deterministic readiness query (task 6.5, R10.6/R11.2-R11.6/R12.3). Read-only. Owner always; reviewer/admin/super_admin only when the application is in their AccessScopeService scope (this is the R11.3 reviewer readiness query). A different student or out-of-scope staff is masked as 404 so existence cannot be inferred. Fails closed with retryable CONFIGURATION_UNAVAILABLE (503) when the canonical required-document configuration cannot be evaluated."))

# --- V2 tenant onboarding workflow (apps.catalog.onboarding_v2_views; task 4.1) -
# Super_Admin platform authority: every method resolves a platform.tenant.*
# capability through AdminCapabilityService.require_capability BEFORE touching
# TenantOnboardingService (design §3/§5.2). IsAuthenticated is only the
# transport gate; the real authority is the platform capability, so these are
# platform_capability (not the 0.3 weak `authenticated` bucket). Replaces the
# fragile client multi-call orchestration with durable server workflow commands
# (R4.1-R4.6, TEN-01/TEN-02). Missing platform capability -> non-revealing 403;
# a genuinely absent onboarding id -> generic 404.
_register("/api/v2/admin/onboarding/", platform(tenant_object_path=None, disclosure="non_revealing_403", by_method={
    "GET": platform(cap="platform.tenant.read_all"),
    "POST": platform(cap="platform.tenant.create", idempotency="supported", audit_event="tenant.onboarding.begun"),
}, finding="TEN-01", notes="V2 onboarding list(GET platform.tenant.read_all)/begin(POST platform.tenant.create; honours Idempotency-Key). begin atomically creates the institution aggregate server-side."))
_register("/api/v2/admin/onboarding/<uuid:onboarding_id>/", platform(cap="platform.tenant.read_all", tenant_object_path="onboarding.institution_id", disclosure="non_revealing_403", notes="Onboarding detail + live readiness/blockers; platform.tenant.read_all."))
_register("/api/v2/admin/onboarding/<uuid:onboarding_id>/blockers/", platform(cap="platform.tenant.read_all", tenant_object_path="onboarding.institution_id", disclosure="non_revealing_403", finding="TEN-02", notes="Live launch blockers, never the cached snapshot (R4.5); platform.tenant.read_all."))
_register("/api/v2/admin/onboarding/<uuid:onboarding_id>/steps/", platform(cap="platform.tenant.update", tenant_object_path="onboarding.institution_id", idempotency="supported", audit_event="tenant.onboarding.step_recorded", disclosure="non_revealing_403", finding="TEN-02", notes="Record an idempotent configuration step (R4.2); platform.tenant.update."))
_register("/api/v2/admin/onboarding/<uuid:onboarding_id>/submit/", platform(cap="platform.tenant.update", tenant_object_path="onboarding.institution_id", state_precondition="state == draft", audit_event="tenant.onboarding.submitted", disclosure="non_revealing_403", notes="draft -> in_review; platform.tenant.update."))
_register("/api/v2/admin/onboarding/<uuid:onboarding_id>/activate/", platform(cap="platform.tenant.update", tenant_object_path="onboarding.institution_id", state_precondition="launch-ready (blocker-gated)", audit_event="tenant.onboarding.activated", disclosure="non_revealing_403", finding="TEN-02", notes="Blocker-gated activation (R4.6): activate is refused unless zero live blockers remain; platform.tenant.update."))
_register("/api/v2/admin/onboarding/<uuid:onboarding_id>/reject/", platform(cap="platform.tenant.update", tenant_object_path="onboarding.institution_id", state_precondition="state == in_review", audit_event="tenant.onboarding.rejected", disclosure="non_revealing_403", notes="in_review -> rejected (terminal); platform.tenant.update."))
_register("/api/v2/admin/onboarding/<uuid:onboarding_id>/cancel/", platform(cap="platform.tenant.update", tenant_object_path="onboarding.institution_id", state_precondition="state in {draft, in_review}", audit_event="tenant.onboarding.cancelled", disclosure="non_revealing_403", notes="draft/in_review -> cancelled (terminal); platform.tenant.update."))
_register("/api/v2/admin/onboarding/<uuid:onboarding_id>/suspend/", platform(cap="platform.tenant.deactivate", tenant_object_path="onboarding.institution_id", state_precondition="state == active", audit_event="tenant.onboarding.suspended", disclosure="non_revealing_403", notes="active -> suspended (deactivates the institution); platform.tenant.deactivate (capability overridden from the default platform.tenant.update)."))
_register("/api/v2/admin/onboarding/<uuid:onboarding_id>/resume/", platform(cap="platform.tenant.update", tenant_object_path="onboarding.institution_id", state_precondition="state == suspended", audit_event="tenant.onboarding.resumed", disclosure="non_revealing_403", notes="suspended -> active (re-checks readiness); platform.tenant.update."))

# --- V2 tenant change requests (apps.catalog.change_request_v2_views; task 4.5) -
# Durable submit/review/apply workflow closing TEN-06 (R5.4/R5.5). Two authority
# sides on one resource: a Tenant_Admin SUBMITS/CANCELS with the tenant
# ``tenant.<kind>.request_change`` capability (list/detail scope BEFORE lookup ->
# non-revealing 404 on a cross-tenant id); a Platform_Admin APPROVES/REJECTS with
# the platform capability of the underlying canonical command
# (profile->platform.tenant.update, program->platform.program_assignment.manage,
# domain->platform.domain.manage). Approval applies through the SAME canonical
# command a Platform_Admin uses directly and records before/after versions.
# list/create carries a tenant capability on GET (scoped read) and a
# request-change capability on POST; the entry is registered as tenant_capability
# with the profile request_change capability as the representative (submit is
# tenant authority) and the per-kind resolution documented in notes.
_register("/api/v2/admin/change-requests/", tenant(cap="tenant.profile.request_change", tenant_object_path="body.institution_id", idempotency="supported", audit_event="tenant.change_request.submitted", disclosure="not_found_mask", finding="TEN-06", notes="Change-request list(GET; scoped via visible_institution_queryset — tenant sees own, platform sees all)/submit(POST; requires the tenant.<kind>.request_change capability resolved from body.change_kind: profile/program/domain; honours Idempotency-Key). Approval later applies through the canonical command (R5.5)."))
_register("/api/v2/admin/change-requests/<uuid:change_request_id>/", tenant(cap="tenant.profile.read", tenant_object_path="change_request.institution_id", disclosure="not_found_mask", finding="TEN-06", notes="Change-request detail; scoped BEFORE lookup so a cross-tenant id returns a non-revealing 404 (tenant isolation)."))
_register("/api/v2/admin/change-requests/<uuid:change_request_id>/submit/", tenant(cap="tenant.profile.request_change", tenant_object_path="change_request.institution_id", state_precondition="status == draft", audit_event="tenant.change_request.submitted", disclosure="not_found_mask", finding="TEN-06", notes="draft -> submitted; requires the tenant.<kind>.request_change capability for the request's change_kind."))
_register("/api/v2/admin/change-requests/<uuid:change_request_id>/cancel/", tenant(cap="tenant.profile.request_change", tenant_object_path="change_request.institution_id", state_precondition="status in {draft, submitted}", audit_event="tenant.change_request.cancelled", disclosure="not_found_mask", finding="TEN-06", notes="draft/submitted -> cancelled; requires the tenant.<kind>.request_change capability for the request's change_kind."))
_register("/api/v2/admin/change-requests/<uuid:change_request_id>/approve/", platform(cap="platform.tenant.update", tenant_object_path="change_request.institution_id", state_precondition="status == submitted", audit_event="tenant.change_request.applied", disclosure="non_revealing_403", finding="TEN-06", notes="submitted -> approved -> applied, transactionally, through the SAME canonical command a Platform_Admin uses (R5.5). Platform capability resolved per change_kind: profile->platform.tenant.update (representative), program->platform.program_assignment.manage, domain->platform.domain.manage."))
_register("/api/v2/admin/change-requests/<uuid:change_request_id>/reject/", platform(cap="platform.tenant.update", tenant_object_path="change_request.institution_id", state_precondition="status == submitted", audit_event="tenant.change_request.rejected", disclosure="non_revealing_403", finding="TEN-06", notes="submitted -> rejected; platform review. Capability resolved per change_kind (profile->platform.tenant.update representative; program->platform.program_assignment.manage; domain->platform.domain.manage)."))


def get_registry() -> Dict[str, Dict[str, Any]]:
    """Return the approved per-endpoint authority table (path -> entry)."""
    return dict(ENDPOINTS)


__all__ = [
    "TARGET_SEVEN",
    "BOUNDARY_CLASSES",
    "APPROVED_CLASSES",
    "DISCLOSURE_BY_CLASS",
    "ACTORS",
    "TENANTS",
    "JOBS_OPS_PREFIXES",
    "JOBS_OPS_EXACT_PATHS",
    "INFRA_HEURISTIC_CLASSES",
    "classify_boundary",
    "ENDPOINTS",
    "get_registry",
    "public",
    "owner",
    "reviewer_assignment",
    "tenant",
    "platform",
    "callback",
]
