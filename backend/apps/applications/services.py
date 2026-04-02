"""Application service helpers.

Shared business logic extracted from views to eliminate duplication.
"""

import logging

from django.utils import timezone

from apps.applications.models import Application, ApplicationStatusHistory

logger = logging.getLogger(__name__)

# Fields updated by transition_application_status — kept as a module
# constant so both the helper and its callers can reference the same list.
_STATUS_TRANSITION_UPDATE_FIELDS = [
    "status",
    "review_started_at",
    "reviewed_by",
    "admin_feedback",
    "admin_feedback_date",
    "admin_feedback_by",
    "decision_date",
    "updated_at",
]


def transition_application_status(
    application: Application,
    new_status: str,
    changed_by: str,
    notes: str = "",
    ip_address: str = "",
    user_agent: str = "",
) -> str:
    """Apply a status transition to an application and record history.

    Mutates *application* in place, calls ``application.save()``, and
    creates an ``ApplicationStatusHistory`` row.

    Args:
        application: The Application instance to transition.
        new_status: Target status value.
        changed_by: User ID (as string) of the actor performing the change.
        notes: Optional reviewer notes / admin feedback.
        ip_address: Hashed or raw IP for the history record.
        user_agent: Hashed or raw user-agent for the history record.

    Returns:
        The previous status value (``old_status``).
    """
    old_status = application.status
    application.status = new_status

    if not application.review_started_at:
        application.review_started_at = timezone.now()

    application.reviewed_by_id = changed_by

    if notes:
        application.admin_feedback = notes
        application.admin_feedback_date = timezone.now()
        application.admin_feedback_by_id = changed_by

    if new_status in ("approved", "rejected"):
        application.decision_date = timezone.now()

    application.save(update_fields=_STATUS_TRANSITION_UPDATE_FIELDS)

    ApplicationStatusHistory.objects.create(
        application=application,
        status=new_status,
        old_status=old_status,
        new_status=new_status,
        changed_by_id=changed_by,
        notes=notes,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return old_status
