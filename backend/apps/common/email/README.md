# MIHAS-KATC Email Component System

Transactional emails are built from a small set of Python components that
share design tokens with the PDF document system. Render one through the
dispatcher and pass the result to the email queue.

```python
from apps.common.email.render import render_message

subject, html, text = render_message("application_submitted", {
    "student_name": "Bwalya Chanda",
    "application_number": "APP-20260510-ABCD1234",
    "tracking_code": "TRK-ABC123",
    "program_name": "Diploma in Registered Nursing",
    "intake_name": "January 2027",
})

# html is a full <!DOCTYPE html> document wrapped in the institutional shell.
# text is the plain-text fallback for clients that can't render HTML.
```

---

## Directory layout

```
backend/apps/common/email/
├── __init__.py           # package marker; exposes tokens/components/shell
├── tokens.py             # colors, fonts, spacing — mirror of PDF theme
├── components.py         # paragraph, section_heading, metadata_card, notice_box,
│                         #   cta_button (with MSO VML fallback), signature_block,
│                         #   ordered_list, divider, to_plain_text
├── shell.py              # render_shell(content, title, preheader) — institutional shell
├── messages/             # one file per message type
│   ├── application_submitted.py
│   ├── payment_received.py       # ZMW/USD aware
│   ├── interview_scheduled.py
│   ├── acceptance.py
│   ├── conditional_acceptance.py # handles 0..N conditions with deadlines
│   ├── rejection.py              # warm, brief; optional reviewer_note
│   └── password_reset.py         # time-bounded link with security reassurance
└── render.py             # top-level dispatcher — render_message(type, context)
```

---

## Components

Import through `apps.common.email.components`. Every component returns a
raw HTML string — compose them by joining with `"\n"`.

| Component | Purpose |
|-----------|---------|
| `paragraph(text, muted=False)` | Standard body paragraph. |
| `section_heading(text)` | Serif semibold heading — equivalent to PDF `SectionHeading`. |
| `metadata_card(rows)` | Bordered card of label/value pairs. Empty values render as `—`. |
| `notice_box(text, variant=)` | Callout box. Variants: `info`, `warning`, `danger`, `success`. |
| `cta_button(label, href)` | Primary dark CTA with Outlook VML fallback. |
| `ordered_list(items)` | Numbered list with gold accent numbers. |
| `signature_block(name?, role?, postnominal?, institution?, division?)` | Closing signature; defaults to Dr Solomon Musonda, MD — Managing Director. Pass `division="School of Nursing"` (or use `derive_division(program)`) to add a school line. |
| `derive_division(program)` | Map a program name to its school ("Nursing" → "School of Nursing", etc). Returns `None` for unmapped programs. |
| `divider()` | Thin hairline rule (table-based for Outlook compatibility). |
| `to_plain_text(html)` | Strip tags for the plain-text multipart fallback. |

All components HTML-escape user input automatically.

---

## Design tokens

Shared with the PDF system so emails and PDFs look like they come from the
same institution:

| Token | Value | Use |
|-------|-------|-----|
| `INK_900` | `#0B1F3A` | primary text |
| `INK_700` | `#1D3557` | section headings |
| `INK_500` | `#5C6B7A` | metadata labels |
| `INK_300` | `#B8C3CF` | hairlines |
| `INK_50`  | `#F3F6FA` | subtle surfaces |
| `GOLD`    | `#B8860B` | one decorative accent |
| `GREEN`   | `#2F6B3A` | success / paid |
| `RED`     | `#8B1E3F` | danger |
| `FONT_DISPLAY` | `Georgia, 'Times New Roman', serif` | display text in HTML |
| `FONT_BODY` | `Arial, Helvetica, sans-serif` | body in HTML |

The PDF system uses Playfair Display + Source Sans 3, but mail clients
(especially Outlook classic) can't render custom web fonts reliably — so
emails use the web-safe Georgia/Arial stack. Visual identity is preserved
through matched color palette and rhythm.

---

## Adding a new message type

1. Create `backend/apps/common/email/messages/my_message.py` with a single
   `render(context)` function returning `(subject, body_html)`:

```python
from html import escape
from apps.common.email.components import paragraph, section_heading, signature_block


def render(context: dict) -> tuple[str, str]:
    student = escape(context.get("student_name") or "Applicant")
    subject = f"My new message — {context.get('application_number', '—')}"
    body = "\n".join([
        paragraph(f"Dear {student},"),
        section_heading("Important information"),
        paragraph("…"),
        signature_block(),
    ])
    return subject, body
```

2. Register it in `backend/apps/common/email/render.py` by importing the
   module and adding `"my_message": my_message.render` to `_REGISTRY`.
3. Add a unit test in `backend/tests/unit/test_email_messages.py` that
   exercises the new template through `render_message()`.

---

## Outlook compatibility

The shell uses table-based layout and MSO conditional comments in specific
places:

- `cta_button()` includes a VML `<v:roundrect>` fallback so Outlook classic
  renders a real button rather than a broken link.
- Rounded corners on the shell (`border-radius: 28px`) degrade gracefully
  to square corners in Outlook — no workaround needed.
- Gradients in the hero header degrade to the first color stop in clients
  without gradient support.

---

## Plain-text fallback

`render_message()` always returns a `text` field derived from the HTML via
`to_plain_text()`. Email queues should attach both HTML and plain-text parts
to every outbound email.

---

## Testing

Tests live at `backend/tests/unit/`:

- `test_email_component_system.py` — tokens, components, shell structure,
  HTML escaping for XSS safety, Outlook VML presence.
- `test_email_messages.py` — per-message content, currency variants,
  conditions-list stress, dispatcher coverage.

Run with:

```bash
python -m pytest backend/tests/unit/test_email_component_system.py \
                 backend/tests/unit/test_email_messages.py
```

No Django or DB access required — these tests are pure Python.

---

## Migration history

This system replaced the inline HTML in `backend/apps/common/email_templates.py`
and the monolithic `CommunicationService.render_template()` path. The old
module is preserved as a thin re-export shim for one release; it will be
removed once all callers migrate to the dispatcher.

`communication_templates` database table remains authoritative for per-intake
subject lines and copy overrides. The component system handles structure,
tokens, and HTML rendering.
