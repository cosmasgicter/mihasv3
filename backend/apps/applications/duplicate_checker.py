# backend/apps/applications/duplicate_checker.py

from dataclasses import dataclass
from typing import Optional
from apps.applications.models import Application

# Terminal statuses: applications in these statuses do NOT block new applications
# for the same program+intake. A student can reapply after withdrawal, rejection, etc.
TERMINAL_STATUSES = {"rejected", "withdrawn", "expired", "enrolled", "enrollment_expired"}

# Non-terminal statuses: an existing application in one of these statuses BLOCKS
# creation of a new application for the same program+intake.
NON_TERMINAL_STATUSES = {"draft", "submitted", "under_review", "waitlisted", "conditionally_approved", "approved"}

SUBMITTED_STATUSES = {"submitted", "under_review", "approved", "waitlisted"}


@dataclass(frozen=True)
class DuplicateCheckResult:
    has_duplicate: bool
    existing_id: Optional[str] = None
    existing_status: Optional[str] = None
    resume_url: Optional[str] = None


class DuplicateChecker:
    @staticmethod
    def check_at_create(user_id: str, program: str, intake: str) -> DuplicateCheckResult:
        # Check multi_intake_policy (Req 15.1, 15.2)
        policy = "unrestricted"
        try:
            from apps.common.models import Setting
            setting = Setting.objects.filter(key="multi_intake_policy").first()
            if setting and setting.value:
                policy = str(setting.value)
        except Exception:
            pass

        if policy == "single_active":
            # Check across ALL intakes for same program (Req 15.2)
            existing = Application.objects.filter(
                user_id=user_id, program=program,
                status__in=NON_TERMINAL_STATUSES,
            ).first()
        else:
            # Default: check only within the target intake
            existing = Application.objects.filter(
                user_id=user_id, program=program, intake=intake,
                status__in=NON_TERMINAL_STATUSES,
            ).first()

        if existing:
            resume_url = f"/student/application/{existing.id}"
            return DuplicateCheckResult(True, str(existing.id), existing.status, resume_url)
        return DuplicateCheckResult(False)

    @staticmethod
    def check_at_submit(user_id: str, program: str, intake: str, exclude_id: str) -> DuplicateCheckResult:
        existing = Application.objects.filter(
            user_id=user_id, program=program, intake=intake,
            status__in=SUBMITTED_STATUSES,
        ).exclude(id=exclude_id).first()
        if existing:
            return DuplicateCheckResult(True, str(existing.id), existing.status)
        return DuplicateCheckResult(False)
