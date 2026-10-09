"""Fail-closed tenant host resolution + query-override property tests (Task 2.3).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild`` — Task 2.3
("Make tenant host resolution fail closed"). Findings **TEN-09, TEN-10, STU-24**;
Requirements **R2.2–R2.4, R5.2–R5.3**.

Two properties are pinned against the *real*
``apps.catalog.services.OfferingDirectoryService`` /
``InstitutionContextService`` (no mocks, no production code changed):

* **Property A — trusted host wins / explicit fails closed.** For every
  combination of (trusted-host context present?, explicit ``?institution=``
  selector, request host, endpoint), ``resolved_institution_id`` returns the
  trusted tenant whenever a host resolves one and can *never* be overridden by
  the explicit selector; the explicit selector is honored **iff** there is no
  trusted host context **and** the endpoint is one of the two allow-listed
  neutral shared-portal endpoints **and** the request arrives on a registered
  neutral shared-portal host. Every other case resolves to the shared portal
  (``None``). This is the TEN-10 fix expressed as an invariant.

* **Property B — background-task context partitioned by canonical institution
  ID.** A per-institution background computation keys its cache/context by the
  canonical institution id (``catalog_cache.catalog_institution_scope``), so two
  distinct institutions never share a partition and one institution's cached
  context is never served for another (design §5.1: "Background task context is
  partitioned by canonical institution ID"). Unlike a request path, a background
  task has neither a host nor a ``?institution=`` query, so its only partition
  key is the canonical id carried on the record it processes.

Property A is a pure function of its inputs (no DB); Property B exercises the
real scoped-cache mechanism against Django's LocMemCache. Both run ≥100
Hypothesis examples.

Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_tenant_host_query_override.py -q

**Validates: Requirements 2.3, 2.4, 5.2, 5.3**
"""

from __future__ import annotations

from django.core.cache import cache
from django.test import override_settings
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.catalog.catalog_cache import catalog_institution_scope
from apps.catalog.services import InstitutionContextService, OfferingDirectoryService
from apps.common.scoped_cache import cached_or_compute

# The one registered neutral shared-portal host used across Property A. Pinned
# via ``override_settings`` so the ``is_registered_shared_portal_host`` allowlist
# is deterministic regardless of the ambient ``SHARED_PORTAL_HOSTS`` default.
_REGISTERED_PORTAL_HOST = "portal.beanola.example"

# A stable id for the trusted-host tenant and a DISTINCT explicit selector, so
# "trusted host wins" is never vacuously satisfied by the two ids coinciding.
_TRUSTED_ID = "trusted-institution-id"
_OTHER_ID = "other-institution-id"

# The two endpoints the design allow-lists for an explicit public selector, plus
# representative non-allow-listed endpoint names.
_ALLOWLISTED_ENDPOINTS = ("canonical_programs", "assignment_preview")
_NON_ALLOWLISTED_ENDPOINTS = ("programs", "intakes", "institutions", "", None)

_PROPERTY_SETTINGS = settings(max_examples=200, deadline=None)


class _Ctx:
    """A stand-in portal context carrying an optional resolved institution."""

    def __init__(self, institution):
        self.institution = institution


class _Inst:
    """A stand-in institution exposing only the ``id`` the resolver reads."""

    def __init__(self, ident):
        self.id = ident


# Inputs: whether a trusted host resolved a tenant, the raw explicit selector
# value, the request host, and the endpoint name.
_has_trusted_host = st.booleans()
_requested = st.sampled_from([None, "", "   ", _OTHER_ID])
_host = st.sampled_from(
    [_REGISTERED_PORTAL_HOST, "random.unknown.example", "apply.tenant.example", "", None]
)
_endpoint = st.sampled_from(list(_ALLOWLISTED_ENDPOINTS) + list(_NON_ALLOWLISTED_ENDPOINTS))


class TestResolvedInstitutionFailClosed:
    """Property A — trusted host wins; explicit selector fails closed (TEN-10).

    **Validates: Requirements 2.3, 2.4, 5.2, 5.3**
    """

    @override_settings(SHARED_PORTAL_HOSTS=[_REGISTERED_PORTAL_HOST])
    @_PROPERTY_SETTINGS
    @given(
        has_trusted_host=_has_trusted_host,
        requested=_requested,
        host=_host,
        endpoint=_endpoint,
    )
    def test_trusted_host_wins_and_explicit_only_on_registered_portal(
        self, has_trusted_host, requested, host, endpoint
    ):
        service = OfferingDirectoryService()
        context = _Ctx(_Inst(_TRUSTED_ID) if has_trusted_host else None)

        result = service.resolved_institution_id(
            context,
            requested,
            request_host=host,
            endpoint=endpoint,
        )

        normalized_request = str(requested or "").strip()
        is_registered_portal = (
            InstitutionContextService.is_registered_shared_portal_host(host)
        )

        # The canonical fail-closed decision table.
        if has_trusted_host:
            expected = _TRUSTED_ID
        elif not normalized_request:
            expected = None
        elif endpoint not in _ALLOWLISTED_ENDPOINTS:
            expected = None
        elif not is_registered_portal:
            expected = None
        else:
            expected = normalized_request

        assert result == expected, (
            has_trusted_host,
            requested,
            host,
            endpoint,
            result,
            expected,
        )

        # The core TEN-10 invariant, asserted directly and independently of the
        # decision table: a trusted host tenant is NEVER overridden by the
        # explicit selector, even when the selector names a different tenant.
        if has_trusted_host:
            assert result == _TRUSTED_ID
            assert result != normalized_request or normalized_request == ""

        # And the explicit selector is honored ONLY under the full triple gate.
        if result == normalized_request and normalized_request:
            assert not has_trusted_host
            assert endpoint in _ALLOWLISTED_ENDPOINTS
            assert is_registered_portal

    def test_unknown_host_never_honors_explicit_selector(self):
        """A configured-but-unregistered / unknown host never becomes a selector
        (baseline TEN-10 fail-closed case): even on an allow-listed endpoint the
        explicit ``?institution=`` is ignored and the portal stays neutral."""
        service = OfferingDirectoryService()
        with override_settings(SHARED_PORTAL_HOSTS=[_REGISTERED_PORTAL_HOST]):
            for endpoint in _ALLOWLISTED_ENDPOINTS:
                assert (
                    service.resolved_institution_id(
                        _Ctx(None),
                        _OTHER_ID,
                        request_host="unknown.example.com",
                        endpoint=endpoint,
                    )
                    is None
                )


class TestBackgroundTaskContextPartition:
    """Property B — background-task context is partitioned by canonical id.

    A background task has no host and no ``?institution=`` query; its only
    partition key is the canonical institution id on the record it processes.
    ``catalog_institution_scope`` is that key, and the scoped-cache mechanism
    keyed by it never serves one institution's cached context to another
    (design §5.1).

    **Validates: Requirements 2.3, 5.3**
    """

    @_PROPERTY_SETTINGS
    @given(id_a=st.uuids(), id_b=st.uuids())
    def test_distinct_institutions_partition_and_never_cross_serve(self, id_a, id_b):
        cache.clear()

        scope_a = catalog_institution_scope(id_a)
        scope_b = catalog_institution_scope(id_b)

        # The partition key is a pure function of the canonical id: same id →
        # same partition; distinct ids → distinct partitions.
        assert scope_a == catalog_institution_scope(id_a)
        if str(id_a) == str(id_b):
            assert scope_a == scope_b
            return
        assert scope_a != scope_b

        # A background computation for institution A is cached under A's
        # partition; a computation for B misses A's entry and computes its own —
        # A's context is never served for B and vice-versa.
        payload_a = {"institution": str(id_a), "config_version": 1}
        payload_b = {"institution": str(id_b), "config_version": 2}
        b_calls = [0]

        stored_a = cached_or_compute(
            "cat", scope_a, lambda: payload_a, ttl=300, sub_key="bg-config", enabled=True
        )
        assert stored_a == payload_a

        def compute_b():
            b_calls[0] += 1
            return payload_b

        served_b = cached_or_compute(
            "cat", scope_b, compute_b, ttl=300, sub_key="bg-config", enabled=True
        )
        assert served_b == payload_b
        assert served_b != payload_a
        assert b_calls[0] == 1, "B must miss A's partition and compute its own"

        # A's partition is still intact (B's write did not poison it).
        served_a_again = cached_or_compute(
            "cat", scope_a, lambda: {"unused": True}, ttl=300, sub_key="bg-config", enabled=True
        )
        assert served_a_again == payload_a
