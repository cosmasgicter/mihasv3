"""Integration — canonical capacity / waitlist / withdrawal / promotion (task 5.3).

Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ — task 5.3
Requirements: R7.6, R7.7, R10.6 · Findings: DATA-02, DATA-03
Design:       design.md §7.3 (Capacity And Waitlist).

These logic tests run against the ephemeral test DB (SQLite fast suite or
Postgres CI) and prove — deterministically, without threads — that capacity,
waitlist ordering, withdrawal decrement, promotion, and reconciliation all key
on the **canonical Intake_Offering identity** (``program_offering_id`` +
``intake_ref_id``) and never mix two tenants that offer the same-name canonical
program on the same intake (DATA-02). The genuinely concurrent last-seat /
withdrawal race proof lives in ``tests/unit/test_capacity_concurrency_5_3.py``
(Postgres-only).

Uses ``admin_force=True`` on the real submission service so the last-seat
capacity guard is exercised without standing up payment/document fixtures — the
capacity gate runs unconditionally; only payment/document/revalidation gates are
bypassed by admin force.

**Validates: Requirements R7.6, R7.7, R10.6**
"""

from __future__ import annotations

import uuid

import pytest

from apps.applications.capacity_service import SEAT_STATUSES, CapacityError, CapacityService
from apps.applications.models import Application
from apps.applications.services import ApplicationSubmissionError, submit_application
from apps.applications.waitlist_manager import WaitlistManager
from apps.applications.withdrawal_service import WithdrawalService
from apps.catalog.models import ProgramIntake
from tests.tenant_fixtures import (
    build_application,
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
    build_profile,
    build_program_intake,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _system_actor_profile(db):
    """Seed the system-actor profile so SYSTEM_ACTOR_ID FK writes (auto-promotion
    sets ``reviewed_by``) resolve on the ephemeral DB. Mirrors
    backend/scripts/system_actor_seed.sql."""
    from django.utils import timezone

    from apps.accounts.models import Profile
    from apps.applications.services import SYSTEM_ACTOR_ID

    Profile.objects.get_or_create(
        id=uuid.UUID(SYSTEM_ACTOR_ID),
        defaults={
            "email": "system@mihas.internal",
            "role": "student",
            "first_name": "System",
            "last_name": "Actor",
            "is_active": False,
            "created_at": timezone.now(),
            "updated_at": timezone.now(),
        },
    )


# --------------------------------------------------------------------------- #
# Same-name two-tenant world (the DATA-02 collision)
# --------------------------------------------------------------------------- #


class SameNameWorld:
    """Two institutions offering the SAME canonical program on the SAME intake."""

    def __init__(self, *, cap_a: int | None = None, cap_b: int | None = None):
        self.canonical = build_canonical_program(suffix="shared53")
        self.intake = build_intake(suffix="shared53", max_capacity=None)

        self.inst_a = build_institution(suffix="a53")
        self.offering_a = build_offering(
            institution=self.inst_a, canonical_program=self.canonical, suffix="a53"
        )
        self.pi_a = build_program_intake(
            offering=self.offering_a, intake=self.intake, max_capacity=cap_a
        )

        self.inst_b = build_institution(suffix="b53")
        self.offering_b = build_offering(
            institution=self.inst_b, canonical_program=self.canonical, suffix="b53"
        )
        self.pi_b = build_program_intake(
            offering=self.offering_b, intake=self.intake, max_capacity=cap_b
        )

    def app(self, offering, institution, *, status="draft", **overrides):
        return build_application(
            student=build_profile(role="student"),
            institution=institution,
            canonical_program=self.canonical,
            offering=offering,
            intake=self.intake,
            status=status,
            **overrides,
        )


def _admin_id() -> str:
    return str(build_profile(role="super_admin").id)


# --------------------------------------------------------------------------- #
# DATA-02 — capacity keyed on canonical IDs, never mixing same-name tenants
# --------------------------------------------------------------------------- #


class TestCanonicalCapacityIsolation:
    def test_live_seat_count_is_tenant_isolated(self):
        w = SameNameWorld()
        # Two submitted apps in tenant A's offering, one in tenant B's.
        w.app(w.offering_a, w.inst_a, status="submitted")
        w.app(w.offering_a, w.inst_a, status="submitted")
        w.app(w.offering_b, w.inst_b, status="submitted")

        count_a = CapacityService.live_seat_count(str(w.offering_a.id), str(w.intake.id))
        count_b = CapacityService.live_seat_count(str(w.offering_b.id), str(w.intake.id))
        assert count_a == 2
        assert count_b == 1

    def test_seat_statuses_only_count_occupying_rows(self):
        w = SameNameWorld()
        w.app(w.offering_a, w.inst_a, status="draft")  # not occupying
        w.app(w.offering_a, w.inst_a, status="rejected")  # terminal, not occupying
        w.app(w.offering_a, w.inst_a, status="submitted")  # occupying
        w.app(w.offering_a, w.inst_a, status="enrolled")  # still occupies its claimed seat
        assert CapacityService.live_seat_count(str(w.offering_a.id), str(w.intake.id)) == 2
        assert set(SEAT_STATUSES) == {
            "submitted",
            "under_review",
            "approved",
            "waitlisted",
            "enrolled",
        }

    def test_submission_last_seat_blocks_by_canonical_offering(self):
        """Offering A has one seat; the second submit to A is rejected, while
        offering B (same-name canonical, same intake) is unaffected."""
        w = SameNameWorld(cap_a=1, cap_b=1)
        admin = _admin_id()

        app_a1 = w.app(w.offering_a, w.inst_a)
        submit_application(application=app_a1, changed_by=admin, admin_force=True)
        w.pi_a.refresh_from_db()
        assert w.pi_a.current_enrollment == 1
        assert Application.objects.get(id=app_a1.id).status == "submitted"

        # Second submit to the SAME offering is over capacity → rejected.
        app_a2 = w.app(w.offering_a, w.inst_a)
        with pytest.raises(ApplicationSubmissionError) as exc:
            submit_application(application=app_a2, changed_by=admin, admin_force=True)
        assert exc.value.code == "PROGRAM_CAPACITY_REACHED"
        assert Application.objects.get(id=app_a2.id).status == "draft"

        # Tenant B's same-name offering still has its full seat — no cross-tenant
        # contamination of the capacity decision.
        app_b1 = w.app(w.offering_b, w.inst_b)
        submit_application(application=app_b1, changed_by=admin, admin_force=True)
        w.pi_b.refresh_from_db()
        assert w.pi_b.current_enrollment == 1
        assert Application.objects.get(id=app_b1.id).status == "submitted"

    def test_unlimited_capacity_when_no_limit_configured(self):
        w = SameNameWorld(cap_a=None, cap_b=None)
        admin = _admin_id()
        for _ in range(3):
            submit_application(
                application=w.app(w.offering_a, w.inst_a), changed_by=admin, admin_force=True
            )
        w.pi_a.refresh_from_db()
        assert w.pi_a.current_enrollment == 3


# --------------------------------------------------------------------------- #
# DATA-02 — waitlist ordering keyed on canonical IDs
# --------------------------------------------------------------------------- #


class TestCanonicalWaitlistScoping:
    def test_assign_position_scoped_to_offering(self):
        w = SameNameWorld()
        # Tenant B already has two waitlisted apps — they must NOT shift A's positions.
        w.app(w.offering_b, w.inst_b, status="waitlisted", waitlist_position=1)
        w.app(w.offering_b, w.inst_b, status="waitlisted", waitlist_position=2)

        a1 = w.app(w.offering_a, w.inst_a, status="waitlisted")
        pos1 = WaitlistManager.assign_position(a1, a1.program, a1.intake)
        a2 = w.app(w.offering_a, w.inst_a, status="waitlisted")
        pos2 = WaitlistManager.assign_position(a2, a2.program, a2.intake)

        assert pos1 == 1  # first in tenant A's queue, ignoring tenant B
        assert pos2 == 2

    def test_get_position_total_is_tenant_isolated(self):
        w = SameNameWorld()
        w.app(w.offering_b, w.inst_b, status="waitlisted", waitlist_position=1)
        a1 = w.app(w.offering_a, w.inst_a, status="waitlisted", waitlist_position=1)
        result = WaitlistManager.get_position(str(a1.id))
        assert result == {"position": 1, "total": 1}  # only A's queue counted

    def test_promote_next_only_touches_own_offering(self):
        w = SameNameWorld()
        # Tenant B waitlisted app at position 1 must never be promoted by an A promotion.
        b1 = w.app(w.offering_b, w.inst_b, status="waitlisted", waitlist_position=1)
        a1 = w.app(w.offering_a, w.inst_a, status="waitlisted", waitlist_position=1)

        promoted = WaitlistManager.promote_next_for_application(a1)
        assert promoted is not None
        assert str(promoted.id) == str(a1.id)
        assert Application.objects.get(id=a1.id).status == "approved"
        # Tenant B's waitlisted app is untouched.
        assert Application.objects.get(id=b1.id).status == "waitlisted"


# --------------------------------------------------------------------------- #
# DATA-02 — withdrawal decrement + promotion keyed on canonical IDs
# --------------------------------------------------------------------------- #


class TestCanonicalWithdrawalAndPromotion:
    def test_withdrawal_releases_seat_on_correct_offering_and_promotes(self):
        w = SameNameWorld(cap_a=1, cap_b=1)
        # A submitted (occupying) app in tenant A + a waitlisted A app behind it.
        submitted_a = w.app(w.offering_a, w.inst_a, status="submitted")
        CapacityService.reconcile(str(w.offering_a.id), str(w.intake.id))
        w.pi_a.refresh_from_db()
        assert w.pi_a.current_enrollment == 1

        waitlisted_a = w.app(
            w.offering_a, w.inst_a, status="waitlisted", waitlist_position=1
        )
        # Tenant B occupancy that must be untouched by A's withdrawal.
        w.app(w.offering_b, w.inst_b, status="submitted")
        CapacityService.reconcile(str(w.offering_b.id), str(w.intake.id))
        w.pi_b.refresh_from_db()
        assert w.pi_b.current_enrollment == 1

        WithdrawalService.withdraw(
            application_id=str(submitted_a.id),
            user_id=str(submitted_a.user_id),
            reason="Changed my mind about this programme.",
        )

        # A's seat released, A's waitlisted app promoted; B untouched.
        assert Application.objects.get(id=submitted_a.id).status == "withdrawn"
        assert Application.objects.get(id=waitlisted_a.id).status == "approved"
        w.pi_b.refresh_from_db()
        assert w.pi_b.current_enrollment == 1  # tenant B's counter never touched

    def test_release_seat_floors_at_zero(self):
        w = SameNameWorld(cap_a=5)
        # Counter already 0; a release must not drive it negative (DB CHECK +
        # Greatest floor).
        w.pi_a.refresh_from_db()
        assert (w.pi_a.current_enrollment or 0) == 0
        app = w.app(w.offering_a, w.inst_a, status="submitted")
        assert CapacityService.release_seat(app) is True
        w.pi_a.refresh_from_db()
        assert w.pi_a.current_enrollment == 0


# --------------------------------------------------------------------------- #
# R10.6 — reconcile counters from canonical rows
# --------------------------------------------------------------------------- #


class TestReconcile:
    def test_reconcile_recomputes_from_canonical_rows(self):
        w = SameNameWorld(cap_a=10)
        # Drift the counter deliberately.
        ProgramIntake.objects.filter(id=w.pi_a.id).update(current_enrollment=99)
        # Three occupying apps + noise that must not count.
        for _ in range(3):
            w.app(w.offering_a, w.inst_a, status="submitted")
        w.app(w.offering_a, w.inst_a, status="draft")
        w.app(w.offering_a, w.inst_a, status="rejected")
        # A same-name tenant-B occupying app that must NOT be swept in.
        w.app(w.offering_b, w.inst_b, status="submitted")

        reconciled = CapacityService.reconcile(str(w.offering_a.id), str(w.intake.id))
        assert reconciled == 3
        w.pi_a.refresh_from_db()
        assert w.pi_a.current_enrollment == 3

    def test_reconcile_no_offering_link_is_noop(self):
        # A canonical pair with no ProgramIntake row → reconcile returns 0.
        assert CapacityService.reconcile(str(uuid.uuid4()), str(uuid.uuid4())) == 0


# --------------------------------------------------------------------------- #
# Forward-only / idempotent transitions
# --------------------------------------------------------------------------- #


class TestForwardOnlyPromotion:
    def test_promote_next_skips_empty_queue(self):
        w = SameNameWorld()
        app = w.app(w.offering_a, w.inst_a, status="submitted")  # not waitlisted
        assert WaitlistManager.promote_next_for_application(app) is None

    def test_take_seat_is_noop_for_legacy_row(self):
        """A legacy application without canonical IDs is not constrained here —
        the caller keeps the legacy name-based path."""
        w = SameNameWorld(cap_a=1)
        legacy = build_application(
            student=build_profile(role="student"),
            institution=w.inst_a,
            canonical_program=w.canonical,
            offering=w.offering_a,
            intake=w.intake,
            status="draft",
            with_canonical_ids=False,
        )
        assert CapacityService.is_canonical(legacy) is False
        assert CapacityService.take_seat_for_submission(legacy) is False
        assert CapacityService.release_seat(legacy) is False
