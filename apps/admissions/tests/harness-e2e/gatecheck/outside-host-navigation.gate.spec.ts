/**
 * GATECHECK (must FAIL): proves the outside-host gate fires for a top-level
 * navigation to an outside host, and names it (task 3.7, Requirement 1.11).
 *
 * The host is under the reserved `.invalid` domain. The harness browsers launch
 * with a rule that leaves every outside name unresolvable, so the navigation
 * fails with `net::ERR_NAME_NOT_RESOLVED` before any packet leaves the machine,
 * and the gate still records the host.
 */
import { test, expect } from '../harness-fixtures';

test('gatecheck: a navigation to an outside host is a violation, naming the host', async ({ page, gate }) => {
  const outcome = await page.goto('http://nav-probe.invalid/').then(
    () => 'loaded',
    (error: Error) => error.message,
  );
  // Name resolution is what stops it, not the gate.
  expect(outcome, 'the outside name must not resolve in the harness browser').toContain('ERR_NAME_NOT_RESOLVED');
  expect(gate.outsideHosts.hosts, 'the outside-host gate did not fire for a navigation').toContain('nav-probe.invalid');
  expect(gate.collectViolations().join('\n')).toContain('nav-probe.invalid');
});
