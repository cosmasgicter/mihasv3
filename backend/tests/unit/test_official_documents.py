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
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.exceptions import ValidationError

from apps.catalog.models import InstitutionDocumentProfile, InstitutionDocumentTemplate
from apps.catalog.services import (
    DocumentTemplateService,
    TemplateValidationError,
    validate_profile_payload,
)
from apps.documents.validators import (
    ALLOWED_ASSET_MIME_TYPES,
    validate_asset_magic_bytes,
)
from tests.tenant_fixtures import build_institution, build_tenant_world

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


# ===========================================================================
# Task 15.3 — Renderer unit tests
#
# Explicit example/boundary coverage for the tenant-aware official-document
# renderer package (``apps/applications/tasks/pdf``) and the profile payload
# structural caps (``apps.catalog.services.validate_profile_payload``):
#
#   1. Fee-chart layout rendering (acceptance / conditional offer) from a
#      resolved profile carrying fee_chart + bank_accounts + requirements.
#   2. The acceptance renderer reads ONLY the resolved profile (R8.3) — its
#      sections / signatory / fee chart, never frontend constants / _default_body.
#   3. Structural-cap rejections (≤30 sections × ≤5000 chars, ≤50 fee rows,
#      ≤10 banks, ≤50 requirements) raise TemplateValidationError.
#   4. No active profile → ``failed`` for a profile-required document type
#      (R8.9): no ApplicationDocument row, an AuditLog row with
#      error_code="DOCUMENT_PROFILE_NOT_CONFIGURED", and no retry.
#
# **Validates: Requirements R8.3, R8.9**
# ===========================================================================


# ---------------------------------------------------------------------------
# In-memory storage so the renderer never reaches real R2/S3 (mirrors the
# lifecycle property test's ``_fake_storage`` seam).
# ---------------------------------------------------------------------------


class _FakeStorage:
    """Minimal in-memory ``MediaStorage`` stand-in (save/url/open)."""

    _files: dict[str, bytes] = {}

    def save(self, name, content):
        content.seek(0)
        self._files[name] = content.read()
        return name

    def url(self, name):
        return f"https://test-storage.local/{name}"

    def open(self, name, mode="rb"):
        return io.BytesIO(self._files.get(name, b""))


@contextmanager
def _fake_storage():
    """Patch the call-time ``MediaStorage`` import site for the renderer."""
    _FakeStorage._files = {}
    with patch("apps.common.storage.MediaStorage", _FakeStorage):
        yield


# A distinctive marker string we plant in the profile body so we can prove the
# rendered content is derived from the resolved profile (not a default/frontend
# body). It is unlikely to appear in any default copy.
_PROFILE_BODY_MARKER = "PROFILE-BODY-MARKER-Zx9q"


def _build_render_context(application, document_type, *, profile, tenant=None):
    """Construct a RenderContext directly (no DB resolve) for renderer tests."""
    from apps.applications.tasks.pdf.render_context import RenderContext

    tenant = tenant or {
        "institution_id": str(uuid.uuid4()),
        "name": "Marker School of Health",
        "primary_color": "#0F766E",
        "admissions_email": "admissions@marker.example",
        "phone": "+260970000000",
        "website": "https://marker.example",
    }
    return RenderContext(
        application=application,
        document_type=document_type,
        tenant=tenant,
        profile=profile,
        logo_asset=None,
        signature_asset=None,
        payment=None,
    )


def _profile_stub(
    *,
    sections=None,
    signatory=None,
    fee_chart=None,
    bank_accounts=None,
    requirements=None,
    version=7,
    profile_id=None,
):
    """A lightweight profile object exposing only the attributes the renderer
    reads (``sections``/``signatory``/``fee_chart``/``bank_accounts``/
    ``requirements``/``version``/``id``). No DB row needed — the renderer pulls
    content purely off these attributes (R8.3)."""

    class _ProfileStub:
        pass

    p = _ProfileStub()
    p.id = profile_id or uuid.uuid4()
    p.version = version
    p.sections = sections if sections is not None else {"body": "Profile body text."}
    p.signatory = signatory if signatory is not None else {"name": "Registrar", "role": "Admissions"}
    p.fee_chart = fee_chart if fee_chart is not None else []
    p.bank_accounts = bank_accounts if bank_accounts is not None else []
    p.requirements = requirements if requirements is not None else []
    return p


def _application_stub():
    """A minimal application object exposing the fields the layout reads via
    ``_document_details`` (no DB row needed for a pure renderer test)."""

    class _AppStub:
        pass

    app = _AppStub()
    app.id = uuid.uuid4()
    app.application_number = "APP-20260101-ABC123"
    app.full_name = "Jane Applicant"
    app.program = "Diploma in Nursing"
    app.intake = "January 2026"
    app.institution = "Marker School of Health"
    app.status = "approved"
    return app


# ---------------------------------------------------------------------------
# 1 + 2. Fee-chart layout rendering + acceptance renderer reads only the profile
# ---------------------------------------------------------------------------


class TestAcceptanceRendererProfileDriven:
    """Acceptance / conditional-offer renderer fee-chart layout + R8.3 sourcing.

    Exercises ``pdf/renderers/acceptance_letter.py`` and
    ``pdf/layouts/fee_chart_letter.py`` directly via ``render_official_document``
    with a hand-built ``RenderContext`` carrying a resolved profile. No DB rows
    are required because the renderer reads content solely off the profile
    object on the context (R8.3).

    **Validates: Requirements R8.3, R8.9**
    """

    def _render(self, document_type="acceptance_letter", *, profile):
        from apps.applications.tasks.pdf.renderers import render_official_document

        context = _build_render_context(
            _application_stub(), document_type, profile=profile
        )
        return render_official_document(context, template={"template_id": None, "sections": {}})

    def test_fee_chart_layout_renders_nonempty_pdf(self):
        """A resolved profile with fee_chart + bank_accounts + requirements
        renders a non-empty PDF buffer through the fee-chart layout (R8.3)."""
        profile = _profile_stub(
            sections={"body": f"Dear applicant, {_PROFILE_BODY_MARKER}."},
            fee_chart=[
                {"item": "Tuition", "amount": 5000, "cadence": "per year"},
                {"item": "Registration", "amount": 250, "cadence": "once"},
            ],
            bank_accounts=[
                {
                    "bank_name": "Zanaco",
                    "account_name": "Marker School",
                    "account_number": "0123456789",
                    "branch": "Cairo Road",
                }
            ],
            requirements=["Bring original NRC", "Two passport photos"],
        )
        buffer, metadata = self._render(profile=profile)

        pdf_bytes = buffer.getvalue()
        assert pdf_bytes.startswith(b"%PDF"), "renderer did not emit a PDF buffer"
        assert len(pdf_bytes) > 0
        # Provenance records the resolving profile's id + version (R8.3).
        assert metadata["profile_id"] == str(profile.id)
        assert metadata["profile_version"] == profile.version
        assert metadata["template_version"] == profile.version

    def test_conditional_offer_also_renders_from_profile(self):
        """The conditional-offer type renders through the same profile-driven
        fee-chart layout and records profile provenance (R8.3)."""
        profile = _profile_stub(
            sections={"body": f"Conditional: {_PROFILE_BODY_MARKER}"},
            fee_chart=[{"item": "Deposit", "amount": 1000, "cadence": "once"}],
        )
        buffer, metadata = self._render(document_type="conditional_offer", profile=profile)

        assert buffer.getvalue().startswith(b"%PDF")
        assert metadata["document_type"] == "conditional_offer"
        assert metadata["profile_id"] == str(profile.id)

    def test_renderer_content_derives_from_profile_body_marker(self):
        """R8.3: the body + signatory drawn into the letter come from the
        resolved profile (carrying a distinctive marker), proving content is
        sourced from the profile rather than the ``_default_body`` / frontend
        constants path.

        reportlab compresses the PDF content stream, so we assert the *path
        taken* — the ``body``/``signatory`` the renderer hands to the layout —
        rather than scanning compressed bytes."""
        from apps.applications.tasks.pdf.renderers import acceptance_letter

        marker_profile = _profile_stub(
            sections={"body": f"Welcome. {_PROFILE_BODY_MARKER} See you soon."},
            signatory={"name": "Dr Profile Signatory", "role": "Registrar"},
        )
        captured = {}

        real_layout = acceptance_letter.render_fee_chart_letter

        def _spy(**kwargs):
            captured.update(kwargs)
            return real_layout(**kwargs)

        context = _build_render_context(_application_stub(), "acceptance_letter", profile=marker_profile)
        with patch.object(acceptance_letter, "render_fee_chart_letter", _spy):
            from apps.applications.tasks.pdf.renderers import render_official_document

            buffer, _metadata = render_official_document(
                context, template={"template_id": None, "sections": {}}
            )

        assert buffer.getvalue().startswith(b"%PDF")
        # The body handed to the layout is the (escaped) profile body marker.
        assert _PROFILE_BODY_MARKER in captured["body"]
        # The default acceptance-letter copy must NOT drive a profile-backed render.
        assert "We are pleased to inform you" not in captured["body"]
        # Signatory is derived from the profile signatory dict, not a default.
        assert "Dr Profile Signatory" in captured["signatory"]
        assert captured["signatory"] != "Admissions Office"
        # The fee-chart layout received profile-sourced version provenance.
        assert captured["template_version"] == marker_profile.version

    def test_metadata_signatory_path_uses_profile_not_default(self):
        """R8.3: with a profile present, the profile body wins over a supplied
        template body, and provenance reflects the profile id / version."""
        from apps.applications.tasks.pdf.renderers import acceptance_letter, render_official_document

        profile = _profile_stub(
            sections={"body": f"Body {_PROFILE_BODY_MARKER}"},
            version=42,
        )
        captured = {}
        real_layout = acceptance_letter.render_fee_chart_letter

        def _spy(**kwargs):
            captured.update(kwargs)
            return real_layout(**kwargs)

        context = _build_render_context(_application_stub(), "acceptance_letter", profile=profile)
        with patch.object(acceptance_letter, "render_fee_chart_letter", _spy):
            buffer, metadata = render_official_document(
                context,
                template={
                    "template_id": "tmpl-should-not-win",
                    "template_version": 1,
                    "sections": {"body": "TEMPLATE-BODY-SHOULD-NOT-APPEAR"},
                },
            )

        # Even when a template body is supplied, the profile body wins (R8.3).
        assert _PROFILE_BODY_MARKER in captured["body"]
        assert "TEMPLATE-BODY-SHOULD-NOT-APPEAR" not in captured["body"]
        assert metadata["profile_version"] == 42
        assert metadata["template_version"] == 42  # profile version wins

    def test_profile_required_type_without_profile_raises(self):
        """R8.9 seam: a profile-required type with no resolved profile raises
        ``DocumentProfileNotConfigured`` before any rendering."""
        from apps.applications.tasks.pdf.render_context import DocumentProfileNotConfigured
        from apps.applications.tasks.pdf.renderers import render_official_document

        context = _build_render_context(_application_stub(), "acceptance_letter", profile=None)
        with pytest.raises(DocumentProfileNotConfigured):
            render_official_document(context, template={"template_id": None, "sections": {}})


# ---------------------------------------------------------------------------
# 3. Structural-cap rejections (≤30 / 5000 / 50 / 10 / 50)
# ---------------------------------------------------------------------------


class TestProfilePayloadStructuralCaps:
    """Explicit boundary unit cases for ``validate_profile_payload`` caps.

    Complements the Property 19 hypothesis test with at-the-boundary and
    over-the-boundary examples for each structural cap: ≤30 sections,
    ≤5000 chars/section, ≤50 fee rows, ≤10 bank accounts, ≤50 requirements.

    **Validates: Requirements R8.3, R8.9**
    """

    # -- sections: ≤30 ------------------------------------------------------

    def test_thirty_sections_is_accepted(self):
        sections = {f"section_{i}": "ok" for i in range(30)}
        assert validate_profile_payload(sections=sections) is None

    def test_thirty_one_sections_is_rejected(self):
        sections = {f"section_{i}": "ok" for i in range(31)}
        with pytest.raises(TemplateValidationError):
            validate_profile_payload(sections=sections)

    # -- section length: ≤5000 chars ---------------------------------------

    def test_section_of_5000_chars_is_accepted(self):
        assert validate_profile_payload(sections={"body": "a" * 5000}) is None

    def test_section_over_5000_chars_is_rejected(self):
        with pytest.raises(TemplateValidationError):
            validate_profile_payload(sections={"body": "a" * 5001})

    # -- fee rows: ≤50 ------------------------------------------------------

    def test_fifty_fee_rows_is_accepted(self):
        fee_chart = [{"item": f"Fee {i}", "amount": i} for i in range(50)]
        assert validate_profile_payload(fee_chart=fee_chart) is None

    def test_fifty_one_fee_rows_is_rejected(self):
        fee_chart = [{"item": f"Fee {i}", "amount": i} for i in range(51)]
        with pytest.raises(TemplateValidationError):
            validate_profile_payload(fee_chart=fee_chart)

    # -- bank accounts: ≤10 -------------------------------------------------

    def test_ten_bank_accounts_is_accepted(self):
        banks = [
            {"bank_name": f"Bank {i}", "account_number": f"{i:010d}"} for i in range(10)
        ]
        assert validate_profile_payload(bank_accounts=banks) is None

    def test_eleven_bank_accounts_is_rejected(self):
        banks = [
            {"bank_name": f"Bank {i}", "account_number": f"{i:010d}"} for i in range(11)
        ]
        with pytest.raises(TemplateValidationError):
            validate_profile_payload(bank_accounts=banks)

    # -- requirements: ≤50 --------------------------------------------------

    def test_fifty_requirements_is_accepted(self):
        requirements = [f"Requirement {i}" for i in range(50)]
        assert validate_profile_payload(requirements=requirements) is None

    def test_fifty_one_requirements_is_rejected(self):
        requirements = [f"Requirement {i}" for i in range(51)]
        with pytest.raises(TemplateValidationError):
            validate_profile_payload(requirements=requirements)


# ---------------------------------------------------------------------------
# 4. No active profile → failed (R8.9): no document row, audit row, no retry
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestNoProfileFailsAndAudits:
    """A profile-required document type with NO active profile fails the render.

    Drives ``_generate_official_document_task`` directly (no ``.delay()`` — there
    is no broker in tests) against a DB-backed tenant world that has no
    ``InstitutionDocumentProfile``. Asserts: no ``ApplicationDocument`` row is
    created, an ``AuditLog`` row records the
    ``DOCUMENT_PROFILE_NOT_CONFIGURED`` failure (action
    ``official_document_render_failed``, status ``failed``, ``retried=False``),
    and the render is not retried. Mirrors how task 15.2 wired
    ``_audit_profile_not_configured``.

    **Validates: Requirements R8.3, R8.9**
    """

    def _run(self, document_type, application):
        from apps.applications.tasks.pdf_generation import _generate_official_document_task

        # ``task`` only needs a request.retries / max_retries for the non-profile
        # exception path; a simple object suffices since the no-profile branch
        # returns before any retry decision.
        class _TaskStub:
            max_retries = 3

            class request:
                retries = 0

        with _fake_storage():
            return _generate_official_document_task(_TaskStub(), str(application.id), document_type)

    @pytest.mark.parametrize("document_type", ["acceptance_letter", "conditional_offer"])
    def test_no_profile_creates_no_document_and_audits_failure(self, document_type):
        from apps.applications.models import Application
        from apps.common.models import AuditLog
        from apps.documents.models import ApplicationDocument

        required_status = "approved" if document_type == "acceptance_letter" else "submitted"
        world = build_tenant_world(application_status=required_status)
        application = world.application

        # Sanity: the world has no document profile of this type.
        assert not InstitutionDocumentProfile.objects.filter(
            institution=world.institution, document_type=document_type
        ).exists()

        before_docs = ApplicationDocument.objects.filter(
            application=application, document_type=document_type
        ).count()

        result = self._run(document_type, application)
        # The task swallows the no-profile failure and returns (no exception,
        # no retry).
        assert result is None

        # R8.9: NO ApplicationDocument row is created from default/frontend copy.
        after_docs = ApplicationDocument.objects.filter(
            application=application, document_type=document_type
        ).count()
        assert after_docs == before_docs == 0

        # R8.9: exactly the no-profile audit row exists with the stable code.
        audit_rows = list(
            AuditLog.objects.filter(
                action="official_document_render_failed",
                entity_id=application.id,
            )
        )
        assert len(audit_rows) == 1
        changes = audit_rows[0].changes
        assert changes["error_code"] == "DOCUMENT_PROFILE_NOT_CONFIGURED"
        assert changes["status"] == "failed"
        assert changes["retried"] is False
        assert changes["document_type"] == document_type
        # Non-PII: institution id only (no applicant name / institution name).
        assert changes["institution_id"] == str(application.institution_ref_id)

        # The application itself is untouched.
        application.refresh_from_db()
        assert application.status == required_status

    def test_resolved_profile_renders_and_creates_document(self):
        """Counterpart: with an active institution-default profile the same
        document type renders successfully and creates exactly one document —
        proving the no-profile path is the discriminator, not a broken render."""
        from apps.documents.models import ApplicationDocument

        world = build_tenant_world(application_status="approved")
        application = world.application
        InstitutionDocumentProfile.objects.create(
            id=uuid.uuid4(),
            institution=world.institution,
            document_type="acceptance_letter",
            program=None,
            canonical_program=None,
            intake=None,
            layout_key="fee_chart_letter",
            sections={"body": f"Profile body {_PROFILE_BODY_MARKER}"},
            fee_chart=[{"item": "Tuition", "amount": 5000, "cadence": "per year"}],
            bank_accounts=[],
            requirements=["Bring NRC"],
            signatory={"name": "Registrar", "role": "Admissions"},
            version=1,
            is_active=True,
            created_at=timezone.now(),
        )

        self._run("acceptance_letter", application)

        docs = ApplicationDocument.objects.filter(
            application=application, document_type="acceptance_letter"
        )
        assert docs.count() == 1
