import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;

afterEach(() => {
  if (ORIGINAL_BASE_URL === undefined) {
    delete process.env.PLAYWRIGHT_BASE_URL;
  } else {
    process.env.PLAYWRIGHT_BASE_URL = ORIGINAL_BASE_URL;
  }
  vi.resetModules();
});

describe('playwright config', () => {
  it('uses the configured localhost default when no override is provided', async () => {
    delete process.env.PLAYWRIGHT_BASE_URL;
    vi.resetModules();

    const { default: config } = await import('../../playwright.config');

    expect(config.use?.baseURL).toBe('http://localhost:5173');
  });

  it('allows the base URL to be overridden for local QA', async () => {
    process.env.PLAYWRIGHT_BASE_URL = 'http://localhost:5175';
    vi.resetModules();

    const { default: config } = await import('../../playwright.config');

    expect(config.use?.baseURL).toBe('http://localhost:5175');
  });
});

// Task 3.7 (R1.11): every harness configuration launches Chromium with the rule that
// makes an outside host name unresolvable, and none of them opts out per project.
describe('harness playwright configs resolve no outside host', () => {
  const ARG =
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE *.localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]';
  const CONFIGS = [
    '../../playwright.harness.config',
    '../../playwright.harness.13-2.config',
    '../../playwright.harness.13-3.config',
    '../../playwright.harness.13-6-L5-L6.config',
    '../../playwright.journey-gate.config',
  ];

  it('the shared argument is the rule of design §1', async () => {
    const { HOST_RESOLVER_ARG } = await import('../harness-e2e/helpers/host-resolver');
    expect(HOST_RESOLVER_ARG).toBe(ARG);
  });

  it.each(CONFIGS)('%s sets the argument and no project replaces it', async (specifier) => {
    vi.resetModules();
    const { default: config } = await import(/* @vite-ignore */ specifier);
    expect(config.use?.launchOptions?.args).toContain(ARG);
    for (const project of config.projects ?? []) {
      const own = project.use?.launchOptions;
      if (own !== undefined) expect(own.args ?? []).toContain(ARG);
    }
  });

  it('registers no route-based interception in the shared fixtures', async () => {
    // A route turns interception on for every request and the HTTP cache off in every harness run.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, '../harness-e2e/harness-fixtures.ts'), 'utf8');
    expect(source).not.toMatch(/\.route(?:FromHAR)?\s*\(/);
  });
});
