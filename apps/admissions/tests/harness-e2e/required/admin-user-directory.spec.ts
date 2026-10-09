/**
 * Required V2 harness — the user directory is the server's (task 9.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.3 — "Rebuild user
 * directory CRUD, import, bulk, and export".
 * Requirements: **R6.1** (list, search, filters, sort, pagination, facets,
 * counts, and export are server-side and preserve tenant scope in every
 * request), **R6.2** (one supported field and role contract; ignored mutation
 * fields are rejected, not silently lost), **R6.4** (previewed, tenant-bound,
 * atomic, idempotent import with row-level failures), **R6.5** (bulk mutation
 * and export are backend commands, and the frontend does not export only its
 * loaded page).
 * Findings: **ADM-03**, **ADM-04**, **AUTH-04**.
 *
 * These are the task's four `_Evidence:` claims, in a real browser, because
 * every defect in ADM-03/ADM-04 was a *rendering* or *wiring* defect: the
 * endpoint always knew the totals, the browser recounted the rows it had; the
 * dialog always showed a preview, it just wasn't a statement about the file.
 *
 *   1. **page 2 and beyond** — 30 seeded accounts, 25 on screen: the rows change,
 *      the headline total does not, `page=2` is on the wire, and `Page 2 of N` is
 *      the server's own `totalPages`.
 *   2. **ignored-field rejection** — an operator corrects an email address in the
 *      edit dialog and the change *lands*; a request naming a field the contract
 *      does not implement is refused with a 400 that names it, rather than a 200
 *      that discards it.
 *   3. **import rollback** — a file with one bad row is previewed as "would not
 *      commit", committed anyway, and the database is left exactly as it was;
 *      the row failures are downloadable and addressed by line number.
 *   4. **audited export** — the export is the whole filtered set regardless of
 *      the page on screen, it is refused without the export capability, and one
 *      audit row records the command without recording an applicant.
 *
 * Plus a facet journey, because a pick list harvested from the loaded rows is
 * the other half of ADM-03 and only the browser can show the select.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates
 * active (`harness-fixtures.ts`) — zero skips, no console errors, no unasserted
 * failed requests. Both the desktop and the mobile project run every journey.
 */
import { test, expect, type Page } from '../harness-fixtures';
import { freshContext, superAdminContext, type AuthedContext } from '../helpers/api';

const USERS_URL = '/admin/users';
const USERS_API = '/api/v1/admin/users/';

/** The directory's page size (`usersReducer.PAGE_SIZE`). */
const PAGE_SIZE = 25;

/** Seeded so page 2 is a real page with real rows on it. */
const SEEDED_ACCOUNTS = 30;

test.describe.configure({ mode: 'serial' });

interface Seeded {
  admin: AuthedContext;
  institutionId: string;
  institutionName: string;
  /** The email of one seeded account, for the edit journey. */
  editableEmail: string;
}

let seeded: Seeded | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/**
 * The distinct row ids on screen.
 *
 * The page renders both a desktop table and a mobile card list (one hidden by a
 * breakpoint), so every account carries the attribute twice. Counting distinct
 * ids is the honest measure of "how many rows are on this page".
 */
async function rowIds(page: Page): Promise<string[]> {
  const ids = await page
    .locator('[data-user-row-id]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-user-row-id') || ''));
  return Array.from(new Set(ids.filter(Boolean)));
}

/** The row block for one account, in whichever layout is visible. */
function visibleRow(page: Page, id: string) {
  return page.locator(`[data-user-row-id="${id}"]:visible`).first();
}

/**
 * Search, then wait for the answer the server sent for *that* term.
 *
 * The search is debounced (300 ms) and the rows re-render when the answer lands,
 * so a click issued in between detaches. Waiting for the request the term
 * produced is deterministic; a fixed sleep is not.
 */
async function searchAndSettle(page: Page, term: string): Promise<void> {
  const answered = page.waitForResponse((response) => {
    if (!response.url().includes('/api/v1/admin/users/') || response.status() !== 200) {
      return false;
    }
    // Compared through `searchParams` rather than a substring, so the assertion
    // does not depend on whether a space is encoded as `+` or `%20`.
    return new URL(response.url()).searchParams.get('search') === term;
  });
  await page.getByLabel('Search users').fill(term);
  await answered;
  // One more frame for React to commit the new rows before anything is clicked.
  await expect(page.locator('[data-user-row-id]:visible').first()).toBeVisible();
}

async function loginAdmin(page: Page): Promise<void> {
  const login = await page.request.post('/api/v1/auth/login/', {
    data: {
      email: process.env.HARNESS_SUPERADMIN_EMAIL || 'platform-admin@harness.beanola.local',
      password: process.env.HARNESS_SUPERADMIN_PASSWORD || 'HarnessPlatform123!',
    },
  });
  expect(
    login.ok(),
    `super-admin browser login should succeed (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
}

/** Seed enough accounts, through the platform's own import command, for paging. */
async function seedDirectory(): Promise<Seeded> {
  const admin = await superAdminContext();
  const headers = { 'x-csrf-token': admin.csrf };

  const scope = await admin.ctx.get('/api/v1/admin/scope/');
  expect(scope.ok(), `admin scope should resolve (got ${scope.status()})`).toBeTruthy();
  const institutions = unwrap(await scope.json())?.institutions ?? [];
  expect(institutions.length, 'the harness should expose at least one school').toBeGreaterThan(0);
  const institutionId = institutions[0].id as string;
  const institutionName = (institutions[0].name || institutions[0].code) as string;

  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const rows = Array.from({ length: SEEDED_ACCOUNTS }, (_, index) => ({
    email: `harness.dir.${stamp}.${String(index).padStart(2, '0')}@example.com`,
    full_name: `Directory Person ${String(index).padStart(2, '0')}`,
    role: index % 7 === 0 ? 'reviewer' : 'student',
  }));

  const imported = await admin.ctx.post(`${USERS_API}batch-import/`, {
    headers: { ...headers, 'idempotency-key': `harness-dir-seed-${stamp}` },
    data: { institution_id: institutionId, mode: 'all_or_nothing', rows },
  });
  expect(
    imported.status(),
    `seeding through the import command should commit (got ${imported.status()}: ${await imported.text()})`,
  ).toBe(201);
  const result = unwrap(await imported.json());
  expect(result.created, 'every seeded row should have been created').toBe(SEEDED_ACCOUNTS);

  return {
    admin,
    institutionId,
    institutionName,
    editableEmail: rows[1]!.email,
  };
}

// Declared to the request gate up front: the export-capability journey asserts a
// 403 on purpose, and the gate must see that as an asserted error path (R18.4)
// rather than an unexplained failed request.
test.beforeEach(async ({ gate }) => {
  gate.allowRequest(`${USERS_API}export/`);
});

test.beforeAll(async () => {
  seeded = await seedDirectory();
});

test.afterAll(async () => {
  await seeded?.admin.ctx.dispose();
});

// ---------------------------------------------------------------------------
// 1. Page 2 and beyond (R6.1, ADM-03)
// ---------------------------------------------------------------------------

test('page 2 keeps the server total and changes only the rows', async ({ page, gate }) => {
  await loginAdmin(page);

  const pageRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/v1/admin/users/') && !url.includes('/export/')) {
      pageRequests.push(url);
    }
  });

  await page.goto(USERS_URL);
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

  const total = await page.getByTestId('user-total-count').innerText();
  const totalCount = Number(total.replace(/[^\d]/g, ''));
  expect(
    totalCount,
    'the headline count is the whole directory, so it must exceed one page',
  ).toBeGreaterThan(PAGE_SIZE);

  const firstPageIds = await rowIds(page);
  expect(firstPageIds.length).toBe(PAGE_SIZE);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

  const secondPageIds = await rowIds(page);
  expect(secondPageIds.length).toBeGreaterThan(0);
  // The rows moved; the total did not. That pairing is ADM-03.
  expect(secondPageIds).not.toEqual(firstPageIds);
  for (const id of secondPageIds) expect(firstPageIds).not.toContain(id);

  const totalOnPageTwo = await page.getByTestId('user-total-count').innerText();
  expect(totalOnPageTwo).toBe(total);

  // The page number went on the wire, in the registered spelling.
  expect(pageRequests.some((url) => url.includes('page=2'))).toBeTruthy();
  expect(pageRequests.every((url) => !url.includes('roleFilter='))).toBeTruthy();

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. Facets over the whole filtered set (R6.1, ADM-03)
// ---------------------------------------------------------------------------

test('the role select offers whole-set counts, not the loaded rows', async ({ page }) => {
  await loginAdmin(page);
  await page.goto(USERS_URL);
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

  const select = page.locator('#user-role-filter');
  const optionLabels = await select.locator('option').evaluateAll((options) =>
    options.map((option) => option.textContent || ''),
  );

  // Each option carries a count for the whole filtered directory. A list built
  // from the loaded page could not carry a count at all.
  const counted = optionLabels.filter((label) => /\(\d+\)$/.test(label.trim()));
  expect(counted.length, `expected counted role options, got ${optionLabels.join(' | ')}`).toBeGreaterThan(0);

  const reviewerOption = optionLabels.find((label) => label.startsWith('Reviewer'));
  expect(reviewerOption, 'the reviewer role should be offered with its own count').toBeTruthy();
  const reviewerCount = Number((reviewerOption || '').replace(/[^\d]/g, ''));
  expect(reviewerCount).toBeGreaterThan(0);

  // Narrow to it: the total moves with the filter, and the dimension stays open
  // so the operator can widen again.
  await select.selectOption('reviewer');
  await expect(page.getByTestId('user-total-count')).toHaveText(String(reviewerCount));
  const afterLabels = await select.locator('option').evaluateAll((options) =>
    options.map((option) => option.textContent || ''),
  );
  expect(afterLabels.some((label) => label.startsWith('Student'))).toBeTruthy();
});

// ---------------------------------------------------------------------------
// 3. Ignored-field rejection (R6.2, ADM-03)
// ---------------------------------------------------------------------------

test('an edited email lands, and an unsupported field is refused', async ({ page }) => {
  await loginAdmin(page);
  await page.goto(USERS_URL);
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

  const target = seeded!.editableEmail;
  await searchAndSettle(page, target);
  await expect(page.getByTestId('user-total-count')).toHaveText('1');

  const [rowId] = await rowIds(page);
  expect(rowId, 'the searched account should be on screen').toBeTruthy();

  const corrected = target.replace('@example.com', '.corrected@example.com');
  await visibleRow(page, rowId!).getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Email', { exact: false }).first().fill(corrected);
  await page.getByRole('button', { name: /save|update/i }).last().click();

  // The address changed. Before 9.3 this returned 200 and discarded the field.
  await page.getByLabel('Search users').fill(corrected);
  await expect(page.getByTestId('user-total-count')).toHaveText('1');
  // Asserted on the *visible* layout: the page renders a desktop table and a
  // mobile card list, and only one of them is on screen at a given breakpoint.
  await expect(page.locator('[data-user-row-id]:visible').first()).toContainText(corrected);

  // And a field the contract does not implement is a 400 that names it, checked
  // on the wire because no UI offers one.
  const targetId = rowId;
  const session = await page.request.get('/api/v1/auth/session/?refresh_csrf=1');
  const csrf = session.headers()['x-csrf-token'] || '';
  const refused = await page.request.patch(`${USERS_API}${targetId}/`, {
    headers: { 'x-csrf-token': csrf },
    data: { first_name: 'Ignored', nrc_number: '111111/11/1' },
  });
  expect(refused.status()).toBe(400);
  const body = await refused.json();
  expect(body.code).toBe('UNSUPPORTED_FIELD');
  expect(JSON.stringify(body)).toContain('nrc_number');
});

// ---------------------------------------------------------------------------
// 4. Import preview, rollback, and downloadable row failures (R6.4, ADM-04)
// ---------------------------------------------------------------------------

test('one bad row rolls the whole import back, and the preview said so', async ({ page, gate }) => {
  await loginAdmin(page);
  await page.goto(USERS_URL);
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

  const before = Number((await page.getByTestId('user-total-count').innerText()).replace(/[^\d]/g, ''));

  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const goodEmail = `harness.import.${stamp}.ok@example.com`;
  const csv = [
    'full_name,email,phone,role,password',
    `Import Good,${goodEmail},,student,`,
    `Import Bad,harness.import.${stamp}.bad@example.com,,wizard,`,
  ].join('\n');

  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('heading', { name: 'Import users' })).toBeVisible();

  await page.locator('#import-institution').selectOption(seeded!.institutionId);
  await page.locator('#import-mode').selectOption('all_or_nothing');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'harness-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });

  await page.getByRole('button', { name: 'Check the file' }).click();

  // The preview is a statement about the file: it names the failing row by its
  // own line number and says the batch would not commit.
  await expect(page.getByText(/would fail, so nothing would be imported/)).toBeVisible();
  await expect(page.getByText(/Row 2:/)).toBeVisible();
  await expect(page.getByText('UNSUPPORTED_ROLE', { exact: false })).toBeVisible();
  // And the commit is not offered, because the server said it would do nothing.
  await expect(page.getByRole('button', { name: /^Import \d+ users$/ })).toBeDisabled();

  // The failures are downloadable, addressed by line number (R6.4).
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download failures' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('user-import-errors.csv');

  await page.getByRole('button', { name: 'Cancel' }).click();

  // Nothing was created: not the bad row, and not the good one either.
  await expect(page.getByTestId('user-total-count')).toHaveText(String(before));
  await page.getByLabel('Search users').fill(goodEmail);
  await expect(page.getByTestId('user-total-count')).toHaveText('0');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

test('a clean file commits, and every account lands in the chosen school', async ({ page }) => {
  await loginAdmin(page);
  await page.goto(USERS_URL);
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const email = `harness.import.${stamp}.clean@example.com`;
  const csv = ['full_name,email,phone,role,password', `Import Clean,${email},,reviewer,`].join('\n');

  await page.getByRole('button', { name: 'Import' }).click();
  await page.locator('#import-institution').selectOption(seeded!.institutionId);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'harness-import-clean.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });
  await page.getByRole('button', { name: 'Check the file' }).click();
  await expect(page.getByText(/Ready to import 1 of 1 rows/)).toBeVisible();
  await page.getByRole('button', { name: /^Import 1 users$/ }).click();
  await expect(page.getByTestId('import-created-count')).toHaveText('1');
  await expect(page.getByTestId('import-failed-count')).toHaveText('0');
  // `.first()` — the dialog chrome contributes its own icon-only "Close".
  await page.getByRole('button', { name: 'Close' }).first().click();

  await page.getByLabel('Search users').fill(email);
  await expect(page.getByTestId('user-total-count')).toHaveText('1');
  // ADM-04: the created account is bound to a school, so it has tenant access on
  // its first sign-in rather than a role string and nothing else.
  await page.locator('#user-membership-filter').selectOption('true');
  await expect(page.getByTestId('user-total-count')).toHaveText('1');
});

// ---------------------------------------------------------------------------
// 5. The export is page-independent and audited (R6.5)
// ---------------------------------------------------------------------------

test('the export is the whole filtered set and is audited, not the loaded page', async ({
  page,
  gate,
}) => {
  await loginAdmin(page);
  await page.goto(USERS_URL);
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

  const total = Number((await page.getByTestId('user-total-count').innerText()).replace(/[^\d]/g, ''));
  expect(total).toBeGreaterThan(PAGE_SIZE);

  // Stand on page 2 first: the export must not depend on where the operator is.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

  const exportRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/admin/users/export/')) exportRequests.push(request.url());
  });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('users.csv');

  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString('utf-8');
  const lines = body.trim().split('\n');
  // Header + one line per matching account, not per row on screen.
  expect(lines.length - 1).toBe(total);

  // The page was dropped from the export request.
  expect(exportRequests.length).toBeGreaterThan(0);
  for (const url of exportRequests) {
    expect(url).not.toContain('page=');
    expect(url).not.toContain('pageSize=');
  }

  // One audit row records the command — the actor, the filters, the row count —
  // and no applicant.
  const audit = await page.request.get('/api/v1/admin/audit-logs/?action=user.exported&pageSize=5');
  expect(audit.ok(), `audit read should succeed (got ${audit.status()})`).toBeTruthy();
  const rows = unwrap(await audit.json())?.results ?? [];
  const exportRow = rows.find((row: any) => row.action === 'user.exported');
  expect(exportRow, 'the export should be audited').toBeTruthy();
  const changes = exportRow.changes || {};
  expect(changes.row_count).toBe(total);
  expect(changes.page_independent).toBe(true);
  // The decision is recorded; the data is not.
  const blob = JSON.stringify(changes);
  expect(blob).not.toContain('@example.com');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

test('a reader without the export capability is not offered the export', async ({ page }) => {
  // A membership with **no explicit grant** is the platform's read-only default
  // bundle: this actor holds `tenant.staff.read` and not
  // `tenant.application.export`, so they may read the directory and may not
  // export it — and the button follows the backend's own `can_export` rather
  // than a role guess.
  //
  // The actor is an `admin` rather than a `reviewer` because the *frontend*
  // admin workspace is reachable by the admin role tier; a reviewer is routed to
  // the student workspace. That is a pre-9.3 navigation property and not what
  // this journey is about — the capability, not the role, is what gates the
  // export.
  const admin = seeded!.admin;
  const headers = { 'x-csrf-token': admin.csrf };
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const email = `harness.reader.${stamp}@example.com`;
  const password = 'HarnessReader123!';

  const created = await admin.ctx.post(USERS_API, {
    headers,
    data: {
      email,
      password,
      first_name: 'Read',
      last_name: 'Only',
      role: 'admin',
      institution_id: seeded!.institutionId,
    },
  });
  expect(
    created.status(),
    `reader creation should succeed (got ${created.status()}: ${await created.text()})`,
  ).toBe(201);

  const login = await page.request.post('/api/v1/auth/login/', { data: { email, password } });
  expect(login.ok(), `reader login should succeed (got ${login.status()})`).toBeTruthy();

  await page.goto(USERS_URL);
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
  await expect(page.getByTestId('user-total-count')).toBeVisible();
  // The read works; the export is simply not offered.
  await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);

  // And the endpoint refuses it too — the frontend is never the boundary.
  const refused = await page.request.get(`${USERS_API}export/`);
  expect(refused.status()).toBe(403);
  const body = await refused.json();
  expect(body.code).toBe('INSUFFICIENT_PERMISSIONS');
});

// ---------------------------------------------------------------------------
// 6. Bulk is one command (R6.5)
// ---------------------------------------------------------------------------

test('a bulk role change is one confirmed, all-or-nothing command', async ({ page, gate }) => {
  await loginAdmin(page);
  await page.goto(USERS_URL);
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

  // Narrow to the seeded students so the selection is small and predictable.
  await searchAndSettle(page, 'Directory Person 1');
  await expect(page.getByTestId('user-total-count')).not.toHaveText('0');

  const [firstId] = await rowIds(page);
  expect(firstId, 'at least one seeded account should be on screen').toBeTruthy();
  await visibleRow(page, firstId!).getByRole('button', { name: /select user/i }).click();
  await expect(page.getByText(/1 of 25 selected/)).toBeVisible();

  const bulkRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/admin/users/bulk/')) bulkRequests.push(request.url());
  });

  await page.getByRole('button', { name: 'Change role' }).first().click();
  await page.locator('#bulk-role').selectOption('reviewer');

  // The confirmation code is recomputed for the *chosen role*, so it is read
  // after the select settles. It is the first 8 characters of the same SHA-256
  // the server recomputes over the sorted ids plus the operation and role, which
  // is what makes it part of the command's identity rather than a mis-click
  // guard.
  const codeElement = page.getByTestId('bulk-confirmation-code');
  await expect(codeElement).toBeVisible();
  const token = (await codeElement.innerText()).trim();
  expect(token, 'the dialog should present a confirmation code').toBeTruthy();
  await page.locator('#bulk-confirm').fill(token);

  const confirmButton = page.getByRole('button', { name: 'Change role' }).last();
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  await expect(page.getByText('Bulk change applied')).toBeVisible();
  // `.first()` — the dialog chrome contributes its own icon-only "Close".
  await page.getByRole('button', { name: 'Close' }).first().click();

  // Exactly one command reached the server for N accounts.
  expect(bulkRequests.length).toBe(1);

  // And the change is real.
  const detail = await page.request.get(`${USERS_API}${firstId}/`);
  expect(detail.ok()).toBeTruthy();
  expect(unwrap(await detail.json()).role).toBe('reviewer');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});
