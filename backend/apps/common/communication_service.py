"""Communication service — template-based notifications and emails.

Implements task 10.1.
Requirements: 9.1–9.5, 9.7
"""

import logging
import re

from django.utils import timezone
from html import escape as html_escape

logger = logging.getLogger(__name__)

# Default fallback messages when template is missing or inactive
_DEFAULT_SUBJECT = "MIHAS Admissions — Notification"
_DEFAULT_BODY = (
    "<p>You have a new notification from MIHAS Admissions.</p>"
    "<p>Please log in to your account for details.</p>"
    "<p>Best regards,<br>MIHAS Admissions</p>"
)

# Regex for {{variable}} placeholders
_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")


def _log_best_effort_failure(action: str, template_key: str, application_id=None, exc: Exception | None = None) -> None:
    """Log communication side-effect failures without full traceback noise.

    Communication delivery is best-effort. Repeated stack traces for expected
    secondary failures create test flakiness and operational noise without
    improving recoverability.
    """
    details = f"{exc.__class__.__name__}: {exc}" if exc is not None else "unknown error"
    if application_id is None:
        logger.warning(
            "Communication best-effort failure during %s for template '%s': %s",
            action,
            template_key,
            details,
        )
    else:
        logger.warning(
            "Communication best-effort failure during %s for template '%s', app=%s: %s",
            action,
            template_key,
            application_id,
            details,
        )


class CommunicationService:
    """Template-based notification and email dispatch."""

    @staticmethod
    def render_template(template_key: str, context: dict | None = None) -> tuple[str, str]:
        """Look up a CommunicationTemplate by key and substitute variables.

        Returns (subject, body). Falls back to defaults if template is
        not found or inactive.
        """
        from apps.common.models import CommunicationTemplate

        context = context or {}

        try:
            template = CommunicationTemplate.objects.filter(
                template_key=template_key, is_active=True
            ).first()
        except Exception as exc:
            _log_best_effort_failure("template lookup", template_key, exc=exc)
            template = None

        if template is None:
            logger.info(
                "Template '%s' not found or inactive — using fallback", template_key
            )
            return _DEFAULT_SUBJECT, _DEFAULT_BODY

        subject = _substitute(template.subject_template, context)
        body = _substitute(template.body_template, context)
        return subject, body

    @staticmethod
    def send(template_key: str, application, extra_context: dict | None = None) -> None:
        """Render template and dispatch notification + email based on channel.

        Creates a Notification row if channel is 'notification' or 'both'.
        Creates an EmailQueue row and dispatches via send_email_task if
        channel is 'email' or 'both'.
        """
        from apps.common.models import CommunicationTemplate
        from apps.common.outbox import create_notification, queue_email

        context = _build_context(application, extra_context)

        # Look up template for channel info
        try:
            template = CommunicationTemplate.objects.filter(
                template_key=template_key, is_active=True
            ).first()
        except Exception as exc:
            _log_best_effort_failure("channel lookup", template_key, application_id=getattr(application, "id", None), exc=exc)
            template = None

        channel = template.channel if template else "both"
        subject, body = CommunicationService.render_template(template_key, context)

        # Create Notification if channel includes notification
        if channel in ("notification", "both"):
            try:
                create_notification(
                    user_id=application.user_id,
                    title=subject,
                    message=body,
                    type="info",
                    priority="normal",
                    action_url=f"/student/application/{application.id}",
                )
            except Exception as exc:
                _log_best_effort_failure(
                    "notification create",
                    template_key,
                    application_id=getattr(application, "id", None),
                    exc=exc,
                )

        # Create EmailQueue and dispatch if channel includes email
        if channel in ("email", "both"):
            try:
                from apps.common.email_templates import get_base_email_html

                wrapped_body = (
                    body if "<!DOCTYPE" in body
                    else get_base_email_html(body, title=subject)
                )
                queue_email(
                    recipient_email=application.email,
                    recipient_name=getattr(application, "full_name", ""),
                    subject=subject,
                    body=wrapped_body,
                )
            except Exception as exc:
                _log_best_effort_failure(
                    "email dispatch",
                    template_key,
                    application_id=getattr(application, "id", None),
                    exc=exc,
                )


def _substitute(template_str: str, context: dict) -> str:
    """Replace {{variable}} placeholders with sanitized context values."""

    def _replacer(match):
        key = match.group(1)
        value = context.get(key, "")
        # Sanitize HTML in variable values to prevent injection
        return html_escape(str(value)) if value else ""

    return _PLACEHOLDER_RE.sub(_replacer, template_str)


def _build_context(application, extra_context: dict | None = None) -> dict:
    """Build a standard context dict from an application object."""
    ctx = {
        "student_name": getattr(application, "full_name", ""),
        "application_number": getattr(application, "application_number", ""),
        "program_name": str(getattr(application, "program", "")),
        "intake_name": str(getattr(application, "intake", "")),
        "status": getattr(application, "status", ""),
        "tracking_code": getattr(application, "public_tracking_code", "") or getattr(application, "tracking_code", ""),
        "portal_url": "***REMOVED***",
    }
    if extra_context:
        ctx.update(extra_context)
    return ctx
