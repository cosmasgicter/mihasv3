"""Acceptance Scenario D — unknown or broken domain fails closed (task 17.4).

Spec: ``enterprise-tenant-authority`` — Requirement 19 ("Acceptance Scenario —
Unknown Or Broken Domain Fails Closed"). This is a focused acceptance
integration test that drives the **real** public catalog APIs over the DRF
``APIClient`` and proves the four Requirement-19 acceptance criteria hold end to
end through the HTTP surface (not just the service in isolation):

    R19.1  A request on an **unknown** host resolves to the Neutral_Beanola_Context.
    R19.2  While serving the Neutral_Beanola_Context the Platform exposes NO
           tenant-private branding or offering (the host is never treated as a
           resolved white-label tenant portal).
    R19.3  A request on a **disabled** (non-active) domain does NOT resolve an
           active Tenant context — it fails closed to the Neutral_Beanola_Context.
    R19.4  An unknown/conflicting (here: unknown + non-active) domain resolution
           is logged for operations review.

The host-resolution gate proven here is the same one exercised by the unit
suite ``tests/unit/test_institution_context.py`` (``TestStatusAwareFailClosed``)
and implemented by ``InstitutionContextService.resolve`` /
``_report_unknown`` / ``_report_non_active`` in ``apps/catalog/services.py``;
this test pins the **HTTP** behavior of ``GET /api/v1/catalog/context/`` and
``GET /api/v1/catalog/canonical-programs/`` for the same conditions.

Honest-test note (R8.6 vs R19.2): the shared Beanola portal deliberately lists
**every** active offering across all tenants (R8.6) — a public catalog, not a
leak. The tenant-private leak R19.2/R19.3 forbid is *resolving the disabled host
as that tenant's white-label portal* (scoping the catalog to — and branding as —
that one tenant). So the canonical-programs assertion proves the disabled host
yields the neutral shared catalog spanning ALL tenants (never a tenant-A-scoped
portal), in deliberate contrast to a genuinely-active host that DOES scope.

Run (sqlite test DB, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/unit/test_scenario_domain_fail_closed.py -q

**Validates: Requirements 19.1, 19.2, 19.3, 19.4**
"""

from __future__ import annotations

import logging

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.catalog.models import InstitutionDomain
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_institution_domain,
    build_intake,
    build_offering,
    build_program_intake,
)

pytestmark = pytest.mark.tenant

SERVICE_LOGGER = "apps.catalog.services"

# A configured-but-disabled tenant host (status=disabled), an active tenant host
# (the contrast case), and a host that no domain row matches at all.
DISABLED_HOST = "apply.disabled-tenant.example"
ACTIVE_HOST = "apply.active-tenant.example"
UNKNOWN_HOST = "unknown-tenant.example.com"


def _canonical_program_ids(body) -> set[str]:
    """Extract canonical-program ids from a (possibly paginated) list envelope."""
    if not isinstance(body, dict):
        return set()
    data = body.get("data", body)
    rows = (
        data.get("results", [])
        if isinstance(data, dict)
        else (data if isinstance(data, list) else [])
    )
    return {str(r["id"]) for r in rows if isinstance(r, dict) and r.get("id")}


@pytest.mark.django_db
class TestScenarioDomainFailClosed:
    """Scenario D: unknown/disabled domains fail closed to Neutral Beanola.

    **Validates: Requirements 19.1, 19.2, 19.3, 19.4**
    """

    @staticmethod
    def _build_disabled_tenant():
        """An active institution whose ONLY domain is ``status == disabled``.

        ``is_active=True`` on the domain row isolates ``status`` as the single
        failing factor (mirrors ``TestStatusAwareFailClosed``): the host is
        configured, points at an active institution with an active offering, and
        still must fail closed purely because the domain is disabled.
        """
        institution = build_institution(suffix="disabled-tenant")
        build_institution_domain(
            institution=institution,
            hostname=DISABLED_HOST,
            is_active=True,
            status=InstitutionDomain.STATUS_DISABLED,
        )
        canonical = build_canonical_program(suffix="disabled-canon")
        offering = build_offering(
            institution=institution,
            canonical_program=canonical,
            suffix="disabled-offer",
        )
        intake = build_intake(suffix="disabled-intake")
        build_program_intake(offering=offering, intake=intake)
        return institution, canonical, offering

    @staticmethod
    def _build_active_tenant():
        """A fully active tenant (active institution + active domain + offering).

        Used as the contrast case: an active host DOES resolve a white-label
        tenant and DOES scope the catalog, proving the disabled/unknown
        fail-closed behavior is a real gate and not a no-op.
        """
        institution = build_institution(suffix="active-tenant")
        build_institution_domain(
            institution=institution,
            hostname=ACTIVE_HOST,
            is_active=True,
            status=InstitutionDomain.STATUS_ACTIVE,
        )
        canonical = build_canonical_program(suffix="active-canon")
        offering = build_offering(
            institution=institution,
            canonical_program=canonical,
            suffix="active-offer",
        )
        intake = build_intake(suffix="active-intake")
        build_program_intake(offering=offering, intake=intake)
        return institution, canonical, offering

    # -- R19.1 / R19.2 ---------------------------------------------------- #

    def test_unknown_host_returns_neutral_beanola_context(self):
        """R19.1/R19.2: an unknown host resolves to the Neutral Beanola context
        and exposes no tenant-private branding."""
        disabled_inst, _, _ = self._build_disabled_tenant()
        active_inst, _, _ = self._build_active_tenant()

        resp = APIClient().get(
            "/api/v1/catalog/context/", HTTP_X_FORWARDED_HOST=UNKNOWN_HOST
        )
        assert resp.status_code == 200, resp.content
        data = resp.json()["data"]

        # Neutral Beanola context: shared portal, no resolved tenant (R19.1).
        assert data["portal_type"] == "shared"
        assert data["institution_id"] is None
        assert data["institution_code"] is None

        # Neutral branding only — never a tenant's (R19.2).
        brand = data["brand"]
        assert brand["name"] == "Beanola Admissions"
        assert brand["owner"] == "Beanola Technologies"
        brand_values = set(brand.values())
        for inst in (disabled_inst, active_inst):
            assert inst.brand_name not in brand_values
            assert inst.name not in brand_values
            assert inst.code not in brand_values

    # -- R19.3 / R19.2 ---------------------------------------------------- #

    def test_disabled_host_fails_closed_to_neutral_beanola(self):
        """R19.3/R19.2: a disabled domain does NOT resolve an active tenant; it
        fails closed to the neutral context exposing no tenant branding."""
        disabled_inst, _, _ = self._build_disabled_tenant()

        resp = APIClient().get(
            "/api/v1/catalog/context/", HTTP_X_FORWARDED_HOST=DISABLED_HOST
        )
        assert resp.status_code == 200, resp.content
        data = resp.json()["data"]

        # The disabled host must NOT resolve the (otherwise active) tenant.
        assert data["portal_type"] == "shared"
        assert data["institution_id"] is None
        assert data["institution_id"] != str(disabled_inst.id)
        assert data["institution_code"] is None

        # No tenant-private branding leaks through the neutral brand (R19.2).
        brand = data["brand"]
        assert brand["name"] == "Beanola Admissions"
        brand_values = set(brand.values())
        assert disabled_inst.brand_name not in brand_values
        assert disabled_inst.name not in brand_values
        assert disabled_inst.code not in brand_values

    def test_disabled_host_does_not_serve_tenant_private_offering_portal(self):
        """R19.2/R19.3: the disabled host never serves the tenant's white-label
        offering portal. It yields the neutral shared catalog spanning ALL
        tenants, in deliberate contrast to a genuinely-active host that scopes
        to a single tenant."""
        _, disabled_canon, _ = self._build_disabled_tenant()
        _, active_canon, _ = self._build_active_tenant()
        public = APIClient()

        # Contrast / baseline: a genuinely-active host DOES resolve a white-label
        # tenant and scopes the catalog to ONLY that tenant's canonical program
        # (R8.7). This proves host-driven scoping is real, so the disabled-host
        # fail-closed below is meaningful and not a no-op.
        active_resp = public.get(
            "/api/v1/catalog/canonical-programs/", HTTP_X_FORWARDED_HOST=ACTIVE_HOST
        )
        assert active_resp.status_code == 200, active_resp.content
        active_ids = _canonical_program_ids(active_resp.json())
        assert str(active_canon.id) in active_ids
        assert str(disabled_canon.id) not in active_ids  # tenant-scoped

        # Disabled host: must NOT be treated as the disabled tenant's private
        # white-label portal. It fails closed to the neutral shared catalog,
        # which spans every tenant (R8.6) — proving it is NOT scoped to the
        # disabled tenant (R19.2/R19.3).
        disabled_resp = public.get(
            "/api/v1/catalog/canonical-programs/", HTTP_X_FORWARDED_HOST=DISABLED_HOST
        )
        assert disabled_resp.status_code == 200, disabled_resp.content
        disabled_ids = _canonical_program_ids(disabled_resp.json())
        assert str(active_canon.id) in disabled_ids
        assert str(disabled_canon.id) in disabled_ids
        # The disabled host is treated identically to a fully-unknown host —
        # the neutral shared catalog — never as a tenant-scoped subset.
        unknown_resp = public.get(
            "/api/v1/catalog/canonical-programs/", HTTP_X_FORWARDED_HOST=UNKNOWN_HOST
        )
        assert unknown_resp.status_code == 200, unknown_resp.content
        assert _canonical_program_ids(unknown_resp.json()) == disabled_ids
        # And it is strictly broader than the tenant-scoped active portal,
        # i.e. the disabled domain did not collapse to one tenant's offerings.
        assert active_ids < disabled_ids

    # -- R19.4 ------------------------------------------------------------ #

    def test_disabled_resolution_is_logged_for_ops_review(self, caplog):
        """R19.4: a disabled (non-active) domain resolution is logged for ops
        review — without leaking the school's data into the log."""
        disabled_inst, _, _ = self._build_disabled_tenant()

        caplog.clear()
        with caplog.at_level(logging.WARNING, logger=SERVICE_LOGGER):
            resp = APIClient().get(
                "/api/v1/catalog/context/", HTTP_X_FORWARDED_HOST=DISABLED_HOST
            )
        assert resp.status_code == 200, resp.content

        records = [r for r in caplog.records if r.name == SERVICE_LOGGER]
        messages = [r.getMessage() for r in records]
        assert any("domain.non_active" in m for m in messages), messages
        non_active = next(m for m in messages if "domain.non_active" in m)
        # The hostname is surfaced for ops; the disabled status is noted.
        assert DISABLED_HOST in non_active
        assert "disabled" in non_active
        # No school identity (name/brand/code) is written to the log (no PII).
        assert disabled_inst.name not in non_active
        assert disabled_inst.brand_name not in non_active
        assert disabled_inst.code not in non_active

    def test_unknown_resolution_is_logged_for_ops_review(self, caplog):
        """R19.4: an unknown host resolution is logged for ops review.

        ``_report_unknown`` suppresses legitimate shared-portal/platform hosts
        (``ALLOWED_HOSTS`` + common dev hosts). The test settings inherit
        ``ALLOWED_HOSTS == ["*"]`` from dev, which would suppress everything, so
        we pin a concrete allow-list here to exercise the genuine unknown-host
        logging path for a host that is NOT a legitimate platform host.
        """
        self._build_active_tenant()

        caplog.clear()
        with override_settings(ALLOWED_HOSTS=["testserver", "localhost"]):
            with caplog.at_level(logging.WARNING, logger=SERVICE_LOGGER):
                resp = APIClient().get(
                    "/api/v1/catalog/context/", HTTP_X_FORWARDED_HOST=UNKNOWN_HOST
                )
        assert resp.status_code == 200, resp.content

        records = [r for r in caplog.records if r.name == SERVICE_LOGGER]
        messages = [r.getMessage() for r in records]
        assert any("domain.unknown" in m for m in messages), messages
        unknown_msg = next(m for m in messages if "domain.unknown" in m)
        assert UNKNOWN_HOST in unknown_msg
