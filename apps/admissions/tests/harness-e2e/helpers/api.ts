/**
 * API test helpers for the V2 harness (task 0.4 deliverable #2).
 *
 * These provision fresh users and resolve/create tenants purely over HTTP with
 * NO stored storageState and NO production credentials. Each helper builds an
 * isolated APIRequestContext (its own cookie jar), so nothing leaks between
 * tests and there is no reliance on a captured logged-in session.
 *
 * Tenant host resolution goes through the harness edge on a per-tenant host
 * (e.g. http://mihas.localhost:8090) so the backend resolves the tenant from
 * the real request Host — no Host-header spoofing required. *.localhost
 * resolves to loopback in Chromium/Node without any /etc/hosts editing.
 */
import { request as playwrightRequest, type APIRequestContext, expect } from '@playwright/test';

const EDGE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8090';
const EDGE_PORT = new URL(EDGE).port || '8090';

export const SUPERADMIN_EMAIL =
  process.env.HARNESS_SUPERADMIN_EMAIL || 'platform-admin@harness.beanola.local';
export const SUPERADMIN_PASSWORD =
  process.env.HARNESS_SUPERADMIN_PASSWORD || 'HarnessPlatform123!';

/** Neutral (shared-portal) origin. */
export function neutralOrigin(): string {
  return EDGE;
}

/** The edge origin for a given tenant host (e.g. 'mihas.localhost'). */
export function tenantOrigin(host: string): string {
  return `http://${host}:${EDGE_PORT}`;
}

/** A fresh, isolated request context (own cookie jar, no storageState). */
export async function freshContext(baseURL: string = EDGE): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL, ignoreHTTPSErrors: true });
}

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/** Register a brand-new student and log them in. Returns the authed context. */
export async function registerAndLoginStudent(): Promise<{
  ctx: APIRequestContext;
  email: string;
  password: string;
}> {
  const ctx = await freshContext(EDGE);
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const email = `harness.student.${stamp}@example.com`;
  const password = 'HarnessStudent123';

  const reg = await ctx.post('/api/v1/auth/register/', {
    data: { email, password, first_name: 'Harness', last_name: 'Student' },
  });
  expect(
    reg.ok(),
    `register should succeed for a fresh user (got ${reg.status()}: ${await reg.text()})`,
  ).toBeTruthy();

  const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
  expect(
    login.ok(),
    `login should succeed for the fresh user (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();

  // The session endpoint should now report the authenticated identity.
  const session = await ctx.get('/api/v1/auth/session/');
  expect(session.ok(), 'session should be authenticated after login').toBeTruthy();

  return { ctx, email, password };
}

/** An authenticated context plus the CSRF token to send on state-changing calls. */
export interface AuthedContext {
  ctx: APIRequestContext;
  csrf: string;
}

/**
 * Log in as the bootstrapped platform super-admin.
 *
 * The platform delivers the CSRF token in the `X-CSRF-Token` response header
 * (the frontend keeps it in memory — there is no CSRF cookie). We capture it so
 * state-changing admin calls can echo it back as `x-csrf-token`.
 */
export async function superAdminContext(): Promise<AuthedContext> {
  const ctx = await freshContext(EDGE);
  const login = await ctx.post('/api/v1/auth/login/', {
    data: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD },
  });
  expect(
    login.ok(),
    `super-admin login should succeed (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();
  return { ctx, csrf };
}

export interface TenantContext {
  portal_type: string;
  institution_id: string | null;
  institution_code: string | null;
  brand: unknown;
}

/** Resolve the tenant context the backend binds for a given host. */
export async function resolveTenant(host: string): Promise<TenantContext> {
  const ctx = await freshContext(tenantOrigin(host));
  const resp = await ctx.get('/api/v1/catalog/context/');
  expect(resp.ok(), `catalog context should resolve for ${host}`).toBeTruthy();
  const data = unwrap(await resp.json());
  await ctx.dispose();
  return data as TenantContext;
}

/**
 * Create an institution (+ a pending domain) via the admin API as the
 * super-admin. Proves the API-driven tenant-creation path works as far as the
 * current backend supports it (domain verify→activate lifecycle lands in
 * Phase 4 — findings TEN-01..04). Returns the created institution id.
 */
export async function createInstitutionViaApi(
  admin: AuthedContext,
  spec: { name: string; code: string; hostname: string },
): Promise<{ institutionId: string }> {
  const headers = { 'x-csrf-token': admin.csrf };
  const create = await admin.ctx.post('/api/v1/admin/institutions/', {
    headers,
    data: {
      name: spec.name,
      code: spec.code,
      full_name: `${spec.name} (harness API tenant)`,
      slug: spec.code.toLowerCase(),
    },
  });
  expect(
    create.ok(),
    `admin institution create should succeed (got ${create.status()}: ${await create.text()})`,
  ).toBeTruthy();
  const institution = unwrap(await create.json());
  const institutionId = institution?.id;
  expect(institutionId, 'created institution should have an id').toBeTruthy();

  // Register a domain for the new tenant (verification/activation lifecycle is
  // Phase 4 — here we only prove the create endpoint accepts it).
  const domain = await admin.ctx.post(`/api/v1/admin/institutions/${institutionId}/domains/`, {
    headers,
    data: { hostname: spec.hostname, is_primary: true },
  });
  expect(
    [200, 201].includes(domain.status()),
    `admin domain create should be accepted (got ${domain.status()}: ${await domain.text()})`,
  ).toBeTruthy();

  return { institutionId };
}

// ---------------------------------------------------------------------------
// Canonical catalogue config helpers (task 4.3 — real onboarding mutations)
//
// These exercise the SAME canonical write endpoints the onboarding wizard's
// program / intake / fee steps call, so the harness proves a clean tenant is
// configured to launch-readiness purely through the API — no seed-specific IDs
// and no pre-linked offerings (R4.7). Every id used is fetched or returned by a
// create call, never hardcoded.
// ---------------------------------------------------------------------------

/** Fetch the platform canonical-program catalogue (seeded by harness_bootstrap). */
export async function listCanonicalPrograms(admin: AuthedContext): Promise<any[]> {
  const resp = await admin.ctx.get('/api/v1/catalog/canonical-programs/');
  expect(resp.ok(), `canonical-programs list should succeed (got ${resp.status()})`).toBeTruthy();
  const data = unwrap(await resp.json());
  // The response is `{ programs: [...] }` (normalised) or a paginated envelope.
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.programs)) return data.programs;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

/** Create a global intake period (POST /catalog/intakes/). Returns its id. */
export async function createIntake(
  admin: AuthedContext,
  spec: { name: string; year: number },
): Promise<{ intakeId: string }> {
  const resp = await admin.ctx.post('/api/v1/catalog/intakes/', {
    headers: { 'x-csrf-token': admin.csrf },
    data: {
      name: spec.name,
      year: spec.year,
      max_capacity: 100,
      is_active: true,
      application_deadline: `${spec.year}-06-30`,
    },
  });
  expect(
    [200, 201].includes(resp.status()),
    `intake create should succeed (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
  const intake = unwrap(await resp.json());
  const intakeId = intake?.id;
  expect(intakeId, 'created intake should have an id').toBeTruthy();
  return { intakeId };
}

/**
 * Assign a canonical program to a tenant, creating an
 * Institution_Program_Offering (POST /catalog/programs/). The canonical program
 * id is the only write authority (TEN-03). Returns the created offering id.
 */
export async function assignOffering(
  admin: AuthedContext,
  institutionId: string,
  spec: { canonical_program_id: string; name: string; code: string },
): Promise<{ offeringId: string }> {
  const resp = await admin.ctx.post('/api/v1/catalog/programs/', {
    headers: { 'x-csrf-token': admin.csrf },
    data: {
      institution_id: institutionId,
      canonical_program_id: spec.canonical_program_id,
      name: spec.name,
      code: spec.code,
      offering_status: 'active',
    },
  });
  expect(
    [200, 201].includes(resp.status()),
    `offering assign should succeed (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
  const offering = unwrap(await resp.json());
  const offeringId = offering?.id;
  expect(offeringId, 'created offering should have an id').toBeTruthy();
  return { offeringId };
}

/** Link an offering to an intake with a seat capacity (POST /admin/program-intakes/). */
export async function linkIntake(
  admin: AuthedContext,
  spec: { program_id: string; intake_id: string; max_capacity: number },
): Promise<{ programIntakeId: string }> {
  const resp = await admin.ctx.post('/api/v1/admin/program-intakes/', {
    headers: { 'x-csrf-token': admin.csrf },
    data: spec,
  });
  expect(
    [200, 201].includes(resp.status()),
    `intake link should succeed (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
  const pi = unwrap(await resp.json());
  expect(pi?.id, 'created program-intake should have an id').toBeTruthy();
  return { programIntakeId: pi.id };
}

/** Configure a canonical application fee for an offering (POST /programs/{id}/fees/). */
export async function createFee(
  admin: AuthedContext,
  programId: string,
  spec: { amount: string; residency_category?: string; fee_type?: string; currency?: string },
): Promise<void> {
  const resp = await admin.ctx.post(`/api/v1/programs/${programId}/fees/`, {
    headers: { 'x-csrf-token': admin.csrf },
    data: {
      fee_type: spec.fee_type ?? 'application',
      residency_category: spec.residency_category ?? 'local',
      amount: spec.amount,
      currency: spec.currency ?? 'ZMW',
    },
  });
  expect(
    [200, 201].includes(resp.status()),
    `fee create should succeed (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
}

// ---------------------------------------------------------------------------
// Student application setup (task 8.3 — payment ownership-split journeys)
//
// The payment ownership split (R12.3) is about which surface owns which payment
// state AFTER submission, so a submitted application is the journey's *setup*,
// not its claim. These helpers reach that starting position through the same
// canonical HTTP commands a student and a platform admin use — no seeded ids, no
// direct database writes, no fixture file.
// ---------------------------------------------------------------------------

export interface DraftApplicationSpec {
  /** Canonical program id (the only write authority — TEN-03/DATA-01). */
  canonicalProgramId: string;
  intakeId: string;
  fullName?: string;
  email: string;
  /** Zambian MSISDN. The mobile-money journeys steer the adapter with this. */
  phone?: string;
  /**
   * NRC in the platform's own `123456/78/9` format.
   *
   * Required, not decorative: `readiness_service.evaluate_profile` treats
   * "NRC or passport number" as a submission blocker, and `admin_force` bypasses
   * only the payment and identity-**document** gates — never profile
   * completeness. A draft without one cannot reach `submitted`, so a payment
   * journey that starts after submission cannot be set up without it.
   */
  nrcNumber?: string;
}

/**
 * A unique, format-valid NRC.
 *
 * `validate_nrc` enforces `^\d{6}/\d{2}/\d$`, and every journey registers its own
 * student, so the value only has to be well-formed and distinct enough not to
 * collide with another journey's applicant.
 */
function harnessNrc(): string {
  const six = `${Date.now()}`.slice(-6);
  const two = `${Math.floor(Math.random() * 90) + 10}`;
  return `${six}/${two}/${Math.floor(Math.random() * 10)}`;
}

/**
 * Create a `draft` Application for the authenticated student through
 * `POST /api/v1/applications/`, using canonical ids so the backend resolves the
 * assignment snapshot itself. Returns the application id, which is also the
 * canonical draft id.
 */
export async function createDraftApplication(
  ctx: APIRequestContext,
  csrf: string,
  spec: DraftApplicationSpec,
): Promise<{ applicationId: string }> {
  const resp = await ctx.post('/api/v1/applications/', {
    headers: { 'x-csrf-token': csrf },
    data: {
      full_name: spec.fullName ?? 'Harness Student',
      nrc_number: spec.nrcNumber ?? harnessNrc(),
      date_of_birth: '2004-05-04',
      sex: 'male',
      phone: spec.phone ?? '+260971234567',
      email: spec.email,
      residence_town: 'Lusaka',
      country: 'Zambia',
      nationality: 'Zambian',
      program_id: spec.canonicalProgramId,
      intake_id: spec.intakeId,
    },
  });
  expect(
    [200, 201].includes(resp.status()),
    `application create should succeed (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
  const application = unwrap(await resp.json());
  const applicationId = application?.id;
  expect(applicationId, 'created application should have an id').toBeTruthy();
  return { applicationId };
}

/**
 * Move a draft to `submitted` through the platform's own review command
 * (`POST /api/v1/applications/{id}/review/` with `new_status: 'submitted'`,
 * which calls `submit_application(admin_force=True)`).
 *
 * This is journey **setup**: it puts the student past the wizard so the payment
 * page owns the state, without re-walking the grade/document evidence gates that
 * tasks 6.5 / 7.2 already prove. It is a real capability-gated command, not a
 * test-only shortcut, and it does not touch the payment ledger.
 */
export async function forceSubmitApplication(
  admin: AuthedContext,
  applicationId: string,
): Promise<void> {
  const resp = await admin.ctx.post(`/api/v1/applications/${applicationId}/review/`, {
    headers: { 'x-csrf-token': admin.csrf },
    data: { new_status: 'submitted', notes: 'harness 8.3 payment-journey setup' },
  });
  expect(
    resp.ok(),
    `admin submit should succeed (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
}

/**
 * Persist the configured minimum of unique Grade 12 results for a draft.
 *
 * The subjects come from the canonical catalog (`GET /api/v1/catalog/subjects/`),
 * never from a hardcoded name or a seeded id, and go in through the student's own
 * batch endpoint. Five is the ECZ floor `readiness_service` enforces
 * (`DEFAULT_MINIMUM_PERSISTED_GRADES`, R11.5).
 */
export async function persistMinimumGrades(
  ctx: APIRequestContext,
  csrf: string,
  applicationId: string,
  count = 5,
): Promise<number> {
  const list = await ctx.get('/api/v1/catalog/subjects/?pageSize=100');
  expect(list.ok(), `subject catalog should be readable (got ${list.status()})`).toBeTruthy();
  const payload = unwrap(await list.json());
  const rows: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.subjects)
        ? payload.subjects
        : [];
  // Curriculum group rows carry no id and are not selectable.
  const subjects = rows.filter((row) => row?.id).slice(0, count);
  expect(
    subjects.length,
    `the catalog should publish at least ${count} selectable subjects (got ${subjects.length})`,
  ).toBe(count);

  const resp = await ctx.post(`/api/v1/applications/${applicationId}/grades/`, {
    headers: { 'x-csrf-token': csrf },
    // Grade 4 is a real pass on the ECZ 1-9 scale.
    data: { grades: subjects.map((subject) => ({ subject_id: subject.id, grade: 4 })) },
  });
  expect(
    resp.ok(),
    `grade batch should be accepted (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
  return subjects.length;
}

/**
 * Upload one document of `documentType` for a draft through the real upload
 * endpoint (magic-byte validation, MinIO write, `ApplicationDocument` row).
 *
 * A 1x1 PNG: real bytes that pass validation, with nothing in them.
 */
export async function uploadDocument(
  ctx: APIRequestContext,
  csrf: string,
  applicationId: string,
  documentType: 'result_slip' | 'extra_kyc' | 'nrc' | 'passport',
): Promise<void> {
  const resp = await ctx.post('/api/v1/documents/upload/', {
    headers: { 'x-csrf-token': csrf },
    multipart: {
      application_id: applicationId,
      document_type: documentType,
      file: {
        name: `${documentType}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
          'base64',
        ),
      },
    },
  });
  expect(
    resp.ok(),
    `${documentType} upload should be accepted (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
}

/** Read the canonical payment rows for one application as the signed-in student. */
export async function readPaymentRows(
  ctx: APIRequestContext,
  applicationId: string,
): Promise<any[]> {
  const resp = await ctx.get(`/api/v1/payments/?application_id=${applicationId}`);
  expect(resp.ok(), `payment list should succeed (got ${resp.status()})`).toBeTruthy();
  const data = unwrap(await resp.json());
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

/** List a tenant's offerings through the tenant-scoped admin child endpoint. */
export async function listTenantOfferings(admin: AuthedContext, institutionId: string): Promise<any[]> {
  const resp = await admin.ctx.get(`/api/v1/admin/institutions/${institutionId}/programs/?pageSize=200`);
  expect(resp.ok(), `tenant offerings list should succeed (got ${resp.status()})`).toBeTruthy();
  const data = unwrap(await resp.json());
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}
