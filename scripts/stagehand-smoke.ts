/**
 * Stagehand local smoke test — runs against the live MIHAS site.
 *
 * Usage:
 *   bun run scripts/stagehand-smoke.ts
 *
 * Requires:
 *   - OPENAI_API_KEY in .env.local (or exported in shell)
 *   - Local Chrome/Chromium installed
 */

import { Stagehand } from "@browserbasehq/stagehand";

async function main() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    model: "openai/gpt-4o",
    localBrowserLaunchOptions: {
      headless: false,
      executablePath: "/usr/bin/google-chrome",
    },
  });

  await stagehand.init();
  const page = stagehand.context.pages()[0];

  // Navigate to the live admissions site
  await page.goto("https://apply.mihas.edu.zm");
  console.log("✓ Loaded apply.mihas.edu.zm");

  // Use Stagehand's AI to find and read the page title
  const title = await page.title();
  console.log(`✓ Page title: ${title}`);

  // AI-driven: extract the main heading
  const heading = await stagehand.extract(
    "extract the main heading text from the landing page",
    (await import("zod")).z.object({
      heading: (await import("zod")).z.string(),
    }),
  );
  console.log(`✓ Main heading: ${heading.heading}`);

  // AI-driven: check if sign-in link exists
  const signInVisible = await stagehand.observe("find the sign in or login link");
  console.log(`✓ Sign-in elements found: ${signInVisible.length}`);

  await stagehand.close();
  console.log("\n✅ Stagehand smoke test passed — local execution works.");
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err.message);
  process.exit(1);
});
