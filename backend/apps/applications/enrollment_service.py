"""Enrollment confirmation service.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/``
Requirements: R13.2, R13.9, R17.1 (and the pre-V2 Requirements 10.1, 10.4, 10.5)
Findings:     STU-15, DATA-03
Design:       design.md §11.2 ("Enrollment readiness is server-authored.
              Confirmation locks the application and offer/enrollment record,
              rechecks status, all mandatory conditions, deadline, capacity, and
              existing enrollment, then commits idempotently."), §7.1 (capacity
              invariants — "enrolled not greater than capacity"), §7.3 (capacity
              and waitlist row-lock order).

Handles student enrollment confirmation after approval, computes enrollment
deadlines from the academic calendar, and — since admissions-v2 task 10.3 — owns
the **one** server-authored enrollment readiness evaluation that both the read
contracts and the confirmation command consume.

What task 10.3 changed, and why
-------------------------------
**STU-15** (P1) named three defects in one sentence: the enrollment deadline was
absent from the serializers, the UI only offered confirmation for ``approved``
even though the backend already accepted ``conditionally_approved``, and the
conditions were not rechecked under the enrollment lock. All three share one
cause — there was no *readiness contract*. The status gate, the deadline gate and
the condition gate each lived at a different point in the call path, two of them
outside the transaction, and none of them was published, so the browser had to
guess at the rules and guessed differently from the server.

So readiness is now a value:

* :func:`evaluate_enrollment_readiness` is the single evaluator. It answers
  *"may this application be confirmed, and if not, exactly why"* and returns
  stable blocker codes, the deadline, a countdown, the condition tally, the
  capacity position, and the existing-enrollment state.
* The **read** contracts (``ApplicationSerializer`` /
  ``ApplicationListSerializer``) publish its payload, so the deadline and the
  permitted action are the platform's answer rather than a client-side rule over
  a status string.
* :meth:`EnrollmentService.confirm_enrollment` re-runs **the same evaluator**
  inside the transaction, on the locked rows.

This is deliberately the shape task 6.5 established for *submission* readiness
(``readiness_service.evaluate_readiness`` + the in-lock ``submission_blockers``,
one evaluator, two consumers) and task 9.4 reused rather than duplicating. There
is no second submission evaluator here and no second condition state machine: the
condition half reads task 10.2's :data:`CONDITION_TERMINAL_STATES` /
``CONDITION_STATE_DEFINITIONS`` vocabulary, the capacity half reads task 5.3's
``CapacityService``, and the blocker payload is 6.5's
:class:`~apps.applications.readiness_service.ReadinessBlocker`.

Lock order (task 5.3's, unchanged)
----------------------------------
``ProgramIntake`` capacity row **first**, then the ``Application`` row. Every
canonical path in this spec — submission, withdrawal, promotion, expiry, and now
confirmation — acquires locks in that order, which is what keeps them
deadlock-free against each other.
"""

import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Optional

from django.db import transaction
from django.utils import timezone

from apps.applications.models import Application, ApplicationCondition
from apps.applications.readiness_service import ReadinessBlocker
from apps.applications.services import transition_application_status

logger = logging.getLogger(__name__)

# Default enrollment-confirmation deadline when no academic-calendar event
# is configured: approval date + this many days.
DEFAULT_ENROLLMENT_DEADLINE_DAYS = 14

#: The statuses from which a student may confirm enrollment. ``approved`` is the
#: unconditional offer; ``conditionally_approved`` is permitted **only** once
#: every condition is resolved, which is the gate below — the backend has always
#: accepted this status and the browser has always hidden it, which is half of
#: STU-15.
ENROLLABLE_STATUSES: tuple[str, ...] = ("approved", "conditionally_approved")


# ---------------------------------------------------------------------------
# Stable blocker codes
# ---------------------------------------------------------------------------
#
# The first three are pre-10.3 codes raised by ``confirm_enrollment`` and are
# unchanged, so every existing caller and test keeps branching on the same
# strings. The last three are new and are the codes the recheck needs in order to
# refuse rather than commit.

#: The application is not in a status from which enrollment may be confirmed.
INVALID_STATUS_FOR_ENROLLMENT = "INVALID_STATUS_FOR_ENROLLMENT"
#: A conditional offer still has at least one unresolved condition.
CONDITIONS_NOT_MET = "CONDITIONS_NOT_MET"
#: The confirmation deadline has passed.
DEADLINE_PASSED = "DEADLINE_PASSED"
#: The Intake_Offering has no seat left for this application. Same code task
#: 5.3's ``CapacityService`` raises at submission, on purpose: it is the same
#: condition observed at a different point in the lifecycle.
PROGRAM_CAPACITY_REACHED = "PROGRAM_CAPACITY_REACHED"
#: This application is already enrolled. Not an error on the command path —
#: confirmation is idempotent (design §11.2) — but it *is* a readiness blocker,
#: because "confirm enrollment" is not an action the student still has to take.
ALREADY_ENROLLED = "ALREADY_ENROLLED"
#: The same student already holds an enrolled application on this same canonical
#: Intake_Offering. One person cannot occupy two seats in one cohort.
DUPLICATE_ENROLLMENT = "DUPLICATE_ENROLLMENT"

#: Every blocker resolves to exactly one labelled action, so a student is never
#: dead-ended — 6.5's ``_NEXT_ACTION_BY_CODE`` rule applied to this surface.
_NEXT_ACTION_BY_CODE: dict[str, dict[str, str]] = {
    CONDITIONS_NOT_MET: {
        "action": "resolve-conditions",
        "label": "Send the evidence your conditions ask for",
    },
    DEADLINE_PASSED: {
        "action": "contact-admissions",
        "label": "Contact admissions about your confirmation deadline",
    },
    PROGRAM_CAPACITY_REACHED: {
        "action": "contact-admissions",
        "label": "Contact admissions about your place on this intake",
    },
    DUPLICATE_ENROLLMENT: {
        "action": "view-enrolled-application",
        "label": "Open the application you have already confirmed",
    },
    ALREADY_ENROLLED: {
        "action": "view-status",
        "label": "Your place is confirmed",
    },
    INVALID_STATUS_FOR_ENROLLMENT: {
        "action": "view-status",
        "label": "Track your application",
    },
}

#: What each readiness outcome means, in the platform's own words. Published with
#: the payload for 9.1/9.4/10.2's reason: a definition travels with every label,
#: so the browser renders the platform's copy instead of deriving its own from a
#: code.
ENROLLMENT_STATE_DEFINITIONS: dict[str, str] = {
    "confirmable": (
        "Your place is being held. Confirm your enrollment before the deadline to "
        "keep it."
    ),
    "blocked": (
        "There is something to resolve before you can confirm your enrollment."
    ),
    "confirmed": "Your enrollment is confirmed.",
    "not_applicable": (
        "Enrollment confirmation does not apply to this application yet."
    ),
}


class EnrollmentError(Exception):
    """Raised when an enrollment operation fails validation."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        #: HTTP status the view should answer with. Defaults to the pre-10.3
        #: behaviour (400) so no existing refusal changes shape; a genuine
        #: conflict with committed state uses 409.
        self.status_code = status_code


# ---------------------------------------------------------------------------
# Readiness result type
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EnrollmentReadiness:
    """The server-authored answer to "may this application enroll?" (R13.9).

    One value, three consumers: the list contract, the detail contract, and the
    in-lock recheck inside :meth:`EnrollmentService.confirm_enrollment`. They
    cannot disagree, because there is nothing for them to disagree about.
    """

    application_id: str
    status: str
    state: str
    deadline: Optional[str]
    deadline_passed: bool
    seconds_remaining: Optional[int]
    days_remaining: Optional[int]
    conditions: dict[str, Any]
    capacity: dict[str, Any]
    existing_enrollment: dict[str, Any]
    blockers: list[ReadinessBlocker] = field(default_factory=list)
    can_confirm: bool = False
    evaluated_at: str = ""

    @property
    def definition(self) -> str:
        return ENROLLMENT_STATE_DEFINITIONS.get(
            self.state, ENROLLMENT_STATE_DEFINITIONS["not_applicable"]
        )

    @property
    def blocker_codes(self) -> list[str]:
        return [blocker.code for blocker in self.blockers]

    def first_blocker(self) -> Optional[ReadinessBlocker]:
        return self.blockers[0] if self.blockers else None

    def allowed_actions(self) -> list[dict[str, Any]]:
        """Deterministic next actions — never an empty dead end."""
        actions: list[dict[str, Any]] = []
        seen: set[str] = set()
        if self.can_confirm:
            actions.append(
                {
                    "action": "confirm-enrollment",
                    "label": "Confirm your enrollment",
                    "blocker_code": None,
                }
            )
        for blocker in self.blockers:
            mapped = _NEXT_ACTION_BY_CODE.get(blocker.code) or {
                "action": "contact-admissions",
                "label": "Contact admissions for help",
            }
            if mapped["action"] in seen:
                continue
            seen.add(mapped["action"])
            actions.append({**mapped, "blocker_code": blocker.code})
        return actions

    def to_payload(self) -> dict[str, Any]:
        return {
            "application_id": self.application_id,
            "status": self.status,
            "state": self.state,
            "definition": self.definition,
            "deadline": self.deadline,
            "deadline_passed": self.deadline_passed,
            "seconds_remaining": self.seconds_remaining,
            "days_remaining": self.days_remaining,
            "conditions": dict(self.conditions),
            "capacity": dict(self.capacity),
            "existing_enrollment": dict(self.existing_enrollment),
            "blockers": [blocker.to_payload() for blocker in self.blockers],
            "can_confirm": self.can_confirm,
            "allowed_actions": self.allowed_actions(),
            "evaluated_at": self.evaluated_at,
        }


# ---------------------------------------------------------------------------
# Readiness evaluation
# ---------------------------------------------------------------------------


def _iso(value: Any) -> Optional[str]:
    """Total over what a timestamp can be handed as (10.1 §6 / 10.2's lesson).

    A model field, a jsonb string and an already-serialised row all reach a read
    path, and assuming ``datetime`` is what made the student's own inbox answer
    500. A read on the surface R13.9 exists to make legible must not fail on the
    shape of a timestamp.
    """
    if value is None or value == "":
        return None
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat()
    return str(value)


def _blocker(code: str, message: str, **details: Any) -> ReadinessBlocker:
    """One blocker in 6.5's registered payload shape.

    ``retryable`` is ``False`` for every enrollment blocker: each one is either
    work the student must do (conditions), a decision only the school can change
    (deadline, capacity), or already-committed state (an existing enrollment).
    None of them clears by trying again, and saying otherwise would send the
    student back into a loop.
    """
    return ReadinessBlocker(
        code=code,
        category="enrollment",
        message=message,
        retryable=False,
        details=details,
    )


def condition_tally(application_id: Any, *, rows: Optional[list[dict]] = None) -> dict[str, Any]:
    """Resolved-vs-outstanding condition counts for one application.

    Reads task 10.2's :data:`CONDITION_TERMINAL_STATES` rather than naming
    statuses again. That is the load-bearing detail: before 10.3 this gate asked
    for ``status="pending"`` or ``status="expired"``, which silently treated
    10.2's two new states — ``evidence_submitted`` (the school owes a review) and
    ``changes_required`` (the student owes a replacement) — as *satisfied*. A
    conditional offer whose evidence had just been rejected could therefore be
    confirmed. Deriving the set from the state machine means a future state is
    covered the day it is added.
    """
    from apps.applications.condition_evidence_service import (
        CONDITION_STATE_DEFINITIONS,
        CONDITION_TERMINAL_STATES,
        CONDITION_VERIFIED,
        CONDITION_WAIVED,
    )

    if rows is None:
        rows = list(
            ApplicationCondition.objects.filter(application_id=application_id).values(
                "id", "status", "description"
            )
        )

    outstanding: list[dict[str, Any]] = []
    accepted = 0
    expired = 0
    for row in rows:
        state = (str(row.get("status") or "")).strip().lower()
        if state in CONDITION_TERMINAL_STATES:
            if state in (CONDITION_VERIFIED, CONDITION_WAIVED):
                accepted += 1
            else:
                expired += 1
            continue
        definition = CONDITION_STATE_DEFINITIONS.get(state)
        outstanding.append(
            {
                "id": str(row.get("id")),
                "state": state,
                "waiting_on": (definition or {}).get("waiting_on"),
            }
        )

    return {
        "total": len(rows),
        "accepted": accepted,
        "expired": expired,
        "outstanding": len(outstanding),
        "outstanding_conditions": outstanding,
        "satisfied": not outstanding,
    }


def _existing_enrollment(application, *, enrolled_ids: Optional[dict] = None) -> dict[str, Any]:
    """The existing-enrollment half of design §11.2's recheck list.

    Two questions, deliberately separated:

    * ``this_application`` — is *this* application already enrolled? A repeated
      confirmation is then idempotent rather than an error (design §11.2
      "commits idempotently"), which is what makes a retried request after a
      dropped response safe without an ``Idempotency-Key``.
    * ``other_application_id`` — does the same student already hold an enrolled
      application on the **same canonical Intake_Offering**? Keyed on the
      canonical identity (task 5.3), never the display strings, so a same-name
      offering at another tenant is a different cohort and never a duplicate.
    """
    from apps.applications.capacity_service import CapacityService

    already = (str(getattr(application, "status", "") or "")).strip().lower() == "enrolled"
    offering_id, intake_id = CapacityService.offering_ids(application)
    user_id = getattr(application, "user_id", None)

    other_id: Optional[str] = None
    if offering_id and intake_id and user_id:
        if enrolled_ids is not None:
            other_id = enrolled_ids.get((str(user_id), offering_id, intake_id))
        else:
            row = (
                Application.objects.filter(
                    user_id=user_id,
                    program_offering_id=offering_id,
                    intake_ref_id=intake_id,
                    status="enrolled",
                )
                .exclude(id=getattr(application, "id", None))
                .values_list("id", flat=True)
                .first()
            )
            other_id = str(row) if row else None

    return {
        "this_application": already,
        "other_application_id": other_id,
        "canonical": bool(offering_id and intake_id),
    }


def evaluate_enrollment_readiness(
    application,
    *,
    now=None,
    condition_rows: Optional[list[dict]] = None,
    capacity: Optional[dict[str, Any]] = None,
    enrolled_ids: Optional[dict] = None,
) -> EnrollmentReadiness:
    """The one server-authored enrollment readiness evaluation (R13.9).

    Every gate design §11.2 names — status, all mandatory conditions, deadline,
    capacity, existing enrollment — evaluated in one place and reported with
    stable codes.

    The keyword arguments exist so a **list** read can supply pre-resolved rows
    and pay a bounded query cost for a whole page instead of one round trip per
    application (R17.5). Passing nothing resolves them for a single application.
    Nothing else differs between the two call sites: it is the same evaluation.
    """
    now = now or timezone.now()
    status = (str(getattr(application, "status", "") or "")).strip().lower()

    deadline_value = getattr(application, "enrollment_confirmation_deadline", None)
    deadline_dt = deadline_value if hasattr(deadline_value, "tzinfo") else None
    deadline_iso = _iso(deadline_value)

    seconds_remaining: Optional[int] = None
    days_remaining: Optional[int] = None
    deadline_passed = False
    if deadline_dt is not None:
        delta = deadline_dt - now
        seconds_remaining = int(delta.total_seconds())
        # Floor at the day boundary the student is actually inside: 30 hours left
        # is "1 day", not "1.25". A negative value is reported as-is so a caller
        # can render "overdue by" rather than clamping to zero and implying the
        # deadline is now.
        days_remaining = seconds_remaining // 86400
        deadline_passed = seconds_remaining <= 0

    tally = condition_tally(getattr(application, "id", None), rows=condition_rows)
    existing = _existing_enrollment(application, enrolled_ids=enrolled_ids)

    if capacity is None:
        from apps.applications import readiness_service

        capacity = readiness_service.evaluate_capacity(application)

    blockers: list[ReadinessBlocker] = []

    if existing["this_application"]:
        blockers.append(
            _blocker(ALREADY_ENROLLED, "Your enrollment is already confirmed.")
        )
    elif status not in ENROLLABLE_STATUSES:
        blockers.append(
            _blocker(
                INVALID_STATUS_FOR_ENROLLMENT,
                f"Enrollment cannot be confirmed from status '{status}'.",
                status=status,
            )
        )
    else:
        if status == "conditionally_approved" and not tally["satisfied"]:
            blockers.append(
                _blocker(
                    CONDITIONS_NOT_MET,
                    "Every condition on your offer must be accepted or waived "
                    "before you can confirm your enrollment.",
                    outstanding=tally["outstanding"],
                )
            )
        if deadline_passed:
            blockers.append(
                _blocker(
                    DEADLINE_PASSED,
                    "The enrollment confirmation deadline has passed.",
                    deadline=deadline_iso,
                )
            )
        if existing["other_application_id"]:
            blockers.append(
                _blocker(
                    DUPLICATE_ENROLLMENT,
                    "You have already confirmed enrollment on this intake.",
                    application_id=existing["other_application_id"],
                )
            )
        if not capacity.get("satisfied", True):
            blockers.append(
                _blocker(
                    PROGRAM_CAPACITY_REACHED,
                    "This intake no longer has a place available.",
                    limit=capacity.get("limit"),
                    occupied=capacity.get("occupied"),
                )
            )

    if existing["this_application"]:
        state = "confirmed"
    elif status not in ENROLLABLE_STATUSES:
        state = "not_applicable"
    elif blockers:
        state = "blocked"
    else:
        state = "confirmable"

    return EnrollmentReadiness(
        application_id=str(getattr(application, "id", "") or ""),
        status=status,
        state=state,
        deadline=deadline_iso,
        deadline_passed=deadline_passed,
        seconds_remaining=seconds_remaining,
        days_remaining=days_remaining,
        conditions=tally,
        capacity=dict(capacity),
        existing_enrollment=existing,
        blockers=blockers,
        can_confirm=state == "confirmable",
        evaluated_at=_iso(now) or "",
    )


def enrollment_readiness_map(applications) -> dict[str, dict[str, Any]]:
    """Readiness payloads for a whole page, at a bounded query cost (R17.5).

    A list read must not cost one round trip per row — 9.3/10.1/10.2's rule. The
    conditions for every application on the page resolve in **one** query, the
    ``ProgramIntake``/``Intake`` capacity rows in one each per distinct
    Intake_Offering (there are far fewer offerings than applications on a page),
    the live seat counts in one grouped aggregate, and the enrolled-elsewhere
    rows in one query. The evaluation itself is then pure.
    """
    rows = [app for app in applications if getattr(app, "id", None)]
    if not rows:
        return {}

    from django.db.models import Count

    from apps.applications.capacity_service import SEAT_STATUSES, CapacityService

    app_ids = [getattr(app, "id") for app in rows]

    conditions_by_app: dict[str, list[dict]] = {}
    for row in ApplicationCondition.objects.filter(application_id__in=app_ids).values(
        "id", "application_id", "status", "description"
    ):
        conditions_by_app.setdefault(str(row["application_id"]), []).append(dict(row))

    pairs = set()
    user_keys = set()
    for app in rows:
        offering_id, intake_id = CapacityService.offering_ids(app)
        if offering_id and intake_id:
            pairs.add((offering_id, intake_id))
            user_id = getattr(app, "user_id", None)
            if user_id:
                user_keys.add(str(user_id))

    capacity_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    enrolled_ids: dict[tuple[str, str, str], str] = {}

    if pairs:
        from apps.catalog.models import Intake, ProgramIntake

        offering_ids = {pair[0] for pair in pairs}
        intake_ids = {pair[1] for pair in pairs}

        program_intakes = {
            (str(pi.program_id), str(pi.intake_id)): pi
            for pi in ProgramIntake.objects.filter(
                program_id__in=offering_ids, intake_id__in=intake_ids
            )
        }
        intakes = {str(i.id): i for i in Intake.objects.filter(id__in=intake_ids)}

        occupancy: dict[tuple[str, str], int] = {}
        for row in (
            Application.objects.filter(
                program_offering_id__in=offering_ids,
                intake_ref_id__in=intake_ids,
                status__in=SEAT_STATUSES,
            )
            .values("program_offering_id", "intake_ref_id")
            .annotate(seats=Count("id"))
        ):
            occupancy[
                (str(row["program_offering_id"]), str(row["intake_ref_id"]))
            ] = row["seats"]

        for pair in pairs:
            program_intake = program_intakes.get(pair)
            if program_intake is None:
                capacity_by_pair[pair] = {
                    "canonical": True,
                    "limit": None,
                    "occupied": None,
                    "seats_available": None,
                    "satisfied": True,
                    "code": None,
                }
                continue
            limit = CapacityService.capacity_limit(program_intake, intakes.get(pair[1]))
            capacity_by_pair[pair] = {
                "canonical": True,
                "limit": limit,
                "occupied": occupancy.get(pair, 0),
                "seats_available": None,
                "satisfied": True,
                "code": None,
            }

        if user_keys:
            for row in Application.objects.filter(
                user_id__in=user_keys,
                program_offering_id__in=offering_ids,
                intake_ref_id__in=intake_ids,
                status="enrolled",
            ).values("id", "user_id", "program_offering_id", "intake_ref_id"):
                enrolled_ids[
                    (
                        str(row["user_id"]),
                        str(row["program_offering_id"]),
                        str(row["intake_ref_id"]),
                    )
                ] = str(row["id"])

    now = timezone.now()
    payloads: dict[str, dict[str, Any]] = {}
    for app in rows:
        offering_id, intake_id = CapacityService.offering_ids(app)
        capacity: Optional[dict[str, Any]] = None
        if offering_id and intake_id:
            base = capacity_by_pair.get((offering_id, intake_id))
            if base is not None:
                app_status = (str(getattr(app, "status", "") or "")).strip().lower()
                capacity = _capacity_for(base, holds_seat=app_status in SEAT_STATUSES)
        if capacity is None:
            capacity = {
                "canonical": bool(offering_id and intake_id),
                "limit": None,
                "occupied": None,
                "seats_available": None,
                "satisfied": True,
                "code": None,
            }
        payloads[str(getattr(app, "id"))] = evaluate_enrollment_readiness(
            app,
            now=now,
            condition_rows=conditions_by_app.get(str(getattr(app, "id")), []),
            capacity=capacity,
            enrolled_ids=enrolled_ids,
        ).to_payload()
    return payloads


def _capacity_for(base: dict[str, Any], *, holds_seat: bool) -> dict[str, Any]:
    """Project a grouped occupancy row onto one application's capacity view.

    Exactly the predicate ``CapacityService.take_seat_for_submission`` evaluates
    under its row lock, and exactly what ``readiness_service.evaluate_capacity``
    computes for a single application: the question is always *"is there room for
    me"*, never *"is the intake full including me"*. An application already in a
    seat-occupying status counts itself in the grouped aggregate, so its own seat
    is subtracted first; one that does not hold a seat — a conditional offer,
    which ``SEAT_STATUSES`` does not include — is compared against the whole
    cohort, because it genuinely still needs a place.
    """
    limit = base.get("limit")
    occupied = base.get("occupied")
    if limit is None or occupied is None:
        return {**base, "seats_available": None, "satisfied": True, "code": None}
    others = max(occupied - 1, 0) if holds_seat else occupied
    seats_available = max(limit - others, 0)
    return {
        **base,
        "occupied": others,
        "seats_available": seats_available,
        "satisfied": seats_available > 0,
        "code": None if seats_available > 0 else PROGRAM_CAPACITY_REACHED,
    }


class EnrollmentService:
    """Orchestrates enrollment confirmation, readiness, and deadline computation."""

    #: Re-exported so callers have one import for the readiness contract.
    ENROLLABLE_STATUSES = ENROLLABLE_STATUSES

    @staticmethod
    def readiness(application, **kwargs) -> EnrollmentReadiness:
        """The server-authored readiness for one application (R13.9)."""
        return evaluate_enrollment_readiness(application, **kwargs)

    @staticmethod
    def confirm_enrollment(application_id: str, user_id: str) -> Application:
        """Confirm enrollment for an approved or conditionally approved application.

        Every gate is evaluated **under the locks** by the same evaluator the read
        contract publishes (R13.9, design §11.2). The lock order is task 5.3's —
        the ``ProgramIntake`` capacity row first, then the application row — so
        this command cannot deadlock against submission, withdrawal, promotion or
        the expiry sweep.

        Idempotent: confirming an application that is already ``enrolled`` returns
        it unchanged instead of raising, so a retried request after a dropped
        response is safe with or without an ``Idempotency-Key``.

        Args:
            application_id: UUID of the application.
            user_id: UUID of the student confirming enrollment.

        Returns:
            The updated Application instance.

        Raises:
            EnrollmentError: If validation fails. ``code`` is one of the stable
                codes declared at module level.
            Application.DoesNotExist: If application not found.
        """
        from apps.applications.capacity_service import CapacityService

        # --- Advisory pre-check (cheap, outside the transaction) --------------
        # A refusal that is already true before any lock is taken should not pay
        # for a lock. The authoritative answer is the in-lock re-evaluation
        # below; this only avoids doing that work for an obviously ineligible
        # application, which is the same advisory/authoritative split task 5.3
        # uses for the pre-lock capacity check.
        application = Application.objects.get(id=application_id)
        if (str(application.status or "")).strip().lower() == "enrolled":
            return application
        advisory = evaluate_enrollment_readiness(application)
        if not advisory.can_confirm:
            _raise_for(advisory)

        offering_id, intake_id = CapacityService.offering_ids(application)

        with transaction.atomic():
            # Lock order: capacity row first (task 5.3), then the application.
            if offering_id and intake_id:
                CapacityService.lock_capacity_row(offering_id, intake_id)

            locked_app = Application.objects.select_for_update().get(id=application_id)

            # Idempotent commit: a concurrent confirmation already won. Return
            # the committed state rather than failing the retry.
            if (str(locked_app.status or "")).strip().lower() == "enrolled":
                return locked_app

            # Re-run the *same* evaluation on the locked rows. Conditions,
            # deadline, capacity and existing enrollment are all re-read here —
            # which is the STU-15 defect: before 10.3 the condition and deadline
            # reads happened before the transaction opened, so a condition
            # rejected (or a deadline shortened) in between was invisible.
            readiness = evaluate_enrollment_readiness(locked_app)
            if not readiness.can_confirm:
                _raise_for(readiness)

            transition_application_status(
                application=locked_app,
                new_status="enrolled",
                changed_by=user_id,
                notes="Student confirmed enrollment.",
            )

        # Send notification
        _send_enrollment_notification(locked_app)

        return locked_app

    @staticmethod
    def compute_deadline(application: Application):
        """Compute the enrollment confirmation deadline for an application.

        Looks up ``academic_calendar_events`` for the application's **own**
        canonical intake (resolved by ``intake_id``, not by the ``intake``
        display snapshot) with ``event_type='enrollment_confirmation_deadline'``.
        Falls back to approval_date + 14 days when the application carries no
        canonical intake id, the intake is inactive, or no calendar event is
        configured.

        Args:
            application: The Application instance.

        Returns:
            A datetime representing the enrollment confirmation deadline.
        """
        from apps.catalog.models import AcademicCalendarEvent

        # The calendar event must be the application's **own** intake's
        # (remediation L1, DATA-01 / STU-01). Resolved through the canonical
        # ``intake_id`` the application carries, never the ``intake`` display
        # snapshot — a same-name other tenant's
        # ``enrollment_confirmation_deadline`` event would otherwise decide when
        # this student loses their seat. No canonical intake id → fall through to
        # the documented default window below, never to a name lookup.
        from apps.applications.canonical_reads import resolve_intake

        intake = resolve_intake(application, require_active=True)
        if intake:
            event = AcademicCalendarEvent.objects.filter(
                intake=intake,
                event_type="enrollment_confirmation_deadline",
            ).first()
            if event:
                from datetime import datetime, time
                naive = datetime.combine(event.event_date, time(23, 59, 59))
                return timezone.make_aware(naive)

        # Fallback: approval_date + default deadline window
        approval_date = application.decision_date or timezone.now()
        return approval_date + timedelta(days=DEFAULT_ENROLLMENT_DEADLINE_DAYS)


def _raise_for(readiness: EnrollmentReadiness) -> None:
    """Turn the first blocker into the command's refusal.

    The blocker order in :func:`evaluate_enrollment_readiness` is the refusal
    precedence, declared once: status, then conditions, then deadline, then a
    duplicate enrollment, then capacity. Pre-10.3 callers branch on
    ``INVALID_STATUS_FOR_ENROLLMENT`` / ``CONDITIONS_NOT_MET`` /
    ``DEADLINE_PASSED`` and still see exactly those codes, in that order, with a
    400 — the two new codes are conflicts with committed state and answer 409.
    """
    blocker = readiness.first_blocker()
    if blocker is None:  # pragma: no cover - defensive
        raise EnrollmentError(
            INVALID_STATUS_FOR_ENROLLMENT,
            "Enrollment cannot be confirmed for this application.",
        )
    conflict = blocker.code in (DUPLICATE_ENROLLMENT, PROGRAM_CAPACITY_REACHED)
    raise EnrollmentError(
        blocker.code, blocker.message, status_code=409 if conflict else 400
    )


def _send_enrollment_notification(application: Application) -> None:
    """Create a Notification and dispatch email for enrollment confirmation."""
    try:
        from apps.common.communication_service import CommunicationService

        CommunicationService.send("enrollment_confirmed", application)
    except Exception:
        logger.exception(
            "Failed to send enrollment notification for application %s",
            application.id,
        )


__all__ = [
    "ALREADY_ENROLLED",
    "CONDITIONS_NOT_MET",
    "DEADLINE_PASSED",
    "DEFAULT_ENROLLMENT_DEADLINE_DAYS",
    "DUPLICATE_ENROLLMENT",
    "ENROLLABLE_STATUSES",
    "ENROLLMENT_STATE_DEFINITIONS",
    "INVALID_STATUS_FOR_ENROLLMENT",
    "PROGRAM_CAPACITY_REACHED",
    "EnrollmentError",
    "EnrollmentReadiness",
    "EnrollmentService",
    "condition_tally",
    "enrollment_readiness_map",
    "evaluate_enrollment_readiness",
]
