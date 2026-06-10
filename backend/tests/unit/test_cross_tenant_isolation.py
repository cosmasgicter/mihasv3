"""Cross-tenant isolation exploration tests (P9).

Spec: ``multi-tenant-beanola-admissions`` — Phase 0 exploration baseline
(task 1.6). Pins the out-of-scope == not-found property:

    P9  An out-of-scope record lookup is indistinguishable from a true
        not-found (same status, shape, and message), with no field or error
        leakage.

R4.4 (verbatim): *"WHEN a School_Staff user requests a record outside their
scope, THE system SHALL respond identically to a not-found case (same status,
shape, and message) so that existence cannot be inferred, and SHALL NOT leak
the other school's data in any field or error."*

This is **endpoint-level** (HTTP) exploration, not service-level. For each
detail endpoint we make two requests as the *same* school-A staff user:

    (a) a truly non-existent random UUID   → the true not-found baseline
    (b) school-B's real record id          → an out-of-scope lookup

and assert the two responses are equivalent in status code, envelope shape,
and message. Where the current implementation diverges (a distinct 403, or a
200 that leaks the other school's record) the divergence is recorded as a
durable ``@pytest.mark.xfail(strict=True)`` carrying the minimised
counter-example, triaged to **Phase 3 task 12.2** ("Out-of-scope == not-found
across detail endpoints"). No production code is changed in this task.

**Validates: Requirements R4.4, R14.3**
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import build_document, build_payment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _staff_client(world) -> APIClient:
    """An APIClient authenticated as ``world``'s school-staff admin.

    The staff actor holds an active membership + institution-scoped grant to
    **their own** institution only (built by ``build_tenant_world``), so
    ``AccessScopeService`` scopes them to that one school. Under the dev/test
    settings module the legacy-admin all-access compatibility branch is
    inactive (``_test_settings_active()`` is False), so this is a genuinely
    single-school staff actor.
    """
    staff = world.staff
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(staff.id),
                "email": staff.email,
                "role": staff.role,
                "first_name": staff.first_name,
                "last_name": staff.last_name,
            }
        )
    )
    return client


def _capture(client: APIClient, url: str) -> tuple[int, object]:
    """Return ``(status_code, parsed_body)`` for a GET request.

    Body parsing prefers JSON (the API envelope) and falls back to
    ``response.data`` so a non-JSON response can still be compared.
    """
    response = client.get(url)
    try:
        body = response.json()
    except Exception:  # pragma: no cover - non-JSON (e.g. redirect/HTML) body
        body = getattr(response, "data", None)
    return response.status_code, body


_RANDOM_ID = "00000000-0000-4000-8000-000000000000"


@pytest.mark.django_db
class TestOutOfScopeIsNotFound:
    """P9: out-of-scope lookups must behave identically to not-found.

    **Validates: Requirements R4.4, R14.3**
    """

    # -- Service-layer baseline (kept from the task 1.1 scaffold) -----------

    def test_other_school_application_not_in_scoped_queryset(self, two_tenant_worlds):
        """school-A staff cannot retrieve school-B's application through the
        scoped queryset (it is simply absent → would surface as not-found)."""
        world_a, world_b = two_tenant_worlds
        service = AccessScopeService()
        scoped = service.filter_applications(Application.objects.all(), world_a.staff)
        assert not scoped.filter(id=world_b.application.id).exists()

    # -- Routing / baseline: a truly missing record is an envelope 404 ------

    def test_missing_record_returns_envelope_not_found(self, two_tenant_worlds):
        """Sanity: a random UUID on each detail endpoint resolves to the real
        view and returns the ``{"success": false, ... "code": "NOT_FOUND"}``
        envelope (status 404). This proves the routes resolve and pins the
        not-found baseline the out-of-scope cases are compared against."""
        world_a, _world_b = two_tenant_worlds
        client = _staff_client(world_a)

        for url in (
            f"/api/v1/applications/{_RANDOM_ID}/",
            f"/api/v1/payments/{_RANDOM_ID}/receipt/",
            f"/api/v1/documents/{_RANDOM_ID}/info/",
        ):
            status_code, body = _capture(client, url)
            assert status_code == 404, (url, status_code, body)
            assert isinstance(body, dict), (url, body)
            assert body.get("success") is False, (url, body)
            assert body.get("code") == "NOT_FOUND", (url, body)

    # -- P9 endpoint parity (current divergences → strict xfail) ------------

    def test_out_of_scope_application_detail_matches_true_not_found(self, two_tenant_worlds):
        """Application detail: out-of-scope read must equal true not-found."""
        world_a, world_b = two_tenant_worlds
        client = _staff_client(world_a)

        missing = _capture(client, f"/api/v1/applications/{_RANDOM_ID}/")
        out_of_scope = _capture(client, f"/api/v1/applications/{world_b.application.id}/")

        # No field leakage: the other school's record must not appear.
        if isinstance(out_of_scope[1], dict):
            assert out_of_scope[1].get("success") is not True, out_of_scope
        # Indistinguishability: identical status, shape, and message.
        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}

    def test_out_of_scope_payment_receipt_matches_true_not_found(self, two_tenant_worlds):
        """Payment receipt: out-of-scope read must equal true not-found."""
        world_a, world_b = two_tenant_worlds
        payment = build_payment(application=world_b.application)
        client = _staff_client(world_a)

        missing = _capture(client, f"/api/v1/payments/{_RANDOM_ID}/receipt/")
        out_of_scope = _capture(client, f"/api/v1/payments/{payment.id}/receipt/")

        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}

    def test_out_of_scope_document_info_matches_true_not_found(self, two_tenant_worlds):
        """Document info: out-of-scope read must equal true not-found."""
        world_a, world_b = two_tenant_worlds
        document = build_document(application=world_b.application)
        client = _staff_client(world_a)

        missing = _capture(client, f"/api/v1/documents/{_RANDOM_ID}/info/")
        out_of_scope = _capture(client, f"/api/v1/documents/{document.id}/info/")

        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}


# ---------------------------------------------------------------------------
# Phase 3 task 12.5 — comprehensive endpoint-level isolation
# ---------------------------------------------------------------------------
#
# The exploration class above (P9) pins out-of-scope == not-found on detail
# reads. This section proves the broader R4 invariant end to end: a non-super-
# admin staff member cannot READ, COUNT, EXPORT, DOWNLOAD, VERIFY, RECEIPT, or
# CONFIGURE another school's data on any HTTP surface, and that grant scope
# does not widen / expired grants drop at the boundary when observed THROUGH the
# API (not just the service). Service-layer P6/P7/P8 live in
# ``tests/property/test_access_scope_properties.py``; this file is the HTTP
# mirror.
#
# **Validates: Requirements R4.2, R4.3, R4.4, R4.5, R4.7, R4.8, R4.9, R14.2, R14.3**

from django.utils import timezone as _tz  # noqa: E402
from datetime import timedelta as _timedelta  # noqa: E402

from apps.accounts.permissions import is_super_admin  # noqa: E402
from apps.catalog.services import AccessScopeService as _AccessScopeService  # noqa: E402
from tests.tenant_fixtures import (  # noqa: E402
    build_access_grant,
    build_application,
    build_profile,
)


def _json(client, url):
    """GET and return ``(status_code, parsed_body)``."""
    response = client.get(url)
    try:
        return response.status_code, response.json()
    except Exception:  # pragma: no cover - non-JSON body
        return response.status_code, getattr(response, "data", None)


def _result_ids(body):
    """Extract a flat set of stringified ``id`` values from a list/paginated
    envelope body, tolerant of the ``{data: {results: [...]}}`` and
    ``{data: [...]}`` shapes."""
    if not isinstance(body, dict):
        return set()
    data = body.get("data", body)
    rows = data.get("results", data) if isinstance(data, dict) else data
    ids = set()
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict) and row.get("id") is not None:
                ids.add(str(row["id"]))
    return ids


@pytest.mark.django_db
class TestEndpointListIsolation:
    """List/count surfaces never include another school's rows (R4.2, R4.3).

    **Validates: Requirements R4.2, R4.3, R14.2**
    """

    def test_application_list_excludes_other_school(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        # Make both applications visible to an admin list (submitted, not draft).
        for w in (world_a, world_b):
            Application.objects.filter(id=w.application.id).update(status="submitted")

        status_code, body = _json(_staff_client(world_a), "/api/v1/applications/")
        assert status_code == 200, body
        ids = _result_ids(body)
        assert world_a.application_id in ids
        assert world_b.application_id not in ids

    def test_payment_list_excludes_other_school(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        pay_a = build_payment(application=world_a.application, status="successful")
        pay_b = build_payment(application=world_b.application, status="successful")

        status_code, body = _json(_staff_client(world_a), "/api/v1/payments/")
        assert status_code == 200, body
        ids = _result_ids(body)
        assert str(pay_a.id) in ids
        assert str(pay_b.id) not in ids


@pytest.mark.django_db
class TestEndpointExportIsolation:
    """CSV/roster export never includes another school's rows for staff (R4.3).

    **Validates: Requirements R4.3, R14.2**
    """

    def test_export_excludes_other_school_application_number(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        for w in (world_a, world_b):
            Application.objects.filter(id=w.application.id).update(status="submitted")

        response = _staff_client(world_a).get("/api/v1/applications/export/")
        assert response.status_code == 200
        # Export bodies may be CSV/JSON; decode defensively and assert the other
        # school's application number never appears.
        raw = response.content.decode("utf-8", errors="replace")
        assert world_b.application.application_number not in raw
        # Sanity: own application number is present (export is non-empty + scoped).
        assert world_a.application.application_number in raw


@pytest.mark.django_db
class TestEndpointDocumentIsolation:
    """Document download / signed-url / info on another school's doc == 404 (R4.4).

    **Validates: Requirements R4.4, R14.3**
    """

    def test_download_out_of_scope_matches_not_found(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        doc_b = build_document(application=world_b.application)
        client = _staff_client(world_a)

        missing = _capture(client, f"/api/v1/documents/{_RANDOM_ID}/download/")
        out_of_scope = _capture(client, f"/api/v1/documents/{doc_b.id}/download/")
        assert out_of_scope[0] == missing[0], {"out_of_scope": out_of_scope, "missing": missing}
        # No leakage of the other school's document payload.
        if isinstance(out_of_scope[1], dict):
            assert out_of_scope[1].get("success") is not True

    def test_signed_url_out_of_scope_matches_not_found(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        doc_b = build_document(application=world_b.application)
        client = _staff_client(world_a)

        missing = _capture(client, f"/api/v1/documents/{_RANDOM_ID}/signed-url/")
        out_of_scope = _capture(client, f"/api/v1/documents/{doc_b.id}/signed-url/")
        assert out_of_scope[0] == missing[0], {"out_of_scope": out_of_scope, "missing": missing}


@pytest.mark.django_db
class TestEndpointPaymentVerifyReceiptIsolation:
    """Verify/receipt on another school's payment == not-found (R4.4).

    **Validates: Requirements R4.4, R14.3**
    """

    def test_receipt_out_of_scope_matches_not_found(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        pay_b = build_payment(application=world_b.application, status="successful")
        client = _staff_client(world_a)

        missing = _capture(client, f"/api/v1/payments/{_RANDOM_ID}/receipt/")
        out_of_scope = _capture(client, f"/api/v1/payments/{pay_b.id}/receipt/")
        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}

    def test_verify_out_of_scope_does_not_leak(self, two_tenant_worlds):
        """POST verify on another school's payment must not succeed or leak the
        other school's payment; it should behave as not-found/denied with no
        ``success: true`` body."""
        world_a, world_b = two_tenant_worlds
        pay_b = build_payment(application=world_b.application, status="pending")
        client = _staff_client(world_a)

        response = client.post(f"/api/v1/payments/{pay_b.id}/verify/", data={}, format="json")
        # Never a successful verification of another school's payment.
        assert response.status_code != 200 or response.json().get("success") is not True
        # And the other school's payment is not mutated to a resolved state.
        pay_b.refresh_from_db()
        assert pay_b.status == "pending"


@pytest.mark.django_db
class TestEndpointSettlementIsolation:
    """Settlement summary is tenant-scoped (R4.5, R7.4).

    **Validates: Requirements R4.5, R14.2**
    """

    def test_settlement_excludes_other_school(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        build_payment(application=world_a.application, status="successful")
        build_payment(application=world_b.application, status="successful")

        status_code, body = _json(_staff_client(world_a), "/api/v1/payments/settlements/")
        assert status_code == 200, body
        # The other school's institution id/name must not appear anywhere in the
        # scoped settlement summary.
        raw = str(body)
        assert world_b.institution_id not in raw
        assert world_b.institution.name not in raw


@pytest.mark.django_db
class TestEndpointGrantScopeFidelityHttp:
    """Grant scope does not widen / expired grants drop — observed via the API.

    These exercise the **admin** surfaces (list + detail), which gate on
    ``IsAdmin`` and then scope through ``AccessScopeService``. The actor is an
    admin holding only an application-scoped (or expired institution) grant; the
    test-settings legacy-admin all-access compat branch is disabled via
    ``production_scope`` so the production membership/grant-driven model is what
    is asserted (R4.9). The exhaustive no-widening proof across statuses lives in
    the service-layer P8 property suite; this is the HTTP mirror.

    **Validates: Requirements R4.7, R4.8, R4.9, R14.2**
    """

    @pytest.fixture()
    def production_scope(self, monkeypatch):
        monkeypatch.setattr(
            _AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
        )

    def _admin_client_no_compat(self, profile):
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

    def test_expired_institution_grant_yields_empty_list(self, two_tenant_worlds, production_scope):
        """An admin whose only scope is an EXPIRED institution grant sees no
        applications through the list endpoint (R4.8)."""
        world_a, _world_b = two_tenant_worlds
        Application.objects.filter(id=world_a.application.id).update(status="submitted")
        admin = build_profile(role="admin")
        build_access_grant(
            user=admin,
            scope_type="institution",
            institution=world_a.institution,
            expires_at=_tz.now() - _timedelta(days=1),
        )

        status_code, body = _json(self._admin_client_no_compat(admin), "/api/v1/applications/")
        assert status_code == 200, body
        # Expired grant confers nothing → the in-scope app is absent.
        assert world_a.application_id not in _result_ids(body)

    def test_application_grant_does_not_widen_to_sibling(self, two_tenant_worlds, production_scope):
        """An application-scoped grant to one application does not expose a
        sibling application in the same school via the list endpoint (R4.7).

        The granted application itself IS visible (the grant confers exactly
        that one application's scope); the sibling never is.
        """
        world_a, _world_b = two_tenant_worlds
        # Build a sibling application in school A that the grant does NOT cover.
        sibling = build_application(
            student=build_profile(role="student"),
            institution=world_a.institution,
            canonical_program=world_a.canonical_program,
            offering=world_a.offering,
            intake=world_a.intake,
            status="submitted",
        )
        Application.objects.filter(id=world_a.application.id).update(status="submitted")

        admin = build_profile(role="admin")
        build_access_grant(
            user=admin,
            scope_type="application",
            application_id=world_a.application.id,
        )

        status_code, body = _json(self._admin_client_no_compat(admin), "/api/v1/applications/")
        assert status_code == 200, body
        ids = _result_ids(body)
        assert world_a.application_id in ids  # the granted application
        assert str(sibling.id) not in ids  # but never the sibling
