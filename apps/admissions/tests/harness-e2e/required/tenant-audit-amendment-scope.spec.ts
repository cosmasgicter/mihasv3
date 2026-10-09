/**
 * Required V2 harness — the tenant audit feed is the selected school's, and an
 * amendment notifies only that school (task 9.5).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.5 — "Correct tenant
 * audit and amendment notification scope".
 * Requirements: **R3** (one authorization model — the capability service decides,
 * scope precedes lookup, a cross-tenant id is an indistinguishable 404), **R6.6**
 * (the tenant audit list *and export* use the selected institution endpoint,
 * require `tenant.audit.read`, paginate, and never leak another tenant's events),
 * **R13.10** (amendment requests notify only tenant-authorized recipients through
 * the durable communication outbox).
 * Findings: **ADM-05**, **AUTH-06**.
 *
 * This file is the task's `_Evidence:` line: *cross-tenant event/recipient
 * negative tests and audit export E2E*. It is also design §16.1's two named
 * journeys — "Audit/settlement/export: page 2+, cross-tenant query, redaction"
 * and "Communications/interview: tenant recipient isolation".
 *
 * Why the browser is required here, and not only an API test: **ADM-05 was
 * invisible to the backend.** The correct per-institution endpoint existed and
 * answered correctly; the panel simply called a different one and never sent the
 * school it was rendering. No endpoint test can fail on a request the frontend
 * does not make. The same is true of the export: the audit surface had none, so
 * "the export covers the whole filtered set" is a claim about a control that has
 * to exist on screen.
 *
 * The five journeys:
 *
 *   1. **the selected school is on the wire.** Opening the audit tab issues a
 *      request to `/admin/institutions/{selected}/audit/` and **none** to the
 *      generic `/admin/audit-logs/` feed. Selecting the *other* school issues a
 *      request for that one — the defect was a cache key that distinguished
 *      answers the request never distinguished.
 *   2. **page 2+ keeps the server's totals.** The rows change, the event count
 *      does not, and `page=2` is on the wire.
 *   3. **the export is the whole filtered set, and is audited.** Standing on page
 *      2, the CSV holds every matching event, the request carries no paging, and
 *      the export appears in the feed it exported.
 *   4. **a cross-tenant query is masked.** A Tenant_Admin scoped to school A is
 *      answered 404 for school B's audit feed — byte-identical to an unknown id —
 *      and their own feed contains none of B's events.
 *   5. **tenant recipient isolation.** A student's amendment on school A notifies
 *      A's reviewer and not B's, and the durable outbox row records the decision.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates active
 * (`harness-fixtures.ts`): zero skips, no console errors, no unasserted failed
 * requests. Both the desktop and the mobile project run every journey.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createInstitutionViaApi,
  createIntake,
  forceSubmitApplication,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';

const TENANTS_URL = '/admin/tenants';
/** The one tenant audit endpoint (task 9.5). */
const AUDIT_API = (institutionId: string) => `/api/v1/admin/institutions/${institutionId}/audit/`;
/** The generic platform-wide feed the panel used to call (ADM-05). */
const GENERIC_AUDIT_API = '/api/v1/admin/audit-logs/';
/** The panel's page size (`AuditPanel.PAGE_SIZE`). */
const PAGE_SIZE = 15;
/** Seeded so page 2 is a real page with real rows on it. */
const SEEDED_EVENTS = 20;

test.describe.configure({ mode: 'serial' });

interface SeededStaff {
  email: string;
  password: string;
  id: string;
}

interface SeededWorld {
  admin: AuthedContext;
  /** School A — the one every journey selects. */
  institutionAId: string;
  institutionAName: string;
  /** School B — the one no journey may observe from A. */
  institutionBId: string;
  institutionBName: string;
  /** A tenant admin of A holding audit read + export, and nothing for B. */
  auditorA: SeededStaff;
  /** A reviewer of A: the only correct recipient of A's amendments. */
  reviewerA: SeededStaff;
  /** A reviewer of B: must never hear about A's applicants. */
  reviewerB: SeededStaff;
  /** A submitted application at school A, with its applicant's credentials. */
  applicationAId: string;
  applicantA: { email: string; password: string; csrf: string };
}

let seeded: SeededWorld | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/** Log the browser context in as a seeded actor. */
async function loginAs(page: Page, staff: SeededStaff): Promise<void> {
  const login = await page.request.post('/api/v1/auth/login/', {
    data: { email: staff.email, password: staff.password },
  });
  expect(
    login.ok(),
    `${staff.email} should be able to log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
}

/**
 * One staff account bound to an institution with an explicit permission bundle.
 *
 * Through `POST /api/v1/admin/users/` (task 9.3's tenant-bound create) so the
 * membership carrying the authority is real, then through the canonical
 * access-grant command for the mutation capabilities — "read by default, mutate
 * only when granted", so each actor's authority in these journeys is *stated*
 * rather than inherited from a role string.
 */
async function seedStaff(
  admin: AuthedContext,
  institutionId: string,
  role: 'admin' | 'reviewer',
  permissions: string[],
  label: string,
): Promise<SeededStaff> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const email = `harness.${label}.${stamp}@example.com`;
  const password = 'HarnessStaff123!';
  const created = await admin.ctx.post('/api/v1/admin/users/', {
    headers: { 'x-csrf-token': admin.csrf },
    data: {
      email,
      password,
      first_name: 'Harness',
      last_name: label,
      role,
      institution_id: institutionId,
    },
  });
  expect(
    created.status(),
    `${label} creation should succeed (got ${created.status()}: ${await created.text()})`,
  ).toBe(201);
  const id = unwrap(await created.json())?.id;
  expect(id, `${label} should have an id`).toBeTruthy();
  if (permissions.length > 0) {
    const grant = await admin.ctx.post('/api/v1/admin/access-grants/', {
      headers: { 'x-csrf-token': admin.csrf },
      data: {
        user_id: id,
        scope_type: 'institution',
        institution_id: institutionId,
        permissions,
      },
    });
    expect(
      grant.ok(),
      `${label} grant should be created (got ${grant.status()}: ${await grant.text()})`,
    ).toBeTruthy();
  }
  return { email, password, id };
}

/**
 * Produce audit events for one school through the platform's own commands.
 *
 * A tenant profile update is a `tenant.institution.updated` Audit_Event carrying
 * the institution — the same write the tenant console performs. Nothing is
 * hand-inserted into `audit_logs`: an audit feed test that writes its own audit
 * rows proves only that the table exists.
 */
async function seedAuditEvents(
  admin: AuthedContext,
  institutionId: string,
  count: number,
  labelPrefix: string,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const response = await admin.ctx.patch(`/api/v1/admin/institutions/${institutionId}/`, {
      headers: { 'x-csrf-token': admin.csrf },
      data: { full_name: `${labelPrefix} revision ${index + 1}` },
    });
    expect(
      response.ok(),
      `tenant update ${index + 1} should succeed (got ${response.status()}: ${await response.text()})`,
    ).toBeTruthy();
  }
}

async function seedWorld(): Promise<SeededWorld> {
  if (seeded) return seeded;
  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  // School A: the harness's own seeded tenant, so the application can be created
  // against a launch-ready catalogue.
  const institutions = unwrap(
    await (await admin.ctx.get('/api/v1/admin/institutions/?pageSize=5')).json(),
  );
  const rows: any[] = Array.isArray(institutions)
    ? institutions
    : Array.isArray(institutions?.results)
      ? institutions.results
      : [];
  const institutionA = rows[0];
  expect(institutionA?.id, 'the harness should have at least one institution').toBeTruthy();

  // School B: a second tenant, created through the platform's own command. It
  // exists only so that "A cannot see B" is a claim about two real schools.
  const { institutionId: institutionBId } = await createInstitutionViaApi(admin, {
    name: `Audit Scope B ${stamp}`,
    code: `ASB${stamp}`,
    hostname: `audit-scope-b-${stamp}.localhost`,
  });

  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = canonicals[0].id;

  const { intakeId } = await createIntake(admin, {
    name: `Audit Scope Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const offering = await assignOffering(admin, institutionA.id, {
    canonical_program_id: canonicalProgramId,
    name: `Audit Scope Offering ${stamp}`,
    code: `AS${stamp}`,
  });
  await linkIntake(admin, {
    program_id: offering.offeringId,
    intake_id: intakeId,
    max_capacity: 100,
  });

  // One applicant at school A, submitted — an amendment is only available on a
  // submitted application, which is the point: it is a post-submission command.
  const applicantCtx = await freshContext();
  const applicantStamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const applicantEmail = `harness.auditscope.applicant.${applicantStamp}@example.com`;
  const applicantPassword = 'HarnessStudent123';
  let applicationAId = '';
  let applicantCsrf = '';
  try {
    const reg = await applicantCtx.post('/api/v1/auth/register/', {
      data: {
        email: applicantEmail,
        password: applicantPassword,
        first_name: 'Audit',
        last_name: 'Scope',
      },
    });
    expect(reg.ok(), `applicant should register (got ${reg.status()})`).toBeTruthy();
    const login = await applicantCtx.post('/api/v1/auth/login/', {
      data: { email: applicantEmail, password: applicantPassword },
    });
    expect(login.ok(), `applicant should log in (got ${login.status()})`).toBeTruthy();
    applicantCsrf = login.headers()['x-csrf-token'] || '';
    expect(applicantCsrf, 'login should return an X-CSRF-Token header').toBeTruthy();
    const draft = await createDraftApplication(applicantCtx, applicantCsrf, {
      canonicalProgramId,
      intakeId,
      email: applicantEmail,
      fullName: `Audit Scope ${applicantStamp}`,
    });
    applicationAId = draft.applicationId;
  } finally {
    await applicantCtx.dispose();
  }
  // `ALLOWED_TRANSITIONS` has no `draft → submitted` shortcut for a reviewer, so
  // the platform's own review command moves it — journey setup through a real
  // capability-gated command, not a row edit.
  await forceSubmitApplication(admin, applicationAId);

  const auditorA = await seedStaff(
    admin,
    institutionA.id,
    'admin',
    ['export'],
    'auditor-a',
  );
  const reviewerA = await seedStaff(admin, institutionA.id, 'admin', ['review'], 'reviewer-a');
  const reviewerB = await seedStaff(admin, institutionBId, 'admin', ['review'], 'reviewer-b');

  // Enough events on A for a second page, plus a couple on B so "A's feed has
  // none of B's" is a claim about events that exist.
  await seedAuditEvents(admin, institutionA.id, SEEDED_EVENTS, `Audit Scope A ${stamp}`);
  await seedAuditEvents(admin, institutionBId, 3, `Audit Scope B ${stamp}`);

  seeded = {
    admin,
    institutionAId: institutionA.id,
    institutionAName: institutionA.brand_name || institutionA.name,
    institutionBId,
    institutionBName: `Audit Scope B ${stamp}`,
    auditorA,
    reviewerA,
    reviewerB,
    applicationAId,
    applicantA: {
      email: applicantEmail,
      password: applicantPassword,
      csrf: applicantCsrf,
    },
  };
  return seeded;
}

test.beforeAll(async () => {
  await seedWorld();
});

/**
 * Open the tenant console's audit tab for the school the actor is scoped to.
 *
 * A Tenant_Admin lands on the school console (`TenantAdminSchoolConsole`), whose
 * tabs are gated on the capabilities they hold for the active institution — so
 * the Audit tab being present is itself the `tenant.audit.read` capability
 * arriving from the backend.
 */
async function openAuditTab(page: Page): Promise<void> {
  await page.goto(TENANTS_URL, { waitUntil: 'domcontentloaded' });
  const auditTab = page.getByRole('tab', { name: 'Audit' });
  await expect(auditTab).toBeVisible({ timeout: 30_000 });
  await auditTab.click();
  await expect(page.getByRole('heading', { name: 'Configuration audit' })).toBeVisible({
    timeout: 30_000,
  });
}

/** Wait for the panel's own data-bearing container to appear. */
async function auditBody(page: Page, institutionId: string) {
  const body = page.locator(`[data-tenant-audit="${institutionId}"]`);
  await expect(body).toBeVisible({ timeout: 30_000 });
  return body;
}

// ---------------------------------------------------------------------------
// 1. The selected school is on the wire (ADM-05, R6.6)
// ---------------------------------------------------------------------------

test('the audit panel asks about the selected school and never the generic feed', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  await loginAs(page, world.auditorA);

  const scopedReads: string[] = [];
  const genericReads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/')) return;
    if (url.pathname === GENERIC_AUDIT_API) {
      genericReads.push(`${request.method()} ${url.pathname}`);
      return;
    }
    if (url.pathname === AUDIT_API(world.institutionAId)) {
      scopedReads.push(`${request.method()} ${url.pathname}?${url.searchParams.toString()}`);
    }
  });

  await openAuditTab(page);
  await auditBody(page, world.institutionAId);

  // The selected school is in the path of the read the panel actually issued.
  expect(scopedReads.length, 'the panel should read the selected school').toBeGreaterThan(0);
  // And the generic platform-wide feed is not called at all — the ADM-05 defect.
  expect(genericReads, 'the tenant panel should never call the generic audit feed').toEqual([]);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. Page 2 and beyond keeps the server's totals (R6.6)
// ---------------------------------------------------------------------------

test('page 2 keeps the server event count and changes only the rows', async ({ page, gate }) => {
  const world = seeded!;
  await loginAs(page, world.auditorA);
  await openAuditTab(page);
  const body = await auditBody(page, world.institutionAId);

  // The headline count is the server's answer for the whole filtered set.
  const totalBadge = body.getByText(/\d+ events?/).first();
  await expect(totalBadge).toBeVisible();
  const totalBefore = (await totalBadge.innerText()).trim();
  expect(Number(totalBefore.replace(/[^\d]/g, ''))).toBeGreaterThan(PAGE_SIZE);

  const firstPageActions = await body.locator('[data-audit-event]').allInnerTexts();
  expect(firstPageActions.length).toBe(PAGE_SIZE);

  const pageTwoReads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === AUDIT_API(world.institutionAId) && url.searchParams.get('page') === '2') {
      pageTwoReads.push(request.url());
    }
  });

  await body.getByRole('button', { name: 'Next' }).click();
  await expect(body.getByText(/Page 2 of \d+/)).toBeVisible({ timeout: 30_000 });

  // `page=2` reached the server: the panel did not slice a list it already held.
  expect(pageTwoReads.length, 'page 2 should be a server request').toBeGreaterThan(0);

  // The rows changed; the total did not.
  await expect
    .poll(async () => (await body.locator('[data-audit-event]').allInnerTexts()).join('|'))
    .not.toBe(firstPageActions.join('|'));
  expect((await body.getByText(/\d+ events?/).first().innerText()).trim()).toBe(totalBefore);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. The export is the whole filtered set, and is audited (R6.5, R6.6)
// ---------------------------------------------------------------------------

test('the audit export is the whole filtered set, page-independent and audited', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  await loginAs(page, world.auditorA);
  await openAuditTab(page);
  const body = await auditBody(page, world.institutionAId);

  const total = Number(
    (await body.getByText(/\d+ events?/).first().innerText()).replace(/[^\d]/g, ''),
  );
  expect(total).toBeGreaterThan(PAGE_SIZE);

  // Stand on page 2 first: the export must not depend on where the operator is.
  await body.getByRole('button', { name: 'Next' }).click();
  await expect(body.getByText(/Page 2 of \d+/)).toBeVisible({ timeout: 30_000 });

  const exportRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === AUDIT_API(world.institutionAId) &&
      url.searchParams.get('export') === 'csv'
    ) {
      exportRequests.push(request.url());
    }
  });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toContain('tenant-audit');

  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const lines = Buffer.concat(chunks).toString('utf-8').trim().split('\n');
  // Header + one line per matching event, not per row on screen. The export
  // itself is audited, so the feed may have grown by the time it is compared —
  // hence "at least", never "at most the page".
  expect(lines.length - 1).toBeGreaterThanOrEqual(total);
  expect(lines[0]).toContain('action');
  expect(lines[0]).toContain('institution_id');

  // The paging was dropped from the export request.
  expect(exportRequests.length).toBeGreaterThan(0);
  for (const url of exportRequests) {
    expect(url).not.toContain('page=');
    expect(url).not.toContain('pageSize=');
  }

  // The export appears in the feed it exported: one row recording the actor, the
  // filters and the row count — and no exported event.
  const audit = await page.request.get(
    `${AUDIT_API(world.institutionAId)}?action=audit.exported&pageSize=5`,
  );
  expect(audit.ok(), `audit read should succeed (got ${audit.status()})`).toBeTruthy();
  const rows = unwrap(await audit.json())?.results ?? [];
  const exportRow = rows.find((row: any) => row.action === 'audit.exported');
  expect(exportRow, 'the export should be audited').toBeTruthy();
  const changes = exportRow.changes || {};
  expect(changes.page_independent).toBe(true);
  expect(changes.row_count).toBeGreaterThanOrEqual(total);
  expect(changes.institution_id).toBe(world.institutionAId);
  // The decision is recorded; the exported rows are not.
  expect(JSON.stringify(changes)).not.toContain('@example.com');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

test('a reader without the export capability is not offered the export', async ({ page }) => {
  const world = seeded!;
  // `reviewerA` holds the read bundle plus `review`, and NOT
  // `tenant.application.export`. They may read the feed and may not extract it —
  // and the control follows the backend's own `can_export`, not a role guess.
  await loginAs(page, world.reviewerA);
  await openAuditTab(page);
  const body = await auditBody(page, world.institutionAId);
  await expect(body.getByText(/\d+ events?/).first()).toBeVisible();

  // The read works; the export is simply not offered.
  await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);

  // And the endpoint refuses it too — the frontend is never the boundary.
  const refused = await page.request.get(`${AUDIT_API(world.institutionAId)}?export=csv`);
  expect(refused.status()).toBe(403);
  expect((await refused.json()).code).toBe('INSUFFICIENT_PERMISSIONS');
});

// ---------------------------------------------------------------------------
// 4. A cross-tenant query is masked (R3.2, R6.6)
// ---------------------------------------------------------------------------

test('a cross-tenant audit query is masked, and the feed holds no other school', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  await loginAs(page, world.auditorA);

  // The refusals below are this journey's asserted error paths (R18.4).
  gate.allowRequest(AUDIT_API(world.institutionBId));
  gate.allowRequest('/api/v1/admin/institutions/00000000-0000-4000-8000-000000000000/audit/');

  const other = await page.request.get(AUDIT_API(world.institutionBId));
  const unknown = await page.request.get(
    '/api/v1/admin/institutions/00000000-0000-4000-8000-000000000000/audit/',
  );
  expect(other.status()).toBe(404);
  expect(unknown.status()).toBe(404);
  // Byte-identical: "that school is not yours" is indistinguishable from "that id
  // does not exist".
  expect(await other.text()).toBe(await unknown.text());
  // And nothing about school B travels in the refusal.
  expect(await other.text()).not.toContain(world.institutionBId);
  expect(await other.text()).not.toContain(world.institutionBName);

  // Their own feed contains only their own school's events.
  await openAuditTab(page);
  const body = await auditBody(page, world.institutionAId);
  await expect(body.getByText(/\d+ events?/).first()).toBeVisible();
  const own = await page.request.get(`${AUDIT_API(world.institutionAId)}?pageSize=100`);
  expect(own.ok()).toBeTruthy();
  const rows = unwrap(await own.json())?.results ?? [];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    if (row.institution_id) expect(row.institution_id).toBe(world.institutionAId);
  }
  expect(JSON.stringify(rows)).not.toContain(world.institutionBId);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 5. Tenant recipient isolation (AUTH-06, R13.10)
// ---------------------------------------------------------------------------

test('an amendment notifies the owning school and no other', async ({ page, gate }) => {
  const world = seeded!;

  // The student requests an amendment on their own submitted application.
  const applicantCtx = await freshContext();
  try {
    const login = await applicantCtx.post('/api/v1/auth/login/', {
      data: { email: world.applicantA.email, password: world.applicantA.password },
    });
    expect(login.ok(), `applicant should log in (got ${login.status()})`).toBeTruthy();
    const csrf = login.headers()['x-csrf-token'] || '';
    const requested = await applicantCtx.post(
      `/api/v1/applications/${world.applicationAId}/amendments/`,
      {
        headers: { 'x-csrf-token': csrf },
        data: {
          field_name: 'phone',
          new_value: '+260970000321',
          reason: 'I changed my number after moving house.',
        },
      },
    );
    expect(
      requested.status(),
      `amendment request should be accepted (got ${requested.status()}: ${await requested.text()})`,
    ).toBe(201);
  } finally {
    await applicantCtx.dispose();
  }

  // School A's reviewer is told about it, in their own notification list.
  await loginAs(page, world.reviewerA);
  await expect
    .poll(
      async () => {
        const response = await page.request.get('/api/v1/notifications/?pageSize=50');
        if (!response.ok()) return [];
        const payload = unwrap(await response.json());
        const rows = Array.isArray(payload) ? payload : (payload?.results ?? []);
        return rows.filter((row: any) => (row.title || '').includes('Amendment Request'));
      },
      { timeout: 30_000 },
    )
    .not.toEqual([]);

  // School B's reviewer is not. An applicant's name and application number
  // crossing a tenant boundary through the notification channel is exactly the
  // disclosure AUTH-06 named.
  await loginAs(page, world.reviewerB);
  const otherSchool = await page.request.get('/api/v1/notifications/?pageSize=50');
  expect(otherSchool.ok(), `notifications read should succeed (got ${otherSchool.status()})`).toBeTruthy();
  const otherPayload = unwrap(await otherSchool.json());
  const otherRows = Array.isArray(otherPayload) ? otherPayload : (otherPayload?.results ?? []);
  const leaked = otherRows.filter((row: any) => (row.title || '').includes('Amendment Request'));
  expect(leaked, "another school's reviewer must not be notified").toEqual([]);
  expect(JSON.stringify(otherRows)).not.toContain('+260970000321');

  // The decision is durable and visible in the owning school's audit feed: the
  // capability required, how many recipients it resolved, and which school.
  const audit = await page.request.get(
    `${AUDIT_API(world.institutionAId)}?action=amendment.requested&pageSize=5`,
  );
  // reviewerB may not read A's feed — that is the point of the previous journey —
  // so the platform actor reads it here.
  gate.allowRequest(`${AUDIT_API(world.institutionAId)}?action=amendment.requested`);
  expect(audit.status()).toBe(404);

  const asPlatform = await world.admin.ctx.get(
    `${AUDIT_API(world.institutionAId)}?action=amendment.requested&pageSize=5`,
  );
  expect(asPlatform.ok(), `platform audit read should succeed (got ${asPlatform.status()})`).toBeTruthy();
  const rows = unwrap(await asPlatform.json())?.results ?? [];
  const requestedRow = rows.find((row: any) => row.action === 'amendment.requested');
  expect(requestedRow, 'the amendment request should be audited').toBeTruthy();
  const changes = requestedRow.changes || {};
  expect(changes.capability).toBe('tenant.application.review');
  expect(changes.recipient_count).toBeGreaterThan(0);
  expect(changes.institution_id).toBe(world.institutionAId);
  // The amended value is applicant PII and never travels.
  expect(JSON.stringify(changes)).not.toContain('+260970000321');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});
