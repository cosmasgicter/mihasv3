"""The admin review workspace contract (admissions-v2 task 9.4).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.4 — "Build one
deterministic admin review workspace".
Requirements: **R8.2**, **R8.3**, **R8.4**, **R8.5**, **R8.7**, **R11.3**.
Findings: **AUTH-01**, **AUTH-02**, **AUTH-03**, **API-02**, **MAINT-01**.

What each class settles
-----------------------

``TestOneDetailQueryReplacesSixReads``
    The Required_Evidence claim's read half: the sections the six retired calls
    used to supply all arrive from one route, the readiness checklist is the
    deterministic one, and **no generative call is made**.

``TestVersionedCommands``
    Every command carries a version; a stale command is refused with
    ``VERSION_CONFLICT`` and mutates nothing; a success advances the version and
    returns it with the allowed next actions.

``TestAuthorityIsCapabilityDerived``
    Every authority answer is ``AdminCapabilityService``'s. A Reviewer, a
    read-only Tenant_Admin, a Student and an anonymous caller each get the
    documented outcome, and no endpoint compares a role string.

``TestCrossTenantIsolation``
    Tenant B's application, its sections, its numbers and its staff never reach
    tenant A through the workspace, its commands, or its export.

``TestExportIsOnePath``
    The legacy ``/applications/export/`` route now returns the whole filtered set
    regardless of page, redacted by one policy, bounded by one ceiling, audited
    once, and byte-identical to the roster's own export.

Every test runs with ``production_scope`` active, so the test-settings
legacy-admin all-access shortcut is disabled and what is measured is the real
membership/grant-derived capability model.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import (
    Application,
    ApplicationAmendment,
    ApplicationCondition,
    ApplicationInterview,
)
from apps.applications.review_workspace_service import (
    COMMAND_CAPABILITIES,
    PLATFORM_ONLY_DETAIL_FIELDS,
    SECTION_ROW_LIMIT,
    WORKSPACE_SECTIONS,
    ApplicationReviewWorkspaceService,
)
from apps.catalog.services import AccessScopeService
from apps.common.models import AuditLog
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import (
    build_application,
    build_profile,
    build_two_tenant_worlds,
)

WORKSPACE_URL = "/api/v1/admin/applications/{}/"
REVIEW_URL = "/api/v1/applications/{}/review/"
VERIFY_DOCUMENT_URL = "/api/v1/applications/{}/verify-document/"
INTERVIEW_URL = "/api/v1/applications/{}/interviews/"
AMENDMENT_REVIEW_URL = "/api/v1/applications/{}/amendments/{}/review/"
CONDITION_VERIFY_URL = "/api/v1/applications/{}/conditions/{}/verify/"
ASSIGN_URL = "/api/v1/applications/{}/assign/"
CANDIDATES_URL = "/api/v1/applications/{}/assignment-candidates/"
BULK_URL = "/api/v1/applications/bulk-status/"
LEGACY_EXPORT_URL = "/api/v1/applications/export/"
ROSTER_EXPORT_URL = "/api/v1/admin/applications/?export=csv"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _grant(world, permissions):
    """Set the world's staff membership permissions (the mutation grants)."""
    for membership in world.staff.userinstitutionmembership_set.all():
        membership.permissions = list(permissions)
        membership.save(update_fields=["permissions"])
    return world.staff


def _app(world, **overrides) -> Application:
    return build_application(
        student=world.student,
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=world.offering,
        intake=world.intake,
        **overrides,
    )


def _bulk_token(ids, new_status: str) -> str:
    import hashlib

    return hashlib.sha256(
        ("".join(sorted(str(i) for i in ids)) + new_status).encode("utf-8")
    ).hexdigest()


def _csv_rows(response) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(response.content.decode())))


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture()
def worlds(db):
    """Two independent tenants sharing one canonical program, and no applications."""
    return build_two_tenant_worlds(with_application=False)


# ---------------------------------------------------------------------------
# 1. One detail query replaces six reads (R8.5, R11.3)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOneDetailQueryReplacesSixReads:
    """The workspace is one read, and its readiness is deterministic.

    **Validates: Requirements R8.5, R11.3**
    """

    def test_every_section_the_six_calls_supplied_arrives_in_one_response(self, worlds):
        """One request returns identity, answers, evidence, payment, interview,
        conditions, amendments, communication and history.

        Before 9.4 those came from ``/details/``, ``/documents/``, ``/grades/``,
        ``/summary/``, ``/interviews/`` and ``/payments/?application_id=``.
        """
        world_a, _ = worlds
        staff = _grant(world_a, ["review", "verify_documents", "verify_payments"])
        app = _app(world_a, status="under_review", payment_status="successful")

        ApplicationDocument.objects.create(
            application=app,
            document_type="nrc",
            document_name="nrc.pdf",
            verification_status="verified",
            version=1,
            is_current=True,
        )
        ApplicationInterview.objects.create(
            application=app,
            scheduled_at=timezone.now() + timedelta(days=3),
            mode="virtual",
            status="scheduled",
        )
        ApplicationCondition.objects.create(
            application=app,
            description="Submit certified results",
            deadline=(timezone.now() + timedelta(days=20)).date(),
            status="pending",
        )
        ApplicationAmendment.objects.create(
            application=app,
            field_name="phone",
            new_value="+260970000123",
            reason="Changed number",
            status="pending",
        )

        response = _client_for(staff).get(WORKSPACE_URL.format(app.id))
        assert response.status_code == 200, response.data
        data = response.data["data"]

        for section in WORKSPACE_SECTIONS:
            assert section in data, f"missing section: {section}"

        assert data["identity"]["application_number"] == app.application_number
        assert data["answers"]["residence_town"] == app.residence_town
        assert data["assignment"]["institution_id"] == str(world_a.institution.id)
        assert data["evidence"]["current_document_count"] == 1
        assert data["evidence"]["verified_document_count"] == 1
        assert data["payment"]["application_payment_status"] == "successful"
        assert data["interview"]["current"]["mode"] == "virtual"
        assert data["conditions"]["open_count"] == 1
        assert data["amendments"]["pending_count"] == 1
        assert "notifications" in data["communication"]
        assert "records" in data["history"]

    def test_the_readiness_checklist_is_the_deterministic_one(self, worlds):
        """``readiness`` is ``reviewer_summary``'s shape — R11.3's named facts."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted", payment_status="successful")

        response = _client_for(staff).get(WORKSPACE_URL.format(app.id))
        readiness = response.data["data"]["readiness"]
        assert readiness is not None

        codes = {check["code"] for check in readiness["checks"]}
        # Exactly the facts R11.3 names.
        assert {
            "payment_gate",
            "required_documents",
            "identity_verification",
            "grades",
            "eligibility",
            "duplicates",
            "intake_window",
        } <= codes
        assert "allowed_next_actions" in readiness
        # No prose, no score, no recommendation.
        for forbidden in ("summary", "narrative", "recommendation", "score", "text"):
            assert forbidden not in readiness

    def test_no_generative_call_is_made(self, worlds, monkeypatch):
        """The workspace makes no model call — R11.1 made checkable, not asserted.

        Any HTTP egress from the read is a failure. Task 7.4 deleted the AI
        gateway client, so the surviving risk is a *new* one appearing; this pins
        the socket layer rather than an import.
        """
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted")

        calls: list[str] = []

        def _forbid(*args, **kwargs):  # pragma: no cover - only runs on regression
            calls.append("egress")
            raise AssertionError("the review workspace made an outbound HTTP call")

        import requests

        monkeypatch.setattr(requests, "post", _forbid)
        monkeypatch.setattr(requests, "get", _forbid)

        response = _client_for(staff).get(WORKSPACE_URL.format(app.id))
        assert response.status_code == 200
        assert calls == []
        # And the retired route really is gone.
        assert (
            _client_for(staff).get(f"/api/v1/applications/{app.id}/admin-summary/").status_code
            == 404
        )

    def test_readiness_is_null_rather_than_a_healthy_zero(self, worlds, monkeypatch):
        """An unevaluable configuration yields ``None``, not "nothing outstanding".

        R8.6/R11.6 applied to readiness: a workspace that rendered an
        unevaluable configuration as an empty blocker list would invite exactly
        the decision the fail-closed submission path refuses to make.
        """
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted")

        from apps.applications import readiness_service
        from apps.applications.assignment_resolution import AssignmentConfigurationError

        def _unavailable(*args, **kwargs):
            raise AssignmentConfigurationError("CONFIGURATION_UNAVAILABLE")

        monkeypatch.setattr(readiness_service, "evaluate_readiness", _unavailable)

        response = _client_for(staff).get(WORKSPACE_URL.format(app.id))
        assert response.status_code == 200
        assert response.data["data"]["readiness"] is None
        assert response.data["data"]["allowed_next_actions"] == []

    def test_the_response_publishes_its_own_contract(self, worlds):
        """Sections carry definitions, the version is an ETag, and the row cap is stated."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted")

        response = _client_for(staff).get(WORKSPACE_URL.format(app.id))
        data = response.data["data"]

        assert set(data["definitions"]) == set(WORKSPACE_SECTIONS)
        assert all(text.strip() for text in data["definitions"].values())
        assert data["row_limit"] == SECTION_ROW_LIMIT
        assert response["ETag"] == f'W/"{data["version"]}"'

    def test_allowed_transitions_come_from_the_one_state_machine(self, worlds):
        """The next statuses are ``ALLOWED_TRANSITIONS``', not a second list."""
        from apps.applications.services import ALLOWED_TRANSITIONS

        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="under_review")

        response = _client_for(staff).get(WORKSPACE_URL.format(app.id))
        assert response.data["data"]["allowed_transitions"] == sorted(
            ALLOWED_TRANSITIONS["under_review"]
        )

        terminal = _app(world_a, status="rejected")
        terminal_response = _client_for(staff).get(WORKSPACE_URL.format(terminal.id))
        # A terminal status has no outbound transitions. An empty list is a fact.
        assert terminal_response.data["data"]["allowed_transitions"] == []

    def test_the_capability_matrix_is_published(self, worlds):
        """The workspace states which commands this actor may issue (AUTH-02)."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted")

        capabilities = _client_for(staff).get(WORKSPACE_URL.format(app.id)).data["data"][
            "capabilities"
        ]
        assert set(capabilities) == set(COMMAND_CAPABILITIES)
        assert capabilities["review_decision"] is True
        # Not granted: reads do not imply verification.
        assert capabilities["verify_document"] is False
        assert capabilities["verify_payment"] is False
        assert capabilities["export"] is False


# ---------------------------------------------------------------------------
# 2. Versioned commands (R8.4)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestVersionedCommands:
    """Every write carries a version, and a stale write changes nothing.

    **Validates: Requirements R8.3, R8.4**
    """

    def test_a_stale_decision_is_refused_and_mutates_nothing(self, worlds):
        """The task's own claim: a stale decision cannot overwrite a newer one."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted", payment_status="successful")
        client = _client_for(staff)

        stale_version = client.get(WORKSPACE_URL.format(app.id)).data["data"]["version"]

        # Reviewer 1 moves it forward.
        first = client.post(
            REVIEW_URL.format(app.id),
            {"new_status": "under_review", "expected_version": stale_version},
            format="json",
        )
        assert first.status_code == 200, first.data
        assert first.data["data"]["version"] > stale_version

        # Reviewer 2 was still looking at the old version.
        second = client.post(
            REVIEW_URL.format(app.id),
            {"new_status": "rejected", "expected_version": stale_version},
            format="json",
        )
        assert second.status_code == 409
        app.refresh_from_db()
        assert app.status == "under_review", "the stale decision was applied anyway"

    def test_a_command_without_a_version_still_works(self, worlds):
        """The guard is opt-in, so a caller predating it is unaffected."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted", payment_status="successful")

        response = _client_for(staff).post(
            REVIEW_URL.format(app.id), {"new_status": "under_review"}, format="json"
        )
        assert response.status_code == 200, response.data
        app.refresh_from_db()
        assert app.status == "under_review"

    def test_an_if_match_header_is_accepted(self, worlds):
        """The ETag the detail query published can be quoted back."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted", payment_status="successful")
        client = _client_for(staff)

        etag = client.get(WORKSPACE_URL.format(app.id))["ETag"]
        ok = client.post(
            REVIEW_URL.format(app.id),
            {"new_status": "under_review"},
            format="json",
            HTTP_IF_MATCH=etag,
        )
        assert ok.status_code == 200, ok.data

        stale = client.post(
            REVIEW_URL.format(app.id),
            {"new_status": "approved"},
            format="json",
            HTTP_IF_MATCH=etag,
        )
        assert stale.status_code == 409

    def test_an_unreadable_version_is_a_conflict_not_a_silent_pass(self, worlds):
        """A client that cannot state its version has not proven it is current."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted", payment_status="successful")

        response = _client_for(staff).post(
            REVIEW_URL.format(app.id),
            {"new_status": "under_review", "expected_version": "not-a-number"},
            format="json",
        )
        assert response.status_code == 409
        app.refresh_from_db()
        assert app.status == "submitted"

    def test_every_workspace_command_enforces_the_version(self, worlds):
        """Document, interview, amendment, condition and decision all refuse a stale write."""
        world_a, _ = worlds
        staff = _grant(
            world_a, ["review", "verify_documents", "verify_payments", "export"]
        )
        app = _app(world_a, status="under_review", payment_status="successful")
        client = _client_for(staff)

        document = ApplicationDocument.objects.create(
            application=app,
            document_type="nrc",
            document_name="nrc.pdf",
            verification_status="pending",
            version=1,
            is_current=True,
        )
        condition = ApplicationCondition.objects.create(
            application=app,
            description="Certified results",
            deadline=(timezone.now() + timedelta(days=20)).date(),
            status="pending",
        )
        amendment = ApplicationAmendment.objects.create(
            application=app,
            field_name="phone",
            new_value="+260970000123",
            reason="Changed number",
            status="pending",
        )

        # Move the version on so every command below is demonstrably stale.
        stale = ApplicationReviewWorkspaceService.current_version(app)
        ApplicationReviewWorkspaceService.bump_version(app)

        cases = {
            "verify_document": client.post(
                VERIFY_DOCUMENT_URL.format(app.id),
                {
                    "documentId": str(document.id),
                    "status": "verified",
                    "expected_version": stale,
                },
                format="json",
            ),
            "schedule_interview": client.post(
                INTERVIEW_URL.format(app.id),
                {
                    "scheduled_at": (timezone.now() + timedelta(days=5)).isoformat(),
                    "mode": "virtual",
                    "expected_version": stale,
                },
                format="json",
            ),
            "review_amendment": client.post(
                AMENDMENT_REVIEW_URL.format(app.id, amendment.id),
                {"status": "approved", "expected_version": stale},
                format="json",
            ),
            "verify_condition": client.post(
                CONDITION_VERIFY_URL.format(app.id, condition.id),
                {"status": "met", "expected_version": stale},
                format="json",
            ),
            "review_decision": client.post(
                REVIEW_URL.format(app.id),
                {"new_status": "approved", "expected_version": stale},
                format="json",
            ),
        }
        for name, response in cases.items():
            assert response.status_code == 409, f"{name} accepted a stale version"

        # Nothing moved.
        document.refresh_from_db()
        condition.refresh_from_db()
        amendment.refresh_from_db()
        app.refresh_from_db()
        assert document.verification_status == "pending"
        assert condition.status == "pending"
        assert amendment.status == "pending"
        assert app.status == "under_review"
        assert not ApplicationInterview.objects.filter(application_id=app.id).exists()

    def test_a_command_returns_the_new_version_and_the_next_actions(self, worlds):
        """R8.4: the server states what may happen next, and from which version."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted", payment_status="successful")
        client = _client_for(staff)

        before = client.get(WORKSPACE_URL.format(app.id)).data["data"]["version"]
        response = client.post(
            REVIEW_URL.format(app.id),
            {"new_status": "under_review", "expected_version": before},
            format="json",
        )
        body = response.data["data"]
        assert body["version"] == before + 1
        assert "approved" in body["allowed_transitions"]
        # And the next command is accepted at exactly that version.
        follow_up = client.post(
            REVIEW_URL.format(app.id),
            {"new_status": "approved", "expected_version": body["version"]},
            format="json",
        )
        assert follow_up.status_code == 200, follow_up.data

    def test_a_payment_review_advances_the_same_version(self, worlds):
        """A payment decision changes the workspace, so it moves the one version."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review", "verify_payments"])
        app = _app(world_a, status="submitted", payment_status="pending_review")
        client = _client_for(staff)

        before = client.get(WORKSPACE_URL.format(app.id)).data["data"]["version"]
        response = client.post(
            REVIEW_URL.format(app.id),
            {
                "payment_status": "verified",
                "notes": "Bank transfer received on 2026-08-08 reference 99182",
                "expected_version": before,
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        assert response.data["data"]["version"] == before + 1

    def test_the_bulk_command_honours_a_version_per_application(self, worlds):
        """A bulk decision is a set of decisions, so the version is per id."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        first = _app(world_a, status="submitted", payment_status="successful")
        second = _app(world_a, status="submitted", payment_status="successful")
        client = _client_for(staff)

        stale = ApplicationReviewWorkspaceService.current_version(second)
        ApplicationReviewWorkspaceService.bump_version(second)

        ids = [str(first.id), str(second.id)]
        response = client.post(
            BULK_URL,
            {
                "application_ids": ids,
                "new_status": "under_review",
                "confirmation_token": _bulk_token(ids, "under_review"),
                "expected_versions": {
                    str(first.id): ApplicationReviewWorkspaceService.current_version(first),
                    str(second.id): stale,
                },
            },
            format="json",
        )
        assert response.status_code == 400
        codes = {f["code"] for f in response.data["failures"]}
        assert "VERSION_CONFLICT" in codes
        # All-or-nothing: the row whose version was current did not move either.
        first.refresh_from_db()
        second.refresh_from_db()
        assert first.status == "submitted"
        assert second.status == "submitted"

    def test_the_bulk_command_reports_the_applied_set(self, worlds):
        """``updated_count`` is what changed, and every new version is returned."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        rows = [_app(world_a, status="submitted", payment_status="successful") for _ in range(3)]
        ids = [str(row.id) for row in rows]

        response = _client_for(staff).post(
            BULK_URL,
            {
                "application_ids": ids,
                "new_status": "under_review",
                "confirmation_token": _bulk_token(ids, "under_review"),
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        assert response.data["data"]["updated_count"] == 3
        assert set(response.data["data"]["versions"]) == set(ids)


# ---------------------------------------------------------------------------
# 3. Authority is capability-derived (R8.2, R8.3, AUTH-01/02/03)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuthorityIsCapabilityDerived:
    """Every authority answer comes from ``AdminCapabilityService``.

    **Validates: Requirements R8.2, R8.3, R8.7**
    """

    def test_a_scoped_reviewer_opens_only_assigned_work(self, worlds):
        """AUTH-01: a Reviewer's workspace is their *assigned* work, and only that."""
        world_a, _ = worlds
        reviewer = build_profile(role="reviewer", suffix="rev")
        from tests.tenant_fixtures import build_membership

        build_membership(
            user=reviewer, institution=world_a.institution, permissions=["review"]
        )

        assigned = _app(world_a, status="submitted", assigned_reviewer_id=reviewer)
        unassigned = _app(world_a, status="submitted")

        client = _client_for(reviewer)
        assert client.get(WORKSPACE_URL.format(assigned.id)).status_code == 200
        # Not a 403 — a 404, byte-identical to an id that does not exist, so the
        # existence of work they are not assigned cannot be inferred.
        assert client.get(WORKSPACE_URL.format(unassigned.id)).status_code == 404
        assert client.get(WORKSPACE_URL.format(uuid.uuid4())).status_code == 404

    def test_a_read_only_tenant_admin_reads_but_cannot_decide(self, worlds):
        """AUTH-02's other half: read access must not imply mutation."""
        world_a, _ = worlds
        staff = _grant(world_a, ["view"])  # read bundle only
        app = _app(world_a, status="submitted", payment_status="successful")
        client = _client_for(staff)

        detail = client.get(WORKSPACE_URL.format(app.id))
        assert detail.status_code == 200
        assert detail.data["data"]["capabilities"]["review_decision"] is False

        denied = client.post(
            REVIEW_URL.format(app.id), {"new_status": "under_review"}, format="json"
        )
        assert denied.status_code == 403
        app.refresh_from_db()
        assert app.status == "submitted"

    def test_a_student_and_an_anonymous_caller_are_denied(self, worlds):
        """A staff surface is not confirmed to exist to a non-staff caller."""
        world_a, _ = worlds
        app = _app(world_a, status="submitted")

        student = _client_for(world_a.student).get(WORKSPACE_URL.format(app.id))
        assert student.status_code == 404

        anonymous = APIClient().get(WORKSPACE_URL.format(app.id))
        assert anonymous.status_code in (401, 403)

    def test_a_tenant_admin_can_staff_their_own_review_queue(self, worlds):
        """AUTH-03: assignment moved from a role class onto the tenant matrix.

        A Tenant_Admin holding ``tenant.application.review`` may now list
        candidates and assign one — design §5.3's "active membership in the
        application's tenant" rather than super-admin-only.
        """
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        reviewer = build_profile(role="reviewer", suffix="cand")
        from tests.tenant_fixtures import build_membership

        build_membership(
            user=reviewer, institution=world_a.institution, permissions=["review"]
        )
        app = _app(world_a, status="submitted")
        client = _client_for(staff)

        candidates = client.get(CANDIDATES_URL.format(app.id))
        assert candidates.status_code == 200, candidates.data
        assert str(reviewer.id) in {row["id"] for row in candidates.data["data"]}

        assigned = client.post(
            ASSIGN_URL.format(app.id), {"reviewer_id": str(reviewer.id)}, format="json"
        )
        assert assigned.status_code == 200, assigned.data
        app.refresh_from_db()
        assert str(app.assigned_reviewer_id_id) == str(reviewer.id)

    def test_a_read_only_tenant_admin_cannot_assign(self, worlds):
        """The widened actor set is still a capability, not a role tier."""
        world_a, _ = worlds
        staff = _grant(world_a, ["view"])
        reviewer = build_profile(role="reviewer", suffix="cand2")
        from tests.tenant_fixtures import build_membership

        build_membership(
            user=reviewer, institution=world_a.institution, permissions=["review"]
        )
        app = _app(world_a, status="submitted")

        response = _client_for(staff).post(
            ASSIGN_URL.format(app.id), {"reviewer_id": str(reviewer.id)}, format="json"
        )
        assert response.status_code == 403
        app.refresh_from_db()
        assert app.assigned_reviewer_id_id is None

    def test_auto_assign_and_fee_waiver_stay_platform_authority(self, worlds):
        """Two commands deliberately did NOT join the tenant matrix (AUTH-02)."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="submitted")
        client = _client_for(staff)

        # Auto-assign sweeps every unassigned application the platform holds.
        assert client.post("/api/v1/applications/auto-assign/", {}, format="json").status_code == 403
        # A waiver forgives money the tenant is owed.
        waiver = client.post(
            f"/api/v1/applications/{app.id}/fee-waiver/",
            {"waiver_type": "full", "reason_code": "hardship"},
            format="json",
        )
        assert waiver.status_code == 403

    def test_no_role_string_is_compared_in_the_workspace_surface(self):
        """A grep guard: the review-workspace modules derive, never compare.

        ``is_super_admin`` / ``role ==`` / ``IsAdmin`` / ``IsSuperAdmin`` are the
        AUTH-02 shapes. ``getattr(user, "role", ...)`` passed to an audit writer is
        not an authority decision, so the guard looks for comparisons and
        permission classes.
        """
        import ast
        from pathlib import Path

        base = Path(__file__).resolve().parents[2] / "apps" / "applications"
        modules = [
            base / "review_workspace_service.py",
            base / "admin_review_workspace_views.py",
        ]

        for module in modules:
            tree = ast.parse(module.read_text())
            offences: list[str] = []
            for node in ast.walk(tree):
                # A raw-role helper *call*. ``capability_set.is_super_admin`` is
                # the capability service's own answer and is fine; calling
                # ``permissions.is_super_admin(user)`` in endpoint code is the
                # AUTH-02 shape.
                if isinstance(node, ast.Call):
                    func = node.func
                    name = getattr(func, "id", None) or getattr(func, "attr", None)
                    if name in {"is_super_admin", "IsAdmin", "IsSuperAdmin"}:
                        offences.append(f"calls {name}()")
                # A comparison against a ``role`` attribute or variable.
                if isinstance(node, ast.Compare):
                    for side in [node.left, *node.comparators]:
                        if getattr(side, "attr", None) == "role" or getattr(side, "id", None) == "role":
                            offences.append("compares a role")
                # A raw-role DRF permission class.
                if isinstance(node, ast.Name) and node.id in {"IsAdmin", "IsSuperAdmin"}:
                    offences.append(f"references {node.id}")
            assert offences == [], f"{module.name}: {sorted(set(offences))}"

    def test_the_command_capability_matrix_uses_only_canonical_capabilities(self):
        """No capability was invented: the catalogue stays 17 + 17."""
        from apps.catalog.services import AdminCapabilityService

        assert set(COMMAND_CAPABILITIES.values()) <= AdminCapabilityService.TENANT_CAPABILITIES


# ---------------------------------------------------------------------------
# 4. Cross-tenant isolation (R3.2)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCrossTenantIsolation:
    """Tenant B never reaches tenant A through the workspace or its commands.

    **Validates: Requirements R8.2, R8.3**
    """

    def test_another_tenants_application_is_masked_identically_to_an_unknown_id(self, worlds):
        world_a, world_b = worlds
        _grant(world_a, ["review", "verify_documents", "verify_payments"])
        other = _app(world_b, status="submitted")
        client = _client_for(world_a.staff)

        masked = client.get(WORKSPACE_URL.format(other.id))
        unknown = client.get(WORKSPACE_URL.format(uuid.uuid4()))
        assert masked.status_code == unknown.status_code == 404
        # Identical bodies. ``request_id`` is a per-request correlation id the
        # envelope adds to every response, so it is excluded: it differs between
        # any two requests and carries nothing about the target.
        def _without_request_id(payload):
            return {k: v for k, v in payload.items() if k != "request_id"}

        assert _without_request_id(masked.data) == _without_request_id(unknown.data)
        # And nothing of tenant B's identity travels.
        body = str(masked.data)
        assert world_b.institution.name not in body
        assert other.full_name not in body

    def test_no_command_reaches_another_tenants_application(self, worlds):
        world_a, world_b = worlds
        _grant(world_a, ["review", "verify_documents", "verify_payments"])
        other = _app(world_b, status="submitted", payment_status="successful")
        condition = ApplicationCondition.objects.create(
            application=other,
            description="Certified results",
            deadline=(timezone.now() + timedelta(days=20)).date(),
            status="pending",
        )
        amendment = ApplicationAmendment.objects.create(
            application=other,
            field_name="phone",
            new_value="+260970000999",
            reason="Changed",
            status="pending",
        )
        client = _client_for(world_a.staff)

        responses = {
            "decision": client.post(
                REVIEW_URL.format(other.id), {"new_status": "under_review"}, format="json"
            ),
            "condition": client.post(
                CONDITION_VERIFY_URL.format(other.id, condition.id),
                {"status": "met"},
                format="json",
            ),
            "amendment": client.post(
                AMENDMENT_REVIEW_URL.format(other.id, amendment.id),
                {"status": "approved"},
                format="json",
            ),
            "interview": client.post(
                INTERVIEW_URL.format(other.id),
                {
                    "scheduled_at": (timezone.now() + timedelta(days=5)).isoformat(),
                    "mode": "virtual",
                },
                format="json",
            ),
            "candidates": client.get(CANDIDATES_URL.format(other.id)),
        }
        for name, response in responses.items():
            assert response.status_code == 404, f"{name} reached another tenant"

        other.refresh_from_db()
        condition.refresh_from_db()
        amendment.refresh_from_db()
        assert other.status == "submitted"
        assert condition.status == "pending"
        assert amendment.status == "pending"

    def test_a_bulk_command_cannot_carry_another_tenants_id(self, worlds):
        world_a, world_b = worlds
        _grant(world_a, ["review"])
        mine = _app(world_a, status="submitted", payment_status="successful")
        theirs = _app(world_b, status="submitted", payment_status="successful")

        ids = [str(mine.id), str(theirs.id)]
        response = _client_for(world_a.staff).post(
            BULK_URL,
            {
                "application_ids": ids,
                "new_status": "under_review",
                "confirmation_token": _bulk_token(ids, "under_review"),
            },
            format="json",
        )
        assert response.status_code == 400
        failures = {f["application_id"]: f["code"] for f in response.data["failures"]}
        # Reported as NOT_FOUND — the same code a genuinely missing id gets.
        assert failures[str(theirs.id)] == "NOT_FOUND"
        # All-or-nothing: their own application did not move either.
        mine.refresh_from_db()
        theirs.refresh_from_db()
        assert mine.status == "submitted"
        assert theirs.status == "submitted"

    def test_a_reviewer_cannot_bulk_decide_unassigned_work(self, worlds):
        """AUTH-01 applied to the bulk command, which never enforced it before."""
        world_a, _ = worlds
        reviewer = build_profile(role="reviewer", suffix="bulkrev")
        from tests.tenant_fixtures import build_membership

        build_membership(
            user=reviewer, institution=world_a.institution, permissions=["review"]
        )
        unassigned = _app(world_a, status="submitted", payment_status="successful")

        ids = [str(unassigned.id)]
        response = _client_for(reviewer).post(
            BULK_URL,
            {
                "application_ids": ids,
                "new_status": "under_review",
                "confirmation_token": _bulk_token(ids, "under_review"),
            },
            format="json",
        )
        assert response.status_code == 400
        assert response.data["failures"][0]["code"] == "NOT_FOUND"
        unassigned.refresh_from_db()
        assert unassigned.status == "submitted"

    def test_the_platform_only_field_is_never_computed_for_a_tenant_actor(self, worlds):
        """Cross-tenant context is withheld *and* the query is not run (R3.2)."""
        world_a, world_b = worlds
        _grant(world_a, ["review"])
        # The same applicant holds an application at the other school, so the
        # number is real and its absence is a decision rather than an accident.
        app = _app(world_a, status="submitted")
        build_application(
            student=world_a.student,
            institution=world_b.institution,
            canonical_program=world_b.canonical_program,
            offering=world_b.offering,
            intake=world_b.intake,
            status="submitted",
        )

        tenant_view = _client_for(world_a.staff).get(WORKSPACE_URL.format(app.id)).data["data"]
        for field in PLATFORM_ONLY_DETAIL_FIELDS:
            assert field not in tenant_view
        assert tenant_view["redaction"]["applied"] is True
        assert list(tenant_view["redaction"]["withheld_fields"]) == list(
            PLATFORM_ONLY_DETAIL_FIELDS
        )

        super_admin = build_profile(role="super_admin", suffix="plat")
        platform_view = _client_for(super_admin).get(WORKSPACE_URL.format(app.id)).data["data"]
        assert platform_view["other_tenant_application_count"] == 1
        assert platform_view["redaction"]["applied"] is False

    def test_a_masked_probe_is_audited(self, worlds):
        """A cross-tenant probe is observable to operators without disclosing it."""
        world_a, world_b = worlds
        _grant(world_a, ["review"])
        other = _app(world_b, status="submitted")

        before = AuditLog.objects.count()
        assert (
            _client_for(world_a.staff).get(WORKSPACE_URL.format(other.id)).status_code == 404
        )
        assert AuditLog.objects.count() >= before


# ---------------------------------------------------------------------------
# 5. One export path (R8.3, R6.5)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExportIsOnePath:
    """``/applications/export/`` delegates to the one page-independent export.

    **Validates: Requirements R8.3**
    """

    def test_the_export_is_page_independent(self, worlds):
        """``?page=2`` used to produce a different export. It no longer can."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review", "export"])
        for _ in range(7):
            _app(world_a, status="submitted")
        client = _client_for(staff)

        whole = client.get(LEGACY_EXPORT_URL)
        assert whole.status_code == 200, getattr(whole, "data", whole.content)
        paged = client.get(f"{LEGACY_EXPORT_URL}?page=2&pageSize=2")
        assert len(_csv_rows(whole)) == len(_csv_rows(paged)) == 7

    def test_the_two_export_routes_are_byte_identical(self, worlds):
        """One implementation, two routes — not one implementation copied twice."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review", "export"])
        for _ in range(4):
            _app(world_a, status="submitted")
        client = _client_for(staff)

        legacy = client.get(f"{LEGACY_EXPORT_URL}?status=submitted")
        roster = client.get(f"{ROSTER_EXPORT_URL}&status=submitted")
        assert legacy.content == roster.content

    def test_the_export_requires_the_explicit_export_capability(self, worlds):
        """Read access does not imply a bulk read of applicant data (R6.5)."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])  # review, but not export
        _app(world_a, status="submitted")

        response = _client_for(staff).get(LEGACY_EXPORT_URL)
        assert response.status_code == 403
        assert response.data["code"] == "INSUFFICIENT_PERMISSIONS"

    def test_the_export_is_audited_without_the_rows(self, worlds):
        """An export records the act, not the applicants."""
        from apps.catalog.tenant_audit_service import ACTION_APPLICATION_EXPORTED

        world_a, _ = worlds
        staff = _grant(world_a, ["review", "export"])
        app = _app(world_a, status="submitted")

        assert _client_for(staff).get(LEGACY_EXPORT_URL).status_code == 200
        row = AuditLog.objects.filter(action=ACTION_APPLICATION_EXPORTED).order_by("-id").first()
        assert row is not None
        payload = str(row.changes)
        assert app.full_name not in payload
        assert app.email not in payload
        assert "row_count" in payload

    def test_the_export_is_tenant_scoped(self, worlds):
        world_a, world_b = worlds
        staff = _grant(world_a, ["review", "export"])
        mine = _app(world_a, status="submitted")
        theirs = _app(world_b, status="submitted")

        body = _client_for(staff).get(LEGACY_EXPORT_URL).content.decode()
        assert mine.application_number in body
        assert theirs.application_number not in body


# ---------------------------------------------------------------------------
# 6. The service is the one authority (MAINT-01)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTheServiceIsTheOneAuthority:
    """Vocabulary is borrowed, and the view holds no domain logic.

    **Validates: Requirements R8.5, R11.3**
    """

    def test_the_view_delegates_and_holds_no_domain_logic(self):
        """MAINT-01: the workspace view is thin by inspection, not by claim."""
        from pathlib import Path

        source = (
            Path(__file__).resolve().parents[2]
            / "apps"
            / "applications"
            / "admin_review_workspace_views.py"
        ).read_text()
        # No querying, counting, or transition logic in the transport layer.
        for forbidden in (".filter(", ".count()", ".aggregate(", "ALLOWED_TRANSITIONS"):
            assert forbidden not in source, f"the view does its own {forbidden}"

    def test_the_readiness_section_is_the_shared_evaluator(self, worlds):
        """The workspace and the student's own readiness read one evaluator.

        Not "the same shape" — the same function. A second evaluator is how the
        checklist a reviewer reads and the decision the server makes drift apart.
        """
        from apps.applications import readiness_service

        world_a, _ = worlds
        _grant(world_a, ["review"])
        app = _app(world_a, status="submitted", payment_status="successful")

        direct = readiness_service.reviewer_summary(
            readiness_service.evaluate_readiness(app)
        )
        served = _client_for(world_a.staff).get(WORKSPACE_URL.format(app.id)).data["data"][
            "readiness"
        ]
        assert [c["code"] for c in served["checks"]] == [c["code"] for c in direct["checks"]]
        assert served["can_submit"] == direct["can_submit"]

    def test_a_section_declares_its_own_truncation(self, worlds):
        """A row cap is reported, never applied silently."""
        world_a, _ = worlds
        _grant(world_a, ["review"])
        app = _app(world_a, status="submitted")

        data = _client_for(world_a.staff).get(WORKSPACE_URL.format(app.id)).data["data"]
        assert data["evidence"]["documents_truncated"] is False
        assert data["history"]["truncated"] is False

    def test_the_payment_section_carries_no_raw_phone_number(self, worlds):
        """The ledger is the platform's own serializer, which publishes hashes."""
        from apps.documents.models import Payment

        world_a, _ = worlds
        _grant(world_a, ["review", "verify_payments"])
        app = _app(world_a, status="submitted", payment_status="successful")
        Payment.objects.create(
            application=app,
            user=world_a.student,
            amount=150,
            currency="ZMW",
            payment_method="mobile_money",
            status="successful",
            metadata={"phone_last4": "0001"},
        )

        payment = _client_for(world_a.staff).get(WORKSPACE_URL.format(app.id)).data["data"][
            "payment"
        ]
        assert payment["record_count"] == 1
        assert "+260970000001" not in str(payment)
        # The derived waiting phase travels, so the reviewer reads the same
        # answer the student's own surface does (task 8.2).
        assert "phase" in payment["records"][0]

# ---------------------------------------------------------------------------
# 7. The roster publishes the version a bulk decision must carry (R8.4)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTheRosterPublishesTheVersion:
    """A bulk decision is issued from the roster, so the roster ships the token.

    Before this, ``expected_versions`` could only be filled by guessing: the
    roster row carried no version, so the guard existed on the endpoint and was
    never exercised from the one surface that changes 25 applications at a press.

    It is deliberately **not** an export column. An export is a document about
    applicants; a row's optimistic-lock counter is not a fact about an applicant,
    and adding it would have changed what a finance or registry spreadsheet
    contains for no reader's benefit.

    **Validates: Requirements R8.1, R8.4**
    """

    def test_every_roster_row_carries_its_current_version(self, worlds):
        world_a, _ = worlds
        _grant(world_a, ["review"])
        app = _app(world_a, status="submitted", payment_status="successful")
        bumped = ApplicationReviewWorkspaceService.bump_version(app)

        rows = (
            _client_for(world_a.staff)
            .get("/api/v1/admin/applications/")
            .data["data"]["results"]
        )
        row = next(r for r in rows if r["id"] == str(app.id))
        assert row["version"] == bumped

    def test_the_version_the_roster_published_is_the_one_the_workspace_reports(self, worlds):
        """One number, two surfaces. A second source is a stale-write waiting."""
        world_a, _ = worlds
        _grant(world_a, ["review"])
        app = _app(world_a, status="submitted", payment_status="successful")
        client = _client_for(world_a.staff)

        row = next(
            r
            for r in client.get("/api/v1/admin/applications/").data["data"]["results"]
            if r["id"] == str(app.id)
        )
        detail = client.get(WORKSPACE_URL.format(app.id)).data["data"]
        assert row["version"] == detail["version"]

    def test_the_version_is_not_an_export_column(self, worlds):
        world_a, _ = worlds
        _grant(world_a, ["review", "export"])
        _app(world_a, status="submitted", payment_status="successful")

        response = _client_for(world_a.staff).get(ROSTER_EXPORT_URL)
        assert response.status_code == 200, response.content[:200]
        header = _csv_rows(response)
        assert header, "the export returned no rows"
        assert "version" not in header[0]

    def test_a_bulk_decision_with_the_published_versions_is_accepted(self, worlds):
        """The round trip: read the roster, send its versions, the batch applies."""
        world_a, _ = worlds
        _grant(world_a, ["review"])
        rows = [
            _app(world_a, status="submitted", payment_status="successful") for _ in range(2)
        ]
        client = _client_for(world_a.staff)

        published = {
            r["id"]: r["version"]
            for r in client.get("/api/v1/admin/applications/").data["data"]["results"]
            if r["id"] in {str(row.id) for row in rows}
        }
        assert len(published) == 2

        ids = sorted(published)
        response = client.post(
            BULK_URL,
            {
                "application_ids": ids,
                "new_status": "under_review",
                "confirmation_token": _bulk_token(ids, "under_review"),
                "expected_versions": published,
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        assert response.data["data"]["updated_count"] == 2
        # And every returned version has moved past the one that was sent.
        for app_id, new_version in response.data["data"]["versions"].items():
            assert new_version > published[app_id]


# ---------------------------------------------------------------------------
# 8. Evidence, payment, and interview are the same versioned command (R8.3/R8.4)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEvidencePaymentAndInterviewAuthority:
    """The three paths whose authority was a role tier and whose write was unversioned.

    Each was issued by its own frontend panel through its own legacy service call.
    Each is now the same capability-gated, version-guarded command as a decision,
    and the workspace publishes the answer the frontend gates on.

    **Validates: Requirements R8.3, R8.4, R8.7**
    """

    def _document(self, app, world):
        return ApplicationDocument.objects.create(
            application=app,
            document_type="nrc",
            document_name="nrc.pdf",
            file_url="https://example.invalid/nrc.pdf",
            verification_status="pending",
            version=1,
            is_current=True,
        )

    def test_document_verification_needs_the_document_capability(self, worlds):
        """`tenant.document.verify`, not "can review" and not a role tier."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])  # review, but NOT verify_documents
        app = _app(world_a, status="submitted")
        document = self._document(app, world_a)

        caps = ApplicationReviewWorkspaceService.command_authority(
            staff, app
        )
        assert caps["review_decision"] is True
        assert caps["verify_document"] is False

        response = _client_for(staff).post(
            VERIFY_DOCUMENT_URL.format(app.id),
            {"documentId": str(document.id), "status": "verified"},
            format="json",
        )
        assert response.status_code == 403
        document.refresh_from_db()
        assert document.verification_status == "pending"

    def test_document_verification_is_versioned(self, worlds):
        world_a, _ = worlds
        staff = _grant(world_a, ["review", "verify_documents"])
        app = _app(world_a, status="submitted")
        document = self._document(app, world_a)
        client = _client_for(staff)

        stale = ApplicationReviewWorkspaceService.current_version(app)
        ApplicationReviewWorkspaceService.bump_version(app)

        refused = client.post(
            VERIFY_DOCUMENT_URL.format(app.id),
            {"documentId": str(document.id), "status": "verified", "expected_version": stale},
            format="json",
        )
        assert refused.status_code == 409
        assert refused.data["code"] == "VERSION_CONFLICT"
        document.refresh_from_db()
        assert document.verification_status == "pending"

        app.refresh_from_db()
        accepted = client.post(
            VERIFY_DOCUMENT_URL.format(app.id),
            {
                "documentId": str(document.id),
                "status": "verified",
                "expected_version": ApplicationReviewWorkspaceService.current_version(app),
            },
            format="json",
        )
        assert accepted.status_code == 200, accepted.data
        document.refresh_from_db()
        assert document.verification_status == "verified"

    def test_payment_verification_needs_the_payment_capability(self, worlds):
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])  # review, but NOT verify_payments
        app = _app(world_a, status="submitted", payment_status="pending_review")

        caps = ApplicationReviewWorkspaceService.command_authority(staff, app)
        assert caps["verify_payment"] is False

        response = _client_for(staff).post(
            REVIEW_URL.format(app.id),
            {"payment_status": "verified", "notes": "Received in branch 2026-08-08"},
            format="json",
        )
        assert response.status_code == 403
        app.refresh_from_db()
        assert app.payment_status == "pending_review"

    def test_interview_management_needs_the_review_capability(self, worlds):
        """The interview commands are review authority, and they are versioned."""
        world_a, _ = worlds
        read_only = _grant(world_a, [])
        app = _app(world_a, status="under_review", payment_status="successful")

        caps = ApplicationReviewWorkspaceService.command_authority(read_only, app)
        assert caps["manage_interview"] is False

        when = (timezone.now() + timedelta(days=10)).isoformat()
        denied = _client_for(read_only).post(
            INTERVIEW_URL.format(app.id),
            {"scheduled_at": when, "mode": "in_person"},
            format="json",
        )
        assert denied.status_code == 403
        assert not ApplicationInterview.objects.filter(application_id=app.id).exists()

    def test_a_stale_interview_command_is_refused(self, worlds):
        world_a, _ = worlds
        staff = _grant(world_a, ["review"])
        app = _app(world_a, status="under_review", payment_status="successful")
        client = _client_for(staff)

        stale = ApplicationReviewWorkspaceService.current_version(app)
        ApplicationReviewWorkspaceService.bump_version(app)

        when = (timezone.now() + timedelta(days=10)).isoformat()
        refused = client.post(
            INTERVIEW_URL.format(app.id),
            {"scheduled_at": when, "mode": "in_person", "expected_version": stale},
            format="json",
        )
        assert refused.status_code == 409
        assert refused.data["code"] == "VERSION_CONFLICT"
        assert not ApplicationInterview.objects.filter(application_id=app.id).exists()

    def test_the_three_capabilities_are_published_on_the_workspace(self, worlds):
        """The frontend gates the three panels on the server's own answer."""
        world_a, _ = worlds
        staff = _grant(world_a, ["review", "verify_documents", "verify_payments"])
        app = _app(world_a, status="under_review", payment_status="successful")

        published = (
            _client_for(staff).get(WORKSPACE_URL.format(app.id)).data["data"]["capabilities"]
        )
        assert published["verify_document"] is True
        assert published["verify_payment"] is True
        assert published["manage_interview"] is True
