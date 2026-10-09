"""Official document issued — the one email for every official document type.

admissions-v2 task 10.4 (R13.5, STU-18). Before this task the platform had a
single hand-rolled official-document email: ``EmailSlipView`` built an inline
HTML table of application fields with ``get_base_email_html``, for the
application slip only. Every other official document type — acceptance letter,
conditional offer, payment receipt, finance receipt — had **no** email path at
all, and ``officialDocuments.ts`` said so out loud::

    throw new Error(`Emailing "${documentType}" official documents is not
      supported yet; only the application slip has a backend email endpoint.`)

This module is that path, once, for all of them. It is a normal member of the
:mod:`apps.common.email` component system (`render_message("official_document",
…)`), so the shell, tokens, and plain-text fallback are the platform's rather
than this feature's.

**It carries a link, never the file.** An official document is a private,
tenant-branded record behind a signed, expiring URL; attaching the bytes to an
email would put an unrevocable copy of an applicant's record in a mail spool, and
embedding a long-lived signed URL would hand out a bearer token for it. The email
points at the student's own authenticated document surface, where the platform
re-authorizes the read and signs a fresh URL.

Expected context keys:
    student_name, document_label, application_number, program_name,
    institution_name, issued_at, portal_url, historical
"""

from html import escape

from apps.common.email.components import (
    cta_button,
    metadata_card,
    notice_box,
    paragraph,
    section_heading,
    signature_block,
)
from apps.common.email_links import ROUTE_STUDENT_DASHBOARD, platform_base_url


def render(context: dict) -> tuple[str, str]:
    """Render the official-document-issued email."""
    student = escape(context.get("student_name") or "Applicant")
    label = context.get("document_label") or "Official document"
    app_no = context.get("application_number") or "—"
    program = context.get("program_name") or "your selected programme"
    institution = context.get("institution_name") or "the admissions office"
    issued_at = context.get("issued_at") or "—"
    portal = context.get("portal_url") or platform_base_url()
    historical = bool(context.get("historical"))

    subject = f"{label} — {app_no}"

    rows = [
        ("Document", label),
        ("Application Number", app_no),
        ("Programme", program),
        ("Issued", issued_at),
    ]

    blocks = [
        paragraph(f"Dear {student},"),
        paragraph(
            f"Your {label.lower()} has been issued by {institution} and is "
            "available in your applicant portal."
        ),
        section_heading("Document details"),
        metadata_card(rows),
    ]

    if historical:
        # The read-existing policy (design §11.3): the artifact is the record of
        # what was issued at the time, and the student should not be left to
        # wonder why it does not reflect a later change to their application.
        blocks.append(
            notice_box(
                "This is the document as it was issued. It remains a valid record "
                "of that decision even though your application has since moved on.",
                variant="info",
            )
        )

    blocks.extend(
        [
            paragraph(
                "For your security the document is not attached to this email. "
                "Sign in to download it — the link below opens your own "
                "application, where the download is generated fresh each time."
            ),
            cta_button("Open your application", portal + ROUTE_STUDENT_DASHBOARD),
            signature_block(),
        ]
    )

    return subject, "\n".join(blocks)
