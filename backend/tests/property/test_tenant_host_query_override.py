"""Fail-closed tenant host resolution + query-override property tests (Task 2.3).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild`` — Task 2.3
("Make tenant host resolution fail closed"). Findings **TEN-09, TEN-10, STU-24**;
Requirements **R2.2–R2.4, R5.2–R5.3**.

One property is pinned against the *real*
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

A second, **Property B**, checked that a computation cached under
``catalog_cache.catalog_institution_scope`` in the scoped cache was never served
for another institution. Both modules were removed with the catalog cache by
platform-simplification task 16.2 (decision D7 option A), so there is no cached
context left to partition, and Property B went with them.

Property A is a pure function of its inputs (no DB) and runs ≥100 Hypothesis
examples.

Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_tenant_host_query_override.py -q

**Validates: Requirements 2.3, 2.4, 5.2, 5.3**
"""

from __future__ import annotations

from django.test import override_settings
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.catalog.services import InstitutionContextService, OfferingDirectoryService

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
