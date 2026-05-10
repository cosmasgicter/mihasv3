"""Application submitted — sent immediately after a student submits."""

from html import escape

from apps.common.email.components import (
    cta_button,
    metadata_card,
    ordered_list,
    paragraph,
    section_heading,
    signature_block,
)


def render(context: dict) -> tuple[str, str]:
    """Render the application-submitted email.

    Expects context keys:
        student_name, application_number, tracking_code, program_name,
        intake_name, portal_url
    """
    student = escape(context.get("student_name") or "Applicant")
    app_no = context.get("application_number") or "—"
    tracking = context.get("tracking_code") or "—"
    program = context.get("program_name") or "your selected programme"
    intake = context.get("intake_name") or "the current intake"
    portal = context.get("portal_url") or "https://apply.mihas.edu.zm"

    subject = f"Application received — {app_no}"

    body = "\n".join(
        [
            paragraph(f"Dear {student},"),
            paragraph(
                "Thank you for submitting your application to "
                "Mukuba Institute of Health and Allied Sciences. "
                "Your details are now recorded in our admissions system and "
                "will be reviewed in the coming working days."
            ),
            section_heading("Your application at a glance"),
            metadata_card(
                [
                    ("Application Number", app_no),
                    ("Tracking Code", tracking),
                    ("Programme", program),
                    ("Intake", intake),
                ]
            ),
            section_heading("What happens next"),
            ordered_list(
                [
                    "We verify your uploaded documents (usually 2 to 5 working days).",
                    "If we need more from you, we email you with a clear next step.",
                    "You will see every status change directly in the portal.",
                    "If admitted, you will receive a formal offer letter by email.",
                ]
            ),
            paragraph(
                "You can sign in any time to check progress, update your details, "
                "or download your application slip."
            ),
            cta_button("Open your application", portal + "/student"),
            signature_block(),
        ]
    )

    return subject, body
