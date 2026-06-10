"""Payment received - sent after a student's payment is verified."""

from decimal import Decimal, InvalidOperation
from html import escape

from apps.common.email.components import (
    cta_button,
    metadata_card,
    notice_box,
    paragraph,
    section_heading,
    signature_block,
)


_CURRENCY_SYMBOL = {
    "ZMW": "K",
    "USD": "$",
}


def _format_amount(raw_amount, currency: str) -> str:
    """Format a raw amount as a locale-correct money string.

    Mirrors the PDF currency formatter (src/lib/pdf/currency.ts). Uses
    Decimal for deterministic rounding - banker's float rounding caused
    occasional off-by-a-cent drift on receipts that function as legal
    records. Falls back to a placeholder on bad input so the email still
    renders.
    """
    symbol = _CURRENCY_SYMBOL.get(currency, "")
    try:
        value = Decimal(str(raw_amount))
    except (InvalidOperation, TypeError, ValueError):
        return f"{symbol}0.00 {currency}"
    # Quantise to 2 decimal places with ROUND_HALF_UP - the financially
    # conventional rounding mode.
    from decimal import ROUND_HALF_UP
    quantised = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    # Thousand separators + always two decimals
    numeric = f"{quantised:,.2f}"
    return f"{symbol}{numeric} {currency}"


def render(context: dict) -> tuple[str, str]:
    """Render the payment-received email.

    Expects context keys:
        student_name, application_number, receipt_number, amount, currency,
        payment_method, portal_url
    """
    student = escape(context.get("student_name") or "Applicant")
    app_no = context.get("application_number") or "—"
    receipt_no = context.get("receipt_number") or "—"
    raw_amount = context.get("amount")
    currency = context.get("currency") or "ZMW"
    method = context.get("payment_method") or "—"
    portal = context.get("portal_url") or "https://apply.beanola.com"

    amount_label = _format_amount(raw_amount, currency) if raw_amount not in (None, "") else f"— {currency}"

    subject = f"Payment confirmed — {receipt_no}"

    body = "\n".join(
        [
            paragraph(f"Dear {student},"),
            paragraph(
                "Your payment has been received and verified. Your application "
                "is now fully submitted and awaiting review."
            ),
            notice_box(
                f"<strong>{amount_label}</strong> received via {escape(method)}",
                variant="success",
            ),
            section_heading("Payment details"),
            metadata_card(
                [
                    ("Receipt Number", receipt_no),
                    ("Application Number", app_no),
                    ("Amount Received", amount_label),
                    ("Payment Method", method),
                ]
            ),
            paragraph(
                "Your official receipt is available for download from the "
                "payments page in the portal. Keep it for your records."
            ),
            cta_button("Download your receipt", portal + "/student/payment"),
            signature_block(),
        ]
    )

    return subject, body
