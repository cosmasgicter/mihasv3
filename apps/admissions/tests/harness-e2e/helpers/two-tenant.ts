/**
 * The two-tenant *name-collision* world (admissions-v2 task **13.2**).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, second bullet —
 * "**Same program/intake names**: host override, routing, drafts, grades, custom
 * docs, capacity, waitlist/promotion, payment, amendments, notifications, review,
 * official documents, audit, settlement, and public tracking remain isolated."
 * Requirements: **R18**. Steering: `.kiro/steering/enterprise-tenancy.md`
 * (scope before lookup, masked 404, fail-closed domain resolution, neutral
 * Beanola fallback).
 *
 * ## The collision is the experiment, not a detail of the fixture
 *
 * `harness_seed_tenants` deliberately gives its two tenants *distinguishable*
 * names — `MIHAS — Diploma in Registered Nursing` on `MIHAS January 2027`, and the
 * KATC equivalents. That is the right default for every other required journey,
 * and it is precisely the wrong default for this one: a lookup that resolves a
 * tenant-sensitive row **by display name** cannot cross tenants while the names
 * differ, so a matrix built on the seed as-shipped would report isolation it never
 * tested.
 *
 * So this builder adds, to the two **seeded** tenants:
 *
 * * one offering each carrying the **identical `name`** (`Program.name` has no
 *   unique constraint; `Program.code` does, so only the codes differ), both
 *   pointing at the **same** `CanonicalProgram`; and
 * * one intake each carrying the **identical `name`** (`Intake.name` has no unique
 *   constraint either) with **deliberately different `max_capacity`** values, so
 *   that a name-keyed read landing on the wrong row is *observable* rather than
 *   merely possible.
 *
 * Different fee amounts play the same role for money surfaces.
 *
 * ## Why the seeded tenants rather than two fresh ones
 *
 * Because the host has to resolve. `InstitutionContextService.resolve` binds a
 * tenant only for a domain with `status='active'`, and a domain created through
 * `POST /admin/institutions/{id}/domains/` is born `pending_dns` — correctly, that
 * is task 4.4's lifecycle. A pair of freshly created tenants therefore resolves to
 * the **Neutral_Beanola_Context**, where a posted `institution_id` is still honoured
 * as a white-label restriction, and the host-override and routing rows of the
 * matrix would be vacuous (measured: a first draft of this builder created its own
 * tenants and the override probe returned `201` bound to the *posted* tenant, which
 * is the documented neutral-context behaviour and not a leak).
 * `mihas.localhost` and `katc.localhost` are seeded **active**, which is what makes
 * "host override" and "routing" answerable at all.
 *
 * ## Tenant admins
 *
 * The seeded `admin@{slug}.localhost` accounts carry `permissions: []`, so they
 * resolve to the read-only tenant bundle. A cross-tenant *review* probe against a
 * read-only actor proves nothing — it would be refused for the same actor on its
 * own tenant, so the refusal cannot be attributed to the tenant boundary. This
 * builder therefore creates one admin per tenant holding the **full** granted
 * mutation set (`review`, `verify_documents`, `verify_payments`, `export`,
 * `manage`) scoped to that tenant alone, so every denial in the matrix is a
 * *scope* denial and nothing else.
 *
 * Nothing here writes to a database directly and nothing uses a seed-specific id:
 * every institution, offering, intake, fee, membership, account, draft and
 * document is fetched or created over the platform's own capability-gated HTTP
 * commands.
 */
import { request as playwrightRequest, type APIRequestContext, expect } from '@playwright/test';
import {
  freshContext,
  superAdminContext,
  tenantOrigin,
  type AuthedContext,
} from './api';

/** The two seeded tenants, by the code `harness_seed_tenants` gives them. */
export const TENANT_A_CODE = 'MIHAS';
export const TENANT_B_CODE = 'KATC';
export const TENANT_A_HOST = 'mihas.localhost';
export const TENANT_B_HOST = 'katc.localhost';

const TENANT_ADMIN_PASSWORD =
  process.env.HARNESS_TENANT_ADMIN_PASSWORD || 'HarnessTenant123!';
const STUDENT_PASSWORD = 'HarnessStudent123';

/** A phone the deterministic payment adapter settles immediately. */
export const PHONE_SETTLES = '0971000001';
/** A phone the adapter answers `pending` for two polls before succeeding. */
export const PHONE_DELAYS = '0979999001';

export function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/** Rows out of whichever envelope shape an endpoint uses. */
export function rowsOf(payload: any): any[] {
  const data = unwrap(payload);
  if (Array.isArray(data)) return data;
  for (const key of [
    'results',
    'programs',
    'applications',
    'payments',
    'notifications',
    'grades',
    'conditions',
    'amendments',
    'documents',
    'candidates',
    'subjects',
    'logs',
    'events',
  ]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

export interface TenantWorldSide {
  /** `A` or `B` — used only in assertion messages. */
  tag: 'A' | 'B';
  code: string;
  host: string;
  origin: string;
  institutionId: string;
  /** The offering whose `name` is identical to the other tenant's. */
  offeringId: string;
  /** The intake whose `name` is identical to the other tenant's. */
  intakeId: string;
  /** This tenant's global intake capacity — distinct from the other tenant's. */
  intakeCapacity: number;
  /**
   * This tenant's seat allocation on the shared-name intake — generous, because a
   * seat is consumed at **submission** and a full offering is filtered out of
   * routing entirely. A row that needs a small capacity asks for its own intake
   * through {@link addSameNamedIntake}.
   */
  seats: number;
  /** This tenant's application fee — distinct from the other tenant's. */
  feeAmount: string;
  /** A tenant admin scoped to THIS tenant only, holding every granted mutation. */
  adminEmail: string;
  adminPassword: string;
  adminUserId: string;
  /** A student registered on this tenant's own host, with a draft. */
  studentEmail: string;
  studentPassword: string;
  applicationId: string;
  applicationNumber: string;
}

export interface TenantWorld {
  admin: AuthedContext;
  stamp: string;
  canonicalProgramId: string;
  canonicalProgramName: string;
  /** The one offering name BOTH tenants publish. */
  collidingProgramName: string;
  /** The one intake name BOTH tenants publish. */
  collidingIntakeName: string;
  A: TenantWorldSide;
  B: TenantWorldSide;
}

/**
 * Add **another** intake carrying the world's colliding name and link it to one
 * tenant's colliding offering with an explicit seat allocation.
 *
 * Rows that need their own capacity story ask for their own intake, because a
 * seat is consumed at **submission**, not at enrollment
 * (`CapacityService.SEAT_STATUSES = ("submitted", "under_review", "approved",
 * "waitlisted")`) and `OfferingAssignmentService._has_capacity` then filters a
 * full offering out of routing entirely. Measured: a single 1-seat intake shared
 * between the waitlist and promotion rows made the promotion row fail with
 * `NO_ELIGIBLE_OFFERING` at *draft creation* — a capacity fact reported as if it
 * were an isolation fact, which is exactly the confusion this matrix must not
 * make.
 *
 * Every intake this returns still carries the same name as all the others, so the
 * collision only widens.
 */
export async function addSameNamedIntake(
  world: TenantWorld,
  side: TenantWorldSide,
  seats: number,
): Promise<string> {
  const intakeId = await createIntakeWithCapacity(world.admin, {
    name: world.collidingIntakeName,
    year: new Date().getFullYear() + 1,
    maxCapacity: side.intakeCapacity,
  });
  const link = await world.admin.ctx.post('/api/v1/admin/program-intakes/', {
    headers: { 'x-csrf-token': world.admin.csrf },
    data: { program_id: side.offeringId, intake_id: intakeId, max_capacity: seats },
  });
  expect(
    [200, 201].includes(link.status()),
    `the extra intake link should succeed (got ${link.status()}: ${await link.text()})`,
  ).toBeTruthy();
  return intakeId;
}

/** A CSRF-bearing authenticated context for an arbitrary account. */
export async function loginAs(
  email: string,
  password: string,
  origin?: string,
): Promise<AuthedContext> {
  const ctx = await freshContext(origin);
  const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
  expect(
    login.ok(),
    `${email} should log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, `login should return an X-CSRF-Token header for ${email}`).toBeTruthy();
  return { ctx, csrf };
}

/** Register a student **on a tenant host** and log them in there. */
export async function registerStudentOnHost(
  host: string,
  label: string,
): Promise<{ ctx: APIRequestContext; csrf: string; email: string; password: string }> {
  const origin = tenantOrigin(host);
  const ctx = await playwrightRequest.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const email = `harness.13-2.${label}.${stamp}@example.com`;

  const register = await ctx.post('/api/v1/auth/register/', {
    data: { email, password: STUDENT_PASSWORD, first_name: 'Harness', last_name: label },
  });
  expect(
    register.ok(),
    `register should succeed on ${host} (got ${register.status()}: ${await register.text()})`,
  ).toBeTruthy();

  const login = await ctx.post('/api/v1/auth/login/', {
    data: { email, password: STUDENT_PASSWORD },
  });
  expect(
    login.ok(),
    `login should succeed on ${host} (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();

  const session = await ctx.get('/api/v1/auth/session/?refresh_csrf=1');
  expect(session.ok(), `session bootstrap should succeed on ${host}`).toBeTruthy();
  const csrf = session.headers()['x-csrf-token'] || '';
  expect(csrf, 'the session bootstrap should return an X-CSRF-Token header').toBeTruthy();

  return { ctx, csrf, email, password: STUDENT_PASSWORD };
}

/** A unique, format-valid NRC (`validate_nrc` enforces `^\d{6}/\d{2}/\d$`). */
export function harnessNrc(): string {
  const six = `${Date.now()}`.slice(-6);
  const two = `${Math.floor(Math.random() * 90) + 10}`;
  return `${six}/${two}/${Math.floor(Math.random() * 10)}`;
}

/** Resolve one seeded institution by its code, through the catalogue. */
async function institutionIdByCode(admin: AuthedContext, code: string): Promise<string> {
  const resp = await admin.ctx.get('/api/v1/catalog/institutions/?pageSize=100');
  expect(resp.ok(), `institution catalogue should be readable (got ${resp.status()})`).toBeTruthy();
  const row = rowsOf(await resp.json()).find((item: any) => item?.code === code);
  expect(row?.id, `the harness should seed the ${code} tenant`).toBeTruthy();
  return String(row.id);
}

/** Create a global intake with an explicit capacity. */
export async function createIntakeWithCapacity(
  admin: AuthedContext,
  spec: { name: string; year: number; maxCapacity: number },
): Promise<string> {
  const resp = await admin.ctx.post('/api/v1/catalog/intakes/', {
    headers: { 'x-csrf-token': admin.csrf },
    data: {
      name: spec.name,
      year: spec.year,
      max_capacity: spec.maxCapacity,
      is_active: true,
      application_deadline: `${spec.year}-06-30`,
    },
  });
  expect(
    [200, 201].includes(resp.status()),
    `intake create should succeed (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
  const id = unwrap(await resp.json())?.id;
  expect(id, 'the created intake should have an id').toBeTruthy();
  return String(id);
}

/**
 * Create one tenant admin scoped to a single institution, holding every granted
 * mutation the tenant model defines.
 *
 * Two calls on purpose. `POST /admin/users/` accepts `institution_id` and will
 * create the membership itself, but only with the default (empty) permission set —
 * which is the read bundle. The membership is therefore created separately so its
 * `permissions` can carry the granted-mutation values from
 * `AdminCapabilityService._GRANTED_MUTATION_CAPABILITIES`.
 */
export async function createScopedTenantAdmin(
  admin: AuthedContext,
  institutionId: string,
  label: string,
): Promise<{ email: string; password: string; userId: string }> {
  const email = `harness.13-2.${label}.${Date.now()}@harness.local`;
  const create = await admin.ctx.post('/api/v1/admin/users/', {
    headers: { 'x-csrf-token': admin.csrf },
    data: {
      email,
      password: TENANT_ADMIN_PASSWORD,
      first_name: 'Harness',
      last_name: label,
      role: 'admin',
    },
  });
  expect(
    [200, 201].includes(create.status()),
    `tenant admin create should succeed (got ${create.status()}: ${await create.text()})`,
  ).toBeTruthy();
  const userId = unwrap(await create.json())?.id;
  expect(userId, 'the created admin should have an id').toBeTruthy();

  const membership = await admin.ctx.post('/api/v1/admin/memberships/', {
    headers: { 'x-csrf-token': admin.csrf },
    data: {
      user_id: userId,
      institution_id: institutionId,
      role: 'admin',
      permissions: ['review', 'verify_documents', 'verify_payments', 'export', 'manage'],
      is_active: true,
    },
  });
  expect(
    [200, 201].includes(membership.status()),
    `membership create should succeed (got ${membership.status()}: ${await membership.text()})`,
  ).toBeTruthy();

  return { email, password: TENANT_ADMIN_PASSWORD, userId: String(userId) };
}

/** Persist five unique Grade 12 results from the canonical subject catalogue. */
export async function persistGrades(
  ctx: APIRequestContext,
  csrf: string,
  applicationId: string,
  count = 5,
): Promise<number> {
  const list = await ctx.get('/api/v1/catalog/subjects/?pageSize=100');
  expect(list.ok(), `subject catalogue should be readable (got ${list.status()})`).toBeTruthy();
  const subjects = rowsOf(await list.json())
    .filter((row: any) => row?.id)
    .slice(0, count);
  expect(
    subjects.length,
    `the catalogue should publish at least ${count} selectable subjects`,
  ).toBe(count);

  const resp = await ctx.post(`/api/v1/applications/${applicationId}/grades/`, {
    headers: { 'x-csrf-token': csrf },
    data: { grades: subjects.map((subject: any) => ({ subject_id: subject.id, grade: 4 })) },
  });
  expect(
    resp.ok(),
    `grade batch should be accepted (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
  return subjects.length;
}

/**
 * Upload one file for every **required** document the platform still reports
 * missing for this application, using the document types it publishes.
 *
 * Generic rather than a fixed `nrc` + `result_slip` pair, because a tenant may
 * require a custom type (task 7.2 / R11.6 made the upload endpoint accept any
 * *configured* identifier for exactly this reason), and because this matrix
 * itself configures one in row S05. A submission helper that hardcoded two types
 * would fail on the tenant configuration the matrix is testing — measured: with
 * the fixed pair, tenant A's later applicants were refused with
 * `REQUIRED_DOCUMENT_MISSING` naming S05's own custom requirement.
 *
 * Returns the document types it uploaded.
 */
export async function satisfyRequiredDocuments(
  ctx: APIRequestContext,
  csrf: string,
  applicationId: string,
): Promise<string[]> {
  const resp = await ctx.get(`/api/v1/applications/${applicationId}/required-documents/`);
  expect(
    resp.ok(),
    `the required-document contract should be readable (got ${resp.status()})`,
  ).toBeTruthy();
  const requirements = unwrap(await resp.json())?.requirements ?? [];
  const uploaded: string[] = [];
  for (const requirement of requirements) {
    if (!requirement?.required) continue;
    if (requirement?.state && requirement.state !== 'missing') continue;
    // `accepts_document_types` is the platform's own answer to "what may I send
    // for this row"; the row's own type is the fallback.
    const accepted: string[] = Array.isArray(requirement.accepts_document_types)
      ? requirement.accepts_document_types
      : [];
    const documentType = String(accepted[0] ?? requirement.document_type);
    await uploadDoc(ctx, csrf, applicationId, documentType as any);
    uploaded.push(documentType);
  }
  return uploaded;
}

/** Upload one document through the real upload endpoint (magic bytes, MinIO). */
export async function uploadDoc(
  ctx: APIRequestContext,
  csrf: string,
  applicationId: string,
  documentType: 'result_slip' | 'extra_kyc' | 'nrc' | 'passport',
): Promise<string> {
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
  return String(unwrap(await resp.json())?.id ?? '');
}

/** Create one draft on a tenant host, from canonical ids only. */
export async function createDraftOnHost(
  ctx: APIRequestContext,
  csrf: string,
  spec: {
    canonicalProgramId: string;
    intakeId: string;
    email: string;
    fullName: string;
    phone?: string;
    /** Only set when a journey is deliberately probing the override rule. */
    institutionId?: string;
  },
): Promise<{ status: number; body: any }> {
  const resp = await ctx.post('/api/v1/applications/', {
    headers: { 'x-csrf-token': csrf },
    data: {
      full_name: spec.fullName,
      nrc_number: harnessNrc(),
      date_of_birth: '2004-05-04',
      sex: 'male',
      phone: spec.phone ?? `+260${PHONE_SETTLES.slice(1)}`,
      email: spec.email,
      residence_town: 'Lusaka',
      country: 'Zambia',
      nationality: 'Zambian',
      program_id: spec.canonicalProgramId,
      intake_id: spec.intakeId,
      ...(spec.institutionId ? { institution_id: spec.institutionId } : {}),
    },
  });
  let body: any = null;
  try {
    body = await resp.json();
  } catch {
    body = { _text: await resp.text() };
  }
  return { status: resp.status(), body };
}

/**
 * Build the two-tenant name-collision world.
 *
 * Capacities and fees differ per tenant so the capacity, waitlist and money rows
 * of the matrix have something to *measure* rather than merely to assert.
 */
export async function buildCollidingWorld(): Promise<TenantWorld> {
  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);
  const year = new Date().getFullYear() + 1;

  const canonicalResp = await admin.ctx.get('/api/v1/catalog/canonical-programs/');
  expect(canonicalResp.ok(), 'canonical programs should be readable').toBeTruthy();
  const canonical = rowsOf(await canonicalResp.json())[0];
  expect(canonical?.id, 'harness_bootstrap should seed a canonical program').toBeTruthy();

  const collidingProgramName = `Shared Offering Name ${stamp}`;
  const collidingIntakeName = `Shared Intake Name ${stamp}`;

  const sides: TenantWorldSide[] = [];
  for (const spec of [
    { tag: 'A' as const, code: TENANT_A_CODE, host: TENANT_A_HOST, intakeCapacity: 41, seats: 25, feeAmount: '153.00' },
    { tag: 'B' as const, code: TENANT_B_CODE, host: TENANT_B_HOST, intakeCapacity: 97, seats: 25, feeAmount: '207.00' },
  ]) {
    const institutionId = await institutionIdByCode(admin, spec.code);

    const intakeId = await createIntakeWithCapacity(admin, {
      name: collidingIntakeName,
      year,
      maxCapacity: spec.intakeCapacity,
    });

    const offering = await admin.ctx.post('/api/v1/catalog/programs/', {
      headers: { 'x-csrf-token': admin.csrf },
      data: {
        institution_id: institutionId,
        canonical_program_id: canonical.id,
        // The collision: identical name, distinct (globally unique) code.
        name: collidingProgramName,
        code: `S13-2${spec.tag}${stamp}`,
        offering_status: 'active',
      },
    });
    expect(
      [200, 201].includes(offering.status()),
      `offering assign should succeed for ${spec.code} (got ${offering.status()}: ${await offering.text()})`,
    ).toBeTruthy();
    const offeringId = String(unwrap(await offering.json())?.id ?? '');
    expect(offeringId, 'the created offering should have an id').toBeTruthy();

    const link = await admin.ctx.post('/api/v1/admin/program-intakes/', {
      headers: { 'x-csrf-token': admin.csrf },
      data: { program_id: offeringId, intake_id: intakeId, max_capacity: spec.seats },
    });
    expect(
      [200, 201].includes(link.status()),
      `intake link should succeed for ${spec.code} (got ${link.status()}: ${await link.text()})`,
    ).toBeTruthy();

    const fee = await admin.ctx.post(`/api/v1/programs/${offeringId}/fees/`, {
      headers: { 'x-csrf-token': admin.csrf },
      data: {
        fee_type: 'application',
        residency_category: 'local',
        amount: spec.feeAmount,
        currency: 'ZMW',
      },
    });
    expect(
      [200, 201].includes(fee.status()),
      `fee create should succeed for ${spec.code} (got ${fee.status()}: ${await fee.text()})`,
    ).toBeTruthy();

    const tenantAdmin = await createScopedTenantAdmin(
      admin,
      institutionId,
      `tenant-admin-${spec.tag.toLowerCase()}`,
    );

    // One student, registered and drafted on THIS tenant's own resolved host.
    const student = await registerStudentOnHost(spec.host, `student-${spec.tag.toLowerCase()}`);
    const draft = await createDraftOnHost(student.ctx, student.csrf, {
      canonicalProgramId: String(canonical.id),
      intakeId,
      email: student.email,
      fullName: `Harness Applicant ${spec.tag}`,
    });
    expect(
      [200, 201].includes(draft.status),
      `draft create should succeed on ${spec.host} (got ${draft.status}: ${JSON.stringify(draft.body).slice(0, 400)})`,
    ).toBeTruthy();
    const application = unwrap(draft.body);
    expect(application?.id, 'the created draft should have an id').toBeTruthy();

    await persistGrades(student.ctx, student.csrf, application.id);
    await satisfyRequiredDocuments(student.ctx, student.csrf, String(application.id));
    await student.ctx.dispose();

    sides.push({
      tag: spec.tag,
      code: spec.code,
      host: spec.host,
      origin: tenantOrigin(spec.host),
      institutionId,
      offeringId,
      intakeId,
      intakeCapacity: spec.intakeCapacity,
      seats: spec.seats,
      feeAmount: spec.feeAmount,
      adminEmail: tenantAdmin.email,
      adminPassword: tenantAdmin.password,
      adminUserId: tenantAdmin.userId,
      studentEmail: student.email,
      studentPassword: student.password,
      applicationId: String(application.id),
      applicationNumber: String(application.application_number ?? ''),
    });
  }

  return {
    admin,
    stamp,
    canonicalProgramId: String(canonical.id),
    canonicalProgramName: String(canonical.name),
    collidingProgramName,
    collidingIntakeName,
    A: sides[0],
    B: sides[1],
  };
}
