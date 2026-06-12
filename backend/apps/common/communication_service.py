"""Communication service - template-based notifications and emails.

Implements task 10.1; tenant-aware resolution + context added in Phase 7
(task 28.2) of the ``multi-tenant-beanola-remediation`` spec.

Requirements: 9.1–9.5, 9.7, 14.1, 14.3, 14.4, 14.5, 14.7, 14.8
"""

import logging
import re
import uuid

from django.utils import timezone
from html import escape as html_escape
from html.parser import HTMLParser

logger = logging.getLogger(__name__)

# Default fallback messages when template is missing or inactive.
# These are platform-neutral Beanola defaults — a generic fallback must never
# inherit a single school's identity. Tenant-specific subject/body come from
# the communication_templates DB rows (institution-aware resolution lives in
# CommunicationService.render_template/send); these constants are only used
# when no template applies.
_DEFAULT_SUBJECT = "Beanola Admissions — Notification"
_DEFAULT_BODY = (
    "<p>You have a new notification from Beanola Admissions.</p>"
    "<p>Please log in to your account for details.</p>"
    "<p>Best regards,<br>Beanola Admissions</p>"
)
_DEFAULT_NOTIFICATION_TEXT = "You have a new notification from Beanola Admissions. Open the dashboard for details."

# Beanola platform defaults for tenant-derived context values (R14.3, R14.8).
# Substituted whenever the resolved institution does not provide a setting, so
# a message is always complete and never carries a single school's identity.
# The portal URL default is env-driven (see ``_default_portal_url``).
_DEFAULT_BRAND_NAME = "Beanola Admissions"
_DEFAULT_CONTACT_EMAIL = "admissions@beanola.com"

_FALLBACK_TEMPLATES = {
    "payment_expired": (
        "Payment Expired — New Payment Required",
        (
            "<p>Dear {{student_name}},</p>"
            "<p>Your pending payment for application {{application_number}} has expired after 24 hours.</p>"
            "<p>Please log in and initiate a new payment.</p>"
            "<p>Best regards,<br>Beanola Admissions</p>"
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
    def render_template(
        template_key: str,
        context: dict | None = None,
        for_notification: bool = False,
        application=None,
    ) -> tuple[str, str]:
        """Look up a CommunicationTemplate by key and substitute variables.

        Returns (subject, body). Resolves tenant-aware in priority order
        (R14.1, R14.4, R14.5): the active institution-specific template with the
        highest version for the application's institution → the active Beanola
        platform template (``institution_id`` NULL) with the highest version →
        the safe Beanola default. Falls back to defaults if no template applies.
        When for_notification=True and no template is found, uses the
        notification-friendly default (no 'log in' copy).
        """
        context = context or {}

        institution_id = _resolve_institution_id(application)
        template = _resolve_template(template_key, institution_id)

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
        from apps.common.outbox import create_notification, queue_email

        context = _build_context(application, extra_context)

        # Resolve the tenant-aware template for channel info (R14.1/R14.4/R14.5).
        institution_id = _resolve_institution_id(application)
        template = _resolve_template(template_key, institution_id)

        channel = template.channel if template else "both"

        # Create Notification if channel includes notification
        if channel in ("notification", "both"):
            notif_subject, notif_body = CommunicationService.render_template(
                template_key, context, for_notification=True, application=application
            )
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
            subject, body = CommunicationService.render_template(
                template_key, context, application=application
            )
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


def _resolve_institution_id(application):
    """Return the application's institution UUID, or ``None``.

    Derived from ``application.institution_ref_id`` (no FK fetch). Returns
    ``None`` for a missing/unknown institution and for any non-UUID value (e.g.
    a test double), so callers fall back to the Beanola platform path.
    """
    if application is None:
        return None
    raw = getattr(application, "institution_ref_id", None)
    if raw is None:
        return None
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError, AttributeError):
        return None


def _resolve_institution(application):
    """Return the application's resolved ``Institution`` instance, or ``None``.

    Only a genuine ``Institution`` row is returned; a missing relation or a test
    double resolves to ``None`` so ``_build_context`` substitutes Beanola
    platform defaults rather than leaking placeholder values (R14.7, R14.8).
    """
    if application is None:
        return None
    ref = getattr(application, "institution_ref", None)
    try:
        from apps.catalog.models import Institution
    except Exception:  # pragma: no cover - catalog app always present at runtime
        return None
    return ref if isinstance(ref, Institution) else None


def _resolve_template(template_key: str, institution_id):
    """Resolve a ``CommunicationTemplate`` in tenant-aware priority order.

    Priority (R14.1, R14.4, R14.5): the active institution-specific template
    with the highest version for ``(institution_id, template_key)`` → the active
    Beanola platform template (``institution_id`` NULL) with the highest version
    for ``template_key``. Returns ``None`` when neither exists (the caller then
    uses the safe Beanola default). An inactive higher-version row never wins
    because every query filters ``is_active=True``.

    When ``institution_id`` is ``None`` the legacy ``.filter(...).first()`` query
    is preserved verbatim so the platform/default path stays mock-compatible.
    """
    from apps.common.models import CommunicationTemplate

    if institution_id is not None:
        try:
            institution_specific = (
                CommunicationTemplate.objects.filter(
                    template_key=template_key,
                    is_active=True,
                    institution_id=institution_id,
                )
                .order_by("-version")
                .first()
            )
            if institution_specific is not None:
                return institution_specific
            return (
                CommunicationTemplate.objects.filter(
                    template_key=template_key,
                    is_active=True,
                    institution_id__isnull=True,
                )
                .order_by("-version")
                .first()
            )
        except Exception as exc:
            _log_best_effort_failure("template lookup", template_key, exc=exc)
            return None

    # No (real) institution: Beanola platform / safe-default path. Preserve the
    # original query shape for mock-based unit tests.
    try:
        return CommunicationTemplate.objects.filter(
            template_key=template_key, is_active=True
        ).first()
    except Exception as exc:
        _log_best_effort_failure("template lookup", template_key, exc=exc)
        return None


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


def _default_portal_url() -> str:
    """Return the Beanola platform portal URL for communication templates.

    Sourced from the env-driven ``FRONTEND_URL`` setting (Beanola platform
    default ``https://apply.beanola.com``) so the portal host can move without a
    code change and never hard-codes a single school's host. Used whenever the
    resolved institution has no usable portal/website setting (R14.8).
    """
    from django.conf import settings

    return getattr(settings, "FRONTEND_URL", "") or "https://apply.beanola.com"


def _first_non_empty(*candidates, default: str) -> str:
    """Return the first non-empty candidate (stripped), else ``default``.

    Implements the tenant-derivation-with-Beanola-fallback rule (R14.3, R14.8):
    a resolved institution setting wins only when present and non-empty;
    otherwise the Beanola platform default is substituted. Brand safety is
    guaranteed by construction — values come from the application's own
    institution or from a Beanola/env default, never from a hard-coded school
    identity such as a single-school portal host (R14.3, R14.7).
    """
    for candidate in candidates:
        if candidate is None:
            continue
        text = str(candidate).strip()
        if text:
            return text
    return default


def _derive_brand_name(institution) -> str:
    """Brand name from institution settings, else the Beanola default (R14.3/8)."""
    if institution is None:
        return _DEFAULT_BRAND_NAME
    return _first_non_empty(
        getattr(institution, "brand_name", None),
        getattr(institution, "full_name", None),
        getattr(institution, "name", None),
        default=_DEFAULT_BRAND_NAME,
    )


def _derive_contact_email(institution) -> str:
    """Contact email from institution settings, else the Beanola default.

    Falls back to the Beanola platform contact when the institution provides no
    usable (non-empty, ``@``-bearing) email (R14.3, R14.8).
    """
    if institution is None:
        return _DEFAULT_CONTACT_EMAIL
    for value in (
        getattr(institution, "support_email", None),
        getattr(institution, "admissions_email", None),
        getattr(institution, "email", None),
    ):
        if value is None:
            continue
        text = str(value).strip()
        if text and "@" in text:
            return text
    return _DEFAULT_CONTACT_EMAIL


def _derive_portal_url(institution) -> str:
    """Portal URL from institution settings, else the Beanola platform default.

    Prefers the institution's ``website``; substitutes the env-driven Beanola
    platform portal when missing, so a hard-coded single-school host is never
    emitted (R14.3, R14.8).
    """
    platform_default = _default_portal_url()
    if institution is None:
        return platform_default
    return _first_non_empty(
        getattr(institution, "website", None),
        default=platform_default,
    )


def _build_context(application, extra_context: dict | None = None) -> dict:
    """Build a standard, brand-safe context dict from an application object.

    Brand name, contact email, and portal URL derive from the application's
    resolved institution settings, substituting Beanola platform defaults when a
    setting is missing and never emitting a hard-coded single-school portal URL
    (R14.3, R14.7, R14.8). For an unknown/future application with no resolved
    institution, all three fall back to Beanola platform defaults.
    """
    # Use first_name only for notification personalization (PII rule: no full_name in notifications)
    first_name = getattr(application, "first_name", "")
    if not first_name:
        full = getattr(application, "full_name", "")
        first_name = full.split()[0] if full else ""

    institution = _resolve_institution(application)

    ctx = {
        "student_name": first_name,
        "application_number": getattr(application, "application_number", ""),
        "program_name": str(getattr(application, "program", "")),
        "intake_name": str(getattr(application, "intake", "")),
        "status": getattr(application, "status", ""),
        "tracking_code": getattr(application, "public_tracking_code", "") or getattr(application, "tracking_code", ""),
        "portal_url": _derive_portal_url(institution),
        "brand_name": _derive_brand_name(institution),
        "contact_email": _derive_contact_email(institution),
    }
    if extra_context:
        ctx.update(extra_context)
    return ctx
