#!/usr/bin/env bun
/**
 * Entry-chunk size & content guard.
 *
 * Purpose
 * -------
 * After the Phase A first-paint work, the admissions app's entry chunk
 * (the first JS file the browser evaluates) has a direct, linear effect
 * on mobile FCP. A single merge that accidentally pulls @react-pdf,
 * tesseract.js, recharts, jspdf, or pdf-lib into the entry bundle can
 * regress first paint by seconds. This script runs post-build and fails
 * CI if that happens.
 *
 * What it does
 * ------------
 *   1. Parses dist/index.html for the <script type="module" src="/assets/js/index-*.js">
 *      and any <link rel="modulepreload">. These are the files a cold
 *      browser evaluates before FCP.
 *   2. For each such file:
 *        a. Measures raw + gzipped size.
 *        b. Scans for substring markers of libraries that must never be
 *           on the critical path.
 *   3. Reports gzipped-size totals.
 *   4. Exits non-zero on any violation.
 *
 * Budgets (tuned to the May 2026 baseline — see docs/adrs/ADR-008):
 *   • Individual entry chunk: hard fail > 500 KB gzipped
 *                              warn    > 250 KB gzipped
 *   • Sum of entry + preloaded chunks: hard fail > 700 KB gzipped
 *
 * Forbidden libraries on entry (should always be lazy-loaded):
 *   @react-pdf, tesseract, recharts, jspdf, pdf-lib, html2canvas, UPNG
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const DIST_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../dist',
)
const INDEX_HTML = path.join(DIST_DIR, 'index.html')

const BUDGETS = {
  singleChunkHardKb: 500,
  singleChunkWarnKb: 250,
  totalEntryHardKb: 700,
}

/**
 * Libraries that have no legitimate reason to appear in the entry
 * critical path. The string markers are deliberately generic so they
 * survive bundler renaming.
 */
const FORBIDDEN_MARKERS: Array<{
  name: string
  markers: string[]
}> = [
  {
    name: '@react-pdf/renderer',
    markers: ['@react-pdf/renderer', 'yoga.wasm', 'react-pdf-core'],
  },
  {
    name: 'tesseract.js',
    markers: ['tesseract-core', 'tesseract.js', 'createWorker'],
  },
  { name: 'recharts', markers: ['recharts', 'Recharts'] },
  { name: 'jspdf', markers: ['jsPDF', 'jspdf'] },
  { name: 'pdf-lib', markers: ['pdf-lib', 'PDFDocument'] },
  { name: 'html2canvas', markers: ['html2canvas'] },
]

interface ChunkReport {
  file: string
  rawBytes: number
  gzBytes: number
  forbiddenHits: string[]
}

function byteHuman(n: number): string {
  return (n / 1024).toFixed(1) + ' KB'
}

function gzippedSize(filepath: string): number {
  const raw = fs.readFileSync(filepath)
  return zlib.gzipSync(raw, { level: 9 }).length
}

function readEntryFiles(): string[] {
  if (!fs.existsSync(INDEX_HTML)) {
    throw new Error(
      `dist/index.html not found. Run \`bun run build\` before this script.`,
    )
  }
  const html = fs.readFileSync(INDEX_HTML, 'utf8')
  const scriptMatch = /<script[^>]+type="module"[^>]+src="(\/assets\/js\/[^"]+)"/.exec(
    html,
  )
  const preloads = Array.from(
    html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="(\/assets\/js\/[^"]+)"/g),
  ).map((m) => m[1]!)
  const all = [scriptMatch?.[1], ...preloads].filter(
    (x): x is string => Boolean(x),
  )
  return [...new Set(all)]
}

function scanChunk(urlPath: string): ChunkReport {
  const abs = path.join(DIST_DIR, urlPath.replace(/^\//, ''))
  const content = fs.readFileSync(abs, 'utf8')
  const rawBytes = Buffer.byteLength(content)
  const gzBytes = gzippedSize(abs)
  const forbiddenHits: string[] = []
  for (const { name, markers } of FORBIDDEN_MARKERS) {
    if (markers.some((m) => content.includes(m))) {
      forbiddenHits.push(name)
    }
  }
  return { file: urlPath, rawBytes, gzBytes, forbiddenHits }
}

function main(): void {
  const entries = readEntryFiles()
  if (entries.length === 0) {
    console.error('✗ No entry chunks found in dist/index.html — nothing to check.')
    process.exit(1)
  }

  const reports = entries.map(scanChunk)
  let hardFail = false
  let warned = false

  console.log(`Entry + preloaded chunks (${reports.length}):\n`)
  for (const r of reports) {
    const size = `${byteHuman(r.rawBytes)} raw / ${byteHuman(r.gzBytes)} gz`
    let tag = '✓'
    if (r.gzBytes > BUDGETS.singleChunkHardKb * 1024) {
      tag = '✗'
      hardFail = true
    } else if (r.gzBytes > BUDGETS.singleChunkWarnKb * 1024) {
      tag = '!'
      warned = true
    }
    console.log(`  ${tag} ${r.file}`)
    console.log(`    ${size}`)
    if (r.forbiddenHits.length > 0) {
      console.log(
        `    ✗ forbidden on entry path: ${r.forbiddenHits.join(', ')}`,
      )
      hardFail = true
    }
  }

  const totalGz = reports.reduce((a, r) => a + r.gzBytes, 0)
  console.log(`\nTotal entry path (gzipped): ${byteHuman(totalGz)}`)

  if (totalGz > BUDGETS.totalEntryHardKb * 1024) {
    console.log(
      `✗ exceeds budget of ${BUDGETS.totalEntryHardKb} KB gzipped`,
    )
    hardFail = true
  } else if (warned) {
    console.log(
      `! one or more chunks exceed ${BUDGETS.singleChunkWarnKb} KB gzipped — consider further splitting`,
    )
  }

  if (hardFail) {
    console.error('\nBuild guard FAILED — see violations above.')
    process.exit(1)
  }

  console.log('\n✓ entry-chunk guard passed.')
}

main()
