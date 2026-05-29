"""Top-level email render dispatcher.

Given a ``message_type`` and a context dict, returns ``(subject, html, text)``
- ready to hand off to the email queue.

Every outbound transactional email should flow through this function so we
preserve a single render path and consistent shell wrapping.
"""

from typing import Callable

from apps.common.email import components, shell
from apps.common.email.messages import (
    acceptance,
    application_submitted,
    conditional_acceptance,
    interview_scheduled,
    password_reset,
    payment_received,
    rejection,
)


# Map message_type → render function. Keep alphabetical for quick scanning.
_REGISTRY: dict[str, Callable[[dict], tuple[str, str]]] = {
    "acceptance": acceptance.render,
    "application_submitted": application_submitted.render,
    "conditional_acceptance": conditional_acceptance.render,
    "interview_scheduled": interview_scheduled.render,
    "password_reset": password_reset.render,
    "payment_received": payment_received.render,
    "rejection": rejection.render,
}


class UnknownMessageTypeError(KeyError):
    """Raised when render_message is called with an unregistered message_type."""


def available_message_types() -> list[str]:
    """Return the sorted list of registered message types."""
    return sorted(_REGISTRY.keys())


def render_message(message_type: str, context: dict | None = None) -> tuple[str, str, str]:
    """Render a transactional email.

    Parameters
    ----------
    message_type : str
        One of the keys in ``_REGISTRY``. See ``available_message_types()``.
    context : dict
        Template variables. Each message module documents its expected keys.

    Returns
    -------
    (subject, html, text)
        Fully-rendered email components, ready to send. ``html`` is wrapped in
        the institutional shell; ``text`` is a plain-text fallback derived
        from the HTML.
    """
    context = context or {}

    renderer = _REGISTRY.get(message_type)
    if renderer is None:
        raise UnknownMessageTypeError(
            f"Unknown message_type '{message_type}'. "
            f"Registered types: {available_message_types()}"
        )

    subject, body_html = renderer(context)
    html = shell.render_shell(body_html, title=subject, preheader=subject)
    text = components.to_plain_text(body_html)
    return subject, html, text
