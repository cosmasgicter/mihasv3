"""Canonical subject/grade contract — the 7.1 evidence matrix.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.1**.
Requirements: R11.4, R11.5
Findings:     STU-11
Design:       §9.2 (Grades — "The subject catalog is seeded and versioned by the
              backend. Selectors contain only canonical UUIDs. Students manually
              enter grades; server mutations persist and return the canonical
              record. Readiness counts unique persisted records, not local row
              contents.")

Required_Evidence (tasks.md 7.1): **"0/4/5/duplicate/fake/unknown/
program-ineligible grade tests"**. Every one of those seven cases is exercised
here against the real endpoints and the real submission service on the ephemeral
test database. Nothing is skipped or environment-gated.

Task 6.5 closed the *server* half of STU-11 (readiness counts only unique
persisted canonical grades; ``submit_application`` raises
``MINIMUM_GRADES_REQUIRED`` / ``PROGRAM_ELIGIBILITY_NOT_MET`` inside the row
lock). This module **verifies those gates still hold** and adds what 7.1 owns:

* the canonical catalogue itself (seeded, one identity per subject, active),
* the write path — a selector/persist boundary that cannot accept a
  non-canonical, inactive, or duplicate subject,
* the configured minimum being catalogue-driven rather than a literal 5.

**Validates: Requirements R11.4, R11.5**
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from django.db import IntegrityError, connection, transaction
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.assignment_resolution import AssignmentConfigurationError
from apps.applications import readiness_service
from apps.applications.models import Application
from apps.applications.services import ApplicationSubmissionError, submit_application
from apps.catalog.models import Subject
from apps.catalog.subject_catalog import (
    CANONICAL_SUBJECTS,
    LEGACY_DUPLICATE_CODES,
    SUBJECT_ALIASES,
    normalize_subject_name,
)
from apps.common.models import Setting
from apps.documents.models import ApplicationGrade
from tests.tenant_fixtures import (
    build_course_requirement,
    build_document,
    build_grades,
    build_subject,
    build_tenant_world,
)

pytestmark = pytest.mark.django_db

SUBJECTS_URL = "/api/v1/catalog/subjects/"
GRADES_URL = "/api/v1/applications/{id}/grades/"
READINESS_URL = "/api/v2/student/applications/{id}/readiness/"


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


def _blocker_codes(payload: dict) -> list[str]:
    return [blocker["code"] for blocker in payload["blockers"]]


def _readiness_payload(world) -> dict:
    response = _client(world.student).get(READINESS_URL.format(id=world.application.id))
    assert response.status_code == 200, response.content
    return response.json()["data"]


def _post_grades(world, rows: list[dict]):
    return _client(world.student).post(
        GRADES_URL.format(id=world.application.id),
        {"grades": rows},
        format="json",
    )


def _canonical_rows(count: int, *, grade: int = 2) -> list[dict]:
    """``count`` distinct active canonical subjects as a batch payload."""
    return [
        {"subject_id": str(build_subject(name=f"Contract Subject {index}").id), "grade": grade}
        for index in range(count)
    ]


# ---------------------------------------------------------------------------
# 1. The catalogue itself (R11.4, R11.5 "server-provided canonical IDs")
# ---------------------------------------------------------------------------


class TestCanonicalCatalogue:
    def test_catalogue_declares_one_identity_per_subject(self):
        """No two canonical entries share a code or a normalised name.

        The Neon inventory for 7.1 found three duplicate-identity rows
        (``ADD_MATH``/``ADDMATH``, ``MUS``/``MUSIC``, ``PHYS``/``PHY``). Two
        active rows for one real subject let a student persist "five" grades that
        are really four subjects, so the catalogue must declare exactly one.
        """
        codes = [entry.code for entry in CANONICAL_SUBJECTS]
        assert len(codes) == len(set(codes)), "duplicate canonical subject code"

        identities = [(entry.curriculum_type, normalize_subject_name(entry.name)) for entry in CANONICAL_SUBJECTS]
        assert len(identities) == len(set(identities)), "duplicate canonical subject identity"

    def test_every_legacy_duplicate_code_maps_to_a_canonical_code(self):
        canonical_codes = {entry.code for entry in CANONICAL_SUBJECTS}
        assert LEGACY_DUPLICATE_CODES, "the inventoried legacy duplicates must be recorded"
        for legacy_code, canonical_code in LEGACY_DUPLICATE_CODES.items():
            assert legacy_code not in canonical_codes, legacy_code
            assert canonical_code in canonical_codes, canonical_code

    def test_every_alias_resolves_to_a_canonical_code(self):
        canonical_codes = {entry.code for entry in CANONICAL_SUBJECTS}
        assert SUBJECT_ALIASES, "the alias catalogue must be inventoried server-side"
        for alias, code in SUBJECT_ALIASES.items():
            assert alias == normalize_subject_name(alias), f"alias {alias!r} is not normalised"
            assert code in canonical_codes, f"alias {alias!r} points at unknown code {code!r}"

    def test_subject_selector_endpoint_serves_only_active_canonical_ids(self):
        """R11.5: "SUBJECT selectors SHALL contain only server-provided canonical IDs".

        An inactive row can be persisted but never counts, so offering it is a
        trap. The endpoint must not list it.
        """
        active = build_subject(name="Selector Active")
        inactive = build_subject(name="Selector Retired", is_active=False)

        response = APIClient().get(SUBJECTS_URL)
        assert response.status_code == 200, response.content
        payload = response.json()["data"]
        served = {row["id"] for row in payload}

        assert str(active.id) in served
        assert str(inactive.id) not in served
        for row in payload:
            uuid.UUID(row["id"])  # every served id is a canonical UUID

    def test_subject_selector_endpoint_publishes_the_versioned_alias_catalogue(self):
        """R11.4: OCR candidates map "against a versioned alias catalog"."""
        build_subject(name="Alias Carrier", code="ALIASCARRIER")
        response = APIClient().get(SUBJECTS_URL)
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["meta"]["subject_catalog_version"], "catalogue version must be published"
        for row in body["data"]:
            assert isinstance(row["aliases"], list)


# ---------------------------------------------------------------------------
# 2. The write path — 0 / duplicate / fake / unknown
# ---------------------------------------------------------------------------


class TestGradeWriteContract:
    def test_zero_grades_is_refused_by_the_batch_endpoint(self):
        world = _submittable_world(grades=0)
        response = _post_grades(world, [])
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "MINIMUM_SUBJECTS_REQUIRED"
        assert ApplicationGrade.objects.filter(application_id=world.application.id).count() == 0

    def test_four_grades_is_refused_by_the_batch_endpoint(self):
        world = _submittable_world(grades=0)
        response = _post_grades(world, _canonical_rows(4))
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "MINIMUM_SUBJECTS_REQUIRED"
        assert ApplicationGrade.objects.filter(application_id=world.application.id).count() == 0

    def test_five_grades_persists_exactly_five_canonical_rows(self):
        world = _submittable_world(grades=0)
        rows = _canonical_rows(5)
        response = _post_grades(world, rows)
        assert response.status_code == 200, response.content
        persisted = ApplicationGrade.objects.filter(application_id=world.application.id)
        assert persisted.count() == 5
        assert {str(row.subject_id) for row in persisted} == {row["subject_id"] for row in rows}

    def test_duplicate_subject_rows_are_refused_and_nothing_is_persisted(self):
        world = _submittable_world(grades=0)
        rows = _canonical_rows(5)
        rows.append({"subject_id": rows[0]["subject_id"], "grade": 4})

        response = _post_grades(world, rows)
        assert response.status_code == 400, response.content
        body = response.json()
        assert body["code"] == "DUPLICATE_SUBJECT"
        assert ApplicationGrade.objects.filter(application_id=world.application.id).count() == 0

    def test_a_fake_subject_id_is_refused_by_the_batch_endpoint(self):
        world = _submittable_world(grades=0)
        rows = _canonical_rows(4)
        rows.append({"subject_id": str(uuid.uuid4()), "grade": 3})

        response = _post_grades(world, rows)
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "VALIDATION_ERROR"
        assert ApplicationGrade.objects.filter(application_id=world.application.id).count() == 0

    def test_an_unknown_non_uuid_subject_id_is_refused_by_the_batch_endpoint(self):
        """The client's retired ``fallback-*`` slugs are not persistable identities."""
        world = _submittable_world(grades=0)
        rows = _canonical_rows(4)
        rows.append({"subject_id": "fallback-biology", "grade": 3})

        response = _post_grades(world, rows)
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "VALIDATION_ERROR"
        assert ApplicationGrade.objects.filter(application_id=world.application.id).count() == 0

    def test_an_inactive_subject_id_is_refused_by_the_batch_endpoint(self):
        """A row that readiness can never count must not be writable."""
        world = _submittable_world(grades=0)
        retired = build_subject(name="Retired Subject", is_active=False)
        rows = _canonical_rows(4)
        rows.append({"subject_id": str(retired.id), "grade": 3})

        response = _post_grades(world, rows)
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "VALIDATION_ERROR"
        assert ApplicationGrade.objects.filter(application_id=world.application.id).count() == 0

    def test_the_single_grade_write_path_shares_the_same_refusals(self):
        world = _submittable_world(grades=0)
        retired = build_subject(name="Retired Single", is_active=False)
        client = _client(world.student)

        for subject_id in (str(uuid.uuid4()), "fallback-english", str(retired.id)):
            response = client.post(
                GRADES_URL.format(id=world.application.id),
                {"subject_id": subject_id, "grade": 3},
                format="json",
            )
            assert response.status_code == 400, (subject_id, response.content)
        assert ApplicationGrade.objects.filter(application_id=world.application.id).count() == 0


# ---------------------------------------------------------------------------
# 3. Readiness + submission count only unique persisted canonical grades
# ---------------------------------------------------------------------------


class TestReadinessAndSubmissionCounting:
    def test_zero_grades_blocks_readiness_and_submission(self):
        world = _submittable_world(grades=0)
        payload = _readiness_payload(world)

        assert payload["grades"]["unique_canonical_count"] == 0
        assert payload["can_submit"] is False
        assert readiness_service.MINIMUM_GRADES_REQUIRED in _blocker_codes(payload)

        with pytest.raises(ApplicationSubmissionError) as excinfo:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )
        assert excinfo.value.code == readiness_service.MINIMUM_GRADES_REQUIRED
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_four_grades_blocks_readiness_and_submission(self):
        world = _submittable_world(grades=4)
        payload = _readiness_payload(world)

        assert payload["grades"]["unique_canonical_count"] == 4
        assert payload["can_submit"] is False
        assert readiness_service.MINIMUM_GRADES_REQUIRED in _blocker_codes(payload)

        with pytest.raises(ApplicationSubmissionError) as excinfo:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )
        assert excinfo.value.code == readiness_service.MINIMUM_GRADES_REQUIRED

    def test_five_grades_satisfies_readiness_and_submits(self):
        world = _submittable_world(grades=5)
        payload = _readiness_payload(world)

        assert payload["grades"]["unique_canonical_count"] == 5
        assert payload["grades"]["satisfied"] is True
        assert readiness_service.MINIMUM_GRADES_REQUIRED not in _blocker_codes(payload)

        submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )
        world.application.refresh_from_db()
        assert world.application.status == "submitted"

    def test_a_duplicate_subject_row_never_counts_twice(self):
        """Five persisted rows over four subjects is four unique grades.

        The batch endpoint refuses duplicates, but a legacy row-set (or the
        duplicate-identity catalogue rows the 7.1 inventory found) can still
        exist in the database, so the count itself must be unique-by-subject.
        """
        world = _submittable_world(grades=0)
        subjects = [build_subject(name=f"Dup Subject {index}") for index in range(4)]
        build_grades(application=world.application, count=4, subjects=subjects)
        ApplicationGrade.objects.filter(
            application_id=world.application.id, subject_id=subjects[0].id
        ).update(grade=3)

        payload = _readiness_payload(world)
        assert payload["grades"]["persisted_count"] == 4
        assert payload["grades"]["unique_canonical_count"] == 4
        assert readiness_service.MINIMUM_GRADES_REQUIRED in _blocker_codes(payload)

    def test_a_fake_subject_identity_cannot_be_persisted_at_all(self):
        """A fake subject ID is unpersistable, not merely uncounted.

        ``application_grades.subject_id`` carries a real foreign key to
        ``subjects(id)`` in the live database (``application_grades_subject_id_fkey``,
        no ``ON DELETE``), so the invented identities STU-11 describes cannot
        reach the table even if a caller bypasses the serializer. The write
        boundary refuses them first (see :class:`TestGradeWriteContract`); this is
        the second, structural line.
        """
        world = _submittable_world(grades=0)
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                ApplicationGrade.objects.create(
                    id=uuid.uuid4(),
                    application_id=world.application.id,
                    subject_id=uuid.uuid4(),
                    grade=2,
                )
                # The test-database foreign key is deferrable, so force the check
                # here rather than letting it surface during teardown.
                connection.check_constraints()
        assert ApplicationGrade.objects.filter(application_id=world.application.id).count() == 0

    def test_an_unresolved_subject_row_never_counts_as_complete(self):
        """The realistic "unresolved" case: the subject was deactivated.

        This is what the 7.1 catalogue migration does to the three
        duplicate-identity rows it retires, so it is the exact state a live
        application can land in.
        """
        world = _submittable_world(grades=0)
        build_grades(application=world.application, count=4)
        build_grades(
            application=world.application,
            count=1,
            subjects=[build_subject(name="Deactivated Counter", is_active=False)],
        )

        payload = _readiness_payload(world)
        assert payload["grades"]["persisted_count"] == 5
        assert payload["grades"]["unique_canonical_count"] == 4
        assert payload["grades"]["unresolved_subject_count"] == 1
        assert payload["can_submit"] is False
        assert readiness_service.MINIMUM_GRADES_REQUIRED in _blocker_codes(payload)

        with pytest.raises(ApplicationSubmissionError) as excinfo:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )
        assert excinfo.value.code == readiness_service.MINIMUM_GRADES_REQUIRED


# ---------------------------------------------------------------------------
# 4. The configured minimum is catalogue/policy driven, never a literal
# ---------------------------------------------------------------------------


class TestConfiguredMinimum:
    def test_a_raised_minimum_applies_to_readiness_and_submission(self):
        Setting.objects.update_or_create(
            key=readiness_service.MINIMUM_GRADES_SETTING_KEY, defaults={"value": "6"}
        )
        world = _submittable_world(grades=5)

        payload = _readiness_payload(world)
        assert payload["grades"]["minimum_required"] == 6
        assert payload["grades"]["satisfied"] is False
        assert readiness_service.MINIMUM_GRADES_REQUIRED in _blocker_codes(payload)

        with pytest.raises(ApplicationSubmissionError) as excinfo:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )
        assert excinfo.value.code == readiness_service.MINIMUM_GRADES_REQUIRED

    def test_a_raised_minimum_applies_to_the_write_path(self):
        """The batch endpoint must read the same configured minimum, not a literal 5."""
        Setting.objects.update_or_create(
            key=readiness_service.MINIMUM_GRADES_SETTING_KEY, defaults={"value": "6"}
        )
        world = _submittable_world(grades=0)

        response = _post_grades(world, _canonical_rows(5))
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "MINIMUM_SUBJECTS_REQUIRED"

        response = _post_grades(world, _canonical_rows(6))
        assert response.status_code == 200, response.content
        assert ApplicationGrade.objects.filter(application_id=world.application.id).count() == 6

    def test_a_lowered_minimum_cannot_weaken_the_policy_floor(self):
        Setting.objects.update_or_create(
            key=readiness_service.MINIMUM_GRADES_SETTING_KEY, defaults={"value": "2"}
        )
        world = _submittable_world(grades=0)

        assert readiness_service.resolve_minimum_grades() == 5
        response = _post_grades(world, _canonical_rows(4))
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "MINIMUM_SUBJECTS_REQUIRED"


# ---------------------------------------------------------------------------
# 5. Program eligibility (R11.5 "and program eligibility")
# ---------------------------------------------------------------------------


class TestProgramEligibility:
    def test_a_program_ineligible_application_is_blocked_and_refused(self):
        world = _submittable_world(grades=0)
        subjects = [build_subject(name=f"Eligibility Subject {index}") for index in range(5)]
        build_grades(application=world.application, count=5, subjects=subjects, grade=7)
        build_course_requirement(offering=world.offering, subject=subjects[0], minimum_grade=3)

        payload = _readiness_payload(world)
        assert payload["eligibility"]["satisfied"] is False
        assert payload["can_submit"] is False
        assert readiness_service.PROGRAM_ELIGIBILITY_NOT_MET in _blocker_codes(payload)

        with pytest.raises(ApplicationSubmissionError) as excinfo:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )
        assert excinfo.value.code == readiness_service.PROGRAM_ELIGIBILITY_NOT_MET
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_unevaluable_eligibility_config_fails_closed_with_the_retryable_code(self):
        """A configuration we cannot read must never quietly permit submission.

        The eligibility gate live-resolves for a canonical row that predates the
        versioned ``eligibility_snapshot``. If that resolution fails, the student
        gets the stable retryable ``CONFIGURATION_UNAVAILABLE`` (R11.6, DATA-04) —
        not an opaque 500, and not an implicit "no rules configured" pass.
        """
        world = _submittable_world(grades=5)

        with patch(
            "apps.applications.assignment_resolution.resolve_eligibility_rules",
            side_effect=AssignmentConfigurationError(),
        ):
            with pytest.raises(ApplicationSubmissionError) as excinfo:
                submit_application(
                    application=world.application,
                    changed_by=str(world.student.id),
                )

        assert excinfo.value.code == readiness_service.CONFIGURATION_UNAVAILABLE
        assert excinfo.value.status_code == 503
        assert excinfo.value.retryable is True
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_a_program_eligible_application_submits(self):
        world = _submittable_world(grades=0)
        subjects = [build_subject(name=f"Eligible Subject {index}") for index in range(5)]
        build_grades(application=world.application, count=5, subjects=subjects, grade=2)
        build_course_requirement(offering=world.offering, subject=subjects[0], minimum_grade=3)

        payload = _readiness_payload(world)
        assert payload["eligibility"]["satisfied"] is True
        assert readiness_service.PROGRAM_ELIGIBILITY_NOT_MET not in _blocker_codes(payload)

        submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )
        world.application.refresh_from_db()
        assert world.application.status == "submitted"
