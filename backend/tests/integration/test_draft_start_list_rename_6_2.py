"""Integration tests — valid server draft start / list / rename policy.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task 6.2.
Requirements: R10.1, R10.3, R10.9 · Finding: STU-12
Design: design.md §7.2 (Application Assignment — ``Application.id`` is the online
        draft identity; StartDraft accepts canonical offering + intake IDs),
        §8.2 (Frontend Draft Machine — multi-draft list keyed by application id,
        explicit new/resume intent), §14.2 (idempotency for create commands).

Required_Evidence (task 6.2): *"two-draft start/switch/resume API and browser
tests"*. The **API** half lives here (the browser/Playwright half is owned by
task 13.2 per design §16). These tests prove:

* a draft **start** requires the minimum canonical selection (program + intake)
  and is idempotent under an ``Idempotency-Key`` (R10.3/R10.9);
* a duplicate start is a **409 that never silently adopts** the existing id
  (steering: Student Draft Lifecycle);
* the **list** returns only the authenticated student's own drafts;
* two drafts can be **started, switched between, and resumed** by id, and a
  second student cannot observe or resume them (non-revealing 404);
* **rename** is a real, validated, owner-scoped server field (R10.9) — the
  finding-STU-12 "rename sends an unsupported field that is silently dropped"
  is closed.

Runs entirely against the ephemeral Django test DB and the in-process DRF test
client (never Neon / production).

**Validates: Requirements R10.1, R10.3, R10.9**
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
    build_profile,
    build_program_intake,
)

pytestmark = pytest.mark.django_db

DRAFTS_URL = "/api/v1/applications/drafts/"


def _rename_url(application_id) -> str:
    return f"/api/v1/applications/drafts/{application_id}/rename/"


@dataclass
class TwoOfferingWorld:
    """One institution + one student + two distinct (canonical program, intake)
    offerings the same student can start a draft against."""

    institution: object
    student: object
    program_a: object
    intake_a: object
    program_b: object
    intake_b: object


def _build_two_offering_world() -> TwoOfferingWorld:
    institution = build_institution(suffix="drafts")

    canonical_a = build_canonical_program(suffix="prog-a")
    offering_a = build_offering(institution=institution, canonical_program=canonical_a, suffix="off-a")
    intake_a = build_intake(suffix="intake-a")
    build_program_intake(offering=offering_a, intake=intake_a)

    canonical_b = build_canonical_program(suffix="prog-b")
    offering_b = build_offering(institution=institution, canonical_program=canonical_b, suffix="off-b")
    intake_b = build_intake(suffix="intake-b")
    build_program_intake(offering=offering_b, intake=intake_b)

    student = build_profile(role="student", suffix="drafter")
    return TwoOfferingWorld(
        institution=institution,
        student=student,
        program_a=canonical_a,
        intake_a=intake_a,
        program_b=canonical_b,
        intake_b=intake_b,
    )


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


def _start_payload(world: TwoOfferingWorld, *, program, intake, email, draft_name=None):
    payload = {
        "full_name": "Draft Applicant",
        "nrc_number": "123456/78/9",
        "date_of_birth": "2000-01-01",
        "sex": "female",
        "phone": "+260970000077",
        "email": email,
        "residence_town": "Lusaka",
        "country": "Zambia",
        "nationality": "Zambian",
        "program_id": str(program.id),
        "intake_id": str(intake.id),
        "institution_id": str(world.institution.id),
    }
    if draft_name is not None:
        payload["draft_name"] = draft_name
    return payload


# ---------------------------------------------------------------------------
# Start: minimum canonical selection + idempotency (R10.3, R10.9)
# ---------------------------------------------------------------------------


class TestStartDraftMinimumSelection:
    def test_start_without_canonical_selection_is_rejected(self):
        """A draft start with no canonical program+intake fails closed with a
        stable MINIMUM_SELECTION_REQUIRED error (R10.9) — never a legacy
        string-only draft or a 500."""
        world = _build_two_offering_world()
        client = _client(world.student)

        response = client.post(
            DRAFTS_URL,
            {
                "full_name": "No Selection Applicant",
                "date_of_birth": "2000-01-01",
                "sex": "female",
                "phone": "+260970000077",
                "email": "no-selection@example.com",
                "residence_town": "Lusaka",
            },
            format="json",
        )
        assert response.status_code == 400, (response.status_code, response.json())
        assert response.json().get("code") == "MINIMUM_SELECTION_REQUIRED"
        assert not Application.objects.filter(user_id=str(world.student.id)).exists()

    def test_start_persists_optional_draft_name(self):
        """A canonical draft start persists the optional ``draft_name`` label on
        the Application row (finding STU-12: it was silently dropped before)."""
        world = _build_two_offering_world()
        client = _client(world.student)

        response = client.post(
            DRAFTS_URL,
            _start_payload(
                world, program=world.program_a, intake=world.intake_a,
                email="named-draft@example.com", draft_name="My Nursing Application",
            ),
            format="json",
        )
        assert response.status_code == 201, (response.status_code, response.json())
        app = Application.objects.get(id=response.json()["data"]["id"])
        assert app.draft_name == "My Nursing Application"
        assert app.status == "draft"


class TestStartDraftIdempotency:
    def test_same_idempotency_key_returns_same_draft(self):
        """Replaying the start with the same Idempotency-Key + body returns the
        same draft and creates exactly one row (R10.3, design §14.2)."""
        world = _build_two_offering_world()
        client = _client(world.student)
        payload = _start_payload(
            world, program=world.program_a, intake=world.intake_a, email="idem@example.com",
        )

        first = client.post(DRAFTS_URL, payload, format="json", HTTP_IDEMPOTENCY_KEY="draft-start-key-1")
        assert first.status_code == 201, (first.status_code, first.json())
        second = client.post(DRAFTS_URL, payload, format="json", HTTP_IDEMPOTENCY_KEY="draft-start-key-1")
        assert second.status_code in (200, 201), (second.status_code, second.json())

        assert first.json()["data"]["id"] == second.json()["data"]["id"]
        assert Application.objects.filter(user_id=str(world.student.id), status="draft").count() == 1

    def test_duplicate_start_without_key_conflicts_and_never_adopts(self):
        """A second start for the same program+intake (no key) is a 409 that
        surfaces the existing id for the student to choose — it does NOT silently
        adopt/return it as a fresh 201 (steering: Student Draft Lifecycle)."""
        world = _build_two_offering_world()
        client = _client(world.student)
        payload = _start_payload(
            world, program=world.program_a, intake=world.intake_a, email="dup@example.com",
        )

        first = client.post(DRAFTS_URL, payload, format="json")
        assert first.status_code == 201, (first.status_code, first.json())

        second = client.post(DRAFTS_URL, payload, format="json")
        assert second.status_code == 409, (second.status_code, second.json())
        body = second.json()
        assert body.get("code") == "DUPLICATE_APPLICATION"
        # The conflict names the existing draft so the client can offer
        # "continue existing / pick different / cancel" — it is not a 201.
        assert body.get("existing_id") == first.json()["data"]["id"]


# ---------------------------------------------------------------------------
# List + switch/resume: own drafts only (R10.1)
# ---------------------------------------------------------------------------


class TestListAndResumeOwnership:
    def test_two_drafts_started_listed_and_switchable(self):
        """A student starts two distinct drafts, the list returns exactly those
        two, and each can be resumed (read) by its own application id."""
        world = _build_two_offering_world()
        client = _client(world.student)

        start_a = client.post(
            DRAFTS_URL,
            _start_payload(world, program=world.program_a, intake=world.intake_a, email="a@example.com"),
            format="json",
        )
        start_b = client.post(
            DRAFTS_URL,
            _start_payload(world, program=world.program_b, intake=world.intake_b, email="b@example.com"),
            format="json",
        )
        assert start_a.status_code == 201, start_a.json()
        assert start_b.status_code == 201, start_b.json()
        id_a = start_a.json()["data"]["id"]
        id_b = start_b.json()["data"]["id"]
        assert id_a != id_b

        listing = client.get(DRAFTS_URL)
        assert listing.status_code == 200
        payload = listing.json()
        rows = payload["data"] if isinstance(payload, dict) and "data" in payload else payload
        if isinstance(rows, dict) and "results" in rows:
            rows = rows["results"]
        listed_ids = {row["id"] for row in rows}
        assert {id_a, id_b} <= listed_ids

        # Resume (switch) each draft by id.
        for draft_id in (id_a, id_b):
            resumed = client.get(f"/api/v1/applications/drafts/{draft_id}/")
            assert resumed.status_code == 200, (draft_id, resumed.json())
            assert resumed.json()["data"]["id"] == draft_id

    def test_list_and_resume_never_cross_students(self):
        """A second student sees none of the first student's drafts and cannot
        resume one by id (non-revealing 404)."""
        world = _build_two_offering_world()
        owner_client = _client(world.student)

        start = owner_client.post(
            DRAFTS_URL,
            _start_payload(world, program=world.program_a, intake=world.intake_a, email="owner@example.com"),
            format="json",
        )
        assert start.status_code == 201, start.json()
        draft_id = start.json()["data"]["id"]

        other = build_profile(role="student", suffix="intruder")
        other_client = _client(other)

        listing = other_client.get(DRAFTS_URL)
        assert listing.status_code == 200
        payload = listing.json()
        rows = payload["data"] if isinstance(payload, dict) and "data" in payload else payload
        if isinstance(rows, dict) and "results" in rows:
            rows = rows["results"]
        assert all(row["id"] != draft_id for row in rows)

        resumed = other_client.get(f"/api/v1/applications/drafts/{draft_id}/")
        assert resumed.status_code == 404


# ---------------------------------------------------------------------------
# Rename: real, validated, owner-scoped server field (R10.9, STU-12)
# ---------------------------------------------------------------------------


class TestRenameDraft:
    def _start(self, client, world):
        response = client.post(
            DRAFTS_URL,
            _start_payload(world, program=world.program_a, intake=world.intake_a, email="rename@example.com"),
            format="json",
        )
        assert response.status_code == 201, response.json()
        return response.json()["data"]["id"]

    def test_rename_sets_validated_field(self):
        world = _build_two_offering_world()
        client = _client(world.student)
        draft_id = self._start(client, world)

        response = client.patch(_rename_url(draft_id), {"draft_name": "  Plan B  "}, format="json")
        assert response.status_code == 200, (response.status_code, response.json())
        assert response.json()["data"]["draft_name"] == "Plan B"
        assert Application.objects.get(id=draft_id).draft_name == "Plan B"

    def test_rename_rejects_blank(self):
        world = _build_two_offering_world()
        client = _client(world.student)
        draft_id = self._start(client, world)

        response = client.patch(_rename_url(draft_id), {"draft_name": "   "}, format="json")
        assert response.status_code == 400, (response.status_code, response.json())
        assert response.json().get("code") == "VALIDATION_ERROR"

    def test_rename_foreign_draft_masked_as_404(self):
        world = _build_two_offering_world()
        owner_client = _client(world.student)
        draft_id = self._start(owner_client, world)

        intruder = build_profile(role="student", suffix="rename-intruder")
        response = _client(intruder).patch(_rename_url(draft_id), {"draft_name": "hijack"}, format="json")
        assert response.status_code == 404
        # The victim draft is untouched.
        assert Application.objects.get(id=draft_id).draft_name != "hijack"

    def test_rename_does_not_mutate_assignment(self):
        """Rename is a narrow command — it touches only ``draft_name`` and never
        the canonical assignment IDs (design §7.2)."""
        world = _build_two_offering_world()
        client = _client(world.student)
        draft_id = self._start(client, world)
        before = Application.objects.get(id=draft_id)

        client.patch(
            _rename_url(draft_id),
            {"draft_name": "Renamed", "program_id": str(world.program_b.id), "intake_id": str(world.intake_b.id)},
            format="json",
        )
        after = Application.objects.get(id=draft_id)
        assert after.draft_name == "Renamed"
        assert str(after.canonical_program_id) == str(before.canonical_program_id)
        assert str(after.intake_ref_id) == str(before.intake_ref_id)
        assert str(after.program_offering_id) == str(before.program_offering_id)
