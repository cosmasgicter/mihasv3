"""Scoped-access test matrix for the Beanola tenant security audit.

Spec: ``.kiro/specs/beanola-production-readiness/`` — Task 11.2, Component 5.

This is the **endpoint-level (HTTP)** scoped-access matrix that proves, for
every staff/admin view that returns or mutates tenant data, the five R5 access
outcomes:

- **R5.3** in-scope staff read → ``API_Envelope`` (``{"success": true, ...}``).
- **R5.4** out-of-scope staff read → ``Not_Found_Envelope`` (byte-identical to a
  genuine miss: HTTP 404, ``{"success": false, ... "code": "NOT_FOUND"}``) so
  existence cannot be inferred.
- **R5.5** an **expired** ``Access_Grant`` → ``Not_Found_Envelope`` for the
  previously granted resource.
- **R5.6** an **offering**-scoped and an **application**-scoped grant permit only
  that target (and never a sibling in the same school).
- **R5.7** a ``Super_Admin`` reads any tenant resource.

It covers the document auth seam
``backend/apps/documents/document_storage_views.py:_get_authorized_document``
and the staff/admin views surfaced as gaps GAP-1..GAP-8 by the Task 11.1
endpoint inventory (``docs/audits/scope-endpoint-inventory.md``), each of which
received the additive ``AccessScopeService`` narrowing fix tied to R5.2/R5.9 in
this task.

**Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7**
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application, ApplicationCondition
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_access_grant,
    build_application,
    build_document,
    build_profile,
)

_RANDOM_ID = "00000000-0000-4000-8000-000000000000"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
    """An APIClient authenticated as ``profile`` (a Profile row)."""
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


def _staff_client(world) -> APIClient:
    """Client for ``world``'s single-school staff admin (membership + grant)."""
    return _client_for(world.staff)


def _capture(response):
    """Return ``(status_code, parsed_body)`` for a DRF response."""
    try:
        body = response.json()
    except Exception:  # pragma: no cover - non-JSON body
        body = getattr(response, "data", None)
    return response.status_code, body


def _assert_scope_permitted(label, status_code, body):
    """Assert a response was **not** masked as a scope not-found (R5.3/R5.7).

    An in-scope / super-admin read is *permitted* when the scope gate lets the
    request reach the view body. Most endpoints then return 200 + the
    API_Envelope, but a few legitimately return a downstream business response
    (e.g. ``waitlist-position`` returns 400 ``NOT_WAITLISTED`` for a draft
    application). The R5 invariant is that the scope layer did **not** mask the
    resource as a 404 ``NOT_FOUND`` — that is the only outcome forbidden for an
    in-scope caller.
    """
    is_not_found_mask = status_code == 404 and isinstance(body, dict) and body.get("code") == "NOT_FOUND"
    assert not is_not_found_mask, (label, status_code, body)
    if status_code == 200:
        assert isinstance(body, dict) and body.get("success") is True, (label, body)


@pytest.fixture()
def production_scope(monkeypatch):
    """Disable the dev/test legacy-admin all-access compatibility branch.

    Under the test settings module ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy compat). The R5 matrix must
    assert the **production** membership/grant-driven model, so we force
    ``_test_settings_active()`` False — exactly as the existing
    ``test_cross_tenant_isolation`` HTTP suite does.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# The staff/admin GET surfaces that take an ``application_id`` and must mask an
# out-of-scope read as a byte-identical not-found. ``{aid}`` is substituted.
_APP_GET_ENDPOINTS = {
    "admin-summary (GAP-5)": "/api/v1/applications/{aid}/admin-summary/",
    "grades (GAP-4)": "/api/v1/applications/{aid}/grades/",
    "summary (GAP-4)": "/api/v1/applications/{aid}/summary/",
    "interviews-crud (GAP-6)": "/api/v1/applications/{aid}/interviews/",
    "waitlist-position (GAP-7)": "/api/v1/applications/{aid}/waitlist-position/",
    "conditions (GAP-7)": "/api/v1/applications/{aid}/conditions/",
}


# ---------------------------------------------------------------------------
# R5.3 — in-scope staff read returns the API_Envelope
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInScopeReturnsApiEnvelope:
    """R5.3: a School_Staff in-scope read returns ``{"success": true, ...}``.

    **Validates: Requirements 5.3**
    """

    def test_in_scope_app_get_endpoints_return_api_envelope(self, two_tenant_worlds):
        world_a, _world_b = two_tenant_worlds
        client = _staff_client(world_a)
        aid = world_a.application_id

        for label, template in _APP_GET_ENDPOINTS.items():
            status_code, body = _capture(client.get(template.format(aid=aid)))
            _assert_scope_permitted(label, status_code, body)

    def test_in_scope_document_info_returns_api_envelope(self, two_tenant_worlds):
        world_a, _world_b = two_tenant_worlds
        doc_a = build_document(application=world_a.application)
        status_code, body = _capture(
            _staff_client(world_a).get(f"/api/v1/documents/{doc_a.id}/info/")
        )
        assert status_code == 200, (status_code, body)
        assert body.get("success") is True, body


# ---------------------------------------------------------------------------
# R5.4 — out-of-scope staff read returns the Not_Found_Envelope
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOutOfScopeReturnsNotFound:
    """R5.4: an out-of-scope read masks byte-identically as not-found.

    Each endpoint is hit twice as the *same* school-A staff user: once with a
    random missing UUID (the true not-found baseline) and once with school-B's
    real id (the out-of-scope read). The two responses must be equivalent in
    status, envelope shape, and message; the other school's data must never
    appear.

    **Validates: Requirements 5.4**
    """

    def test_app_get_endpoints_out_of_scope_match_not_found(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _staff_client(world_a)
        other_aid = world_b.application_id

        for label, template in _APP_GET_ENDPOINTS.items():
            missing = _capture(client.get(template.format(aid=_RANDOM_ID)))
            out_of_scope = _capture(client.get(template.format(aid=other_aid)))

            assert missing[0] == 404, (label, missing)
            assert out_of_scope[0] == 404, (label, out_of_scope)
            # No field leakage: never a success body for the other school.
            if isinstance(out_of_scope[1], dict):
                assert out_of_scope[1].get("success") is not True, (label, out_of_scope)
                assert out_of_scope[1].get("code") == "NOT_FOUND", (label, out_of_scope)
            # Indistinguishability: identical status, shape, and message.
            assert out_of_scope == missing, {
                "label": label,
                "out_of_scope": out_of_scope,
                "missing": missing,
            }

    def test_admin_summary_does_not_leak_other_school_name(self, two_tenant_worlds):
        """GAP-5: the AI admin brief of another school's application must not be
        returned to a scoped admin."""
        world_a, world_b = two_tenant_worlds
        status_code, body = _capture(
            _staff_client(world_a).get(
                f"/api/v1/applications/{world_b.application_id}/admin-summary/"
            )
        )
        assert status_code == 404, (status_code, body)
        assert world_b.institution.name not in str(body)
        assert world_b.application.full_name not in str(body)

    def test_bulk_status_out_of_scope_reported_not_found(self, two_tenant_worlds):
        """GAP-1: a scoped admin cannot transition another school's application;
        the out-of-scope id is reported as NOT_FOUND and never mutated."""
        import hashlib

        world_a, world_b = two_tenant_worlds
        Application.objects.filter(id=world_b.application.id).update(status="submitted")

        app_ids = [str(world_b.application_id)]
        new_status = "under_review"
        token = hashlib.sha256(
            ("".join(sorted(app_ids)) + new_status).encode("utf-8")
        ).hexdigest()

        response = _staff_client(world_a).post(
            "/api/v1/applications/bulk-status/",
            data={
                "application_ids": app_ids,
                "new_status": new_status,
                "confirmation_token": token,
            },
            format="json",
        )
        status_code, body = _capture(response)
        # All-or-nothing batch: the out-of-scope id makes the batch fail with
        # the id reported NOT_FOUND, and the other school's app is untouched.
        assert status_code == 400, (status_code, body)
        failures = body.get("failures", []) if isinstance(body, dict) else []
        assert any(f.get("application_id") == str(world_b.application_id) and f.get("code") == "NOT_FOUND" for f in failures), body
        world_b.application.refresh_from_db()
        assert world_b.application.status == "submitted"

    def test_condition_verify_out_of_scope_matches_not_found(self, two_tenant_worlds):
        """GAP-8: verifying a condition on another school's application masks as
        not-found and never mutates it."""
        world_a, world_b = two_tenant_worlds
        condition = ApplicationCondition.objects.create(
            application_id=world_b.application.id,
            description="Submit final transcript",
            status="pending",
            deadline=timezone.now().date() + timedelta(days=30),
            created_at=timezone.now(),
        )
        client = _staff_client(world_a)

        missing = _capture(
            client.post(
                f"/api/v1/applications/{_RANDOM_ID}/conditions/{condition.id}/verify/",
                data={"status": "met"},
                format="json",
            )
        )
        out_of_scope = _capture(
            client.post(
                f"/api/v1/applications/{world_b.application_id}/conditions/{condition.id}/verify/",
                data={"status": "met"},
                format="json",
            )
        )
        assert out_of_scope[0] == 404, out_of_scope
        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}
        condition.refresh_from_db()
        assert condition.status == "pending"

    def test_amendment_review_out_of_scope_matches_not_found(self, two_tenant_worlds):
        """GAP-8: reviewing an amendment on another school's application masks as
        not-found before any mutation."""
        world_a, world_b = two_tenant_worlds
        client = _staff_client(world_a)

        missing = _capture(
            client.post(
                f"/api/v1/applications/{_RANDOM_ID}/amendments/{_RANDOM_ID}/review/",
                data={"status": "approved"},
                format="json",
            )
        )
        out_of_scope = _capture(
            client.post(
                f"/api/v1/applications/{world_b.application_id}/amendments/{_RANDOM_ID}/review/",
                data={"status": "approved"},
                format="json",
            )
        )
        assert out_of_scope[0] == 404, out_of_scope
        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}

    def test_interview_create_out_of_scope_matches_not_found(self, two_tenant_worlds):
        """GAP-6: scheduling an interview on another school's application masks as
        not-found before any write."""
        world_a, world_b = two_tenant_worlds
        client = _staff_client(world_a)
        scheduled_at = (timezone.now() + timedelta(days=7)).isoformat()

        missing = _capture(
            client.post(
                f"/api/v1/applications/{_RANDOM_ID}/interviews/",
                data={"scheduled_at": scheduled_at, "mode": "in_person"},
                format="json",
            )
        )
        out_of_scope = _capture(
            client.post(
                f"/api/v1/applications/{world_b.application_id}/interviews/",
                data={"scheduled_at": scheduled_at, "mode": "in_person"},
                format="json",
            )
        )
        assert out_of_scope[0] == 404, out_of_scope
        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}

    def test_document_seam_out_of_scope_matches_not_found(self, two_tenant_worlds):
        """The ``_get_authorized_document`` seam masks an out-of-scope document
        across info / signed-url / download as a byte-identical not-found."""
        world_a, world_b = two_tenant_worlds
        doc_b = build_document(application=world_b.application)
        client = _staff_client(world_a)

        for suffix in ("info", "signed-url", "download", "extract"):
            method = client.get if suffix != "extract" else client.post
            missing = _capture(method(f"/api/v1/documents/{_RANDOM_ID}/{suffix}/"))
            out_of_scope = _capture(method(f"/api/v1/documents/{doc_b.id}/{suffix}/"))
            assert out_of_scope[0] == missing[0], {
                "suffix": suffix,
                "out_of_scope": out_of_scope,
                "missing": missing,
            }
            if isinstance(out_of_scope[1], dict):
                assert out_of_scope[1].get("success") is not True, (suffix, out_of_scope)

    def test_history_admin_override_excludes_other_school(self, two_tenant_worlds, production_scope):
        """GAP-3: a scoped admin passing ?user_id= for another school's applicant
        sees no status history for that applicant's application."""
        world_a, world_b = two_tenant_worlds
        # Generate a status-history row on school B by transitioning its app.
        from apps.applications.models import ApplicationStatusHistory

        ApplicationStatusHistory.objects.create(
            application_id=world_b.application.id,
            old_status="draft",
            new_status="submitted",
            notes="",
            created_at=timezone.now(),
        )
        status_code, body = _capture(
            _staff_client(world_a).get(
                f"/api/v1/applications/history/?user_id={world_b.student.id}"
            )
        )
        assert status_code == 200, body
        results = body.get("data", {}).get("results", []) if isinstance(body, dict) else []
        assert results == [], body


# ---------------------------------------------------------------------------
# R5.5 — expired Access_Grant returns the Not_Found_Envelope
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExpiredGrantReturnsNotFound:
    """R5.5: an expired grant denies access to the previously granted resource.

    The actor is an admin whose only scope is an application-scoped grant that
    has already expired. With the production scope model active, the expired
    grant confers nothing, so the previously granted application reads as a
    byte-identical not-found.

    **Validates: Requirements 5.5**
    """

    def test_expired_application_grant_masks_as_not_found(self, two_tenant_worlds, production_scope):
        world_a, _world_b = two_tenant_worlds
        admin = build_profile(role="admin")
        build_access_grant(
            user=admin,
            scope_type="application",
            application_id=world_a.application.id,
            expires_at=timezone.now() - timedelta(days=1),
        )
        client = _client_for(admin)
        aid = world_a.application_id

        for label, template in _APP_GET_ENDPOINTS.items():
            missing = _capture(client.get(template.format(aid=_RANDOM_ID)))
            expired = _capture(client.get(template.format(aid=aid)))
            assert expired[0] == 404, (label, expired)
            assert expired == missing, {
                "label": label,
                "expired": expired,
                "missing": missing,
            }

    def test_active_application_grant_still_permits(self, two_tenant_worlds, production_scope):
        """Control: the same grant, unexpired, permits the read (proves the
        not-found above is the expiry, not a broken fixture)."""
        world_a, _world_b = two_tenant_worlds
        admin = build_profile(role="admin")
        build_access_grant(
            user=admin,
            scope_type="application",
            application_id=world_a.application.id,
            expires_at=timezone.now() + timedelta(days=1),
        )
        status_code, body = _capture(
            _client_for(admin).get(
                f"/api/v1/applications/{world_a.application_id}/summary/"
            )
        )
        assert status_code == 200, (status_code, body)
        assert body.get("success") is True, body


# ---------------------------------------------------------------------------
# R5.6 — offering / application scoped grants permit only that target
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGrantScopeDoesNotWiden:
    """R5.6: an offering- or application-scoped grant permits only its target.

    A sibling application in the *same* school (covered neither by the offering
    nor the application grant) must still mask as not-found.

    **Validates: Requirements 5.6**
    """

    def test_application_grant_permits_only_that_application(self, two_tenant_worlds, production_scope):
        world_a, _world_b = two_tenant_worlds
        sibling = build_application(
            student=build_profile(role="student"),
            institution=world_a.institution,
            canonical_program=world_a.canonical_program,
            offering=world_a.offering,
            intake=world_a.intake,
            status="submitted",
        )
        admin = build_profile(role="admin")
        build_access_grant(
            user=admin,
            scope_type="application",
            application_id=world_a.application.id,
        )
        client = _client_for(admin)

        # Granted application is visible.
        granted = _capture(client.get(f"/api/v1/applications/{world_a.application_id}/summary/"))
        assert granted[0] == 200, granted
        # Sibling in the same school is masked as not-found (no widening).
        missing = _capture(client.get(f"/api/v1/applications/{_RANDOM_ID}/summary/"))
        sibling_resp = _capture(client.get(f"/api/v1/applications/{sibling.id}/summary/"))
        assert sibling_resp[0] == 404, sibling_resp
        assert sibling_resp == missing, {"sibling": sibling_resp, "missing": missing}

    def test_offering_grant_permits_only_that_offering(self, two_tenant_worlds, production_scope):
        """An offering-scoped grant exposes applications on that offering but not
        a sibling application on a different offering in the same school."""
        from tests.tenant_fixtures import build_offering_with_application

        world_a, _world_b = two_tenant_worlds
        # Sibling offering + application in the same institution, NOT granted.
        _sibling_offering, sibling_app = build_offering_with_application(
            institution=world_a.institution,
            canonical_program=world_a.canonical_program,
            intake=world_a.intake,
            student=build_profile(role="student"),
            application_status="submitted",
        )
        admin = build_profile(role="admin")
        build_access_grant(
            user=admin,
            scope_type="offering",
            program=world_a.offering,
        )
        client = _client_for(admin)

        granted = _capture(client.get(f"/api/v1/applications/{world_a.application_id}/summary/"))
        assert granted[0] == 200, granted
        missing = _capture(client.get(f"/api/v1/applications/{_RANDOM_ID}/summary/"))
        sibling_resp = _capture(client.get(f"/api/v1/applications/{sibling_app.id}/summary/"))
        assert sibling_resp[0] == 404, sibling_resp
        assert sibling_resp == missing, {"sibling": sibling_resp, "missing": missing}


# ---------------------------------------------------------------------------
# R5.7 — Super_Admin reads any tenant resource
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSuperAdminSeesAll:
    """R5.7: a Super_Admin is permitted every tenant read.

    **Validates: Requirements 5.7**
    """

    def _super_admin_client(self):
        return _client_for(build_profile(role="super_admin"))

    def test_super_admin_reads_any_school_app_endpoints(self, two_tenant_worlds, production_scope):
        world_a, world_b = two_tenant_worlds
        client = self._super_admin_client()

        for world in (world_a, world_b):
            for label, template in _APP_GET_ENDPOINTS.items():
                status_code, body = _capture(client.get(template.format(aid=world.application_id)))
                _assert_scope_permitted(f"{label}@{world.institution_id}", status_code, body)

    def test_super_admin_reads_any_school_document(self, two_tenant_worlds, production_scope):
        world_a, world_b = two_tenant_worlds
        client = self._super_admin_client()
        for world in (world_a, world_b):
            doc = build_document(application=world.application)
            status_code, body = _capture(client.get(f"/api/v1/documents/{doc.id}/info/"))
            assert status_code == 200, (world.institution_id, status_code, body)
            assert body.get("success") is True, body
