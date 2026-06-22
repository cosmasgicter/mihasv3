"""Domain verification outcome property tests (Task 7.8).

# Feature: enterprise-tenant-authority, Property 13: Domain verification outcome

Spec: enterprise-tenant-authority — Task 7.8 (R7.4, R7.5); design.md "Property
13: Domain verification outcome".

Property 13 (Domain verification outcome): with the DNS resolver seam mocked so
no network is touched, ``verify_institution_domain_task(domain_id)`` is a pure
state transition over a ``pending_dns`` domain:

* **Match** — the resolved records satisfy the expected ``dns_target``: the
  domain transitions ``pending_dns -> pending_review`` (guarded by the
  ``DomainStatusMachine``), ``verified_at`` and ``last_checked_at`` are set, and
  ``last_error`` is cleared (R7.4).
* **Mismatch / timeout / lookup failure** — the resolver returns non-matching
  records *or* raises (modelling a timeout): the domain stays ``pending_dns``, a
  descriptive ``last_error`` of at most 1000 characters is recorded, and
  ``last_checked_at`` is updated (R7.5).

In every case the task is fail-safe and **never propagates an exception** — the
test asserts a normal return for matches, mismatches, and resolver timeouts
alike.

The single seam the task resolves through is ``_lookup_dns_records`` in
``apps.catalog.tasks``; this test patches it wholesale (returning matching /
non-matching records, or raising) so the property runs entirely against the
test database with zero network I/O.

**Validates: Requirements 7.4, 7.5**
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from apps.catalog.models import InstitutionDomain
from apps.catalog.tasks import _dns_target_matches, verify_institution_domain_task
from tests.tenant_fixtures import build_institution, build_institution_domain

_SEAM = "apps.catalog.tasks._lookup_dns_records"

# ≥100 examples (task requirement). Each example builds an institution + a
# domain row, so the deadline is relaxed and the function-scoped ``db`` fixture
# / data-size health checks are suppressed — the same harness the other
# DB-backed enterprise-tenant-authority properties use.
_PROPERTY_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)

# A DNS verification target token: lowercase alnum + a few DNS-ish punctuation
# characters. Non-empty so the task never short-circuits on a blank target.
_dns_target = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789-=._",
    min_size=8,
    max_size=48,
).filter(lambda s: s.strip().strip('"').strip().strip(".") != "")

# Arbitrary "other" record values used to build a non-matching record set.
_noise_value = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789-=._",
    min_size=0,
    max_size=48,
)


def _make_pending_domain(dns_target: str) -> InstitutionDomain:
    """Persist a fresh ``pending_dns`` domain with a globally-unique hostname.

    The ``django_db`` transaction spans every hypothesis example, so rows from
    earlier examples persist; a uuid-suffixed hostname keeps the unique
    ``hostname`` column collision-free across examples.
    """
    institution = build_institution()
    hostname = f"verify-{uuid.uuid4().hex}.example"
    return build_institution_domain(
        institution=institution,
        hostname=hostname,
        status=InstitutionDomain.STATUS_PENDING_DNS,
        dns_target=dns_target,
        verified_at=None,
        last_checked_at=None,
        last_error="stale-error-should-be-cleared-on-match",
    )


@pytest.mark.django_db
class TestDomainVerificationMatch:
    # Feature: enterprise-tenant-authority, Property 13: Domain verification outcome
    """Property 13 (match half): a resolver that publishes the expected target
    transitions ``pending_dns -> pending_review`` and stamps the timestamps.

    **Validates: Requirements 7.4**
    """

    @_PROPERTY_SETTINGS
    @given(dns_target=_dns_target, noise=st.sets(_noise_value, max_size=4))
    def test_match_transitions_to_pending_review(self, dns_target, noise):
        """When DNS records satisfy ``dns_target`` the domain moves to
        ``pending_review`` with ``verified_at`` + ``last_checked_at`` set and
        ``last_error`` cleared. The match record is quoted to exercise the
        TXT-style normalization in ``_dns_target_matches``."""
        domain = _make_pending_domain(dns_target)
        # A quoted record value equal to the target (TXT form) plus arbitrary
        # noise — guaranteed to match per the normalization rules.
        records = {f'"{dns_target}"', *noise}

        with patch(_SEAM, return_value=records) as mocked:
            result = verify_institution_domain_task(domain.id)

        # Fail-safe: the task returns normally (never raises) and never touched
        # the network — only the mocked seam.
        assert result is None
        assert mocked.called

        domain.refresh_from_db()
        assert domain.status == InstitutionDomain.STATUS_PENDING_REVIEW
        assert domain.verified_at is not None
        assert domain.last_checked_at is not None
        assert domain.last_error is None


@pytest.mark.django_db
class TestDomainVerificationFailure:
    # Feature: enterprise-tenant-authority, Property 13: Domain verification outcome
    """Property 13 (failure half): a mismatch or a resolver timeout leaves the
    domain ``pending_dns`` with a bounded ``last_error`` and a refreshed
    ``last_checked_at``.

    **Validates: Requirements 7.5**
    """

    @_PROPERTY_SETTINGS
    @given(dns_target=_dns_target, records=st.sets(_noise_value, max_size=5))
    def test_mismatch_stays_pending_dns(self, dns_target, records):
        """Non-matching records leave the status at ``pending_dns``, record a
        descriptive ``last_error`` (≤1000 chars), and update
        ``last_checked_at``."""
        # Only exercise genuinely-non-matching record sets; the helper is the
        # same predicate the task uses, so this skips rare accidental matches.
        assume(not _dns_target_matches(dns_target, records))

        domain = _make_pending_domain(dns_target)

        with patch(_SEAM, return_value=records) as mocked:
            result = verify_institution_domain_task(domain.id)

        assert result is None
        assert mocked.called

        domain.refresh_from_db()
        assert domain.status == InstitutionDomain.STATUS_PENDING_DNS
        assert domain.last_checked_at is not None
        assert domain.last_error is not None
        assert len(domain.last_error) <= 1000

    @_PROPERTY_SETTINGS
    @given(dns_target=_dns_target, message=st.text(max_size=2000))
    def test_timeout_or_lookup_failure_stays_pending_dns(self, dns_target, message):
        """A resolver that raises (modelling a 10s timeout or any lookup
        failure) is treated exactly like a mismatch: status unchanged, bounded
        ``last_error`` recorded, ``last_checked_at`` updated, and the task still
        returns normally (never propagates the exception)."""
        domain = _make_pending_domain(dns_target)

        with patch(_SEAM, side_effect=TimeoutError(message)) as mocked:
            result = verify_institution_domain_task(domain.id)

        # The defining fail-safe guarantee of R7.5: the exception never escapes.
        assert result is None
        assert mocked.called

        domain.refresh_from_db()
        assert domain.status == InstitutionDomain.STATUS_PENDING_DNS
        assert domain.last_checked_at is not None
        assert domain.last_error is not None
        assert len(domain.last_error) <= 1000
