/**
 * GATECHECK (must FAIL): proves the outside-host gate sees a popup, and names the
 * host (task 3.7, Requirement 1.11).
 *
 * Harness specs open popups, and a listener attached to the page would miss one.
 * The gate listens on the browser context, so the popup's navigation is recorded.
 */
import { test, expect } from '../harness-fixtures';

test('gatecheck: a popup to an outside host is a violation, naming the host', async ({ page, gate }) => {
  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(() => {
    window.open('http://popup-probe.invalid/', '_blank');
  });
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForTimeout(500);
  expect(gate.outsideHosts.hosts, 'the outside-host gate did not fire for a popup').toContain('popup-probe.invalid');
  expect(gate.collectViolations().join('\n')).toContain('popup-probe.invalid');
});
