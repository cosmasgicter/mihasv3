"""Institution context resolution exploration tests (P10).

Spec: ``multi-tenant-beanola-admissions`` — Phase 0 exploration baseline
(task 1.7, building on the task 1.1 scaffold). Pins host-resolution safety:

    P10 White-label match is case/port-insensitive; inactive domain /
        institution and hostname collisions fail safe to the shared Beanola
        portal without leaking school data.

These are **exploration** tests: each edge case either passes against the
current ``InstitutionContextService`` or is recorded as a durable
``@pytest.mark.xfail(strict=True)`` carrying a minimised counter-example,
triaged to the phase task that will fix it (matching the convention used by
tasks 1.3 and 1.6). No production code is changed in this task.

Edge cases covered (per task 1.7):

- uppercase host                  → matches active white-label domain (PASS)
- host with port suffix           → matches (port stripped) (PASS)
- uppercase host + port combined  → matches (PASS)
- inactive domain                 → safe fallback to shared Beanola (PASS)
- inactive institution            → safe fallback; never exposes the school (PASS)
- duplicate active hostname       → must fail safe / surface the collision;
                                     current code silently picks one school
                                     (FAIL → xfail, triaged to Phase 4 task 15.1)

**Validates: Requirements R3.3, R3.4, R3.5, R14.4**
"""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction

from apps.catalog.models import InstitutionDomain
from apps.catalog.services import InstitutionContextService
from tests.tenant_fixtures import build_institution, build_institution_domain

# Tag the whole module so the Phase 0 ``-k "tenant or ..."`` selector picks it
# up even though the filename carries no tenant/scope/assignment/canonical token.
pytestmark = pytest.mark.tenant


@pytest.mark.django_db
class TestHostResolutionMatch:
    """P10: an active white-label domain resolves case/port-insensitively.

    **Validates: Requirements R3.4, R14.4**
    """

    def test_unknown_host_falls_back_to_shared_beanola(self):
        """An unrecognised host resolves to the shared Beanola portal."""
        context = InstitutionContextService().resolve("no-such-host.example.com")
        assert context.portal_type == "shared"
        assert context.institution is None
        assert context.brand["name"] == "Beanola Admissions"

    def test_empty_host_falls_back_to_shared_beanola(self):
        """A missing/empty host degrades to the shared portal, never an error."""
        for host in (None, "", "   ", ":8443"):
            context = InstitutionContextService().resolve(host)
            assert context.portal_type == "shared", host
            assert context.institution is None, host

    def test_exact_lowercase_host_matches_active_domain(self):
        """Baseline: a verbatim active hostname resolves to white-label."""
        institution = build_institution()
        build_institution_domain(
            institution=institution, hostname="apply.testschool.example"
        )
        context = InstitutionContextService().resolve("apply.testschool.example")
        assert context.portal_type == "white_label"
        assert context.institution is not None
        assert context.institution.id == institution.id

    def test_uppercase_host_matches_active_domain(self):
        """R3.4: matching is case-insensitive — an UPPERCASE host still matches."""
        institution = build_institution()
        build_institution_domain(
            institution=institution, hostname="apply.testschool.example"
        )
        context = InstitutionContextService().resolve("APPLY.TESTSCHOOL.EXAMPLE")
        assert context.portal_type == "white_label"
        assert context.institution is not None
        assert context.institution.id == institution.id

    def test_host_with_port_matches_active_domain(self):
        """R3.4: matching ignores the port suffix."""
        institution = build_institution()
        build_institution_domain(
            institution=institution, hostname="apply.testschool.example"
        )
        context = InstitutionContextService().resolve("apply.testschool.example:8443")
        assert context.portal_type == "white_label"
        assert context.institution is not None
        assert context.institution.id == institution.id

    def test_case_and_port_insensitive_match(self):
        """R3.4: an uppercase host *with* a port still matches an active domain
        and brands from the institution's runtime context."""
        institution = build_institution()
        build_institution_domain(
            institution=institution, hostname="apply.testschool.example"
        )
        context = InstitutionContextService().resolve("APPLY.TestSchool.Example:8443")
        assert context.portal_type == "white_label"
        assert context.institution is not None
        assert context.institution.id == institution.id
        # Brand derives from the institution, not the Beanola default.
        assert context.brand["name"] == (institution.brand_name or institution.name)


@pytest.mark.django_db
class TestInactiveFailSafe:
    """P10: inactive domains/institutions fall back safely and never leak data.

    **Validates: Requirements R3.3, R14.4**
    """

    def test_inactive_domain_falls_back_to_shared(self):
        """R3.3: an inactive domain row resolves to the shared portal, not the
        school it points at."""
        institution = build_institution()
        build_institution_domain(
            institution=institution,
            hostname="apply.inactivedomain.example",
            is_active=False,
        )
        context = InstitutionContextService().resolve("apply.inactivedomain.example")
        assert context.portal_type == "shared"
        assert context.institution is None
        # No school data leaks through the brand.
        assert context.brand["name"] == "Beanola Admissions"

    def test_inactive_institution_falls_back_without_exposing_school(self):
        """R3.3: an *active* domain whose institution is inactive must fall back
        to shared and SHALL NOT expose the inactive school's data."""
        institution = build_institution(is_active=False)
        build_institution_domain(
            institution=institution,
            hostname="apply.inactiveschool.example",
            is_active=True,
        )
        context = InstitutionContextService().resolve("apply.inactiveschool.example")
        assert context.portal_type == "shared"
        assert context.institution is None
        # The inactive school's brand/name/emails must not surface anywhere.
        assert context.brand["name"] == "Beanola Admissions"
        assert institution.brand_name not in context.brand.values()
        assert institution.name not in context.brand.values()


@pytest.mark.django_db
class TestDuplicateHostnameCollision:
    """P10: a duplicate active hostname must fail safe / surface the collision.

    **Validates: Requirements R3.5, R14.4**
    """

    def test_duplicate_active_hostname_fails_safe(self):
        """Two active institutions claim the same hostname (case variants that
        both survive the case-sensitive DB unique index). The resolver must NOT
        silently pick one school — it should fail safe to the shared portal
        (and surface the collision to operators)."""
        institution_a = build_institution(suffix="collision-a")
        institution_b = build_institution(suffix="collision-b")
        # Case variants: distinct rows under the case-sensitive `hostname UNIQUE`
        # index, but both match the resolver's lowercased `iexact` lookup.
        build_institution_domain(
            institution=institution_a,
            hostname="apply.collision.example",
            is_active=True,
        )
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                build_institution_domain(
                    institution=institution_b,
                    hostname="APPLY.collision.example",
                    is_active=True,
                )

        assert (
            InstitutionDomain.objects.filter(
                hostname__iexact="apply.collision.example",
                is_active=True,
            ).count()
            == 1
        )


@pytest.mark.django_db
class TestStatusAwareFailClosed:
    """R7.8/R7.9/R19: a host resolves to a tenant ONLY when the matching
    ``InstitutionDomain`` is ``status == active`` (plus active row + institution).
    Any non-active status fails closed to the Neutral Beanola context.

    **Validates: Requirements 7.8, 7.9, 19.1, 19.2, 19.3, 19.4**
    """

    @pytest.mark.parametrize(
        "status",
        [
            InstitutionDomain.STATUS_PENDING_DNS,
            InstitutionDomain.STATUS_PENDING_REVIEW,
            InstitutionDomain.STATUS_VERIFIED,
            InstitutionDomain.STATUS_DISABLED,
            InstitutionDomain.STATUS_FAILED,
        ],
    )
    def test_non_active_status_fails_closed(self, status):
        """A domain whose ``status`` is not ``active`` never resolves a tenant,
        even when the row and institution are otherwise active and unique."""
        institution = build_institution()
        build_institution_domain(
            institution=institution,
            hostname="apply.pendingschool.example",
            is_active=True,
            status=status,
        )
        context = InstitutionContextService().resolve("apply.pendingschool.example")
        assert context.portal_type == "shared", status
        assert context.institution is None, status
        # No school data leaks through the neutral brand.
        assert context.brand["name"] == "Beanola Admissions"
        assert institution.brand_name not in context.brand.values()

    def test_active_status_resolves_white_label(self):
        """Baseline contrast: the SAME setup with ``status == active`` resolves
        the tenant — proving status is the only differing factor."""
        institution = build_institution()
        build_institution_domain(
            institution=institution,
            hostname="apply.activeschool.example",
            is_active=True,
            status=InstitutionDomain.STATUS_ACTIVE,
        )
        context = InstitutionContextService().resolve("apply.activeschool.example")
        assert context.portal_type == "white_label"
        assert context.institution is not None
        assert context.institution.id == institution.id

    def test_active_and_non_active_rows_resolve_single_active_tenant(self):
        """A verified (non-active) decoy row for the same hostname does not
        cause a collision — only the single ``active`` row counts, so the
        tenant still resolves."""
        institution = build_institution(suffix="dual-a")
        decoy = build_institution(suffix="dual-b")
        build_institution_domain(
            institution=institution,
            hostname="apply.dual.example",
            is_active=True,
            status=InstitutionDomain.STATUS_ACTIVE,
        )
        build_institution_domain(
            institution=decoy,
            hostname="APPLY.dual.example",
            is_active=True,
            status=InstitutionDomain.STATUS_VERIFIED,
        )
        context = InstitutionContextService().resolve("apply.dual.example")
        assert context.portal_type == "white_label"
        assert context.institution is not None
        assert context.institution.id == institution.id
