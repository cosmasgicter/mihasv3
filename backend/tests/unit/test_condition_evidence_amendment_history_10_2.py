"""Condition evidence + amendment history (task 10.2).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 10.2 —
              "Implement condition evidence and amendment history". This file is
              the endpoint/service half of the task's ``_Evidence:`` line:
              *condition rejection/replacement and amendment approve/reject
              journeys* (the browser half is
              ``apps/admissions/tests/harness-e2e/required/condition-evidence-amendment-history.spec.ts``).
Requirements: **R13.2** (the condition read publishes precise dates and actors),
              **R13.3-R13.4** (every condition message goes through the one
              delivery gate and lands in the durable communications history),
              **R13.9** (per-condition evidence / comment / replacement / review /
              rejection reason / reminders / history), **R13.10** (owner-scoped
              amendment list + detail, and no second pending request for the same
              field).
Findings:     **STU-16** (conditional offers were read-only for students),
              **STU-17** (amendments could be submitted but not listed or
              tracked, and duplicate pending field changes were not prevented),
              **AUTH-06** (the recipient scope this task reuses rather than
              re-implements).

The claims this file makes
--------------------------
1. A condition moves ``pending -> evidence_submitted -> {met | changes_required}``
   and ``changes_required -> evidence_submitted`` (design §11.2), the transition
   is asserted against the row **as re-read under the lock**, and a terminal
   condition takes no further command.
2. Evidence is an **immutable version** in task 7.3's pipeline: a replacement
   supersedes rather than overwrites, the per-condition ``document_type`` makes
   the database's one-current index mean one current evidence version per
   condition, and the student's comment and the reviewer's reason are appended to
   the history rather than replacing each other.
3. ``changes_required`` and ``waived`` **cannot** be issued without a reason, and
   the reason the student reads is the reason the reviewer gave.
4. Authority: the student path is owner-only with a masked 404, and the review
   path resolves ``tenant.application.review`` through ``AdminCapabilityService``
   with scope before lookup — so another tenant's condition id is
   indistinguishable from one that does not exist.
5. A student can list and read **their own** amendments, in the registered
   envelope, and cannot read anyone else's.
6. A second pending amendment for the **same field** is refused (409) naming the
   request in flight, while ``MAX_PENDING_AMENDMENTS`` stays 3 and unrelated
   fields are unaffected.
7. Every condition message goes through 10.1's ``deliver_message`` with a
   published category — a student outcome may use email, a staff work item is
   inbox-only — and the reminder is idempotent per window.

Every test runs with ``production_scope`` active, so the test-settings
legacy-admin all-access shortcut is disabled and what is measured is the real
membership/grant-derived capability model.
"""

from __future__ import annotations

import ast
import inspect
import io
import pathlib
import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications import condition_evidence_service as conditions
from apps.applications.amendment_service import (
    AMENDMENT_STATUS_DEFINITIONS,
    AmendmentError,
    AmendmentService,
    MAX_PENDING_AMENDMENTS,
)
from apps.applications.condition_manager import ConditionManager
from apps.applications.models import ApplicationAmendment, ApplicationCondition
from apps.catalog.services import AccessScopeService
from apps.common.models import AuditLog, Notification
from apps.documents.models import ApplicationDocument, DocumentVerificationEvent
from tests.tenant_fixtures import build_membership, build_profile

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03"
    b"\x01\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82"
)


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


def _upload(name: str = "transcript.png"):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, PNG_BYTES, content_type="image/png")


def conditions_url(application_id) -> str:
    return f"/api/v1/applications/{application_id}/conditions/"


def condition_url(application_id, condition_id) -> str:
    return f"/api/v1/applications/{application_id}/conditions/{condition_id}/"


def evidence_url(application_id, condition_id) -> str:
    return f"/api/v1/applications/{application_id}/conditions/{condition_id}/evidence/"


def review_url(application_id, condition_id) -> str:
    return f"/api/v1/applications/{application_id}/conditions/{condition_id}/review/"


def amendments_url(application_id) -> str:
    return f"/api/v1/applications/{application_id}/amendments/"


def amendment_url(application_id, amendment_id) -> str:
    return f"/api/v1/applications/{application_id}/amendments/{amendment_id}/"


def _condition(application, *, status=conditions.CONDITION_OPEN, days=30, **overrides):
    now = timezone.now()
    defaults = {
        "id": uuid.uuid4(),
        "application": application,
        "description": "Certified copy of your final transcript",
        "condition_type": "document",
        "deadline": (now + timedelta(days=days)).date(),
        "status": status,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return ApplicationCondition.objects.create(**defaults)


def _reviewer(institution, *, permissions=("read", "review")):
    """A staff member of ``institution`` holding an explicit permission bundle."""
    profile = build_profile(role="admin", suffix=f"rev-{uuid.uuid4().hex[:6]}")
    build_membership(
        user=profile, institution=institution, role="admin", permissions=list(permissions)
    )
    return profile


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture(autouse=True)
def local_object_storage(tmp_path, monkeypatch):
    """Substitute a **real** filesystem storage at the provider boundary.

    The whole point of routing condition evidence through task 7.3's command is
    that the object write and the metadata write are one recoverable command, and
    that the object is *verified* before the database calls it evidence. A
    ``MagicMock`` would answer every probe with a truthy mock and prove nothing —
    so the double here is Django's own ``FileSystemStorage``, which really writes
    the bytes and really answers ``exists`` / ``size`` / ``delete``. Only the
    provider (R2) is replaced; every step of the command runs.
    """
    from django.core.files.storage import FileSystemStorage

    def _storage():
        return FileSystemStorage(location=str(tmp_path), base_url="/media/")

    monkeypatch.setattr("apps.common.storage.MediaStorage", _storage)
    yield


# ---------------------------------------------------------------------------
# 1. The state machine (design §11.2)
# ---------------------------------------------------------------------------


class TestConditionStateMachine:
    """The transitions are a table, and the table is design §11.2.

    **Validates: Requirements R13.9**
    """

    def test_the_design_lifecycle_is_expressible(self):
        machine = conditions.ConditionStateMachine
        assert machine.can_transition(
            conditions.CONDITION_OPEN, conditions.CONDITION_EVIDENCE_SUBMITTED
        )
        assert machine.can_transition(
            conditions.CONDITION_EVIDENCE_SUBMITTED, conditions.CONDITION_VERIFIED
        )
        assert machine.can_transition(
            conditions.CONDITION_EVIDENCE_SUBMITTED, conditions.CONDITION_CHANGES_REQUIRED
        )
        assert machine.can_transition(
            conditions.CONDITION_CHANGES_REQUIRED, conditions.CONDITION_EVIDENCE_SUBMITTED
        )
        assert machine.can_transition(
            conditions.CONDITION_OPEN, conditions.CONDITION_WAIVED
        )
        assert machine.can_transition(
            conditions.CONDITION_EVIDENCE_SUBMITTED, conditions.CONDITION_WAIVED
        )

    def test_every_terminal_state_has_no_outbound_transition(self):
        for state in conditions.CONDITION_TERMINAL_STATES:
            assert conditions.ConditionStateMachine.ALLOWED_TRANSITIONS[state] == frozenset()

    def test_a_terminal_condition_is_a_conflict_not_a_validation_error(self):
        with pytest.raises(conditions.ConditionEvidenceError) as exc:
            conditions.ConditionStateMachine.assert_transition(
                conditions.CONDITION_VERIFIED, conditions.CONDITION_EVIDENCE_SUBMITTED
            )
        assert exc.value.code == "CONDITION_ALREADY_RESOLVED"
        assert exc.value.status_code == 409

    def test_expired_is_not_a_review_outcome(self):
        """A deadline is the sweep's verdict, never a reviewer's."""
        assert (
            conditions.CONDITION_EXPIRED
            not in conditions.ConditionStateMachine.REVIEW_OUTCOMES
        )

    def test_every_state_publishes_a_definition_and_who_it_waits_on(self):
        for state in conditions.CONDITION_STATES:
            definition = conditions.CONDITION_STATE_DEFINITIONS[state]
            assert definition["definition"].strip()
            assert definition["waiting_on"] in {"student", "school", "nobody"}
            assert definition["design_name"].strip()

    def test_the_vocabulary_covers_every_state(self):
        published = {entry["key"] for entry in conditions.condition_vocabulary()["states"]}
        assert published == set(conditions.CONDITION_STATES)

    def test_the_states_the_student_owes_are_the_ones_a_deadline_can_expire(self):
        assert conditions.CONDITION_STUDENT_OWED_STATES == frozenset(
            {conditions.CONDITION_OPEN, conditions.CONDITION_CHANGES_REQUIRED}
        )
        # The one the school owes is deliberately absent: auto-rejecting for the
        # school's own review queue would punish the applicant for a delay that is
        # not theirs.
        assert (
            conditions.CONDITION_EVIDENCE_SUBMITTED
            not in conditions.CONDITION_STUDENT_OWED_STATES
        )


# ---------------------------------------------------------------------------
# 2. Evidence identity and the one-current invariant
# ---------------------------------------------------------------------------


class TestEvidenceIdentity:
    """The per-condition document type is what makes one-current meaningful.

    **Validates: Requirements R13.9**
    """

    def test_the_document_type_carries_the_condition_id(self):
        condition_id = uuid.uuid4()
        document_type = conditions.evidence_document_type(condition_id)
        assert document_type == f"condition_evidence:{condition_id}"
        assert conditions.condition_id_from_document_type(document_type) == str(condition_id)

    def test_the_document_type_fits_the_stored_column(self):
        """``application_documents.document_type`` is varchar(100)."""
        field = ApplicationDocument._meta.get_field("document_type")
        assert len(conditions.evidence_document_type(uuid.uuid4())) <= field.max_length

    def test_a_non_condition_type_is_not_claimed(self):
        assert conditions.condition_id_from_document_type("result_slip") is None


# ---------------------------------------------------------------------------
# 3. The student command: submit, replace, and the rejection journey
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStudentEvidenceCommand:
    """Submit, be rejected with a reason, replace, be accepted.

    **Validates: Requirements R13.9**
    """

    def test_submitting_evidence_moves_the_condition_and_records_the_comment(
        self, tenant_world
    ):
        application = tenant_world.application
        condition = _condition(application)
        response = _client_for(tenant_world.student).post(
            evidence_url(application.id, condition.id),
            {"file": _upload(), "comment": "Certified copy from the registrar."},
            format="multipart",
        )
        assert response.status_code == 201, response.content
        data = response.json()["data"]
        assert data["status"] == conditions.CONDITION_EVIDENCE_SUBMITTED
        assert data["waiting_on"] == "school"
        assert data["evidence"]["version"] == 1
        assert data["evidence_versions"] == 1
        # The comment is on the history row for the version it describes.
        assert any(
            entry["comment"] == "Certified copy from the registrar."
            for entry in data["history"]
        )
        condition.refresh_from_db()
        assert condition.status == conditions.CONDITION_EVIDENCE_SUBMITTED

    def test_a_replacement_supersedes_and_keeps_the_first_version(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application)
        client = _client_for(tenant_world.student)
        client.post(
            evidence_url(application.id, condition.id),
            {"file": _upload("first.png")},
            format="multipart",
        )
        response = client.post(
            evidence_url(application.id, condition.id),
            {"file": _upload("second.png"), "comment": "Right page this time."},
            format="multipart",
        )
        assert response.status_code == 201, response.content
        data = response.json()["data"]
        assert data["evidence"]["version"] == 2
        assert data["evidence"]["document_name"].endswith("second.png")
        assert data["evidence_versions"] == 2
        assert len(data["superseded_evidence"]) == 1

        document_type = conditions.evidence_document_type(condition.id)
        rows = ApplicationDocument.objects.filter(
            application_id=application.id, document_type=document_type
        )
        # The database's own one-current invariant, per condition.
        assert rows.filter(is_current=True).count() == 1
        assert rows.count() == 2

    def test_the_rejection_and_replacement_journey(self, tenant_world):
        """The journey STU-16 named: rejected with a reason, then replaced."""
        application = tenant_world.application
        condition = _condition(application)
        student = _client_for(tenant_world.student)
        student.post(
            evidence_url(application.id, condition.id),
            {"file": _upload("wrong.png")},
            format="multipart",
        )

        reviewer = _client_for(_reviewer(tenant_world.institution))
        rejected = reviewer.post(
            review_url(application.id, condition.id),
            {
                "outcome": conditions.CONDITION_CHANGES_REQUIRED,
                "reason": "That is page 1 of 2 — please send the page with the official stamp.",
            },
            format="json",
        )
        assert rejected.status_code == 200, rejected.content
        body = rejected.json()["data"]
        assert body["status"] == conditions.CONDITION_CHANGES_REQUIRED
        assert body["waiting_on"] == "student"
        assert "official stamp" in body["review_reason"]

        # The student can read the reason on their own read, and is offered a
        # replacement rather than a dead end.
        own = student.get(condition_url(application.id, condition.id))
        assert own.status_code == 200
        own_data = own.json()["data"]
        assert "official stamp" in own_data["review_reason"]
        assert own_data["allowed_actions"] == ["submit_evidence"]

        replaced = student.post(
            evidence_url(application.id, condition.id),
            {"file": _upload("stamped.png"), "comment": "Stamped page attached."},
            format="multipart",
        )
        assert replaced.status_code == 201, replaced.content
        assert replaced.json()["data"]["status"] == conditions.CONDITION_EVIDENCE_SUBMITTED
        assert replaced.json()["data"]["evidence"]["version"] == 2

        accepted = reviewer.post(
            review_url(application.id, condition.id),
            {"outcome": conditions.CONDITION_VERIFIED},
            format="json",
        )
        assert accepted.status_code == 200, accepted.content
        condition.refresh_from_db()
        assert condition.status == conditions.CONDITION_VERIFIED
        assert condition.met_at is not None

        # Both decisions and both submissions survive in the append-only history.
        events = list(
            DocumentVerificationEvent.objects.filter(
                application_id=application.id
            ).values_list("event_type", flat=True)
        )
        assert events.count(conditions.EVENT_CONDITION_EVIDENCE_SUBMITTED) == 2
        assert events.count(conditions.EVENT_CONDITION_REVIEWED) == 2

    def test_a_terminal_condition_refuses_evidence_before_reading_the_file(
        self, tenant_world
    ):
        application = tenant_world.application
        condition = _condition(application, status=conditions.CONDITION_VERIFIED)
        response = _client_for(tenant_world.student).post(
            evidence_url(application.id, condition.id),
            {"file": _upload()},
            format="multipart",
        )
        assert response.status_code == 409
        assert response.json()["code"] == "CONDITION_ALREADY_RESOLVED"
        assert not ApplicationDocument.objects.filter(
            document_type=conditions.evidence_document_type(condition.id)
        ).exists()

    def test_a_file_the_platform_does_not_accept_is_refused_with_a_stable_code(
        self, tenant_world
    ):
        from django.core.files.uploadedfile import SimpleUploadedFile

        application = tenant_world.application
        condition = _condition(application)
        response = _client_for(tenant_world.student).post(
            evidence_url(application.id, condition.id),
            {
                "file": SimpleUploadedFile(
                    "evidence.svg", b"<svg/>", content_type="image/svg+xml"
                )
            },
            format="multipart",
        )
        assert response.status_code == 400
        assert response.json()["code"] == "UNSUPPORTED_MIME_TYPE"

    def test_a_replay_with_the_same_key_does_not_create_a_second_version(
        self, tenant_world
    ):
        application = tenant_world.application
        condition = _condition(application)
        client = _client_for(tenant_world.student)
        key = f"harness-{uuid.uuid4()}"
        first = client.post(
            evidence_url(application.id, condition.id),
            {"file": _upload("same.png")},
            format="multipart",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        assert first.status_code == 201
        second = client.post(
            evidence_url(application.id, condition.id),
            {"file": _upload("same.png")},
            format="multipart",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        assert second.status_code == 201
        assert (
            ApplicationDocument.objects.filter(
                application_id=application.id,
                document_type=conditions.evidence_document_type(condition.id),
            ).count()
            == 1
        )


# ---------------------------------------------------------------------------
# 4. The review command: three outcomes, and the reason is not optional
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConditionReviewCommand:
    """``met`` / ``changes_required`` / ``waived``, with a reason where it matters.

    **Validates: Requirements R13.9**
    """

    def test_changes_required_without_a_reason_is_refused(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application, status=conditions.CONDITION_EVIDENCE_SUBMITTED)
        response = _client_for(_reviewer(tenant_world.institution)).post(
            review_url(application.id, condition.id),
            {"outcome": conditions.CONDITION_CHANGES_REQUIRED, "reason": "no"},
            format="json",
        )
        assert response.status_code == 400
        assert response.json()["code"] == "CONDITION_REASON_REQUIRED"
        condition.refresh_from_db()
        assert condition.status == conditions.CONDITION_EVIDENCE_SUBMITTED

    def test_a_waiver_requires_an_explicit_reason(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application)
        reviewer = _client_for(_reviewer(tenant_world.institution))
        refused = reviewer.post(
            review_url(application.id, condition.id),
            {"outcome": conditions.CONDITION_WAIVED},
            format="json",
        )
        assert refused.status_code == 400
        assert refused.json()["code"] == "CONDITION_REASON_REQUIRED"

        allowed = reviewer.post(
            review_url(application.id, condition.id),
            {
                "outcome": conditions.CONDITION_WAIVED,
                "reason": "Registrar confirmed the transcript by email.",
            },
            format="json",
        )
        assert allowed.status_code == 200, allowed.content
        condition.refresh_from_db()
        assert condition.status == conditions.CONDITION_WAIVED
        assert condition.verified_by_id is not None

    def test_an_unknown_outcome_is_refused_by_the_contract(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application)
        response = _client_for(_reviewer(tenant_world.institution)).post(
            review_url(application.id, condition.id),
            {"outcome": "expired", "reason": "the deadline passed, honestly"},
            format="json",
        )
        assert response.status_code == 400
        assert response.json()["code"] == "VALIDATION_ERROR"

    def test_a_second_decision_on_a_decided_condition_is_a_conflict(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application, status=conditions.CONDITION_EVIDENCE_SUBMITTED)
        reviewer = _client_for(_reviewer(tenant_world.institution))
        assert (
            reviewer.post(
                review_url(application.id, condition.id),
                {"outcome": conditions.CONDITION_VERIFIED},
                format="json",
            ).status_code
            == 200
        )
        second = reviewer.post(
            review_url(application.id, condition.id),
            {"outcome": conditions.CONDITION_CHANGES_REQUIRED, "reason": "changed my mind"},
            format="json",
        )
        assert second.status_code == 409
        assert second.json()["code"] == "CONDITION_ALREADY_RESOLVED"

    def test_the_review_locks_the_condition_row(self):
        """A decision is asserted against the row as re-read under the lock."""
        source = inspect.getsource(conditions.review_condition)
        tree = ast.parse(source.strip())
        locked = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and node.keywords
            and any(kw.arg == "lock" and getattr(kw.value, "value", None) is True for kw in node.keywords)
        ]
        assert locked, "review_condition must re-read the condition under a row lock"

    def test_the_decision_is_audited_with_the_reason_and_no_applicant_field(
        self, tenant_world
    ):
        application = tenant_world.application
        condition = _condition(application, status=conditions.CONDITION_EVIDENCE_SUBMITTED)
        _client_for(_reviewer(tenant_world.institution)).post(
            review_url(application.id, condition.id),
            {
                "outcome": conditions.CONDITION_CHANGES_REQUIRED,
                "reason": "Send the stamped page, not the summary sheet.",
            },
            format="json",
        )
        row = (
            AuditLog.objects.filter(action=conditions.ACTION_CONDITION_REVIEWED)
            .order_by("-created_at")
            .first()
        )
        assert row is not None
        changes = row.changes or {}
        assert changes["new_status"] == conditions.CONDITION_CHANGES_REQUIRED
        assert "stamped page" in changes["reason"]
        assert changes["institution_id"] == str(tenant_world.institution.id)
        serialised = str(changes)
        assert application.full_name not in serialised
        assert application.email not in serialised

    def test_the_evidence_submission_is_audited(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application)
        _client_for(tenant_world.student).post(
            evidence_url(application.id, condition.id),
            {"file": _upload(), "comment": "My own words about my own evidence."},
            format="multipart",
        )
        row = (
            AuditLog.objects.filter(
                action=conditions.ACTION_CONDITION_EVIDENCE_SUBMITTED
            )
            .order_by("-created_at")
            .first()
        )
        assert row is not None
        changes = row.changes or {}
        assert changes["new_status"] == conditions.CONDITION_EVIDENCE_SUBMITTED
        assert changes["has_comment"] is True
        # The comment itself is the applicant's words about their own evidence and
        # is not repeated into the audit trail.
        assert "My own words" not in str(changes)


# ---------------------------------------------------------------------------
# 5. Authority: owner-only writes, capability-derived reviews, masked ids
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConditionAuthority:
    """Scope before lookup, and one indistinguishable 404.

    **Validates: Requirements R3.1, R3.2, R13.9**
    """

    def test_another_student_cannot_read_or_write_a_condition(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application)
        intruder = _client_for(build_profile(role="student", suffix="intruder"))

        read = intruder.get(condition_url(application.id, condition.id))
        unknown = intruder.get(condition_url(uuid.uuid4(), condition.id))
        assert read.status_code == 404
        assert unknown.status_code == 404
        # Byte-identical: "not yours" cannot be told from "does not exist".
        assert read.content == unknown.content

        write = intruder.post(
            evidence_url(application.id, condition.id),
            {"file": _upload()},
            format="multipart",
        )
        assert write.status_code == 404

    def test_staff_may_not_post_evidence_as_the_student(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application)
        response = _client_for(_reviewer(tenant_world.institution)).post(
            evidence_url(application.id, condition.id),
            {"file": _upload()},
            format="multipart",
        )
        # Owner-only: staff evidence would make the version row's provenance untrue.
        assert response.status_code == 404

    def test_another_tenants_reviewer_is_masked(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        condition = _condition(world_a.application)
        reviewer_b = _client_for(_reviewer(world_b.institution))

        review = reviewer_b.post(
            review_url(world_a.application.id, condition.id),
            {"outcome": conditions.CONDITION_VERIFIED},
            format="json",
        )
        assert review.status_code == 404
        condition.refresh_from_db()
        assert condition.status == conditions.CONDITION_OPEN

    def test_a_condition_from_another_application_is_not_found(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        foreign_condition = _condition(world_b.application)
        response = _client_for(world_a.student).get(
            condition_url(world_a.application.id, foreign_condition.id)
        )
        assert response.status_code == 404

    def test_an_in_scope_reader_without_review_cannot_decide(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application, status=conditions.CONDITION_EVIDENCE_SUBMITTED)
        read_only = _reviewer(tenant_world.institution, permissions=("read",))
        response = _client_for(read_only).post(
            review_url(application.id, condition.id),
            {"outcome": conditions.CONDITION_VERIFIED},
            format="json",
        )
        assert response.status_code == 403
        condition.refresh_from_db()
        assert condition.status == conditions.CONDITION_EVIDENCE_SUBMITTED

    def test_no_role_string_is_compared_in_the_condition_surface(self):
        """R3.1: authority is a resolved capability, never a role literal.

        The guard **parses** rather than greps, for 9.5 §9.1's reason: the module
        documents the authority model in prose, and a grep guard would fail on its
        own documentation.
        """
        offenders: list[str] = []
        for module in (conditions, __import__("apps.applications.condition_views", fromlist=["x"])):
            tree = ast.parse(pathlib.Path(inspect.getfile(module)).read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.Compare):
                    for operand in [node.left, *node.comparators]:
                        if (
                            isinstance(operand, ast.Constant)
                            and operand.value in {"admin", "super_admin", "reviewer"}
                        ):
                            offenders.append(f"{module.__name__}:{node.lineno}")
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    if node.func.attr in {"filter", "exclude", "get"}:
                        for keyword in node.keywords:
                            if keyword.arg and keyword.arg.startswith("role"):
                                offenders.append(f"{module.__name__}:{node.lineno}")
        assert offenders == []

    def test_the_read_publishes_different_actions_to_each_reader(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application, status=conditions.CONDITION_EVIDENCE_SUBMITTED)
        owner_view = _client_for(tenant_world.student).get(
            condition_url(application.id, condition.id)
        )
        staff_view = _client_for(_reviewer(tenant_world.institution)).get(
            condition_url(application.id, condition.id)
        )
        assert owner_view.json()["data"]["allowed_actions"] == ["replace_evidence"]
        staff_actions = staff_view.json()["data"]["allowed_actions"]
        assert sorted(staff_actions) == [
            "review:changes_required",
            "review:met",
            "review:waived",
        ]


# ---------------------------------------------------------------------------
# 6. The condition list read (R13.2)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConditionListRead:
    """The list is useful, additive, and costs a bounded number of queries.

    **Validates: Requirements R13.2, R13.9**
    """

    def test_the_pre_10_2_keys_are_unchanged(self, tenant_world):
        condition = _condition(tenant_world.application)
        response = _client_for(tenant_world.student).get(
            conditions_url(tenant_world.application.id)
        )
        assert response.status_code == 200
        row = response.json()["data"][0]
        for key in ("id", "description", "condition_type", "deadline", "status", "met_at"):
            assert key in row
        assert row["id"] == str(condition.id)

    def test_the_list_does_not_query_once_per_condition(self, tenant_world):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        application = tenant_world.application
        for _ in range(4):
            _condition(application)
        client = _client_for(tenant_world.student)
        with CaptureQueriesContext(connection) as captured:
            response = client.get(conditions_url(application.id))
        assert response.status_code == 200
        assert len(response.json()["data"]) == 4
        # Whatever the framework costs, the *evidence* and *history* reads are one
        # each for the whole page, so the count cannot scale with the conditions.
        evidence_queries = [
            q for q in captured.captured_queries if "condition_evidence:" in q["sql"]
        ]
        assert len(evidence_queries) <= 2

    def test_days_remaining_is_server_authored(self, tenant_world):
        condition = _condition(tenant_world.application, days=5)
        response = _client_for(tenant_world.student).get(
            condition_url(tenant_world.application.id, condition.id)
        )
        assert response.json()["data"]["days_remaining"] == 5


# ---------------------------------------------------------------------------
# 7. Amendment history (STU-17)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAmendmentHistory:
    """A student can see what they asked for and where it stands.

    **Validates: Requirements R13.9, R13.10**
    """

    def _amendment(self, application, *, field_name="phone", status="pending", **overrides):
        now = timezone.now()
        defaults = {
            "id": uuid.uuid4(),
            "application": application,
            "field_name": field_name,
            "old_value": "+260970000001",
            "new_value": "+260971111111",
            "reason": "I changed my number.",
            "status": status,
            "created_at": now,
        }
        defaults.update(overrides)
        return ApplicationAmendment.objects.create(**defaults)

    def test_the_list_uses_the_registered_envelope(self, tenant_world):
        application = tenant_world.application
        self._amendment(application)
        self._amendment(application, field_name="email", status="approved")
        response = _client_for(tenant_world.student).get(amendments_url(application.id))
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        data = body["data"]
        assert set(data) >= {"page", "pageSize", "totalCount", "results"}
        assert data["totalCount"] == 2
        assert len(data["results"]) == 2

    def test_each_status_travels_with_its_definition(self, tenant_world):
        application = tenant_world.application
        self._amendment(application, status="rejected", reviewed_at=timezone.now())
        row = (
            _client_for(tenant_world.student)
            .get(amendments_url(application.id))
            .json()["data"]["results"][0]
        )
        assert row["status"] == "rejected"
        assert row["status_definition"] == AMENDMENT_STATUS_DEFINITIONS["rejected"]
        assert row["is_terminal"] is True
        assert row["reviewed_at"] is not None

    def test_the_list_does_not_publish_the_reviewer(self, tenant_world):
        application = tenant_world.application
        reviewer = _reviewer(tenant_world.institution)
        self._amendment(
            application,
            status="approved",
            reviewed_by=reviewer,
            reviewed_at=timezone.now(),
        )
        row = (
            _client_for(tenant_world.student)
            .get(amendments_url(application.id))
            .json()["data"]["results"][0]
        )
        assert "reviewed_by" not in row
        assert str(reviewer.id) not in str(row)

    def test_the_detail_adds_the_old_value_and_the_reason(self, tenant_world):
        application = tenant_world.application
        amendment = self._amendment(application)
        row = (
            _client_for(tenant_world.student)
            .get(amendment_url(application.id, amendment.id))
            .json()["data"]
        )
        assert row["old_value"] == "+260970000001"
        assert row["reason"] == "I changed my number."

    def test_another_students_amendment_is_masked(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        foreign = self._amendment(world_b.application)
        client = _client_for(world_a.student)
        cross = client.get(amendment_url(world_a.application.id, foreign.id))
        unknown = client.get(amendment_url(world_a.application.id, uuid.uuid4()))
        assert cross.status_code == 404
        assert unknown.status_code == 404
        assert cross.content == unknown.content

    def test_staff_do_not_read_the_student_amendment_surface(self, tenant_world):
        application = tenant_world.application
        self._amendment(application)
        response = _client_for(_reviewer(tenant_world.institution)).get(
            amendments_url(application.id)
        )
        # Owner-only: the staff view of the same work is the review workspace,
        # under its own capability. One endpoint, one authority.
        assert response.status_code == 404

    def test_a_list_is_scoped_to_its_own_application(self, tenant_world_factory):
        world = tenant_world_factory()
        other = tenant_world_factory(canonical_program=world.canonical_program)
        self._amendment(world.application)
        self._amendment(other.application)
        response = _client_for(world.student).get(amendments_url(world.application.id))
        assert response.json()["data"]["totalCount"] == 1


# ---------------------------------------------------------------------------
# 8. Same-field pending uniqueness (STU-17)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSameFieldPendingUniqueness:
    """Two pending requests for one field are two answers to one question.

    **Validates: Requirements R13.10**
    """

    def _submit(self, application, student, field_name="phone", value="+260971111111"):
        return _client_for(student).post(
            amendments_url(application.id),
            {"field_name": field_name, "new_value": value, "reason": "A good reason."},
            format="json",
        )

    def test_a_second_pending_request_for_the_same_field_is_a_conflict(
        self, tenant_world_factory
    ):
        world = tenant_world_factory(application_status="submitted")
        first = self._submit(world.application, world.student)
        assert first.status_code == 201, first.content
        second = self._submit(world.application, world.student, value="+260972222222")
        assert second.status_code == 409, second.content
        body = second.json()
        assert body["code"] == "AMENDMENT_ALREADY_PENDING"
        # The refusal names the request already in flight, so the student can act
        # on it rather than guessing.
        assert body["details"]["pending_amendment_id"] == first.json()["data"]["amendment_id"]
        assert (
            ApplicationAmendment.objects.filter(
                application_id=world.application.id, field_name="phone"
            ).count()
            == 1
        )

    def test_a_different_field_is_unaffected(self, tenant_world_factory):
        world = tenant_world_factory(application_status="submitted")
        assert self._submit(world.application, world.student).status_code == 201
        other = self._submit(
            world.application, world.student, field_name="email", value="new@example.com"
        )
        assert other.status_code == 201, other.content

    def test_the_same_field_is_requestable_again_once_the_first_is_reviewed(
        self, tenant_world_factory
    ):
        world = tenant_world_factory(application_status="submitted")
        first = self._submit(world.application, world.student)
        amendment = ApplicationAmendment.objects.get(id=first.json()["data"]["amendment_id"])
        amendment.status = "rejected"
        amendment.reviewed_at = timezone.now()
        amendment.save(update_fields=["status", "reviewed_at"])

        again = self._submit(world.application, world.student, value="+260973333333")
        assert again.status_code == 201, again.content

    def test_the_application_wide_cap_is_unchanged(self, tenant_world_factory):
        world = tenant_world_factory(application_status="submitted")
        assert MAX_PENDING_AMENDMENTS == 3
        for field_name, value in (
            ("phone", "+260971111111"),
            ("email", "a@example.com"),
            ("residence_town", "Ndola"),
        ):
            assert (
                self._submit(
                    world.application, world.student, field_name=field_name, value=value
                ).status_code
                == 201
            )
        fourth = self._submit(
            world.application,
            world.student,
            field_name="next_of_kin_name",
            value="Someone Else",
        )
        assert fourth.status_code == 400
        assert fourth.json()["code"] == "MAX_PENDING_AMENDMENTS"

    def test_the_uniqueness_check_runs_under_the_application_lock(self):
        """Race-free without an index because every creator takes the same lock."""
        source = inspect.getsource(AmendmentService.request_amendment)
        assert "select_for_update" in source
        lock_at = source.index("select_for_update")
        check_at = source.index("AMENDMENT_ALREADY_PENDING")
        assert lock_at < check_at, "the same-field check must run inside the lock"

    def test_the_service_raises_a_conflict_not_a_validation_error(
        self, tenant_world_factory
    ):
        world = tenant_world_factory(application_status="submitted")
        AmendmentService.request_amendment(
            application_id=str(world.application.id),
            field_name="phone",
            new_value="+260971111111",
            reason="A good reason.",
            user_id=str(world.student.id),
        )
        with pytest.raises(AmendmentError) as exc:
            AmendmentService.request_amendment(
                application_id=str(world.application.id),
                field_name="phone",
                new_value="+260972222222",
                reason="Another reason.",
                user_id=str(world.student.id),
            )
        assert exc.value.code == "AMENDMENT_ALREADY_PENDING"
        assert exc.value.status_code == 409


# ---------------------------------------------------------------------------
# 9. Communication: the gate, the audience, and the reminder
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConditionCommunication:
    """Every message goes through 10.1's gate with a published category.

    **Validates: Requirements R13.3, R13.4, R13.9**
    """

    def test_a_review_outcome_reaches_the_student_with_a_delivery_record(
        self, tenant_world
    ):
        from apps.common.notification_preferences import (
            CATEGORY_APPLICATION_UPDATES,
            COMMUNICATION_METADATA_KEY,
        )

        application = tenant_world.application
        condition = _condition(application, status=conditions.CONDITION_EVIDENCE_SUBMITTED)
        _client_for(_reviewer(tenant_world.institution)).post(
            review_url(application.id, condition.id),
            {
                "outcome": conditions.CONDITION_CHANGES_REQUIRED,
                "reason": "Please send the stamped page.",
            },
            format="json",
        )
        notification = (
            Notification.objects.filter(user_id=application.user_id)
            .order_by("-created_at")
            .first()
        )
        assert notification is not None
        record = (notification.metadata or {}).get(COMMUNICATION_METADATA_KEY) or {}
        assert record["category"] == CATEGORY_APPLICATION_UPDATES.key
        assert record["kind"] == "mandatory"
        assert record["audience"] == "student"
        # A student message may use email; the decision is recorded either way.
        assert "email" in record["channels"]
        assert "stamped page" in notification.message

    def test_the_staff_work_item_is_inbox_only_and_says_so(self, tenant_world):
        from apps.common.notification_preferences import (
            CATEGORY_STAFF_ACTION_REQUIRED,
            COMMUNICATION_METADATA_KEY,
            NOT_IN_AUDIENCE_CHANNELS,
        )

        application = tenant_world.application
        reviewer = _reviewer(tenant_world.institution)
        condition = _condition(application)
        _client_for(tenant_world.student).post(
            evidence_url(application.id, condition.id),
            {"file": _upload()},
            format="multipart",
        )
        notification = (
            Notification.objects.filter(user_id=reviewer.id).order_by("-created_at").first()
        )
        assert notification is not None, "the school's reviewer should be told"
        record = (notification.metadata or {}).get(COMMUNICATION_METADATA_KEY) or {}
        assert record["category"] == CATEGORY_STAFF_ACTION_REQUIRED.key
        assert record["audience"] == "staff"
        assert record["channels"]["email"]["used"] is False
        assert record["channels"]["email"]["reason"] == NOT_IN_AUDIENCE_CHANNELS

    def test_another_tenants_reviewer_is_not_told(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        reviewer_b = _reviewer(world_b.institution)
        condition = _condition(world_a.application)
        _client_for(world_a.student).post(
            evidence_url(world_a.application.id, condition.id),
            {"file": _upload()},
            format="multipart",
        )
        assert not Notification.objects.filter(user_id=reviewer_b.id).exists()

    def test_the_condition_reminder_is_a_published_mandatory_producer(self):
        from apps.common.notification_preferences import (
            CATEGORY_APPLICATION_UPDATES,
            CATEGORIES_BY_KEY,
            DIRECT_PRODUCER_CATEGORIES,
        )

        category_key = DIRECT_PRODUCER_CATEGORIES[conditions.CONDITION_REMINDER_TEMPLATE_KEY]
        assert category_key == CATEGORY_APPLICATION_UPDATES.key
        # Mandatory: a missed condition deadline auto-rejects the application, so
        # it is not a courtesy a student may switch off.
        assert CATEGORIES_BY_KEY[category_key].mandatory is True

    def test_a_reminder_is_sent_once_per_window(self, tenant_world):
        application = tenant_world.application
        condition = _condition(application, days=3)
        application.status = "conditionally_approved"
        application.save(update_fields=["status"])

        due = conditions.conditions_due_for_reminder()
        assert [row.id for row in due] == [condition.id]
        window = conditions.reminder_window_for(3)
        assert window == 3
        assert conditions.send_condition_reminder(condition, window=window) is True
        assert conditions.already_reminded(condition.id, window) is True
        # The second send converges on the one notification (idempotency key).
        conditions.send_condition_reminder(condition, window=window)
        assert (
            Notification.objects.filter(
                idempotency_key=f"condition:{condition.id}:reminder:{window}"
            ).count()
            == 1
        )

    def test_a_condition_waiting_on_the_school_is_not_chased(self, tenant_world):
        application = tenant_world.application
        application.status = "conditionally_approved"
        application.save(update_fields=["status"])
        _condition(application, days=1, status=conditions.CONDITION_EVIDENCE_SUBMITTED)
        assert conditions.conditions_due_for_reminder() == []

    def test_a_passed_deadline_is_not_a_reminder(self):
        assert conditions.reminder_window_for(-1) is None
        assert conditions.reminder_window_for(99) is None
        assert conditions.reminder_window_for(0) == min(
            conditions.CONDITION_REMINDER_WINDOWS
        )


# ---------------------------------------------------------------------------
# 10. One authority
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOneAuthority:
    """The lifecycle rule lives in one place, and the pipeline is not re-written.

    **Validates: Requirements R13.9, R17.1**
    """

    def test_the_legacy_verify_command_shares_the_state_machine(self):
        source = inspect.getsource(ConditionManager.verify_condition)
        assert "ConditionStateMachine" in source
        assert 'condition.status != "pending"' not in source

    def test_the_legacy_verify_command_still_refuses_a_terminal_condition(
        self, tenant_world
    ):
        """Its stable code is unchanged — callers branch on it."""
        from apps.applications.condition_manager import ConditionError

        condition = _condition(tenant_world.application, status=conditions.CONDITION_VERIFIED)
        with pytest.raises(ConditionError) as exc:
            ConditionManager.verify_condition(
                str(condition.id), "waived", str(tenant_world.staff.id)
            )
        assert exc.value.code == "CONDITION_NOT_PENDING"

    def test_the_legacy_verify_command_accepts_a_condition_carrying_evidence(
        self, tenant_world
    ):
        condition = _condition(
            tenant_world.application, status=conditions.CONDITION_EVIDENCE_SUBMITTED
        )
        updated = ConditionManager.verify_condition(
            str(condition.id), "met", str(tenant_world.staff.id)
        )
        assert updated.status == conditions.CONDITION_VERIFIED

    def test_the_evidence_write_reuses_the_7_3_command(self):
        """No second storage pipeline: the ordering is 7.3's, imported."""
        source = inspect.getsource(conditions.submit_evidence)
        for step in ("open_stage", "verify_stored_object", "commit_version", "compensate_stage"):
            assert step in source, step
        assert source.index("open_stage") < source.index("verify_stored_object")
        assert source.index("verify_stored_object") < source.index("commit_version")

    def test_the_views_hold_no_lifecycle_logic(self):
        module = __import__("apps.applications.condition_views", fromlist=["x"])
        source = pathlib.Path(inspect.getfile(module)).read_text()
        for forbidden in ("ALLOWED_TRANSITIONS", "select_for_update", "commit_version"):
            assert forbidden not in source, forbidden

    def test_the_expiry_sweep_reads_the_shared_owed_states(self):
        module = __import__("apps.applications.tasks.condition_expiry", fromlist=["x"])
        source = pathlib.Path(inspect.getfile(module)).read_text()
        assert "CONDITION_STUDENT_OWED_STATES" in source
        assert 'status="pending"' not in source

    def test_no_migration_ships_with_this_task(self):
        """The claim, asserted: no 10.2 SQL script exists under backend/scripts/."""
        scripts = pathlib.Path("scripts")
        offenders = [
            path.name
            for path in scripts.glob("*.sql")
            if "condition_evidence" in path.name or "amendment_pending" in path.name
        ]
        assert offenders == []

    def test_the_condition_states_fit_the_stored_column(self):
        field = ApplicationCondition._meta.get_field("status")
        for state in conditions.CONDITION_STATES:
            assert len(state) <= field.max_length
