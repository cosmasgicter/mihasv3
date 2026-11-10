/**
 * The record behind the fifth harness gate: outside hosts (platform-simplification
 * task 3.7, Requirement 1.11).
 *
 * Kept free of Playwright imports so it unit-tests under vitest. `harness-fixtures.ts`
 * feeds it from the browser context's `request` and `requestfailed` events and from
 * `securitypolicyviolation` events, and `HarnessGate.collectViolations()` reads it.
 * It records the HOST of a request to anywhere outside the stack and never the full
 * URL, and nothing a test allows (`allowRequest`, `allowConsole`) can hide it.
 */
import { hostOf, isStackHost } from '../../../scripts/stack-hosts';

export class OutsideHostLog {
  private readonly seen = new Map<string, Set<string>>();

  /** Record `url` when it names a host outside the stack. `how` says what the browser did. */
  note(url: string, how: string): void {
    const host = hostOf(url);
    if (!host || isStackHost(host)) return;
    const hows = this.seen.get(host) ?? new Set<string>();
    hows.add(how);
    this.seen.set(host, hows);
  }

  get hosts(): string[] {
    return [...this.seen.keys()];
  }

  /** One line per outside host, naming the host and what happened, never the URL. */
  violations(): string[] {
    return [...this.seen.entries()].map(
      ([host, hows]) => `outside host: ${host} (${[...hows].join(', ')})`,
    );
  }
}
