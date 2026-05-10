"""Interview scheduled — sent when an interview slot is assigned."""

from html import escape

from apps.common.email.components import (
    cta_button,
    metadata_card,
    notice_box,
    ordered_list,
    paragraph,
    section_heading,
    signature_block,
)


def render(context: dict) -> tuple[str, str]:
    """Render the interview-scheduled email.

    Expects context keys:
        student_name, application_number, program_name,
        interview_date, interview_time, interview_location, interview_mode,
        interviewer_name, portal_url
    """
    student = escape(context.get("student_name") or "Applicant")
    app_no = context.get("application_number") or "—"
    program = context.get("program_name") or "your selected programme"
    date = context.get("interview_date") or "—"
    time = context.get("interview_time") or "—"
    location = context.get("interview_location") or "—"
    mode = context.get("interview_mode") or "In person"
    interviewer = context.get("interviewer_name") or "A member of our admissions panel"
    portal = context.get("portal_url") or "https://apply.mihas.edu.zm"

    subject = f"Interview scheduled — {date} at {time}"

    body = "\n".join(
        [
            paragraph(f"Dear {student},"),
            paragraph(
                f"We are pleased to invite you to an admissions interview for "
                f"<strong>{escape(program)}</strong>. Please review the details "
                "below and confirm your attendance through the portal."
            ),
            section_heading("Interview details"),
            metadata_card(
                [
                    ("Date", date),
                    ("Time", time),
                    ("Mode", mode),
                    ("Location", location),
                    ("Interviewer", interviewer),
                    ("Application Number", app_no),
                ]
            ),
            notice_box(
                "Please arrive <strong>15 minutes early</strong>. "
                "If you are unable to attend, contact admissions at least 24 hours in advance.",
                variant="warning",
            ),
            section_heading("What to bring"),
            ordered_list(
                [
                    "A valid form of identification (NRC or passport).",
                    "Original copies of your academic certificates.",
                    "Your application slip or tracking code.",
                    "A pen and a short list of questions for the panel.",
                ]
            ),
            cta_button("View interview details", portal + "/student/interview"),
            signature_block(),
        ]
    )

    return subject, body
