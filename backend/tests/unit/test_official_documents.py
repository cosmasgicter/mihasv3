"""Official document integrity exploration tests (P13 + P14).

Spec: ``multi-tenant-beanola-admissions`` — Phase 0 exploration baseline
(task 1.9). Pins document provenance and safety against the **current**
implementation. No production code is changed in this task: each property
either PASSES against the current code, or is recorded as a durable
``@pytest.mark.xfail(strict=True)`` carrying a minimised counter-example
triaged to the Phase 4 task that will fix it.

    P13 Token allowlist + injection escaping; missing-template fallback.
        ``DocumentTemplateService.render`` HTML-escapes token values and
        falls back to a safe empty body when no template is configured.
    P14 Asset MIME/magic-byte validation per allowed type (PNG / JPEG /
        WebP / SVG). ``validate_asset_magic_bytes`` accepts an honest
        type+content pair and rejects spoofed, disallowed, empty, or
        malformed uploads.

Run (sqlite-in-memory, since the default ``DATABASE_URL`` points at the
production Neon branch)::

    cd backend && DATABASE_URL="sqlite://:memory:" TESTING=1 \
      .venv/bin/python -m pytest tests/unit/test_official_documents.py \
      --hypothesis-seed=0 -v

Each property test runs ≥100 examples (``max_examples=100``) with the seed
pinned via ``--hypothesis-seed=0``.

**Validates: Requirements R6.4, R6.5, R14.5**
"""

from __future__ import annotations

import html
import io
import uuid

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.exceptions import ValidationError

from apps.catalog.models import InstitutionDocumentTemplate
from apps.catalog.services import DocumentTemplateService
from apps.documents.validators import (
    ALLOWED_ASSET_MIME_TYPES,
    validate_asset_magic_bytes,
)
from tests.tenant_fixtures import build_institution

# Tag the whole module so the Phase 0 ``-k "tenant or ..."`` selector picks it
# up even though the filename carries no tenant/scope/assignment/canonical token.
pytestmark = pytest.mark.tenant


# ≥100 examples, deadline relaxed for DB-backed renders; seed pinned via the
# CLI flag ``--hypothesis-seed=0`` per the design's Testing Strategy.
HYPOTHESIS_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


# Document types the official renderer knows about (DOCUMENT_CONFIG keys in
# ``apps/applications/tasks/pdf_generation.py``).
DOCUMENT_TYPES = [
    "application_slip",
    "acceptance_letter",
    "conditional_offer",
    "finance_receipt",
    "payment_receipt",
]


def _make_template(institution, *, document_type="acceptance_letter", sections, tokens):
    now = timezone.now()
    return InstitutionDocumentTemplate.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type=document_type,
        name="Default Template",
        version=1,
        sections=sections,
        tokens=tokens,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# P13 — token allowlist + injection escaping; missing-template fallback
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOfficialDocumentSafety:
    """P13: template token safety + missing-template fallback.

    **Validates: Requirements R6.4, R6.5, R14.5**
    """

    # -- R6.5: missing template → safe default fallback (PASS) --------------

    def test_missing_template_falls_back_safely(self):
        """With no template configured, render() returns a safe empty-sections
        payload rather than raising (R6.5)."""
        institution = build_institution()
        result = DocumentTemplateService().render(
            institution_id=str(institution.id),
            document_type="acceptance_letter",
            context={"full_name": "Jane Doe"},
        )
        assert result["template_id"] is None
        assert result["template_version"] is None
        assert result["sections"] == {}

    @given(document_type=st.sampled_from(DOCUMENT_TYPES))
    @HYPOTHESIS_SETTINGS
    def test_missing_template_fallback_is_safe_for_every_document_type(self, document_type):
        """For every official document type, a missing template falls back to
        the safe empty body — never an exception (R6.5).

        **Validates: Requirements R6.5**
        """
        institution = build_institution()
        result = DocumentTemplateService().render(
            institution_id=str(institution.id),
            document_type=document_type,
            context={"full_name": "Jane Doe", "amount": "153.00"},
        )
        assert result["template_id"] is None
        assert result["sections"] == {}

    # -- R6.4 clause (a): HTML-escape token values (PASS) -------------------

    def test_token_values_are_html_escaped(self):
        """An injected token value is HTML-escaped on render (R6.4)."""
        institution = build_institution()
        _make_template(
            institution,
            sections={"greeting": "Dear {{full_name}},"},
            tokens=["full_name"],
        )
        result = DocumentTemplateService().render(
            institution_id=str(institution.id),
            document_type="acceptance_letter",
            context={"full_name": "<script>alert(1)</script>"},
        )
        greeting = result["sections"]["greeting"]
        assert "<script>" not in greeting
        assert "&lt;script&gt;" in greeting

    @given(payload=st.text(max_size=120))
    @HYPOTHESIS_SETTINGS
    def test_arbitrary_token_values_never_emit_raw_angle_brackets(self, payload):
        """For any token value, the rendered section carries no raw ``<`` / ``>``.

        The template body itself contains no angle brackets, so any ``<`` / ``>``
        in the output could only come from an un-escaped token value. The render
        must HTML-escape every substituted value, so the output is always free
        of raw angle brackets regardless of the (possibly hostile) payload.

        **Validates: Requirements R6.4**
        """
        institution = build_institution()
        _make_template(
            institution,
            sections={"greeting": "Dear {{full_name}}, welcome."},
            tokens=["full_name"],
        )
        result = DocumentTemplateService().render(
            institution_id=str(institution.id),
            document_type="acceptance_letter",
            context={"full_name": payload},
        )
        greeting = result["sections"]["greeting"]
        assert "<" not in greeting
        assert ">" not in greeting
        # The escaped payload is exactly what landed in the body.
        assert greeting == f"Dear {html.escape(payload)}, welcome."

    # -- R6.4 clause (b): allowlist + reject/ignore injected tokens --------

    def test_injected_token_in_value_is_not_re_expanded(self):
        """A token value that embeds another ``{{token}}`` must not be expanded.

        Minimised counter-example: a student-controlled ``full_name`` of
        ``"{{receipt_number}}"`` is escaped to ``"{{receipt_number}}"`` (the
        braces survive ``html.escape``); the sequential substitution loop then
        replaces ``{{receipt_number}}`` with the real receipt number, leaking it
        into the greeting. ``receipt_number`` is also not in the template's
        ``tokens`` allowlist, so it should have been ignored entirely.

        **Validates: Requirements R6.4**
        """
        institution = build_institution()
        _make_template(
            institution,
            sections={"greeting": "Dear {{full_name}},"},
            tokens=["full_name"],  # only full_name is allow-listed
        )
        # full_name is inserted first so its injected reference is expanded by a
        # later iteration of the substitution loop (insertion-ordered dict).
        context = {
            "full_name": "{{receipt_number}}",
            "receipt_number": "RX-SENSITIVE-0001",
        }
        result = DocumentTemplateService().render(
            institution_id=str(institution.id),
            document_type="acceptance_letter",
            context=context,
        )
        greeting = result["sections"]["greeting"]
        # The non-allow-listed token's value must never leak into the output.
        assert "RX-SENSITIVE-0001" not in greeting


# ---------------------------------------------------------------------------
# P14 — asset MIME/magic-byte validation per allowed type
# ---------------------------------------------------------------------------

# Honest magic-byte headers for each allowed asset type. Binary types get a
# correct signature; the SVG types are validated by their textual prefix.
_PNG_HEADER = b"\x89PNG\r\n\x1a\n"
_JPEG_HEADER = b"\xff\xd8\xff\xe0\x00\x10JFIF"
_WEBP_HEADER = b"RIFF\x00\x00\x00\x00WEBPVP8 "

# Binary asset types only (SVG is text-based and validated separately).
_BINARY_ASSET_HEADERS = {
    "image/png": _PNG_HEADER,
    "image/jpeg": _JPEG_HEADER,
    "image/webp": _WEBP_HEADER,
}


def _svg_body(prolog: bool) -> bytes:
    if prolog:
        return b"<?xml version='1.0' encoding='UTF-8'?>\n<svg xmlns='http://www.w3.org/2000/svg'/>"
    return b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"


class TestAssetMimeMagicByteValidation:
    """P14: asset MIME/magic-byte validation per allowed type.

    These exercise the pure ``validate_asset_magic_bytes`` validator used by
    ``AdminTenantAssetUploadView`` — no DB required.

    **Validates: Requirements R6.1, R14.5**
    """

    def test_allowed_set_is_exactly_png_jpeg_webp_svg(self):
        """The asset allowlist is exactly the four documented image types."""
        assert ALLOWED_ASSET_MIME_TYPES == {
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/svg+xml",
        }

    # -- honest type+content pairs are accepted (PASS) ----------------------

    @given(
        mime=st.sampled_from(sorted(_BINARY_ASSET_HEADERS)),
        tail=st.binary(max_size=64),
    )
    @settings(max_examples=100, deadline=None)
    def test_honest_binary_asset_is_accepted(self, mime, tail):
        """A PNG/JPEG/WebP file whose magic bytes match its declared MIME is
        accepted and the detected type is returned (R6.1, R14.5).

        **Validates: Requirements R6.1, R14.5**
        """
        data = _BINARY_ASSET_HEADERS[mime] + tail
        detected = validate_asset_magic_bytes(io.BytesIO(data), mime)
        assert detected == mime

    @given(prolog=st.booleans(), tail=st.binary(max_size=64))
    @settings(max_examples=100, deadline=None)
    def test_honest_svg_asset_is_accepted(self, prolog, tail):
        """An SVG declared as ``image/svg+xml`` (with or without an XML prolog)
        is accepted (R6.1, R14.5).

        **Validates: Requirements R6.1, R14.5**
        """
        data = _svg_body(prolog) + tail
        detected = validate_asset_magic_bytes(io.BytesIO(data), "image/svg+xml")
        assert detected == "image/svg+xml"

    # -- cross-type spoofs are rejected (PASS) ------------------------------

    @given(data=st.sampled_from(sorted(_BINARY_ASSET_HEADERS)), declared=st.sampled_from(sorted(_BINARY_ASSET_HEADERS)))
    @settings(max_examples=100, deadline=None)
    def test_cross_type_binary_spoof_is_rejected(self, data, declared):
        """Content of one binary type declared as a different binary type is
        rejected; an honest match is accepted (R6.1, R14.5).

        **Validates: Requirements R6.1, R14.5**
        """
        header = _BINARY_ASSET_HEADERS[data]
        if data == declared:
            assert validate_asset_magic_bytes(io.BytesIO(header), declared) == declared
        else:
            with pytest.raises(ValidationError):
                validate_asset_magic_bytes(io.BytesIO(header), declared)

    def test_png_content_declared_jpeg_is_rejected(self):
        with pytest.raises(ValidationError):
            validate_asset_magic_bytes(io.BytesIO(_PNG_HEADER), "image/jpeg")

    # -- disallowed declared types are rejected (PASS) ----------------------

    @pytest.mark.parametrize(
        "declared,content",
        [
            ("application/pdf", b"%PDF-1.4\n%abc"),
            ("image/gif", b"GIF89a\x00\x00"),
            ("text/html", b"<html></html>"),
            ("image/bmp", b"BM\x00\x00"),
        ],
    )
    def test_disallowed_declared_type_is_rejected(self, declared, content):
        with pytest.raises(ValidationError):
            validate_asset_magic_bytes(io.BytesIO(content), declared)

    # -- malformed / mismatched content is rejected (PASS) ------------------

    def test_empty_file_is_rejected(self):
        with pytest.raises(ValidationError):
            validate_asset_magic_bytes(io.BytesIO(b""), "image/png")

    def test_html_content_declared_svg_is_rejected(self):
        with pytest.raises(ValidationError):
            validate_asset_magic_bytes(io.BytesIO(b"<html><body>x</body></html>"), "image/svg+xml")

    def test_riff_non_webp_declared_webp_is_rejected(self):
        """A RIFF container that is not WEBP (e.g. a WAV) declared as WebP is
        rejected — the ``WEBP`` four-CC at offset 8 is required."""
        wav = b"RIFF\x00\x00\x00\x00WAVEfmt "
        with pytest.raises(ValidationError):
            validate_asset_magic_bytes(io.BytesIO(wav), "image/webp")

    # -- R6.7: active/unsafe SVG content is rejected (PASS) -----------------

    @pytest.mark.parametrize(
        "unsafe_svg",
        [
            # Embedded <script> element.
            b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
            # Inline event handler on the root element.
            b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'></svg>",
            # Inline event handler on a child element.
            b"<svg xmlns='http://www.w3.org/2000/svg'><rect onclick=\"x()\"/></svg>",
            # javascript: URI in an href.
            b"<svg xmlns='http://www.w3.org/2000/svg'><a href='javascript:alert(1)'>x</a></svg>",
            # <foreignObject> can host arbitrary HTML.
            b"<svg xmlns='http://www.w3.org/2000/svg'><foreignObject><body>x</body></foreignObject></svg>",
            # DOCTYPE / ENTITY block (XXE / billion-laughs vector) before the root.
            b"<?xml version='1.0'?><!DOCTYPE svg [<!ENTITY x 'y'>]><svg xmlns='http://www.w3.org/2000/svg'/>",
            # Script that appears only deep in the body, past the 512-byte header.
            b"<svg xmlns='http://www.w3.org/2000/svg'>" + b"<rect/>" * 200 + b"<script>evil()</script></svg>",
            # Uppercase / spaced variants must not slip past the case-insensitive scan.
            b"<svg xmlns='http://www.w3.org/2000/svg'>< SCRIPT >alert(1)</ SCRIPT ></svg>",
        ],
    )
    def test_active_svg_content_is_rejected(self, unsafe_svg):
        """An SVG carrying scriptable/active content is rejected (R6.7).

        A stored SVG is served from its ``public_url`` where a browser would
        execute embedded scripts, event handlers, ``javascript:`` URIs, or
        ``<foreignObject>`` HTML, so the upload boundary must refuse it even
        though its magic-byte prefix is a valid ``<svg`` root.

        **Validates: Requirements R6.7, R14.5**
        """
        with pytest.raises(ValidationError):
            validate_asset_magic_bytes(io.BytesIO(unsafe_svg), "image/svg+xml")

    @pytest.mark.parametrize(
        "safe_svg",
        [
            b"<svg xmlns='http://www.w3.org/2000/svg'><rect width='10' height='10'/></svg>",
            b"<?xml version='1.0' encoding='UTF-8'?>\n<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0h4'/></svg>",
            # A static <a> link (no javascript: scheme) is benign.
            b"<svg xmlns='http://www.w3.org/2000/svg'><a href='https://example.test'>x</a></svg>",
            # The substring 'on' inside an ordinary attribute/word must not trip
            # the event-handler pattern (it requires a leading space + ``=``).
            b"<svg xmlns='http://www.w3.org/2000/svg'><rect class='button'/></svg>",
        ],
    )
    def test_safe_static_svg_is_still_accepted(self, safe_svg):
        """A static SVG with no active content remains accepted (R6.7 does not
        over-block legitimate brand SVGs).

        **Validates: Requirements R6.1, R6.7, R14.5**
        """
        assert validate_asset_magic_bytes(io.BytesIO(safe_svg), "image/svg+xml") == "image/svg+xml"
