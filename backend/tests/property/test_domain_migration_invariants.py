"""Domain migration invariant property tests (Task 1.2).

# Feature: enterprise-tenant-authority, Property 15: Active hostname uniqueness

Spec: enterprise-tenant-authority — Task 1.2 (R7.10); design.md "Property 15:
Active hostname uniqueness".

Property 15 (Active hostname uniqueness): *for all* attempts to create a second
``active`` ``InstitutionDomain`` for a hostname already ``active`` for another
tenant, the creation is rejected with a hostname conflict. The partial unique
index ``uq_institution_domains_active_hostname`` on
``lower(hostname) WHERE status = 'active'`` (added by
``scripts/2026_06_18_01_institution_domain_lifecycle.sql``) raises an
``IntegrityError`` at the DB boundary, which the super-admin domain views map to
the stable ``HOSTNAME_CONFLICT`` 409 envelope (R7.10, see
``apps/catalog/admin_views.py``).

The index is *active-scoped* and *case-insensitive*: a non-active domain
(``pending_dns``) may reuse the same hostname case-insensitively, because the
index only covers active rows. The companion property pins that scope so the
rejection above is the *active* uniqueness rule and not merely the column-level
``UNIQUE(hostname)`` constraint.

**Validates: Requirements 7.10**
"""

from __future__ import annotations

import uuid

import pytest
from django.db import IntegrityError, transaction
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.catalog.models import InstitutionDomain
from tests.tenant_fixtures import build_institution, build_institution_domain

# Lowercase DNS-ish labels. The test prepends a guaranteed-lowercase leading
# letter and a per-example uuid so every example's hostname is globally unique:
# the ``django_db`` transaction spans all hypothesis examples, so rows created
# by earlier examples persist into later ones and must not collide by accident.
_host_labels = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789-",
    min_size=0,
    max_size=24,
)


# ≥100 examples (task requirement). Each example builds two institutions and at
# least one domain row, so the deadline is relaxed and the function-scoped
# ``db`` fixture / data-size health checks are suppressed — the same harness the
# other enterprise-tenant-authority DB-backed properties use.
_PROPERTY_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)


def _unique_hostname(label: str) -> str:
    """A globally-unique, all-lowercase hostname that starts with a letter."""
    return f"a{label}{uuid.uuid4().hex}.example"


def _recase_first_char(hostname: str) -> str:
    """Upper-case the first char.

    ``_unique_hostname`` always starts with a lowercase ``a``, so this yields an
    *exact* string that differs from the original (defeating the case-sensitive
    column-level ``UNIQUE(hostname)``) while sharing the same ``lower(hostname)``
    (so the partial active index still collides).
    """
    return hostname[0].upper() + hostname[1:]


@pytest.mark.django_db
class TestActiveHostnameUniqueness:
    # Feature: enterprise-tenant-authority, Property 15: Active hostname uniqueness
    """Property 15: a second ``active`` domain for an already-``active`` hostname
    (held by a different tenant) is rejected with a hostname conflict.

    **Validates: Requirements 7.10**
    """

    @_PROPERTY_SETTINGS
    @given(label=_host_labels, recase_collider=st.booleans())
    def test_duplicate_active_hostname_rejected(self, label, recase_collider):
        """A second active domain for the same hostname — exact or case-variant,
        for a different tenant — must raise an ``IntegrityError``."""
        host = _unique_hostname(label)
        collider_host = _recase_first_char(host) if recase_collider else host

        inst_a = build_institution()
        inst_b = build_institution()

        # Tenant A holds the hostname as ``active``.
        build_institution_domain(
            institution=inst_a,
            hostname=host,
            status=InstitutionDomain.STATUS_ACTIVE,
        )

        # Tenant B's second ``active`` domain for the same hostname (exact when
        # recase_collider is False, case-variant when True) is rejected by the
        # partial unique index. Wrap in a savepoint so the aborted statement
        # does not poison the outer hypothesis transaction.
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                build_institution_domain(
                    institution=inst_b,
                    hostname=collider_host,
                    is_primary=False,
                    status=InstitutionDomain.STATUS_ACTIVE,
                )

    @_PROPERTY_SETTINGS
    @given(label=_host_labels)
    def test_non_active_hostname_does_not_collide(self, label):
        """A *non-active* domain reusing the hostname case-insensitively is
        allowed: the partial index only covers ``active`` rows, so the active
        uniqueness rule — not a blanket unique — is what rejects the duplicate
        active row above."""
        host = _unique_hostname(label)
        variant = _recase_first_char(host)  # same lower(), different exact string

        inst_a = build_institution()
        inst_b = build_institution()

        build_institution_domain(
            institution=inst_a,
            hostname=host,
            status=InstitutionDomain.STATUS_ACTIVE,
        )

        with transaction.atomic():
            domain_b = build_institution_domain(
                institution=inst_b,
                hostname=variant,
                is_primary=False,
                status=InstitutionDomain.STATUS_PENDING_DNS,
            )

        assert domain_b.pk is not None
        assert InstitutionDomain.objects.filter(pk=domain_b.pk).exists()
