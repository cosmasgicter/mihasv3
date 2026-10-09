/**
 * Required V2 harness — the applications roster is a server query (task 9.1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.1 — "Create one
 * scoped applications query and aggregate contract".
 * Requirements: **R8.1** (list, filters, facets, search, pagination, aggregates,
 * and dashboard links are served by one scoped query contract, and portfolio
 * totals are never inferred from one page), **R8.6** (authoritative,
 * definition-labelled metrics).
 * Findings: **ADM-01** — "Application totals, filters, and select options are
 * derived from the currently loaded page. A dashboard link emits a filter the
 * parser ignores."
 *
 * This is the task's `_Evidence:` line's second half: **page 2+ and filter
 * browser tests**. The first half — the aggregates equalling an independent SQL
 * count — is `backend/tests/unit/test_application_query_contract_9_1.py`.
 *
 * Why a browser test adds something the API tests do not: every defect in ADM-01
 * was a *rendering* defect. The API always knew the total; the browser recounted
 * the rows it had. So these journeys watch the screen and the wire at the same
 * time:
 *
 *   1. **Page 2** — the headline total is identical on both pages while the rows
 *      change, and the page indicator comes from the server's `totalPages`.
 *   2. **Filter** — choosing a filter sends the registered parameter to the
 *      server and moves the aggregates with it, so the number and the list
 *      always describe the same set.
 *   3. **Deep link** — a dashboard-style link in registered parameters arrives
 *      applied, and the address keeps that spelling.
 *   4. **Legacy link** — a pre-9.1 bookmark still opens its view and is rewritten
 *      to the registered spelling.
 *   5. **Facets** — the filter selects offer options with whole-set counts,
 *      including an offering the current filter has excluded entirely, so the
 *      options cannot have been harvested from the loaded rows.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates
 * active (`harness-fixtures.ts`) — zero skips, no console errors, no
 * unasserted failed requests. Both the desktop and the mobile project run every
 * journey, so the filter controls are driven through whichever panel is actually
 * on screen rather than through a viewport this file assumes.
 */
import { test, expect, type Locator, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createIntake,
  freshContext,
  listCanonicalPrograms,
  linkIntake,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';

/** The roster's server page size (`useApplicationsData.DEFAULT_PAGE_SIZE`). */
const PAGE_SIZE = 25;

/**
 * Applications seeded into the primary offering.
 *
 * One more than a page, deliberately: the whole finding is that a surface
 * holding 25 of 26 rows reported 25 as the portfolio. A roster that fits on one
 * page cannot show the defect or its fix.
 */
const PRIMARY_APPLICATIONS = PAGE_SIZE + 1;

/**
 * Applications seeded into a **second** offering.
 *
 * These are what make the facet claim checkable: the second offering's option
 * must remain in the program filter, with its own whole-set count, while the
 * roster is filtered so that not one of its rows is loaded — which
 * `[...new Set(loadedRows.map(...))]` cannot produce.
 */
const SECONDARY_APPLICATIONS = 2;

test.describe.configure({ mode: 'serial' });

interface SeededRoster {
  admin: AuthedContext;
  institutionId: string | null;
  primaryOfferingName: string;
  secondaryOfferingName: string;
  totalSeeded: number;
}

let seeded: SeededRoster | undefined;

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

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/**
 * One applicant with one draft application on the given canonical program and
 * intake.
 *
 * Each applicant registers themselves — the harness carries no storageState and
 * seeds no applicant fixtures, so a roster of N rows is N real students who each
 * created one application through the same endpoints a real applicant uses.
 *
 * The offering the row lands on is chosen by the platform's own
 * `OfferingAssignmentService` from the (canonical program, intake) pair, which is
 * why the two offerings below are separated by **intake** rather than by
 * canonical program: assignment picks exactly one offering per pair, so two
 * offerings sharing an intake would leave one of them with no applications at
 * all — and the facet claim needs both to be real.
 */
async function seedApplication(
  canonicalProgramId: string,
  intakeId: string,
  index: number,
): Promise<void> {
  const ctx = await freshContext();
  try {
    const stamp = `${Date.now()}${index}${Math.floor(Math.random() * 1e4)}`;
    const email = `harness.roster.${stamp}@example.com`;
    const password = 'HarnessStudent123';

    const reg = await ctx.post('/api/v1/auth/register/', {
      data: { email, password, first_name: 'Roster', last_name: `Applicant${index}` },
    });
    expect(reg.ok(), `roster applicant ${index} should register (got ${reg.status()})`).toBeTruthy();

    const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
    expect(login.ok(), `roster applicant ${index} should log in (got ${login.status()})`).toBeTruthy();
    const csrf = login.headers()['x-csrf-token'] || '';
    expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();

    await createDraftApplication(ctx, csrf, {
      canonicalProgramId,
      intakeId,
      email,
      fullName: `Roster Applicant ${index}`,
    });
  } finally {
    await ctx.dispose();
  }
}

/** Seed the two offerings and their applications, once for the whole file. */
async function seedRoster(): Promise<SeededRoster> {
  if (seeded) return seeded;

  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  // The published catalogue is the honest source for a canonical program id:
  // `/catalog/canonical-programs/` lists canonical programs that actually have an
  // active offering, which is exactly what an offering can be assigned against.
  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = canonicals[0].id;

  // Reuse the harness's own seeded tenant rather than creating one: a fresh
  // institution has no active domain, and this journey is about the roster's
  // query, not the domain lifecycle (task 4.4 owns that).
  const context = unwrap(await (await admin.ctx.get('/api/v1/catalog/context/')).json());
  const institutions = unwrap(await (await admin.ctx.get('/api/v1/admin/institutions/?pageSize=5')).json());
  const rows: any[] = Array.isArray(institutions)
    ? institutions
    : Array.isArray(institutions?.results)
      ? institutions.results
      : [];
  const institutionId = rows[0]?.id ?? context?.institution_id ?? null;
  expect(institutionId, 'the harness should have at least one institution').toBeTruthy();

  // One intake per offering, so the platform's assignment resolution routes each
  // applicant to the offering we intend (see `seedApplication`).
  const { intakeId: primaryIntakeId } = await createIntake(admin, {
    name: `Roster Primary Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const { intakeId: secondaryIntakeId } = await createIntake(admin, {
    name: `Roster Secondary Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });

  const primaryOfferingName = `Roster Primary ${stamp}`;
  const secondaryOfferingName = `Roster Secondary ${stamp}`;

  const primary = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: primaryOfferingName,
    code: `RP${stamp}`,
  });
  const secondary = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: secondaryOfferingName,
    code: `RS${stamp}`,
  });

  await linkIntake(admin, {
    program_id: primary.offeringId,
    intake_id: primaryIntakeId,
    max_capacity: 200,
  });
  await linkIntake(admin, {
    program_id: secondary.offeringId,
    intake_id: secondaryIntakeId,
    max_capacity: 200,
  });

  /**
   * Seed `count` applicants one at a time.
   *
   * Serial, not batched. `applications.application_number` is generated by the
   * `next_application_number` SQL helper, and when that helper is absent the
   * platform falls back to "count the rows, then attempt" — which two concurrent
   * creates lose, with a `applications_application_number_key` unique violation.
   * The harness database does not install the helper (it belongs to the harness
   * fixture, not to this task), so a concurrent seed here would be measuring that
   * gap instead of the roster. The database's uniqueness is doing its job either
   * way; the seed simply declines to race it.
   */
  const seedBatch = async (intakeId: string, count: number, offset: number) => {
    for (let index = 0; index < count; index += 1) {
      await seedApplication(canonicalProgramId, intakeId, offset + index);
    }
  };

  await seedBatch(secondaryIntakeId, SECONDARY_APPLICATIONS, 0);
  await seedBatch(primaryIntakeId, PRIMARY_APPLICATIONS, SECONDARY_APPLICATIONS);

  seeded = {
    admin,
    institutionId,
    primaryOfferingName,
    secondaryOfferingName,
    totalSeeded: PRIMARY_APPLICATIONS + SECONDARY_APPLICATIONS,
  };
  return seeded;
}

/** Every roster request the browser made, in order. */
function recordRosterRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/v1/admin/applications/')) urls.push(url);
  });
  return urls;
}

/**
 * The filter control with the given base id, in whichever panel is on screen.
 *
 * The roster renders the panel twice — a desktop rail and a mobile sheet — and
 * each owns its own control-id namespace (`FiltersPanel`'s `idPrefix`). Resolving
 * the visible one here is what lets the same journey run at both breakpoints
 * instead of asserting a layout.
 */
async function filterControl(page: Page, baseId: string): Promise<Locator> {
  const desktop = page.locator(`[data-roster-filters="desktop"] #${baseId}`);
  if (await desktop.isVisible()) return desktop;

  const sheet = page.locator('[data-roster-filters="mobile"]');
  if (!(await sheet.isVisible())) {
    await page.getByRole('button', { name: 'Toggle filters' }).click();
    await expect(sheet).toBeVisible();
  }
  return sheet.locator(`#mobile-${baseId}`);
}

/** The rendered "Portfolio" headline value, e.g. "26 total". */
async function portfolioTotal(page: Page): Promise<string> {
  const tile = page.locator('p', { hasText: /^Portfolio$/ }).first();
  await expect(tile).toBeVisible();
  const value = tile.locator('xpath=following-sibling::div[1]');
  await expect(value).toBeVisible();
  return ((await value.textContent()) || '').trim();
}

/**
 * The application numbers on screen.
 *
 * Read from the row selection checkboxes' accessible names — markup the roster
 * already has, so identifying a row costs the product nothing.
 */
async function visibleRowIds(page: Page): Promise<string[]> {
  await expect(page.getByTestId('roster-page-indicator')).toBeVisible();
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input[aria-label^="Select application "]'))
      .map((node) => (node.getAttribute('aria-label') || '').replace('Select application ', '').trim())
      .filter(Boolean),
  );
}

/** The text of every roster row card currently on screen. */
async function loadedRowText(page: Page): Promise<string> {
  const rows = await page
    .locator('article')
    .filter({ has: page.locator('input[aria-label^="Select application "]') })
    .allTextContents();
  return rows.join(' ');
}

/** Wait until the roster has rendered a page indicator and at least one row. */
async function rosterReady(page: Page): Promise<void> {
  await expect(page.getByTestId('roster-page-indicator')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Showing \d+ of \d+ applications/)).toBeVisible();
}

/**
 * Assert the roster is on `expectedPage` of a **multi-page** portfolio, reading
 * the server's two numbers instead of pattern-matching their digits.
 *
 * This used to be a `toHaveText` against the regex `Page 1 of [2-9]\d` followed
 * by a star. That pattern says "a page count whose first digit is 2-9", which is
 * not the claim — the claim is "more than one page" — and it cannot match
 * `Page 1 of 16`. So the assertion passed or failed
 * according to **how many applications the harness database happened to hold**:
 * green at 2-9 pages and at 20-99, red at 10-19. It is the difference between a
 * volume-dependent assertion and a code-dependent one, and it is why task 11.3
 * §4.6 could only report this leg by naming the seeded row count it measured on.
 *
 * The parse is exact (`^Page (\d+) of (\d+)$`), so a malformed indicator fails
 * here rather than being tolerated by a loose match, and the multi-page
 * precondition is stated as a number comparison that holds at any volume.
 */
async function expectPageOfMany(page: Page, expectedPage: number): Promise<void> {
  const indicator = page.getByTestId('roster-page-indicator');
  await expect(indicator).toBeVisible();
  await expect
    .poll(
      async () => {
        const text = ((await indicator.textContent()) || '').trim();
        const match = text.match(/^Page (\d+) of (\d+)$/);
        if (!match) return `unparsed: ${text}`;
        const current = Number(match[1]);
        const totalPages = Number(match[2]);
        if (current !== expectedPage) return `on page ${current}`;
        if (totalPages < 2) return `only ${totalPages} page`;
        return 'ok';
      },
      { timeout: 30_000, message: `the roster should be on page ${expectedPage} of more than one page` },
    )
    .toBe('ok');
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await seedRoster();
});

test.describe('The applications roster is one scoped server query (R8.1, ADM-01)', () => {
  test('page 2 changes the rows and never the portfolio total', async ({ page }) => {
    test.setTimeout(180_000);
    const requests = recordRosterRequests(page);
    await loginAdmin(page);

    await page.goto('/admin/applications', { waitUntil: 'domcontentloaded' });
    await rosterReady(page);

    // The server's own page arithmetic — the browser divides nothing.
    await expectPageOfMany(page, 1);

    const firstPageTotal = await portfolioTotal(page);
    const firstPageIds = await visibleRowIds(page);
    // A full page of rows, and a portfolio bigger than the page: the exact shape
    // in which the old surface reported the page as the portfolio.
    expect(firstPageIds.length).toBe(PAGE_SIZE);
    const total = Number((firstPageTotal.match(/(\d+)/) || [])[1]);
    expect(total).toBeGreaterThan(PAGE_SIZE);

    await page.getByRole('button', { name: 'Next' }).click();

    await expectPageOfMany(page, 2);
    await expect
      .poll(async () => (await visibleRowIds(page))[0], { timeout: 30_000 })
      .not.toBe(firstPageIds[0]);

    const secondPageIds = await visibleRowIds(page);
    // Different rows…
    expect(secondPageIds.some((id) => firstPageIds.includes(id))).toBe(false);
    // …identical facts. Turning a page asks for other rows, not other numbers.
    expect(await portfolioTotal(page)).toBe(firstPageTotal);

    // And the page was a *server* page: the second request carries page=2.
    expect(requests.some((url) => url.includes('page=2'))).toBe(true);
    expect(requests.every((url) => url.includes('pageSize=25'))).toBe(true);

    await page.getByRole('button', { name: 'Previous' }).click();
    await expectPageOfMany(page, 1);
    expect(await portfolioTotal(page)).toBe(firstPageTotal);
  });

  test('a filter is sent to the server and moves the totals with the rows', async ({ page }) => {
    test.setTimeout(180_000);
    const requests = recordRosterRequests(page);
    await loginAdmin(page);

    await page.goto('/admin/applications', { waitUntil: 'domcontentloaded' });
    await rosterReady(page);
    const unfilteredTotal = await portfolioTotal(page);

    // Every seeded application is a draft, so "Completed Only" is a filter with
    // a knowable answer: it must exclude all of them.
    await (await filterControl(page, 'draft-filter')).selectOption('completed');

    await expect
      .poll(() => requests.some((url) => url.includes('exclude_status=draft')), { timeout: 30_000 })
      .toBe(true);

    // The number moved with the filter — it describes the filtered set, not the
    // rows that happen to be loaded.
    await expect.poll(async () => await portfolioTotal(page), { timeout: 30_000 }).not.toBe(unfilteredTotal);

    // The registered spelling is what reached the address bar, too.
    await expect.poll(() => page.url()).toContain('exclude_status=draft');
    expect(page.url()).not.toContain('draftFilter=');

    // Back to drafts only: the total returns to describing a superset.
    await (await filterControl(page, 'draft-filter')).selectOption('drafts');
    await expect.poll(() => page.url(), { timeout: 30_000 }).toContain('status=draft');
    await expect
      .poll(async () => Number((((await portfolioTotal(page)).match(/(\d+)/) || [])[1]) || 0), {
        timeout: 30_000,
      })
      .toBeGreaterThan(PAGE_SIZE);
  });

  test('a dashboard deep link in registered parameters arrives applied', async ({ page }) => {
    test.setTimeout(120_000);
    const requests = recordRosterRequests(page);
    await loginAdmin(page);

    // The exact link the dashboard's "Deadlines in 48h" tile emits. Before 9.1
    // this parameter existed on neither side and the tile opened an unfiltered
    // roster; the whole set of seeded drafts has no deadline, so an *applied*
    // filter is visible as an empty result rather than 26 rows.
    await page.goto('/admin/applications?deadline_pressure=true', { waitUntil: 'domcontentloaded' });

    await expect
      .poll(() => requests.some((url) => url.includes('deadline_pressure=true')), { timeout: 30_000 })
      .toBe(true);

    // The filter control reflects the link, so the operator can see what is applied.
    await expect(await filterControl(page, 'deadline-pressure-filter')).toHaveValue('true');
    // The address keeps the registered spelling.
    expect(page.url()).toContain('deadline_pressure=true');
    // No "unapplied parameters" warning: the contract implements this one.
    await expect(page.getByText(/Some link filters were not applied/)).toHaveCount(0);
  });

  test('a pre-9.1 bookmark still opens its view, in the registered spelling', async ({ page }) => {
    test.setTimeout(120_000);
    const requests = recordRosterRequests(page);
    await loginAdmin(page);

    // The literal URL the old dashboard tile produced.
    await page.goto('/admin/applications?reviewQueueFilter=true', { waitUntil: 'domcontentloaded' });

    await expect
      .poll(() => requests.some((url) => url.includes('review_queue=true')), { timeout: 30_000 })
      .toBe(true);
    await expect.poll(() => page.url(), { timeout: 30_000 }).toContain('review_queue=true');
    expect(page.url()).not.toContain('reviewQueueFilter=');
  });

  test('the filter options are the server facets, counts and all', async ({ page }) => {
    test.setTimeout(180_000);
    const requests = recordRosterRequests(page);
    await loginAdmin(page);

    await page.goto('/admin/applications', { waitUntil: 'domcontentloaded' });
    await rosterReady(page);

    const { primaryOfferingName, secondaryOfferingName } = await seedRoster();
    const programFilter = await filterControl(page, 'program-filter');
    await expect(programFilter).toBeVisible();

    /** Every option in the program select, as `{ value, label }`. */
    const programOptions = async () =>
      programFilter.locator('option').evaluateAll((nodes) =>
        nodes.map((node) => ({
          value: (node as HTMLOptionElement).value,
          label: (node.textContent || '').trim(),
        })),
      );

    const before = await programOptions();
    // The option values are canonical offering ids, not display names harvested
    // from the rows — that is what lets the roster filter precisely.
    const primary = before.find((option) => option.label.startsWith(`${primaryOfferingName} (`));
    const secondary = before.find((option) => option.label.startsWith(`${secondaryOfferingName} (`));
    expect(primary, 'the primary offering should be offered as a filter option').toBeTruthy();
    expect(secondary, 'the secondary offering should be offered as a filter option').toBeTruthy();
    expect(primary!.value).toMatch(/^[0-9a-f-]{36}$/);

    // Narrow to the PRIMARY offering. Now not one secondary row is loaded — so a
    // pick list built from the loaded rows could not contain the secondary
    // offering at all, which is exactly what ADM-01 describes.
    await programFilter.selectOption(primary!.value);
    await expect
      .poll(() => requests.some((url) => url.includes(`program_offering_id=${primary!.value}`)), {
        timeout: 30_000,
      })
      .toBe(true);
    await rosterReady(page);

    // Poll the rendered rows rather than the request: the request proves the
    // filter reached the server, and only the re-render proves it came back.
    await expect
      .poll(() => loadedRowText(page), { timeout: 30_000 })
      .not.toContain(secondaryOfferingName);
    expect(await loadedRowText(page)).toContain(primaryOfferingName);

    // …and the select still offers the offering the operator just filtered out,
    // with its own whole-set count. The facet for a dimension is computed with
    // that dimension left open, so a filter can always be widened again.
    const after = await programOptions();
    const secondaryAfter = after.find((option) =>
      option.label.startsWith(`${secondaryOfferingName} (`),
    );
    expect(
      secondaryAfter,
      'the filtered-out offering must remain selectable — a facet is not a row count',
    ).toBeTruthy();
    // Each option carries its own count, which is a whole-set fact.
    expect(secondaryAfter!.label).toMatch(new RegExp(`\\(${SECONDARY_APPLICATIONS}\\)$`));
  });
});
