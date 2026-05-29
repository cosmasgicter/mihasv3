"""Rejection - a respectful decline of the application."""

from html import escape

from apps.common.email.components import (
    cta_button,
    metadata_card,
    paragraph,
    section_heading,
    signature_block,
)


def render(context: dict) -> tuple[str, str]:
    """Render the rejection email.

    Kept warm and brief - rejection letters are hard to read. Don't pad with
    filler. Acknowledge the effort, state the decision plainly, offer a
    next step.

    Expects context keys:
        student_name, application_number, program_name, intake_name,
        reviewer_note (optional), portal_url
    """
    student = escape(context.get("student_name") or "Applicant")
    app_no = context.get("application_number") or "—"
    program = context.get("program_name") or "the programme you applied for"
    intake = context.get("intake_name") or "the current intake"
    note = context.get("reviewer_note")
    portal = context.get("portal_url") or "https://apply.mihas.edu.zm"

    subject = f"Application update — {app_no}"

    paragraphs = [
        paragraph(f"Dear {student},"),
        paragraph(
            "Thank you for your application to Mukuba Institute of Health "
            f"and Applied Sciences for <strong>{escape(program)}</strong> "
            f"({escape(intake)}). We are grateful for the care you put into it."
        ),
        paragraph(
            "After careful review by our admissions panel, we regret that we "
            "are unable to offer you a place on this programme for this intake."
        ),
    ]

    if note:
        paragraphs.append(
            paragraph(
                f"<strong>A note from the panel:</strong> {escape(note)}",
                muted=True,
            )
        )

    paragraphs.extend(
        [
            section_heading("What you can do next"),
            paragraph(
                "We encourage you to consider applying again for a future intake "
                "or to explore the other programmes in the MIHAS-KATC portfolio. "
                "Our admissions team is happy to discuss the best fit for your "
                "qualifications and career goals."
            ),
            metadata_card([("Application Number", app_no)]),
            cta_button("Explore other programmes", portal + "/#programs"),
            signature_block(),
        ]
    )

    return subject, "\n".join(paragraphs)
