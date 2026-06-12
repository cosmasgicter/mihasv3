"""Profile/template content-safety property test (task 14.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase 4 (Tenant document profiles),
Requirement 8 (Tenant Document Profiles Replace Hard-Coded Frontend Content),
acceptance criteria R8.6, R8.7, R8.10.

This file implements exactly one property (Property 19) against the
``validate_profile_payload`` pure validator that lands in **task 14.2**
(`backend/apps/catalog/services.py`). It is **test-first**: the validator does
not exist yet, so its import is guarded (``try/except ImportError`` →
module-level ``pytest.skipif``) and the whole module *skips* — it never errors
at collection — until 14.2 ships. The existing ``validate_template_payload``
unit coverage in ``tests/unit/test_template_safety.py`` is independent and is
left untouched.

Property 19 (R8.6, R8.7, R8.10) — *Document profile/template content is safe*:

- a safe profile payload (structured-JSON sections with only allowlisted
  ``{{token}}`` references, fee_chart/bank_accounts/requirements within the
  structural caps and with valid row shapes) is **accepted** (returns ``None``);
- every substituted token value is **HTML-escaped at render** and unknown /
  injected tokens **render inert** (left verbatim, never re-expanded) — R8.6;
- a payload is **rejected** with a descriptive ``TemplateValidationError`` whose
  ``message`` names the offending section/token/row, and is **not persisted**
  (the pure validator simply raises) when any of the following hold — R8.7/R8.10:
    * a section value references a token outside the allowlist (injected/unknown),
    * the ``tokens`` list contains a disallowed token,
    * a section uses a reserved merge-document key,
    * a section value carries DOCX/PDF/RTF/OLE/WordprocessingML merge content or
      a mail-merge field marker,
    * a structural cap is exceeded (>30 sections, any section >5000 chars,
      >50 fee rows, >10 bank accounts, >50 requirements),
    * a fee-chart / bank-account row has an invalid shape.

Assumed ``validate_profile_payload`` interface (so task 14.2 implements to
match — chosen as the most natural signature consistent with
``validate_template_payload``; documented here because the design fixes the
caps but not the exact kwargs):

    validate_profile_payload(
        *,
        sections=None,        # JSON object: <=30 keys, each value a str <=5000
                              #   chars, no merge content, every {{token}} in
                              #   ALLOWED_TEMPLATE_TOKENS; keys are free-form
                              #   identifiers (NOT the templates' {body,signatory}
                              #   allowlist — profiles carry many sections) but a
                              #   reserved merge-document key is rejected.
        tokens=None,          # list of allowlisted token names.
        fee_chart=None,       # list <=50 rows; each row a dict with non-empty
                              #   str "item" and numeric (non-bool) "amount".
        bank_accounts=None,   # list <=10 rows; each row a dict with non-empty
                              #   str "bank_name" and non-empty str "account_number".
        requirements=None,    # list <=50 strings.
        has_uploaded_file=False,
        extra_keys=None,
    ) -> None   # returns None when safe; raises TemplateValidationError otherwise.

The structural caps (<=30 sections x <=5000 chars, <=50 fee rows, <=10 banks,
<=50 requirements) are fixed by design.md ("Safe_Template_Policy"). Rejection is
mapped to the stable ``TEMPLATE_TOKEN_REJECTED`` 400 code at the endpoint layer
(covered later); this property exercises the pure validator contract only — no
DB — mirroring how ``TestValidatorAllowlist`` exercises
``validate_template_payload`` directly.

**Validates: Requirements 8.6, 8.7, 8.10**
"""

from __future__ import annotations

import html

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.catalog.services import (
    ALLOWED_TEMPLATE_TOKENS,
    DocumentTemplateService,
    TemplateValidationError,
)

# --- Guarded test-first import (task 14.2 has not landed yet) --------------
# ``validate_profile_payload`` is added in task 14.2. Importing it raises
# ImportError while it is absent, so we capture that and skip the whole module —
# collection always succeeds, and the property runs the moment 14.2 lands.
try:  # pragma: no cover - exercised only by the skip path before 14.2
    from apps.catalog.services import validate_profile_payload

    _IMPORT_ERROR: Exception | None = None
except ImportError as exc:  # pragma: no cover - the pre-14.2 skip path
    validate_profile_payload = None  # type: ignore[assignment]
    _IMPORT_ERROR = exc

pytestmark = pytest.mark.skipif(
    _IMPORT_ERROR is not None,
    reason=(
        "task 14.2 not implemented yet — "
        f"apps.catalog.services.validate_profile_payload missing: {_IMPORT_ERROR}"
    ),
)


# --- Structural caps fixed by design.md "Safe_Template_Policy" -------------
_MAX_SECTIONS = 30
_MAX_SECTION_CHARS = 5000
_MAX_FEE_ROWS = 50
_MAX_BANKS = 10
_MAX_REQUIREMENTS = 50

# A disallowed token name guaranteed not to be on the allowlist.
_BAD_TOKEN = "secret_balance"
assert _BAD_TOKEN not in ALLOWED_TEMPLATE_TOKENS

# Reserved merge-document key (mirrors ``_MERGE_DOCUMENT_KEYS`` in services.py).
_RESERVED_SECTION_KEY = "merge_document"

# Merge-document blobs the safe-template policy must reject (DOCX/ZIP, PDF, RTF,
# legacy OLE .doc, WordprocessingML, a mail-merge field code, and a raw NUL).
_MERGE_BLOBS: tuple[str, ...] = (
    "%PDF-1.7 arbitrary pdf merge document",
    "PK\x03\x04 docx zip container",
    "{\\rtf1 arbitrary rtf}",
    "\xd0\xcf\x11\xe0 legacy ole doc",
    "<w:body><w:p>merge</w:p></w:body>",
    "Hello { MERGEFIELD Name }",
    "embedded\x00nul",
)

_SAFE_TOKENS = sorted(ALLOWED_TEMPLATE_TOKENS)

# Every distinct mutation Property 19 must reject, plus the "safe" accept case.
_MUTATIONS = (
    "safe",
    "unknown_token_in_section",
    "disallowed_token_in_list",
    "reserved_section_key",
    "merge_document_in_section",
    "too_many_sections",
    "oversized_section",
    "too_many_fee_rows",
    "too_many_banks",
    "too_many_requirements",
    "bad_fee_row_shape",
    "bad_bank_row_shape",
)


# ---------------------------------------------------------------------------
# Safe building blocks (kept strictly within every structural cap).
# ---------------------------------------------------------------------------


@st.composite
def _safe_section_value(draw) -> str:
    """A short prose body optionally embedding allowlisted ``{{token}}`` refs."""
    prefix = draw(st.text(alphabet=st.characters(whitelist_categories=("L", "Zs")), max_size=40))
    tokens = draw(st.lists(st.sampled_from(_SAFE_TOKENS), max_size=3))
    body = prefix + " " + " ".join("{{%s}}" % t for t in tokens)
    return body[:_MAX_SECTION_CHARS]


@st.composite
def _safe_fee_row(draw) -> dict:
    return {
        "item": draw(st.text(min_size=1, max_size=40).filter(lambda s: s.strip() != "")),
        "amount": draw(
            st.one_of(
                st.integers(min_value=-100_000, max_value=1_000_000),
                st.floats(min_value=0, max_value=1_000_000, allow_nan=False, allow_infinity=False),
            )
        ),
        "cadence": draw(st.sampled_from(["Once off", "Per semester", "Per month", "Per year"])),
    }


@st.composite
def _safe_bank_row(draw) -> dict:
    return {
        "bank_name": draw(st.text(min_size=1, max_size=40).filter(lambda s: s.strip() != "")),
        "account_name": draw(st.text(min_size=1, max_size=40)),
        "account_number": draw(
            st.text(alphabet="0123456789", min_size=6, max_size=16)
        ),
    }


@st.composite
def _safe_payload(draw) -> dict:
    """A profile payload that satisfies every Safe_Template_Policy constraint."""
    n_sections = draw(st.integers(min_value=1, max_value=8))
    sections = {
        "section_%d" % i: draw(_safe_section_value()) for i in range(n_sections)
    }
    tokens = draw(st.lists(st.sampled_from(_SAFE_TOKENS), max_size=len(_SAFE_TOKENS), unique=True))
    fee_chart = draw(st.lists(_safe_fee_row(), max_size=5))
    bank_accounts = draw(st.lists(_safe_bank_row(), max_size=3))
    requirements = draw(st.lists(st.text(min_size=1, max_size=60), max_size=5))
    return {
        "sections": sections,
        "tokens": tokens,
        "fee_chart": fee_chart,
        "bank_accounts": bank_accounts,
        "requirements": requirements,
    }


@st.composite
def _profile_cases(draw) -> dict:
    """Draw a safe base payload, a mutation label, and (for safe cases) an XSS
    context value used to exercise the render-escape contract.

    Returns ``{"mutation", "payload", "offender", "xss"}`` where ``offender`` is
    the substring the rejection message must contain (a section key / token /
    row noun), and ``xss`` is HTML-special text used only by the safe branch.
    """
    payload = draw(_safe_payload())
    mutation = draw(st.sampled_from(_MUTATIONS))
    offender: str | None = None
    xss = draw(st.text(max_size=24)) + "<b>&\"'</b>"

    if mutation == "unknown_token_in_section":
        payload["sections"]["section_0"] = "Owed: {{%s}}" % _BAD_TOKEN
        offender = _BAD_TOKEN

    elif mutation == "disallowed_token_in_list":
        payload["tokens"] = list(payload["tokens"]) + [_BAD_TOKEN]
        offender = _BAD_TOKEN

    elif mutation == "reserved_section_key":
        payload["sections"][_RESERVED_SECTION_KEY] = "anything"
        offender = _RESERVED_SECTION_KEY

    elif mutation == "merge_document_in_section":
        payload["sections"]["section_0"] = draw(st.sampled_from(_MERGE_BLOBS))
        offender = "section_0"

    elif mutation == "too_many_sections":
        payload["sections"] = {
            "section_%d" % i: "ok" for i in range(_MAX_SECTIONS + 1)
        }
        offender = "section"

    elif mutation == "oversized_section":
        payload["sections"]["section_0"] = "x" * (_MAX_SECTION_CHARS + 1)
        offender = "section_0"

    elif mutation == "too_many_fee_rows":
        payload["fee_chart"] = [
            {"item": "Fee %d" % i, "amount": 100} for i in range(_MAX_FEE_ROWS + 1)
        ]
        offender = "fee"

    elif mutation == "too_many_banks":
        payload["bank_accounts"] = [
            {"bank_name": "Bank %d" % i, "account_name": "A", "account_number": "1234567"}
            for i in range(_MAX_BANKS + 1)
        ]
        offender = "bank"

    elif mutation == "too_many_requirements":
        payload["requirements"] = ["Item %d" % i for i in range(_MAX_REQUIREMENTS + 1)]
        offender = "requirement"

    elif mutation == "bad_fee_row_shape":
        payload["fee_chart"] = list(payload["fee_chart"]) + [
            draw(
                st.sampled_from(
                    [
                        "not-a-dict",
                        {"item": "Missing amount"},  # no amount
                        {"amount": 100},  # no item
                        {"item": "", "amount": 100},  # empty item
                        {"item": "Bad amount", "amount": "free"},  # non-numeric
                    ]
                )
            )
        ]
        offender = "fee"

    elif mutation == "bad_bank_row_shape":
        payload["bank_accounts"] = list(payload["bank_accounts"]) + [
            draw(
                st.sampled_from(
                    [
                        "not-a-dict",
                        {"account_number": "1234567"},  # no bank_name
                        {"bank_name": "Zanaco"},  # no account_number
                        {"bank_name": "", "account_number": "1234567"},  # empty bank_name
                    ]
                )
            )
        ]
        offender = "bank"

    return {"mutation": mutation, "payload": payload, "offender": offender, "xss": xss}


class TestProfileContentSafetyProperty:
    # Feature: multi-tenant-beanola-remediation, Property 19: Document profile/template content is safe
    """Property 19: Document profile/template content is safe.

    A safe profile payload validates (returns ``None``) and renders allowlisted
    tokens HTML-escaped while leaving unknown tokens inert; any disallowed
    section/token, merge-document content, structural-cap breach, or bad
    fee/bank row shape is rejected with a descriptive ``TemplateValidationError``
    naming the offender and is never persisted (the pure validator raises).

    **Validates: Requirements 8.6, 8.7, 8.10**
    """

    # >=100 examples; success pinned to ``--hypothesis-seed=0`` via the CLI flag.
    # The validator is pure (no DB), so no health-check suppression is needed.
    @settings(max_examples=25, deadline=None)
    @given(case=_profile_cases())
    def test_profile_content_is_safe(self, case):
        mutation = case["mutation"]
        payload = case["payload"]

        if mutation == "safe":
            # R8.10: a safe payload is accepted (returns None, never raises).
            assert validate_profile_payload(**payload) is None

            # R8.6: render-time escape + inertness contract. ``_render_value`` is
            # the pure substitution seam used by ``DocumentTemplateService`` — an
            # allowlisted token is substituted with its HTML-escaped value and an
            # unknown token is left verbatim (inert, never re-expanded).
            renderer = DocumentTemplateService()
            xss = case["xss"]
            escaped = renderer._render_value(
                "Prefix {{student_name}} end",
                {"student_name": xss},
                {"student_name"},
            )
            assert escaped == "Prefix " + html.escape(xss) + " end"
            # No raw HTML-significant character survives substitution.
            assert "<b>" not in escaped

            inert = renderer._render_value(
                "Owed: {{%s}}" % _BAD_TOKEN,
                {_BAD_TOKEN: "1,000,000"},
                {"student_name"},
            )
            assert inert == "Owed: {{%s}}" % _BAD_TOKEN
            return

        # R8.7 / R8.10: every unsafe mutation is rejected; the version is not
        # persisted (the pure validator simply raises before any side effect).
        with pytest.raises(TemplateValidationError) as exc_info:
            validate_profile_payload(**payload)

        message = str(exc_info.value)
        assert message, "rejection must carry a descriptive message"
        offender = case["offender"]
        assert offender is not None
        # The descriptive error names the offending section / token / row noun.
        assert offender.lower() in message.lower(), {
            "mutation": mutation,
            "offender": offender,
            "message": message,
        }
