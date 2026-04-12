/**
 * Stagehand E2E test — tests the live MIHAS site.
 * Uses local Chrome, no Browserbase, no OpenAI key needed.
 *
 * Usage: bun run scripts/stagehand-e2e.ts
 */

import { Stagehand } from "@browserbasehq/stagehand";

const SITE = "https://apply.mihas.edu.zm";
const API = "https://api.mihas.edu.zm";

const results: { test: string; pass: boolean; detail: string }[] = [];

function log(test: string, pass: boolean, detail: string) {
  results.push({ test, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${test}: ${detail}`);
}

async function main() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      headless: false,
      executablePath: "/usr/bin/google-chrome",
    },
  });

  await stagehand.init();
  const page = stagehand.context.pages()[0];

  // ── Test 1: Landing page loads ──
  try {
    await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 30000 });
    const title = await page.title();
    log("Landing page loads", title.length > 0, `Title: "${title}"`);
  } catch (e: any) {
    log("Landing page loads", false, e.message);
  }

  // ── Test 2: API health check ──
  try {
    const healthResp = await page.evaluate(async (api: string) => {
      const r = await fetch(`${api}/health/ready/`, { mode: "cors" });
      return { status: r.status, ok: r.ok };
    }, API);
    log("API health check", healthResp.ok, `Status: ${healthResp.status}`);
  } catch (e: any) {
    log("API health check", false, e.message);
  }

  // ── Test 3: Session endpoint returns 200 (THE P0 FIX) ──
  try {
    const sessionResp = await page.evaluate(async (api: string) => {
      const r = await fetch(`${api}/api/v1/auth/session/`, {
        credentials: "include",
        mode: "cors",
      });
      const body = await r.json().catch(() => null);
      return { status: r.status, body };
    }, API);
    const pass = sessionResp.status === 200;
    log(
      "Session endpoint returns 200 (P0 fix)",
      pass,
      `Status: ${sessionResp.status}, body: ${JSON.stringify(sessionResp.body)}`
    );
  } catch (e: any) {
    log("Session endpoint returns 200 (P0 fix)", false, e.message);
  }

  // ── Test 4: Sign-in page loads ──
  try {
    await page.goto(`${SITE}/auth/signin`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2000);
    const url = page.url();
    const pass = url.includes("signin") || url.includes("login");
    log("Sign-in page loads", pass, `URL: ${url}`);
  } catch (e: any) {
    log("Sign-in page loads", false, e.message);
  }

  // ── Test 5: Sign-in form has email input ──
  try {
    const emailInput = await page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
    const visible = await emailInput.isVisible().catch(() => false);
    log("Sign-in form has email input", visible, visible ? "Found" : "Not found");
  } catch (e: any) {
    log("Sign-in form has email input", false, e.message);
  }

  // ── Test 6: Sign-in form has password input ──
  try {
    const pwInput = await page.locator('input[type="password"]').first();
    const visible = await pwInput.isVisible().catch(() => false);
    log("Sign-in form has password input", visible, visible ? "Found" : "Not found");
  } catch (e: any) {
    log("Sign-in form has password input", false, e.message);
  }

  // ── Test 7: Catalog programs endpoint ──
  try {
    const catalogResp = await page.evaluate(async (api: string) => {
      const r = await fetch(`${api}/api/v1/catalog/programs/`, { mode: "cors" });
      return { status: r.status };
    }, API);
    log("Catalog programs public", catalogResp.status === 200, `Status: ${catalogResp.status}`);
  } catch (e: any) {
    log("Catalog programs public", false, e.message);
  }

  // ── Test 8: Old /admin/ returns 404 (security fix) ──
  try {
    const adminResp = await page.evaluate(async (api: string) => {
      const r = await fetch(`${api}/admin/`, { redirect: "manual" });
      return { status: r.status };
    }, API);
    const pass = adminResp.status === 404;
    log("Old /admin/ returns 404", pass, `Status: ${adminResp.status}`);
  } catch (e: any) {
    log("Old /admin/ returns 404", false, e.message);
  }

  // ── Test 9: OpenAPI docs gated (security fix) ──
  try {
    const docsResp = await page.evaluate(async (api: string) => {
      const r = await fetch(`${api}/api/v1/docs/`);
      return { status: r.status };
    }, API);
    const pass = docsResp.status === 401 || docsResp.status === 403;
    log("OpenAPI docs require auth", pass, `Status: ${docsResp.status}`);
  } catch (e: any) {
    log("OpenAPI docs require auth", false, e.message);
  }

  // ── Test 10: Document upload requires auth (not public) ──
  try {
    const uploadResp = await page.evaluate(async (api: string) => {
      const r = await fetch(`${api}/api/v1/documents/upload/`, { method: "POST", mode: "cors" });
      return { status: r.status };
    }, API);
    const pass = uploadResp.status === 401 || uploadResp.status === 403;
    log("Document upload requires auth", pass, `Status: ${uploadResp.status}`);
  } catch (e: any) {
    log("Document upload requires auth", false, e.message);
  }

  // ── Test 11: Sign-up page loads ──
  try {
    await page.goto(`${SITE}/auth/signup`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2000);
    const url = page.url();
    const pass = url.includes("signup");
    log("Sign-up page loads", pass, `URL: ${url}`);
  } catch (e: any) {
    log("Sign-up page loads", false, e.message);
  }

  // ── Test 12: Landing page has navigation links ──
  try {
    await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500);
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
      return anchors.map((a) => a.href).filter((h) => h.includes("signin") || h.includes("signup") || h.includes("programs"));
    });
    log("Landing page has auth/program links", links.length >= 1, `Found ${links.length} relevant links`);
  } catch (e: any) {
    log("Landing page has auth/program links", false, e.message);
  }

  // ── Summary ──
  console.log("\n" + "=".repeat(60));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${results.length}\n`);
  if (failed > 0) {
    console.log("Failed tests:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`  ❌ ${r.test}: ${r.detail}`));
  }
  console.log("=".repeat(60));

  await stagehand.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
