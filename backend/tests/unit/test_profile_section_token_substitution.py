"""Profile section bodies substitute allowlisted {{tokens}} at render time.

Regression: acceptance/conditional letters render their body from the resolved
InstitutionDocumentProfile's ``sections['body']``. That prose carries the same
``{{student_name}}`` / ``{{program}}`` / ``{{intake}}`` / ``{{institution}}``
tokens as Document_Templates, but profile sections were read straight off the
row, so tokens rendered literally (a raw ``{{intake}}`` appeared on the live
KATC acceptance letter). ``_common.profile_section`` must substitute the
allowlisted tokens — reusing the template allowlist + inert-unknown semantics.
"""

from __future__ import annotations

from types import SimpleNamespace

from apps.applications.tasks.pdf.renderers import _common


def _ctx(body: str):
    profile = SimpleNamespace(sections={"body": body}, signatory={})
    application = SimpleNamespace(
        full_name="Mulunga Musonda",
        application_number="KATC202610590",
        program="Diploma in Clinical Medicine",
        intake="January 2027 Intake",
    )
    tenant = {"institution_id": "i", "name": "Kalulushi Training Centre"}
    return SimpleNamespace(
        profile=profile, application=application, tenant=tenant, payment=None
    )


def test_known_tokens_are_substituted():
    out = _common.profile_section(
        _ctx("Dear {{student_name}}, welcome to {{program}} for {{intake}} at {{institution}}."),
        "body",
    )
    assert out == (
        "Dear Mulunga Musonda, welcome to Diploma in Clinical Medicine "
        "for January 2027 Intake at Kalulushi Training Centre."
    )
    assert "{{" not in out


def test_intake_token_specifically_substituted():
    """The exact bug seen live: REF line {{intake}} must resolve."""
    out = _common.profile_section(
        _ctx("REF: ADMISSION — FULL TIME, {{intake}}"), "body"
    )
    assert out == "REF: ADMISSION — FULL TIME, January 2027 Intake"


def test_unknown_token_left_inert():
    out = _common.profile_section(_ctx("Hello {{not_a_real_token}} end"), "body")
    assert out == "Hello {{not_a_real_token}} end"


def test_application_number_token():
    out = _common.profile_section(_ctx("No: {{application_number}}"), "body")
    assert out == "No: KATC202610590"


def test_missing_section_returns_none():
    assert _common.profile_section(_ctx("body text"), "nonexistent") is None


def test_no_profile_returns_none():
    ctx = SimpleNamespace(profile=None, application=None, tenant={}, payment=None)
    assert _common.profile_section(ctx, "body") is None
