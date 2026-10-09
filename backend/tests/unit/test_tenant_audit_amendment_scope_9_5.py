"""Cross-tenant audit event + amendment recipient negative tests (task 9.5).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.5 —
              "Correct tenant audit and amendment notification scope". This file
              is the endpoint/service half of the task's ``_Evidence:`` line:
              *cross-tenant event/recipient negative tests and audit export E2E*.
Requirements: **R3** (one authorization model — the capability service is the sole
              authority, scope precedes lookup, cross-tenant substitution is an
              indistinguishable 404), **R6.6** (the tenant audit list and export use
              the selected institution endpoint, require ``tenant.audit.read`` or
              the platform equivalent, paginate, and never leak another tenant's
              events), **R13.10** (amendment requests notify **only**
              tenant-authorized recipients through the durable communication
              outbox).
Findings:     **ADM-05** (the tenant audit UI called a generic endpoint without the
              selected tenant, and the correct endpoint had no
              ``tenant.audit.read`` check), **AUTH-06** (amendment notifications
              were broadcast to every admin, and review had no lock).

The claims this file makes
--------------------------

1. A tenant admin scoped to **A** cannot read, filter, count or export **B**'s
   audit events, and cannot tell "B is out of your scope" from "that id does not
   exist".
2. The audit feed answers *"what happened to my school"* — matched on the
   institution the event records — not *"what did people I share a school with
   do"*, which is the different question the generic endpoint answers.
3. An amendment request notifies exactly the staff who hold
   ``tenant.application.review`` for that application's own institution: not
   another school's admins, not a view-only member, and not every platform
   operator.
4. Two reviewers deciding one amendment produce one decision.

Every test runs with ``production_scope`` active, so the test-settings
legacy-admin all-access shortcut is disabled and what is measured is the real
membership/grant-derived capability model.
"""

from __future__ import annotations

import csv
import io
import json
import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.amendment_service import (
    AMENDMENT_RECIPIENT_CAPABILITY,
    AMENDMENT_REQUESTED_EVENT,
    AmendmentError,
    AmendmentService,
    AmendmentStateMachine,
)
from apps.applications.models import ApplicationAmendment
from apps.catalog.services import AccessScopeService, AdminCapabilityService
from apps.catalog.tenant_audit_query_service import (
    CATEGORIES,
    CATEGORY_DEFINITIONS,
    EXPORT_CAPABILITY,
    READ_CAPABILITY,
    TenantAuditQueryService,
    categorize,
)
from apps.catalog.tenant_audit_service import (
    ACTION_AMENDMENT_REQUESTED,
    ACTION_AUDIT_EXPORTED,
    TenantAuditService,
)
from apps.catalog.tenant_recipients import (
    RECIPIENT_LIMIT,
    TenantStaffRecipientService,
)
from apps.common.models import AuditLog, Notification, OutboxEvent
from tests.tenant_fixtures import build_membership, build_profile


def audit_url(institution_id) -> str:
    return f"/api/v1/admin/institutions/{institution_id}/audit/"


def _client_for(profile) -> APIClient:
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


def _grant(profile, institution, permissions, role="admin"):
    """A staff member of ``institution`` with an explicit permission bundle."""
    return build_membership(
        user=profile, institution=institution, role=role, permissions=list(permissions)
    )


def _seed_event(institution_id, action="tenant.institution.updated", **metadata):
    """One tenant Audit_Event recorded against ``institution_id``."""
    TenantAuditService.record_event(
        action=action,
        entity_type="institution",
        entity_id=institution_id,
        institution_id=institution_id,
        metadata=metadata or {"object_type": "institution"},
    )
    return AuditLog.objects.filter(action=action).order_by("-created_at").first()


def _csv_rows(response) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(response.content.decode())))


def _called_functions(source: str) -> set[str]:
    """Names of functions actually *called* in executable code.

    Distinguishes calling the ``is_super_admin(user)`` role predicate — a role
    comparison — from reading ``capability_set.is_super_admin``, which is the
    capability service's own resolved answer and is exactly what 8.4's
    ``_may_export`` reads.
    """
    import ast

    called: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Name):
            called.add(func.id)
        elif isinstance(func, ast.Attribute):
            called.add(func.attr)
    return called


def _code_names(source: str) -> set[str]:
    """Every identifier used in *executable* code, docstrings excluded.

    A grep over the raw source cannot tell a role comparison from a docstring
    that *quotes* the role comparison it replaced — and this task's modules
    deliberately quote the defective code they deleted. Parsing means the guard
    measures what runs.
    """
    import ast

    tree = ast.parse(source)
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, ast.keyword) and node.arg:
            names.add(node.arg)
    return names


#: The four canonical role strings. A surface that compares one of these is
#: deciding authority from a role rather than from a capability (R3.1).
ROLE_STRINGS = {"admin", "super_admin", "reviewer", "student"}


def _role_comparisons(source: str) -> set[str]:
    """Role strings used to *decide* something: a comparison or a query filter.

    Deliberately narrow. ``tags=["admin"]`` on an OpenAPI decorator is
    documentation, and a docstring quoting the deleted role filter is a record of
    the defect — neither decides authority. What R3.1 forbids is comparing a role
    or filtering on one, so that is what this looks for.
    """
    import ast

    offenders: set[str] = set()

    def literals(node) -> set[str]:
        return {
            child.value
            for child in ast.walk(node)
            if isinstance(child, ast.Constant)
            and isinstance(child.value, str)
            and child.value in ROLE_STRINGS
        }

    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Compare):
            offenders |= literals(node)
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in {"filter", "exclude", "get"}:
                for keyword in node.keywords:
                    offenders |= literals(keyword)
    return offenders


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# 1. The audit feed's authority is a capability, per institution (ADM-05, R6.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuditAuthorityIsCapabilityDerived:
    """``tenant.audit.read`` for the **selected** institution decides.

    **Validates: Requirements R3.1, R3.2, R6.6**
    """

    def test_scoped_staff_can_read_their_own_school(self, tenant_world):
        _seed_event(tenant_world.institution_id)
        response = _client_for(tenant_world.staff).get(audit_url(tenant_world.institution_id))
        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert data["institution_id"] == tenant_world.institution_id
        assert data["totalCount"] >= 1

    def test_a_scoped_reviewer_can_read_it(self, tenant_world):
        """The read bundle every active membership carries includes audit read.

        The previous ``IsAdmin`` class admitted the ``admin`` role string and
        nothing else, so a Reviewer with a real membership was refused a feed the
        capability model grants them.
        """
        reviewer = build_profile(role="reviewer")
        _grant(reviewer, tenant_world.institution, [], role="reviewer")
        response = _client_for(reviewer).get(audit_url(tenant_world.institution_id))
        assert response.status_code == 200, response.content

    def test_student_is_masked_as_not_found(self, tenant_world):
        response = _client_for(tenant_world.student).get(audit_url(tenant_world.institution_id))
        assert response.status_code == 404, response.content
        body = json.dumps(response.json())
        assert tenant_world.institution.name not in body

    def test_no_scope_admin_is_masked_as_not_found(self, tenant_world):
        """An ``admin`` role string with no membership has zero authority."""
        stranger = build_profile(role="admin")
        response = _client_for(stranger).get(audit_url(tenant_world.institution_id))
        assert response.status_code == 404, response.content
        assert "results" not in json.dumps(response.json())

    def test_super_admin_reads_any_school(self, tenant_world):
        _seed_event(tenant_world.institution_id)
        super_admin = build_profile(role="super_admin")
        response = _client_for(super_admin).get(audit_url(tenant_world.institution_id))
        assert response.status_code == 200, response.content

    def test_anonymous_is_denied(self, tenant_world):
        response = APIClient().get(audit_url(tenant_world.institution_id))
        assert response.status_code in (401, 403), response.content

    def test_the_read_capability_is_canonical(self):
        """No capability was invented for this surface (the 17 + 17 catalogue)."""
        assert READ_CAPABILITY in AdminCapabilityService.TENANT_CAPABILITIES
        assert EXPORT_CAPABILITY in AdminCapabilityService.TENANT_CAPABILITIES

    def test_no_role_string_is_compared_on_the_audit_surface(self):
        """The view and the service decide through capabilities only (R3.1)."""
        import inspect

        from apps.catalog import admin_views, tenant_audit_query_service

        for label, source in (
            ("the audit query service", inspect.getsource(tenant_audit_query_service)),
            (
                "the audit view",
                inspect.getsource(admin_views.AdminInstitutionAuditView),
            ),
        ):
            names = _code_names(source)
            assert "IsAdmin" not in names, f"IsAdmin used by {label}"
            # Reading ``CapabilitySet.is_super_admin`` is the capability service's
            # own answer and is allowed; *calling* the role predicate is not.
            assert "is_super_admin" not in _called_functions(
                source
            ), f"the is_super_admin role predicate is called by {label}"
            assert "role__in" not in names, f"{label} filters on role"
            assert not _role_comparisons(source), f"a role is compared in {label}"

    def test_the_audit_view_no_longer_carries_the_role_permission_class(self):
        """``IsAdmin`` was the endpoint's second authority; it is gone (ADM-05)."""
        from apps.accounts.permissions import IsAdmin
        from apps.catalog.admin_views import AdminInstitutionAuditView

        assert IsAdmin not in AdminInstitutionAuditView.permission_classes


# ---------------------------------------------------------------------------
# 2. Cross-tenant isolation on the audit feed (R3.2, R6.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuditCrossTenantIsolation:
    """Tenant A can neither read nor infer tenant B's audit trail.

    **Validates: Requirements R3.2, R6.6**
    """

    def test_another_tenants_feed_is_masked(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _seed_event(world_b.institution_id)
        response = _client_for(world_a.staff).get(audit_url(world_b.institution_id))
        assert response.status_code == 404, response.content
        body = json.dumps(response.json())
        assert world_b.institution.name not in body
        assert world_b.institution_id not in body

    def test_an_unknown_id_is_indistinguishable_from_another_tenants(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _seed_event(world_b.institution_id)
        client = _client_for(world_a.staff)
        other = client.get(audit_url(world_b.institution_id))
        unknown = client.get(audit_url(uuid.uuid4()))
        assert other.status_code == unknown.status_code == 404
        assert other.json() == unknown.json()

    def test_a_malformed_id_is_the_same_answer(self, two_tenant_worlds):
        world_a, _world_b = two_tenant_worlds
        response = _client_for(world_a.staff).get("/api/v1/admin/institutions/not-a-uuid/audit/")
        # The URL converter rejects a non-UUID before the view; either way the
        # caller learns nothing about what exists.
        assert response.status_code == 404, response.content

    def test_own_feed_excludes_the_other_tenants_events(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _seed_event(world_a.institution_id, action="tenant.domain.activated")
        _seed_event(world_b.institution_id, action="tenant.domain.activated")
        response = _client_for(world_a.staff).get(audit_url(world_a.institution_id))
        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert data["totalCount"] == 1
        assert {row["institution_id"] for row in data["results"]} == {world_a.institution_id}

    def test_the_facets_count_only_own_events(self, two_tenant_worlds):
        """A count is an inference too: B's volume must not reach A's totals."""
        world_a, world_b = two_tenant_worlds
        _seed_event(world_a.institution_id, action="tenant.asset.updated")
        for _ in range(3):
            _seed_event(world_b.institution_id, action="tenant.asset.updated")
        response = _client_for(world_a.staff).get(audit_url(world_a.institution_id))
        facets = response.json()["data"]["facets"]
        assert facets["event_count"] == 1
        assert facets["by_action"] == [{"action": "tenant.asset.updated", "event_count": 1}]

    def test_a_masked_probe_is_recorded_without_disclosing_the_target(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        before = AuditLog.objects.filter(action="scope.denied").count()
        _client_for(world_a.staff).get(audit_url(world_b.institution_id))
        denials = AuditLog.objects.filter(action="scope.denied").order_by("-created_at")
        assert denials.count() == before + 1
        recorded = denials.first()
        assert recorded.changes.get("resource_type") == "audit.institution"
        # The probe is recorded for operators; it does not name the target school.
        assert world_b.institution.name not in json.dumps(recorded.changes)

    def test_a_bulk_event_spanning_two_schools_reaches_both(self, two_tenant_worlds):
        """A multi-school command records one event; each school sees its share.

        ``record_bulk_review_decision`` stores the first institution as the
        event's scope and every one of them in ``institution_ids``. Matching only
        the former would hide a command from every school but the first.
        """
        world_a, world_b = two_tenant_worlds
        TenantAuditService.record_bulk_review_decision(
            new_status="under_review",
            application_ids=[uuid.uuid4()],
            institution_ids=[world_a.institution.id, world_b.institution.id],
        )
        for world in (world_a, world_b):
            response = _client_for(world.staff).get(audit_url(world.institution_id))
            assert response.status_code == 200, response.content
            actions = {row["action"] for row in response.json()["data"]["results"]}
            assert "application.review_bulk_decided" in actions


# ---------------------------------------------------------------------------
# 3. The server owns the list: filters, page, facets (R6.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuditListIsServerOwned:
    """Filters, paging and totals are SQL, and the labels ship a definition.

    **Validates: Requirements R6.6, R8.6**
    """

    def test_pagination_is_page_independent_and_totals_are_the_whole_set(self, tenant_world):
        for index in range(7):
            _seed_event(tenant_world.institution_id, action=f"tenant.asset.updated", index=index)
        client = _client_for(tenant_world.staff)
        page1 = client.get(audit_url(tenant_world.institution_id) + "?pageSize=3&page=1").json()["data"]
        page3 = client.get(audit_url(tenant_world.institution_id) + "?pageSize=3&page=3").json()["data"]
        assert page1["totalCount"] == page3["totalCount"] == 7
        assert page1["totalPages"] == 3
        assert len(page1["results"]) == 3
        assert len(page3["results"]) == 1
        assert {row["id"] for row in page1["results"]}.isdisjoint(
            {row["id"] for row in page3["results"]}
        )

    def test_the_action_filter_is_applied_in_sql(self, tenant_world):
        _seed_event(tenant_world.institution_id, action="tenant.domain.activated")
        _seed_event(tenant_world.institution_id, action="tenant.asset.updated")
        response = _client_for(tenant_world.staff).get(
            audit_url(tenant_world.institution_id) + "?action=tenant.domain.activated"
        )
        data = response.json()["data"]
        assert data["totalCount"] == 1
        assert data["results"][0]["action"] == "tenant.domain.activated"
        assert data["filters"]["action"] == "tenant.domain.activated"

    def test_the_category_filter_uses_the_published_vocabulary(self, tenant_world):
        _seed_event(tenant_world.institution_id, action="tenant.domain.activated")
        _seed_event(tenant_world.institution_id, action="auth.denied")
        client = _client_for(tenant_world.staff)
        config = client.get(
            audit_url(tenant_world.institution_id) + "?category=configuration"
        ).json()["data"]
        authz = client.get(
            audit_url(tenant_world.institution_id) + "?category=authorization"
        ).json()["data"]
        assert config["totalCount"] == 1
        assert config["results"][0]["category"] == "configuration"
        assert authz["totalCount"] == 1
        assert authz["results"][0]["category"] == "authorization"

    def test_an_unknown_category_is_dropped_rather_than_narrowing_to_nothing(self, tenant_world):
        _seed_event(tenant_world.institution_id)
        response = _client_for(tenant_world.staff).get(
            audit_url(tenant_world.institution_id) + "?category=not-a-category"
        )
        data = response.json()["data"]
        assert data["filters"]["category"] is None
        assert data["totalCount"] == 1

    def test_the_category_vocabulary_travels_with_a_definition(self, tenant_world):
        _seed_event(tenant_world.institution_id)
        data = _client_for(tenant_world.staff).get(
            audit_url(tenant_world.institution_id)
        ).json()["data"]
        assert data["categories"] == list(CATEGORIES)
        assert set(data["definitions"]) == set(CATEGORIES)
        assert all(data["definitions"][name] for name in CATEGORIES)

    def test_every_category_is_defined(self):
        """A new category cannot ship undefined (the 9.1/9.4 rule)."""
        assert set(CATEGORY_DEFINITIONS) == set(CATEGORIES)

    def test_categories_are_derived_from_the_action_vocabulary(self):
        assert categorize("tenant.domain.activated") == "configuration"
        assert categorize("scope.denied") == "authorization"
        assert categorize(ACTION_AMENDMENT_REQUESTED) == "review"
        assert categorize(ACTION_AUDIT_EXPORTED) == "export"
        assert categorize("application.exported") == "export"
        assert categorize("application.review_decided") == "review"
        assert categorize("something.unmapped") == "other"

    def test_no_network_hash_is_published(self, tenant_world):
        """The two columns derived from personal request context stay behind."""
        _seed_event(tenant_world.institution_id)
        data = _client_for(tenant_world.staff).get(
            audit_url(tenant_world.institution_id)
        ).json()["data"]
        row = data["results"][0]
        assert "ip_address" not in row
        assert "user_agent" not in row


# ---------------------------------------------------------------------------
# 4. The export is a command (R6.5, R6.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuditExportIsOnePath:
    """Page-independent, capability-gated, audited, and tenant-scoped.

    **Validates: Requirements R6.5, R6.6**
    """

    def test_read_access_does_not_imply_export(self, tenant_world):
        _seed_event(tenant_world.institution_id)
        response = _client_for(tenant_world.staff).get(
            audit_url(tenant_world.institution_id) + "?export=csv"
        )
        assert response.status_code == 403, response.content
        assert response.json()["code"] == "INSUFFICIENT_PERMISSIONS"

    def test_the_export_capability_is_published_on_the_read(self, tenant_world):
        _seed_event(tenant_world.institution_id)
        client = _client_for(tenant_world.staff)
        assert client.get(audit_url(tenant_world.institution_id)).json()["data"]["can_export"] is False
        exporter = build_profile(role="admin")
        _grant(exporter, tenant_world.institution, ["export"])
        assert (
            _client_for(exporter)
            .get(audit_url(tenant_world.institution_id))
            .json()["data"]["can_export"]
            is True
        )

    def test_the_export_is_page_independent(self, tenant_world):
        for index in range(6):
            _seed_event(tenant_world.institution_id, index=index)
        exporter = build_profile(role="admin")
        _grant(exporter, tenant_world.institution, ["export"])
        response = _client_for(exporter).get(
            audit_url(tenant_world.institution_id) + "?export=csv&pageSize=2&page=1"
        )
        assert response.status_code == 200, response.content
        assert response["Content-Type"] == "text/csv"
        rows = _csv_rows(response)
        assert len(rows) == 6

    def test_the_export_is_tenant_scoped(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        _seed_event(world_a.institution_id)
        _seed_event(world_b.institution_id)
        exporter = build_profile(role="admin")
        _grant(exporter, world_a.institution, ["export"])
        rows = _csv_rows(
            _client_for(exporter).get(audit_url(world_a.institution_id) + "?export=csv")
        )
        assert {row["institution_id"] for row in rows} == {world_a.institution_id}

    def test_the_export_is_audited_with_counts_and_filters_but_not_the_rows(self, tenant_world):
        _seed_event(tenant_world.institution_id, action="tenant.domain.activated")
        exporter = build_profile(role="admin")
        _grant(exporter, tenant_world.institution, ["export"])
        _client_for(exporter).get(
            audit_url(tenant_world.institution_id) + "?export=csv&action=tenant.domain.activated"
        )
        recorded = (
            AuditLog.objects.filter(action=ACTION_AUDIT_EXPORTED)
            .order_by("-created_at")
            .first()
        )
        assert recorded is not None
        assert recorded.changes["row_count"] == 1
        assert recorded.changes["page_independent"] is True
        assert recorded.changes["filters"]["action"] == "tenant.domain.activated"
        assert recorded.changes["institution_id"] == tenant_world.institution_id
        assert recorded.retention_category == "security"
        # The events themselves never travel into the audit trail.
        assert "results" not in recorded.changes

    def test_a_refused_export_is_recorded(self, tenant_world):
        _seed_event(tenant_world.institution_id)
        _client_for(tenant_world.staff).get(
            audit_url(tenant_world.institution_id) + "?export=csv"
        )
        denied = (
            AuditLog.objects.filter(action="auth.denied")
            .order_by("-created_at")
            .first()
        )
        assert denied is not None
        assert denied.changes["resource_type"] == "audit.export"
        assert denied.changes["required_capability"] == EXPORT_CAPABILITY

    def test_the_exported_payload_is_json_text(self, tenant_world):
        """``changes`` is serialised, not stringified — a CSV cell must parse."""
        _seed_event(tenant_world.institution_id, action="tenant.asset.updated")
        exporter = build_profile(role="admin")
        _grant(exporter, tenant_world.institution, ["export"])
        rows = _csv_rows(
            _client_for(exporter).get(audit_url(tenant_world.institution_id) + "?export=csv")
        )
        assert json.loads(rows[0]["changes"])["institution_id"] == tenant_world.institution_id


# ---------------------------------------------------------------------------
# 5. Amendment recipients are tenant-authorized (AUTH-06, R13.10)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAmendmentRecipientsAreTenantAuthorized:
    """Only staff holding the review capability for *this* school are notified.

    **Validates: Requirements R3.1, R13.10**
    """

    def _request_amendment(self, world, field_name="phone", new_value="+260970000009"):
        return AmendmentService.request_amendment(
            application_id=str(world.application.id),
            field_name=field_name,
            new_value=new_value,
            reason="Changed my number after moving.",
            user_id=str(world.student.id),
        )

    def test_the_recipient_capability_is_the_review_commands_own(self):
        """Notify exactly the people who can act — the 9.4 command's capability."""
        from apps.applications.review_workspace_service import COMMAND_CAPABILITIES

        assert AMENDMENT_RECIPIENT_CAPABILITY == COMMAND_CAPABILITIES["review_amendment"]
        assert AMENDMENT_RECIPIENT_CAPABILITY in AdminCapabilityService.TENANT_CAPABILITIES

    def test_only_the_owning_schools_reviewer_is_notified(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        reviewer_a = build_profile(role="reviewer")
        _grant(reviewer_a, world_a.institution, ["review"], role="reviewer")
        reviewer_b = build_profile(role="reviewer")
        _grant(reviewer_b, world_b.institution, ["review"], role="reviewer")
        world_a.application.status = "submitted"
        world_a.application.save(update_fields=["status"])

        amendment = self._request_amendment(world_a)

        notified = set(
            Notification.objects.filter(title="Amendment Request").values_list(
                "user_id", flat=True
            )
        )
        assert reviewer_a.id in notified
        assert reviewer_b.id not in notified, "another school's reviewer was notified"
        assert amendment.status == "pending"

    def test_a_view_only_member_is_not_notified(self, tenant_world):
        """AUTH-06's other half: notified about work they may not do."""
        viewer = build_profile(role="admin")
        _grant(viewer, tenant_world.institution, ["view"])
        reviewer = build_profile(role="admin")
        _grant(reviewer, tenant_world.institution, ["review"])
        tenant_world.application.status = "submitted"
        tenant_world.application.save(update_fields=["status"])

        self._request_amendment(tenant_world)

        notified = set(
            Notification.objects.filter(title="Amendment Request").values_list(
                "user_id", flat=True
            )
        )
        assert reviewer.id in notified
        assert viewer.id not in notified

    def test_a_platform_operator_is_not_broadcast_to(self, tenant_world):
        """A Super_Admin holds every tenant capability; notifying them for every
        school's every amendment is the broadcast this task removed, not a
        capability decision.
        """
        super_admin = build_profile(role="super_admin")
        reviewer = build_profile(role="admin")
        _grant(reviewer, tenant_world.institution, ["review"])
        tenant_world.application.status = "submitted"
        tenant_world.application.save(update_fields=["status"])

        self._request_amendment(tenant_world)

        notified = set(
            Notification.objects.filter(title="Amendment Request").values_list(
                "user_id", flat=True
            )
        )
        assert reviewer.id in notified
        assert super_admin.id not in notified

    def test_a_school_with_no_authorized_reviewer_records_the_gap(self, tenant_world):
        """Fail closed and stay observable, rather than widening the audience."""
        tenant_world.membership.permissions = ["view"]
        tenant_world.membership.save(update_fields=["permissions"])
        tenant_world.access_grant.permissions = ["view"]
        tenant_world.access_grant.save(update_fields=["permissions"])
        tenant_world.application.status = "submitted"
        tenant_world.application.save(update_fields=["status"])

        amendment = self._request_amendment(tenant_world)

        assert Notification.objects.filter(title="Amendment Request").count() == 0
        event = OutboxEvent.objects.filter(event_type=AMENDMENT_REQUESTED_EVENT).first()
        assert event is not None, "the gap must still be durable"
        assert event.payload["recipient_count"] == 0
        assert event.payload["empty_reason"] == "no_capability"

    def test_an_application_with_no_tenant_notifies_nobody(self, tenant_world_factory):
        """A legacy row with no institution has no tenant-authorized recipient."""
        world = tenant_world_factory(with_canonical_ids=False, application_status="submitted")
        _grant(build_profile(role="admin"), world.institution, ["review"])

        AmendmentService.request_amendment(
            application_id=str(world.application.id),
            field_name="phone",
            new_value="+260970000005",
            reason="Legacy row with no canonical institution.",
            user_id=str(world.student.id),
        )

        assert Notification.objects.filter(title="Amendment Request").count() == 0
        event = OutboxEvent.objects.filter(event_type=AMENDMENT_REQUESTED_EVENT).first()
        assert event is not None
        assert event.payload["empty_reason"] == "no_institution"

    def test_the_fanout_is_durable_and_idempotent(self, tenant_world):
        """One notification per recipient per amendment, even on a replay."""
        reviewer = build_profile(role="admin")
        _grant(reviewer, tenant_world.institution, ["review"])
        tenant_world.application.status = "submitted"
        tenant_world.application.save(update_fields=["status"])

        amendment = self._request_amendment(tenant_world)
        rows = Notification.objects.filter(user_id=reviewer.id, title="Amendment Request")
        assert rows.count() == 1
        assert rows.first().idempotency_key == f"amendment:{amendment.id}:recipient:{reviewer.id}"
        # Every notification carries its own committed outbox row (design §17).
        assert OutboxEvent.objects.filter(
            event_type="notification.created", target_id=rows.first().id
        ).exists()

        # Replaying the same fan-out converges rather than doubling it.
        from apps.applications.amendment_service import _notify_admins_of_amendment

        _notify_admins_of_amendment(tenant_world.application, amendment)
        assert (
            Notification.objects.filter(user_id=reviewer.id, title="Amendment Request").count()
            == 1
        )

    def test_the_request_is_audited_with_the_recipient_decision_and_no_pii(self, tenant_world):
        reviewer = build_profile(role="admin")
        _grant(reviewer, tenant_world.institution, ["review"])
        tenant_world.application.status = "submitted"
        tenant_world.application.save(update_fields=["status"])

        self._request_amendment(tenant_world, new_value="+260970000123")

        recorded = AuditLog.objects.filter(action=ACTION_AMENDMENT_REQUESTED).first()
        assert recorded is not None
        assert recorded.changes["capability"] == AMENDMENT_RECIPIENT_CAPABILITY
        assert recorded.changes["recipient_count"] == 1
        assert recorded.changes["institution_id"] == tenant_world.institution_id
        payload = json.dumps(recorded.changes)
        # The amended value is applicant PII and never travels.
        assert "+260970000123" not in payload
        assert reviewer.email not in payload

    def test_no_role_string_is_compared_when_resolving_recipients(self):
        """The broadcast filter is gone from executable code (AUTH-06).

        Both modules *quote* the defective filter in their docstrings, on purpose:
        the record of what was wrong is part of the fix. So the guard parses rather
        than greps, and asserts no ``role``-keyed query and no role string literal
        survives in code.
        """
        import inspect

        from apps.applications import amendment_service
        from apps.catalog import tenant_recipients

        for module in (tenant_recipients, amendment_service):
            source = inspect.getsource(module)
            names = _code_names(source)
            assert "role__in" not in names, f"{module.__name__} filters on role"
            assert not _role_comparisons(
                source
            ), f"{module.__name__} decides from a role string"


@pytest.mark.django_db
class TestRecipientResolverContract:
    """The resolver's own contract, independent of the amendment path.

    **Validates: Requirements R3.1, R13.10**
    """

    def test_a_member_without_the_capability_is_excluded(self, tenant_world):
        viewer = build_profile(role="admin")
        _grant(viewer, tenant_world.institution, ["view"])
        resolved = TenantStaffRecipientService.recipients_for_institution(
            tenant_world.institution_id, "tenant.application.review"
        )
        assert viewer.id not in {profile.id for profile in resolved.profiles}

    def test_an_inactive_membership_is_excluded(self, tenant_world):
        former = build_profile(role="admin")
        build_membership(
            user=former,
            institution=tenant_world.institution,
            role="admin",
            permissions=["review"],
            is_active=False,
        )
        resolved = TenantStaffRecipientService.recipients_for_institution(
            tenant_world.institution_id, "tenant.application.review"
        )
        assert former.id not in {profile.id for profile in resolved.profiles}

    def test_a_deactivated_profile_is_excluded(self, tenant_world):
        suspended = build_profile(role="admin", is_active=False)
        _grant(suspended, tenant_world.institution, ["review"])
        resolved = TenantStaffRecipientService.recipients_for_institution(
            tenant_world.institution_id, "tenant.application.review"
        )
        assert suspended.id not in {profile.id for profile in resolved.profiles}

    def test_the_payload_carries_ids_not_addresses(self, tenant_world):
        reviewer = build_profile(role="admin")
        _grant(reviewer, tenant_world.institution, ["review"])
        resolved = TenantStaffRecipientService.recipients_for_institution(
            tenant_world.institution_id, "tenant.application.review"
        )
        payload = json.dumps(resolved.as_payload())
        assert str(reviewer.id) in payload
        assert reviewer.email not in payload

    def test_the_set_is_bounded_and_reports_truncation(self, tenant_world):
        for _ in range(3):
            _grant(build_profile(role="admin"), tenant_world.institution, ["review"])
        resolved = TenantStaffRecipientService.recipients_for_institution(
            tenant_world.institution_id, "tenant.application.review", limit=2
        )
        assert len(resolved.profiles) == 2
        assert resolved.truncated is True
        assert resolved.as_payload()["recipient_limit"] == RECIPIENT_LIMIT

    def test_a_resolution_failure_is_empty_not_wide(self, tenant_world, monkeypatch):
        """Fail closed: an unresolvable capability notifies nobody."""
        from apps.catalog.services import CapabilityResolutionError

        _grant(build_profile(role="admin"), tenant_world.institution, ["review"])

        def _boom(self, user, institution):
            raise CapabilityResolutionError("no")

        monkeypatch.setattr(
            AdminCapabilityService, "get_institution_capabilities", _boom
        )
        resolved = TenantStaffRecipientService.recipients_for_institution(
            tenant_world.institution_id, "tenant.application.review"
        )
        assert resolved.profiles == ()
        assert resolved.empty_reason == "resolution_failed"


# ---------------------------------------------------------------------------
# 6. The amendment review transition is locked (AUTH-06)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAmendmentReviewTransitionIsLocked:
    """One decision per amendment, and the field write commits with it.

    **Validates: Requirements R13.10**
    """

    def _pending(self, world, field_name="phone", new_value="+260970000077"):
        world.application.status = "submitted"
        world.application.save(update_fields=["status"])
        return AmendmentService.request_amendment(
            application_id=str(world.application.id),
            field_name=field_name,
            new_value=new_value,
            reason="Please update my contact number.",
            user_id=str(world.student.id),
        )

    def test_the_transition_table_is_the_one_declaration(self):
        assert AmendmentStateMachine.can_transition("pending", "approved")
        assert AmendmentStateMachine.can_transition("pending", "rejected")
        assert not AmendmentStateMachine.can_transition("approved", "rejected")
        assert not AmendmentStateMachine.can_transition("rejected", "approved")
        assert AmendmentStateMachine.TERMINAL_STATUSES == frozenset(
            {"approved", "rejected"}
        )

    def test_a_second_decision_is_refused_and_the_first_stands(self, tenant_world):
        amendment = self._pending(tenant_world)
        reviewer = build_profile(role="admin")
        _grant(reviewer, tenant_world.institution, ["review"])

        AmendmentService.review_amendment(
            amendment_id=str(amendment.id),
            status="approved",
            admin_id=str(reviewer.id),
        )
        with pytest.raises(AmendmentError) as exc:
            AmendmentService.review_amendment(
                amendment_id=str(amendment.id),
                status="rejected",
                admin_id=str(reviewer.id),
            )
        assert exc.value.code == "AMENDMENT_ALREADY_REVIEWED"
        amendment.refresh_from_db()
        assert amendment.status == "approved"

    def test_an_unsupported_outcome_is_refused(self, tenant_world):
        amendment = self._pending(tenant_world)
        with pytest.raises(AmendmentError) as exc:
            AmendmentService.review_amendment(
                amendment_id=str(amendment.id),
                status="maybe",
                admin_id=str(tenant_world.staff.id),
            )
        assert exc.value.code == "AMENDMENT_TRANSITION_REJECTED"
        amendment.refresh_from_db()
        assert amendment.status == "pending"

    def test_an_approval_applies_the_field_under_the_lock(self, tenant_world):
        amendment = self._pending(tenant_world, new_value="+260970000088")
        AmendmentService.review_amendment(
            amendment_id=str(amendment.id),
            status="approved",
            admin_id=str(tenant_world.staff.id),
        )
        tenant_world.application.refresh_from_db()
        assert tenant_world.application.phone == "+260970000088"

    def test_a_rejection_leaves_the_application_untouched(self, tenant_world):
        original = tenant_world.application.phone
        amendment = self._pending(tenant_world, new_value="+260970000099")
        AmendmentService.review_amendment(
            amendment_id=str(amendment.id),
            status="rejected",
            admin_id=str(tenant_world.staff.id),
        )
        tenant_world.application.refresh_from_db()
        assert tenant_world.application.phone == original

    def test_the_review_locks_both_rows(self):
        """The lock is on the amendment *and* its application.

        An approval writes an application field and the workspace's version
        counter is checked against the same row, so locking only the amendment
        would leave the write it authorises unprotected.
        """
        import inspect

        source = inspect.getsource(AmendmentService.review_amendment)
        assert source.count("select_for_update()") == 2
        assert "ApplicationAmendment.objects.select_for_update()" in source
        assert "Application.objects.select_for_update()" in source

    def test_an_amendment_for_another_application_is_not_found(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        amendment = self._pending(world_a)
        with pytest.raises(AmendmentError) as exc:
            AmendmentService.review_amendment(
                amendment_id=str(amendment.id),
                status="approved",
                admin_id=str(world_b.staff.id),
                application_id=str(world_b.application.id),
            )
        assert exc.value.code == "AMENDMENT_NOT_FOUND"
        assert ApplicationAmendment.objects.get(id=amendment.id).status == "pending"


# ---------------------------------------------------------------------------
# 7. The service is the one authority (R6.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTheServiceIsTheOneAuthority:
    """The view delegates; the query logic lives in one place.

    **Validates: Requirements R6.6**
    """

    def test_the_view_holds_no_query_logic(self):
        import inspect

        from apps.catalog.admin_views import AdminInstitutionAuditView

        source = inspect.getsource(AdminInstitutionAuditView)
        assert "AuditLog.objects" not in source, "the view queries audit_logs directly"
        assert "TenantAuditQueryService" in source

    def test_the_feed_matches_on_the_institution_not_the_actor(self, two_tenant_worlds):
        """The generic endpoint's question was "who do you share a school with".

        A platform operator's change to a school must appear in *that school's*
        feed even though they are not a member of it — which an actor-scoped
        filter cannot do.
        """
        world_a, _world_b = two_tenant_worlds
        super_admin = build_profile(role="super_admin")
        TenantAuditService.record_event(
            action="tenant.institution.updated",
            entity_type="institution",
            entity_id=world_a.institution.id,
            actor_id=super_admin.id,
            institution_id=world_a.institution.id,
            metadata={"object_type": "institution"},
        )
        response = _client_for(world_a.staff).get(audit_url(world_a.institution_id))
        actors = {row["actor_id"] for row in response.json()["data"]["results"]}
        assert str(super_admin.id) in actors

    def test_the_export_columns_are_declared_once(self):
        service = TenantAuditQueryService()
        assert service.export_columns() == TenantAuditQueryService.EXPORT_COLUMNS
        assert "changes" in service.export_columns()

    def test_the_export_ceiling_is_the_platforms_one_limit(self):
        from apps.catalog.tenant_audit_query_service import (
            EXPORT_ROW_LIMIT as AUDIT_LIMIT,
        )
        from apps.documents.settlement_service import EXPORT_ROW_LIMIT

        assert AUDIT_LIMIT == EXPORT_ROW_LIMIT
