/**
 * Required V2 harness — the admin review workspace is one deterministic read and
 * a set of versioned commands (task 9.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.4 — "Build one
 * deterministic admin review workspace".
 * Requirements: **R8.2** (a reviewer queue holds only tenant-authorised assigned
 * work), **R8.3** (every command enforces the authority matrix in the backend),
 * **R8.4** (each command returns allowed next actions and cannot be applied from
 * a stale view), **R8.5** (identity, answers, evidence, payment, interview,
 * communication and history without parallel legacy detail calls), **R8.7**
 * (Reviewer and Tenant_Admin browser journeys complete their allowed work and
 * prove denied work **without relying on UI hiding**), **R11.3** (deterministic
 * reviewer readiness).
 * Findings: **AUTH-01**, **AUTH-02**, **AUTH-03**, **API-02**, **MAINT-01**.
 *
 * This file is the task's `_Evidence:` line: *Reviewer and Tenant_Admin
 * desktop/mobile journeys*. Both projects run every journey, so each claim is
 * settled at a desktop and a mobile breakpoint.
 *
 * Why the browser is required here, and not only an API test: every defect in
 * this task's findings was a *wiring* defect. The backend knew the answer; the
 * workspace asked six times and merged the replies. The backend had already
 * deleted the AI summary; the workspace kept calling it. The backend enforced
 * the review capability; the workspace showed the controls to everyone and
 * redirected the one role that exists to review. None of that is visible from an
 * API test.
 *
 * The six journeys:
 *
 *   1. **Tenant_Admin — one read.** Opening an application issues exactly one
 *      request for it, and none of the six retired per-application reads.
 *   2. **Tenant_Admin — deterministic readiness.** The readiness tab renders the
 *      server's checks, there is no "AI" tab, and no call to `/admin-summary/`.
 *   3. **Tenant_Admin — a versioned decision.** The decision command carries the
 *      version the read published, and a second command replaying the *old*
 *      version is refused with 409 while the application stays as the first
 *      decision left it.
 *   4. **Reviewer — allowed work.** A scoped Reviewer reaches the workspace for
 *      an application **assigned to them** and records a decision (AUTH-01: this
 *      was impossible in a browser — the guard sent them to the student
 *      dashboard).
 *   5. **Reviewer — denied work, not hidden work.** The same Reviewer is refused
 *      an application they are not assigned to, by the **endpoint**, with the
 *      same masked 404 an unknown id gets.
 *   6. **Read-only Tenant_Admin — denied by the backend.** An in-scope actor
 *      without the review grant reads the workspace, is not offered the command
 *      controls, and is refused by the endpoint when the command is issued
 *      directly — the frontend is never the boundary.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates
 * active (`harness-fixtures.ts`): zero skips, no console errors, no unasserted
 * failed requests.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createIntake,
  forceSubmitApplication,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';

const APPLICATIONS_URL = '/admin/applications';
const WORKSPACE_API = '/api/v1/admin/applications/';

test.describe.configure({ mode: 'serial' });

interface SeededStaff {
  email: string;
  password: string;
  id: string;
}

interface SeededWorkspace {
  admin: AuthedContext;
  institutionId: string;
  /** Two applications: one assigned to the reviewer, one deliberately not. */
  assignedApplicationId: string;
  unassignedApplicationId: string;
  assignedApplicantName: string;
  unassignedApplicantName: string;
  reviewer: SeededStaff;
  tenantAdmin: SeededStaff;
  readOnlyAdmin: SeededStaff;
}

let seeded: SeededWorkspace | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/** Log the browser context in as a seeded actor. Returns its CSRF token. */
async function loginAs(page: Page, staff: SeededStaff): Promise<string> {
  const login = await page.request.post('/api/v1/auth/login/', {
    data: { email: staff.email, password: staff.password },
  });
  expect(
    login.ok(),
    `${staff.email} should be able to log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();
  return csrf;
}

/**
 * A fresh CSRF token for the signed-in browser context.
 *
 * Read from the `X-CSRF-Token` **response header** of the bootstrap session call,
 * which is where `SessionView` issues it — the frontend keeps it in memory and
 * never in `localStorage` or a readable cookie, so `document.cookie` has nothing
 * to offer here. `?refresh_csrf=1` is the platform's own recovery path.
 */
async function csrfToken(page: Page): Promise<string> {
  const session = await page.request.get('/api/v1/auth/session/?refresh_csrf=1');
  expect(session.ok(), `session bootstrap should succeed (got ${session.status()})`).toBeTruthy();
  const token = session.headers()['x-csrf-token'] || '';
  expect(token, 'the session call should issue an X-CSRF-Token header').toBeTruthy();
  return token;
}

/**
 * One applicant with one draft application, created through the endpoints a real
 * applicant uses. Returns the application id and the applicant's own name, which
 * is how a journey finds their row on the roster.
 */
async function seedApplicant(
  canonicalProgramId: string,
  intakeId: string,
  label: string,
): Promise<{ applicationId: string; fullName: string }> {
  const ctx = await freshContext();
  try {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
    const email = `harness.workspace.${label}.${stamp}@example.com`;
    const password = 'HarnessStudent123';
    const fullName = `Workspace ${label} ${stamp}`;
    const reg = await ctx.post('/api/v1/auth/register/', {
      data: { email, password, first_name: 'Workspace', last_name: label },
    });
    expect(reg.ok(), `${label} applicant should register (got ${reg.status()})`).toBeTruthy();
    const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
    expect(login.ok(), `${label} applicant should log in (got ${login.status()})`).toBeTruthy();
    const csrf = login.headers()['x-csrf-token'] || '';
    expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();
    const { applicationId } = await createDraftApplication(ctx, csrf, {
      canonicalProgramId,
      intakeId,
      email,
      fullName,
    });
    return { applicationId, fullName };
  } finally {
    await ctx.dispose();
  }
}

/**
 * Create one staff account bound to the seeded institution, with the given
 * membership permissions.
 *
 * Through `POST /api/v1/admin/users/` — the platform's own tenant-bound create
 * (task 9.3) — so the membership that carries the authority is real, not
 * hand-written. `permissions` is the grant allowlist the capability service maps
 * onto `tenant.*` mutation capabilities.
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

  // The create path establishes the **membership**, which yields the platform's
  // default tenant *read* bundle. A mutation capability comes only from an
  // explicit grant ("read by default, mutate only when granted"), so each actor's
  // authority in these journeys is stated through the canonical grant command
  // rather than inherited from a role string. `permissions` values come from
  // `GRANT_PERMISSION_ALLOWLIST` (`view` / `review` / …).
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
  return { email, password, id };
}

async function seedWorkspace(): Promise<SeededWorkspace> {
  if (seeded) return seeded;
  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = canonicals[0].id;

  // Reuse the harness's own seeded tenant: a fresh institution has no active
  // domain, and this journey is about the workspace, not the domain lifecycle.
  const institutions = unwrap(
    await (await admin.ctx.get('/api/v1/admin/institutions/?pageSize=5')).json(),
  );
  const rows: any[] = Array.isArray(institutions)
    ? institutions
    : Array.isArray(institutions?.results)
      ? institutions.results
      : [];
  const institutionId = rows[0]?.id;
  expect(institutionId, 'the harness should have at least one institution').toBeTruthy();

  const { intakeId } = await createIntake(admin, {
    name: `Workspace Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const offering = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: `Workspace Offering ${stamp}`,
    code: `WS${stamp}`,
  });
  await linkIntake(admin, {
    program_id: offering.offeringId,
    intake_id: intakeId,
    max_capacity: 200,
  });

  // Serial: `applications.application_number` falls back to "count then attempt"
  // when the SQL helper is absent, which two concurrent creates lose (recorded by
  // task 9.1 §9.3). The seed declines to race the uniqueness constraint.
  const assigned = await seedApplicant(canonicalProgramId, intakeId, 'Assigned');
  const unassigned = await seedApplicant(canonicalProgramId, intakeId, 'Unassigned');

  /**
   * Both applications start `submitted`, through the platform's own review
   * command (`admin_force`), because that is where a *review* workspace begins.
   * `ALLOWED_TRANSITIONS` has no `draft → under_review` edge — a draft is the
   * student's, and a reviewer has nothing to decide about it — so a journey that
   * records a decision has to be set up past submission. This is journey setup
   * through a real capability-gated command, not a test-only shortcut.
   */
  await forceSubmitApplication(admin, assigned.applicationId);
  await forceSubmitApplication(admin, unassigned.applicationId);

  const reviewer = await seedStaff(admin, institutionId, 'reviewer', ['review'], 'reviewer');
  const tenantAdmin = await seedStaff(admin, institutionId, 'admin', ['review'], 'tenantadmin');
  const readOnlyAdmin = await seedStaff(admin, institutionId, 'admin', ['view'], 'readonly');

  // Assign exactly one of the two applications to the reviewer, through the
  // platform's own assignment command.
  const assignResponse = await admin.ctx.post(
    `/api/v1/applications/${assigned.applicationId}/assign/`,
    {
      headers: { 'x-csrf-token': admin.csrf },
      data: { reviewer_id: reviewer.id },
    },
  );
  expect(
    assignResponse.ok(),
    `reviewer assignment should succeed (got ${assignResponse.status()}: ${await assignResponse.text()})`,
  ).toBeTruthy();

  seeded = {
    admin,
    institutionId,
    assignedApplicationId: assigned.applicationId,
    unassignedApplicationId: unassigned.applicationId,
    assignedApplicantName: assigned.fullName,
    unassignedApplicantName: unassigned.fullName,
    reviewer,
    tenantAdmin,
    readOnlyAdmin,
  };
  return seeded;
}

test.beforeAll(async () => {
  await seedWorkspace();
});

/**
 * The roster's search box, in whichever filter panel is on screen.
 *
 * The roster renders `FiltersPanel` twice — a desktop rail (`hidden sm:block`)
 * and a mobile sheet behind the "Toggle filters" control — each with its own
 * control-id namespace. `.first()` therefore resolves to the *desktop* input,
 * which at a mobile breakpoint is present but hidden. Resolving the visible one
 * is what lets the same journey run at both breakpoints instead of asserting a
 * layout; task 9.1's roster journeys settled the same point with the same seam
 * (`filterControl`).
 */
async function rosterSearch(page: Page) {
  const desktop = page.locator('[data-roster-filters="desktop"] input[aria-label="Search applications"]');
  const toggle = page.getByRole('button', { name: 'Toggle filters' });

  /*
   * Wait for whichever of the two the viewport shows before branching. The
   * roster is client-rendered and `openWorkspace` navigates with
   * `domcontentloaded`, so an instantaneous `isVisible()` probe can run against
   * an unpainted page and read "no desktop rail" as "this is mobile". The
   * desktop rail is `hidden sm:block` and the toggle is `sm:hidden`, so exactly
   * one of these is ever visible: waiting for either is deterministic, and
   * asserting which one would be asserting the layout.
   */
  await expect(desktop.or(toggle).first()).toBeVisible({ timeout: 30_000 });
  if (await desktop.isVisible()) return desktop;

  const sheet = page.locator('[data-roster-filters="mobile"]');
  if (!(await sheet.isVisible())) {
    await toggle.click();
    await expect(sheet).toBeVisible();
  }
  return sheet.locator('input[aria-label="Search applications"]');
}

/** Open one application's workspace from the roster, by the applicant's name. */
async function openWorkspace(page: Page, applicantName: string): Promise<void> {
  await page.goto(APPLICATIONS_URL, { waitUntil: 'domcontentloaded' });
  const search = await rosterSearch(page);
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(applicantName);
  // The roster search is debounced and server-side: wait for the answer that
  // carries this term rather than for a fixed interval.
  await page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/admin/applications/') &&
      new URL(response.url()).searchParams.get('search') === applicantName,
    { timeout: 30_000 },
  );
  /*
    The roster row's one prominent command. It was labelled "View Details" until
    admissions-v2 task 11.4 recomposed the row around a single primary control and
    a counted disclosure; the label is now "Open review", because the decision
    block inside that disclosure already offers a command labelled "Review" and two
    differently-behaving controls with the same accessible name is ambiguous
    (R16.2). A source-location pin following a surface it names — the behavioural
    claim below (one read, none of the six retired calls) is unchanged.
  */
  await page.getByRole('button', { name: /open review/i }).first().click();
  const dialog = page.getByTestId('review-workspace');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toHaveAttribute('data-workspace-version', /\d+/, { timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// 1. One read (R8.5)
// ---------------------------------------------------------------------------

test('a Tenant_Admin opens an application with one read and none of the six retired calls', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  await loginAs(page, world.tenantAdmin);

  /**
   * The six retired per-application detail calls, exactly as the modal used to
   * issue them. Naming them individually is the point: "one read" is not a vibe,
   * it is the absence of these six.
   */
  const RETIRED_DETAIL_CALLS = [
    '/details/',
    '/documents/',
    '/grades/',
    '/summary/',
    '/interviews/',
    '/admin-summary/',
  ];

  const detailReads: string[] = [];
  const retiredReads: string[] = [];
  const otherApplicationReads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/')) return;
    const namesThisApplication =
      url.pathname.includes(world.assignedApplicationId) ||
      url.searchParams.get('application_id') === world.assignedApplicationId;
    if (!namesThisApplication) return;
    const line = `${request.method()} ${url.pathname}`;
    if (url.pathname === `${WORKSPACE_API}${world.assignedApplicationId}/`) {
      detailReads.push(line);
      return;
    }
    if (RETIRED_DETAIL_CALLS.some((fragment) => url.pathname.includes(fragment))) {
      retiredReads.push(line);
      return;
    }
    // The payment ledger was the sixth call, and it is keyed by a query
    // parameter rather than a path segment.
    if (url.pathname === '/api/v1/payments/') {
      retiredReads.push(`${line}?application_id`);
      return;
    }
    otherApplicationReads.push(line);
  });

  await openWorkspace(page, world.assignedApplicantName);

  // The sections the six retired calls used to supply are all on screen.
  await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Programme information' })).toBeVisible();
  await page.getByRole('tab', { name: /documents/i }).click();
  await expect(page.getByRole('tab', { name: /documents/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: /history/i }).click();
  await page.getByRole('tab', { name: /payment/i }).click();
  await page.getByRole('tab', { name: /interview/i }).click();
  await page.getByRole('tab', { name: /academic/i }).click();

  // One detail read for the whole workspace, and visiting every tab does not add
  // another: the sections are already in hand.
  expect(
    detailReads,
    `the workspace should read once, got: ${detailReads.join(', ')}`,
  ).toEqual([`GET ${WORKSPACE_API}${world.assignedApplicationId}/`]);

  // And not one of the six retired composition calls was made.
  expect(
    retiredReads,
    `the retired detail calls must be gone, got: ${retiredReads.join(', ')}`,
  ).toEqual([]);

  /**
   * The one other per-application read the workspace legitimately makes.
   *
   * `AdminOfficialDocumentsPanel` lists *issued official artefacts* — a
   * different resource with its own canonical route and its own issuance policy
   * (task 10.4), fetched only when the Documents tab is opened. It is not part of
   * the detail composition this task replaced, so it is named here rather than
   * folded into the count: an allowance that is written down is a decision, and
   * one that is hidden in a loose assertion is not.
   */
  expect(
    otherApplicationReads.map((line) => line.replace(world.assignedApplicationId, '{id}')),
    `unexpected per-application reads: ${otherApplicationReads.join(', ')}`,
  ).toEqual(['GET /api/v1/applications/{id}/official-documents/']);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. Deterministic readiness, and no model (R11.3, R11.1)
// ---------------------------------------------------------------------------

test('the readiness tab is deterministic and there is no AI tab', async ({ page, gate }) => {
  const world = seeded!;
  await loginAs(page, world.tenantAdmin);

  const aiCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('admin-summary') || request.url().includes('preview-summary')) {
      aiCalls.push(request.url());
    }
  });

  await openWorkspace(page, world.assignedApplicantName);

  const tabs = await page.getByRole('tab').allTextContents();
  expect(tabs.join(' ')).not.toMatch(/\bAI\b/);

  await page.getByRole('tab', { name: /readiness/i }).click();
  await expect(page.getByTestId('review-readiness')).toBeVisible();

  // The named R11.3 facts, from the server's own evaluators.
  for (const code of [
    'payment_gate',
    'required_documents',
    'identity_verification',
    'grades',
    'eligibility',
    'duplicates',
    'intake_window',
  ]) {
    const check = page.getByTestId(`readiness-check-${code}`);
    await expect(check, `readiness should publish ${code}`).toBeVisible();
    // Every row states a state — never a colour alone.
    await expect(check).toHaveAttribute('data-state', /satisfied|attention|blocked/);
  }

  // A fresh draft has outstanding evidence, so this is a real checklist rather
  // than an all-green screen that would prove nothing.
  const blocked = await page.getByTestId('readiness-blocked-count').textContent();
  expect(Number((blocked || '').replace(/[^\d]/g, ''))).toBeGreaterThan(0);

  expect(aiCalls, 'no generative endpoint is called').toEqual([]);
  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. A versioned decision (R8.4)
// ---------------------------------------------------------------------------

test('a decision carries the version it read, and a replay of the old version is refused', async ({
  page,
}) => {
  const world = seeded!;
  await loginAs(page, world.tenantAdmin);
  await openWorkspace(page, world.unassignedApplicantName);

  const dialog = page.getByTestId('review-workspace');
  const firstVersion = Number(await dialog.getAttribute('data-workspace-version'));
  expect(firstVersion).toBeGreaterThan(0);

  // The first decision, through the platform's own command, carrying the version
  // the browser is displaying.
  const csrf = await csrfToken(page);
  const first = await page.request.post(
    `/api/v1/applications/${world.unassignedApplicationId}/review/`,
    {
      headers: { 'x-csrf-token': csrf },
      data: {
        new_status: 'under_review',
        notes: 'harness 9.4 first decision',
        expected_version: firstVersion,
      },
    },
  );
  expect(
    first.ok(),
    `the first decision should succeed (got ${first.status()}: ${await first.text()})`,
  ).toBeTruthy();
  const firstBody = unwrap(await first.json());
  expect(firstBody.new_status).toBe('under_review');
  expect(firstBody.version).toBeGreaterThan(firstVersion);
  // R8.4: the command states what may happen next.
  expect(Array.isArray(firstBody.allowed_transitions)).toBeTruthy();
  expect(firstBody.allowed_transitions).toContain('approved');

  // The second reviewer is still holding the version from before that decision.
  const stale = await page.request.post(
    `/api/v1/applications/${world.unassignedApplicationId}/review/`,
    {
      headers: { 'x-csrf-token': csrf },
      data: {
        new_status: 'rejected',
        notes: 'harness 9.4 stale decision',
        expected_version: firstVersion,
      },
    },
  );
  expect(stale.status(), 'a stale decision must be refused').toBe(409);

  // And the application is where the first decision left it, not the stale one.
  const after = await page.request.get(`${WORKSPACE_API}${world.unassignedApplicationId}/`);
  expect(after.ok()).toBeTruthy();
  const workspace = unwrap(await after.json());
  expect(workspace.status).toBe('under_review');
  expect(workspace.version).toBe(firstBody.version);
});

// ---------------------------------------------------------------------------
// 4. Reviewer — allowed work (R8.2, R8.7, AUTH-01)
// ---------------------------------------------------------------------------

test('a scoped Reviewer reaches the workspace for their assigned application and decides', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  await loginAs(page, world.reviewer);

  // AUTH-01: before task 9.4 this navigation ended on the *student* dashboard —
  // the frontend guard denied the one role that exists to review.
  await openWorkspace(page, world.assignedApplicantName);

  // The workspace is readable, and the decision controls are offered because the
  // backend granted `tenant.application.review` for this school.
  await expect(page.getByTestId('review-read-only')).toHaveCount(0);

  const csrf = await csrfToken(page);
  const version = Number(
    await page.getByTestId('review-workspace').getAttribute('data-workspace-version'),
  );
  const decision = await page.request.post(
    `/api/v1/applications/${world.assignedApplicationId}/review/`,
    {
      headers: { 'x-csrf-token': csrf },
      data: {
        new_status: 'under_review',
        notes: 'harness 9.4 reviewer decision',
        expected_version: version,
      },
    },
  );
  expect(
    decision.ok(),
    `the reviewer's own assigned work should be decidable (got ${decision.status()}: ${await decision.text()})`,
  ).toBeTruthy();
  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 5. Reviewer — denied work, by the endpoint (R8.7)
// ---------------------------------------------------------------------------

test('a Reviewer is refused an application they are not assigned to, by the endpoint', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  await loginAs(page, world.reviewer);
  await page.goto(APPLICATIONS_URL, { waitUntil: 'domcontentloaded' });

  // Declaring the expected refusals IS R18.4's "asserted error path".
  gate.allowRequest(WORKSPACE_API);

  const unassigned = await page.request.get(`${WORKSPACE_API}${world.unassignedApplicationId}/`);
  expect(unassigned.status(), 'unassigned work must be masked, not merely hidden').toBe(404);
  const unknown = await page.request.get(
    `${WORKSPACE_API}00000000-0000-4000-8000-000000000000/`,
  );
  expect(unknown.status()).toBe(404);

  // The two refusals are the same answer: an unassigned application's existence
  // is never confirmed. `request_id` is a per-request correlation id.
  const strip = (body: any) => {
    const { request_id: _ignored, ...rest } = body ?? {};
    return rest;
  };
  expect(strip(await unassigned.json())).toEqual(strip(await unknown.json()));

  // And the roster itself only contains their assigned work (R8.2).
  const roster = await page.request.get('/api/v1/admin/applications/?pageSize=100');
  expect(roster.ok()).toBeTruthy();
  const rows = unwrap(await roster.json())?.results ?? [];
  const ids = rows.map((row: any) => row.id);
  expect(ids).toContain(world.assignedApplicationId);
  expect(ids).not.toContain(world.unassignedApplicationId);
  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 6. Read-only Tenant_Admin — the backend is the boundary (R8.3, R8.7)
// ---------------------------------------------------------------------------

test('a read-only Tenant_Admin reads the workspace and is refused the command by the endpoint', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  await loginAs(page, world.readOnlyAdmin);
  await openWorkspace(page, world.assignedApplicantName);

  // The facts are readable...
  await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible();
  // ...the command controls are not offered, and the surface says why rather
  // than showing a dead action bar.
  await expect(page.getByTestId('review-read-only')).toBeVisible();
  await expect(page.getByTestId('assign-reviewer-open')).toHaveCount(0);
  await expect(page.getByTestId('fee-waiver-open')).toHaveCount(0);

  // The frontend is never the boundary: issuing the command directly is refused.
  gate.allowRequest('/review/');
  const csrf = await csrfToken(page);
  const refused = await page.request.post(
    `/api/v1/applications/${world.assignedApplicationId}/review/`,
    {
      headers: { 'x-csrf-token': csrf },
      data: { new_status: 'approved', notes: 'harness 9.4 denied decision' },
    },
  );
  expect(refused.status(), 'a read-only actor must be refused the decision').toBe(403);
  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});
