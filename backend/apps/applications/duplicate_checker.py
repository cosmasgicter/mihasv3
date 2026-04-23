# backend/apps/applications/duplicate_checker.py

from dataclasses import dataclass
from typing import Optional
from django.db.models import Q
from apps.applications.models import Application

# Terminal statuses: applications in these statuses do NOT block new applications
# for the same program+intake. A student can reapply after withdrawal, rejection, etc.
TERMINAL_STATUSES = {"rejected", "withdrawn", "expired", "enrolled", "enrollment_expired"}

# Non-terminal statuses: an existing application in one of these statuses BLOCKS
# creation of a new application for the same program+intake.
NON_TERMINAL_STATUSES = {"draft", "submitted", "under_review", "waitlisted", "conditionally_approved", "approved"}

SUBMITTED_STATUSES = {"submitted", "under_review", "approved", "waitlisted", "conditionally_approved"}


@dataclass(frozen=True)
class DuplicateCheckResult:
    has_duplicate: bool
    existing_id: Optional[str] = None
    existing_status: Optional[str] = None
    resume_url: Optional[str] = None


def _identity_matches(existing: Application, nrc_number: str | None, passport_number: str | None) -> bool:
    """Check if an existing application belongs to the same applicant identity.

    An application is considered the same identity if:
    - Both have the same NRC number (non-empty), OR
    - Both have the same passport number (non-empty)

    If the new application has a different NRC/passport, it's a different
    person applying through the same user account (agent use case).
    """
    existing_nrc = (existing.nrc_number or "").strip()
    existing_passport = (existing.passport_number or "").strip()
    new_nrc = (nrc_number or "").strip()
    new_passport = (passport_number or "").strip()

    # If we can't compare (no identity on either side), assume same person
    if not new_nrc and not new_passport:
        return True
    if not existing_nrc and not existing_passport:
        return True

    # Match if any shared identity document matches
    if new_nrc and existing_nrc and new_nrc == existing_nrc:
        return True
    if new_passport and existing_passport and new_passport == existing_passport:
        return True

    # Different identity documents = different applicant
    return False


class DuplicateChecker:
    @staticmethod
    def check_at_create(
        user_id: str,
        program: str,
        intake: str,
        nrc_number: str | None = None,
        passport_number: str | None = None,
    ) -> DuplicateCheckResult:
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
            candidates = Application.objects.filter(
                user_id=user_id, program=program,
                status__in=NON_TERMINAL_STATUSES,
            )
        else:
            candidates = Application.objects.filter(
                user_id=user_id, program=program, intake=intake,
                status__in=NON_TERMINAL_STATUSES,
            )

        # Filter to same-identity applicants only
        for existing in candidates:
            if _identity_matches(existing, nrc_number, passport_number):
                resume_url = f"/student/application/{existing.id}"
                return DuplicateCheckResult(True, str(existing.id), existing.status, resume_url)

        return DuplicateCheckResult(False)

    @staticmethod
    def check_at_submit(user_id: str, program: str, intake: str, exclude_id: str) -> DuplicateCheckResult:
        # At submit time, compare the submitting application's identity against others
        try:
            submitting = Application.objects.get(id=exclude_id)
        except Application.DoesNotExist:
            return DuplicateCheckResult(False)

        candidates = Application.objects.filter(
            user_id=user_id, program=program, intake=intake,
            status__in=SUBMITTED_STATUSES,
        ).exclude(id=exclude_id)

        for existing in candidates:
            if _identity_matches(existing, submitting.nrc_number, submitting.passport_number):
                return DuplicateCheckResult(True, str(existing.id), existing.status)

        return DuplicateCheckResult(False)
