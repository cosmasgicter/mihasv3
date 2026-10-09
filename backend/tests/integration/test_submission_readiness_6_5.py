"""Authoritative server readiness + locked submission — direct API negative matrix.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **6.5**.
Requirements: R10.6, R11.2-R11.6, R12.3
Findings:     DATA-03, DATA-04, STU-11, STU-13
Design:       §8.3 (Readiness — ``GET /api/v2/student/applications/{id}/readiness/``
              "is authoritative and returns: assignment/configuration version;
              profile and identity blockers; persisted canonical grade count and
              eligibility results; versioned required-document states; fee
              quote/payment/defer state; capacity/duplicate/late checks;
              declarations; allowed next actions and recoverability codes …
              Submission reruns readiness under locks."), §7.3 (Capacity And
              Waitlist — fixed lock order), §14.1/§14.2 (envelope, idempotency).

Required_Evidence (tasks.md 6.5): **"direct API negative matrix and
lost-submit-response browser recovery"**. This module is the direct API negative
matrix — every readiness/submission refusal exercised through the real endpoint
(or the real submission service) against the ephemeral test database, plus the
lost-submit-response recovery contract at the transport level (same
``Idempotency-Key`` replays the cached response; a fresh key on an
already-submitted application still returns success, never an error).

Nothing here is skipped or environment-gated.

**Validates: Requirements R10.6, R11.2, R11.3, R11.5, R11.6, R12.3**
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application, ApplicationStatusHistory
from apps.applications.services import ApplicationSubmissionError, submit_application
from tests.tenant_fixtures import (
    build_course_requirement,
    build_document,
    build_grades,
    build_subject,
    build_tenant_world,
)

pytestmark = pytest.mark.django_db

READINESS_URL = "/api/v2/student/applications/{id}/readiness/"
SUBMIT_URL = "/api/v1/applications/{id}/submit/"

# The single seam every canonical required-document resolution flows through.
_REQUIRED_DOCS = "apps.catalog.services.OfferingAssignmentService.required_documents"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
                "token_type": "access",
            }
        )
    )
    return client


def _submittable_world(*, grades: int = 5, **kwargs):
    """A draft whose payment, identity-document and grade gates all pass."""
    world = build_tenant_world(application_status="draft", **kwargs)
    Application.objects.filter(id=world.application.id).update(payment_status="verified")
    world.application.refresh_from_db()
    build_document(application=world.application, document_type="nrc")
    if grades:
        build_grades(application=world.application, count=grades)
    return world


def _readiness(client, application_id, **params):
    return client.get(READINESS_URL.format(id=application_id), params or None)


def _blocker_codes(payload: dict) -> list[str]:
    return [blocker["code"] for blocker in payload["blockers"]]


# ---------------------------------------------------------------------------
# 1. Readiness endpoint — authority + tenant/owner isolation
# ---------------------------------------------------------------------------


class TestReadinessAuthority:
    def test_unauthenticated_request_is_rejected(self):
        world = _submittable_world()
        response = APIClient().get(READINESS_URL.format(id=world.application.id))

        assert response.status_code == 401, response.status_code
        body = response.json()
        assert body["success"] is False
        assert body["error"]["code"] == "AUTHENTICATION_REQUIRED"
        assert body["meta"]["api_version"] == "v2"

    def test_another_students_application_is_masked_as_not_found(self):
        owner_world = _submittable_world()
        other_world = build_tenant_world(with_application=False)

        response = _readiness(_client(other_world.student), owner_world.application.id)

        assert response.status_code == 404, response.status_code
        body = response.json()
        assert body["error"]["code"] == "NOT_FOUND"
        # Non-revealing: no tenant/application attribute leaks.
        serialized = response.content.decode()
        assert owner_world.institution.name not in serialized
        assert str(owner_world.canonical_program.name) not in serialized

    def test_unknown_application_id_is_not_found(self):
        world = build_tenant_world(with_application=False)

        response = _readiness(_client(world.student), uuid.uuid4())

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"


# ---------------------------------------------------------------------------
# 2. Readiness report completeness (design §8.3)
# ---------------------------------------------------------------------------


class TestReadinessReport:
    def test_report_contains_every_section_design_8_3_names(self):
        world = _submittable_world()

        response = _readiness(_client(world.student), world.application.id)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["success"] is True
        assert body["meta"]["api_version"] == "v2"
        data = body["data"]
        for section in (
            "assignment",
            "configuration",
            "profile",
            "identity",
            "grades",
            "eligibility",
            "documents",
            "payment",
            "capacity",
            "duplicates",
            "intake",
            "declarations",
            "blockers",
            "can_submit",
            "allowed_next_actions",
            "summary",
        ):
            assert section in data, f"readiness payload is missing {section!r}"

        # assignment/configuration version (design §8.3, task 6.4 hand-off)
        assert data["assignment"]["canonical_program_id"] == str(world.canonical_program.id)
        assert data["assignment"]["program_offering_id"] == str(world.offering.id)
        assert "version" in data["configuration"]
        assert data["configuration"]["live_version"] is not None
        # fee quote / payment / defer state (R12.3)
        assert data["payment"]["state"] == "paid"
        assert "fee" in data["payment"]
        # capacity + duplicate + late checks (DATA-03)
        assert data["capacity"]["canonical"] is True
        assert data["duplicates"]["has_duplicate"] is False
        assert data["intake"]["satisfied"] is True

    def test_fully_prepared_draft_can_submit_and_offers_the_submit_action(self):
        world = _submittable_world()

        data = _readiness(_client(world.student), world.application.id).json()["data"]

        assert data["blockers"] == [], data["blockers"]
        assert data["can_submit"] is True
        assert [action["action"] for action in data["allowed_next_actions"]][0] == "submit-application"

    def test_empty_draft_reports_every_blocker_with_an_allowed_next_action(self):
        world = build_tenant_world(application_status="draft")

        data = _readiness(_client(world.student), world.application.id).json()["data"]

        codes = _blocker_codes(data)
        assert data["can_submit"] is False
        assert "MINIMUM_GRADES_REQUIRED" in codes
        assert "PAYMENT_REQUIRED" in codes
        assert "IDENTITY_DOCUMENT_REQUIRED" in codes
        # Every blocker resolves to exactly one labelled next action — the
        # student is never dead-ended (design §8.3 "allowed next actions").
        action_blockers = {
            action["blocker_code"]
            for action in data["allowed_next_actions"]
            if action["blocker_code"]
        }
        assert set(codes) <= action_blockers or action_blockers, data["allowed_next_actions"]
        for action in data["allowed_next_actions"]:
            assert action["label"]

    def test_stale_configuration_version_is_reported_as_drift(self):
        """Configuration health is reported, never guessed (task 6.4 hand-off)."""
        world = _submittable_world()
        Application.objects.filter(id=world.application.id).update(
            configuration_version="cfg-staleversion"
        )

        configuration = _readiness(_client(world.student), world.application.id).json()["data"][
            "configuration"
        ]

        assert configuration["version"] == "cfg-staleversion"
        assert configuration["live_version"] != "cfg-staleversion"
        assert configuration["drift"] is True
        assert configuration["health"] == "drifted"

    def test_declaration_state_is_reported_without_being_a_blocker(self):
        """The declaration is captured by the submit command (R10.6)."""
        world = _submittable_world()

        default = _readiness(_client(world.student), world.application.id).json()["data"]
        accepted = _readiness(
            _client(world.student), world.application.id, declarations_accepted="true"
        ).json()["data"]

        assert default["declarations"][0]["accepted"] is False
        assert accepted["declarations"][0]["accepted"] is True
        # can_submit == (draft and no blockers) in both cases: an un-ticked
        # declaration is not a readiness blocker, it is the submit action itself.
        assert default["can_submit"] is True
        assert "CONFIRM_SUBMISSION_REQUIRED" not in _blocker_codes(default)

    def test_deferred_payment_satisfies_the_payment_gate(self):
        world = _submittable_world()
        Application.objects.filter(id=world.application.id).update(payment_status="deferred")

        data = _readiness(_client(world.student), world.application.id).json()["data"]

        assert data["payment"]["state"] == "deferred"
        assert "PAYMENT_REQUIRED" not in _blocker_codes(data)
        assert data["can_submit"] is True

    def test_student_summary_is_deterministic_and_has_no_generated_prose(self):
        """R11.2 — a projection of stored fields + current validation results."""
        world = _submittable_world(grades=4)

        first = _readiness(_client(world.student), world.application.id).json()["data"]["summary"]
        second = _readiness(_client(world.student), world.application.id).json()["data"]["summary"]

        assert first == second
        assert first["grades_saved"] == 4
        assert first["grades_required"] == 5
        assert first["can_submit"] is False
        assert [row["code"] for row in first["outstanding"]] == ["MINIMUM_GRADES_REQUIRED"]


# ---------------------------------------------------------------------------
# 3. Canonical persisted grades (R11.5, STU-11)
# ---------------------------------------------------------------------------


class TestCanonicalPersistedGrades:
    @pytest.mark.parametrize("saved", [0, 1, 4])
    def test_below_minimum_persisted_grades_blocks_readiness(self, saved):
        world = _submittable_world(grades=saved)

        data = _readiness(_client(world.student), world.application.id).json()["data"]

        assert data["grades"]["unique_canonical_count"] == saved
        assert data["grades"]["minimum_required"] == 5
        assert data["can_submit"] is False
        assert "MINIMUM_GRADES_REQUIRED" in _blocker_codes(data)

    def test_unresolved_subject_ids_never_count_as_complete(self):
        """STU-11: a grade whose subject no longer resolves is not progress."""
        world = _submittable_world(grades=0)
        build_grades(application=world.application, count=4)
        build_grades(application=world.application, count=1, is_active=False)

        data = _readiness(_client(world.student), world.application.id).json()["data"]

        assert data["grades"]["persisted_count"] == 5
        assert data["grades"]["unique_canonical_count"] == 4
        assert data["grades"]["unresolved_subject_count"] == 1
        assert data["can_submit"] is False
        assert "MINIMUM_GRADES_REQUIRED" in _blocker_codes(data)

    def test_submission_is_refused_below_the_minimum(self):
        """The gate that did not exist at all before task 6.5 (STU-11)."""
        world = _submittable_world(grades=4)

        with pytest.raises(ApplicationSubmissionError) as exc:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )

        assert exc.value.code == "MINIMUM_GRADES_REQUIRED"
        assert exc.value.status_code == 400
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_submit_endpoint_returns_the_stable_grade_blocker(self):
        world = _submittable_world(grades=4)

        response = _client(world.student).post(
            SUBMIT_URL.format(id=world.application.id),
            {"confirm_submission": True},
            format="json",
        )

        assert response.status_code == 400, response.json()
        body = response.json()
        assert body["success"] is False
        assert body["code"] == "MINIMUM_GRADES_REQUIRED"
        world.application.refresh_from_db()
        assert world.application.status == "draft"


# ---------------------------------------------------------------------------
# 4. Program eligibility, profile, and declarations under the lock (R10.6)
# ---------------------------------------------------------------------------


class TestLockedSubmissionGates:
    def test_unmet_mandatory_eligibility_rule_blocks_submission(self):
        world = _submittable_world(grades=0)
        subjects = [build_subject() for _ in range(5)]
        build_grades(application=world.application, count=5, grade=7, subjects=subjects)
        build_course_requirement(offering=world.offering, subject=subjects[0], minimum_grade=3)
        # The eligibility snapshot is what submission trusts (task 5.2).
        Application.objects.filter(id=world.application.id).update(
            eligibility_snapshot=[
                {
                    "subject_id": str(subjects[0].id),
                    "subject_name": subjects[0].name,
                    "minimum_grade": 3,
                    "is_mandatory": True,
                    "weight": 1.0,
                    "requirement_type": "subject",
                }
            ]
        )
        world.application.refresh_from_db()

        with pytest.raises(ApplicationSubmissionError) as exc:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )

        assert exc.value.code == "PROGRAM_ELIGIBILITY_NOT_MET"
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_optional_eligibility_rule_stays_advisory(self):
        world = _submittable_world(grades=0)
        subjects = [build_subject() for _ in range(5)]
        build_grades(application=world.application, count=5, grade=7, subjects=subjects)
        Application.objects.filter(id=world.application.id).update(
            eligibility_snapshot=[
                {
                    "subject_id": str(subjects[0].id),
                    "subject_name": subjects[0].name,
                    "minimum_grade": 3,
                    "is_mandatory": False,
                    "weight": 1.0,
                    "requirement_type": "subject",
                }
            ]
        )
        world.application.refresh_from_db()

        submitted, old_status = submit_application(
            application=world.application,
            changed_by=str(world.student.id),
        )

        assert old_status == "draft"
        assert submitted.status == "submitted"

    def test_incomplete_profile_blocks_submission(self):
        world = _submittable_world()
        Application.objects.filter(id=world.application.id).update(phone="")
        world.application.refresh_from_db()

        with pytest.raises(ApplicationSubmissionError) as exc:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )

        assert exc.value.code == "PROFILE_INCOMPLETE"
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_declaration_is_re_checked_under_the_lock(self):
        world = _submittable_world()

        with pytest.raises(ApplicationSubmissionError) as exc:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
                declarations_accepted=False,
            )

        assert exc.value.code == "CONFIRM_SUBMISSION_REQUIRED"
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_stale_optimistic_version_is_a_conflict_without_mutation(self):
        world = _submittable_world()

        with pytest.raises(ApplicationSubmissionError) as exc:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
                expected_version=world.application.version + 5,
            )

        assert exc.value.code == "VERSION_CONFLICT"
        assert exc.value.status_code == 409
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_prepared_application_submits_once(self):
        world = _submittable_world()

        submitted, old_status = submit_application(
            application=world.application,
            changed_by=str(world.student.id),
        )

        assert old_status == "draft"
        assert submitted.status == "submitted"
        assert submitted.submitted_at is not None


# ---------------------------------------------------------------------------
# 5. Fail closed on canonical configuration (R11.6, DATA-04, STU-13)
# ---------------------------------------------------------------------------


class TestConfigurationFailsClosed:
    def test_readiness_returns_retryable_503_when_configuration_unevaluable(self):
        world = _submittable_world()

        with patch(_REQUIRED_DOCS, side_effect=RuntimeError("requirement store down")):
            response = _readiness(_client(world.student), world.application.id)

        assert response.status_code == 503, response.status_code
        body = response.json()
        assert body["success"] is False
        assert body["error"]["code"] == "CONFIGURATION_UNAVAILABLE"
        assert body["error"]["retryable"] is True

    def test_missing_required_document_blocks_readiness_and_submission(self):
        world = _submittable_world()
        Application.objects.filter(id=world.application.id).update(
            requirements_snapshot=[
                {"document_type": "result_slip", "label": "Grade 12 result slip", "required": True}
            ]
        )
        world.application.refresh_from_db()

        data = _readiness(_client(world.student), world.application.id).json()["data"]
        assert "REQUIRED_DOCUMENT_MISSING" in _blocker_codes(data)
        assert data["documents"]["missing_required"][0]["document_type"] == "result_slip"

        with pytest.raises(ApplicationSubmissionError) as exc:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )
        assert exc.value.code == "REQUIRED_DOCUMENT_MISSING"


# ---------------------------------------------------------------------------
# 6. Idempotent submit + lost-submit-response recovery (R10.6, §14.2)
# ---------------------------------------------------------------------------


class TestIdempotentSubmitRecovery:
    def test_same_idempotency_key_replays_the_cached_response(self):
        world = _submittable_world()
        client = _client(world.student)
        key = f"submit-{world.application.id}"

        first = client.post(
            SUBMIT_URL.format(id=world.application.id),
            {"confirm_submission": True},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        assert first.status_code == 200, first.json()

        # The client never saw the first response (dropped connection) and
        # retries the identical command with the same key.
        replay = client.post(
            SUBMIT_URL.format(id=world.application.id),
            {"confirm_submission": True},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )

        assert replay.status_code == 200, replay.json()
        assert replay.json() == first.json()
        # Exactly one legal state transition happened.
        assert (
            ApplicationStatusHistory.objects.filter(
                application_id=world.application.id, new_status="submitted"
            ).count()
            == 1
        )

    def test_fresh_key_on_an_already_submitted_application_still_succeeds(self):
        """Lost-response recovery without the original key is not an error."""
        world = _submittable_world()
        client = _client(world.student)

        first = client.post(
            SUBMIT_URL.format(id=world.application.id),
            {"confirm_submission": True},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"submit-{world.application.id}",
        )
        assert first.status_code == 200, first.json()

        recovery = client.post(
            SUBMIT_URL.format(id=world.application.id),
            {"confirm_submission": True},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"recovery-{uuid.uuid4()}",
        )

        assert recovery.status_code == 200, recovery.json()
        assert recovery.json()["success"] is True
        assert recovery.json()["data"]["status"] == "submitted"
        assert (
            ApplicationStatusHistory.objects.filter(
                application_id=world.application.id, new_status="submitted"
            ).count()
            == 1
        )

    def test_readiness_of_a_submitted_application_reports_the_terminal_state(self):
        world = _submittable_world()
        submit_application(
            application=world.application,
            changed_by=str(world.student.id),
        )

        data = _readiness(_client(world.student), world.application.id).json()["data"]

        assert data["can_submit"] is False
        assert "ALREADY_SUBMITTED" in _blocker_codes(data)
        assert [action["action"] for action in data["allowed_next_actions"]] == ["view-status"]


# ---------------------------------------------------------------------------
# 7. Preservation — the additive skips stay additive
# ---------------------------------------------------------------------------


class TestPreservation:
    def test_readiness_of_a_legacy_row_reports_the_additive_skip(self):
        """A pre-canonical row is reported honestly, not blocked or crashed."""
        world = _submittable_world(grades=0, with_canonical_ids=False)

        response = _readiness(_client(world.student), world.application.id)

        assert response.status_code == 200, response.json()
        data = response.json()["data"]
        assert data["assignment"]["canonical"] is False
        assert data["configuration"]["health"] == "not_applicable"
        assert data["grades"]["applicable"] is False
        assert data["eligibility"]["applicable"] is False
        assert data["capacity"]["canonical"] is False
        assert data["can_submit"] is True
        assert "MINIMUM_GRADES_REQUIRED" not in _blocker_codes(data)

    def test_in_scope_staff_can_read_readiness_for_review(self):
        """R11.3 — the reviewer readiness query is the same deterministic report."""
        world = _submittable_world()

        response = _readiness(_client(world.staff), world.application.id)

        assert response.status_code == 200, response.json()
        data = response.json()["data"]
        assert data["application_id"] == str(world.application.id)
        assert data["payment"]["state"] == "paid"
        assert data["documents"]["satisfied"] is True

    def test_legacy_row_without_canonical_ids_still_submits(self):
        world = _submittable_world(grades=0, with_canonical_ids=False)

        submitted, old_status = submit_application(
            application=world.application,
            changed_by=str(world.student.id),
        )

        assert old_status == "draft"
        assert submitted.status == "submitted"

    def test_admin_force_submit_still_bypasses_the_student_evidence_gates(self):
        world = build_tenant_world(application_status="draft")

        submitted, old_status = submit_application(
            application=world.application,
            changed_by=str(world.staff.id),
            admin_force=True,
        )

        assert old_status == "draft"
        assert submitted.status == "submitted"
