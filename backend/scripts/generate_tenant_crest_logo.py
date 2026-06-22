#!/usr/bin/env python3
"""Generate a dignified institutional crest logo PNG for a Beanola tenant school.

A reusable onboarding helper: produces a transparent-background PNG crest that
the backend reportlab document renderer can rasterise (PNG/JPEG/WebP only — it
cannot rasterise SVG). Upload the result via the Tenant Onboarding → Assets tab
(or register it as an ``InstitutionAsset`` of type ``logo``).

Design rationale (design-for-ai / ai-tells.md):
- Academic-seal idiom (concentric roundel + serif monogram + arced name): a
  purposeful institutional form, not a generic "app icon".
- Brand serif (Playfair Display, the PDF heading face) so the crest and the
  document letterhead share one type voice.
- Solid brand colour + thin keyline rings. No gradients, glassmorphism, drop
  shadows, or emoji — the AI tells the skill says to avoid.

Usage:
    python scripts/generate_tenant_crest_logo.py \
        --monogram K --color "#1D4ED8" \
        --top "KALULUSHI TRAINING CENTRE" --bottom "EST. ZAMBIA" \
        --out /tmp/katc-logo.png
"""
from __future__ import annotations

import argparse
import math
import os

from PIL import Image, ImageDraw, ImageFont

# Resolve fonts relative to the repo root (this file lives in backend/scripts/).
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FONT_SERIF = os.path.join(_REPO_ROOT, "apps/admissions/src/lib/pdf/assets/fonts/playfair-display-v40-latin-700.ttf")
FONT_SANS = os.path.join(_REPO_ROOT, "apps/admissions/src/lib/pdf/assets/fonts/source-sans-3-v19-latin-600.ttf")

SIZE = 1024
INK = (17, 24, 39)  # slate-900 arced text


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = value.lstrip("#")
    return tuple(int(v[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _draw_arc_text(draw, image, center, radius, text, font, fill, *, top=True):
    cx, cy = center
    char_count = max(len(text), 1)
    span = min(math.radians(9) * char_count, math.radians(200))
    start = -math.pi / 2 - span / 2 if top else math.pi / 2 + span / 2
    step = span / char_count
    for i, ch in enumerate(text):
        ang = start + step * (i + 0.5) if top else start - step * (i + 0.5)
        x = cx + radius * math.cos(ang)
        y = cy + radius * math.sin(ang)
        bbox = font.getbbox(ch)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        glyph = Image.new("RGBA", (w + 8, h + 8), (0, 0, 0, 0))
        ImageDraw.Draw(glyph).text((4 - bbox[0], 4 - bbox[1]), ch, font=font, fill=fill)
        rot_deg = math.degrees(ang) + (90 if top else -90)
        glyph = glyph.rotate(-rot_deg, expand=True, resample=Image.BICUBIC)
        image.paste(glyph, (int(x - glyph.width / 2), int(y - glyph.height / 2)), glyph)


def build(monogram: str, color: tuple[int, int, int], top_text: str, bottom_text: str) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = SIZE / 2

    d.ellipse([40, 40, SIZE - 40, SIZE - 40], outline=color, width=10)
    d.ellipse([88, 88, SIZE - 88, SIZE - 88], outline=color, width=4)
    pad = 150
    d.ellipse([pad, pad, SIZE - pad, SIZE - pad], fill=color)

    mono_font = ImageFont.truetype(FONT_SERIF, 360)
    bb = d.textbbox((0, 0), monogram, font=mono_font)
    d.text(
        (cx - (bb[2] - bb[0]) / 2 - bb[0], cy - (bb[3] - bb[1]) / 2 - bb[1] - 10),
        monogram, font=mono_font, fill=(255, 255, 255),
    )

    ring_font = ImageFont.truetype(FONT_SANS, 46)
    sub_font = ImageFont.truetype(FONT_SANS, 40)
    if top_text:
        _draw_arc_text(d, img, (cx, cy), (SIZE / 2) - 66, top_text, ring_font, INK, top=True)
    if bottom_text:
        _draw_arc_text(d, img, (cx, cy), (SIZE / 2) - 66, bottom_text, sub_font, INK, top=False)
    return img


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a tenant crest logo PNG.")
    parser.add_argument("--monogram", required=True, help="One- or two-letter crest monogram, e.g. K")
    parser.add_argument("--color", required=True, help="Brand primary colour hex, e.g. #1D4ED8")
    parser.add_argument("--top", default="", help="Arced top text (institution name)")
    parser.add_argument("--bottom", default="", help="Arced bottom text (tagline/established)")
    parser.add_argument("--out", required=True, help="Output PNG path")
    args = parser.parse_args()

    img = build(args.monogram.strip(), _hex_to_rgb(args.color), args.top.strip().upper(), args.bottom.strip().upper())
    img.save(args.out, "PNG")
    print(f"wrote {args.out} ({img.width}x{img.height})")


if __name__ == "__main__":
    main()
