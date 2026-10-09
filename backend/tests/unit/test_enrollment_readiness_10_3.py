"""Transactional enrollment readiness and confirmation (admissions-v2 task 10.3).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/``
Requirements: R13.2, R13.9, R17.1
Findings:     STU-15, DATA-03
Design:       design.md §11.2 ("Enrollment readiness is server-authored.
              Confirmation locks the application and offer/enrollment record,
              rechecks status, all mandatory conditions, deadline, capacity, and
              existing enrollment, then commits idempotently.")

The `_Evidence:` line for task 10.3 names four things — **concurrent confirm,
deadline, missing-condition, and success** — and each has a class here:

* :class:`TestSuccessfulConfirmation` — the golden path, for both an
  unconditional offer and a conditional one whose conditions are all accepted.
* :class:`TestMissingCondition` — a conditional offer is refused while any
  condition is outstanding, **including** task 10.2's two states that the
  pre-10.3 pair of ``status="pending"`` / ``status="expired"`` queries treated as
  satisfied.
* :class:`TestDeadline` — the deadline is published with a countdown, refuses a
  confirmation once passed, and is re-read **inside** the lock.
* :class:`TestConcurrentConfirmation` — two simultaneous confirmations of one
  application produce exactly one enrollment and one history row, and a
  confirmation that races a condition rejection loses.

Plus the contract itself (:class:`TestReadinessContract`,
:class:`TestReadContract`), the authority mask (:class:`TestConfirmAuthority`),
and the guards that keep the two evaluations one evaluation
(:class:`TestOneEvaluator`).

Every DB-backed test runs under ``production_scope``, so what is measured is the
real membership/grant-derived capability model and never a test-settings
shortcut.

**Validates: Requirements R13.2, R13.9, R17.1**
"""

from __future__ import annotations

import ast
import inspect
import pathlib
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications import condition_evidence_service as conditions
from apps.applications import enrollment_service as enrollment
from apps.applications.enrollment_service import (
    EnrollmentError,
    EnrollmentService,
    evaluate_enrollment_readiness,
)
from apps.applications.models import (
    Application,
    ApplicationCondition,
    ApplicationStatusHistory,
)
from apps.catalog.models import ProgramIntake
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_application,
    build_membership,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def confirm_url(application_id) -> str:
    return f"/api/v1/applications/{application_id}/confirm-enrollment/"


def detail_url(application_id) -> str:
    return f"/api/v1/applications/{application_id}/"


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name or "T",
                "last_name": profile.last_name or "S",
            }
        )
    )
    return client


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


def _offer(world, *, status="approved", days_to_deadline=14):
    """Put the world's application into an offer state with a deadline."""
    application = world.application
    application.status = status
    application.decision_date = timezone.now()
    application.enrollment_confirmation_deadline = timezone.now() + timedelta(
        days=days_to_deadline
    )
    application.save(
        update_fields=["status", "decision_date", "enrollment_confirmation_deadline"]
    )
    return application


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture(autouse=True)
def no_outbound_notification(monkeypatch):
    """The confirmation notification is task 10.1's gate, not this task's claim.

    Silencing the send keeps these tests about the transaction. That the message
    goes through one gate is asserted by 10.1's own suite; here it would only add
    a dependency on the communication template rows.
    """
    monkeypatch.setattr(
        enrollment, "_send_enrollment_notification", lambda application: None
    )


# ---------------------------------------------------------------------------
# 1. The readiness contract
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestReadinessContract:
    """Readiness is a value with stable codes, a definition, and an action.

    **Validates: Requirements R13.9**
    """

    def test_an_unconditional_offer_within_its_deadline_is_confirmable(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world)

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.state == "confirmable"
        assert readiness.can_confirm is True
        assert readiness.blockers == []
        assert readiness.deadline is not None
        assert readiness.deadline_passed is False
        assert readiness.days_remaining == 13  # 14 days minus the elapsed moment
        assert readiness.definition.strip()

    def test_every_state_publishes_a_definition(self):
        """A definition travels with every label (9.1/9.4/10.2's rule)."""
        for state, definition in enrollment.ENROLLMENT_STATE_DEFINITIONS.items():
            assert definition.strip(), state
        assert set(enrollment.ENROLLMENT_STATE_DEFINITIONS) == {
            "confirmable",
            "blocked",
            "confirmed",
            "not_applicable",
        }

    def test_a_non_offer_status_is_not_applicable_rather_than_blocked(self):
        """"Not your turn" and "you are stuck" are different facts."""
        world = build_tenant_world(application_status="under_review")

        readiness = evaluate_enrollment_readiness(world.application)

        assert readiness.state == "not_applicable"
        assert readiness.can_confirm is False
        assert readiness.blocker_codes == [enrollment.INVALID_STATUS_FOR_ENROLLMENT]

    def test_an_enrolled_application_reads_as_confirmed_not_blocked(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="approved")
        application.status = "enrolled"
        application.save(update_fields=["status"])

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.state == "confirmed"
        assert readiness.can_confirm is False
        assert readiness.existing_enrollment["this_application"] is True
        assert readiness.blocker_codes == [enrollment.ALREADY_ENROLLED]

    def test_every_blocker_carries_a_labelled_next_action(self):
        """No dead ends — 6.5's rule applied to this surface."""
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved", days_to_deadline=-1)
        _condition(application, status=conditions.CONDITION_OPEN)

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.state == "blocked"
        assert len(readiness.blockers) >= 2
        actions = readiness.allowed_actions()
        assert actions, "a blocked student must always have something to do"
        assert all(action["label"].strip() for action in actions)
        # The confirm action is not offered while a blocker stands.
        assert "confirm-enrollment" not in {action["action"] for action in actions}

    def test_no_blocker_is_advertised_as_retryable(self):
        """None of these clear by trying again, so none says it does."""
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved", days_to_deadline=-1)
        _condition(application, status=conditions.CONDITION_CHANGES_REQUIRED)

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.blockers
        assert all(blocker.retryable is False for blocker in readiness.blockers)

    def test_the_payload_is_json_serialisable_and_carries_no_reviewer_identity(self):
        import json

        world = build_tenant_world(application_status="draft")
        application = _offer(world)
        _condition(application, status=conditions.CONDITION_VERIFIED)

        payload = evaluate_enrollment_readiness(application).to_payload()
        blob = json.dumps(payload)

        assert '"can_confirm"' in blob
        # The student needs the decision, not which member of staff made it
        # (10.2 §8's rule, restated here because the same temptation exists).
        assert "reviewed_by" not in blob
        assert "verified_by" not in blob


# ---------------------------------------------------------------------------
# 2. Missing condition (Required_Evidence)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestMissingCondition:
    """A conditional offer enrolls only once every condition is resolved.

    **Validates: Requirements R13.9**
    """

    @pytest.mark.parametrize(
        "state",
        [
            conditions.CONDITION_OPEN,
            conditions.CONDITION_EVIDENCE_SUBMITTED,
            conditions.CONDITION_CHANGES_REQUIRED,
        ],
    )
    def test_every_non_terminal_condition_state_blocks_confirmation(self, state):
        """The heart of this task's half of STU-15.

        Before 10.3 the gate asked two questions — is any condition ``pending``,
        is any ``expired`` — so task 10.2's ``evidence_submitted`` and
        ``changes_required`` were **invisible** and counted as satisfied. A
        student whose evidence had just been rejected could confirm.
        """
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved")
        _condition(application, status=state)

        with pytest.raises(EnrollmentError) as exc:
            EnrollmentService.confirm_enrollment(str(application.id), str(world.student.id))

        assert exc.value.code == enrollment.CONDITIONS_NOT_MET
        assert exc.value.status_code == 400
        application.refresh_from_db()
        assert application.status == "conditionally_approved"

    def test_the_outstanding_set_is_derived_from_the_state_machine(self):
        """Not a second list of status strings — 10.2's table is the authority."""
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved")
        for state in conditions.CONDITION_STATES:
            _condition(application, status=state)

        tally = enrollment.condition_tally(application.id)

        assert tally["total"] == len(conditions.CONDITION_STATES)
        assert tally["outstanding"] == len(
            set(conditions.CONDITION_STATES) - conditions.CONDITION_TERMINAL_STATES
        )
        assert tally["satisfied"] is False
        assert {row["state"] for row in tally["outstanding_conditions"]} == set(
            conditions.CONDITION_STATES
        ) - conditions.CONDITION_TERMINAL_STATES

    def test_the_outstanding_conditions_say_who_they_are_waiting_on(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved")
        _condition(application, status=conditions.CONDITION_EVIDENCE_SUBMITTED)

        tally = enrollment.condition_tally(application.id)

        assert tally["outstanding_conditions"][0]["waiting_on"] == "school"

    @pytest.mark.parametrize(
        "state", [conditions.CONDITION_VERIFIED, conditions.CONDITION_WAIVED]
    )
    def test_an_accepted_or_waived_condition_does_not_block(self, state):
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved")
        _condition(application, status=state)

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.conditions["accepted"] == 1
        assert readiness.can_confirm is True

    def test_an_expired_condition_is_resolved_but_counted_separately(self):
        """An expired condition is terminal, so it does not block *here*.

        The application-level consequence of an expired condition is
        ``ConditionManager.auto_promote_if_all_met``'s auto-rejection, which owns
        that decision. Duplicating it as a second enrollment blocker would give
        the platform two answers to one question.
        """
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved")
        _condition(application, status=conditions.CONDITION_EXPIRED)

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.conditions["expired"] == 1
        assert readiness.conditions["accepted"] == 0
        assert readiness.conditions["satisfied"] is True

    def test_an_unconditional_offer_is_unaffected_by_a_stray_condition_row(self):
        """The condition gate applies to a conditional offer, as it always did."""
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="approved")
        _condition(application, status=conditions.CONDITION_OPEN)

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.can_confirm is True


# ---------------------------------------------------------------------------
# 3. Deadline (Required_Evidence)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDeadline:
    """The deadline is published, counted down, and enforced under the lock.

    **Validates: Requirements R13.2, R13.9**
    """

    def test_a_passed_deadline_refuses_confirmation(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world, days_to_deadline=-1)

        with pytest.raises(EnrollmentError) as exc:
            EnrollmentService.confirm_enrollment(str(application.id), str(world.student.id))

        assert exc.value.code == enrollment.DEADLINE_PASSED
        assert exc.value.status_code == 400
        application.refresh_from_db()
        assert application.status == "approved"

    def test_the_countdown_is_server_authored(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world, days_to_deadline=3)

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.seconds_remaining is not None
        assert 2 * 86400 < readiness.seconds_remaining <= 3 * 86400
        assert readiness.days_remaining == 2

    def test_an_overdue_countdown_is_negative_rather_than_clamped(self):
        """"0 days left" and "the deadline passed" are different facts."""
        world = build_tenant_world(application_status="draft")
        application = _offer(world, days_to_deadline=-5)

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.deadline_passed is True
        assert readiness.seconds_remaining is not None
        assert readiness.seconds_remaining < 0

    def test_no_deadline_is_not_a_passed_deadline(self):
        """A missing deadline must not fail closed into an unusable offer."""
        world = build_tenant_world(application_status="draft")
        application = _offer(world)
        application.enrollment_confirmation_deadline = None
        application.save(update_fields=["enrollment_confirmation_deadline"])

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.deadline is None
        assert readiness.deadline_passed is False
        assert readiness.seconds_remaining is None
        assert readiness.can_confirm is True

    def test_a_deadline_shortened_after_the_pre_check_still_refuses(self, monkeypatch):
        """The in-lock re-read is what makes this refusable at all.

        Pre-10.3 the deadline was read **before** ``transaction.atomic()``
        opened, so a deadline moved in between was invisible and the confirmation
        committed. The re-evaluation happens on the locked row, so a concurrent
        change is observed. Simulated here by moving the deadline the instant the
        application row is locked.
        """
        world = build_tenant_world(application_status="draft")
        application = _offer(world, days_to_deadline=5)

        original = Application.objects.select_for_update

        def _shorten_then_lock(*args, **kwargs):
            Application.objects.filter(id=application.id).update(
                enrollment_confirmation_deadline=timezone.now() - timedelta(hours=1)
            )
            monkeypatch.setattr(Application.objects, "select_for_update", original)
            return original(*args, **kwargs)

        monkeypatch.setattr(Application.objects, "select_for_update", _shorten_then_lock)

        with pytest.raises(EnrollmentError) as exc:
            EnrollmentService.confirm_enrollment(str(application.id), str(world.student.id))

        assert exc.value.code == enrollment.DEADLINE_PASSED
        application.refresh_from_db()
        assert application.status == "approved"


# ---------------------------------------------------------------------------
# 4. Success (Required_Evidence)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSuccessfulConfirmation:
    """The golden path, for both offer shapes.

    **Validates: Requirements R13.9, R17.1**
    """

    def test_an_approved_application_enrolls(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world)

        result = EnrollmentService.confirm_enrollment(
            str(application.id), str(world.student.id)
        )

        assert result.status == "enrolled"
        application.refresh_from_db()
        assert application.status == "enrolled"
        assert ApplicationStatusHistory.objects.filter(
            application_id=application.id, new_status="enrolled"
        ).count() == 1

    def test_a_conditional_offer_with_every_condition_accepted_enrolls(self):
        """The other half of STU-15: the backend always allowed this.

        The browser hid it behind ``status === 'approved'``, so a student who had
        satisfied every condition was shown nothing to do.
        """
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved")
        _condition(application, status=conditions.CONDITION_VERIFIED)
        _condition(application, status=conditions.CONDITION_WAIVED)

        result = EnrollmentService.confirm_enrollment(
            str(application.id), str(world.student.id)
        )

        assert result.status == "enrolled"

    def test_the_readiness_after_success_reads_as_confirmed(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world)

        EnrollmentService.confirm_enrollment(str(application.id), str(world.student.id))
        application.refresh_from_db()

        readiness = evaluate_enrollment_readiness(application)
        assert readiness.state == "confirmed"
        assert readiness.can_confirm is False

    def test_a_second_confirmation_is_idempotent_rather_than_an_error(self):
        """Design §11.2's "commits idempotently", without an Idempotency-Key.

        A retried request after a dropped response must not tell the student
        their confirmed place is invalid.
        """
        world = build_tenant_world(application_status="draft")
        application = _offer(world)

        first = EnrollmentService.confirm_enrollment(
            str(application.id), str(world.student.id)
        )
        second = EnrollmentService.confirm_enrollment(
            str(application.id), str(world.student.id)
        )

        assert first.status == second.status == "enrolled"
        assert ApplicationStatusHistory.objects.filter(
            application_id=application.id, new_status="enrolled"
        ).count() == 1

    def test_the_endpoint_returns_the_envelope_with_the_readiness(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world)

        response = _client_for(world.student).post(confirm_url(application.id))

        assert response.status_code == 200
        assert response.data["success"] is True
        assert response.data["data"]["status"] == "enrolled"
        assert response.data["data"]["enrollment"]["state"] == "confirmed"


# ---------------------------------------------------------------------------
# 5. Capacity and existing enrollment under the lock
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCapacityAndExistingEnrollment:
    """The two gates design §11.2 names that had no implementation at all.

    **Validates: Requirements R13.9, R17.1**
    """

    def test_a_conditional_offer_is_refused_when_the_offering_has_no_seat(self):
        """The gate that actually bites.

        ``SEAT_STATUSES`` does not include ``conditionally_approved``, so a
        conditional offer holds no seat. Confirming it puts a body in a cohort
        that never claimed one, which is why capacity has to be rechecked here.
        """
        world = build_tenant_world(application_status="draft", max_capacity=1)
        application = _offer(world, status="conditionally_approved")
        _condition(application, status=conditions.CONDITION_VERIFIED)
        # Somebody else already holds the single seat.
        build_application(
            student=build_profile(role="student"),
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            status="submitted",
        )

        with pytest.raises(EnrollmentError) as exc:
            EnrollmentService.confirm_enrollment(str(application.id), str(world.student.id))

        assert exc.value.code == enrollment.PROGRAM_CAPACITY_REACHED
        assert exc.value.status_code == 409
        application.refresh_from_db()
        assert application.status == "conditionally_approved"

    def test_an_approved_application_is_measured_without_its_own_seat(self):
        """"Is there room for me", never "is the intake full including me".

        Exactly the predicate ``take_seat_for_submission`` evaluates. An approved
        application already occupies a seat, so counting itself against the limit
        would refuse every last-seat student their own place.
        """
        world = build_tenant_world(application_status="draft", max_capacity=1)
        application = _offer(world, status="approved")

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.capacity["limit"] == 1
        assert readiness.capacity["occupied"] == 0
        assert readiness.can_confirm is True

    def test_an_unlimited_offering_never_blocks_on_capacity(self):
        world = build_tenant_world(application_status="draft", max_capacity=None)
        # ``build_tenant_world`` floors the *intake* limit at 100; unlimited means
        # neither level sets one, which is what ``capacity_limit`` resolves.
        world.intake.max_capacity = None
        world.intake.save(update_fields=["max_capacity"])
        application = _offer(world, status="conditionally_approved")

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.capacity["limit"] is None
        assert readiness.capacity["satisfied"] is True
        assert readiness.can_confirm is True

    def test_a_second_enrollment_on_the_same_offering_is_a_conflict(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved")
        _condition(application, status=conditions.CONDITION_VERIFIED)
        already = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            status="enrolled",
        )

        with pytest.raises(EnrollmentError) as exc:
            EnrollmentService.confirm_enrollment(str(application.id), str(world.student.id))

        assert exc.value.code == enrollment.DUPLICATE_ENROLLMENT
        assert exc.value.status_code == 409
        readiness = evaluate_enrollment_readiness(application)
        assert readiness.existing_enrollment["other_application_id"] == str(already.id)

    def test_a_same_name_offering_at_another_tenant_is_not_a_duplicate(self):
        """Keyed on the canonical identity, never the display strings (DATA-02).

        Two schools offering the *same canonical program* on the same intake are
        two cohorts. A student enrolled at one is not enrolled at the other.
        """
        world_a, world_b = build_two_tenant_worlds(application_status="draft")
        application = _offer(world_b.application and world_b, status="approved")
        # The same person, enrolled at the *other* school's offering.
        other_student = world_b.student
        build_application(
            student=other_student,
            institution=world_a.institution,
            canonical_program=world_a.canonical_program,
            offering=world_a.offering,
            intake=world_a.intake,
            status="enrolled",
        )

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.existing_enrollment["other_application_id"] is None
        assert readiness.can_confirm is True

    def test_a_legacy_row_without_canonical_ids_is_not_constrained(self):
        """Strictly additive, exactly like the 5.2/5.3 seams this reuses."""
        world = build_tenant_world(application_status="draft", with_canonical_ids=False)
        application = _offer(world)

        readiness = evaluate_enrollment_readiness(application)

        assert readiness.capacity["canonical"] is False
        assert readiness.existing_enrollment["canonical"] is False
        assert readiness.can_confirm is True


# ---------------------------------------------------------------------------
# 6. Concurrent confirm (Required_Evidence) — Postgres row locks
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="Concurrent confirmation requires PostgreSQL row locks "
    "(SELECT ... FOR UPDATE is a no-op on SQLite).",
)
@pytest.mark.django_db(transaction=True)
class TestConcurrentConfirmation:
    """Two confirmations, one enrollment.

    **Validates: Requirements R13.9, R17.1**
    """

    def test_concurrent_confirmations_produce_exactly_one_enrollment(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world)
        application_id = str(application.id)
        user_id = str(world.student.id)
        workers = 6

        barrier = threading.Barrier(workers)
        lock = threading.Lock()
        results: dict[str, int] = {"enrolled": 0, "refused": 0}

        def worker(_):
            from django.db import connection as tconn

            try:
                barrier.wait(timeout=20)
                try:
                    result = EnrollmentService.confirm_enrollment(application_id, user_id)
                    with lock:
                        results["enrolled" if result.status == "enrolled" else "refused"] += 1
                except EnrollmentError:
                    with lock:
                        results["refused"] += 1
            finally:
                tconn.close()

        try:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                list(pool.map(worker, range(workers)))

            # Every caller either committed the transition or observed the
            # committed one — nobody is told their confirmed place is invalid.
            assert results["enrolled"] == workers, results
            # But the transition happened exactly once: one history row, so one
            # student number assignment, one notification, one audit trail.
            assert (
                ApplicationStatusHistory.objects.filter(
                    application_id=application_id, new_status="enrolled"
                ).count()
                == 1
            )
            assert Application.objects.get(id=application_id).status == "enrolled"
        finally:
            ApplicationStatusHistory.objects.filter(
                application_id=application_id
            ).delete()
            Application.objects.filter(id=application_id).delete()

    def test_a_confirmation_racing_a_condition_rejection_loses(self):
        """The in-lock condition re-read, proven concurrently.

        The confirmation's advisory pre-check sees a satisfied condition; a
        reviewer sends the evidence back before the lock is taken. Because the
        conditions are re-read **inside** the transaction, the confirmation is
        refused rather than committed against a condition that is no longer met.
        """
        world = build_tenant_world(application_status="draft")
        application = _offer(world, status="conditionally_approved")
        condition = _condition(application, status=conditions.CONDITION_VERIFIED)
        application_id = str(application.id)

        started = threading.Event()
        rejected = threading.Event()

        original_get = Application.objects.select_for_update

        def _reject_between_precheck_and_lock(*args, **kwargs):
            started.set()
            rejected.wait(timeout=20)
            return original_get(*args, **kwargs)

        def reviewer():
            from django.db import connection as tconn

            try:
                started.wait(timeout=20)
                ApplicationCondition.objects.filter(id=condition.id).update(
                    status=conditions.CONDITION_CHANGES_REQUIRED
                )
            finally:
                rejected.set()
                tconn.close()

        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(reviewer)
                Application.objects.select_for_update = _reject_between_precheck_and_lock
                try:
                    with pytest.raises(EnrollmentError) as exc:
                        EnrollmentService.confirm_enrollment(
                            application_id, str(world.student.id)
                        )
                finally:
                    Application.objects.select_for_update = original_get
                future.result(timeout=20)

            assert exc.value.code == enrollment.CONDITIONS_NOT_MET
            assert Application.objects.get(id=application_id).status == (
                "conditionally_approved"
            )
        finally:
            ApplicationCondition.objects.filter(id=condition.id).delete()
            ApplicationStatusHistory.objects.filter(
                application_id=application_id
            ).delete()
            Application.objects.filter(id=application_id).delete()


# ---------------------------------------------------------------------------
# 7. The read contract (R13.2, STU-15)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestReadContract:
    """The deadline and the readiness are on the list row and the detail read.

    **Validates: Requirements R13.2**
    """

    def test_the_detail_read_publishes_the_deadline_and_the_readiness(self):
        from apps.applications.serializers import ApplicationSerializer

        world = build_tenant_world(application_status="draft")
        application = _offer(world)

        data = ApplicationSerializer(application).data

        assert data["enrollment_confirmation_deadline"] is not None
        assert data["enrollment"]["can_confirm"] is True
        assert data["enrollment"]["state"] == "confirmable"

    def test_the_list_row_publishes_the_deadline_and_the_readiness(self):
        """The field ``ApplicationListItem`` has always read finally has a value."""
        from apps.applications.serializers import ApplicationListSerializer

        world = build_tenant_world(application_status="draft")
        application = _offer(world)

        rows = ApplicationListSerializer([application], many=True).data

        assert rows[0]["enrollment_confirmation_deadline"] is not None
        assert rows[0]["enrollment"]["state"] == "confirmable"

    def test_the_list_read_does_not_query_once_per_application(self):
        """A bounded query cost for the page, never one round trip per row."""
        from django.test.utils import CaptureQueriesContext

        from apps.applications.serializers import ApplicationListSerializer

        world = build_tenant_world(application_status="draft", max_capacity=None)
        applications = [_offer(world)]
        for _ in range(4):
            extra = build_application(
                student=build_profile(role="student"),
                institution=world.institution,
                canonical_program=world.canonical_program,
                offering=world.offering,
                intake=world.intake,
                status="approved",
            )
            extra.enrollment_confirmation_deadline = timezone.now() + timedelta(days=7)
            extra.save(update_fields=["enrollment_confirmation_deadline"])
            applications.append(extra)

        serializer = ApplicationListSerializer(applications, many=True)
        with CaptureQueriesContext(connection) as ctx:
            rows = serializer.data

        assert len(rows) == 5
        readiness_queries = [
            query
            for query in ctx.captured_queries
            if "application_conditions" in query["sql"]
            or "program_intakes" in query["sql"]
        ]
        # Conditions once, ProgramIntake once for the single distinct offering —
        # constant in the number of rows, and certainly not 5 of each.
        assert len(readiness_queries) <= 3, [q["sql"] for q in readiness_queries]

    def test_the_readiness_is_never_accepted_from_a_request_body(self):
        """Server-authored means server-authored (R13.9)."""
        from apps.applications.serializers import ApplicationSerializer

        fields = ApplicationSerializer().get_fields()
        assert fields["enrollment"].read_only is True
        assert fields["enrollment_confirmation_deadline"].read_only is True

    def test_an_unevaluable_readiness_is_absent_rather_than_empty(self, monkeypatch):
        """R11.6's fail-closed-but-honest rule, applied to a read.

        A read must not 500 because the canonical configuration could not be
        resolved — and it must not answer "nothing to do" either, which is the
        defect shape STU-13/STU-15 share.
        """
        from apps.applications.serializers import ApplicationListSerializer

        world = build_tenant_world(application_status="draft")
        application = _offer(world)

        def _boom(*_args, **_kwargs):
            raise RuntimeError("configuration unavailable")

        monkeypatch.setattr(enrollment, "enrollment_readiness_map", _boom)
        monkeypatch.setattr(enrollment, "evaluate_enrollment_readiness", _boom)

        rows = ApplicationListSerializer([application], many=True).data

        assert rows[0]["enrollment"] is None


# ---------------------------------------------------------------------------
# 8. Authority
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConfirmAuthority:
    """Owner-only, with a masked 404 for anything else.

    **Validates: Requirements R3, R13.9**
    """

    def test_another_student_is_masked_identically_to_an_unknown_id(self):
        world = build_tenant_world(application_status="draft")
        application = _offer(world)
        intruder = build_profile(role="student", suffix=f"int-{uuid.uuid4().hex[:6]}")
        client = _client_for(intruder)

        owned = client.post(confirm_url(application.id))
        unknown = client.post(confirm_url(uuid.uuid4()))

        assert owned.status_code == unknown.status_code == 404
        assert owned.data == unknown.data

    def test_scoped_staff_do_not_confirm_on_the_students_behalf(self):
        """Enrollment is the student's decision, so this endpoint is owner-only."""
        world = build_tenant_world(application_status="draft")
        application = _offer(world)
        staff = build_profile(role="admin", suffix=f"stf-{uuid.uuid4().hex[:6]}")
        build_membership(
            user=staff,
            institution=world.institution,
            role="admin",
            permissions=["read", "review"],
        )

        response = _client_for(staff).post(confirm_url(application.id))

        assert response.status_code == 404

    def test_no_role_string_is_compared_in_the_enrollment_service(self):
        """R3.1 forbids a role-string comparison as an authority gate.

        Parsed, not grepped — 9.5 §9.1 / 10.2 §10's reason: the module documents
        the authority model in prose, and a grep guard fails on its own
        documentation.
        """
        source = pathlib.Path(inspect.getfile(enrollment)).read_text(encoding="utf-8")
        tree = ast.parse(source)
        role_literals = {"student", "admin", "reviewer", "super_admin"}
        offences: list[str] = []

        for node in ast.walk(tree):
            if isinstance(node, ast.Compare):
                for operand in [node.left, *node.comparators]:
                    if isinstance(operand, ast.Constant) and operand.value in role_literals:
                        offences.append(f"compare at line {node.lineno}")
            if isinstance(node, ast.Call):
                func = node.func
                name = getattr(func, "attr", None)
                if name in {"filter", "exclude", "get"}:
                    for keyword in node.keywords:
                        if keyword.arg and keyword.arg.startswith("role"):
                            offences.append(f"{name}(role=...) at line {node.lineno}")

        assert offences == [], offences


# ---------------------------------------------------------------------------
# 9. One evaluator, and the lock order
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOneEvaluator:
    """The read and the command cannot disagree, because there is one evaluation.

    **Validates: Requirements R13.9, R17.1**
    """

    def test_the_command_re_runs_the_evaluator_inside_the_transaction(self):
        """AST-asserted, so a refactor cannot quietly move it back outside.

        This is the STU-15 defect in one structural claim: pre-10.3 the condition
        and deadline reads happened before ``transaction.atomic()`` opened.
        """
        source = inspect.getsource(EnrollmentService.confirm_enrollment)
        tree = ast.parse(inspect.cleandoc(source))

        with_nodes = [n for n in ast.walk(tree) if isinstance(n, ast.With)]
        assert with_nodes, "confirm_enrollment must open a transaction"
        atomic_body = with_nodes[0].body
        calls_inside = {
            node.func.id
            for node in ast.walk(ast.Module(body=atomic_body, type_ignores=[]))
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
        }
        assert "evaluate_enrollment_readiness" in calls_inside
        assert "transition_application_status" in calls_inside

    def test_the_capacity_row_is_locked_before_the_application_row(self):
        """Task 5.3's fixed lock order, so this cannot deadlock against it."""
        source = inspect.getsource(EnrollmentService.confirm_enrollment)
        capacity_at = source.index("lock_capacity_row")
        application_at = source.index("select_for_update")
        assert capacity_at < application_at

    def test_there_is_no_second_submission_readiness_evaluator(self):
        """Task 6.5 owns submission readiness; this module must not fork it."""
        source = pathlib.Path(inspect.getfile(enrollment)).read_text(encoding="utf-8")
        assert "def evaluate_readiness" not in source
        assert "def submission_blockers" not in source
        # And the blocker payload is 6.5's registered type, not a private clone.
        from apps.applications.readiness_service import ReadinessBlocker

        readiness = evaluate_enrollment_readiness(
            build_tenant_world(application_status="under_review").application
        )
        assert all(isinstance(b, ReadinessBlocker) for b in readiness.blockers)

    def test_there_is_no_second_condition_state_vocabulary(self):
        """10.2's state machine is the authority for what "resolved" means.

        Parsed, not grepped, for the reason 10.2 §10 recorded and this very guard
        rediscovered on its first run: the module *documents* the pre-10.3
        ``status="pending"`` query it replaces, and a grep guard fails on its own
        explanation. So the check walks the AST and ignores docstrings — a state
        name in prose is documentation, a state name in code is a second
        vocabulary.
        """
        source = pathlib.Path(inspect.getfile(enrollment)).read_text(encoding="utf-8")
        tree = ast.parse(source)

        exempt: set[int] = set()
        for node in ast.walk(tree):
            if isinstance(
                node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
            ):
                body = getattr(node, "body", [])
                if (
                    body
                    and isinstance(body[0], ast.Expr)
                    and isinstance(body[0].value, ast.Constant)
                    and isinstance(body[0].value.value, str)
                ):
                    exempt.add(id(body[0].value))
            # A published payload **key** is a field name, not a state vocabulary.
            # ``condition_tally`` reports ``{"accepted": n, "expired": n}``, and
            # "expired" as a key is the name of a count, not a status compared
            # against a row — which is the distinction this guard is about.
            if isinstance(node, ast.Dict):
                for key in node.keys:
                    if isinstance(key, ast.Constant):
                        exempt.add(id(key))

        forbidden = set(conditions.CONDITION_STATES)
        offences = [
            f"{node.value!r} at line {node.lineno}"
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and node.value in forbidden
            and id(node) not in exempt
        ]
        assert offences == [], offences

    def test_the_refusal_precedence_is_declared_once(self):
        """``_raise_for`` raises the *first* blocker, so the order is the rule."""
        world = build_tenant_world(application_status="draft", max_capacity=1)
        application = _offer(world, status="conditionally_approved", days_to_deadline=-1)
        _condition(application, status=conditions.CONDITION_OPEN)
        build_application(
            student=build_profile(role="student"),
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            status="submitted",
        )

        readiness = evaluate_enrollment_readiness(application)
        assert readiness.blocker_codes[0] == enrollment.CONDITIONS_NOT_MET

        with pytest.raises(EnrollmentError) as exc:
            EnrollmentService.confirm_enrollment(str(application.id), str(world.student.id))
        assert exc.value.code == enrollment.CONDITIONS_NOT_MET

    def test_no_migration_ships_with_this_task(self):
        """Every gate here reads columns and tables that already exist."""
        scripts = pathlib.Path(__file__).resolve().parents[2] / "scripts"
        offenders = [
            path.name
            for path in scripts.glob("*.sql")
            if "10_3" in path.name or "enrollment_readiness" in path.name
        ]
        assert offenders == [], offenders

    def test_the_seat_status_set_keeps_enrolled_students_in_their_seats(self):
        """Confirmation retains the seat already claimed at submission.

        Enrollment itself leaves the counter untouched, so reconciliation must
        continue counting the new ``enrolled`` state. Otherwise the next
        reconciliation silently returns an occupied seat to capacity.
        """
        from apps.applications.capacity_service import SEAT_STATUSES

        assert SEAT_STATUSES == (
            "submitted",
            "under_review",
            "approved",
            "waitlisted",
            "enrolled",
        )


# ---------------------------------------------------------------------------
# 10. The counter is left alone by a confirmation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCounterIsUntouched:
    """A confirmation neither claims nor releases a counted seat.

    **Validates: Requirements R17.1**
    """

    def test_confirmation_does_not_change_the_capacity_counter(self):
        """An approved application already claimed its seat at submission.

        Incrementing again here would double-count it, and releasing it would
        hand a confirmed student's place to the waitlist. The counter is
        therefore deliberately untouched, and this pins that.
        """
        world = build_tenant_world(application_status="draft", max_capacity=10)
        application = _offer(world)
        ProgramIntake.objects.filter(id=world.program_intake.id).update(
            current_enrollment=1
        )

        EnrollmentService.confirm_enrollment(str(application.id), str(world.student.id))

        world.program_intake.refresh_from_db()
        assert world.program_intake.current_enrollment == 1
