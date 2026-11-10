/**
 * Make a host name outside the stack unresolvable in the browser (platform-
 * simplification task 3.7, Requirement 1.11, design §1 "Name resolution").
 *
 * Every harness Playwright configuration launches Chromium with this rule. A host
 * name outside the stack then fails name resolution inside the browser, so a
 * subresource request, a navigation, a popup and a form post all fail before any
 * packet leaves the machine. It registers no Playwright route, so the HTTP cache
 * stays on (a route would turn interception on for every request and the cache off).
 *
 * Two limits, stated rather than hidden. A literal IP address outside loopback is
 * never resolved, so this rule cannot stop it; the outside-host gate in
 * `harness-fixtures.ts` detects it instead. And that these EXCLUDE patterns keep
 * every harness host reachable on a CI runner is Unverified until the first gate
 * run there; a host it cannot reach is added here and recorded.
 */
export const HOST_RESOLVER_RULES =
  'MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE *.localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]';

export const HOST_RESOLVER_ARG = `--host-resolver-rules=${HOST_RESOLVER_RULES}`;

/** For a Playwright config's top-level `use`. */
export const harnessLaunchOptions = { args: [HOST_RESOLVER_ARG] };
