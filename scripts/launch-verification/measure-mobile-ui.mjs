#!/usr/bin/env node
/**
 * Gate 4: Mobile UI — Real DOM measurement via puppeteer-core + headless Chrome.
 * Measures touch targets (>=44x44px) and horizontal overflow at 5 viewports
 * on the live production site (apply.beanola.com).
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const EVIDENCE_DIR = join(PROJECT_ROOT, 'docs', 'launch-evidence', '04-mobile-ui');
const SCREENSHOT_DIR = join(EVIDENCE_DIR, 'screenshots');

const BASE_URL = 'https://apply.beanola.com';
const TOUCH_TARGET_MIN = 44;

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const ROUTES = [
  { label: 'public-landing', path: '/', description: 'Public landing page' },
  { label: 'auth-signin', path: '/sign-in', description: 'Sign-in / auth page' },
  { label: 'student-wizard', path: '/student/application-wizard', description: 'Application wizard entry (requires auth)' },
  { label: 'admin-entry', path: '/admin', description: 'Admin login wall' },
  { label: 'tenant-onboarding', path: '/admin/tenants/new', description: 'Tenant onboarding wizard (super-admin only)' },
];

const AUTH_GATED_ROUTES = ['student-wizard', 'admin-entry', 'tenant-onboarding'];

async function measurePage(page, viewport, route) {
  const id = `${route.label}_${viewport.width}x${viewport.height}`;
  const url = `${BASE_URL}${route.path}`;

  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });

  let statusCode = 200;
  let finalUrl = url;

  // Navigate
  const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  if (response) {
    statusCode = response.status();
    finalUrl = page.url();
  }

  // Wait a bit for hydration
  await new Promise(r => setTimeout(r, 2000));
  finalUrl = page.url();

  // Check if redirected to auth
  const isAuthRedirected = finalUrl.includes('/auth/signin') || finalUrl.includes('/sign-in');
  const isAuthGated = AUTH_GATED_ROUTES.includes(route.label);

  if (isAuthGated && isAuthRedirected) {
    // Take screenshot anyway
    const screenshotPath = join(SCREENSHOT_DIR, `${id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    return {
      id,
      result: 'not-measured',
      viewport: `${viewport.width}x${viewport.height}`,
      route: route.label,
      route_path: route.path,
      final_url: finalUrl,
      status_code: statusCode,
      requires_auth: true,
      observed: `Route requires authentication — redirected to ${finalUrl}. Cannot measure target page without credentials.`,
      threshold: 'No horizontal overflow; all non-exempt interactive elements ≥ 44x44px',
      screenshot: `screenshots/${id}.png`,
      measurement_method: 'none (auth-gated)',
      measurements: null,
    };
  }

  // Take screenshot
  const screenshotPath = join(SCREENSHOT_DIR, `${id}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  // Measure DOM
  const measurements = await page.evaluate((minSize) => {
    const docWidth = document.documentElement.scrollWidth;
    const vpWidth = window.innerWidth;
    const horizontalOverflow = docWidth > vpWidth;
    const overflowPx = horizontalOverflow ? docWidth - vpWidth : 0;

    // Find all interactive elements
    const interactiveSelectors = 'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    const elements = document.querySelectorAll(interactiveSelectors);
    let total = 0;
    const realViolations = [];
    let exemptCount = 0;

    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      // Skip invisible/hidden elements
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
      // Skip elements with zero size (likely hidden)
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      total++;

      const width = rect.width;
      const height = rect.height;
      const belowMinWidth = width < minSize;
      const belowMinHeight = height < minSize;

      if (belowMinWidth || belowMinHeight) {
        // Check if it's an exempt skip-to-content link (offscreen positioned)
        const isOffscreen = (style.position === 'absolute' && (
          parseInt(style.left) < -9000 || parseInt(style.top) < -9000 ||
          rect.left < -100 || rect.top < -100
        ));

        if (isOffscreen) {
          exemptCount++;
          return;
        }

        realViolations.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 50),
          classes: el.className || '',
          href: el.getAttribute('href') || undefined,
          width: Math.round(width * 10) / 10,
          height: Math.round(height * 10) / 10,
          belowMinWidth,
          belowMinHeight,
          isOffscreenPositioned: false,
        });
      }
    });

    return {
      document_width: docWidth,
      viewport_width: vpWidth,
      horizontal_overflow: horizontalOverflow,
      overflow_px: overflowPx,
      interactive_elements_total: total,
      touch_target_violations_total: realViolations.length + exemptCount,
      touch_target_violations_real: realViolations.length,
      touch_target_violations_exempt: exemptCount,
      real_violations: realViolations,
    };
  }, TOUCH_TARGET_MIN);

  const hasFail = measurements.touch_target_violations_real > 0 || measurements.horizontal_overflow;
  const result = hasFail ? 'fail' : 'pass';

  let observed;
  if (measurements.horizontal_overflow) {
    observed = `OVERFLOW: document ${measurements.document_width}px > viewport ${measurements.viewport_width}px (+${measurements.overflow_px}px)`;
  } else if (measurements.touch_target_violations_real > 0) {
    const viols = measurements.real_violations.map(v => `<${v.tag}> "${v.text}" ${v.width}×${v.height}px`).join(', ');
    observed = `TOUCH_TARGET: ${measurements.touch_target_violations_real} element(s) < 44px: ${viols}`;
  } else {
    observed = `PASS: No overflow, all ${measurements.interactive_elements_total} interactive elements ≥ 44x44px`;
  }

  return {
    id,
    result,
    viewport: `${viewport.width}x${viewport.height}`,
    route: route.label,
    route_path: route.path,
    final_url: finalUrl,
    status_code: statusCode,
    requires_auth: false,
    observed,
    threshold: 'No horizontal overflow; all non-exempt interactive elements ≥ 44x44px',
    screenshot: `screenshots/${id}.png`,
    measurement_method: 'puppeteer-core DOM: getBoundingClientRect + getComputedStyle',
    measurements,
  };
}

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('Launching headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions'],
  });

  const page = await browser.newPage();
  const checks = [];
  const failures = [];
  let passCount = 0;
  let failCount = 0;
  let notMeasuredCount = 0;

  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      const id = `${route.label}_${viewport.width}x${viewport.height}`;
      console.log(`  Measuring ${id}...`);
      try {
        const check = await measurePage(page, viewport, route);
        checks.push(check);
        if (check.result === 'pass') passCount++;
        else if (check.result === 'fail') {
          failCount++;
          failures.push({ id: check.id, detail: check.observed });
        }
        else if (check.result === 'not-measured') notMeasuredCount++;
      } catch (err) {
        console.error(`  ERROR on ${id}: ${err.message}`);
        checks.push({
          id,
          result: 'fail',
          viewport: `${viewport.width}x${viewport.height}`,
          route: route.label,
          route_path: route.path,
          final_url: `${BASE_URL}${route.path}`,
          status_code: 0,
          requires_auth: AUTH_GATED_ROUTES.includes(route.label),
          observed: `ERROR: ${err.message}`,
          threshold: 'No horizontal overflow; all non-exempt interactive elements ≥ 44x44px',
          screenshot: null,
          measurement_method: 'puppeteer-core DOM: getBoundingClientRect + getComputedStyle',
          measurements: null,
        });
        failCount++;
        failures.push({ id, detail: `ERROR: ${err.message}` });
      }
    }
  }

  await browser.close();
  console.log('Browser closed.');

  const overallStatus = failCount === 0 ? 'passed' : 'failed';

  const evidence = {
    gate_id: 'mobile-ui',
    requirement: 'R4',
    status: overallStatus,
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    generated_by: 'deployed-target',
    summary: `Mobile UI Gate ${overallStatus.toUpperCase()}: ${passCount} passed, ${failCount} failed, ${notMeasuredCount} not-measured (auth-gated) across ${VIEWPORTS.length} viewports × ${ROUTES.length} routes. Method: real DOM measurement via puppeteer-core (getBoundingClientRect + getComputedStyle visibility filtering). ${failCount === 0 ? 'No horizontal overflow detected. All interactive elements on accessible pages meet 44x44px minimum.' : 'Touch-target violations found.'}`,
    checks,
    assets: checks
      .filter(c => c.screenshot)
      .map(c => `docs/launch-evidence/04-mobile-ui/${c.screenshot}`),
    failures: failures.length > 0 ? failures : undefined,
    metadata: {
      viewports_tested: VIEWPORTS.map(v => `${v.width}x${v.height}`),
      routes_tested: ROUTES.map(r => ({ label: r.label, path: r.path, description: r.description })),
      tool: 'puppeteer-core + /usr/bin/google-chrome (headless: new)',
      touch_target_threshold_px: TOUCH_TARGET_MIN,
      overflow_threshold: 'document.documentElement.scrollWidth <= window.innerWidth',
      exemption_policy: 'Skip-to-content links (position: absolute off-screen until focused) are exempt from 44px minimum per WCAG touch-target guidance (they are keyboard-only affordances).',
      auth_note: 'Routes requiring authentication redirect to /auth/signin. These are marked not-measured — the auth login page itself IS measured when testing the /sign-in route.',
    },
  };

  const outputPath = join(EVIDENCE_DIR, 'mobile-ui-evidence.json');
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`\nEvidence written to: ${outputPath}`);
  console.log(`Status: ${overallStatus} (${passCount} pass, ${failCount} fail, ${notMeasuredCount} not-measured)`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ${f.id}: ${f.detail}`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
