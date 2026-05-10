"""Conditional acceptance — offer subject to conditions being met."""

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
    """Render the conditional acceptance email.

    Expects context keys:
        student_name, application_number, program_name, intake_name,
        start_date, conditions (list of {description, deadline?}), portal_url
    """
    student = escape(context.get("student_name") or "Applicant")
    app_no = context.get("application_number") or "—"
    program = context.get("program_name") or "your selected programme"
    intake = context.get("intake_name") or "the upcoming intake"
    start = context.get("start_date") or "the programme start date"
    portal = context.get("portal_url") or "***REMOVED***"
    conditions = context.get("conditions") or []

    # Build a formatted list of conditions with optional deadlines.
    condition_items: list[str] = []
    for cond in conditions:
        desc = escape(cond.get("description", ""))
        deadline = cond.get("deadline")
        if deadline:
            desc += f" <em style='color:#5C6B7A;'>(deadline: {escape(deadline)})</em>"
        condition_items.append(desc)

    if not condition_items:
        condition_items = ["Conditions to be confirmed. Please check the portal."]

    subject = f"Conditional offer of admission — {program}"

    body = "\n".join(
        [
            paragraph(f"Dear {student},"),
            paragraph(
                f"We are pleased to offer you admission to "
                f"<strong>{escape(program)}</strong> at Mukuba Institute of "
                f"Health and Allied Sciences for the <strong>{escape(intake)}</strong> "
                "intake, subject to the conditions listed below."
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
            section_heading("Conditions of your offer"),
            paragraph(
                "This offer becomes unconditional once all of the following are satisfied:"
            ),
            ordered_list(condition_items),
            notice_box(
                "If any condition is not met by the stated deadline, we may "
                "withdraw this offer. Please reach out if you need support.",
                variant="warning",
            ),
            section_heading("Next steps"),
            ordered_list(
                [
                    "Upload evidence for each condition through the portal.",
                    "Confirm your intention to accept within 14 days.",
                    "Complete registration once all conditions are verified.",
                ]
            ),
            cta_button("Upload evidence", portal + "/student/application"),
            signature_block(),
        ]
    )

    return subject, body
