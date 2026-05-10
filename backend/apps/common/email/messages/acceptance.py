"""Acceptance — unconditional offer of admission."""

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
    """Render the unconditional acceptance email.

    Expects context keys:
        student_name, application_number, program_name, intake_name,
        start_date, portal_url
    """
    student = escape(context.get("student_name") or "Applicant")
    app_no = context.get("application_number") or "—"
    program = context.get("program_name") or "your selected programme"
    intake = context.get("intake_name") or "the upcoming intake"
    start = context.get("start_date") or "the programme start date"
    portal = context.get("portal_url") or "***REMOVED***"

    subject = f"Offer of admission — {program}"

    body = "\n".join(
        [
            paragraph(f"Dear {student},"),
            paragraph(
                f"It is our great pleasure to offer you admission to "
                f"<strong>{escape(program)}</strong> at Mukuba Institute of "
                f"Health and Allied Sciences for the <strong>{escape(intake)}</strong> "
                "intake."
            ),
            paragraph(
                "This offer recognises the quality of your application and "
                "the strength of your preparation. We look forward to welcoming "
                "you to a learning community where you will train alongside "
                "experienced clinicians."
            ),
            section_heading("Your offer"),
            metadata_card(
                [
                    ("Programme", program),
                    ("Intake", intake),
                    ("Start Date", start),
                    ("Application Number", app_no),
                ]
            ),
            section_heading("Next steps"),
            ordered_list(
                [
                    "Confirm your acceptance through the admissions portal within 14 days.",
                    "Complete registration and pay the tuition deposit by the stated deadline.",
                    "Attend the orientation programme in the first week of the intake.",
                    "Download your formal offer letter from the portal for your records.",
                ]
            ),
            paragraph(
                "Congratulations once again. We look forward to seeing you on campus."
            ),
            cta_button("Confirm your place", portal + "/student/application"),
            signature_block(),
        ]
    )

    return subject, body
