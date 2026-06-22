"""Domain creation init-state property test (Task 7.7).

# Feature: enterprise-tenant-authority, Property 12: Domain creation initializes verification state

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 7.7 (R7.3); design.md
"Property 12: Domain creation initializes verification state".

Property 12 (Domain creation initializes verification state): *for all* valid
hostnames, creating a tenant domain through the super-admin domain create
endpoint (``POST /api/v1/admin/institutions/{id}/domains/``,
``AdminTenantDomainListCreateView.post``) yields a domain whose

* ``status`` is ``pending_dns`` (the verification-pending lifecycle entry,
  never directly routable),
* ``verification_token`` is at least 32 characters long,
* ``dns_target`` is a non-empty generated target, and
* response carries the ``dns_record`` the tenant must publish.

This drives the **real** endpoint over DRF ``APIClient`` + ``force_authenticate``
as a ``super_admin`` (the JWTUser pattern), so the init-state guarantee is pinned
at the HTTP boundary rather than against the model in isolation. Each example
creates a fresh institution and a hostname carrying a unique label, so the
serializer's hostname-uniqueness check never produces a spurious ``400`` across
the ≥100 generated examples that accumulate in the per-test transaction.

Backend property test: ``pytest`` + ``hypothesis``, ≥100 examples, one property
(Property 12) per file. Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_domain_creation_init.py -q

**Validates: Requirements 7.3**
"""

from __future__ import annotations

import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import InstitutionDomain
from tests.tenant_fixtures import build_institution, build_profile

# ≥100 examples (spec minimum). Deadline relaxed for the DB + HTTP round-trip;
# every example creates rows in the function-scoped ``db`` transaction, so the
# function-scoped-fixture health check is suppressed (the rows roll back at the
# end of the test).
HYPOTHESIS_SETTINGS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


# ---------------------------------------------------------------------------
# Valid-hostname generator
# ---------------------------------------------------------------------------
#
# A DNS hostname is a sequence of dot-separated labels; each label is 1–63 chars
# of ``[a-z0-9-]`` that neither starts nor ends with a hyphen. The serializer
# lower-cases + strips, so we generate lowercase labels directly. We compose
# 1–2 generated labels plus a realistic TLD, then prepend a per-example unique
# label in the test so the ``hostname`` uniqueness check is never the thing that
# fails (this property is about init state, not collision handling — that is
# Property 15).
_label = st.from_regex(r"[a-z0-9]([a-z0-9-]{0,20}[a-z0-9])?", fullmatch=True)
_tld = st.sampled_from(["com", "edu", "org", "net", "io", "edu.zm", "ac.zm", "co.zm"])
_hostname_base = st.builds(
    lambda labels, tld: ".".join([*labels, tld]),
    st.lists(_label, min_size=1, max_size=2),
    _tld,
)


def _super_admin_client() -> APIClient:
    """An APIClient authenticated as a ``super_admin`` via the JWTUser pattern."""
    profile = build_profile(role="super_admin")
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


# Feature: enterprise-tenant-authority, Property 12: Domain creation initializes verification state
@pytest.mark.django_db
class TestDomainCreationInitState:
    """Property 12: creating a tenant domain initialises the verification state.

    **Validates: Requirements 7.3**
    """

    @HYPOTHESIS_SETTINGS
    @given(hostname_base=_hostname_base)
    def test_create_initializes_pending_dns_token_and_dns_record(self, hostname_base):
        """For any valid hostname, the super-admin create endpoint returns a
        ``201`` whose domain is ``pending_dns`` with a ≥32-char
        ``verification_token``, a non-empty ``dns_target``, and a ``dns_record``
        in the response envelope — and the persisted row matches."""
        client = _super_admin_client()
        institution = build_institution()
        # Prepend a per-example unique label so the hostname-uniqueness check
        # never produces a spurious 400 across accumulating examples.
        hostname = f"d{uuid.uuid4().hex[:10]}.{hostname_base}"

        response = client.post(
            f"/api/v1/admin/institutions/{institution.id}/domains/",
            data={"hostname": hostname, "is_primary": True, "is_active": True},
            format="json",
        )

        assert response.status_code == 201, response.content
        data = response.json()["data"]

        # Status is the verification-pending lifecycle entry (R7.3).
        assert data["status"] == InstitutionDomain.STATUS_PENDING_DNS == "pending_dns"

        # Verification token is generated and ≥32 chars (R7.3).
        assert isinstance(data["verification_token"], str)
        assert len(data["verification_token"]) >= 32

        # A DNS target is generated and non-empty (R7.3).
        assert isinstance(data["dns_target"], str)
        assert data["dns_target"].strip() != ""

        # The response carries the DNS record the tenant must publish (R7.3).
        assert "dns_record" in data
        assert data["dns_record"]
        assert data["dns_record"].get("value")

        # The persisted row reflects the same initialised verification state.
        domain = InstitutionDomain.objects.get(id=data["id"])
        assert domain.status == InstitutionDomain.STATUS_PENDING_DNS
        assert len(domain.verification_token) >= 32
        assert (domain.dns_target or "").strip() != ""
        assert str(domain.institution_id) == str(institution.id)
