"""Design tokens for MIHAS-KATC outbound emails.

Mirror of ``apps/admissions/src/lib/pdf/theme`` - identical palette, typography
scale, and spacing units - so that emails and PDFs feel like they come from
the same institution.

Email tokens are strings rather than typed objects because every style
eventually ends up in an ``style="..."`` attribute in HTML.

PDF ↔ Email font mapping:
    Playfair Display (PDF display)  → Georgia (email display)
    Source Sans 3 (PDF body)        → Arial (email body)
    JetBrains Mono (PDF mono)       → Courier New (email mono)

The color palette is shared verbatim - no mapping needed.
"""

# ---------------------------------------------------------------------------
# Color tokens
# ---------------------------------------------------------------------------

# Ink scale - restrained, institutional
INK_900 = "#0B1F3A"  # primary text, document titles
INK_700 = "#1D3557"  # section headings, strong labels
INK_500 = "#5C6B7A"  # metadata labels, tertiary text
INK_300 = "#B8C3CF"  # hairlines, quiet dividers
INK_100 = "#DFE6EE"  # border on cards
INK_50 = "#F3F6FA"   # subtle surface

PAPER = "#FFFFFF"

# Accent colors - used sparingly, one per message
GOLD = "#B8860B"
GREEN = "#2F6B3A"
RED = "#8B1E3F"

# Hero gradient (same family as PDF ink-900 but with a slight warm shift for email)
HERO_GRADIENT_START = "#10233f"
HERO_GRADIENT_MID = "#15345d"
HERO_GRADIENT_END = "#1e4f86"

# ---------------------------------------------------------------------------
# Typography tokens
# ---------------------------------------------------------------------------

# Web-safe serif for display (mail clients render Playfair Display unreliably)
FONT_DISPLAY = "Georgia, 'Times New Roman', serif"

# Web-safe sans-serif for body (Arial works across every client)
FONT_BODY = "Arial, Helvetica, sans-serif"

# Monospace for reference codes
FONT_MONO = "'Courier New', Consolas, monospace"

# Type-scale - in pixels (email clients use px, not pt)
TYPE_DISPLAY_SIZE = "30px"
TYPE_DISPLAY_LINE = "1.15"
TYPE_TITLE_SIZE = "22px"
TYPE_TITLE_LINE = "1.2"
TYPE_HEADING_SIZE = "18px"
TYPE_HEADING_LINE = "1.3"
TYPE_BODY_SIZE = "15px"
TYPE_BODY_LINE = "1.7"
TYPE_LABEL_SIZE = "11px"
TYPE_LABEL_LINE = "1.4"
TYPE_CAPTION_SIZE = "12px"
TYPE_CAPTION_LINE = "1.5"

# Weight constants - mail clients only reliably render 400, 600, 700
WEIGHT_REGULAR = "400"
WEIGHT_SEMIBOLD = "600"
WEIGHT_BOLD = "700"

# ---------------------------------------------------------------------------
# Spacing tokens (email-appropriate; px-based)
# ---------------------------------------------------------------------------

SPACE_XS = "4px"
SPACE_SM = "8px"
SPACE_MD = "16px"
SPACE_LG = "24px"
SPACE_XL = "32px"
SPACE_2XL = "48px"

# Card paddings - tuned for Outlook, which adds its own 2-3px to all padding
CARD_PADDING_X = "26px"
CARD_PADDING_Y = "28px"
SHELL_PADDING_X = "40px"
SHELL_PADDING_Y = "22px"

# Radius - email clients vary widely in rounded-corner support.
# Gmail and Apple Mail render; Outlook classic silently ignores.
RADIUS_SM = "6px"
RADIUS_MD = "14px"
RADIUS_LG = "22px"
RADIUS_XL = "28px"

# Hairline divider width
BORDER_HAIRLINE = "1px"

# Shell max width (mobile & desktop)
SHELL_MAX_WIDTH = 640
