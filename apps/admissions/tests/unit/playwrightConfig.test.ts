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
