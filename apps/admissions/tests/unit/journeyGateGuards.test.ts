/**
 * The journey gate's own guards are tested here, so the gate cannot go quiet unnoticed
 * (SJR task 4.2, design R9-b; clauses 2.43-2.45).
 *
 * The gate fails a run on a 429 or 5xx on any URL, on an unsigned storage request, and
 * (with the status-aware defaults) on a non-401 answer from the two URLs the broad
 * matrix allows by URL. None of that is visible when the gate is green, so each rule is
 * driven here with a fake browser context.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  attachStrictStatusGuard,
  isForbiddenStatus,
  redactedLocation,
  STORAGE_ORIGIN,
} from '../harness-e2e/journey-gate/strictStatusGuard';
import { classifyPath, MIDDLEWARE_SCOPES } from '../harness-e2e/journey-gate/rateLimitHeadroom';
import { HarnessGate } from '../harness-e2e/harness-fixtures';

type Handler = (arg: unknown) => void;

function fakeContext() {
  const handlers = new Map<string, Handler[]>();
  return {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    emit(event: string, arg: unknown) {
      for (const handler of handlers.get(event) ?? []) handler(arg);
    },
  };
}

const response = (status: number, url: string, method = 'GET') => ({
  status: () => status,
  url: () => url,
  request: () => ({ method: () => method }),
});

describe('journey gate: strict status guard', () => {
  it('records a 429 or a 5xx on any URL, and nothing else', () => {
    const context = fakeContext();
    const guard = attachStrictStatusGuard(context as never);
    for (const status of [200, 201, 204, 301, 400, 401, 403, 404, 409]) {
      context.emit('response', response(status, 'http://localhost:8090/api/v1/x/'));
    }
    expect(guard.violations).toEqual([]);
    for (const status of [429, 500, 502, 503]) {
      context.emit('response', response(status, 'http://localhost:8090/api/v1/auth/session/'));
    }
    expect(guard.violations.map((v) => v.status)).toEqual([429, 500, 502, 503]);
    expect(guard.describe()[0]).toContain('/api/v1/auth/session/');
  });

  it('never puts a query string, and so never a signature, in a violation', () => {
    const context = fakeContext();
    const guard = attachStrictStatusGuard(context as never);
    context.emit('response', response(503, `${STORAGE_ORIGIN}/harness/documents/a.pdf?X-Amz-Signature=secret&X-Amz-Expires=20`));
    context.emit('request', { url: () => `${STORAGE_ORIGIN}/harness/documents/b.pdf` });
    const text = guard.describe().join('\n');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('X-Amz');
    expect(text).toContain('/harness/documents/a.pdf');
  });

  it('flags a storage request with no signature and ignores a signed one', () => {
    const context = fakeContext();
    const guard = attachStrictStatusGuard(context as never);
    context.emit('request', { url: () => `${STORAGE_ORIGIN}/harness/documents/ok.pdf?X-Amz-Signature=abc` });
    context.emit('request', { url: () => 'http://localhost:8090/student/status' });
    expect(guard.unsignedStorageRequests).toEqual([]);
    context.emit('request', { url: () => `${STORAGE_ORIGIN}/harness/documents/public.pdf` });
    expect(guard.unsignedStorageRequests).toEqual([`${STORAGE_ORIGIN}/harness/documents/public.pdf`]);
  });

  it('treats exactly 429 and >= 500 as forbidden', () => {
    expect([428, 429, 430, 499, 500, 599].map(isForbiddenStatus)).toEqual([false, true, false, false, true, true]);
    expect(redactedLocation('not a url')).toBe('(unparseable url)');
  });
});

describe('journey gate: status-aware defaults', () => {
  const session = 'http://localhost:8090/api/v1/auth/session/';
  const refresh = 'http://localhost:8090/api/v1/auth/refresh/';

  it('keeps the broad matrix allowing the two URLs at any status', () => {
    const gate = new HarnessGate();
    for (const status of [401, 429, 500]) {
      expect(gate.isRequestAllowed(session, status)).toBe(true);
      expect(gate.isRequestAllowed(refresh, status)).toBe(true);
    }
  });

  it('allows them only at 401 when the gate turns the mode on', () => {
    const gate = new HarnessGate(true);
    expect(gate.isRequestAllowed(session, 401)).toBe(true);
    expect(gate.isRequestAllowed(refresh, 401)).toBe(true);
    for (const status of [403, 429, 500, 503]) {
      expect(gate.isRequestAllowed(session, status)).toBe(false);
      expect(gate.isRequestAllowed(refresh, status)).toBe(false);
    }
    expect(gate.isRequestAllowed('http://localhost:8090/api/v1/other/', 401)).toBe(false);
  });

  it('still honours a test that declares an error path with allowRequest', () => {
    const gate = new HarnessGate(true).allowRequest('/api/v1/documents/');
    expect(gate.isRequestAllowed('http://localhost:8090/api/v1/documents/x/signed-url/', 404)).toBe(true);
  });

  it('reports a 429 on the session URL as a violation only in the gate mode', () => {
    const broad = new HarnessGate();
    broad.failedRequests.push({ url: session, status: 429 });
    expect(broad.collectViolations()).toEqual([]);
    const strict = new HarnessGate(true);
    strict.failedRequests.push({ url: session, status: 429 });
    expect(strict.collectViolations()).toHaveLength(1);
  });
});

describe('journey gate: rate-limit scope table', () => {
  it('copies RateLimitMiddleware.SCOPE_LIMITS: same prefixes, same budgets, same order', () => {
    const source = readFileSync(join(__dirname, '../../../../backend/apps/common/middleware.py'), 'utf-8');
    const block = source.slice(source.indexOf('SCOPE_LIMITS = ['), source.indexOf('VIEW_MANAGED_PAYMENT_PREFIXES'));
    const backend = [...block.matchAll(/\(\s*"(\/[^"]+)",\s*(None|"[^"]+")\s*\)/g)].map(
      (m) => [m[1], m[2] === 'None' ? null : m[2]!.replace(/"/g, '')] as const,
    );
    // The backend table also lists the Django admin panel, which is not an /api/ path.
    const api = backend.filter(([prefix]) => prefix!.startsWith('/api/'));
    expect(api.length).toBeGreaterThan(15);
    expect(MIDDLEWARE_SCOPES.map(([p, b]) => [p, b])).toEqual(api.map(([p, b]) => [p, b]));
  });

  it('classifies a path by the first matching prefix', () => {
    expect(classifyPath('/api/v1/auth/login/')).toBe('/api/v1/auth/login/');
    expect(classifyPath('/api/v1/auth/session/')).toBe('/api/v1/auth/');
    expect(classifyPath('/api/v1/documents/upload/')).toBe('/api/v1/documents/upload/');
    expect(classifyPath('/api/v1/documents/abc/signed-url/')).toBe('/api/v1/documents/');
    expect(classifyPath('/api/v1/payments/webhook/lenco/')).toBe('/api/v1/payments/webhook/ (exempt)');
    expect(classifyPath('/api/v1/catalog/programs/')).toBe('/api/v1/');
    expect(classifyPath('/health/live/')).toBeNull();
  });
});
