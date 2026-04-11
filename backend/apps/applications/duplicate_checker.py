# backend/apps/applications/duplicate_checker.py

from dataclasses import dataclass
from typing import Optional
from apps.applications.models import Application

NON_TERMINAL_STATUSES = {"draft", "submitted", "under_review", "approved", "waitlisted"}
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
