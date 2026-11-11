"""A grant naming a removed capability grants nothing and raises nothing.

platform-simplification task 17.1 (Requirements 8.2, 8.6; decision D3 option B)
removed ``platform.user.create_global`` from ``PLATFORM_CAPABILITIES``. A
membership or access-grant row may still hold that string in its
``permissions`` JSON (design §8, "Legacy grants"). Derivation looks each value
up in ``_GRANTED_MUTATION_CAPABILITIES`` and ignores unknown keys, so such a row
must yield exactly the default read bundle: no extra capability and no error.
"""

from __future__ import annotations

import pytest

from apps.catalog.services import AdminCapabilityService
from tests.tenant_fixtures import (
    build_access_grant,
    build_institution,
    build_membership,
    build_profile,
)

REMOVED = "platform.user.create_global"

READ_DEFAULTS = frozenset(
    {
        "tenant.profile.read",
        "tenant.application.read",
        "tenant.document.read",
        "tenant.payment.read",
        "tenant.staff.read",
        "tenant.audit.read",
        "tenant.program.read",
        "tenant.domain.read",
    }
)


def test_the_removed_capability_is_not_in_the_catalogue():
    assert REMOVED not in AdminCapabilityService.PLATFORM_CAPABILITIES
    assert REMOVED not in AdminCapabilityService.TENANT_CAPABILITIES
    assert len(AdminCapabilityService.PLATFORM_CAPABILITIES) == 16


@pytest.mark.django_db
@pytest.mark.parametrize(
    "permissions",
    [
        [REMOVED],
        {REMOVED: True},
        REMOVED,
        [REMOVED, "view"],
    ],
    ids=["list", "dict", "bare-string", "with-view"],
)
@pytest.mark.parametrize("kind", ["membership", "grant"])
def test_a_grant_naming_the_removed_capability_grants_only_the_read_bundle(kind, permissions):
    institution = build_institution()
    staff = build_profile(role="admin")
    if kind == "membership":
        build_membership(
            user=staff, institution=institution, role="admin",
            is_active=True, permissions=permissions,
        )
    else:
        build_access_grant(
            user=staff, scope_type="institution", institution=institution,
            is_active=True, expires_at=None, permissions=permissions,
        )

    result = AdminCapabilityService().get_capabilities(staff)

    assert result.platform_capabilities == frozenset()
    assert result.is_super_admin is False
    granted = result.institution_capabilities[str(institution.id)]
    assert frozenset(granted) == READ_DEFAULTS
    assert REMOVED not in granted


@pytest.mark.django_db
def test_a_super_admin_does_not_hold_the_removed_capability():
    super_admin = build_profile(role="super_admin")
    result = AdminCapabilityService().get_capabilities(super_admin)
    assert result.platform_capabilities == AdminCapabilityService.PLATFORM_CAPABILITIES
    assert REMOVED not in result.platform_capabilities
