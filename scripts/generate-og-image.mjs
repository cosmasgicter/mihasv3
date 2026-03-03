#!/usr/bin/env node
/**
 * Generate OG image (1200x630px) for social media meta tags.
 * Uses sharp to create a branded PNG with MIHAS identity.
 *
 * Usage: bun run scripts/generate-og-image.mjs
 * Output: public/images/og-image.png
 */
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'public', 'images', 'og-image.png');

const WIDTH = 1200;
const HEIGHT = 630;

// MIHAS brand colors
const PRIMARY = '#2563eb';
const PRIMARY_DARK = '#1d4ed8';
const WHITE = '#ffffff';

// SVG template for the OG image
const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${PRIMARY_DARK};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${PRIMARY};stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${WHITE};stop-opacity:0.15" />
      <stop offset="100%" style="stop-color:${WHITE};stop-opacity:0.05" />
    </linearGradient>
  </defs>

  <!-- Background gradient -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />

  <!-- Decorative elements -->
  <circle cx="1050" cy="100" r="200" fill="url(#accent)" />
  <circle cx="150" cy="530" r="150" fill="url(#accent)" />
  <rect x="0" y="590" width="${WIDTH}" height="40" fill="${WHITE}" opacity="0.1" />

  <!-- Medical cross icon -->
  <g transform="translate(100, 180)">
    <rect x="30" y="0" width="40" height="100" rx="8" fill="${WHITE}" opacity="0.9" />
    <rect x="0" y="30" width="100" height="40" rx="8" fill="${WHITE}" opacity="0.9" />
  </g>

  <!-- Institution name -->
  <text x="240" y="210" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="bold" fill="${WHITE}">
    Mukuba Institute of
  </text>
  <text x="240" y="270" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="bold" fill="${WHITE}">
    Health &amp; Allied Sciences
  </text>

  <!-- Divider line -->
  <rect x="240" y="300" width="120" height="4" rx="2" fill="${WHITE}" opacity="0.6" />

  <!-- Subtitle -->
  <text x="240" y="360" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${WHITE}" opacity="0.9">
    Online Admissions Portal
  </text>

  <!-- Programs text -->
  <text x="240" y="420" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${WHITE}" opacity="0.7">
    Nursing · Clinical Medicine · Allied Health Programs
  </text>

  <!-- Domain -->
  <text x="240" y="480" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${WHITE}" opacity="0.5">
    apply.mihas.edu.zm
  </text>
</svg>`;

async function generate() {
  try {
    await sharp(Buffer.from(svg))
      .png({ quality: 90, compressionLevel: 6 })
      .toFile(outputPath);

    console.log(`✓ OG image generated: ${outputPath} (${WIDTH}x${HEIGHT}px)`);
  } catch (error) {
    console.error('Failed to generate OG image:', error.message);
    process.exit(1);
  }
}

generate();
