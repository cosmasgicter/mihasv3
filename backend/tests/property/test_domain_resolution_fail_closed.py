"""Fail-closed domain resolution property tests (Task 7.9).

# Feature: enterprise-tenant-authority, Property 14: Fail-closed domain resolution

Spec: enterprise-tenant-authority — Task 7.9 (R7.8, R7.9, R18.1, R19.1, R19.2,
R19.3); design.md "Property 14: Fail-closed domain resolution".

Property 14 (Fail-closed domain resolution): *for all* domain configurations
attached to a hostname, ``InstitutionContextService.resolve(host)`` resolves a
white-label tenant **iff** exactly one matching ``InstitutionDomain`` has
``status == active``, ``is_active == True``, and an **active** institution. For
every other configuration — an unknown host, a host whose only matching rows are
in a non-active status (``pending_dns`` / ``pending_review`` / ``verified`` /
``disabled`` / ``failed``), a host whose active-status row is itself inactive or
points at an inactive institution, or a multi-match collision — resolution fails
closed to the **Neutral Beanola context** (``portal_type == "shared"``,
``institution is None``, ``brand["name"] == "Beanola Admissions"``) and leaks
**no** tenant-private branding (the school's ``name`` / ``brand_name`` never
appears anywhere in the neutral brand payload).

Generator design — respecting the two real DB constraints so we exercise the
*service* fail-closed logic rather than the storage layer:

* ``institution_domains.hostname`` is a **case-sensitive** ``UNIQUE`` column, so
  several rows for the *same logical hostname* must use distinct case variants
  that share the same ``lower(hostname)`` (the resolver matches with
  ``iexact``). ``_case_variants`` produces those.
* A **partial unique index** ``uq_institution_domains_active_hostname`` on
  ``lower(hostname) WHERE status = 'active'`` permits at most one ``active``-row
  per hostname. The generator therefore emits **at most one** ``status=active``
  row per example (optionally inactive or on an inactive institution) plus any
  number of **non-active** decoy rows — which is exactly the realistic
  "single vs multiple matching rows" space the resolver must fail-closed over.

The query host is additionally varied (lowercase / uppercase / mixed-case /
``:port`` suffix) to pin that the resolve decision is case- and port-insensitive
for both the resolving and the fail-closed branches (R3.4 carried into R7.8).

**Validates: Requirements 7.8, 7.9, 18.1, 19.1, 19.2, 19.3**
"""

from __future__ import annotations

import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.catalog.models import InstitutionDomain
from apps.catalog.services import InstitutionContextService
from tests.tenant_fixtures import build_institution, build_institution_domain

# The five non-active statuses. Any matching row in one of these never resolves
# a tenant, no matter how the row's ``is_active`` flag or its institution looks.
_NON_ACTIVE_STATUSES = (
    InstitutionDomain.STATUS_PENDING_DNS,
    InstitutionDomain.STATUS_PENDING_REVIEW,
    InstitutionDomain.STATUS_VERIFIED,
    InstitutionDomain.STATUS_DISABLED,
    InstitutionDomain.STATUS_FAILED,
)

# One decoy row: a non-active status plus arbitrary row/institution activity.
_decoy = st.tuples(
    st.sampled_from(_NON_ACTIVE_STATUSES),
    st.booleans(),  # row is_active
    st.booleans(),  # institution is_active
)

# How the caller presents the host to ``resolve`` — the resolver lowercases and
# strips the port, so all four forms must yield the same decision.
_HOST_FORM = st.sampled_from(("lower", "upper", "mixed", "port"))

# ≥100 examples (task requirement). Each example builds 1–6 institutions plus
# their domain rows inside the single ``django_db`` transaction that spans every
# hypothesis example, so deadlines are relaxed and the function-scoped fixture /
# data-size health checks are suppressed — the harness the other DB-backed
# enterprise-tenant-authority properties use.
_PROPERTY_SETTINGS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)


def _base_hostname() -> str:
    """A globally-unique, all-lowercase hostname rich in alphabetic characters.

    The ``django_db`` transaction spans all hypothesis examples, so rows from
    earlier examples persist; a per-example uuid keeps every hostname unique.
    The trailing ``abcdef`` guarantees enough re-caseable letters to mint a
    distinct case variant for every row in an example.
    """
    return f"a{uuid.uuid4().hex}abcdef.example"


def _case_variants(base_lower: str, count: int) -> list[str]:
    """``count`` distinct exact strings that all share ``lower() == base_lower``.

    Variant 0 is the verbatim lowercase host; variant *i* upper-cases the
    *(i-1)*-th alphabetic position. With ``count <= 6`` and well over five
    alphabetic positions in ``base_lower`` every variant is unique, so each row
    survives the case-sensitive ``UNIQUE(hostname)`` column while the resolver's
    ``iexact`` lookup still groups them under one logical hostname.
    """
    alpha_positions = [i for i, c in enumerate(base_lower) if c.isalpha()]
    variants: list[str] = []
    for i in range(count):
        chars = list(base_lower)
        if i > 0:
            pos = alpha_positions[(i - 1) % len(alpha_positions)]
            chars[pos] = chars[pos].upper()
        variants.append("".join(chars))
    assert len(set(variants)) == count, "case variants must be distinct"
    return variants


def _present_host(base_lower: str, form: str) -> str:
    """Transform the lowercase host into the caller-presented form."""
    if form == "upper":
        return base_lower.upper()
    if form == "mixed":
        return _case_variants(base_lower, 2)[1]
    if form == "port":
        return f"{base_lower}:8443"
    return base_lower


@pytest.mark.django_db
class TestFailClosedDomainResolution:
    # Feature: enterprise-tenant-authority, Property 14: Fail-closed domain resolution
    """Property 14: ``resolve`` returns a white-label tenant *iff* exactly one
    matching domain is ``active`` + ``is_active`` on an active institution;
    every other configuration fails closed to the Neutral Beanola context with
    no tenant-private branding leak.

    **Validates: Requirements 7.8, 7.9, 18.1, 19.1, 19.2, 19.3**
    """

    @_PROPERTY_SETTINGS
    @given(
        has_active_row=st.booleans(),
        active_row_is_active=st.booleans(),
        active_inst_is_active=st.booleans(),
        decoys=st.lists(_decoy, min_size=0, max_size=4),
        host_form=_HOST_FORM,
    )
    def test_resolves_iff_single_active_match_else_fails_closed(
        self,
        has_active_row,
        active_row_is_active,
        active_inst_is_active,
        decoys,
        host_form,
    ):
        base_lower = _base_hostname()
        # One case variant per row (active row first, then each decoy) so every
        # stored hostname is a distinct exact string sharing one lower().
        variants = _case_variants(base_lower, 1 + len(decoys))

        institutions = []  # every institution we attach to this hostname
        active_institution = None

        if has_active_row:
            active_institution = build_institution(is_active=active_inst_is_active)
            institutions.append(active_institution)
            build_institution_domain(
                institution=active_institution,
                hostname=variants[0],
                is_active=active_row_is_active,
                status=InstitutionDomain.STATUS_ACTIVE,
            )

        for index, (status, row_active, inst_active) in enumerate(decoys):
            decoy_inst = build_institution(is_active=inst_active)
            institutions.append(decoy_inst)
            build_institution_domain(
                institution=decoy_inst,
                hostname=variants[index + 1],
                is_active=row_active,
                status=status,
            )

        # The tenant resolves *iff* the single active-status row is itself
        # active AND sits on an active institution. Non-active decoys never
        # contribute, so they can only ever fail closed.
        expected_resolves = (
            has_active_row and active_row_is_active and active_inst_is_active
        )

        presented = _present_host(base_lower, host_form)
        context = InstitutionContextService().resolve(presented)

        if expected_resolves:
            assert context.portal_type == "white_label", (
                host_form,
                expected_resolves,
            )
            assert context.institution is not None
            assert context.institution.id == active_institution.id
            assert context.brand["name"] == (
                active_institution.brand_name or active_institution.name
            )
        else:
            # Fail closed to the Neutral Beanola context (R7.9, R19.1–R19.3).
            assert context.portal_type == "shared", (host_form, decoys)
            assert context.institution is None
            assert context.brand["name"] == "Beanola Admissions"
            # No tenant-private branding leaks through the neutral payload.
            brand_values = set(context.brand.values())
            for inst in institutions:
                assert inst.name not in brand_values
                assert inst.brand_name not in brand_values

    @_PROPERTY_SETTINGS
    @given(
        label=st.text(
            alphabet="abcdefghijklmnopqrstuvwxyz0123456789-",
            min_size=0,
            max_size=24,
        ),
        host_form=_HOST_FORM,
    )
    def test_unknown_host_always_fails_closed(self, label, host_form):
        """An unknown host (no configured domain row whatsoever) always resolves
        to the Neutral Beanola context — the baseline fail-closed case (R19.1)."""
        base_lower = f"a{label}{uuid.uuid4().hex}.unknown.example"
        context = InstitutionContextService().resolve(
            _present_host(base_lower, host_form)
        )
        assert context.portal_type == "shared"
        assert context.institution is None
        assert context.brand["name"] == "Beanola Admissions"
