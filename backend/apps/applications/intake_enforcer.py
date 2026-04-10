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

        # Deadline check
        if intake.application_deadline and date.today() > intake.application_deadline:
            return IntakeCheckResult(
                False, "INTAKE_DEADLINE_PASSED",
                f"The application deadline ({intake.application_deadline.isoformat()}) has passed.",
            )

        # Capacity check
        if intake.max_capacity is not None and intake.current_enrollment is not None:
            if intake.current_enrollment >= intake.max_capacity:
                return IntakeCheckResult(False, "INTAKE_CAPACITY_REACHED",
                    "This intake has reached maximum capacity.")

        return IntakeCheckResult(True)

    @staticmethod
    def increment_enrollment(intake_name: str) -> None:
        """Atomically increment current_enrollment using F() expression."""
        from apps.applications.identifier_resolver import IdentifierResolver

        resolved = IdentifierResolver.resolve_intake(intake_name)
        if resolved.source != "not_found" and resolved.id:
            Intake.objects.filter(id=resolved.id).update(
                current_enrollment=F("current_enrollment") + 1
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
