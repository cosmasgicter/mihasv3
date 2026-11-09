/**
 * Per-scope request counts for the journey gate (SJR task 4.2, design R9-b, EC-13).
 *
 * Classifies each API request by the same path prefixes, in the same order, as
 * `RateLimitMiddleware.SCOPE_LIMITS` (`backend/apps/common/middleware.py`) plus the
 * two DRF document scopes, counts them per spec, and writes the counts next to the
 * budget to `rate-limit-headroom.json` in the evidence directory. A 429 in a run is
 * then a budget finding inside one spec's window, not harness noise.
 *
 * A drift guard (`tests/unit/journeyGateScopeTable.test.ts`) reads the backend table
 * and fails if this copy stops agreeing with it.
 */
import type { BrowserContext } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evidenceDir } from '../helpers/evidence-dir';

/** [prefix, budget] in `SCOPE_LIMITS` order; `null` is an exempt path. */
export const MIDDLEWARE_SCOPES: ReadonlyArray<readonly [string, string | null]> = [
  ['/api/v1/auth/login/', '10/5m'],
  ['/api/v1/auth/register/', '5/5m'],
  ['/api/v1/auth/password-reset/', '5/5m'],
  ['/api/v1/auth/', '60/5m'],
  ['/api/v1/admin/', '200/10m'],
  ['/api/v1/documents/upload/', '60/10m'],
  ['/api/v1/documents/', '300/10m'],
  ['/api/v1/applications/bulk-status/', '20/10m'],
  ['/api/v1/applications/track/', '20/10m'],
  ['/api/v1/sessions/', '30/10m'],
  ['/api/v1/notifications/', '50/10m'],
  ['/api/v1/errors/', '10/5m'],
  ['/api/v1/outreach/', '30/10m'],
  ['/api/v1/email/', '30/10m'],
  ['/api/v1/integrations/', '20/10m'],
  ['/api/v1/payments/initiate/', '10/10m'],
  ['/api/v1/payments/mobile-money/', '5/10m'],
  ['/api/v1/payments/defer/', '10/10m'],
  ['/api/v1/payments/resolve-fee/', '30/10m'],
  ['/api/v1/payments/webhook/', null],
  ['/api/v1/payments/', '60/10m'],
  ['/api/v1/', '120/10m'],
];

/** The DRF per-user document budgets (`REST_FRAMEWORK` throttle rates). */
export const DOCUMENT_USER_SCOPES = { documents_read: '300/hour', documents_write: '40/hour' } as const;

export function classifyPath(pathname: string): string | null {
  for (const [prefix, budget] of MIDDLEWARE_SCOPES) {
    if (pathname.startsWith(prefix)) return budget === null ? `${prefix} (exempt)` : prefix;
  }
  return null;
}

function documentUserScope(method: string, pathname: string): string | null {
  const isDocumentPath =
    pathname.startsWith('/api/v1/documents/') || /^\/api\/v1\/applications\/[^/]+\/documents\//.test(pathname);
  if (!isDocumentPath) return null;
  return ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'documents_read' : 'documents_write';
}

export class RateLimitHeadroom {
  readonly counts = new Map<string, number>();
  readonly userCounts = new Map<string, number>();

  constructor(private readonly specName: string) {}

  private bump(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  /** Count every API request made by a context (popups included). */
  watch(context: BrowserContext): void {
    context.on('request', (request) => {
      let pathname: string;
      try {
        pathname = new URL(request.url()).pathname;
      } catch {
        return;
      }
      if (!pathname.startsWith('/api/')) return;
      const scope = classifyPath(pathname);
      if (scope) this.bump(this.counts, scope);
      const userScope = documentUserScope(request.method(), pathname);
      if (userScope) this.bump(this.userCounts, userScope);
    });
  }

  toJSON() {
    const scopes: Record<string, { requests: number; budget: string; headroom: number | null }> = {};
    for (const [prefix, budget] of MIDDLEWARE_SCOPES) {
      const key = budget === null ? `${prefix} (exempt)` : prefix;
      const requests = this.counts.get(key) ?? 0;
      if (requests === 0) continue;
      const limit = budget === null ? null : Number(budget.split('/')[0]);
      scopes[prefix] = {
        requests,
        budget: budget ?? 'exempt',
        headroom: limit === null ? null : limit - requests,
      };
    }
    const userScopes: Record<string, { requests: number; budget: string; headroom: number }> = {};
    for (const [scope, budget] of Object.entries(DOCUMENT_USER_SCOPES)) {
      const requests = this.userCounts.get(scope) ?? 0;
      if (requests === 0) continue;
      userScopes[scope] = { requests, budget, headroom: Number(budget.split('/')[0]) - requests };
    }
    return { spec: this.specName, middlewareScopes: scopes, documentUserScopes: userScopes };
  }

  /**
   * Append this spec's counts to `rate-limit-headroom.json` in the evidence directory.
   * Workers run one spec at a time (`workers: 1`), so read-modify-write is safe.
   */
  write(): string {
    const dir = evidenceDir('journey-gate');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'rate-limit-headroom.json');
    let existing: { specs: unknown[] } = { specs: [] };
    try {
      existing = JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      /* first writer */
    }
    existing.specs = [...(existing.specs ?? []).filter((s) => (s as { spec?: string }).spec !== this.specName), this.toJSON()];
    writeFileSync(file, JSON.stringify(existing, null, 2));
    return file;
  }
}
