"""Simple-letter layout: letterhead, detail rows, wrapped body, signature.

Shared reportlab drawing for the application-slip / acceptance-letter /
conditional-offer / receipt documents that do not need a fee table. Reuses the
generator's ``_draw_asset`` / ``_draw_wrapped`` / ``_safe_hex`` /
``_document_details`` helpers (no behavior fork) and returns the per-asset
render-status pair for the provenance snapshot (R6.7).

All profile-derived text is HTML-escaped by the caller before it reaches the
layout (defense in depth, R8.6); the layout itself only draws strings.
"""

from __future__ import annotations

import io
from typing import Any


def render_simple_letter(
    *,
    document_title: str,
    tenant: dict[str, Any],
    application,
    payment,
    body: str,
    signatory: str,
    logo_asset,
    signature_asset,
    template_version=None,
    extra_blocks=None,
):
    """Render a single-column letter PDF.

    ``extra_blocks`` is an optional callable ``(c, x, y, width) -> y`` drawn
    after the body (used by the fee-chart layout to add the fee table + bank
    block). Returns ``(buffer, logo_render, signature_render)``.
    """
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.pdfgen import canvas

    from apps.applications.tasks.pdf_generation import (
        _document_details,
        _draw_asset,
        _draw_wrapped,
        _safe_hex,
    )
    from django.utils import timezone

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    primary = _safe_hex(tenant["primary_color"])

    c.setFillColor(primary)
    c.rect(0, height - 1.2 * cm, width, 1.2 * cm, fill=True, stroke=False)
    c.setFillColor(HexColor("#111827"))
    logo_render = _draw_asset(
        c, logo_asset, 2 * cm, height - 3.2 * cm, max_width=3.2 * cm, max_height=1.7 * cm
    )

    c.setFont("Helvetica-Bold", 17)
    c.drawCentredString(width / 2, height - 2.25 * cm, document_title)
    c.setFont("Helvetica", 10)
    c.drawCentredString(width / 2, height - 2.85 * cm, tenant["name"])
    contact = " | ".join(
        v for v in [tenant.get("admissions_email"), tenant.get("phone"), tenant.get("website")] if v
    )
    if contact:
        c.drawCentredString(width / 2, height - 3.35 * cm, contact)

    y = height - 4.6 * cm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(2 * cm, y, f"Generated: {timezone.now().strftime('%d %B %Y')}")
    y -= 0.7 * cm

    for label, value in _document_details(application, payment):
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(2 * cm, y, f"{label}:")
        c.setFont("Helvetica", 9.5)
        c.drawString(6 * cm, y, str(value or "N/A"))
        y -= 0.55 * cm

    y -= 0.55 * cm
    c.setFont("Helvetica", 10.5)
    y = _draw_wrapped(c, str(body), 2 * cm, y, width - 4 * cm, line_height=0.55 * cm)

    if extra_blocks is not None:
        y = extra_blocks(c, 2 * cm, y, width - 4 * cm)

    if y < 5 * cm:
        c.showPage()
        y = height - 2.5 * cm

    signature_render = _draw_asset(
        c, signature_asset, 2 * cm, y - 1.6 * cm, max_width=4 * cm, max_height=1.4 * cm
    )
    c.line(2 * cm, y - 1.9 * cm, 7 * cm, y - 1.9 * cm)
    c.setFont("Helvetica", 9)
    c.drawString(2 * cm, y - 2.35 * cm, signatory or "Admissions Office")

    c.setFont("Helvetica", 7.5)
    c.setFillColor(HexColor("#6B7280"))
    footer = "Official Beanola admissions document"
    if template_version:
        footer += f" | Template v{template_version}"
    c.drawCentredString(width / 2, 1.3 * cm, footer)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer, logo_render, signature_render
