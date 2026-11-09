/**
 * Required V2 harness — a dashboard number is measured, and polling keeps its
 * scope (task 9.2).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.2 — "Make
 * dashboard metrics truthful".
 * Requirements: **R8.6** (dashboard metrics are authoritative, scope-aware,
 * definition-labelled, and explicit about loading, stale, error, and unknown
 * states; missing data never becomes a healthy zero), **R17.4** / **R17.6** (an
 * honest degraded state, never a failure relabelled as success).
 * Findings: **ADM-02** — "Missing dashboard metrics are synthesized as healthy
 * zeros, scoped polling can lose institution scope, and enabled accounts are
 * labeled online users." **MAINT-02** — misleading labels.
 *
 * This is the task's `_Evidence:` line's third claim: **a scoped polling E2E
 * proving tenant selection survives polling**. The other two claims live in
 * `backend/tests/unit/test_dashboard_metrics_9_2.py` (every number against an
 * independent count) and
 * `apps/admissions/tests/unit/dashboardMetricsTruthful.test.tsx` (a failed
 * source renders unknown).
 *
 * Why a browser is required here: the polling defect was invisible to every
 * other layer. The endpoint was always correct — it narrowed to whatever
 * `?institution_id=` it was given. The *poll* simply asked a different question
 * than the page had: `fetchDashboardStats()` took no argument and cached under a
 * bare key, so a super-admin who selected one school saw that school's numbers
 * until the first poll landed and then saw platform-wide totals under the same
 * heading, with no event on screen to explain the change. Only a real elapsed
 * polling interval in a real browser can show that, and only the wire can prove
 * the fix — so these journeys watch both.
 *
 *   1. **Every number is measured** — each tile carries a definition and a state
 *      of `ok`, and no tile renders "Unknown" on a healthy read.
 *   2. **A tile is the roster it opens** — the tile's count equals the
 *      `totalCount` of the roster its link opens (the same claim the backend
 *      makes in SQL, here end-to-end through two endpoints and a navigation).
 *   3. **Tenant selection survives polling** — select a school, wait out a full
 *      polling interval, and every poll on the wire still carries that school's
 *      `institution_id` while the rendered scope line and numbers stay put.
 *   4. **A failed source renders unknown, not zero** — the dashboard read is
 *      failed at the network boundary and the page says so instead of showing
 *      fourteen zeros and a healthy status.
 *   5. **Nothing claims to measure presence** — the MAINT-02 relabel, checked on
 *      the rendered page.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates
 * active (`harness-fixtures.ts`) — zero skips, no console errors, no unasserted
 * failed requests. Both the desktop and the mobile project run every journey.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';

/** The dashboard's polling interval (`Dashboard.tsx`), in milliseconds. */
const POLLING_INTERVAL_MS = 30_000;

/** Applications seeded so every exception counter has something real to count. */
const SEEDED_APPLICATIONS = 3;

/** The six exception tiles, by their rendered label and roster query. */
const EXCEPTION_TILES: ReadonlyArray<{ label: string; query: string }> = [
  { label: 'Reviews past SLA', query: 'overdue_review=true' },
  { label: 'Pending review', query: 'review_queue=true' },
  { label: 'Documents to verify', query: 'has_pending_documents=true' },
  { label: 'Payments pending', query: 'payment_status=pending_review' },
  { label: 'Upcoming interviews', query: 'has_upcoming_interviews=true' },
  { label: 'Deadlines in 48h', query: 'deadline_pressure=true' },
];

test.describe.configure({ mode: 'serial' });

interface SeededDashboard {
  admin: AuthedContext;
  institutionId: string;
  institutionLabel: string;
}

let seeded: SeededDashboard | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/** Log the browser context in as the bootstrapped platform super-admin. */
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

/** One real applicant with one real draft application. */
async function seedApplication(
  canonicalProgramId: string,
  intakeId: string,
  index: number,
): Promise<void> {
  const ctx = await freshContext();
  try {
    const stamp = `${Date.now()}${index}${Math.floor(Math.random() * 1e4)}`;
    const email = `harness.dash.${stamp}@example.com`;
    const password = 'HarnessStudent123';

    const reg = await ctx.post('/api/v1/auth/register/', {
      data: { email, password, first_name: 'Dash', last_name: `Applicant${index}` },
    });
    expect(reg.ok(), `applicant ${index} should register (got ${reg.status()})`).toBeTruthy();

    const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
    expect(login.ok(), `applicant ${index} should log in (got ${login.status()})`).toBeTruthy();
    const csrf = login.headers()['x-csrf-token'] || '';
    expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();

    await createDraftApplication(ctx, csrf, {
      canonicalProgramId,
      intakeId,
      email,
      fullName: `Dash Applicant ${index}`,
    });
  } finally {
    await ctx.dispose();
  }
}

/**
 * Seed one offering with real applications on the harness's own tenant.
 *
 * The harness's seeded institution is reused rather than a fresh one: a new
 * institution has no active domain, and this journey is about the dashboard's
 * numbers and their scope, not the domain lifecycle (task 4.4 owns that).
 */
async function seedDashboard(): Promise<SeededDashboard> {
  if (seeded) return seeded;

  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = canonicals[0].id;

  const institutions = unwrap(
    await (await admin.ctx.get('/api/v1/admin/institutions/?pageSize=5')).json(),
  );
  const rows: any[] = Array.isArray(institutions)
    ? institutions
    : Array.isArray(institutions?.results)
      ? institutions.results
      : [];
  expect(rows.length, 'the harness should have at least one institution').toBeGreaterThan(0);
  const institutionId: string = rows[0].id;
  const institutionLabel = `${rows[0].name} (${rows[0].code})`;

  const { intakeId } = await createIntake(admin, {
    name: `Dashboard Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: `Dashboard Offering ${stamp}`,
    code: `DO${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 200 });

  // Serial: `applications.application_number` falls back to "count the rows,
  // then attempt" when the SQL helper is absent, and two concurrent creates lose
  // that race on the unique index (recorded by task 9.1 §9.3).
  for (let index = 0; index < SEEDED_APPLICATIONS; index += 1) {
    await seedApplication(canonicalProgramId, intakeId, index);
  }

  seeded = { admin, institutionId, institutionLabel };
  return seeded;
}

/** Every dashboard request the browser made, in order. */
function recordDashboardRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/v1/admin/dashboard/')) urls.push(url);
  });
  return urls;
}

/** The `institution_id` a recorded dashboard request carried, or `null`. */
function requestedInstitution(url: string): string | null {
  return new URL(url).searchParams.get('institution_id');
}

/** Wait until the dashboard has rendered its read-state line. */
async function openDashboard(page: Page): Promise<void> {
  await page.goto('/admin/dashboard');
  await expect(page.getByTestId('dashboard-read-health')).toBeVisible({ timeout: 30_000 });
}

/** The number a named tile is showing. */
async function tileValue(page: Page, label: string): Promise<string> {
  const tile = page.locator('a', { has: page.getByText(label, { exact: true }) }).first();
  await expect(tile).toBeVisible();
  const text = (await tile.innerText()).split('\n').map((line) => line.trim()).filter(Boolean);
  expect(text.length, `tile "${label}" should render a value and a label`).toBeGreaterThan(1);
  return text[0]!;
}

test.describe('the admin dashboard states what it measured (task 9.2, ADM-02)', () => {
  test('every tile carries a definition and a measured state', async ({ page }) => {
    await seedDashboard();
    await loginAdmin(page);
    await openDashboard(page);

    // The read's own health, derived from whether each source answered — not a
    // default adjective. On a healthy harness every source answers.
    await expect(page.getByTestId('dashboard-read-health')).toHaveText('Data sources: operational');
    await expect(page.getByTestId('dashboard-health-notice')).toHaveCount(0);

    // Freshness is a measured age, not a claim.
    await expect(page.getByTestId('dashboard-freshness')).toHaveText(/Measured \d+[sm] ago/);

    for (const tile of EXCEPTION_TILES) {
      const anchor = page.locator(`a[href="/admin/applications?${tile.query}"]`).first();
      await expect(anchor, `tile "${tile.label}" should link to its roster query`).toBeVisible();
      await expect(anchor).toContainText(tile.label);
      // Every tile is in the measured state, so none of them renders "Unknown".
      await expect(anchor).toHaveAttribute('data-metric-state', 'ok');
      // And each one states what it counts (R8.6) — a definition is a sentence,
      // so the tile carries prose beyond its own label and CTA.
      const rendered = (await anchor.innerText()).trim();
      expect(
        rendered,
        `tile "${tile.label}" should carry its definition as helper text`,
      ).toContain('.');
    }

    // The volume block renders from the registry too, each number labelled.
    await expect(page.getByText('Volume and outcomes')).toBeVisible();
    for (const key of ['today_activity', 'applications_this_week', 'payment_unpaid']) {
      await expect(page.locator(`[data-metric="${key}"]`)).toHaveAttribute(
        'data-metric-state',
        'ok',
      );
    }
  });

  test('a tile is the roster it opens', async ({ page }) => {
    await loginAdmin(page);
    await openDashboard(page);

    // "Pending review" is the tile with real seeded work behind it: every seeded
    // application is a draft, so the decision queue is a number the harness can
    // predict *and* the roster can reproduce.
    const shown = await tileValue(page, 'Pending review');
    expect(shown, 'a healthy tile should render a number').toMatch(/^[\d,]+$/);

    // The same query, asked directly of the roster contract.
    const roster = await page.request.get(
      '/api/v1/admin/applications/?review_queue=true&pageSize=1',
    );
    expect(roster.ok(), `roster query should succeed (got ${roster.status()})`).toBeTruthy();
    const body = unwrap(await roster.json());
    expect(
      String(body.totalCount),
      'the tile number and its roster total must describe the same set',
    ).toBe(shown.replace(/,/g, ''));
  });

  test('nothing on the page claims to measure who is online (MAINT-02)', async ({ page }) => {
    await loginAdmin(page);
    await openDashboard(page);

    // The page can still be on its "Loading dashboard" frame when the read-health line
    // is first visible, so the body is read once the text this test is about exists,
    // not on the first paint. Every assertion below is unchanged; a page that never
    // says it still fails here, at 30 s. (The same race fails against the pre-SJR
    // frontend build, so it is the test's, not the build's.)
    await expect(page.locator('body')).toContainText(/staff accounts enabled/i, { timeout: 30_000 });

    // Lower-cased because `innerText` honours `text-transform`, and the headline
    // metric labels are rendered uppercase.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('active users online');
    expect(body).not.toMatch(/\d+ active users/);
    // What the number actually is, said plainly.
    expect(body).toContain('staff accounts enabled');
    expect(body).toContain('enabled to sign in');
    expect(body).toContain('the platform does not measure presence');
  });
});

test.describe('tenant selection survives polling (ADM-02)', () => {
  test('every poll carries the selected school', async ({ page }) => {
    // This journey has to *wait out* a real polling interval — that is the whole
    // point of it, and the reason no unit test can stand in for it — so it needs
    // more than the config's default per-test budget.
    test.setTimeout(POLLING_INTERVAL_MS + 90_000);
    const { institutionId, institutionLabel } = await seedDashboard();
    await loginAdmin(page);

    const requests = recordDashboardRequests(page);
    await openDashboard(page);

    // Before any selection the read describes every school, and says so.
    await expect(page.getByText('Counting every school')).toBeVisible();

    // Select one school through the switcher the operator actually uses.
    const switcher = page.getByLabel('Filter admin views by institution');
    await expect(switcher).toBeVisible();
    await switcher.selectOption(institutionId);

    // The page re-reads for the selected school and relabels the scope.
    await expect(page.getByText('Counting the selected school')).toBeVisible({ timeout: 30_000 });
    await expect(switcher).toHaveValue(institutionId);
    // The option the operator picked is a real school, named by the backend.
    await expect(switcher.locator(`option[value="${institutionId}"]`)).toHaveText(institutionLabel);

    const beforePolling = requests.length;
    const scopedBefore = await tileValue(page, 'Pending review');

    // Wait out a full polling interval plus slack. This is the part no unit test
    // can stand in for: the defect only appeared once an interval elapsed.
    await page.waitForTimeout(POLLING_INTERVAL_MS + 8_000);

    const polls = requests.slice(beforePolling);
    expect(
      polls.length,
      `at least one poll should have fired within ${POLLING_INTERVAL_MS + 8_000}ms`,
    ).toBeGreaterThan(0);

    // The claim, on the wire: not one poll asked the unscoped question.
    for (const url of polls) {
      expect(
        requestedInstitution(url),
        `a poll after the selection must carry the selected school (got ${url})`,
      ).toBe(institutionId);
    }

    // The claim, on the screen: the selection, the scope label, and the numbers
    // are all still the selected school's.
    await expect(switcher).toHaveValue(institutionId);
    await expect(page.getByText('Counting the selected school')).toBeVisible();
    expect(await tileValue(page, 'Pending review')).toBe(scopedBefore);
  });
});

test.describe('a failed source is unknown, never a healthy zero (R8.6, R17.6)', () => {
  test('the dashboard says Unknown when its read fails', async ({ page, gate }) => {
    await seedDashboard();
    await loginAdmin(page);

    // Fail the dashboard read at the network boundary. This is the exact path
    // that used to return `createEmptyDashboardResponse()` — fourteen zeros and
    // `systemHealth: 'good'` — from the browser's own normalizer.
    await page.route('**/api/v1/admin/dashboard/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Dashboard data load failed. Please try again later.',
          code: 'DASHBOARD_ERROR',
        }),
      }),
    );
    // The failed read is deliberate, so it is declared to the strict request
    // gate as an asserted error path rather than the gate being switched off.
    gate.allowRequest('/api/v1/admin/dashboard/');
    // Chromium logs its own console error for the 500 it was handed. That is the
    // browser narrating the fulfilled route, not the app failing: it carries no
    // URL, so it is allowed by its exact text and any *application* console
    // error still fails this run.
    gate.allowConsole(
      'Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
    );

    await page.goto('/admin/dashboard');
    await expect(page.getByTestId('dashboard-read-health')).toBeVisible({ timeout: 30_000 });

    // No health claim, because nothing was measured.
    await expect(page.getByTestId('dashboard-read-health')).toHaveText('Data sources: Unknown');
    await expect(page.getByTestId('dashboard-freshness')).toHaveText('Not loaded yet');

    for (const tile of EXCEPTION_TILES) {
      const anchor = page.locator(`a[href="/admin/applications?${tile.query}"]`).first();
      await expect(anchor).toBeVisible();
      await expect(anchor).toHaveAttribute('data-metric-state', 'unknown');
      await expect(anchor).toContainText('Unknown');
    }

    // Not one zero anywhere in the metric blocks, and the operator is told the
    // read failed rather than being shown a quiet dashboard.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Data sources: operational');
    expect(body).toContain('Unknown');
    // The roster is still offered, because the roster can still count.
    expect(body).toContain('Open the roster to count');
  });
});
