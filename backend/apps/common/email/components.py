"""Reusable HTML fragments for Beanola transactional emails.

Each function returns a raw HTML string. Keep them small and opinionated:
one concept per function, no branching on optional styles beyond what the
caller explicitly passes.

Beanola is a multi-tenant admissions platform. These components are
brand-neutral by default — school-specific identity (signatory name, role,
institution, division) is supplied by the caller from tenant/institution
context, never baked in as a universal default.

All components are compatible with:
   - Gmail (web, iOS, Android)
   - Apple Mail (macOS, iOS)
   - Outlook 365 (web, desktop)
   - Outlook classic (MSO conditional comments where needed)
   - Android Gmail app
   - Yahoo Mail
"""

from html import escape

from apps.common.email import tokens as t


# ---------------------------------------------------------------------------
# Text blocks
# ---------------------------------------------------------------------------


def paragraph(text: str, *, muted: bool = False) -> str:
    """Standard body paragraph."""
    color = t.INK_500 if muted else t.INK_900
    return f"""
<p style="margin:0 0 {t.SPACE_MD} 0;font-family:{t.FONT_BODY};
          font-size:{t.TYPE_BODY_SIZE};line-height:{t.TYPE_BODY_LINE};
          color:{color};">
  {text}
</p>
""".strip()


def section_heading(text: str) -> str:
    """Section heading - serif, semibold, institutional."""
    return f"""
<h2 style="margin:0 0 {t.SPACE_MD} 0;font-family:{t.FONT_DISPLAY};
           font-size:{t.TYPE_HEADING_SIZE};line-height:{t.TYPE_HEADING_LINE};
           font-weight:{t.WEIGHT_SEMIBOLD};color:{t.INK_700};
           letter-spacing:-0.2px;">
  {escape(text)}
</h2>
""".strip()


def divider() -> str:
    """Thin hairline divider - uses a table for Outlook compatibility."""
    return f"""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="margin:{t.SPACE_LG} 0;">
  <tr>
    <td style="height:{t.BORDER_HAIRLINE};line-height:{t.BORDER_HAIRLINE};
               font-size:0;background:{t.INK_300};">&nbsp;</td>
  </tr>
</table>
""".strip()


# ---------------------------------------------------------------------------
# Calls to action
# ---------------------------------------------------------------------------


def cta_button(label: str, href: str) -> str:
    """Primary CTA - large dark button, full-width on mobile.

    Uses MSO conditional comments so Outlook classic renders the button as
    a proper VML shape instead of a broken hyperlink.
    """
    safe_label = escape(label)
    safe_href = escape(href, quote=True)
    return f"""
<table role="presentation" cellpadding="0" cellspacing="0"
       style="margin:{t.SPACE_LG} 0;">
  <tr>
    <td align="center" style="border-radius:{t.RADIUS_SM};background:{t.INK_900};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                   xmlns:w="urn:schemas-microsoft-com:office:word"
                   href="{safe_href}" style="height:48px;v-text-anchor:middle;
                   width:280px;" arcsize="12%" stroke="f" fillcolor="{t.INK_900}">
        <w:anchorlock/>
        <center style="color:{t.PAPER};font-family:{t.FONT_BODY};font-size:15px;
                       font-weight:700;">{safe_label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="{safe_href}"
         style="display:inline-block;background:{t.INK_900};color:{t.PAPER};
                font-family:{t.FONT_BODY};font-size:{t.TYPE_BODY_SIZE};
                font-weight:{t.WEIGHT_BOLD};line-height:1;text-decoration:none;
                padding:14px 32px;border-radius:{t.RADIUS_SM};
                mso-padding-alt:0;text-align:center;">
        {safe_label}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>
""".strip()


# ---------------------------------------------------------------------------
# Data blocks
# ---------------------------------------------------------------------------


def metadata_card(rows: list[tuple[str, str]]) -> str:
    """Rendered key/value pairs in a bordered card.

    Use for application numbers, payment references, interview details.
    Each ``rows`` entry is ``(label, value)``. Values are HTML-escaped.
    """
    row_html = "".join(
        f"""
<tr>
  <td style="padding:10px 0;vertical-align:top;font-family:{t.FONT_BODY};
             font-size:{t.TYPE_LABEL_SIZE};line-height:{t.TYPE_LABEL_LINE};
             font-weight:{t.WEIGHT_SEMIBOLD};letter-spacing:1.2px;
             text-transform:uppercase;color:{t.INK_500};width:40%;">
    {escape(label)}
  </td>
  <td style="padding:10px 0;vertical-align:top;font-family:{t.FONT_BODY};
             font-size:{t.TYPE_BODY_SIZE};line-height:{t.TYPE_BODY_LINE};
             font-weight:{t.WEIGHT_SEMIBOLD};color:{t.INK_900};">
    {escape(value) if value else '&mdash;'}
  </td>
</tr>
""".strip()
        for label, value in rows
    )

    return f"""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background:{t.INK_50};border:1px solid {t.INK_100};
              border-radius:{t.RADIUS_MD};padding:{t.SPACE_LG};
              margin:0 0 {t.SPACE_LG} 0;">
  <tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        {row_html}
      </table>
    </td>
  </tr>
</table>
""".strip()


def notice_box(text: str, *, variant: str = "info") -> str:
    """Callout box for warnings, deadlines, and important notes.

    Variants: ``info`` (default), ``warning`` (gold), ``danger`` (red),
    ``success`` (green).
    """
    palette = {
        "info": (t.INK_50, t.INK_100, t.INK_900),
        "warning": ("#FDF6E3", "#F1D9A1", "#8A5B07"),
        "danger": ("#F7E4EA", "#E7B3C0", t.RED),
        "success": ("#E5F0E8", "#B4D4BA", t.GREEN),
    }
    bg, border, fg = palette.get(variant, palette["info"])
    return f"""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background:{bg};border:1px solid {border};
              border-radius:{t.RADIUS_MD};padding:{t.SPACE_MD} {t.SPACE_LG};
              margin:0 0 {t.SPACE_LG} 0;">
  <tr>
    <td style="font-family:{t.FONT_BODY};font-size:{t.TYPE_BODY_SIZE};
               line-height:{t.TYPE_BODY_LINE};color:{fg};">
      {text}
    </td>
  </tr>
</table>
""".strip()


# ---------------------------------------------------------------------------
# Signature and closing
# ---------------------------------------------------------------------------


def derive_division(program: str | None) -> str | None:
    """Map a program name to its originating school/division.

    Mirror of `deriveSignatoryDivision()` in
    `apps/admissions/src/lib/pdf/documents/AcceptanceLetter.tsx`. Matches the
    paper-form convention where the footer for a nursing acceptance reads
    "On behalf of … , School of Nursing".

    Returns None when no mapping is found - caller omits the division line.
    """
    if not program:
        return None
    lower = program.lower()
    if "nursing" in lower:
        return "School of Nursing"
    if "midwifery" in lower:
        return "School of Midwifery"
    if "clinical medicine" in lower or "medical" in lower:
        return "School of Clinical Medicine"
    if "pharmacy" in lower:
        return "School of Pharmacy"
    if "environmental health" in lower:
        return "School of Environmental Health"
    return None


def signature_block(
    name: str = "Beanola Admissions Office",
    role: str = "",
    postnominal: str = "",
    institution: str = "",
    division: str | None = None,
) -> str:
    """Closing signature block at the bottom of letter-style emails.

    Beanola is a multi-tenant platform, so the default signatory is the
    neutral "Beanola Admissions Office" — no school, person, or postnominal
    is assumed. Callers that send on behalf of a specific institution SHOULD
    pass explicit signatory context derived from the tenant/institution
    (``name``, ``role``, ``postnominal``, ``institution`` and, for nursing-style
    programmes, ``division="School of Nursing"``).

    The ``role``, ``institution`` and ``division`` rows render only when a
    value is supplied, so the brand-neutral default stays a clean single line.
    """
    display_name = f"{name}, {postnominal}" if postnominal else name
    role_row = (
        f'<div style="color:{t.INK_500};font-size:{t.TYPE_CAPTION_SIZE};'
        f'margin-top:{t.SPACE_XS};">{escape(role)}</div>'
        if role
        else ""
    )
    institution_row = (
        f'<div style="color:{t.INK_500};font-size:{t.TYPE_CAPTION_SIZE};">'
        f"{escape(institution)}</div>"
        if institution
        else ""
    )
    division_row = (
        f'<div style="color:{t.INK_500};font-size:{t.TYPE_CAPTION_SIZE};">'
        f"{escape(division)}</div>"
        if division
        else ""
    )
    return f"""
<table role="presentation" cellpadding="0" cellspacing="0"
       style="margin:{t.SPACE_XL} 0 0 0;">
  <tr>
    <td style="font-family:{t.FONT_BODY};font-size:{t.TYPE_BODY_SIZE};
               line-height:{t.TYPE_BODY_LINE};color:{t.INK_900};
               padding-top:{t.SPACE_LG};border-top:1px solid {t.INK_100};">
      <div style="font-weight:{t.WEIGHT_BOLD};">{escape(display_name)}</div>
      {role_row}
      {institution_row}
      {division_row}
    </td>
  </tr>
</table>
""".strip()


# ---------------------------------------------------------------------------
# Ordered lists (step-by-step instructions)
# ---------------------------------------------------------------------------


def ordered_list(items: list[str]) -> str:
    """Numbered list with gold accent numbers - matches PDF next-steps pattern."""
    row_html = "".join(
        f"""
<tr>
  <td valign="top" style="padding:6px 12px 6px 0;font-family:{t.FONT_BODY};
                         font-size:{t.TYPE_BODY_SIZE};line-height:{t.TYPE_BODY_LINE};
                         font-weight:{t.WEIGHT_BOLD};color:{t.GOLD};
                         white-space:nowrap;">
    {i + 1}.
  </td>
  <td valign="top" style="padding:6px 0;font-family:{t.FONT_BODY};
                         font-size:{t.TYPE_BODY_SIZE};line-height:{t.TYPE_BODY_LINE};
                         color:{t.INK_900};">
    {item}
  </td>
</tr>
""".strip()
        for i, item in enumerate(items)
    )
    return f"""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="margin:0 0 {t.SPACE_LG} 0;">
  {row_html}
</table>
""".strip()


# ---------------------------------------------------------------------------
# Plain-text rendering helpers
# ---------------------------------------------------------------------------


def to_plain_text(html: str) -> str:
    """Strip HTML tags and collapse whitespace for a plain-text fallback.

    Not a full HTML-to-text converter - intentionally simple because our own
    components produce predictable markup.
    """
    import re
    from html import unescape

    # Drop <style> and <script> blocks entirely.
    html = re.sub(r"<(style|script)[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
    # Newline-equivalent tags.
    html = re.sub(r"<(br|tr|/p|/div|/table|/h[1-6])[^>]*>", "\n", html, flags=re.I)
    # Strip remaining tags.
    html = re.sub(r"<[^>]+>", "", html)
    # Decode HTML entities (e.g. &mdash; → -, &amp; → &)
    html = unescape(html)
    # Normalize whitespace.
    html = re.sub(r"[ \t]+", " ", html)
    html = re.sub(r" *\n *", "\n", html)
    html = re.sub(r"\n{3,}", "\n\n", html)
    return html.strip()
