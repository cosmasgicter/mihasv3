#!/usr/bin/env node

import sharp from 'sharp'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const publicDir = join(projectRoot, 'public')
const iconsDir = join(publicDir, 'icons')
const screenshotsDir = join(publicDir, 'screenshots')

const BRAND = {
  ink: '#081225',
  navy: '#0f172a',
  blue: '#1d4ed8',
  cyan: '#22d3ee',
  slate: '#64748b',
  paper: '#f8fafc',
  white: '#ffffff',
  border: '#dbe4f0',
  success: '#16a34a',
  warning: '#d97706',
}

async function ensureDirectories() {
  await mkdir(iconsDir, { recursive: true })
  await mkdir(screenshotsDir, { recursive: true })
}

async function rasterizeIcon(sourceName, outputName, size) {
  const source = await readFile(join(iconsDir, sourceName))
  await sharp(source)
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(join(iconsDir, outputName))
}

function createWideScreenshotSvg() {
  const width = 1440
  const height = 900

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wide-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${BRAND.ink}" />
        <stop offset="100%" stop-color="${BRAND.blue}" />
      </linearGradient>
      <linearGradient id="panel-bg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#eff6ff" />
        <stop offset="100%" stop-color="#ecfeff" />
      </linearGradient>
    </defs>

    <rect width="${width}" height="${height}" fill="${BRAND.paper}" />
    <rect width="${width}" height="260" fill="url(#wide-bg)" />
    <circle cx="1220" cy="140" r="180" fill="${BRAND.white}" opacity="0.08" />
    <circle cx="180" cy="70" r="120" fill="${BRAND.white}" opacity="0.06" />

    <rect x="72" y="82" width="1296" height="736" rx="34" fill="${BRAND.white}" />
    <rect x="72" y="82" width="1296" height="64" rx="34" fill="${BRAND.navy}" />
    <circle cx="118" cy="114" r="9" fill="#ef4444" />
    <circle cx="146" cy="114" r="9" fill="#f59e0b" />
    <circle cx="174" cy="114" r="9" fill="#22c55e" />
    <text x="216" y="122" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="${BRAND.white}">MIHAS Student Dashboard</text>

    <rect x="102" y="174" width="272" height="596" rx="26" fill="${BRAND.navy}" />
    <text x="142" y="238" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="${BRAND.white}">MIHAS</text>
    <text x="142" y="272" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="${BRAND.cyan}">Admissions portal</text>

    <rect x="132" y="320" width="212" height="52" rx="16" fill="${BRAND.blue}" />
    <text x="166" y="354" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${BRAND.white}">Dashboard</text>
    <text x="142" y="432" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.white}">Applications</text>
    <text x="142" y="486" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.white}">Payments</text>
    <text x="142" y="540" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.white}">Notifications</text>
    <text x="142" y="594" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.white}">Settings</text>

    <text x="420" y="220" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" fill="${BRAND.navy}">Track applications, payments, and next steps</text>
    <text x="420" y="260" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${BRAND.slate}">Everything a student needs from one dashboard, including drafts, submission status, and payment follow-up.</text>

    <rect x="420" y="308" width="280" height="138" rx="24" fill="url(#panel-bg)" stroke="${BRAND.border}" />
    <text x="452" y="354" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${BRAND.slate}">Profile completion</text>
    <text x="452" y="412" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" fill="${BRAND.navy}">100%</text>

    <rect x="724" y="308" width="280" height="138" rx="24" fill="#effdf4" stroke="#bbf7d0" />
    <text x="756" y="354" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${BRAND.slate}">Submitted applications</text>
    <text x="756" y="412" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" fill="${BRAND.success}">31</text>

    <rect x="1028" y="308" width="280" height="138" rx="24" fill="#fff7ed" stroke="#fed7aa" />
    <text x="1060" y="354" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${BRAND.slate}">Pending payment</text>
    <text x="1060" y="412" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" fill="${BRAND.warning}">2</text>

    <rect x="420" y="478" width="888" height="292" rx="28" fill="${BRAND.white}" stroke="${BRAND.border}" />
    <text x="456" y="530" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="${BRAND.navy}">Recent applications</text>

    <rect x="456" y="566" width="816" height="58" rx="18" fill="${BRAND.paper}" />
    <text x="486" y="603" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.navy}">Registered Nursing</text>
    <text x="934" y="603" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${BRAND.slate}">Submitted</text>
    <rect x="1118" y="582" width="124" height="28" rx="14" fill="#dcfce7" />
    <text x="1146" y="603" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="${BRAND.success}">Verified</text>

    <rect x="456" y="640" width="816" height="58" rx="18" fill="${BRAND.paper}" />
    <text x="486" y="677" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.navy}">Clinical Medicine</text>
    <text x="934" y="677" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${BRAND.slate}">Under review</text>
    <rect x="1118" y="656" width="124" height="28" rx="14" fill="#ffedd5" />
    <text x="1148" y="677" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="${BRAND.warning}">Pending</text>

    <rect x="456" y="714" width="816" height="24" rx="12" fill="${BRAND.border}" />
    <rect x="456" y="714" width="590" height="24" rx="12" fill="${BRAND.blue}" />
  </svg>
  `
}

function createMobileScreenshotSvg() {
  const width = 1080
  const height = 1920

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="mobile-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${BRAND.ink}" />
        <stop offset="100%" stop-color="${BRAND.blue}" />
      </linearGradient>
      <linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#eff6ff" />
        <stop offset="100%" stop-color="#ecfeff" />
      </linearGradient>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#mobile-bg)" />
    <circle cx="870" cy="240" r="180" fill="${BRAND.white}" opacity="0.08" />
    <circle cx="160" cy="1700" r="210" fill="${BRAND.white}" opacity="0.06" />

    <rect x="126" y="86" width="828" height="1748" rx="74" fill="${BRAND.ink}" />
    <rect x="188" y="138" width="704" height="1644" rx="46" fill="${BRAND.paper}" />
    <rect x="404" y="112" width="272" height="24" rx="12" fill="${BRAND.paper}" opacity="0.9" />

    <text x="246" y="236" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="${BRAND.blue}">MIHAS Application Wizard</text>
    <text x="246" y="282" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.slate}">Create an application with autosave and clear payment options.</text>

    <rect x="246" y="330" width="588" height="128" rx="28" fill="url(#card-bg)" stroke="${BRAND.border}" />
    <text x="286" y="386" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${BRAND.slate}">Step 4 of 4</text>
    <text x="286" y="428" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="${BRAND.navy}">Payment and submission</text>

    <rect x="246" y="500" width="588" height="18" rx="9" fill="${BRAND.border}" />
    <rect x="246" y="500" width="456" height="18" rx="9" fill="${BRAND.blue}" />

    <rect x="246" y="576" width="588" height="220" rx="30" fill="${BRAND.white}" stroke="${BRAND.border}" />
    <text x="286" y="636" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${BRAND.navy}">Payment details</text>
    <text x="286" y="684" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.slate}">Reference number</text>
    <rect x="286" y="708" width="508" height="44" rx="14" fill="${BRAND.paper}" />
    <text x="308" y="738" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.navy}">MIHAS-2026-00412</text>

    <rect x="246" y="836" width="588" height="278" rx="30" fill="${BRAND.white}" stroke="${BRAND.border}" />
    <text x="286" y="896" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${BRAND.navy}">Upload proof of payment</text>
    <rect x="286" y="938" width="508" height="132" rx="24" fill="#eff6ff" stroke="#93c5fd" stroke-dasharray="12 12" />
    <text x="384" y="1014" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${BRAND.blue}">Tap to attach receipt</text>
    <text x="370" y="1050" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${BRAND.slate}">PDF, JPG, or PNG supported</text>

    <rect x="246" y="1156" width="588" height="252" rx="30" fill="${BRAND.white}" stroke="${BRAND.border}" />
    <text x="286" y="1216" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${BRAND.navy}">Need more time?</text>
    <text x="286" y="1266" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.slate}">Choose Pay later to submit now and finish payment from your dashboard.</text>
    <rect x="286" y="1312" width="220" height="56" rx="18" fill="${BRAND.paper}" stroke="${BRAND.border}" />
    <text x="336" y="1348" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${BRAND.navy}">Pay later</text>
    <rect x="526" y="1312" width="268" height="56" rx="18" fill="${BRAND.blue}" />
    <text x="586" y="1348" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${BRAND.white}">Submit application</text>

    <rect x="246" y="1458" width="588" height="182" rx="30" fill="${BRAND.white}" stroke="${BRAND.border}" />
    <text x="286" y="1518" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${BRAND.navy}">Autosave status</text>
    <circle cx="308" cy="1570" r="10" fill="${BRAND.success}" />
    <text x="336" y="1578" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${BRAND.navy}">Draft saved 12 seconds ago</text>
    <text x="286" y="1622" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${BRAND.slate}">Your draft and uploaded documents stay linked to your account.</text>
  </svg>
  `
}

async function writeScreenshot(outputName, svg) {
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(join(screenshotsDir, outputName))
}

async function generate() {
  await ensureDirectories()

  await rasterizeIcon('icon-192x192.svg', 'icon-192x192.png', 192)
  await rasterizeIcon('icon-512x512.svg', 'icon-512x512.png', 512)
  await rasterizeIcon('icon-192x192-maskable.svg', 'icon-192x192-maskable.png', 192)
  await rasterizeIcon('icon-512x512-maskable.svg', 'icon-512x512-maskable.png', 512)

  await writeScreenshot('student-dashboard-wide.png', createWideScreenshotSvg())
  await writeScreenshot('application-wizard-mobile.png', createMobileScreenshotSvg())

  console.log('Generated PWA icons and screenshots.')
}

generate().catch((error) => {
  console.error('Failed to generate PWA assets:', error)
  process.exit(1)
})
