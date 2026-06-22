"""Property-based test — capability-resolution failure fails closed (Property 3).

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — task 2.5.

Feature: enterprise-tenant-authority, Property 3: Capability-resolution failure
fails closed.

**Property 3 (Capability-resolution failure fails closed)** — when
``AdminCapabilityService`` cannot resolve a Capability_Set for an actor because
of a resolution error or an unavailable dependency (R1.6), the platform fails
closed on *every* surface:

- ``get_capabilities`` raises :class:`CapabilityResolutionError` (the effective
  set is unresolved → treated as empty / zero capabilities),
- ``require_capability`` / ``require_institution_capability`` raise DRF
  :class:`PermissionDenied` (the action is denied and an authorization error is
  produced),
- ``visible_institution_queryset`` raises :class:`CapabilityResolutionError`
  rather than returning a queryset (no tenant data is returned), and
- the object-level predicate helpers (``can_manage_institution``,
  ``can_manage_program``, ``can_manage_domain``, ``can_invite_staff``) all
  return ``False`` — zero authority, no tenant data.

The failure is injected by making the resolution dependency raise: either
``AccessScopeService.filters_for_user`` (the scope computation
``get_capabilities`` and ``visible_institution_queryset`` both depend on) or the
membership/grant query inside the per-institution derivation. This requires no
database — the actor is a lightweight stub, and the only authority signal is
the (mocked) dependency outcome, so the property isolates the fail-closed
contract itself.

Run (no DB needed — the dependency is mocked)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_capability_fail_closed.py -q

**Validates: Requirements 1.6**
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest import mock

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from rest_framework.exceptions import PermissionDenied

from apps.catalog.services import (
    AccessScopeService,
    AdminCapabilityService,
    CapabilityResolutionError,
    ScopeFilters,
)


# ≥100 examples per the spec's testing conventions; no deadline pressure since
# every example only exercises pure resolution logic over a mocked dependency.
HYPOTHESIS_SETTINGS = settings(max_examples=150, deadline=None)


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Fail-closed resolution is only reached for actors who actually invoke the
# resolution dependency — i.e. canonical non-super-admin roles. A ``super_admin``
# short-circuits to the full platform set without touching the dependency, so it
# is intentionally excluded from this failure-injection property.
NON_SUPER_ROLE = st.sampled_from(["admin", "reviewer", "student"])

# Any platform/tenant capability — the denial must hold regardless of which
# capability is requested.
PLATFORM_CAPABILITY = st.sampled_from(sorted(AdminCapabilityService.PLATFORM_CAPABILITIES))
TENANT_CAPABILITY = st.sampled_from(sorted(AdminCapabilityService.TENANT_CAPABILITIES))

# A variety of dependency-failure exception types — any unavailable dependency
# must fail closed, not just one specific error class.
FAILURE_EXC = st.sampled_from(
    [
        RuntimeError("scope backend unavailable"),
        ConnectionError("database connection refused"),
        ValueError("corrupt scope row"),
        OSError("transient i/o error"),
    ]
)

# Target role offered to ``can_invite_staff`` — must be denied on resolution
# failure regardless of value.
INVITE_TARGET_ROLE = st.sampled_from(["admin", "reviewer", "student", "super_admin"])


def _actor(role: str):
    """A lightweight stub actor (``role`` + ``id``) — no DB row required.

    ``AdminCapabilityService`` only reads ``user.role`` (via ``is_super_admin``)
    and ``user.id`` (to key the scope query), so a namespace is sufficient and
    keeps the property focused on the fail-closed contract rather than fixtures.
    """
    return SimpleNamespace(id=uuid.uuid4(), role=role)


def _assert_helpers_deny(service, actor, institution_id):
    """Every object-level predicate yields ``False`` (zero authority, no data)."""
    institution = SimpleNamespace(id=institution_id)
    school_program = SimpleNamespace(institution_id=institution_id)
    canonical_program = SimpleNamespace(institution_id=None)
    domain = SimpleNamespace(institution_id=institution_id)

    assert service.can_manage_institution(actor, institution) is False
    # Both program flavours (canonical → platform cap; school-local → tenant
    # cap) must deny when capabilities cannot be resolved.
    assert service.can_manage_program(actor, school_program) is False
    assert service.can_manage_program(actor, canonical_program) is False
    assert service.can_manage_domain(actor, domain) is False
    assert service.can_invite_staff(actor, institution, "reviewer") is False


# ---------------------------------------------------------------------------
# Property 3
# ---------------------------------------------------------------------------


class TestProperty3FailClosed:
    """Property 3: a capability-resolution failure fails closed everywhere.

    Feature: enterprise-tenant-authority, Property 3: Capability-resolution
    failure fails closed.

    **Validates: Requirements 1.6**
    """

    @HYPOTHESIS_SETTINGS
    @given(
        role=NON_SUPER_ROLE,
        platform_capability=PLATFORM_CAPABILITY,
        tenant_capability=TENANT_CAPABILITY,
        failure=FAILURE_EXC,
        target_role=INVITE_TARGET_ROLE,
    )
    def test_scope_dependency_failure_fails_closed(
        self, role, platform_capability, tenant_capability, failure, target_role
    ):
        """When the scope dependency (``filters_for_user``) is unavailable, the
        whole authority surface fails closed (R1.6).

        ``get_capabilities`` and ``visible_institution_queryset`` both depend on
        ``AccessScopeService.filters_for_user``; with it raising, both surface a
        :class:`CapabilityResolutionError`, the enforcement helpers convert that
        to :class:`PermissionDenied` (deny + authorization error), and every
        object-level predicate returns ``False`` (zero authority, no tenant
        data)."""
        service = AdminCapabilityService()
        actor = _actor(role)
        institution_id = str(uuid.uuid4())

        with mock.patch.object(
            AccessScopeService, "filters_for_user", side_effect=failure
        ):
            # Effective capability set is unresolved (→ zero capabilities).
            with pytest.raises(CapabilityResolutionError):
                service.get_capabilities(actor)

            # No tenant data is returned — scoping raises instead of yielding a
            # queryset the caller could leak rows from.
            with pytest.raises(CapabilityResolutionError):
                service.visible_institution_queryset(actor)

            # The action is denied with an authorization error.
            with pytest.raises(PermissionDenied):
                service.require_capability(actor, platform_capability)
            with pytest.raises(PermissionDenied):
                service.require_institution_capability(
                    actor, SimpleNamespace(id=institution_id), tenant_capability
                )

            # Zero authority across every object-level predicate.
            assert service.can_manage_institution(actor, SimpleNamespace(id=institution_id)) is False
            assert service.can_manage_program(actor, SimpleNamespace(institution_id=institution_id)) is False
            assert service.can_manage_program(actor, SimpleNamespace(institution_id=None)) is False
            assert service.can_manage_domain(actor, SimpleNamespace(institution_id=institution_id)) is False
            assert service.can_invite_staff(actor, SimpleNamespace(id=institution_id), target_role) is False

    @HYPOTHESIS_SETTINGS
    @given(
        role=NON_SUPER_ROLE,
        platform_capability=PLATFORM_CAPABILITY,
        tenant_capability=TENANT_CAPABILITY,
        failure=FAILURE_EXC,
    )
    def test_membership_grant_query_failure_fails_closed(
        self, role, platform_capability, tenant_capability, failure
    ):
        """When the per-institution membership/grant query is unavailable, the
        derivation fails closed (R1.6).

        Here ``filters_for_user`` succeeds and reports an in-scope institution,
        but the membership/grant query inside ``_derive_institution_capabilities``
        raises. ``get_capabilities`` must still surface
        :class:`CapabilityResolutionError`, the enforcement helpers must deny,
        and the predicates must return ``False`` — the actor gains no authority
        and sees no tenant data even though scope reported an institution."""
        service = AdminCapabilityService()
        actor = _actor(role)
        institution_id = str(uuid.uuid4())

        scope_ok = ScopeFilters(False, {institution_id}, set(), set())

        with mock.patch.object(
            AccessScopeService, "filters_for_user", return_value=scope_ok
        ), mock.patch(
            "apps.catalog.services.UserInstitutionMembership"
        ) as membership_model, mock.patch(
            "apps.catalog.services.AccessGrant"
        ) as grant_model:
            membership_model.objects.filter.side_effect = failure
            grant_model.objects.filter.side_effect = failure

            # Capability resolution fails closed through the derivation path.
            with pytest.raises(CapabilityResolutionError):
                service.get_capabilities(actor)

            # Enforcement denies with an authorization error.
            with pytest.raises(PermissionDenied):
                service.require_capability(actor, platform_capability)
            with pytest.raises(PermissionDenied):
                service.require_institution_capability(
                    actor, SimpleNamespace(id=institution_id), tenant_capability
                )

            # Zero authority across the object-level predicates.
            _assert_helpers_deny(service, actor, institution_id)
