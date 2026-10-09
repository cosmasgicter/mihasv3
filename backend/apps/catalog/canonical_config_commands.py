"""Canonical tenant-configuration write commands (Admissions V2).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` tasks 4.4/4.5
Requirements: R5.4, R5.5, R7.x
Findings: TEN-06 (change requests must apply through the SAME canonical command).
Design: design.md §6.3 (domain creation), §6.4 (tenant change requests —
        "Approval does not directly patch a JSON blob; it calls the canonical
        domain command in a transaction and records before/after versions").

This module holds the **single** implementation of the protected tenant
configuration writes so there is exactly one canonical command per resource,
reused identically by:

* the platform-admin write endpoints in ``apps.catalog.admin_views`` (a
  Platform_Admin editing directly), and
* the tenant change-request apply path in
  ``apps.catalog.change_request_service`` (a Tenant_Admin's approved request).

Each command performs the serializer-validated write, records the canonical
``tenant.<resource>.<verb>`` configuration Audit_Event under the acting user,
and invalidates the tenant/catalog cache — exactly what the admin views did
inline before. Authorization stays in the caller (the view / the service) per
design §3; these functions own the *write*, never the *authority decision*.
"""

from __future__ import annotations

import secrets
from typing import Any, Optional

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.catalog.admin_serializers import (
    AdminInstitutionDomainSerializer,
    AdminInstitutionSerializer,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.models import InstitutionDomain, UserInstitutionMembership
from apps.catalog.serializers import ProgramCreateUpdateSerializer
from apps.catalog.tenant_audit_service import TenantAuditService

# Number of random bytes for a domain verification token (~43 URL-safe chars,
# comfortably above the R7.3 32-char floor). Kept identical to the admin view.
DOMAIN_VERIFICATION_TOKEN_BYTES = 32


# ---------------------------------------------------------------------------
# Shared config-change verb + audit helpers (moved here from admin_views so the
# admin views and the change-request apply path share one implementation).
# ---------------------------------------------------------------------------


def config_change_verb(data, *, created: bool) -> str:
    """Resolve the config-change verb (R13.1, R16.3).

    A create is ``created``; a PATCH that sets ``is_active`` falsey is a
    ``deactivated`` and one that sets ``is_active`` truthy is an ``activated``
    (so the activate/deactivate lifecycle is distinguishable from a plain
    content ``updated`` — R16.3); any other update is ``updated``.
    """
    if created:
        return "created"
    if isinstance(data, dict):
        if "is_active" in data:
            value = data.get("is_active")
            is_false = value in (False, "false", "False", 0, "0")
            return "deactivated" if is_false else "activated"
    return "updated"


def audit_config_change(request, *, resource, verb, entity_id, institution_id):
    """Best-effort tenant config-change Audit_Event (R13.1). Never raises.

    Derives the actor from ``request.user`` when a request is present so the
    canonical config change is attributed to whoever performed the write — the
    Platform_Admin editing directly, or the Platform_Admin approving a tenant
    change request (which is exactly what a direct edit would have recorded).
    """
    user = getattr(request, "user", None) if request is not None else None
    try:
        TenantAuditService.record_config_change(
            resource=resource,
            verb=verb,
            entity_id=entity_id,
            institution_id=institution_id,
            actor_id=getattr(user, "id", None),
            actor_role=getattr(user, "role", None),
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never block a write
        pass


# ---------------------------------------------------------------------------
# Domain DNS helpers (moved here from admin_views for reuse by the change path).
# ---------------------------------------------------------------------------


def domain_verification_base() -> str:
    """Base host the tenant CNAMEs to for domain verification (R7.3)."""
    return getattr(settings, "TENANT_DOMAIN_VERIFICATION_BASE", "verify.beanola.com")


def generate_dns_target() -> str:
    """Generate a unique per-domain DNS target under the verification base (R7.3)."""
    label = secrets.token_hex(8)
    return f"{label}.{domain_verification_base()}"


def build_dns_record(hostname: str, dns_target: str, verification_token: str) -> dict:
    """The DNS record a tenant must publish to verify ownership/routing (R7.3)."""
    return {
        "type": "CNAME",
        "name": hostname,
        "value": dns_target,
        "ttl": 3600,
        "verification": {
            "type": "TXT",
            "name": f"_beanola-verify.{hostname}",
            "value": verification_token,
        },
        "instructions": (
            f"Create a CNAME record for {hostname} pointing to {dns_target}, then "
            f"add a TXT record at _beanola-verify.{hostname} containing the "
            "verification token. Verification runs automatically once DNS propagates."
        ),
    }


# ---------------------------------------------------------------------------
# Canonical write commands
# ---------------------------------------------------------------------------


def apply_institution_profile_change(institution, data: dict, *, request=None):
    """Canonical institution profile update (the write ``AdminTenantDetailView.patch`` performs).

    Validates ``data`` through :class:`AdminInstitutionSerializer`, saves it, and
    — when the change deactivates the tenant — suspends its active staff
    memberships in the same transaction (R6.9), then records the canonical
    ``tenant.institution.<verb>`` audit event and invalidates the catalog cache.
    Returns the updated institution. Raises ``serializers.ValidationError`` on an
    invalid payload (the caller maps it to its envelope).
    """
    verb = config_change_verb(data, created=False)
    serializer = AdminInstitutionSerializer(institution, data=data, partial=True)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        institution = serializer.save()
        if verb == "deactivated":
            UserInstitutionMembership.objects.filter(
                institution_id=institution.id, is_active=True
            ).update(is_active=False)
    audit_config_change(
        request,
        resource="institution",
        verb=verb,
        entity_id=institution.id,
        institution_id=institution.id,
    )
    invalidate_catalog_scopes(
        institution.id, user=getattr(request, "user", None) if request else None
    )
    return institution


def apply_program_offering_change(program, data: dict, *, request=None):
    """Canonical program-offering update (the write ``AdminTenantProgramDetailView.patch`` performs).

    Validates ``data`` through :class:`ProgramCreateUpdateSerializer` (bound to
    ``program``), applies the validated fields, saves, records the canonical
    ``tenant.program.<verb>`` audit event, and invalidates the catalog cache.
    Returns the updated program.
    """
    institution_id = program.institution_id
    payload = dict(data or {})
    payload["institution_id"] = str(institution_id)
    serializer = ProgramCreateUpdateSerializer(program, data=payload, partial=True)
    serializer.is_valid(raise_exception=True)
    for attr, value in serializer.validated_data.items():
        setattr(program, attr, value)
    program.save()
    audit_config_change(
        request,
        resource="program",
        verb=config_change_verb(data, created=False),
        entity_id=program.id,
        institution_id=institution_id,
    )
    invalidate_catalog_scopes(
        institution_id, user=getattr(request, "user", None) if request else None
    )
    return program


def create_institution_domain(institution_id, data: dict, *, request=None, created_by_id=None):
    """Canonical tenant-domain creation (the write ``AdminTenantDomainListCreateView.post`` performs).

    Creates the domain in ``pending_dns`` with a freshly generated ≥32-char
    ``verification_token`` and ``dns_target``, records the canonical
    ``tenant.domain.created`` audit event, commits a durable verification job
    **before returning** (design §6.3), and invalidates the catalog cache.
    Returns ``(domain, dns_record)``. Lets ``IntegrityError`` propagate on a
    hostname collision so the caller maps it to its stable conflict code.
    """
    payload = dict(data or {})
    payload["institution_id"] = str(institution_id)
    serializer = AdminInstitutionDomainSerializer(data=payload)
    serializer.is_valid(raise_exception=True)

    hostname = serializer.validated_data["hostname"]
    verification_token = secrets.token_urlsafe(DOMAIN_VERIFICATION_TOKEN_BYTES)
    dns_target = generate_dns_target()

    with transaction.atomic():
        instance = serializer.save(
            created_by_id=created_by_id,
            status=InstitutionDomain.STATUS_PENDING_DNS,
            verification_token=verification_token,
            dns_target=dns_target,
            created_at=timezone.now(),
        )

    audit_config_change(
        request,
        resource="domain",
        verb="created",
        entity_id=getattr(instance, "id", None),
        institution_id=institution_id,
    )
    # Commit a durable verification job before returning accepted (design §6.3).
    # Imported lazily to avoid importing the Celery task module at import time.
    from apps.catalog.tasks import enqueue_domain_verification

    enqueue_domain_verification(instance.id)
    invalidate_catalog_scopes(
        institution_id, user=getattr(request, "user", None) if request else None
    )

    dns_record = build_dns_record(hostname, dns_target, verification_token)
    return instance, dns_record
