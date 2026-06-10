"""Application Celery tasks - re-export package.

All tasks are importable from apps.applications.tasks for backward
compatibility with CELERY_BEAT_SCHEDULE and existing test imports.
"""

from django.utils import timezone  # noqa: F401 - patched by tests

from .condition_expiry import condition_expiry_task  # noqa: F401
from .draft_expiry import draft_expiry_reminder_task  # noqa: F401
from .enrollment import enrollment_confirmation_expiry_task  # noqa: F401
from .interview import interview_auto_complete_task, interview_reminder_task  # noqa: F401
from .pdf_generation import (  # noqa: F401
    generate_acceptance_letter_task,
    generate_application_slip_task,
    generate_conditional_offer_task,
    generate_finance_receipt_task,
    generate_payment_receipt_task,
)
from .review_sla import review_sla_reminder_task  # noqa: F401
from .waitlist import waitlist_cascade_task  # noqa: F401

__all__ = [
    "condition_expiry_task",
    "draft_expiry_reminder_task",
    "enrollment_confirmation_expiry_task",
    "interview_auto_complete_task",
    "interview_reminder_task",
    "generate_acceptance_letter_task",
    "generate_application_slip_task",
    "generate_conditional_offer_task",
    "generate_finance_receipt_task",
    "generate_payment_receipt_task",
    "review_sla_reminder_task",
    "waitlist_cascade_task",
]
