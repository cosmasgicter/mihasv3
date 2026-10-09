/**
 * Required V2 harness — public tracking is a random hashed secret, host-bound,
 * rate-limited, and shareable without PII (task 10.5).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.5 — "Secure and
 * correct public tracking".
 * Requirements: **R13.12** (a random non-PII tracking secret or a second factor,
 * results bound to trusted tenant context, rate-limited attempts, a contract-valid
 * share URL, and no authority for sequential application numbers), **R2.3-R2.4**
 * (fail closed to the neutral context; a trusted tenant host wins), **R17.2** (no
 * secrets in logs), **R17.7** (rate limits, object-level tenant substitution).
 * Findings: **STU-22**, **TEN-10**.
 * Design: §12 ("Public tracking uses a random, revocable, hashed tracking secret
 * and minimal response. An institution domain can reveal only an application for
 * that same tenant. … Attempts are rate-limited and audited without logging the
 * raw token. Share links include the random token, not an application number.")
 *
 * This file is the task's `_Evidence:` line —
 * *enumeration / rate-limit / host-isolation / contract / share-link* — in the
 * browser.
 *
 * Why the browser is required and not only endpoint tests: **two of STU-22's three
 * clauses are surfaces.** The frontend read `program_name`, `intake_name` and
 * `updated_at` that the backend never sent, and it rendered a "Message from
 * Admissions" panel from `admin_feedback` — an endpoint test cannot see either,
 * because the drift was invisible until something was drawn on a page. And "share
 * a URL that contains only the non-PII tracking token" is a claim about what a
 * *button* puts on the clipboard: pre-10.5 "Copy Link" copied
 * `window.location.href`, which for a result reached by typing the code into the
 * box is `/track-application` — a URL that tracks nothing at all.
 *
 * The five journeys:
 *
 *   1. **enumeration.** The application number printed on the student's own page
 *      is refused by the tracker with the reason, and no request is made; the
 *      student then issues a tracking link and the same page opens.
 *   2. **share link.** The share dialog offers the link built from the token —
 *      never the address bar, never the application number — and the copied URL
 *      re-opens the application in a clean browser context with no session.
 *   3. **host isolation.** A school's own host opens its own application and
 *      refuses another school's token with the identical masked answer; the
 *      neutral portal opens both.
 *   4. **rate limit.** A run of wrong tokens exhausts the failed-attempt budget
 *      and the endpoint answers 429 — while a *correct* token still resolves from
 *      that same exhausted address, and a spoofed `X-Forwarded-For` does not mint
 *      a fresh budget.
 *   5. **contract.** The rendered page shows the program, intake and last-updated
 *      date the server actually sent, publishes no applicant PII, and has no
 *      "Message from Admissions" panel.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates active
 * (`harness-fixtures.ts`): zero skips, no console errors, no unasserted failed
 * requests. Both the desktop and the mobile project run every journey.
 */
import { test, expect, type APIRequestContext, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  neutralOrigin,
  superAdminContext,
  tenantOrigin,
  type AuthedContext,
} from '../helpers/api';
import { clearPublicTrackingFailureBudget } from '../helpers/ops';

const TRACK_PAGE = '/track-application';
const TRACK_API = (code: string) => `/api/v1/applications/track/?code=${encodeURIComponent(code)}`;
const LINK_API = (applicationId: string) => `/api/v1/applications/${applicationId}/tracking-link/`;

/** A well-formed token that cannot exist: the platform issues 100 random bits. */
const IMPOSSIBLE_TOKEN = 'TRK-00000000-00000000000000000000';

interface SeededApplicant {
  ctx: APIRequestContext;
  email: string;
  password: string;
  csrf: string;
  applicationId: string;
  applicationNumber: string;
  fullName: string;
}

interface SeededWorld {
  admin: AuthedContext;
  applicant: SeededApplicant;
  /** A second applicant at the *same* school, for the rate-limit journey. */
  neighbour: SeededApplicant;
  tenantHost: string;
  otherTenantHost: string;
  otherApplicant: SeededApplicant;
}

let seeded: SeededWorld | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/**
 * Seed one applicant with an application bound to a **named** tenant.
 *
 * `origin` is the tenant host the application is created from, and it is not
 * optional cosmetics: an application is attached to the offering of the tenant
 * resolved from the creating request's host (R2.4). Created from the neutral
 * portal instead, all applicants land on whichever school the neutral context
 * happens to pick — so a "foreign" token would belong to the same tenant as the
 * host under test and the host-isolation claim would assert nothing.
 */
async function seedApplicant(
  label: string,
  canonicalProgramId: string,
  intakeId: string,
  origin: string,
): Promise<SeededApplicant> {
  const ctx = await freshContext(origin);
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const email = `harness.${label}.${stamp}@example.com`;
  const password = 'HarnessStudent123';
  const fullName = `Harness ${label} ${stamp}`;

  const reg = await ctx.post('/api/v1/auth/register/', {
    data: { email, password, first_name: 'Harness', last_name: label },
  });
  expect(reg.ok(), `${label} should register (got ${reg.status()}: ${await reg.text()})`).toBeTruthy();
  const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
  expect(login.ok(), `${label} should log in (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();

  const { applicationId } = await createDraftApplication(ctx, csrf, {
    canonicalProgramId,
    intakeId,
    email,
    fullName,
  });

  const detail = await ctx.get(`/api/v1/applications/${applicationId}/`);
  expect(detail.ok(), `application read should succeed (got ${detail.status()})`).toBeTruthy();
  const payload = unwrap(await detail.json());
  const application = payload?.application ?? payload;
  const applicationNumber = application?.application_number;
  expect(applicationNumber, 'the application should carry an application number').toBeTruthy();

  return { ctx, email, password, csrf, applicationId, applicationNumber, fullName };
}

/** Move an application to `submitted` through the platform's own review command. */
async function submit(admin: AuthedContext, applicationId: string): Promise<void> {
  const response = await admin.ctx.post(`/api/v1/applications/${applicationId}/review/`, {
    headers: { 'x-csrf-token': admin.csrf },
    data: { new_status: 'submitted', notes: 'harness 10.5 tracking-journey setup' },
  });
  expect(
    response.ok(),
    `admin submit should succeed (got ${response.status()}: ${await response.text()})`,
  ).toBeTruthy();
}

/**
 * Resolve the two seeded tenant hosts.
 *
 * Both come from the platform's own domain records, never from a hardcoded
 * hostname: the journey needs *two* hosts that resolve to *different* tenants,
 * which is the whole point of the host-isolation claim.
 *
 * Every page is walked rather than only the first. Run as part of the whole
 * required profile, earlier lanes' journeys have created a stack of institutions
 * whose domains are still `pending_dns` — so the two schools that actually have
 * an **active** domain are not necessarily on page one, and a single-page read
 * finds zero hosts and fails a journey for a reason that has nothing to do with
 * tracking.
 */
async function resolveTenantHosts(admin: AuthedContext): Promise<{
  hosts: string[];
  institutionIds: string[];
}> {
  const hosts: string[] = [];
  const institutionIds: string[] = [];
  const pageSize = 100;
  let page = 1;
  let seenRows = 0;
  let totalCount = 0;

  while (hosts.length < 2 && page <= 20) {
    const response = await admin.ctx.get(
      `/api/v1/admin/institutions/?page=${page}&pageSize=${pageSize}`,
    );
    expect(
      response.ok(),
      `institution list should succeed (got ${response.status()})`,
    ).toBeTruthy();
    const payload = unwrap(await response.json());
    const rows: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.results)
        ? payload.results
        : [];
    if (rows.length === 0) break;
    seenRows += rows.length;
    totalCount = Number(payload?.totalCount ?? seenRows);

    for (const institution of rows) {
      const domains = await admin.ctx.get(`/api/v1/admin/institutions/${institution.id}/domains/`);
      if (!domains.ok()) continue;
      const list = unwrap(await domains.json());
      const domainRows: any[] = Array.isArray(list) ? list : (list?.results ?? []);
      const active = domainRows.find((row) => row?.status === 'active' && row?.is_active);
      if (!active?.hostname) continue;
      hosts.push(active.hostname);
      institutionIds.push(institution.id);
      if (hosts.length === 2) break;
    }

    if (Array.isArray(payload) || seenRows >= totalCount) break;
    page += 1;
  }

  expect(seenRows, 'the harness should seed at least two institutions').toBeGreaterThan(1);
  expect(
    hosts.length,
    `two active tenant hosts are required for host isolation (scanned ${seenRows} institutions, found ${hosts.join(', ') || 'none'})`,
  ).toBe(2);
  return { hosts, institutionIds };
}

async function seedWorld(): Promise<SeededWorld> {
  if (seeded) return seeded;
  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);
  const { hosts, institutionIds } = await resolveTenantHosts(admin);

  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = canonicals[0].id;

  const { intakeId } = await createIntake(admin, {
    name: `Public Tracking Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });

  // One offering per tenant, both for the same canonical program, so the two
  // applications differ only in which school they belong to.
  for (const [index, institutionId] of institutionIds.entries()) {
    const offering = await assignOffering(admin, institutionId, {
      canonical_program_id: canonicalProgramId,
      name: `Public Tracking Offering ${index} ${stamp}`,
      code: `PT${index}${stamp}`,
    });
    await linkIntake(admin, {
      program_id: offering.offeringId,
      intake_id: intakeId,
      max_capacity: 100,
    });
  }

  // Two applicants on the first school, one on the second — each created from
  // its own school's host, so the tenant binding under test is the platform's
  // own routing decision rather than an accident of the neutral context.
  const applicant = await seedApplicant(
    'track',
    canonicalProgramId,
    intakeId,
    tenantOrigin(hosts[0]),
  );
  const neighbour = await seedApplicant(
    'trackrate',
    canonicalProgramId,
    intakeId,
    tenantOrigin(hosts[0]),
  );
  const otherApplicant = await seedApplicant(
    'trackother',
    canonicalProgramId,
    intakeId,
    tenantOrigin(hosts[1]),
  );
  await submit(admin, applicant.applicationId);
  await submit(admin, neighbour.applicationId);
  await submit(admin, otherApplicant.applicationId);

  // Prove the tenant binding rather than trusting it. The application number is
  // `{INSTITUTION_CODE}{YEAR}{SEQ}`, so two different leading codes is the
  // platform's own statement that these applications belong to two schools — and
  // if they did not, journey 3's "foreign" token would not be foreign and the
  // host-isolation claim would pass while asserting nothing.
  const codeOf = (value: string) => /^([A-Z]{2,10})\d/.exec(value)?.[1] ?? '';
  expect(
    codeOf(otherApplicant.applicationNumber),
    `the two applications must belong to two schools (got ${applicant.applicationNumber} and ${otherApplicant.applicationNumber})`,
  ).not.toBe(codeOf(applicant.applicationNumber));
  expect(codeOf(neighbour.applicationNumber)).toBe(codeOf(applicant.applicationNumber));

  seeded = {
    admin,
    applicant,
    neighbour,
    tenantHost: hosts[0],
    otherTenantHost: hosts[1],
    otherApplicant,
  };
  return seeded;
}

test.beforeAll(async () => {
  await seedWorld();
});

test.afterAll(async () => {
  if (!seeded) return;
  await seeded.applicant.ctx.dispose();
  await seeded.neighbour.ctx.dispose();
  await seeded.otherApplicant.ctx.dispose();
});

async function loginAs(page: Page, applicant: SeededApplicant): Promise<void> {
  const login = await page.request.post('/api/v1/auth/login/', {
    data: { email: applicant.email, password: applicant.password },
  });
  expect(
    login.ok(),
    `${applicant.email} should log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  const session = await page.request.get('/api/v1/auth/session/?refresh_csrf=1');
  expect(session.ok(), 'session bootstrap should succeed').toBeTruthy();
}

/** Issue a tracking link through the owner's own command. */
async function issueLink(
  applicant: SeededApplicant,
): Promise<{ code: string; url: string; replacedPrevious: boolean }> {
  const response = await applicant.ctx.post(LINK_API(applicant.applicationId), {
    headers: { 'x-csrf-token': applicant.csrf },
  });
  expect(
    response.status(),
    `the owner should be able to issue a tracking link (got ${response.status()}: ${await response.text()})`,
  ).toBe(201);
  const data = unwrap(await response.json());
  expect(data?.code, 'the issued link should carry a code').toBeTruthy();
  return { code: data.code, url: data.url, replacedPrevious: Boolean(data.replaced_previous) };
}

async function openTracker(page: Page, code: string, origin = ''): Promise<void> {
  await page.goto(`${origin}${TRACK_PAGE}?code=${encodeURIComponent(code)}`, {
    waitUntil: 'domcontentloaded',
  });
}

/**
 * Every journey starts with a known failed-attempt budget.
 *
 * The budget is keyed on the client address and every context in this harness —
 * every project, every `freshContext()` — reaches the backend from the same
 * address through Caddy. That is the property under test rather than a harness
 * limitation (a forwarded header must not mint a fresh budget, journey 4), so
 * journeys that deliberately submit wrong tokens would otherwise spend the
 * budget for the journeys that run after them.
 */
test.beforeEach(async () => {
  await clearPublicTrackingFailureBudget();
});

// ---------------------------------------------------------------------------
// 1. Enumeration — the application number is not a credential
// ---------------------------------------------------------------------------

test('an application number does not open tracking, and the issued link does', async ({
  page,
  gate,
}) => {
  const world = await seedWorld();
  const { applicant } = world;

  // The number the student is told to quote to the office, pasted into the
  // tracker. It is refused with the reason — and, because the refusal is a pure
  // function of the string, without any unauthenticated lookup at all.
  const trackerCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/applications/track/')) trackerCalls.push(request.url());
  });

  await openTracker(page, applicant.applicationNumber);
  await expect(page.getByText(/no longer opens public tracking/i).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(applicant.fullName)).toHaveCount(0);
  expect(
    trackerCalls,
    'a recognised application number must not produce an unauthenticated lookup',
  ).toEqual([]);

  // The same number, straight at the API, is the same refusal with the stable code.
  const refused = await page.request.get(TRACK_API(applicant.applicationNumber));
  gate.allowRequest(TRACK_API(applicant.applicationNumber));
  expect(refused.status()).toBe(400);
  expect((await refused.json()).code).toBe('TRACKING_SECRET_REQUIRED');

  // Now the credential the owner is issued.
  const link = await issueLink(applicant);
  expect(link.replacedPrevious).toBe(false);

  await openTracker(page, link.code);
  await expect(page.getByText(`#${applicant.applicationNumber}`).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /^Share$/ })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. Share link — the URL carries the token and nothing else
// ---------------------------------------------------------------------------

test('the share dialog offers the token URL, and that URL opens the status', async ({
  page,
  browser,
}) => {
  const world = await seedWorld();
  const { applicant } = world;
  const link = await issueLink(applicant);

  await openTracker(page, link.code);
  await expect(page.getByText(`#${applicant.applicationNumber}`).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: /^Share$/ }).click();
  const shared = page.getByTestId('tracker-share-url');
  await expect(shared).toBeVisible();
  const sharedUrl = ((await shared.textContent()) || '').trim();

  // The URL carries the random token and no PII — not the application number,
  // not the applicant's name, not their email.
  expect(sharedUrl).toContain(`code=${link.code}`);
  expect(sharedUrl).not.toContain(applicant.applicationNumber);
  expect(sharedUrl).not.toContain(applicant.fullName);
  expect(sharedUrl).not.toContain(applicant.email);
  expect(new URL(sharedUrl).pathname).toBe(TRACK_PAGE);
  expect([...new URL(sharedUrl).searchParams.keys()]).toEqual(['code']);

  // The old "Copy Number" affordance is gone: the number opens nothing.
  await expect(page.getByRole('button', { name: /Copy Number/i })).toHaveCount(0);
  await expect(page.getByText(/anyone with this link/i)).toBeVisible();

  // A URL that is shared must work for the person it is shared with: a brand-new
  // browser context with no cookies and no session.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(sharedUrl, { waitUntil: 'domcontentloaded' });
  await expect(strangerPage.getByText(`#${applicant.applicationNumber}`).first()).toBeVisible({
    timeout: 30_000,
  });
  await stranger.close();
});

// ---------------------------------------------------------------------------
// 3. Host isolation (TEN-10)
// ---------------------------------------------------------------------------

test('a school host reveals only its own application; the neutral portal resolves by token', async ({
  page,
  gate,
}) => {
  const world = await seedWorld();
  const own = await issueLink(world.applicant);
  const other = await issueLink(world.otherApplicant);

  const host = tenantOrigin(world.tenantHost);

  // The school's own host opens its own application.
  const mine = await page.request.get(`${host}${TRACK_API(own.code)}`);
  expect(
    mine.status(),
    `the tenant host should open its own application (got ${mine.status()}: ${await mine.text()})`,
  ).toBe(200);
  const mineData = unwrap(await mine.json());
  expect(mineData.application_number).toBe(world.applicant.applicationNumber);

  // Another tenant's token on the same host is refused — and the refusal is
  // byte-identical to a token that never existed, so the host cannot be used to
  // learn that the code belongs somewhere else.
  const foreignUrl = `${host}${TRACK_API(other.code)}`;
  const impossibleUrl = `${host}${TRACK_API(IMPOSSIBLE_TOKEN)}`;
  gate.allowRequest(TRACK_API(other.code));
  gate.allowRequest(TRACK_API(IMPOSSIBLE_TOKEN));
  const foreign = await page.request.get(foreignUrl);
  const impossible = await page.request.get(impossibleUrl);
  expect(foreign.status()).toBe(404);
  expect(impossible.status()).toBe(404);
  expect(await foreign.json()).toEqual(await impossible.json());

  // The neutral Beanola portal resolves either token: there the secret is the
  // whole authority (design §12), and the response carries no extra tenant data.
  const neutral = neutralOrigin();
  for (const [code, applicationNumber] of [
    [own.code, world.applicant.applicationNumber],
    [other.code, world.otherApplicant.applicationNumber],
  ] as const) {
    const response = await page.request.get(`${neutral}${TRACK_API(code)}`);
    expect(
      response.status(),
      `the neutral portal should resolve by token (got ${response.status()})`,
    ).toBe(200);
    expect(unwrap(await response.json()).application_number).toBe(applicationNumber);
  }
});

// ---------------------------------------------------------------------------
// 4. Rate limit — failed attempts are charged, a valid holder is not
// ---------------------------------------------------------------------------

test('failed attempts are rate-limited while a valid token keeps working', async ({ gate }) => {
  const world = await seedWorld();
  const link = await issueLink(world.neighbour);

  // A dedicated context so this journey's budget is its own.
  const attacker = await freshContext();

  let sawRateLimit = false;
  let attempts = 0;
  for (let index = 0; index < 20 && !sawRateLimit; index += 1) {
    // Well-formed, wrong, and different every time — the shape of a search.
    const selector = `${index}`.padStart(8, 'Z');
    const guess = `TRK-${selector}-${'0'.repeat(20)}`;
    const response = await attacker.get(TRACK_API(guess));
    gate.allowRequest(TRACK_API(guess));
    attempts += 1;
    if (response.status() === 429) {
      sawRateLimit = true;
      expect(
        response.headers()['retry-after'],
        'a 429 should tell the caller when to come back',
      ).toBeTruthy();
      break;
    }
    expect(
      response.status(),
      `a wrong token should be a masked 404 until the budget is spent (got ${response.status()})`,
    ).toBe(404);
  }
  expect(sawRateLimit, `the failed-attempt budget should stop a search (tried ${attempts})`).toBe(
    true,
  );

  // The budget bounds *refusals*, not the endpoint. From the very same exhausted
  // address, the holder of a correct token still reads their status: the address
  // is shared (this harness has exactly one, and so does any school computer room
  // or NAT), and answering a correct 100-bit token tells the guesser nothing.
  for (let index = 0; index < 3; index += 1) {
    const allowed = await attacker.get(TRACK_API(link.code));
    expect(
      allowed.status(),
      `a correct token must still resolve from an exhausted address (got ${allowed.status()})`,
    ).toBe(200);
  }

  // …while every further *wrong* token from that address stays 429.
  const stillBlocked = await attacker.get(TRACK_API(IMPOSSIBLE_TOKEN));
  gate.allowRequest(TRACK_API(IMPOSSIBLE_TOKEN));
  expect(stillBlocked.status()).toBe(429);

  // And the budget's identity is not caller-controlled: a forwarded header does
  // not mint a fresh budget, or the whole control would be one header deep.
  const spoofed = await attacker.get(TRACK_API(IMPOSSIBLE_TOKEN), {
    headers: { 'x-forwarded-for': '198.51.100.23' },
  });
  gate.allowRequest(TRACK_API(IMPOSSIBLE_TOKEN));
  expect(
    spoofed.status(),
    `a spoofed X-Forwarded-For must not reset the budget (got ${spoofed.status()})`,
  ).toBe(429);
  await attacker.dispose();

  // A fresh Playwright context is *not* a fresh client here — same address — so
  // the only honest way to observe an unspent budget is to clear it, and then a
  // valid read is 200 as it was throughout.
  await clearPublicTrackingFailureBudget();
  const holder = await freshContext();
  for (let index = 0; index < 3; index += 1) {
    const response = await holder.get(TRACK_API(link.code));
    expect(
      response.status(),
      `a valid holder should never spend the failure budget (got ${response.status()})`,
    ).toBe(200);
  }
  await holder.dispose();
});

// ---------------------------------------------------------------------------
// 5. Contract — the page renders what the server sent, and nothing else
// ---------------------------------------------------------------------------

test('the tracker renders the published contract and publishes no applicant data', async ({
  page,
}) => {
  const world = await seedWorld();
  const { applicant } = world;
  const link = await issueLink(applicant);

  // What the server actually publishes.
  const response = await page.request.get(TRACK_API(link.code));
  expect(response.status()).toBe(200);
  const data = unwrap(await response.json());
  expect(Object.keys(data).sort()).toEqual(
    [
      'application_number',
      'institution',
      'intake_name',
      'program_name',
      'status',
      'submitted_at',
      'updated_at',
    ].sort(),
  );

  await openTracker(page, link.code);
  await expect(page.getByText(`#${applicant.applicationNumber}`).first()).toBeVisible({
    timeout: 30_000,
  });

  // The fields the client reads are the fields the server sends — pre-10.5
  // `program_name` / `intake_name` were absent and `updated_at` rendered
  // "Not available" forever.
  await expect(page.getByText(String(data.program_name)).first()).toBeVisible();
  await expect(page.getByText(String(data.intake_name)).first()).toBeVisible();
  await expect(page.getByText(/^Updated /).first()).toBeVisible();
  await expect(page.getByText(/Updated Not available/i)).toHaveCount(0);

  // No applicant data, and no reviewer notes panel.
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const secret of [applicant.fullName, applicant.email]) {
    expect(body).not.toContain(secret.toLowerCase());
  }
  await expect(page.getByText(/Message from Admissions/i)).toHaveCount(0);
});
