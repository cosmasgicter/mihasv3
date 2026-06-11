"""Fee-chart letter layout: simple letter + fee table + bank-account block.

Used by the acceptance-letter / conditional-offer renderers when the resolved
profile carries a ``fee_chart`` and/or ``bank_accounts``. Builds the extra
blocks purely from the resolved profile data (already HTML-escaped by the
renderer) and delegates the surrounding letter to ``render_simple_letter`` so
the letterhead/body/signature drawing stays in one place (R8.3).
"""

from __future__ import annotations

from typing import Any

from .simple_letter import render_simple_letter


def render_fee_chart_letter(
    *,
    document_title: str,
    tenant: dict[str, Any],
    application,
    payment,
    body: str,
    signatory: str,
    logo_asset,
    signature_asset,
    fee_chart: list,
    bank_accounts: list,
    requirements: list,
    template_version=None,
):
    """Render a letter with a fee chart, bank-account block, and requirements.

    ``fee_chart`` / ``bank_accounts`` / ``requirements`` are the validated,
    HTML-escaped rows from the resolved profile. Returns
    ``(buffer, logo_render, signature_render)``.
    """
    from reportlab.lib.units import cm

    from apps.applications.tasks.pdf_generation import _draw_wrapped

    def _extra_blocks(c, x, y, width):
        # Fee chart -----------------------------------------------------------
        if fee_chart:
            y -= 0.4 * cm
            c.setFont("Helvetica-Bold", 10.5)
            c.drawString(x, y, "Fee Schedule")
            y -= 0.55 * cm
            c.setFont("Helvetica", 9.5)
            for row in fee_chart:
                if not isinstance(row, dict):
                    continue
                item = str(row.get("item", ""))
                amount = row.get("amount", "")
                cadence = str(row.get("cadence", "") or "")
                label = f"{item}" + (f" ({cadence})" if cadence else "")
                c.drawString(x, y, label[:80])
                c.drawRightString(x + width, y, str(amount))
                y -= 0.5 * cm
                if y < 4 * cm:
                    c.showPage()
                    y = 26 * cm

        # Bank accounts -------------------------------------------------------
        if bank_accounts:
            y -= 0.4 * cm
            c.setFont("Helvetica-Bold", 10.5)
            c.drawString(x, y, "Payment / Bank Details")
            y -= 0.55 * cm
            c.setFont("Helvetica", 9.5)
            for row in bank_accounts:
                if not isinstance(row, dict):
                    continue
                parts = [
                    str(row.get("bank_name", "") or ""),
                    str(row.get("account_name", "") or ""),
                    str(row.get("account_number", "") or ""),
                    str(row.get("branch", "") or ""),
                ]
                line = " — ".join(p for p in parts if p)
                y = _draw_wrapped(c, line, x, y, width, line_height=0.5 * cm)
                if y < 4 * cm:
                    c.showPage()
                    y = 26 * cm

        # Requirements --------------------------------------------------------
        if requirements:
            y -= 0.4 * cm
            c.setFont("Helvetica-Bold", 10.5)
            c.drawString(x, y, "Requirements")
            y -= 0.55 * cm
            c.setFont("Helvetica", 9.5)
            for item in requirements:
                y = _draw_wrapped(c, f"• {item}", x, y, width, line_height=0.5 * cm)
                if y < 4 * cm:
                    c.showPage()
                    y = 26 * cm
        return y

    return render_simple_letter(
        document_title=document_title,
        tenant=tenant,
        application=application,
        payment=payment,
        body=body,
        signatory=signatory,
        logo_asset=logo_asset,
        signature_asset=signature_asset,
        template_version=template_version,
        extra_blocks=_extra_blocks,
    )
