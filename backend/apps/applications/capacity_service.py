"""Canonical capacity + seat allocation service (admissions-v2 task 5.3).

Spec:         .kiro/specs/admissions-v2-canonical-rebuild/
Requirements: R7.6, R7.7, R10.6
Findings:     DATA-02, DATA-03
Design:       design.md §7.3 (Capacity And Waitlist).

This module is the single canonical seam for keying capacity, waitlist,
withdrawal, and promotion on the **tenant-scoped canonical Intake_Offering
identity** — the ``ProgramIntake`` row identified by
``(program_offering_id, intake_ref_id)`` — rather than on display strings. It
closes two P0 findings:

* **DATA-02** — capacity/waitlist keyed on ``program``/``intake`` display
  strings resolved by name (``IdentifierResolver``) fail open on resolution
  failure and mix same-named tenants. Here every operation keys on the canonical
  offering + intake IDs the application already carries (task 5.2 snapshot), so
  two tenants offering the same-name canonical program on the same intake never
  share a capacity row or a waitlist queue.
* **DATA-03** — submission locked the application but not the last-seat
  ``ProgramIntake`` counter, so concurrent submits could exceed capacity. Here
  :meth:`CapacityService.take_seat_for_submission` locks the ``ProgramIntake``
  row (``SELECT ... FOR UPDATE``) **before** the capacity decision, evaluates a
  drift-free live occupancy count under that lock, and increments the counter in
  the same transaction. Concurrent last-seat submits serialize on the row lock,
  so exactly one wins the final seat.

Lock order (fixed, deadlock-free): the **ProgramIntake capacity row first, then
the application row**. Every canonical path in this spec (submission, withdrawal,
promotion, expiry) acquires locks in this order.

Counter semantics: ``ProgramIntake.current_enrollment`` (and the coarser
``Intake.current_enrollment`` aggregate) track the same occupancy status set the
legacy ``IntakeEnforcer`` used — :data:`SEAT_STATUSES` — so this service and the
legacy path agree, and :meth:`reconcile` can repair drift from the canonical
rows before reads switch to the counter. The counter is advisory; the last-seat
decision is a live count under the row lock, so it is correct even if the
counter has drifted.

Strictly additive / forward-only: an application without a full canonical
offering + intake identity (a legacy pre-5.2 row) is not constrained here — the
caller keeps the legacy name-based path. Only canonical applications flow through
the locked, ID-keyed logic.
"""

from __future__ import annotations

import logging
import uuid as _uuid
from typing import Optional

from django.db import transaction
from django.db.models import F
from django.db.models.functions import Greatest

logger = logging.getLogger(__name__)

# Occupancy status set — the applications that consume a seat in an
# Intake_Offering. ``enrolled`` remains an occupant: confirmation deliberately
# does not increment or release the already-claimed seat, so omitting it here
# made ``reconcile`` hand that seat back while the student was enrolled
# (GATE-13.2-02). Conditional approval does not claim a seat and therefore stays
# outside this tuple until confirmation or another explicit allocation command.
SEAT_STATUSES: tuple[str, ...] = (
    "submitted",
    "under_review",
    "approved",
    "waitlisted",
    "enrolled",
)


class CapacityError(Exception):
    """Raised when a canonical seat allocation cannot proceed.

    Carries a stable ``code`` / ``message`` mirroring the legacy
    ``IntakeEnforcer`` capacity codes so the submission service can surface the
    same envelope without a behavioural change.
    """

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _coerce_uuid(value) -> Optional[str]:
    """Return the canonical string form of *value* iff it is a real UUID.

    Mirrors ``apps.applications.services._coerce_uuid``: ``None`` for empty /
    non-UUID / non-string inputs (including ``MagicMock`` attributes in unit
    tests), so a legacy row with null canonical IDs falls straight through to the
    caller's legacy path.
    """
    try:
        return str(_uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


class CapacityService:
    """Canonical, ID-keyed capacity/seat operations with fixed-order row locks."""

    # ------------------------------------------------------------------ #
    # Canonical identity
    # ------------------------------------------------------------------ #
    @staticmethod
    def offering_ids(application) -> tuple[Optional[str], Optional[str]]:
        """Return ``(program_offering_id, intake_ref_id)`` as UUID strings.

        Returns ``(None, None)`` when the application lacks a full canonical
        offering + intake identity (a legacy row) — the signal for the caller to
        use the legacy name-based path.
        """
        offering_id = _coerce_uuid(getattr(application, "program_offering_id", None))
        intake_id = _coerce_uuid(getattr(application, "intake_ref_id", None))
        if offering_id and intake_id:
            return offering_id, intake_id
        return None, None

    @staticmethod
    def is_canonical(application) -> bool:
        """True when the application carries a full canonical offering + intake."""
        offering_id, intake_id = CapacityService.offering_ids(application)
        return bool(offering_id and intake_id)

    # ------------------------------------------------------------------ #
    # Capacity primitives
    # ------------------------------------------------------------------ #
    @staticmethod
    def lock_capacity_row(offering_id: str, intake_id: str):
        """``SELECT ... FOR UPDATE`` the Intake_Offering (ProgramIntake) row.

        Must be called inside an open transaction. Returns the locked
        ``ProgramIntake`` or ``None`` when no offering/intake link exists (an
        unconfigured pair — capacity is treated as unlimited, matching
        ``OfferingAssignmentService._has_capacity``).
        """
        from apps.catalog.models import ProgramIntake

        return (
            ProgramIntake.objects.select_for_update()
            .filter(program_id=offering_id, intake_id=intake_id)
            .first()
        )

    @staticmethod
    def capacity_limit(program_intake, intake=None) -> Optional[int]:
        """Effective seat limit for an Intake_Offering (``None`` = unlimited).

        Mirrors ``OfferingAssignmentService._has_capacity``: the program-intake
        ``max_capacity`` takes precedence, falling back to the intake-level
        ``max_capacity``.
        """
        limit = program_intake.max_capacity
        if limit is None:
            if intake is None:
                from apps.catalog.models import Intake

                intake = Intake.objects.filter(id=program_intake.intake_id).first()
            limit = intake.max_capacity if intake is not None else None
        return limit

    @staticmethod
    def live_seat_count(
        offering_id: str, intake_id: str, *, exclude_application_id=None
    ) -> int:
        """Count seat-occupying applications keyed on the canonical identity.

        Tenant-isolated by construction: filters on ``program_offering_id`` +
        ``intake_ref_id`` (canonical IDs), never on the display strings, so a
        same-name other-tenant offering is never counted (DATA-02).
        """
        from apps.applications.models import Application

        qs = Application.objects.filter(
            program_offering_id=offering_id,
            intake_ref_id=intake_id,
            status__in=SEAT_STATUSES,
        )
        if exclude_application_id is not None:
            qs = qs.exclude(id=exclude_application_id)
        return qs.count()

    # ------------------------------------------------------------------ #
    # Seat allocation (submission) — DATA-03
    # ------------------------------------------------------------------ #
    @staticmethod
    def take_seat_for_submission(application) -> bool:
        """Atomically claim a seat for a canonical application under a row lock.

        Locks the ``ProgramIntake`` capacity row, evaluates a drift-free live
        occupancy count under that lock, and — if a seat is free — increments the
        canonical ``ProgramIntake.current_enrollment`` (and the coarser
        ``Intake.current_enrollment`` aggregate) in the same transaction.

        Because the row lock serializes concurrent last-seat submissions, exactly
        one of N simultaneous submits claims the final seat; the rest observe the
        committed count and raise :class:`CapacityError` (DATA-03).

        Must be called inside the submission ``transaction.atomic()`` block, and
        the ``ProgramIntake`` row must be locked **before** the application row
        (fixed lock order). Returns ``True`` when a seat was claimed. Returns
        ``False`` (a no-op) for a legacy application without canonical IDs — the
        caller keeps the legacy ``IntakeEnforcer.increment_enrollment`` path.

        Raises:
            CapacityError: the Intake_Offering is at capacity.
        """
        offering_id, intake_id = CapacityService.offering_ids(application)
        if not (offering_id and intake_id):
            return False

        from apps.catalog.models import Intake, ProgramIntake

        program_intake = CapacityService.lock_capacity_row(offering_id, intake_id)
        if program_intake is None:
            # No canonical Intake_Offering link → no configured capacity
            # constraint (unlimited). Assignment revalidation (services.py) has
            # already rejected a genuinely stale/removed offering before this
            # point, so treat a missing link as unconstrained rather than
            # blocking a legitimate submission.
            logger.info(
                "take_seat_for_submission: no ProgramIntake for offering=%s intake=%s "
                "(treating as unlimited)",
                offering_id,
                intake_id,
            )
            return False

        intake = Intake.objects.filter(id=intake_id).first()
        limit = CapacityService.capacity_limit(program_intake, intake)

        if limit is not None:
            current = CapacityService.live_seat_count(
                offering_id, intake_id, exclude_application_id=getattr(application, "id", None)
            )
            if current >= limit:
                raise CapacityError(
                    "PROGRAM_CAPACITY_REACHED",
                    f"This offering has reached maximum capacity ({current}/{limit}).",
                )

        # Increment the canonical counter on the locked row.
        ProgramIntake.objects.filter(id=program_intake.id).update(
            current_enrollment=F("current_enrollment") + 1
        )
        if intake is not None:
            Intake.objects.filter(id=intake.id).update(
                current_enrollment=F("current_enrollment") + 1
            )
        return True

    # ------------------------------------------------------------------ #
    # Seat release (withdrawal / expiry) — DATA-02
    # ------------------------------------------------------------------ #
    @staticmethod
    def release_seat(application) -> bool:
        """Atomically release a seat for a canonical application under a row lock.

        Locks the ``ProgramIntake`` capacity row (fixed order — capacity row
        first) and decrements ``current_enrollment`` with a non-negative floor,
        keyed on the canonical offering + intake IDs (never display strings).

        Returns ``True`` when the canonical decrement ran. Returns ``False`` for
        a legacy application without canonical IDs — the caller keeps the legacy
        ``IntakeEnforcer.decrement_enrollment`` path.
        """
        offering_id, intake_id = CapacityService.offering_ids(application)
        if not (offering_id and intake_id):
            return False

        from apps.catalog.models import Intake, ProgramIntake

        with transaction.atomic():
            program_intake = CapacityService.lock_capacity_row(offering_id, intake_id)
            if program_intake is not None:
                ProgramIntake.objects.filter(id=program_intake.id).update(
                    current_enrollment=Greatest(F("current_enrollment") - 1, 0)
                )
            Intake.objects.filter(id=intake_id).update(
                current_enrollment=Greatest(F("current_enrollment") - 1, 0)
            )
        return True

    # ------------------------------------------------------------------ #
    # Reconciliation — R10.6 ("reconcile counters from canonical rows")
    # ------------------------------------------------------------------ #
    @staticmethod
    def reconcile(offering_id: str, intake_id: str) -> int:
        """Recompute ``ProgramIntake.current_enrollment`` from canonical rows.

        Counts the seat-occupying applications keyed on the canonical offering +
        intake identity and writes the authoritative value onto the locked
        ``ProgramIntake`` row. This is the "reconcile counters from canonical
        rows before switching reads" step (R10.6): it repairs any drift the
        legacy name-based increment/decrement path may have left, so downstream
        reads can trust the counter.

        Returns the reconciled count. A no-op returning ``0`` when the
        Intake_Offering link does not exist.
        """
        with transaction.atomic():
            program_intake = CapacityService.lock_capacity_row(offering_id, intake_id)
            if program_intake is None:
                return 0
            count = CapacityService.live_seat_count(offering_id, intake_id)
            from apps.catalog.models import ProgramIntake

            ProgramIntake.objects.filter(id=program_intake.id).update(
                current_enrollment=count
            )
        return count
