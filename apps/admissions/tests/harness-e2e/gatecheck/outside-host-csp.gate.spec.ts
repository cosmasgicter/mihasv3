/**
 * GATECHECK (must FAIL): proves the outside-host gate fires for a request the
 * harness CSP refuses, and names the host (task 3.7, Requirement 1.11).
 *
 * The page is a real harness page, so the edge's CSP header applies and its
 * `connect-src` no longer allows an outside host. The browser refuses the fetch
 * and reports a securitypolicyviolation, which the gate records. The host is under
 * the reserved `.invalid` domain, so nothing could ever answer it.
 */
import { test, expect } from '../harness-fixtures';

test('gatecheck: a request the CSP refuses is an outside-host violation, naming the host', async ({ page, gate }) => {
  await page.goto('/');
  await page.evaluate(() => fetch('http://csp-probe.invalid/boom').catch(() => undefined));
  await page.waitForTimeout(500);
  // The gate must have recorded the host. If it did not, fail with a message that
  // says so; if it did, the teardown throws the violation, which is the expected failure.
  expect(gate.outsideHosts.hosts, 'the outside-host gate did not fire for a CSP-refused request').toContain(
    'csp-probe.invalid',
  );
  expect(gate.collectViolations().join('\n')).toContain('csp-probe.invalid');
});
