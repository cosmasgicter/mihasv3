"""Integration tests — transactional application selection change (task 6.4).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/``
Requirements: R7.2, R10.5 · Findings: STU-01, DATA-01
Design: design.md §7.2 (Application Assignment — "Generic PATCH never accepts
        assignment identifiers or their display snapshots. Before any payment
        exists, ``ChangeSelectionCommand`` may atomically reassign the draft,
        update every canonical ID/snapshot/requirement/eligibility/fee
        reference, clear invalid dependent answers, bump the optimistic version,
        and return a change summary. Payment activity makes assignment
        immutable."), §14.2 (idempotency + version conflict).

Required_Evidence (tasks.md 6.4): **"reroute success/rollback/payment-block/
cross-tenant tests"** — one class per case:

* :class:`TestRerouteSuccess`      — the successful transactional reroute
  (every canonical ID, display snapshot, configuration version, requirement +
  eligibility snapshot, fee, and dependent answer moves together) plus the
  generic-PATCH lock that makes this the only path.
* :class:`TestRerouteRollback`     — a failure anywhere in the command leaves
  the draft exactly as it was (no half-rerouted assignment).
* :class:`TestReroutePaymentBlock` — any payment activity rejects the reroute
  with a stable code and a non-empty recovery path.
* :class:`TestRerouteCrossTenant`  — another student's draft is a non-revealing
  404, and a trusted tenant host beats a cross-tenant institution override.

Runs entirely against the ephemeral Django test DB and the in-process DRF test
client (never Neon / production).

**Validates: Requirements R7.2, R10.5**
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application, ApplicationStatusHistory
from apps.catalog.models import InstitutionRequiredDocument
from tests.tenant_fixtures import (
    build_application,
    build_canonical_program,
    build_document,
    build_institution,
    build_institution_domain,
    build_intake,
    build_offering,
    build_payment,
    build_profile,
    build_program_intake,
)

pytestmark = pytest.mark.django_db


def _url(application_id) -> str:
    return f"/api/v1/applications/drafts/{application_id}/change-selection/"


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


# ---------------------------------------------------------------------------
# World: one institution, two offerings (A and B) the student can choose between
# ---------------------------------------------------------------------------


@dataclass
class RerouteWorld:
    institution: object
    student: object
    canonical_a: object
    offering_a: object
    intake_a: object
    canonical_b: object
    offering_b: object
    intake_b: object
    application: object


def _build_program_fee(offering, amount: Decimal, *, residency: str = "local"):
    """A canonical active ``ProgramFee`` for the offering (task 5.4 fee source)."""
    from apps.documents.models import ProgramFee

    return ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=offering,
        fee_type="application",
        residency_category=residency,
        amount=amount,
        currency="ZMW",
        is_active=True,
    )


def _build_reroute_world(*, fee_b: Decimal | None = Decimal("250.00")) -> RerouteWorld:
    institution = build_institution(suffix="reroute")

    canonical_a = build_canonical_program(suffix="reroute-a")
    offering_a = build_offering(
        institution=institution, canonical_program=canonical_a, suffix="reroute-a"
    )
    intake_a = build_intake(suffix="reroute-a")
    build_program_intake(offering=offering_a, intake=intake_a)
    _build_program_fee(offering_a, Decimal("153.00"))

    canonical_b = build_canonical_program(suffix="reroute-b")
    offering_b = build_offering(
        institution=institution,
        canonical_program=canonical_b,
        suffix="reroute-b",
    )
    intake_b = build_intake(suffix="reroute-b")
    build_program_intake(offering=offering_b, intake=intake_b)
    if fee_b is not None:
        _build_program_fee(offering_b, fee_b)

    # Distinct required-document configuration per canonical program so the
    # requirement snapshot provably moves with the reroute.
    InstitutionRequiredDocument.objects.create(
        id=uuid.uuid4(), institution=institution, canonical_program=canonical_a,
        document_type="transcript_a", label="Programme A Transcript",
        is_required=True, is_active=True,
    )
    InstitutionRequiredDocument.objects.create(
        id=uuid.uuid4(), institution=institution, canonical_program=canonical_b,
        document_type="portfolio_b", label="Programme B Portfolio",
        is_required=True, is_active=True,
    )

    student = build_profile(role="student", suffix="reroute")
    application = build_application(
        student=student,
        institution=institution,
        canonical_program=canonical_a,
        offering=offering_a,
        intake=intake_a,
        suffix="reroute",
        status="draft",
        configuration_version="cfg-stale",
        requirements_snapshot=[
            {"document_type": "transcript_a", "label": "Programme A Transcript", "required": True}
        ],
        eligibility_snapshot=[],
        assignment_version=1,
        eligibility_status="eligible",
        eligibility_score=88,
        eligibility_notes="Assessed against programme A",
        application_fee=Decimal("153.00"),
    )
    return RerouteWorld(
        institution=institution,
        student=student,
        canonical_a=canonical_a,
        offering_a=offering_a,
        intake_a=intake_a,
        canonical_b=canonical_b,
        offering_b=offering_b,
        intake_b=intake_b,
        application=application,
    )


def _reroute_body(world: RerouteWorld, **overrides) -> dict:
    body = {
        "program_id": str(world.canonical_b.id),
        "intake_id": str(world.intake_b.id),
    }
    body.update(overrides)
    return body


# ===========================================================================
# 1. Reroute success
# ===========================================================================


class TestRerouteSuccess:
    def test_reroute_moves_every_canonical_id_snapshot_and_dependent_answer(self):
        world = _build_reroute_world()
        response = _client(world.student).post(
            _url(world.application.id), _reroute_body(world), format="json"
        )
        assert response.status_code == 200, (response.status_code, response.json())
        payload = response.json()["data"]

        app = Application.objects.get(id=world.application.id)
        # Canonical IDs moved together...
        assert str(app.canonical_program_id) == str(world.canonical_b.id)
        assert str(app.program_offering_id) == str(world.offering_b.id)
        assert str(app.intake_ref_id) == str(world.intake_b.id)
        assert str(app.institution_ref_id) == str(world.institution.id)
        # ...and so did the display snapshots (no split identity — STU-01).
        assert app.program == world.canonical_b.name
        assert app.intake == world.intake_b.name
        assert app.institution == world.institution.name
        # Configuration + requirement + eligibility snapshots were re-derived.
        assert app.configuration_version not in (None, "", "cfg-stale")
        snapshot_types = {row["document_type"] for row in (app.requirements_snapshot or [])}
        assert "portfolio_b" in snapshot_types
        assert "transcript_a" not in snapshot_types
        assert isinstance(app.eligibility_snapshot, list)
        # Dependent answers computed under the old configuration were cleared.
        assert app.eligibility_status is None
        assert app.eligibility_score is None
        assert app.eligibility_notes is None
        # The fee snapshot was re-resolved from the NEW offering.
        assert app.application_fee == Decimal("250.00")
        # Optimistic versions bumped.
        assert app.assignment_version == 2
        assert app.version == 2

        # The response is a change summary the client can act on.
        summary = payload["change_summary"]
        assert summary["changed"] is True
        assert summary["classification"] == "reassignment"
        assert summary["previous"]["canonical_program_id"] == str(world.canonical_a.id)
        assert summary["current"]["canonical_program_id"] == str(world.canonical_b.id)
        assert sorted(summary["cleared_fields"]) == [
            "eligibility_notes", "eligibility_score", "eligibility_status",
        ]
        assert {row["document_type"] for row in summary["requirements_added"]} == {"portfolio_b"}
        assert {row["document_type"] for row in summary["requirements_removed"]} == {"transcript_a"}
        assert payload["program_id"] == str(world.canonical_b.id)
        assert payload["intake_id"] == str(world.intake_b.id)

    def test_reroute_reports_stale_uploads_without_destroying_evidence(self):
        world = _build_reroute_world()
        build_document(application=world.application, document_type="transcript_a")

        response = _client(world.student).post(
            _url(world.application.id), _reroute_body(world), format="json"
        )
        assert response.status_code == 200, response.json()
        summary = response.json()["data"]["change_summary"]
        assert summary["documents_no_longer_required"] == ["transcript_a"]
        assert [
            row["document_type"] for row in summary["documents_missing_for_new_selection"]
        ] == ["portfolio_b"]

        # The uploaded evidence itself is untouched (immutable versions are
        # task 7.3's territory — a reroute never silently deletes a file).
        from apps.documents.models import ApplicationDocument

        assert ApplicationDocument.objects.filter(
            application_id=world.application.id, document_type="transcript_a"
        ).exists()

    def test_reroute_writes_an_audit_history_row(self):
        world = _build_reroute_world()
        _client(world.student).post(
            _url(world.application.id), _reroute_body(world), format="json"
        )
        entry = (
            ApplicationStatusHistory.objects.filter(application_id=world.application.id)
            .order_by("-created_at")
            .first()
        )
        assert entry is not None
        assert entry.changes["action"] == "application.change_selection"
        assert entry.changes["previous"]["canonical_program_id"] == str(world.canonical_a.id)
        assert entry.changes["current"]["canonical_program_id"] == str(world.canonical_b.id)

    def test_replaying_the_same_selection_is_an_idempotent_no_op(self):
        world = _build_reroute_world()
        client = _client(world.student)
        first = client.post(_url(world.application.id), _reroute_body(world), format="json")
        assert first.status_code == 200
        version_after_first = Application.objects.get(id=world.application.id).assignment_version

        second = client.post(_url(world.application.id), _reroute_body(world), format="json")
        assert second.status_code == 200, second.json()
        assert second.json()["data"]["change_summary"]["changed"] is False
        assert second.json()["data"]["change_summary"]["classification"] == "unchanged"
        assert (
            Application.objects.get(id=world.application.id).assignment_version
            == version_after_first
        )

    def test_stale_assignment_version_is_a_version_conflict(self):
        world = _build_reroute_world()
        response = _client(world.student).post(
            _url(world.application.id),
            _reroute_body(world, assignment_version=99),
            format="json",
        )
        assert response.status_code == 409
        assert response.json()["code"] == "VERSION_CONFLICT"
        app = Application.objects.get(id=world.application.id)
        assert str(app.canonical_program_id) == str(world.canonical_a.id)
        assert app.assignment_version == 1

    def test_display_strings_are_rejected_as_selection_input(self):
        """Canonical IDs only (R7.1/DATA-01) — a programme name is not accepted."""
        world = _build_reroute_world()
        response = _client(world.student).post(
            _url(world.application.id),
            {"program": world.canonical_b.name, "intake": world.intake_b.name},
            format="json",
        )
        assert response.status_code == 400
        assert response.json()["code"] == "VALIDATION_ERROR"

    def test_generic_patch_can_no_longer_move_the_assignment(self):
        """The removal half of task 6.4 (finding STU-01): a generic draft PATCH
        that carries assignment/display fields leaves the assignment intact."""
        world = _build_reroute_world()
        response = _client(world.student).patch(
            f"/api/v1/applications/drafts/{world.application.id}/",
            {
                "program": "Hand-written Programme",
                "intake": "Hand-written Intake",
                "institution": "Hand-written School",
                "full_name": "Updated Person",
                "expected_version": world.application.version,
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="generic-patch-assignment-lock",
        )
        assert response.status_code == 200, response.json()
        app = Application.objects.get(id=world.application.id)
        assert app.program == world.canonical_a.name
        assert app.intake == world.intake_a.name
        assert app.institution == world.institution.name
        assert str(app.canonical_program_id) == str(world.canonical_a.id)
        # The ordinary draft-safe edit in the same payload still applied.
        assert app.full_name == "Updated Person"


# ===========================================================================
# 2. Rollback
# ===========================================================================


class TestRerouteRollback:
    def test_failure_after_the_write_rolls_the_whole_reroute_back(self):
        """A failure in a later step of the command must leave NO partial
        reassignment — every canonical ID, snapshot, and dependent answer keeps
        its previous value."""
        world = _build_reroute_world()
        before = Application.objects.get(id=world.application.id)

        with mock.patch(
            "apps.applications.change_selection_service._uploaded_document_types",
            side_effect=RuntimeError("injected failure after the assignment write"),
        ):
            response = _client(world.student).post(
                _url(world.application.id), _reroute_body(world), format="json"
            )

        assert response.status_code == 500
        assert response.json()["code"] == "INTERNAL_ERROR"

        after = Application.objects.get(id=world.application.id)
        assert str(after.canonical_program_id) == str(before.canonical_program_id)
        assert str(after.program_offering_id) == str(before.program_offering_id)
        assert str(after.intake_ref_id) == str(before.intake_ref_id)
        assert after.program == before.program
        assert after.intake == before.intake
        assert after.configuration_version == before.configuration_version
        assert after.requirements_snapshot == before.requirements_snapshot
        assert after.eligibility_status == before.eligibility_status
        assert after.eligibility_score == before.eligibility_score
        assert after.application_fee == before.application_fee
        assert after.assignment_version == before.assignment_version
        assert after.version == before.version

    def test_configuration_failure_fails_closed_and_changes_nothing(self):
        """A dependency failure returns the stable retryable code and never a
        partially-rerouted draft with empty requirements (DATA-04, R7.5)."""
        from apps.applications.assignment_resolution import AssignmentConfigurationError

        world = _build_reroute_world()
        with mock.patch(
            "apps.catalog.services.OfferingAssignmentService.required_documents",
            side_effect=AssignmentConfigurationError(),
        ):
            response = _client(world.student).post(
                _url(world.application.id), _reroute_body(world), format="json"
            )

        assert response.status_code == 503
        body = response.json()
        assert body["code"] == "CONFIGURATION_UNAVAILABLE"
        assert body["retryable"] is True

        app = Application.objects.get(id=world.application.id)
        assert str(app.canonical_program_id) == str(world.canonical_a.id)
        assert app.assignment_version == 1
        assert app.requirements_snapshot == [
            {"document_type": "transcript_a", "label": "Programme A Transcript", "required": True}
        ]

    def test_duplicate_target_is_rejected_without_mutating(self):
        world = _build_reroute_world()
        # A second non-terminal application already holds the target selection.
        build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_b,
            offering=world.offering_b,
            intake=world.intake_b,
            suffix="existing-b",
            status="submitted",
        )

        response = _client(world.student).post(
            _url(world.application.id), _reroute_body(world), format="json"
        )
        assert response.status_code == 409
        body = response.json()
        assert body["code"] == "DUPLICATE_APPLICATION"
        assert body["existing_id"]

        app = Application.objects.get(id=world.application.id)
        assert str(app.canonical_program_id) == str(world.canonical_a.id)
        assert app.assignment_version == 1

    def test_target_without_an_eligible_offering_is_rejected_without_mutating(self):
        world = _build_reroute_world()
        # An intake nobody offers the target programme for.
        orphan_intake = build_intake(suffix="orphan")

        response = _client(world.student).post(
            _url(world.application.id),
            _reroute_body(world, intake_id=str(orphan_intake.id)),
            format="json",
        )
        assert response.status_code == 400
        assert response.json()["code"] == "NO_ELIGIBLE_OFFERING"
        app = Application.objects.get(id=world.application.id)
        assert str(app.intake_ref_id) == str(world.intake_a.id)
        assert app.assignment_version == 1


# ===========================================================================
# 3. Payment block
# ===========================================================================


class TestReroutePaymentBlock:
    @pytest.mark.parametrize(
        "payment_status",
        ["pending", "deferred", "successful", "force_approved", "failed", "expired"],
    )
    def test_any_payment_activity_blocks_the_reroute(self, payment_status):
        """R10.5: *any* payment activity makes the assignment immutable."""
        world = _build_reroute_world()
        build_payment(application=world.application, status=payment_status)

        response = _client(world.student).post(
            _url(world.application.id), _reroute_body(world), format="json"
        )
        assert response.status_code == 409, (response.status_code, response.json())
        body = response.json()
        assert body["code"] == "ASSIGNMENT_LOCKED_BY_PAYMENT"

        app = Application.objects.get(id=world.application.id)
        assert str(app.canonical_program_id) == str(world.canonical_a.id)
        assert app.program == world.canonical_a.name
        assert app.assignment_version == 1

    def test_payment_block_exposes_a_non_empty_recovery_path(self):
        world = _build_reroute_world()
        build_payment(application=world.application, status="successful")

        body = _client(world.student).post(
            _url(world.application.id), _reroute_body(world), format="json"
        ).json()
        recovery = body["recovery"]
        assert recovery["reason"] == "payment_activity"
        actions = {entry["action"] for entry in recovery["actions"]}
        assert actions == {
            "continue-current", "start-new-application", "contact-admissions",
        }
        for entry in recovery["actions"]:
            assert entry["label"] and entry["href"]

    def test_paid_application_can_still_replay_its_own_unchanged_selection(self):
        """The lock is on *reassignment*: re-sending the current selection never
        wedges a paid draft. The first replay may refresh a stale configuration
        snapshot (a repair, not a reroute); the next one is a pure no-op."""
        world = _build_reroute_world()
        build_payment(application=world.application, status="successful")
        own_selection = {
            "program_id": str(world.canonical_a.id),
            "intake_id": str(world.intake_a.id),
        }
        client = _client(world.student)

        first = client.post(_url(world.application.id), own_selection, format="json")
        assert first.status_code == 200, first.json()
        assert first.json()["data"]["change_summary"]["classification"] != "reassignment"
        app = Application.objects.get(id=world.application.id)
        assert str(app.canonical_program_id) == str(world.canonical_a.id)
        assert str(app.program_offering_id) == str(world.offering_a.id)
        assert str(app.intake_ref_id) == str(world.intake_a.id)
        # A repair never clears the student's dependent answers.
        assert app.eligibility_status == "eligible"
        assert app.eligibility_score == 88

        second = client.post(_url(world.application.id), own_selection, format="json")
        assert second.status_code == 200, second.json()
        summary = second.json()["data"]["change_summary"]
        assert summary["changed"] is False
        assert summary["classification"] == "unchanged"


# ===========================================================================
# 4. Cross-tenant
# ===========================================================================


class TestRerouteCrossTenant:
    def test_another_students_draft_is_a_non_revealing_404(self):
        world = _build_reroute_world()
        intruder = build_profile(role="student", suffix="intruder")

        response = _client(intruder).post(
            _url(world.application.id), _reroute_body(world), format="json"
        )
        assert response.status_code == 404
        body = response.json()
        assert body["code"] == "NOT_FOUND"
        # No tenant/programme detail leaks in the denial.
        serialized = str(body)
        assert world.canonical_a.name not in serialized
        assert world.institution.name not in serialized

        app = Application.objects.get(id=world.application.id)
        assert str(app.canonical_program_id) == str(world.canonical_a.id)
        assert app.assignment_version == 1

    def test_trusted_tenant_host_beats_a_cross_tenant_institution_override(self):
        """TEN-10 / R2.2: a resolved tenant host wins; an explicit other-tenant
        institution is rejected with no mutation."""
        world = _build_reroute_world()
        other_institution = build_institution(suffix="other-tenant")
        domain = build_institution_domain(
            institution=world.institution, status="active", is_active=True
        )

        response = _client(world.student).post(
            _url(world.application.id),
            _reroute_body(world, institution_id=str(other_institution.id)),
            format="json",
            HTTP_HOST=domain.hostname,
        )
        assert response.status_code == 403, (response.status_code, response.json())
        assert response.json()["code"] == "INSTITUTION_OVERRIDE_NOT_PERMITTED"

        app = Application.objects.get(id=world.application.id)
        assert str(app.canonical_program_id) == str(world.canonical_a.id)
        assert app.assignment_version == 1

    def test_same_name_other_tenant_offering_is_never_selected(self):
        """Two tenants offer the SAME canonical program on the SAME intake: the
        reroute must resolve only the tenant bound to the request."""
        shared_canonical = build_canonical_program(suffix="shared-name")
        shared_intake = build_intake(suffix="shared-name")

        institution_a = build_institution(suffix="tenant-a")
        offering_a = build_offering(
            institution=institution_a, canonical_program=shared_canonical, suffix="tenant-a"
        )
        build_program_intake(offering=offering_a, intake=shared_intake)
        InstitutionRequiredDocument.objects.create(
            id=uuid.uuid4(), institution=institution_a,
            document_type="tenant_a_doc", label="Tenant A Doc",
            is_required=True, is_active=True,
        )

        institution_b = build_institution(suffix="tenant-b")
        offering_b = build_offering(
            institution=institution_b, canonical_program=shared_canonical, suffix="tenant-b"
        )
        build_program_intake(offering=offering_b, intake=shared_intake)
        InstitutionRequiredDocument.objects.create(
            id=uuid.uuid4(), institution=institution_b,
            document_type="tenant_b_doc", label="Tenant B Doc",
            is_required=True, is_active=True,
        )

        # The student's draft starts on a third, unrelated selection in tenant A.
        start_canonical = build_canonical_program(suffix="start-a")
        start_offering = build_offering(
            institution=institution_a, canonical_program=start_canonical, suffix="start-a"
        )
        start_intake = build_intake(suffix="start-a")
        build_program_intake(offering=start_offering, intake=start_intake)
        student = build_profile(role="student", suffix="samename")
        application = build_application(
            student=student, institution=institution_a,
            canonical_program=start_canonical, offering=start_offering,
            intake=start_intake, suffix="samename", status="draft",
        )

        domain_a = build_institution_domain(
            institution=institution_a, status="active", is_active=True
        )
        response = _client(student).post(
            _url(application.id),
            {"program_id": str(shared_canonical.id), "intake_id": str(shared_intake.id)},
            format="json",
            HTTP_HOST=domain_a.hostname,
        )
        assert response.status_code == 200, (response.status_code, response.json())

        app = Application.objects.get(id=application.id)
        assert str(app.institution_ref_id) == str(institution_a.id)
        assert str(app.program_offering_id) == str(offering_a.id)
        assert str(app.program_offering_id) != str(offering_b.id)
        snapshot_types = {row["document_type"] for row in (app.requirements_snapshot or [])}
        assert "tenant_a_doc" in snapshot_types
        assert "tenant_b_doc" not in snapshot_types
