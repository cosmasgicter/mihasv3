"""PII redaction for AI prompt boundaries.

Applies to the two callers that currently send PII-rich application
data to the Vercel AI Gateway:

* ``generate_admin_review_summary`` — consumed by the admin review
  panel. Redaction is aggressive: no name, no NRC/passport, no DOB.
  An age bracket is derived so the AI can still reason about life
  stage without receiving the exact birth date.
* ``generate_student_preview_summary`` — consumed by the student's
  wizard review step. Mild redaction: first name is retained (the
  tone of voice requires it) but NRC/passport/DOB are dropped.

Both functions are deterministic and side-effect-free. The module is
import-safe with no Django dependencies beyond the settings flag.

Gate: ``settings.AI_HARDENING_REDACTION``. When off, the functions
return the original dict unchanged so callers can invoke them
unconditionally and the flag controls the real behaviour.

Requirements: AI risk remediation plan, Phase 2.
"""

from __future__ import annotations

import datetime as _dt
import logging
from typing import Any, Optional

from django.conf import settings

logger = logging.getLogger(__name__)


#: Keys removed from the admin-summary payload regardless of content.
_ADMIN_DROP_KEYS: frozenset[str] = frozenset(
    {
        "full_name",
        "nrc_number",
        "passport_number",
        "date_of_birth",
        "date_of_birth_iso",
        "phone",
        "mobile",
        "email",
    }
)

#: Keys replaced (not dropped) in the student-preview payload. The AI
#: prompt uses the first name for tone; full name is overkill.
_STUDENT_DROP_KEYS: frozenset[str] = frozenset(
    {
        "full_name",
        "nrc_number",
        "passport_number",
        "date_of_birth",
        "date_of_birth_iso",
        "phone",
        "mobile",
        "email",
    }
)


def _derive_age_bracket(dob: Any) -> str:
    """Map an applicant DOB to a coarse age bracket.

    Accepts a ``datetime.date``, ``datetime.datetime``, or an ISO-style
    string ``YYYY-MM-DD``. Anything unparseable becomes ``"unknown"``.
    """
    if not dob:
        return "unknown"

    try:
        if isinstance(dob, _dt.datetime):
            birth_date = dob.date()
        elif isinstance(dob, _dt.date):
            birth_date = dob
        elif isinstance(dob, str):
            # Accept "YYYY-MM-DD" or longer ISO strings — take first 10 chars.
            birth_date = _dt.date.fromisoformat(dob.strip()[:10])
        else:
            return "unknown"
    except (ValueError, TypeError):
        return "unknown"

    today = _dt.date.today()
    # Rough age — exact year boundaries don't matter at bracket granularity.
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1

    if years < 0 or years > 120:
        return "unknown"
    if years < 18:
        return "under_18"
    if years <= 21:
        return "18-21"
    if years <= 25:
        return "22-25"
    if years <= 30:
        return "26-30"
    if years <= 40:
        return "31-40"
    return "41+"


def _first_name(full_name: Any) -> str:
    if not isinstance(full_name, str):
        return "Student"
    stripped = full_name.strip()
    if not stripped:
        return "Student"
    return stripped.split()[0]


def redact_for_admin_summary(app_data: dict) -> dict:
    """Produce a redacted copy of ``app_data`` suitable for the admin
    review AI prompt.

    - Drops ``full_name``, ``nrc_number``, ``passport_number``,
      ``date_of_birth`` (and any contact PII).
    - Adds ``age_bracket`` derived from DOB.
    - Keeps programme, institution, intake, payment status, grades,
      sex, nationality, documents summary.
    - Never mutates the input.

    Flag-off behaviour: returns ``app_data`` unchanged (dict copy).
    """
    if not isinstance(app_data, dict):
        return {}

    out = dict(app_data)

    if not getattr(settings, "AI_HARDENING_REDACTION", False):
        return out

    age_bracket = _derive_age_bracket(
        out.get("date_of_birth") or out.get("date_of_birth_iso")
    )

    for key in _ADMIN_DROP_KEYS:
        out.pop(key, None)

    out["age_bracket"] = age_bracket
    # Identity status: "provided"/"not_provided" without leaking the number.
    had_id = bool(app_data.get("nrc_number") or app_data.get("passport_number"))
    out["identity_status"] = "on_file" if had_id else "not_provided"

    return out


def redact_for_student_preview(app_data: dict) -> dict:
    """Produce a redacted copy of ``app_data`` for the student-preview
    AI prompt.

    - Drops ``full_name``; replaces with ``first_name`` (tone of voice).
    - Drops NRC/passport/DOB.
    - Keeps programme, institution, intake, grades summary, subjects
      count.
    - Never mutates the input.

    Flag-off behaviour: returns ``app_data`` unchanged (dict copy).
    """
    if not isinstance(app_data, dict):
        return {}

    out = dict(app_data)

    if not getattr(settings, "AI_HARDENING_REDACTION", False):
        return out

    first_name = _first_name(out.get("full_name"))
    for key in _STUDENT_DROP_KEYS:
        out.pop(key, None)
    out["first_name"] = first_name

    return out


__all__ = [
    "redact_for_admin_summary",
    "redact_for_student_preview",
]
