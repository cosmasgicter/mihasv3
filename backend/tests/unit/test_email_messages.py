"""Unit tests — per-message email templates and dispatcher.

One test per registered message type (application_submitted, payment_received,
interview_scheduled, acceptance, conditional_acceptance, rejection,
password_reset) plus dispatcher-level tests (registry, unknown-type error,
plain-text fallback).
"""

import pytest

from apps.common.email.render import (
    UnknownMessageTypeError,
    available_message_types,
    render_message,
)


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------


def test_available_message_types_exposes_seven_messages():
    types = available_message_types()
    assert "application_submitted" in types
    assert "payment_received" in types
    assert "interview_scheduled" in types
    assert "acceptance" in types
    assert "conditional_acceptance" in types
    assert "rejection" in types
    assert "password_reset" in types
    assert len(types) == 7


def test_render_message_returns_subject_html_text():
    subject, html, text = render_message(
        "application_submitted",
        {
            "student_name": "Bwalya Chanda",
            "application_number": "APP-20260510-ABCD1234",
            "tracking_code": "TRK-ABC123",
            "program_name": "Diploma in Registered Nursing",
            "intake_name": "January 2027",
        },
    )
    assert isinstance(subject, str)
    assert isinstance(html, str)
    assert isinstance(text, str)
    assert "<!DOCTYPE" in html  # shell was applied
    assert subject == "Application received — APP-20260510-ABCD1234"
    assert "Bwalya Chanda" in html
    assert "Bwalya Chanda" in text


def test_render_message_raises_for_unknown_type():
    with pytest.raises(UnknownMessageTypeError):
        render_message("not_a_real_message_type", {})


def test_render_message_accepts_empty_context():
    subject, html, text = render_message("password_reset", {})
    assert subject
    assert "<!DOCTYPE" in html
    assert text


# ---------------------------------------------------------------------------
# application_submitted
# ---------------------------------------------------------------------------


def test_application_submitted_contains_key_fields():
    _, html, text = render_message(
        "application_submitted",
        {
            "student_name": "Chileshe Mumba",
            "application_number": "APP-20260510-XYZ",
            "tracking_code": "TRK-XYZ",
            "program_name": "Diploma in Clinical Medicine",
            "intake_name": "January 2027",
        },
    )
    assert "Chileshe Mumba" in html
    assert "APP-20260510-XYZ" in html
    assert "Diploma in Clinical Medicine" in html
    assert "January 2027" in html
    # Numbered list of next steps renders
    assert "We verify your uploaded documents" in html
    # Plain-text fallback preserves the same key content
    assert "Chileshe Mumba" in text
    assert "Diploma in Clinical Medicine" in text


def test_application_submitted_escapes_student_name():
    _, html, _ = render_message(
        "application_submitted",
        {"student_name": "<script>alert('x')</script>", "application_number": "APP-1"},
    )
    assert "<script>alert" not in html
    assert "&lt;script&gt;" in html


# ---------------------------------------------------------------------------
# payment_received
# ---------------------------------------------------------------------------


def test_payment_received_zmw():
    subject, html, _ = render_message(
        "payment_received",
        {
            "student_name": "Mwansa Banda",
            "application_number": "APP-1",
            "receipt_number": "RCP-00001",
            "amount": "150.00",
            "currency": "ZMW",
            "payment_method": "Airtel Money",
        },
    )
    assert subject == "Payment confirmed — RCP-00001"
    assert "K150.00 ZMW" in html
    assert "Airtel Money" in html
    assert "Mwansa Banda" in html


def test_payment_received_usd_international():
    _, html, _ = render_message(
        "payment_received",
        {
            "student_name": "Ana Martinez",
            "application_number": "APP-2",
            "receipt_number": "RCP-00002",
            "amount": "20.00",
            "currency": "USD",
            "payment_method": "Card",
        },
    )
    assert "$20.00 USD" in html


def test_payment_received_large_amount_uses_grouping_separator():
    _, html, _ = render_message(
        "payment_received",
        {
            "student_name": "Test",
            "application_number": "APP-3",
            "receipt_number": "RCP-00003",
            "amount": "12500",
            "currency": "ZMW",
            "payment_method": "Bank Transfer",
        },
    )
    # Decimal rounding + grouping separator: K12,500.00 ZMW
    assert "K12,500.00 ZMW" in html


def test_payment_received_non_decimal_amount_is_rounded_deterministically():
    _, html, _ = render_message(
        "payment_received",
        {
            "student_name": "Test",
            "application_number": "APP-4",
            "receipt_number": "RCP-00004",
            "amount": "150.005",
            "currency": "ZMW",
            "payment_method": "Airtel Money",
        },
    )
    # ROUND_HALF_UP — 150.005 rounds to 150.01 (not banker's 150.00)
    assert "K150.01 ZMW" in html


def test_payment_received_bad_amount_falls_back_without_throwing():
    # Bad input shouldn't crash the email; should render a safe placeholder.
    _, html, _ = render_message(
        "payment_received",
        {
            "student_name": "Test",
            "application_number": "APP-5",
            "receipt_number": "RCP-00005",
            "amount": "not-a-number",
            "currency": "ZMW",
            "payment_method": "Card",
        },
    )
    # The placeholder `K0.00 ZMW` is used for unparseable input; it is
    # ugly on purpose so it's visible in QA and triggers a fix upstream.
    assert "K0.00 ZMW" in html


# ---------------------------------------------------------------------------
# interview_scheduled
# ---------------------------------------------------------------------------


def test_interview_scheduled_renders_all_details():
    _, html, _ = render_message(
        "interview_scheduled",
        {
            "student_name": "Kunda Phiri",
            "application_number": "APP-3",
            "program_name": "Diploma in Environmental Health",
            "interview_date": "15 November 2026",
            "interview_time": "10:30",
            "interview_location": "KATC Campus, Room B12",
            "interview_mode": "In person",
            "interviewer_name": "Dr Sokoni",
        },
    )
    assert "15 November 2026" in html
    assert "10:30" in html
    assert "KATC Campus, Room B12" in html
    assert "Dr Sokoni" in html
    assert "arrive" in html.lower()


# ---------------------------------------------------------------------------
# acceptance
# ---------------------------------------------------------------------------


def test_acceptance_unconditional_offer():
    subject, html, _ = render_message(
        "acceptance",
        {
            "student_name": "Thandi Nkandu",
            "application_number": "APP-4",
            "program_name": "Diploma in Registered Nursing",
            "intake_name": "January 2027",
            "start_date": "12 January 2027",
        },
    )
    assert "Offer of admission" in subject
    assert "Thandi Nkandu" in html
    assert "Diploma in Registered Nursing" in html
    assert "12 January 2027" in html
    assert "Confirm your place" in html
    # Default signatory is Dr Solomon Musonda, MD (Managing Director)
    assert "Dr Solomon Musonda, MD" in html
    assert "Managing Director" in html
    # Nursing program derives the School of Nursing division line
    assert "School of Nursing" in html


# ---------------------------------------------------------------------------
# conditional_acceptance
# ---------------------------------------------------------------------------


def test_conditional_acceptance_with_conditions():
    _, html, _ = render_message(
        "conditional_acceptance",
        {
            "student_name": "Mwamba Tembo",
            "application_number": "APP-5",
            "program_name": "Diploma in Clinical Medicine",
            "intake_name": "July 2027",
            "start_date": "10 July 2027",
            "conditions": [
                {"description": "Submit original ECZ certificate.", "deadline": "2027-05-01"},
                {"description": "Complete medical fitness assessment."},
            ],
        },
    )
    assert "Submit original ECZ certificate." in html
    assert "Complete medical fitness assessment." in html
    assert "deadline: 2027-05-01" in html
    # 10+ conditions edge case should also render without throwing
    many = [{"description": f"Condition {i}."} for i in range(10)]
    _, html2, _ = render_message(
        "conditional_acceptance",
        {
            "student_name": "Stress Test",
            "application_number": "APP-6",
            "program_name": "X",
            "intake_name": "Y",
            "start_date": "Z",
            "conditions": many,
        },
    )
    for i in range(10):
        assert f"Condition {i}." in html2


def test_conditional_acceptance_without_conditions_falls_back():
    _, html, _ = render_message(
        "conditional_acceptance",
        {
            "student_name": "Tester",
            "application_number": "APP-7",
            "program_name": "X",
            "intake_name": "Y",
            "start_date": "Z",
            "conditions": [],
        },
    )
    assert "Conditions to be confirmed" in html


# ---------------------------------------------------------------------------
# rejection
# ---------------------------------------------------------------------------


def test_rejection_is_warm_and_brief():
    subject, html, text = render_message(
        "rejection",
        {
            "student_name": "Chanda Moyo",
            "application_number": "APP-8",
            "program_name": "Diploma in Environmental Health",
            "intake_name": "January 2027",
        },
    )
    assert "Application update" in subject
    assert "Chanda Moyo" in html
    assert "regret that we" in html
    assert "applying again" in html.lower()
    # Keep the plain-text version readable
    assert "Chanda Moyo" in text


def test_rejection_with_reviewer_note():
    _, html, _ = render_message(
        "rejection",
        {
            "student_name": "Chanda",
            "application_number": "APP-9",
            "program_name": "X",
            "reviewer_note": "We encourage you to strengthen your mathematics grade.",
        },
    )
    assert "strengthen your mathematics grade" in html


# ---------------------------------------------------------------------------
# password_reset
# ---------------------------------------------------------------------------


def test_password_reset_contains_link_and_expiry():
    subject, html, _ = render_message(
        "password_reset",
        {
            "student_name": "Bwalya",
            "reset_url": "https://apply.beanola.com/auth/reset?token=abc123",
            "expires_in_minutes": 45,
        },
    )
    assert "Reset your MIHAS admissions password" in subject
    assert "https://apply.beanola.com/auth/reset?token=abc123" in html
    assert "45 minutes" in html


def test_password_reset_has_security_reassurance():
    _, html, _ = render_message(
        "password_reset",
        {"reset_url": "https://example.com/reset"},
    )
    assert "safely ignore" in html
    # Defaults: 30 minutes, generic greeting
    assert "30 minutes" in html
    assert "Hi there" in html or "there" in html


# ---------------------------------------------------------------------------
# Cross-cutting: every message renders valid HTML and non-empty plain text
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("message_type", available_message_types())
def test_every_message_type_produces_non_empty_output(message_type):
    # Minimal-but-plausible context per message type; intentionally permissive.
    fixture = {
        "student_name": "Test Student",
        "application_number": "APP-TEST-0001",
        "tracking_code": "TRK-TEST",
        "program_name": "Test Programme",
        "intake_name": "Test Intake",
        "start_date": "Test Date",
        "receipt_number": "RCP-TEST",
        "amount": "100",
        "currency": "ZMW",
        "payment_method": "Airtel",
        "interview_date": "Date",
        "interview_time": "Time",
        "interview_location": "Room",
        "interview_mode": "In person",
        "interviewer_name": "Interviewer",
        "reset_url": "https://example.com/reset",
        "expires_in_minutes": 30,
        "conditions": [{"description": "Single condition."}],
    }
    subject, html, text = render_message(message_type, fixture)
    assert subject.strip()
    assert "<!DOCTYPE" in html
    assert "Test Student" in html or message_type == "password_reset"
    assert text.strip()
