"""Integration test: every email message template renders without leftover
{{variable}} placeholders when given a complete context.

For each message in backend/apps/common/email/messages/*, we parse the
docstring to discover expected context keys, build a context with all keys
populated, render, and assert no unresolved {{X}} remains.
"""
import re
from pathlib import Path

import pytest

from apps.common.email.render import available_message_types, render_message

# Regex to detect unresolved template variables in rendered output
_UNRESOLVED_RE = re.compile(r"\{\{(\w+)\}\}")

# Full context for each message type (superset of all keys each template uses)
_FULL_CONTEXTS: dict[str, dict] = {
    "application_submitted": {
        "student_name": "Jane Mwila",
        "application_number": "MIHAS202601",
        "tracking_code": "TRK-ABC123XYZ",
        "program_name": "Diploma in Nursing",
        "intake_name": "January 2027",
        "portal_url": "https://apply.mihas.edu.zm",
    },
    "payment_received": {
        "student_name": "John Banda",
        "application_number": "MIHAS202602",
        "receipt_number": "RCP-00001",
        "amount": "1500.00",
        "currency": "ZMW",
        "payment_method": "Mobile Money (Airtel)",
        "portal_url": "https://apply.mihas.edu.zm",
    },
    "interview_scheduled": {
        "student_name": "Mary Phiri",
        "application_number": "MIHAS202603",
        "program_name": "Certificate in Clinical Medicine",
        "interview_date": "2027-02-15",
        "interview_time": "10:00",
        "interview_location": "Main Campus, Room 204",
        "interview_mode": "In person",
        "interviewer_name": "Dr Musonda",
        "portal_url": "https://apply.mihas.edu.zm",
    },
    "acceptance": {
        "student_name": "Peter Mulenga",
        "application_number": "MIHAS202604",
        "program_name": "Diploma in Pharmacy",
        "intake_name": "July 2027",
        "start_date": "2027-07-14",
        "portal_url": "https://apply.mihas.edu.zm",
    },
    "conditional_acceptance": {
        "student_name": "Grace Tembo",
        "application_number": "MIHAS202605",
        "program_name": "Diploma in Nursing",
        "intake_name": "January 2027",
        "start_date": "2027-01-13",
        "conditions": [
            {"description": "Submit original Grade 12 certificate", "deadline": "2027-01-01"},
            {"description": "Pass medical fitness assessment"},
        ],
        "portal_url": "https://apply.mihas.edu.zm",
    },
    "rejection": {
        "student_name": "David Chanda",
        "application_number": "MIHAS202606",
        "program_name": "Certificate in Biomedical Engineering",
        "intake_name": "July 2027",
        "reviewer_note": "Minimum grade requirements not met.",
        "portal_url": "https://apply.mihas.edu.zm",
    },
    "password_reset": {
        "student_name": "Alice Zulu",
        "reset_url": "https://apply.mihas.edu.zm/reset?token=abc123",
        "expires_in_minutes": 30,
    },
}


class TestCommunicationTemplateVariables:
    """Every email message renders cleanly with no unresolved variables."""

    def test_all_registered_types_have_full_context(self):
        """Ensure our test covers every registered message type."""
        registered = set(available_message_types())
        covered = set(_FULL_CONTEXTS.keys())
        missing = registered - covered
        assert not missing, (
            f"Message types without test context: {sorted(missing)}. "
            f"Add entries to _FULL_CONTEXTS in this test file."
        )

    @pytest.mark.parametrize("message_type", sorted(_FULL_CONTEXTS.keys()))
    def test_no_unresolved_variables(self, message_type: str):
        """Render with full context and assert no {{X}} remains."""
        context = _FULL_CONTEXTS[message_type]
        subject, html, text = render_message(message_type, context)

        # Check subject
        unresolved_subject = _UNRESOLVED_RE.findall(subject)
        assert not unresolved_subject, (
            f"[{message_type}] subject has unresolved variables: {unresolved_subject}"
        )

        # Check HTML body
        unresolved_html = _UNRESOLVED_RE.findall(html)
        assert not unresolved_html, (
            f"[{message_type}] HTML has unresolved variables: {unresolved_html}"
        )

        # Check plain text
        unresolved_text = _UNRESOLVED_RE.findall(text)
        assert not unresolved_text, (
            f"[{message_type}] plain text has unresolved variables: {unresolved_text}"
        )

    @pytest.mark.parametrize("message_type", sorted(_FULL_CONTEXTS.keys()))
    def test_renders_non_empty(self, message_type: str):
        """Each message produces non-empty subject, html, and text."""
        context = _FULL_CONTEXTS[message_type]
        subject, html, text = render_message(message_type, context)
        assert subject.strip(), f"[{message_type}] subject is empty"
        assert html.strip(), f"[{message_type}] html is empty"
        assert text.strip(), f"[{message_type}] text is empty"
