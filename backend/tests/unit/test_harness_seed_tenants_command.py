"""Tests for the ``harness_seed_tenants`` management command (spec task 0.4).

This is the WIRED seed command the isolated local V2 E2E harness runs
(``harness/docker-compose.harness.yml`` -> ``web`` service). It seeds the two
same-shaped example tenants (MIHAS + KATC) that the required Playwright smoke
(``apps/admissions/tests/harness-e2e/required/harness-smoke.spec.ts``) resolves
by host, sharing ONE canonical program (the same-name-across-tenants case that
finding TEN-07 and the two-tenant isolation matrix need).

Verifies the command:
  * creates two active tenants with active ``*.localhost`` domains that resolve
    offline (``status='active'``, ``is_active=True``),
  * links both offerings to a single shared canonical program,
  * scopes each seeded admin to only its own institution,
  * is idempotent, is password-required, and refuses a non-local database.
"""

from __future__ import annotations

import io

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import Profile
from apps.catalog.models import (
    CanonicalProgram,
    Institution,
    InstitutionDomain,
    Intake,
    Program,
    ProgramIntake,
    UserInstitutionMembership,
)

pytestmark = pytest.mark.django_db


def _run(**kwargs):
    out = io.StringIO()
    call_command("harness_seed_tenants", stdout=out, **kwargs)
    return out.getvalue()


def test_requires_password(monkeypatch):
    # Ensure the env default cannot satisfy the requirement.
    monkeypatch.delenv("HARNESS_TENANT_ADMIN_PASSWORD", raising=False)
    with pytest.raises(CommandError, match="password is required"):
        _run()


def test_seeds_two_tenants_with_active_domains_and_shared_canonical():
    _run(tenant_admin_password="harness-pw")

    # Exactly one shared canonical program, referenced by both offerings.
    canon = CanonicalProgram.objects.filter(code="CANON-DRN")
    assert canon.count() == 1

    mihas = Institution.objects.get(code="MIHAS")
    katc = Institution.objects.get(code="KATC")
    assert mihas.is_active and katc.is_active
    assert mihas.id != katc.id

    off_mihas = Program.objects.get(institution=mihas)
    off_katc = Program.objects.get(institution=katc)
    assert (
        off_mihas.canonical_program_id
        == off_katc.canonical_program_id
        == canon.first().id
    )

    # Active white-label domains resolve offline (host -> tenant, no DNS round-trip).
    for host in ("mihas.localhost", "katc.localhost"):
        dom = InstitutionDomain.objects.get(hostname=host)
        assert dom.status == "active"
        assert dom.is_active is True

    # One intake + program-intake per tenant.
    assert Intake.objects.count() == 2
    assert ProgramIntake.objects.count() == 2

    # One admin + active membership per tenant, scoped ONLY to its own institution.
    for slug, inst in (("mihas", mihas), ("katc", katc)):
        admin = Profile.objects.get(email=f"admin@{slug}.localhost")
        assert admin.role == "admin"
        mem = UserInstitutionMembership.objects.get(user=admin, institution=inst)
        assert mem.is_active is True
        assert mem.role == "admin"
        assert not (
            UserInstitutionMembership.objects.filter(user=admin, is_active=True)
            .exclude(institution=inst)
            .exists()
        )


def test_idempotent_rerun_creates_no_duplicates():
    _run(tenant_admin_password="pw")
    _run(tenant_admin_password="pw")

    assert Institution.objects.filter(code="MIHAS").count() == 1
    assert Institution.objects.filter(code="KATC").count() == 1
    assert CanonicalProgram.objects.filter(code="CANON-DRN").count() == 1
    assert Program.objects.filter(code="MIHAS-DRN").count() == 1
    assert InstitutionDomain.objects.filter(hostname="mihas.localhost").count() == 1
    assert (
        UserInstitutionMembership.objects.filter(
            user__email="admin@mihas.localhost", is_active=True
        ).count()
        == 1
    )


def test_refuses_non_local_database(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@ep-foo.neon.tech:5432/neondb")
    with pytest.raises(CommandError, match="non-local host"):
        _run(tenant_admin_password="pw")
