"""Catalog cache invalidation + neutral-context tests (task 14.3).

The catalog read path (:mod:`apps.catalog.views`) caches serialized catalog
responses under ``namespace="cat"`` keyed by a resolved tenant-scope signature
(``_catalog_scope_signature``) and a TTL of 450s, gated on ``PERF_CACHE_CATALOG``
(task 14.1). Task 14.2 added synchronous write-path invalidation
(``apps.catalog.catalog_cache.invalidate_catalog_scopes``) that bumps the
per-scope version token *before* the write response returns. This module is the
deterministic unit/integration test (not a property test) that pins the two
behaviours task 14.3 calls for:

* **Invalidation (R4.3)** — once a catalog read is cached, an admin write
  through the real ``POST /api/v1/catalog/programs/`` endpoint forces the NEXT
  read for the affected scope(s) to recompute (it issues catalog queries again)
  and reflect the change. The write calls ``invalidate_catalog_scopes``
  synchronously within the request, so no ``on_commit`` handling is involved —
  the very next read in the same test (no transaction commit between) already
  recomputes, which is exactly what "before the write response returns" means.
  Both the writing admin's own resolved scope and the owning-tenant
  ``inst:<pk>`` scope are exercised.

* **Neutral context (R4.6)** — a request whose tenant scope cannot be resolved
  (a local/shared host) keys on the neutral Beanola ``"neutral"`` signature, not
  a tenant signature, and is therefore NEVER served a tenant-scoped
  (``inst:<pk>``) cache entry, and vice versa. A tenant entry and the neutral
  entry are distinct keys, so priming one never satisfies the other.

The catalog cache flag is forced ON (``PERF_CACHE_CATALOG=True``) for every test
here so the cache is actually exercised; query counting via
``CaptureQueriesContext`` proves a hit issues zero ``programs`` queries while a
recompute issues them again.

# Feature: system-performance-hardening
Requirements: 4.3, 4.6
"""

from __future__ import annotations

import re
import uuid

import pytest
from django.core.cache import cache
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.catalog.catalog_cache import CATALOG_NEUTRAL_SCOPE, catalog_institution_scope
from apps.catalog.models import Program
from apps.catalog.views import ProgramListCreateView, _catalog_scope_signature

from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_institution_domain,
    build_offering,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Lightweight authenticated caller (mirrors test_perf_golden_snapshots._JWTUser)
# ---------------------------------------------------------------------------


class _JWTUser:
    """Minimal JWT-style principal: role + a STABLE id, no DB row needed.

    The id is fixed for the lifetime of the instance so the same actor produces
    the same ``build_scope_signature`` across prime → write → re-read calls
    (the actor-scope invalidation path depends on a stable signature).
    """

    is_authenticated = True

    def __init__(self, role: str, user_id=None):
        self.role = role
        self.id = user_id or uuid.uuid4()
        self.pk = self.id


# ---------------------------------------------------------------------------
# Query classification (mirror test_perf_canonical_offerings_query_count.py)
# ---------------------------------------------------------------------------

_FROM_TABLE_RE = re.compile(r'\bFROM\s+"?(?P<table>[a-z_]+)"?', re.IGNORECASE)


def _primary_table(sql: str) -> str:
    match = _FROM_TABLE_RE.search(sql)
    return match.group("table").lower() if match else ""


def _programs_query_count(captured: CaptureQueriesContext) -> int:
    """Number of captured queries whose primary relation is the programs table.

    On a catalog cache hit the view's ``compute`` closure never runs, so zero
    ``programs`` queries fire; on a miss/recompute the list + count queries fire.
    """
    return sum(1 for q in captured.captured_queries if _primary_table(q["sql"]) == "programs")


# ---------------------------------------------------------------------------
# View drivers (real endpoint via APIRequestFactory + force_authenticate)
# ---------------------------------------------------------------------------

_PROGRAMS_URL = "/api/v1/catalog/programs/"


def _admin_program_read(factory, admin):
    """GET the programs list as an admin (cached under the admin's scope)."""
    request = factory.get(_PROGRAMS_URL)
    force_authenticate(request, user=admin)
    return ProgramListCreateView.as_view()(request)


def _public_program_read(factory, *, host=None):
    """GET the programs list unauthenticated.

    With ``host`` set to a tenant white-label hostname the read resolves to
    ``inst:<pk>``; with ``host`` omitted the default ``testserver`` host is a
    local/shared host that resolves to the neutral Beanola context.
    """
    extra = {"HTTP_X_FORWARDED_HOST": host} if host else {}
    request = factory.get(_PROGRAMS_URL, **extra)
    return ProgramListCreateView.as_view()(request)


def _admin_create_program(factory, admin, *, institution, canonical):
    """POST a new program offering through the real gated endpoint.

    The view calls ``invalidate_catalog_scopes(institution_id, user=admin)``
    synchronously before returning (R4.3).
    """
    code = f"OFR-{uuid.uuid4().hex[:8].upper()}"
    request = factory.post(
        _PROGRAMS_URL,
        {
            "name": f"Created Offering {code}",
            "code": code,
            "institution_id": str(institution.id),
            "canonical_program_id": str(canonical.id),
        },
        format="json",
    )
    force_authenticate(request, user=admin)
    response = ProgramListCreateView.as_view()(request)
    return response, code


def _total_count(response) -> int:
    """Extract paginated totalCount from a programs-list envelope."""
    data = response.data["data"]
    return data["totalCount"]


# ===========================================================================
# Invalidation (R4.3)
# ===========================================================================


@override_settings(PERF_CACHE_CATALOG=True)
def test_admin_write_forces_next_read_to_recompute_and_reflect_change():
    """A catalog read is cached; an admin write forces the next read to recompute.

    Validates R4.3 for the writing admin's own resolved scope: after priming the
    programs list (cached) the second read is a cache hit (zero ``programs``
    queries); a ``POST`` create then invalidates synchronously, so the next read
    recomputes (``programs`` queries fire again) and the totalCount reflects the
    new offering.
    """
    cache.clear()
    factory = APIRequestFactory()
    admin = _JWTUser("super_admin")

    institution = build_institution(suffix="inv-admin")
    canonical = build_canonical_program(suffix="inv-admin")
    build_offering(institution=institution, canonical_program=canonical, suffix="inv-admin-base")

    # Prime the cache.
    primed = _admin_program_read(factory, admin)
    assert primed.status_code == 200
    baseline_total = _total_count(primed)

    # Second read within TTL is a cache hit — no programs queries recomputed.
    with CaptureQueriesContext(connection) as hit_queries:
        hit = _admin_program_read(factory, admin)
    assert hit.status_code == 200
    assert _programs_query_count(hit_queries) == 0, "expected a cache hit (no recompute)"
    assert _total_count(hit) == baseline_total

    # Admin write — invalidates the actor's scope synchronously before returning.
    write_resp, new_code = _admin_create_program(
        factory, admin, institution=institution, canonical=canonical
    )
    assert write_resp.status_code == 201, write_resp.data
    assert Program.objects.filter(code=new_code).exists()

    # The next read MUST recompute (cache invalidated) and reflect the new row.
    with CaptureQueriesContext(connection) as recompute_queries:
        after = _admin_program_read(factory, admin)
    assert after.status_code == 200
    assert _programs_query_count(recompute_queries) > 0, "write must force a recompute"
    assert _total_count(after) == baseline_total + 1


@override_settings(PERF_CACHE_CATALOG=True)
def test_admin_write_invalidates_owning_tenant_scope_for_public_read():
    """An admin write to institution A invalidates A's ``inst:<pk>`` public scope.

    Validates R4.3 for the owning-tenant scope: a white-label tenant portal read
    (keyed ``inst:<A.pk>``) is cached, an admin creates a new offering for A, and
    the next tenant-A portal read recomputes and shows the extra offering — the
    write bumped the ``inst:<A.pk>`` version token synchronously.
    """
    cache.clear()
    factory = APIRequestFactory()
    admin = _JWTUser("super_admin")

    institution = build_institution(suffix="inv-tenant")
    canonical = build_canonical_program(suffix="inv-tenant")
    build_offering(institution=institution, canonical_program=canonical, suffix="inv-tenant-base")
    host = f"apply-{uuid.uuid4().hex[:8]}.example"
    build_institution_domain(institution=institution, hostname=host)

    # Sanity: this host resolves to the tenant scope the write will invalidate.
    sig_request = factory.get(_PROGRAMS_URL, HTTP_X_FORWARDED_HOST=host)
    assert _catalog_scope_signature(sig_request) == catalog_institution_scope(institution.id)

    primed = _public_program_read(factory, host=host)
    assert primed.status_code == 200
    baseline_total = _total_count(primed)
    assert baseline_total == 1  # only A's single offering is in tenant-A scope

    # Cache hit confirmation.
    with CaptureQueriesContext(connection) as hit_queries:
        hit = _public_program_read(factory, host=host)
    assert _programs_query_count(hit_queries) == 0

    write_resp, new_code = _admin_create_program(
        factory, admin, institution=institution, canonical=canonical
    )
    assert write_resp.status_code == 201, write_resp.data

    with CaptureQueriesContext(connection) as recompute_queries:
        after = _public_program_read(factory, host=host)
    assert _programs_query_count(recompute_queries) > 0, "owning-tenant write must force a recompute"
    assert _total_count(after) == baseline_total + 1
    assert any(row["code"] == new_code for row in after.data["data"]["results"])


# ===========================================================================
# Neutral context (R4.6)
# ===========================================================================


@override_settings(PERF_CACHE_CATALOG=True)
def test_unresolved_scope_keys_on_neutral_not_a_tenant_signature():
    """An unresolved host keys on the neutral signature; a tenant host keys on inst:<pk>.

    Validates R4.6: the scope the catalog read caches under for an unresolved
    (local/shared) host is the neutral Beanola ``"neutral"`` signature, which is
    distinct from any ``inst:<pk>`` tenant signature.
    """
    factory = APIRequestFactory()
    institution = build_institution(suffix="neutral-sig")
    host = f"apply-{uuid.uuid4().hex[:8]}.example"
    build_institution_domain(institution=institution, hostname=host)

    # Unresolved / local host -> neutral.
    neutral_request = factory.get(_PROGRAMS_URL)  # default testserver host
    assert _catalog_scope_signature(neutral_request) == CATALOG_NEUTRAL_SCOPE

    # Resolved white-label host -> the tenant signature.
    tenant_request = factory.get(_PROGRAMS_URL, HTTP_X_FORWARDED_HOST=host)
    tenant_sig = _catalog_scope_signature(tenant_request)
    assert tenant_sig == catalog_institution_scope(institution.id)
    assert tenant_sig != CATALOG_NEUTRAL_SCOPE


@override_settings(PERF_CACHE_CATALOG=True)
def test_neutral_request_never_served_a_tenant_cached_entry():
    """Priming a tenant-scoped entry never satisfies an unresolved-scope read.

    Validates R4.6: with two institutions each owning one offering, the
    tenant-A portal read is scoped to only A's offering (``inst:<A.pk>``) while an
    unresolved-host read computes under the neutral context and lists BOTH
    offerings. Priming the tenant-A entry first must NOT cause the neutral read
    to serve A-only data — the neutral read recomputes under its own key.
    """
    cache.clear()
    factory = APIRequestFactory()

    inst_a = build_institution(suffix="neutral-a")
    canon_a = build_canonical_program(suffix="neutral-a")
    build_offering(institution=inst_a, canonical_program=canon_a, suffix="neutral-a")
    host_a = f"apply-{uuid.uuid4().hex[:8]}.example"
    build_institution_domain(institution=inst_a, hostname=host_a)

    inst_b = build_institution(suffix="neutral-b")
    canon_b = build_canonical_program(suffix="neutral-b")
    build_offering(institution=inst_b, canonical_program=canon_b, suffix="neutral-b")

    # Prime the tenant-A entry (inst:<A.pk>): scoped to A's single offering.
    tenant = _public_program_read(factory, host=host_a)
    assert tenant.status_code == 200
    assert _total_count(tenant) == 1

    # Neutral read (unresolved host) must compute its own entry — both offerings,
    # not the tenant-A-only cached value.
    with CaptureQueriesContext(connection) as neutral_queries:
        neutral = _public_program_read(factory)
    assert neutral.status_code == 200
    assert _programs_query_count(neutral_queries) > 0, "neutral read must not be served the tenant entry"
    assert _total_count(neutral) == 2


@override_settings(PERF_CACHE_CATALOG=True)
def test_tenant_request_never_served_the_neutral_cached_entry():
    """The reverse direction: a primed neutral entry never satisfies a tenant read.

    Validates R4.6: priming the neutral entry (both offerings) first must NOT
    cause the tenant-A portal read to serve both offerings — the tenant read
    recomputes under ``inst:<A.pk>`` and sees only A's offering.
    """
    cache.clear()
    factory = APIRequestFactory()

    inst_a = build_institution(suffix="tenant-a")
    canon_a = build_canonical_program(suffix="tenant-a")
    build_offering(institution=inst_a, canonical_program=canon_a, suffix="tenant-a")
    host_a = f"apply-{uuid.uuid4().hex[:8]}.example"
    build_institution_domain(institution=inst_a, hostname=host_a)

    inst_b = build_institution(suffix="tenant-b")
    canon_b = build_canonical_program(suffix="tenant-b")
    build_offering(institution=inst_b, canonical_program=canon_b, suffix="tenant-b")

    # Prime the neutral entry first (lists both offerings).
    neutral = _public_program_read(factory)
    assert neutral.status_code == 200
    assert _total_count(neutral) == 2

    # Tenant-A read must compute its own scoped entry — only A's offering.
    with CaptureQueriesContext(connection) as tenant_queries:
        tenant = _public_program_read(factory, host=host_a)
    assert tenant.status_code == 200
    assert _programs_query_count(tenant_queries) > 0, "tenant read must not be served the neutral entry"
    assert _total_count(tenant) == 1
