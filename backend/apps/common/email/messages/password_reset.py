"""Password reset - security email with a time-bounded reset link."""

from html import escape

from apps.common.email.components import (
    cta_button,
    notice_box,
    paragraph,
    section_heading,
    signature_block,
)


def render(context: dict) -> tuple[str, str]:
    """Render the password reset email.

    Expects context keys:
        student_name (optional), reset_url, expires_in_minutes
    """
    student = escape(context.get("student_name") or "there")
    url = context.get("reset_url") or "#"
    minutes = context.get("expires_in_minutes") or 30

    subject = "Reset your Beanola admissions password"

    body = "\n".join(
        [
            paragraph(f"Hi {student},"),
            paragraph(
                "We received a request to reset the password for your "
                "Beanola admissions account. Use the button below to set a "
                "new password."
            ),
            cta_button("Reset password", url),
            notice_box(
                f"This link expires in <strong>{minutes} minutes</strong> and "
                "can only be used once.",
                variant="warning",
            ),
            section_heading("Didn't request this?"),
            paragraph(
                "If you didn't ask for a password reset, you can safely ignore "
                "this email — your current password is unchanged. For extra "
                "safety, consider signing in and reviewing recent sessions.",
                muted=True,
            ),
            signature_block(role="Admissions Support", name="Beanola Admissions"),
        ]
    )

    return subject, body
