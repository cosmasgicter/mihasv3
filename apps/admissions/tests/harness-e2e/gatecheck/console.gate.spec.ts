/**
 * GATECHECK (must FAIL): proves the unexpected-console-error gate fires.
 *
 * The test emits a console.error; the gate teardown collects it and throws,
 * failing the test. The harness smoke asserts this project FAILS.
 */
import { test } from '../harness-fixtures';

test('gatecheck: an unexpected console error fails the run', async ({ page }) => {
  await page.goto('about:blank');
  await page.evaluate(() => console.error('GATECHECK intentional console error'));
  // Give the console event a tick to be recorded before teardown asserts.
  await page.waitForTimeout(200);
});
