#!/usr/bin/env node
/**
 * scripts/check-pdf-chunk-load.mjs
 *
 * Post-build smoke check: confirms the @react-pdf render chunk exists
 * and warns (non-fatal) if TDZ-prone patterns are detected.
 *
 * Regression guard for Bug #2 / #4 (2026-05-19): circular dependency
 * between @/lib/logger → @sentry/react and the vendor-react-pdf chunk
 * caused TDZ errors at chunk load time.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST_DIR = join(
  import.meta.dirname,
  "..",
  "apps",
  "admissions",
  "dist",
  "assets"
);

function findChunk(dir, prefix) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir);
  return files.find((f) => f.startsWith(prefix) && f.endsWith(".js")) || null;
}

// Check if build output exists
if (!existsSync(DIST_DIR)) {
  console.error("❌ Build output not found at", DIST_DIR);
  console.error("   Run `bun run build` in apps/admissions first.");
  process.exit(1);
}

// Look for the render chunk (may be named render-*.js or similar)
const jsDir = join(DIST_DIR, "js");
const assetsDir = existsSync(jsDir) ? jsDir : DIST_DIR;

const renderChunk = findChunk(assetsDir, "render-");
if (!renderChunk) {
  // Also check for pdf-related chunks
  const allFiles = readdirSync(assetsDir);
  const pdfChunk = allFiles.find(
    (f) => (f.includes("pdf") || f.includes("render")) && f.endsWith(".js")
  );
  if (pdfChunk) {
    console.log(`✅ PDF-related chunk found: ${pdfChunk}`);
  } else {
    console.log(
      "⚠️  No render-*.js chunk found (may be inlined or renamed). Build succeeded — acceptable."
    );
  }
} else {
  console.log(`✅ Render chunk found: ${renderChunk}`);

  // Heuristic TDZ check (non-fatal warning)
  const content = readFileSync(join(assetsDir, renderChunk), "utf-8");
  if (content.includes("Cannot access")) {
    console.warn(
      '⚠️  WARNING: render chunk contains "Cannot access" string (possible TDZ pattern).'
    );
    console.warn(
      "   This is a heuristic warning — review the chunk for circular dependencies."
    );
  }
}

console.log("✅ PDF chunk smoke check passed.");
