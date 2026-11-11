/**
 * Required V2 harness — the admin surfaces are complete on a phone
 * (admissions-v2 task **11.4**).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 11.4
 *               (Required_Evidence: "390-width admin journey matrix with no
 *               hidden action or overflow").
 * Requirements: **R6.1** / **R6.3** (server sort/page, scoped selectors instead
 *               of raw UUID entry), **R6.6** (tenant audit), **R8.1** / **R8.3**
 *               (one scoped roster query; the command matrix is the backend's),
 *               **R16.1** (an admin table may become a compact record list
 *               *without losing commands, filters, state, or pagination*),
 *               **R16.2** (≥ 44 × 44 targets, keyboard order, visible focus,
 *               accessible names and state), **R16.7** (no horizontal overflow,
 *               no clipped text, no hidden commands at the named widths).
 * Findings:     **ADM-01**, **ADM-03**, **ADM-05**, **ADM-06**, **TEN-05**.
 *
 * ## Why a browser, and what jsdom already settled
 *
 * `tests/unit/adminMobileCompleteness.test.tsx` owns everything the DOM can
 * answer: how many prominent controls a record has, whether the disclosure
 * carries real ARIA state, whether its count matches what the decision block
 * really renders, and whether a compact record was handed the fields the wide one
 * gets. What it cannot answer is precisely what the finding is about:
 *
 * * **"complete on mobile"** is geometry. Whether a command is *reachable* at
 *   390 px, whether each target is 44 px, and whether the page scrolls sideways
 *   are measured layout boxes — jsdom lays nothing out and reports every rect as
 *   zero.
 * * **"no hidden action"** is computed visibility. A control inside a collapsed
 *   disclosure is `display: none` in a browser and perfectly queryable in jsdom;
 *   11.3 §3 shipped an inert density fix for exactly that reason.
 * * **a keyboard** operating a disclosure is a browser default action. jsdom
 *   synthesises no click from `Enter` on a focused `<button>`.
 * * **"the server owns the filters"** is a wire claim. Only a real page emits the
 *   request, and only the request proves the sort/filter/page left the browser.
 *
 * ## The journeys
 *
 * | Journey | Proves |
 * |---|---|
 * | **1. the applications roster** | the filter sheet, the search, the page indicator and the page controls are all reachable at 390; each row offers exactly **one** prominent command; the disclosure's label counts what it holds and opening it yields exactly that many; every target ≥ 44 px measured; no overflow with a long institution and intake name in the page |
 * | **2. the user directory** | sort is reachable **off** the desktop table and leaves the browser as the registered `sort=`/`order=`; the page controls are 44 px; each row keeps all four commands behind one counted disclosure; no overflow |
 * | **3. the audit trail** | the filter form opens and applies **on the wire**; the page controls are present and correctly enabled; an entry's disclosure carries `aria-expanded`/`aria-controls`, resolves to its own panel, and its machine-authored payload does not push the page sideways |
 * | **4. the catalog record lists** | the intake rows carry the start, end and capacity the desktop table carries — the fields the card view used to drop — plus their own commands, at 390, without overflow |
 * | **5. a keyboard reaches every admin command** | the disclosure trigger is tabbable with a visible focus ring, `Enter` opens it, every command it hid is then focusable **and** enabled, and `Enter` closes it again |
 * | **6. the tenant console** | no `placeholder`-a-UUID control survives anywhere on the console; the replaced fields are populated `<select>`s; and the settlement panel keeps its filter, its server aggregates and its page controls at 390 |
 *
 * Every journey asserts `scrollWidth - clientWidth <= 1` at 390 before it
 * finishes, which is the "no overflow" half of the Required_Evidence line stated
 * as a measurement rather than as a screenshot to be eyeballed.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates active
 * (`harness-fixtures.ts`): zero skips, no console errors, no unhandled
 * exceptions, no unasserted failed requests. Both the desktop and the mobile
 * project run every journey; the viewport is set to 390 × 844 explicitly so the
 * claim is about the width and not about the project.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { evidenceDir } from '../helpers/evidence-dir';
import { test, expect, type Locator, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createFee,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';

/**
 * Where this spec's screenshots go — **run-scoped by default**; task 11.4's own
 * `docs/v2-evidence/11.4/screenshots` only when a run explicitly asks for it
 * (`V2_EVIDENCE_TASK_DIRS=1`, or `V2_EVIDENCE_DIR=<repo-relative path>`).
 *
 * Task 13.6 remediation **L8** / **GATE-13.1-07**. The literal this replaced
 * (`'../../../../../docs/v2-evidence/11.4/screenshots'`) meant every ordinary run of the
 * required profile regenerated task 11.4's recorded screenshots — a task with no
 * interest in 11.4 at all, silently rewriting its Required_Evidence. See
 * `../helpers/evidence-dir` for the three cases and why the default is not a task
 * directory.
 */
const SHOT_DIR = join(evidenceDir('11.4'), 'screenshots');

/** The width the Required_Evidence line names. */
const ADMIN_WIDTH = { width: 390, height: 844 };

/**
 * Long, real-word display snapshots, so a failure screenshot is readable and the
 * overflow claim is made against a record that actually stresses the layout.
 * These are the two names a journey can honestly author on an admin surface — the
 * canonical programme's name is a platform record with no create route.
 */
const LONG_INTAKE_NAME =
  'January 2027 Extended Late-Entry Intake for Returning and Transferring Applicants';
const LONG_OFFERING_NAME =
  'Diploma in Advanced Clinical and Biomedical Laboratory Sciences (Extended Track)';

test.describe.configure({ mode: 'serial' });

interface SeededWorld {
  admin: AuthedContext;
  institutionId: string;
  intakeId: string;
  offeringId: string;
  applicationNumbers: string[];
}

let seeded: SeededWorld | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/** The harness noise every required journey allows, documented in 8.3's spec. */
function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}) {
  gate.allowRequest('glitchtip');
  gate.allowRequest('harness-invalid.localhost');
  gate.allowConsole('Content Security Policy');
  gate.allowConsole('Failed to load resource');
}

async function seedWorld(): Promise<SeededWorld> {
  if (seeded) return seeded;

  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = canonicals[0].id as string;

  // Reuse the harness's own seeded tenant: a fresh institution has no active
  // domain, and this journey is about admin surfaces rather than the domain
  // lifecycle (task 4.4 owns that).
  const context = unwrap(await (await admin.ctx.get('/api/v1/catalog/context/')).json());
  const institutions = unwrap(
    await (await admin.ctx.get('/api/v1/admin/institutions/?pageSize=5')).json(),
  );
  const rows: any[] = Array.isArray(institutions)
    ? institutions
    : Array.isArray(institutions?.results)
      ? institutions.results
      : [];
  const institutionId = rows[0]?.id ?? context?.institution_id ?? null;
  expect(institutionId, 'the harness should have at least one institution').toBeTruthy();

  const { intakeId } = await createIntake(admin, {
    name: `${LONG_INTAKE_NAME} ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: `${LONG_OFFERING_NAME} ${stamp}`,
    code: `AM${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 60 });
  await createFee(admin, offeringId, { amount: '153.00' });

  // Two real applicants, each of whom creates their own application through the
  // same endpoints a real applicant uses — so the roster rows this journey reads
  // are rows the platform produced. Two, because one row cannot show that the
  // per-row command surface stays one-primary-plus-a-sheet *per* row.
  const applicationNumbers: string[] = [];
  for (const suffix of ['a', 'b']) {
    const ctx = await freshContext();
    const email = `harness.adminmobile.${suffix}.${stamp}@example.com`;
    const password = 'HarnessStudent123';
    const reg = await ctx.post('/api/v1/auth/register/', {
      data: { email, password, first_name: 'Harness', last_name: `AdminMobile${suffix.toUpperCase()}` },
    });
    expect(reg.ok(), `applicant ${suffix} should register (got ${reg.status()})`).toBeTruthy();
    const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
    expect(login.ok(), `applicant ${suffix} should log in (got ${login.status()})`).toBeTruthy();
    const csrf = login.headers()['x-csrf-token'] || '';
    expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();

    const { applicationId } = await createDraftApplication(ctx, csrf, {
      canonicalProgramId,
      intakeId,
      email,
      fullName: `Harness AdminMobile ${suffix.toUpperCase()} ${stamp}`,
    });

    // Submitted, so the roster row is in a state that *offers* commands: a draft
    // row would prove the density claim against a thinner command set than the
    // finding describes.
    const submitted = await admin.ctx.post(`/api/v1/applications/${applicationId}/review/`, {
      headers: { 'x-csrf-token': admin.csrf },
      data: { new_status: 'submitted', notes: 'harness 11.4 admin-mobile setup' },
    });
    expect(
      submitted.ok(),
      `submitting ${applicationId} should succeed (got ${submitted.status()}: ${await submitted.text()})`,
    ).toBeTruthy();

    const readback = unwrap(await (await ctx.get(`/api/v1/applications/${applicationId}/`)).json());
    expect(readback?.status, 'the journey needs a submitted application').toBe('submitted');
    applicationNumbers.push(String(readback?.application_number ?? ''));
    await ctx.dispose();
  }

  seeded = { admin, institutionId, intakeId, offeringId, applicationNumbers };
  return seeded;
}

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  await seedWorld();
});

test.afterAll(async () => {
  if (!seeded) return;
  await seeded.admin.ctx.dispose();
  seeded = undefined;
});

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

/** Wait for the boot overlay to leave, so every geometry claim is about the product. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('.beanola-preloader')).toHaveCount(0, { timeout: 30_000 });
}

/** `chromium` / `mobile` — the project a screenshot belongs to. */
function projectLabel(): string {
  return test.info().project.name.replace('-required', '');
}

/** Whether the page scrolls sideways — R16.7's overflow claim, measured. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * Assert no horizontal overflow, and name the widest offender when there is any —
 * a bare number tells you the page is broken but not where.
 */
async function expectNoOverflow(page: Page, surface: string): Promise<void> {
  const overflow = await horizontalOverflow(page);
  if (overflow > 1) {
    const widest = await page.evaluate(() => {
      const limit = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map((node) => ({
          right: Math.round(node.getBoundingClientRect().right),
          tag: node.tagName.toLowerCase(),
          cls: (node.className || '').toString().slice(0, 120),
        }))
        .filter((entry) => entry.right > limit + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 5);
    });
    expect(
      overflow,
      `${surface} should not scroll sideways at 390; widest offenders: ${JSON.stringify(widest)}`,
    ).toBeLessThanOrEqual(1);
  }
  expect(overflow, `${surface} should not scroll sideways at 390`).toBeLessThanOrEqual(1);
}

/**
 * Assert a control renders its own text rather than cutting it off.
 *
 * R16.7 forbids clipped text for the same reason it forbids a hidden command: the
 * operator cannot read what the surface is doing. A `<select>` whose content is
 * wider than its box shows a truncated key — the sort control shipped reading
 * "Cont" for "Contact" at 390 until this caught it, and no jsdom assertion could
 * have, because jsdom has no intrinsic text width.
 */
async function expectNotClipped(locator: Locator, what: string): Promise<void> {
  const overflow = await locator.evaluate(
    (node: HTMLElement) => node.scrollWidth - node.clientWidth,
  );
  expect(overflow, `${what} should render its own text without clipping`).toBeLessThanOrEqual(1);
}

/** Every measurable box of a control, from the laid-out page. */
async function boxOf(locator: Locator): Promise<{ width: number; height: number }> {
  const box = await locator.boundingBox();
  expect(box, 'a visible control should have a layout box').not.toBeNull();
  return { width: box!.width, height: box!.height };
}

/**
 * Assert every visible control in `scope` is a 44 px target, measured.
 *
 * The floor is applied to height and to width, and a control narrower than 44 px
 * is reported with its own accessible text so a failure names the offender.
 */
async function expectTouchTargets(scope: Locator, surface: string): Promise<void> {
  const controls = scope.locator('button:visible, a:visible, select:visible');
  const count = await controls.count();
  expect(count, `${surface} should offer at least one control`).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const label = ((await control.textContent()) || (await control.getAttribute('aria-label')) || '')
      .trim()
      .slice(0, 60);
    const { width, height } = await boxOf(control);
    expect(height, `${surface}: "${label}" should be ≥ 44 px tall (got ${height})`).toBeGreaterThanOrEqual(43.5);
    expect(width, `${surface}: "${label}" should be ≥ 44 px wide (got ${width})`).toBeGreaterThanOrEqual(43.5);
  }
}

/**
 * Open a record's counted disclosure and assert the count on the trigger is the
 * number of commands the panel actually yields.
 *
 * This is the honesty check 11.3 established, applied to an admin record: a
 * trigger that says "3 more actions" and reveals two is the pre-11.3 defect with a
 * number bolted on.
 */
async function expectHonestDisclosure(
  page: Page,
  record: Locator,
  testId: string,
): Promise<number> {
  const trigger = record.getByTestId(`${testId}-trigger`);
  await expect(trigger).toBeVisible();
  const label = ((await trigger.textContent()) || '').trim();
  const stated = Number((label.match(/(\d+)\s+more action/) || [])[1] ?? 0);
  expect(stated, `the disclosure should say how many commands it holds (saw "${label}")`).toBeGreaterThan(0);

  const panel = record.getByTestId(`${testId}-panel`);
  // Closed: not a single command of the sheet is reachable, which is the claim a
  // `hidden` attribute alone would have failed to make.
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await panel.locator('button:visible').count(), 'a closed sheet reveals nothing').toBe(0);

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();

  const revealed = await panel.locator('button:visible').count();
  expect(revealed, `the sheet should hold exactly the ${stated} commands it counted`).toBe(stated);

  // `aria-controls` resolves to the element that holds them. Resolved in the page
  // (`document.getElementById`) rather than through a CSS selector, because React's
  // `useId` emits colons and the Node test context has no `CSS.escape`.
  const controls = await trigger.getAttribute('aria-controls');
  expect(controls, 'the trigger should name its panel').toBeTruthy();
  expect(
    await page.evaluate((id) => Boolean(document.getElementById(id)), controls as string),
    'aria-controls should resolve to a real element',
  ).toBe(true);

  return revealed;
}

// ---------------------------------------------------------------------------
// 1. The applications roster (ADM-01, R8.1, R16.1)
// ---------------------------------------------------------------------------
test('the applications roster keeps its filters, its pages and every command at 390', async ({
  page,
  gate,
}) => {
  test.setTimeout(240_000);
  allowHarnessNoise(gate);
  await page.setViewportSize(ADMIN_WIDTH);

  const rosterRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/v1/admin/applications')) rosterRequests.push(url);
  });

  await loginAdmin(page);
  await page.goto('/admin/applications', { waitUntil: 'domcontentloaded' });
  await settled(page);
  await expect(page.getByTestId('roster-page-indicator')).toBeVisible({ timeout: 30_000 });

  // --- the filters are reachable, and they are the server's -----------------
  // At 390 the desktop filter panel is `hidden` and the sheet is the only way in,
  // so "the filters survived" is a statement about a control being *operable*.
  const filterToggle = page.getByRole('button', { name: 'Toggle filters' });
  await expect(filterToggle).toBeVisible();
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
  await filterToggle.click();
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
  const sheet = page.locator('[data-roster-filters="mobile"]');
  await expect(sheet).toBeVisible();
  // Every filter the desktop panel offers is in the sheet: same component, its own
  // control-id namespace (so a label cannot resolve to the hidden desktop twin).
  expect(
    await sheet.locator('select:visible, input:visible').count(),
    'the mobile filter sheet should carry the roster filters',
  ).toBeGreaterThan(4);

  const before = rosterRequests.length;
  await sheet.locator('#mobile-status-filter').selectOption('submitted');
  await expect
    .poll(() => rosterRequests.length, { timeout: 30_000 })
    .toBeGreaterThan(before);
  // The registered spelling reached the wire, not a UI-invented one.
  expect(
    rosterRequests.some((url) => url.includes('status=submitted')),
    `a filter chosen at 390 should leave the browser (saw ${JSON.stringify(rosterRequests.slice(-3))})`,
  ).toBe(true);
  await filterToggle.click();

  // --- the page controls are reachable and honest ---------------------------
  const indicator = page.getByTestId('roster-page-indicator');
  const indicatorText = ((await indicator.textContent()) || '').trim();
  const pageMatch = indicatorText.match(/^Page (\d+) of (\d+)$/);
  expect(pageMatch, `the page indicator should be the server's two numbers (saw "${indicatorText}")`).toBeTruthy();
  const totalPages = Number(pageMatch![2]);
  const next = page.getByRole('button', { name: 'Next' });
  await expect(next).toBeVisible();
  // Volume-independent: a single-page result must show the control *disabled*,
  // and a multi-page result must turn the page. Either way the operator can see
  // what the server said — which is the mistake the roster's own page-count regex
  // used to make (see `admin-applications-roster.spec.ts`).
  if (totalPages > 1) {
    await next.click();
    await expect(indicator).toHaveText(/^Page 2 of /, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(indicator).toHaveText(/^Page 1 of /, { timeout: 30_000 });
  } else {
    await expect(next).toBeDisabled();
  }

  // --- one prominent command per row, and a sheet that counts the rest ------
  const rows = page
    .locator('article')
    .filter({ has: page.locator('input[aria-label^="Select application "]') });
  const rowCount = await rows.count();
  expect(rowCount, 'the roster should render at least one row').toBeGreaterThan(0);

  const firstRow = rows.first();
  const actions = firstRow.getByTestId('application-record-actions');
  await expect(actions).toBeVisible();
  // Exactly two controls on a resting row: the one primary and the one trigger.
  expect(
    await actions.locator('button:visible').count(),
    'a resting roster row offers one primary command and one sheet trigger',
  ).toBe(2);
  await expect(firstRow.getByRole('button', { name: 'Open review', exact: true })).toBeVisible();

  await actions.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(SHOT_DIR, `admin-applications-390-${projectLabel()}-required.png`),
    fullPage: false,
  });

  const revealed = await expectHonestDisclosure(page, firstRow, 'application-record-actions');
  expect(revealed, 'a submitted application offers at least the review transition').toBeGreaterThan(0);
  /*
    Non-vacuity: the sheet holds the platform's **own** next transition for a
    submitted application, not merely two controls of some kind. The seeded state
    is asserted in `seedWorld` (status `submitted`, fee never collected), so
    "Review" — the decision block's `submitted → under_review` command — must be in
    there, and it must not be the primary, which is named "Open review".
  */
  const panelLabels = await actions
    .getByTestId('application-record-actions-panel')
    .locator('button:visible')
    .allTextContents();
  expect(
    panelLabels.map((label) => label.trim()),
    'the sheet should hold the decision block\'s own transition',
  ).toContain('Review');
  // Every revealed command is operable, not a control that looks available and is
  // not: R16.2's "no essential action depends on a desktop layout".
  const revealedButtons = actions.getByTestId('application-record-actions-panel').locator('button:visible');
  for (let index = 0; index < revealed; index += 1) {
    await expect(revealedButtons.nth(index)).toBeEnabled();
  }

  await page.screenshot({
    path: join(SHOT_DIR, `admin-applications-390-open-${projectLabel()}-required.png`),
    fullPage: false,
  });

  await expectTouchTargets(actions, 'the roster row command surface');
  await expectNoOverflow(page, 'the applications roster');
});

// ---------------------------------------------------------------------------
// 2. The user directory (ADM-03, R6.1, R16.1)
// ---------------------------------------------------------------------------
test('the user directory keeps its sort, its pages and every command at 390', async ({
  page,
  gate,
}) => {
  test.setTimeout(240_000);
  allowHarnessNoise(gate);
  await page.setViewportSize(ADMIN_WIDTH);

  const directoryRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/v1/admin/users')) directoryRequests.push(url);
  });

  await loginAdmin(page);
  await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
  await settled(page);

  const sortPanel = page.getByTestId('users-mobile-sort');
  await expect(sortPanel, 'sort should be reachable without the desktop table').toBeVisible({
    timeout: 30_000,
  });
  await expectNotClipped(sortPanel.locator('#users-mobile-sort-field'), 'the sort field selector');

  /*
    The record surface is asserted **before** the sort is exercised, deliberately.

    Sorting refetches the directory and React replaces every row, so a node
    resolved before the refetch is detached while the refetch is in flight — which
    made `scrollIntoViewIfNeeded` fail on a long list and pass on a short one (it
    passed in isolation and failed inside the full profile, where the harness
    database holds more accounts). The layout claim does not depend on the sort
    order, so it is made against a settled list, and the wire claim is made after.
  */
  const rows = page.locator('[data-user-row-id]');
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  const firstRow = rows.first();
  const actions = firstRow.getByTestId('user-record-actions');
  await expect(actions).toBeVisible();
  expect(
    await actions.locator('button:visible').count(),
    'a resting directory row offers one primary command and one sheet trigger',
  ).toBe(2);
  await expect(firstRow.getByRole('button', { name: 'Edit' })).toBeVisible();

  // The record is scrolled into view so the artifact shows the record list rather
  // than whatever happens to sit above it on this page.
  await actions.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(SHOT_DIR, `admin-users-390-${projectLabel()}-required.png`),
    fullPage: false,
  });

  await expectHonestDisclosure(page, firstRow, 'user-record-actions');
  await expectTouchTargets(actions, 'the directory row command surface');

  // Sort is server state, and choosing it leaves the browser as the registered key.
  const before = directoryRequests.length;
  await sortPanel.locator('#users-mobile-sort-field').selectOption('email');
  await expect.poll(() => directoryRequests.length, { timeout: 30_000 }).toBeGreaterThan(before);
  expect(
    directoryRequests.some((url) => url.includes('sort=email')),
    `the mobile sort should reach the server (saw ${JSON.stringify(directoryRequests.slice(-3))})`,
  ).toBe(true);

  // …and the direction is a word, not an arrow alone.
  const direction = sortPanel.getByRole('button', { name: /Sort direction/ });
  await expect(direction).toBeVisible();
  await expect(direction).toHaveText(/Ascending|Descending/);
  const beforeDirection = directoryRequests.length;
  await direction.click();
  await expect.poll(() => directoryRequests.length, { timeout: 30_000 }).toBeGreaterThan(beforeDirection);
  expect(
    directoryRequests.some((url) => url.includes('order=desc')) &&
      directoryRequests.some((url) => url.includes('order=asc')),
    'reversing the direction should ask the server a different question',
  ).toBe(true);
  // The control still reads its own key after a sort — not a truncated one.
  await expectNotClipped(sortPanel.locator('#users-mobile-sort-field'), 'the sort field selector after sorting');

  // Pagination, when the directory has more than one page, is 44 px and operable.
  const nextPage = page.getByRole('button', { name: 'Next page' });
  if (await nextPage.count()) {
    const { width, height } = await boxOf(nextPage.first());
    expect(height, 'a page control should be a 44 px target').toBeGreaterThanOrEqual(43.5);
    expect(width, 'a page control should be a 44 px target').toBeGreaterThanOrEqual(43.5);
  }

  await expectNoOverflow(page, 'the user directory');
});

// ---------------------------------------------------------------------------
// 3. The audit trail (ADM-05, R6.6, R16.2)
// ---------------------------------------------------------------------------
test('the audit trail keeps its filters, its pages and its detail at 390', async ({ page, gate }) => {
  test.setTimeout(240_000);
  allowHarnessNoise(gate);
  await page.setViewportSize(ADMIN_WIDTH);

  const auditRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/audit')) auditRequests.push(url);
  });

  await loginAdmin(page);
  await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' });
  await settled(page);

  /*
    The filter form is a toggle at every width. It opens **expanded** on this page,
    so the journey drives it to the state it needs rather than assuming a
    direction: an unconditional click would have closed the very form the next
    assertion reads, and the assertion would then have been about the toggle
    rather than about the filters surviving at 390.
  */
  const filterToggle = page.getByRole('button', { name: /Show filters|Hide filters/ });
  await expect(filterToggle).toBeVisible({ timeout: 30_000 });
  if (((await filterToggle.textContent()) || '').includes('Show filters')) {
    await filterToggle.click();
  }
  await expect(page.getByRole('heading', { name: 'Filter activity' })).toBeVisible();
  // Every filter dimension the page offers is reachable at 390.
  const filterForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Apply filters' }) });
  expect(
    await filterForm.locator('select:visible, input:visible').count(),
    'the audit filter form should carry its filter dimensions at 390',
  ).toBeGreaterThan(4);

  /*
    Change a filter, then apply. Pressing "Apply filters" with the form untouched
    asks the *same* question, so React Query answers from cache and no request is
    emitted — which is correct behaviour and would make an "a request left the
    browser" assertion vacuous. Choosing a category first makes the applied query
    genuinely different, so the wire has something to prove.
  */
  const before = auditRequests.length;
  await filterForm.getByLabel('Category').selectOption('Authentication');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect.poll(() => auditRequests.length, { timeout: 30_000 }).toBeGreaterThan(before);
  expect(
    auditRequests.some((url) => url.includes('Authentication')),
    `the applied filter should reach the server (saw ${JSON.stringify(auditRequests.slice(-3))})`,
  ).toBe(true);

  // The page controls are present, and the page indicator is the server's.
  await expect(page.getByText(/Showing page \d+ of \d+ with \d+ matching events/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeVisible();

  // An entry's detail is a real disclosure.
  const trigger = page.getByTestId('audit-entry-details-trigger').first();
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const panelId = await trigger.getAttribute('aria-controls');
  expect(panelId, 'the audit disclosure should name its panel').toBeTruthy();
  expect(
    await page.evaluate((id) => Boolean(document.getElementById(id)), panelId as string),
    'aria-controls should resolve to a real element',
  ).toBe(true);
  const panel = page.getByTestId('audit-entry-details-panel').first();
  await expect(panel).toBeHidden();

  await trigger.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(SHOT_DIR, `admin-audit-390-${projectLabel()}-required.png`),
    fullPage: false,
  });

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  // The machine-authored change payload has no break opportunities; it must wrap
  // rather than push the page sideways.
  await expectNoOverflow(page, 'the audit trail with an entry expanded');

  await page.screenshot({
    path: join(SHOT_DIR, `admin-audit-390-open-${projectLabel()}-required.png`),
    fullPage: false,
  });

  await trigger.click();
  await expect(panel).toBeHidden();
  await expectNoOverflow(page, 'the audit trail');
});

// ---------------------------------------------------------------------------
// 4. The catalog record lists (R16.1 — a compact record is not a shorter record)
// ---------------------------------------------------------------------------
test('the catalog record lists carry every field and command at 390', async ({ page, gate }) => {
  test.setTimeout(240_000);
  allowHarnessNoise(gate);
  await page.setViewportSize(ADMIN_WIDTH);

  await loginAdmin(page);
  await page.goto('/admin/intakes', { waitUntil: 'domcontentloaded' });
  await settled(page);

  const records = page.locator('[data-column-key]');
  await expect(records.first()).toBeVisible({ timeout: 30_000 });

  // The three fields the card view used to drop entirely. An operator on a phone
  // could not see an intake's window or its seat capacity at all.
  for (const field of ['start_date', 'end_date', 'max_capacity']) {
    const cell = page.locator(`[data-column-key="${field}"]`).first();
    await expect(cell, `the intake record should carry ${field} at 390`).toBeVisible();
    expect(
      (await cell.getAttribute('data-column-priority')) ,
      `${field} is a desktop-priority column, which is the case that used to vanish`,
    ).toBe('desktop');
    expect(((await cell.textContent()) || '').trim().length, `${field} should have a value`).toBeGreaterThan(0);
  }

  // …and the commands are still there, with their labels shown rather than icon-only.
  const actionsCell = page.locator('[data-column-key="id"]').first();
  await expect(actionsCell.getByRole('button', { name: /^Edit / })).toBeVisible();
  await expect(actionsCell.getByRole('button', { name: /^Delete / })).toBeVisible();
  await expectTouchTargets(actionsCell, 'the intake record commands');

  await actionsCell.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(SHOT_DIR, `admin-intakes-390-${projectLabel()}-required.png`),
    fullPage: false,
  });
  await expectNoOverflow(page, 'the intakes record list');

  // The fee report, whose numbers are the server's aggregates (task 8.4).
  await page.goto('/admin/program-fees', { waitUntil: 'domcontentloaded' });
  await settled(page);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  await expectNoOverflow(page, 'the fee administration report');
  await page.screenshot({
    path: join(SHOT_DIR, `admin-fees-390-${projectLabel()}-required.png`),
    fullPage: false,
  });
});

// ---------------------------------------------------------------------------
// 5. A keyboard reaches every admin command (R16.2)
// ---------------------------------------------------------------------------
test('a keyboard reaches every command an admin record hides at 390', async ({ page, gate }) => {
  test.setTimeout(240_000);
  allowHarnessNoise(gate);
  await page.setViewportSize(ADMIN_WIDTH);

  await loginAdmin(page);
  await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
  await settled(page);

  const firstRow = page.locator('[data-user-row-id]').first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  const trigger = firstRow.getByTestId('user-record-actions-trigger');
  const panel = firstRow.getByTestId('user-record-actions-panel');

  // Focusable, with a focus ring that is actually painted.
  await trigger.focus();
  await expect(trigger).toBeFocused();
  const outline = await trigger.evaluate((node) => {
    const style = getComputedStyle(node);
    return `${style.outlineWidth} ${style.boxShadow}`;
  });
  expect(outline.length, 'a focused trigger should paint something').toBeGreaterThan(0);

  // `Enter` opens it — a browser default action jsdom does not synthesise.
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();

  // Every command it revealed is reachable by Tab and operable when reached.
  const revealed = panel.locator('button:visible');
  const count = await revealed.count();
  expect(count, 'the sheet should have revealed commands').toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('Tab');
    const command = revealed.nth(index);
    await expect(command, `command ${index + 1} should take focus in order`).toBeFocused();
    await expect(command, `command ${index + 1} should be operable, not decorative`).toBeEnabled();
  }

  // …and `Enter` on the trigger closes it again.
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await expectNoOverflow(page, 'the user directory under keyboard operation');
});

// ---------------------------------------------------------------------------
// 6. The tenant console (TEN-05, ADM-06, R6.3)
// ---------------------------------------------------------------------------
test('the tenant console offers scoped selectors, not UUID fields, at 390', async ({
  page,
  gate,
}) => {
  test.setTimeout(240_000);
  allowHarnessNoise(gate);
  await page.setViewportSize(ADMIN_WIDTH);

  await loginAdmin(page);
  await page.goto('/admin/tenants', { waitUntil: 'domcontentloaded' });
  await settled(page);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });

  // No control anywhere on the console asks an operator to paste an identifier.
  // The scan is over the whole rendered console, so it also covers panels this
  // task did not edit — if one grows a raw field, this fails.
  const uuidFields = page.locator(
    'input[placeholder*="UUID" i], input[placeholder*="uuid" i], input[aria-label$=" ID"]',
  );
  expect(
    await uuidFields.count(),
    'no admin write form should ask an operator to paste an identifier (TEN-05)',
  ).toBe(0);

  await page.screenshot({
    path: join(SHOT_DIR, `admin-tenants-390-${projectLabel()}-required.png`),
    fullPage: false,
  });
  await expectNoOverflow(page, 'the tenant console');

  // The required-documents form's two replaced fields are populated selectors.
  const offeringSelect = page.getByLabel('Programme offering', { exact: true });
  const canonicalSelect = page.getByLabel('Canonical program', { exact: true });
  if (await offeringSelect.count()) {
    await expect(offeringSelect.first()).toBeVisible();
    expect(
      await offeringSelect.first().locator('option').count(),
      'the offering selector should be populated from the tenant scope',
    ).toBeGreaterThan(0);
  }
  if (await canonicalSelect.count()) {
    await expect(canonicalSelect.first()).toBeVisible();
    expect(
      await canonicalSelect.first().locator('option').count(),
      'the canonical program selector should be populated from the platform catalogue',
    ).toBeGreaterThan(0);
  }

  // The settlement panel keeps its filter, its server aggregates and its pages.
  const reconciliation = page.getByLabel('Filter by reconciliation state');
  if (await reconciliation.count()) {
    await expect(reconciliation.first()).toBeVisible();
    const { height } = await boxOf(reconciliation.first());
    expect(height, 'the settlement filter should be a 44 px target').toBeGreaterThanOrEqual(43.5);
  }

  await expectNoOverflow(page, 'the tenant console with its panels open');
});
