"""Canonical tenant launch-readiness computation (R4.5, R4.6).

Single source of truth for the launch-readiness aggregate consumed by the
tenant onboarding wizard (``AdminTenantReadinessView``) and the durable
onboarding workflow (``TenantOnboardingService.get_blockers`` / ``.activate``).

The readiness result is derived directly from the source tables that actually
power routing, official documents, and staff scope, so it can never drift from
the objects it reports on. It is intentionally not persisted.

Extracted from ``admin_views`` (task 4.1) so both the HTTP readiness view and
the workflow aggregate share one computation without the service/worker import
path pulling in the heavy admin view/serializer module.

Design: design.md §6.2 (readiness invariants).
Requirements: R4.5 (machine-readable blockers from live canonical data),
              R4.6 (activation re-evaluates readiness and is blocker-gated).
"""

from __future__ import annotations

from apps.catalog.models import (
    InstitutionAsset,
    InstitutionDocumentProfile,
    InstitutionDomain,
    Program,
    ProgramIntake,
    UserInstitutionMembership,
)


def _readiness_item(
    *,
    key: str,
    label: str,
    ready: bool,
    count: int,
    blocking: bool,
    ready_message: str,
    missing_message: str,
) -> dict:
    return {
        "key": key,
        "label": label,
        "ready": bool(ready),
        "count": int(count),
        "blocking": bool(blocking),
        "message": ready_message if ready else missing_message,
    }


def _active_application_fee_count(offering_ids) -> int:
    """Count active application ``ProgramFee`` rows for the given offerings.

    ``ProgramFee`` lives in the documents app; the import is local so this
    catalog module (imported by the onboarding service/worker path) does not
    pull the documents model graph at import time. A lookup failure degrades to
    ``0`` (surfaced as "not ready") rather than raising, so readiness never
    breaks the onboarding workflow.
    """
    if not offering_ids:
        return 0
    try:
        from apps.documents.models import ProgramFee

        return ProgramFee.objects.filter(
            program_id__in=offering_ids,
            fee_type="application",
            is_active=True,
        ).count()
    except Exception:  # pragma: no cover - readiness must never raise
        return 0


def build_tenant_readiness(institution_id) -> dict:
    """Return the canonical launch-readiness aggregate for one tenant.

    The result is derived from the source tables used by tenant onboarding.
    It is intentionally not persisted, so it cannot drift from the objects that
    actually power routing, official documents, and staff scope.
    """
    logo_count = InstitutionAsset.objects.filter(
        institution_id=institution_id,
        asset_type="logo",
        is_active=True,
    ).count()
    signature_count = InstitutionAsset.objects.filter(
        institution_id=institution_id,
        asset_type="signature",
        is_active=True,
    ).count()
    profile_count = InstitutionDocumentProfile.objects.filter(
        institution_id=institution_id,
        is_active=True,
    ).count()
    active_offering_ids = list(
        Program.objects.filter(
            institution_id=institution_id,
            is_active=True,
            offering_status="active",
        ).values_list("id", flat=True)
    )
    offering_count = len(active_offering_ids)
    # Intake_Offering + application-fee coverage for this tenant's active
    # offerings. These surface launch state to the onboarding wizard (R4.2,
    # R4.5) so the operator sees whether the offerings they created are
    # routable (linked to an intake with capacity) and priced. They are
    # intentionally NON-blocking here: activation-gating for capacity and fee
    # invariants is owned by tasks 5.3 (capacity/waitlist) and 5.4 (canonical
    # fee schedules / readiness blockers), which enforce them under locks.
    intake_offering_count = (
        ProgramIntake.objects.filter(
            program_id__in=active_offering_ids,
            is_active=True,
        ).count()
        if active_offering_ids
        else 0
    )
    application_fee_count = _active_application_fee_count(active_offering_ids)
    admin_count = UserInstitutionMembership.objects.filter(
        institution_id=institution_id,
        is_active=True,
        role__in=["admin", "tenant_admin"],
    ).count()
    domain_count = InstitutionDomain.objects.filter(
        institution_id=institution_id,
        is_active=True,
    ).count()
    active_domain_count = InstitutionDomain.objects.filter(
        institution_id=institution_id,
        is_active=True,
        status=InstitutionDomain.STATUS_ACTIVE,
    ).count()

    items = [
        _readiness_item(
            key="logo",
            label="Logo asset",
            ready=logo_count > 0,
            count=logo_count,
            blocking=True,
            ready_message="Active logo configured",
            missing_message="Upload an active tenant logo",
        ),
        _readiness_item(
            key="signature",
            label="Signature asset",
            ready=signature_count > 0,
            count=signature_count,
            blocking=True,
            ready_message="Active signature configured",
            missing_message="Upload an active signatory signature",
        ),
        _readiness_item(
            key="document_profile",
            label="Document profile",
            ready=profile_count > 0,
            count=profile_count,
            blocking=True,
            ready_message="Active official-document profile configured",
            missing_message="Create at least one active official-document profile",
        ),
        _readiness_item(
            key="program_offering",
            label="Program offerings",
            ready=offering_count > 0,
            count=offering_count,
            blocking=True,
            ready_message="At least one active offering is assigned",
            missing_message="Assign at least one active program offering",
        ),
        _readiness_item(
            key="tenant_admin",
            label="Tenant admin",
            ready=admin_count > 0,
            count=admin_count,
            blocking=True,
            ready_message="Scoped tenant admin is available",
            missing_message="Invite or scope a tenant admin",
        ),
        _readiness_item(
            key="intake_offering",
            label="Intake availability",
            ready=intake_offering_count > 0,
            count=intake_offering_count,
            blocking=False,
            ready_message="At least one offering is linked to an intake",
            missing_message="Link an offering to an intake with capacity",
        ),
        _readiness_item(
            key="application_fee",
            label="Application fee",
            ready=application_fee_count > 0,
            count=application_fee_count,
            blocking=False,
            ready_message="At least one offering has an active application fee",
            missing_message="Configure an application fee for an offering",
        ),
        _readiness_item(
            key="domain_configured",
            label="Domain",
            ready=domain_count > 0,
            count=domain_count,
            blocking=False,
            ready_message="Tenant domain exists",
            missing_message="Add a tenant domain when the school is ready for a custom portal host",
        ),
        _readiness_item(
            key="active_domain",
            label="Active domain",
            ready=active_domain_count > 0,
            count=active_domain_count,
            blocking=False,
            ready_message="At least one domain is active",
            missing_message="Verify and activate the domain after DNS propagates",
        ),
    ]
    return {
        "institution_id": str(institution_id),
        "launch_ready": all(item["ready"] for item in items if item["blocking"]),
        "items": items,
    }


def launch_blockers(institution_id) -> list[dict]:
    """Return the blocking readiness items that are not yet satisfied (R4.5).

    A tenant is launch-ready (activatable) exactly when this list is empty.
    Each entry is a readiness item (``key``/``label``/``ready``/``count``/
    ``blocking``/``message``) drawn from :func:`build_tenant_readiness`, so the
    blocker keys (``logo``, ``signature``, ``document_profile``,
    ``program_offering``, ``tenant_admin``) match the readiness aggregate the
    wizard renders.
    """
    readiness = build_tenant_readiness(institution_id)
    return [
        item
        for item in readiness["items"]
        if item["blocking"] and not item["ready"]
    ]
