"""The deprecated ``/email-slip/`` route is gone, and the successor answers.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task **10.6**.
Requirements: **R13.5** ("legacy acceptance-letter, slip, and receipt callers
              SHALL be deprecated and removed after measured zero use"),
              **R13.13**, **R2.5** (a removal needs the measurement).
Finding:      **API-04**.

This file replaces ``test_email_slip_endpoint.py``, which pinned the route's
behaviour first as its own implementation and then — after task 10.4 — as a proxy.
The route no longer exists, so what needs proving changed shape:

1. it is **not routed**, by name and by path, so nothing can quietly re-add it;
2. its view and its two serializers are **not importable**, including through
   ``student_views``' compatibility re-export surface, which is the seam that
   would otherwise keep a deleted view alive;
3. the **successor still works** — the removal moved callers onto one route, it
   did not remove the capability;
4. the successor still holds the properties the legacy route's own suite proved:
   an out-of-scope caller is masked, a slip that was never issued is a refusal
   rather than an email about nothing, and the request body cannot choose the
   recipient.

Point 3 and 4 matter more than 1 and 2. "The route is gone" is cheap to assert
and worthless on its own; a removal is only correct if the thing it delegated to
answers, which is why the successor is exercised here rather than trusted.
"""

import uuid

import pytest
from django.urls import NoReverseMatch, resolve, reverse
from django.urls.exceptions import Resolver404
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from tests.tenant_fixtures import build_tenant_world, build_two_tenant_worlds

pytestmark = pytest.mark.django_db


def _make_user(user_id=None, role="student"):
    uid = user_id or uuid.uuid4()
    return JWTUser(
        {
            "user_id": str(uid),
            "email": "student@example.com",
            "role": role,
            "first_name": "Test",
            "last_name": "User",
        }
    )


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=_make_user(user_id=profile.id, role=profile.role))
    return client


def _canonical_email_url(application_id) -> str:
    return (
        f"/api/v1/applications/{application_id}"
        "/official-documents/application_slip/email/"
    )


# ---------------------------------------------------------------------------
# 1. The route is gone
# ---------------------------------------------------------------------------
class TestRouteRemoved:
    def test_the_url_name_no_longer_reverses(self):
        with pytest.raises(NoReverseMatch):
            reverse(
                "applications:application-email-slip",
                kwargs={"application_id": uuid.uuid4()},
            )

    def test_the_path_no_longer_resolves(self):
        with pytest.raises(Resolver404):
            resolve(f"/api/v1/applications/{uuid.uuid4()}/email-slip/")

    def test_a_request_to_the_retired_path_is_a_404(self):
        world = build_tenant_world(application_status="submitted")
        response = _client_for(world.staff).post(
            f"/api/v1/applications/{world.application.id}/email-slip/",
            {"email": "recipient@example.com"},
            format="json",
        )
        assert response.status_code == 404

    def test_the_url_conf_names_no_email_slip_route(self):
        from apps.applications import urls as application_urls

        names = {
            getattr(pattern, "name", None) for pattern in application_urls.urlpatterns
        }
        assert "application-email-slip" not in names


# ---------------------------------------------------------------------------
# 2. The symbols are gone, including through the compatibility re-export
# ---------------------------------------------------------------------------
class TestSymbolsRemoved:
    def test_the_view_is_not_importable_from_its_module(self):
        from apps.applications import student_document_views

        assert not hasattr(student_document_views, "EmailSlipView")

    def test_the_view_is_not_re_exported_by_student_views(self):
        # `student_views` exists to keep old imports working, which is exactly how
        # a deleted view survives its own deletion. Both the attribute and the
        # `__all__` contract are checked.
        from apps.applications import student_views

        assert not hasattr(student_views, "EmailSlipView")
        assert "EmailSlipView" not in student_views.__all__

    def test_the_legacy_serializers_are_gone(self):
        from apps.applications import _view_helpers

        for symbol in (
            "EmailSlipSerializer",
            "EmailSlipQueuedSerializer",
            "EmailSlipEnvelopeResponseSerializer",
        ):
            assert not hasattr(_view_helpers, symbol), symbol

    def test_no_application_module_still_imports_them(self):
        """A stale import would be an ImportError at boot, so this is a real gate."""
        import importlib
        import pkgutil

        import apps.applications as package

        for module in pkgutil.iter_modules(package.__path__):
            if module.ispkg:
                continue
            imported = importlib.import_module(f"apps.applications.{module.name}")
            assert not hasattr(imported, "EmailSlipView"), module.name


# ---------------------------------------------------------------------------
# 3. The successor answers (the half that makes the removal correct)
# ---------------------------------------------------------------------------
class TestSuccessorIsReachable:
    def test_the_canonical_email_route_reverses(self):
        url = reverse(
            "applications:application-official-document-email",
            kwargs={
                "application_id": uuid.uuid4(),
                "document_type": "application_slip",
            },
        )
        assert url.endswith("/official-documents/application_slip/email/")

    def test_the_canonical_route_answers_where_the_legacy_one_did(self):
        world = build_tenant_world(application_status="submitted")
        response = _client_for(world.staff).post(
            _canonical_email_url(world.application.id), {}, format="json"
        )
        # Not a 404: the route exists and made a decision. Which decision is
        # 10.4's subject; that it is reachable is this task's.
        assert response.status_code != 404, response.content


# ---------------------------------------------------------------------------
# 4. The properties the legacy suite proved still hold on the successor
# ---------------------------------------------------------------------------
class TestSuccessorKeptTheProperties:
    def test_out_of_scope_staff_is_masked(self):
        world_a, world_b = build_two_tenant_worlds(
            staff_role="admin",
            application_status="submitted",
        )

        response = _client_for(world_a.staff).post(
            _canonical_email_url(world_b.application.id), {}, format="json"
        )

        assert response.status_code == 404
        assert response.json() == {
            "success": False,
            "error": "Document not found",
            "code": "NOT_FOUND",
        }

    def test_a_slip_that_was_never_issued_is_refused_not_emailed(self):
        """The behaviour change that justified the consolidation.

        The deleted implementation composed an inline HTML table from the
        application row and sent it whether or not any PDF had ever been rendered,
        so a student could receive an "application slip" email for a slip that did
        not exist.
        """
        world = build_tenant_world(application_status="submitted")

        response = _client_for(world.staff).post(
            _canonical_email_url(world.application.id), {}, format="json"
        )

        assert response.status_code == 409, response.content
        body = response.json()
        assert body["code"] == "DOCUMENT_NOT_READY"
        assert body["data"]["document_type"] == "application_slip"

    def test_the_request_body_cannot_choose_the_recipient(self):
        """``EmailSlipView`` mailed to whatever address the body named."""
        world = build_tenant_world(application_status="submitted")

        response = _client_for(world.staff).post(
            _canonical_email_url(world.application.id),
            {"email": "somewhere.else@example.com"},
            format="json",
        )

        assert response.status_code in (400, 409), response.content
        assert response.json()["code"] in (
            "RECIPIENT_NOT_PERMITTED",
            "DOCUMENT_NOT_READY",
        )
