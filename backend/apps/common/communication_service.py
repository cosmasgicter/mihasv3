"""Communication service - template-based notifications and emails.

Implements task 10.1.
Requirements: 9.1–9.5, 9.7
"""

import logging
import re

from django.utils import timezone
from html import escape as html_escape
from html.parser import HTMLParser

logger = logging.getLogger(__name__)

# Default fallback messages when template is missing or inactive
_DEFAULT_SUBJECT = "MIHAS Admissions — Notification"
_DEFAULT_BODY = (
    "<p>You have a new notification from MIHAS Admissions.</p>"
    "<p>Please log in to your account for details.</p>"
    "<p>Best regards,<br>MIHAS Admissions</p>"
)
_DEFAULT_NOTIFICATION_TEXT = "You have a new notification from MIHAS Admissions. Open the dashboard for details."

_FALLBACK_TEMPLATES = {
    "payment_expired": (
        "Payment Expired — New Payment Required",
        (
            "<p>Dear {{student_name}},</p>"
            "<p>Your pending payment for application {{application_number}} has expired after 24 hours.</p>"
            "<p>Please log in and initiate a new payment.</p>"
            "<p>Best regards,<br>MIHAS Admissions</p>"
        ),
    ),
}

# Regex for {{variable}} placeholders
_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")

# Regexes for stripping email-only chrome from notification bodies
_LOG_IN_PARAGRAPH_RE = re.compile(r"<p[^>]*>[^<]*Please log in[^<]*</p>", re.IGNORECASE)
_BEST_REGARDS_PARAGRAPH_RE = re.compile(r"<p[^>]*>\s*Best regards(?:(?!</p>).){0,2000}</p>", re.IGNORECASE | re.DOTALL)


def _strip_email_chrome_for_notification(html_body: str) -> str:
    """Remove email-only chrome (sign-off, 'log in' instructions) from a body
    that will be rendered as in-app notification text. Email body is unaffected.
    """
    stripped = _LOG_IN_PARAGRAPH_RE.sub("", html_body)
    stripped = _BEST_REGARDS_PARAGRAPH_RE.sub("", stripped)
    return stripped


class _NotificationTextParser(HTMLParser):
    """Convert simple email HTML into readable notification text."""

    _BLOCK_TAGS = {"p", "div", "section", "article", "ul", "ol", "li", "tr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag.lower() in self._BLOCK_TAGS:
            self.parts.append("\n\n")

    def handle_data(self, data):
        self.parts.append(data)

    def text(self) -> str:
        text = "".join(self.parts)
        text = re.sub(r"[ \t\r\f\v]+", " ", text)
        text = re.sub(r" *\n *", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


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
    def render_template(template_key: str, context: dict | None = None, for_notification: bool = False) -> tuple[str, str]:
        """Look up a CommunicationTemplate by key and substitute variables.

        Returns (subject, body). Falls back to defaults if template is
        not found or inactive. When for_notification=True and template is
        missing, uses notification-friendly default (no 'log in' copy).
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
            if template_key in _FALLBACK_TEMPLATES:
                subject_template, body_template = _FALLBACK_TEMPLATES[template_key]
                return _substitute(subject_template, context), _substitute(body_template, context)
            if for_notification:
                return _DEFAULT_SUBJECT, "<p>" + _DEFAULT_NOTIFICATION_TEXT + "</p>"
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

        # Create Notification if channel includes notification
        if channel in ("notification", "both"):
            notif_subject, notif_body = CommunicationService.render_template(template_key, context, for_notification=True)
            notif_text = _html_to_notification_text(_strip_email_chrome_for_notification(notif_body))
            try:
                create_notification(
                    user_id=application.user_id,
                    title=notif_subject,
                    message=notif_text,
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
            subject, body = CommunicationService.render_template(template_key, context)
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


def _html_to_notification_text(value: str) -> str:
    """Return readable plain text for in-app notification previews."""
    if not value:
        return ""

    parser = _NotificationTextParser()
    parser.feed(value)
    parser.close()
    text = parser.text()
    return text or re.sub(r"<[^>]+>", "", value).strip()


def _build_context(application, extra_context: dict | None = None) -> dict:
    """Build a standard context dict from an application object."""
    # Use first_name only for notification personalization (PII rule: no full_name in notifications)
    first_name = getattr(application, "first_name", "")
    if not first_name:
        full = getattr(application, "full_name", "")
        first_name = full.split()[0] if full else ""

    ctx = {
        "student_name": first_name,
        "application_number": getattr(application, "application_number", ""),
        "program_name": str(getattr(application, "program", "")),
        "intake_name": str(getattr(application, "intake", "")),
        "status": getattr(application, "status", ""),
        "tracking_code": getattr(application, "public_tracking_code", "") or getattr(application, "tracking_code", ""),
        "portal_url": "https://apply.mihas.edu.zm",
    }
    if extra_context:
        ctx.update(extra_context)
    return ctx
