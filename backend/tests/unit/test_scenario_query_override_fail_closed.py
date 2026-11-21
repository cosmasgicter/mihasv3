"""Acceptance scenario — a query selector never overrides a trusted host (Task 2.3).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild`` — Task 2.3
("Make tenant host resolution fail closed"). Findings **TEN-10, TEN-09,
STU-24**; Requirements **R2.2–R2.4, R5.2–R5.3**.

This is the end-to-end acceptance scenario behind the task's Required_Evidence
("tenant A/B host, query override, cache, and unknown-host tests"), exercised
against the *real* ``GET /api/v1/catalog/canonical-programs/`` and
``GET /api/v1/catalog/programs/`` endpoints — no mocks, no production code
changed.

Two tenants are built, each offering a **distinct** canonical program so the
listing content unambiguously identifies which tenant scope resolved:

* Tenant **A** owns an **active** white-label domain (``host_a``) and offers
  ``canonical_a``.
* Tenant **B** has no domain and offers ``canonical_b``.
* ``portal.beanola.example`` is a registered neutral shared-portal host (pinned
  via ``override_settings(SHARED_PORTAL_HOSTS=...)``) with no tenant domain.

Assertions:

1. **Query override rejected (TEN-10).** On tenant A's trusted host,
   ``?institution=<B>`` lists only ``canonical_a`` — the explicit selector never
   overrides the resolved host tenant, and no B identifier leaks.
2. **Tenant host portal.** On A's host with no selector, only ``canonical_a``.
3. **Explicit selection on the shared portal only.** On the registered
   shared-portal host, ``?institution=<A>`` lists only ``canonical_a`` and
   ``?institution=<B>`` lists only ``canonical_b`` (the sole context where an
   explicit selector is honored).
4. **Neutral shared portal.** On the shared-portal host with no selector, both
   canonical programs list.
5. **Unknown host fails closed.** On an unregistered/unknown host,
   ``?institution=<B>`` is ignored and the neutral shared portal lists both — the
   selector never turns an unknown host into a tenant selector.
6. **No selector outside the allowlist.** On the shared-portal host,
   ``?institution=<A>`` on the programmes endpoint, which is not one of the two
   selector endpoints, is ignored: the listing still spans both tenants.

The "cache" evidence first checked the catalog cache's scope signature in three
of these cases. The catalog cache was removed by platform-simplification task
16.2 (decision D7 option A), so there is no cache key left to partition. Cases 1
and 3 already check the first two on the response itself, and case 6 checks the
third on the response in place of the cache key.

Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/unit/test_scenario_query_override_fail_closed.py -q

**Validates: Requirements 2.2, 2.3, 2.4, 5.2, 5.3**
"""

from __future__ import annotations

import json
import uuid

import pytest
from rest_framework.test import APIClient

from apps.catalog.models import InstitutionDomain, Program
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_institution_domain,
    build_offering,
)

pytestmark = [pytest.mark.tenant, pytest.mark.django_db]

# A registered neutral shared-portal host with no tenant domain. Pinned as the
# ONLY shared-portal host so tenant/unknown hosts are deterministically not
# registered.
PORTAL_HOST = "portal.beanola.example"
UNKNOWN_HOST = "random.unknown.example"

CANONICAL_PROGRAMS_URL = "/api/v1/catalog/canonical-programs/"
PROGRAMS_URL = "/api/v1/catalog/programs/"


def _blob(response) -> str:
    """One searchable string from the parsed body + raw response text."""
    try:
        body = response.json()
    except Exception:  # pragma: no cover - non-JSON defensive path
        body = getattr(response, "data", None)
    try:
        raw = response.content.decode("utf-8", "replace")
    except Exception:  # pragma: no cover - defensive only
        raw = ""
    return json.dumps(body, default=str) + "||" + raw


def _list_rows(body):
    """Extract the row list from a (possibly paginated) success envelope."""
    if not isinstance(body, dict):
        return body if isinstance(body, list) else []
    data = body.get("data", body)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("results", [])
    return []


def _canonical_ids(response) -> set[str]:
    """The set of top-level canonical-program ids in a listing response."""
    return {
        str(row["id"])
        for row in _list_rows(response.json())
        if isinstance(row, dict) and row.get("id")
    }


def _build_two_tenants():
    """Tenant A (active domain, offers canonical_a) + Tenant B (offers canonical_b)."""
    sfx = uuid.uuid4().hex[:8]
    host_a = f"apply-a-{sfx}.example"

    inst_a = build_institution(suffix=f"a-{sfx}", name="Tenant A", brand_name="Tenant A")
    inst_b = build_institution(suffix=f"b-{sfx}", name="Tenant B", brand_name="Tenant B")

    canonical_a = build_canonical_program(suffix=f"a-{sfx}")
    canonical_b = build_canonical_program(suffix=f"b-{sfx}")

    build_offering(institution=inst_a, canonical_program=canonical_a, suffix=f"a-{sfx}")
    build_offering(institution=inst_b, canonical_program=canonical_b, suffix=f"b-{sfx}")

    build_institution_domain(
        institution=inst_a,
        hostname=host_a,
        is_active=True,
        status=InstitutionDomain.STATUS_ACTIVE,
    )
    return {
        "host_a": host_a,
        "inst_a": inst_a,
        "inst_b": inst_b,
        "canonical_a": canonical_a,
        "canonical_b": canonical_b,
    }


class TestQueryOverrideFailsClosed:
    """Task 2.3 acceptance scenario — trusted host wins, selector fails closed.

    **Validates: Requirements 2.2, 2.3, 2.4, 5.2, 5.3**
    """

    @pytest.fixture(autouse=True)
    def _register_shared_portal_host(self, settings):
        """Pin the registered neutral shared-portal allowlist for every scenario
        so tenant/unknown hosts are deterministically NOT shared-portal hosts."""
        settings.SHARED_PORTAL_HOSTS = [PORTAL_HOST]

    def test_trusted_host_ignores_conflicting_institution_query(self):
        """TEN-10: on tenant A's trusted host, ``?institution=<B>`` never
        overrides — only A's canonical program lists and no B id leaks."""
        world = _build_two_tenants()
        client = APIClient()

        resp = client.get(
            CANONICAL_PROGRAMS_URL,
            {"institution": str(world["inst_b"].id)},
            HTTP_X_FORWARDED_HOST=world["host_a"],
        )

        assert resp.status_code == 200, resp.content
        ids = _canonical_ids(resp)
        assert str(world["canonical_a"].id) in ids
        assert str(world["canonical_b"].id) not in ids
        blob = _blob(resp)
        assert str(world["inst_b"].id) not in blob
        assert str(world["canonical_b"].id) not in blob

    def test_trusted_host_without_selector_lists_only_its_own(self):
        """On A's host with no selector, only A's canonical program lists."""
        world = _build_two_tenants()
        resp = APIClient().get(
            CANONICAL_PROGRAMS_URL, HTTP_X_FORWARDED_HOST=world["host_a"]
        )
        assert resp.status_code == 200, resp.content
        ids = _canonical_ids(resp)
        assert str(world["canonical_a"].id) in ids
        assert str(world["canonical_b"].id) not in ids

    def test_registered_shared_portal_honors_explicit_selection(self):
        """The registered shared-portal host is the ONLY context that honors an
        explicit ``?institution=`` selector (R2.4)."""
        world = _build_two_tenants()
        client = APIClient()

        resp_a = client.get(
            CANONICAL_PROGRAMS_URL,
            {"institution": str(world["inst_a"].id)},
            HTTP_X_FORWARDED_HOST=PORTAL_HOST,
        )
        assert resp_a.status_code == 200, resp_a.content
        ids_a = _canonical_ids(resp_a)
        assert ids_a == {str(world["canonical_a"].id)}

        resp_b = client.get(
            CANONICAL_PROGRAMS_URL,
            {"institution": str(world["inst_b"].id)},
            HTTP_X_FORWARDED_HOST=PORTAL_HOST,
        )
        assert resp_b.status_code == 200, resp_b.content
        ids_b = _canonical_ids(resp_b)
        assert ids_b == {str(world["canonical_b"].id)}

    def test_neutral_shared_portal_without_selector_lists_all(self):
        """The shared-portal host with no selector spans both tenants (R8.6)."""
        world = _build_two_tenants()
        resp = APIClient().get(CANONICAL_PROGRAMS_URL, HTTP_X_FORWARDED_HOST=PORTAL_HOST)
        assert resp.status_code == 200, resp.content
        ids = _canonical_ids(resp)
        assert str(world["canonical_a"].id) in ids
        assert str(world["canonical_b"].id) in ids

    def test_unknown_host_ignores_selector_and_stays_neutral(self):
        """TEN-10 baseline: an unregistered/unknown host never becomes a tenant
        selector — ``?institution=<B>`` is ignored and the neutral portal lists
        both (if the selector were honored, only B would appear)."""
        world = _build_two_tenants()
        resp = APIClient().get(
            CANONICAL_PROGRAMS_URL,
            {"institution": str(world["inst_b"].id)},
            HTTP_X_FORWARDED_HOST=UNKNOWN_HOST,
        )
        assert resp.status_code == 200, resp.content
        ids = _canonical_ids(resp)
        # Both present ⇒ the selector was ignored and it fell back to neutral.
        assert str(world["canonical_a"].id) in ids
        assert str(world["canonical_b"].id) in ids

    def test_selector_on_a_non_selector_endpoint_never_narrows_the_listing(self):
        """A ``?institution=`` on an endpoint outside the selector allowlist is
        ignored, even on the shared-portal host: the programmes listing still
        spans both tenants (R2.4, R5.3). This case was checked on the catalog
        cache's scope signature until task 16.2 removed that cache."""
        world = _build_two_tenants()
        resp = APIClient().get(
            PROGRAMS_URL,
            {"institution": str(world["inst_a"].id), "pageSize": 100},
            HTTP_X_FORWARDED_HOST=PORTAL_HOST,
        )
        assert resp.status_code == 200, resp.content
        listed = {
            str(row["id"])
            for row in _list_rows(resp.json())
            if isinstance(row, dict) and row.get("id")
        }
        offerings_a = {
            str(pk)
            for pk in Program.objects.filter(institution=world["inst_a"]).values_list("id", flat=True)
        }
        offerings_b = {
            str(pk)
            for pk in Program.objects.filter(institution=world["inst_b"]).values_list("id", flat=True)
        }
        assert offerings_a and offerings_a <= listed
        assert offerings_b and offerings_b <= listed
