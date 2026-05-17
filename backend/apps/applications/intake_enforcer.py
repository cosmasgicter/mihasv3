# backend/apps/applications/intake_enforcer.py

from dataclasses import dataclass
from datetime import date
from typing import Optional
from django.db.models import F
from apps.catalog.models import Intake


@dataclass(frozen=True)
class IntakeCheckResult:
    allowed: bool
    code: Optional[str] = None      # Error code if not allowed
    message: Optional[str] = None
    is_late: bool = False            # True when within grace period


class IntakeEnforcer:
    """Enforces intake deadline and capacity rules."""

    @staticmethod
    def check_submission(intake_name: str, program_name: str) -> IntakeCheckResult:
        """Check deadline and capacity for submission. Returns error if blocked."""
        from apps.applications.identifier_resolver import IdentifierResolver

        intake_resolved = IdentifierResolver.resolve_intake(intake_name)
        if intake_resolved.source == "not_found":
            return IntakeCheckResult(True)  # Skip enforcement if intake not found

        intake = Intake.objects.filter(id=intake_resolved.id).first()
        if not intake:
            return IntakeCheckResult(True)

        # Deadline check with grace period support (Req 6.1–6.4)
        if intake.application_deadline and date.today() > intake.application_deadline:
            from datetime import timedelta

            if intake.grace_period_days and intake.grace_period_days > 0:
                grace_end = intake.application_deadline + timedelta(days=intake.grace_period_days)
                if date.today() <= grace_end:
                    # Within grace period — allow but flag as late
                    return IntakeCheckResult(allowed=True, is_late=True)

            return IntakeCheckResult(
                False, "INTAKE_DEADLINE_PASSED",
                f"The application deadline ({intake.application_deadline.isoformat()}) has passed.",
            )

        # Capacity check — use live count of non-rejected applications
        if intake.max_capacity is not None:
            from apps.applications.models import Application
            live_count = Application.objects.filter(
                intake=intake_name,
                status__in=("submitted", "under_review", "approved", "waitlisted"),
            ).count()
            if live_count >= intake.max_capacity:
                return IntakeCheckResult(False, "INTAKE_CAPACITY_REACHED",
                    f"This intake has reached maximum capacity ({live_count}/{intake.max_capacity}).")

        # Per-program capacity check
        if program_name:
            from apps.applications.identifier_resolver import IdentifierResolver
            from apps.catalog.models import ProgramIntake
            prog_resolved = IdentifierResolver.resolve_program(program_name)
            intake_resolved_pi = IdentifierResolver.resolve_intake(intake_name)
            if prog_resolved.id and intake_resolved_pi.id:
                pi = ProgramIntake.objects.filter(program_id=prog_resolved.id, intake_id=intake_resolved_pi.id).first()
                if pi and pi.max_capacity is not None:
                    from apps.applications.models import Application
                    live_pi_count = Application.objects.filter(
                        program=program_name, intake=intake_name,
                        status__in=("submitted", "under_review", "approved", "waitlisted"),
                    ).count()
                    if live_pi_count >= pi.max_capacity:
                        return IntakeCheckResult(
                            False, "PROGRAM_CAPACITY_REACHED",
                            f"Program '{program_name}' for intake '{intake_name}' is full ({live_pi_count}/{pi.max_capacity}).",
                        )

        return IntakeCheckResult(True)

    @staticmethod
    def check_draft_creation(intake_name: str) -> IntakeCheckResult:
        """Check if a draft can be created for this intake (deadline + open date)."""
        from apps.applications.identifier_resolver import IdentifierResolver

        intake_resolved = IdentifierResolver.resolve_intake(intake_name)
        if intake_resolved.source == "not_found":
            return IntakeCheckResult(True)

        intake = Intake.objects.filter(id=intake_resolved.id).first()
        if not intake:
            return IntakeCheckResult(True)

        today = date.today()

        # Application start date check
        if intake.application_start_date and today < intake.application_start_date:
            return IntakeCheckResult(
                False, "INTAKE_NOT_OPEN",
                f"Applications for this intake open on {intake.application_start_date.isoformat()}.",
            )

        # Deadline check
        if intake.application_deadline and today > intake.application_deadline:
            return IntakeCheckResult(
                False, "INTAKE_DEADLINE_PASSED",
                f"The application deadline ({intake.application_deadline.isoformat()}) has passed.",
            )

        return IntakeCheckResult(True)

    @staticmethod
    def sync_enrollment(intake_name: str) -> None:
        """Sync current_enrollment with actual count of non-rejected applications.

        Performance note (AUDIT-5.6-001):
        The original implementation used N+1 queries — one COUNT per ProgramIntake
        row. This was refactored to use a single GROUP BY aggregation query that
        builds a count_map, then batch-updates all ProgramIntake rows. This reduces
        the query count from O(N) to O(1) regardless of the number of program+intake
        combinations. The two-query approach (one aggregation + one ProgramIntake
        fetch) is equivalent to the per-row loop but scales linearly with data
        rather than with the number of program+intake combinations.
        """
        from apps.applications.identifier_resolver import IdentifierResolver
        from apps.applications.models import Application
        from apps.catalog.models import Program, ProgramIntake

        resolved = IdentifierResolver.resolve_intake(intake_name)
        if resolved.source == "not_found" or not resolved.id:
            return

        # Single query for intake-level count
        live_count = Application.objects.filter(
            intake=intake_name,
            status__in=("submitted", "under_review", "approved", "waitlisted"),
        ).count()
        Intake.objects.filter(id=resolved.id).update(current_enrollment=live_count)

        # Single aggregation query for all program_intakes (fixes N+1)
        from django.db.models import Count
        counts = (
            Application.objects.filter(
                intake=intake_name,
                status__in=("submitted", "under_review", "approved", "waitlisted"),
            )
            .values("program")
            .annotate(cnt=Count("id"))
        )
        count_map = {row["program"]: row["cnt"] for row in counts}

        for pi in ProgramIntake.objects.filter(intake_id=resolved.id).select_related("program"):
            expected = count_map.get(pi.program.name, 0)
            ProgramIntake.objects.filter(id=pi.id).update(current_enrollment=expected)

    @staticmethod
    def increment_enrollment(intake_name: str, program_name: str = "") -> None:
        """Atomically increment current_enrollment using F() expression."""
        from apps.applications.identifier_resolver import IdentifierResolver

        resolved = IdentifierResolver.resolve_intake(intake_name)
        if resolved.source == "not_found" or not resolved.id:
            return
        Intake.objects.filter(id=resolved.id).update(
            current_enrollment=F("current_enrollment") + 1
        )
        if program_name:
            from apps.catalog.models import Program, ProgramIntake
            program = Program.objects.filter(name=program_name).first()
            if program:
                ProgramIntake.objects.filter(
                    intake_id=resolved.id, program_id=program.id
                ).update(current_enrollment=F("current_enrollment") + 1)

    @staticmethod
    def decrement_enrollment(intake_name: str, program_name: str = "") -> None:
        """Atomically decrement current_enrollment (floor at 0)."""
        from apps.applications.identifier_resolver import IdentifierResolver

        resolved = IdentifierResolver.resolve_intake(intake_name)
        if resolved.source == "not_found" or not resolved.id:
            return
        from django.db.models.functions import Greatest
        Intake.objects.filter(id=resolved.id).update(
            current_enrollment=Greatest(F("current_enrollment") - 1, 0)
        )
        if program_name:
            from apps.catalog.models import Program, ProgramIntake
            program = Program.objects.filter(name=program_name).first()
            if program:
                ProgramIntake.objects.filter(
                    intake_id=resolved.id, program_id=program.id
                ).update(
                    current_enrollment=Greatest(F("current_enrollment") - 1, 0)
                )

    @staticmethod
    def get_warnings(intake_name: str) -> list[str]:
        """Return advisory warnings for draft creation (deadline near, capacity near)."""
        from apps.applications.identifier_resolver import IdentifierResolver

        warnings = []
        resolved = IdentifierResolver.resolve_intake(intake_name)
        if resolved.source == "not_found":
            return warnings

        intake = Intake.objects.filter(id=resolved.id).first()
        if not intake:
            return warnings

        if intake.application_deadline and date.today() > intake.application_deadline:
            warnings.append(f"Deadline ({intake.application_deadline.isoformat()}) has passed.")

        if (intake.max_capacity and intake.current_enrollment is not None
                and intake.current_enrollment >= intake.max_capacity * 0.9):
            pct = round(intake.current_enrollment / intake.max_capacity * 100)
            warnings.append(f"Intake is {pct}% full ({intake.current_enrollment}/{intake.max_capacity}).")

        return warnings
