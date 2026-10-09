/**
 * GATECHECK (must FAIL): proves the unasserted-failed-request gate fires.
 *
 * The test triggers a network request that fails (unresolvable host) and does
 * NOT allow-list it, so the gate teardown throws. The harness smoke asserts
 * this project FAILS.
 */
import { test } from '../harness-fixtures';

test('gatecheck: an unasserted failed request fails the run', async ({ page }) => {
  await page.goto('about:blank');
  // .invalid is reserved and never resolves -> a genuine transport failure that
  // was NOT declared via gate.allowRequest(...), so it is a violation.
  await page.evaluate(() =>
    fetch('http://gatecheck.invalid/boom').catch(() => undefined),
  );
  await page.waitForTimeout(500);
});
