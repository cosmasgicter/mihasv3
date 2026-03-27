/**
 * End-to-End API Test Script
 * 
 * Tests all MIHAS API endpoints by calling the bundled handlers directly
 * with mock Vercel Request/Response objects. Bypasses Arcjet by unsetting
 * ARCJET_KEY so the security layer is skipped (development mode).
 * 
 * Usage: ARCJET_KEY= bun run scripts/e2e-api-test.ts
 */

import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';

// ─── Colors ──────────────────────────────────────────────────────────
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

let PASS = 0;
let FAIL = 0;
let WARN = 0;
let SKIP = 0;

// Store auth cookies/tokens for authenticated tests
let authCookies: string[] = [];
let csrfToken = '';
let loggedInUserId = '';

// ─── Mock Vercel Request/Response ────────────────────────────────────

function createMockReq(options: {
  method: string;
  url: string;
  body?: any;
  headers?: Record<string, string>;
  cookies?: string[];
}): any {
  const parsedUrl = new URL(options.url, 'http://localhost:3000');
  const query: Record<string, string> = {};
  parsedUrl.searchParams.forEach((v, k) => { query[k] = v; });

  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options.method;
  req.url = parsedUrl.pathname + parsedUrl.search;
  req.headers = {
    'content-type': 'application/json',
    'origin': 'http://localhost:3000',
    'user-agent': 'MIHAS-E2E-Test/1.0',
    ...(options.headers || {}),
  };

  if (options.cookies?.length) {
    req.headers.cookie = options.cookies.join('; ');
  }

  // Vercel-specific properties
  const vercelReq = req as any;
  vercelReq.query = query;
  vercelReq.body = options.body || null;
  vercelReq.cookies = {};

  if (options.cookies?.length) {
    for (const c of options.cookies) {
      const [name, ...rest] = c.split('=');
      vercelReq.cookies[name.trim()] = rest.join('=').split(';')[0].trim();
    }
  }

  return vercelReq;
}

function createMockRes(): any {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let responseBody: any = null;
  let ended = false;

  const res: any = {
    statusCode,
    _headers: headers,
    _statusCode: 200,
    _body: null,
    _ended: false,

    status(code: number) {
      res._statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    json(data: any) {
      res._body = data;
      res._ended = true;
      return res;
    },
    send(data: any) {
      res._body = data;
      res._ended = true;
      return res;
    },
    end() {
      res._ended = true;
      return res;
    },
    write(data: any) {
      if (!res._body) res._body = '';
      res._body += data;
      return true;
    },
  };

  return res;
}

// ─── Test Helpers ────────────────────────────────────────────────────

async function callHandler(
  handlerPath: string,
  method: string,
  url: string,
  body?: any,
  extraHeaders?: Record<string, string>,
  useCookies = false
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const mod = await import(`../api/${handlerPath}.js`);
  const handler = mod.default;

  const headers: Record<string, string> = { ...(extraHeaders || {}) };
  const cookies = useCookies ? authCookies : [];

  if (useCookies && csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['x-csrf-token'] = csrfToken;
  }

  const req = createMockReq({ method, url, body, headers, cookies });
  const res = createMockRes();

  try {
    await handler(req, res);
  } catch (err: any) {
    return {
      status: 500,
      body: { success: false, error: err.message, code: 'HANDLER_ERROR' },
      headers: res._headers,
    };
  }

  return {
    status: res._statusCode,
    body: res._body,
    headers: res._headers,
  };
}

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`${GREEN}[PASS]${NC} ${label}`);
    PASS++;
  } else {
    console.log(`${RED}[FAIL]${NC} ${label}`);
    if (detail) console.log(`       ${detail}`);
    FAIL++;
  }
}

function warn(label: string, detail?: string) {
  console.log(`${YELLOW}[WARN]${NC} ${label}`);
  if (detail) console.log(`       ${detail}`);
  WARN++;
}

function skip(label: string, reason?: string) {
  console.log(`${CYAN}[SKIP]${NC} ${label}${reason ? ` — ${reason}` : ''}`);
  SKIP++;
}

function truncate(obj: any, maxLen = 200): string {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

// ─── Test Suites ─────────────────────────────────────────────────────

async function testHealthEndpoints() {
  console.log(`\n${CYAN}━━━ 1. HEALTH ENDPOINTS ━━━${NC}`);

  let r = await callHandler('health', 'GET', '/api/health?action=ping');
  check('Health: Ping', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('health', 'GET', '/api/health');
  check('Health: Default', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('health', 'GET', '/api/health?action=db');
  check('Health: DB Check', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('health', 'GET', '/api/health?action=env');
  check('Health: Env Check', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('health', 'GET', '/api/health?action=errors');
  check('Health: Error Logs', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('health', 'GET', '/api/health?action=bogus');
  check('Health: Invalid Action → 400', r.status === 400 && r.body?.success === false, truncate(r.body));

  r = await callHandler('health', 'POST', '/api/health?action=ping');
  check('Health: Wrong Method → 405', r.status === 405 && r.body?.success === false, truncate(r.body));
}

async function testCatalogEndpoints() {
  console.log(`\n${CYAN}━━━ 2. CATALOG ENDPOINTS ━━━${NC}`);

  let r = await callHandler('catalog', 'GET', '/api/catalog?type=programs');
  check('Catalog: Programs', r.status === 200 && r.body?.success === true, truncate(r.body));
  const programs = r.body?.data?.programs;
  if (programs?.length) {
    console.log(`       → ${programs.length} programs found`);
  }

  r = await callHandler('catalog', 'GET', '/api/catalog?type=intakes');
  check('Catalog: Intakes', r.status === 200 && r.body?.success === true, truncate(r.body));
  const intakes = r.body?.data?.intakes;
  if (intakes?.length) {
    console.log(`       → ${intakes.length} intakes found`);
  }

  r = await callHandler('catalog', 'GET', '/api/catalog?type=subjects');
  check('Catalog: Subjects', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('catalog', 'GET', '/api/catalog?type=institutions');
  check('Catalog: Institutions', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('catalog', 'GET', '/api/catalog?type=invalid');
  check('Catalog: Invalid Type → 400', r.status === 400, truncate(r.body));

  r = await callHandler('catalog', 'GET', '/api/catalog');
  check('Catalog: Missing Type → defaults to programs (200)', r.status === 200 && r.body?.success === true, truncate(r.body));
}

async function testAuthUnauthenticated() {
  console.log(`\n${CYAN}━━━ 3. AUTH ENDPOINTS (Unauthenticated) ━━━${NC}`);

  let r = await callHandler('auth', 'GET', '/api/auth?action=session');
  check('Auth: Session (no cookie) → 200 with null user', r.status === 200 && r.body?.data?.user === null, truncate(r.body));

  r = await callHandler('auth', 'POST', '/api/auth?action=login', { email: 'nonexistent@test.com', password: 'wrongpassword123' });
  check('Auth: Login bad creds → 401', r.status === 401, truncate(r.body));

  r = await callHandler('auth', 'POST', '/api/auth?action=login', { email: 'test@test.com' });
  check('Auth: Login missing password → 400', r.status === 400, truncate(r.body));

  r = await callHandler('auth', 'POST', '/api/auth?action=login', {});
  check('Auth: Login empty body → 400', r.status === 400, truncate(r.body));

  r = await callHandler('auth', 'POST', '/api/auth?action=register', { email: 'test@test.com' });
  check('Auth: Register missing fields → 400', r.status === 400, truncate(r.body));

  r = await callHandler('auth', 'GET', '/api/auth?action=bogus');
  check('Auth: Invalid action → 400', r.status === 400, truncate(r.body));

  r = await callHandler('auth', 'POST', '/api/auth?action=password-reset-request', { email: 'nonexistent@test.com' });
  check('Auth: Password Reset Request (always 200)', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('auth', 'POST', '/api/auth?action=password-reset', { token: 'invalidtoken123', newPassword: 'NewPass123!' });
  check('Auth: Password Reset bad token → 400', r.status === 400 && r.body?.code === 'INVALID_TOKEN', truncate(r.body));

  r = await callHandler('auth', 'POST', '/api/auth?action=logout');
  check('Auth: Logout (no session) → 200', r.status === 200, truncate(r.body));

  // SQL injection attempt
  r = await callHandler('auth', 'POST', '/api/auth?action=login', { email: "admin' OR 1=1 --", password: 'test' });
  check('Auth: SQL injection attempt → rejected', r.status === 401 || r.status === 400, truncate(r.body));
}

async function testProtectedEndpointsNoAuth() {
  console.log(`\n${CYAN}━━━ 4. PROTECTED ENDPOINTS (No Auth → 401) ━━━${NC}`);

  let r = await callHandler('applications', 'GET', '/api/applications?action=details');
  check('Applications: List (no auth) → 401', r.status === 401, truncate(r.body));

  r = await callHandler('admin', 'GET', '/api/admin?action=dashboard');
  check('Admin: Dashboard (no auth) → 401/403', r.status === 401 || r.status === 403, truncate(r.body));

  r = await callHandler('admin', 'GET', '/api/admin?action=users');
  check('Admin: Users (no auth) → 401/403', r.status === 401 || r.status === 403, truncate(r.body));

  r = await callHandler('sessions', 'GET', '/api/sessions?action=list');
  check('Sessions: List (no auth) → 401', r.status === 401 || r.status === 400, truncate(r.body));

  r = await callHandler('notifications', 'GET', '/api/notifications?action=list');
  check('Notifications: List (no auth) → 401', r.status === 401, truncate(r.body));

  r = await callHandler('payments', 'GET', '/api/payments?action=receipt');
  check('Payments: Receipt (no auth) → 401', r.status === 401 || r.status === 400, truncate(r.body));
}

async function testApplicationTracking() {
  console.log(`\n${CYAN}━━━ 5. APPLICATION TRACKING (Public) ━━━${NC}`);

  let r = await callHandler('applications', 'GET', '/api/applications?action=track&code=MIHAS000000');
  check('Track: Non-existent code → 404', r.status === 404, truncate(r.body));

  r = await callHandler('applications', 'GET', '/api/applications?action=track&code=');
  check('Track: Empty code → 400', r.status === 400, truncate(r.body));

  r = await callHandler('applications', 'GET', '/api/applications?action=track&code=!!invalid!!');
  check('Track: Invalid format → 400', r.status === 400, truncate(r.body));
}

async function testAuthenticatedFlow() {
  console.log(`\n${CYAN}━━━ 6. AUTHENTICATED FLOW ━━━${NC}`);
  console.log('   (Generating test tokens for super_admin...)');

  // Use the real super_admin account from the database
  const testUserId = 'fc6a1536-2e5c-4099-9b9e-a38653408f95';
  const testEmail = 'cosmas@beanola.com';
  const testRole = 'super_admin';

  const { generateAccessToken, generateRefreshToken } = await import('../lib/auth/jwt.js');
  const { getPermissionsForRole } = await import('../lib/auth/permissions.js');

  let userData: any;
  try {
    const permissions = getPermissionsForRole(testRole as any);
    const accessToken = await generateAccessToken(testUserId, testEmail, testRole as any, permissions);
    const refreshToken = await generateRefreshToken(testUserId);

    authCookies = [
      `access_token=${accessToken}`,
      `refresh_token=${refreshToken}`,
    ];
    loggedInUserId = testUserId;
    userData = { id: testUserId, email: testEmail, role: testRole, permissions };

    check('Auth: Token generation for super_admin', true);
    console.log(`       → User: ${testEmail} (${testRole})`);
  } catch (err: any) {
    warn('Token generation failed — skipping authenticated tests', err.message);
    return;
  }

  // ── Session check ──
  let r = await callHandler('auth', 'GET', '/api/auth?action=session', undefined, undefined, true);
  check('Auth: Session (authenticated)', r.status === 200 && r.body?.success === true, truncate(r.body));

  // ── Admin endpoints ──
  console.log(`\n   ${CYAN}── Admin Endpoints ──${NC}`);

  r = await callHandler('admin', 'GET', '/api/admin?action=dashboard', undefined, undefined, true);
  check('Admin: Dashboard', r.status === 200 && r.body?.success === true, truncate(r.body));
  if (r.body?.data?.stats) {
    const s = r.body.data.stats;
    console.log(`       → Total: ${s.totalApplications}, Pending: ${s.pendingApplications}, Approved: ${s.approvedApplications}`);
  }

  r = await callHandler('admin', 'GET', '/api/admin?action=users', undefined, undefined, true);
  check('Admin: Users List', r.status === 200 && r.body?.success === true, truncate(r.body));
  if (r.body?.data?.totalCount !== undefined) {
    console.log(`       → ${r.body.data.totalCount} users total`);
  }

  r = await callHandler('admin', 'GET', '/api/admin?action=settings', undefined, undefined, true);
  check('Admin: Settings', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('admin', 'GET', '/api/admin?action=stats', undefined, undefined, true);
  check('Admin: Stats', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('admin', 'GET', '/api/admin?action=audit-log', undefined, undefined, true);
  check('Admin: Audit Log', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('admin', 'GET', '/api/admin?action=schema&table=profiles', undefined, undefined, true);
  check('Admin: Schema', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('admin', 'GET', '/api/admin?action=eligibility-rules', undefined, undefined, true);
  check('Admin: Eligibility Rules', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('admin', 'GET', '/api/admin?action=nonexistent', undefined, undefined, true);
  check('Admin: Invalid Action → 400', r.status === 400, truncate(r.body));

  // ── Application endpoints ──
  console.log(`\n   ${CYAN}── Application Endpoints ──${NC}`);

  r = await callHandler('applications', 'GET', '/api/applications?action=details', undefined, undefined, true);
  check('Applications: List', r.status === 200 && r.body?.success === true, truncate(r.body));
  const apps = r.body?.data?.applications || [];
  console.log(`       → ${apps.length} applications (page 1)`);

  r = await callHandler('applications', 'GET', '/api/applications?action=review', undefined, undefined, true);
  check('Applications: Review List', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('applications', 'GET', '/api/applications?action=summary', undefined, undefined, true);
  check('Applications: Summary', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('applications', 'GET', '/api/applications?action=stats', undefined, undefined, true);
  check('Applications: Stats', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('applications', 'GET', '/api/applications?action=nonexistent', undefined, undefined, true);
  check('Applications: Invalid Action → 400', r.status === 400, truncate(r.body));

  // Invalid UUID
  r = await callHandler('applications', 'GET', '/api/applications?id=not-a-uuid', undefined, undefined, true);
  check('Applications: Invalid UUID → 400', r.status === 400, truncate(r.body));

  // ── Approval Flow ──
  console.log(`\n   ${CYAN}── Approval Flow ──${NC}`);

  // Find a submitted application
  r = await callHandler('applications', 'GET', '/api/applications?action=details&status=submitted&pageSize=1', undefined, undefined, true);
  const submittedApps = r.body?.data?.applications || [];

  if (submittedApps.length > 0) {
    const appId = submittedApps[0].id;
    const appNum = submittedApps[0].application_number;
    console.log(`       → Testing with application: ${appNum} (${appId.slice(0, 8)}...)`);

    // Approve (may get payment warning)
    r = await callHandler('applications', 'POST', '/api/applications?action=review', {
      application_id: appId,
      status: 'approved',
      notes: 'E2E test approval',
    }, undefined, true);

    if (r.body?.data?.warning) {
      check('Approval: Payment warning returned (expected)', true);
      console.log(`       → ${r.body.data.message}`);

      // Force approve
      r = await callHandler('applications', 'POST', '/api/applications?action=review', {
        application_id: appId,
        status: 'approved',
        notes: 'E2E test force approval',
        force: true,
      }, undefined, true);
      check('Approval: Force approve (payment override)', r.status === 200 && r.body?.success === true, truncate(r.body));
    } else {
      check('Approval: Direct approve', r.status === 200 && r.body?.success === true, truncate(r.body));
    }

    // Verify status
    r = await callHandler('applications', 'GET', `/api/applications?id=${appId}`, undefined, undefined, true);
    const currentStatus = r.body?.data?.status;
    check('Approval: Status verified', currentStatus === 'approved', `status=${currentStatus}`);

    // Reject back to submitted (cleanup)
    r = await callHandler('applications', 'POST', '/api/applications?action=review', {
      application_id: appId,
      status: 'submitted',
      notes: 'E2E test cleanup — reverting to submitted',
    }, undefined, true);
    check('Approval: Revert to submitted (cleanup)', r.status === 200 && r.body?.success === true, truncate(r.body));

    // Verify reverted
    r = await callHandler('applications', 'GET', `/api/applications?id=${appId}`, undefined, undefined, true);
    check('Approval: Revert verified', r.body?.data?.status === 'submitted', `status=${r.body?.data?.status}`);
  } else {
    // Try with any application
    const anyApps = r.body?.data?.applications || apps;
    if (anyApps.length > 0) {
      const appId = anyApps[0].id;
      console.log(`       → No submitted apps. Testing GET by ID with: ${appId.slice(0, 8)}...`);

      r = await callHandler('applications', 'GET', `/api/applications?id=${appId}`, undefined, undefined, true);
      check('Applications: Get by ID', r.status === 200 && r.body?.success === true, truncate(r.body));
    } else {
      skip('Approval Flow', 'No applications in database');
    }
  }

  // ── Session endpoints ──
  console.log(`\n   ${CYAN}── Session Endpoints ──${NC}`);

  r = await callHandler('sessions', 'GET', '/api/sessions?action=list', undefined, undefined, true);
  check('Sessions: List', r.status === 200 && r.body?.success === true, truncate(r.body));
  if (r.body?.data?.count !== undefined) {
    console.log(`       → ${r.body.data.count} active sessions`);
  }

  r = await callHandler('sessions', 'GET', '/api/sessions?action=poll', undefined, undefined, true);
  check('Sessions: Poll', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('sessions', 'GET', '/api/sessions?action=nonexistent', undefined, undefined, true);
  check('Sessions: Invalid Action → 400', r.status === 400, truncate(r.body));

  // ── Notification endpoints ──
  console.log(`\n   ${CYAN}── Notification Endpoints ──${NC}`);

  r = await callHandler('notifications', 'GET', '/api/notifications?action=preferences', undefined, undefined, true);
  check('Notifications: Preferences', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('notifications', 'GET', '/api/notifications?action=list', undefined, undefined, true);
  check('Notifications: List', r.status === 200 && r.body?.success === true, truncate(r.body));

  r = await callHandler('notifications', 'GET', '/api/notifications?action=nonexistent', undefined, undefined, true);
  check('Notifications: Invalid Action → 400', r.status === 400, truncate(r.body));

  // ── Payment endpoints ──
  console.log(`\n   ${CYAN}── Payment Endpoints ──${NC}`);

  r = await callHandler('payments', 'GET', '/api/payments?action=receipt', undefined, undefined, true);
  check('Payments: Receipt (missing ID) → 400', r.status === 400, truncate(r.body));

  r = await callHandler('payments', 'GET', '/api/payments?action=bogus', undefined, undefined, true);
  check('Payments: Invalid Action → 400', r.status === 400, truncate(r.body));

  // ── Document endpoints ──
  console.log(`\n   ${CYAN}── Document Endpoints ──${NC}`);

  r = await callHandler('documents', 'GET', '/api/documents?action=bogus', undefined, undefined, true);
  check('Documents: Invalid Action → 400', r.status === 400, truncate(r.body));

  // ── Logout ──
  console.log(`\n   ${CYAN}── Logout ──${NC}`);

  r = await callHandler('auth', 'POST', '/api/auth?action=logout', undefined, undefined, true);
  check('Auth: Logout', r.status === 200 && r.body?.success === true, truncate(r.body));
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   MIHAS API End-to-End Test Suite            ║');
  console.log('║   Direct handler invocation (no Arcjet)      ║');
  console.log(`║   ${new Date().toISOString()}       ║`);
  console.log('╚══════════════════════════════════════════════╝');

  const startTime = Date.now();

  try {
    await testHealthEndpoints();
    await testCatalogEndpoints();
    await testAuthUnauthenticated();
    await testProtectedEndpointsNoAuth();
    await testApplicationTracking();
    await testAuthenticatedFlow();
  } catch (err: any) {
    console.error(`\n${RED}FATAL ERROR:${NC} ${err.message}`);
    console.error(err.stack);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   TEST RESULTS                               ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║   ${GREEN}PASSED:   ${String(PASS).padStart(3)}${NC}                              ║`);
  console.log(`║   ${RED}FAILED:   ${String(FAIL).padStart(3)}${NC}                              ║`);
  console.log(`║   ${YELLOW}WARNINGS: ${String(WARN).padStart(3)}${NC}                              ║`);
  console.log(`║   ${CYAN}SKIPPED:  ${String(SKIP).padStart(3)}${NC}                              ║`);
  console.log(`║   TOTAL:    ${String(PASS + FAIL + WARN + SKIP).padStart(3)}                              ║`);
  console.log(`║   TIME:     ${elapsed}s                            ║`);
  console.log('╚══════════════════════════════════════════════╝');

  process.exit(FAIL > 0 ? 1 : 0);
}

main();
