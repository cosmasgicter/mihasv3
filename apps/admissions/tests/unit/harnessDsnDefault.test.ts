// @vitest-environment node
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Task 1.3 (R1.12): the harness builds the SPA with a placeholder error-reporter
// DSN. A default that Sentry cannot parse prints "Invalid Sentry Dsn" on every
// page load, which the journey gate counts as a console error.
const ROOT = path.resolve(__dirname, '../../../..');
const HARNESS = path.join(ROOT, 'harness/bin/harness');

function harnessDefaultDsn(): string {
  const line = readFileSync(HARNESS, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('export VITE_GLITCHTIP_DSN='));
  expect(line, 'harness must export VITE_GLITCHTIP_DSN').toBeTruthy();
  const match = /\$\{VITE_GLITCHTIP_DSN:-([^}]+)\}/.exec(line as string);
  expect(match, 'the default keeps the ${VAR:-default} form so a caller value wins').not.toBeNull();
  return (match as RegExpExecArray)[1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('harness error-reporter DSN default', () => {
  it('is a DSN @sentry/core can parse, on a .localhost host', () => {
    const dsn = harnessDefaultDsn();
    const reactEntry = createRequire(import.meta.url).resolve('@sentry/react');
    const coreRequire = createRequire(reactEntry);
    const { makeDsn } = coreRequire('@sentry/core') as {
      makeDsn: (dsn: string) => { host: string } | undefined;
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const parsed = makeDsn(dsn);

    expect(parsed).toBeDefined();
    expect(parsed?.host.endsWith('.localhost')).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
