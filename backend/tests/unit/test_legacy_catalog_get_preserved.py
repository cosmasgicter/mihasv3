"""Public/student GET behaviour preserved on the six legacy catalog views.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 5.6.

Tasks 5.1/5.2/5.3 retrofitted **only the write methods** (POST/PATCH/DELETE) of
the six legacy catalog views in ``backend/apps/catalog/views.py`` to capability
gating:

* ``InstitutionListCreateView`` / ``InstitutionDetailView``
* ``ProgramListCreateView``   / ``ProgramDetailView``
* ``IntakeListCreateView``    / ``IntakeDetailView``

Requirement 5.5 mandates that the **GET behaviour is unchanged** after that
retrofit. These unit tests pin the pre-retrofit GET contract for an
unauthenticated/public caller and for a student caller, exactly as before:

* The three **list** endpoints stay public (``AllowAny`` on GET): an
  unauthenticated or student caller receives ``200`` with the
  ``{"success": true, "data": ...}`` envelope, the listing contains **only
  active** records (inactive/closed rows are filtered out), and the
  ``Cache-Control: public, max-age=300`` header is preserved.
* The three **detail** endpoints stay admin-only on GET (``IsAdmin``): an
  unauthenticated or student caller is denied (401/403) and no tenant data
  leaks, while an admin/super-admin GET still returns the record.

The retrofit changed ``get_permissions``/``get_authenticators`` for the write
methods only; these tests are the regression guard that the read paths were
left intact.

**Validates: Requirements 5.5**
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
)

# ---------------------------------------------------------------------------
# Endpoint paths
# ---------------------------------------------------------------------------

PROGRAMS_URL = "/api/v1/catalog/programs/"
INTAKES_URL = "/api/v1/catalog/intakes/"
INSTITUTIONS_URL = "/api/v1/catalog/institutions/"

PUBLIC_CACHE_HEADER = "public, max-age=300"
# Authenticated API responses are stamped no-store by SecurityHeadersMiddleware
# (a pre-existing, retrofit-independent control); a logged-in student therefore
# never receives the shared public-cache header even though GET stays open.
AUTHENTICATED_CACHE_HEADER = "no-store, no-cache, must-revalidate, private"


def _expected_cache_header(role) -> str:
    """The Cache-Control the view contract yields for ``role``.

    Public/unauthenticated readers keep the view's ``public, max-age=300``
    header; authenticated readers get the security middleware's no-store stamp.
    This split is the existing behaviour and is unchanged by the write retrofit.
    """
    return PUBLIC_CACHE_HEADER if role is None else AUTHENTICATED_CACHE_HEADER


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


def _public_client() -> APIClient:
    """An unauthenticated APIClient (a public visitor)."""
    return APIClient()


def _client_for_role(role: str) -> APIClient:
    """An APIClient authenticated as a JWTUser with ``role``."""
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": "00000000-0000-0000-0000-000000000001",
                "email": f"{role}@example.com",
                "role": role,
                "first_name": role.title(),
                "last_name": "User",
            }
        )
    )
    return client


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


def _ids(data) -> set[str]:
    """Extract the set of stringified ids from a list-or-paginated ``data``.

    The programs list is paginated (``data`` is ``{page, pageSize, totalCount,
    results}``); the intakes/institutions lists return a plain array in
    ``data``. This normalises both to a set of ids.
    """
    if isinstance(data, dict) and "results" in data:
        rows = data["results"]
    else:
        rows = data
    return {str(row["id"]) for row in rows}


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------


@dataclass
class CatalogData:
    active_institution: object
    inactive_institution: object
    active_program: object
    inactive_program: object
    open_intake: object
    inactive_intake: object
    closed_intake: object


@pytest.fixture()
def catalog(db) -> CatalogData:
    """Seed active vs inactive/closed catalog rows for the GET assertions."""
    today = timezone.now().date()

    active_institution = build_institution(is_active=True)
    inactive_institution = build_institution(is_active=False)

    canonical = build_canonical_program()
    active_program = build_offering(
        institution=active_institution,
        canonical_program=canonical,
        is_active=True,
        offering_status="active",
    )
    inactive_program = build_offering(
        institution=active_institution,
        canonical_program=canonical,
        is_active=False,
        offering_status="inactive",
    )

    # Open intake: active + deadline in the future (accepting applications).
    open_intake = build_intake(
        is_active=True,
        application_deadline=today + timedelta(days=60),
    )
    # Inactive intake: is_active=False is filtered out of the public listing.
    inactive_intake = build_intake(
        is_active=False,
        application_deadline=today + timedelta(days=60),
    )
    # Closed intake: active but the application deadline has already passed.
    closed_intake = build_intake(
        is_active=True,
        application_deadline=today - timedelta(days=5),
    )

    return CatalogData(
        active_institution=active_institution,
        inactive_institution=inactive_institution,
        active_program=active_program,
        inactive_program=inactive_program,
        open_intake=open_intake,
        inactive_intake=inactive_intake,
        closed_intake=closed_intake,
    )


# ---------------------------------------------------------------------------
# List endpoints — public + student GET unchanged (active-only, public cache)
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestLegacyCatalogListGetPreserved:
    """The three legacy list endpoints stay public read with active-only data.

    **Validates: Requirements 5.5**
    """

    @pytest.mark.parametrize("role", [None, "student"])
    def test_programs_list_get_active_only_and_public_cache(self, catalog, role):
        client = _public_client() if role is None else _client_for_role(role)
        resp = client.get(PROGRAMS_URL)

        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["success"] is True
        ids = _ids(body["data"])
        assert str(catalog.active_program.id) in ids
        # Inactive offering is filtered from the public listing (unchanged).
        assert str(catalog.inactive_program.id) not in ids
        # Public-cache behaviour preserved for non-admin callers.
        assert resp["Cache-Control"] == _expected_cache_header(role)

    @pytest.mark.parametrize("role", [None, "student"])
    def test_intakes_list_get_open_only_and_public_cache(self, catalog, role):
        client = _public_client() if role is None else _client_for_role(role)
        resp = client.get(INTAKES_URL)

        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["success"] is True
        ids = _ids(body["data"])
        assert str(catalog.open_intake.id) in ids
        # Inactive and closed (past-deadline) intakes are hidden from the public.
        assert str(catalog.inactive_intake.id) not in ids
        assert str(catalog.closed_intake.id) not in ids
        assert resp["Cache-Control"] == _expected_cache_header(role)

    @pytest.mark.parametrize("role", [None, "student"])
    def test_institutions_list_get_active_only_and_public_cache(self, catalog, role):
        client = _public_client() if role is None else _client_for_role(role)
        resp = client.get(INSTITUTIONS_URL)

        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["success"] is True
        ids = _ids(body["data"])
        assert str(catalog.active_institution.id) in ids
        # Inactive institution is filtered from the public listing (unchanged).
        assert str(catalog.inactive_institution.id) not in ids
        assert resp["Cache-Control"] == _expected_cache_header(role)


# ---------------------------------------------------------------------------
# Detail endpoints — GET stays admin-only; public/student denied, admin sees
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestLegacyCatalogDetailGetPreserved:
    """The three legacy detail endpoints keep their admin-only GET contract.

    Public/student GET is denied (401/403) with no tenant data leakage, exactly
    as before the write retrofit; an admin/super-admin GET still returns the
    record.

    **Validates: Requirements 5.5**
    """

    def _program_url(self, program) -> str:
        return f"{PROGRAMS_URL}{program.id}/"

    def _intake_url(self, intake) -> str:
        return f"{INTAKES_URL}{intake.id}/"

    def _institution_url(self, institution) -> str:
        return f"{INSTITUTIONS_URL}{institution.id}/"

    @pytest.mark.parametrize("role", [None, "student"])
    def test_program_detail_get_denied_for_public_and_student(self, catalog, role):
        client = _public_client() if role is None else _client_for_role(role)
        resp = client.get(self._program_url(catalog.active_program))

        assert resp.status_code in (401, 403), resp.content
        # No tenant data leaks in a denial body.
        blob = resp.content.decode("utf-8", "replace")
        assert catalog.active_program.code not in blob
        assert catalog.active_program.name not in blob

    @pytest.mark.parametrize("role", [None, "student"])
    def test_intake_detail_get_denied_for_public_and_student(self, catalog, role):
        client = _public_client() if role is None else _client_for_role(role)
        resp = client.get(self._intake_url(catalog.open_intake))

        assert resp.status_code in (401, 403), resp.content
        blob = resp.content.decode("utf-8", "replace")
        assert catalog.open_intake.name not in blob

    @pytest.mark.parametrize("role", [None, "student"])
    def test_institution_detail_get_denied_for_public_and_student(self, catalog, role):
        client = _public_client() if role is None else _client_for_role(role)
        resp = client.get(self._institution_url(catalog.active_institution))

        assert resp.status_code in (401, 403), resp.content
        blob = resp.content.decode("utf-8", "replace")
        assert catalog.active_institution.code not in blob
        assert catalog.active_institution.name not in blob

    def test_program_detail_get_visible_to_admin(self, catalog):
        client = _client_for_role("super_admin")
        resp = client.get(self._program_url(catalog.active_program))

        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["success"] is True
        assert str(body["data"]["id"]) == str(catalog.active_program.id)

    def test_intake_detail_get_visible_to_admin(self, catalog):
        client = _client_for_role("super_admin")
        resp = client.get(self._intake_url(catalog.open_intake))

        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["success"] is True
        assert str(body["data"]["id"]) == str(catalog.open_intake.id)

    def test_institution_detail_get_visible_to_admin(self, catalog):
        client = _client_for_role("super_admin")
        resp = client.get(self._institution_url(catalog.active_institution))

        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["success"] is True
        assert str(body["data"]["id"]) == str(catalog.active_institution.id)
