"""Property 16 — application binds to the resolved offering.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 7.10.

Feature: enterprise-tenant-authority, Property 16: Application binds to the resolved offering

*For all* applications created under a resolved tenant context, the application
is recorded against an ``Institution_Program_Offering`` belonging to the
resolved tenant.

This drives the real application-create path
(``ApplicationListCreateView.post`` in
``backend/apps/applications/admin_review_views.py``) over the DRF
``APIClient``. The create request arrives on an **active white-label host**
that ``InstitutionContextService.resolve`` maps to exactly one tenant, so the
view binds the application onto that resolved tenant's offering via
``OfferingAssignmentService``. The property asserts the persisted
``Application`` is bound to the resolved tenant: its ``institution_ref_id``
matches the resolved institution and its ``program_offering`` is an offering
**belonging to that institution** (never another tenant's offering).

The setup mirrors the proven program-first create in
``tests/integration/test_tenant_lifecycle_drill.py`` steps 9-10 (the same
payload shape and ``_create_application`` helper), generalised across a
hypothesis-generated input space:

* a competing **foreign tenant** also offers the *same* canonical program +
  intake, so a leaky binding would have somewhere to leak to;
* the resolved tenant has one **or several** candidate offerings (the service
  picks one deterministically — every candidate must still belong to the
  resolved tenant);
* the applicant either posts the resolved tenant's own ``institution_id`` (the
  white-label restriction) or omits it entirely;
* nationality / country vary across the generated examples.

Backend property test: ``pytest`` + ``hypothesis``, ≥100 examples, one property
(Property 16) per file. Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_application_binding.py -q

**Validates: Requirements 7.11, 8.5, 18.4**
"""

from __future__ import annotations

import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.applications.models import Application
from apps.catalog.models import InstitutionDomain, Program
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_institution_domain,
    build_intake,
    build_offering,
    build_profile,
    build_program_intake,
)

# ≥100 examples (spec minimum). Deadline relaxed for the DB + HTTP round-trips.
HYPOTHESIS_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


# ---------------------------------------------------------------------------
# Generators (constrained to the valid program-first create input space)
# ---------------------------------------------------------------------------

# (nationality, country) pairs the assignment + fee resolver accept.
RESIDENCY = st.sampled_from(
    [
        ("Zambian", "Zambia"),
        ("Zimbabwean", "Zimbabwe"),
        ("Malawian", "Malawi"),
        (None, None),
    ]
)
# How many candidate offerings the resolved tenant exposes for the shared
# canonical program + intake (all belong to the resolved tenant).
OFFERING_COUNT = st.integers(min_value=1, max_value=3)
# Whether the applicant posts the resolved tenant's own institution_id (the
# white-label restriction) or omits it (pure program-first).
POST_INSTITUTION_ID = st.booleans()


def _sfx() -> str:
    return uuid.uuid4().hex[:10]


def _client_for(profile: Profile) -> APIClient:
    """An ``APIClient`` authenticated as ``profile`` (force_authenticate bypasses CSRF)."""
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


# ---------------------------------------------------------------------------
# Property 16
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestProperty16ApplicationBinding:
    """Property 16: Application binds to the resolved offering.

    Feature: enterprise-tenant-authority, Property 16: Application binds to the resolved offering

    **Validates: Requirements 7.11, 8.5, 18.4**
    """

    @HYPOTHESIS_SETTINGS
    @given(
        residency=RESIDENCY,
        offering_count=OFFERING_COUNT,
        post_institution_id=POST_INSTITUTION_ID,
    )
    def test_application_binds_to_resolved_tenant_offering(
        self, residency, offering_count, post_institution_id
    ):
        """An application created on an active white-label host is recorded
        against an offering belonging to the resolved tenant.

        A competing foreign tenant offers the *same* canonical program + intake;
        the binding must never resolve to it. The resolved tenant may expose
        several candidate offerings — whichever the service selects, it must
        still belong to the resolved tenant (R7.11, R8.5, R18.4).
        """
        nationality, country = residency

        # The single canonical program + intake both tenants compete for.
        canonical = build_canonical_program(suffix=_sfx())
        intake = build_intake(suffix=_sfx())

        # Resolved tenant (A): reachable via an active white-label domain, with
        # one or more candidate offerings of the shared canonical program.
        resolved = build_institution(suffix=_sfx())
        hostname = f"apply-{_sfx()}.example"
        build_institution_domain(
            institution=resolved,
            hostname=hostname,
            status=InstitutionDomain.STATUS_ACTIVE,
            is_active=True,
        )
        resolved_offering_ids: set[str] = set()
        for index in range(offering_count):
            offering = build_offering(
                institution=resolved,
                canonical_program=canonical,
                suffix=f"{_sfx()}-{index:02d}",
                # Distinct priorities so the service picks deterministically.
                assignment_priority=100 + index,
            )
            build_program_intake(offering=offering, intake=intake)
            resolved_offering_ids.add(str(offering.id))

        # Foreign tenant (B): also offers the *same* canonical program + intake,
        # so a leaky binding would have somewhere to leak to.
        foreign = build_institution(suffix=_sfx())
        foreign_offering = build_offering(
            institution=foreign,
            canonical_program=canonical,
            suffix=_sfx(),
            assignment_priority=1,  # highest priority — must still be ignored
        )
        build_program_intake(offering=foreign_offering, intake=intake)

        student = build_profile(role="student", suffix=_sfx())
        client = _client_for(student)

        payload = {
            "full_name": f"Binding Applicant {_sfx()}",
            "nrc_number": "123456/78/9",
            "date_of_birth": "2000-01-01",
            "sex": "Female",
            "phone": "+260970000001",
            "email": f"binding-{_sfx()}@example.com",
            "residence_town": "Lusaka",
            "program_id": str(canonical.id),
            "intake_id": str(intake.id),
        }
        if nationality is not None:
            payload["nationality"] = nationality
        if country is not None:
            payload["country"] = country
        if post_institution_id:
            payload["institution_id"] = str(resolved.id)

        resp = client.post(
            "/api/v1/applications/",
            payload,
            format="json",
            HTTP_X_FORWARDED_HOST=hostname,
        )

        # Create succeeds against the resolved tenant.
        assert resp.status_code == 201, (resp.status_code, getattr(resp, "data", None))
        body = resp.json()["data"]
        app = Application.objects.get(id=body["id"])

        # Bound to the resolved tenant's institution (R7.11).
        assert str(app.institution_ref_id) == str(resolved.id)

        # Bound to an Institution_Program_Offering of the resolved tenant —
        # one of the candidate offerings, and that offering belongs to the
        # resolved institution (R8.5, R18.4).
        assert app.program_offering_id is not None
        assert str(app.program_offering_id) in resolved_offering_ids
        assert str(app.program_offering.institution_id) == str(resolved.id)

        # Never bound to the competing foreign tenant's offering.
        assert str(app.program_offering_id) != str(foreign_offering.id)
        assert str(app.program_offering.institution_id) != str(foreign.id)

        # The offering is genuinely an offering of the bound institution (the
        # FK reachable via the catalog Program table — defends against a stale
        # snapshot binding).
        assert Program.objects.filter(
            id=app.program_offering_id, institution_id=resolved.id
        ).exists()
