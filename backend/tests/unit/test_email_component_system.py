"""Unit tests — email component system (tokens, components, shell).

Verifies:
   - shell produces a complete HTML document with DOCTYPE, preheader, and
     the supplied title
   - components produce HTML containing the expected tokens
   - to_plain_text strips tags correctly
   - backward-compat shim at apps/common/email_templates still works
"""

from apps.common.email import components, shell, tokens
from apps.common.email.components import (
    cta_button,
    divider,
    metadata_card,
    notice_box,
    ordered_list,
    paragraph,
    section_heading,
    signature_block,
    to_plain_text,
)
from apps.common.email.shell import render_shell


def test_tokens_expose_expected_constants():
    assert tokens.INK_900 == "#0B1F3A"
    assert tokens.INK_700 == "#1D3557"
    assert tokens.GOLD == "#B8860B"
    assert tokens.FONT_BODY.startswith("Arial")
    assert tokens.FONT_DISPLAY.startswith("Georgia")


def test_shell_renders_complete_document():
    html = render_shell("<p>body</p>", title="Test Title", preheader="Preview")
    assert "<!DOCTYPE" in html
    assert "<html" in html
    assert "</html>" in html
    assert "Test Title" in html
    assert "Preview" in html
    assert "<p>body</p>" in html


def test_shell_uses_default_preheader_when_omitted():
    html = render_shell("<p>body</p>", title="Hello")
    # Default preheader falls back to the title
    assert "Hello" in html


def test_shell_title_is_escaped():
    html = render_shell("<p>body</p>", title="<script>alert()</script>")
    assert "<script>alert()</script>" not in html
    assert "&lt;script&gt;" in html


def test_paragraph_renders_body_text():
    html = paragraph("Welcome to admissions.")
    assert "Welcome to admissions." in html
    assert tokens.INK_900 in html
    assert tokens.FONT_BODY in html


def test_paragraph_muted_variant_uses_ink_500():
    html = paragraph("Small print.", muted=True)
    assert tokens.INK_500 in html


def test_section_heading_renders_serif_semibold():
    html = section_heading("Programme Details")
    assert "Programme Details" in html
    assert tokens.FONT_DISPLAY in html
    assert tokens.WEIGHT_SEMIBOLD in html


def test_section_heading_escapes_html():
    html = section_heading("<b>Inject</b>")
    assert "<b>Inject</b>" not in html
    assert "&lt;b&gt;Inject&lt;/b&gt;" in html


def test_cta_button_contains_href_and_label():
    html = cta_button("Open Application", "https://apply.mihas.edu.zm/student")
    assert "Open Application" in html
    assert "https://apply.mihas.edu.zm/student" in html
    # Outlook VML fallback
    assert "mso" in html


def test_cta_button_escapes_label_and_href():
    html = cta_button("Click <here>", "https://example.com?a=1&b=2")
    assert "<here>" not in html
    assert "&lt;here&gt;" in html
    assert "&amp;b=2" in html


def test_metadata_card_renders_all_rows():
    html = metadata_card(
        [
            ("Application Number", "APP-20260510-ABCD1234"),
            ("Programme", "Diploma in Registered Nursing"),
            ("Intake", "January 2027"),
        ]
    )
    assert "APP-20260510-ABCD1234" in html
    assert "Diploma in Registered Nursing" in html
    assert "January 2027" in html


def test_metadata_card_shows_em_dash_for_empty_values():
    html = metadata_card([("Reference", "")])
    assert "&mdash;" in html


def test_notice_box_variants_apply_correct_palette():
    warning = notice_box("Deadline approaching", variant="warning")
    danger = notice_box("Payment failed", variant="danger")
    success = notice_box("Payment received", variant="success")
    assert "Deadline approaching" in warning
    assert "Payment failed" in danger
    assert tokens.RED in danger
    assert tokens.GREEN in success


def test_signature_block_defaults_to_dr_solomon_musonda():
    html = signature_block()
    assert "Dr Solomon Musonda" in html
    assert "Director" in html
    assert "Mukuba Institute of Health and Allied Sciences" in html


def test_signature_block_accepts_overrides():
    html = signature_block(
        name="Prof. Mwenya Nkonde",
        role="Acting Director",
        institution="Kalulushi Training Centre",
    )
    assert "Prof. Mwenya Nkonde" in html
    assert "Acting Director" in html
    assert "Kalulushi Training Centre" in html


def test_ordered_list_numbers_items():
    html = ordered_list(["Create account.", "Upload documents.", "Pay the fee."])
    assert "Create account." in html
    assert "Upload documents." in html
    assert "Pay the fee." in html
    # Number markers appear
    assert "1." in html
    assert "2." in html
    assert "3." in html


def test_divider_produces_thin_hairline():
    html = divider()
    assert "background" in html
    assert tokens.INK_300 in html


def test_to_plain_text_strips_all_tags():
    html = "<p>Hello <b>world</b></p><br/><p>Second paragraph.</p>"
    text = to_plain_text(html)
    assert "<" not in text
    assert "Hello world" in text
    assert "Second paragraph." in text


def test_to_plain_text_drops_style_and_script_blocks():
    html = "<style>body{color:red}</style><p>Visible</p><script>alert(1)</script>"
    text = to_plain_text(html)
    assert "color:red" not in text
    assert "alert" not in text
    assert "Visible" in text


def test_old_email_templates_shim_reexports_render_shell():
    from apps.common import email_templates as legacy

    out = legacy.get_base_email_html("<p>legacy</p>", title="Legacy Call")
    assert "<p>legacy</p>" in out
    assert "Legacy Call" in out


def test_components_module_barrel_exports():
    # Sanity-check that the package-level barrel exposes the expected
    # sub-modules so importers can `from apps.common.email import components`.
    from apps.common import email as pkg

    assert pkg.components is components
    assert pkg.shell is shell
    assert pkg.tokens is tokens
