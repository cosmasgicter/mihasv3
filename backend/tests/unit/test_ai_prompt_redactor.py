"""Tests for ai_prompt_redactor.

Covers:
- Flag-off: passthrough (dict returned unchanged, no mutation).
- Flag-on admin: NRC, passport, DOB, full_name never present in output.
- Flag-on admin: age_bracket derived correctly.
- Flag-on admin: identity_status reports presence without leaking ID.
- Flag-on student: full_name replaced by first_name only.
- Non-dict input is handled gracefully.
- Property test: redacted output never contains 6+ digit runs (catches NRC leaks).
"""

from __future__ import annotations

import datetime as _dt
import re

import pytest
from django.test import override_settings

from apps.common.ai_prompt_redactor import (
    redact_for_admin_summary,
    redact_for_student_preview,
)


_SAMPLE_APP = {
    "full_name": "Jane Mulenga Banda",
    "nrc_number": "123456/78/1",
    "passport_number": "ZP9876543",
    "date_of_birth": "2005-03-15",
    "program": "Nursing",
    "institution": "MIHAS",
    "intake": "January 2026",
    "nationality": "Zambian",
    "sex": "female",
    "payment_status": "verified",
    "documents_summary": "nrc, result_slip",
    "grades_summary": "English: 2, Math: 3",
    "phone": "+260971234567",
    "email": "jane@example.com",
}


# ---------------------------------------------------------------------------
# Flag-off passthrough
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_REDACTION=False)
def test_admin_flag_off_returns_copy_unchanged():
    out = redact_for_admin_summary(_SAMPLE_APP)
    assert out == _SAMPLE_APP
    # Copy, not same dict.
    assert out is not _SAMPLE_APP


@override_settings(AI_HARDENING_REDACTION=False)
def test_student_flag_off_returns_copy_unchanged():
    out = redact_for_student_preview(_SAMPLE_APP)
    assert out == _SAMPLE_APP
    assert out is not _SAMPLE_APP


# ---------------------------------------------------------------------------
# Flag-on admin: aggressive redaction
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_REDACTION=True)
def test_admin_drops_name_nrc_passport_dob_contact():
    out = redact_for_admin_summary(_SAMPLE_APP)
    for key in ("full_name", "nrc_number", "passport_number", "date_of_birth", "phone", "email"):
        assert key not in out


@override_settings(AI_HARDENING_REDACTION=True)
def test_admin_keeps_non_pii_signals():
    out = redact_for_admin_summary(_SAMPLE_APP)
    assert out["program"] == "Nursing"
    assert out["institution"] == "MIHAS"
    assert out["intake"] == "January 2026"
    assert out["nationality"] == "Zambian"
    assert out["sex"] == "female"
    assert out["payment_status"] == "verified"
    assert out["grades_summary"] == "English: 2, Math: 3"
    assert out["documents_summary"] == "nrc, result_slip"


@override_settings(AI_HARDENING_REDACTION=True)
def test_admin_identity_status_reflects_presence():
    out = redact_for_admin_summary(_SAMPLE_APP)
    assert out["identity_status"] == "on_file"

    data = dict(_SAMPLE_APP)
    data.pop("nrc_number")
    data.pop("passport_number")
    out2 = redact_for_admin_summary(data)
    assert out2["identity_status"] == "not_provided"


@override_settings(AI_HARDENING_REDACTION=True)
def test_admin_age_bracket_for_minor():
    data = dict(_SAMPLE_APP)
    # Someone born this year (future-proof via today-style construction):
    today = _dt.date.today()
    data["date_of_birth"] = today.isoformat()
    out = redact_for_admin_summary(data)
    assert out["age_bracket"] == "under_18"


@override_settings(AI_HARDENING_REDACTION=True)
def test_admin_age_bracket_adult():
    data = dict(_SAMPLE_APP)
    today = _dt.date.today()
    data["date_of_birth"] = f"{today.year - 23:04d}-06-15"
    out = redact_for_admin_summary(data)
    assert out["age_bracket"] == "22-25"


@override_settings(AI_HARDENING_REDACTION=True)
def test_admin_age_bracket_unknown_for_missing_or_bad_dob():
    data = dict(_SAMPLE_APP)
    data["date_of_birth"] = "not-a-date"
    out = redact_for_admin_summary(data)
    assert out["age_bracket"] == "unknown"

    data2 = dict(_SAMPLE_APP)
    data2["date_of_birth"] = ""
    out2 = redact_for_admin_summary(data2)
    assert out2["age_bracket"] == "unknown"


@override_settings(AI_HARDENING_REDACTION=True)
def test_admin_input_is_not_mutated():
    snapshot = dict(_SAMPLE_APP)
    _ = redact_for_admin_summary(_SAMPLE_APP)
    assert _SAMPLE_APP == snapshot


@override_settings(AI_HARDENING_REDACTION=True)
def test_admin_handles_non_dict_input():
    assert redact_for_admin_summary(None) == {}
    assert redact_for_admin_summary("string") == {}
    assert redact_for_admin_summary(42) == {}


# ---------------------------------------------------------------------------
# Flag-on student preview
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_REDACTION=True)
def test_student_keeps_first_name_only():
    out = redact_for_student_preview(_SAMPLE_APP)
    assert out["first_name"] == "Jane"
    assert "full_name" not in out


@override_settings(AI_HARDENING_REDACTION=True)
def test_student_drops_nrc_dob_contact():
    out = redact_for_student_preview(_SAMPLE_APP)
    for key in ("nrc_number", "passport_number", "date_of_birth", "phone", "email"):
        assert key not in out


@override_settings(AI_HARDENING_REDACTION=True)
def test_student_fallback_name_when_full_name_empty():
    data = dict(_SAMPLE_APP)
    data["full_name"] = ""
    out = redact_for_student_preview(data)
    assert out["first_name"] == "Student"

    data2 = dict(_SAMPLE_APP)
    data2.pop("full_name")
    out2 = redact_for_student_preview(data2)
    assert out2["first_name"] == "Student"


# ---------------------------------------------------------------------------
# PII-leakage property: no long digit runs in redacted output
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_REDACTION=True)
def test_admin_output_has_no_6plus_digit_runs():
    """NRC-shaped leaks (6+ consecutive digits) must not appear in any
    string value of the redacted admin payload."""
    out = redact_for_admin_summary(_SAMPLE_APP)
    pattern = re.compile(r"\d{6,}")
    for key, value in out.items():
        if isinstance(value, str):
            assert not pattern.search(value), f"digit run in {key}={value!r}"


@override_settings(AI_HARDENING_REDACTION=True)
def test_student_output_has_no_6plus_digit_runs():
    out = redact_for_student_preview(_SAMPLE_APP)
    pattern = re.compile(r"\d{6,}")
    for key, value in out.items():
        if isinstance(value, str):
            assert not pattern.search(value), f"digit run in {key}={value!r}"
